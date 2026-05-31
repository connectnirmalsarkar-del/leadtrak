"""
Backend tests for Support Ticket System (iteration 2):
- Cloudinary attachment upload validations (size, type, count)
- Ticket create/list/get role-based visibility
- Reply -> notifications to creator
- Status change -> notifications to creator
- Super-admin only delete reply
"""
import io
import os
import struct
import zlib
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://institute-crm-pro.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

USERS = {
    "super_admin":  {"email": "admin@educationcrm.com", "password": "Admin@123"},
    "org_admin":    {"email": "orgadmin@demo.com",      "password": "Demo@123"},
    "manager":      {"email": "manager@demo.com",       "password": "Demo@123"},
    "counselor":    {"email": "counselor@demo.com",     "password": "Demo@123"},
    "telecaller":   {"email": "telecaller@demo.com",    "password": "Demo@123"},
}


def login_session(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="session")
def sessions():
    out = {}
    for role, creds in USERS.items():
        out[role] = login_session(creds["email"], creds["password"])
    return out


def _make_png(size_bytes: int) -> bytes:
    """Build a minimal valid PNG and pad with a tEXt chunk to reach target size."""
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
    # 1x1 image data
    raw = b"\x00\xff\xff\xff"  # filter byte + RGB white
    idat = chunk(b"IDAT", zlib.compress(raw))
    iend = chunk(b"IEND", b"")
    base = sig + ihdr + idat + iend
    if size_bytes <= len(base):
        return base
    pad_text = b"X" * (size_bytes - len(base) - 12 - 5)  # 12 byte chunk overhead + 5 for keyword
    text = chunk(b"tEXt", b"pad\x00" + pad_text)
    out = sig + ihdr + idat + text + iend
    return out


# ============ Attachment upload tests ============
class TestAttachmentUpload:
    def test_upload_valid_small_jpg(self, sessions):
        png = _make_png(10 * 1024)  # ~10KB valid PNG; we send as image/jpeg-allowed list - use png since png is allowed
        files = {"file": ("test.png", io.BytesIO(png), "image/png")}
        r = sessions["counselor"].post(f"{API}/uploads/ticket-attachment", files=files, timeout=60)
        assert r.status_code == 200, f"Expected 200 got {r.status_code}: {r.text}"
        data = r.json()
        for k in ("url", "public_id", "resource_type", "filename", "size", "mime_type"):
            assert k in data, f"Missing key {k}"
        assert data["mime_type"] == "image/png"
        assert data["resource_type"] == "image"
        assert data["size"] == len(png)
        assert data["url"].startswith("https://")
        # store for later use
        pytest.uploaded_attachment = data

    def test_reject_oversize_file(self, sessions):
        big = _make_png(210 * 1024)  # > 200KB
        files = {"file": ("big.png", io.BytesIO(big), "image/png")}
        r = sessions["counselor"].post(f"{API}/uploads/ticket-attachment", files=files, timeout=60)
        assert r.status_code == 400, f"Expected 400 got {r.status_code}: {r.text}"
        assert "Max" in r.text or "large" in r.text.lower()

    def test_reject_invalid_mime(self, sessions):
        files = {"file": ("note.txt", io.BytesIO(b"hello world"), "text/plain")}
        r = sessions["counselor"].post(f"{API}/uploads/ticket-attachment", files=files, timeout=30)
        assert r.status_code == 400
        assert "not allowed" in r.text.lower() or "type" in r.text.lower()


# ============ Ticket create + visibility ============
class TestTicketCreateAndVisibility:
    def test_create_ticket_counselor(self, sessions):
        payload = {
            "subject": "TEST_Counselor ticket",
            "category": "Technical",
            "priority": "Medium",
            "message": "Initial message from counselor",
            "attachments": [],
        }
        r = sessions["counselor"].post(f"{API}/support-tickets", json=payload, timeout=30)
        assert r.status_code == 200, f"create failed: {r.text}"
        data = r.json()
        assert data["ticket_no"].startswith("TKT")
        assert len(data["messages"]) == 1
        assert data["messages"][0]["message"] == "Initial message from counselor"
        assert data["status"] == "open"
        pytest.counselor_ticket_id = data["_id"]
        pytest.counselor_ticket_no = data["ticket_no"]

    def test_create_ticket_telecaller(self, sessions):
        payload = {"subject": "TEST_Telecaller ticket", "category": "Billing",
                   "priority": "Low", "message": "Telecaller hi", "attachments": []}
        r = sessions["telecaller"].post(f"{API}/support-tickets", json=payload, timeout=30)
        assert r.status_code == 200
        pytest.telecaller_ticket_id = r.json()["_id"]

    def test_create_ticket_rejects_more_than_5_attachments(self, sessions):
        att = {"url": "https://x/y", "public_id": "p", "resource_type": "image",
               "filename": "a.png", "size": 100, "mime_type": "image/png"}
        payload = {"subject": "TEST_too many", "category": "Tech",
                   "priority": "Low", "message": "x", "attachments": [att] * 6}
        r = sessions["counselor"].post(f"{API}/support-tickets", json=payload, timeout=30)
        assert r.status_code == 400, f"Expected 400 got {r.status_code}: {r.text}"

    def test_list_visibility_counselor_sees_only_own(self, sessions):
        r = sessions["counselor"].get(f"{API}/support-tickets", timeout=30)
        assert r.status_code == 200
        tickets = r.json()
        # all listed tickets must be created_by counselor
        # counselor id check via a ticket detail
        if tickets:
            detail = sessions["counselor"].get(f"{API}/support-tickets/{tickets[0]['_id']}", timeout=30).json()
            counselor_id = detail["created_by"]
            for t in tickets:
                # fetch each
                d = sessions["counselor"].get(f"{API}/support-tickets/{t['_id']}", timeout=30).json()
                assert d["created_by"] == counselor_id, "Counselor seeing someone else's ticket"

    def test_list_visibility_telecaller_sees_only_own(self, sessions):
        r = sessions["telecaller"].get(f"{API}/support-tickets", timeout=30)
        assert r.status_code == 200
        # Should not include counselor's ticket
        ids = [t["_id"] for t in r.json()]
        assert pytest.counselor_ticket_id not in ids, "Telecaller should not see counselor's ticket"
        assert pytest.telecaller_ticket_id in ids

    def test_list_visibility_manager_sees_only_own(self, sessions):
        r = sessions["manager"].get(f"{API}/support-tickets", timeout=30)
        assert r.status_code == 200
        ids = [t["_id"] for t in r.json()]
        assert pytest.counselor_ticket_id not in ids
        assert pytest.telecaller_ticket_id not in ids

    def test_list_visibility_orgadmin_sees_all_in_org(self, sessions):
        r = sessions["org_admin"].get(f"{API}/support-tickets", timeout=30)
        assert r.status_code == 200
        ids = [t["_id"] for t in r.json()]
        assert pytest.counselor_ticket_id in ids
        assert pytest.telecaller_ticket_id in ids

    def test_list_visibility_super_admin_sees_all(self, sessions):
        r = sessions["super_admin"].get(f"{API}/support-tickets", timeout=30)
        assert r.status_code == 200
        tickets = r.json()
        ids = [t["_id"] for t in tickets]
        assert pytest.counselor_ticket_id in ids
        # super admin response should include organization_name
        for t in tickets:
            assert "organization_name" in t

    def test_get_ticket_counselor_cannot_access_telecaller_ticket(self, sessions):
        r = sessions["counselor"].get(f"{API}/support-tickets/{pytest.telecaller_ticket_id}", timeout=30)
        assert r.status_code == 403, f"Expected 403 got {r.status_code}: {r.text}"

    def test_get_ticket_orgadmin_can_access_any_ticket_in_org(self, sessions):
        r = sessions["org_admin"].get(f"{API}/support-tickets/{pytest.counselor_ticket_id}", timeout=30)
        assert r.status_code == 200
        assert r.json()["_id"] == pytest.counselor_ticket_id


# ============ Reply + notifications ============
class TestReplyAndNotifications:
    def test_orgadmin_reply_creates_notification_for_counselor(self, sessions):
        # snapshot existing notifs for counselor
        before = sessions["counselor"].get(f"{API}/notifications", timeout=30).json()
        before_ids = {n["_id"] for n in before}

        r = sessions["org_admin"].post(
            f"{API}/support-tickets/{pytest.counselor_ticket_id}/reply",
            json={"message": "TEST_orgadmin reply", "attachments": []}, timeout=30
        )
        assert r.status_code == 200, f"reply failed: {r.text}"

        after = sessions["counselor"].get(f"{API}/notifications", timeout=30).json()
        new_notifs = [n for n in after if n["_id"] not in before_ids]
        assert any(n.get("type") == "ticket_reply" and n.get("ticket_id") == pytest.counselor_ticket_id
                   for n in new_notifs), f"No ticket_reply notification created. New: {new_notifs}"

    def test_counselor_self_reply_does_not_create_notification(self, sessions):
        before = sessions["counselor"].get(f"{API}/notifications", timeout=30).json()
        before_ids = {n["_id"] for n in before}
        r = sessions["counselor"].post(
            f"{API}/support-tickets/{pytest.counselor_ticket_id}/reply",
            json={"message": "TEST_self reply", "attachments": []}, timeout=30
        )
        assert r.status_code == 200
        after = sessions["counselor"].get(f"{API}/notifications", timeout=30).json()
        new_notifs = [n for n in after if n["_id"] not in before_ids]
        assert all(n.get("ticket_id") != pytest.counselor_ticket_id or n.get("type") != "ticket_reply"
                   for n in new_notifs), "Self-reply should not notify self"

    def test_status_change_resolved_creates_notification(self, sessions):
        before = sessions["counselor"].get(f"{API}/notifications", timeout=30).json()
        before_ids = {n["_id"] for n in before}
        r = sessions["org_admin"].put(
            f"{API}/support-tickets/{pytest.counselor_ticket_id}/status",
            json={"status": "resolved"}, timeout=30
        )
        assert r.status_code == 200, f"status update failed: {r.text}"
        assert r.json()["status"] == "resolved"
        # verify persisted
        detail = sessions["org_admin"].get(f"{API}/support-tickets/{pytest.counselor_ticket_id}", timeout=30).json()
        assert detail["status"] == "resolved"

        after = sessions["counselor"].get(f"{API}/notifications", timeout=30).json()
        new_notifs = [n for n in after if n["_id"] not in before_ids]
        assert any(n.get("type") == "ticket_status" and n.get("ticket_id") == pytest.counselor_ticket_id
                   for n in new_notifs), f"No ticket_status notification. New: {new_notifs}"


# ============ Delete reply privileges ============
class TestDeleteReply:
    def test_counselor_cannot_delete_reply(self, sessions):
        # find a reply id
        detail = sessions["org_admin"].get(f"{API}/support-tickets/{pytest.counselor_ticket_id}", timeout=30).json()
        msg_id = detail["messages"][-1]["id"]
        r = sessions["counselor"].delete(
            f"{API}/support-tickets/{pytest.counselor_ticket_id}/messages/{msg_id}", timeout=30
        )
        assert r.status_code == 403

    def test_orgadmin_cannot_delete_reply(self, sessions):
        detail = sessions["org_admin"].get(f"{API}/support-tickets/{pytest.counselor_ticket_id}", timeout=30).json()
        msg_id = detail["messages"][-1]["id"]
        r = sessions["org_admin"].delete(
            f"{API}/support-tickets/{pytest.counselor_ticket_id}/messages/{msg_id}", timeout=30
        )
        assert r.status_code == 403

    def test_super_admin_can_delete_reply(self, sessions):
        detail = sessions["super_admin"].get(f"{API}/support-tickets/{pytest.counselor_ticket_id}", timeout=30).json()
        msg_id = detail["messages"][-1]["id"]
        before_count = len(detail["messages"])
        r = sessions["super_admin"].delete(
            f"{API}/support-tickets/{pytest.counselor_ticket_id}/messages/{msg_id}", timeout=30
        )
        assert r.status_code == 200, f"delete failed: {r.text}"
        after = sessions["super_admin"].get(f"{API}/support-tickets/{pytest.counselor_ticket_id}", timeout=30).json()
        assert len(after["messages"]) == before_count - 1
        assert all(m["id"] != msg_id for m in after["messages"])
