/*
 * Copyright (C) 2026 The Brotherhood Project Developers
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Learning UI Controller for Casey
 * - Skill Graph visualizer
 * - Displays self-assessment node coloring on the graph
 * - Node click → Node Details & Resources modal
 * - Import is managed by the unified ImporterComponent
 */

class LearningUIController {
    init() {
        this.container = document.getElementById('learning-graph-container');
        this.emptyState = document.getElementById('learning-empty-state');
        this.toolbar = document.getElementById('learning-toolbar');

        // Modal elements
        this.nodeModal = document.getElementById('modal-node-resources');
        this.modalTitle = document.getElementById('modal-node-title');
        this.modalDesc = document.getElementById('modal-node-desc');
        this.modalDomain = document.getElementById('modal-node-domain');
        this.modalPrereqs = document.getElementById('modal-node-prereqs');
        this.modalStatus = document.getElementById('modal-node-status');
        this.modalResourceCount = document.getElementById('modal-resource-count');
        this.modalResourceList = document.getElementById('modal-resource-list');

        this.graphController = new GraphController({
            showSourceCount: true,
            sourceCountCallback: ResourceOps?.getSourceCountByNodeId,
            nodeClickIntercept: (event, nodeId) => {
                this._openNodeModal(nodeId);
                return true;
            }
        });

        if (this.container) {
            this.graphController.init(caseyStateManager.state.graph, this.container);
        }

        this._bindButtons();

        caseyStateManager.subscribe((state) => {
            if (caseyStateManager.getActiveTab() === 'learning') {
                this.render(state);
            }
        });
    }

    _bindButtons() {
        const bind = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', fn);
        };

        bind('btn-learning-fit', () => this.graphController?.visualizer?.network?.fit({ animation: true }));
        bind('btn-clear-workspace', () => this._clearWorkspace());

        // Modal close
        bind('btn-close-resources-modal', () => this._closeNodeModal());
        bind('btn-footer-close-resources', () => this._closeNodeModal());

        // Close modal on overlay click
        if (this.nodeModal) {
            this.nodeModal.addEventListener('click', (e) => {
                if (e.target === this.nodeModal) this._closeNodeModal();
            });
        }
    }

    async _clearWorkspace() {
        const ok = await dialogController.confirm(
            'Clear all loaded graphs, resources, and assessments from current workspace?',
            'Clear Workspace'
        );
        if (ok) GraphOps.clearWorkspace();
    }

    render(state) {
        const hasNodes = Object.keys(state.graph.nodes || {}).length > 0;

        if (this.emptyState) this.emptyState.style.display = hasNodes ? 'none' : 'flex';
        if (this.container) this.container.style.display = hasNodes ? 'block' : 'none';
        if (this.toolbar) this.toolbar.style.display = hasNodes ? 'flex' : 'none';

        if (!hasNodes) return;

        if (this.graphController) {
            // Apply self-assessment highlighting in Learning tab
            if (this.graphController.visualizer) {
                const vis = this.graphController.visualizer;
                vis.assignable.highlightedNodes.clear();

                const assessments = state.selfAssessment?.assessments || {};
                for (const [nodeIdStr, item] of Object.entries(assessments)) {
                    const id = parseInt(nodeIdStr, 10);
                    let group = 0;
                    if (item.status === 'want_to') group = 1;
                    else if (item.status === 'in_progress') group = 2;
                    else if (item.status === 'mastered') group = 3;

                    if (group > 0) {
                        vis.assignable.highlightedNodes.add({ id, group });
                    }
                }
            }

            // Build source count map
            const sourceCounts = new Map();
            for (const [nid, attList] of Object.entries(state.resources.attachments || {})) {
                sourceCounts.set(nid, attList.length);
            }
            this.graphController.updateVisualization(state.graph);
        }
    }

    _openNodeModal(nodeId) {
        const state = caseyStateManager.state;
        const node = state.graph.nodes?.[nodeId];
        if (!node) return;

        if (this.modalTitle) this.modalTitle.textContent = node.title + ' (ID: ' + node.local_id + ')';
        if (this.modalDesc) this.modalDesc.textContent = node.description || 'No description.';
        if (this.modalDomain) {
            const dom = state.graph.domains?.[node.domain_id];
            this.modalDomain.textContent = dom ? dom.name + ' (ID: ' + dom.local_id + ')' : 'None';
        }
        if (this.modalPrereqs) {
            this.modalPrereqs.textContent = node.prerequisite || 'None';
        }

        // Show self-assessment status
        if (this.modalStatus) {
            const assess = state.selfAssessment?.assessments?.[nodeId];
            if (assess) {
                const labels = {
                    want_to: '🎯 Want to Learn',
                    in_progress: '⏳ In Progress',
                    mastered: '✅ Mastered'
                };
                const statusLabel = labels[assess.status] || assess.status;
                const notes = assess.notes ? ` — "${assess.notes}"` : '';
                this.modalStatus.textContent = `${statusLabel}${notes}`;
            } else {
                this.modalStatus.textContent = 'Unassessed';
            }
        }

        // Render attachments
        const attachments = state.resources.attachments?.[nodeId] || [];
        if (this.modalResourceCount) this.modalResourceCount.textContent = String(attachments.length);

        if (this.modalResourceList) {
            if (!attachments.length) {
                this.modalResourceList.innerHTML = '<div class="empty-state">No resources attached to this node.</div>';
            } else {
                this.modalResourceList.innerHTML = attachments.map(att => {
                    const b = state.resources.bibliographies?.[att.source_composite_key];
                    const title = (b && b.title) ? b.title : 'Untitled Resource';
                    const author = (b && b.author) ? b.author : 'Unknown';
                    const year = (b && b.year) ? ' (' + b.year + ')' : '';
                    const urlHtml = (b && b.url)
                        ? '<div><a href="' + BibliographyUtils._constructUrl(b.url) + '" target="_blank" rel="noopener" class="resource-link">Open Resource ↗</a></div>'
                        : '';
                    const rvrTag = att.rvr_cid
                        ? '<span class="context-badge">RVR: ' + att.rvr_cid.slice(0, 8) + '…</span>'
                        : '';
                    const fragHtml = att.fragment
                        ? '<div class="resource-card-meta">Section: <em>' + att.fragment + '</em></div>'
                        : '';
                    const notesHtml = att.notes
                        ? '<div class="resource-card-meta">' + att.notes + '</div>'
                        : '';
                    return '<div class="resource-card">' +
                        '<div class="resource-card-header"><div class="resource-card-title">' + title + year + '</div>' + rvrTag + '</div>' +
                        '<div class="resource-card-meta">By ' + author + '</div>' +
                        fragHtml + notesHtml + urlHtml +
                        '</div>';
                }).join('');
            }
        }

        if (this.nodeModal) {
            this.nodeModal.classList.add('active');
            this.nodeModal.classList.add('show');
            this.nodeModal.style.display = 'flex';
        }
    }

    _closeNodeModal() {
        if (!this.nodeModal) return;
        this.nodeModal.classList.remove('active');
        this.nodeModal.classList.remove('show');
        this.nodeModal.style.display = 'none';
    }

    _escape(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}

window.LearningUIController = LearningUIController;
