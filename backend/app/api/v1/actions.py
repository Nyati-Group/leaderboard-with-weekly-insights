from typing import List, Optional
from datetime import date, datetime, timezone
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict

from app.core.database import get_db
from app.models.quality_safety import (
    CorrectiveAction,
    ActionAssignment,
    ActionComment,
    ActionStatusHistory
)
from app.models.auth import User
from app.api.deps import get_current_user, AuthenticatedUserContext
from app.schemas.common import StandardResponse, ResponseMeta

router = APIRouter(prefix="/actions", tags=["Corrective Actions Center"])

# Whoever owns the underlying finding is responsible for driving a corrective action to
# closure. The Site Manager (overall site owner) and Project Controller (corporate oversight)
# can act on any source type; Safety/Quality Officers are scoped to their own domain's findings.
ACTION_RESPONSIBLE_ROLES = {
    "SAFETY_INCIDENT": {"SAFETY_OFFICER", "SITE_MANAGER", "PROJECT_CONTROLLER"},
    "SAFETY_OBSERVATION": {"SAFETY_OFFICER", "SITE_MANAGER", "PROJECT_CONTROLLER"},
    "QUALITY_NCR": {"QUALITY_OFFICER", "SITE_MANAGER", "PROJECT_CONTROLLER"},
    "AUDIT_FINDING": {"PROJECT_CONTROLLER", "SITE_MANAGER"},
    "MANUAL": {"SITE_MANAGER", "SAFETY_OFFICER", "QUALITY_OFFICER", "PROJECT_CONTROLLER"},
}
DEFAULT_ACTION_ROLES = {"SITE_MANAGER", "PROJECT_CONTROLLER"}

def _responsible_roles_for(source_type: str) -> set:
    return ACTION_RESPONSIBLE_ROLES.get(source_type.upper(), DEFAULT_ACTION_ROLES)

def _can_write_action(current_user: AuthenticatedUserContext, action: CorrectiveAction) -> bool:
    if any(str(a.assigned_user_id) == str(current_user.id) for a in action.assignments):
        return True
    return bool(_responsible_roles_for(action.source_type).intersection(current_user.roles))

# Schemas
class CorrectiveActionCreateRequest(BaseModel):
    site_id: str
    source_type: str  # QUALITY_NCR, SAFETY_INCIDENT, SAFETY_OBSERVATION, AUDIT_FINDING, MANUAL
    source_id: Optional[str] = None
    title: str
    description: str
    priority: str = "MEDIUM"  # LOW, MEDIUM, HIGH, CRITICAL
    due_date: date
    assigned_user_ids: List[str] = []

class ActionCommentInput(BaseModel):
    comment_text: str

class ActionStatusUpdateRequest(BaseModel):
    new_status: str  # OPEN, IN_PROGRESS, PENDING_VERIFICATION, CLOSED
    notes: Optional[str] = None

class ActionAssignmentResponse(BaseModel):
    id: str
    assigned_user_id: str
    assigned_at: datetime
    model_config = ConfigDict(from_attributes=True)

class ActionCommentResponse(BaseModel):
    id: str
    user_id: str
    user_email: Optional[str] = None
    comment_text: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class ActionHistoryResponse(BaseModel):
    id: str
    old_status: str
    new_status: str
    changed_by: str
    notes: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class CorrectiveActionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    site_id: str
    source_type: str
    source_id: Optional[str] = None
    title: str
    description: str
    priority: str
    due_date: date
    status: str
    created_by: str
    created_at: datetime
    assignments: List[ActionAssignmentResponse] = []
    comments: List[ActionCommentResponse] = []
    status_history: List[ActionHistoryResponse] = []

# Endpoints
@router.get("", response_model=StandardResponse[List[CorrectiveActionResponse]])
def list_actions(
    site_id: Optional[str] = None,
    action_status: Optional[str] = None,
    priority: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    query = db.query(CorrectiveAction)
    if site_id:
        if not current_user.can_access_site(site_id):
            raise HTTPException(status_code=403, detail="Cross-site access denied.")
        query = query.filter(CorrectiveAction.site_id == site_id)
    else:
        if not current_user.has_global_scope:
            query = query.filter(CorrectiveAction.site_id.in_(current_user.assigned_site_ids))

    if action_status:
        query = query.filter(CorrectiveAction.status == action_status)
    if priority:
        query = query.filter(CorrectiveAction.priority == priority)

    actions = query.order_by(CorrectiveAction.due_date.asc()).all()
    results = [build_action_response(a) for a in actions]
    return StandardResponse(data=results, meta=ResponseMeta())

@router.post("", response_model=StandardResponse[CorrectiveActionResponse], status_code=status.HTTP_201_CREATED)
def create_corrective_action(
    payload: CorrectiveActionCreateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    if not current_user.can_access_site(payload.site_id):
        raise HTTPException(status_code=403, detail="Cross-site access denied.")

    allowed_roles = _responsible_roles_for(payload.source_type)
    if not allowed_roles.intersection(current_user.roles):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Raising a {payload.source_type} corrective action requires one of: {', '.join(sorted(allowed_roles))}."
        )

    action = CorrectiveAction(
        site_id=payload.site_id,
        source_type=payload.source_type,
        source_id=uuid.UUID(payload.source_id) if payload.source_id else None,
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        due_date=payload.due_date,
        status="OPEN",
        created_by=current_user.id
    )
    db.add(action)
    db.flush()

    # Assign users
    for uid in payload.assigned_user_ids:
        db.add(ActionAssignment(
            action_id=action.id,
            assigned_user_id=uuid.UUID(uid)
        ))

    # Log initial status history
    db.add(ActionStatusHistory(
        action_id=action.id,
        old_status="NONE",
        new_status="OPEN",
        changed_by=current_user.id,
        notes="Corrective action raised."
    ))

    db.commit()
    db.refresh(action)

    return StandardResponse(data=build_action_response(action), meta=ResponseMeta())

@router.get("/{action_id}", response_model=StandardResponse[CorrectiveActionResponse])
def get_action_detail(
    action_id: str,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    action = db.query(CorrectiveAction).filter(CorrectiveAction.id == action_id).first()
    if not action:
        raise HTTPException(status_code=404, detail="Corrective action not found.")

    if not current_user.can_access_site(action.site_id):
        raise HTTPException(status_code=403, detail="Cross-site access denied.")

    return StandardResponse(data=build_action_response(action), meta=ResponseMeta())

@router.put("/{action_id}/status", response_model=StandardResponse[CorrectiveActionResponse])
def update_action_status(
    action_id: str,
    payload: ActionStatusUpdateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    action = db.query(CorrectiveAction).filter(CorrectiveAction.id == action_id).first()
    if not action:
        raise HTTPException(status_code=404, detail="Corrective action not found.")

    if not current_user.can_access_site(action.site_id):
        raise HTTPException(status_code=403, detail="Cross-site access denied.")

    if not _can_write_action(current_user, action):
        allowed_roles = _responsible_roles_for(action.source_type)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Updating this {action.source_type} action requires one of: "
                   f"{', '.join(sorted(allowed_roles))}, or being assigned to it."
        )

    old_status = action.status
    action.status = payload.new_status

    # Append immutable audit history
    history = ActionStatusHistory(
        action_id=action.id,
        old_status=old_status,
        new_status=payload.new_status,
        changed_by=current_user.id,
        notes=payload.notes
    )
    db.add(history)

    db.commit()
    db.refresh(action)

    return StandardResponse(data=build_action_response(action), meta=ResponseMeta())

@router.post("/{action_id}/comments", response_model=StandardResponse[ActionCommentResponse])
def add_action_comment(
    action_id: str,
    payload: ActionCommentInput,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    action = db.query(CorrectiveAction).filter(CorrectiveAction.id == action_id).first()
    if not action:
        raise HTTPException(status_code=404, detail="Corrective action not found.")

    if not current_user.can_access_site(action.site_id):
        raise HTTPException(status_code=403, detail="Cross-site access denied.")

    comment = ActionComment(
        action_id=action.id,
        user_id=current_user.id,
        comment_text=payload.comment_text
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)

    return StandardResponse(
        data=ActionCommentResponse(
            id=str(comment.id),
            user_id=str(comment.user_id),
            user_email=current_user.email,
            comment_text=comment.comment_text,
            created_at=comment.created_at
        ),
        meta=ResponseMeta()
    )

def build_action_response(action: CorrectiveAction) -> CorrectiveActionResponse:
    return CorrectiveActionResponse(
        id=str(action.id),
        site_id=action.site_id,
        source_type=action.source_type,
        source_id=str(action.source_id) if action.source_id else None,
        title=action.title,
        description=action.description,
        priority=action.priority,
        due_date=action.due_date,
        status=action.status,
        created_by=str(action.created_by),
        created_at=action.created_at,
        assignments=[
            ActionAssignmentResponse(
                id=str(a.id),
                assigned_user_id=str(a.assigned_user_id),
                assigned_at=a.assigned_at
            )
            for a in action.assignments
        ],
        comments=[
            ActionCommentResponse(
                id=str(c.id),
                user_id=str(c.user_id),
                user_email=c.author.email if c.author else None,
                comment_text=c.comment_text,
                created_at=c.created_at
            )
            for c in action.comments
        ],
        status_history=[
            ActionHistoryResponse(
                id=str(h.id),
                old_status=h.old_status,
                new_status=h.new_status,
                changed_by=str(h.changed_by),
                notes=h.notes,
                created_at=h.created_at
            )
            for h in action.status_history
        ]
    )
