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
Repositories / Digital Infrastructure Source Module
Fetches and normalizes infrastructure records from configuration and remote/local manifests.
Published manifest values override editorial values.
"""

import os
import json
import urllib.request
import urllib.error
from typing import Dict, List, Any

try:
    import yaml
except ImportError:
    yaml = None

from documents import parse_tags


def fetch_manifest(url: str, timeout: int = 3) -> Dict[str, Any]:
    """
    Fetch a remote manifest JSON or YAML from GitHub, server, or file with graceful fallback.
    """
    if not url:
        return {}
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "BrotherhoodSiteBuilder/0.1"}
        )
        with urllib.request.urlopen(req, timeout=timeout) as response:
            content = response.read().decode("utf-8")
            try:
                return json.loads(content)
            except Exception:
                if yaml:
                    return yaml.safe_load(content) or {}
    except (urllib.error.URLError, Exception) as e:
        print(f"[info] Remote manifest not reachable at {url}: {e}")
    return {}


def load_repositories(config_path: str) -> List[Dict[str, Any]]:
    """
    Load digital infrastructure / repository items from digital.yaml,
    enriching them with remote/local manifests where available.
    Published manifest values override editorial values.
    """
    config_data = {}
    if os.path.exists(config_path) and yaml:
        with open(config_path, "r", encoding="utf-8") as f:
            config_data = yaml.safe_load(f) or {}

    repos_config = config_data.get("repositories", [])
    records = []

    for item in repos_config:
        manifest_url = item.get("manifest_url", "").strip()
        manifest_data = {}
        if manifest_url:
            manifest_data = fetch_manifest(manifest_url)

        # Published manifest overrides editorial configuration
        record_id = manifest_data.get("id") or item.get("id", "")
        name = manifest_data.get("service_name") or manifest_data.get("name") or item.get("name", record_id)
        description = manifest_data.get("service_desc") or manifest_data.get("description") or item.get("description", "")
        repo_url = manifest_data.get("public_repo_url") or manifest_data.get("repo_url") or item.get("repo_url", "")
        status = manifest_data.get("status") or item.get("status", "Active")
        stage = manifest_data.get("stage") or item.get("stage", "Implemented")
        featured = manifest_data.get("featured") if "featured" in manifest_data else item.get("featured", False)

        raw_tags = manifest_data.get("tags") if "tags" in manifest_data else item.get("tags", '["Software"]')
        tags = parse_tags(raw_tags)
        if not tags:
            tags = ["Software"]

        records.append({
            "id": record_id,
            "name": name,
            "description": description,
            "repo_url": repo_url,
            "status": status,
            "stage": stage,
            "tags": tags,
            "tags_json": json.dumps(tags),
            "featured": featured,
            "manifest_url": manifest_url
        })

    return records
