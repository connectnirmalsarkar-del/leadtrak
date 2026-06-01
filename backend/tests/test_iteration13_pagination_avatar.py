"""Iteration 13 — P1 enhancements regression tests.

Coverage:
  • Pagination shape for GET /api/leads + /api/followups
  • Multi-page traversal, filters, RBAC (counselor scoping)
  • Followups filter_type (today/upcoming/missed) segregation
  • Self-profile update PUT /api/users/me (+ route-order vs /users/{id})
  • Avatar upload POST /api/uploads/avatar (size/mime validations)
  • Avatar removal DELETE /api/uploads/avatar
  • GET /api/auth/me returns avatar_url after upload
"""
import io
import os
import struct
import zlib
import pytest
import requests
from datetime import datetime, timezone, timedelta

def _load_frontend_env_url():
    env_path = "/app/frontend/.env"
    try:
        with open(env_path) as f:
            for line in f:
                if line.strip().startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except Exception:
        return None
    return None


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _load_frontend_env_url()).rstrip("/")
API = f"{BASE_URL}/api"

SUPER_ADMIN = {"email": "admin@educationcrm.com", "password": "Admin@123"}
ORG_ADMIN = {"email": "orgadmin@demo.com", "password": "Demo@123"}
COUNSELOR = {"email": "counselor@demo.com", "password": "Demo@123"}


def _png_bytes(size_kb: int = 1) -> bytes:
    """Generate a valid tiny PNG, padded with a tEXt chunk to reach `size_kb` KB."""
    # 1x1 transparent PNG
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = b"\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00"
    ihdr_crc = zlib.crc32(b"IHDR" + ihdr)
    ihdr_chunk = struct.pack(">I", 13) + b"IHDR" + ihdr + struct.pack(">I", ihdr_crc)
    raw = b"\x00\x00\x00\x00\x00"
    comp = zlib.compress(raw)
    idat_crc = zlib.crc32(b"IDAT" + comp)
    idat_chunk = struct.pack(">I", len(comp)) + b"IDAT" + comp + struct.pack(">I", idat_crc)
    # Pad with tEXt keyword/value chunk so total size ~= size_kb
    target = size_kb * 1024
    base = sig + ihdr_chunk + idat_chunk
    # Need to add overhead for tEXt chunk header (4 len + 4 type + crc4) = 12, plus IEND 12
    pad_needed = max(0, target - len(base) - 12 - 12 - len(b"comment\x00"))
    text_data = b"comment\x00" + (b"A" * pad_needed)
    text_crc = zlib.crc32(b"tEXt" + text_data)
    text_chunk = struct.pack(">I", len(text_data)) + b"tEXt" + text_data + struct.pack(">I", text_crc)
    iend_crc = zlib.crc32(b"IEND")
    iend_chunk = struct.pack(">I", 0) + b"IEND" + struct.pack(">I", iend_crc)
    return base + text_chunk + iend_chunk


def _login(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds, timeout=15)
    if r.status_code != 200:
        return None
    # Token may be in body OR in httpOnly cookie
    try:
        body = r.json()
        if isinstance(body, dict) and body.get("access_token"):
            return body["access_token"]
    except Exception:
        pass
    return s.cookies.get("access_token")


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- session-scoped fixtures (reuse tokens; avoid hammering rate-limit) ----------
@pytest.fixture(scope="session")
def org_admin_token():
    tok = _login(ORG_ADMIN)
    if not tok:
        pytest.skip("Org admin login failed")
    return tok


@pytest.fixture(scope="session")
def counselor_token():
    tok = _login(COUNSELOR)
    if not tok:
        pytest.skip("Counselor login failed")
    return tok


@pytest.fixture(scope="session")
def super_admin_token():
    tok = _login(SUPER_ADMIN)
    if not tok:
        pytest.skip("Super admin login failed")
    return tok


@pytest.fixture(scope="session")
def seeded_leads(org_admin_token):
    """Create 5 TEST_ leads for pagination tests and clean up at the end."""
    h = _auth(org_admin_token)
    created = []
    for i in range(5):
        payload = {
            "name": f"TEST_LeadPag {i}",
            "mobile": f"99000000{i:02d}",
            "email": f"test_pag_{i}@example.com",
            "lead_source": "Website",
            "course_interested": "TEST_Course",
        }
        r = requests.post(f"{API}/leads", json=payload, headers=h, timeout=15)
        if r.status_code in (200, 201):
            created.append(r.json().get("_id") or r.json().get("id"))
    yield created
    # Cleanup
    for lid in created:
        if lid:
            requests.delete(f"{API}/leads/{lid}", headers=h, timeout=15)


@pytest.fixture(scope="session")
def seeded_followups(org_admin_token, seeded_leads):
    """Create today + upcoming + missed followups for filter_type tests."""
    h = _auth(org_admin_token)
    if not seeded_leads:
        yield []
        return
    today = datetime.now(timezone.utc).date()
    plans = [
        (today.isoformat(), seeded_leads[0]),
        ((today + timedelta(days=2)).isoformat(), seeded_leads[1] if len(seeded_leads) > 1 else seeded_leads[0]),
        ((today - timedelta(days=2)).isoformat(), seeded_leads[2] if len(seeded_leads) > 2 else seeded_leads[0]),
    ]
    created = []
    for date_str, lid in plans:
        payload = {
            "lead_id": lid,
            "followup_date": date_str,
            "followup_time": "10:00",
            "remarks": "TEST_pagination",
        }
        r = requests.post(f"{API}/followups", json=payload, headers=h, timeout=15)
        if r.status_code in (200, 201):
            created.append(r.json().get("_id"))
    yield created
    for fid in created:
        if fid:
            requests.delete(f"{API}/followups/{fid}", headers=h, timeout=15)


# ============================================================
# 1. Pagination shape — /api/leads
# ============================================================
class TestLeadsPagination:
    def test_paginated_shape(self, org_admin_token, seeded_leads):
        r = requests.get(f"{API}/leads?page=1&limit=20", headers=_auth(org_admin_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        for key in ("items", "total", "page", "limit", "total_pages"):
            assert key in data, f"missing key {key} in paginated response"
        assert isinstance(data["items"], list)
        assert data["page"] == 1
        assert data["limit"] == 20
        assert data["total"] >= len(seeded_leads)

    def test_pagination_page_traversal(self, org_admin_token, seeded_leads):
        r1 = requests.get(f"{API}/leads?page=1&limit=2", headers=_auth(org_admin_token), timeout=15)
        assert r1.status_code == 200
        d1 = r1.json()
        if d1["total"] <= 2:
            pytest.skip("Not enough leads to test page traversal")
        assert len(d1["items"]) == 2
        assert d1["total_pages"] >= 2
        r2 = requests.get(f"{API}/leads?page=2&limit=2", headers=_auth(org_admin_token), timeout=15)
        assert r2.status_code == 200
        d2 = r2.json()
        ids1 = {it.get("_id") for it in d1["items"]}
        ids2 = {it.get("_id") for it in d2["items"]}
        assert ids1.isdisjoint(ids2), "Page 1 and 2 must not overlap"

    def test_filter_status_new(self, org_admin_token):
        r = requests.get(f"{API}/leads?status=New&page=1&limit=50",
                         headers=_auth(org_admin_token), timeout=15)
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["status"] == "New"

    def test_search_filter(self, org_admin_token):
        r = requests.get(f"{API}/leads?search=TEST_LeadPag&page=1&limit=50",
                         headers=_auth(org_admin_token), timeout=15)
        assert r.status_code == 200
        items = r.json()["items"]
        assert all("TEST_LeadPag" in it.get("name", "") for it in items)

    def test_counselor_rbac_scope(self, counselor_token):
        r = requests.get(f"{API}/leads?page=1&limit=200",
                         headers=_auth(counselor_token), timeout=15)
        assert r.status_code == 200
        # User id of counselor
        me = requests.get(f"{API}/auth/me", headers=_auth(counselor_token), timeout=15).json()
        my_id = me["id"]
        for it in r.json()["items"]:
            # Counselor should only see leads assigned to them
            assert it.get("assigned_to") == my_id, (
                f"Counselor saw lead not assigned to them: {it.get('_id')} -> {it.get('assigned_to')}"
            )


# ============================================================
# 2. Pagination shape — /api/followups
# ============================================================
class TestFollowupsPagination:
    def test_paginated_shape(self, org_admin_token, seeded_followups):
        r = requests.get(f"{API}/followups?page=1&limit=25",
                         headers=_auth(org_admin_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        for key in ("items", "total", "page", "limit", "total_pages"):
            assert key in d
        assert d["limit"] == 25
        assert d["page"] == 1

    def test_filter_today(self, org_admin_token, seeded_followups):
        r = requests.get(f"{API}/followups?filter_type=today&page=1&limit=25",
                         headers=_auth(org_admin_token), timeout=15)
        assert r.status_code == 200
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        for it in r.json()["items"]:
            assert it.get("followup_date") == today

    def test_filter_upcoming(self, org_admin_token, seeded_followups):
        r = requests.get(f"{API}/followups?filter_type=upcoming&page=1&limit=25",
                         headers=_auth(org_admin_token), timeout=15)
        assert r.status_code == 200
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        for it in r.json()["items"]:
            assert it.get("followup_date") > today

    def test_filter_missed(self, org_admin_token, seeded_followups):
        r = requests.get(f"{API}/followups?filter_type=missed&page=1&limit=25",
                         headers=_auth(org_admin_token), timeout=15)
        assert r.status_code == 200
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        for it in r.json()["items"]:
            assert it.get("followup_date") < today
            assert it.get("completed") is False


# ============================================================
# 3. PUT /api/users/me — route ordering + validation
# ============================================================
class TestUsersMeRouteOrdering:
    def test_update_name_and_mobile(self, org_admin_token):
        # Get current
        me = requests.get(f"{API}/auth/me", headers=_auth(org_admin_token), timeout=15).json()
        original_name = me["name"]
        original_mobile = me.get("mobile") or ""

        payload = {"name": "TEST_Riya Updated", "mobile": "9123456780"}
        r = requests.put(f"{API}/users/me", json=payload,
                         headers=_auth(org_admin_token), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("name") == "TEST_Riya Updated"
        assert body.get("mobile") == "9123456780"

        # Verify persistence
        me2 = requests.get(f"{API}/auth/me", headers=_auth(org_admin_token), timeout=15).json()
        assert me2["name"] == "TEST_Riya Updated"
        assert me2.get("mobile") == "9123456780"

        # Restore
        requests.put(f"{API}/users/me", json={"name": original_name, "mobile": original_mobile},
                     headers=_auth(org_admin_token), timeout=15)

    def test_route_order_me_not_treated_as_user_id(self, counselor_token):
        # Counselors are NOT authorized to call /users/{user_id}; if /users/me
        # were routed there, response would be 403 (role check) instead of 200.
        r = requests.put(f"{API}/users/me", json={"name": "TEST_Priya Self"},
                         headers=_auth(counselor_token), timeout=15)
        assert r.status_code == 200, (
            f"PUT /users/me returned {r.status_code} for counselor — likely matched by /users/{{id}}"
        )
        # restore
        requests.put(f"{API}/users/me", json={"name": "Priya Sharma"},
                     headers=_auth(counselor_token), timeout=15)

    def test_empty_name_rejected(self, org_admin_token):
        r = requests.put(f"{API}/users/me", json={"name": "   "},
                         headers=_auth(org_admin_token), timeout=15)
        assert r.status_code == 400

    def test_long_name_rejected(self, org_admin_token):
        r = requests.put(f"{API}/users/me", json={"name": "A" * 200},
                         headers=_auth(org_admin_token), timeout=15)
        assert r.status_code == 400

    def test_no_fields_rejected(self, org_admin_token):
        r = requests.put(f"{API}/users/me", json={},
                         headers=_auth(org_admin_token), timeout=15)
        assert r.status_code == 400


# ============================================================
# 4. Avatar upload — POST/DELETE /api/uploads/avatar + auth/me
# ============================================================
class TestAvatarUpload:
    def test_upload_rejects_pdf(self, org_admin_token):
        pdf = b"%PDF-1.4\n%fake\n"
        files = {"file": ("test.pdf", io.BytesIO(pdf), "application/pdf")}
        r = requests.post(f"{API}/uploads/avatar", files=files,
                          headers=_auth(org_admin_token), timeout=20)
        assert r.status_code == 400
        assert "not allowed" in r.json().get("detail", "").lower()

    def test_upload_rejects_oversized(self, org_admin_token):
        big_png = _png_bytes(size_kb=900)  # > 800 KB
        assert len(big_png) > 800 * 1024
        files = {"file": ("big.png", io.BytesIO(big_png), "image/png")}
        r = requests.post(f"{API}/uploads/avatar", files=files,
                          headers=_auth(org_admin_token), timeout=20)
        assert r.status_code == 400
        assert "too large" in r.json().get("detail", "").lower()

    def test_upload_png_success_and_me_reflects(self, org_admin_token):
        if not os.environ.get("CLOUDINARY_CLOUD_NAME"):
            # not really required since backend would 500-with-detail, but be polite
            pass
        png = _png_bytes(size_kb=2)
        files = {"file": ("avatar.png", io.BytesIO(png), "image/png")}
        r = requests.post(f"{API}/uploads/avatar", files=files,
                          headers=_auth(org_admin_token), timeout=30)
        if r.status_code == 500 and "not configured" in r.text.lower():
            pytest.skip("Cloudinary not configured in this env")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "avatar_url" in data
        assert data["avatar_url"].startswith("https://")

        # auth/me must include avatar_url
        me = requests.get(f"{API}/auth/me", headers=_auth(org_admin_token), timeout=15).json()
        assert me.get("avatar_url") == data["avatar_url"]

    def test_delete_avatar_clears_field(self, org_admin_token):
        r = requests.delete(f"{API}/uploads/avatar",
                            headers=_auth(org_admin_token), timeout=15)
        assert r.status_code == 200
        me = requests.get(f"{API}/auth/me", headers=_auth(org_admin_token), timeout=15).json()
        assert me.get("avatar_url") in (None, "", )
