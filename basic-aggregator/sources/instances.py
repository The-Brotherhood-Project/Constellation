#
# Copyright (C) 2026 The Brotherhood Project Developers
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.
#
# SPDX-License-Identifier: AGPL-3.0-or-later
#
"""
Instances / Physical Infrastructure Source Module
Fetches and normalizes instance and host records from physical.yaml.
Queries /metadata on host endpoints (or extracts <meta name="service-metadata"> for static sites),
matching service_manifest schema (service_name, service_desc, service_type, service_operator,
service_did, latest_api_version, status, etc.).
Published manifest overrides editorial configuration.
"""

import os
import re
import json
import urllib.request
import urllib.error
from typing import Dict, List, Any
from pathlib import Path

try:
    import yaml
except ImportError:
    yaml = None

from documents import parse_tags


def fetch_host_metadata(host_url: str, base_workspace_dir: str = "", timeout: int = 2) -> tuple[Dict[str, Any], bool]:
    """
    Fetch metadata/service manifest from the given host URL:
    1. Direct /metadata endpoint if HTTP service (e.g. FastAPI)
    2. HTML <meta name="service-metadata" content='...'> if pointing to an HTML page
    3. Local fallback inspection if running locally or not reachable
    Returns (manifest_dict, is_online).
    """
    if not host_url:
        return {}, False

    clean_url = host_url.rstrip("/")

    # Check if this points directly to an HTML file or local static path
    if clean_url.endswith(".html"):
        # Try fetching the HTML content
        try:
            req = urllib.request.Request(host_url, headers={"User-Agent": "BrotherhoodSiteBuilder/0.1"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                html_text = resp.read().decode("utf-8")
                manifest = extract_manifest_from_html(html_text)
                return manifest, True
        except Exception:
            pass

        # If offline/local, check filesystem directly if matched
        if base_workspace_dir:
            for candidate in ["web-casey/index.html", "web-curator-lab/index.html"]:
                if candidate in clean_url or candidate.split("/")[0] in clean_url:
                    local_f = Path(base_workspace_dir) / candidate
                    if local_f.exists():
                        manifest = extract_manifest_from_html(local_f.read_text(encoding="utf-8"))
                        return manifest, True
        return {}, False

    # Otherwise query the /metadata endpoint
    metadata_url = f"{clean_url}/metadata"
    try:
        req = urllib.request.Request(metadata_url, headers={"User-Agent": "BrotherhoodSiteBuilder/0.1"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            content = resp.read().decode("utf-8")
            data = json.loads(content)
            return data, True
    except (urllib.error.URLError, Exception):
        # Service currently not reachable / offline
        return {}, False


def extract_manifest_from_html(html_text: str) -> Dict[str, Any]:
    """
    Extracts JSON service manifest embedded in:
    <meta name="service-metadata" content='...'> or <meta name="service-manifest" content='...'>
    """
    pattern = r'<meta\s+name=["\'](?:service-metadata|service-manifest)["\']\s+content=([\'"])(.*?)\1'
    match = re.search(pattern, html_text, re.IGNORECASE | re.DOTALL)
    if match:
        raw_json = match.group(2).replace("&quot;", '"')
        try:
            return json.loads(raw_json)
        except Exception:
            import html
            try:
                return json.loads(html.unescape(raw_json))
            except Exception as e:
                print(f"[warning] Failed to parse HTML service-metadata: {e}")
    return {}


def load_instances(config_path: str, base_dir: str = "") -> List[Dict[str, Any]]:
    """
    Load physical infrastructure items from physical.yaml and query their /metadata endpoint.
    Consistent naming with service_manifests (service_operator, service_did, service_name, etc.).
    Published manifest overrides editorial configuration.
    """
    config_data = {}
    if os.path.exists(config_path) and yaml:
        with open(config_path, "r", encoding="utf-8") as f:
            config_data = yaml.safe_load(f) or {}

    instances_config = config_data.get("instances", [])
    records = []

    # workspace root
    workspace_root = str(Path(base_dir).parent.resolve()) if base_dir else ""

    for item in instances_config:
        host_url = item.get("host_url", "").strip()
        manifest, is_online = fetch_host_metadata(host_url, workspace_root)

        # Published manifest overrides editorial configuration
        record_id = manifest.get("id") or item.get("id", "")
        service_name = manifest.get("service_name") or manifest.get("name") or item.get("service_name") or item.get("name", record_id)
        service_desc = manifest.get("service_desc") or manifest.get("description") or item.get("service_desc") or item.get("description", "")
        service_operator = manifest.get("service_operator") or manifest.get("operator") or item.get("service_operator") or item.get("operator", "The Brotherhood Project Developers")
        service_type = manifest.get("service_type") or item.get("service_type", "Service")
        service_did = manifest.get("service_did") or item.get("service_did", "")
        
        # API version: static sites leave it blank, servers report e.g. "v1"
        version = manifest.get("latest_api_version") if "latest_api_version" in manifest else item.get("latest_api_version") or item.get("version", "")

        # Determine status: if reached online manifest, use reported status or Online
        if is_online:
            status = manifest.get("status") or "Online"
        else:
            status = item.get("status", "Offline")

        featured = manifest.get("featured") if "featured" in manifest else item.get("featured", False)

        raw_tags = manifest.get("tags") if "tags" in manifest else item.get("tags", '["Instance"]')
        tags = parse_tags(raw_tags)
        if not tags:
            tags = ["Instance"]

        records.append({
            "id": record_id,
            "name": service_name,
            "service_name": service_name,
            "description": service_desc,
            "service_desc": service_desc,
            "operator": service_operator,
            "service_operator": service_operator,
            "service_did": service_did,
            "host_url": host_url,
            "service_type": service_type,
            "version": version,
            "latest_api_version": version,
            "status": status,
            "is_online": is_online,
            "tags": tags,
            "tags_json": json.dumps(tags),
            "featured": featured
        })

    return records
