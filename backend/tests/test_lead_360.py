"""Phase 5: Lead 360° Intelligence backend tests.

Covers:
- POST /api/leads — 409 hard-block on duplicate by mobile/email + payload
- POST /api/leads — normal create logs 'lead_created' on timeline
- GET /api/leads/check-duplicate — duplicate truth-table
- GET /api/leads/{id}/timeline — chronological + tenant isolated
- PUT /api/leads/{id} — status_changed / lead_lost / admission_recorded + assigned
- POST /api/leads/{id}/transfer — RBAC, validation, timeline + notification
- POST /api/followups — voice fields persisted + timeline event
- POST /api/uploads/voice-recording — size / duration / mime / role checks
- POST /api/admissions — admission_recorded timeline event
- Regression: support tickets list still works; dashboard funnel labels
"""
import os
import uuid
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


@pytest.fixture(scope="session")
def demo_users(admin_session):
    """Returns list of users belonging to the demo org."""
    r = admin_session.get(f"{BASE_URL}/api/users", timeout=15)
    assert r.status_code == 200
    return r.json()


def _make_lead_payload(suffix=None):
    suffix = suffix or uuid.uuid4().hex[:8]
    return {
        "name": f"TEST_Lead_{suffix}",
        "mobile": f"9{uuid.uuid4().int % 10**9:09d}",
        "email": f"test_{suffix}@phaseatests.com",
        "course_interested": "Test Course",
        "lead_source": "Website",
        "status": "New",
    }


# Track created leads for cleanup
_created_lead_ids = []


def _create_lead(session, payload=None):
    payload = payload or _make_lead_payload()
    r = session.post(f"{BASE_URL}/api/leads", json=payload, timeout=20)
    assert r.status_code == 200, f"Create lead failed: {r.status_code} {r.text}"
    data = r.json()
    _created_lead_ids.append(data["_id"])
    return data, payload


# ==================== Duplicate Prevention ====================
class TestDuplicatePrevention:
    def test_create_lead_succeeds_and_logs_lead_created(self, admin_session):
        lead, payload = _create_lead(admin_session)
        assert lead["mobile"] == payload["mobile"]
        # Check timeline
        r = admin_session.get(f"{BASE_URL}/api/leads/{lead['_id']}/timeline", timeout=15)
        assert r.status_code == 200
        events = r.json()
        assert any(e["event_type"] == "lead_created" for e in events), f"Events: {[e['event_type'] for e in events]}"

    def test_duplicate_by_mobile_blocks_409(self, admin_session):
        lead, payload = _create_lead(admin_session)
        dup = dict(payload, email=f"different_{uuid.uuid4().hex[:6]}@phaseatests.com",
                   name="TEST_Dup_Mobile")
        r = admin_session.post(f"{BASE_URL}/api/leads", json=dup, timeout=20)
        assert r.status_code == 409, f"Expected 409, got {r.status_code}: {r.text}"
        body = r.json()
        # FastAPI wraps HTTPException(detail=dict) under 'detail'
        detail = body.get("detail", body)
        assert "existing_lead" in detail
        assert detail["existing_lead"]["mobile"] == payload["mobile"]

    def test_duplicate_by_email_blocks_409(self, admin_session):
        lead, payload = _create_lead(admin_session)
        dup = dict(payload, mobile=f"9{uuid.uuid4().int % 10**9:09d}", name="TEST_Dup_Email")
        r = admin_session.post(f"{BASE_URL}/api/leads", json=dup, timeout=20)
        assert r.status_code == 409
        detail = r.json().get("detail", {})
        assert "existing_lead" in detail
        assert detail["existing_lead"]["email"] == payload["email"]

    def test_check_duplicate_by_mobile(self, admin_session):
        lead, payload = _create_lead(admin_session)
        r = admin_session.get(
            f"{BASE_URL}/api/leads/check-duplicate",
            params={"mobile": payload["mobile"]}, timeout=15,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["duplicate"] is True
        assert data["matched_on"] == "mobile"
        assert data["existing_lead"]["mobile"] == payload["mobile"]

    def test_check_duplicate_no_match(self, admin_session):
        r = admin_session.get(
            f"{BASE_URL}/api/leads/check-duplicate",
            params={"mobile": "0000000000"}, timeout=15,
        )
        assert r.status_code == 200
        assert r.json() == {"duplicate": False}

    def test_check_duplicate_no_params(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/leads/check-duplicate", timeout=15)
        assert r.status_code == 200
        assert r.json() == {"duplicate": False}


# ==================== Timeline events on PUT ====================
class TestLeadTimelineUpdates:
    def test_status_change_logs_status_changed(self, admin_session):
        lead, _ = _create_lead(admin_session)
        r = admin_session.put(
            f"{BASE_URL}/api/leads/{lead['_id']}",
            json={"status": "Contacted"}, timeout=15,
        )
        assert r.status_code == 200
        events = admin_session.get(
            f"{BASE_URL}/api/leads/{lead['_id']}/timeline", timeout=15
        ).json()
        types = [e["event_type"] for e in events]
        assert "status_changed" in types
        sc = [e for e in events if e["event_type"] == "status_changed"][-1]
        assert sc["payload"]["from"] == "New"
        assert sc["payload"]["to"] == "Contacted"

    def test_status_lost_logs_lead_lost(self, admin_session):
        lead, _ = _create_lead(admin_session)
        r = admin_session.put(
            f"{BASE_URL}/api/leads/{lead['_id']}",
            json={"status": "Lost"}, timeout=15,
        )
        assert r.status_code == 200
        events = admin_session.get(
            f"{BASE_URL}/api/leads/{lead['_id']}/timeline", timeout=15
        ).json()
        assert any(e["event_type"] == "lead_lost" for e in events)

    def test_status_admission_done_via_put_logs_admission_recorded(self, admin_session):
        lead, _ = _create_lead(admin_session)
        r = admin_session.put(
            f"{BASE_URL}/api/leads/{lead['_id']}",
            json={"status": "Admission Done"}, timeout=15,
        )
        assert r.status_code == 200
        events = admin_session.get(
            f"{BASE_URL}/api/leads/{lead['_id']}/timeline", timeout=15
        ).json()
        assert any(e["event_type"] == "admission_recorded" for e in events)

    def test_assigned_to_change_logs_assigned(self, admin_session, demo_users):
        # pick first non-admin user
        candidates = [u for u in demo_users if u.get("role") in ("counselor", "telecaller", "manager")]
        assert candidates, "Need at least one assignable user"
        new_user = candidates[0]
        lead, _ = _create_lead(admin_session)
        r = admin_session.put(
            f"{BASE_URL}/api/leads/{lead['_id']}",
            json={"assigned_to": new_user["_id"] if "_id" in new_user else new_user["id"]},
            timeout=15,
        )
        assert r.status_code == 200
        events = admin_session.get(
            f"{BASE_URL}/api/leads/{lead['_id']}/timeline", timeout=15
        ).json()
        assert any(e["event_type"] == "assigned" for e in events)


# ==================== Lead Transfer ====================
class TestLeadTransfer:
    def _get_user_id(self, users, role):
        for u in users:
            if u.get("role") == role:
                return u.get("id") or u.get("_id")
        return None

    def test_manager_can_transfer_and_logs_event(self, manager_session, admin_session, demo_users):
        lead, _ = _create_lead(admin_session)
        new_assignee_id = self._get_user_id(demo_users, "counselor")
        assert new_assignee_id
        r = manager_session.post(
            f"{BASE_URL}/api/leads/{lead['_id']}/transfer",
            json={"new_assignee_id": new_assignee_id, "reason": "Reassign to counselor"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        events = admin_session.get(
            f"{BASE_URL}/api/leads/{lead['_id']}/timeline", timeout=15
        ).json()
        transfer_events = [e for e in events if e["event_type"] == "transferred"]
        assert transfer_events, "No transferred event logged"
        last = transfer_events[-1]
        assert last["payload"]["to_user_id"] == new_assignee_id
        assert last["payload"]["reason"] == "Reassign to counselor"

    def test_counselor_cannot_transfer_403(self, counselor_session, admin_session, demo_users):
        lead, _ = _create_lead(admin_session)
        new_assignee_id = self._get_user_id(demo_users, "telecaller")
        r = counselor_session.post(
            f"{BASE_URL}/api/leads/{lead['_id']}/transfer",
            json={"new_assignee_id": new_assignee_id}, timeout=15,
        )
        assert r.status_code == 403

    def test_telecaller_cannot_transfer_403(self, telecaller_session, admin_session, demo_users):
        lead, _ = _create_lead(admin_session)
        new_assignee_id = self._get_user_id(demo_users, "counselor")
        r = telecaller_session.post(
            f"{BASE_URL}/api/leads/{lead['_id']}/transfer",
            json={"new_assignee_id": new_assignee_id}, timeout=15,
        )
        assert r.status_code == 403

    def test_transfer_invalid_assignee_returns_400(self, manager_session, admin_session):
        lead, _ = _create_lead(admin_session)
        # Random ObjectId-shaped string, but not a real user in this org
        fake_id = "0123456789abcdef01234567"
        r = manager_session.post(
            f"{BASE_URL}/api/leads/{lead['_id']}/transfer",
            json={"new_assignee_id": fake_id}, timeout=15,
        )
        assert r.status_code == 400, f"Got {r.status_code}: {r.text}"


# ==================== Tenant Isolation on Timeline ====================
class TestTimelineTenantIsolation:
    def test_cross_org_timeline_access_returns_404(self, admin_session, super_admin_session):
        # Lead created in demo org
        lead, _ = _create_lead(admin_session)
        # super_admin lives in a different org (educationcrm)
        r = super_admin_session.get(
            f"{BASE_URL}/api/leads/{lead['_id']}/timeline", timeout=15
        )
        assert r.status_code == 404


# ==================== Followups with voice ====================
class TestFollowupsVoice:
    def test_followup_with_voice_logs_timeline(self, counselor_session, admin_session):
        lead, _ = _create_lead(admin_session)
        payload = {
            "lead_id": lead["_id"],
            "followup_date": "2026-02-01",
            "followup_time": "10:30",
            "remarks": "TEST follow-up with voice",
            "voice_recording_url": "https://res.cloudinary.com/demo/video/upload/sample.webm",
            "voice_recording_public_id": "sample_voice_test",
            "voice_recording_duration": 45.5,
        }
        r = counselor_session.post(f"{BASE_URL}/api/followups", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        fu = r.json()
        assert fu["voice_recording_url"] == payload["voice_recording_url"]
        assert fu["voice_recording_duration"] == 45.5

        events = admin_session.get(
            f"{BASE_URL}/api/leads/{lead['_id']}/timeline", timeout=15
        ).json()
        fu_events = [e for e in events if e["event_type"] == "followup_added"]
        assert fu_events
        assert fu_events[-1]["payload"]["voice_recording_url"] == payload["voice_recording_url"]
        assert fu_events[-1]["payload"]["voice_recording_duration"] == 45.5


# ==================== Voice upload endpoint ====================
class TestVoiceUpload:
    def _small_audio_bytes(self, kb=300):
        # Generate a real (silent) WAV that Cloudinary can ingest.
        import io, wave, struct
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)  # 16-bit
            w.setframerate(8000)
            # 1 second of silence
            w.writeframes(struct.pack("<" + "h" * 8000, *([0] * 8000)))
        data = buf.getvalue()
        # Pad with extra silence to reach approx requested size (still valid since header size ignored by some decoders)
        # Just return the small valid WAV — Cloudinary will accept it.
        return data

    def test_counselor_upload_small_audio_succeeds(self, counselor_session):
        files = {"file": ("clip.wav", self._small_audio_bytes(300), "audio/wav")}
        data = {"duration": "30"}
        r = counselor_session.post(
            f"{BASE_URL}/api/uploads/voice-recording",
            files=files, data=data, timeout=60,
        )
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        body = r.json()
        assert body.get("url", "").startswith("http")
        assert body.get("public_id")

    def test_super_admin_upload_succeeds(self, super_admin_session):
        files = {"file": ("clip2.wav", self._small_audio_bytes(100), "audio/wav")}
        r = super_admin_session.post(
            f"{BASE_URL}/api/uploads/voice-recording",
            files=files, data={"duration": "20"}, timeout=60,
        )
        assert r.status_code == 200, r.text

    def test_oversize_4mb_rejected(self, counselor_session):
        big = b"\x00" * (4 * 1024 * 1024)
        files = {"file": ("big.webm", big, "audio/webm")}
        r = counselor_session.post(
            f"{BASE_URL}/api/uploads/voice-recording",
            files=files, data={"duration": "60"}, timeout=60,
        )
        assert r.status_code == 400
        assert "large" in r.text.lower() or "max" in r.text.lower()

    def test_duration_over_180_rejected(self, counselor_session):
        files = {"file": ("dur.webm", self._small_audio_bytes(50), "audio/webm")}
        r = counselor_session.post(
            f"{BASE_URL}/api/uploads/voice-recording",
            files=files, data={"duration": "200"}, timeout=60,
        )
        assert r.status_code == 400
        assert "3 minutes" in r.text or "180" in r.text or "duration" in r.text.lower()

    def test_disallowed_mime_rejected(self, counselor_session):
        files = {"file": ("bad.txt", b"hello world", "text/plain")}
        r = counselor_session.post(
            f"{BASE_URL}/api/uploads/voice-recording",
            files=files, data={"duration": "10"}, timeout=30,
        )
        assert r.status_code == 400
        assert "not allowed" in r.text.lower() or "type" in r.text.lower()


# ==================== Admissions logs timeline ====================
class TestAdmissionTimeline:
    def test_admission_logs_admission_recorded(self, counselor_session, admin_session):
        lead, _ = _create_lead(admin_session)
        payload = {
            "student_name": "TEST_Student",
            "mobile": "9999999999",
            "course": "Test Course",
            "fees": 50000,
            "admission_date": "2026-02-15",
            "lead_id": lead["_id"],
        }
        r = counselor_session.post(f"{BASE_URL}/api/admissions", json=payload, timeout=15)
        assert r.status_code == 200, r.text

        events = admin_session.get(
            f"{BASE_URL}/api/leads/{lead['_id']}/timeline", timeout=15
        ).json()
        ar = [e for e in events if e["event_type"] == "admission_recorded"]
        assert ar, "admission_recorded event not logged"
        assert ar[-1]["payload"]["offering"] == "Test Course"
        assert ar[-1]["payload"]["amount"] == 50000


# ==================== Regression ====================
class TestRegression:
    def test_support_tickets_list(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/support-tickets", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_dashboard_funnel(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/dashboard/funnel", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) > 0
        # Industry-aware: education maps final stage to "Enrolled"
        labels = [s.get("stage") or s.get("label") or s.get("name") for s in data]
        assert any(l for l in labels), f"Funnel labels missing: {data}"
        # Validate the education last-stage label is the industry-mapped one
        assert any(l in ("Enrolled", "Admission Done", "Admission", "Won", "Closed Won") for l in labels), (
            f"Funnel labels: {labels}"
        )


# ==================== Cleanup ====================
@pytest.fixture(scope="session", autouse=True)
def _cleanup_leads(admin_session):
    yield
    # Best-effort cleanup
    for lid in list(set(_created_lead_ids)):
        try:
            admin_session.delete(f"{BASE_URL}/api/leads/{lid}", timeout=10)
        except Exception:
            pass
