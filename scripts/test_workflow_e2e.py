import sys
import os
import asyncio
from datetime import datetime

# Add server-py to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "server-py")))

from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db.session import AsyncSessionLocal
from app.models import Job, DepartmentTask, JobHandover
from sqlalchemy import select

async def run_e2e_tests():
    # Setup test job directly in DB first
    async with AsyncSessionLocal() as db:
        res_job = await db.execute(select(Job).filter(Job.job_no == "JOB-E2E-TEST"))
        test_job = res_job.scalars().first()
        if not test_job:
            test_job = Job(
                external_id=999988,
                job_no="JOB-E2E-TEST",
                panel_name="400A Main LT Panel",
                client_name="Titan Power Ltd",
                project_name="Grid Sync Panel",
                current_department="marketing",
                current_workflow_status="In Progress",
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            db.add(test_job)
            await db.commit()
            await db.refresh(test_job)
        else:
            test_job.current_department = "marketing"
            test_job.current_workflow_status = "In Progress"
            await db.commit()
            await db.refresh(test_job)
        
        job_id = test_job.id
        from sqlalchemy import delete
        await db.execute(delete(JobHandover).where(JobHandover.job_id.in_([job_id, 999988])))
        await db.execute(delete(DepartmentTask).where(DepartmentTask.job_id == job_id))
        await db.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        print("\n=== STEP 1: Login as swatisales (Marketing) ===")
        res = await client.post("/api/auth/login", json={"username": "swatisales", "password": "swatisales"})
        assert res.status_code == 200, f"Login failed: {res.text}"
        mkt_token = res.json()["token"]
        mkt_headers = {"Authorization": f"Bearer {mkt_token}"}
        print("swatisales logged in successfully.")

        print("\n=== STEP 2: Fetch Workflow State as Marketing ===")
        res = await client.get(f"/api/jobs/{job_id}/workflow-state", headers=mkt_headers)
        assert res.status_code == 200, f"Failed state fetch: {res.text}"
        data = res.json()
        print(f"Current Department: {data['jobInfo']['currentDepartment']}")
        print(f"Workflow Status: {data['ownership']['currentStatus']}")
        print(f"Primary Action: {data['primaryAction']}")

        print("\n=== STEP 3: Submit Handover from Marketing to Design- Electrical ===")
        handover_payload = {
            "targetDepartment": "Design- Electrical",
            "responsibleEngineer": "swatidesign",
            "handoverNote": "Complete specifications attached for electrical layout & SLD.",
            "readinessConfirmed": True
        }
        res = await client.post(f"/api/jobs/{job_id}/workflow/handover", json=handover_payload, headers=mkt_headers)
        assert res.status_code == 200, f"Handover failed: {res.text}"
        print("Handover response:", res.json())

        print("\n=== STEP 4: Login as swatidesign (Design- Electrical) ===")
        res = await client.post("/api/auth/login", json={"username": "swatidesign", "password": "swatidesign"})
        assert res.status_code == 200, f"Design login failed: {res.text}"
        design_token = res.json()["token"]
        design_headers = {"Authorization": f"Bearer {design_token}"}
        print("swatidesign logged in successfully.")

        print("\n=== STEP 5: Design Views Job Workflow State ===")
        res = await client.get(f"/api/jobs/{job_id}/workflow-state", headers=design_headers)
        assert res.status_code == 200
        state = res.json()
        print(f"Dept: {state['jobInfo']['currentDepartment']}, Status: {state['ownership']['currentStatus']}")
        print(f"Primary Action: {state['primaryAction']}")
        assert state["primaryAction"]["canAccept"] is True, "Design should be able to accept the job!"

        print("\n=== STEP 6: Design Accepts Job (Triggers Auto-Task Creation) ===")
        res = await client.post(f"/api/jobs/{job_id}/workflow/accept", json={"notes": "Job accepted. Starting schematic design."}, headers=design_headers)
        assert res.status_code == 200, f"Accept failed: {res.text}"
        print("Accept response:", res.json())

        print("\n=== STEP 7: Check Auto-Created Task in Design's My Tasks ===")
        res = await client.get("/api/jobs/department-tasks/my-tasks", headers=design_headers)
        assert res.status_code == 200
        my_tasks = res.json()
        print(f"Total tasks for swatidesign: {my_tasks['total']}")
        found_task = next((t for t in my_tasks["tasks"] if t["jobId"] == job_id), None)
        assert found_task is not None, "Auto-created task not found in My Tasks!"
        print(f"Found auto-created task: [{found_task['status']}] {found_task['taskName']} (Effort: {found_task['estimatedEffort']}h)")

        print("\n=== STEP 8: Update Progress on My Task ===")
        task_id = found_task["id"]
        res = await client.patch(f"/api/jobs/{job_id}/workflow/my-task", json={
            "taskId": task_id,
            "progress": 75,
            "actualEffort": 3.5,
            "completionRemarks": "Single-line diagram completed. Bill of materials 75% prepared."
        }, headers=design_headers)
        assert res.status_code == 200
        print("Task update response:", res.json())

        print("\n=== STEP 9: Complete Task & Prepare for Next Handover (to Mechanical) ===")
        res = await client.patch(f"/api/jobs/{job_id}/workflow/my-task", json={
            "taskId": task_id,
            "progress": 100,
            "status": "Completed",
            "completionRemarks": "Electrical drawings finished and verified."
        }, headers=design_headers)
        assert res.status_code == 200
        print("Task completed response:", res.json())

        print("\n=== STEP 10: Electrical Hands Over to Design- Mechanical ===")
        ho_mech_payload = {
            "targetDepartment": "Design- Mechanical",
            "responsibleEngineer": "mechdesign1",
            "handoverNote": "Electrical GA drawing ready. Proceed with GA fabrication layout.",
            "readinessConfirmed": True
        }
        res = await client.post(f"/api/jobs/{job_id}/workflow/handover", json=ho_mech_payload, headers=design_headers)
        assert res.status_code == 200
        print("Handover to Mechanical response:", res.json())

        print("\n=== STEP 11: Login as mechdesign1 & Verify Handover Receipt ===")
        res = await client.post("/api/auth/login", json={"username": "mechdesign1", "password": "mechdesign1"})
        assert res.status_code == 200
        mech_token = res.json()["token"]
        mech_headers = {"Authorization": f"Bearer {mech_token}"}
        
        res = await client.get(f"/api/jobs/{job_id}/workflow-state", headers=mech_headers)
        assert res.status_code == 200
        mech_state = res.json()
        print(f"Mechanical state -> Dept: {mech_state['jobInfo']['currentDepartment']}, Status: {mech_state['ownership']['currentStatus']}")
        assert "mechanical" in mech_state['jobInfo']['currentDepartment'].lower()
        assert mech_state['ownership']['currentStatus'] == "Pending Acceptance"
        assert mech_state["primaryAction"]["canAccept"] is True

        print("\n=== STEP 12: Mechanical Returns Job to Electrical for Clarification ===")
        res = await client.post(f"/api/jobs/{job_id}/workflow/return", json={
            "reasonCategory": "Mechanical / Busbar Clearance",
            "remarks": "Incomer busbar clearance needs 50mm extra depth in cubicle 2."
        }, headers=mech_headers)
        assert res.status_code == 200
        print("Return response:", res.json())

        # Verify job is back in Electrical with 'Needs Clarification'
        res = await client.get(f"/api/jobs/{job_id}/workflow-state", headers=design_headers)
        assert res.status_code == 200
        ret_state = res.json()
        print(f"Returned state for Electrical -> Dept: {ret_state['jobInfo']['currentDepartment']}, Status: {ret_state['ownership']['currentStatus']}")
        assert "design" in ret_state['jobInfo']['currentDepartment'].lower()
        assert ret_state['ownership']['currentStatus'] == "Needs Clarification"

        print("\n" + "="*70)
        print(">>> ALL 12 INTEGRATION TEST STEPS PASSED 100% WITH ZERO ERRORS! <<<")
        print("="*70)

if __name__ == "__main__":
    asyncio.run(run_e2e_tests())
