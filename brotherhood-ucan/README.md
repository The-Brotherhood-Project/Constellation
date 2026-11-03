# brotherhood-ucan

A cryptographic UCAN helper for components of [The Brotherhood](../README.md): issues and verifies UCAN capability tokens.

A small TypeScript service that gives every other component one language-agnostic authority for delegated authorisation.

Part of [ARCHITECTURE.md](../ARCHITECTURE.md). This service stores no user accounts and decides no policy beyond what a token's capabilities already encode. It provides the cryptography — sign, verify, resolve — and the delegation machinery any other service needs in order to trust a token.

**Important**: This is **NOT** a permission service as talked about in [ARCHITECTURE.md](../ARCHITECTURE.md), which stores data and automates governance.

---

## Why it exists

A repository that had to call a central authority before every write would have a hard dependency on that authority being up. UCAN avoids this: authority is encoded in a signed, self-contained token that the repository verifies locally.

```text
Root Authority
      │ delegates
      ▼
    User
      │ delegates limited authority
      ▼
Application / Collaborator
      │ presents proof
      ▼
  Repository — verifies issuer, chain, audience,
              capability, expiry, and resource scope
```

The repository never asks *who issued this?* It reads it off the signature. This is the property that keeps authorisation verifiable for distributed systems like The Brotherhood.

---

## What it does

- Generates Ed25519 keypairs and `did:jwk` identities
- Issues signed UCAN tokens with arbitrary capabilities, expirations, and proofs
- Verifies a single token: signature, version, expiry, revocation, audience
- Verifies a recursive **chain of proof** tokens
- Revokes a token by `jti`
- Resolves a `did:jwk` to a public key
- Decodes a token without verifying it

Speaks **UCAN 1.0.0** with `EdDSA` (Ed25519) signatures over the standard `header.payload.signature` JWT-like envelope.

---

## Layout

```text
brotherhood-ucan/
├── server.ts      # Fastify HTTP service — all endpoints
├── test.ts        # End-to-end tests, run via npm test
├── Dockerfile
├── package.json
└── tsconfig.json
```

No persistence layer, by design. The only state is an in-memory `Set<string>` of revoked `jti` values — see [Known limitations](#known-limitations).

---

## Token format

```text
<base64url(header)>.<base64url(payload)>.<base64url(signature)>
```

### Header

```json
{ "alg": "EdDSA", "typ": "JWT", "ucv": "1.0.0" }
```

`ucv` is part of the signed bytes, so a future spec version can be introduced without invalidating tokens signed under this one.

### Payload

```json
{
  "iss": "did:jwk:...",
  "aud": "did:jwk:...",
  "exp": 1735689600,
  "nbf": 1735603200,
  "att": [
    { "with": "graph:123", "can": "graph/edit" }
  ],
  "fct": [ /* arbitrary facts, optional */ ],
  "prf": [ /* nested UCAN tokens, optional */ ],
  "jti": "uuid-v4"
}
```

| Claim | Meaning |
| --- | --- |
| `iss` | Issuer's `did:jwk`, resolved to a public key at verify time. |
| `aud` | Intended audience, typically the receiving service's DID. |
| `exp` | Unix seconds. `0` means **no expiry**. |
| `nbf` | Optional. Rejected if `nbf > now`. |
| `att` | Capabilities. See below. |
| `fct` | Optional facts. Not used for authorisation. |
| `prf` | Nested tokens whose capabilities are being delegated onward. |
| `jti` | Token ID. Required for revocation to work. |

### Signature

Ed25519 over the UTF-8 bytes of `<header>.<payload>`, base64url encoded — identical to JWT.

---

## Capability model

Capabilities are `{ with, can, exp?, nb? }`.

| Field | Meaning |
| --- | --- |
| `with` | The resource. `*` matches every resource. |
| `can` | The action. `*` matches everything; `prefix/*` matches anything starting with `prefix/`. |
| `exp` | Optional capability-level expiry. In the past ⇒ not granted. |
| `nb` | Optional capability-level "not before". In the future ⇒ not granted. |

Subsumption, implemented by `capabilitySubsumes`:

| `parent.can` | Matches `child.can` when… |
| --- | --- |
| `*` | always |
| `graph/edit` | it is exactly `graph/edit` |
| `graph/*` | it starts with `graph/` |

If the required capability is absent from `att`, the verifier recurses into `prf`. A proof is valid when it chains back to an issuer holding the capability and every link passes audience, signature, and expiry.

**In practice:** the Graph Repository issues `storage://<service_did>/<graph_uuid>` with `can: *`, then requires `edit/*` on subsequent writes.

---

## Running

```bash
cd brotherhood-ucan
npm install
npm start              # :3000
PORT=7600 npm start    # or override
```

Prints `UCAN service running at http://0.0.0.0:<port>` when ready. `npm start` runs the TypeScript source directly via `tsx` — there is no build step.

### Docker Compose

```bash
docker build -t brotherhood-ucan .
docker run --rm -p 7600:7600 -e PORT=7600 brotherhood-ucan
```

Based on `node:20-alpine`, also using `tsx`, so the same source runs in development and in containers.

### Docker Hub

```bash
docker pull darksecret/brotherhood-ucan:latest
```

**Note:** Pulling the Docker Hub image is recommended to keep all builds updated to the latest version without having cross-directory dependencies.

Both `github-graph-repo` and `nostr-relay` pull this image from Docker Hub and gate their startup on its `/health`.

---

## API

Fastify. All bodies JSON; `/health` is the only `GET`.

### `GET /health`

```json
{ "status": "ok", "version": "1.0.0" }
```

### `POST /keygen`

Generates an Ed25519 keypair and the matching `did:jwk`.

**Body** — `{ "password": "optional-passphrase" }`

With a passphrase, the private key is exported as an AES-256-CBC-encrypted PKCS#8 PEM.

**Response**

```json
{
  "did": "did:jwk:...",
  "publicKey": "-----BEGIN PUBLIC KEY-----\n...",
  "privateKey": "-----BEGIN PRIVATE KEY-----\n..."
}
```

### `POST /issue`

Issues a token signed by the issuer's private key.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `issuerPrivateKey` | PEM string | yes | The issuer's key. |
| `issuerPassword` | string | no | Passphrase, if the key is encrypted. |
| `audience` | DID string | yes | Who the token is for. |
| `capabilities` | `Capability[]` | yes | `{ with, can, exp?, nb? }` objects. |
| `proofs` | `string[]` | no | Tokens whose capabilities are being delegated. |
| `facts` | `any[]` | no | Optional. |
| `expiration` | number | yes | Unix seconds. `0` = no expiry. |
| `notBefore` | number | no | Optional `nbf`. |
| `jti` | string | no | Random UUID if omitted. Required later for `/revoke`. |

**Response** — `{ "token": "<header>.<payload>.<signature>" }`

### `POST /verify`

Verifies a single token, with optional audience pinning, capability checking, and recursive proof resolution.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `token` | string | yes | The token to verify. |
| `expectedAudience` | DID string | no | If set, `aud` must match exactly. |
| `requiredCapability` | `Capability` | no | If set, the token or a proof must grant it. |

**Success** — `{ "valid": true, "claims": { … }, "proofs": [ … ] }`

**Failure** — `{ "valid": false, "reason": "…", "claims": null }`, with HTTP `400`.

`500` indicates an unexpected internal error, not a verification result.

### `POST /revoke`

Adds a `jti` to the revocation set. Any later verification of a token carrying it fails with `Token has been revoked`.

**Body** — `{ "jti": "…" }` → `{ "revoked": true, "jti": "…" }`

### `POST /resolve`

Resolves a `did:jwk` to a public key.

**Body** — `{ "did": "did:jwk:…" }` → `{ "publicKey": "…", "type": "OKP" }`

### `POST /extract`

Decodes the header and payload without verifying anything. The signature is deliberately not returned.

**Body** — `{ "token": "…" }` → `{ "header": { … }, "payload": { … } }`

---

## Internal helpers

Private functions in `server.ts`, worth knowing if you extend the service:

- `capabilitySubsumes(parent, child)` — the subsumption table above, as a pure function
- `parseJwkFromDid(did)` — decodes the embedded JWK; throws on any DID method other than `did:jwk`
- `verifySignatureAndExpiry(token)` — single-token check: header format, UCAN version, `EdDSA`, `exp`/`nbf`, revocation, then the Ed25519 signature
- `verifyTokenChain(token, expectedAudience?, requiredCapability?)` — wraps the above, applies audience pinning, walks `att`, and recurses into `prf` if needed

---

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Listen port. Both Compose files use `7600`. |

Logging is Fastify's default. There is no external config file.

---

## Tests

```bash
npm test
```

Runs `test.ts` against Fastify's `server.inject` — no port bound. Covers `/health`; keygen with and without a passphrase; `/resolve`; Alice → Bob delegation for `graph/edit` on `graph:123`; verification by capability, audience, and subsumption; encrypted-key issuance Bob → Charlie with a proof; recursive proof verification back to Alice; revocation producing a `400`; and capability-level `exp`/`nb` in each direction.

---

## Known limitations

- **In-memory revocation.** The revoked set lives in the process and is cleared on restart. Multi-instance deployments need a shared store (Redis, Postgres). Until then, issue time-limited tokens.
- **Unbounded proof depth.** `verifyTokenChain` recurses without a cap. A deeply nested chain could overflow the stack; a depth limit of ~8 is the obvious fix.
- **`did:jwk` only.** The parser handles the embedded JWK; other DID methods are rejected.
- **No request body schema validation.** Bodies are typed as `any`. Production deployments should add Fastify JSON schemas.
- **No audience-less verification mode.** `expectedAudience` is optional in the request but callers should always pin it.