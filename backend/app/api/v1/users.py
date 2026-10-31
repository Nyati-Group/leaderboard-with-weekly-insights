from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, ConfigDict
import uuid

from app.core.database import get_db
from app.core.security import get_password_hash
from app.models.auth import User, Role, SiteAssignment
from app.models.sites import Site
from app.api.deps import require_roles, AuthenticatedUserContext
from app.schemas.common import StandardResponse, ResponseMeta

router = APIRouter(prefix="/users", tags=["User & Role Management"])

class UserCreateRequest(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    roles: List[str]
    assigned_site_ids: Optional[List[str]] = None

class UserRoleUpdateRequest(BaseModel):
    roles: List[str]

class UserSiteAssignRequest(BaseModel):
    site_id: str
    assigned_role: str

class UserDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    full_name: str
    is_active: bool
    roles: List[str]
    assigned_site_ids: List[str]

@router.get("", response_model=StandardResponse[List[UserDetailResponse]])
def list_users(
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(require_roles("ORG_ADMIN"))
):
    users = db.query(User).all()
    results = []
    for u in users:
        roles = [r.id for r in u.roles]
        site_ids = [a.site_id for a in u.site_assignments if a.is_active]
        results.append(UserDetailResponse(
            id=str(u.id),
            email=u.email,
            full_name=u.full_name,
            is_active=u.is_active,
            roles=roles,
            assigned_site_ids=site_ids
        ))
    return StandardResponse(data=results, meta=ResponseMeta())

@router.post("", response_model=StandardResponse[UserDetailResponse], status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(require_roles("ORG_ADMIN"))
):
    existing = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(status_code=400, detail="A user with this email already exists.")

    new_user = User(
        email=payload.email.lower(),
        full_name=payload.full_name,
        hashed_password=get_password_hash(payload.password),
        is_active=True
    )
    db.add(new_user)
    db.flush()

    # Assign roles
    for role_id in payload.roles:
        role = db.query(Role).filter(Role.id == role_id).first()
        if role:
            new_user.roles.append(role)

    # Assign sites if provided
    if payload.assigned_site_ids:
        for sid in payload.assigned_site_ids:
            site = db.query(Site).filter(Site.id == sid).first()
            if site:
                assignment = SiteAssignment(
                    user_id=new_user.id,
                    site_id=sid,
                    assigned_role=payload.roles[0] if payload.roles else "STAFF",
                    is_active=True
                )
                db.add(assignment)

    db.commit()
    db.refresh(new_user)

    roles = [r.id for r in new_user.roles]
    site_ids = [a.site_id for a in new_user.site_assignments if a.is_active]

    return StandardResponse(
        data=UserDetailResponse(
            id=str(new_user.id),
            email=new_user.email,
            full_name=new_user.full_name,
            is_active=new_user.is_active,
            roles=roles,
            assigned_site_ids=site_ids
        ),
        meta=ResponseMeta()
    )

@router.put("/{user_id}/roles", response_model=StandardResponse[UserDetailResponse])
def update_user_roles(
    user_id: str,
    payload: UserRoleUpdateRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(require_roles("ORG_ADMIN"))
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    user.roles.clear()
    for role_id in payload.roles:
        role = db.query(Role).filter(Role.id == role_id).first()
        if role:
            user.roles.append(role)

    db.commit()
    db.refresh(user)

    roles = [r.id for r in user.roles]
    site_ids = [a.site_id for a in user.site_assignments if a.is_active]

    return StandardResponse(
        data=UserDetailResponse(
            id=str(user.id),
            email=user.email,
            full_name=user.full_name,
            is_active=user.is_active,
            roles=roles,
            assigned_site_ids=site_ids
        ),
        meta=ResponseMeta()
    )

@router.post("/{user_id}/sites", response_model=StandardResponse[dict])
def assign_user_to_site(
    user_id: str,
    payload: UserSiteAssignRequest,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUserContext = Depends(require_roles("ORG_ADMIN"))
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    site = db.query(Site).filter(Site.id == payload.site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found.")

    existing_assignment = db.query(SiteAssignment).filter(
        SiteAssignment.user_id == user.id,
        SiteAssignment.site_id == site.id,
        SiteAssignment.is_active == True
    ).first()

    if existing_assignment:
        existing_assignment.assigned_role = payload.assigned_role
    else:
        assignment = SiteAssignment(
            user_id=user.id,
            site_id=site.id,
            assigned_role=payload.assigned_role,
            is_active=True
        )
        db.add(assignment)

    db.commit()
    return StandardResponse(
        data={"message": f"User {user.email} successfully assigned to site {site.id} as {payload.assigned_role}."},
        meta=ResponseMeta()
    )
