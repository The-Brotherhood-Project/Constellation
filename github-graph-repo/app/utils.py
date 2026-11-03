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
import json
import zstandard as zstd
import hashlib
import os
from urllib import request
import jcs as _jcs
import struct
from typing import Any

MAGIC = b"KNW"
PROTOCOL_VERSION = 2
COMPRESSION_ZSTD = 1
HEADER_SIZE = 3 + 2 + 1

def hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def _normalize_numbers(obj: Any) -> Any:
    """Collapse whole-valued floats to ints so that 1.0 and 1 serialize identically.

    JavaScript represents 1.0 and 1 as the same IEEE 754 double and JSON.stringify
    emits the shortest form ("1"). Python distinguishes float from int, so we
    normalise here to keep the canonical output byte-identical to the frontend.
    """
    if isinstance(obj, bool):
        return obj
    if isinstance(obj, float):
        return int(obj) if obj.is_integer() and not (obj != obj or obj == float("inf") or obj == float("-inf")) else obj
    if isinstance(obj, dict):
        return {k: _normalize_numbers(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_normalize_numbers(v) for v in obj]
    return obj

def verify_blob_header(blob: bytes) -> bytes:
    """Verifies the header of the blob and returns the rest"""
    if not isinstance(blob, (bytes, bytearray)):
        raise Exception("knw blob must be raw bytes")
    if len(blob) < HEADER_SIZE:
        raise Exception("knw blob too short to contain a v1.0 header")

    magic = bytes(blob[:3])
    if magic != MAGIC:
        raise Exception(
            f"bad magic number: expected {MAGIC!r}, got {magic!r}"
        )

    version = struct.unpack("<H", bytes(blob[3:5]))[0]
    if version != PROTOCOL_VERSION:
        raise Exception(
            f"unsupported protocol version {version}; expected {PROTOCOL_VERSION}"
        )

    algorithm = blob[5]
    if algorithm != COMPRESSION_ZSTD:
        raise Exception(
            f"unsupported compression algorithm {algorithm}; expected {COMPRESSION_ZSTD} (zstd)"
        )

    return blob[6:]

def verify_knw(raw_data: bytes) -> dict:
    """Verifies protocol and hashes and returns the data as a dict"""
    # Header layout: 3 bytes magic "KNW" + 2 bytes protocol "1" + 1 byte algo flag with "1" == "zstd"
    data = verify_blob_header(raw_data)
    
    metadata, graph, positions = parse_graph_data(data)

    # Recompute and verify hashes
    cid = metadata["cid"]
    computed_cid = hash(_jcs.canonicalize(_normalize_numbers(graph)))
    if computed_cid != cid:
        raise Exception(f"cid mismatch: declared={cid}, computed={computed_cid}")
    
    return {"metadata": metadata, "graph": graph, "positions": positions}

def parse_graph_data(graph_data: bytes) -> tuple[dict, dict, dict]:
    """Parse the graph data as json"""
    if not graph_data:
        raise Exception("knw payload is empty")

    decompressor = zstd.ZstdDecompressor()
    payload_bytes = decompressor.decompress(graph_data)

    payload = json.loads(payload_bytes.decode("utf-8"))

    return payload["metadata"], payload["graph"], payload["positions"]

def send_request_to_ucan_service(endpoint: str, payload: dict) -> dict:
    """Send a request to the UCAN service with the given endpoint and payload"""
    ucan_url = os.getenv("UCAN_SERVICE_URL", "http://localhost:7600")
    url = f"{ucan_url}/{endpoint}"
    data = json.dumps(payload).encode("utf-8")
    req = request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with request.urlopen(req, timeout=10) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw)
    except Exception as e:
        print(f"Error calling UCAN service {endpoint}: {e}")
        print(f"Request payload was: {payload}")
        raise e
    