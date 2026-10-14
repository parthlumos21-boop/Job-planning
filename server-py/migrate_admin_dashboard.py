import asyncio
from app.db.session import AsyncSessionLocal
from sqlalchemy import text

STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS job_delay_records (
        id SERIAL PRIMARY KEY,
        job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        external_job_id INTEGER,
        original_target_date TIMESTAMPTZ,
        revised_target_date TIMESTAMPTZ,
        date_delay_identified TIMESTAMPTZ DEFAULT NOW(),
        days_overdue INTEGER DEFAULT 0,
        workflow_stage_at_delay VARCHAR(50) NOT NULL,
        current_department VARCHAR(50),
        reason_category VARCHAR(100),
        detailed_explanation TEXT,
        explanation_status VARCHAR(50) DEFAULT 'REASON_PENDING',
        explanation_provider_id INTEGER,
        explanation_provider_name VARCHAR(255),
        explanation_recorded_at TIMESTAMPTZ,
        corrective_action_required TEXT,
        revised_expected_date TIMESTAMPTZ,
        admin_review_status VARCHAR(50) DEFAULT 'UNREVIEWED',
        admin_review_notes TEXT,
        admin_reviewer_id INTEGER,
        admin_reviewer_name VARCHAR(255),
        reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );
    """,
    "CREATE INDEX IF NOT EXISTS idx_delay_job_id ON job_delay_records(job_id);",
    "CREATE INDEX IF NOT EXISTS idx_delay_status ON job_delay_records(explanation_status);",
    "CREATE INDEX IF NOT EXISTS idx_delay_admin_review ON job_delay_records(admin_review_status);",
    """
    CREATE TABLE IF NOT EXISTS job_assignment_history (
        id SERIAL PRIMARY KEY,
        job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        change_type VARCHAR(50) DEFAULT 'ASSIGNMENT',
        previous_owner_id INTEGER,
        previous_owner_name VARCHAR(255),
        new_owner_id INTEGER NOT NULL,
        new_owner_name VARCHAR(255) NOT NULL,
        assigned_by_id INTEGER NOT NULL,
        assigned_by_name VARCHAR(255) NOT NULL,
        assigned_by_department VARCHAR(100),
        assigned_by_role VARCHAR(50),
        reason_category VARCHAR(100) NOT NULL,
        detailed_explanation TEXT NOT NULL,
        additional_note TEXT,
        workflow_stage VARCHAR(50),
        expected_start_date TIMESTAMPTZ,
        target_completion_date TIMESTAMPTZ,
        priority VARCHAR(50) DEFAULT 'Normal',
        reassignment_sequence INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );
    """,
    "CREATE INDEX IF NOT EXISTS idx_assignment_hist_job_id ON job_assignment_history(job_id);",
    "CREATE INDEX IF NOT EXISTS idx_assignment_hist_created ON job_assignment_history(created_at);",
    """
    CREATE TABLE IF NOT EXISTS job_target_date_revisions (
        id SERIAL PRIMARY KEY,
        job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        previous_target_date TIMESTAMPTZ NOT NULL,
        revised_target_date TIMESTAMPTZ NOT NULL,
        reason_category VARCHAR(100) NOT NULL,
        revision_rationale TEXT NOT NULL,
        authorized_by_id INTEGER NOT NULL,
        authorized_by_name VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );
    """,
    "CREATE INDEX IF NOT EXISTS idx_date_revisions_job_id ON job_target_date_revisions(job_id);"
]

async def run_migration():
    print("Running migration for Admin Dashboard: Delay Records, Assignment History & Date Revisions...")
    async with AsyncSessionLocal() as session:
        for stmt in STATEMENTS:
            clean_stmt = stmt.strip()
            first_line = clean_stmt.splitlines()[0] if clean_stmt else ""
            print(f"Executing: {first_line}...")
            await session.execute(text(stmt))
        await session.commit()
        print("Migration completed successfully!")

if __name__ == "__main__":
    asyncio.run(run_migration())
