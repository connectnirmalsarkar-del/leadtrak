"""
Education CRM Backend Tests
Tests all major API endpoints with cookie-based JWT auth.
"""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://institute-crm-pro.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@educationcrm.com"
ADMIN_PASSWORD = "Admin@123"


# ----------- Fixtures -----------
@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="session")
def org_session():
    """Register a new tenant org and return its session"""
    s = requests.Session()
    uniq = uuid.uuid4().hex[:8]
    email = f"orgadmin_{uniq}@test.com"
    r = s.post(f"{API}/auth/register", json={
        "email": email,
        "password": "Pass@1234",
        "name": "Org Admin",
        "organization_name": f"Test Org {uniq}",
    })
    assert r.status_code == 200, f"Register failed: {r.status_code} {r.text}"
    s.email = email
    return s


# ----------- Auth tests -----------
class TestAuth:
    def test_login_success(self, admin_session):
        r = admin_session.get(f"{API}/auth/me")
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == ADMIN_EMAIL
        assert data["role"] == "super_admin"

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "WrongPass!"})
        assert r.status_code == 401

    def test_me_unauthenticated(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_register_creates_org_admin(self, org_session):
        r = org_session.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["role"] == "org_admin"

    def test_register_duplicate_email(self, org_session):
        r = requests.post(f"{API}/auth/register", json={
            "email": org_session.email,
            "password": "Pass@1234",
            "name": "Dup",
            "organization_name": "Dup Org",
        })
        assert r.status_code == 400

    def test_forgot_password_returns_generic(self):
        r = requests.post(f"{API}/auth/forgot-password", json={"email": "nope@example.com"})
        assert r.status_code == 200
        assert "message" in r.json()

    def test_reset_password_invalid_token(self):
        r = requests.post(f"{API}/auth/reset-password", json={"token": "bad", "new_password": "abc12345"})
        assert r.status_code == 400

    def test_logout_clears_cookies(self, admin_session):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        r = s.post(f"{API}/auth/logout")
        assert r.status_code == 200


# ----------- Dashboard -----------
class TestDashboard:
    def test_stats(self, org_session):
        r = org_session.get(f"{API}/dashboard/stats")
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ["total_leads", "todays_leads", "pending_followups", "admissions_done", "conversion_rate"]:
            assert k in data

    def test_lead_sources_chart(self, org_session):
        r = org_session.get(f"{API}/dashboard/lead-sources")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_monthly_trend(self, org_session):
        r = org_session.get(f"{API}/dashboard/monthly-trend")
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ----------- Leads -----------
class TestLeads:
    def test_lead_crud(self, org_session):
        payload = {
            "name": "TEST_Lead_John",
            "mobile": "9999999999",
            "email": "john@test.com",
            "course_interested": "MBA",
            "state": "MH",
            "city": "Pune",
            "lead_source": "Website",
            "status": "New",
        }
        r = org_session.post(f"{API}/leads", json=payload)
        assert r.status_code == 200, f"Create lead failed: {r.status_code} {r.text}"
        lead = r.json()
        assert lead["name"] == "TEST_Lead_John"
        assert "lead_id" in lead
        lead_id = lead["_id"]

        # GET single
        r = org_session.get(f"{API}/leads/{lead_id}")
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Lead_John"

        # GET list
        r = org_session.get(f"{API}/leads")
        assert r.status_code == 200
        assert any(item["_id"] == lead_id for item in r.json())

        # Filter
        r = org_session.get(f"{API}/leads", params={"status": "New", "search": "John"})
        assert r.status_code == 200

        # UPDATE
        r = org_session.put(f"{API}/leads/{lead_id}", json={"status": "Interested"})
        assert r.status_code == 200

        # Verify update
        r = org_session.get(f"{API}/leads/{lead_id}")
        assert r.json()["status"] == "Interested"

        # DELETE (org_admin can delete)
        r = org_session.delete(f"{API}/leads/{lead_id}")
        assert r.status_code == 200

        # Verify deletion
        r = org_session.get(f"{API}/leads/{lead_id}")
        assert r.status_code == 404


# ----------- Followups -----------
class TestFollowups:
    def test_followup_flow(self, org_session):
        # Create lead first
        r = org_session.post(f"{API}/leads", json={
            "name": "TEST_Followup_Lead", "mobile": "8888888888",
            "course_interested": "BBA", "lead_source": "Referral",
        })
        assert r.status_code == 200
        lead_id = r.json()["_id"]

        from datetime import datetime, timezone
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        r = org_session.post(f"{API}/followups", json={
            "lead_id": lead_id, "followup_date": today,
            "followup_time": "10:00", "remarks": "Initial call",
        })
        assert r.status_code == 200, r.text
        fu_id = r.json()["_id"]

        r = org_session.get(f"{API}/followups", params={"filter_type": "today"})
        assert r.status_code == 200
        assert any(f["_id"] == fu_id for f in r.json())

        r = org_session.put(f"{API}/followups/{fu_id}/complete")
        assert r.status_code == 200


# ----------- Admissions -----------
class TestAdmissions:
    def test_admission_create_and_list(self, org_session):
        from datetime import datetime, timezone
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        r = org_session.post(f"{API}/admissions", json={
            "student_name": "TEST_Stud", "mobile": "7777777777",
            "course": "MBA", "fees": 50000, "admission_date": today,
        })
        assert r.status_code == 200, r.text
        assert r.json()["student_name"] == "TEST_Stud"

        r = org_session.get(f"{API}/admissions")
        assert r.status_code == 200
        assert any(a["student_name"] == "TEST_Stud" for a in r.json())


# ----------- Tasks -----------
class TestTasks:
    def test_task_crud(self, org_session):
        # Get current user id
        me = org_session.get(f"{API}/auth/me").json()
        user_id = me.get("_id") or me.get("id")

        from datetime import datetime, timezone
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        r = org_session.post(f"{API}/tasks", json={
            "title": "TEST_Task", "assigned_to": user_id,
            "due_date": today, "priority": "High",
        })
        assert r.status_code == 200, r.text
        task_id = r.json()["_id"]

        r = org_session.get(f"{API}/tasks")
        assert r.status_code == 200

        r = org_session.put(f"{API}/tasks/{task_id}", json={"status": "completed"})
        assert r.status_code == 200


# ----------- Lead Sources -----------
class TestLeadSources:
    def test_create_and_list(self, org_session):
        name = f"TEST_Source_{uuid.uuid4().hex[:6]}"
        r = org_session.post(f"{API}/lead-sources", json={"name": name})
        assert r.status_code == 200, r.text
        r = org_session.get(f"{API}/lead-sources")
        assert r.status_code == 200
        assert any(s["name"] == name for s in r.json())


# ----------- Users -----------
class TestUsers:
    def test_user_crud(self, org_session):
        email = f"TEST_user_{uuid.uuid4().hex[:6]}@test.com"
        r = org_session.post(f"{API}/users", json={
            "email": email, "name": "TEST User", "role": "counselor",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert "temp_password" in data
        user_id = data["_id"]

        r = org_session.get(f"{API}/users")
        assert r.status_code == 200
        assert any(u["email"] == email.lower() for u in r.json())

        r = org_session.put(f"{API}/users/{user_id}", json={"name": "TEST Updated"})
        assert r.status_code == 200

        r = org_session.delete(f"{API}/users/{user_id}")
        assert r.status_code == 200


# ----------- Organization -----------
class TestOrganization:
    def test_get_and_update(self, org_session):
        r = org_session.get(f"{API}/organization")
        assert r.status_code == 200
        r = org_session.put(f"{API}/organization", json={"name": "TEST Updated Org"})
        assert r.status_code == 200
        r = org_session.get(f"{API}/organization")
        assert r.json()["name"] == "TEST Updated Org"


# ----------- Subscriptions -----------
class TestSubscriptions:
    def test_plans_listed(self):
        r = requests.get(f"{API}/subscription-plans")
        assert r.status_code == 200
        plans = r.json()
        names = [p["name"] for p in plans]
        assert "Starter" in names and "Growth" in names and "Enterprise" in names

    def test_create_order_validates(self, org_session):
        # With placeholder keys this should error gracefully (500) but endpoint exists
        r = org_session.post(f"{API}/subscriptions/create-order", json={
            "plan_id": "000000000000000000000000", "billing_cycle": "monthly",
        })
        # Either 404 (plan not found) or 500 (razorpay fail) - both acceptable
        assert r.status_code in (404, 500, 400)


# ----------- Reports -----------
class TestReports:
    def test_lead_summary(self, org_session):
        r = org_session.get(f"{API}/reports/lead-summary")
        assert r.status_code == 200
        data = r.json()
        assert "total" in data and "by_status" in data and "by_source" in data

    def test_revenue(self, org_session):
        r = org_session.get(f"{API}/reports/revenue")
        assert r.status_code == 200
        assert "total_revenue" in r.json()


# ----------- Multi-tenant isolation -----------
class TestTenantIsolation:
    def test_org_isolation(self):
        # Create two orgs
        s1 = requests.Session()
        s2 = requests.Session()
        u1 = uuid.uuid4().hex[:8]
        u2 = uuid.uuid4().hex[:8]
        r1 = s1.post(f"{API}/auth/register", json={
            "email": f"iso1_{u1}@test.com", "password": "Pass@1234",
            "name": "Org1 Admin", "organization_name": f"Iso1 {u1}",
        })
        assert r1.status_code == 200
        r2 = s2.post(f"{API}/auth/register", json={
            "email": f"iso2_{u2}@test.com", "password": "Pass@1234",
            "name": "Org2 Admin", "organization_name": f"Iso2 {u2}",
        })
        assert r2.status_code == 200

        # Org1 creates a lead
        rc = s1.post(f"{API}/leads", json={
            "name": "TEST_Iso_Lead", "mobile": "1112223333",
            "course_interested": "CS", "lead_source": "Website",
        })
        assert rc.status_code == 200
        lead_id = rc.json()["_id"]

        # Org2 should NOT see it
        r = s2.get(f"{API}/leads")
        assert r.status_code == 200
        assert not any(item["_id"] == lead_id for item in r.json())
        # And cannot fetch directly
        r = s2.get(f"{API}/leads/{lead_id}")
        assert r.status_code == 404


# ----------- Role-based access -----------
class TestRoleBased:
    def test_counselor_cannot_create_user(self, org_session):
        # Org admin creates a counselor
        email = f"TEST_counselor_{uuid.uuid4().hex[:6]}@test.com"
        r = org_session.post(f"{API}/users", json={
            "email": email, "name": "TEST Counselor", "role": "counselor",
        })
        assert r.status_code == 200
        temp_password = r.json()["temp_password"]

        # Counselor logs in
        cs = requests.Session()
        r = cs.post(f"{API}/auth/login", json={"email": email, "password": temp_password})
        assert r.status_code == 200, r.text

        # Counselor tries to create another user -> 403
        r = cs.post(f"{API}/users", json={
            "email": f"other_{uuid.uuid4().hex[:6]}@test.com",
            "name": "Other", "role": "telecaller",
        })
        assert r.status_code == 403

        # Counselor tries to delete a lead -> 403
        # First, org admin creates lead
        r = org_session.post(f"{API}/leads", json={
            "name": "TEST_RBAC_Lead", "mobile": "1234567890",
            "course_interested": "X", "lead_source": "Website",
        })
        assert r.status_code == 200
        lead_id = r.json()["_id"]
        r = cs.delete(f"{API}/leads/{lead_id}")
        assert r.status_code == 403


# ----------- Brute force protection -----------
class TestBruteForce:
    def test_lockout_after_5_failures(self):
        # Use a brand new account to avoid affecting admin
        email = f"brute_{uuid.uuid4().hex[:6]}@test.com"
        s = requests.Session()
        r = s.post(f"{API}/auth/register", json={
            "email": email, "password": "RightPass@1",
            "name": "Brute Test", "organization_name": "Brute Org",
        })
        assert r.status_code == 200

        # 5 failed attempts
        for i in range(5):
            r = requests.post(f"{API}/auth/login", json={"email": email, "password": "WrongPass!"})
            assert r.status_code == 401

        # 6th attempt should be 429
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": "WrongPass!"})
        assert r.status_code == 429, f"Expected 429 lockout, got {r.status_code}: {r.text}"
