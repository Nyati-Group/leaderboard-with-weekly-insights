import uuid
from app.core.odm import (
    Column, String, Date, Numeric, Integer, Boolean, Text, ForeignKey, JSON, DateTime, UniqueConstraint
)
from app.core.odm import relationship
from app.core.database import Base
from app.models.base import TimestampMixin, GUID, get_utc_now

class WeeklyReport(Base, TimestampMixin):
    __tablename__ = "weekly_reports"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    site_id = Column(String(20), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True)
    week_code = Column(String(20), nullable=False, index=True)  # e.g., '2026-W44'
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    
    # Workflow State: DRAFT -> SUBMITTED -> FLAGGED -> RESUBMITTED -> VALIDATED -> PUBLISHED
    status = Column(String(30), default="DRAFT", nullable=False)
    current_version = Column(Integer, default=1, nullable=False)
    
    site_manager_id = Column(GUID(), ForeignKey("users.id"), nullable=False)
    executive_summary = Column(Text, nullable=True)
    top_achievements = Column(Text, nullable=True)
    critical_concerns = Column(Text, nullable=True)
    corporate_assistance_needed = Column(Text, nullable=True)
    
    published_at = Column(DateTime(timezone=True), nullable=True)
    published_by = Column(GUID(), ForeignKey("users.id"), nullable=True)

    __table_args__ = (
        UniqueConstraint("site_id", "week_code", name="uq_site_weekly_report"),
    )

    # Relationships
    site = relationship("Site")
    site_manager = relationship("User", foreign_keys=[site_manager_id])
    publisher = relationship("User", foreign_keys=[published_by])
    departmental_inputs = relationship("WeeklyDepartmentalInput", back_populates="weekly_report", cascade="all, delete-orphan")
    versions = relationship("WeeklyReportVersion", back_populates="weekly_report", cascade="all, delete-orphan", order_by="desc(WeeklyReportVersion.version_number)")
    reviews = relationship("WeeklyReportReview", back_populates="weekly_report", cascade="all, delete-orphan", order_by="desc(WeeklyReportReview.created_at)")
    insight_items = relationship("WeeklyInsightItem", back_populates="weekly_report", cascade="all, delete-orphan")

class WeeklyDepartmentalInput(Base, TimestampMixin):
    __tablename__ = "weekly_departmental_inputs"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    weekly_report_id = Column(GUID(), ForeignKey("weekly_reports.id", ondelete="CASCADE"), nullable=False, index=True)
    department = Column(String(40), nullable=False)  # SAFETY, QUALITY, PLANNING, COMMERCIAL
    author_id = Column(GUID(), ForeignKey("users.id"), nullable=False)
    status = Column(String(30), default="SUBMITTED", nullable=False)  # DRAFT, SUBMITTED
    metrics_json = Column(JSON, nullable=True)
    narrative = Column(Text, nullable=False)
    submitted_at = Column(DateTime(timezone=True), default=get_utc_now, nullable=False)

    __table_args__ = (
        UniqueConstraint("weekly_report_id", "department", name="uq_report_department_input"),
    )

    weekly_report = relationship("WeeklyReport", back_populates="departmental_inputs")
    author = relationship("User")

class WeeklyReportVersion(Base):
    __tablename__ = "weekly_report_versions"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    weekly_report_id = Column(GUID(), ForeignKey("weekly_reports.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)
    snapshot_json = Column(JSON, nullable=False)
    created_by = Column(GUID(), ForeignKey("users.id"), nullable=False)
    change_summary = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now, nullable=False)

    weekly_report = relationship("WeeklyReport", back_populates="versions")
    creator = relationship("User")

class WeeklyReportReview(Base, TimestampMixin):
    __tablename__ = "weekly_report_reviews"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    weekly_report_id = Column(GUID(), ForeignKey("weekly_reports.id", ondelete="CASCADE"), nullable=False, index=True)
    reviewer_id = Column(GUID(), ForeignKey("users.id"), nullable=False)
    decision = Column(String(30), nullable=False)  # FLAGGED, VALIDATED, PUBLISHED
    discrepancies_found = Column(Text, nullable=True)
    action_items = Column(Text, nullable=True)

    weekly_report = relationship("WeeklyReport", back_populates="reviews")
    reviewer = relationship("User")

class WeeklyInsightItem(Base, TimestampMixin):
    __tablename__ = "weekly_insight_items"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    weekly_report_id = Column(GUID(), ForeignKey("weekly_reports.id", ondelete="CASCADE"), nullable=False, index=True)
    category = Column(String(50), nullable=False)  # CRITICAL_RISK, MANAGEMENT_PRIORITY, SCHEDULE_SLIPPAGE, MATERIAL_BOTTLENECK, REGULATORY_HOLD
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    severity = Column(String(20), default="MEDIUM", nullable=False)  # LOW, MEDIUM, HIGH, CRITICAL
    owner_name = Column(String(100), nullable=True)
    target_date = Column(Date, nullable=True)
    status = Column(String(30), default="OPEN", nullable=False)  # OPEN, MITIGATING, RESOLVED

    weekly_report = relationship("WeeklyReport", back_populates="insight_items")
