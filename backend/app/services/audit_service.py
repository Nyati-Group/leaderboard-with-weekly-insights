import uuid
from typing import Optional, Dict, Any, List
from app.core.database import Session
from app.models.audit import AuditLog

class AuditService:
    @staticmethod
    def log_event(
        db: Session,
        event_type: str,
        actor_id: Optional[uuid.UUID] = None,
        site_id: Optional[str] = None,
        resource_type: str = "SYSTEM",
        resource_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None
    ) -> AuditLog:
        """
        Appends an immutable audit event to the system ledger.
        """
        log = AuditLog(
            event_type=event_type,
            actor_id=actor_id,
            site_id=site_id,
            resource_type=resource_type,
            resource_id=resource_id,
            details_json=details
        )
        db.add(log)
        db.commit()
        db.refresh(log)
        return log

    @staticmethod
    def get_logs(
        db: Session,
        limit: int = 50,
        event_type: Optional[str] = None,
        site_id: Optional[str] = None
    ) -> List[AuditLog]:
        query = db.query(AuditLog)
        if event_type:
            query = query.filter(AuditLog.event_type == event_type)
        if site_id:
            query = query.filter(AuditLog.site_id == site_id)
        return query.order_by(AuditLog.timestamp.desc()).limit(limit).all()
