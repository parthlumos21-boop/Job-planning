import asyncio, os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from dotenv import load_dotenv
import bcrypt

load_dotenv('server-py/.env')

async def fix_hashes():
    engine = create_async_engine(os.getenv('DATABASE_URL'))
    async with engine.begin() as conn:
        res = await conn.execute(text("SELECT id, username, password, hashed_password FROM accounts;"))
        rows = res.fetchall()
        for r in rows:
            acc_id, uname, plain, hp = r
            plain_pass = plain or "password123"
            matches = False
            if hp:
                try:
                    matches = bcrypt.checkpw(plain_pass.encode('utf-8'), hp.encode('utf-8'))
                except Exception:
                    matches = False
            if not matches:
                new_hash = bcrypt.hashpw(plain_pass.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
                await conn.execute(text("UPDATE accounts SET hashed_password = :hp, password = :plain WHERE id = :id;"), {"hp": new_hash, "plain": plain_pass, "id": acc_id})
                print(f"Synchronized hashed_password for account '{uname}' (password: {plain_pass})")
            else:
                print(f"Account '{uname}' hash already valid.")

asyncio.run(fix_hashes())
