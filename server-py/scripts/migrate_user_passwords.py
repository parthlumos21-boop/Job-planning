import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.db.session import AsyncSessionLocal
from sqlalchemy import text

async def migrate_passwords():
    async with AsyncSessionLocal() as session:
        print("Migrating PostgreSQL 'users' and 'accounts' tables to support real password column...")
        
        # 1. Add password column to users table if not exists
        await session.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS password VARCHAR(255) DEFAULT 'password123';"))
        await session.execute(text("UPDATE users SET password = 'password123' WHERE password IS NULL OR password = '';"))
        
        # 2. Add password column to accounts table if not exists
        await session.execute(text("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS password VARCHAR(255) DEFAULT 'password123';"))
        await session.execute(text("UPDATE accounts SET password = 'password123' WHERE password IS NULL OR password = '';"))
        
        await session.commit()
        
        # Verify counts and sample
        u_count = await session.execute(text("SELECT count(*) FROM users WHERE password IS NOT NULL;"))
        a_count = await session.execute(text("SELECT count(*) FROM accounts WHERE password IS NOT NULL;"))
        sample = await session.execute(text("SELECT id, name, password, departments FROM users LIMIT 3;"))
        
        print(f"Migration completed successfully!")
        print(f"Users with password: {u_count.scalar()}")
        print(f"Accounts with password: {a_count.scalar()}")
        print("Sample users:")
        for row in sample.fetchall():
            print(f" - ID {row[0]}: {row[1]} | Password: {row[2]} | Depts: {row[3]}")

if __name__ == "__main__":
    asyncio.run(migrate_passwords())
