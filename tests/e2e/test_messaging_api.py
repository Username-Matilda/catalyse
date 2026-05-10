"""
E2E tests for messaging and notification routes — parameterised to run against both FastAPI and Next.js.

Scenarios covered:
  - POST /api/contact/{volunteer_id}  (send relay message)
  - GET  /api/messages                (list sent/received)
  - PUT  /api/messages/{id}/read      (mark message read)
  - GET  /api/notifications           (list notifications, unread_only filter)
  - PUT  /api/notifications/read-all  (mark all read)
"""

import uuid
import requests
import pytest


def _api(method, path, base_url, json=None, token=None, params=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return requests.request(
        method, f"{base_url}{path}",
        json=json, headers=headers, params=params, timeout=10,
    )


def _signup(base_url, consent_contact=True):
    name = f"User_{uuid.uuid4().hex[:8]}"
    email = f"{name.lower()}@test.com"
    data = _api("POST", "/api/auth/signup", base_url=base_url, json={
        "name": name,
        "email": email,
        "password": "testpassword1",
        "consent_profile_visible": True,
        "consent_contact_by_owners": consent_contact,
    }).json()
    return {"id": data["id"], "token": data["auth_token"], "name": name, "email": email}


class TestSendContactMessage:
    """POST /api/contact/{volunteer_id}"""

    @pytest.mark.local_only
    def test_requires_authentication(self, api_url, new_user):
        resp = _api("POST", f"/api/contact/{new_user['id']}", base_url=api_url,
                    json={"subject": "Hello", "message": "Hi there"})
        assert resp.status_code == 401

    @pytest.mark.local_only
    def test_cannot_message_yourself(self, api_url, new_user):
        resp = _api("POST", f"/api/contact/{new_user['id']}", base_url=api_url,
                    json={"subject": "Hello", "message": "Hi"},
                    token=new_user["token"])
        assert resp.status_code == 400
        assert "yourself" in resp.json()["detail"].lower()

    @pytest.mark.local_only
    def test_unknown_volunteer_returns_404(self, api_url, new_user):
        resp = _api("POST", "/api/contact/999999", base_url=api_url,
                    json={"subject": "Hello", "message": "Hi"},
                    token=new_user["token"])
        assert resp.status_code == 404

    @pytest.mark.local_only
    def test_volunteer_without_consent_returns_404(self, api_url, new_user):
        no_consent = _signup(api_url, consent_contact=False)
        resp = _api("POST", f"/api/contact/{no_consent['id']}", base_url=api_url,
                    json={"subject": "Hello", "message": "Hi"},
                    token=new_user["token"])
        assert resp.status_code == 404

    @pytest.mark.local_only
    def test_missing_subject_returns_422(self, api_url, new_user):
        recipient = _signup(api_url)
        resp = _api("POST", f"/api/contact/{recipient['id']}", base_url=api_url,
                    json={"message": "Hi there"},
                    token=new_user["token"])
        assert resp.status_code == 422

    @pytest.mark.local_only
    def test_missing_message_returns_422(self, api_url, new_user):
        recipient = _signup(api_url)
        resp = _api("POST", f"/api/contact/{recipient['id']}", base_url=api_url,
                    json={"subject": "Hello"},
                    token=new_user["token"])
        assert resp.status_code == 422

    @pytest.mark.local_only
    def test_successful_send_returns_message(self, api_url, new_user):
        recipient = _signup(api_url)
        resp = _api("POST", f"/api/contact/{recipient['id']}", base_url=api_url,
                    json={"subject": "Hello", "message": "Hi there"},
                    token=new_user["token"])
        assert resp.status_code == 200
        assert "message" in resp.json()

    @pytest.mark.local_only
    def test_invalid_volunteer_id_returns_400_or_404(self, api_url, new_user):
        resp = _api("POST", "/api/contact/notanid", base_url=api_url,
                    json={"subject": "Hello", "message": "Hi"},
                    token=new_user["token"])
        assert resp.status_code in (400, 404, 422)


class TestGetMessages:
    """GET /api/messages"""

    @pytest.mark.local_only
    def test_requires_authentication(self, api_url):
        resp = _api("GET", "/api/messages", base_url=api_url)
        assert resp.status_code == 401

    @pytest.mark.local_only
    def test_returns_sent_and_received_structure(self, api_url, new_user):
        resp = _api("GET", "/api/messages", base_url=api_url, token=new_user["token"])
        assert resp.status_code == 200
        data = resp.json()
        assert "received" in data
        assert "sent" in data
        assert isinstance(data["received"], list)
        assert isinstance(data["sent"], list)

    @pytest.mark.local_only
    def test_sent_message_appears_in_sent_box(self, api_url, new_user):
        recipient = _signup(api_url)
        subject = f"Subject_{uuid.uuid4().hex[:6]}"
        _api("POST", f"/api/contact/{recipient['id']}", base_url=api_url,
             json={"subject": subject, "message": "Test body"},
             token=new_user["token"])

        resp = _api("GET", "/api/messages", base_url=api_url, token=new_user["token"])
        assert resp.status_code == 200
        sent = resp.json()["sent"]
        assert any(m["subject"] == subject for m in sent)

    @pytest.mark.local_only
    def test_received_message_appears_in_received_box(self, api_url, new_user):
        sender = _signup(api_url)
        subject = f"Recv_{uuid.uuid4().hex[:6]}"
        _api("POST", f"/api/contact/{new_user['id']}", base_url=api_url,
             json={"subject": subject, "message": "Hello"},
             token=sender["token"])

        resp = _api("GET", "/api/messages", base_url=api_url, token=new_user["token"])
        assert resp.status_code == 200
        received = resp.json()["received"]
        assert any(m["subject"] == subject for m in received)

    @pytest.mark.local_only
    def test_received_message_has_from_name(self, api_url, new_user):
        sender = _signup(api_url)
        subject = f"FN_{uuid.uuid4().hex[:6]}"
        _api("POST", f"/api/contact/{new_user['id']}", base_url=api_url,
             json={"subject": subject, "message": "Hello"},
             token=sender["token"])

        resp = _api("GET", "/api/messages", base_url=api_url, token=new_user["token"])
        msgs = [m for m in resp.json()["received"] if m["subject"] == subject]
        assert msgs
        assert msgs[0]["from_name"] == sender["name"]

    @pytest.mark.local_only
    def test_sent_message_has_to_name(self, api_url, new_user):
        recipient = _signup(api_url)
        subject = f"TN_{uuid.uuid4().hex[:6]}"
        _api("POST", f"/api/contact/{recipient['id']}", base_url=api_url,
             json={"subject": subject, "message": "Test"},
             token=new_user["token"])

        resp = _api("GET", "/api/messages", base_url=api_url, token=new_user["token"])
        msgs = [m for m in resp.json()["sent"] if m["subject"] == subject]
        assert msgs
        assert msgs[0]["to_name"] == recipient["name"]


class TestMarkMessageRead:
    """PUT /api/messages/{id}/read"""

    @pytest.mark.local_only
    def test_requires_authentication(self, api_url, new_user):
        resp = _api("PUT", "/api/messages/1/read", base_url=api_url)
        assert resp.status_code == 401

    @pytest.mark.local_only
    def test_marks_own_message_as_read(self, api_url, new_user):
        sender = _signup(api_url)
        subject = f"Read_{uuid.uuid4().hex[:6]}"
        _api("POST", f"/api/contact/{new_user['id']}", base_url=api_url,
             json={"subject": subject, "message": "Hello"},
             token=sender["token"])

        messages = _api("GET", "/api/messages", base_url=api_url, token=new_user["token"]).json()
        msg = next(m for m in messages["received"] if m["subject"] == subject)
        assert msg["read_at"] is None

        resp = _api("PUT", f"/api/messages/{msg['id']}/read", base_url=api_url, token=new_user["token"])
        assert resp.status_code == 200

        updated = _api("GET", "/api/messages", base_url=api_url, token=new_user["token"]).json()
        msg2 = next(m for m in updated["received"] if m["subject"] == subject)
        assert msg2["read_at"] is not None

    @pytest.mark.local_only
    def test_cannot_mark_others_message_as_read(self, api_url, new_user):
        sender = _signup(api_url)
        bystander = _signup(api_url)
        subject = f"Other_{uuid.uuid4().hex[:6]}"
        _api("POST", f"/api/contact/{new_user['id']}", base_url=api_url,
             json={"subject": subject, "message": "Hello"},
             token=sender["token"])

        messages = _api("GET", "/api/messages", base_url=api_url, token=new_user["token"]).json()
        msg = next(m for m in messages["received"] if m["subject"] == subject)

        resp = _api("PUT", f"/api/messages/{msg['id']}/read", base_url=api_url, token=bystander["token"])
        assert resp.status_code == 404

    @pytest.mark.local_only
    def test_nonexistent_message_returns_404(self, api_url, new_user):
        resp = _api("PUT", "/api/messages/999999/read", base_url=api_url, token=new_user["token"])
        assert resp.status_code == 404


class TestGetNotifications:
    """GET /api/notifications"""

    @pytest.mark.local_only
    def test_requires_authentication(self, api_url):
        resp = _api("GET", "/api/notifications", base_url=api_url)
        assert resp.status_code == 401

    @pytest.mark.local_only
    def test_returns_list(self, api_url, new_user):
        resp = _api("GET", "/api/notifications", base_url=api_url, token=new_user["token"])
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    @pytest.mark.local_only
    def test_message_creates_notification_for_recipient(self, api_url, new_user):
        sender = _signup(api_url)
        subject = f"Notif_{uuid.uuid4().hex[:6]}"
        _api("POST", f"/api/contact/{new_user['id']}", base_url=api_url,
             json={"subject": subject, "message": "Hello"},
             token=sender["token"])

        resp = _api("GET", "/api/notifications", base_url=api_url, token=new_user["token"])
        assert resp.status_code == 200
        notifs = resp.json()
        assert any(n["type"] == "message_received" for n in notifs)

    @pytest.mark.local_only
    def test_notification_has_expected_fields(self, api_url, new_user):
        sender = _signup(api_url)
        _api("POST", f"/api/contact/{new_user['id']}", base_url=api_url,
             json={"subject": "FieldCheck", "message": "Hello"},
             token=sender["token"])

        resp = _api("GET", "/api/notifications", base_url=api_url, token=new_user["token"])
        notifs = [n for n in resp.json() if n["type"] == "message_received"]
        assert notifs
        n = notifs[0]
        assert "id" in n
        assert "type" in n
        assert "title" in n
        assert "body" in n
        assert "read_at" in n
        assert "created_at" in n

    @pytest.mark.local_only
    def test_unread_only_filter(self, api_url, new_user):
        sender = _signup(api_url)
        _api("POST", f"/api/contact/{new_user['id']}", base_url=api_url,
             json={"subject": "UnreadFilter", "message": "Hello"},
             token=sender["token"])

        all_notifs = _api("GET", "/api/notifications", base_url=api_url, token=new_user["token"]).json()
        unread_notifs = _api("GET", "/api/notifications", base_url=api_url,
                             token=new_user["token"], params={"unread_only": "true"}).json()

        unread_ids = {n["id"] for n in unread_notifs}
        assert all(n["read_at"] is None for n in unread_notifs)
        # All unread should be a subset of all notifications
        assert unread_ids.issubset({n["id"] for n in all_notifs})


class TestMarkAllNotificationsRead:
    """PUT /api/notifications/read-all"""

    @pytest.mark.local_only
    def test_requires_authentication(self, api_url):
        resp = _api("PUT", "/api/notifications/read-all", base_url=api_url)
        assert resp.status_code == 401

    @pytest.mark.local_only
    def test_marks_all_unread_as_read(self, api_url, new_user):
        sender = _signup(api_url)
        for i in range(2):
            _api("POST", f"/api/contact/{new_user['id']}", base_url=api_url,
                 json={"subject": f"Bulk_{i}_{uuid.uuid4().hex[:4]}", "message": "Hello"},
                 token=sender["token"])

        unread_before = _api("GET", "/api/notifications", base_url=api_url,
                             token=new_user["token"], params={"unread_only": "true"}).json()
        assert len(unread_before) > 0

        resp = _api("PUT", "/api/notifications/read-all", base_url=api_url, token=new_user["token"])
        assert resp.status_code == 200

        unread_after = _api("GET", "/api/notifications", base_url=api_url,
                            token=new_user["token"], params={"unread_only": "true"}).json()
        assert len(unread_after) == 0

    @pytest.mark.local_only
    def test_returns_confirmation_message(self, api_url, new_user):
        resp = _api("PUT", "/api/notifications/read-all", base_url=api_url, token=new_user["token"])
        assert resp.status_code == 200
        assert "message" in resp.json()
