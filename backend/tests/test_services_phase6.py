"""Phase 6: Services Catalog & Discount Workflow backend tests.

Covers:
- GET /api/services — auto-seeded 5 education services for demo org
- GET /api/services?include_inactive=true
- POST /api/services — RBAC + min_price > base_price validation
- PUT /api/services/{id} — partial update, min_price floor against existing base_price
- DELETE /api/services/{id} — cross-org 404
- POST /api/admissions with service_id + discount: above-floor success, below-floor 400, timeline logs full discount payload
- POST /api/admissions without service_id (backward compat)
- POST /api/admissions with invalid service_id → 404
- POST /api/uploads/voice-recording — 4 MB succeeds, 5.5 MB rejected (400), duration=200s succeeds, 320s rejected
- POST /api/auth/register with industry=real_estate seeds 5 real-estate services
"""
import io
import os
import struct
import uuid
import wave
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as fh:
        for line in fh:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

ADMIN = {"email": "orgadmin@demo.com", "password": "Demo@123"}
MANAGER = {"email": "manager@demo.com", "password": "Demo@123"}
COUNSELOR = {"email": "counselor@demo.com", "password": "Demo@123"}
TELECALLER = {"email": "telecaller@demo.com", "password": "Demo@123"}
SUPER_ADMIN = {"email": "admin@educationcrm.com", "password": "Admin@123"}


def _login(creds):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"Login failed for {creds['email']}: {r.status_code} {r.text}"
    return s


# ==================== Fixtures ====================
@pytest.fixture(scope="session")
def admin_session():
    return _login(ADMIN)


@pytest.fixture(scope="session")
def manager_session():
    return _login(MANAGER)


@pytest.fixture(scope="session")
def counselor_session():
    return _login(COUNSELOR)


@pytest.fixture(scope="session")
def telecaller_session():
    return _login(TELECALLER)


@pytest.fixture(scope="session")
def super_admin_session():
    return _login(SUPER_ADMIN)


def _gen_wav_bytes(target_size_bytes: int = 0, seconds: float = 1.0, framerate: int = 44100) -> bytes:
    """Generate a real (silent) WAV file of approximately target_size_bytes.
    If target_size_bytes given, frames count is derived so the resulting file is >= target.
    """
    buf = io.BytesIO()
    sampwidth = 2  # 16-bit mono
    nchannels = 1
    if target_size_bytes:
        # WAV header ≈ 44 bytes; each sample = sampwidth bytes
        n_frames = max(1, (target_size_bytes - 44) // sampwidth + 1)
    else:
        n_frames = int(seconds * framerate)
    with wave.open(buf, "wb") as w:
        w.setnchannels(nchannels)
        w.setsampwidth(sampwidth)
        w.setframerate(framerate)
        # Write zero (silent) frames in chunks
        chunk = b"\x00\x00" * 8192
        remaining = n_frames
        while remaining > 0:
            take = min(remaining, 8192)
            w.writeframes(chunk[: take * sampwidth])
            remaining -= take
    return buf.getvalue()


# ==================== Services CRUD ====================
class TestServicesSeeded:
    """Demo org (education industry) must have 5 default services already seeded."""

    def test_list_services_returns_seeded_five(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/services", timeout=15)
        assert r.status_code == 200, r.text
        services = r.json()
        names = [s["name"] for s in services]
        # 5 education defaults
        for expected in ["MBA Full-time", "BBA", "PGDM", "MCA", "BTech CSE"]:
            assert expected in names, f"Missing seeded service {expected!r} in {names}"
        # All have required fields
        for s in services:
            assert "_id" in s and isinstance(s["_id"], str)
            assert "name" in s
            assert "base_price" in s and isinstance(s["base_price"], (int, float))
            assert "min_price" in s and isinstance(s["min_price"], (int, float))
            assert s["min_price"] <= s["base_price"]
            assert "organization_id" not in s  # serializer strips org_id

    def test_list_services_include_inactive(self, manager_session):
        # Create an inactive service to validate include_inactive flag
        payload = {
            "name": f"TEST_Inactive_{uuid.uuid4().hex[:6]}",
            "category": "Test",
            "base_price": 1000,
            "min_price": 800,
            "active": False,
        }
        c = manager_session.post(f"{BASE_URL}/api/services", json=payload, timeout=15)
        assert c.status_code == 200, c.text
        sid = c.json()["_id"]

        # default (no flag) → must NOT include inactive
        r1 = manager_session.get(f"{BASE_URL}/api/services", timeout=15)
        assert r1.status_code == 200
        assert sid not in [s["_id"] for s in r1.json()]

        # with include_inactive=true → must include
        r2 = manager_session.get(f"{BASE_URL}/api/services?include_inactive=true", timeout=15)
        assert r2.status_code == 200
        assert sid in [s["_id"] for s in r2.json()]

        manager_session.delete(f"{BASE_URL}/api/services/{sid}", timeout=15)


class TestServicesRBAC:
    def test_create_service_as_manager_succeeds(self, manager_session):
        payload = {
            "name": f"TEST_Service_{uuid.uuid4().hex[:6]}",
            "category": "TestCat",
            "base_price": 5000,
            "min_price": 4000,
            "description": "Phase6 unit",
            "duration": "1 month",
        }
        r = manager_session.post(f"{BASE_URL}/api/services", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == payload["name"]
        assert data["base_price"] == 5000
        assert data["min_price"] == 4000
        assert data["active"] is True
        # cleanup
        manager_session.delete(f"{BASE_URL}/api/services/{data['_id']}", timeout=15)

    def test_create_service_as_org_admin_succeeds(self, admin_session):
        payload = {"name": f"TEST_OA_{uuid.uuid4().hex[:6]}", "base_price": 1000, "min_price": 900}
        r = admin_session.post(f"{BASE_URL}/api/services", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        admin_session.delete(f"{BASE_URL}/api/services/{r.json()['_id']}", timeout=15)

    def test_create_service_counselor_forbidden(self, counselor_session):
        payload = {"name": f"TEST_Forbid_{uuid.uuid4().hex[:6]}", "base_price": 1000, "min_price": 900}
        r = counselor_session.post(f"{BASE_URL}/api/services", json=payload, timeout=15)
        assert r.status_code == 403, r.text

    def test_create_service_telecaller_forbidden(self, telecaller_session):
        payload = {"name": f"TEST_FbT_{uuid.uuid4().hex[:6]}", "base_price": 1000, "min_price": 900}
        r = telecaller_session.post(f"{BASE_URL}/api/services", json=payload, timeout=15)
        assert r.status_code == 403, r.text


class TestServicesValidation:
    def test_create_rejects_min_above_base(self, manager_session):
        payload = {"name": f"TEST_BadMin_{uuid.uuid4().hex[:6]}", "base_price": 1000, "min_price": 1500}
        r = manager_session.post(f"{BASE_URL}/api/services", json=payload, timeout=15)
        assert r.status_code == 400, r.text
        assert "min" in r.text.lower()

    def test_update_rejects_min_above_existing_base(self, manager_session):
        # Create service base=1000, min=800
        c = manager_session.post(
            f"{BASE_URL}/api/services",
            json={"name": f"TEST_Upd_{uuid.uuid4().hex[:6]}", "base_price": 1000, "min_price": 800},
            timeout=15,
        )
        assert c.status_code == 200, c.text
        sid = c.json()["_id"]
        try:
            # Try updating min_price to 1500 (above existing base 1000) → 400
            u = manager_session.put(
                f"{BASE_URL}/api/services/{sid}",
                json={"min_price": 1500},
                timeout=15,
            )
            assert u.status_code == 400, u.text
            # Valid update (price only)
            u2 = manager_session.put(
                f"{BASE_URL}/api/services/{sid}",
                json={"min_price": 900, "description": "updated"},
                timeout=15,
            )
            assert u2.status_code == 200, u2.text
        finally:
            manager_session.delete(f"{BASE_URL}/api/services/{sid}", timeout=15)

    def test_delete_service(self, manager_session):
        c = manager_session.post(
            f"{BASE_URL}/api/services",
            json={"name": f"TEST_Del_{uuid.uuid4().hex[:6]}", "base_price": 500, "min_price": 400},
            timeout=15,
        )
        sid = c.json()["_id"]
        d = manager_session.delete(f"{BASE_URL}/api/services/{sid}", timeout=15)
        assert d.status_code == 200, d.text
        # second delete → 404
        d2 = manager_session.delete(f"{BASE_URL}/api/services/{sid}", timeout=15)
        assert d2.status_code == 404, d2.text

    def test_delete_cross_org_404(self, manager_session, super_admin_session):
        # super_admin lives in a different org. Create service in super_admin org, try delete with demo manager.
        c = super_admin_session.post(
            f"{BASE_URL}/api/services",
            json={"name": f"TEST_Cross_{uuid.uuid4().hex[:6]}", "base_price": 999, "min_price": 800},
            timeout=15,
        )
        assert c.status_code == 200, c.text
        sid = c.json()["_id"]
        try:
            d = manager_session.delete(f"{BASE_URL}/api/services/{sid}", timeout=15)
            assert d.status_code == 404, d.text
        finally:
            super_admin_session.delete(f"{BASE_URL}/api/services/{sid}", timeout=15)


# ==================== Admissions + Discount + Timeline ====================
def _create_lead(session, suffix=None):
    suffix = suffix or uuid.uuid4().hex[:8]
    payload = {
        "name": f"TEST_AdLead_{suffix}",
        "mobile": f"9{uuid.uuid4().int % 10**9:09d}",
        "email": f"adlead_{suffix}@phase6tests.com",
        "source": "Website",
        "lead_source": "Website",
        "course_interested": "BBA",
        "status": "New",
    }
    r = session.post(f"{BASE_URL}/api/leads", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["_id"]


class TestAdmissionsWithService:
    def test_admission_with_service_above_min_succeeds(self, manager_session):
        # Pick the BBA service (base 120000, min 100000)
        services = manager_session.get(f"{BASE_URL}/api/services", timeout=15).json()
        bba = next(s for s in services if s["name"] == "BBA")
        lead_id = _create_lead(manager_session)
        payload = {
            "student_name": "TEST_Student_Above",
            "mobile": f"9{uuid.uuid4().int % 10**9:09d}",
            "course": "BBA",
            "fees": 110000,
            "admission_date": "2026-01-15",
            "lead_id": lead_id,
            "service_id": bba["_id"],
            "base_price": 120000,
            "discount_amount": 10000,
            "discount_reason": "Early bird",
        }
        r = manager_session.post(f"{BASE_URL}/api/admissions", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["service_name"] == "BBA"
        assert d["discount_amount"] == 10000
        assert d["discount_reason"] == "Early bird"
        assert d["base_price"] == 120000
        assert d["service_id"] == bba["_id"]

        # Timeline should contain admission_recorded with payload
        tl = manager_session.get(f"{BASE_URL}/api/leads/{lead_id}/timeline", timeout=15)
        assert tl.status_code == 200, tl.text
        events = tl.json()
        admission_events = [e for e in events if e.get("event_type") == "admission_recorded"]
        assert admission_events, f"No admission_recorded event found in timeline: {events}"
        latest = admission_events[0]
        payload_field = latest.get("payload") or latest.get("metadata") or latest
        # search recursively for keys
        s = str(payload_field)
        assert "BBA" in s
        assert "110000" in s or "amount" in s
        assert "Early bird" in s

    def test_admission_below_min_blocked(self, manager_session):
        services = manager_session.get(f"{BASE_URL}/api/services", timeout=15).json()
        bba = next(s for s in services if s["name"] == "BBA")
        payload = {
            "student_name": "TEST_Student_Below",
            "mobile": f"9{uuid.uuid4().int % 10**9:09d}",
            "course": "BBA",
            "fees": 90000,  # below min_price 100000
            "admission_date": "2026-01-15",
            "service_id": bba["_id"],
            "base_price": 120000,
            "discount_amount": 30000,
            "discount_reason": "Test floor",
        }
        r = manager_session.post(f"{BASE_URL}/api/admissions", json=payload, timeout=15)
        assert r.status_code == 400, r.text
        body = r.json()
        assert "minimum" in str(body).lower() or "below" in str(body).lower()

    def test_admission_without_service_id_succeeds(self, manager_session):
        # Backward-compat: no service_id, no min_price check
        payload = {
            "student_name": "TEST_Student_NoSvc",
            "mobile": f"9{uuid.uuid4().int % 10**9:09d}",
            "course": "Manual Course",
            "fees": 1,  # absurdly low — should be allowed since no service
            "admission_date": "2026-01-15",
        }
        r = manager_session.post(f"{BASE_URL}/api/admissions", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["service_name"] is None
        assert d["fees"] == 1
        assert d["course"] == "Manual Course"

    def test_admission_invalid_service_id_404(self, manager_session):
        fake_id = "507f1f77bcf86cd799439011"  # valid ObjectId hex but non-existent
        payload = {
            "student_name": "TEST_Student_Invalid",
            "mobile": f"9{uuid.uuid4().int % 10**9:09d}",
            "course": "X",
            "fees": 10000,
            "admission_date": "2026-01-15",
            "service_id": fake_id,
        }
        r = manager_session.post(f"{BASE_URL}/api/admissions", json=payload, timeout=15)
        assert r.status_code == 404, r.text


# ==================== Voice Upload Size/Duration Gates ====================
class TestVoiceUploadLimits:
    def test_4mb_audio_succeeds(self, counselor_session):
        wav_bytes = _gen_wav_bytes(target_size_bytes=4 * 1024 * 1024)
        assert 4 * 1024 * 1024 <= len(wav_bytes) < 5 * 1024 * 1024
        files = {"file": ("rec.wav", wav_bytes, "audio/wav")}
        data = {"duration": "45"}
        r = counselor_session.post(
            f"{BASE_URL}/api/uploads/voice-recording", files=files, data=data, timeout=120
        )
        # 4MB < 5MB cap → must NOT be size-blocked. Should succeed (200).
        assert r.status_code == 200, f"Expected 200 for 4MB upload, got {r.status_code}: {r.text[:300]}"
        body = r.json()
        assert body.get("url", "").startswith("http")
        assert body.get("size") == len(wav_bytes)

    def test_5_5mb_rejected(self, counselor_session):
        # Size check happens before Cloudinary; random bytes are fine
        big = b"\x00" * (int(5.5 * 1024 * 1024))
        files = {"file": ("rec.wav", big, "audio/wav")}
        r = counselor_session.post(
            f"{BASE_URL}/api/uploads/voice-recording", files=files, data={"duration": "60"}, timeout=60
        )
        assert r.status_code == 400, r.text
        assert "5 mb" in r.text.lower() or "too large" in r.text.lower()

    def test_duration_200s_succeeds(self, counselor_session):
        wav_bytes = _gen_wav_bytes(seconds=1.0)  # small valid WAV
        files = {"file": ("rec.wav", wav_bytes, "audio/wav")}
        data = {"duration": "200"}  # under 300s cap
        r = counselor_session.post(
            f"{BASE_URL}/api/uploads/voice-recording", files=files, data=data, timeout=60
        )
        assert r.status_code == 200, f"Expected 200 for duration=200s, got {r.status_code}: {r.text[:300]}"

    def test_duration_320s_rejected(self, counselor_session):
        wav_bytes = _gen_wav_bytes(seconds=1.0)
        files = {"file": ("rec.wav", wav_bytes, "audio/wav")}
        data = {"duration": "320"}  # over 300s cap
        r = counselor_session.post(
            f"{BASE_URL}/api/uploads/voice-recording", files=files, data=data, timeout=60
        )
        assert r.status_code == 400, r.text
        assert "5 minutes" in r.text.lower() or "duration" in r.text.lower()


# ==================== Register seeds industry-specific services ====================
class TestRegisterSeedsRealEstateServices:
    def test_new_real_estate_org_has_5_services(self):
        suffix = uuid.uuid4().hex[:8]
        email = f"realestate_{suffix}@phase6tests.com"
        password = "TestPass@123"
        payload = {
            "email": email,
            "password": password,
            "name": f"TEST_RE_Admin_{suffix}",
            "organization_name": f"TEST_RE_Org_{suffix}",
            "industry": "real_estate",
        }
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/auth/register", json=payload, timeout=20)
        assert r.status_code == 200, r.text

        # Login as new org admin
        s2 = requests.Session()
        rl = s2.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
        assert rl.status_code == 200, rl.text

        svc = s2.get(f"{BASE_URL}/api/services", timeout=15)
        assert svc.status_code == 200, svc.text
        services = svc.json()
        names = [s["name"] for s in services]
        # 5 real-estate defaults
        expected = ["1 BHK Apartment", "2 BHK Apartment", "3 BHK Apartment", "Villa", "Commercial Office"]
        assert len(services) >= 5, f"Expected 5 services, got {len(services)}: {names}"
        for exp in expected:
            assert exp in names, f"Missing {exp!r} in {names}"
