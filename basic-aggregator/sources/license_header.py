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
License Utility Module
Prepends license text block from config/license.txt to generated output files
using appropriate comment syntax according to file extension.
"""

from pathlib import Path


def get_license_text(config_dir: Path) -> str:
    """Reads license.txt from config directory if present."""
    license_file = config_dir / "license.txt"
    if license_file.exists():
        return license_file.read_text(encoding="utf-8").strip()
    return "Copyright (C) 2026 The Brotherhood Project Developers\nSPDX-License-Identifier: AGPL-3.0-or-later"


def format_license_header(license_text: str, file_type: str) -> str:
    """
    Formats the license text into comment syntax for the given file type:
    - html: <!-- ... -->
    - css / js: /* ... */
    - py / yaml: # ...
    """
    lines = license_text.splitlines()

    if file_type == "html":
        inner = "\n".join(f"-- {line}" if line else "--" for line in lines)
        return f"<!--\n{inner}\n-->\n"
    elif file_type == "css":
        inner = "\n".join(f"{line}" if line else "" for line in lines)
        return f"/*\n{inner}\n */\n"
    elif file_type == "js":
        inner = "\n".join(f" * {line}" if line else " *" for line in lines)
        return f"/*\n{inner}\n */\n"
    elif file_type in ("py", "yaml", "yml", "sh"):
        inner = "\n".join(f"# {line}" if line else "#" for line in lines)
        return f"{inner}\n"
    else:
        return f"{license_text}\n"


def prepend_license_header(content: str, config_dir: Path, file_type: str, strip_others: bool = False) -> str:
    """
    Prepends the formatted license header to content if not already present.
    """
    license_text = get_license_text(config_dir)
    header = format_license_header(license_text, file_type)

    # Avoid duplicate headers
    if "SPDX-License-Identifier" in content[:500] and not strip_others:
        return content

    return header + content.replace(header, "") if strip_others else header + content
