"""
Iteration 10 QA - Backend tests for:
  1) Onboarding wizard endpoints (/api/onboarding/*)
  2) Reports endpoints (/api/reports/total-summary, /by-caller, /by-manager)
  3) Users endpoints with reports_to (PUT /api/users/{id}, POST /api/users with reports_to)
"""

import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

API = f"{BASE_URL}/api"

CREDS = {
    "org_admin": ("orgadmin@demo.com", "Demo@123"),
    "manager": ("manager@demo.com", "Demo@123"),
    "counselor": ("counselor@demo.com", "Demo@123"),
    "telecaller": ("telecaller@demo.com", "Demo@123"),
}


def login(session: requests.Session, role: str):
    email, pw = CREDS[role]
    r = session.post(f"{API}/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, f"Login {role}: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    login(s, "org_admin")
    return s


@pytest.fixture(scope="module")
def counselor_session():
    s = requests.Session()
    login(s, "counselor")
    return s


# ------------------ Onboarding ------------------

class TestOnboarding:
    def test_state_returns_payload(self, admin_session):
        r = admin_session.get(f"{API}/onboarding/state")
        assert r.status_code == 200
        data = r.json()
        assert "completed_steps" in data or "onboarding" in data or "steps" in data or "skipped" in data, f"Unexpected: {data}"

    def test_reset_then_state_shows_wizard(self, admin_session):
        r = admin_session.post(f"{API}/onboarding/reset")
        assert r.status_code == 200, r.text
        s = admin_session.get(f"{API}/onboarding/state").json()
        # After reset, skipped should be falsy and completed_at empty
        skipped = s.get("skipped") or (s.get("onboarding") or {}).get("skipped")
        assert not skipped, f"Should not be skipped after reset: {s}"

    def test_advance_step(self, admin_session):
        r = admin_session.post(f"{API}/onboarding/advance", json={"step": "welcome"})
        assert r.status_code == 200, r.text

    def test_skip_then_state(self, admin_session):
        r = admin_session.post(f"{API}/onboarding/skip")
        assert r.status_code == 200, r.text
        s = admin_session.get(f"{API}/onboarding/state").json()
        skipped = s.get("skipped") or (s.get("onboarding") or {}).get("skipped")
        assert skipped, f"Skipped flag should be set: {s}"

    def test_reset_again_for_clean_state(self, admin_session):
        # Reset for follow-up frontend test
        r = admin_session.post(f"{API}/onboarding/reset")
        assert r.status_code == 200

    def test_counselor_state_403_or_empty(self, counselor_session):
        r = counselor_session.get(f"{API}/onboarding/state")
        # State endpoint may be allowed but advance/skip/reset must 403
        # Let's just check the protective ones explicitly
        assert r.status_code in (200, 403)

    def test_counselor_advance_403(self, counselor_session):
        r = counselor_session.post(f"{API}/onboarding/advance", json={"step": "welcome"})
        assert r.status_code == 403, r.text

    def test_counselor_skip_403(self, counselor_session):
        r = counselor_session.post(f"{API}/onboarding/skip")
        assert r.status_code == 403, r.text

    def test_counselor_reset_403(self, counselor_session):
        r = counselor_session.post(f"{API}/onboarding/reset")
        assert r.status_code == 403, r.text


# ------------------ Reports ------------------

class TestReports:
    def test_total_summary(self, admin_session):
        r = admin_session.get(f"{API}/reports/total-summary")
        assert r.status_code == 200, r.text
        d = r.json()
        # Expect KPI shape
        for key in ["total_leads", "conversion_rate", "revenue"]:
            assert key in d, f"Missing key {key}: {d}"
        assert isinstance(d["total_leads"], int)

    def test_by_caller(self, admin_session):
        r = admin_session.get(f"{API}/reports/by-caller")
        assert r.status_code == 200, r.text
        d = r.json()
        # Either list or wrapped
        rows = d if isinstance(d, list) else d.get("callers") or d.get("rows") or d.get("data") or []
        assert isinstance(rows, list)
        # Should include at least Priya and Rohan
        names = " ".join(str(x.get("name", "")) for x in rows)
        assert "Priya" in names or "Rohan" in names, f"Missing demo callers: {names[:200]}"

    def test_by_manager(self, admin_session):
        r = admin_session.get(f"{API}/reports/by-manager")
        assert r.status_code == 200, r.text
        d = r.json()
        rows = d if isinstance(d, list) else d.get("managers") or d.get("rows") or d.get("data") or []
        assert isinstance(rows, list)
        # Arjun expected to have team
        found = False
        for m in rows:
            if "Arjun" in str(m.get("name", "")) or "Arjun" in str(m.get("manager_name", "")):
                team_size = m.get("team_size", m.get("team", {}).get("size") if isinstance(m.get("team"), dict) else None)
                if team_size is not None:
                    assert team_size >= 2, f"Arjun team_size should be >=2, got {team_size}: {m}"
                found = True
                break
        assert found, f"Arjun manager row not found: {rows}"

    def test_counselor_total_summary_403(self, counselor_session):
        r = counselor_session.get(f"{API}/reports/total-summary")
        assert r.status_code == 403, r.text

    def test_counselor_by_caller_403(self, counselor_session):
        r = counselor_session.get(f"{API}/reports/by-caller")
        assert r.status_code == 403, r.text

    def test_counselor_by_manager_403(self, counselor_session):
        r = counselor_session.get(f"{API}/reports/by-manager")
        assert r.status_code == 403, r.text


# ------------------ Users reports_to ------------------

class TestUsersReportsTo:
    def test_list_users_includes_reports_to(self, admin_session):
        r = admin_session.get(f"{API}/users")
        assert r.status_code == 200, r.text
        users = r.json()
        assert isinstance(users, list)
        # Find Arjun (manager) and a counselor
        arjun = next((u for u in users if "Arjun" in u.get("name", "")), None)
        priya = next((u for u in users if "Priya" in u.get("name", "")), None)
        assert arjun is not None, "Arjun not found in users"
        assert priya is not None, "Priya not found in users"
        # Priya's reports_to should be Arjun's id
        assert priya.get("reports_to") == arjun.get("id") or priya.get("reports_to") == arjun.get("_id"), \
            f"Priya.reports_to {priya.get('reports_to')} != Arjun id {arjun.get('id')}"

    def test_create_user_with_reports_to(self, admin_session):
        users = admin_session.get(f"{API}/users").json()
        arjun = next((u for u in users if "Arjun" in u.get("name", "")), None)
        assert arjun
        manager_id = arjun.get("id") or arjun.get("_id")
        payload = {
            "name": "TEST_QA_User",
            "email": "test_qa_user_iter10@demo.com",
            "mobile": "9999911111",
            "role": "counselor",
            "reports_to": manager_id,
            "password": "Welcome@123",
        }
        # Cleanup any prior
        existing = next((u for u in users if u.get("email") == payload["email"]), None)
        if existing:
            admin_session.delete(f"{API}/users/{existing.get('id') or existing.get('_id')}")
        r = admin_session.post(f"{API}/users", json=payload)
        assert r.status_code in (200, 201), r.text
        created = r.json()
        new_id = created.get("id") or created.get("_id")
        assert new_id
        # Verify via GET list
        users2 = admin_session.get(f"{API}/users").json()
        u = next((x for x in users2 if x.get("email") == payload["email"]), None)
        assert u is not None
        assert u.get("reports_to") == manager_id, f"reports_to mismatch: got {u.get('reports_to')}"
        # Update to null
        r2 = admin_session.put(f"{API}/users/{new_id}", json={"reports_to": ""})
        assert r2.status_code in (200, 204), r2.text
        # Cleanup
        admin_session.delete(f"{API}/users/{new_id}")
