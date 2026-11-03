# github-graph-repo

The **Graph Repository** of [The Brotherhood](../README.md): custody, versioning, and persistence of knowledge graphs.

One concrete implementation of the repository protocol. It delegates blob storage to **GitHub** — one repository per graph, one commit per snapshot — so a graph and its entire version history are ordinary Git history.

Part of [ARCHITECTURE.md](../ARCHITECTURE.md). This service is replaceable: anything satisfying the same HTTP contract is a drop-in substitute.

---

## What it does

1. Accepts a `.knw` payload and verifies magic, version, compression, and CID.
2. Creates a GitHub repository named `<graph_name>-<uuid>`.
3. Commits both the decoded JSON and the base64-encoded `.knw` bytes.
4. Records metadata in Postgres: graph UUID, storage URL, current snapshot pointer.
5. Mints a **UCAN token** granting the requester rights over that graph's storage space.
6. Publishes availability and project-update events to the relay network.

On a later snapshot: verifies the presented token first, then commits — forking onto a `forked-from-<cid>` branch if the base snapshot already has children, so concurrent edits coexist instead of overwriting each other.

The service is **almost stateless about graph content**. It stores only enough metadata to find the right commit. All knowledge lives in Git.

---

## Layout

```text
github-graph-repo/
├── app/
│   ├── main.py            # FastAPI entrypoint, CORS, lifespan, /health
│   ├── api/v1/api.py      # HTTP routes — routers only
│   ├── services.py        # Orchestration: GitHub, UCAN, validation, events
│   ├── crud.py            # The only file that touches SQLAlchemy
│   ├── models.py          # Graph, Snapshot
│   ├── schemas.py         # Pydantic request schemas
│   ├── nostr_service.py   # Event signing and relay broadcast
│   ├── utils.py           # .knw parser, hashing, UCAN HTTP client
│   └── start-services.sh  # Migrations + keygen + uvicorn
├── migrations/
├── alembic.ini
├── docker-compose.yml
└── Dockerfile
```

Strict `API → Services → CRUD` layering. Routers never call the database; `crud.py` never calls GitHub or the UCAN service.

---

## Data model

Two tables. The storage URL is the GitHub HTML URL of the per-graph repository; every snapshot row points at a specific commit.

### `graph`

| Column | Type | Notes |
| --- | --- | --- |
| `uuid` | UUID | PK. `gen_random_uuid()` default. |
| `graph_name` | String | Human-readable; appears in the repository name. |
| `storage_url` | String | GitHub HTML URL. |
| `latest_version` | String | CID of the current head snapshot. |
| `created_at` / `updated_at` | DateTime | Defaults to `now()`; `updated_at` auto-updates. |

### `snapshot`

| Column | Type | Notes |
| --- | --- | --- |
| `cid` | String | **PK**, with `graph_uuid`. The `.knw` graph hash — content-addressed. |
| `graph_uuid` | UUID | **PK**, FK to `graph.uuid`. |
| `version_label` | String | Label carried inside the snapshot, for bookkeeping. |
| `base_cid` / `base_graph_uuid` | String / UUID | Composite FK to the parent snapshot. Nullable for a root commit. |
| `commit_sha` | String | The GitHub commit holding this snapshot. |
| `branch` | String | `main`, or `forked-from-<cid>`. |
| `has_children` | Boolean | Set once a snapshot has been forked from. |
| `created_at` | DateTime | Default `now()`. |

Relationships use explicit `back_populates` in both directions rather than legacy `backref`, which avoids attribute collisions between the two foreign keys.

---

## The `.knw` input

Consumes [`.knw` v2](../knw-format/README.md).

| Offset | Length | Content |
| --- | --- | --- |
| 0 | 3 | `KNW` |
| 3 | 2 | version, uint16 LE (`2`) |
| 5 | 1 | compression (`1` = zstd) |
| 6 | … | zstd-compressed canonical JSON |

`utils.verify_knw` validates the header, decompresses, parses, and **recomputes the CID** over the canonicalised `graph` block. A mismatch is rejected before anything is written.

> The Python side normalises whole-valued floats before canonicalising. JavaScript has one number type and prints `1.0` as `1`; Python distinguishes `float` from `int`. Without this the same graph would produce a different CID in the browser than on the server, and every upload would fail verification.

---

## API

Routes are mounted under `/api` with a `/v1` prefix. `/health` sits at the root.

### `GET /health`

```json
{ "status": "healthy", "service": "brotherhood-github-graph-repo" }
```

### `GET /api/v1/metadata`

Public description of this implementation — name, description, `did`, licence, `latest_api_version`, `public_repo_url`. Clients use it to detect protocol drift and confirm which repository they are talking to.

### `POST /api/v1/add/graph`

Creates a new graph.

| Field | In | Type | Description |
| --- | --- | --- | --- |
| `file` | multipart | `.knw` blob | The first version of the graph. |
| `graph_name` | form | string | Human-readable name. Used in the repository name. |
| `requestor_did` | form | string | DID the UCAN token will be issued to. |

**Returns** — `{ graph_uuid, token, cid, commit_sha }`.

> The `token` is returned exactly once. It is not stored and there is no recovery path. A client that loses it cannot push further snapshots without re-authorisation.

**Errors** — `500` if `GITHUB_TOKEN` is unset, the commit fails, or the UCAN service is unreachable.

### `POST /api/v1/add/snapshot/{graph_uuid}`

Adds a version to an existing graph.

| Field | In | Type | Description |
| --- | --- | --- | --- |
| `file` | multipart | `.knw` blob | The new graph data. |
| `graph_uuid` | form | UUID | The graph being modified. |
| `base_cid` | form | string | The snapshot this builds on. **Required** — forking is explicit, never implicit. |
| `token` | form | string | UCAN token granting `edit/*` on this graph's storage space. |

**Returns** — `{ cid, commit_sha }`.

**Behaviour**

- The token is verified before any GitHub work happens.
- If the base snapshot already has children, a new branch `forked-from-<base_cid>` is created at that commit, so sibling edits coexist.
- The base snapshot is marked `has_children = true`.
- A `Snapshot` row records the new CID, base CID, commit, and branch.

**Errors** — `401` missing or invalid token; `404` unknown graph or snapshot; `400` base snapshot belongs to a different graph.

### `GET /api/v1/fetch/{cid}`

Fetches a snapshot by CID and returns it as a `.knw` file, re-encoded from the stored base64 blob.

### `GET /api/v1/fetch/{cid}/json`

The same snapshot as plain JSON.

Both return the content as an attachment. Note these are addressed by **snapshot CID**, not by graph UUID — the repository has no endpoint that returns a graph's current head or its version list.

---

## Authorisation

Every write is gated by a self-contained UCAN capability token, verified against the [brotherhood-ucan](../brotherhood-ucan/README.md) service.

**On graph creation**, the service issues the requester a token with:

```text
with = storage://<service_did>/<graph_uuid>
can  = *
```

**On snapshot creation**, the requester must present a token whose audience is this service and whose capabilities — or whose proof chain's capabilities — include `edit/*` on the same resource. Verification checks issuer, signature, audience, capability, and expiry.

Tokens are self-contained, so authorization does not depend on the Permission Service being up at the moment of the write. Revocation is checked at verify time against the UCAN service's in-memory set, which does not survive a restart — issue time-limited tokens in the meantime.

---

## Event publishing

[`app/nostr_service.py`](app/nostr_service.py) signs and broadcasts to every URL in `NOSTR_RELAY_URLS` (comma-separated or a JSON array).

| When | Events |
| --- | --- |
| Service startup | Kind `27000` manifest — announces this node to relays |
| `POST /add/graph` | Kind `27001` availability (both `json` and `knw` endpoints), Kind `27002` `crt` |
| `POST /add/snapshot` | Kind `27001` availability, Kind `27002` `versadd` |

Broadcast failures are logged and swallowed. An unreachable relay must not fail a write that has already been committed to Git — custody outranks notification.

---

## Configuration

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `GITHUB_TOKEN` | **yes** | — | PAT used to create repos and push commits. |
| `APP_MODE` | recommended | `docker` | `production`, `docker`, or `local`. |
| `DATABASE_URL` | prod / docker | `postgresql://postgres:postgrespassword@db:5432/brotherhood-github-graph-repo` | SQLAlchemy URL. |
| `SERVICE_PRIVATE_KEY` | yes (runtime) | generated | PEM key used to sign UCAN tokens. |
| `SERVICE_PUBLIC_KEY` | yes (runtime) | generated | Matching public key. |
| `SERVICE_DID` | yes (runtime) | generated | This service's `did:jwk`. Audience and resource authority for issued tokens. |
| `UCAN_SERVICE_URL` | recommended | `http://ucan-service:7600` | Base URL of the UCAN service. |
| `ENV_FILE_PATH` | recommended | `/app/credentials/.env` | Writable file where generated keys persist across restarts. |
| `NOSTR_RELAY_URLS` | recommended | — | Relay URLs, comma-separated or JSON array. |
| `PORT` | recommended | `10000` | Internal listen port. `10000` in Docker. |
| `SERVICE_NAME` / `SERVICE_DESC` / `SERVICE_URL` | optional | — | Reported by `/api/v1/metadata`. |
| `LATEST_API_VERSION` | optional | `1` | Protocol-drift detection. |
| `PUBLIC_REPO_URL` | **legally required** by AGPL | `https://github.com/The-Brotherhood-Project/Constellation` | URL of the public repository. |
| `COPYRIGHT_NOTICE` | **legally required** by AGPL | `Copyright (c) 2026 The Brotherhood Project Developers` | Copyright notice for the service. |

### Identity bootstrapping

`start-services.sh` runs `alembic upgrade head`, then — if the key variables are unset — calls the UCAN service's `/keygen` and writes the result to `ENV_FILE_PATH`.

This matters: `SERVICE_DID` is the *resource* in every capability this service issues. If the identity regenerates, previously issued tokens reference a `storage://` URI that no longer matches, and existing holders silently lose access.

### Database modes

| Mode | Database | Intended for |
| --- | --- | --- |
| `local` | SQLite (`./brotherhood.db`) | Development |
| `docker` | Postgres, pooled | Compose |
| `production` | Postgres via `DATABASE_URL`, pooled, SSL required | Render + Supabase |

---

## Running

### Docker

```bash
cd github-graph-repo
cp .env.example .env      # set GITHUB_TOKEN
docker compose up -d --build
```

| Service | Port | Notes |
| --- | --- | --- |
| `app` | `8000` → `10000` | FastAPI app; waits for the UCAN service to be healthy |
| `ucan-service` | `7600` | Built from `../brotherhood-ucan` |
| `db` | `5432` | PostgreSQL 15 |

```bash
docker compose logs --tail=50 app
docker compose down
```

### Local

```bash
pip install -r requirements.txt
cp .env.example .env
python migrations/run_migrations.py upgrade
APP_MODE=local uvicorn app.main:app --host 0.0.0.0 --port 10000 --reload
```

Swagger UI at <http://localhost:10000/docs>.

> Tables are also created by `Base.metadata.create_all` on startup, so the service runs without Alembic in development. Migrations are what production should rely on.

---

## Tests

```bash
python test/test_nostr_publishing.py
```

On Windows: `test\run_tests.bat`.

Covers event signing, kind construction, relay URL parsing, and broadcast behaviour against a stub relay.

---

## Known limitations

- **Reads are by snapshot CID only.** There is no "give me this graph's current version" endpoint, no version listing, and no lineage traversal. Any consumer must already know a CID.
- **Forks are never reconciled.** The service creates `forked-from-<cid>` branches so siblings coexist, but nothing merges them. See [ROADMAP.md](../ROADMAP.md).
- **GitHub is a hard dependency for reads.** Postgres holds metadata; the content itself requires GitHub to be reachable. Mirroring is not implemented. Future extensions should implement independent storage configured for graphs.
- **The create-graph token is unrecoverable.** Returned once, never stored.
- **Revocation does not survive a UCAN service restart** — the revocation set is in-memory.
- **Base64 blob storage.** Git cannot hold binary, so `.knw` bytes are stored base64-encoded in a `.bin` file and decoded on fetch. This inflates stored size by roughly a third.
- **Publishes to relays on a best-effort basis.** Failures are logged; there is no retry queue.