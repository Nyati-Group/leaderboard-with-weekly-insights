import uuid
from typing import List, Optional, Any, Dict
from pydantic import BaseModel, ConfigDict
from fastapi import APIRouter, Depends, HTTPException, Query, status
from app.core.database import Session

from app.core.database import get_db
from app.api.deps import get_current_user, AuthenticatedUserContext
from app.models.audit import AuditLog
from app.services.audit_service import AuditService

router = APIRouter(prefix="/audit", tags=["Audit Ledger"])

class AuditLogSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_type: str
    actor_id: Optional[uuid.UUID] = None
    actor_name: Optional[str] = None
    site_id: Optional[str] = None
    resource_type: str
    resource_id: Optional[str] = None
    details_json: Optional[Dict[str, Any]] = None
    timestamp: Any

@router.get("/logs", response_model=List[AuditLogSchema])
def get_audit_trail(
    limit: int = Query(50, ge=1, le=200),
    event_type: Optional[str] = Query(None),
    site_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    """
    Retrieves the immutable system audit ledger.
    Restricted to Organization Admins, Executive Leadership, and Project Controllers.
    """
    user_roles = set(current_user.roles)
    if not user_roles.intersection({"ORG_ADMIN", "EXEC_LEADERSHIP", "PROJECT_CONTROLLER"}):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access to the compliance audit ledger is restricted to leadership and controllers."
        )

    logs = AuditService.get_logs(
        db=db,
        limit=limit,
        event_type=event_type,
        site_id=site_id
    )

    result = []
    for l in logs:
        item = AuditLogSchema.model_validate(l)
        item.actor_name = l.actor.full_name if l.actor else None
        result.append(item)

    return result
