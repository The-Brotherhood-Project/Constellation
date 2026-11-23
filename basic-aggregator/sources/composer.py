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
Page Composer Module
Assembles blocks, common assets, and records into individual static HTML pages:
- index.html (Handcrafted homepage entry with nav, hero, and footer)
- documents.html (Document Library with client-side Markdown viewer)
- digital.html (Digital Infrastructure directory)
- physical.html (Physical Infrastructure directory)
"""

from doctest import debug_script
import json
from pathlib import Path
from typing import Dict, List, Any

from license_header import prepend_license_header


def render_badges(tags: List[str]) -> str:
    """
    Render generic tag badges from string list.
    """
    badges = []
    for idx, tag in enumerate(tags):
        tag_cls = "badge-tag badge-primary-tag" if idx == 0 else "badge-tag"
        badges.append(f'<span class="{tag_cls}">{tag}</span>')
    return "\n            ".join(badges)


def render_document_card(doc: Dict[str, Any], card_template: str) -> str:
    """
    Renders an individual document card block by replacing placeholders.
    """
    featured_class = "featured" if doc.get("featured") else ""
    badges_html = render_badges(doc.get("tags", []))

    rendered = card_template.replace("{id}", str(doc.get("id", "")))
    rendered = rendered.replace("{title}", str(doc.get("title", "")))
    rendered = rendered.replace("{description}", str(doc.get("description", "")))
    rendered = rendered.replace("{size_kb}", str(doc.get("size_kb", "0")))
    rendered = rendered.replace("{file_name}", str(doc.get("file_name", "")))
    rendered = rendered.replace("{featured_class}", featured_class)
    rendered = rendered.replace("{badges_html}", badges_html)
    return rendered


def render_infrastructure_card(item: Dict[str, Any], card_template: str) -> str:
    """
    Renders an individual digital infrastructure card block.
    """
    featured_class = "featured" if item.get("featured") else ""
    status = item.get("status", "Active")
    status_class = f"status-{status.lower().replace(' ', '-')}"
    badges_html = render_badges(item.get("tags", []))

    repo_url = item.get("repo_url", "#")
    repo_btn_html = ""
    if repo_url and repo_url != "#":
        repo_btn_html = f'''<a href="{repo_url}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-small">
            <span class="btn-icon">📁</span>
            <span class="btn-text">📁 Repository &amp; Docs</span>
        </a>'''

    rendered = card_template.replace("{id}", str(item.get("id", "")))
    rendered = rendered.replace("{name}", str(item.get("name", "")))
    rendered = rendered.replace("{description}", str(item.get("description", "")))
    rendered = rendered.replace("{status}", status)
    rendered = rendered.replace("{status_class}", status_class)
    rendered = rendered.replace("{stage}", str(item.get("stage", "Implemented")))
    rendered = rendered.replace("{repo_url}", repo_url)
    rendered = rendered.replace("{featured_class}", featured_class)
    rendered = rendered.replace("{badges_html}", badges_html)
    rendered = rendered.replace("{repo_btn_html}", repo_btn_html)
    return rendered


def render_instance_card(item: Dict[str, Any], card_template: str) -> str:
    """
    Renders an individual physical infrastructure instance card block.
    Consistent with service_manifest schemas (service_name, service_operator, service_did, etc.).
    """
    featured_class = "featured" if item.get("featured") else ""
    status = item.get("status", "Active")
    status_class = f"status-{status.lower().replace(' ', '-')}"
    badges_html = render_badges(item.get("tags", []))
    host_url = item.get("host_url", "#")

    # Service DID display
    service_did = item.get("service_did", "").strip()
    did_html = f'<div class="instance-did">DID: <code>{service_did}</code></div>' if service_did else ''

    # API Version display
    version = str(item.get("version", "")).strip()
    version_html = f'<span class="instance-version">{version}</span>' if version else ''

    service_name = item.get("service_name") or item.get("name", "")
    service_desc = item.get("service_desc") or item.get("description", "")
    service_operator = item.get("service_operator") or item.get("operator", "The Brotherhood Project Developers")

    rendered = card_template.replace("{id}", str(item.get("id", "")))
    rendered = rendered.replace("{name}", str(service_name))
    rendered = rendered.replace("{description}", str(service_desc))
    rendered = rendered.replace("{operator}", str(service_operator))
    rendered = rendered.replace("{service_type}", str(item.get("service_type", "Service")))
    rendered = rendered.replace("{status}", status)
    rendered = rendered.replace("{status_class}", status_class)
    rendered = rendered.replace("{host_url}", host_url)
    rendered = rendered.replace("{featured_class}", featured_class)
    rendered = rendered.replace("{badges_html}", badges_html)
    rendered = rendered.replace("{did_html}", did_html)
    rendered = rendered.replace("{version_html}", version_html)
    return rendered


def get_nav(blocks_dir: Path, active_page: str) -> str:
    nav_template = (blocks_dir / "navigation" / "navigation.html").read_text(encoding="utf-8")
    return (
        nav_template
        .replace("{nav_home_active}", "active" if active_page == "home" else "")
        .replace("{nav_documents_active}", "active" if active_page == "documents" else "")
        .replace("{nav_digital_active}", "active" if active_page == "digital" else "")
        .replace("{nav_physical_active}", "active" if active_page == "physical" else "")
    )


def compose_home_page(blocks_dir: Path, metadata: str, config_dir: Path) -> str:
    """
    Composes index.html (Handcrafted homepage entry with nav, home-hero block, and footer).
    Prepends license text block to output.
    """
    nav_html = get_nav(blocks_dir, "home")
    footer_html = (blocks_dir / "footer" / "footer.html").read_text(encoding="utf-8")
    hero_html = (blocks_dir / "home-hero" / "home-hero.html").read_text(encoding="utf-8")

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>The Brotherhood — Home</title>
    <link rel="shortcut icon" type="image/x-icon" href="assets/icon.png" />
    {metadata}
    <link rel="stylesheet" href="css/common.css">
    <link rel="stylesheet" href="css/layout.css">
    <link rel="stylesheet" href="css/navigation.css">
    <link rel="stylesheet" href="css/home-hero.css">
    <link rel="stylesheet" href="css/footer.css">
</head>
<body>
    {nav_html}

    <main class="page-container home-container">
        {hero_html}
    </main>

    {footer_html}
</body>
</html>
"""
    # Strip existing licenses inside the individual blocks
    return prepend_license_header(html, config_dir, "html", strip_others=True)


def compose_documents_page(
    documents: List[Dict[str, Any]],
    blocks_dir: Path,
    metadata: str,
    config_dir: Path
) -> str:
    """
    Composes documents.html (Document Library with client-side Markdown viewer).
    Prepends license text block to output.
    """
    nav_html = get_nav(blocks_dir, "documents")
    footer_html = (blocks_dir / "footer" / "footer.html").read_text(encoding="utf-8")
    card_template = (blocks_dir / "document-card" / "document-card.html").read_text(encoding="utf-8")
    viewer_html = (blocks_dir / "document-viewer" / "document-viewer.html").read_text(encoding="utf-8")

    cards_html_list = [render_document_card(doc, card_template) for doc in documents]
    cards_html = "\n".join(cards_html_list) if cards_html_list else "<p class='empty-state'>No documents found.</p>"

    registry_data = {
        doc["id"]: {
            "id": doc["id"],
            "title": doc["title"],
            "tags": doc["tags"],
            "file_name": doc["file_name"],
            "body_markdown": doc["body_markdown"]
        }
        for doc in documents
    }
    registry_json = json.dumps(registry_data)

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Documents — The Brotherhood</title>
    <link rel="shortcut icon" type="image/x-icon" href="assets/icon.png" />
    {metadata}
    <link rel="stylesheet" href="css/common.css">
    <link rel="stylesheet" href="css/layout.css">
    <link rel="stylesheet" href="css/navigation.css">
    <link rel="stylesheet" href="css/document-card.css">
    <link rel="stylesheet" href="css/document-viewer.css">
    <link rel="stylesheet" href="css/footer.css">
</head>
<body>
    {nav_html}

    <main class="page-container">
        <header class="page-header">
            <h1 class="page-title">Document Library</h1>
            <p class="page-subtitle">Browsable collection of core architectural specifications, guides, and roadmap documents.</p>
        </header>

        <section class="cards-grid" id="documents-container">
            {cards_html}
        </section>
    </main>

    {viewer_html}

    {footer_html}

    <!-- Client-side Markdown rendering library (vendored offline) -->
    <script src="vendor/marked.min.js"></script>

    <!-- Document data registry for client-side viewer -->
    <script>
        window.__DOCUMENTS_REGISTRY__ = {registry_json};
    </script>

    <!-- Block component controller -->
    <script src="js/document-viewer.js"></script>
</body>
</html>
"""
    # Strip existing licenses inside the individual blocks
    return prepend_license_header(html, config_dir, "html", strip_others=True)


def compose_digital_page(
    repositories: List[Dict[str, Any]],
    blocks_dir: Path,
    metadata: str,
    config_dir: Path
) -> str:
    """
    Composes digital.html (Digital Infrastructure directory).
    Prepends license text block to output.
    """
    nav_html = get_nav(blocks_dir, "digital")
    footer_html = (blocks_dir / "footer" / "footer.html").read_text(encoding="utf-8")
    card_template = (blocks_dir / "infrastructure-card" / "infrastructure-card.html").read_text(encoding="utf-8")

    cards_html_list = [render_infrastructure_card(repo, card_template) for repo in repositories]
    cards_html = "\n".join(cards_html_list) if cards_html_list else "<p class='empty-state'>No repositories configured.</p>"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Digital Infrastructure — The Brotherhood</title>
    <link rel="shortcut icon" type="image/x-icon" href="assets/icon.png" />
    {metadata}
    <link rel="stylesheet" href="css/common.css">
    <link rel="stylesheet" href="css/layout.css">
    <link rel="stylesheet" href="css/navigation.css">
    <link rel="stylesheet" href="css/infrastructure-card.css">
    <link rel="stylesheet" href="css/footer.css">
</head>
<body>
    {nav_html}

    <main class="page-container">
        <header class="page-header">
            <h1 class="page-title">Digital Infrastructure</h1>
            <p class="page-subtitle">Directory of software components, protocols, applications, and planned services.</p>
        </header>

        <section class="cards-grid" id="digital-container">
            {cards_html}
        </section>
    </main>

    {footer_html}
</body>
</html>
"""
    # Strip existing licenses inside the individual blocks
    return prepend_license_header(html, config_dir, "html", strip_others=True)


def compose_physical_page(
    instances: List[Dict[str, Any]],
    blocks_dir: Path,
    metadata: str,
    config_dir: Path
) -> str:
    """
    Composes physical.html (Physical Infrastructure and Hosting directory).
    Prepends license text block to output.
    """
    nav_html = get_nav(blocks_dir, "physical")
    footer_html = (blocks_dir / "footer" / "footer.html").read_text(encoding="utf-8")
    card_template = (blocks_dir / "instance-card" / "instance-card.html").read_text(encoding="utf-8")

    cards_html_list = [render_instance_card(inst, card_template) for inst in instances]
    cards_html = "\n".join(cards_html_list) if cards_html_list else "<p class='empty-state'>No running instances configured.</p>"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Physical Infrastructure — The Brotherhood</title>
    <link rel="shortcut icon" type="image/x-icon" href="assets/icon.png" />
    {metadata}
    <link rel="stylesheet" href="css/common.css">
    <link rel="stylesheet" href="css/layout.css">
    <link rel="stylesheet" href="css/navigation.css">
    <link rel="stylesheet" href="css/instance-card.css">
    <link rel="stylesheet" href="css/footer.css">
</head>
<body>
    {nav_html}

    <main class="page-container">
        <header class="page-header">
            <h1 class="page-title">Physical Infrastructure &amp; Hosting</h1>
            <p class="page-subtitle">Directory of running service instances, operators, endpoints, and deployment nodes.</p>
        </header>

        <section class="cards-grid" id="physical-container">
            {cards_html}
        </section>
    </main>

    {footer_html}
</body>
</html>
"""
    # Strip existing licenses inside the individual blocks
    return prepend_license_header(html, config_dir, "html", strip_others=True)
