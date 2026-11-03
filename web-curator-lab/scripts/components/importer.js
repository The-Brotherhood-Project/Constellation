/**
 * Importer Component
 * Reusable modal for selecting file type, choosing local file, or fetching from URL.
 * Automatically injects the importer modal into the document if not present (drop-in like dialog.js).
 * Decodes the payload with knw-codec and invokes the callback for the selected file type.
 */

class ImporterComponent {
    /**
     * @param {Object} options
     * @param {string} [options.title='Import Data']
     * @param {Array<Object>} options.fileTypes - Array of file type configurations:
     *   [{
     *       type: 'knw',
     *       label: 'Knowledge Graph (.knw)',
     *       accept: '.knw',
     *       description: 'Load a complete skill graph and domains.',
     *       callback: async (payload, meta) => { ... }
     *   }]
     * @param {Array<string|HTMLElement>} [options.triggerButtons] - Selectors or elements that open modal
     * @param {Function} [options.decodeFile] - Custom decodeFile function (defaults to window.decodeFile)
     */
    constructor(options = {}) {
        this.options = options;
        this.title = options.title || 'Import Data';
        this.fileTypes = options.fileTypes || [];
        this.decodeFile = options.decodeFile || (typeof window !== 'undefined' ? window.decodeFile : null);

        this.injectModal();
        this.initElements();
        this.populateDropdown();
        this.bindEvents();

        if (Array.isArray(options.triggerButtons)) {
            options.triggerButtons.forEach(btn => this.attachTrigger(btn));
        }
    }

    injectModal() {
        if (document.getElementById('importerModal')) return;

        const modalDiv = document.createElement('div');
        modalDiv.id = 'importerModal';
        modalDiv.className = 'modal';
        modalDiv.style.display = 'none';

        modalDiv.innerHTML = `
            <div class="modal-content importer-modal-content">
                <div class="modal-header">
                    <h2 id="importer-modal-title">${this.title}</h2>
                    <span class="close btn-close-importer" title="Close">&times;</span>
                </div>
                <div class="modal-body">
                    <!-- File Type Selector -->
                    <div class="form-group">
                        <label for="importer-file-type-select"><strong>File Type</strong></label>
                        <select id="importer-file-type-select" class="form-control importer-select"></select>
                        <small id="importer-file-type-desc" class="text-muted importer-desc"></small>
                    </div>

                    <hr class="importer-divider">

                    <!-- Option 1: Local File -->
                    <div class="form-group importer-section">
                        <label for="importer-file-input"><strong>Option A: Local File</strong></label>
                        <div class="importer-row">
                            <input type="file" id="importer-file-input" class="importer-file-input">
                            <button id="btn-importer-load-file" type="button" class="btn btn-primary">
                                <span class="btn-icon">📁</span>
                                <span class="btn-text">Import File</span>
                            </button>
                        </div>
                    </div>

                    <div class="importer-or-divider"><span>OR</span></div>

                    <!-- Option 2: Online URL Fetch -->
                    <div class="form-group importer-section">
                        <label for="importer-url-input"><strong>Option B: Fetch from Online URL</strong></label>
                        <div class="importer-row">
                            <input type="url" id="importer-url-input" class="form-control importer-url-input" placeholder="https://example.com/data.knw">
                            <button id="btn-importer-fetch-url" type="button" class="btn btn-secondary">
                                <span class="btn-icon">🌐</span>
                                <span class="btn-text">Fetch &amp; Import</span>
                            </button>
                        </div>
                    </div>

                    <!-- Inline Status Message -->
                    <div id="importer-status" class="importer-status-msg" style="display: none;"></div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary btn-close-importer">Cancel</button>
                </div>
            </div>
        `;

        document.body.appendChild(modalDiv);
    }

    initElements() {
        this.modal = document.getElementById('importerModal');
        this.typeSelect = document.getElementById('importer-file-type-select');
        this.typeDesc = document.getElementById('importer-file-type-desc');
        this.fileInput = document.getElementById('importer-file-input');
        this.loadFileBtn = document.getElementById('btn-importer-load-file');
        this.urlInput = document.getElementById('importer-url-input');
        this.fetchUrlBtn = document.getElementById('btn-importer-fetch-url');
        this.statusMsg = document.getElementById('importer-status');
        this.cancelBtns = this.modal ? this.modal.querySelectorAll('.btn-close-importer') : [];
    }

    populateDropdown() {
        if (!this.typeSelect) return;
        this.typeSelect.innerHTML = '';

        this.fileTypes.forEach((cfg, idx) => {
            const opt = document.createElement('option');
            opt.value = cfg.type;
            opt.textContent = cfg.label || cfg.type.toUpperCase();
            if (idx === 0) opt.selected = true;
            this.typeSelect.appendChild(opt);
        });

        this.updateSelectedTypeUI();
    }

    updateSelectedTypeUI() {
        const selected = this.getSelectedTypeConfig();
        if (!selected) return;

        if (this.fileInput) {
            this.fileInput.value = '';
            if (selected.accept) {
                this.fileInput.setAttribute('accept', selected.accept);
            } else {
                this.fileInput.removeAttribute('accept');
            }
        }

        if (this.typeDesc) {
            this.typeDesc.textContent = selected.description || '';
        }

        if (this.urlInput) {
            const ext = selected.accept ? selected.accept.split(',')[0] : '';
            this.urlInput.placeholder = `https://example.com/data${ext}`;
        }

        this.hideStatus();
    }

    getSelectedTypeConfig() {
        if (!this.typeSelect) return this.fileTypes[0] || null;
        const val = this.typeSelect.value;
        return this.fileTypes.find(f => f.type === val) || this.fileTypes[0] || null;
    }

    bindEvents() {
        if (this.typeSelect) {
            this.typeSelect.addEventListener('change', () => this.updateSelectedTypeUI());
        }

        if (this.loadFileBtn) {
            this.loadFileBtn.addEventListener('click', () => this.handleLocalImport());
        }

        if (this.fetchUrlBtn) {
            this.fetchUrlBtn.addEventListener('click', () => this.handleUrlImport());
        }

        if (this.cancelBtns) {
            this.cancelBtns.forEach(btn => {
                btn.addEventListener('click', () => this.close());
            });
        }

        if (this.modal) {
            this.modal.addEventListener('click', (e) => {
                if (e.target === this.modal) this.close();
            });
        }

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal && this.modal.style.display !== 'none') {
                this.close();
            }
        });
    }

    attachTrigger(target) {
        let el = null;
        if (typeof target === 'string') {
            el = document.querySelector(target);
        } else if (target && target.nodeType) {
            el = target;
        }

        if (el) {
            el.addEventListener('click', () => {
                const preselectedType = el.getAttribute('data-import-type');
                this.open(preselectedType);
            });
        }
    }

    open(preselectedType = null) {
        if (!this.modal) return;

        if (preselectedType && this.typeSelect) {
            const match = this.fileTypes.find(f => f.type === preselectedType);
            if (match) {
                this.typeSelect.value = preselectedType;
            }
        }

        this.updateSelectedTypeUI();
        if (this.fileInput) this.fileInput.value = '';
        if (this.urlInput) this.urlInput.value = '';
        this.hideStatus();

        this.modal.classList.add('active');
        this.modal.classList.add('show');
        this.modal.style.display = 'flex';
    }

    close() {
        if (!this.modal) return;
        this.modal.classList.remove('active');
        this.modal.classList.remove('show');
        this.modal.style.display = 'none';
        this.hideStatus();
    }

    showStatus(msg, isError = false) {
        if (!this.statusMsg) return;
        this.statusMsg.textContent = msg;
        this.statusMsg.className = 'importer-status-msg ' + (isError ? 'status-error' : 'status-info');
        this.statusMsg.style.display = 'block';
    }

    hideStatus() {
        if (!this.statusMsg) return;
        this.statusMsg.style.display = 'none';
        this.statusMsg.textContent = '';
    }

    async handleLocalImport() {
        const file = this.fileInput?.files?.[0];
        if (!file) {
            this.showStatus('Please select a local file to import.', true);
            return;
        }

        const config = this.getSelectedTypeConfig();
        if (!config || typeof config.callback !== 'function') {
            this.showStatus('No handler configured for this file type.', true);
            return;
        }

        try {
            this.setBusy(true);
            this.showStatus('Reading and decoding file...', false);

            const buffer = await file.arrayBuffer();
            const bytes = new Uint8Array(buffer);

            const decoder = this.options.decodeFile || window.decodeFile;
            if (!decoder) throw new Error('Codec decoder (decodeFile) not initialized.');

            const payload = await decoder(bytes);

            const handled = await config.callback(payload, {
                file,
                filename: file.name,
                bytes,
                type: config.type
            });

            if (handled !== false) {
                this.close();
            }
        } catch (err) {
            console.error('Import error:', err);
            this.showStatus(err.message || 'Failed to import file.', true);
            if (window.dialogController) {
                window.dialogController.alert(err.message, 'Import Error');
            }
        } finally {
            this.setBusy(false);
        }
    }

    async handleUrlImport() {
        const url = this.urlInput ? this.urlInput.value.trim() : '';
        if (!url) {
            this.showStatus('Please enter a valid URL.', true);
            return;
        }

        const config = this.getSelectedTypeConfig();
        if (!config || typeof config.callback !== 'function') {
            this.showStatus('No handler configured for this file type.', true);
            return;
        }

        try {
            this.setBusy(true);
            this.showStatus('Fetching data from remote URL...', false);

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch: HTTP ${response.status} ${response.statusText}`);
            }

            const buffer = await response.arrayBuffer();
            const bytes = new Uint8Array(buffer);

            const decoder = this.options.decodeFile || window.decodeFile;
            if (!decoder) throw new Error('Codec decoder (decodeFile) not initialized.');

            this.showStatus('Decoding remote data...', false);
            const payload = await decoder(bytes);

            const filename = url.split('/').pop().split('?')[0] || `remote-${config.type}`;

            const handled = await config.callback(payload, {
                url,
                filename,
                bytes,
                type: config.type
            });

            if (handled !== false) {
                this.close();
            }
        } catch (err) {
            console.error('Fetch import error:', err);
            this.showStatus(err.message || 'Failed to fetch from URL.', true);
            if (window.dialogController) {
                window.dialogController.alert(err.message, 'Fetch Error');
            }
        } finally {
            this.setBusy(false);
        }
    }

    setBusy(busy) {
        if (this.loadFileBtn) this.loadFileBtn.disabled = busy;
        if (this.fetchUrlBtn) this.fetchUrlBtn.disabled = busy;
        if (this.fileInput) this.fileInput.disabled = busy;
        if (this.urlInput) this.urlInput.disabled = busy;
        if (this.typeSelect) this.typeSelect.disabled = busy;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ImporterComponent };
} else {
    window.ImporterComponent = ImporterComponent;
    window.Importer = ImporterComponent;
}
