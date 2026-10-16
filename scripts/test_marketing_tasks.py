import asyncio
import os
import sys
from datetime import date, timedelta

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "server-py")))

from httpx import AsyncClient, ASGITransport
from app.main import app

async def run_tests():
    print("=" * 60)
    print("RUNNING MARKETING TASKS & READINESS INTEGRATION TESTS")
    print("=" * 60)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Login as kevalvshah (admin / marketing lead)
        login_res = await client.post("/api/auth/login", json={"username": "kevalvshah", "password": "kevalvshah"})
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        token = login_res.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        print("[PASS] Logged in successfully")

        # 2. Get a job to link task to
        jobs_res = await client.get("/api/jobs", headers=headers)
        assert jobs_res.status_code == 200
        jobs = jobs_res.json().get("jobs", [])
        assert len(jobs) > 0, "No jobs available for testing"
        target_job = jobs[0]
        job_id = target_job["id"]
        print(f"[PASS] Using Job ID {job_id} (#{target_job.get('jobNo')}) for task testing")

        today = date.today()
        tomorrow = today + timedelta(days=1)
        yesterday = today - timedelta(days=1)

        # 3. Test Date Validation: Target Date < Start Date should fail with 422
        invalid_task_payload = {
            "job_id": job_id,
            "title": "Invalid Date Task",
            "start_date": tomorrow.isoformat(),
            "target_date": today.isoformat(), # Earlier than start
            "estimated_effort": 2.5,
            "effort_unit": "hours",
            "priority": "High"
        }
        res_invalid = await client.post("/api/marketing/tasks", json=invalid_task_payload, headers=headers)
        print(f"[PASS] Invalid date range rejected with HTTP {res_invalid.status_code}")
        assert res_invalid.status_code == 422, f"Expected 422, got {res_invalid.status_code}"

        # 4. Create a valid task linked to job
        valid_task_payload = {
            "job_id": job_id,
            "title": f"Collect Customer SLD Spec {today.isoformat()}",
            "description": "Obtain single line diagram from customer engineering lead",
            "start_date": today.isoformat(),
            "target_date": today.isoformat(),
            "estimated_effort": 3.5,
            "effort_unit": "hours",
            "priority": "High",
            "is_mandatory_for_readiness": True,
            "readiness_criterion_key": "design_input"
        }
        res_create = await client.post("/api/marketing/tasks", json=valid_task_payload, headers=headers)
        print(f"[PASS] Task creation response: HTTP {res_create.status_code}")
        assert res_create.status_code == 201, f"Create task failed: {res_create.text}"
        created_task = res_create.json()["task"]
        task_id = created_task["id"]
        assert created_task["is_due_today"] is True
        assert created_task["is_overdue"] is False
        assert created_task["estimated_effort"] == 3.5
        assert created_task["actual_effort"] == 0.0
        print(f"[PASS] Task #{task_id} created with due_today=True, overdue=False, est=3.5h, act=0.0h")

        # 5. List tasks with scope=my and filter by job_id
        res_list = await client.get(f"/api/marketing/tasks?job_id={job_id}&scope=my", headers=headers)
        assert res_list.status_code == 200
        data = res_list.json()
        assert data["count"] > 0
        print(f"[PASS] Listed {data['count']} task(s) for job {job_id}. Summary: {data['summary']}")

        # 6. Test Handover Blocking Gate:
        # Since task is mandatory and Open, handover submission must be rejected with 422!
        handover_payload = {
            "target_department": "planning",
            "from_department": "marketing",
            "notes": "Testing handover with open mandatory task"
        }
        res_handover_blocked = await client.post(f"/api/jobs/{job_id}/handover/submit", json=handover_payload, headers=headers)
        print(f"[PASS] Handover submission with incomplete mandatory task: HTTP {res_handover_blocked.status_code}")
        assert res_handover_blocked.status_code == 422, f"Expected 422 blocking handover, got {res_handover_blocked.status_code}"
        print(f"  Error message: {res_handover_blocked.json().get('detail')}")

        # 7. Update Task: Log actual effort & complete task
        update_payload = {
            "status": "Completed",
            "actual_effort": 4.0,
            "completion_remarks": "Customer verified and confirmed all SLD details."
        }
        res_update = await client.patch(f"/api/marketing/tasks/{task_id}", json=update_payload, headers=headers)
        assert res_update.status_code == 200
        updated = res_update.json()["task"]
        assert updated["status"] == "Completed"
        assert updated["actual_effort"] == 4.0
        assert updated["estimated_effort"] == 3.5 # Preserved independently
        print("[PASS] Completed task with actual_effort=4.0h. Estimated effort remains 3.5h independently.")

        # 8. Test Marketing Dashboard Task Summary
        res_dash = await client.get("/api/jobs/marketing-dashboard?scope=my", headers=headers)
        assert res_dash.status_code == 200
        dash_data = res_dash.json()
        assert "taskSummary" in dash_data
        print(f"[PASS] Marketing Dashboard Task Summary: {dash_data['taskSummary']}")

        # 9. Clean up test task
        del_res = await client.delete(f"/api/marketing/tasks/{task_id}", headers=headers)
        assert del_res.status_code == 200
        print(f"[PASS] Deleted test task #{task_id}")

        print("\nALL BACKEND API & INTEGRATION TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(run_tests())
