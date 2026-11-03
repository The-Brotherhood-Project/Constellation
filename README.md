# The Brotherhood — Constellation

An ecosystem of independent services connected by shared protocols and a distributed event network.

Each directory in this repository is a **standalone component**. None of them import each other's code, and none of them share a database. They interact only through public HTTP contracts and file formats. If a component is replaced, forked, or rewritten, nothing else in the ecosystem needs to change.

- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** — the design philosophy, the component model, and the reasoning behind the boundaries.
- **[ROADMAP.md](docs/ROADMAP.md)** — what is built, what is next, and in what order.
- **[WEB-DESIGN.md](docs/WEB-DESIGN.md)** — web client design system, offline architecture, and UI conventions.

---

## What this repository contains

| Directory | Component | Responsibility | Status |
| --- | --- | --- | --- |
| [knw-format](knw-format/README.md) | KNW format | The `.knw` graph file format | Implemented (v1, v2) |
| [rvr-format](rvr-format/README.md) | RVR format | The `.rvr` resource-overlay file format | Implemented (v1) |
| [cpb-format](cpb-format/README.md) | CPB format | The `.cpb` capability profile file format | Implemented (v1) |
| [web-curator-lab](web-curator-lab/README.md) | Curator Lab | Create, edit, and visualise knowledge graphs | Implemented, fully offline |
| [web-casey](web-casey/README.md) | Casey | Knowledge collector, learning navigator, and capability explorer | Implemented, fully offline |
| [github-graph-repo](github-graph-repo/README.md) | Graph Repository | Custody, versioning, and persistence of graphs | Implemented on GitHub storage |
| [brotherhood-ucan](brotherhood-ucan/README.md) | Permission Service | Delegated authority via UCAN tokens | Implemented |
| [nostr-relay](nostr-relay/README.md) | Relay | Movement and discovery of events | Implemented, HTTP-only |
| [cli-lab](cli-lab/README.md) | CLI Lab | JSON ⇄ `.knw` conversion scripts | Partial, experimental |

**Not yet built:** Academia, Pub, Statistics services, Resource Repository, Capability Repository. See [ROADMAP.md](docs/ROADMAP.md).

---

## The five responsibilities

The ecosystem is organised around five separable jobs. A component may hold one or several; none is required to hold all of them.

| Responsibility | Question it answers | Today |
| --- | --- | --- |
| **Permission** | May this actor do this? | not yet built |
| **Custody** | Will this resource be preserved and served? | `github-graph-repo` |
| **Transport** | What events do you know about this identifier? | `nostr-relay` |
| **Collection** | What is useful to *me*, locally? | `web-casey` |
| **Aggregation** | What should a human look at first? | not yet built |

---

## The file formats

Three binary formats carry everything. All are `JCS`-canonical JSON (RFC 8785) compressed with zstd behind a 6-byte header.

```text
offset 0   3 bytes   magic       "KNW", "RVR", or "CPB"
offset 3   2 bytes   version     uint16 little-endian
offset 5   1 byte    compression 1 = zstd, 255 remaining slots
offset 6   …         payload     zstd-compressed canonical JSON
```

- **`.knw` (v2)** — a knowledge graph: nodes, domains, prerequisite expressions, plus `positions` for layout.
- **`.rvr` (v1)** — a resource overlay: bibliographies and node↔source attachments, bound to a graph by CID.
- **`.cpb` (v1)** — a capability profile: evaluated capabilities, competency scores, and self-assessments, bound to a graph by CID.

Identity is a **CID**: `sha256` of the canonicalised content block. For `.knw` v2 the CID covers only `graph` — `positions` are ornamental and deliberately excluded from the hash, so moving a node never changes a graph's identity.

Specs live in [knw-format](knw-format/README.md), [rvr-format](rvr-format/README.md), and [cpb-format](cpb-format/README.md).

---

## Running the stack

The Curator Lab and Casey are static sites; the two Python services are Docker Compose stacks.

### Curator Lab (static site)

```bash
cd web-curator-lab
python -m http.server 8000
# open http://localhost:8000
```

It is fully offline. Graphs are authored in the browser and exported as `.knw` / `.rvr` files.

### Casey (static site)

```bash
cd web-casey
python -m http.server 8000
# open http://localhost:8000
```

Fully offline knowledge collector and capability explorer. Explores graphs, overlays multiple `.rvr` sources, and tracks capability milestones with `.cpb` export.

### Graph Repository

```bash
cd github-graph-repo
cp .env.example .env      # set GITHUB_TOKEN and DATABASE_URL
docker compose up -d --build
```

Brings up PostgreSQL, the UCAN service, and the API on <http://localhost:8000/docs>.

### Relay

```bash
cd nostr-relay
cp .env.example .env
docker compose up -d --build
```

The relay publishes on host port `27000`; its UCAN service is on `27076`.

### UCAN service alone

```bash
cd brotherhood-ucan
npm install
npm start       # :3000, or PORT=7600 npm start
npm test
```

---

## Working on a component

**Keep components standalone.** A service directory owns its own `README`, its own dependencies, and its own deployment. Cross-directory imports are a bug, not a convenience.

**Protocols are the boundary.** Anything another service depends on must be expressed as an HTTP endpoint or a file format — never as a shared library, table, or environment variable.

**Protocol versioning is explicit.** File formats carry a version in the header. HTTP surfaces are versioned by path. A component that cannot parse an older file or an unknown field should say so explicitly rather than guess.

**Follow the existing layering.** The Python services use `API → Services → CRUD → Models`. Routers validate and delegate, `services.py` holds orchestration, `crud.py` is the only layer that touches SQLAlchemy. The Curator Lab uses `State → Ops → UI`: `stateManager` is the single source of truth, `ops/` mutates it, `ui/` renders and binds events.

**Write the README as you build.** Each component documents its own layout, environment, API, and known limitations. The root README describes the ecosystem; it does not duplicate component detail.