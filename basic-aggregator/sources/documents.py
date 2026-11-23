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
Document Source Module
Handles discovery, metadata extraction (frontmatter + fallback), and loading of markdown documents.
"""

import os
import re
import json
from pathlib import Path
from typing import Dict, List, Any

try:
    import yaml
except ImportError:
    yaml = None


def parse_tags(tags_val: Any) -> List[str]:
    """
    Parse tags from either a list or a stringified JSON array: e.g. '["tag1", "tag2"]'
    """
    if isinstance(tags_val, list):
        return [str(t).strip() for t in tags_val if str(t).strip()]
    if isinstance(tags_val, str):
        trimmed = tags_val.strip()
        if trimmed.startswith("[") and trimmed.endswith("]"):
            try:
                parsed = json.loads(trimmed)
                if isinstance(parsed, list):
                    return [str(t).strip() for t in parsed if str(t).strip()]
            except Exception:
                pass
            # Fallback comma-split inside brackets
            inner = trimmed[1:-1]
            return [t.strip().strip('"').strip("'") for t in inner.split(",") if t.strip()]
        # Comma-separated fallback
        return [t.strip() for t in trimmed.split(",") if t.strip()]
    return []


def parse_frontmatter(content: str) -> tuple[Dict[str, Any], str]:
    """
    Extract YAML frontmatter if present at the top of markdown content.
    Returns (metadata_dict, body_markdown).
    """
    metadata = {}
    body = content

    pattern = r"^---\s*\r?\n(.*?)\r?\n---\s*\r?\n(.*)$"
    match = re.match(pattern, content, re.DOTALL)
    if match and yaml:
        raw_meta = match.group(1)
        body = match.group(2)
        try:
            parsed = yaml.safe_load(raw_meta)
            if isinstance(parsed, dict):
                metadata = parsed
        except Exception as e:
            print(f"[warning] Failed to parse frontmatter: {e}")

    return metadata, body


def extract_title_from_markdown(content: str, fallback: str) -> str:
    """
    Extract the first H1 heading (# Title) from markdown body if no title was in metadata.
    """
    for line in content.splitlines():
        line = line.strip()
        if line.startswith("# "):
            return line[2:].strip()
    return fallback


def extract_description_from_markdown(content: str, fallback: str = "") -> str:
    """
    Extract the first paragraph of text after title as fallback description.
    """
    paragraphs = []
    current_para = []

    for line in content.splitlines():
        trimmed = line.strip()
        if trimmed.startswith("#"):
            continue
        if trimmed:
            current_para.append(trimmed)
        elif current_para:
            paragraphs.append(" ".join(current_para))
            current_para = []
    if current_para:
        paragraphs.append(" ".join(current_para))

    if paragraphs:
        desc = paragraphs[0]
        if len(desc) > 220:
            return desc[:217] + "..."
        return desc
    return fallback


def load_documents(config_path: str, base_dir: str) -> List[Dict[str, Any]]:
    """
    Load document records based on documents.yaml and directory scan.
    """
    config_data = {}
    if os.path.exists(config_path) and yaml:
        with open(config_path, "r", encoding="utf-8") as f:
            config_data = yaml.safe_load(f) or {}

    doc_dir_setting = config_data.get("documents_directory", "../docs")
    target_dir = Path(base_dir) / doc_dir_setting
    target_dir = target_dir.resolve()

    configured_docs = {d.get("file", d.get("id")): d for d in config_data.get("documents", [])}

    documents = []

    if target_dir.exists() and target_dir.is_dir():
        found_files = sorted(list(target_dir.glob("*.md")))
        for file_path in found_files:
            file_name = file_path.name
            raw_content = file_path.read_text(encoding="utf-8")
            frontmatter_meta, body = parse_frontmatter(raw_content)

            cfg = configured_docs.get(file_name, {})

            doc_id = cfg.get("id") or frontmatter_meta.get("id") or file_path.stem.lower().replace(" ", "-")
            title = (
                cfg.get("title")
                or frontmatter_meta.get("title")
                or extract_title_from_markdown(body, file_path.stem)
            )
            description = (
                cfg.get("description")
                or frontmatter_meta.get("description")
                or extract_description_from_markdown(body, "")
            )

            # Generic tagging system
            raw_tags = cfg.get("tags") if "tags" in cfg else frontmatter_meta.get("tags", '["Documentation"]')
            tags = parse_tags(raw_tags)
            if not tags:
                tags = ["Documentation"]

            featured = cfg.get("featured", frontmatter_meta.get("featured", False))

            stat = file_path.stat()
            file_size_kb = round(stat.st_size / 1024, 1)

            documents.append({
                "id": doc_id,
                "file_name": file_name,
                "file_path": str(file_path),
                "title": title,
                "description": description,
                "tags": tags,
                "tags_json": json.dumps(tags),
                "featured": featured,
                "size_kb": file_size_kb,
                "content_markdown": raw_content,
                "body_markdown": body,
                "meta": {**frontmatter_meta, **cfg}
            })

    return documents
