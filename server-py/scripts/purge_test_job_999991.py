import asyncio
from sqlalchemy import text
from app.db.session import AsyncSessionLocal

async def purge_job_999991():
    async with AsyncSessionLocal() as session:
        print("Starting purge of test job 999991 (ID: 13)...")
        res = await session.execute(text("SELECT id, external_id, job_no FROM jobs WHERE external_id = 999991 OR id = 999991"))
        matching = res.fetchall()
        print(f"Found matching jobs: {matching}")

        job_ids = [row[0] for row in matching] + [999991, 13]
        job_ids_str = ",".join(str(j) for j in set(job_ids))

        # Check which tables exist in public schema
        t_res = await session.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"))
        existing_tables = set(r[0] for r in t_res.fetchall())

        tables_to_clean = [
            "department_tasks",
            "job_handovers",
            "job_delay_records",
            "job_assignment_history",
            "job_target_date_revisions",
            "marketing_tasks",
            "department_activities",
            "department_assignments",
            "job_execution_sessions",
            "job_progress_history",
            "job_documents"
        ]

        for tbl in tables_to_clean:
            if tbl in existing_tables:
                try:
                    del_stmt = f"DELETE FROM {tbl} WHERE job_id IN ({job_ids_str})"
                    del_res = await session.execute(text(del_stmt))
                    print(f"Cleaned {del_res.rowcount} rows from {tbl}")
                except Exception as e:
                    print(f"Error on {tbl}: {e}")

        del_jobs = await session.execute(text(f"DELETE FROM jobs WHERE id IN ({job_ids_str}) OR external_id IN ({job_ids_str})"))
        print(f"Deleted {del_jobs.rowcount} row(s) from jobs table.")

        await session.commit()
        print("Purge committed successfully.")

if __name__ == "__main__":
    asyncio.run(purge_job_999991())
