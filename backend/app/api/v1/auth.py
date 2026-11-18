from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from app.core.database import Session
from pydantic import BaseModel, EmailStr, ConfigDict
import jwt

from app.core.database import get_db
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    decode_token
)
from app.models.auth import User, RefreshToken, SiteAssignment
from app.api.deps import get_current_user, AuthenticatedUserContext
from app.schemas.common import StandardResponse, ResponseMeta

router = APIRouter(prefix="/auth", tags=["Authentication & Session"])

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class UserProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    full_name: str
    is_active: bool
    roles: List[str]
    assigned_site_ids: List[str]
    has_global_scope: bool

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserProfileResponse

class RefreshTokenRequest(BaseModel):
    refresh_token: str

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

@router.post("/login", response_model=StandardResponse[TokenResponse])
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password."
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated. Contact corporate administrator."
        )

    roles = [r.id for r in user.roles]
    active_assignments = db.query(SiteAssignment).filter(
        SiteAssignment.user_id == user.id,
        SiteAssignment.is_active == True
    ).all()
    assigned_site_ids = [a.site_id for a in active_assignments]

    access_token = create_access_token(subject=user.id, roles=roles)
    refresh_token = create_refresh_token(subject=user.id)

    # Store refresh token record in DB
    payload_decoded = decode_token(refresh_token)
    exp_ts = payload_decoded.get("exp")
    expires_at = datetime.fromtimestamp(exp_ts, tz=timezone.utc)

    db_refresh = RefreshToken(
        user_id=user.id,
        token_hash=refresh_token[-20:],  # Store hash/tail identifier
        expires_at=expires_at,
        revoked=False
    )
    db.add(db_refresh)
    db.commit()

    user_profile = UserProfileResponse(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        roles=roles,
        assigned_site_ids=assigned_site_ids,
        has_global_scope=any(r in {"ORG_ADMIN", "EXEC_LEADERSHIP", "PROJECT_CONTROLLER"} for r in roles)
    )

    return StandardResponse(
        data=TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            user=user_profile
        ),
        meta=ResponseMeta()
    )

@router.post("/refresh", response_model=StandardResponse[dict])
def refresh_token(payload: RefreshTokenRequest, db: Session = Depends(get_db)):
    try:
        decoded = decode_token(payload.refresh_token)
        if decoded.get("type") != "refresh":
            raise HTTPException(status_code=400, detail="Invalid token type: refresh token expected.")
        user_id = decoded.get("sub")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired. Please log in again.")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token.")

    # Check revocation
    db_token = db.query(RefreshToken).filter(
        RefreshToken.user_id == user_id,
        RefreshToken.token_hash == payload.refresh_token[-20:],
        RefreshToken.revoked == False
    ).first()

    if not db_token:
        raise HTTPException(status_code=401, detail="Refresh token has been revoked or is invalid.")

    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=401, detail="User account no longer active.")

    roles = [r.id for r in user.roles]
    new_access_token = create_access_token(subject=user.id, roles=roles)

    return StandardResponse(
        data={
            "access_token": new_access_token,
            "token_type": "bearer"
        },
        meta=ResponseMeta()
    )

@router.post("/logout", response_model=StandardResponse[dict])
def logout(
    payload: RefreshTokenRequest,
    current_user: AuthenticatedUserContext = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_tokens = db.query(RefreshToken).filter(
        RefreshToken.user_id == current_user.id,
        RefreshToken.token_hash == payload.refresh_token[-20:]
    ).all()
    for t in db_tokens:
        t.revoked = True
    db.commit()

    return StandardResponse(
        data={"message": "Successfully logged out and session revoked."},
        meta=ResponseMeta()
    )

@router.get("/me", response_model=StandardResponse[UserProfileResponse])
def get_current_user_profile(
    current_user: AuthenticatedUserContext = Depends(get_current_user)
):
    profile = UserProfileResponse(
        id=str(current_user.id),
        email=current_user.email,
        full_name=current_user.full_name,
        is_active=current_user.user.is_active,
        roles=current_user.roles,
        assigned_site_ids=current_user.assigned_site_ids,
        has_global_scope=current_user.has_global_scope
    )
    return StandardResponse(data=profile, meta=ResponseMeta())

@router.post("/change-password", response_model=StandardResponse[dict])
def change_password(
    payload: ChangePasswordRequest,
    current_user: AuthenticatedUserContext = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == current_user.id).first()
    if not user or not verify_password(payload.old_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password does not match.")

    if len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters long.")

    user.hashed_password = get_password_hash(payload.new_password)
    # Revoke all existing refresh tokens upon password change
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id).update({"revoked": True})
    db.commit()

    return StandardResponse(
        data={"message": "Password changed successfully. Existing sessions have been revoked."},
        meta=ResponseMeta()
    )
