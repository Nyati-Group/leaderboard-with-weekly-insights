import uuid
from app.core.odm import (
    Column, String, Date, Numeric, Integer, Boolean, Text, ForeignKey, DateTime
)
from app.core.odm import relationship
from app.core.database import Base
from app.models.base import TimestampMixin, GUID, get_utc_now

# ==========================================
# 1. QUALITY MANAGEMENT DOMAIN
# ==========================================

class QualityInspection(Base, TimestampMixin):
    __tablename__ = "quality_inspections"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    site_id = Column(String(20), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True)
    inspection_date = Column(Date, nullable=False, index=True)
    inspector_id = Column(GUID(), ForeignKey("users.id"), nullable=False)
    inspection_type = Column(String(80), nullable=False)  # e.g., Pre-pour Concrete, Rebar Placement, Waterproofing, MEP Conduit
    wbs_location = Column(String(150), nullable=False)    # e.g., Tower A - 4th Floor - Zone B
    outcome = Column(String(30), default="PASS", nullable=False)  # PASS, CONDITIONAL_PASS, FAIL
    remarks = Column(Text, nullable=True)

    # Relationships
    site = relationship("Site")
    inspector = relationship("User")
    checklist_items = relationship("QualityChecklistItem", back_populates="inspection", cascade="all, delete-orphan")
    defects = relationship("QualityDefect", back_populates="inspection", cascade="all, delete-orphan")

class QualityChecklistItem(Base):
    __tablename__ = "quality_checklist_items"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    inspection_id = Column(GUID(), ForeignKey("quality_inspections.id", ondelete="CASCADE"), nullable=False, index=True)
    parameter = Column(String(255), nullable=False)
    is_compliant = Column(Boolean, default=True, nullable=False)
    comments = Column(Text, nullable=True)
    evidence_url = Column(String(500), nullable=True)

    inspection = relationship("QualityInspection", back_populates="checklist_items")

class QualityDefect(Base, TimestampMixin):
    __tablename__ = "quality_defects"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    inspection_id = Column(GUID(), ForeignKey("quality_inspections.id", ondelete="CASCADE"), nullable=True, index=True)
    site_id = Column(String(20), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True)
    severity = Column(String(20), default="MINOR", nullable=False)  # MINOR, MAJOR, CRITICAL
    description = Column(Text, nullable=False)
    component = Column(String(100), nullable=True)
    detected_date = Column(Date, nullable=False)
    resolved_date = Column(Date, nullable=True)
    status = Column(String(30), default="OPEN", nullable=False)  # OPEN, RECTIFIED, VERIFIED_CLOSED

    inspection = relationship("QualityInspection", back_populates="defects")
    ncr = relationship("NCRRecord", back_populates="defect", uselist=False)

class NCRRecord(Base, TimestampMixin):
    __tablename__ = "ncr_records"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    site_id = Column(String(20), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True)
    defect_id = Column(GUID(), ForeignKey("quality_defects.id", ondelete="SET NULL"), nullable=True, unique=True)
    ncr_number = Column(String(50), unique=True, nullable=False, index=True)  # e.g., NCR-PUN-2026-001
    issued_to = Column(String(150), nullable=False)  # Subcontractor / Agency Name
    root_cause = Column(Text, nullable=True)
    corrective_action_required = Column(Text, nullable=True)
    status = Column(String(30), default="ISSUED", nullable=False)  # ISSUED, ACTION_PROPOSED, UNDER_REVIEW, CLOSED
    closure_date = Column(Date, nullable=True)

    site = relationship("Site")
    defect = relationship("QualityDefect", back_populates="ncr")
    rework = relationship("ReworkRecord", back_populates="ncr", uselist=False, cascade="all, delete-orphan")

class ReworkRecord(Base, TimestampMixin):
    __tablename__ = "rework_records"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    ncr_id = Column(GUID(), ForeignKey("ncr_records.id", ondelete="CASCADE"), nullable=False, unique=True)
    site_id = Column(String(20), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True)
    cost_impact = Column(Numeric(12, 2), default=0.0, nullable=False)
    schedule_impact_days = Column(Integer, default=0, nullable=False)
    description = Column(Text, nullable=False)
    completed_at = Column(Date, nullable=True)

    ncr = relationship("NCRRecord", back_populates="rework")

# ==========================================
# 2. MANUAL SAFETY MANAGEMENT DOMAIN (NO CCTV)
# ==========================================

class SafetyInspection(Base, TimestampMixin):
    __tablename__ = "safety_inspections"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    site_id = Column(String(20), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True)
    inspection_date = Column(Date, nullable=False, index=True)
    inspector_id = Column(GUID(), ForeignKey("users.id"), nullable=False)
    inspection_type = Column(String(80), nullable=False)  # WEEKLY_AUDIT, ROUTINE_WALKTHROUGH, SCAFFOLD_INSPECTION, ELECTRICAL_CHECK
    compliance_score_pct = Column(Numeric(5, 2), default=100.0, nullable=False)
    remarks = Column(Text, nullable=True)

    site = relationship("Site")
    inspector = relationship("User")
    checklist_items = relationship("SafetyChecklistItem", back_populates="safety_inspection", cascade="all, delete-orphan")

class SafetyChecklistItem(Base):
    __tablename__ = "safety_checklist_items"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    safety_inspection_id = Column(GUID(), ForeignKey("safety_inspections.id", ondelete="CASCADE"), nullable=False, index=True)
    category = Column(String(80), nullable=False)  # PPE_COMPLIANCE, SCAFFOLDING, ELECTRICAL, HOUSEKEEPING, FIRE_SAFETY, EXCAVATION
    item_description = Column(String(255), nullable=False)
    is_compliant = Column(Boolean, default=True, nullable=False)
    severity = Column(String(20), default="LOW", nullable=False)  # LOW, MEDIUM, HIGH, CRITICAL
    corrective_action_required = Column(Boolean, default=False, nullable=False)
    comments = Column(Text, nullable=True)

    safety_inspection = relationship("SafetyInspection", back_populates="checklist_items")

class SafetyObservation(Base, TimestampMixin):
    __tablename__ = "safety_observations"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    site_id = Column(String(20), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True)
    observer_id = Column(GUID(), ForeignKey("users.id"), nullable=False)
    observation_date = Column(Date, nullable=False, index=True)
    category = Column(String(80), nullable=False)  # PPE, Working at Height, Housekeeping, Electrical, Excavation
    severity = Column(String(20), default="LOW", nullable=False)  # LOW, MEDIUM, HIGH, STOP_WORK
    description = Column(Text, nullable=False)
    status = Column(String(30), default="REPORTED", nullable=False)  # REPORTED, UNDER_RECTIFICATION, RESOLVED

    site = relationship("Site")
    observer = relationship("User")

class SafetyIncident(Base, TimestampMixin):
    __tablename__ = "safety_incidents"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    site_id = Column(String(20), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True)
    incident_date = Column(Date, nullable=False, index=True)
    severity = Column(String(30), nullable=False)  # NEAR_MISS, FIRST_AID, MEDICAL_TREATMENT, LOST_TIME, FATALITY
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    injured_count = Column(Integer, default=0, nullable=False)
    lost_time_hours = Column(Numeric(8, 2), default=0.0, nullable=False)
    root_cause = Column(Text, nullable=True)
    status = Column(String(30), default="OPEN", nullable=False)  # OPEN, INVESTIGATING, CLOSED

    site = relationship("Site")
    evidence = relationship("SafetyEvidence", back_populates="incident", cascade="all, delete-orphan")

class SafetyEvidence(Base):
    __tablename__ = "safety_evidence"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    incident_id = Column(GUID(), ForeignKey("safety_incidents.id", ondelete="CASCADE"), nullable=True, index=True)
    file_path = Column(String(500), nullable=False)
    file_hash_sha256 = Column(String(64), nullable=True)
    uploaded_by = Column(GUID(), ForeignKey("users.id"), nullable=False)
    uploaded_at = Column(DateTime(timezone=True), default=get_utc_now, nullable=False)

    incident = relationship("SafetyIncident", back_populates="evidence")
    uploader = relationship("User")

# ==========================================
# 3. CORRECTIVE ACTIONS CENTER DOMAIN
# ==========================================

class CorrectiveAction(Base, TimestampMixin):
    __tablename__ = "corrective_actions"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    site_id = Column(String(20), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True)
    source_type = Column(String(50), nullable=False)  # QUALITY_NCR, SAFETY_INCIDENT, SAFETY_OBSERVATION, AUDIT_FINDING, MANUAL
    source_id = Column(GUID(), nullable=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    priority = Column(String(20), default="MEDIUM", nullable=False)  # LOW, MEDIUM, HIGH, CRITICAL
    due_date = Column(Date, nullable=False, index=True)
    status = Column(String(30), default="OPEN", nullable=False)  # OPEN, IN_PROGRESS, PENDING_VERIFICATION, CLOSED
    created_by = Column(GUID(), ForeignKey("users.id"), nullable=False)

    site = relationship("Site")
    creator = relationship("User")
    assignments = relationship("ActionAssignment", back_populates="action", cascade="all, delete-orphan")
    comments = relationship("ActionComment", back_populates="action", cascade="all, delete-orphan")
    status_history = relationship("ActionStatusHistory", back_populates="action", cascade="all, delete-orphan")

class ActionAssignment(Base):
    __tablename__ = "action_assignments"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    action_id = Column(GUID(), ForeignKey("corrective_actions.id", ondelete="CASCADE"), nullable=False, index=True)
    assigned_user_id = Column(GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    assigned_at = Column(DateTime(timezone=True), default=get_utc_now, nullable=False)

    action = relationship("CorrectiveAction", back_populates="assignments")
    user = relationship("User")

class ActionComment(Base):
    __tablename__ = "action_comments"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    action_id = Column(GUID(), ForeignKey("corrective_actions.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(GUID(), ForeignKey("users.id"), nullable=False)
    comment_text = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=get_utc_now, nullable=False)

    action = relationship("CorrectiveAction", back_populates="comments")
    author = relationship("User")

class ActionStatusHistory(Base):
    __tablename__ = "action_status_history"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    action_id = Column(GUID(), ForeignKey("corrective_actions.id", ondelete="CASCADE"), nullable=False, index=True)
    old_status = Column(String(30), nullable=False)
    new_status = Column(String(30), nullable=False)
    changed_by = Column(GUID(), ForeignKey("users.id"), nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now, nullable=False)

    action = relationship("CorrectiveAction", back_populates="status_history")
    actor = relationship("User")
