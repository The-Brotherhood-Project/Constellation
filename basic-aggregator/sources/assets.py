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
Static Assets Collector & Synchronizer
Copies common assets (common.css, icons, block styling, marked.js, and raw markdown files) into dist/.
All static assets reside inside blocks/ without cross-directory runtime dependencies.
Prepends license text block to copied CSS and JS assets.
"""

import shutil
from pathlib import Path
from typing import List, Dict, Any

from license_header import prepend_license_header


def sync_assets(
    dist_dir: Path,
    blocks_dir: Path,
    sources_dir: Path,
    documents: List[Dict[str, Any]],
    config_dir: Path
):
    """
    Collects and organizes static assets into the target dist directory.
    """
    dist_css = dist_dir / "css"
    dist_js = dist_dir / "js"
    dist_vendor = dist_dir / "vendor"
    dist_assets = dist_dir / "assets"
    dist_docs = dist_assets / "documents"

    for d in [dist_css, dist_js, dist_vendor, dist_assets, dist_docs]:
        d.mkdir(parents=True, exist_ok=True)

    # 1. Copy common assets from blocks/assets
    blocks_assets = blocks_dir / "assets"
    if blocks_assets.exists():
        common_css = blocks_assets / "common.css"
        if common_css.exists():
            css_content = common_css.read_text(encoding="utf-8")
            (dist_css / "common.css").write_text(
                prepend_license_header(css_content, config_dir, "css"),
                encoding="utf-8"
            )
        icon = blocks_assets / "icon.png"
        if icon.exists():
            shutil.copy2(icon, dist_assets / "icon.png")

    # 2. Copy block stylesheets
    block_styles = [
        ("navigation", "navigation.css"),
        ("footer", "footer.css"),
        ("layout", "layout.css"),
        ("home-hero", "home-hero.css"),
        ("document-card", "document-card.css"),
        ("document-viewer", "document-viewer.css"),
        ("infrastructure-card", "infrastructure-card.css"),
        ("instance-card", "instance-card.css")
    ]
    for block_name, css_file in block_styles:
        src_file = blocks_dir / block_name / css_file
        if src_file.exists():
            css_text = src_file.read_text(encoding="utf-8")
            (dist_css / css_file).write_text(
                prepend_license_header(css_text, config_dir, "css"),
                encoding="utf-8"
            )

    # 3. Copy block scripts
    viewer_js_src = blocks_dir / "document-viewer" / "document-viewer.js"
    if viewer_js_src.exists():
        js_text = viewer_js_src.read_text(encoding="utf-8")
        (dist_js / "document-viewer.js").write_text(
            prepend_license_header(js_text, config_dir, "js"),
            encoding="utf-8"
        )

    # 4. Copy vendor libraries (offline marked.min.js)
    vendor_marked_src = sources_dir / "vendor" / "marked.min.js"
    if vendor_marked_src.exists():
        shutil.copy2(vendor_marked_src, dist_vendor / "marked.min.js")

    # 5. Copy raw document markdown files for original downloads
    for doc in documents:
        src_path = Path(doc["file_path"])
        if src_path.exists():
            shutil.copy2(src_path, dist_docs / doc["file_name"])
