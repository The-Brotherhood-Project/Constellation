/**
 * Capability UI Controller for Casey
 * - Record selector dropdown
 * - Graph highlight rendering via GraphVisualizer highlightConfigs
 * - Self-assessment node click modal (3-choice + notes)
 * - Capability summary modal
 * - CPB file import with self-assessment detection & merge prompt
 */

class CapabilityUIController {
    init() {
        this.container = document.getElementById('capabilities-graph-container');
        this.emptyState = document.getElementById('capabilities-empty-state');
        this.capabilitySelect = document.getElementById('capability-select');

        // Assessment modal
        this.assessModal = document.getElementById('modal-self-assessment');
        this.assessTitle = document.getElementById('modal-assess-node-title');
        this.assessNotesInput = document.getElementById('assess-notes-input');
        this.assessLastUpdated = document.getElementById('assess-last-updated');

        // Summary modal
        this.summaryModal = document.getElementById('modal-capability-summary');

        this.selectedStatus = 'in_progress';
        this.activeAssessNodeId = null;
        this.graphController = new GraphController({
            showSourceCount: false,
            nodeClickIntercept: (event, nodeId) => {
                if (caseyStateManager.state.capabilities.activeCapabilityId === 'self-assessment') {
                    this._openAssessModal(nodeId);
                    return true;
                }
                return false;
            }
        });
        if(!this.container) return;
        this.graphController.init(caseyStateManager.state.graph, this.container);

        this._bindButtons();

        caseyStateManager.subscribe((state) => {
            this._updateDropdown(state);
            if (caseyStateManager.getActiveTab() === 'capabilities') {
                this.render(state);
            }
        });
    }

    _bindButtons() {
        const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };

        if (this.capabilitySelect) {
            this.capabilitySelect.addEventListener('change', (e) => CapabilityOps.setActive(e.target.value));
        }

        bind('btn-capability-summary', () => this._openSummaryModal());
        bind('btn-capabilities-fit', () => this.graphController?.visualizer?.network?.fit({ animation: true }));

        // Assessment choice buttons
        bind('btn-choice-want', () => this._selectStatus('want_to'));
        bind('btn-choice-progress', () => this._selectStatus('in_progress'));
        bind('btn-choice-mastered', () => this._selectStatus('mastered'));

        bind('btn-assess-save', () => {
            if (this.activeAssessNodeId !== null) {
                const notes = this.assessNotesInput ? this.assessNotesInput.value : '';
                AssessmentOps.setAssessment(this.activeAssessNodeId, this.selectedStatus, notes);
                this._closeAssessModal();
            }
        });
        bind('btn-assess-remove', () => {
            if (this.activeAssessNodeId !== null) {
                AssessmentOps.removeAssessment(this.activeAssessNodeId);
                this._closeAssessModal();
            }
        });
        bind('btn-close-assess-modal', () => this._closeAssessModal());
        bind('btn-close-summary-modal', () => this._closeSummaryModal());
        bind('btn-close-summary-footer', () => this._closeSummaryModal());

        // Modal overlay close
        if (this.assessModal) {
            this.assessModal.addEventListener('click', (e) => { if (e.target === this.assessModal) this._closeAssessModal(); });
        }
        if (this.summaryModal) {
            this.summaryModal.addEventListener('click', (e) => { if (e.target === this.summaryModal) this._closeSummaryModal(); });
        }
    }

    _updateDropdown(state) {
        if (!this.capabilitySelect) return;
        const activeId = state.capabilities.activeCapabilityId;
        const records = state.capabilities.records || [];

        const opts = ['<option value="self-assessment"' + (activeId === 'self-assessment' ? ' selected' : '') + '>🎯 Self-Assessment (Local)</option>'];
        for (const r of records) {
            opts.push('<option value="' + r.id + '"' + (r.id === activeId ? ' selected' : '') + '>📄 ' + r.name + '</option>');
        }
        this.capabilitySelect.innerHTML = opts.join('');
    }

    render(state) {
        const hasNodes = Object.keys(state.graph.nodes || {}).length > 0;

        if (this.emptyState) this.emptyState.style.display = hasNodes ? 'none' : 'flex';
        if (this.container) this.container.style.display = hasNodes ? 'block' : 'none';

        if (!hasNodes) return;

        if (this.graphController) {
            // Apply highlight map
            const highlightMap = CapabilityOps.getActiveHighlightMap();
            if (this.graphController.visualizer) {
                const vis = this.graphController.visualizer;
                vis.assignable.highlightedNodes.clear();
                for (const [nid, group] of Object.entries(highlightMap)) {
                    vis.assignable.highlightedNodes.add({ id: parseInt(nid, 10), group });
                }
            }

            this.graphController.updateVisualization(state.graph);
        }
    }

    _openAssessModal(nodeId) {
        const state = caseyStateManager.state;
        const node = state.graph.nodes?.[nodeId];
        if (!node) return;

        this.activeAssessNodeId = nodeId;
        if (this.assessTitle) this.assessTitle.textContent = 'Assess: ' + node.title;

        const existing = state.selfAssessment.assessments?.[nodeId];
        if (existing) {
            this._selectStatus(existing.status || 'in_progress');
            if (this.assessNotesInput) this.assessNotesInput.value = existing.notes || '';
            if (this.assessLastUpdated) {
                this.assessLastUpdated.textContent = 'Last assessed: ' + new Date(existing.last_updated).toLocaleString();
            }
        } else {
            // Do not select any status
            this._selectStatus(null);
            if (this.assessNotesInput) this.assessNotesInput.value = '';
            if (this.assessLastUpdated) this.assessLastUpdated.textContent = 'Not yet assessed.';
        }

        if (this.assessModal) this.assessModal.classList.add('active');
    }

    _selectStatus(status) {
        this.selectedStatus = status;
        const wantBtn = document.getElementById('btn-choice-want');
        const progBtn = document.getElementById('btn-choice-progress');
        const mastBtn = document.getElementById('btn-choice-mastered');
        if (wantBtn) wantBtn.classList.toggle('selected-want', status === 'want_to');
        if (progBtn) progBtn.classList.toggle('selected-progress', status === 'in_progress');
        if (mastBtn) mastBtn.classList.toggle('selected-mastered', status === 'mastered');
    }

    _closeAssessModal() {
        this.activeAssessNodeId = null;
        if (this.assessModal) this.assessModal.classList.remove('active');
    }

    _openSummaryModal() {
        const state = caseyStateManager.state;
        const activeId = state.capabilities.activeCapabilityId;

        const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };

        if (activeId === 'self-assessment') {
            const count = Object.keys(state.selfAssessment.assessments || {}).length;
            set('summary-issuer-did', 'Self-reported (null)');
            set('summary-user-did', (window.settingsManager && settingsManager.getUserDid()) || '(not set)');
            set('summary-algorithm', 'self-assessment v1.0.0');
            set('summary-graph-cid', state.graph.metadata.cid || 'None');
            set('summary-graph-match', 'Active local graph');
            set('summary-entries-count', count + ' nodes assessed');
            set('summary-timestamps', 'Live working session');
            set('summary-signature', 'Unsigned — Learner claim');
        } else {
            const rec = state.capabilities.records.find(r => r.id === activeId);
            if (!rec) return;
            const meta = rec.metadata || {};
            const activeGraphCid = state.graph.metadata.cid;
            const recCid = meta.graph_data?.cid;
            set('summary-issuer-did', meta.issuer_did || 'Anonymous');
            set('summary-user-did', meta.user_did || 'Unknown');
            set('summary-algorithm', (meta.algorithm_data?.name || '?') + ' v' + (meta.algorithm_data?.version || '?'));
            set('summary-graph-cid', recCid || 'None');
            set('summary-graph-match', (activeGraphCid && recCid === activeGraphCid) ? '✅ Matched' : '⚠️ Different graph version');
            set('summary-entries-count', (rec.capabilities || []).length + ' capabilities');
            set('summary-timestamps', meta.created ? 'Created: ' + new Date(meta.created).toLocaleDateString() : '–');
            set('summary-signature', meta.signature ? 'Signed by issuer' : 'Unsigned');
        }

        if (this.summaryModal) this.summaryModal.classList.add('active');
    }

    _closeSummaryModal() {
        if (this.summaryModal) this.summaryModal.classList.remove('active');
    }
}

window.CapabilityUIController = CapabilityUIController;
