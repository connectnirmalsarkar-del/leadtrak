"""
Iteration 18 - Notification fan-out + Activity feed + Auth refresh regression.

Covers:
- notify_lead_stakeholders fan-out for: status change, comment, attachment,
  demo create/update/complete, followup create/complete.
- /api/activity scoping (counselor self only) + filters (event_type, actor_id, days).
- Auth refresh flow: expired access_token cookie -> /auth/me 401 -> /auth/refresh 200 -> /auth/me 200.

NOTE: Backend uses httpOnly cookie auth (no Authorization header). We use
requests.Session() per user. WhatsApp/email senders are mocked at the
provider level; bell-notification rows in the `notifications` collection
are the source of truth for fan-out.
"""
import io
import os
import time
import uuid
import pytest
import requests
from urllib.parse import urlparse

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://institute-crm-pro.preview.emergentagent.com").rstrip("/")

USERS = {
    "org_admin": {"email": "orgadmin@demo.com", "password": "Demo@123"},
    "manager":   {"email": "manager@demo.com",  "password": "Demo@123"},
    "counselor": {"email": "counselor@demo.com","password": "Demo@123"},
}


# --------- Helpers ---------
def _login(email: str, password: str) -> requests.Session:
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return s


def _me(sess: requests.Session) -> dict:
    r = sess.get(f"{BASE_URL}/api/auth/me", timeout=10)
    assert r.status_code == 200
    return r.json()


def _unread_count(sess: requests.Session) -> int:
    r = sess.get(f"{BASE_URL}/api/notifications/unread-count", timeout=10)
    assert r.status_code == 200, r.text
    return int(r.json().get("count", 0))


def _list_notifs(sess: requests.Session, limit: int = 20) -> list:
    r = sess.get(f"{BASE_URL}/api/notifications", params={"limit": limit}, timeout=10)
    assert r.status_code == 200, r.text
    data = r.json()
    if isinstance(data, dict) and "items" in data:
        return data["items"]
    return data


# --------- Fixtures ---------
@pytest.fixture(scope="module")
def admin_sess():
    return _login(**USERS["org_admin"])


@pytest.fixture(scope="module")
def manager_sess():
    return _login(**USERS["manager"])


@pytest.fixture(scope="module")
def counselor_sess():
    return _login(**USERS["counselor"])


@pytest.fixture(scope="module")
def me_admin(admin_sess):
    return _me(admin_sess)


@pytest.fixture(scope="module")
def me_manager(manager_sess):
    return _me(manager_sess)


@pytest.fixture(scope="module")
def me_counselor(counselor_sess):
    return _me(counselor_sess)


@pytest.fixture(scope="module")
def test_lead(admin_sess, me_counselor):
    """Create a fresh test lead assigned to the counselor so fan-out can include the owner."""
    payload = {
        "name": f"TEST_FANOUT_{uuid.uuid4().hex[:6]}",
        "mobile": f"99{int(time.time()) % 100000000:08d}",
        "email": f"fanout_{uuid.uuid4().hex[:6]}@test.com",
        "lead_source": "Walk-in",
        "course_interested": "Test Course",
        "assigned_to": me_counselor["id"],
        "status": "New",
    }
    r = admin_sess.post(f"{BASE_URL}/api/leads", json=payload, timeout=15)
    assert r.status_code in (200, 201), f"Lead create failed: {r.status_code} {r.text}"
    lead = r.json()
    # Normalize: list endpoint returns _id, create may return id
    if "id" not in lead and "_id" in lead:
        lead["id"] = lead["_id"]
    return lead


# --------- 1. Status-change fan-out ---------
class TestStatusChangeFanout:
    def test_status_change_notifies_owner_and_manager_not_actor(
        self, admin_sess, manager_sess, counselor_sess, me_admin, test_lead
    ):
        c0 = _unread_count(counselor_sess)
        m0 = _unread_count(manager_sess)
        a0 = _unread_count(admin_sess)

        r = admin_sess.put(
            f"{BASE_URL}/api/leads/{test_lead['id']}",
            json={"status": "Contacted"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        time.sleep(1.0)

        c1 = _unread_count(counselor_sess)
        m1 = _unread_count(manager_sess)
        a1 = _unread_count(admin_sess)

        assert c1 == c0 + 1, f"Counselor (owner) unread should +1, got {c0}->{c1}"
        assert m1 == m0 + 1, f"Manager unread should +1, got {m0}->{m1}"
        assert a1 == a0, f"Actor (admin) must NOT self-notify, got {a0}->{a1}"

        # Verify notification fields on counselor's feed
        items = _list_notifs(counselor_sess, limit=10)
        match = [n for n in items if n.get("lead_id") == test_lead["id"] and n.get("type") == "lead_status_changed"]
        assert match, f"No lead_status_changed notif found for counselor: {items[:3]}"
        n = match[0]
        assert n.get("url") and f"openLead={test_lead['id']}" in n["url"], n.get("url")
        assert n.get("actor_id") == me_admin["id"]


# --------- 2. Comment fan-out ---------
class TestCommentFanout:
    def test_comment_notifies_owner_and_manager(self, admin_sess, manager_sess, counselor_sess, test_lead):
        c0 = _unread_count(counselor_sess)
        m0 = _unread_count(manager_sess)
        a0 = _unread_count(admin_sess)

        r = admin_sess.post(
            f"{BASE_URL}/api/leads/{test_lead['id']}/comments",
            json={"note": "TEST_FANOUT comment from org_admin", "notify_assignee": True},
            timeout=15,
        )
        assert r.status_code in (200, 201), r.text
        time.sleep(1.0)

        c1 = _unread_count(counselor_sess)
        m1 = _unread_count(manager_sess)
        a1 = _unread_count(admin_sess)
        assert c1 >= c0 + 1, f"Counselor (owner) should get comment notif, {c0}->{c1}"
        assert m1 >= m0 + 1, f"Manager should get comment notif, {m0}->{m1}"
        assert a1 == a0, f"Actor must NOT self-notify, {a0}->{a1}"

        items = _list_notifs(counselor_sess, limit=10)
        match = [n for n in items if n.get("type") == "lead_comment" and n.get("lead_id") == test_lead["id"]]
        assert match, "Counselor missing lead_comment notif"


# --------- 3. Attachment fan-out ---------
class TestAttachmentFanout:
    def test_attachment_notifies_owner_and_manager(self, admin_sess, manager_sess, counselor_sess, test_lead):
        c0 = _unread_count(counselor_sess)
        m0 = _unread_count(manager_sess)
        a0 = _unread_count(admin_sess)

        # Tiny in-memory PDF (~200 bytes)
        pdf_bytes = (b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n")
        files = {"file": ("test_fanout.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
        r = admin_sess.post(
            f"{BASE_URL}/api/leads/{test_lead['id']}/attachments",
            files=files,
            timeout=20,
        )
        assert r.status_code in (200, 201), f"Attach upload failed: {r.status_code} {r.text[:300]}"
        time.sleep(1.0)

        c1 = _unread_count(counselor_sess)
        m1 = _unread_count(manager_sess)
        a1 = _unread_count(admin_sess)
        assert c1 >= c0 + 1, f"Counselor unread {c0}->{c1}"
        assert m1 >= m0 + 1, f"Manager unread {m0}->{m1}"
        assert a1 == a0, f"Admin (actor) must NOT self-notify, {a0}->{a1}"

        items = _list_notifs(counselor_sess, limit=10)
        assert any(n.get("type") == "lead_attachment" and n.get("lead_id") == test_lead["id"] for n in items), \
            "Counselor missing lead_attachment notif"


# --------- 4. Demo create / update / complete fan-out ---------
@pytest.fixture(scope="class")
def created_demo(admin_sess, me_counselor, test_lead):
    payload = {
        "lead_id": test_lead["id"],
        "demo_owner_id": me_counselor["id"],
        "scheduled_date": "2026-12-31",
        "scheduled_time": "10:00",
        "demo_mode": "Online",
        "demo_link": "https://meet.example.com/test",
        "agenda": "TEST_FANOUT demo agenda",
    }
    r = admin_sess.post(f"{BASE_URL}/api/demos", json=payload, timeout=15)
    assert r.status_code in (200, 201), f"Demo create failed: {r.status_code} {r.text}"
    demo = r.json()
    if "id" not in demo and "_id" in demo:
        demo["id"] = demo["_id"]
    return demo


class TestDemoFanout:
    def test_demo_create_fanout(self, admin_sess, manager_sess, counselor_sess, test_lead, created_demo):
        # created_demo fixture already ran the create. Verify recent notifs.
        time.sleep(1.0)
        items_counselor = _list_notifs(counselor_sess, limit=20)
        items_manager = _list_notifs(manager_sess, limit=20)
        assert any(n.get("type") == "demo_scheduled" and n.get("lead_id") == test_lead["id"] for n in items_counselor), \
            "Counselor (owner/demo_owner) missing demo_scheduled"
        assert any(n.get("type") == "demo_scheduled" and n.get("lead_id") == test_lead["id"] for n in items_manager), \
            "Manager missing demo_scheduled"
        items_admin = _list_notifs(admin_sess, limit=20)
        # admin is the actor - should NOT have a self-notif for this lead's demo_scheduled
        actor_self = [n for n in items_admin if n.get("type") == "demo_scheduled" and n.get("lead_id") == test_lead["id"]]
        # Allow zero only (no self-notif). If present, actor exclusion failed.
        assert len(actor_self) == 0, f"Actor (admin) should not self-notify demo_scheduled, found {len(actor_self)}"

    def test_demo_update_fanout(self, admin_sess, manager_sess, counselor_sess, test_lead, created_demo):
        c0 = _unread_count(counselor_sess)
        m0 = _unread_count(manager_sess)
        a0 = _unread_count(admin_sess)
        r = admin_sess.put(
            f"{BASE_URL}/api/demos/{created_demo['id']}",
            json={"agenda": "TEST_FANOUT updated agenda"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        time.sleep(1.0)
        c1 = _unread_count(counselor_sess)
        m1 = _unread_count(manager_sess)
        a1 = _unread_count(admin_sess)
        assert c1 >= c0 + 1, f"Counselor unread {c0}->{c1}"
        assert m1 >= m0 + 1, f"Manager unread {m0}->{m1}"
        assert a1 == a0, f"Actor (admin) must NOT self-notify, {a0}->{a1}"
        items = _list_notifs(counselor_sess, limit=10)
        assert any(n.get("type") == "demo_updated" for n in items), "Counselor missing demo_updated notif"

    def test_demo_complete_fanout(self, admin_sess, manager_sess, counselor_sess, test_lead, created_demo):
        c0 = _unread_count(counselor_sess)
        m0 = _unread_count(manager_sess)
        a0 = _unread_count(admin_sess)
        r = admin_sess.post(
            f"{BASE_URL}/api/demos/{created_demo['id']}/complete",
            json={"outcome": "interested", "feedback": "TEST_FANOUT good"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        time.sleep(1.0)
        c1 = _unread_count(counselor_sess)
        m1 = _unread_count(manager_sess)
        a1 = _unread_count(admin_sess)
        assert c1 >= c0 + 1, f"Counselor unread {c0}->{c1}"
        assert m1 >= m0 + 1, f"Manager unread {m0}->{m1}"
        assert a1 == a0, f"Actor (admin) must NOT self-notify, {a0}->{a1}"
        items = _list_notifs(counselor_sess, limit=10)
        assert any(n.get("type") == "demo_completed" for n in items), "Counselor missing demo_completed notif"


# --------- 5. Followup create / complete fan-out ---------
@pytest.fixture(scope="class")
def created_followup(admin_sess, test_lead):
    payload = {
        "lead_id": test_lead["id"],
        "followup_date": "2026-12-30",
        "followup_time": "11:00",
        "remarks": "TEST_FANOUT followup",
    }
    r = admin_sess.post(f"{BASE_URL}/api/followups", json=payload, timeout=15)
    assert r.status_code in (200, 201), f"Followup create failed: {r.status_code} {r.text}"
    fu = r.json()
    if "id" not in fu and "_id" in fu:
        fu["id"] = fu["_id"]
    return fu


class TestFollowupFanout:
    def test_followup_create_fanout(self, admin_sess, manager_sess, counselor_sess, test_lead, created_followup):
        time.sleep(1.0)
        items_counselor = _list_notifs(counselor_sess, limit=20)
        items_manager = _list_notifs(manager_sess, limit=20)
        assert any(n.get("type") == "followup_added" and n.get("lead_id") == test_lead["id"] for n in items_counselor), \
            "Counselor missing followup_added"
        assert any(n.get("type") == "followup_added" and n.get("lead_id") == test_lead["id"] for n in items_manager), \
            "Manager missing followup_added"
        items_admin = _list_notifs(admin_sess, limit=20)
        assert not any(n.get("type") == "followup_added" and n.get("lead_id") == test_lead["id"] for n in items_admin), \
            "Actor (admin) should not self-notify followup_added"

    def test_followup_complete_fanout(self, admin_sess, manager_sess, counselor_sess, test_lead, created_followup):
        c0 = _unread_count(counselor_sess)
        m0 = _unread_count(manager_sess)
        a0 = _unread_count(admin_sess)
        r = admin_sess.post(
            f"{BASE_URL}/api/followups/{created_followup['id']}/complete",
            json={"summary": "TEST_FANOUT done", "next_action": "none"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        time.sleep(1.0)
        c1 = _unread_count(counselor_sess)
        m1 = _unread_count(manager_sess)
        a1 = _unread_count(admin_sess)
        assert c1 >= c0 + 1, f"Counselor unread {c0}->{c1}"
        assert m1 >= m0 + 1, f"Manager unread {m0}->{m1}"
        assert a1 == a0, f"Actor (admin) must NOT self-notify, {a0}->{a1}"
        items = _list_notifs(counselor_sess, limit=10)
        assert any(n.get("type") == "followup_completed" for n in items), "Counselor missing followup_completed"


# --------- 6. /api/activity endpoint ---------
class TestActivityFeed:
    def test_activity_returns_items_for_manager(self, manager_sess):
        r = manager_sess.get(f"{BASE_URL}/api/activity", params={"limit": 20}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "items" in data and "total" in data
        assert isinstance(data["items"], list)
        if data["items"]:
            it = data["items"][0]
            for k in ("id", "event_type", "actor_name", "lead_id", "lead_name", "lead_ref", "lead_status", "created_at"):
                assert k in it, f"Missing key {k} in activity item: {it}"

    def test_activity_counselor_scoped_to_own_leads(self, counselor_sess, manager_sess, me_counselor):
        r_c = counselor_sess.get(f"{BASE_URL}/api/activity", params={"limit": 100}, timeout=15)
        assert r_c.status_code == 200, r_c.text
        items_c = r_c.json()["items"]
        # Every event a counselor sees must belong to a lead assigned to them
        # We verify by fetching leads list filtered by assigned_to=self.
        r_leads = counselor_sess.get(f"{BASE_URL}/api/leads", params={"limit": 1000}, timeout=15)
        assert r_leads.status_code == 200
        leads_data = r_leads.json()
        lead_list = leads_data["items"] if isinstance(leads_data, dict) and "items" in leads_data else leads_data
        my_lead_ids = {(ld.get("id") or ld.get("_id")) for ld in lead_list if ld.get("assigned_to") == me_counselor["id"]}
        for it in items_c:
            assert it["lead_id"] in my_lead_ids, f"Counselor saw event for non-owned lead {it['lead_id']}"

    def test_activity_actor_filter(self, manager_sess, me_admin):
        r = manager_sess.get(
            f"{BASE_URL}/api/activity",
            params={"actor_id": me_admin["id"], "limit": 50},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        for it in items:
            assert it.get("actor_id") == me_admin["id"], f"actor_id filter leak: {it}"

    def test_activity_event_type_filter(self, manager_sess):
        r = manager_sess.get(
            f"{BASE_URL}/api/activity",
            params={"event_type": "status_changed", "limit": 30},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        for it in items:
            assert it["event_type"] == "status_changed", f"event_type filter leak: {it['event_type']}"

    def test_activity_days_filter_accepts_int(self, manager_sess):
        r = manager_sess.get(f"{BASE_URL}/api/activity", params={"days": 7, "limit": 10}, timeout=15)
        assert r.status_code == 200, r.text


# --------- 7. Auth refresh flow ---------
class TestAuthRefresh:
    def test_expired_access_token_triggers_refresh(self):
        """Simulate expired access_token: log in, drop access_token cookie,
        confirm /auth/me 401, then /auth/refresh 200 + new access_token, then /auth/me 200."""
        s = _login(**USERS["org_admin"])

        # Confirm we have both cookies
        cookies = {c.name: c for c in s.cookies}
        assert "access_token" in cookies and "refresh_token" in cookies, f"Cookies: {list(cookies)}"

        # Drop access_token to simulate expiry
        domain = urlparse(BASE_URL).hostname
        s.cookies.clear(domain=domain, path="/", name="access_token")
        assert "access_token" not in {c.name for c in s.cookies}

        # /auth/me should now 401 (only refresh cookie present)
        r1 = s.get(f"{BASE_URL}/api/auth/me", timeout=10)
        assert r1.status_code == 401, f"Expected 401, got {r1.status_code}: {r1.text[:200]}"

        # /auth/refresh should succeed using refresh cookie and set a new access_token
        r2 = s.post(f"{BASE_URL}/api/auth/refresh", timeout=10)
        assert r2.status_code == 200, f"Refresh failed: {r2.status_code} {r2.text[:200]}"
        assert "access_token" in {c.name for c in s.cookies}, "access_token cookie not restored"

        # /auth/me should now succeed
        r3 = s.get(f"{BASE_URL}/api/auth/me", timeout=10)
        assert r3.status_code == 200, f"Expected 200 after refresh, got {r3.status_code}"
