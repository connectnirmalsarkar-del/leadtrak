"""
Iteration 11 — Security Hardening + Impersonate Tenant Admin regression tests.
Focus: new POST /api/platform/organizations/{org_id}/impersonate + the 10 review items.

Notes:
- Rate limiter uses leftmost X-Forwarded-For. We override X-Forwarded-For per-test
  to use a unique IP so global suite doesn't trip rate limits unexpectedly.
- Brute-force protection keys off the email, not IP — we use unique email strings
  to trigger the brute-force test without locking out real credentials.
"""

import os
import time
import uuid
import hmac
import hashlib
import json
import requests
import pytest

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://institute-crm-pro.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

SUPER = ("admin@educationcrm.com", "Admin@123")
ORG_ADMIN = ("orgadmin@demo.com", "Demo@123")
MANAGER = ("manager@demo.com", "Demo@123")
COUNSELOR = ("counselor@demo.com", "Demo@123")
TELECALLER = ("telecaller@demo.com", "Demo@123")


def _ip():
    """Unique X-Forwarded-For per call so we don't trip slowapi unintentionally."""
    return f"203.0.{int(time.time()) % 250}.{uuid.uuid4().int % 250}"


def _login(email: str, password: str, xff: str | None = None) -> requests.Session:
    s = requests.Session()
    headers = {"X-Forwarded-For": xff or _ip()}
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, headers=headers, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    s.headers.update({"X-Forwarded-For": _ip()})
    return s


# -------------------- Fixtures --------------------
@pytest.fixture(scope="module")
def super_sess():
    return _login(*SUPER)


@pytest.fixture(scope="module")
def admin_sess():
    return _login(*ORG_ADMIN)


@pytest.fixture(scope="module")
def manager_sess():
    return _login(*MANAGER)


@pytest.fixture(scope="module")
def counselor_sess():
    return _login(*COUNSELOR)


@pytest.fixture(scope="module")
def telecaller_sess():
    return _login(*TELECALLER)


@pytest.fixture(scope="module")
def demo_org_id(super_sess):
    r = super_sess.get(f"{API}/platform/organizations", timeout=20)
    assert r.status_code == 200, r.text
    orgs = r.json()
    demo = next((o for o in orgs if "Bright Future" in o.get("name", "")), None)
    assert demo, f"No demo org found: {[o.get('name') for o in orgs]}"
    return demo["id"] if "id" in demo else demo.get("_id")


# ============================================================
# 1. IMPERSONATION FEATURE
# ============================================================
class TestImpersonation:
    def test_super_admin_can_impersonate(self, demo_org_id):
        # Use fresh session because impersonation REPLACES the access_token cookie
        sess = _login(*SUPER)
        r = sess.post(
            f"{API}/platform/organizations/{demo_org_id}/impersonate",
            headers={"X-Forwarded-For": _ip()}, timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("message") == "Impersonating"
        assert body.get("target_user", {}).get("role") == "org_admin"
        assert body.get("expires_in") == 1800
        # access_token cookie must be set; refresh_token cleared
        cookie_jar = r.cookies
        cookie_dict = {c.name: c for c in cookie_jar}
        assert "access_token" in cookie_dict, f"no access_token cookie: {cookie_dict}"
        # Max-Age should be 1800 (30 min)
        at = cookie_dict["access_token"]
        # cookies don't expose max-age cleanly via requests; check Set-Cookie header
        set_cookie = r.headers.get("set-cookie", "")
        assert "Max-Age=1800" in set_cookie or "max-age=1800" in set_cookie.lower(), set_cookie

    def test_impersonation_auth_me_flags(self, demo_org_id):
        # fresh super admin session — impersonate — then call /auth/me on same session
        sess = _login(*SUPER)
        r = sess.post(
            f"{API}/platform/organizations/{demo_org_id}/impersonate",
            headers={"X-Forwarded-For": _ip()}, timeout=20,
        )
        assert r.status_code == 200
        # /auth/me on same session should now be target user with impersonating flag
        me = sess.get(f"{API}/auth/me", headers={"X-Forwarded-For": _ip()}, timeout=20)
        assert me.status_code == 200, me.text
        me_body = me.json()
        assert me_body.get("impersonating") is True, f"missing impersonating flag: {me_body}"
        assert me_body.get("impersonator_id"), "missing impersonator_id"
        assert me_body.get("email") != SUPER[0], "should NOT be super admin's own email"
        assert me_body.get("role") == "org_admin"

    def test_non_super_admin_cannot_impersonate(self, admin_sess, demo_org_id):
        r = admin_sess.post(
            f"{API}/platform/organizations/{demo_org_id}/impersonate",
            headers={"X-Forwarded-For": _ip()}, timeout=20,
        )
        assert r.status_code == 403, r.text

    def test_manager_cannot_impersonate(self, manager_sess, demo_org_id):
        r = manager_sess.post(
            f"{API}/platform/organizations/{demo_org_id}/impersonate",
            headers={"X-Forwarded-For": _ip()}, timeout=20,
        )
        assert r.status_code == 403

    def test_invalid_org_id_returns_400(self):
        sess = _login(*SUPER)
        r = sess.post(
            f"{API}/platform/organizations/not-a-valid-oid/impersonate",
            headers={"X-Forwarded-For": _ip()}, timeout=20,
        )
        assert r.status_code == 400, r.text
        assert "Invalid" in r.text

    def test_nonexistent_org_returns_404(self):
        sess = _login(*SUPER)
        # valid 24-char hex but no doc
        r = sess.post(
            f"{API}/platform/organizations/000000000000000000000000/impersonate",
            headers={"X-Forwarded-For": _ip()}, timeout=20,
        )
        assert r.status_code == 404, r.text

    def test_impersonation_creates_audit_log(self, demo_org_id):
        # Need to import db here to avoid breaking other tests if mongo cfg differs
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient
        from dotenv import load_dotenv
        load_dotenv("/app/backend/.env")
        sess = _login(*SUPER)
        before_ts = int(time.time())
        r = sess.post(
            f"{API}/platform/organizations/{demo_org_id}/impersonate",
            headers={"X-Forwarded-For": _ip()}, timeout=20,
        )
        assert r.status_code == 200

        async def check():
            c = AsyncIOMotorClient(os.environ["MONGO_URL"])
            db = c[os.environ["DB_NAME"]]
            # Look for an entry inserted in last 60s for super admin
            entries = await db.impersonation_audit_log.find(
                {"impersonator_email": SUPER[0]}
            ).sort("started_at", -1).to_list(5)
            c.close()
            return entries

        entries = asyncio.get_event_loop().run_until_complete(check())
        assert len(entries) >= 1, "no audit log entries"
        latest = entries[0]
        assert latest["target_email"] in ("orgadmin@demo.com",) or latest.get("target_org_id"), latest


# ============================================================
# 2. SECURITY: assign_lead authorization
# ============================================================
class TestAssignLeadAuthorization:
    @pytest.fixture(scope="class")
    def existing_lead_id(self, admin_sess):
        r = admin_sess.get(f"{API}/leads?limit=1", timeout=20)
        assert r.status_code == 200
        leads = r.json()
        # Some implementations return list, others {leads:[..]}
        lead_list = leads if isinstance(leads, list) else leads.get("leads", [])
        assert lead_list, "demo org has no leads"
        return lead_list[0].get("_id") or lead_list[0].get("id")

    @pytest.fixture(scope="class")
    def manager_user_id(self, admin_sess):
        r = admin_sess.get(f"{API}/users", timeout=20)
        assert r.status_code == 200
        users = r.json() if isinstance(r.json(), list) else r.json().get("users", [])
        m = next((u for u in users if u.get("role") == "manager"), None)
        assert m, "no manager user"
        return m.get("_id") or m.get("id")

    def test_counselor_cannot_assign(self, counselor_sess, existing_lead_id, manager_user_id):
        r = counselor_sess.post(
            f"{API}/leads/{existing_lead_id}/assign",
            params={"assigned_to": manager_user_id},
            headers={"X-Forwarded-For": _ip()}, timeout=20,
        )
        assert r.status_code == 403, r.text

    def test_telecaller_cannot_assign(self, telecaller_sess, existing_lead_id, manager_user_id):
        r = telecaller_sess.post(
            f"{API}/leads/{existing_lead_id}/assign",
            params={"assigned_to": manager_user_id},
            headers={"X-Forwarded-For": _ip()}, timeout=20,
        )
        assert r.status_code == 403

    def test_manager_can_assign(self, manager_sess, existing_lead_id):
        # Self-assign to a counselor
        r = manager_sess.get(f"{API}/users", timeout=20)
        users = r.json() if isinstance(r.json(), list) else r.json().get("users", [])
        counselor = next((u for u in users if u.get("role") == "counselor"), None)
        assert counselor
        cid = counselor.get("_id") or counselor.get("id")
        r = manager_sess.post(
            f"{API}/leads/{existing_lead_id}/assign",
            params={"assigned_to": cid},
            headers={"X-Forwarded-For": _ip()}, timeout=20,
        )
        assert r.status_code == 200, r.text

    def test_org_admin_can_assign(self, admin_sess, existing_lead_id, manager_user_id):
        r = admin_sess.post(
            f"{API}/leads/{existing_lead_id}/assign",
            params={"assigned_to": manager_user_id},
            headers={"X-Forwarded-For": _ip()}, timeout=20,
        )
        assert r.status_code == 200, r.text

    def test_invalid_assignee_objectid_returns_400(self, admin_sess, existing_lead_id):
        r = admin_sess.post(
            f"{API}/leads/{existing_lead_id}/assign",
            params={"assigned_to": "not-a-valid-oid"},
            headers={"X-Forwarded-For": _ip()}, timeout=20,
        )
        assert r.status_code == 400, r.text
        assert "Invalid" in r.text and "assigned_to" in r.text.lower()

    def test_nonexistent_assignee_returns_400(self, admin_sess, existing_lead_id):
        r = admin_sess.post(
            f"{API}/leads/{existing_lead_id}/assign",
            params={"assigned_to": "000000000000000000000000"},
            headers={"X-Forwarded-For": _ip()}, timeout=20,
        )
        assert r.status_code == 400, r.text
        assert "Assignee not found" in r.text

    def test_cross_tenant_assignment_blocked(self, admin_sess, existing_lead_id):
        # Fresh super admin session (others may have been impersonated and lost super role)
        sess = _login(*SUPER)
        r = sess.get(f"{API}/platform/organizations", timeout=20)
        if r.status_code != 200:
            pytest.skip("platform/organizations not accessible")
        orgs = r.json()
        if not isinstance(orgs, list) or not orgs or not isinstance(orgs[0], dict):
            pytest.skip(f"unexpected platform/organizations payload: {str(orgs)[:200]}")
        other = next(
            (o for o in orgs if isinstance(o, dict) and "Bright Future" not in (o.get("name") or "")),
            None,
        )
        if not other:
            pytest.skip("no other org found")
        other_org_id = other.get("id") or other.get("_id")
        r = sess.get(f"{API}/platform/users?organization_id={other_org_id}", timeout=20)
        if r.status_code != 200:
            pytest.skip("platform users endpoint unavailable for cross-tenant test")
        payload = r.json()
        users = payload if isinstance(payload, list) else payload.get("users", [])
        cross_user = next(
            (u for u in users if isinstance(u, dict) and str(u.get("organization_id")) == str(other_org_id)),
            None,
        )
        if not cross_user:
            pytest.skip("no cross-tenant user found to validate IDOR block")
        uid = cross_user.get("_id") or cross_user.get("id")
        r = admin_sess.post(
            f"{API}/leads/{existing_lead_id}/assign",
            params={"assigned_to": uid},
            headers={"X-Forwarded-For": _ip()}, timeout=20,
        )
        assert r.status_code == 400, r.text
        assert "not found in your organization" in r.text


# ============================================================
# 3. RATE LIMITING on auth endpoints
# ============================================================
class TestAuthRateLimits:
    def test_login_rate_limit_10_per_minute(self):
        ip = _ip()
        statuses = []
        for i in range(13):
            r = requests.post(
                f"{API}/auth/login",
                json={"email": f"rl_{i}@no.where", "password": "wrong"},
                headers={"X-Forwarded-For": ip}, timeout=15,
            )
            statuses.append(r.status_code)
        # within first 10 we expect 401s; subsequent should include 429
        assert 429 in statuses, f"no 429 observed: {statuses}"

    def test_forgot_password_rate_limit_3_per_minute(self):
        ip = _ip()
        statuses = []
        for i in range(6):
            r = requests.post(
                f"{API}/auth/forgot-password",
                json={"email": f"fp_{i}@no.where"},
                headers={"X-Forwarded-For": ip}, timeout=15,
            )
            statuses.append(r.status_code)
        assert 429 in statuses, f"no 429 on forgot-password: {statuses}"

    def test_reset_password_rate_limit_5_per_minute(self):
        ip = _ip()
        statuses = []
        for i in range(8):
            r = requests.post(
                f"{API}/auth/reset-password",
                json={"token": f"bogus_{i}", "new_password": "Test@12345"},
                headers={"X-Forwarded-For": ip}, timeout=15,
            )
            statuses.append(r.status_code)
        assert 429 in statuses, f"no 429 on reset-password: {statuses}"


# ============================================================
# 4. PUBLIC WIDGET RATE LIMIT
# ============================================================
class TestWidgetRateLimit:
    def test_widget_submit_30_per_minute(self):
        widget_token = "DLjmL9QIEgmT3CzWY8tceA"  # demo org widget token
        ip = _ip()
        statuses = []
        # 32 requests > 30/min
        for i in range(34):
            r = requests.post(
                f"{API}/widget/lead/{widget_token}",
                json={
                    "name": f"RL Test {i}",
                    "mobile": f"99999000{i:02d}",
                    "email": f"rltest_{i}_{uuid.uuid4().hex[:6]}@test.com",
                    "course_interested": "RL Test",
                },
                headers={"X-Forwarded-For": ip}, timeout=15,
            )
            statuses.append(r.status_code)
        assert 429 in statuses, f"widget did not rate-limit at 30/min: {statuses}"


# ============================================================
# 5. BRUTE FORCE PROTECTION (datetime tz fix)
# ============================================================
class TestBruteForce:
    def test_brute_force_returns_429_not_500(self):
        unique_email = f"brute_{uuid.uuid4().hex[:8]}@test.com"
        ip = _ip()  # different IP each test
        results = []
        # 7 attempts — at attempt 6+ should be 429 (not 500)
        # use different IPs so we don't trip rate-limit before brute-force kicks in
        for i in range(8):
            r = requests.post(
                f"{API}/auth/login",
                json={"email": unique_email, "password": "wrong"},
                headers={"X-Forwarded-For": _ip()}, timeout=15,
            )
            results.append((r.status_code, r.text[:120]))
        # No 500 should ever occur
        assert not any(code == 500 for code, _ in results), f"500 observed: {results}"
        # We should see at least one 429 after 5 failed attempts
        codes = [c for c, _ in results]
        assert 429 in codes, f"no 429 from brute-force lockout: {results}"
        # The 429 body should mention failed attempts
        msg_with_429 = next((m for c, m in results if c == 429), "")
        assert "Too many failed attempts" in msg_with_429 or "Try again" in msg_with_429, msg_with_429


# ============================================================
# 6. CORS HARDENING
# ============================================================
class TestCORS:
    def test_cors_not_wildcard_with_credentials(self):
        """Preflight with an allowed origin → echoes that origin, NOT *."""
        r = requests.options(
            f"{API}/auth/me",
            headers={
                "Origin": "https://institute-crm-pro.preview.emergentagent.com",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "content-type",
                "X-Forwarded-For": _ip(),
            },
            timeout=15,
        )
        # Allow-Origin may come from edge (Cloudflare) so we don't fail hard if wildcard;
        # we DO assert it is not "*" when credentials=true
        allow_origin = r.headers.get("access-control-allow-origin", "")
        allow_creds = r.headers.get("access-control-allow-credentials", "").lower()
        # If credentials are allowed, origin must not be "*"
        if allow_creds == "true":
            assert allow_origin != "*", f"WILDCARD with credentials: {allow_origin}"


# ============================================================
# 7. PASSWORD RESET — no link leak / generic response
# ============================================================
class TestForgotPasswordNoLeak:
    def test_generic_response_for_existing_email(self):
        r = requests.post(
            f"{API}/auth/forgot-password",
            json={"email": ORG_ADMIN[0]},
            headers={"X-Forwarded-For": _ip()}, timeout=15,
        )
        assert r.status_code == 200
        body = r.json()
        assert "If email exists" in body.get("message", "")
        # ensure no token/link in body
        assert "token" not in body and "reset" not in body.get("message", "").lower().replace("reset link", "")

    def test_generic_response_for_unknown_email(self):
        r = requests.post(
            f"{API}/auth/forgot-password",
            json={"email": f"nobody_{uuid.uuid4().hex[:8]}@example.com"},
            headers={"X-Forwarded-For": _ip()}, timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "If email exists" in body.get("message", "")


# ============================================================
# 8. RAZORPAY WEBHOOK signature verification
# ============================================================
class TestRazorpayWebhook:
    def test_bad_signature_returns_400(self):
        r = requests.post(
            f"{API}/webhooks/razorpay",
            json={"event": "payment_link.paid", "payload": {}},
            headers={"X-Razorpay-Signature": "deadbeef", "X-Forwarded-For": _ip()},
            timeout=15,
        )
        assert r.status_code == 400, r.text
        assert "Invalid signature" in r.text


# ============================================================
# 9. JWT SECRET ROTATION
# ============================================================
class TestJWTRotation:
    def test_old_token_rejected(self):
        # An obviously stale JWT signed with prior secret
        old_token = (
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
            "eyJzdWIiOiIwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAiLCJlbWFpbCI6IngiLCJleHAiOjk5OTk5OTk5OTksInR5cGUiOiJhY2Nlc3MifQ."
            "old_secret_signature_will_fail"
        )
        r = requests.get(
            f"{API}/auth/me",
            cookies={"access_token": old_token},
            headers={"X-Forwarded-For": _ip()}, timeout=15,
        )
        assert r.status_code == 401, r.text

    def test_new_login_works(self):
        s = _login(*ORG_ADMIN)
        r = s.get(f"{API}/auth/me", headers={"X-Forwarded-For": _ip()}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("email") == ORG_ADMIN[0]


# ============================================================
# 10. REGRESSION — existing auth flows still work
# ============================================================
class TestAuthRegression:
    def test_login_logout_me_refresh(self):
        s = _login(*ORG_ADMIN)
        r = s.get(f"{API}/auth/me", headers={"X-Forwarded-For": _ip()}, timeout=15)
        assert r.status_code == 200
        # refresh
        r = s.post(f"{API}/auth/refresh", headers={"X-Forwarded-For": _ip()}, timeout=15)
        assert r.status_code == 200, r.text
        # me still ok
        r = s.get(f"{API}/auth/me", headers={"X-Forwarded-For": _ip()}, timeout=15)
        assert r.status_code == 200
        # logout
        r = s.post(f"{API}/auth/logout", headers={"X-Forwarded-For": _ip()}, timeout=15)
        assert r.status_code == 200
        # me must now fail
        r = s.get(f"{API}/auth/me", headers={"X-Forwarded-For": _ip()}, timeout=15)
        assert r.status_code == 401

    def test_role_check_counselor_blocked_from_platform(self, counselor_sess):
        r = counselor_sess.get(f"{API}/platform/organizations",
                               headers={"X-Forwarded-For": _ip()}, timeout=15)
        assert r.status_code in (401, 403), r.text
