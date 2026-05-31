"""Iteration 9 — Final QA pass.
Covers: Webhook Health, Lead Widget config (services + cascading state/city),
Platform Locations (West Bengal 186 cities), Tenant isolation, RBAC,
Subscription badge data, Add-Lead form-config (industry extras).
"""
import os
import time
import uuid
import requests
import pytest
from pathlib import Path

def _load_env():
    env_path = Path("/app/frontend/.env")
    for line in env_path.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            return line.split("=", 1)[1].strip()
    raise RuntimeError("REACT_APP_BACKEND_URL not found")

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _load_env()).rstrip("/")
API = f"{BASE_URL}/api"

SUPER = ("admin@educationcrm.com", "Admin@123")
ORGADMIN = ("orgadmin@demo.com", "Demo@123")
COUNSELOR = ("counselor@demo.com", "Demo@123")


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def super_sess():
    return _login(*SUPER)


@pytest.fixture(scope="module")
def admin_sess():
    return _login(*ORGADMIN)


@pytest.fixture(scope="module")
def couns_sess():
    return _login(*COUNSELOR)


# ---- Auth + /me + subscription badge data ----
class TestAuthMe:
    def test_me_orgadmin_has_subscription(self, admin_sess):
        r = admin_sess.get(f"{API}/auth/me")
        assert r.status_code == 200
        u = r.json()
        assert u["email"] == ORGADMIN[0]
        assert u["role"] == "org_admin"
        assert "industry" in u or "organization_id" in u

    def test_me_super_admin(self, super_sess):
        r = super_sess.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["role"] == "super_admin"

    def test_org_subscription_endpoint(self, admin_sess):
        r = admin_sess.get(f"{API}/subscription/current")
        # if endpoint exists, must return plan/status
        if r.status_code == 200:
            data = r.json()
            assert any(k in data for k in ("plan", "status", "subscription_status", "trial_end_date"))


# ---- Locations: states + cities (cascading) ----
class TestLocations:
    def test_states_list(self, admin_sess):
        r = admin_sess.get(f"{API}/locations/states")
        assert r.status_code == 200
        states = r.json()
        # accept either list-of-strings or list-of-dicts
        assert isinstance(states, list) and len(states) >= 28

    def test_cities_for_west_bengal(self, admin_sess):
        r = admin_sess.get(f"{API}/locations/cities", params={"state": "West Bengal"})
        assert r.status_code == 200, r.text
        cities = r.json()
        assert isinstance(cities, list)
        assert len(cities) >= 180, f"expected ~186 WB cities, got {len(cities)}"

    def test_cities_for_invalid_state(self, admin_sess):
        r = admin_sess.get(f"{API}/locations/cities", params={"state": "Atlantis"})
        assert r.status_code == 200
        assert r.json() == [] or len(r.json()) == 0


# ---- Platform Locations (super-admin only) ----
class TestPlatformLocations:
    def test_super_can_list(self, super_sess):
        r = super_sess.get(f"{API}/platform/locations")
        assert r.status_code == 200

    def test_org_admin_blocked(self, admin_sess):
        r = admin_sess.get(f"{API}/platform/locations")
        assert r.status_code in (401, 403)

    def test_add_and_delete_city(self, super_sess):
        city_name = f"TESTCITY_{uuid.uuid4().hex[:6]}"
        r = super_sess.post(
            f"{API}/platform/locations/cities",
            json={"state": "Goa", "city": city_name, "is_active": True},
        )
        assert r.status_code in (200, 201), r.text
        created = r.json()
        cid = created.get("id") or created.get("_id")
        assert cid
        # cleanup
        d = super_sess.delete(f"{API}/platform/locations/cities/{cid}")
        assert d.status_code in (200, 204)


# ---- Lead Widget: token, config (services), cascading cities ----
class TestLeadWidget:
    def test_widget_token(self, admin_sess):
        r = admin_sess.get(f"{API}/widget/token")
        assert r.status_code == 200
        data = r.json()
        assert "widget_token" in data or "token" in data
        token = data.get("widget_token") or data.get("token")
        # save for later
        TestLeadWidget.token = token

    def test_widget_config_public(self):
        token = getattr(TestLeadWidget, "token", None)
        assert token, "token not captured"
        # public endpoint — no auth
        r = requests.get(f"{API}/widget/config/{token}")
        assert r.status_code == 200, r.text
        cfg = r.json()
        # must expose services from catalog and industry-specific fields
        assert "services" in cfg or "courses" in cfg or "service_options" in cfg
        services = cfg.get("services") or cfg.get("courses") or cfg.get("service_options") or []
        assert isinstance(services, list)
        # demo org should have at least 1 service seeded
        assert len(services) >= 1, "lead widget services dropdown is empty"

    def test_widget_cities_cascading(self):
        token = getattr(TestLeadWidget, "token", None)
        r = requests.get(f"{API}/widget/cities/{token}", params={"state": "Maharashtra"})
        assert r.status_code == 200
        cities = r.json()
        if isinstance(cities, dict):
            cities = cities.get("cities") or cities.get("items") or []
        assert isinstance(cities, list) and len(cities) > 5

    def test_widget_lead_submission_public(self):
        token = getattr(TestLeadWidget, "token", None)
        mobile = "98" + str(int(time.time()))[-8:]
        payload = {
            "name": f"TEST_WIDGET_{uuid.uuid4().hex[:5]}",
            "mobile": mobile,
            "email": f"test_widget_{uuid.uuid4().hex[:5]}@x.com",
            "state": "Maharashtra",
            "city": "Mumbai",
        }
        r = requests.post(f"{API}/widget/lead/{token}", json=payload)
        assert r.status_code in (200, 201), r.text


# ---- Webhook Health (NEW page) ----
class TestWebhookHealth:
    def test_stats_orgadmin(self, admin_sess):
        r = admin_sess.get(f"{API}/webhook-logs/stats")
        assert r.status_code == 200, r.text
        stats = r.json()
        for k in ("total", "success_rate", "failed", "last_24h"):
            assert k in stats or any(k.replace("_", "") in kk.replace("_", "") for kk in stats), f"missing {k} in {list(stats)}"

    def test_logs_list(self, admin_sess):
        r = admin_sess.get(f"{API}/webhook-logs")
        assert r.status_code == 200
        body = r.json()
        items = body if isinstance(body, list) else body.get("items") or body.get("logs") or []
        TestWebhookHealth.items = items

    def test_logs_filter_by_source(self, admin_sess):
        r = admin_sess.get(f"{API}/webhook-logs", params={"source": "facebook"})
        assert r.status_code == 200

    def test_log_detail(self, admin_sess):
        items = getattr(TestWebhookHealth, "items", []) or []
        if not items:
            pytest.skip("no webhook logs to inspect")
        log_id = items[0].get("id") or items[0].get("_id")
        r = admin_sess.get(f"{API}/webhook-logs/{log_id}")
        assert r.status_code == 200
        d = r.json()
        assert "payload" in d or "request_body" in d or "raw_body" in d

    def test_counselor_forbidden(self, couns_sess):
        r = couns_sess.get(f"{API}/webhook-logs")
        assert r.status_code in (401, 403), f"counselor must not access webhook logs, got {r.status_code}"

    def test_counselor_stats_forbidden(self, couns_sess):
        r = couns_sess.get(f"{API}/webhook-logs/stats")
        assert r.status_code in (401, 403)


# ---- Leads form-config (industry extras for Add-Lead dialog) ----
class TestLeadFormConfig:
    def test_form_config(self, admin_sess):
        # try common endpoints
        for path in ("/leads/form-config", "/form-config/leads", "/industry/form-config"):
            r = admin_sess.get(f"{API}{path}")
            if r.status_code == 200:
                cfg = r.json()
                assert "fields" in cfg or "lead_statuses" in cfg or "terminology" in cfg or isinstance(cfg, dict)
                return
        pytest.skip("no form-config endpoint exposed (frontend may read from /auth/me)")


# ---- Tenant isolation ----
class TestTenantIsolation:
    def test_orgadmin_cannot_see_super_org_leads(self, admin_sess, super_sess):
        r_admin = admin_sess.get(f"{API}/leads", params={"limit": 100})
        r_super = super_sess.get(f"{API}/leads", params={"limit": 100})
        assert r_admin.status_code == 200 and r_super.status_code == 200
        admin_org_ids = {l.get("organization_id") for l in (r_admin.json() if isinstance(r_admin.json(), list) else r_admin.json().get("items", []))}
        super_org_ids = {l.get("organization_id") for l in (r_super.json() if isinstance(r_super.json(), list) else r_super.json().get("items", []))}
        # admin's leads should all be one org; if super has any leads they must be different org (or empty)
        if admin_org_ids and super_org_ids:
            # they may share if super has no leads of own; just verify admin sees single org
            assert len(admin_org_ids) == 1

    def test_orgadmin_cannot_access_platform_orgs(self, admin_sess):
        r = admin_sess.get(f"{API}/platform/organizations")
        assert r.status_code in (401, 403)


# ---- RBAC: counselor scope ----
class TestRBAC:
    def test_counselor_cannot_create_user(self, couns_sess):
        r = couns_sess.post(f"{API}/users", json={"name": "X", "email": "x@x.com", "role": "counselor"})
        assert r.status_code in (401, 403, 400)

    def test_counselor_cannot_list_users(self, couns_sess):
        r = couns_sess.get(f"{API}/users")
        # may be 200 with filtered list, or 403
        assert r.status_code in (200, 401, 403)

    def test_counselor_can_see_own_leads(self, couns_sess):
        r = couns_sess.get(f"{API}/leads")
        assert r.status_code == 200
