import urllib.request
import json

BASE_URL = 'http://127.0.0.1:8000'

def test_flow():
    # 1. Login as swatisales
    login_url = f"{BASE_URL}/api/auth/login"
    login_data = json.dumps({"username": "swatisales", "password": "password123"}).encode('utf-8')
    req = urllib.request.Request(login_url, data=login_data, headers={'Content-Type': 'application/json'})
    
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        token = data.get('token') or data.get('access_token')
        print("Logged in as swatisales successfully! Token:", token[:20], "...")

    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {token}'
    }

    # 2. Test GET /api/jobs/incoming/count (previously crashed with 500 UndefinedColumnError: current_workflow_status)
    count_req = urllib.request.Request(f"{BASE_URL}/api/jobs/incoming/count", headers=headers)
    with urllib.request.urlopen(count_req) as resp:
        count_data = json.loads(resp.read().decode('utf-8'))
        print("GET /api/jobs/incoming/count status:", resp.status, "Response:", count_data)

    # 3. Test POST /api/jobs (create test job)
    new_job_payload = {
        "jobNo": "TEST-AUTO-9999",
        "clientName": "Test Client Pvt Ltd",
        "projectName": "Automated Migration Test Project",
        "panelName": "Main Control Panel",
        "qty": "2",
        "responsibleEnggName": "swatisales",
        "targetDepartment": "design",
        "deliveryDate": "2026-12-31"
    }
    create_req = urllib.request.Request(
        f"{BASE_URL}/api/jobs",
        data=json.dumps(new_job_payload).encode('utf-8'),
        headers=headers,
        method='POST'
    )
    with urllib.request.urlopen(create_req) as resp:
        created_data = json.loads(resp.read().decode('utf-8'))
        print("POST /api/jobs status:", resp.status)
        job_info = created_data.get('job') or created_data
        print("Created job ID:", job_info.get('id'), "Job No:", job_info.get('jobNo'))

    print("\nSUCCESS! Both incoming/count and job creation executed cleanly without errors!")

if __name__ == '__main__':
    test_flow()
