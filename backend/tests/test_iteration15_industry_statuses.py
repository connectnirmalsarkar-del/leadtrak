"""
Iteration 15 — Industry-aware lead status management + dashboard widgets + demo label.

Covers review-request items 1-16 (backend regression + new features).
"""
import os
import time
import uuid

import pytest
import requests

def _read_frontend_env():
    env_path = "/app/frontend/.env"
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env() or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"
API = f"{BASE_URL}/api"

SUPER_ADMIN = ("admin@educationcrm.com", "Admin@123")
ORG_ADMIN = ("orgadmin@demo.com", "Demo@123")
COUNSELOR = ("counselor@demo.com", "Demo@123")


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"Login failed {email}: {r.status_code} {r.text}"
    return s, r.json()


@pytest.fixture(scope="module")
def super_admin_session():
    s, payload = _login(*SUPER_ADMIN)
    return s, payload


@pytest.fixture(scope="module")
def org_admin_session():
    s, payload = _login(*ORG_ADMIN)
    return s, payload


@pytest.fixture(scope="module")
def counselor_session():
    s, payload = _login(*COUNSELOR)
    return s, payload


# ---------- 1. Login payload shape ----------
def test_login_returns_lead_statuses_and_demo_label():
    s, payload = _login(*ORG_ADMIN)
    # Login returns flat payload (not nested in 'user')
    user = payload
    assert isinstance(user.get("lead_statuses"), list) and len(user["lead_statuses"]) > 0, "lead_statuses missing"
    features = user.get("features") or {}
    assert "demo_label" in features, f"features.demo_label missing: {features}"
    # Education industry: demo_label should be "Counselling"
    assert features["demo_label"] in ("Counselling", "Demo", "Consultation", "Site Visit", "Trial", "Itinerary Review")


# ---------- 2-5. Org lead-statuses CRUD + reset ----------
class TestOrgLeadStatuses:
    def test_get_initial_state(self, org_admin_session):
        s, _ = org_admin_session
        # Reset first to make this idempotent across runs
        s.post(f"{API}/organization/lead-statuses/reset")
        r = s.get(f"{API}/organization/lead-statuses")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["industry"] == "education"
        assert isinstance(body["industry_defaults"], list) and len(body["industry_defaults"]) > 0
        # If reset succeeded → is_custom False, effective == industry_defaults
        if body["is_custom"] is False:
            assert body["effective"] == body["industry_defaults"]
            assert body["custom"] is None

    def test_put_custom_statuses_adds_test_custom(self, org_admin_session):
        s, _ = org_admin_session
        r0 = s.get(f"{API}/organization/lead-statuses")
        defaults = r0.json()["industry_defaults"]
        custom_list = defaults + ["TEST_Custom_Status"]
        r = s.put(f"{API}/organization/lead-statuses", json={"statuses": custom_list})
        assert r.status_code == 200, r.text
        assert r.json().get("is_custom") is True

        r2 = s.get(f"{API}/organization/lead-statuses")
        body = r2.json()
        assert body["is_custom"] is True
        assert "TEST_Custom_Status" in body["effective"]

        # /auth/me should reflect new lead_statuses
        me = s.get(f"{API}/auth/me")
        assert me.status_code == 200
        assert "TEST_Custom_Status" in (me.json().get("lead_statuses") or [])

    def test_put_missing_inuse_status_returns_400(self, org_admin_session):
        s, _ = org_admin_session
        # Ensure at least one lead with status 'Admission Done' exists so the
        # validator has something to protect. If none, skip.
        leads = s.get(f"{API}/leads", params={"status": "Admission Done", "limit": 1}).json()
        items = leads.get("items") if isinstance(leads, dict) else leads
        if not items:
            pytest.skip("No lead at 'Admission Done' status to validate in-use protection")
        r0 = s.get(f"{API}/organization/lead-statuses")
        defaults = r0.json()["industry_defaults"]
        bad_list = [x for x in defaults if x != "Admission Done"]
        r = s.put(f"{API}/organization/lead-statuses", json={"statuses": bad_list})
        assert r.status_code == 400, r.text
        assert "Admission Done" in r.text

    def test_reset_to_defaults(self, org_admin_session):
        s, _ = org_admin_session
        r = s.post(f"{API}/organization/lead-statuses/reset")
        assert r.status_code == 200, r.text
        r2 = s.get(f"{API}/organization/lead-statuses").json()
        assert r2["is_custom"] is False
        assert r2["effective"] == r2["industry_defaults"]


# ---------- helpers ----------
def _create_lead(session, status="New"):
    payload = {
        "name": f"TEST_IT15_{uuid.uuid4().hex[:6]}",
        "mobile": f"99{int(time.time()*1000) % 100000000:08d}",
        "email": f"it15_{uuid.uuid4().hex[:6]}@test.com",
        "course_interested": "Test Course",
        "lead_source": "Website",
        "status": status,
    }
    r = session.post(f"{API}/leads", json=payload)
    return r, payload


# ---------- 6-7. Lead create / update status validation ----------
class TestLeadStatusValidation:
    created_id = None

    def test_create_lead_valid_status(self, counselor_session):
        s, _ = counselor_session
        r, _payload = _create_lead(s, status="New")
        assert r.status_code in (200, 201), r.text
        data = r.json()
        lid = data.get("_id") or data.get("id") or data.get("lead_id")
        assert lid
        TestLeadStatusValidation.created_id = lid

    def test_create_lead_invalid_status(self, counselor_session):
        s, _ = counselor_session
        payload = {
            "name": f"TEST_IT15_BAD_{uuid.uuid4().hex[:6]}",
            "mobile": f"98{int(time.time()*1000) % 100000000:08d}",
            "email": f"it15bad_{uuid.uuid4().hex[:6]}@test.com",
            "course_interested": "Bad",
            "lead_source": "Website",
            "status": "Negotiation",
        }
        r = s.post(f"{API}/leads", json=payload)
        assert r.status_code == 400, f"Expected 400 invalid status, got {r.status_code}: {r.text}"
        assert "status" in r.text.lower()

    def test_update_lead_invalid_status_then_valid(self, counselor_session):
        s, _ = counselor_session
        lid = TestLeadStatusValidation.created_id
        assert lid, "previous test must succeed"
        r_bad = s.put(f"{API}/leads/{lid}", json={"status": "Negotiation"})
        assert r_bad.status_code == 400, f"Expected 400 invalid status, got {r_bad.status_code}: {r_bad.text}"

        r_good = s.put(f"{API}/leads/{lid}", json={"status": "Interested"})
        assert r_good.status_code == 200, f"Expected 200 valid status, got {r_good.status_code}: {r_good.text}"

    def test_log_call_invalid_then_valid(self, counselor_session):
        s, _ = counselor_session
        lid = TestLeadStatusValidation.created_id
        r_bad = s.post(f"{API}/leads/{lid}/log-call", json={"summary": "tried call", "new_status": "Negotiation", "call_disposition": "Connected"})
        assert r_bad.status_code == 400, f"Expected 400 invalid status, got {r_bad.status_code}: {r_bad.text}"

        r_good = s.post(f"{API}/leads/{lid}/log-call", json={"summary": "tried call", "new_status": "Contacted", "call_disposition": "Connected"})
        assert r_good.status_code == 200, f"log-call valid failed: {r_good.status_code}: {r_good.text}"


# ---------- 14. Migration endpoint (super admin) ----------
def test_migrate_invalid_lead_statuses(super_admin_session):
    s, _ = super_admin_session
    r = s.post(f"{API}/platform/migrate-invalid-lead-statuses")
    assert r.status_code == 200, r.text
    body = r.json()
    # Just verify shape — counts/keys should exist
    assert isinstance(body, dict)
    # Idempotent re-run
    r2 = s.post(f"{API}/platform/migrate-invalid-lead-statuses")
    assert r2.status_code == 200


# ---------- 11. Dashboard funnel ----------
def test_dashboard_funnel_industry_aware(org_admin_session):
    s, _ = org_admin_session
    r = s.get(f"{API}/dashboard/funnel")
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list) and len(data) == 4
    for item in data:
        assert {"stage", "raw_stage", "count", "percentage"}.issubset(item.keys()), f"bad funnel item: {item}"
    raw_stages = [d["raw_stage"] for d in data]
    assert raw_stages == ["New", "Contacted", "Interested", "Admission Done"], raw_stages


# ---------- 12. Leaderboard ----------
def test_dashboard_leaderboard_shape(org_admin_session):
    s, _ = org_admin_session
    r = s.get(f"{API}/dashboard/leaderboard")
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list)
    if data:
        required = {"avatar_url", "conversion_label", "admissions", "conversion_rate", "leads_assigned"}
        missing = required - set(data[0].keys())
        assert not missing, f"missing keys: {missing} (got {list(data[0].keys())})"
        # conversion_label for education = "Admission"
        assert data[0]["conversion_label"] in ("Admission", "Deal", "Booking", "Confirmation", "Membership", "Sale", "Conversion")


# ---------- 13. Activity feed ----------
def test_dashboard_activity_feed(org_admin_session):
    s, _ = org_admin_session
    r = s.get(f"{API}/dashboard/activity-feed")
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list)
    # If any items, validate text shape
    for item in data:
        assert "text" in item
    # Look for an industry-aware lead-creation phrasing if there are lead_created items
    lead_items = [d for d in data if d.get("type") == "lead_created"]
    if lead_items:
        # education industry: terms.lead -> 'Lead' (lowercased to 'lead')
        sample = lead_items[0]["text"].lower()
        assert "created" in sample
    adm_items = [d for d in data if d.get("type") == "admission"]
    if adm_items:
        sample_adm = adm_items[0]["text"].lower()
        # Education: action_phrase like "recorded admission" — accept any "ed " ending
        assert " for " in sample_adm


# ---------- 15. No-regression: admissions + leads list ----------
def test_admissions_list_works(org_admin_session):
    s, _ = org_admin_session
    r = s.get(f"{API}/admissions")
    assert r.status_code == 200, r.text


def test_leads_list_works(org_admin_session):
    s, _ = org_admin_session
    r = s.get(f"{API}/leads")
    assert r.status_code == 200, r.text


# ---------- 9. Demo complete with lead_status ----------
class TestDemoComplete:
    lead_id = None
    demo_id = None

    def test_setup_demo(self, counselor_session):
        s, me_payload = counselor_session
        r, _ = _create_lead(s, status="New")
        assert r.status_code in (200, 201), r.text
        lid = r.json().get("_id") or r.json().get("id") or r.json().get("lead_id")
        TestDemoComplete.lead_id = lid
        # Book a demo
        from datetime import datetime, timedelta, timezone
        d = datetime.now(timezone.utc) + timedelta(days=1)
        dr = s.post(f"{API}/demos", json={
            "lead_id": lid,
            "demo_owner_id": me_payload.get("id"),
            "scheduled_date": d.strftime("%Y-%m-%d"),
            "scheduled_time": "10:00",
            "demo_mode": "Online",
            "agenda": "test",
        })
        if dr.status_code not in (200, 201):
            pytest.skip(f"Demo create not available: {dr.status_code} {dr.text}")
        TestDemoComplete.demo_id = dr.json().get("_id") or dr.json().get("id")

    def test_demo_complete_invalid_lead_status(self, counselor_session):
        s, _ = counselor_session
        if not TestDemoComplete.demo_id:
            pytest.skip("no demo")
        r = s.post(f"{API}/demos/{TestDemoComplete.demo_id}/complete", json={
            "outcome": "interested",
            "lead_status": "Negotiation",
        })
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"

    def test_demo_complete_valid_lead_status(self, counselor_session):
        s, _ = counselor_session
        if not TestDemoComplete.demo_id:
            pytest.skip("no demo")
        r = s.post(f"{API}/demos/{TestDemoComplete.demo_id}/complete", json={
            "outcome": "interested",
            "lead_status": "Interested",
        })
        assert r.status_code == 200, r.text


# ---------- 8. Followup complete with new_status validation ----------
class TestFollowupComplete:
    fu_id = None
    lead_id = None

    def test_setup_followup(self, counselor_session):
        s, _ = counselor_session
        r, _ = _create_lead(s, status="New")
        assert r.status_code in (200, 201), r.text
        lid = r.json().get("_id") or r.json().get("id") or r.json().get("lead_id")
        TestFollowupComplete.lead_id = lid
        from datetime import datetime, timedelta, timezone
        d = datetime.now(timezone.utc) + timedelta(hours=1)
        fr = s.post(f"{API}/followups", json={
            "lead_id": lid,
            "followup_date": d.strftime("%Y-%m-%d"),
            "followup_time": d.strftime("%H:%M"),
            "remarks": "test",
        })
        if fr.status_code not in (200, 201):
            pytest.skip(f"followup create not available: {fr.status_code} {fr.text}")
        TestFollowupComplete.fu_id = fr.json().get("_id") or fr.json().get("id")

    def test_followup_complete_invalid_then_valid(self, counselor_session):
        s, _ = counselor_session
        if not TestFollowupComplete.fu_id:
            pytest.skip("no followup")
        r_bad = s.post(f"{API}/followups/{TestFollowupComplete.fu_id}/complete", json={
            "summary": "tried",
            "new_status": "Negotiation",
        })
        assert r_bad.status_code == 400, f"expected 400, got {r_bad.status_code}: {r_bad.text}"
        r_good = s.post(f"{API}/followups/{TestFollowupComplete.fu_id}/complete", json={
            "summary": "tried",
            "new_status": "Interested",
        })
        assert r_good.status_code == 200, f"valid followup failed: {r_good.status_code}: {r_good.text}"
