import uuid
from app.core.odm import Column, String, Boolean, ForeignKey, DateTime, Text, Table
from app.core.odm import relationship
from app.core.database import Base
from app.models.base import TimestampMixin, GUID, get_utc_now

# Association Table: role_permissions
role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", String(50), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("permission_id", String(80), ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True)
)

# Association Table: user_roles
user_roles = Table(
    "user_roles",
    Base.metadata,
    Column("user_id", GUID(), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", String(50), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
)

class Role(Base):
    __tablename__ = "roles"

    id = Column(String(50), primary_key=True)  # e.g., 'ORG_ADMIN', 'EXEC_LEADERSHIP', 'PROJECT_CONTROLLER', 'SITE_MANAGER', 'SAFETY_OFFICER', 'QUALITY_OFFICER'
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)

    permissions = relationship("Permission", secondary=role_permissions, back_populates="roles")
    users = relationship("User", secondary=user_roles, back_populates="roles")

class Permission(Base):
    __tablename__ = "permissions"

    id = Column(String(80), primary_key=True)  # e.g., 'reports:view_all', 'actions:verify', 'weekly:publish'
    module = Column(String(50), nullable=False)
    description = Column(Text, nullable=True)

    roles = relationship("Role", secondary=role_permissions, back_populates="permissions")

class User(Base, TimestampMixin):
    __tablename__ = "users"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(100), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    roles = relationship("Role", secondary=user_roles, back_populates="users")
    site_assignments = relationship("SiteAssignment", back_populates="user", cascade="all, delete-orphan")
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")

class SiteAssignment(Base):
    __tablename__ = "site_assignments"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    site_id = Column(String(20), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False)
    assigned_role = Column(String(50), nullable=False)
    assigned_at = Column(DateTime(timezone=True), default=get_utc_now, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    user = relationship("User", back_populates="site_assignments")
    site = relationship("Site", back_populates="assignments")

class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash = Column(String(255), nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=get_utc_now, nullable=False)

    user = relationship("User", back_populates="refresh_tokens")
