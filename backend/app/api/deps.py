from typing import Generator, Optional, List
from fastapi import Depends, HTTPException, status, Header
from fastapi.security import OAuth2PasswordBearer
from app.core.database import Session
import jwt
from app.core.database import get_db
from app.core.security import decode_token
from app.models.auth import User, Role, SiteAssignment

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

GLOBAL_SCOPE_ROLES = {"ORG_ADMIN", "EXEC_LEADERSHIP", "PROJECT_CONTROLLER"}

class AuthenticatedUserContext:
    def __init__(self, user: User, roles: List[str], assigned_site_ids: List[str]):
        self.user = user
        self.id = user.id
        self.email = user.email
        self.full_name = user.full_name
        self.roles = roles
        self.assigned_site_ids = assigned_site_ids
        self.has_global_scope = any(r in GLOBAL_SCOPE_ROLES for r in roles)

    def can_access_site(self, site_id: str) -> bool:
        if self.has_global_scope:
            return True
        return site_id in self.assigned_site_ids

def get_current_user(
    db: Session = Depends(get_db),
    token: Optional[str] = Depends(oauth2_scheme)
) -> AuthenticatedUserContext:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token is missing.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type: access token required.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token subject missing.",
                headers={"WWW-Authenticate": "Bearer"},
            )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token has expired.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or account is deactivated.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    roles = [r.id for r in user.roles]
    active_assignments = db.query(SiteAssignment).filter(
        SiteAssignment.user_id == user.id,
        SiteAssignment.is_active == True
    ).all()
    assigned_site_ids = [a.site_id for a in active_assignments]

    return AuthenticatedUserContext(
        user=user,
        roles=roles,
        assigned_site_ids=assigned_site_ids
    )

def require_roles(*allowed_roles: str):
    def role_checker(current_user: AuthenticatedUserContext = Depends(get_current_user)) -> AuthenticatedUserContext:
        if not any(role in current_user.roles for role in allowed_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: Requires one of the following roles: {', '.join(allowed_roles)}"
            )
        return current_user
    return role_checker

def require_site_access(site_id: str, current_user: AuthenticatedUserContext = Depends(get_current_user)) -> AuthenticatedUserContext:
    if not current_user.can_access_site(site_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Cross-site access denied: User is not authorized to access site {site_id}."
        )
    return current_user
