"""
Lightweight MongoDB object-document mapper.

Implements the subset of the SQLAlchemy ORM API that this codebase uses
(declarative models, ``Column``/``relationship``, ``Session.query().filter()...``),
backed by PyMongo. Keeping the familiar API lets the domain models, services
and routers stay unchanged while the persistence layer is MongoDB.

Storage conventions:
  * one collection per model (``__tablename__``); the primary key is stored as ``_id``
  * UUIDs are stored as strings, ``Date`` as midnight-UTC datetimes,
    ``Numeric`` as doubles (read back as ``Decimal``)
  * many-to-many association tables are their own collections
"""
from __future__ import annotations

import copy
import re
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Dict, Iterable, List, Optional, Tuple

from pymongo import ASCENDING, DESCENDING, InsertOne, UpdateOne, DeleteMany
from pymongo.database import Database


# ---------------------------------------------------------------------------
# Value conversion helpers
# ---------------------------------------------------------------------------

def _sanitize(value: Any) -> Any:
    """Convert Python values into BSON-safe values (recursively)."""
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day, tzinfo=timezone.utc)
    if isinstance(value, dict):
        return {str(k): _sanitize(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_sanitize(v) for v in value]
    if hasattr(value, "value") and not callable(value.value):  # Enum
        return _sanitize(value.value)
    return value


# ---------------------------------------------------------------------------
# Column types
# ---------------------------------------------------------------------------

class TypeEngine:
    def __init__(self, *args, **kwargs):
        pass

    def to_db(self, value):
        return _sanitize(value)

    def from_db(self, value):
        return value


class String(TypeEngine):
    def to_db(self, value):
        if isinstance(value, uuid.UUID):
            return str(value)
        return _sanitize(value)


class Text(String):
    pass


class CHAR(String):
    pass


class Integer(TypeEngine):
    def from_db(self, value):
        if isinstance(value, float) and value.is_integer():
            return int(value)
        return value


class Boolean(TypeEngine):
    pass


class Numeric(TypeEngine):
    def __init__(self, precision=None, scale=None, *args, **kwargs):
        self.scale = scale

    def to_db(self, value):
        if value is None:
            return None
        return float(value)

    def from_db(self, value):
        if value is None:
            return None
        d = Decimal(str(value))
        if self.scale is not None:
            d = d.quantize(Decimal(1).scaleb(-self.scale))
        return d


class Date(TypeEngine):
    def to_db(self, value):
        if value is None:
            return None
        if isinstance(value, datetime):
            value = value.date()
        if isinstance(value, str):
            value = date.fromisoformat(value[:10])
        return datetime(value.year, value.month, value.day, tzinfo=timezone.utc)

    def from_db(self, value):
        if isinstance(value, datetime):
            return value.date()
        return value


class DateTime(TypeEngine):
    def __init__(self, timezone: bool = False, *args, **kwargs):
        pass

    def to_db(self, value):
        if value is None:
            return None
        if isinstance(value, str):
            value = datetime.fromisoformat(value)
        if not isinstance(value, datetime) and isinstance(value, date):
            value = datetime(value.year, value.month, value.day)
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value

    def from_db(self, value):
        if isinstance(value, datetime) and value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value


class JSON(TypeEngine):
    def from_db(self, value):
        return value


class GUID(TypeEngine):
    """UUID stored as its canonical string form."""

    def to_db(self, value):
        if value is None:
            return None
        if isinstance(value, uuid.UUID):
            return str(value)
        try:
            return str(uuid.UUID(str(value)))
        except (ValueError, AttributeError, TypeError):
            return str(value)

    def from_db(self, value):
        if value is None or isinstance(value, uuid.UUID):
            return value
        try:
            return uuid.UUID(str(value))
        except ValueError:
            return value


# ---------------------------------------------------------------------------
# Expressions
# ---------------------------------------------------------------------------

class Expr:
    def models(self) -> set:
        raise NotImplementedError

    def to_mongo(self) -> dict:
        raise NotImplementedError

    def evaluate(self, row: Dict[type, dict]) -> bool:
        raise NotImplementedError

    def __and__(self, other):
        return and_(self, other)

    def __or__(self, other):
        return or_(self, other)

    def __invert__(self):
        return not_(self)


def _like_to_regex(pattern: str) -> str:
    out = []
    for ch in pattern:
        if ch == "%":
            out.append(".*")
        elif ch == "_":
            out.append(".")
        else:
            out.append(re.escape(ch))
    return "^" + "".join(out) + "$"


def _cmp_key(v):
    # Allow comparisons between None and values in python-side evaluation
    return v


class BinaryExpr(Expr):
    def __init__(self, column: "Column", op: str, value: Any):
        self.column = column
        self.op = op
        self.value = value

    def models(self):
        return {self.column.model}

    def _conv(self, v):
        return self.column.type.to_db(v)

    def to_mongo(self):
        key = self.column.key
        op = self.op
        if op == "eq":
            return {key: self._conv(self.value)}
        if op == "ne":
            return {key: {"$ne": self._conv(self.value)}}
        if op in ("lt", "lte", "gt", "gte"):
            return {key: {f"${op}": self._conv(self.value)}}
        if op == "in":
            return {key: {"$in": [self._conv(v) for v in self.value]}}
        if op == "nin":
            return {key: {"$nin": [self._conv(v) for v in self.value]}}
        if op in ("like", "ilike"):
            opts = "i" if op == "ilike" else ""
            return {key: {"$regex": _like_to_regex(str(self.value)), "$options": opts}}
        if op == "between":
            lo, hi = self.value
            return {key: {"$gte": self._conv(lo), "$lte": self._conv(hi)}}
        raise NotImplementedError(op)

    def evaluate(self, row):
        doc = row.get(self.column.model) or {}
        actual = doc.get(self.column.key)
        op = self.op
        if op == "eq":
            return actual == self._conv(self.value)
        if op == "ne":
            return actual != self._conv(self.value)
        if op == "in":
            return actual in [self._conv(v) for v in self.value]
        if op == "nin":
            return actual not in [self._conv(v) for v in self.value]
        if op in ("like", "ilike"):
            flags = re.IGNORECASE if op == "ilike" else 0
            return actual is not None and re.match(_like_to_regex(str(self.value)), str(actual), flags) is not None
        if actual is None:
            return False
        target = self._conv(self.value)
        if op == "lt":
            return actual < target
        if op == "lte":
            return actual <= target
        if op == "gt":
            return actual > target
        if op == "gte":
            return actual >= target
        if op == "between":
            lo, hi = self.value
            return self._conv(lo) <= actual <= self._conv(hi)
        raise NotImplementedError(op)


class BoolExpr(Expr):
    def __init__(self, op: str, items: Iterable[Expr]):
        self.op = op
        self.items = [i for i in items if i is not None]

    def models(self):
        s = set()
        for i in self.items:
            s |= i.models()
        return s

    def to_mongo(self):
        if not self.items:
            return {}
        if len(self.items) == 1:
            return self.items[0].to_mongo()
        return {f"${self.op}": [i.to_mongo() for i in self.items]}

    def evaluate(self, row):
        if self.op == "and":
            return all(i.evaluate(row) for i in self.items)
        return any(i.evaluate(row) for i in self.items)


class NotExpr(Expr):
    def __init__(self, item: Expr):
        self.item = item

    def models(self):
        return self.item.models()

    def to_mongo(self):
        return {"$nor": [self.item.to_mongo()]}

    def evaluate(self, row):
        return not self.item.evaluate(row)


def and_(*items):
    return BoolExpr("and", items)


def or_(*items):
    return BoolExpr("or", items)


def not_(item):
    return NotExpr(item)


class SortExpr:
    def __init__(self, column: "Column", descending: bool, nulls: Optional[str] = None):
        self.column = column
        self.descending = descending
        self.nulls = nulls  # None (database default), "first" or "last"

    def nullslast(self):
        return SortExpr(self.column, self.descending, "last")

    def nullsfirst(self):
        return SortExpr(self.column, self.descending, "first")

    nulls_last = nullslast
    nulls_first = nullsfirst

    def sort_key(self, value):
        """Key for python-side sorting matching SQL NULL ordering."""
        is_null = value is None
        if self.nulls == "last":
            null_rank = 1 if not self.descending else 0
        elif self.nulls == "first":
            null_rank = 0 if not self.descending else 1
        else:  # default: NULLs sort as the smallest value
            null_rank = 0
        return (null_rank if is_null else 1 - null_rank, 0 if is_null else value)


def desc(column):
    return SortExpr(column, True)


def asc(column):
    return SortExpr(column, False)


class FuncExpr:
    def __init__(self, name: str, column: Optional["Column"]):
        self.name = name
        self.column = column


class _Func:
    def __getattr__(self, name):
        def factory(column=None, *args):
            return FuncExpr(name.lower(), column)
        return factory


func = _Func()


class TextClause:
    def __init__(self, text: str):
        self.text = text


def text(sql: str) -> TextClause:
    return TextClause(sql)


# ---------------------------------------------------------------------------
# Schema constructs
# ---------------------------------------------------------------------------

class ForeignKey:
    def __init__(self, target: str, ondelete: Optional[str] = None, **kwargs):
        self.target = target
        self.table, _, self.column_name = target.partition(".")
        self.ondelete = ondelete


class UniqueConstraint:
    def __init__(self, *columns: str, name: Optional[str] = None):
        self.columns = columns
        self.name = name


class Column:
    def __init__(self, *args, primary_key: bool = False, default=None, onupdate=None,
                 nullable: bool = True, unique: bool = False, index: bool = False, **kwargs):
        self.explicit_name: Optional[str] = None
        self.type: TypeEngine = TypeEngine()
        self.foreign_key: Optional[ForeignKey] = None
        for a in args:
            if isinstance(a, str):
                self.explicit_name = a
            elif isinstance(a, ForeignKey):
                self.foreign_key = a
            elif isinstance(a, type) and issubclass(a, TypeEngine):
                self.type = a()
            elif isinstance(a, TypeEngine):
                self.type = a
        self.primary_key = primary_key
        self.default = default
        self.onupdate = onupdate
        self.nullable = nullable
        self.unique = unique
        self.index = index
        self.name: Optional[str] = self.explicit_name
        self.model: Optional[type] = None
        self._args = args
        self._kwargs = dict(primary_key=primary_key, default=default, onupdate=onupdate,
                            nullable=nullable, unique=unique, index=index, **kwargs)

    def copy(self) -> "Column":
        return Column(*self._args, **self._kwargs)

    def __set_name__(self, owner, name):
        self.name = name
        self.model = owner

    @property
    def key(self) -> str:
        return "_id" if self.primary_key and self.model is not None and not getattr(self.model, "_is_table", False) else self.name

    def __get__(self, obj, owner):
        if obj is None:
            return self
        return obj.__dict__.get(self.name)

    def __set__(self, obj, value):
        obj.__dict__[self.name] = value

    def default_value(self):
        if callable(self.default):
            return self.default()
        return copy.deepcopy(self.default)

    # comparison operators -> expressions
    __hash__ = object.__hash__

    def __eq__(self, other):  # type: ignore[override]
        return BinaryExpr(self, "eq", other)

    def __ne__(self, other):  # type: ignore[override]
        return BinaryExpr(self, "ne", other)

    def __lt__(self, other):
        return BinaryExpr(self, "lt", other)

    def __le__(self, other):
        return BinaryExpr(self, "lte", other)

    def __gt__(self, other):
        return BinaryExpr(self, "gt", other)

    def __ge__(self, other):
        return BinaryExpr(self, "gte", other)

    def in_(self, values):
        return BinaryExpr(self, "in", list(values))

    def notin_(self, values):
        return BinaryExpr(self, "nin", list(values))

    not_in = notin_

    def like(self, pattern):
        return BinaryExpr(self, "like", pattern)

    def ilike(self, pattern):
        return BinaryExpr(self, "ilike", pattern)

    def between(self, lo, hi):
        return BinaryExpr(self, "between", (lo, hi))

    def is_(self, value):
        return BinaryExpr(self, "eq", value)

    def isnot(self, value):
        return BinaryExpr(self, "ne", value)

    is_not = isnot

    def desc(self):
        return SortExpr(self, True)

    def asc(self):
        return SortExpr(self, False)

    def __repr__(self):
        owner = self.model.__name__ if self.model else "?"
        return f"<Column {owner}.{self.name}>"


class MetaData:
    def __init__(self):
        self.tables: Dict[str, Any] = {}

    def create_all(self, bind=None, **kwargs):
        from app.core.database import get_database
        ensure_indexes(get_database())


class Table:
    """Association table for many-to-many relationships (its own collection)."""
    _is_table = True

    def __init__(self, name: str, metadata: MetaData, *columns: Column, **kwargs):
        self.__tablename__ = name
        self.name = name
        self.columns: List[Column] = list(columns)
        for c in self.columns:
            c.model = self
        metadata.tables[name] = self
        _ASSOCIATIONS[name] = self

    def column_for_table(self, table_name: str) -> Column:
        for c in self.columns:
            if c.foreign_key and c.foreign_key.table == table_name:
                return c
        raise LookupError(f"Association {self.name} has no FK to {table_name}")


_REGISTRY: Dict[str, type] = {}
_TABLES: Dict[str, type] = {}
_ASSOCIATIONS: Dict[str, Table] = {}


# ---------------------------------------------------------------------------
# Relationships
# ---------------------------------------------------------------------------

class InstrumentedList(list):
    def __init__(self, iterable=(), owner=None, rel: "relationship" = None):
        super().__init__(iterable)
        self._owner = owner
        self._rel = rel

    def _touch(self):
        if self._owner is not None and self._rel is not None:
            self._owner._odm_dirty_rels.add(self._rel.name)

    def _wrap(name):
        def method(self, *args, **kwargs):
            result = getattr(list, name)(self, *args, **kwargs)
            self._touch()
            return result
        method.__name__ = name
        return method

    append = _wrap("append")
    extend = _wrap("extend")
    insert = _wrap("insert")
    remove = _wrap("remove")
    pop = _wrap("pop")
    clear = _wrap("clear")
    __setitem__ = _wrap("__setitem__")
    __delitem__ = _wrap("__delitem__")
    __iadd__ = _wrap("__iadd__")
    del _wrap


class relationship:
    def __init__(self, argument: str, secondary: Optional[Table] = None, back_populates: Optional[str] = None,
                 uselist: Optional[bool] = None, cascade: str = "", order_by: Any = None,
                 foreign_keys: Optional[list] = None, **kwargs):
        self.argument = argument
        self.secondary = secondary
        self.back_populates = back_populates
        self._uselist = uselist
        self.cascade = cascade or ""
        self._order_by = order_by
        self.foreign_keys = foreign_keys
        self.name: Optional[str] = None
        self.model: Optional[type] = None
        self._resolved = False

    def __set_name__(self, owner, name):
        self.name = name
        self.model = owner

    # -- resolution -------------------------------------------------------
    def _resolve(self):
        if self._resolved:
            return
        self.target = _REGISTRY[self.argument]
        model_table = self.model.__tablename__
        target_table = self.target.__tablename__
        if self.secondary is not None:
            self.kind = "m2m"
            self.local_col = self.secondary.column_for_table(model_table)
            self.remote_col = self.secondary.column_for_table(target_table)
        else:
            fk_col = None
            if self.foreign_keys:
                fk_col = self.foreign_keys[0]
                fk_col = getattr(fk_col.model, fk_col.name) if fk_col.model else fk_col
            if fk_col is None:
                for c in self.model._odm_columns.values():
                    if c.foreign_key and c.foreign_key.table == target_table:
                        fk_col = c
                        break
            if fk_col is not None and fk_col.model is self.model:
                self.kind = "m2o"
                self.fk_col = getattr(self.model, fk_col.name)
            else:
                self.kind = "o2m"
                fk_col = None
                for c in self.target._odm_columns.values():
                    if c.foreign_key and c.foreign_key.table == model_table:
                        fk_col = c
                        break
                if fk_col is None:
                    raise LookupError(f"Cannot resolve relationship {self.model.__name__}.{self.name}")
                self.fk_col = fk_col
        if self._uselist is None:
            self.uselist = self.kind != "m2o"
        else:
            self.uselist = self._uselist
        self.order = _parse_order(self._order_by)
        self._resolved = True

    # -- descriptor -------------------------------------------------------
    def __get__(self, obj, owner):
        if obj is None:
            return self
        self._resolve()
        cache = obj._odm_rel_cache
        if self.name in cache:
            return cache[self.name]
        session: Optional[Session] = obj._odm_session
        value: Any
        if self.kind == "m2o":
            fk_val = getattr(obj, self.fk_col.name)
            value = session._get(self.target, fk_val) if (session and fk_val is not None) else None
        elif self.kind == "o2m":
            if session is None or not obj._odm_persisted:
                value = InstrumentedList([], obj, self) if self.uselist else None
            else:
                q = session.query(self.target).filter(self.fk_col == obj._odm_pk())
                if self.order:
                    q = q.order_by(*self.order)
                if self.uselist:
                    value = InstrumentedList(q.all(), obj, self)
                else:
                    value = q.first()
        else:  # m2m
            if session is None or not obj._odm_persisted:
                value = InstrumentedList([], obj, self)
            else:
                assoc = session.db[self.secondary.name]
                local_val = self.local_col.type.to_db(obj._odm_pk())
                ids = [d[self.remote_col.name] for d in assoc.find({self.local_col.name: local_val})]
                value = InstrumentedList(session._get_many(self.target, ids), obj, self)
        cache[self.name] = value
        return value

    def __set__(self, obj, value):
        self._resolve()
        if self.kind == "m2o":
            setattr(obj, self.fk_col.name, value._odm_pk() if value is not None else None)
            obj._odm_rel_cache[self.name] = value
            if value is not None and value._odm_session is not None and obj._odm_session is None:
                value._odm_session.add(obj)
        elif self.uselist:
            obj._odm_rel_cache[self.name] = InstrumentedList(value or [], obj, self)
            obj._odm_dirty_rels.add(self.name)
        else:
            obj._odm_rel_cache[self.name] = value
            obj._odm_dirty_rels.add(self.name)


def _parse_order(order_by) -> list:
    if order_by is None:
        return []
    if isinstance(order_by, (list, tuple)):
        out = []
        for o in order_by:
            out.extend(_parse_order(o))
        return out
    if isinstance(order_by, SortExpr):
        return [order_by]
    if isinstance(order_by, Column):
        return [SortExpr(order_by, False)]
    if isinstance(order_by, str):
        s = order_by.strip()
        descending = False
        m = re.match(r"^(desc|asc)\((.+)\)$", s)
        if m:
            descending = m.group(1) == "desc"
            s = m.group(2)
        model_name, _, col_name = s.partition(".")
        col = getattr(_REGISTRY[model_name], col_name)
        return [SortExpr(col, descending)]
    raise TypeError(f"Unsupported order_by: {order_by!r}")


# ---------------------------------------------------------------------------
# Declarative base
# ---------------------------------------------------------------------------

class _ModelBase:
    metadata = MetaData()
    _odm_columns: Dict[str, Column] = {}
    _odm_relationships: Dict[str, relationship] = {}

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        if "__tablename__" not in cls.__dict__:
            return
        columns: Dict[str, Column] = {}
        rels: Dict[str, relationship] = {}
        for klass in reversed(cls.__mro__):
            for name, attr in list(vars(klass).items()):
                if isinstance(attr, Column):
                    if attr.model is not cls:
                        attr = attr.copy()
                        attr.__set_name__(cls, name)
                        setattr(cls, name, attr)
                    columns[name] = attr
                elif isinstance(attr, relationship):
                    rels[name] = attr
        cls._odm_columns = columns
        cls._odm_relationships = rels
        pks = [c for c in columns.values() if c.primary_key]
        if len(pks) != 1:
            raise TypeError(f"{cls.__name__} must define exactly one primary key column")
        cls._odm_pk_col = pks[0]
        _REGISTRY[cls.__name__] = cls
        _TABLES[cls.__tablename__] = cls

    def __init__(self, **kwargs):
        self._odm_init_state()
        cols = self._odm_columns
        rels = self._odm_relationships
        for key in kwargs:
            if key not in cols and key not in rels:
                raise TypeError(f"{key!r} is an invalid keyword argument for {type(self).__name__}")
        for name, col in cols.items():
            if name in kwargs:
                self.__dict__[name] = kwargs[name]
            elif col.default is not None:
                self.__dict__[name] = col.default_value()
            else:
                self.__dict__[name] = None
        for name in rels:
            if name in kwargs:
                setattr(self, name, kwargs[name])

    def _odm_init_state(self):
        d = self.__dict__
        d["_odm_session"] = None
        d["_odm_persisted"] = False
        d["_odm_snapshot"] = None
        d["_odm_rel_cache"] = {}
        d["_odm_dirty_rels"] = set()

    def _odm_pk(self):
        return getattr(self, type(self)._odm_pk_col.name)

    def _odm_to_doc(self) -> dict:
        return {c.key: c.type.to_db(self.__dict__.get(name)) for name, c in self._odm_columns.items()}

    @classmethod
    def _odm_from_doc(cls, doc: dict):
        obj = cls.__new__(cls)
        obj._odm_init_state()
        obj._odm_load(doc)
        return obj

    def _odm_load(self, doc: dict):
        for name, c in self._odm_columns.items():
            self.__dict__[name] = c.type.from_db(doc.get(c.key))
        self.__dict__["_odm_snapshot"] = copy.deepcopy(self._odm_to_doc())
        self.__dict__["_odm_persisted"] = True

    def __repr__(self):
        return f"<{type(self).__name__} {self._odm_pk()!r}>"


def declarative_base():
    return _ModelBase


Base = _ModelBase


# ---------------------------------------------------------------------------
# Query
# ---------------------------------------------------------------------------

class _Join:
    def __init__(self, target: type, base_col: Column, target_col: Column):
        self.target = target
        self.base_col = base_col      # column on the base model
        self.target_col = target_col  # column on the joined model


class Query:
    def __init__(self, session: "Session", entity):
        self.session = session
        self.func: Optional[FuncExpr] = None
        self.column: Optional[Column] = None
        if isinstance(entity, FuncExpr):
            self.func = entity
            self.model = entity.column.model
        elif isinstance(entity, Column):
            self.column = entity
            self.model = entity.model
        else:
            self.model = entity
        self.criteria: List[Expr] = []
        self.joins: List[_Join] = []
        self.orders: List[SortExpr] = []
        self._limit: Optional[int] = None
        self._offset: Optional[int] = None

    def _clone(self) -> "Query":
        q = copy.copy(self)
        q.criteria = list(self.criteria)
        q.joins = list(self.joins)
        q.orders = list(self.orders)
        return q

    # -- builders ---------------------------------------------------------
    def filter(self, *exprs):
        q = self._clone()
        for e in exprs:
            if isinstance(e, bool):
                if not e:
                    q.criteria.append(BinaryExpr(self.model._odm_pk_col, "in", []))
                continue
            q.criteria.append(e)
        return q

    where = filter

    def filter_by(self, **kwargs):
        return self.filter(*[getattr(self.model, k) == v for k, v in kwargs.items()])

    def join(self, target, onclause=None, *args, **kwargs):
        q = self._clone()
        if isinstance(target, relationship):
            target._resolve()
            target = target.target
        base = self.model
        base_table, target_table = base.__tablename__, target.__tablename__
        join = None
        for c in base._odm_columns.values():
            if c.foreign_key and c.foreign_key.table == target_table:
                join = _Join(target, c, target._odm_pk_col)
                break
        if join is None:
            for c in target._odm_columns.values():
                if c.foreign_key and c.foreign_key.table == base_table:
                    join = _Join(target, base._odm_pk_col, c)
                    break
        if join is None:
            raise LookupError(f"Cannot join {base.__name__} to {target.__name__}")
        q.joins.append(join)
        return q

    outerjoin = join

    def order_by(self, *cols):
        q = self._clone()
        if len(cols) == 1 and cols[0] is None:
            q.orders = []
            return q
        q.orders.extend(_parse_order(list(cols)))
        return q

    def limit(self, n):
        q = self._clone()
        q._limit = n
        return q

    def offset(self, n):
        q = self._clone()
        q._offset = n
        return q

    def options(self, *args):
        return self

    def distinct(self, *args):
        return self

    # -- execution --------------------------------------------------------
    def _split_criteria(self) -> Tuple[dict, Dict[type, list]]:
        base_exprs, joined_exprs = [], {}
        for e in self.criteria:
            models = e.models()
            if models <= {self.model}:
                base_exprs.append(e)
            elif len(models) == 1:
                joined_exprs.setdefault(next(iter(models)), []).append(e)
            else:
                raise NotImplementedError("Filters spanning multiple joined models are not supported")
        return and_(*base_exprs).to_mongo(), joined_exprs

    def _rows(self) -> List[dict]:
        """Return raw base documents honoring joins, ordering and pagination."""
        coll = self.session.db[self.model.__tablename__]
        base_filter, joined_exprs = self._split_criteria()

        if not self.joins and not any(o.nulls for o in self.orders):
            cursor = coll.find(base_filter)
            if self.orders:
                cursor = cursor.sort([(o.column.key, DESCENDING if o.descending else ASCENDING)
                                      for o in self.orders])
            if self._offset:
                cursor = cursor.skip(int(self._offset))
            if self._limit is not None:
                cursor = cursor.limit(int(self._limit))
            return list(cursor)

        # Joined query (or custom NULL ordering): resolve joins, then filter/sort in python.
        conditions = [base_filter] if base_filter else []
        join_maps: Dict[type, Dict[Any, dict]] = {}
        for j in self.joins:
            jfilter = and_(*joined_exprs.get(j.target, [])).to_mongo()
            jdocs = list(self.session.db[j.target.__tablename__].find(jfilter))
            jmap: Dict[Any, dict] = {}
            for d in jdocs:
                jmap.setdefault(d.get(j.target_col.key), d)
            join_maps[j.target] = jmap
            conditions.append({j.base_col.key: {"$in": list(jmap.keys())}})
        if not conditions:
            final_filter = {}
        elif len(conditions) == 1:
            final_filter = conditions[0]
        else:
            final_filter = {"$and": conditions}
        docs = list(coll.find(final_filter))

        rows = []
        for d in docs:
            row = {self.model: d}
            for j in self.joins:
                row[j.target] = join_maps[j.target].get(d.get(j.base_col.key))
            rows.append(row)

        for o in reversed(self.orders):
            m, key = o.column.model, o.column.key
            rows.sort(key=lambda r, o=o, m=m, key=key: o.sort_key((r.get(m) or {}).get(key)),
                      reverse=o.descending)

        if self._offset:
            rows = rows[int(self._offset):]
        if self._limit is not None:
            rows = rows[:int(self._limit)]
        return [r[self.model] for r in rows]

    def all(self) -> list:
        if self.column is not None:
            return [(self.column.type.from_db(d.get(self.column.key)),) for d in self._rows()]
        return [self.session._materialize(self.model, d) for d in self._rows()]

    def __iter__(self):
        return iter(self.all())

    def first(self):
        rows = self.limit(1).all()
        return rows[0] if rows else None

    def one_or_none(self):
        rows = self.limit(2).all()
        if len(rows) > 1:
            raise ValueError("Multiple rows were found when one or none was required")
        return rows[0] if rows else None

    def one(self):
        row = self.one_or_none()
        if row is None:
            raise ValueError("No row was found when one was required")
        return row

    def get(self, pk):
        return self.session._get(self.model, pk)

    def count(self) -> int:
        if not self.joins:
            base_filter, _ = self._split_criteria()
            return self.session.db[self.model.__tablename__].count_documents(base_filter)
        return len(self._rows())

    def scalar(self):
        if self.func is None:
            row = self.first()
            if row is None:
                return None
            return row[0] if isinstance(row, tuple) else row
        col = self.func.column
        base_filter, _ = self._split_criteria()
        op = {"sum": "$sum", "max": "$max", "min": "$min", "avg": "$avg", "count": "$sum"}[self.func.name]
        expr = 1 if self.func.name == "count" else f"${col.key}"
        pipeline = [{"$match": base_filter},
                    {"$group": {"_id": None, "v": {op: expr}, "n": {"$sum": 1}}}]
        result = list(self.session.db[self.model.__tablename__].aggregate(pipeline))
        if not result:
            return 0 if self.func.name == "count" else None
        value = result[0]["v"]
        if self.func.name == "count":
            return value
        return col.type.from_db(value)

    def _matching_ids(self) -> list:
        return [d["_id"] for d in self.session.db[self.model.__tablename__].find(
            self._split_criteria()[0], {"_id": 1})]

    def delete(self, synchronize_session=None) -> int:
        if self.joins:
            raise NotImplementedError("delete() with joins is not supported")
        ids = self._matching_ids()
        if not ids:
            return 0
        res = self.session.db[self.model.__tablename__].delete_many({"_id": {"$in": ids}})
        self.session._evict(self.model, ids)
        return res.deleted_count

    def update(self, values: dict, synchronize_session=None) -> int:
        if self.joins:
            raise NotImplementedError("update() with joins is not supported")
        ids = self._matching_ids()
        if not ids:
            return 0
        sets = {}
        for k, v in values.items():
            col = getattr(self.model, k) if isinstance(k, str) else k
            sets[col.key] = col.type.to_db(v)
        res = self.session.db[self.model.__tablename__].update_many({"_id": {"$in": ids}}, {"$set": sets})
        # Keep identity-mapped instances in sync (like synchronize_session='evaluate')
        for pk in ids:
            obj = self.session.identity.get((self.model, pk))
            if obj is not None:
                for k, v in values.items():
                    col = getattr(self.model, k) if isinstance(k, str) else k
                    obj.__dict__[col.name] = col.type.from_db(col.type.to_db(v))
                    obj._odm_snapshot[col.key] = copy.deepcopy(sets[col.key])
        return res.modified_count


# ---------------------------------------------------------------------------
# Session (unit of work + identity map)
# ---------------------------------------------------------------------------

class _ExecResult:
    def scalar(self):
        return 1

    def fetchall(self):
        return [(1,)]


class Session:
    def __init__(self, db: Database):
        self.db = db
        self.identity: Dict[Tuple[type, Any], Any] = {}
        self.new: List[Any] = []
        self.deleted: List[Any] = []

    # -- identity helpers -------------------------------------------------
    @staticmethod
    def _key(obj) -> Tuple[type, Any]:
        cls = type(obj)
        return cls, cls._odm_pk_col.type.to_db(obj._odm_pk())

    def _materialize(self, cls, doc):
        key = (cls, doc["_id"])
        obj = self.identity.get(key)
        if obj is not None:
            return obj
        obj = cls._odm_from_doc(doc)
        obj.__dict__["_odm_session"] = self
        self.identity[key] = obj
        return obj

    def _get(self, cls, pk):
        if pk is None:
            return None
        db_pk = cls._odm_pk_col.type.to_db(pk)
        obj = self.identity.get((cls, db_pk))
        if obj is not None:
            return obj
        doc = self.db[cls.__tablename__].find_one({"_id": db_pk})
        return self._materialize(cls, doc) if doc else None

    def _get_many(self, cls, pks: list) -> list:
        found, missing = {}, []
        for pk in pks:
            obj = self.identity.get((cls, pk))
            if obj is not None:
                found[pk] = obj
            else:
                missing.append(pk)
        if missing:
            for d in self.db[cls.__tablename__].find({"_id": {"$in": missing}}):
                found[d["_id"]] = self._materialize(cls, d)
        return [found[pk] for pk in pks if pk in found]

    def _evict(self, cls, ids):
        for pk in ids:
            obj = self.identity.pop((cls, pk), None)
            if obj is not None:
                obj.__dict__["_odm_persisted"] = False

    # -- public API -------------------------------------------------------
    def query(self, entity, *more) -> Query:
        return Query(self, entity)

    def get(self, cls, pk):
        return self._get(cls, pk)

    def add(self, obj):
        if obj._odm_session is self and (obj in self.new or self.identity.get(self._key(obj)) is obj):
            return
        obj.__dict__["_odm_session"] = self
        if obj._odm_persisted:
            self.identity.setdefault(self._key(obj), obj)
        elif obj not in self.new:
            self.new.append(obj)

    def add_all(self, objs):
        for o in objs:
            self.add(o)

    def delete(self, obj):
        if obj in self.new:
            self.new.remove(obj)
            return
        if obj not in self.deleted:
            self.deleted.append(obj)

    def execute(self, statement, *args, **kwargs):
        self.db.client.admin.command("ping")
        return _ExecResult()

    def _cascade_collect(self, obj, out: list):
        if any(o is obj for o in out):
            return
        out.append(obj)
        for rel in type(obj)._odm_relationships.values():
            rel._resolve()
            if rel.kind == "o2m" and "delete" in rel.cascade:
                children = getattr(obj, rel.name)
                if children is None:
                    continue
                for child in (children if rel.uselist else [children]):
                    self._cascade_collect(child, out)

    def flush(self):
        # 1. Cascade pending one-to-many children / collect new objects
        changed = True
        while changed:
            changed = False
            for obj in list(self.new) + list(self.identity.values()):
                for rel_name in list(obj._odm_dirty_rels):
                    rel = obj._odm_relationships[rel_name]
                    rel._resolve()
                    if rel.kind != "o2m":
                        continue
                    value = obj._odm_rel_cache.get(rel_name)
                    children = value if rel.uselist else ([value] if value is not None else [])
                    for child in children:
                        setattr(child, rel.fk_col.name, obj._odm_pk())
                        if not child._odm_persisted and child not in self.new:
                            self.new.append(child)
                            child.__dict__["_odm_session"] = self
                            changed = True
                    obj._odm_dirty_rels.discard(rel_name)

        ops: Dict[str, list] = {}

        # 2. Deletes (with ORM cascades)
        to_delete: list = []
        for obj in self.deleted:
            self._cascade_collect(obj, to_delete)
        for obj in to_delete:
            cls = type(obj)
            key = self._key(obj)
            ops.setdefault(cls.__tablename__, []).append(DeleteMany({"_id": key[1]}))
            for rel in cls._odm_relationships.values():
                if rel.kind == "m2m":
                    self.db[rel.secondary.name].delete_many({rel.local_col.name: key[1]})
            self.identity.pop(key, None)
            obj.__dict__["_odm_persisted"] = False

        # 3. Inserts
        inserted = []
        for obj in self.new:
            cls = type(obj)
            pk_col = cls._odm_pk_col
            if obj._odm_pk() is None:
                if isinstance(pk_col.type, Integer):
                    last = self.db[cls.__tablename__].find_one(sort=[("_id", DESCENDING)])
                    pending = [o._odm_pk() for o in inserted if type(o) is cls and o._odm_pk() is not None]
                    obj.__dict__[pk_col.name] = max([last["_id"] if last else 0] + pending) + 1
                else:
                    obj.__dict__[pk_col.name] = uuid.uuid4()
            for name, col in cls._odm_columns.items():
                if obj.__dict__.get(name) is None and col.default is not None:
                    obj.__dict__[name] = col.default_value()
            ops.setdefault(cls.__tablename__, []).append(InsertOne(obj._odm_to_doc()))
            inserted.append(obj)

        # 4. Updates for dirty persisted objects
        for obj in list(self.identity.values()):
            if not obj._odm_persisted or obj._odm_snapshot is None:
                continue
            doc = obj._odm_to_doc()
            changes = {k: v for k, v in doc.items() if k != "_id" and obj._odm_snapshot.get(k) != v}
            if not changes:
                continue
            for name, col in obj._odm_columns.items():
                if col.onupdate is not None and col.key not in changes:
                    obj.__dict__[name] = col.onupdate() if callable(col.onupdate) else col.onupdate
                    changes[col.key] = col.type.to_db(obj.__dict__[name])
            ops.setdefault(type(obj).__tablename__, []).append(
                UpdateOne({"_id": doc["_id"]}, {"$set": changes}))

        for coll_name, coll_ops in ops.items():
            self.db[coll_name].bulk_write(coll_ops, ordered=True)

        for obj in inserted:
            obj.__dict__["_odm_snapshot"] = copy.deepcopy(obj._odm_to_doc())
            obj.__dict__["_odm_persisted"] = True
            self.identity[self._key(obj)] = obj
        for obj in self.identity.values():
            if obj._odm_persisted:
                obj.__dict__["_odm_snapshot"] = copy.deepcopy(obj._odm_to_doc())

        # 5. Many-to-many association sync
        for obj in list(self.identity.values()):
            for rel_name in list(obj._odm_dirty_rels):
                rel = obj._odm_relationships[rel_name]
                rel._resolve()
                if rel.kind != "m2m":
                    continue
                assoc = self.db[rel.secondary.name]
                local_val = rel.local_col.type.to_db(obj._odm_pk())
                assoc.delete_many({rel.local_col.name: local_val})
                members = obj._odm_rel_cache.get(rel_name) or []
                docs, seen = [], set()
                for m in members:
                    rv = rel.remote_col.type.to_db(m._odm_pk())
                    if rv not in seen:
                        seen.add(rv)
                        docs.append({rel.local_col.name: local_val, rel.remote_col.name: rv})
                if docs:
                    assoc.insert_many(docs)
                obj._odm_dirty_rels.discard(rel_name)

        self.new = []
        self.deleted = []
        self._expire_relationships()

    def _expire_relationships(self):
        for obj in self.identity.values():
            obj._odm_rel_cache.clear()

    def commit(self):
        self.flush()

    def rollback(self):
        for obj in self.new:
            obj.__dict__["_odm_session"] = None
        self.new = []
        self.deleted = []
        self.identity = {}

    def refresh(self, obj):
        cls = type(obj)
        doc = self.db[cls.__tablename__].find_one({"_id": self._key(obj)[1]})
        if doc is None:
            raise LookupError(f"Could not refresh instance {obj!r}")
        obj._odm_load(doc)
        obj._odm_rel_cache.clear()
        obj.__dict__["_odm_session"] = self
        self.identity[self._key(obj)] = obj

    def expire_all(self):
        self._expire_relationships()

    def expunge_all(self):
        self.identity = {}

    def close(self):
        self.new = []
        self.deleted = []
        self.identity = {}


# ---------------------------------------------------------------------------
# Indexes
# ---------------------------------------------------------------------------

_PARTIAL_TYPES = {String: "string", Text: "string", CHAR: "string", GUID: "string",
                  Integer: "number", Numeric: "number", Date: "date", DateTime: "date"}


def ensure_indexes(db: Database):
    """Create unique and lookup indexes mirroring the relational constraints."""
    import app.models  # noqa: F401  (register all models)
    for table, cls in _TABLES.items():
        coll = db[table]
        for name, col in cls._odm_columns.items():
            if col.primary_key:
                continue
            if col.unique:
                kwargs = {"unique": True, "name": f"uq_{name}"}
                if col.nullable:
                    t = _PARTIAL_TYPES.get(type(col.type), "string")
                    kwargs["partialFilterExpression"] = {col.key: {"$type": t}}
                coll.create_index([(col.key, ASCENDING)], **kwargs)
            elif col.index or col.foreign_key is not None:
                coll.create_index([(col.key, ASCENDING)], name=f"ix_{name}")
        for arg in cls.__dict__.get("__table_args__", ()) or ():
            if isinstance(arg, UniqueConstraint):
                keys = [(getattr(cls, c).key, ASCENDING) for c in arg.columns]
                coll.create_index(keys, unique=True, name=arg.name or "uq_" + "_".join(arg.columns))
    for name, table in _ASSOCIATIONS.items():
        keys = [(c.name, ASCENDING) for c in table.columns]
        db[name].create_index(keys, unique=True, name=f"uq_{name}")
        for c in table.columns:
            db[name].create_index([(c.name, ASCENDING)], name=f"ix_{c.name}")
