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

class UpdateUserRequest(BaseModel):
    name: str | None = None
    departments: list[str] | None = None
    role: str | None = None
    password: str | None = None

@router.put("/{user_id}")
async def update_user(
    user_id: int,
    body: UpdateUserRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserPayload = Depends(get_current_user)
):
    username = (current_user.username or "").lower()
    role = (current_user.role or "").lower()
    is_keval = "keval" in username
    is_admin = role in ["admin", "executive", "superadmin"]
    if not (is_keval or is_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Keval V Shah or Administrators can edit users"
        )

    # Determine if it's an account-only record (id >= 10000) or user record
    if user_id >= 10000:
        acc_id = user_id - 10000
        acc = await db.get(Account, acc_id)
        if not acc:
            raise HTTPException(status_code=404, detail="Account not found")

        old_name = acc.username
        if body.name and body.name.strip():
            acc.username = body.name.strip().lower()
        if body.departments is not None:
            acc.departments = [d.strip().lower() for d in body.departments if d and d.strip()]
        if body.role is not None:
            acc.role = body.role.strip().lower()
        if body.password and body.password.strip():
            acc.password = body.password.strip()
            acc.hashed_password = hash_password(body.password.strip())

        await db.commit()
        await db.refresh(acc)

        return {
            "success": True,
            "message": f"Account '{acc.username}' updated successfully",
            "user": {
                "id": user_id,
                "externalId": user_id,
                "name": acc.username,
                "username": acc.username,
                "departments": acc.departments or [],
                "role": (acc.role or "user").capitalize(),
                "password": acc.password or "password123",
                "userType": "account",
                "uniqueKey": f"account_{acc.id}_{acc.username}"
            }
        }

    # Otherwise User table
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    old_name = u.name
    if body.name and body.name.strip():
        u.name = body.name.strip()
    if body.departments is not None:
        u.departments = [d.strip().lower() for d in body.departments if d and d.strip()]
    if body.password and body.password.strip():
        u.password = body.password.strip()

    # Also update matching Account if exists
    acc_stmt = select(Account).where(
        func.lower(Account.username).in_([old_name.lower(), u.name.lower()])
    )
    acc_res = await db.execute(acc_stmt)
    matching_acc = acc_res.scalars().first()
    if matching_acc:
        if body.name and body.name.strip():
            matching_acc.username = body.name.strip().lower()
        if body.departments is not None:
            matching_acc.departments = u.departments
        if body.role is not None:
            matching_acc.role = body.role.strip().lower()
        if body.password and body.password.strip():
            matching_acc.password = body.password.strip()
            matching_acc.hashed_password = hash_password(body.password.strip())

    await db.commit()
    await db.refresh(u)

    user_role = (matching_acc.role if matching_acc and matching_acc.role else (body.role or "user")).capitalize()

    return {
        "success": True,
        "message": f"User '{u.name}' updated successfully in PostgreSQL",
        "user": {
            "id": u.id,
            "externalId": u.external_id or u.id,
            "name": u.name,
            "username": u.name,
            "departments": u.departments or [],
            "role": user_role,
            "password": u.password or (matching_acc.password if matching_acc else "password123"),
            "userType": "user",
            "uniqueKey": f"user_{u.id}_{u.name}"
        }
    }

@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserPayload = Depends(get_current_user)
):
    username = (current_user.username or "").lower()
    role = (current_user.role or "").lower()
    is_keval = "keval" in username
    is_admin = role in ["admin", "executive", "superadmin"]
    if not (is_keval or is_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Keval V Shah or Administrators can delete users"
        )

    # If account-only id
    if user_id >= 10000:
        acc_id = user_id - 10000
        acc = await db.get(Account, acc_id)
        if acc:
            await db.delete(acc)
            await db.commit()
            return {"success": True, "message": f"Account '{acc.username}' deleted successfully"}
        raise HTTPException(status_code=404, detail="Account not found")

    # User table
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    user_name = u.name

    # Check and delete matching account as well
    acc_stmt = select(Account).where(func.lower(Account.username) == user_name.lower())
    acc_res = await db.execute(acc_stmt)
    matching_acc = acc_res.scalars().first()
    if matching_acc:
        await db.delete(matching_acc)

    await db.delete(u)
    await db.commit()

    return {"success": True, "message": f"User '{user_name}' deleted successfully from PostgreSQL"}
