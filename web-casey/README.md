# web-casey

The **Knowledge Collector & Capability Explorer** (Casey): the personal environment where learners navigate knowledge graphs, overlay curated study resources, track capability milestones, and conduct self-assessments.

A fully offline browser application. No server, no account, no tracking — open it, explore graphs, record progress, and export verifiable `.cpb` capability files.

Part of [The Brotherhood](../README.md). Casey is the personal participant in the ecosystem: where the Curator Lab creates graphs, Casey consumes, annotates, and navigates them locally.

---

## What it does

- **Explore Skill Graphs** — load `.knw` v2 knowledge graphs, inspect domain hierarchies, and trace prerequisite pathways.
- **Overlay Learning Resources** — import and mush multiple `.rvr` v1 resource overlays onto the graph with composite keys (`${rvr_cid}:${local_id}`), inspecting citations and study materials per skill.
- **Evaluate Capabilities** — import `.cpb` v1 capability profiles and dynamically color-code skills by proficiency metrics (boolean, 1–5 scale, float ranges, or categorical results).
- **Track Self-Assessment** — 3-tier capability tracking (`want_to`, `in_progress`, `mastered`) with notes and timestamps, visualised directly on both the Learning and Capability views.
- **Export Capability Profiles** — export self-assessment milestones as portable `.cpb` binary files, optionally stamping the user's DID.
- **Unified Importer** — single modal supporting local file picker and remote URL fetching for `.knw`, `.rvr`, and `.cpb` formats with graph CID mismatch safety guards.
- **Persist Locally** — workspaces and settings automatically sync to `localStorage`.

---

## Running

It is a static site, but ES modules require an HTTP origin — `file://` will not work.

```bash
cd web-casey
python -m http.server 8000
# open http://localhost:8000
```

There is no build step, no bundler, and no `npm install`.

---

## Architecture

Three layers, one direction of dependency:

```text
ui/          renders state, binds events
  ↓
ops/         mutates state
  ↓
globals/     the single source of truth
```

`caseyStateManager` holds the authoritative state and notifies subscribers on change. `ops/` modules execute pure business mutations. `ui/` controllers never mutate directly — they delegate to ops and let state notifications drive DOM updates.

All scripts (except the ES module entry point `app.js`) run as standard window globals loaded via `<script src="...">` for maximum simplicity and inspectability.

---

## Layout

```text
web-casey/
├── index.html              # Single page shell; loads scripts in dependency order
├── css/
│   ├── common.css          # Shared system tokens, resets, buttons, cards, modals
│   └── casey-styles.css    # Casey-specific layouts, legends, and toolbar styles
├── vendor/
│   ├── zstd.esm.js         # Vendored zstd WASM bindings
│   └── zstd.wasm
├── assets/
│   └── icon.png
└── scripts/
    ├── app.js              # Entry point (type="module") — codec loader, controller bootstrap
    ├── globals/
    │   ├── casey-state-manager.js  # Authoritative state + subscriptions + format configs
    │   ├── local-storage.js        # Persistence (key: web_casey_workspace)
    │   └── settings.js             # Theme toggle and User DID profile
    ├── ops/
    │   ├── graph-ops.js            # Graph loading and workspace resets
    │   ├── resource-ops.js         # Multi-RVR overlay merging with composite keys
    │   ├── capability-ops.js       # CPB record parsing, metric mapping, highlight groups
    │   └── assessment-ops.js       # 3-tier self-assessment CRUD and CPB preparation
    ├── components/
    │   ├── importer.js             # Universal file/URL import modal with format selection
    │   ├── dialog.js               # Alerts and confirmations
    │   ├── modal-controller.js     # Modal display and keyboard dismissal
    │   ├── graph-visualizer.js     # vis-network rendering and highlight groups
    │   └── graph-controller.js     # Canvas interaction and node events
    ├── ui/
    │   ├── nav-ui.js               # Tab switching and mobile dropdown synchronization
    │   ├── learning-ui.js          # Learning tab view, node details modal, assessment colors
    │   ├── capability-ui.js        # Capabilities tab, record selector, assessment modal
    │   └── export-ui.js            # Export tab, metadata preview, binary CPB downloads
    └── utils/
        ├── codec.js                # Unified KNW v2, RVR v1, CPB v1 codec + JCS + CID
        ├── expression-utils.js     # Prerequisite parsing and pathway extraction
        ├── graph-utils.js          # Graph traversals and topology helpers
        └── bibliography-utils.js   # Citation formatting and validation
```

---

## State shape

```text
graph:
  metadata:        { cid, version_label, license, copyright, created }
  nodes:           { [local_id]: Node }
  domains:         { [local_id]: Domain }
  hyperedges:      { [local_id]: Pathway[] }
  positions:       { [local_id]: { x, y } }

resources:
  rvrMetadatas:    RVRMetadata[]           # Array of imported RVR headers
  bibliographies:  { [composite_key]: Bib } # Keyed by `${rvr_cid}:${local_id}`
  attachments:     { [node_id]: Attachment[] } # Mushed attachments per node
  unresolved:      []

capabilities:
  records:         CapabilityRecord[]      # Imported arbitrary CPBs
  activeCapabilityId: string               # 'self-assessment' or record ID

selfAssessment:
  algorithm_data:  { name: 'self-assessment', version: '1.0.0', did: 'did:alg:61d4c5c8-c22f-4e16-b2b7-0becf09b8e21' }
  assessments:     { [node_id]: { status: 'want_to'|'in_progress'|'mastered', notes, last_updated } }

uiState:
  selectedNodeId:   number | null
  selectedDomainId: number | null
```

---

## Formats & Codec

[`scripts/utils/codec.js`](scripts/utils/codec.js) provides the unified offline codec across all three Constellation binary formats:

| Format | Magic | Version | Compression | Content |
| --- | --- | --- | --- | --- |
| `.knw` | `KNW` | `2` | `1` (zstd) | JCS Canonical JSON (graph nodes, domains, prerequisites) |
| `.rvr` | `RVR` | `1` | `1` (zstd) | JCS Canonical JSON (bibliographies, attachments, target graph CID) |
| `.cpb` | `CPB` | `1` | `1` (zstd) | JCS Canonical JSON (evaluated capabilities, scores, signatures) |

### Self-Assessment Profile
Casey implements the canonical self-assessment capability algorithm:
- **Algorithm DID**: `did:alg:61d4c5c8-c22f-4e16-b2b7-0becf09b8e21`
- **Name**: `self-assessment`, **Version**: `1.0.0`
- **Issuer DID**: `null` (self-asserted), **Signature**: `null`

When importing `.cpb` files, Casey checks whether the algorithm DID matches the self-assessment profile, prompting the user to either merge entries directly into their active working assessment or retain them as a separate historical record.
