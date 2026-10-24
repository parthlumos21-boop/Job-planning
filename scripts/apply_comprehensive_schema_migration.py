import asyncio
import os
import sys
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

load_dotenv('server-py/.env')
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql+asyncpg://postgres:root@localhost:5432/job_planning_db')

MIGRATION_STATEMENTS = [
    # 1. Jobs table missing columns
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS handover_status VARCHAR(50) DEFAULT 'Draft';",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS planning_owner_id INTEGER;",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS planning_owner_name VARCHAR(255);",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS handover_submitted_at TIMESTAMPTZ;",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS handover_accepted_at TIMESTAMPTZ;",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS handover_return_reason TEXT;",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS previous_responsible_engg_name VARCHAR(255) DEFAULT '';",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS return_reason VARCHAR(100);",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS return_comment TEXT;",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS returned_by VARCHAR(100);",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ;",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS reassignment_history JSONB DEFAULT '[]'::jsonb;",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS handover_checklist JSONB DEFAULT '{}'::jsonb;",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS current_stage VARCHAR(50) DEFAULT 'INCOMING';",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS current_action VARCHAR(255) DEFAULT 'Review Incoming Job';",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS current_waiting_reason TEXT;",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS stage_started_at TIMESTAMPTZ DEFAULT NOW();",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS stage_due_date TIMESTAMPTZ;",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS assignment_reason_category VARCHAR(100);",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS assignment_explanation TEXT;",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS forwarding_reason_category VARCHAR(100);",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS forwarding_note TEXT;",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS stage_durations JSONB DEFAULT '{}'::jsonb;",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS current_department VARCHAR(50) DEFAULT 'marketing';",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS assigned_user_id INTEGER;",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS assigned_user_name VARCHAR(255) DEFAULT '';",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS current_workflow_status VARCHAR(50) DEFAULT 'In Progress';",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS expected_date DATE;",

    # Indexes on jobs table
    "CREATE INDEX IF NOT EXISTS idx_jobs_handover_status ON jobs(handover_status);",
    "CREATE INDEX IF NOT EXISTS idx_jobs_planning_owner ON jobs(planning_owner_id);",
    "CREATE INDEX IF NOT EXISTS idx_jobs_current_stage ON jobs(current_stage);",
    "CREATE INDEX IF NOT EXISTS idx_jobs_current_dept ON jobs(current_department);",
    "CREATE INDEX IF NOT EXISTS idx_jobs_current_workflow_status ON jobs(current_workflow_status);",

    # 2. Job Handovers table missing columns
    "ALTER TABLE job_handovers ADD COLUMN IF NOT EXISTS handover_type VARCHAR(50) DEFAULT 'SHIFT';",
    "ALTER TABLE job_handovers ADD COLUMN IF NOT EXISTS from_department VARCHAR(100);",
    "ALTER TABLE job_handovers ADD COLUMN IF NOT EXISTS to_department VARCHAR(100);",
    "ALTER TABLE job_handovers ADD COLUMN IF NOT EXISTS checklist_snapshot JSONB;",
    "ALTER TABLE job_handovers ADD COLUMN IF NOT EXISTS previous_responsible_engg_name VARCHAR(255) DEFAULT '';",
    "ALTER TABLE job_handovers ADD COLUMN IF NOT EXISTS reassignment_reason VARCHAR(255);",
    "ALTER TABLE job_handovers ADD COLUMN IF NOT EXISTS target_assigned_user_id INTEGER;",
    "ALTER TABLE job_handovers ADD COLUMN IF NOT EXISTS target_assigned_user_name VARCHAR(255) DEFAULT '';",
    "ALTER TABLE job_handovers ADD COLUMN IF NOT EXISTS responsible_engg_name VARCHAR(255) DEFAULT '';",
    "ALTER TABLE job_handovers ADD COLUMN IF NOT EXISTS is_current_pending BOOLEAN DEFAULT FALSE;",

    # Indexes on job_handovers
    "CREATE INDEX IF NOT EXISTS idx_job_handovers_type ON job_handovers(handover_type);",
    "CREATE INDEX IF NOT EXISTS idx_job_handovers_to_dept ON job_handovers(to_department);",
    "CREATE INDEX IF NOT EXISTS idx_job_handovers_pending ON job_handovers(is_current_pending);",

    # 3. Create missing admin oversight tables if not existing
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

async def apply_migrations():
    print(f"Connecting to database: {DATABASE_URL}...")
    engine = create_async_engine(DATABASE_URL)
    async with engine.begin() as conn:
        for idx, statement in enumerate(MIGRATION_STATEMENTS, 1):
            short_stmt = " ".join(statement.strip().split())[:70]
            print(f"[{idx}/{len(MIGRATION_STATEMENTS)}] Executing: {short_stmt}...")
            await conn.execute(text(statement))
    
    print("\nAll database schema migrations applied successfully!")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(apply_migrations())
