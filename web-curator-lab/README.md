# web-curator-lab

The **Curator Lab**: the environment where knowledge graphs are created, edited, and visualised.

A fully offline browser application. No server, no account, no network — open it, build a graph, export a `.knw` file.

Part of [The Brotherhood](../README.md). The Curator Lab deliberately knows nothing about any particular repository implementation. It understands graph formats and repository interfaces, and nothing more.

---

## What it does

- **Author** nodes and domains, nest domains hierarchically, edit descriptions
- **Express prerequisites** as boolean expressions (`(1 AND 2) OR 3`) with live validation and cycle detection
- **Visualise** the graph interactively, with layout control and direct prerequisite editing on the canvas
- **Attribute sources** — build bibliographies and attach them to specific nodes and fragments, tracked per node with source counts
- **AI assist** — suggest nodes from a natural-language query, via OpenRouter
- **Import / export** `.knw` v2 and `.rvr` v1 entirely in the browser
- **Persist locally** — the whole workspace autosaves to `localStorage`

---

## Running

It is a static site, but ES modules require an HTTP origin — `file://` will not work.

```bash
cd web-curator-lab
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

`labStateManager` holds the authoritative state and notifies subscribers on change. `ops/` modules are the only things that mutate it. `ui/` controllers never mutate directly — they call an op and let the notification re-render them.

Nothing in `ui/` stores domain state. Controllers hold references to elements and ephemeral interaction flags only, so a re-render can always rebuild from state alone.

---

## Layout

```text
web-curator-lab/
├── index.html              # Single page; loads scripts in dependency order
├── css/
│   ├── common.css          # Variables, resets, shared primitives
│   └── lab-styles.css      # Lab-specific layout
├── vendor/
│   ├── zstd.esm.js         # Vendored zstd WASM bindings
│   └── zstd.wasm
├── assets/icon.png
└── scripts/
    ├── app.js              # Entry point — wires controllers, restores state
    ├── globals/
    │   ├── lab-state-manager.js   # Authoritative state + subscriptions
    │   ├── local-storage.js       # Persistence (key: web_curator_lab)
    │   └── settings.js            # API key, theme, model preference
    ├── ops/
    │   ├── graph-ops.js           # Node and domain mutations
    │   └── rvr-ops.js             # Bibliography and attachment mutations
    ├── components/
    │   ├── importer.js            # Universal file/URL import modal
    │   ├── graph-visualizer.js    # vis-network rendering
    │   ├── graph-controller.js    # Canvas interaction, context menus
    │   ├── modal-controller.js    # Modal open/close and focus
    │   ├── dialog.js              # Alerts and confirms
    │   └── ai-assist.js           # OpenRouter integration
    ├── ui/
    │   ├── draft-ui.js            # Node Draft tab
    │   ├── graph-ui.js            # Graph Visualizer tab
    │   ├── attribution-ui.js      # Source Attribution tab
    │   └── export-ui.js           # Save Version tab, import/export
    └── utils/
        ├── codec.js               # .knw / .rvr encode + decode, JCS, CID
        ├── expression-utils.js    # Prerequisite parsing, AST, hypergraph
        ├── graph-utils.js         # Graph derivation and queries
        ├── bibliography-utils.js  # Source formatting and validation
        └── prompts.js             # AI assist prompt construction
```

---

## State shape

```text
metadata      { cid, version_label, license, copyright, created }
nodes         { [local_id]: Node }
domains       { [local_id]: Domain }
positions     { [local_id]: { x, y } }      # ornamental, excluded from CID
bufferPositions { [local_id]: { x, y } }    # transient until fixed
hyperedges    { [local_id]: Pathway[] }     # grouped prerequisite paths
rvrMetadata   { cid, version_label, license, copyright, created }
resources     { bibliographies, attachments }
activeTray    Bibliography[]                 # up to 6
selectedNodes / selectedDomains / collapsedDomains
```

The graph and its roverlay hold **separate metadata blocks**. That is what keeps a `.knw` CID tied to knowledge rather than to citations — see the [RVR format docs](../rvr-format/README.md#why-a-separate-format).

Nodes and domains are dictionaries keyed by `local_id`, not arrays. Lookup is O(1), and renumbering is a mutation of a few keys rather than a full-array operation.

---

## Format codec

[`scripts/utils/codec.js`](scripts/utils/codec.js) handles both formats:

| Export | Purpose |
| --- | --- |
| `encodeKNWV2(metadata, graph, positions)` | Build a `.knw` blob |
| `decodeKNWV2(blob)` | Parse and verify a `.knw` |
| `encodeRVRV1(metadata, resources)` | Build a `.rvr` blob |
| `decodeRVRV1(blob)` | Parse and verify a `.rvr` |
| `decodeFile(blob)` | Dispatch on magic bytes — `KNW` or `RVR` |
| `computeCID(block)` | `sha256` of JCS-canonical JSON |
| `canonicalJSON(value)` | RFC 8785 serialiser, hand-implemented |

Two things worth noting:

**JCS is implemented by hand.** The `jcs` Python package has no browser equivalent, so the RFC 8785 rules — key sorting, number normalisation, cycle detection — are implemented directly against `crypto.subtle`.

**Compression is vendored.** `zstd.wasm` is loaded locally. A CDN would have made the Lab work *online*, which contradicts the point of it.

### CID verification on import

`decodeKNWV2` and `decodeRVRV1` recompute the CID and reject any file whose declared value disagrees. This is the Lab's main defence against a corrupted or tampered file — and it is why exporting then re-importing is a valid round-trip check.

---

## Prerequisites

Prerequisites are stored as boolean expression strings over `local_id`s. `expression-utils.js` handles them:

| Module | Responsibility |
| --- | --- |
| `PrerequisiteUtils` | Parse and validate expression strings |
| `ASTUtils` | Build and simplify the expression AST |
| `ExpressionUtils` | Evaluate, resolve, and re-serialise |
| `HypergraphUtils` | Group nodes into pathways |

`graph-ops.js` keeps two derived structures in sync whenever a prerequisite changes:

- **`mentions`** — the set of node IDs appearing anywhere in the expression
- **referenced nodes** — updated via `propagatePrerequisiteChange`, a transitive walk so downstream expressions stay consistent

This is why an edit to one node's prerequisite cannot silently leave a dangling reference elsewhere in the graph.

---

## AI assist

`ai-assist.js` queries **OpenRouter** for node suggestions from a natural-language prompt.

- The API key is entered in Settings and stored in `localStorage` **only if** "save API key" is checked. Otherwise it lives for the session.
- Models are fetched live from OpenRouter; a curated fallback list is used when the fetch fails.
- A `favoriteModel` setting pins one model to the top of the list.
- Prompts are built in `utils/prompts.js` and include the graph name and surrounding nodes as context.

This is the **only** network-dependent feature. Everything else works with the machine offline.

---

## Settings

| Setting | Effect |
| --- | --- |
| OpenRouter API key | Enables AI assist. Opt-in persistence. |
| Dark mode | Toggles `data-theme` on `<html>`; defaults to the OS preference |
| Favorite model | Pinned to the top of the model list |
| Delete unused bibliographies | Omits entries with no references when computing CIDs and exporting |

The last one matters: it changes the roverlay CID, so the setting persists it and recomputes automatically when changed.

---

## Dependencies

| Dependency | Source | Why |
| --- | --- | --- |
| `vis-network` | unpkg CDN | Graph rendering |
| `zstd-wasm` | **vendored locally** | Offline compression |

---

## Export

`export-ui.js` builds a clean block from state — dropping UI-only fields such as selection, collapsed domains, and buffer positions — computes the CID, stamps the version label, and downloads the file.

`Save Snapshot` writes the labelled state to `localStorage` only. Exporting to disk is a separate, explicit action. Nothing leaves the machine unless you choose to upload it yourself.

---

## Known limitations

- **`vis-network` is loaded from a CDN**, so the graph visualiser — unlike everything else — needs a network connection on first load.
- **No publishing.** The Lab exports to the local filesystem. Automated writing to a chosen repository could be a helpful extension.
- **`local_id` is renumbered freely.** Importing a graph can renumber nodes; nothing durable may reference a node ID. But this is expected as it is local ID strictly and is scoped only to the current graph.
- **No structural diff.** Version comparison across snapshots is not implemented.
- **AI assist depends on OpenRouter.** The fallback model list covers discovery failures, not an unavailable API.