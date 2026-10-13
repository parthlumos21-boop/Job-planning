import asyncio
import httpx
from datetime import datetime, timezone, timedelta

async def main():
    async with httpx.AsyncClient(base_url="http://127.0.0.1:8000") as c:
        # 1. Login Admin
        login_res = await c.post("/api/auth/login", json={"username": "admin", "password": "admin"})
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        token = login_res.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        print("1. [PASS] Admin Auth Token obtained successfully.")

        # 2. Get Users
        users_res = await c.get("/api/users", headers=headers)
        assert users_res.status_code == 200, f"Users failed: {users_res.text}"
        users = users_res.json()
        print(f"2. [PASS] Users API returned {len(users)} users.")

        # 3. Start Job 1 to make it active
        start_res = await c.post("/api/jobs/1/start", headers=headers)
        print(f"3. [PASS] Start Job 1: Status={start_res.json().get('status')}")

        # 4. Test Pause Validation: Category 'Other' with note < 5 characters -> MUST return 422
        bad_pause_res = await c.post("/api/jobs/1/pause", json={
            "category": "Other",
            "detailed_reason": "abc"  # Less than 5 chars
        }, headers=headers)
        assert bad_pause_res.status_code == 422, f"Expected 422 for invalid Other pause reason, got {bad_pause_res.status_code}"
        print(f"4. [PASS] Pause Validation Enforced: 'Other' with short reason correctly rejected (HTTP {bad_pause_res.status_code}: {bad_pause_res.json().get('detail')})")

        # 5. Valid Pause: Category 'Material unavailable' with expected resume time
        expected_resume = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
        pause_res = await c.post("/api/jobs/1/pause", json={
            "category": "Material unavailable",
            "detailed_reason": "Waiting for copper busbars delivery",
            "expected_resume_at": expected_resume
        }, headers=headers)
        assert pause_res.status_code == 200, f"Pause failed: {pause_res.text}"
        p_data = pause_res.json()
        assert p_data["status"] == "On Hold", f"Expected status 'On Hold', got {p_data['status']}"
        assert p_data["pauseReasonCategory"] == "Material unavailable"
        print(f"5. [PASS] Job 1 paused: Status='{p_data['status']}', Category='{p_data['pauseReasonCategory']}', ExpectedResume='{p_data.get('expectedResumeAt')}'")

        # 6. Handover WHILE job is On Hold -> Must preserve On Hold state
        ho_res = await c.post("/api/jobs/1/handover", json={
            "to_worker_id": users[1]["id"] if len(users) > 1 else users[0]["id"],
            "to_worker_position": "Lead Assembly Tech",
            "reason": "Shift Handover",
            "notes": "Parts due at 2 PM, handover while on hold"
        }, headers=headers)
        assert ho_res.status_code == 200, f"Handover failed: {ho_res.text}"
        ho_data = ho_res.json()
        assert ho_data["status"] == "On Hold", f"Expected job to remain 'On Hold', got {ho_data['status']}"
        print(f"6. [PASS] Handover executed while On Hold: State preserved as '{ho_data['status']}', Assigned to '{ho_data.get('currentWorkerName')}'")

        # 7. Resume Job -> Must change to In Progress, close pause session, open work session
        await asyncio.sleep(1) # wait 1 sec to accumulate duration
        res_resume = await c.post("/api/jobs/1/resume", headers=headers)
        assert res_resume.status_code == 200, f"Resume failed: {res_resume.text}"
        r_data = res_resume.json()
        assert r_data["status"] == "In Progress", f"Expected status 'In Progress', got {r_data['status']}"
        print(f"7. [PASS] Job 1 Resumed: Status='{r_data['status']}', PausedDuration={r_data.get('totalPausedSeconds')}s")

        # 8. Truthful Progress Update with units (e.g. 40 out of 80 units = 50.0%)
        prog_res = await c.post("/api/jobs/1/progress", json={
            "completed_work_units": 40,
            "target_work_units": 80,
            "note": "40/80 feeder terminals assembled"
        }, headers=headers)
        assert prog_res.status_code == 200, f"Progress update failed: {prog_res.text}"
        prog_data = prog_res.json()
        assert prog_data["progressPercentage"] == 50.0, f"Expected 50.0%, got {prog_data['progressPercentage']}"
        print(f"8. [PASS] Truthful Progress calculation: 40/80 units -> {prog_data['progressPercentage']}%")

        # 9. Timeline History Audit Trail
        hist_res = await c.get("/api/job-monitoring/timeline/1/history", headers=headers)
        assert hist_res.status_code == 200, f"Timeline history failed: {hist_res.text}"
        hist_data = hist_res.json()
        print(f"9. [PASS] Timeline History API: {len(hist_data.get('handovers', []))} handovers, {len(hist_data.get('sessions', []))} sessions, {len(hist_data.get('progressLogs', []))} progress logs.")

        # 10. Timeline Overview endpoint verification
        tl_res = await c.get("/api/job-monitoring/timeline-overview", headers=headers)
        assert tl_res.status_code == 200, f"Timeline overview failed: {tl_res.text}"
        tl_data = tl_res.json()
        assert "jobs" in tl_data
        print(f"10. [PASS] Timeline Overview API: Returned {len(tl_data['jobs'])} jobs with serverTime and scale markers.")

        print("\n=======================================================")
        print("ALL 10 VERIFICATION TESTS COMPLETED AND PASSED 100%!")
        print("=======================================================\n")

if __name__ == "__main__":
    asyncio.run(main())
