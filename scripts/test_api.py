import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "server-py")))

# pyrefly: ignore [missing-import]
from httpx import AsyncClient, ASGITransport
# pyrefly: ignore [missing-import]
from app.main import app

async def run_tests():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Health check
        res = await client.get("/api/health")
        print("1. Health Check:", res.status_code, res.json())
        assert res.status_code == 200

        # 2. Login
        res = await client.post("/api/auth/login", json={"username": "kevalvshah", "password": "kevalvshah"})
        print("2. Login (kevalvshah):", res.status_code)
        assert res.status_code == 200
        token = res.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 3. Departments
        res = await client.get("/api/departments", headers=headers)
        print("3. Departments count:", len(res.json()))
        assert res.status_code == 200

        # 4. Users
        res = await client.get("/api/users", headers=headers)
        print("4. Users count:", len(res.json()))
        assert res.status_code == 200

        # 5. Clients
        res = await client.get("/api/clients", headers=headers)
        print("5. Clients count:", len(res.json()))
        assert res.status_code == 200

        # 6. Jobs
        res = await client.get("/api/jobs", headers=headers)
        print("6. Jobs response:", res.status_code, "Count:", res.json().get("count"))
        assert res.status_code == 200

        # 7. Job Stats
        res = await client.get("/api/jobs/stats", headers=headers)
        print("7. Job Stats:", res.status_code, res.json())
        assert res.status_code == 200

        # 8. Export Master
        res = await client.get("/api/export", headers=headers)
        print("8. Export Excel bytes:", len(res.content), "Status:", res.status_code)
        assert res.status_code == 200

        # 9. Export /xlsx with department=marketing (fixes reported 404 bug)
        res = await client.get("/api/export/xlsx?department=marketing", headers=headers)
        print("9. Export /xlsx (marketing) bytes:", len(res.content), "Status:", res.status_code)
        assert res.status_code == 200

        # 10. Export /xlsx for other departments and with ids filter
        for dept in ["design", "mechanical", "purchase", "production", "dispatch"]:
            res = await client.get(f"/api/export/xlsx?department={dept}", headers=headers)
            print(f"10. Export /xlsx ({dept}) Status:", res.status_code, "Bytes:", len(res.content))
            assert res.status_code == 200

        res = await client.get("/api/export/xlsx?ids=1", headers=headers)
        print("11. Export /xlsx with ids=1 Status:", res.status_code, "Bytes:", len(res.content))
        assert res.status_code == 200

        # 12. Execution Lifecycle Tests (Start, Pause, Resume, Complete)
        res = await client.post("/api/jobs/1/start", headers=headers)
        print("12. Job 1 Start:", res.status_code, res.json().get("status"))
        assert res.status_code == 200

        res = await client.post("/api/jobs/1/pause", json={"reason": "Material Shortage"}, headers=headers)
        print("13. Job 1 Pause:", res.status_code, res.json().get("status"))
        assert res.status_code == 200

        res = await client.post("/api/jobs/1/resume", json={}, headers=headers)
        print("14. Job 1 Resume:", res.status_code, res.json().get("status"))
        assert res.status_code == 200

        res = await client.post("/api/jobs/1/complete", json={"notes": "Finished quality test"}, headers=headers)
        print("15. Job 1 Complete:", res.status_code, res.json().get("status"))
        assert res.status_code == 200

        res = await client.get("/api/jobs/1/sessions", headers=headers)
        print("16. Job 1 Sessions Count:", len(res.json()))
        assert res.status_code == 200

        # 17. Live Monitoring Running Jobs (Admin Only)
        res = await client.get("/api/job-monitoring/running", headers=headers)
        print("17. Job Monitoring Running Jobs Count:", res.json().get("count"), "Status:", res.status_code)
        assert res.status_code == 200

        # 18. Live Analytics (KPIs, Planned vs Actual, Workload, Timeline)
        res = await client.get("/api/job-analytics/kpis", headers=headers)
        print("18. Analytics KPIs:", res.status_code, res.json().get("totalJobs"))
        assert res.status_code == 200

        res = await client.get("/api/job-analytics/planned-vs-actual", headers=headers)
        print("19. Analytics Planned vs Actual Count:", len(res.json()))
        assert res.status_code == 200

        res = await client.get("/api/job-analytics/workload", headers=headers)
        print("20. Analytics Workload Count:", len(res.json()))
        assert res.status_code == 200

        res = await client.get("/api/job-analytics/timeline", headers=headers)
        print("21. Analytics Timeline Count:", len(res.json()))
        assert res.status_code == 200

        # 22. Security Gate Test: Verify non-admin receives 403 Forbidden
        res_login_user = await client.post("/api/auth/login", json={"username": "swatipurchase", "password": "swatipurchase"})
        assert res_login_user.status_code == 200
        user_headers = {"Authorization": f"Bearer {res_login_user.json()['token']}"}

        res_forbidden = await client.get("/api/job-monitoring/running", headers=user_headers)
        print("22. Non-admin forbidden test (job-monitoring):", res_forbidden.status_code)
        assert res_forbidden.status_code == 403

        res_forbidden_analytics = await client.get("/api/job-analytics/kpis", headers=user_headers)
        print("23. Non-admin forbidden test (job-analytics):", res_forbidden_analytics.status_code)
        assert res_forbidden_analytics.status_code == 403

    print("ALL API ENDPOINT TESTS PASSED SUCCESSFULLY!")


if __name__ == "__main__":
    asyncio.run(run_tests())

