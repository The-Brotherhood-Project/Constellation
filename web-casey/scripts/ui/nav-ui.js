/**
 * Navigation UI Controller for Casey
 * Manages 3-tab navigation: learning, capabilities, export.
 * Keeps desktop tab buttons and mobile select dropdown in sync.
 */

class NavUIController {
    constructor() {
        this.tabSelect = document.getElementById('casey-tab-select');
        this.tabBtns = {
            learning: document.getElementById('tab-btn-learning'),
            capabilities: document.getElementById('tab-btn-capabilities'),
            export: document.getElementById('tab-btn-export')
        };
        this.views = {
            learning: document.getElementById('view-learning'),
            capabilities: document.getElementById('view-capabilities'),
            export: document.getElementById('view-export')
        };
        this.graphLabel = document.getElementById('current-graph-label');
        this.rvrCountBadge = document.getElementById('current-rvr-count-badge');

        this._bindEvents();

        caseyStateManager.subscribe((state) => {
            this._updateContextBar(state);
            this._renderTab(caseyStateManager.getActiveTab());
        });
    }

    _bindEvents() {
        if (this.tabSelect) {
            this.tabSelect.addEventListener('change', (e) => {
                caseyStateManager.setActiveTab(e.target.value);
            });
        }
        for (const [key, btn] of Object.entries(this.tabBtns)) {
            if (btn) btn.addEventListener('click', () => caseyStateManager.setActiveTab(key));
        }
    }

    _renderTab(activeTab) {
        if (this.tabSelect && this.tabSelect.value !== activeTab) {
            this.tabSelect.value = activeTab;
        }
        for (const [key, btn] of Object.entries(this.tabBtns)) {
            if (btn) btn.classList.toggle('active', key === activeTab);
        }
        for (const [key, view] of Object.entries(this.views)) {
            if (view) view.classList.toggle('active', key === activeTab);
        }
    }

    _updateContextBar(state) {
        const meta = state.graph.metadata;
        if (this.graphLabel) {
            this.graphLabel.textContent = meta.version_label || (meta.cid ? 'Untitled Graph' : 'No Graph Loaded');
        }
        if (this.rvrCountBadge) {
            const n = (state.resources.rvrMetadatas || []).length;
            this.rvrCountBadge.textContent = n + ' Overlay' + (n === 1 ? '' : 's');
        }
    }
}

window.NavUIController = NavUIController;
