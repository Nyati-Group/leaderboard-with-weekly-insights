import uuid
from sqlalchemy import (
    Column, String, Numeric, Integer, Boolean, Text, ForeignKey, JSON, DateTime, UniqueConstraint
)
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import TimestampMixin, GUID, get_utc_now

class KRADefinition(Base):
    __tablename__ = "kra_definitions"

    id = Column(Integer, primary_key=True)  # 1 to 8
    code = Column(String(30), unique=True, nullable=False)  # PROGRESS, MANPOWER, COST, SCHEDULE, QUALITY, SAFETY, CLOSURE, OVERALL
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=False)
    is_composite = Column(Boolean, default=False, nullable=False)  # True only for KRA 8

    weights = relationship("RankingWeight", back_populates="kra")

class RankingMethodology(Base, TimestampMixin):
    __tablename__ = "ranking_methodologies"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    version_code = Column(String(20), unique=True, nullable=False)  # e.g., 'v1.0'
    name = Column(String(100), nullable=False)
    is_active = Column(Boolean, default=False, nullable=False)
    approved_by = Column(GUID(), ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    rationale = Column(Text, nullable=True)

    approver = relationship("User")
    weights = relationship("RankingWeight", back_populates="methodology", cascade="all, delete-orphan")
    snapshots = relationship("RankingSnapshot", back_populates="methodology")

class RankingWeight(Base):
    __tablename__ = "ranking_weights"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    methodology_id = Column(GUID(), ForeignKey("ranking_methodologies.id", ondelete="CASCADE"), nullable=False, index=True)
    kra_id = Column(Integer, ForeignKey("kra_definitions.id"), nullable=False)
    weight_pct = Column(Numeric(5, 2), nullable=False)  # e.g., 20.00 for 20%

    __table_args__ = (
        UniqueConstraint("methodology_id", "kra_id", name="uq_methodology_kra"),
    )

    methodology = relationship("RankingMethodology", back_populates="weights")
    kra = relationship("KRADefinition", back_populates="weights")

class RankingSnapshot(Base):
    __tablename__ = "ranking_snapshots"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    site_id = Column(String(20), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True)
    period_id = Column(String(20), nullable=False, index=True)  # e.g., '2026-W44'
    methodology_id = Column(GUID(), ForeignKey("ranking_methodologies.id"), nullable=False)
    
    composite_score = Column(Numeric(5, 2), nullable=True)  # Null if INSUFFICIENT_DATA
    data_completeness_pct = Column(Numeric(5, 2), nullable=False)
    is_stale = Column(Boolean, default=False, nullable=False)
    ranking_position = Column(Integer, nullable=True)  # Official rank (1, 2, 3...)
    status = Column(String(30), default="OFFICIAL", nullable=False)  # OFFICIAL, PROVISIONAL, INSUFFICIENT_DATA
    calculated_at = Column(DateTime(timezone=True), default=get_utc_now, nullable=False)

    __table_args__ = (
        UniqueConstraint("site_id", "period_id", "methodology_id", name="uq_site_period_methodology"),
    )

    site = relationship("Site")
    methodology = relationship("RankingMethodology", back_populates="snapshots")
    scores = relationship("RankingScore", back_populates="snapshot", cascade="all, delete-orphan", order_by="RankingScore.kra_id")

class RankingScore(Base):
    __tablename__ = "ranking_scores"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    snapshot_id = Column(GUID(), ForeignKey("ranking_snapshots.id", ondelete="CASCADE"), nullable=False, index=True)
    kra_id = Column(Integer, ForeignKey("kra_definitions.id"), nullable=False)
    raw_score = Column(Numeric(5, 2), nullable=True)  # 0 to 100, or Null if data missing
    weighted_score = Column(Numeric(5, 2), nullable=True)
    is_missing = Column(Boolean, default=False, nullable=False)
    details_json = Column(JSON, nullable=True)  # Transparent metric explanation breakdown

    snapshot = relationship("RankingSnapshot", back_populates="scores")
    kra = relationship("KRADefinition")
