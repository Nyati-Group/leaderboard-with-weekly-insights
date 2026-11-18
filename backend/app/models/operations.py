import uuid
from app.core.odm import (
    Column, String, Date, Numeric, Integer, Boolean, Text, ForeignKey, JSON, DateTime, UniqueConstraint
)
from app.core.odm import relationship
from app.core.database import Base
from app.models.base import TimestampMixin, GUID, get_utc_now

class DailyReport(Base, TimestampMixin):
    __tablename__ = "daily_reports"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    site_id = Column(String(20), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True)
    reporting_date = Column(Date, nullable=False, index=True)
    status = Column(String(30), default="DRAFT", nullable=False)  # DRAFT, SUBMITTED, UNDER_REVIEW, FLAGGED, RESUBMITTED, VALIDATED, APPROVED
    current_version = Column(Integer, default=1, nullable=False)
    
    submitted_by = Column(GUID(), ForeignKey("users.id"), nullable=True)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    
    validated_by = Column(GUID(), ForeignKey("users.id"), nullable=True)
    validated_at = Column(DateTime(timezone=True), nullable=True)
    
    flagged_reason = Column(Text, nullable=True)
    site_manager_remarks = Column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint("site_id", "reporting_date", name="uq_site_reporting_date"),
    )

    # Relationships
    site = relationship("Site")
    submitter = relationship("User", foreign_keys=[submitted_by])
    validator = relationship("User", foreign_keys=[validated_by])
    
    versions = relationship("DailyReportVersion", back_populates="daily_report", cascade="all, delete-orphan", order_by="DailyReportVersion.version_number")
    progress_records = relationship("ProgressRecord", back_populates="daily_report", cascade="all, delete-orphan")
    manpower_records = relationship("ManpowerRecord", back_populates="daily_report", cascade="all, delete-orphan")
    expenditure_records = relationship("ExpenditureRecord", back_populates="daily_report", cascade="all, delete-orphan")
    activity_records = relationship("ActivityRecord", back_populates="daily_report", cascade="all, delete-orphan")

class DailyReportVersion(Base):
    __tablename__ = "daily_report_versions"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    daily_report_id = Column(GUID(), ForeignKey("daily_reports.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)
    snapshot_data = Column(JSON, nullable=False)
    change_summary = Column(Text, nullable=True)
    submitted_by = Column(GUID(), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now, nullable=False)

    daily_report = relationship("DailyReport", back_populates="versions")
    submitter = relationship("User")

class ProgressRecord(Base, TimestampMixin):
    __tablename__ = "progress_records"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    daily_report_id = Column(GUID(), ForeignKey("daily_reports.id", ondelete="CASCADE"), nullable=False, index=True)
    site_id = Column(String(20), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True)
    work_package = Column(String(100), nullable=False)  # e.g., Substructure, Superstructure, MEP, Finishing
    activity_name = Column(String(200), nullable=False)
    unit_of_measure = Column(String(30), nullable=False)  # e.g., cum, sqft, MT, nos
    planned_quantity = Column(Numeric(12, 2), default=0.0, nullable=False)
    actual_quantity = Column(Numeric(12, 2), default=0.0, nullable=False)
    cumulative_quantity = Column(Numeric(12, 2), default=0.0, nullable=False)
    notes = Column(Text, nullable=True)

    daily_report = relationship("DailyReport", back_populates="progress_records")

class ManpowerRecord(Base, TimestampMixin):
    __tablename__ = "manpower_records"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    daily_report_id = Column(GUID(), ForeignKey("daily_reports.id", ondelete="CASCADE"), nullable=False, index=True)
    site_id = Column(String(20), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True)
    trade_category = Column(String(80), nullable=False)  # Masons, Carpenters, Steel Fixers, Electricians, Plumbers, Helpers
    contractor_name = Column(String(120), nullable=False)
    planned_count = Column(Integer, default=0, nullable=False)
    actual_count = Column(Integer, default=0, nullable=False)
    overtime_hours = Column(Numeric(6, 2), default=0.0, nullable=False)

    daily_report = relationship("DailyReport", back_populates="manpower_records")

class ExpenditureRecord(Base, TimestampMixin):
    __tablename__ = "expenditure_records"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    daily_report_id = Column(GUID(), ForeignKey("daily_reports.id", ondelete="CASCADE"), nullable=False, index=True)
    site_id = Column(String(20), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True)
    cost_code = Column(String(50), nullable=False)  # e.g., MAT-CONC-01, LAB-CIVIL-02
    category = Column(String(80), nullable=False)   # Materials, Labor, Plant & Machinery, Subcontract, Overheads
    planned_amount = Column(Numeric(14, 2), default=0.0, nullable=False)
    actual_amount = Column(Numeric(14, 2), default=0.0, nullable=False)
    vendor_name = Column(String(150), nullable=True)
    invoice_ref = Column(String(100), nullable=True)

    daily_report = relationship("DailyReport", back_populates="expenditure_records")

class ActivityRecord(Base, TimestampMixin):
    __tablename__ = "activity_records"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    daily_report_id = Column(GUID(), ForeignKey("daily_reports.id", ondelete="CASCADE"), nullable=False, index=True)
    site_id = Column(String(20), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    status = Column(String(30), default="IN_PROGRESS", nullable=False)  # IN_PROGRESS, COMPLETED, DELAYED, BLOCKED
    blockers = Column(Text, nullable=True)
    mitigation_steps = Column(Text, nullable=True)

    daily_report = relationship("DailyReport", back_populates="activity_records")
