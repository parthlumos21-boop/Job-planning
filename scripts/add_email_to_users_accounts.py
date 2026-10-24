import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from dotenv import load_dotenv

load_dotenv('server-py/.env')
DATABASE_URL = os.getenv('DATABASE_URL')

STATEMENTS = [
    "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS email VARCHAR(255);",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);",
    """
    UPDATE accounts 
    SET email = LOWER(REPLACE(username, ' ', '')) || '@swatiswitchgears.com'
    WHERE email IS NULL OR email = '';
    """,
    """
    UPDATE users 
    SET email = LOWER(REPLACE(name, ' ', '')) || '@swatiswitchgears.com'
    WHERE email IS NULL OR email = '';
    """
]

async def migrate_emails():
    print(f"Connecting to {DATABASE_URL}...")
    engine = create_async_engine(DATABASE_URL)
    async with engine.begin() as conn:
        for stmt in STATEMENTS:
            print("Executing:", " ".join(stmt.strip().split())[:70])
            await conn.execute(text(stmt))
    print("Email columns and values updated successfully!")
    await engine.dispose()

if __name__ == '__main__':
    asyncio.run(migrate_emails())
