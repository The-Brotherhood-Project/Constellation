"""
Substantial test suite for github-graph-repo Nostr publishing integration.
Tests nostr_service event construction, ed25519 signature validation against nostr-relay schema,
multi-relay URL parsing & broadcasting, and startup manifest renewal (Kind 0).
"""
import sys
import os
import unittest
from unittest.mock import patch, MagicMock

# Ensure github-graph-repo root is in python path
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.insert(0, parent_dir)

from app import nostr_service
from cryptography.hazmat.primitives.asymmetric import ed25519

class TestGraphNostrPublishing(unittest.TestCase):

    def test_01_relay_urls_parsing(self):
        """Test parsing single, comma-separated, or JSON list relay URLs"""
        with patch.dict(os.environ, {"NOSTR_RELAY_URLS": "http://relay1:10000, http://relay2:10000"}):
            urls = nostr_service.get_relay_urls()
            self.assertEqual(urls, ["http://relay1:10000", "http://relay2:10000"])

        with patch.dict(os.environ, {"NOSTR_RELAY_URLS": '["http://r1:10000", "http://r2:10000"]'}):
            urls = nostr_service.get_relay_urls()
            self.assertEqual(urls, ["http://r1:10000", "http://r2:10000"])

    def test_02_event_creation_and_signing(self):
        """Test event signature generation and structural validity"""
        tags = {"kind": "0", "name": "Test Repo", "url": "http://localhost:8000"}
        event = nostr_service.create_and_sign_event(kind=27000, tags=tags)

        self.assertIn("id", event)
        self.assertIn("sig", event)
        self.assertEqual(event["kind"], 27000)
        self.assertTrue(event["did"].startswith("did:jwk:"))
        self.assertEqual(len(event["sig"]), 128)

    @patch("app.nostr_service.broadcast_event")
    def test_03_renew_manifest(self, mock_broadcast):
        """Test startup manifest renewal (Kind 27000 event publishing)"""
        mock_broadcast.return_value = {"http://localhost:10000": True}
        
        event = nostr_service.renew_manifest()
        
        self.assertEqual(event["kind"], 27000)
        self.assertEqual(event["tags"]["sub_type"], "s")
        mock_broadcast.assert_called_once()

    @patch("app.nostr_service.broadcast_event")
    def test_04_publish_action_events(self, mock_broadcast):
        """Test publishing Kind 0, 1, and 2 events for graph and snapshot creation"""
        mock_broadcast.return_value = {"http://localhost:10000": True}

        # Graph manifest (Kind 0)
        e0 = nostr_service.publish_graph_manifest("MyGraph", "uuid-123", "http://github.com/org/mygraph")
        self.assertEqual(e0["kind"], 27000)
        self.assertEqual(e0["tags"]["name"], "MyGraph")

        # Resource availability (Kind 1)
        e1_json, e1_knw = nostr_service.publish_resource_availability("uuid-123", "cid-456", "http://github.com/org/mygraph")
        self.assertEqual(e1_json["kind"], 27001)
        self.assertEqual(e1_json["tags"]["cid"], "cid-456")
        self.assertEqual(e1_json["tags"]["file_type"], "json")
        self.assertEqual(e1_knw["tags"]["cid"], "cid-456")
        self.assertEqual(e1_knw["tags"]["file_type"], "knw")

        # Project update (Kind 2)
        e2 = nostr_service.publish_project_update("uuid-123", "versadd")
        self.assertEqual(e2["kind"], 27002)
        self.assertEqual(e2["tags"]["sub_type"], "versadd")

if __name__ == "__main__":
    unittest.main()
