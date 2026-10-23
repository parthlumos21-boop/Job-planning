from fastapi import APIRouter, Depends, Query, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.db.session import get_db
from app.api.deps import get_current_user
from app.models import Account, User
from app.schemas import UserPayload
from app.core.security import hash_password

router = APIRouter(prefix="/users", tags=["Users"])

class CreateUserRequest(BaseModel):
    name: str
    departments: list[str] = []
    role: str = "user"
    createAccount: bool = True
    password: str = "password123"

@router.get("")
async def get_users(
    department: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: UserPayload = Depends(get_current_user)
):
    user_role = (user.role or "").lower()
    user_name = (user.username or "").lower()
    is_admin = user_role in ["admin", "executive", "superadmin"] or "keval" in user_name

    # Pre-fetch all accounts into dictionary for quick role & password lookup
    acc_stmt = select(Account).order_by(Account.username.asc())
    acc_res = await db.execute(acc_stmt)
    accounts = acc_res.scalars().all()
    account_map = {a.username.lower(): a for a in accounts}

    # Query User table first
    u_stmt = select(User).where(User.is_active.is_(True)).order_by(User.name.asc())
    u_res = await db.execute(u_stmt)
    users_list = u_res.scalars().all()

    output = []
    seen_names = set()

    for u in users_list:
        depts = u.departments or []
        if department and department not in depts:
            continue
        clean_name = u.name.strip()
        seen_names.add(clean_name.lower())
        matched_acc = account_map.get(clean_name.lower())
        role = matched_acc.role.capitalize() if matched_acc and matched_acc.role else "User"
        pw = (matched_acc.password if matched_acc and matched_acc.password else u.password) or "password123"

        output.append({
            "id": u.id,
            "externalId": u.external_id or u.id,
            "name": clean_name,
            "username": clean_name,
            "departments": depts,
            "role": role,
            "password": pw if is_admin else "••••••••",
            "jobCount": 0,
            "userType": "user",
            "uniqueKey": f"user_{u.id}_{clean_name}"
        })

    # Also include Accounts that might not be in users table
    for a in accounts:
        clean_user = a.username.strip()
        if clean_user.lower() in seen_names:
            continue
        depts = a.departments or []
        if department and department not in depts and a.role not in ["admin", "executive"]:
            continue
        role = (a.role or "user").capitalize()
        pw = a.password or "password123"

        output.append({
            "id": 10000 + a.id,
            "externalId": 10000 + a.id,
            "name": clean_user,
            "username": clean_user,
            "departments": depts,
            "role": role,
            "password": pw if is_admin else "••••••••",
            "jobCount": 0,
            "userType": "account",
            "uniqueKey": f"account_{a.id}_{clean_user}"
        })

    return output

@router.post("")
async def create_user(
    body: CreateUserRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserPayload = Depends(get_current_user)
):
    # Verify Keval V Shah or Admin privileges
    username = (current_user.username or "").lower()
    role = (current_user.role or "").lower()
    is_keval = "keval" in username
    is_admin = role in ["admin", "executive", "superadmin"]
    if not (is_keval or is_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Keval V Shah or Administrators can add users to Job Planning"
        )

    clean_name = body.name.strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="User name is required")

    # Check if User with same name already exists
    u_stmt = select(User).where(func.lower(User.name) == clean_name.lower())
    u_res = await db.execute(u_stmt)
    existing_user = u_res.scalars().first()
    if existing_user:
        raise HTTPException(status_code=400, detail=f"User '{clean_name}' already exists in Job Planning")

    clean_depts = [d.strip().lower() for d in body.departments if d and d.strip()]
    plain_pw = body.password.strip() if body.password and body.password.strip() else "password123"

    # Insert into users table
    new_user = User(
        name=clean_name,
        departments=clean_depts,
        password=plain_pw,
        is_active=True
    )
    db.add(new_user)
    await db.flush()
    new_user.external_id = new_user.id

    # If createAccount is True, also create Account for login
    created_account = None
    if body.createAccount:
        acc_stmt = select(Account).where(func.lower(Account.username) == clean_name.lower())
        acc_res = await db.execute(acc_stmt)
        existing_acc = acc_res.scalars().first()
        if not existing_acc:
            hashed_pwd = hash_password(plain_pw)
            created_account = Account(
                username=clean_name.lower(),
                password=plain_pw,
                hashed_password=hashed_pwd,
                role=body.role or "user",
                departments=clean_depts
            )
            db.add(created_account)

    await db.commit()
    await db.refresh(new_user)

    return {
        "success": True,
        "message": f"User '{clean_name}' successfully added to Job Planning",
        "user": {
            "id": new_user.id,
            "externalId": new_user.external_id,
            "name": new_user.name,
            "username": new_user.name,
            "departments": new_user.departments,
            "role": (body.role or "user").capitalize(),
            "password": plain_pw,
            "hasAccount": bool(created_account),
            "uniqueKey": f"user_{new_user.id}_{new_user.name}"
        }
    }
