"""
SaaS Billing & Subscription Management — Backend tests (Iteration 7)
Covers:
  - GET /api/subscription/status
  - GET /api/platform/trial-report
  - GET /api/platform/abandoned-carts
  - GET /api/platform/subscription-orders
  - POST /api/platform/manual-payment
  - POST /api/platform/organizations/{org_id}/extend-trial
  - GET /api/platform/organizations (subscription fields)
  - GET /api/subscription-plans (id field)
  - POST /api/auth/register (auto-trial)
  - POST /api/platform/organizations (auto-trial)
  - GET /api/auth/me — user.lead_statuses
  - 403 role guards for non super_admin
  - Tenant isolation on manual-payment
"""
import os
import uuid
import requests
import pytest
from datetime import datetime, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://institute-crm-pro.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

SUPER_ADMIN_EMAIL = "admin@educationcrm.com"
SUPER_ADMIN_PASSWORD = "Admin@123"
ORG_ADMIN_EMAIL = "orgadmin@demo.com"
ORG_ADMIN_PASSWORD = "Demo@123"
COUNSELOR_EMAIL = "counselor@demo.com"
COUNSELOR_PASSWORD = "Demo@123"


# ---------------- Fixtures ----------------
def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="session")
def super_admin():
    return _login(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)


@pytest.fixture(scope="session")
def org_admin():
    return _login(ORG_ADMIN_EMAIL, ORG_ADMIN_PASSWORD)


@pytest.fixture(scope="session")
def counselor():
    return _login(COUNSELOR_EMAIL, COUNSELOR_PASSWORD)


# Create a NEW org via register so we have a fresh trial we control
@pytest.fixture(scope="session")
def new_org():
    s = requests.Session()
    uniq = uuid.uuid4().hex[:8]
    email = f"TEST_orgadmin_{uniq}@billingtest.com"
    payload = {
        "email": email,
        "password": "Pass@1234",
        "name": "TEST Billing Admin",
        "organization_name": f"TEST_BillingOrg_{uniq}",
    }
    r = s.post(f"{API}/auth/register", json=payload)
    assert r.status_code == 200, f"Register failed: {r.status_code} {r.text}"
    me = s.get(f"{API}/auth/me").json()
    s.email = email
    s.org_id = me["organization_id"]
    s.user = me
    s.register_response = r.json()
    return s


# ---------------- /api/auth/register — trial fields ----------------
class TestAutoTrialOnRegister:
    def test_register_returns_user_and_org(self, new_org):
        assert new_org.user["email"] == new_org.email.lower()
        assert new_org.user["role"] == "org_admin"

    def test_new_org_subscription_status_is_trial(self, new_org, super_admin):
        """Verify via super_admin /platform/organizations that the new org is on trial w/ 14 days."""
        r = super_admin.get(f"{API}/platform/organizations")
        assert r.status_code == 200
        orgs = r.json()
        match = next((o for o in orgs if o["id"] == new_org.org_id), None)
        assert match is not None, "Newly registered org not found in platform list"
        assert match["subscription_status"] == "trial"
        # 14-day trial, allow 13-14 due to clock skew / day rounding
        assert match["days_remaining"] in (13, 14), f"days_remaining was {match['days_remaining']}"
        assert match["subscription_end_date"] is not None


# ---------------- /api/subscription/status ----------------
class TestSubscriptionStatus:
    def test_status_for_org_admin_trial(self, new_org):
        r = new_org.get(f"{API}/subscription/status")
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "trial"
        assert d["days_remaining"] in (13, 14)
        assert d["end_date"] is not None
        assert "plan" in d

    def test_status_for_super_admin(self, super_admin):
        r = super_admin.get(f"{API}/subscription/status")
        assert r.status_code == 200
        d = r.json()
        # Super admin's own org should at least return a valid status (active/trial/expired)
        assert d["status"] in ("active", "trial", "expired")
        assert "days_remaining" in d
        assert "plan" in d

    def test_status_unauthenticated(self):
        r = requests.get(f"{API}/subscription/status")
        assert r.status_code == 401


# ---------------- /api/platform/trial-report ----------------
class TestTrialReport:
    def test_super_admin_trial_report(self, super_admin, new_org):
        r = super_admin.get(f"{API}/platform/trial-report")
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        # The newly registered org should be in the report
        match = next((row for row in rows if row["id"] == new_org.org_id), None)
        assert match is not None, "New trial org not in trial-report"
        # Required fields
        for k in ["id", "name", "industry", "subscription_plan",
                  "trial_end_date", "days_remaining", "status",
                  "admin_name", "admin_email"]:
            assert k in match, f"Missing {k}"
        assert match["status"] in ("trial", "expired")
        assert match["admin_email"] == new_org.email.lower()

    def test_trial_report_forbidden_for_org_admin(self, org_admin):
        r = org_admin.get(f"{API}/platform/trial-report")
        assert r.status_code == 403

    def test_trial_report_forbidden_for_counselor(self, counselor):
        r = counselor.get(f"{API}/platform/trial-report")
        assert r.status_code == 403


# ---------------- /api/platform/abandoned-carts ----------------
class TestAbandonedCarts:
    def test_super_admin_can_list(self, super_admin):
        r = super_admin.get(f"{API}/platform/abandoned-carts")
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        for row in rows:
            assert row["status"] in ("pending", "abandoned")
            for k in ["id", "organization_id", "organization_name",
                      "plan_name", "amount", "status", "age_hours", "created_at"]:
                assert k in row

    def test_abandoned_forbidden_for_org_admin(self, org_admin):
        r = org_admin.get(f"{API}/platform/abandoned-carts")
        assert r.status_code == 403


# ---------------- /api/platform/subscription-orders ----------------
class TestSubscriptionOrders:
    def test_super_admin_can_list(self, super_admin):
        r = super_admin.get(f"{API}/platform/subscription-orders")
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        # Each row should have expected keys (may be empty initially)
        for row in rows:
            for k in ["id", "organization_id", "plan_name",
                      "amount", "status", "payment_method", "recorded_by"]:
                assert k in row

    def test_orders_forbidden_for_org_admin(self, org_admin):
        r = org_admin.get(f"{API}/platform/subscription-orders")
        assert r.status_code == 403


# ---------------- /api/subscription-plans — id field ----------------
class TestSubscriptionPlansHasId:
    def test_plans_return_id(self):
        r = requests.get(f"{API}/subscription-plans")
        assert r.status_code == 200
        plans = r.json()
        assert isinstance(plans, list)
        assert len(plans) > 0
        for p in plans:
            assert "id" in p, "Plan missing 'id' field — manual payment dialog will break"
            assert isinstance(p["id"], str)
            assert "name" in p
            assert "price_monthly" in p
            assert "price_annual" in p


# ---------------- /api/platform/manual-payment ----------------
class TestManualPayment:
    @pytest.fixture(scope="class")
    def plan_id(self):
        plans = requests.get(f"{API}/subscription-plans").json()
        starter = next((p for p in plans if p["name"].lower() == "starter"), plans[0])
        return starter["id"], starter

    def test_manual_payment_records_and_extends(self, super_admin, new_org, plan_id):
        pid, plan = plan_id
        payload = {
            "organization_id": new_org.org_id,
            "plan_id": pid,
            "billing_cycle": "monthly",
            "amount": plan["price_monthly"],
            "payment_method": "cash",
            "reference": "TEST-REF-001",
            "notes": "TEST_manual_payment cash",
        }
        r = super_admin.post(f"{API}/platform/manual-payment", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "id" in d
        assert d["receipt_no"].startswith("RCP-")
        assert "subscription_end_date" in d

        # GET /subscription/status of the org confirms active and extended (~30 days)
        r2 = new_org.get(f"{API}/subscription/status")
        assert r2.status_code == 200
        s = r2.json()
        assert s["status"] == "active"
        # Started from trial-end (still in future), so total should be ~14 + 30 days.
        # days_remaining uses .days (floor) so 43-44 expected.
        assert s["days_remaining"] >= 29, f"Expected >=29 (post 30d extension), got {s['days_remaining']}"

        # Verify order appears in subscription-orders
        r3 = super_admin.get(f"{API}/platform/subscription-orders")
        orders = r3.json()
        match = next((o for o in orders if o["id"] == d["id"]), None)
        assert match is not None
        assert match["status"] == "paid"
        assert match["payment_method"] == "cash"
        assert match["amount"] == plan["price_monthly"]

    def test_manual_payment_invalid_plan(self, super_admin, new_org):
        r = super_admin.post(f"{API}/platform/manual-payment", json={
            "organization_id": new_org.org_id,
            "plan_id": "000000000000000000000000",
            "billing_cycle": "monthly",
            "amount": 100,
            "payment_method": "cash",
        })
        assert r.status_code == 404

    def test_manual_payment_invalid_method(self, super_admin, new_org, plan_id):
        pid, _ = plan_id
        r = super_admin.post(f"{API}/platform/manual-payment", json={
            "organization_id": new_org.org_id,
            "plan_id": pid,
            "billing_cycle": "monthly",
            "amount": 100,
            "payment_method": "bitcoin",
        })
        assert r.status_code == 400

    def test_manual_payment_invalid_cycle(self, super_admin, new_org, plan_id):
        pid, _ = plan_id
        r = super_admin.post(f"{API}/platform/manual-payment", json={
            "organization_id": new_org.org_id,
            "plan_id": pid,
            "billing_cycle": "weekly",
            "amount": 100,
            "payment_method": "cash",
        })
        assert r.status_code == 400

    def test_manual_payment_forbidden_for_org_admin(self, org_admin, new_org, plan_id):
        pid, _ = plan_id
        r = org_admin.post(f"{API}/platform/manual-payment", json={
            "organization_id": new_org.org_id,
            "plan_id": pid,
            "billing_cycle": "monthly",
            "amount": 100,
            "payment_method": "cash",
        })
        assert r.status_code == 403


# ---------------- Tenant isolation ----------------
class TestTenantIsolation:
    def test_payment_for_org_x_does_not_affect_org_y(self, super_admin):
        """Create org A + org B. Payment to A must not bump B's subscription."""
        # Create two new orgs
        def _register():
            s = requests.Session()
            uniq = uuid.uuid4().hex[:8]
            email = f"TEST_iso_{uniq}@billingtest.com"
            r = s.post(f"{API}/auth/register", json={
                "email": email, "password": "Pass@1234",
                "name": "TEST Iso", "organization_name": f"TEST_Iso_{uniq}",
            })
            assert r.status_code == 200
            me = s.get(f"{API}/auth/me").json()
            return s, me["organization_id"], email

        sa, oid_a, _ = _register()
        sb, oid_b, _ = _register()

        # Get B's days_remaining BEFORE
        before_b = sb.get(f"{API}/subscription/status").json()["days_remaining"]

        # Pay for A only
        plans = requests.get(f"{API}/subscription-plans").json()
        pid = plans[0]["id"]
        r = super_admin.post(f"{API}/platform/manual-payment", json={
            "organization_id": oid_a,
            "plan_id": pid,
            "billing_cycle": "monthly",
            "amount": 999,
            "payment_method": "upi",
        })
        assert r.status_code == 200

        # A must be active and extended
        a_status = sa.get(f"{API}/subscription/status").json()
        assert a_status["status"] == "active"
        assert a_status["days_remaining"] >= 29

        # B must remain trial and ~unchanged
        b_status = sb.get(f"{API}/subscription/status").json()
        assert b_status["status"] == "trial"
        assert b_status["days_remaining"] in (before_b - 1, before_b, before_b + 1)


# ---------------- /api/platform/organizations/{id}/extend-trial ----------------
class TestExtendTrial:
    def test_extend_trial_by_n_days(self, super_admin):
        # Register a fresh trial org so we have a known baseline
        s = requests.Session()
        uniq = uuid.uuid4().hex[:8]
        s.post(f"{API}/auth/register", json={
            "email": f"TEST_extend_{uniq}@billingtest.com",
            "password": "Pass@1234",
            "name": "TEST Extend",
            "organization_name": f"TEST_Extend_{uniq}",
        })
        me = s.get(f"{API}/auth/me").json()
        oid = me["organization_id"]

        before = s.get(f"{API}/subscription/status").json()["days_remaining"]

        r = super_admin.post(f"{API}/platform/organizations/{oid}/extend-trial?days=10")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["days_added"] == 10
        assert "trial_end_date" in d

        after = s.get(f"{API}/subscription/status").json()["days_remaining"]
        # We extend FROM current trial end, so the delta should be approximately +10
        assert after - before in (9, 10, 11), f"before={before} after={after}"

    def test_extend_trial_invalid_days(self, super_admin, new_org):
        r = super_admin.post(f"{API}/platform/organizations/{new_org.org_id}/extend-trial?days=0")
        assert r.status_code == 400
        r2 = super_admin.post(f"{API}/platform/organizations/{new_org.org_id}/extend-trial?days=400")
        assert r2.status_code == 400

    def test_extend_trial_forbidden_for_org_admin(self, org_admin, new_org):
        r = org_admin.post(f"{API}/platform/organizations/{new_org.org_id}/extend-trial?days=5")
        assert r.status_code == 403


# ---------------- /api/auth/me — lead_statuses ----------------
class TestLeadStatuses:
    def test_org_admin_demo_has_education_statuses(self, org_admin):
        r = org_admin.get(f"{API}/auth/me")
        assert r.status_code == 200
        me = r.json()
        assert "lead_statuses" in me, "user.lead_statuses missing"
        ls = me["lead_statuses"]
        assert isinstance(ls, list)
        assert len(ls) > 0
        # Demo org is Education industry — should include 'Counseling Done'
        if me.get("industry") in ("education", None):
            # 'Counseling Done' is in default_lead_statuses for education
            assert "Counseling Done" in ls or "Counseling Scheduled" in ls, \
                f"Education statuses missing: {ls}"


# ---------------- Platform org create — auto trial ----------------
class TestPlatformCreateOrgAutoTrial:
    def test_create_org_via_platform_starts_trial(self, super_admin):
        uniq = uuid.uuid4().hex[:8]
        r = super_admin.post(f"{API}/platform/organizations", json={
            "organization_name": f"TEST_PlatCreate_{uniq}",
            "subscription_plan": "starter",
            "admin_email": f"TEST_platcreate_{uniq}@billingtest.com",
            "admin_password": "Pass@1234",
            "admin_name": "TEST Plat Create",
        })
        assert r.status_code == 200, r.text
        # Find this new org in the list
        orgs = super_admin.get(f"{API}/platform/organizations").json()
        match = next((o for o in orgs if o["name"] == f"TEST_PlatCreate_{uniq}"), None)
        assert match is not None
        assert match["subscription_status"] == "trial"
        assert match["days_remaining"] in (13, 14)
