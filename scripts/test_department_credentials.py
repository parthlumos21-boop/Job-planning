import urllib.request
import json
import sys

API_BASE = "http://127.0.0.1:8000/api"

CREDENTIALS_TO_TEST = [
    ("admin", "admin123", "admin", ["marketing", "design", "purchase", "mechanical", "production", "dispatch"]),
    ("executive", "exec123", "executive", ["marketing", "design", "purchase", "mechanical", "production", "dispatch"]),
    ("marketing", "mkt123", "user", ["marketing"]),
    ("marketing_user", "mkt123", "user", ["marketing"]),
    ("design", "design123", "user", ["design"]),
    ("design_user", "design123", "user", ["design"]),
    ("mechanical", "mech123", "user", ["mechanical"]),
    ("mech_user", "mech123", "user", ["mechanical"]),
    ("purchase", "purchase123", "user", ["purchase"]),
    ("purchase_user", "purchase123", "user", ["purchase"]),
    ("production", "prod123", "user", ["production"]),
    ("prod_user", "prod123", "user", ["production"]),
    ("qc", "qc123", "user", ["production"]),
    ("dispatch", "dispatch123", "user", ["dispatch"]),
    ("dispatch_user", "dispatch123", "user", ["dispatch"]),
]

def test_login(username, password, expected_role, expected_depts):
    url = f"{API_BASE}/auth/login"
    payload = json.dumps({"username": username, "password": password}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"}
    )
    
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status != 200:
                print(f"FAILED: {username} returned status {response.status}")
                return None
            data = json.loads(response.read().decode("utf-8"))
            user = data.get("user", {})
            token = data.get("token")
            role = user.get("role")
            depts = user.get("departments", [])

            if role != expected_role:
                print(f"FAILED: {username} expected role {expected_role}, got {role}")
                return None
            if not token:
                print(f"FAILED: {username} received no token")
                return None
                
            print(f"PASS: {username:16} | Role: {role:10} | Token issued | Depts: {depts}")
            return token
    except Exception as e:
        print(f"ERROR: {username} -> {e}")
        return None

def test_department_users(token, dept_key):
    url = f"{API_BASE}/departments/{dept_key}/users"
    req = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {token}"}
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode("utf-8"))
            usernames = [u.get("name") for u in data]
            print(f"  -> Department '{dept_key}' users count: {len(usernames)}")
            print(f"     Sample users: {usernames[:6]}")
    except Exception as e:
        print(f"  -> Error fetching users for {dept_key}: {e}")

def main():
    print("=== Testing Department Credentials Authentication ===")
    admin_token = None
    all_passed = True

    for uname, pw, role, depts in CREDENTIALS_TO_TEST:
        tok = test_login(uname, pw, role, depts)
        if tok is None:
            all_passed = False
        if uname == "admin" and tok:
            admin_token = tok

    if admin_token:
        print("\n=== Testing Department User Endpoint with Admin Token ===")
        for d in ["marketing", "design", "purchase", "mechanical", "production", "dispatch"]:
            test_department_users(admin_token, d)

    if all_passed:
        print("\nALL CREDENTIALS VERIFIED AND WORKING SUCCESSFULLY!")
        sys.exit(0)
    else:
        print("\nSOME CREDENTIALS FAILED VERIFICATION.")
        sys.exit(1)

if __name__ == "__main__":
    main()
