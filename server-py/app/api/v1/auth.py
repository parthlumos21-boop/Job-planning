from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.models import Account
from app.schemas import LoginRequest, TokenResponse, UserPayload
from app.core.security import verify_password, create_access_token

router = APIRouter(prefix="/auth", tags=["Auth"])

@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    username = req.username.strip().lower()
    password = req.password.strip()

    stmt = select(Account).where(Account.username == username)
    result = await db.execute(stmt)
    account = result.scalar_one_or_none()

    if not account or not verify_password(password, account.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )

    user_payload = UserPayload(
        username=account.username,
        role=account.role or "user",
        departments=account.departments or []
    )

    token = create_access_token(user_payload.model_dump())
    return TokenResponse(token=token, user=user_payload)
