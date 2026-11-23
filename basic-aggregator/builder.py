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
Basic Aggregator - Introduction & Orchestration Script

Static build pipeline generating:
- dist/index.html (Handcrafted homepage entry with nav and footer)
- dist/documents.html (Phase 1: Document Library with client-side Markdown rendering)
- dist/digital.html (Phase 2: Digital Infrastructure directory)
- dist/physical.html (Phase 3: Physical Infrastructure and Hosting directory)

Supports standalone build or continuous daemon rebuild mode (--daemon / --watch).
"""

import os
import sys
import time
import json
import argparse
from pathlib import Path

try:
    import yaml
except ImportError:
    yaml = None

# Add sources to sys.path
BASE_DIR = Path(__file__).resolve().parent
SOURCES_DIR = BASE_DIR / "sources"
BLOCKS_DIR = BASE_DIR / "blocks"
CONFIG_DIR = BASE_DIR / "config"
DIST_DIR = BASE_DIR / "dist"

if str(SOURCES_DIR) not in sys.path:
    sys.path.insert(0, str(SOURCES_DIR))

from documents import load_documents
from repositories import load_repositories
from instances import load_instances
from composer import compose_home_page, compose_documents_page, compose_digital_page, compose_physical_page
from assets import sync_assets


def get_metadata(config_path: str) -> str:
    """
    Returns the service metadata JSON string of this aggregator.
    """
    config_data = {}
    if os.path.exists(config_path) and yaml:
        with open(config_path, "r", encoding="utf-8") as f:
            config_data = yaml.safe_load(f) or {}
    manifest = json.dumps(config_data)
    # Escape quotes for HTML attribute safely
    escaped_manifest = manifest.replace('"', '&quot;')

    return f'<meta name="service-metadata" content="{escaped_manifest}" />'


def get_rebuild_interval(config_path: str, default: int = 3600) -> int:
    """Reads rebuild_interval_seconds from service.yaml (default: 3600s)."""
    if os.path.exists(config_path) and yaml:
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
                return int(data.get("rebuild_interval_seconds", default))
        except Exception:
            pass
    return default


def build():
    print("=" * 60)
    print("Basic Aggregator - Static Aggregator Build")
    print("=" * 60)

    # 0. Get service metadata from config file
    service_config = CONFIG_DIR / "service.yaml"
    metadata = get_metadata(str(service_config))

    # 1. Discover and load documents (Phase 1)
    doc_config_file = CONFIG_DIR / "documents.yaml"
    print(f"[*] Loading documents config: {doc_config_file.name}")
    documents = load_documents(str(doc_config_file), str(BASE_DIR))
    print(f"[+] Loaded {len(documents)} document(s):")
    for doc in documents:
        tags_str = ", ".join(doc["tags"])
        print(f"    - {doc['id']}: '{doc['title']}' [{tags_str}]")

    # 2. Load digital infrastructure repositories (Phase 2)
    digital_config_file = CONFIG_DIR / "digital.yaml"
    print(f"[*] Loading digital infrastructure config: {digital_config_file.name}")
    repositories = load_repositories(str(digital_config_file))
    print(f"[+] Loaded {len(repositories)} repository record(s):")
    for repo in repositories:
        tags_str = ", ".join(repo["tags"])
        print(f"    - {repo['id']}: '{repo['name']}' ({repo['status']}, {repo['stage']}) [{tags_str}]")

    # 3. Load physical infrastructure instances (Phase 3)
    physical_config_file = CONFIG_DIR / "physical.yaml"
    print(f"[*] Loading physical infrastructure config: {physical_config_file.name}")
    instances = load_instances(str(physical_config_file), str(BASE_DIR))
    print(f"[+] Loaded {len(instances)} host instance(s):")
    for inst in instances:
        tags_str = ", ".join(inst["tags"])
        op = inst.get("service_operator") or inst.get("operator", "")
        print(f"    - {inst['id']}: '{inst['name']}' ({inst['status']}, {inst['service_type']}) [{op}] -> {inst['host_url']} [{tags_str}]")

    # 4. Synchronize static assets into dist/
    print(f"[*] Syncing static assets from blocks/ into: {DIST_DIR}")
    sync_assets(
        dist_dir=DIST_DIR,
        blocks_dir=BLOCKS_DIR,
        sources_dir=SOURCES_DIR,
        documents=documents,
        config_dir=CONFIG_DIR
    )

    # 5. Compose index.html (Homepage)
    print("[*] Composing index.html (Homepage)...")
    home_html = compose_home_page(blocks_dir=BLOCKS_DIR, metadata=metadata, config_dir=CONFIG_DIR)
    (DIST_DIR / "index.html").write_text(home_html, encoding="utf-8")

    # 6. Compose documents.html (Phase 1: Document Library)
    print("[*] Composing documents.html (Document Library)...")
    documents_html = compose_documents_page(documents=documents, blocks_dir=BLOCKS_DIR, metadata=metadata, config_dir=CONFIG_DIR)
    (DIST_DIR / "documents.html").write_text(documents_html, encoding="utf-8")

    # 7. Compose digital.html (Phase 2: Digital Infrastructure)
    print("[*] Composing digital.html (Digital Infrastructure)...")
    digital_html = compose_digital_page(repositories=repositories, blocks_dir=BLOCKS_DIR, metadata=metadata, config_dir=CONFIG_DIR)
    (DIST_DIR / "digital.html").write_text(digital_html, encoding="utf-8")

    # 8. Compose physical.html (Phase 3: Physical Infrastructure)
    print("[*] Composing physical.html (Physical Infrastructure)...")
    physical_html = compose_physical_page(instances=instances, blocks_dir=BLOCKS_DIR, metadata=metadata, config_dir=CONFIG_DIR)
    (DIST_DIR / "physical.html").write_text(physical_html, encoding="utf-8")

    print("[OK] Static site build complete! Output written to dist/")
    print("=" * 60)


def run_daemon():
    """Runs a background job to rebuild pages with new information every fixed interval."""
    interval = get_rebuild_interval(str(CONFIG_DIR / "service.yaml"), default=3600)
    print(f"[Daemon] Starting Basic Aggregator background daemon.")
    print(f"[Daemon] Configured rebuild interval: {interval} seconds.")
    
    while True:
        try:
            build()
        except Exception as e:
            print(f"[Daemon error] Build encountered an error: {e}")
        
        # Re-check interval from config in case it was updated
        interval = get_rebuild_interval(str(CONFIG_DIR / "service.yaml"), default=3600)
        print(f"[Daemon] Next build scheduled in {interval} seconds ({round(interval/60, 1)} minutes)...")
        time.sleep(interval)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Basic Aggregator")
    parser.add_argument("--daemon", action="store_true", help="Run background periodic rebuild daemon")
    parser.add_argument("--watch", action="store_true", help="Alias for --daemon")
    args = parser.parse_args()

    if args.daemon or args.watch or os.getenv("DAEMON_MODE") == "1":
        run_daemon()
    else:
        build()
