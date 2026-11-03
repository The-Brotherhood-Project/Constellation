# Constellation Web Design System & Architecture Specification

This specification defines the architectural patterns, state flow, responsive UI guidelines, styling conventions, and offline-first standards for browser-based applications in the Constellation ecosystem (e.g., `web-curator-lab`, `web-casey`).

---

## 1. Core Principles

1. **Local-First & Offline Execution**:
   - Zero-build, zero-bundle vanilla web apps running over static HTTP origins (`python -m http.server`).
   - No external framework lock-in (no React/Vue/Angular), no compile steps, no runtime servers needed for core workflows.
   - Core workflows require zero network access. Persistence is local (`localStorage` or IndexedDB) with exportable portable binary artifacts (`.knw`, `.rvr`, `.cpb`).

2. **Vendor Assets Offline**:
   - Never rely on CDNs for runtime operation. All critical third-party dependencies, libraries, and WASM binaries (e.g. `zstd.wasm`, `zstd.esm.js`, `vis-network`) should be vendored locally into `vendor/` or local script paths. The entire application must work flawlessly in airplane mode without internet access.

3. **Non-Module Scripts Wherever Possible**:
   - Favor plain window-global scripts loaded via `<script src="...">` in explicit dependency order for ops, globals, and UI controllers.
   - Avoid ES module fragmentation (`import`/`export`) in regular scripts to prevent MIME/CORS confusion and keep browser inspection simple.
   - Restrict `type="module"` strictly to entry points (`app.js`) only where ES module imports (such as WebAssembly codecs) are strictly necessary, exporting required utilities to `window`.

4. **Reusable Drop-in Components**:
   - Shared components are modular, drop-in assets designed to work across apps with zero or minimal glue code.
   - Key reused components across the ecosystem include:
     - `DialogController` (`scripts/components/dialog.js`): Self-contained alert, confirm, and prompt dialogs with dynamic DOM injection.
     - `ImporterComponent` (`scripts/components/importer.js`): Universal file and URL import modal with format selection and codec dispatch.
     - `GraphVisualizer` (`scripts/components/graph-visualizer.js`) & `GraphController` (`scripts/components/graph-controller.js`): Network canvas rendering, domain clustering, interactive node manipulation, and highlight styling.
     - `ModalController` (`scripts/components/modal-controller.js`): Standardized overlay control and keyboard/backdrop dismissal.

5. **Simple (Mostly 1-Page) Webpages**:
   - Lean, responsive single-page applications (SPAs).
   - Lightweight tab navigation with no client-side routing libraries, no virtual DOM overhead, and rapid cold starts.

6. **Clean Layered Architecture (`State -> Ops -> UI`)**:
   - Strictly unidirectional data flow: UI calls Ops, Ops validate & mutate State, State notifies UI subscribers to re-render.
   - Domain logic and data mutations are strictly prohibited inside UI controllers and HTML event handlers.

7. **Document Integrity & Presentation Hygiene**:
   - **Zero hardcoded inline styles** (`style="..."` prohibited in HTML and templates).
   - **Zero inline JavaScript event handlers** (`onclick="..."` prohibited).
   - All styling resides in shared CSS (`common.css`) and app-specific stylesheets.

---

## 2. Directory & Module Structure

Every web application in Constellation follows an identical structural directory pattern:

```text
web-<app-name>/
├── assets/                  # Favicons, logo marks, static graphics
│   └── icon.png
├── css/
│   ├── common.css           # Shared system tokens, buttons, cards, modals, resets
│   └── <app>-styles.css     # App-specific layout, custom views, and component rules
├── vendor/                  # Offline vendored WASM and JS libraries (e.g. zstd-wasm)
├── scripts/
│   ├── app.js               # Application bootstrap and controller lifecycle orchestration
│   ├── globals/             # Authoritative single state manager, settings, local-storage
│   │   ├── <app>-state-manager.js
│   │   ├── local-storage.js
│   │   └── settings.js
│   ├── ops/                 # Pure domain operation modules that mutate state
│   ├── ui/                  # UI controllers binding DOM events and rendering views
│   ├── components/          # Reusable presentation widgets (visualizers, modals, dialogs)
│   └── utils/               # Codecs, serializers, math, canonicalizers
├── README.md                # Project overview, setup instructions, and contribution guidelines
└── index.html               # Semantic HTML shell (no inline styles or scripts)
```

---

## 3. Unidirectional Architecture (`State -> Ops -> UI`)

```
   ┌────────────────────────────────────────────────────────┐
   │                       User Event                       │
   │               (Click, Input, File Drop)                │
   └───────────────────────────┬────────────────────────────┘
                               │
                               ▼
   ┌────────────────────────────────────────────────────────┐
   │                   UI Layer (ui/*.js)                   │
   │  - Listens to DOM events                               │
   │  - Parses form inputs / reads uploaded files           │
   │  - Dispatches calls to Ops layer                       │
   │  - Subscribes to StateManager changes to re-render     │
   └───────────────────────────┬────────────────────────────┘
                               │
                               ▼
   ┌────────────────────────────────────────────────────────┐
   │                  Ops Layer (ops/*.js)                  │
   │  - Pure operation logic & business rules               │
   │  - Input validation, cycle detection, CID checks       │
   │  - Directly mutates authoritative state                │
   │  - Calls stateManager.notifyStateChange()              │
   └───────────────────────────┬────────────────────────────┘
                               │
                               ▼
   ┌────────────────────────────────────────────────────────┐
   │               Globals (globals/*-state.js)             │
   │  - Single authoritative state store                    │
   │  - Notifies registered subscriber listeners            │
   │  - Coordinates automatic snapshot persistence          │
   └───────────────────────────┬────────────────────────────┘
                               │
                               ▼
   ┌────────────────────────────────────────────────────────┐
   │        Local Storage (globals/local-storage.js)        │
   │  - Serializes and stores snapshot to browser storage   │
   │  - Deserializes and restores state on application boot │
   └────────────────────────────────────────────────────────┘
```

### Layer Rules
- **State Store (`globals/`)**: Holds the complete canonical state tree in memory. Exposes `getState()`, `loadState()`, `subscribe(callback)`, and `notifyStateChange()`.
- **Operations (`ops/`)**: Pure business functions. Only Ops are permitted to modify the state properties. Must throw descriptive errors on invalid conditions. Must trigger state change notifications or persistence hooks.
- **UI Controllers (`ui/`)**: Pure presentation and binding controllers. They never directly modify `stateManager.state`. When notified by the state manager, UI controllers read the latest state and update the DOM.

---

## 4. UI Patterns & Styling Guidelines

### 4.1 Common Stylesheet (`css/common.css`)
`common.css` contains all foundational styles:
- **Design Tokens**: Standard light and dark mode CSS variables (`--primary-color`, `--card-bg`, `--text-color`, `--border-color`, `--hover-bg`, `--active-bg`, `--error-color`, `--warn-color`, etc.).
- **Theme Support**: Automatically adapts to `[data-theme="dark"]` on root `<html>`.
- **Base Components**: Button classes (`.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-outline`, `.btn-small`), card containers (`.card`), form controls (`.form-group`, `input`, `select`, `textarea`), table definitions (`.table`), tabs (`.nav-tabs`, `.tab-btn`), badges (`.badge`, `.badge-count`), and modals (`.modal`, `.modal-overlay`, `.modal-content`).

### 4.2 Application-Specific Stylesheet (`css/<app>-styles.css`)
All layouts and rules specific to an application MUST live in a separate stylesheet (e.g., `casey-styles.css`).
- Never overwrite root tokens arbitrarily unless theme-scoped.
- Keep layout flexible using standard Flexbox and Grid.
- Maintain scrollable container boundaries using CSS classes (`.scroll-container`, `.sticky-sidebar`).

### 4.3 Responsive Buttons Pattern: `.btn-icon` and `.btn-text`
All responsive action buttons across Constellation applications MUST follow the dual-span convention:

```html
<button id="btn-action-id" class="btn btn-secondary btn-small" type="button" title="Action Description">
    <span class="btn-icon">📥</span>
    <span class="btn-text">📥 Import Graph</span>
</button>
```

#### How it behaves (defined in `common.css`):
- **Desktop / Wide Viewports**: `.btn-icon` is set to `display: none !important;` while `.btn-text` remains visible with full label text and emoji/symbol.
- **Mobile / Narrow Viewports (`@media (max-width: 900px)` or `< 600px)`**: `.btn-text` is hidden (`display: none !important;`) and `.btn-icon` is displayed (`display: block !important;`), cleanly collapsing buttons into compact square icon buttons without overflowing header bars or toolbars.
- **Rule**: Every `<button>` intended for mobile responsiveness must supply both `<span class="btn-icon">` and `<span class="btn-text">`.

### 4.4 Mobile Tab Bar Navigation Pattern
When viewport width drops below 600px, tab navigation rows automatically collapse into a native mobile select dropdown:

```html
<div class="nav-tabs">
    <select id="app-tab-select" class="nav-tabs-select" aria-label="Select View">
        <option value="learning">Learning</option>
        <option value="capabilities">Capabilities</option>
        <option value="export">Export Assessment</option>
    </select>
    <button id="tab-learning" class="tab-btn active" type="button">Learning</button>
    <button id="tab-capabilities" class="tab-btn" type="button">Capabilities</button>
    <button id="tab-export" class="tab-btn" type="button">Export Assessment</button>
</div>
```
The application tab controller binds change events to both the `.tab-btn` buttons and the `.nav-tabs-select` dropdown to keep active tab state synchronized.

### 4.5 Modals and Dialogs
- Standard modal markup consists of `.modal-overlay`, `.modal-container`, `.modal-header`, `.modal-body`, and `.modal-footer`.
- Use the shared `Dialog` component (`scripts/components/dialog.js`) for confirmations, alert prompts, and input dialogs rather than browser-native `alert()` or `confirm()`.

> **Future Architecture Reminder**: Update modal architecture so all application modals are encapsulated and auto-injected dynamically from inside modal controllers/components (following the pattern in `dialog.js` and `importer.js`) rather than hardcoded in `index.html`. This transition is planned for a future cleanup.

### 4.6 Unified Importer Component
- All data ingestion uses the drop-in `ImporterComponent` (`scripts/components/importer.js`), avoiding scattered file inputs across views.
- **Pipeline: `Importer (with codec) -> StateManager`**:
  - The modal provides a format selector dropdown, a local file picker (`<input type="file">`), and an online URL fetch input.
  - The Importer handles binary decompression via `decodeFile` and passes the parsed payload directly to the StateManager's handler (`loadGraph`, `loadRVR`, `loadCPB`).
  - The StateManager exposes supported file type configurations via `stateManager.getImporterConfigs()`.
  - Global header import buttons and empty hero buttons trigger the Importer with optional pre-selected formats.

---

## 5. Binary Formats & Codecs

All Constellation binary files follow the 6-byte header specification followed by Zstandard-compressed canonical JSON:

```text
Offset 0   3 bytes   ASCII Magic string ("KNW", "RVR", "CPB")
Offset 3   2 bytes   uint16 little-endian protocol version (1 or 2)
Offset 5   1 byte    uint8 compression algorithm (1 = zstd)
Offset 6   ...       zstd-compressed payload (RFC 8785 Canonical JSON)
```

1. **JCS Canonicalization (RFC 8785)**:
   - Object keys are deterministically sorted in UTF-16 code unit order.
   - Whitespace is stripped outside string literals.
   - Numbers follow standard ECMAScript canonical representation.
2. **CID Computation**:
   - `CID = "bafk..."` or hex `sha256` of canonical payload bytes according to component specification.
3. **Codec Reusability**:
   - Shared codec script (`scripts/utils/codec.js`) must cleanly decompress, validate magic and protocol headers, check CID integrity, and extract payload structures into runtime objects.

---

## 6. Offline Persistence Strategy

1. **Deterministic Storage Keys**:
   - `web_curator_lab` for Curator Lab.
   - `web_casey_workspace` for Casey.
2. **Persistence Flow**:
   - Every mutation executed via an `ops/` module triggers `LocalStorageManager.saveState(state)`.
   - On application startup (`app.js`), `LocalStorageManager.loadState()` is checked:
     - If valid saved data exists, `stateManager.loadState(saved)` is called.
     - If empty, default blank state is initialized and rendered.
3. **Clear Workspace Safety**:
   - Provide an explicit confirmation dialog before wiping local storage.
   - Explicit import/export pathways ensure users can backup state to disk anytime.

---

## 7. Quality & Code Hygiene Checklist

- [ ] Zero inline styles (`style="..."`) in HTML files or dynamic template strings.
- [ ] Zero inline JS event attributes (`onclick`, `onchange`, etc.) in HTML.
- [ ] All clickable buttons conform to `<span class="btn-icon">` / `<span class="btn-text">` structure.
- [ ] No direct mutations in UI controllers; all operations route through `ops/`.
- [ ] All operations validate inputs and throw catchable, user-friendly errors.
- [ ] Binary file operations (import/export) validate magic headers, versions, and CID before accepting data.
- [ ] Responsive layouts operate smoothly down to 360px viewport widths.
