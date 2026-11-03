# CPB — Capability Profile File Format

A `.cpb` file carries the **demonstrated capabilities and assessment records** of a user mapped against a specific knowledge graph.

A `.knw` graph defines what skills exist. A `.rvr` roverlay documents where the learning material lives. A `.cpb` capability profile records whether a learner or system has demonstrated mastery over those skills, according to a specified evaluation algorithm.

Part of [The Brotherhood](../README.md). Pairs with the [`.knw` format](../knw-format/README.md) and [`.rvr` format](../rvr-format/README.md).

---

## Why a separate format

Capabilities are personal, temporal, and evaluative.

A graph represents canonical knowledge structure. An assessment represents a subjective or empirical observation made by a particular issuer at a particular moment in time. Merging assessment results into `.knw` would pollute the immutable graph CID with transient user states.

Separating capability profiles allows:
- **Portability** — users carry their verified capability credentials across institutions and apps.
- **Plurality** — multiple evaluators, automated test runners, peer reviewers, or self-assessments can score the same graph independently.
- **Verifiability** — issuers sign capability records with their DID, allowing third parties to verify authenticity without central servers.

---

## Versions

| Version | Status | Notes |
| --- | --- | --- |
| `v1` | **Current** | Evaluator metadata, node-level capability results, optional evaluation references, bound to a graph by CID. |

Specification schema is located at [`v1/spec.json`](v1/spec.json).

---

## Container layout

Identical to [`.knw`](../knw-format/README.md) and [`.rvr`](../rvr-format/README.md) except for the magic bytes:

| Offset | Length | Content | Meaning |
| --- | --- | --- | --- |
| `0` | 3 | `CPB` | Magic number. ASCII, always these three bytes. |
| `3` | 2 | uint16 LE | Protocol version. `1` for v1. |
| `5` | 1 | uint8 | Compression algorithm. `1` = zstd. |
| `6` | … | zstd frame | Canonical JSON payload. |

Format detection reads the first three bytes at offset zero: `KNW`, `RVR`, or `CPB`.

---

## Canonicalisation and Signatures

The payload is canonicalised with **JCS (RFC 8785)** before compression.

When an issuer signs a `.cpb` profile:
1. The `signature` field in `metadata` is omitted or stripped.
2. The remaining payload structure is serialized using JCS canonical JSON.
3. The issuer signs the canonical bytes with their cryptographic DID key (e.g., Ed25519).
4. The resulting signature string is recorded in `metadata.signature`.

For self-assessments or uncertified local tracking, `issuer_did` and `signature` may be `null`.

---

## v1 payload structure

```json
{
  "metadata": {
    "user_did": "did:key:z6Mku...",
    "issuer_did": "did:key:z6Mkr...",
    "graph_data": {
      "cid": "bafkreib...",
      "version_label": "Software Engineering Graph"
    },
    "algorithm_data": {
      "did": "did:alg:61d4c5c8-c22f-4e16-b2b7-0becf09b8e21",
      "name": "self-assessment",
      "version": "1.0.0"
    },
    "created": "2026-11-02T10:00:00Z",
    "use_before": "2027-11-02T10:00:00Z",
    "signature": null
  },
  "capabilities": [
    {
      "node_id": 1,
      "result": {
        "primary": "mastered",
        "notes": "Completed exercises and projects"
      }
    },
    {
      "node_id": 2,
      "result": {
        "primary": "in_progress",
        "score": 0.65
      }
    }
  ],
  "evaluation_set": []
}
```

### Fields

#### `metadata`
- **`user_did`** *(string | null)* — The DID of the learner or agent whose capabilities are described. May be `null` if the user has not established a public identity.
- **`issuer_did`** *(string | null)* — The DID of the evaluator, testing service, or certifying authority. `null` for self-assessments.
- **`graph_data.cid`** *(string)* — CID of the target `.knw` graph. Ensures capability nodes map to the intended skill definitions.
- **`graph_data.version_label`** *(string, optional)* — Human-readable graph label for display.
- **`algorithm_data`** *(object)* — Identifies the evaluation methodology:
  - `did` *(string)*: Unique DID identifying the algorithm or assessment standard.
  - `name` *(string)*: Human-readable algorithm name (e.g. `"self-assessment"`).
  - `version` *(string)*: Semantic version string.
- **`created`** *(string)* — ISO-8601 creation timestamp.
- **`use_before`** *(string | null)* — Optional ISO-8601 validity deadline or recertification date.
- **`signature`** *(string | null)* — Cryptographic signature over JCS canonical payload without signature.

#### `capabilities`
An array of assessed nodes. Each item contains:
- **`node_id`** *(number)* — Integer local ID of the skill node within the target graph.
- **`result`** *(object)* — Evaluator metrics for this node:
  - **`primary`** *(string | number | boolean)*: The primary summary classification. Standard values include categorical status (`"want_to"`, `"in_progress"`, `"mastered"`, `"passed"`), boolean flags (`true`/`false`), or numerical ratings (`1`–`5`, `0.0`–`1.0`).
  - *Arbitrary fields*: Evaluators may attach domain-specific metadata (e.g. `"notes"`, `"test_runs"`, `"rubric_score"`).

#### `evaluation_set`
An optional array of references to the underlying evaluations, proofs, or test transcripts used to compute this capability profile.
*(Note: Evaluation object formats have not yet been formally specified in the ecosystem; this field is reserved for forward-compatibility when evaluation formats are finalized).*

---

## Canonical Self-Assessment Algorithm

The ecosystem reserves a standardized algorithm for personal progress tracking:
- **Algorithm DID**: `did:alg:61d4c5c8-c22f-4e16-b2b7-0becf09b8e21`
- **Name**: `self-assessment`
- **Version**: `1.0.0`
- **Allowed Primary Values**:
  - `want_to` — Goal / planned for future study
  - `in_progress` — Actively studying / practicing
  - `mastered` — Competency achieved / mastered
