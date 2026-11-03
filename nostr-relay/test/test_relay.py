"""
Substantial test suite for nostr-relay.
Tests API routes, database operations, signature verification, replaceable event logic (Kinds 27000 & 27001),
non-replaceable append-only logic (Kind 27002), and tag query filtering.
"""
import sys
import os
import time
import json
import base64
import hashlib
import unittest
from fastapi.testclient import TestClient

# Ensure nostr-relay root is in python path
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.insert(0, parent_dir)

from app.main import app
from app.database import engine, Base, SessionLocal
from app import crud, schemas, models
from cryptography.hazmat.primitives.asymmetric import ed25519

class TestNostrRelay(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        # Setup clean SQLite database
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        crud.seed_event_kinds(db)
        db.close()

    def generate_keypair(self):
        priv = ed25519.Ed25519PrivateKey.generate()
        pub_bytes = priv.public_key().public_bytes_raw()
        x_b64 = base64.urlsafe_b64encode(pub_bytes).rstrip(b'=').decode('ascii')
        jwk = {"kty": "OKP", "crv": "Ed25519", "x": x_b64}
        b64_jwk = base64.urlsafe_b64encode(json.dumps(jwk, separators=(',', ':')).encode('utf-8')).rstrip(b'=').decode('ascii')
        did = f"did:jwk:{b64_jwk}"
        return priv, did

    def create_signed_event(self, priv_key, did, kind, tags, created_at=None):
        ts = created_at if created_at is not None else int(time.time())
        serialized = json.dumps([0, did, ts, kind, tags], separators=(',', ':'), sort_keys=True)
        event_id = hashlib.sha256(serialized.encode('utf-8')).hexdigest()
        sig_bytes = priv_key.sign(event_id.encode('utf-8'))
        return {
            "id": event_id,
            "kind": kind,
            "did": did,
            "created_at": ts,
            "tags": tags,
            "sig": sig_bytes.hex()
        }

    def test_01_health_and_kinds_endpoint(self):
        """Test health check and seeded kinds API endpoints"""
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["status"], "healthy")

        res_kinds = self.client.get("/api/v1/kinds")
        self.assertEqual(res_kinds.status_code, 200)
        kinds = {k["kind"]: k["name"] for k in res_kinds.json()}
        self.assertIn(27000, kinds)
        self.assertIn(27001, kinds)
        self.assertIn(27002, kinds)

    def test_02_publish_valid_event(self):
        """Test publishing a valid signed Nostr event"""
        priv, did = self.generate_keypair()
        tags = {"name": "Test Node", "url": "http://node.test", "sub_type": "s"}
        event = self.create_signed_event(priv, did, 27000, tags)

        res = self.client.post("/api/v1/events", json=event)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["id"], event["id"])
        self.assertEqual(data["did"], did)

    def test_03_invalid_signature_rejection(self):
        """Test that invalid signature or tampered event ID is rejected with HTTP 400"""
        priv, did = self.generate_keypair()
        event = self.create_signed_event(priv, did, 27000, {"a": "b"})
        event["sig"] = "0" * 128  # Tamper signature

        res = self.client.post("/api/v1/events", json=event)
        self.assertEqual(res.status_code, 400)
        self.assertIn("Invalid event signature", res.json()["detail"])

    def test_04_unregistered_kind_rejection(self):
        """Test that unregistered event kinds are rejected"""
        priv, did = self.generate_keypair()
        event = self.create_signed_event(priv, did, 99999, {"a": "b"})

        res = self.client.post("/api/v1/events", json=event)
        self.assertEqual(res.status_code, 400)
        self.assertIn("Unregistered event kind", res.json()["detail"])

    def test_05_replaceable_kind_0(self):
        """Test Kind 0 (27000) replaceability rule: newer event replaces older event from same DID"""
        priv, did = self.generate_keypair()

        # Publish initial manifest at t=100
        event_v1 = self.create_signed_event(priv, did, 27000, {"version": "1.0"}, created_at=100)
        res1 = self.client.post("/api/v1/events", json=event_v1)
        self.assertEqual(res1.status_code, 200)

        # Query -> Should be v1.0
        q1 = self.client.post("/api/v1/events/query", json={"kinds": [27000], "dids": [did]})
        self.assertEqual(len(q1.json()), 1)
        self.assertEqual(q1.json()[0]["tags"]["version"], "1.0")

        # Publish updated manifest at t=200
        event_v2 = self.create_signed_event(priv, did, 27000, {"version": "2.0"}, created_at=200)
        res2 = self.client.post("/api/v1/events", json=event_v2)
        self.assertEqual(res2.status_code, 200)

        # Query -> MUST return only v2.0 (v1.0 was replaced!)
        q2 = self.client.post("/api/v1/events/query", json={"kinds": [27000], "dids": [did]})
        self.assertEqual(len(q2.json()), 1)
        self.assertEqual(q2.json()[0]["tags"]["version"], "2.0")

        # Publish stale manifest at t=50 -> Should be ignored
        event_v0 = self.create_signed_event(priv, did, 27000, {"version": "0.5"}, created_at=50)
        self.client.post("/api/v1/events", json=event_v0)

        q3 = self.client.post("/api/v1/events/query", json={"kinds": [27000], "dids": [did]})
        self.assertEqual(len(q3.json()), 1)
        self.assertEqual(q3.json()[0]["tags"]["version"], "2.0")

    def test_06_non_replaceable_kind_2(self):
        """Test Kind 2 (27002) non-replaceable append-only rule"""
        priv, did = self.generate_keypair()

        evt1 = self.create_signed_event(priv, did, 27002, {"update": "snapshot_created", "v": "1"})
        evt2 = self.create_signed_event(priv, did, 27002, {"update": "snapshot_created", "v": "2"})

        self.client.post("/api/v1/events", json=evt1)
        self.client.post("/api/v1/events", json=evt2)

        q = self.client.post("/api/v1/events/query", json={"kinds": [27002], "dids": [did]})
        self.assertEqual(len(q.json()), 2)

    def test_07_tag_dictionary_query(self):
        """Test querying events by arbitrary key/value tag dictionary filters"""
        priv, did = self.generate_keypair()

        evt_knw = self.create_signed_event(priv, did, 27001, {"url": "http://repo/1", "file_type": "knw", "cid": "cid1"})
        evt_pdf = self.create_signed_event(priv, did, 27001, {"url": "http://repo/2", "file_type": "pdf", "cid": "cid2"})

        self.client.post("/api/v1/events", json=evt_knw)
        self.client.post("/api/v1/events", json=evt_pdf)

        # Filter by file_type = knw
        q_knw = self.client.post("/api/v1/events/query", json={"kinds": [27001], "tags": {"file_type": "knw"}})
        self.assertEqual(len(q_knw.json()), 1)
        self.assertEqual(q_knw.json()[0]["tags"]["cid"], "cid1")

        # GET query parameter route
        q_get = self.client.get(f"/api/v1/events?kind=27001&did={did}")
        self.assertGreaterEqual(len(q_get.json()), 2)

if __name__ == "__main__":
    unittest.main()
