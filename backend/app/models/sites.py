import uuid
from app.core.odm import Column, String, Date, Numeric, Integer, Boolean, Text, ForeignKey, JSON
from app.core.odm import relationship
from app.core.database import Base
from app.models.base import TimestampMixin, GUID

class Site(Base, TimestampMixin):
    __tablename__ = "sites"

    id = Column(String(20), primary_key=True)  # e.g., 'CS-PUN-01', 'CS-MUM-02', 'CS-NAS-03', 'CS-REM-04', 'CS-NAG-05'
    name = Column(String(150), nullable=False)
    location = Column(String(100), nullable=False)
    status = Column(String(30), default="ACTIVE", nullable=False)  # ACTIVE, MOBILIZING, HANDOVER, ARCHIVED
    project_type = Column(String(80), nullable=False)  # Commercial, Residential, Industrial, Infrastructure, Mixed-Use
    start_date = Column(Date, nullable=False)
    target_completion_date = Column(Date, nullable=False)

    metadata_rel = relationship("SiteMetadata", back_populates="site", uselist=False, cascade="all, delete-orphan")
    context_assessments = relationship("SiteContextAssessment", back_populates="site", cascade="all, delete-orphan")
    baselines = relationship("ProjectBaseline", back_populates="site", cascade="all, delete-orphan")
    assignments = relationship("SiteAssignment", back_populates="site", cascade="all, delete-orphan")

class SiteMetadata(Base, TimestampMixin):
    __tablename__ = "site_metadata"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    site_id = Column(String(20), ForeignKey("sites.id", ondelete="CASCADE"), unique=True, nullable=False)
    client_name = Column(String(150), nullable=False)
    contract_value = Column(Numeric(15, 2), nullable=False)
    budgeted_cost = Column(Numeric(15, 2), nullable=False)
    currency = Column(String(3), default="INR", nullable=False)

    site = relationship("Site", back_populates="metadata_rel")

class SiteContextAssessment(Base, TimestampMixin):
    __tablename__ = "site_context_assessments"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    site_id = Column(String(20), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False)
    terrain_difficulty = Column(String(20), default="MEDIUM", nullable=False)  # LOW, MEDIUM, HIGH
    logistics_complexity = Column(String(20), default="MEDIUM", nullable=False)  # LOW, MEDIUM, HIGH
    regulatory_hurdles = Column(String(20), default="MEDIUM", nullable=False)  # LOW, MEDIUM, HIGH
    assessed_by = Column(GUID(), ForeignKey("users.id"), nullable=True)
    assessment_date = Column(Date, nullable=False)
    notes = Column(Text, nullable=True)

    site = relationship("Site", back_populates="context_assessments")

class ProjectBaseline(Base, TimestampMixin):
    __tablename__ = "project_baselines"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    site_id = Column(String(20), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False)
    version_number = Column(Integer, default=1, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    approved_by = Column(GUID(), ForeignKey("users.id"), nullable=True)
    approved_at = Column(Date, nullable=True)
    total_budget = Column(Numeric(15, 2), nullable=False)
    planned_duration_days = Column(Integer, nullable=False)
    s_curve_points = Column(JSON, nullable=True)

    site = relationship("Site", back_populates="baselines")
    milestones = relationship("ProjectMilestone", back_populates="baseline", cascade="all, delete-orphan")

class ProjectMilestone(Base, TimestampMixin):
    __tablename__ = "project_milestones"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    baseline_id = Column(GUID(), ForeignKey("project_baselines.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(150), nullable=False)
    sequence_order = Column(Integer, nullable=False)
    target_date = Column(Date, nullable=False)
    actual_date = Column(Date, nullable=True)
    weightage_pct = Column(Numeric(5, 2), nullable=False)
    status = Column(String(30), default="PENDING", nullable=False)  # PENDING, COMPLETED, DELAYED

    baseline = relationship("ProjectBaseline", back_populates="milestones")
