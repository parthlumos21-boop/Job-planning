import asyncio
from app.db.session import AsyncSessionLocal
from sqlalchemy import text

STATEMENTS = [
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS handover_status VARCHAR(50) DEFAULT 'Draft'",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS planning_owner_id INTEGER REFERENCES users(id)",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS planning_owner_name VARCHAR(255)",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS handover_submitted_at TIMESTAMPTZ",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS handover_accepted_at TIMESTAMPTZ",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS handover_return_reason TEXT",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS handover_checklist JSONB DEFAULT '{}'::jsonb",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb",
    "CREATE INDEX IF NOT EXISTS idx_jobs_handover_status ON jobs(handover_status)",
    "CREATE INDEX IF NOT EXISTS idx_jobs_planning_owner ON jobs(planning_owner_id)",
    "ALTER TABLE job_handovers ADD COLUMN IF NOT EXISTS handover_type VARCHAR(50) DEFAULT 'SHIFT'",
    "ALTER TABLE job_handovers ADD COLUMN IF NOT EXISTS from_department VARCHAR(100)",
    "ALTER TABLE job_handovers ADD COLUMN IF NOT EXISTS to_department VARCHAR(100)",
    "ALTER TABLE job_handovers ADD COLUMN IF NOT EXISTS checklist_snapshot JSONB",
    "CREATE INDEX IF NOT EXISTS idx_job_handovers_type ON job_handovers(handover_type)",
    "CREATE INDEX IF NOT EXISTS idx_job_handovers_to_dept ON job_handovers(to_department)",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS current_stage VARCHAR(50) DEFAULT 'INCOMING'",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS current_action VARCHAR(255) DEFAULT 'Review Incoming Job'",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS current_waiting_reason TEXT",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS stage_started_at TIMESTAMPTZ DEFAULT NOW()",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS stage_due_date TIMESTAMPTZ",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS assignment_reason_category VARCHAR(100)",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS assignment_explanation TEXT",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS forwarding_reason_category VARCHAR(100)",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS forwarding_note TEXT",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS stage_durations JSONB DEFAULT '{}'::jsonb",
    "CREATE INDEX IF NOT EXISTS idx_jobs_current_stage ON jobs(current_stage)"
]

async def run_migration():
    print("Running migration for Handover and Planning Owner...")
    async with AsyncSessionLocal() as session:
        for stmt in STATEMENTS:
            print(f"Executing: {stmt[:60]}...")
            await session.execute(text(stmt))
        await session.commit()
        print("Migration completed successfully!")

if __name__ == "__main__":
    asyncio.run(run_migration())
