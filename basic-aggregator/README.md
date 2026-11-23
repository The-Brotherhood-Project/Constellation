# Basic Aggregator

A declarative, static aggregation website builder for **The Brotherhood Project** and the **Constellation Ecosystem**.

The aggregator acts as the public aggregation layer, assembling project documentation, software repositories, and running physical host nodes into self-contained, statically deployable web pages without runtime server lock-in or client framework overhead.

---

## Architecture & Principles

- **Zero-Bundle, Offline-First**: Built with vanilla HTML/CSS and plain JavaScript. Markdown rendering is handled entirely on the client side using an offline-vendored `marked.min.js`.
- **Component-Driven Blocks**: Navigation, hero sections, document viewers, and cards are isolated in `blocks/` along with their styling and assets.
- **Convention Over Configuration**: Sensible defaults are inferred directly from markdown documents, frontmatter, and published service manifests.
- **Service Manifest Synchronization**: Remote manifest endpoints (`/metadata` or HTML `<meta name="service-metadata">`) override local editorial defaults when online, preventing stale directory listings while preserving reliable fallbacks when offline.
- **Automated License Injection**: The standard project license text block (`config/license.txt`) is automatically prepended to all generated HTML, CSS, and JS output files using proper comment syntax.

---

## Directory Structure

```text
basic-aggregator/
├── builder.py                  # Main entry point: static build & background daemon orchestrator
├── entrypoint.sh               # Container startup script (daemon + static HTTP server)
├── Dockerfile                  # Container definition for deployable Docker service
├── requirements.txt            # Python dependencies (pyyaml)
├── config/                     # Configuration definitions and examples
│   ├── license.txt             # Canonical project license text block
│   ├── service.yaml            # Aggregator service manifest & daemon interval configuration
│   ├── service.yaml.example    # Documented example with all service fields
│   ├── documents.yaml          # Document discovery directory & manual overrides
│   ├── documents.yaml.example  # Documented example with all document fields
│   ├── digital.yaml            # Software repositories & manifest URLs
│   ├── digital.yaml.example    # Documented example with all digital repo fields
│   ├── physical.yaml           # Host instances, operators, endpoints, and DIDs
│   └── physical.yaml.example   # Documented example with all instance fields
├── blocks/                     # HTML/CSS UI components & shared design tokens
│   ├── assets/                 # Shared design tokens (common.css, icon.png)
│   ├── navigation/             # Site header & sticky navigation bar
│   ├── home-hero/              # Standalone landing hero component
│   ├── document-card/          # Document library card component
│   ├── document-viewer/        # Client-side Markdown viewer modal controller & CSS
│   ├── infrastructure-card/    # Digital repository card component
│   ├── instance-card/          # Host node & instance card component
│   ├── layout/                 # Grid layout and page container styles
│   └── footer/                 # Site footer component
├── sources/                    # Modular build pipeline sources
│   ├── composer.py             # Page composition and block assembly
│   ├── documents.py            # Document discovery, frontmatter extraction & tag parsing
│   ├── repositories.py         # Digital repositories & remote manifest loader
│   ├── instances.py            # Host metadata probe & HTML manifest extractor
│   ├── assets.py               # Static asset synchronizer & collector
│   ├── license_header.py       # Automated license header prepender
│   └── vendor/                 # Vendored offline libraries (marked.min.js)
└── dist/                       # Clean deployable static output (generated)
    ├── index.html              # Handcrafted Homepage
    ├── documents.html          # Document Library & in-browser Markdown viewer
    ├── digital.html            # Digital Infrastructure directory
    ├── physical.html           # Physical Infrastructure & Hosting directory
    ├── css/                    # Static component and layout stylesheets
    ├── js/                     # Component scripts
    ├── vendor/                 # Offline dependencies
    └── assets/                 # Static assets & documents
```

---

## Configuration Reference

All configurations reside in `config/`. Each configuration file has an accompanying `.yaml.example` file explaining available variables and editorial usage:

### 1. `service.yaml`
Configures the aggregator's own service manifest (exposed on `<meta name="service-metadata">`) and background rebuild intervals:
```yaml
service_name: "The Brotherhood Portal"
service_desc: "Public Aggregator & Entry Portal for the Constellation Ecosystem"
service_type: "Aggregator"
service_operator: "The Brotherhood Project Developers"
service_did: ""
status: "Active"
latest_api_version: ""
public_repo_url: "https://github.com/The-Brotherhood-Project/Constellation"
tags: ["Portal", "Static", "Aggregator"]
rebuild_interval_seconds: 3600
```

### 2. `documents.yaml`
Configures document discovery directory and editorial overrides:
```yaml
documents_directory: "../docs"
documents:
  - id: architecture
    file: "ARCHITECTURE.md"
    title: "Constellation Architecture"
    description: "System architecture, core components, protocols, and data structures."
    tags: '["Architecture", "Technical", "Core"]'
    featured: true
```

### 3. `digital.yaml`
Defines digital repositories. When `manifest_url` is provided and accessible, its published values take precedence:
```yaml
repositories:
  - id: constellation-core
    name: "Constellation Core"
    description: "Foundational protocols, graph formats (KNW, RVR, CPB), and offline codecs."
    repo_url: "https://github.com/The-Brotherhood-Project/Constellation"
    status: "Active"
    stage: "Implemented"
    tags: '["Core", "Protocols", "Specs"]'
    featured: true
    manifest_url: ""
```

### 4. `physical.yaml`
Defines physical deployment instances and nodes. Follows the standard `service_manifest` naming conventions (`service_name`, `service_operator`, `service_did`, `latest_api_version`, `status`):
```yaml
instances:
  - id: seed-relay
    host_url: "http://localhost:27000"
    service_name: "Seed Nostr Relay Instance"
    service_operator: "The Brotherhood Core"
    service_did: "did:key:z6MkhaXgBZDvotDkL5257faiz48Z8x288ce65993"
    service_type: "Relay"
    status: "Active"
    latest_api_version: "v1"
    tags: '["Seed", "Relay", "Production", "Nostr"]'
    featured: true

  - id: seed-web-curator
    host_url: "http://localhost:5500/web-curator-lab/index.html"
    service_name: "Web Curator Lab Host"
    service_operator: "The Brotherhood Project Developers"
    service_did: ""
    service_type: "Curator Lab"
    status: "Active"
    latest_api_version: ""
    tags: '["Web Host", "Static", "Curator"]'
    featured: false
```
*Note: For static sites without an API or DID, `service_did` and `latest_api_version` are safely left empty.*

---

## Usage

### 1. Local One-Shot Static Build
Run the main script to generate all four pages and static assets directly into `dist/`:
```bash
python builder.py
```

### 2. Local Background Daemon Mode
To run periodic rebuilds every `rebuild_interval_seconds` (default: 3600 seconds):
```bash
python builder.py --daemon
```

### 3. Running with Docker
Build and run the standalone container service:
```bash
docker build -t basic-aggregator .
docker run -d -p 3000:3000 --name basic-aggregator basic-aggregator
```

The container automatically:
1. Executes an initial static build into `dist/`.
2. Spawns a background daemon re-evaluating and re-building pages every hour (or configured interval).
3. Serves the resulting static website on port `3000`.

To integrate into the top-level `docker-compose.yml`:
```yaml
  basic-aggregator:
    build: ./basic-aggregator
    ports:
      - "3000:3000"
    volumes:
      - ./docs:/docs:ro
    restart: unless-stopped
```

