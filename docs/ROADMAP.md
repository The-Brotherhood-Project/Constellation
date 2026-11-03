# Roadmap

Development is sequential. Each phase establishes one link in the chain and is only useful once the previous one works.

The ordering follows one rule: **custody and creation before distribution, distribution before interpretation.** A graph nobody can create or persist is worthless; a persisted graph nobody can find is merely lost; a findable graph nobody can judge is noise.

---

## Phase 0 — Foundations ✅ *built*

The substrate everything else sits on. Without these, no other component can be written.

| Component | What it established |
| --- | --- |
| `knw-format` | The `.knw` graph format, v1 and v2. Content-addressed identity via JCS + SHA-256, positions deliberately excluded from the hash. |
| `rvr-format` | The `.rvr` resource-overlay format, bound to a graph by CID. |
| `web-curator-lab` | A complete offline graph editor — authoring, visualisation, prerequisite expressions, source attribution, `.knw`/`.rvr` import and export. |
| `cli-lab` | An independent Python reference codec for `.knw`, used to cross-check the browser implementation. |
| `github-graph-repo` | Custody. One Git repo per graph, a commit per snapshot, Postgres for the pointer index, UCAN-gated writes. |
| `brotherhood-ucan` | Delegated authority. Ed25519 / `did:jwk`, UCAN 1.0.0, recursive proof chains, revocation. |
| `nostr-relay` | Transport. Signed events, replaceable vs append-only kinds, generic tag querying. |

Three independent codec implementations now agree byte-for-byte on the same formats, which is the strongest guarantee the formats are specified rather than merely described.

---

## Phase 1 — The working loop

**Goal: create a graph in the Curator Lab, publish it to a repository with custody and persistence, and consume it back in a collector.**

This is the minimum end-to-end path that makes the architecture worth anything. Relays and aggregators are not required for it — and that is the point: the ecosystem must be useful before any of its distributed machinery exists.

### 1.1 Close the publish path

The Curator Lab currently exports to the local filesystem. It needs to publish.

- Bind a repository endpoint and a service DID in Lab settings
- Request a UCAN capability token from the repository, hold it locally
- POST a `.knw` as a new graph; POST subsequent versions as snapshots against a base CID
- Surface the returned `graph_uuid` and CID in the Save Version tab
- Handle the `401` / `404` / `409` responses without losing the local draft

The repository side already accepts this contract. Nothing has to change there.

### 1.2 Build the Knowledge Collector *(implemented in `web-casey`)*

The personal participant. Not a thin client — it constructs a user-specific view. Fully offline browser client implemented in `web-casey` for skill graph exploration, multi-RVR resource overlay, and capability tracking.

- Fetch by CID or by graph UUID from a repository endpoint
- Local index and cache of known graphs; progress tracking
- Graph navigation and prerequisite-path traversal on cached graphs
- Load a published `.knw` straight into the Lab's editor for revision
- Optional: publish a resource-availability event to a relay when something is cached

The Collector is the first place the Relay becomes *useful* rather than *required* — it consults the relay for locations, but always works without one.

### 1.3 Make the formats first-class

- Publish a formal, versioned spec document for `.knw` v2 and `.rvr` v1 — field semantics, required vs optional, CID coverage rules, forward-compatibility policy
- Round-trip conformance tests across all three codec implementations
- Decide the reading path for `.knw` v1: migrate on import, or keep reading it

**Phase 1 is done when a graph can be authored, published, fetched by someone else, revised, and republished — with no central server in the loop.**

---

## Phase 2 — Distributed discovery

**Goal: relays automate discovery so nobody needs to be told a CID exists.**

Phase 1 works, but knowledge is still found by being handed a link. Phase 2 makes it findable.

### 2.1 Wire the event layer end to end

Both halves exist and have never run together. They need to.

- Publish from the repository, consume from the Collector, on a real relay
- Relay discovery: a node announces itself and is discoverable by `did` and `url`
- Subscription instead of polling — the Collector learns a new version exists without asking
- Multi-relay broadcast with per-relay failure tolerance

### 2.2 Relay-to-relay

Relays are currently isolated. One relay knows what it knows.

- Peer discovery via manifest events
- Event gossip / reconciliation between relays
- Availability and replication state so a Collector knows where to fetch

### 2.3 Repository protocol hardening

- Version the repository HTTP surface (`/api/v1`) consistently across implementations
- Publish `/metadata` for every service so clients can detect protocol drift
- Persistent revocation in the UCAN service — the in-memory set does not survive a restart
- Graph reads by identity: fetch a graph's current head, its version list, and its lineage

---

## Phase 3 — Interpretation

**Goal: transform an overwhelming stream of found graphs into something a human can act on.**

Discovery alone produces noise. This phase is where the social layer earns its place.

### 3.1 Academia

Educational aggregation: prerequisite graph traversal across graphs, path ranking, recommended starting points per goal, trust signals.

The hard problem is *filtering noise* — ranking must favour graphs that are actually used and maintained, not merely present.

### 3.2 Pub

Broad public visibility: curation projects, contributors, releases, discussions. Separates ecosystem activity from the network plumbing.

### 3.3 Statistics

Longitudinal observation — replication patterns, active domains, availability, commonly traversed learning paths. Advisory input to Collectors and Academia; never a dependency of the relay.

---

## Phase 4 — Collaboration

**Goal: let people work on the same graph without a single party holding the keys.**

### 4.1 Permission delegator

- Graph-level delegation scopes beyond the current single `storage://<did>/<graph_uuid>` capability
- Delegated, time-limited, revocable collaborator tokens
- A permission UI in the Lab so a graph owner can issue access without touching a terminal
- Revocation that propagates: the repository must not keep accepting a revoked token

### 4.2 Merge authority

The repository already forks snapshots onto `forked-from-<cid>` branches when a base has children. What it does not yet do is *reconcile* them.

- Conflict detection between sibling branches
- A merge or proposal workflow, itself authorised by UCAN
- Merge events published to the relay as project updates

### 4.3 Capability Repository

Store evidence of demonstrated capability — assessments, endorsements, certificates — as first-class resources, so other services consume capability records instead of embedding capability logic.

### 4.4 Resource Repository

Documents, media, and content-addressed objects, with independent mirroring and caching. `.rvr` overlays point at these; today they point at bare URLs.

---

## Design constraints that apply at every phase

These are not tasks. They are the rules that keep the later phases possible.

- **No component may require another to function.** If a Relay dies, custody and direct fetch still work. If an Aggregator dies, discovery still works.
- **New components ship a protocol before an implementation.** If a component cannot be replaced, its contract was not a protocol.
- **Authorisation travels with the request.** Proofs are verifiable offline; no per-operation callback to a central authority.
- **Every new format is versioned in its header.** The version field exists so this decision was made once.
- **Implementations stay disposable.** The graph outlives the editor; the event outlives the relay; the token outlives the issuer.

---

## Deliberately not on this roadmap

- **A central directory of everything.** Discovery is the relay's job and the aggregator's job. A hard-coded index is a dependency the architecture exists to avoid.
- **A single mega-service.** The moment Permission, Custody, and Transport live in one process, they can no longer be replaced separately.
- **Mandatory accounts.** Identity is a `did:jwk` keypair. There is no user record to migrate, subpoena, or lose.
- **Real-time requirements.** The transport is event-based and eventually consistent. Consistency where it matters — custody and authorisation — is handled separately and synchronously.