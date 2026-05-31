"""Phase A: Multi-industry CRM backend tests.

Covers:
- GET /api/industries, GET /api/industries/{key}
- POST /api/auth/register with various industries (real_estate, healthcare,
  unsupported -> generic, omitted -> education)
- POST /api/auth/login + GET /api/auth/me payload shape (industry, terminology,
  organization_name)
- Demo org legacy migration (orgadmin@demo.com -> education)
- PUT /api/organization/industry (org_admin allowed, counselor/telecaller 403)
- GET /api/dashboard/funnel last stage label is industry-aware
- Regression: GET /api/support-tickets, POST /api/leads, GET /api/dashboard/stats
- Cleanup: removes any test_*@phaseatests.com users + their orgs
"""
import os
import time
import uuid
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    # Fallback to frontend .env at test discovery time
    try:
        with open("/app/frontend/.env") as fh:
            for line in fh:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip()
                    break
    except Exception:
        pass
BASE_URL = (BASE_URL or "").rstrip("/")

DEMO_ADMIN = {"email": "orgadmin@demo.com", "password": "Demo@123"}
DEMO_COUNSELOR = {"email": "counselor@demo.com", "password": "Demo@123"}
DEMO_TELECALLER = {"email": "telecaller@demo.com", "password": "Demo@123"}

EXPECTED_INDUSTRIES = {
    "education", "it_software", "real_estate", "healthcare", "insurance",
    "travel", "retail", "fitness", "generic",
}


# ---------- Mongo cleanup helper ----------
@pytest.fixture(scope="session", autouse=True)
def cleanup_test_orgs():
    """Remove test_*@phasea.test users + their orgs before & after the session."""
    mongo_url = None
    db_name = None
    try:
        with open("/app/backend/.env") as fh:
            for line in fh:
                if line.startswith("MONGO_URL="):
                    mongo_url = line.split("=", 1)[1].strip()
                elif line.startswith("DB_NAME="):
                    db_name = line.split("=", 1)[1].strip()
    except Exception:
        pass

    def _purge():
        if not mongo_url or not db_name:
            return
        try:
            mc = MongoClient(mongo_url)
            db = mc[db_name]
            users = list(db.users.find({"email": {"$regex": "@phaseatests\\.com$"}}))
            org_ids = [u.get("organization_id") for u in users if u.get("organization_id")]
            if users:
                db.users.delete_many({"email": {"$regex": "@phaseatests\\.com$"}})
            if org_ids:
                db.organizations.delete_many({"_id": {"$in": org_ids}})
                db.lead_sources.delete_many({"organization_id": {"$in": org_ids}})
            mc.close()
        except Exception as exc:
            print(f"cleanup error: {exc}")

    _purge()
    yield
    _purge()


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    return s, r


TEST_EMAIL_DOMAIN = "phaseatests.com"  # avoid reserved TLDs (.test) which Pydantic EmailStr rejects


def _unique_email(tag):
    return f"test_{tag}_{uuid.uuid4().hex[:8]}@{TEST_EMAIL_DOMAIN}"


# ---------- /api/industries ----------
class TestIndustriesCatalog:
    def test_list_industries_returns_nine(self):
        r = requests.get(f"{BASE_URL}/api/industries", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        keys = {row["key"] for row in data}
        assert keys == EXPECTED_INDUSTRIES, f"unexpected keys: {keys}"
        for row in data:
            assert {"key", "label", "icon", "tagline"}.issubset(row.keys())
            assert isinstance(row["label"], str) and row["label"]
            assert isinstance(row["icon"], str) and row["icon"]

    def test_get_industry_healthcare_terms_and_sources(self):
        r = requests.get(f"{BASE_URL}/api/industries/healthcare", timeout=15)
        assert r.status_code == 200, r.text
        cfg = r.json()
        assert cfg["key"] == "healthcare"
        assert cfg["terms"]["contact"] == "Patient"
        assert cfg["terms"]["conversion"] == "Appointment"
        assert cfg["terms"]["lead"] == "Inquiry"
        assert "Insurance Network" in cfg["default_sources"]

    def test_get_industry_invalid_returns_404(self):
        r = requests.get(f"{BASE_URL}/api/industries/crypto", timeout=15)
        assert r.status_code == 404


# ---------- Register flow ----------
class TestRegisterWithIndustry:
    def test_register_real_estate(self):
        email = _unique_email("realestate")
        payload = {
            "email": email, "password": "Test@1234", "name": "RE User",
            "organization_name": "RE Org PhaseA", "industry": "real_estate",
        }
        r = requests.post(f"{BASE_URL}/api/auth/register", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["industry"] == "real_estate"
        assert d["terminology"]["contact"] == "Buyer"
        assert d["terminology"]["conversion"] == "Booking"
        assert d["organization_name"] == "RE Org PhaseA"
        assert d["role"] == "org_admin"

    def test_register_healthcare_lead_term_is_inquiry(self):
        email = _unique_email("hc")
        payload = {
            "email": email, "password": "Test@1234", "name": "HC User",
            "organization_name": "HC Org PhaseA", "industry": "healthcare",
        }
        r = requests.post(f"{BASE_URL}/api/auth/register", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["terminology"]["lead"] == "Inquiry"
        assert d["terminology"]["leads"] == "Inquiries"

    def test_register_unsupported_industry_falls_back_to_generic(self):
        email = _unique_email("crypto")
        payload = {
            "email": email, "password": "Test@1234", "name": "CR User",
            "organization_name": "CR Org PhaseA", "industry": "crypto",
        }
        r = requests.post(f"{BASE_URL}/api/auth/register", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["industry"] == "generic"
        # generic terms
        assert d["terminology"]["contact"] == "Customer"
        assert d["terminology"]["conversion"] == "Deal"

    def test_register_omitted_industry_defaults_to_education(self):
        email = _unique_email("default")
        payload = {
            "email": email, "password": "Test@1234", "name": "Def User",
            "organization_name": "Def Org PhaseA",
        }
        r = requests.post(f"{BASE_URL}/api/auth/register", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["industry"] == "education"
        assert d["terminology"]["contact"] == "Student"
        assert d["terminology"]["conversion"] == "Admission"

    def test_register_seeds_default_lead_sources(self):
        email = _unique_email("sources")
        payload = {
            "email": email, "password": "Test@1234", "name": "Src User",
            "organization_name": "Src Org PhaseA", "industry": "healthcare",
        }
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/auth/register", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        # Re-login to get session cookies cleanly
        s2, lr = _login(email, "Test@1234")
        assert lr.status_code == 200, lr.text
        rs = s2.get(f"{BASE_URL}/api/lead-sources", timeout=15)
        assert rs.status_code == 200, rs.text
        names = {row["name"] for row in rs.json()}
        # Healthcare expected defaults
        for expected in ["Website", "Google Ad", "Walk-in", "Referral", "Insurance Network", "WhatsApp"]:
            assert expected in names, f"missing default source {expected}; got {names}"


# ---------- Login / me / migration ----------
class TestAuthPayload:
    def test_login_demo_admin_returns_industry_education(self):
        s, r = _login(**DEMO_ADMIN)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["industry"] == "education"
        assert d["terminology"]["contact"] == "Student"
        assert d["terminology"]["conversion"] == "Admission"
        assert d["organization_name"], "organization_name must be set"

    def test_me_returns_industry_and_terminology(self):
        s, r = _login(**DEMO_ADMIN)
        assert r.status_code == 200
        me = s.get(f"{BASE_URL}/api/auth/me", timeout=15)
        assert me.status_code == 200, me.text
        d = me.json()
        assert d["industry"] == "education"
        assert "terminology" in d and d["terminology"]["contact"] == "Student"
        assert "organization_name" in d and d["organization_name"]


# ---------- PUT /api/organization/industry ----------
class TestSwitchIndustry:
    def test_org_admin_can_switch_industry(self):
        # Use a freshly-registered org so we don't pollute the demo org.
        email = _unique_email("switch")
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": "Test@1234", "name": "Sw User",
            "organization_name": "Sw Org PhaseA", "industry": "education",
        }, timeout=20)
        assert r.status_code == 200, r.text
        # Switch to it_software
        up = s.put(f"{BASE_URL}/api/organization/industry",
                   json={"industry": "it_software"}, timeout=15)
        assert up.status_code == 200, up.text
        d = up.json()
        assert d["industry"] == "it_software"
        assert d["terminology"]["contact"] == "Client"
        assert d["terminology"]["conversion"] == "Deal"
        # Verify via /me
        me = s.get(f"{BASE_URL}/api/auth/me", timeout=15)
        assert me.status_code == 200
        assert me.json()["industry"] == "it_software"

    def test_counselor_cannot_switch_industry(self):
        s, r = _login(**DEMO_COUNSELOR)
        assert r.status_code == 200, r.text
        up = s.put(f"{BASE_URL}/api/organization/industry",
                   json={"industry": "real_estate"}, timeout=15)
        assert up.status_code == 403, up.text

    def test_telecaller_cannot_switch_industry(self):
        s, r = _login(**DEMO_TELECALLER)
        assert r.status_code == 200, r.text
        up = s.put(f"{BASE_URL}/api/organization/industry",
                   json={"industry": "real_estate"}, timeout=15)
        assert up.status_code == 403, up.text


# ---------- Funnel terminology ----------
class TestFunnelTerminology:
    def test_education_funnel_last_stage_is_enrolled(self):
        s, r = _login(**DEMO_ADMIN)
        assert r.status_code == 200
        f = s.get(f"{BASE_URL}/api/dashboard/funnel", timeout=15)
        assert f.status_code == 200, f.text
        data = f.json()
        assert isinstance(data, list) and data, "funnel must be a non-empty list"
        last = data[-1]
        assert last["raw_stage"] == "Admission Done"
        assert last["stage"] == "Enrolled", f"expected Enrolled, got {last['stage']}"


# ---------- Regression ----------
class TestRegression:
    def test_support_tickets_list(self):
        s, r = _login(**DEMO_ADMIN)
        assert r.status_code == 200
        rt = s.get(f"{BASE_URL}/api/support-tickets", timeout=15)
        assert rt.status_code == 200, rt.text
        assert isinstance(rt.json(), list)

    def test_dashboard_stats(self):
        s, r = _login(**DEMO_ADMIN)
        assert r.status_code == 200
        rs = s.get(f"{BASE_URL}/api/dashboard/stats", timeout=15)
        assert rs.status_code == 200, rs.text
        assert isinstance(rs.json(), dict)

    def test_create_lead_still_works(self):
        s, r = _login(**DEMO_ADMIN)
        assert r.status_code == 200
        # Pick an existing source name from demo org
        srcs = s.get(f"{BASE_URL}/api/lead-sources", timeout=15).json()
        src_name = srcs[0]["name"] if srcs else "Website"
        payload = {
            "name": f"TEST_PhaseA_{uuid.uuid4().hex[:6]}",
            "mobile": f"99999{int(time.time()) % 100000:05d}",
            "course_interested": "PhaseA Regression",
            "lead_source": src_name,
        }
        rc = s.post(f"{BASE_URL}/api/leads", json=payload, timeout=15)
        assert rc.status_code == 200, rc.text
        body = rc.json()
        assert body["name"] == payload["name"]
        assert "lead_id" in body and body["lead_id"].startswith("LEAD")
        # Cleanup created lead
        lead_id = body.get("_id")
        if lead_id:
            s.delete(f"{BASE_URL}/api/leads/{lead_id}", timeout=15)
