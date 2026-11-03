# cli-lab

A Python reference codec for the [`.knw`](../knw-format/README.md) format, and the seed of a minimal command-line graph editor.

This is a **working script, not a finished tool**. Its real value today is being an independent implementation of the format: when three separate codecs agree on the same bytes, the format is genuinely specified rather than merely described. See [KNW → Implementations](../knw-format/README.md#implementations).

---

## Status

| Function | State |
| --- | --- |
| `decode()` — `.knw` → JSON + CID verification | Working, v2 |
| `encode()` — JSON → `.knw` | Implemented, both versions, but not wired to `__main__` |
| CLI argument parsing | Not started |
| Graph CRUD from the terminal | Not started |

Running the script today encodes `test.json`:

```bash
cd cli-lab
pip install -r requirements.txt
python main.py
```

This writes the encoded graph to `Test.knw`.

---

## Layout

```text
cli-lab/
├── main.py           # encode / decode, hashing, payload construction
├── requirements.txt  # zstandard, jcs
├── test.json         # Minimal input graph for encode
└── Test.knw          # Sample binary for decode
```

---

## Requirements

```bash
pip install -r requirements.txt   # zstandard, jcs
```

| Package | Purpose |
| --- | --- |
| `zstandard` | zstd compression |
| `jcs` | RFC 8785 JSON canonicalisation |

---

## Functions

### `decode(path) → dict`

Reads a `.knw` file and returns `{ metadata, graph }`.

1. Validates the 6-byte header — magic `KNW`, version `2`, algorithm `1` (zstd). Each failure raises with a specific message.
2. Decompresses the payload and parses the JSON.
3. **Recomputes the CID** over the canonicalised `graph` block and raises on mismatch.
4. Writes `<version_label>.json` to the working directory and returns the payload.

Raises on: bad magic, unsupported version, unsupported compression, empty payload, or a CID mismatch.

### `encode(path, graph_name, protocol=2, compression_level=3) → bytes`

Reads a `.knw`-shaped JSON file and writes `<graph_name>.knw`.

Supports both payload builders:

- **`protocol=2`** — `build_payload()` produces `metadata.cid` hashed over `graph` only. This is the current format.
- **anything else** — `build_payload_v1()` produces the legacy `{metadata, graph, graph_hash, file_hash}` shape, with UUID-based versioning.

Compression level is passed through to `zstd.ZstdCompressor`.

Note that `encode()` is a library function only. There is no CLI entry point for it yet.

---

## Number normalisation

Both functions run `_normalize_numbers()` before canonicalising:

```python
if isinstance(obj, float):
    return int(obj) if obj.is_integer() and ... else obj
```

This exists because JavaScript has one number type and serialises `1.0` as `1`, while Python distinguishes `float` from `int`. Without collapsing whole-valued floats, the same graph hashes differently in the browser than here — and every upload to the Graph Repository would fail CID verification.

The same function is duplicated in [`github-graph-repo/app/utils.py`](../github-graph-repo/app/utils.py). Both exist so neither implementation depends on the other.

---

## Using it as a cross-check

The most valuable thing in this directory right now is the ability to verify the browser codec against a second implementation:

```bash
# 1. Export a graph from the Curator Lab
# 2. Decode it here — a CID mismatch means the browser codec has drifted
python main.py

# 3. Or encode test.json and compare bytes with a Lab-produced file
python -c "import main; main.encode('test.json', 'probe')"
```

Byte-identical output across implementations means the format spec is complete enough to reimplement. Any divergence is a gap in the spec, found before it becomes a compatibility problem.

---

## Direction

The intended end state is a minimal terminal editor — basic CRUD over graphs without a browser, useful for scripting, bulk edits, and headless environments.

The codec is already in place. What is missing is argument parsing, and graph operations built on `decode()`'s payload. Both are straightforward; the format is the hard part, and it is done.

---

## Known limitations

- **No CLI interface.** `__main__` calls `encode("test.json")` with a hardcoded path. Nothing accepts arguments.
- **`encode()` cannot round-trip v1.** `build_payload_v1()` constructs a v1 payload but `decode()` only accepts v2.
- **No `.rvr` support.** Roverlay handling exists only in the Curator Lab.
- **Metadata is generated, not read.** `encode()` stamps `version_label`, `license`, `copyright`, and `created` itself; it cannot preserve authorship from an input file.
- **Decoding writes a file to the working directory** as a side effect. It returns the payload too, but the write is unconditional.
- **No batch or directory operations.** One file in, one file out.