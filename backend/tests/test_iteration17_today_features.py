"""
Iteration 17 regression - cookie auth via requests.Session.
"""
import os
import io
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://institute-crm-pro.preview.emergentagent.com").rstrip("/")

ADMIN = {"email": "admin@educationcrm.com", "password": "Admin@123"}
ORG_ADMIN = {"email": "orgadmin@demo.com", "password": "Demo@123"}
COUNSELOR = {"email": "counselor@demo.com", "password": "Demo@123"}


def _session(creds):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def admin_s():
    return _session(ADMIN)


@pytest.fixture(scope="module")
def org_s():
    return _session(ORG_ADMIN)


@pytest.fixture(scope="module")
def caller_s():
    return _session(COUNSELOR)


# 1. Widget CORS
@pytest.fixture(scope="module")
def widget_token(org_s):
    r = org_s.get(f"{BASE_URL}/api/widget/token", timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    return j.get("token") or j.get("widget_token")


def test_widget_config_cors(widget_token):
    r = requests.get(f"{BASE_URL}/api/widget/config/{widget_token}",
                     headers={"Origin": "https://random-customer-site.com"}, timeout=20)
    assert r.status_code == 200, r.text
    aco = r.headers.get("access-control-allow-origin", "")
    assert aco in ("*", "https://random-customer-site.com"), f"CORS missing: aco={aco!r}"


def test_widget_lead_submit_cors(widget_token):
    payload = {"name": "CORS Test", "mobile": "9999000001", "email": "ct@example.com", "source": "widget"}
    r = requests.post(f"{BASE_URL}/api/widget/lead/{widget_token}", json=payload,
                      headers={"Origin": "https://random-customer-site.com"}, timeout=20)
    assert r.status_code in (200, 201), f"{r.status_code} {r.text[:300]}"


# 2. Widget layout PATCH
def test_widget_layout_valid(org_s):
    for layout in ["compact", "two-column", "standard"]:
        r = org_s.patch(f"{BASE_URL}/api/widget/settings", json={"layout": layout}, timeout=20)
        assert r.status_code == 200, f"layout {layout}: {r.status_code} {r.text[:200]}"


def test_widget_layout_invalid(org_s):
    r = org_s.patch(f"{BASE_URL}/api/widget/settings", json={"layout": "invalid-xyz"}, timeout=20)
    assert r.status_code == 400, f"expected 400 got {r.status_code} {r.text[:200]}"


def test_widget_layout_rbac(caller_s):
    r = caller_s.patch(f"{BASE_URL}/api/widget/settings", json={"layout": "compact"}, timeout=20)
    assert r.status_code in (401, 403), f"expected 403 got {r.status_code}"


# 3. 5-stage Funnel
def test_funnel_5_stages(org_s):
    r = org_s.get(f"{BASE_URL}/api/dashboard/funnel", timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    stages = data if isinstance(data, list) else data.get("stages", data.get("funnel", []))
    assert len(stages) == 5, f"expected 5 got {len(stages)}: {stages}"


# 4. Avatar/logo upload
def _make_jpg(dim=200):
    try:
        from PIL import Image
    except ImportError:
        pytest.skip("PIL missing")
    img = Image.new("RGB", (dim, dim), color=(100, 150, 200))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def test_avatar_upload_success(org_s):
    files = {"file": ("avatar.jpg", _make_jpg(), "image/jpeg")}
    r = org_s.post(f"{BASE_URL}/api/uploads/avatar", files=files, timeout=30)
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
    data = r.json()
    assert "original_size" in data, data
    assert "compressed_size" in data, data


def test_avatar_invalid_mime(org_s):
    files = {"file": ("a.txt", b"hello", "text/plain")}
    r = org_s.post(f"{BASE_URL}/api/uploads/avatar", files=files, timeout=20)
    assert r.status_code == 400, f"expected 400 got {r.status_code}"


def test_avatar_corrupted(org_s):
    files = {"file": ("bad.jpg", b"not-an-image", "image/jpeg")}
    r = org_s.post(f"{BASE_URL}/api/uploads/avatar", files=files, timeout=20)
    assert r.status_code == 400


def test_org_logo_rbac(caller_s):
    files = {"file": ("logo.jpg", _make_jpg(), "image/jpeg")}
    r = caller_s.post(f"{BASE_URL}/api/uploads/org-logo", files=files, timeout=20)
    assert r.status_code in (401, 403)


def test_org_logo_admin(org_s):
    files = {"file": ("logo.jpg", _make_jpg(), "image/jpeg")}
    r = org_s.post(f"{BASE_URL}/api/uploads/org-logo", files=files, timeout=30)
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"


# 5. Push
def test_push_public_key(org_s):
    r = org_s.get(f"{BASE_URL}/api/push/public-key", timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "public_key" in data or "publicKey" in data or "key" in data, data


def test_push_subscribe_unsubscribe(org_s):
    sub = {"endpoint": "https://fcm.googleapis.com/fcm/send/test-it17",
           "keys": {"p256dh": "BFakeKey", "auth": "FakeAuth"}}
    r = org_s.post(f"{BASE_URL}/api/push/subscribe", json=sub, timeout=20)
    assert r.status_code in (200, 201), f"{r.status_code} {r.text[:300]}"
    r2 = org_s.post(f"{BASE_URL}/api/push/unsubscribe", json={"endpoint": sub["endpoint"]}, timeout=20)
    assert r2.status_code == 200, r2.text


def test_push_test_endpoint(org_s):
    r = org_s.post(f"{BASE_URL}/api/push/test", timeout=20)
    assert r.status_code in (200, 400, 404), f"{r.status_code} {r.text[:200]}"


# 6. Notifications
def test_notifications_list(org_s):
    r = org_s.get(f"{BASE_URL}/api/notifications", timeout=20)
    assert r.status_code == 200


def test_notifications_unread_count(org_s):
    r = org_s.get(f"{BASE_URL}/api/notifications/unread-count", timeout=20)
    assert r.status_code == 200, r.text
    assert "count" in r.json()


def test_notifications_mark_all_read(org_s):
    r = org_s.post(f"{BASE_URL}/api/notifications/mark-all-read", timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert ("modified" in data) or ("modified_count" in data) or ("count" in data), data


# 7. Attachments
@pytest.fixture(scope="module")
def existing_lead(org_s):
    r = org_s.get(f"{BASE_URL}/api/leads?page=1&limit=5", timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    items = body.get("items") if isinstance(body, dict) else body
    assert items, f"no leads: {body}"
    return items[0].get("id") or items[0].get("_id")


def test_attachment_upload_and_download(org_s, existing_lead):
    pdf = b"%PDF-1.4\n%fake\n%%EOF" + b"\x00" * 1024
    files = {"file": ("regression.pdf", pdf, "application/pdf")}
    data = {"note": "iteration17"}
    r = org_s.post(f"{BASE_URL}/api/leads/{existing_lead}/attachments", files=files, data=data, timeout=30)
    assert r.status_code in (200, 201), f"{r.status_code} {r.text[:300]}"
    body = r.json()
    event_id = body.get("event_id") or body.get("id") or body.get("_id") or (body.get("event") or {}).get("id") or (body.get("event") or {}).get("_id")
    payload = body.get("payload") or body.get("event", {}).get("payload") or {}
    fn = payload.get("filename") or body.get("filename")
    du = payload.get("download_url") or body.get("download_url")
    assert fn, f"filename missing in {body}"
    assert du, f"download_url missing in {body}"

    if event_id:
        r2 = org_s.get(f"{BASE_URL}/api/attachments/download/{event_id}", timeout=20, allow_redirects=False)
        assert r2.status_code in (200, 302, 307), f"download {r2.status_code} {r2.text[:200]}"
        if r2.status_code == 200:
            cd = r2.headers.get("content-disposition", "")
            assert "attachment" in cd.lower(), f"missing attachment in CD: {cd}"
            assert ".pdf" in cd.lower(), f"ext missing in CD: {cd}"

        r3 = requests.get(f"{BASE_URL}/api/attachments/download/{event_id}", timeout=20, allow_redirects=False)
        assert r3.status_code in (401, 403), f"unauth expected 401 got {r3.status_code}"


def test_attachment_invalid_event(org_s):
    r = org_s.get(f"{BASE_URL}/api/attachments/download/000000000000000000000000", timeout=20)
    assert r.status_code in (403, 404)


def test_attachment_oversize(org_s, existing_lead):
    big = b"\x00" * (450 * 1024)
    files = {"file": ("big.pdf", big, "application/pdf")}
    r = org_s.post(f"{BASE_URL}/api/leads/{existing_lead}/attachments", files=files, timeout=30)
    assert r.status_code == 400, f"expected 400 got {r.status_code}"


def test_attachment_wrong_mime(org_s, existing_lead):
    files = {"file": ("note.txt", b"hello world", "text/plain")}
    r = org_s.post(f"{BASE_URL}/api/leads/{existing_lead}/attachments", files=files, timeout=20)
    assert r.status_code == 400


# 8. Edit Demo
def test_edit_demo_flow(org_s, existing_lead):
    # Need a demo_owner_id - use admin user id from /api/users
    users = org_s.get(f"{BASE_URL}/api/users", timeout=20).json()
    user_list = users if isinstance(users, list) else users.get("items", [])
    owner_id = (user_list[0].get("id") or user_list[0].get("_id")) if user_list else None
    if not owner_id:
        pytest.skip("no users to set as owner")
    create = {"lead_id": existing_lead, "demo_owner_id": owner_id,
              "scheduled_date": "2026-12-25", "scheduled_time": "10:00",
              "demo_mode": "Online", "demo_link": "https://meet.example.com/abc",
              "agenda": "Initial demo"}
    r = org_s.post(f"{BASE_URL}/api/demos", json=create, timeout=20)
    if r.status_code not in (200, 201):
        pytest.skip(f"cannot create demo: {r.status_code} {r.text[:300]}")
    demo = r.json()
    demo_id = demo.get("id") or demo.get("_id") or (demo.get("demo") or {}).get("id") or (demo.get("demo") or {}).get("_id")
    assert demo_id, f"no demo id in {demo}"

    r_empty = org_s.put(f"{BASE_URL}/api/demos/{demo_id}", json={}, timeout=20)
    assert r_empty.status_code == 400, f"empty expected 400 got {r_empty.status_code} {r_empty.text[:200]}"

    new_link = "https://meet.example.com/updated-it17"
    r_upd = org_s.put(f"{BASE_URL}/api/demos/{demo_id}", json={"demo_link": new_link, "agenda": "Updated"}, timeout=20)
    assert r_upd.status_code == 200, f"{r_upd.status_code} {r_upd.text[:300]}"
    body = r_upd.json()
    share = body.get("share") or {}
    wa = share.get("whatsapp") or ""
    if wa:
        from urllib.parse import unquote
        assert new_link in unquote(wa), f"updated link not in whatsapp share: {wa[:200]}"
