from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.core.security import decode_access_token
from app.schemas import UserPayload

security_bearer = HTTPBearer(auto_error=False)

async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_bearer)
) -> UserPayload:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization token"
        )
    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
    return UserPayload(
        username=payload.get("username", ""),
        role=payload.get("role", "user"),
        departments=payload.get("departments", [])
    )

def is_admin_or_keval(user: UserPayload) -> bool:
    return (
        user.role in ["admin", "executive"]
        or (user.username or "").lower() == "keval v shah"
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

