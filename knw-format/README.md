# KNW — Knowledge File Format

The `.knw` format carries a knowledge graph: nodes, the domains they belong to, and the prerequisite relationships between them.

A `.knw` file is **JSON, canonicalised and compressed into a binary container**. The JSON is always inspectable — the container exists only to make graphs small, content-addressable, and cheap to hash.

Part of [The Brotherhood](../README.md). See [ARCHITECTURE.md](../docs/ARCHITECTURE.md) for how the format is used in the project across different components.

---

## Versions

| Version | Status | Notes |
| --- | --- | --- |
| `v1` | Legacy | Positions inline on nodes; separate `graphHash` and `fileHash`; `redirects` for ID remapping. |
| `v2` | **Current** | Positions extracted to a top-level block and excluded from the CID; a single content-addressed `cid` replaces the hash pair. |

v2 is what the Curator Lab writes and what the Graph Repository accepts. v1 is retained for its spec record and as a migration source.

---

## Container layout

Every `.knw` file has the same 6-byte header.

| Offset | Length | Content | Meaning |
| --- | --- | --- | --- |
| `0` | 3 | `KNW` | Magic number. ASCII, always these three bytes. |
| `3` | 2 | uint16 LE | Protocol version. `1` for v1, `2` for v2. |
| `5` | 1 | uint8 | Compression algorithm. `1` = zstd. |
| `6` | … | zstd frame | Canonical JSON payload. |

The algorithm byte reserves 255 values. Adding a codec does not change the header size, so old readers can detect — and refuse — what they cannot parse rather than misread it.

---

## Canonicalisation and identity

The payload is serialised with **JCS (RFC 8785)** before compression. JCS sorts object keys, normalises number formatting, and emits no insignificant whitespace, so the same logical graph produces byte-identical output in any conforming implementation.

> This is why the Python implementations normalise whole-valued floats before hashing. JavaScript has one number type and prints `1.0` as `1`; Python distinguishes `float` from `int`. Without normalisation the same graph would hash differently on each side.

The **CID** is `sha256` of the JCS-canonical content block, rendered as lowercase hex.

| Version | Hashed block |
| --- | --- |
| v1 | `graph` → `graphHash`; `{metadata, graph}` → `fileHash` |
| v2 | `graph` only → `metadata.cid` |

---

## v2 payload

```json
{
  "metadata": {
    "cid": "cid-string-hash-of-graph-content",
    "version_label": "Optional Graph Name",
    "license": {
      "name": "CC-BY-SA-4.0",
      "url": "https://creativecommons.org/licenses/by-sa/4.0/"
    },
    "copyright": "copyright-notice",
    "created": "ISO-8601-timestamp"
  },
  "graph": {
    "nodes": [
      {
        "local_id": 1,
        "title": "Node Title",
        "description": "Node description",
        "prerequisite": "(1 AND 2) OR 3",
        "mentions": [5, 6],
        "domain_id": 1,
        "assessable": true
      }
    ],
    "domains": [
      {
        "local_id": 1,
        "title": "Domain Name",
        "description": "Domain description",
        "parent_id": null
      }
    ]
  },
  "positions": {
    "1": { "x": 100.5, "y": 200.3 }
  }
}
```

The full field reference is [`v2/spec.json`](v2/spec.json).

### Positions are ornamental

`positions` sits **outside** the hashed block and is excluded from the CID.

Layout is a viewing preference, not knowledge. If positions were hashed, dragging a node would mint a new graph identity — a new CID, a new snapshot, a new version in the repository — for a change nobody would call a revision. Excluding them means rearranging a graph is free, and only genuine knowledge changes create a new identity.

The `positions` keys are stringified `local_id` values.

### `local_id` and references

`local_id` is an integer scoped to the file. It is **not stable across versions** — v2 renumbers freely and records no redirect table. Anything durable must reference a graph by CID, never by node ID.

References appear in three places:

| Field | References | Shape |
| --- | --- | --- |
| `graph.nodes[].domain_id` | A domain | Integer or `null` |
| `graph.nodes[].mentions` | Other nodes | Array of integers |
| `graph.nodes[].prerequisite` | Other nodes | Expression string |

`graph.domains[].parent_id` references another domain, forming the domain hierarchy.

### `prerequisite`

A boolean expression over node `local_id`s, e.g. `(1 AND 2) OR 3`. It is a **string**, not a nested structure — it is the part of the graph a human reads and edits directly.

---

## v1 payload

Differences from v2 that matter when reading old files:

- `x` and `y` live **inline on each node** and are inside the hashed `graph` block.
- Two hashes are present: `graphHash` over `graph`, `fileHash` over `{metadata, graph}`.
- Metadata carries `uuid`, `base_uuid`, `base_version_label`, `author`, and an `authors` array.
- `mentions` is an object (`{"5": true}`) rather than an array.
- `source_items` arrays live on nodes; in v2 this role belongs to the separate [`.rvr`](../rvr-format/README.md) overlay.
- `graph.redirects` maps `old_local_id` → `new_local_id`.

The full field reference is [`v1/spec.json`](v1/spec.json).

---

## Implementations

Three independent codecs implement this format. They are not ports of one another — each was written against the spec, which is what makes their agreement meaningful.

| Implementation | Language | Role |
| --- | --- | --- |
| [`web-curator-lab/scripts/utils/knw-codec.js`](../web-curator-lab/scripts/utils/knw-codec.js) | TypeScript | Reads and writes `.knw` v2 in the browser, using vendored `zstd-wasm` |
| [`github-graph-repo/app/utils.py`](../github-graph-repo/app/utils.py) | Python | Parses and validates `.knw` v2 on upload |
| [`cli-lab/main.py`](../cli-lab/main.py) | Python | Reference encode/decode for both versions |

The Curator Lab codec implements JCS by hand; the Python implementations use the `jcs` package.

---

## Rules for a conforming implementation

1. **Validate the header first.** Wrong magic, unsupported version, unknown compression byte — reject with a specific error. Never fall through to a decode attempt.
2. **Canonicalise before hashing.** Use JCS, not `json.dumps`. Python must normalise whole-valued floats first.
3. **Hash only what the version says.** v2 hashes `graph` alone. Including `positions` breaks identity.
4. **Verify the CID on read.** If `metadata.cid` disagrees with the recomputed hash, the file is corrupt. The Curator Lab and the Graph Repository both do this; it is the main defence against a tampered upload.
5. **Preserve unknown fields.** A reader that meets a field it does not recognise should keep it and pass it through, not drop it. Formats outlive implementations.

---

## Design notes

- **Why a binary container for JSON?** Graphs are large and highly repetitive. zstd on canonical JSON compresses well, and the fixed header means format detection is three bytes at offset zero — no sniffing, no extension trust. The Graph Repository stores both the `.knw` bytes and the JSON so either is directly retrievable.
- **Why JCS instead of ordinary JSON?** A content address is only meaningful if every implementation computes it the same way. Ordinary JSON leaves key order and number formatting to the writer; JCS removes that freedom entirely.
- **Why is the version a uint16 and the algorithm a uint8?** Both fields are effectively never exhausted. The space is cheap, and reserving it now avoids a breaking format change later.