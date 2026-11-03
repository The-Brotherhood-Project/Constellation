# nostr-relay

The **Relay** service of [The Brotherhood](../README.md): transport and discovery of signed events.

Its entire responsibility is to move event knowledge through the network and answer one question:

> *What events do you know concerning this identifier or tag?*

It does not answer "which resource is best". That is an aggregator's job, and conflating the two is the mistake this design exists to prevent. See [ARCHITECTURE.md](../ARCHITECTURE.md#discovery-is-not-authority).

---

## What it does

- Accepts events signed with Ed25519 over a `did:jwk` identity
- Verifies both the canonical event ID and the signature before storing anything
- Enforces replaceable vs append-only semantics per event kind
- Stores tags as generic key–value pairs, so querying never requires a schema migration
- Answers queries by kind, creator DID, tag, and time range

**What it does not do:** relay, rank, or interpret. It does not know whether an event refers to a graph, a PDF, or a job.

---

## Layout

```text
nostr-relay/
├── app/
│   ├── main.py           # FastAPI entrypoint, CORS, lifespan, /health
│   ├── api/v1/api.py     # HTTP routes — routers only
│   ├── crud.py           # Persistence, signature verification, replaceability
│   ├── models.py         # SQLAlchemy models
│   ├── schemas.py        # Pydantic request/response schemas
│   ├── database.py       # Engine, session, APP_MODE switch
│   └── start-services.sh # Key generation + uvicorn, used by the Dockerfile
├── migrations/
│   ├── env.py
│   ├── run_migrations.py
│   └── versions/001_initial_schema.py
├── test/
│   ├── test_relay.py
│   └── run_tests.bat
├── alembic.ini
├── docker-compose.yml
└── Dockerfile
```

Strict `API → CRUD` layering: routers validate and delegate, `crud.py` is the only file that touches SQLAlchemy or performs verification.

---

## Event schema

Nostr-*like*, not Nostr. It uses a flat signed envelope with a `dict` of tags rather than an array of tag arrays.

```json
{
  "id": "<64 hex chars — sha256 of the canonical serialisation>",
  "kind": 27001,
  "did": "did:jwk:...",
  "created_at": 1757068800,
  "tags": {
    "did": "did:cid:abc...",
    "available": "true",
    "endpoint": "fetch/abc...",
    "sub_type": "g",
    "file_type": "knw"
  },
  "sig": "<128 hex chars — ed25519 signature of the id string>"
}
```

**`tags` is a plain object.** This is the important difference from Nostr. A relay that can store arbitrary key–value pairs can carry any protocol someone later defines, without a schema change, a migration, or a relay upgrade.

### Verification

Two checks, in order, before anything is written:

1. **Canonical ID** — recompute `sha256(json.dumps([0, did, created_at, kind, tags], separators=(',',':'), sort_keys=True))` and compare to `id`. A mismatch means the event was altered after signing.
2. **Signature** — resolve the `did:jwk` to a raw 32-byte Ed25519 public key and verify `sig` over the `id` string.

An event with a bad signature or an ID mismatch is rejected with `400`. The relay never trusts a claim about who sent something.

---

## Event kinds

Registered at startup by `seed_event_kinds`. The base offset is `27000`, so new protocol kinds extend upward from a constant rather than being hardcoded per service.

| Kind | Name | Semantics | Meaning |
| --- | --- | --- | --- |
| `27000` | Metadata / Manifest | Replaceable per creator `did` | "This is who I am and where I live." |
| `27001` | Resource Availability | Replaceable per creator `did` + resource tag | "This resource exists and is here." |
| `27002` | Project Updates | Append-only | "Something happened." |

### Replaceability

**Kinds 27000 and 27001** hold *current state*, so only the newest survives. A newer `created_at` from the same creator deletes the previous event. An older or equal event is discarded and the stored one is returned unchanged — this makes republication idempotent and prevents clock-skewed nodes from corrupting each other's state.

For 27001 the replacement key includes the resource tag (`did` or `url`), so one creator can announce availability for many resources independently.

**Kind 27002** is history. Every event is kept. Project updates are what make "what happened to this graph?" answerable at all; collapsing them would destroy the only record of the sequence.

---

## Data model

Three tables, separating event kinds, event headers, and tags.

```text
┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
│   event_kinds   │        │     events      │        │      tags       │
├─────────────────┤        ├─────────────────┤        ├─────────────────┤
│ kind (PK)       │ 1───N  │ id (PK hex)     │ 1───N  │ id (PK)         │
│ name            │────────│ kind (FK)       │────────│ event_id (FK)   │
│ description     │        │ did             │        │ key             │
│ created_at      │        │ created_at      │        │ value           │
│                 │        │ sig             │        └─────────────────┘
│                 │        │ received_at     │
│                 │        └─────────────────┘
└─────────────────┘
```

`tags` is indexed and generic. Adding a new protocol tag needs no migration — which is what lets the relay stay protocol-agnostic while still being useful.

`received_at` is stored separately from `created_at` so that relay arrival order remains visible even when a publisher's clock is wrong.

---

## API

All routes are under `/api/v1`.

### `GET /health`

```json
{ "status": "healthy", "service": "brotherhood-nostr-relay" }
```

### `POST /api/v1/events`

Publish an event. Validates the ID, verifies the signature, checks the kind is registered, applies replaceability, stores the event and its tags.

**Body** — a single event object as shown above.

**Returns** — the stored event. `400` on signature failure, ID mismatch, or unregistered kind.

### `POST /api/v1/events/query`

Query with a structured filter.

```json
{
  "kinds": [27000, 27001],
  "dids": ["did:jwk:..."],
  "tags": { "sub_type": "g" },
  "since": 1757000000,
  "until": 1758000000,
  "limit": 50
}
```

All fields optional; omitted fields are not filtered on. `limit` defaults to 100.

**Returns** — a list of matching events, each with its full `tags` object reconstructed.

### `GET /api/v1/events`

The same query as URL parameters.

```bash
curl "http://localhost:27000/api/v1/events?kind=27001&did=did:jwk:...&limit=100"
```

Note that the GET form cannot filter by tag — use the POST form for that.

### `GET /api/v1/kinds`

Lists registered event kinds with their names and descriptions.

### `GET /api/v1/metadata`

Public service description: name, description, `did`, licence, latest API version, source repository URL. Clients use this to detect which implementation they are talking to.

---

## Configuration

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `APP_MODE` | recommended | `docker` | `production`, `docker`, or `local`. Selects the DB pipeline. |
| `DATABASE_URL` | prod / docker | `postgresql://postgres:postgrespassword@db:5432/brotherhood-nostr-relay` | SQLAlchemy URL. In `docker` mode it defaults to the bundled Postgres. |
| `SQLALCHEMY_DATABASE_URL` | local | `sqlite:///./brotherhood.db` | Used in `local` mode. |
| `UCAN_SERVICE_URL` | yes | `http://ucan-service:7600` | Where to request the service keypair on first boot. |
| `ENV_FILE_PATH` | recommended | `/app/credentials/.env` | Writable file where generated key material is persisted. |
| `PORT` | recommended | `10000` | Internal listen port. `10000` in Docker. |
| `SERVICE_NAME` / `SERVICE_DESC` / `SERVICE_URL` | optional | — | Reported by `/api/v1/metadata`. |
| `LATEST_API_VERSION` | optional | `1` | Protocol-drift detection. |
| `PUBLIC_REPO_URL` | **legally required** by AGPL | `https://github.com/The-Brotherhood-Project/Constellation` | URL of the public repository. |
| `COPYRIGHT_NOTICE` | **legally required** by AGPL | `Copyright (c) 2026 The Brotherhood Project Developers` | Copyright notice for the service. |

### Database modes

| Mode | Database | Intended for |
| --- | --- | --- |
| `local` | SQLite, no pool | Development |
| `docker` | Postgres, pooled | Compose deployments |
| `production` | Postgres via `DATABASE_URL`, small pool, `sslmode=require`, `pool_pre_ping` | Render + Supabase |

### Identity bootstrapping

`start-services.sh` runs migrations, then calls the UCAN service's `/keygen` to mint an Ed25519 keypair and `did:jwk` if `SERVICE_PRIVATE_KEY`, `SERVICE_PUBLIC_KEY`, and `SERVICE_DID` are not already set. The result is written to `ENV_FILE_PATH` so the identity survives restarts — the relay's `did` is its persistent identity on which ecosystem trust is built.

---

## Running

### Docker

```bash
cd nostr-relay
cp .env.example .env
docker compose up -d --build
```

| Service | Host port | Notes |
| --- | --- | --- |
| `app` | `27000` → `10000` | The relay API |
| `ucan-service` | `27076` → `7600` | Built from `../brotherhood-ucan` |
| `db` | `27054` → `5432` | PostgreSQL 15 |

```bash
docker compose logs --tail=50 app
docker compose down
```

### Local

```bash
pip install -r requirements.txt
python -m alembic upgrade head
APP_MODE=local uvicorn app.main:app --host 0.0.0.0 --port 10000 --reload
```

Swagger UI at <http://localhost:10000/docs>.

---

## Migrations

```bash
python -m alembic upgrade head                          # apply
python -m alembic current                               # show current revision
python -m alembic revision --autogenerate -m "describe" # generate
```

`migrations/env.py` reads the URL from `app.database`, so all three `APP_MODE` values share one source of truth.

---

## Tests

```bash
python test/test_relay.py
```

On Windows: `test\run_tests.bat`.

Covers kind seeding, replaceability for 27000 and 27001, append-only behaviour for 27002, rejection of bad signatures and unregistered kinds, and tag filtering across both query forms.

Cross-service integration — the repository publishing to a relay — lives at [`test/test_transport_layer.py`](../test/test_transport_layer.py) in the repository root.

---

## Interoperating

Any participant can publish here. It needs a `did:jwk`, an Ed25519 key, and a signed event.

The reference publisher is [`github-graph-repo/app/nostr_service.py`](../github-graph-repo/app/nostr_service.py), which announces itself on startup and publishes availability on every graph and snapshot.

---

## Known limitations

- **Single-relay deployment.** There is no relay-to-relay gossip. A relay knows only what was published to it directly. Peer discovery and event reconciliation are planned — see [ROADMAP.md](../ROADMAP.md).
- **HTTP polling only.** No subscription or streaming interface. Consumers must poll.
- **No rate limiting or quotas.** Any client may publish any registered kind.
- **No persistence for reachability.** There is no retry queue: a broadcast to an unreachable relay is lost, not deferred.