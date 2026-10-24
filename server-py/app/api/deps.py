from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.core.security import decode_access_token
from app.schemas import UserPayload

security_bearer = HTTPBearer(auto_error=False)

async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_bearer)
) -> UserPayload:
    token = credentials.credentials if credentials else request.query_params.get("token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization token"
        )
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
    return UserPayload(
        username=payload.get("username", ""),
        role=payload.get("role", "user"),
        departments=payload.get("departments", []),
        name=payload.get("name") or payload.get("username", ""),
        email=payload.get("email"),
        id=payload.get("id")
    )

def is_admin_or_keval(user: UserPayload) -> bool:
    role = (user.role or "").lower()
    uname = (user.username or "").lower()
    return (
        role in ["admin", "executive", "superadmin"]
        or uname in ["keval v shah", "keval", "kevalvshah"]
    )

async def require_admin(
    user: UserPayload = Depends(get_current_user)
) -> UserPayload:
    if not is_admin_or_keval(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access restricted to administrators only"
        )
    return user

def is_keval_user(user: UserPayload) -> bool:
    uname = (user.username or "").strip().lower()
    return uname in ["keval v shah", "keval", "kevalvshah"]

async def require_keval(
    user: UserPayload = Depends(get_current_user)
) -> UserPayload:
    if not is_keval_user(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access restricted exclusively to Keval V Shah."
        )
    return user

