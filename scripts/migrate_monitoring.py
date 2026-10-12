import psycopg2
import sys

DB_CONFIG = {
    "dbname": "job_planning_db",
    "user": "postgres",
    "password": "root",
    "host": "localhost",
    "port": 5432
}

def migrate():
    print("Connecting to PostgreSQL to apply non-destructive monitoring schema additions...")
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()

        # 1. Add scheduling columns to jobs
        print("1. Updating 'jobs' table with scheduling & execution columns...")
        cur.execute("""
            ALTER TABLE jobs ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(50) DEFAULT 'Draft';
            ALTER TABLE jobs ADD COLUMN IF NOT EXISTS planned_start_at TIMESTAMP WITH TIME ZONE;
            ALTER TABLE jobs ADD COLUMN IF NOT EXISTS planned_end_at TIMESTAMP WITH TIME ZONE;
            ALTER TABLE jobs ADD COLUMN IF NOT EXISTS estimated_duration_seconds INTEGER DEFAULT 0;
            ALTER TABLE jobs ADD COLUMN IF NOT EXISTS actual_start_at TIMESTAMP WITH TIME ZONE;
            ALTER TABLE jobs ADD COLUMN IF NOT EXISTS actual_end_at TIMESTAMP WITH TIME ZONE;
            ALTER TABLE jobs ADD COLUMN IF NOT EXISTS total_paused_seconds INTEGER DEFAULT 0;
            ALTER TABLE jobs ADD COLUMN IF NOT EXISTS pause_started_at TIMESTAMP WITH TIME ZONE;
            ALTER TABLE jobs ADD COLUMN IF NOT EXISTS actual_duration_seconds INTEGER DEFAULT 0;
            ALTER TABLE jobs ADD COLUMN IF NOT EXISTS progress_percentage NUMERIC(5,2) DEFAULT 0.00;
            ALTER TABLE jobs ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'Normal';
            ALTER TABLE jobs ADD COLUMN IF NOT EXISTS assigned_engineer_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
        """)

        # Indexes
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_jobs_lifecycle_status ON jobs (lifecycle_status);
            CREATE INDEX IF NOT EXISTS idx_jobs_planned_dates ON jobs (planned_start_at, planned_end_at);
            CREATE INDEX IF NOT EXISTS idx_jobs_assigned_engineer ON jobs (assigned_engineer_id);
        """)

        # 2. Execution Sessions table
        print("2. Creating 'job_execution_sessions' table...")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS job_execution_sessions (
                id SERIAL PRIMARY KEY,
                job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
                session_type VARCHAR(20) NOT NULL, -- 'WORK' or 'PAUSE'
                started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                ended_at TIMESTAMP WITH TIME ZONE,
                duration_seconds INTEGER DEFAULT 0,
                performed_by VARCHAR(100) NOT NULL,
                pause_reason VARCHAR(255),
                notes TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_execution_sessions_job ON job_execution_sessions (job_id, started_at);
        """)

        # 3. Progress History table
        print("3. Creating 'job_progress_history' table...")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS job_progress_history (
                id SERIAL PRIMARY KEY,
                job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
                recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                progress_percentage NUMERIC(5,2) NOT NULL,
                active_duration_seconds INTEGER NOT NULL,
                recorded_by VARCHAR(100) NOT NULL,
                note VARCHAR(255)
            );
            CREATE INDEX IF NOT EXISTS idx_progress_history_job ON job_progress_history (job_id, recorded_at);
        """)

        conn.commit()
        print("MIGRATION COMPLETED SUCCESSFULLY!")

        # Verify columns
        cur.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'jobs' AND column_name IN (
                'lifecycle_status', 'planned_start_at', 'actual_start_at', 'total_paused_seconds'
            );
        """)
        cols = cur.fetchall()
        print("Verified added columns in jobs table:", cols)

        cur.close()
        conn.close()

    except Exception as e:
        print("Migration failed:", e)
        sys.exit(1)

if __name__ == "__main__":
    migrate()
