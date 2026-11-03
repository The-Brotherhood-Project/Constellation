# Architecture

This document explains *why* the ecosystem is shaped the way it is. For what exists today, see the [root README](../README.md). For what gets built next, see [ROADMAP.md](ROADMAP.md).

---

## The premise

The Brotherhood is not a single application. It is an ecosystem of independent services and participants connected through shared protocols and a distributed event network.

The goal is not merely modular software engineering. The architecture is designed so that implementations can be replaced, duplicated, forked, or independently developed without asking a central system for permission.

> A better implementation should be able to enter the ecosystem simply by speaking the relevant protocols.

Applications are temporary. Services are replaceable. Protocols and shared knowledge outlive implementations.

---

## Principles

### Protocols over implementations

Services communicate through public contracts — HTTP endpoints, file formats, signed events — never through internal dependencies.

No participant depends on another participant's database, programming language, internal architecture, or deployment topology. Only the protocol contract matters.

### Replaceable implementations

Any implementation should be replaceable without changes elsewhere. A new repository, relay, Academia, Knowledge Collector, or permission service joins the ecosystem by satisfying its protocol.

### Independent development

A contributor should be able to build one component without understanding the internals of the rest. The boundary between components *is* the protocol.

### Federation

Nothing requires a central deployment. The ecosystem may contain centralised servers, federated instances, personal servers, user devices, temporary peers, caches, and mirrors. Each participates according to its capabilities.

### Custody is not monopoly

Repositories protect dedicated storage slots. They do not hold exclusive control over public information stored inside them. A resource may live simultaneously in a canonical repository, a mirror, a cache, a user device, or content-addressed storage.

> A repository guarantees custody. It does not prohibit replication.

### Discovery is not authority

No infrastructure component decides which resources are globally "best". Discovery happens at two distinct levels, and conflating them is the most common architectural mistake in systems like this.

**Autonomous discovery** — the Relay Network. The question is *"what do you know about this event or resource?"* It is a network function.

**Interpretive discovery** — Aggregators such as Academia, Pub, or Statistics. The question is *"what resources are relevant to this purpose?"* It is a knowledge and social function.

A relay can tell you it knows of 4,000 events about a topic. An aggregator can tell you which three of those are good introductory maps. Both are needed. Neither substitutes for the other.

### Intelligence must be scoped

Services are not intentionally made stupid. They are specialised.

A service may perform arbitrarily sophisticated computation inside its responsibility, but should not expand into unrelated domains. A relay may deeply optimise event movement. A repository may deeply index persistence. Academia may deeply aggregate educational structure.

> The constraint on a service is not technical capability. It is responsibility.

---

## High-level shape

```text
                         HUMAN DISCOVERY
                    ┌───────────────────────┐
                    │      AGGREGATORS      │
                    │ Academia │ Pub │ Stats│
                    └───────────┬───────────┘
                                │  interpret / recommend
                                ▼
╔════════════════════════════════════════════════════════════╗
║                       RELAY NETWORK                        ║
║   Relay ◄────► Relay ◄────► Relay ◄────► Relay            ║
╚═══════╤═══════════════╤════════════════╤═══════════════════╝
        │               │                │
      events          events         discovery
        │               │                │
┌───────▼───────┐ ┌────▼───────────┐ ┌──▼──────────────────┐
│ Repositories  │ │ Knowledge      │ │ Curator Lab         │
│               │ │ Collectors     │ │                     │
│ Graph         │ │                │ │ Editing             │
│ Resource      │ │ Personal       │ │ Visualization       │
│ Capability    │ │ Academia       │ │ Validation          │
└───────┬───────┘ └──────┬─────────┘ └──────────┬──────────┘
        │                │                       │
        └────────────────┼───────────────────────┘
                         │
                  DIRECT RESOURCE ACCESS
                         ▼
            Graphs / Resources / Capability Records


                    WRITE AUTHORIZATION
                         │
                         ▼
                ┌──────────────────┐
                │ Permission       │
                │ Service          │
                │ UCAN Delegations │
                │ Governance       │
                └──────────────────┘
                         │
                         ▼
                  Authorized Writes
```

The Permission Service is deliberately orthogonal to discovery and transport. The Relay does not decide whether a user may modify a graph. The Repository does not need to understand the governance structure. The Permission Service produces delegable authorization proofs that other services verify independently.

---

## The components

### Permission Service — `brotherhood-ucan`

Answers: *what authority has been delegated to this participant?*

Issues and verifies UCAN capability tokens over Ed25519 / `did:jwk` identities. Authority travels with the request rather than requiring every repository to call a central authority on every operation:

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
  Repository  ── verifies issuer, chain, audience,
                capability, expiry, and resource scope
```

Because the proof is self-contained, authorization stays verifiable even when the Permission Service is unavailable. It owns root registration, delegation, revocation, and governance policy. It owns no storage, no transport, no ranking.

### Graph Repository — `github-graph-repo`

Answers: *can I provide this resource?*

Custodian of structured resources. Preserves and serves dedicated slots, guarantees version history and integrity, and publishes resource events to the relay. It verifies authorization proofs on protected writes but does not need to know the wider governance structure.

The current implementation delegates blob storage to one Git repository per graph: a snapshot is a commit, a branch is a fork point, and the graph's CID is the snapshot's identity. Postgres holds only enough metadata to locate the right commit — enough metadata that a complete graph can be reconstructed from Git alone.

Two more repository roles are planned but not built: a **Resource Repository** for documents, media, and content-addressed objects, and a **Capability Repository** for assessments, evidence, and endorsements.

### Relay — `nostr-relay`

Answers: *what events do you know about this identifier?*

The dedicated transportation service. It may perform sophisticated computation — indexing, filtering, routing, peer selection, topology awareness, deduplication, retention, reconciliation — but only to answer *how should this information move?* It never attempts to answer *what does this mean to humans?*

The relay understands network-level event structure: event identity, producer, timestamp, signature, resource reference, version reference, content identifier, location, availability, replication state, topology. It does not need to know whether a referenced object is a graph, a snapshot, an assessment, or a job. To a relay, these are all event references.

The Relay must not depend on Statistics, Academia, Pub, or any centralised discovery service. Those participants may observe the relay; they are not required for it to function.

### Curator Lab — `web-curator-lab`

Answers: *how can this graph be edited?*

The graph creation and editing environment: authoring, visualisation, structural validation, import, export, diff viewing, local workspace management. It is deliberately separate from any repository — an editor should need to understand graph formats and repository interfaces, not a particular repository's implementation.

```text
Import Graph → Edit Locally → Validate → Produce New Version
             → Request Authorization → Publish to Repository
```

The editing implementation is disposable. The graph and its protocol are not.

### Knowledge Collector — *planned*

Answers: *what is useful to me?*

The primary personal participant. More than a client: it constructs a user-specific view of distributed knowledge. It performs event discovery, aggregator queries, direct fetching, local indexing, caching, chunk selection, progress tracking, and — if it chooses to publish — event publication.

A Collector can function as a personal, client-side Academia. It independently decides what information is useful.

### Aggregators — *planned*

**Academia** answers *where should I begin?* It observes the network and builds educational interpretations: discovering graphs, ranking learning paths, aggregating prerequisites, recommending materials, caching popular regions, hosting discussions.

**Pub** is the broader public aggregator. Where Academia specialises in education, Pub surfaces curation projects, organisations, contributors, releases, discussions, and community initiatives.

**Statistics** services observe network activity over time and expose derived knowledge — frequently referenced clusters, highly replicated resources, consistent availability, commonly traversed learning paths. Advisory only; the Collector decides whether to act on them.

Aggregators are social infrastructure. They supply what autonomous infrastructure cannot: human trust. That layer stays **decoupled** from persistence and transport, so an aggregator can become biased, poor, centralised, or unavailable without breaking discovery or access. Another aggregator can replace it.

---

## Three kinds of information

The architecture separates three things that are easy to conflate.

**Resources** are actual content — graph chunks, graph versions, PDFs, videos, assessments, capability records. These move directly between participants.

**Events** are statements about resources and network activity — resource published, version created, location available, cache available, relay discovered. These move through relays.

**Aggregations** are derived interpretations — recommendations, rankings, popularity, curricula, statistics, search indexes, trusted sources. These are constructed by Collectors and Aggregators.

```text
                        MEANING

              Academia / Pub / Statistics
                     Knowledge Collectors
                              ▲
                              │
                       interpretation
══════════════════════════════╪══════════════════════════
                              │
                            EVENTS

                         Relay Network
                              ▲
                              │
                       transportation
══════════════════════════════╪══════════════════════════
                              │
                          RESOURCES

                   Repositories / Caches
                   Mirrors / User Devices
```

---

## Authentication and authorization

Identity and authorization are independent of transport and discovery. The Relay does not decide whether a participant may modify a graph. Aggregators do not control repository access. Repositories verify authorization on protected operations.

```text
User ──delegated capability──► UCAN ──presented with write──► Repository
                                                            ├─ verify signature
                                                            ├─ verify chain
                                                            ├─ verify capability
                                                            ├─ verify scope
                                                            └─ accept / reject
```

---

## Why the social layer sits above, never around

The ecosystem deliberately separates **autonomous infrastructure** from **social infrastructure**.

The lower layers must work without popularity metrics, human trust, recommendations, institutional endorsement, or centralised ranking. A resource can exist, be discovered, and be fetched even if nobody has written an article about it.

Humans, meanwhile, benefit enormously from centralised and socially trusted institutions that answer a different question: *what matters?*

The ecosystem therefore does not reject centralisation. It limits its authority.

> Centralization is permitted where it creates value, but never required where it creates dependency.

---

## The core architecture

The whole picture reduces to five verbs:

> **Permission Services authorize. Repositories preserve. Relays transport. Collectors personalize. Aggregators help humans discover meaning.**

Repositories do not depend on aggregators. Relays do not depend on statistics. Resources do not depend on popularity. Users can find objects directly.

But centralised aggregators remain valuable, because they solve a fundamentally different problem:

> Not whether something *can* be found, but whether a human can understand **why they should care**.

That is the missing architectural principle that makes the picture click: **the social layer is optional infrastructure for trust and meaning, sitting above — but never controlling — the autonomous layers of authorization, persistence, transport, and direct access.**