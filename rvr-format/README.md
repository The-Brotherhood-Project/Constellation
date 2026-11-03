# RVR — Roverlay File Format

A `.rvr` file carries the *sources behind* a knowledge graph: bibliographies, and the attachments that tie a specific source to a specific part of a specific node.

A graph says what is true. A roverlay (short for *resource overlay*) and says where the evidence is.

Part of [The Brotherhood](../README.md). Pairs with the [`.knw` format](../knw-format/README.md).

---

## Why a separate format

Sources are kept out of `.knw` entirely, and that is deliberate.

Fixing a citation changes the roverlay but not the graph. Extracting the evidence for one claim changes the roverlay but not the graph. Only when the *knowledge itself* changes does the graph's CID change — so a graph's identity continues to mean "this is the same knowledge I cited last time", while its citations evolve independently underneath it.

It also means the two have different lifetimes and different owners. Knowledge is expensive to change and expensive to store. Citations are cheap to add and often numerous. One format for both would force a choice between a churning graph CID and an unbounded node payload.

---

## Versions

| Version | Status | Notes |
| --- | --- | --- |
| `v1` | **Current** | Bibliographies plus node attachments, bound to a parent graph by CID. |

The Curator Lab writes and reads v1. There is no legacy version.

---

## Container layout

Identical to [`.knw`](knw-format/README.md) except for the magic bytes.

| Offset | Length | Content | Meaning |
| --- | --- | --- | --- |
| `0` | 3 | `RVR` | Magic number. ASCII, always these three bytes. |
| `3` | 2 | uint16 LE | Protocol version. `1` for v1. |
| `5` | 1 | uint8 | Compression algorithm. `1` = zstd. |
| `6` | … | zstd frame | Canonical JSON payload. |

Same header size, same canonicalisation, same CID rule. Format detection reads three bytes at offset zero: `KNW` or `RVR`.

---

## Canonicalisation and identity

As with `.knw`, the payload is serialised with **JCS (RFC 8785)** and compressed with zstd.

The **CID** is `sha256` of the JCS-canonical **`resources`** block alone, stored as `metadata.cid`.

Hashing `resources` rather than the whole payload means the roverlay's identity does not move when its version label or copyright notice is edited — exactly the same reasoning that excludes `positions` from the `.knw` CID.

---

## v1 payload

```json
{
  "metadata": {
    "cid": "cid-string-hash-of-resources-content",
    "version_label": "Optional Roverlay Name",
    "graph_data": {
      "cid": "cid-of-knw-graph-this-rvr-attaches-to",
      "version_label": "Optional Graph Label"
    },
    "license": {
      "name": "CC-BY-SA-4.0",
      "url": "https://creativecommons.org/licenses/by-sa/4.0/"
    },
    "copyright": "copyright-notice",
    "created": "ISO-8601-timestamp"
  },
  "resources": {
    "bibliographies": [
      {
        "local_id": 1,
        "title": "Source Title",
        "bib_type": "PDF",
        "author": "Author Name",
        "year": 2024,
        "url": "https://example.com",
        "references": [2, 3]
      }
    ],
    "attachments": [
      {
        "node_id": 1,
        "bib_id": 1,
        "fragment_start": "Chapter 1",
        "fragment_end": "Page 10"
      }
    ]
  }
}
```

The full field reference is [`v1/spec.json`](v1/spec.json).

### `graph_cid` — the binding

`graph_cid` is the CID of the `.knw` this overlay describes. It is what lets a consumer pair the two without guessing.

It is a **reference, not a copy**. The roverlay does not embed the graph, and the graph does not embed the overlay. Each is independently content-addressed, independently versioned, and independently retrievable.

`graph_label` is a human-readable convenience only. Never resolve an overlay by label — labels are not unique and change.

### The two blocks

**`bibliographies`** — the sources themselves. `local_id` is scoped to the roverlay, exactly as in `.knw`. `references` lists node IDs that attaches this bibliography (check attachments below).

**`attachments`** — the evidence mapping. Each entry binds a `node_id` in the parent graph to a `bib_id` in this overlay, narrowed to a fragment:

| Field | Meaning |
| --- | --- |
| `node_id` | `local_id` of a node in the parent graph |
| `bib_id` | `local_id` of an entry in `resources.bibliographies` |
| `fragment_start` | Where in the source the claim begins — a chapter, a section |
| `fragment_end` | Where it ends |

Fragments are free text, not offsets. They exist because a citation without a locatable span cannot be checked.

An attachment's `node_id` refers to a node in a *different file*, so the ID is only meaningful together with `graph_cid`. Never treat it as globally unique.

---

## Implementations

| Implementation | Language | Role |
| --- | --- | --- |
| [`web-curator-lab/scripts/utils/knw-codec.js`](../web-curator-lab/scripts/utils/knw-codec.js) | JavaScript | `encodeRVRV1` / `decodeRVRV1`, sharing the codec with `.knw` |
| [`web-curator-lab/scripts/ops/rvr-ops.js`](../web-curator-lab/scripts/ops/rvr-ops.js) | JavaScript | Overlay state operations in the Lab |

Both formats are handled by the same module and the same `decodeFile` dispatcher, which switches on the magic bytes. There is no Python implementation of `.rvr` yet.

---

## Rules for a conforming implementation

1. **Validate the header before decompressing.** Wrong magic, unsupported version, unknown compression byte — reject specifically.
2. **Hash `resources` only.** Not the whole payload, not including `metadata`.
3. **Verify the CID on read.** A mismatch means the file is corrupt.
4. **Never resolve `graph_cid` by label.** Use `graph_label` for display only.
5. **Preserve unknown fields.** The `resources` blocks are open — new bibliography or attachment fields should pass through untouched.

---

## Design notes

- **Why is `fragment_start` / `fragment_end` free text?** A universal locator across PDFs, books, videos, and web pages does not exist. Forcing a numeric offset would mean supporting exactly one medium properly. Free text is imprecise but universal, and a reader that cannot parse it can still display it.
- **Why does `references` exist on a bibliography entry?** This is a backreference from bibliographies to nodes in the parent graph. For large files, this allows quick lookups.
- **Why is `.rvr` not just a field on `.knw`?** See [Why a separate format](#why-a-separate-format). The short version: it keeps a graph's identity tied to knowledge rather than to citations.
