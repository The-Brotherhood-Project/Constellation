# This script just takes the input_json file, serialises it and produces a knw file (for now only v2, latest)
import zstandard as zstd
import struct
import hashlib
import json
import jcs as _jcs
from datetime import datetime
from typing import Any
import uuid

MAGIC = b"KNW"
PROTOCOL_VERSION = 2
COMPRESSION_ZSTD = 1
HEADER_SIZE = 3 + 2 + 1

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

def sha256_hex(data: bytes) -> str:
    """Return lowercase hex SHA-256 of `data`."""
    return hashlib.sha256(data).hexdigest()

def build_payload_v1(graph_data: Any, graph_name: str, authors: list[dict] = []):
    graph_hash = sha256_hex(_jcs.canonicalize(_normalize_numbers(graph_data)))
    metadata = {
        "uuid": str(uuid.uuid4()),
        "version_label": graph_name,
        "base_uuid": None,
        "base_version_label": None,
        "author": authors[0]['username'] if authors and len(authors) > 0 else None,
        "authors": authors,
        "license": {
        "name": "CC-BY-SA-4.0",
        "url": "https://creativecommons.org/licenses/by-sa/4.0/"
        },
        "created": datetime.now().isoformat(),
        "last_updated": datetime.now().isoformat()
    }
    body = {
        "metadata": metadata,
        "graph": graph_data
    }
    file_hash = sha256_hex(_jcs.canonicalize(_normalize_numbers(body)))
    return {"metadata": metadata, "graph": graph_data, "graph_hash": graph_hash, "file_hash": file_hash}

def build_payload(graph_data: Any, graph_name: str) -> dict:
    graph_bytes = _jcs.canonicalize(_normalize_numbers(graph_data))
    hash = sha256_hex(graph_bytes)
    metadata = {
        "cid": hash,
        "version_label": graph_name,
        "license": {
            "name": "CC-BY-SA-4.0",
            "url": "https://creativecommons.org/licenses/by-sa/4.0/"
        },
        "copyright": "(C) 2026 The Brotherhood Project",
        "created": datetime.now().isoformat()
    }

    return {"metadata": metadata, "graph": graph_data}

def encode(path: str, graph_name: str = "Test", protocol: int = PROTOCOL_VERSION, compression_level: int = 3) -> bytes:
    """Supports protocol version 1.0 and 2.0."""
    with open(path, "r") as file:
        raw = json.load(file)

        payload = build_payload(raw, graph_name) if protocol == PROTOCOL_VERSION else build_payload_v1(raw, graph_name)
        payload_bytes = _jcs.canonicalize(_normalize_numbers(payload))

        compressor = zstd.ZstdCompressor(level=compression_level)
        compressed = compressor.compress(payload_bytes)

        header = MAGIC + struct.pack("<H", protocol) + bytes([COMPRESSION_ZSTD])
        output = header + compressed

        with open(f"{graph_name}.knw", "wb") as f:
            f.write(output)

        return output

def decode(path: str) -> dict:
    """Supports only protocol v2.0."""
    with open(path, "rb") as file:
        blob = file.read()

        if not isinstance(blob, (bytes, bytearray)):
            raise Exception("knw blob must be raw bytes")
        if len(blob) < HEADER_SIZE:
            raise Exception("knw blob too short to contain a v2.0 header")

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

        compressed = bytes(blob[HEADER_SIZE:])
        if not compressed:
            raise Exception("knw payload is empty")

        decompressor = zstd.ZstdDecompressor()
        payload_bytes = decompressor.decompress(compressed)

        payload = json.loads(payload_bytes.decode("utf-8"))

        metadata, graph = payload["metadata"], payload["graph"]

        # Recompute and verify hashes
        cid = metadata["cid"]
        computed_cid = sha256_hex(_jcs.canonicalize(_normalize_numbers(graph)))
        if computed_cid != cid:
            raise Exception(f"cid mismatch: declared={cid}, computed={computed_cid}")

        graph_name = metadata["version_label"]
        with open(f"{graph_name}.json", "w") as f:
            json.dump(graph, f, ensure_ascii=False, indent=2)
        
        return payload

if __name__ == "__main__":
    encode("test.json")
