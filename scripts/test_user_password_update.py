import urllib.request
import json
import sys

API_BASE = "http://127.0.0.1:8000/api"

def login(username, password):
    url = f"{API_BASE}/auth/login"
    payload = json.dumps({"username": username, "password": password}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))

def update_user(token, user_id, name, departments, role, new_password):
    url = f"{API_BASE}/users/{user_id}"
    payload = json.dumps({
        "name": name,
        "departments": departments,
        "role": role,
        "password": new_password
    }).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        method="PUT"
    )
    with urllib.request.urlopen(req, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))

def main():
    print("1. Logging in as admin...")
    admin_auth = login("admin", "admin123")
    token = admin_auth["token"]
    print("   Admin logged in successfully.")

    # Find marketing user ID
    url = f"{API_BASE}/users"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=5) as resp:
        users = json.loads(resp.read().decode("utf-8"))

    mkt_user = next((u for u in users if u.get("username") == "marketing_user" or u.get("name") == "Marketing Engineer"), None)
    if not mkt_user:
        print("Marketing user not found!")
        sys.exit(1)

    user_id = mkt_user["id"]
    print(f"2. Found target user ID={user_id}, Name='{mkt_user.get('name')}', Username='{mkt_user.get('username')}'")

    test_new_pw = "newmktpass456"
    print(f"3. Updating password to '{test_new_pw}' via PUT /api/users/{user_id}...")
    update_res = update_user(
        token,
        user_id,
        mkt_user.get("name"),
        mkt_user.get("departments", ["marketing"]),
        mkt_user.get("role", "user"),
        test_new_pw
    )
    print("   Update Response:", update_res.get("message"))

    print("4. Testing login on /api/auth/login with the new password...")
    try:
        new_auth = login(mkt_user.get("username"), test_new_pw)
        print("   LOGIN SUCCESSFUL with new password! Token:", new_auth["token"][:20] + "...")
    except Exception as e:
        print("   LOGIN FAILED:", e)
        sys.exit(1)

    print("5. Resetting password back to 'mkt123'...")
    update_user(
        token,
        user_id,
        mkt_user.get("name"),
        mkt_user.get("departments", ["marketing"]),
        mkt_user.get("role", "user"),
        "mkt123"
    )
    reset_auth = login(mkt_user.get("username"), "mkt123")
    print("   Reset verified successfully!")

    print("\nALL PASSWORD UPDATE & LOGIN AUTHENTICATION CHECKS PASSED!")

if __name__ == "__main__":
    main()
