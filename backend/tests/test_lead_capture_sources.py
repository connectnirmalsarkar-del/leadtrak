"""Regression test for ALL lead capture sources (iteration 8).

Covers:
 - GET /api/leads/form-config (industry-specific extras)
 - GET /api/leads/csv-sample (12 columns)
 - POST /api/leads/import-csv (extras persisted, mixed valid/invalid rows)
 - POST /api/leads manual create with extras
 - GET /api/integrations/facebook-leads (Meta verify handshake)
 - POST /api/integrations/facebook-leads (HMAC verify, tenant resolve, idempotency)
 - POST /api/integrations/google-ads/{tenant_id} (flat + native user_column_data, idempotency)
"""

import hmac
import hashlib
import io
import json
import os
import time
import uuid

import pytest
import requests

def _read_backend_url():
    if os.environ.get("REACT_APP_BACKEND_URL"):
        return os.environ["REACT_APP_BACKEND_URL"]
    # Fallback: read frontend .env
    env_path = "/app/frontend/.env"
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise RuntimeError("REACT_APP_BACKEND_URL not configured")


BASE_URL = _read_backend_url().rstrip("/")
API = f"{BASE_URL}/api"

SUPER_ADMIN = {"email": "admin@educationcrm.com", "password": "Admin@123"}
ORG_ADMIN = {"email": "orgadmin@demo.com", "password": "Demo@123"}

FB_PAGE_ID = "FBPAGE_TEST_123"
FB_APP_SECRET = "testappsecret"
FB_VERIFY_TOKEN = "demo_verify_token"
GOOGLE_KEY = "google_test_key_abc"


# --------------- Fixtures ---------------
def _login(email: str, password: str) -> requests.Session:
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    # Auth via httpOnly cookies — session stores them automatically
    assert s.cookies.get("access_token"), "access_token cookie not set"
    return s


@pytest.fixture(scope="session")
def org_admin_session():
    return _login(ORG_ADMIN["email"], ORG_ADMIN["password"])


@pytest.fixture(scope="session")
def org_admin_headers(org_admin_session):
    # Some tests in this file use the "headers" name purely for compatibility.
    # Returning {} is fine because the session has cookies.
    return {}


@pytest.fixture(scope="session")
def super_admin_session():
    return _login(SUPER_ADMIN["email"], SUPER_ADMIN["password"])


@pytest.fixture(scope="session")
def demo_org_id(org_admin_session):
    """Resolve demo org id (tenant id used in google-ads URL)."""
    r = org_admin_session.get(f"{API}/auth/me", timeout=15)
    assert r.status_code == 200
    return r.json()["organization_id"]


# --------------- Form Config + CSV Sample ---------------
class TestFormConfig:
    def test_form_config_requires_auth(self):
        r = requests.get(f"{API}/leads/form-config", timeout=10)
        assert r.status_code in (401, 403)

    def test_form_config_returns_industry_and_fields(self, org_admin_session):
        r = org_admin_session.get(f"{API}/leads/form-config", timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "industry" in data
        assert "fields" in data and isinstance(data["fields"], list)
        assert "services" in data and isinstance(data["services"], list)
        # Demo tenant is Education → expect course_interested
        field_keys = {f.get("name") or f.get("key") for f in data["fields"]}
        assert any("course" in (k or "").lower() for k in field_keys), f"fields={data['fields']}"


class TestCsvSample:
    def test_csv_sample_has_12_columns(self, org_admin_session):
        r = org_admin_session.get(f"{API}/leads/csv-sample", timeout=10)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        lines = r.text.strip().split("\n")
        header = lines[0].split(",")
        assert len(header) == 12, f"Expected 12 cols, got {len(header)}: {header}"
        for col in ["name", "mobile", "email", "course", "source", "state",
                    "city", "company_name", "budget_range", "preferred_date",
                    "travellers", "temperature"]:
            assert col in header, f"missing col {col}"
        # +3 sample rows
        assert len(lines) >= 4


# --------------- CSV Import with extras ---------------
class TestCsvImport:
    def test_import_csv_persists_extras_and_skips_invalid(self, org_admin_session):
        tag = uuid.uuid4().hex[:6]
        mob_prefix = f"888{int(time.time())%1000000:06d}"
        csv_text = (
            "name,mobile,email,course,source,state,city,company_name,budget_range,preferred_date,travellers,temperature\n"
            f"TEST_CSV_A_{tag},{mob_prefix}1,test_csv_a_{tag}@ex.com,MBA,Facebook Ad,MH,Mumbai,,,,,hot\n"
            f"TEST_CSV_B_{tag},{mob_prefix}2,test_csv_b_{tag}@ex.com,2 BHK,Website,KA,Bengaluru,Acme Realty,₹50L - ₹1Cr,,,warm\n"
            f"TEST_CSV_C_{tag},{mob_prefix}3,test_csv_c_{tag}@ex.com,Goa Trip,Google Ad,GJ,Ahmedabad,,,2026-06-15,3,warm\n"
            f",{mob_prefix}4,bad@ex.com,no-name,,,,,,,,\n"
            f"TEST_CSV_D_{tag},,bad2@ex.com,no-mobile,,,,,,,,\n"
        )
        files = {"file": ("leads.csv", csv_text, "text/csv")}
        r = org_admin_session.post(f"{API}/leads/import-csv", files=files, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["imported"] == 3, body
        assert body["total_errors"] >= 2, body

        # Verify extras persisted on row B (budget_range) and row C (preferred_date, travellers)
        r2 = org_admin_session.get(f"{API}/leads", params={"search": f"TEST_CSV_B_{tag}"}, timeout=15)
        assert r2.status_code == 200
        b_rows = [x for x in r2.json() if x.get("name") == f"TEST_CSV_B_{tag}"]
        assert b_rows, "row B not found"
        assert b_rows[0].get("company_name") == "Acme Realty"
        assert b_rows[0].get("budget_range") == "₹50L - ₹1Cr"

        r3 = org_admin_session.get(f"{API}/leads", params={"search": f"TEST_CSV_C_{tag}"}, timeout=15)
        c_rows = [x for x in r3.json() if x.get("name") == f"TEST_CSV_C_{tag}"]
        assert c_rows
        assert c_rows[0].get("preferred_date") == "2026-06-15"
        assert str(c_rows[0].get("travellers")) == "3"


# --------------- Manual Create with extras ---------------
class TestManualCreate:
    def test_manual_create_persists_extras(self, org_admin_session):
        tag = uuid.uuid4().hex[:6]
        payload = {
            "name": f"TEST_MAN_{tag}",
            "mobile": f"99911{tag[:5]}",
            "email": f"test_man_{tag}@ex.com",
            "course_interested": "MBA",
            "lead_source": "Manual",
            "company_name": "Foo Corp",
            "budget_range": "₹10L - ₹25L",
            "preferred_date": "2026-08-01",
            "travellers": "2",
            "remarks": "Test extras",
        }
        r = org_admin_session.post(f"{API}/leads", json=payload, timeout=15)
        assert r.status_code in (200, 201), r.text
        created = r.json()
        lead_doc_id = created.get("_id") or created.get("id")
        assert lead_doc_id
        # Get-back persistence check
        g = org_admin_session.get(f"{API}/leads/{lead_doc_id}", timeout=15)
        assert g.status_code == 200, g.text
        data = g.json()
        assert data["company_name"] == "Foo Corp"
        assert data["budget_range"] == "₹10L - ₹25L"
        assert data["preferred_date"] == "2026-08-01"
        assert str(data["travellers"]) == "2"
        assert data["remarks"] == "Test extras"


# --------------- Facebook Webhook ---------------
class TestFacebookWebhook:
    def test_verify_returns_challenge_on_correct_token(self):
        r = requests.get(
            f"{API}/integrations/facebook-leads",
            params={
                "hub.mode": "subscribe",
                "hub.verify_token": FB_VERIFY_TOKEN,
                "hub.challenge": "ping-12345",
            },
            timeout=10,
        )
        assert r.status_code == 200, r.text
        assert r.text == "ping-12345"

    def test_verify_403_on_wrong_token(self):
        r = requests.get(
            f"{API}/integrations/facebook-leads",
            params={"hub.mode": "subscribe", "hub.verify_token": "WRONG", "hub.challenge": "x"},
            timeout=10,
        )
        assert r.status_code == 403

    def _signed_post(self, payload: dict, secret: str):
        raw = json.dumps(payload).encode("utf-8")
        sig = "sha256=" + hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
        return requests.post(
            f"{API}/integrations/facebook-leads",
            data=raw,
            headers={"Content-Type": "application/json", "X-Hub-Signature-256": sig},
            timeout=15,
        )

    def test_webhook_bad_signature_returns_401(self):
        payload = {
            "entry": [{
                "id": FB_PAGE_ID,
                "changes": [{"field": "leadgen", "value": {"leadgen_id": f"LG_{uuid.uuid4().hex[:8]}"}}],
            }]
        }
        r = self._signed_post(payload, "WRONG_SECRET")
        assert r.status_code == 401, r.text

    def test_webhook_correct_signature_returns_ok_idempotent(self):
        leadgen_id = f"LG_{uuid.uuid4().hex[:10]}"
        payload = {
            "entry": [{
                "id": FB_PAGE_ID,
                "changes": [{"field": "leadgen", "value": {"leadgen_id": leadgen_id}}],
            }]
        }
        r1 = self._signed_post(payload, FB_APP_SECRET)
        assert r1.status_code == 200, r1.text
        assert r1.json().get("status") == "ok"
        # Second delivery should also be 200 (idempotent) — imported should be 0 either way (fake token)
        r2 = self._signed_post(payload, FB_APP_SECRET)
        assert r2.status_code == 200

    def test_webhook_unknown_page_id_ignored(self):
        payload = {
            "entry": [{
                "id": "FBPAGE_DOES_NOT_EXIST",
                "changes": [{"field": "leadgen", "value": {"leadgen_id": "LG_x"}}],
            }]
        }
        # signature is verified only after page lookup, so wrong secret here doesn't matter
        raw = json.dumps(payload).encode("utf-8")
        r = requests.post(
            f"{API}/integrations/facebook-leads",
            data=raw,
            headers={"Content-Type": "application/json",
                     "X-Hub-Signature-256": "sha256=" + hmac.new(b"x", raw, hashlib.sha256).hexdigest()},
            timeout=10,
        )
        # Should be 200 with imported=0 (unknown page is skipped silently)
        assert r.status_code == 200, r.text
        assert r.json().get("imported") == 0


# --------------- Google Ads Webhook ---------------
class TestGoogleAdsWebhook:
    def test_wrong_key_returns_401(self, demo_org_id):
        r = requests.post(
            f"{API}/integrations/google-ads/{demo_org_id}",
            json={"google_key": "WRONG", "name": "X", "mobile": "9999000000"},
            timeout=10,
        )
        assert r.status_code == 401

    def test_unknown_tenant_returns_404(self):
        r = requests.post(
            f"{API}/integrations/google-ads/000000000000000000000000",
            json={"google_key": GOOGLE_KEY, "name": "X", "mobile": "9999000000"},
            timeout=10,
        )
        assert r.status_code == 404

    def test_flat_payload_creates_lead(self, demo_org_id, org_admin_session):
        tag = uuid.uuid4().hex[:8]
        ext_id = f"gads-flat-{tag}"
        payload = {
            "lead_id": ext_id,
            "google_key": GOOGLE_KEY,
            "name": f"TEST_GAds_Flat_{tag}",
            "mobile": f"99922{tag[:5]}",
            "email": f"gads_flat_{tag}@ex.com",
            "course_interested": "MBA",
            "state": "MH",
            "city": "Mumbai",
        }
        r = requests.post(f"{API}/integrations/google-ads/{demo_org_id}", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("status") == "ok"
        assert body.get("lead_id"), body
        # Duplicate POST with same lead_id → idempotent
        r2 = requests.post(f"{API}/integrations/google-ads/{demo_org_id}", json=payload, timeout=15)
        assert r2.status_code == 200
        body2 = r2.json()
        assert body2.get("duplicate") is True
        assert body2.get("lead_id") is None

        # Verify lead exists and has source='Google Ads'
        g = org_admin_session.get(f"{API}/leads",
                         params={"search": f"TEST_GAds_Flat_{tag}"}, timeout=15)
        assert g.status_code == 200
        rows = [x for x in g.json() if x.get("name") == f"TEST_GAds_Flat_{tag}"]
        assert rows, "lead not found"
        assert rows[0].get("lead_source") == "Google Ads"

    def test_native_user_column_data_creates_lead(self, demo_org_id, org_admin_session):
        tag = uuid.uuid4().hex[:8]
        ext_id = f"gads-native-{tag}"
        payload = {
            "lead_id": ext_id,
            "google_key": GOOGLE_KEY,
            "user_column_data": [
                {"column_id": "FULL_NAME", "string_value": f"TEST_GAds_Native_{tag}"},
                {"column_id": "PHONE_NUMBER", "string_value": f"99933{tag[:5]}"},
                {"column_id": "EMAIL", "string_value": f"gads_native_{tag}@ex.com"},
                {"column_id": "CITY", "string_value": "Pune"},
                {"column_id": "STATE", "string_value": "MH"},
            ],
        }
        r = requests.post(f"{API}/integrations/google-ads/{demo_org_id}", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("lead_id"), body
        # Verify persisted
        g = org_admin_session.get(f"{API}/leads",
                         params={"search": f"TEST_GAds_Native_{tag}"}, timeout=15)
        rows = [x for x in g.json() if x.get("name") == f"TEST_GAds_Native_{tag}"]
        assert rows, "native lead not found"
        assert rows[0]["mobile"] == f"99933{tag[:5]}"
        assert rows[0]["email"] == f"gads_native_{tag}@ex.com"
        assert rows[0]["city"] == "Pune"
        assert rows[0].get("lead_source") == "Google Ads"

    def test_missing_name_or_mobile_returns_400(self, demo_org_id):
        r = requests.post(
            f"{API}/integrations/google-ads/{demo_org_id}",
            json={"google_key": GOOGLE_KEY, "name": "Only Name"},
            timeout=10,
        )
        assert r.status_code == 400


# --------------- Regression: existing leads listing still works ---------------
class TestLeadListingRegression:
    def test_list_leads_still_works(self, org_admin_session):
        r = org_admin_session.get(f"{API}/leads", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_subscription_status_regression(self, org_admin_session):
        r = org_admin_session.get(f"{API}/subscription/status", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert "status" in data
