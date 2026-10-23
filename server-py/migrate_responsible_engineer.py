import asyncio
from app.db.session import AsyncSessionLocal
from sqlalchemy import text

statements = [
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS previous_responsible_engg_name VARCHAR(255) DEFAULT ''",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS return_reason VARCHAR(100)",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS return_comment TEXT",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS returned_by VARCHAR(100)",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS reassignment_history JSONB DEFAULT '[]'::jsonb",
    "ALTER TABLE job_handovers ADD COLUMN IF NOT EXISTS previous_responsible_engg_name VARCHAR(255) DEFAULT ''",
    "ALTER TABLE job_handovers ADD COLUMN IF NOT EXISTS reassignment_reason VARCHAR(255)"
]

async def migrate():
    async with AsyncSessionLocal() as session:
        for s in statements:
            print(f"Executing: {s}...")
            await session.execute(text(s))
        await session.commit()
    print("DB schema migration for responsible engineer and return workflow completed successfully!")

if __name__ == "__main__":
    asyncio.run(migrate())
