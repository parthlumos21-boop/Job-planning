from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.db.session import get_db
from app.models import Account, User
from app.schemas import LoginRequest, TokenResponse, UserPayload
from app.core.security import verify_password, hash_password, create_access_token
from app.api import deps

router = APIRouter(prefix="/auth", tags=["Auth"])

@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    username = req.username.strip().lower()
    clean_username = username.replace(" ", "")
    password = req.password.strip()

    # 1. Match direct Account username (exact match first, then stripped variant)
    stmt = select(Account).where(func.lower(Account.username) == username)
    result = await db.execute(stmt)
    account: Any = result.scalars().first()

    if not account and clean_username != username:
        stmt = select(Account).where(func.lower(Account.username) == clean_username)
        result = await db.execute(stmt)
        account = result.scalars().first()

    # 2. If not found, match by display name in User table
    if not account:
        u_stmt = select(User).where(func.lower(User.name) == username)
        u_res = await db.execute(u_stmt)
        user_obj = u_res.scalars().first()
        if not user_obj and clean_username != username:
            u_stmt = select(User).where(func.lower(User.name) == clean_username)
            u_res = await db.execute(u_stmt)
            user_obj = u_res.scalars().first()

        if user_obj:
            u_name = user_obj.name.lower()
            acc_stmt = select(Account).where(func.lower(Account.username) == u_name)
            acc_res = await db.execute(acc_stmt)
            account = acc_res.scalars().first()
            if not account and u_name.replace(" ", "") != u_name:
                acc_stmt = select(Account).where(func.lower(Account.username) == u_name.replace(" ", ""))
                acc_res = await db.execute(acc_stmt)
                account = acc_res.scalars().first()

    # 3. Verify password: first check bcrypt hash, fallback to table's password column
    is_valid = False
    if account and account.hashed_password:
        is_valid = verify_password(password, account.hashed_password)

    if not is_valid and account and getattr(account, "password", None):
        if password == account.password:
            is_valid = True
            # Automatically synchronize hash to match table's password
            try:
                account.hashed_password = hash_password(password)
                await db.commit()
            except Exception:
                pass

    if not account or not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )

    # Resolve display name and email from User record if available
    display_name = account.username
    display_email = getattr(account, "email", None)

    u_query = await db.execute(select(User).where(func.lower(User.name) == func.lower(account.username)))
    matched_u = u_query.scalars().first()
    if matched_u:
        display_name = matched_u.name
        if not display_email and matched_u.email:
            display_email = matched_u.email

    if not display_email:
        display_email = f"{account.username.lower().replace(' ', '')}@swatiswitchgears.com"

    user_payload = UserPayload(
        username=account.username,
        role=account.role or "user",
        departments=account.departments or [],
        id=account.id,
        name=display_name,
        email=display_email
    )

    token = create_access_token(user_payload.model_dump())
    return TokenResponse(token=token, user=user_payload)

@router.get("/me", response_model=UserPayload)
async def get_current_user_profile(
    db: AsyncSession = Depends(get_db),
    current_user: UserPayload = Depends(deps.get_current_user)
):
    stmt = select(Account).where(func.lower(Account.username) == current_user.username.lower())
    res = await db.execute(stmt)
    account = res.scalar_one_or_none()
    if not account:
        return current_user

    display_name = account.username
    display_email = getattr(account, "email", None)

    u_query = await db.execute(select(User).where(func.lower(User.name) == func.lower(account.username)))
    matched_u = u_query.scalars().first()
    if matched_u:
        display_name = matched_u.name
        if not display_email and matched_u.email:
            display_email = matched_u.email

    if not display_email:
        display_email = f"{account.username.lower().replace(' ', '')}@swatiswitchgears.com"

    return UserPayload(
        username=account.username,
        role=account.role or "user",
        departments=account.departments or [],
        id=account.id,
        name=display_name,
        email=display_email
    )
