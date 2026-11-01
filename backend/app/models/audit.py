import uuid
from sqlalchemy import Column, String, Text, ForeignKey, JSON, DateTime
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import GUID, get_utc_now

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    event_type = Column(String(60), nullable=False, index=True)
    actor_id = Column(GUID(), ForeignKey("users.id"), nullable=True, index=True)
    site_id = Column(String(20), ForeignKey("sites.id", ondelete="SET NULL"), nullable=True, index=True)
    resource_type = Column(String(50), nullable=False, index=True)
    resource_id = Column(String(100), nullable=True)
    details_json = Column(JSON, nullable=True)
    timestamp = Column(DateTime(timezone=True), default=get_utc_now, nullable=False, index=True)

    actor = relationship("User")
    site = relationship("Site")
