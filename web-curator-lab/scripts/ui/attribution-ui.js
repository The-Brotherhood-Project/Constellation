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
 * Attribution UI Controller
 * Manages the Source Attribution tab UI:
 * - Active Source Tray tab strip and hint banner
 * - Source Discovery modal (Search graph citations + Create new bibliography)
 * - Attribute Source dialog (attaching armed source with fragment start/end)
 * - Manages the secondary GraphController instance for #attribution-graph-container
 * No domain state is stored here.
 */

class AttributionUIController {
    constructor() {
        this.graphController = null;
        this.elements = {};

        // Ephemeral state
        this.selectedTraySourceId = null;

        // AbortController for save requests allows dynamic event listeners to be removed
        this.saveController = null;
    }

    init() {
        this._initElements();
        this._bindEvents();
        this._subscribeToState();
        this._subscribeToTabChange();

        // Initialize dedicated GraphController instance configured for Attribution tab
        this.graphController = new GraphController({
            showSourceCount: true,
            sourceCountCallback: RvrOps?.getSourceCountByNodeId,
            nodeClickIntercept: (event, nodeId) => this.openAttributeSourceModal(nodeId, event.shiftKey),
            unfocusCallback: this._cancelInteractionMode.bind(this),
            nodeContextItems: this._buildNodeContextMenuItems.bind(this),
            domainContextItems: this._buildDomainContextMenuItems.bind(this),
        });
        
        const container = this.elements.graphContainer;
        if (!container) return;
        this.graphController.init(labStateManager.state, container);
    }

    _initElements() {
        this.elements = {
            trayCount:      document.getElementById('attribution-tray-count'),
            trayTabs:       document.getElementById('attribution-tray-tabs'),
            trayList:       document.getElementById('attribution-tray-list'),
            hint:           document.getElementById('attribution-hint'),
            openDiscovery:  document.getElementById('btn-open-source-discovery'),
            deselectBtn:    document.getElementById('btn-deselect-source'),
            graphContainer: document.getElementById('attribution-graph-container'),

            // Modals
            discoveryModal: document.getElementById('sourceDiscoveryModal'),
            attributeModal: document.getElementById('attributeSourceModal'),

            // Discovery Modal Controls
            tabGraph:       document.getElementById('discovery-tab-graph'),
            tabCreate:      document.getElementById('discovery-tab-create'),
            panelGraph:     document.getElementById('discovery-panel-graph'),
            panelCreate:    document.getElementById('discovery-panel-create'),
            citationSearch: document.getElementById('graph-citation-search'),
            citationSort:   document.getElementById('graph-citation-sort'),
            citationResults:document.getElementById('graph-citation-results'),

            // Create Bib Form
            newTitle:       document.getElementById('new-bib-title'),
            newAuthor:      document.getElementById('new-bib-author'),
            newYear:        document.getElementById('new-bib-year'),
            newType:        document.getElementById('new-bib-type'),
            newUrl:         document.getElementById('new-bib-url'),
            btnCreateBib:   document.getElementById('btn-create-bib-submit'),
            btnCancelCreate:document.getElementById('btn-create-bib-cancel'),

            // Attribute Dialog
            attrTargetTitle:document.getElementById('attribute-target-node-title'),
            attrSourceInfo: document.getElementById('attribute-source-info'),
            fragmentStart:  document.getElementById('attribute-fragment-start'),
            fragmentEnd:    document.getElementById('attribute-fragment-end'),
            btnSaveAttr:    document.getElementById('btn-save-attribute-source'),
            btnCancelAttr:  document.getElementById('btn-cancel-attribute-source'),
            btnCloseAttr:   document.getElementById('btn-close-attribute-modal')
        };
    }

    _bindEvents() {
        // Open Source Discovery Modal
        this.elements.openDiscovery?.addEventListener('click', () => {
            this.openSourceDiscoveryModal();
        });

        // Deselect armed source
        this.elements.deselectBtn?.addEventListener('click', () => {
            this.toggleTraySourceSelection(null);
        });

        // Discovery Tabs (Search vs Create)
        this.elements.tabGraph?.addEventListener('click', () => {
            this.switchDiscoveryPanel('graph');
        });
        this.elements.tabCreate?.addEventListener('click', () => {
            this.switchDiscoveryPanel('create');
        });

        // Search & Sort in Discovery Modal
        this.elements.citationSearch?.addEventListener('input', () => {
            this.filterGraphCitations();
        });
        this.elements.citationSort?.addEventListener('change', () => {
            this.filterGraphCitations();
        });

        // Create Bibliography submit/cancel
        this.elements.btnCreateBib?.addEventListener('click', () => {
            this.createBibliography();
        });
        this.elements.btnCancelCreate?.addEventListener('click', () => {
            this.closeSourceDiscoveryModal();
        });

        // Attribute Dialog save/cancel
        this.elements.btnCancelAttr?.addEventListener('click', () => {
            this.closeAttributeSourceModal();
        });
        this.elements.btnCloseAttr?.addEventListener('click', () => {
            this.closeAttributeSourceModal();
        });

        // Close discovery modal via header cross
        const discoveryClose = this.elements.discoveryModal?.querySelector('.modal-header .close');
        discoveryClose?.addEventListener('click', () => {
            this.closeSourceDiscoveryModal();
        });

        window.addEventListener('resize', () => {
            if (labStateManager.getActiveTab() === 'attribution') {
                this.graphController?.handleResize();
            }
        });
    }

    // -------------------------------------------------------------------------
    // Subscriptions
    // -------------------------------------------------------------------------

    _subscribeToTabChange() {
        labStateManager.onTabChange(tabName => {
            if (tabName !== 'attribution') return;

            this.updateAttributionDisplay();
            this.graphController.updateVisualization(labStateManager.state);
            setTimeout(() => this.graphController.visualizer.fitToView(), 150);
        });
    }

    _subscribeToState() {
        labStateManager.subscribe(() => {
            if (labStateManager.getActiveTab() === 'attribution') {
                this.updateAttributionDisplay();
                this.graphController?.updateVisualization();
            }
        });
    }
    
    // -------------------------------------------------------------------------
    // Context Menus
    // -------------------------------------------------------------------------

    _buildNodeContextMenuItems(nodeId) {
        const node = labStateManager.state.nodes[nodeId];
        if (!node) return [];

        return [
            {
                label: '✏️ Edit Node',
                action: () => {
                    this.graphController.visualizer.assignable.highlightedNodes?.clear();
                    this.graphController.visualizer.assignable.highlightedDomains?.clear();
                    modalController.openEditNode(node);
                    this.graphController.updateVisualization(labStateManager.state);
                }
            },
            {
                label: '📋 View Attributions',
                action: () => {
                    this.graphController.visualizer.assignable.highlightedNodes?.clear();
                    this.graphController.visualizer.assignable.highlightedDomains?.clear();
                    modalController.openViewAttributions(nodeId);
                    this.graphController.updateVisualization(labStateManager.state);
                }
            },
            {
                label: '🔍 Find Nearby Citations',
                action: () => {
                    this.graphController.visualizer.assignable.highlightedNodes?.clear();
                    this.graphController.visualizer.assignable.highlightedDomains?.clear();
                    if (this.elements.citationSort) {
                        this.elements.citationSort.value = 'nearby';
                    }
                    this.openSourceDiscoveryModal([parseInt(nodeId, 10)]);
                    this.graphController.updateVisualization(labStateManager.state);
                }
            },
        ];
    }

    _buildDomainContextMenuItems(domainId) {
        const domain = labStateManager.state.domains[domainId];
        if (!domain) return [];

        const isCollapsed = labStateManager.state.collapsedDomains?.has(domainId);

        return [
            {
                label: '✏️ Edit Domain',
                action: () => {
                    this.graphController.visualizer.assignable.highlightedNodes?.clear();
                    this.graphController.visualizer.assignable.highlightedDomains?.clear();
                    modalController.openEditDomain(domain);
                    this.graphController.updateVisualization(labStateManager.state);
                }
            },
            {
                label: isCollapsed ? '📂 Expand Domain' : '📁 Collapse Domain',
                action: () => {
                    if (isCollapsed) {
                        labStateManager.state.collapsedDomains.delete(domainId);
                    } else {
                        labStateManager.state.collapsedDomains.add(domainId);
                    }
                    labStateManager.notifyStateChange();
                }
            },
            {
                label: '🔍 Find Nearby Citations',
                action: () => {
                    this.graphController.visualizer.assignable.highlightedNodes?.clear();
                    this.graphController.visualizer.assignable.highlightedDomains?.clear();
                    const allDomains = Object.values(labStateManager.state.domains || {}).map(d => ({
                        id: parseInt(d.local_id, 10),
                        parentId: d.parent_id != null ? parseInt(d.parent_id, 10) : null
                    }));
                    const allNodes = Object.values(labStateManager.state.nodes || {}).map(n => ({
                        id: parseInt(n.local_id, 10),
                        domainId: n.domain_id != null ? parseInt(n.domain_id, 10) : null
                    }));
                    const targetDomainObj = { id: parseInt(domainId, 10) };
                    const containedNodes = typeof GraphUtils !== 'undefined'
                        ? GraphUtils.getContainedNodes(targetDomainObj, allDomains, allNodes)
                        : allNodes.filter(n => n.domainId === parseInt(domainId, 10));
                    const startNodeIds = containedNodes.map(n => n.id);

                    if (this.elements.citationSort) {
                        this.elements.citationSort.value = 'nearby';
                    }
                    this.openSourceDiscoveryModal(startNodeIds);
                    this.graphController.updateVisualization(labStateManager.state);
                }
            }
        ];
    }

    _cancelInteractionMode() {
        this.selectedTraySourceId = null;
        this.saveController = null;
        this.updateAttributionDisplay();
    }

    // -------------------------------------------------------------------------
    // Tray & Hint Banner Rendering
    // -------------------------------------------------------------------------

    updateAttributionDisplay() {
        const state = labStateManager.state;
        const tray = state.activeTray || [];
        const selectedId = this.selectedTraySourceId;

        // Tray count
        if (this.elements.trayCount) {
            this.elements.trayCount.textContent = String(tray.length);
        }

        // Render Tray tabs
        this.renderTrayTabs(tray, selectedId);

        // Update Hint Banner
        if (this.elements.hint) {
            if (selectedId != null) {
                const bib = (state.resources?.bibliographies || {})[selectedId];
                const title = bib ? bib.title : 'Unknown';
                this.elements.hint.textContent = `Selected source: "${title}". Click any node on the graph to attribute it.`;
                this.elements.hint.classList.add('is-armed');
                this.elements.hint.style.display = 'block';
            } else {
                this.elements.hint.textContent = 'Select a source from the tray, then click a node on the graph to attribute it.';
                this.elements.hint.classList.remove('is-armed');
                this.elements.hint.style.display = tray.length > 0 ? 'block' : 'none';
            }
        }

        // Deselect Button
        if (this.elements.deselectBtn) {
            this.elements.deselectBtn.style.display = selectedId != null ? '' : 'none';
        }
    }

    renderTrayTabs(tray, selectedId) {
        const container = this.elements.trayTabs;
        if (!container) return;

        const max = RvrOps.MAX_TRAY_ITEMS;

        if (!tray || tray.length === 0) {
            container.innerHTML = `<div class="attribution-tab-empty" role="tab" aria-disabled="true">
                No sources in tray yet (0/${max})
            </div>`;
            return;
        }

        container.innerHTML = tray.map(item => {
            const isSelected = item.local_id === selectedId;
            const titleText = item.title || 'Untitled';
            return `
                <div class="attribution-tab ${isSelected ? 'is-selected' : ''}" role="tab" aria-selected="${isSelected}" data-id="${item.local_id}" title="${BibliographyUtils._escapeHtml(titleText)}">
                    <span class="btn-icon">📚</span>
                    <span class="btn-text tab-label">${BibliographyUtils._escapeHtml(titleText)}</span>
                    <button class="tab-remove" type="button" title="Remove from tray" data-id="${item.local_id}">&times;</button>
                </div>
            `;
        }).join('');

        // Bind clicks to tab and remove button
        container.querySelectorAll('.attribution-tab').forEach(tabEl => {
            const id = parseInt(tabEl.dataset.id, 10);
            tabEl.addEventListener('click', (e) => {
                if (e.target.closest('.tab-remove')) return;
                this.toggleTraySourceSelection(id);
            });
        });

        container.querySelectorAll('.tab-remove').forEach(rmBtn => {
            const id = parseInt(rmBtn.dataset.id, 10);
            rmBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.selectedTraySourceId === id) this.selectedTraySourceId = null;
                RvrOps.removeFromActiveTray(id);
            });
        });
    }

    /**
     * Toggle selection of a tray source. Clicking the already-selected item deselects it.
     * If bibId is null, deselect any armed tray source.
     * @param {int | null} bibId
     */
    toggleTraySourceSelection(bibId) {
        const id = parseInt(bibId, 10);
        const tray = labStateManager.state.activeTray || [];
        if (bibId === null || this.selectedTraySourceId === id) {
            this.selectedTraySourceId = null;
        } else if (tray.some(item => item.local_id === id)) {
            // Ensure it exists in the active tray
            this.selectedTraySourceId = id;
        }
        labStateManager.notifyStateChange();
    }

    // -------------------------------------------------------------------------
    // Attribute Source Dialog
    // -------------------------------------------------------------------------

    /**
     * Open the attribute source modal for the given node.
     * If singleUse is true, deselect the tray source after use.
     * @param {int} nodeId The ID of the node clicked
     * @param {boolean} singleUse Whether to deselect the tray source after use
     * @returns {boolean} true if the modal is successfully opened, false otherwise
     */
    openAttributeSourceModal(nodeId, singleUse = false) {
        const node = labStateManager.state.nodes?.[nodeId];
        if (!node) return false;

        if (this.elements.attrTargetTitle) {
            this.elements.attrTargetTitle.textContent = node.title ? `"${node.title}"` : `Node #${nodeId}`;
        }
        if (this.elements.fragmentStart) {
            this.elements.fragmentStart.value = '';
        }
        if (this.elements.fragmentEnd) {
            this.elements.fragmentEnd.value = '';
        }
        if (this.elements.btnSaveAttr) {
            // Clear the event listeners by aborting any pending requests
            if (this.saveController) this.saveController.abort();
            this.saveController = new AbortController();
            // Pass the nodeId dynamically to the save button
            // This lets us skip saving the nodeId as an ephemeral state
            this.elements.btnSaveAttr.addEventListener('click', () => this.saveAttributeSource(nodeId, singleUse), { signal: this.saveController.signal });
        }

        const selectedId = this.selectedTraySourceId;
        const bib = selectedId != null ? labStateManager.state.resources?.bibliographies?.[selectedId] : null;
        if (!bib) return false;

        if (this.elements.attrSourceInfo) {
            const authorYear = [
                bib.author ? BibliographyUtils._escapeHtml(bib.author) : null,
                bib.year ? `(${BibliographyUtils._escapeHtml(String(bib.year))})` : null
            ].filter(Boolean).join(' ');
            this.elements.attrSourceInfo.innerHTML = `
                <div class="attr-title" style="font-weight: bold;">${BibliographyUtils._escapeHtml(bib.title || 'Untitled')}</div>
                ${authorYear ? `<div class="attr-author" style="color: var(--text-muted); font-size: 0.9em;">${authorYear}</div>` : ''}
            `;
        }

        if (this.elements.attributeModal) {
            this.elements.attributeModal.style.display = 'flex';
        }

        // Return true to indicate successful click interception
        return true;
    }

    closeAttributeSourceModal() {
        // Abort any pending save requests
        this.saveController.abort();
        if (this.elements.attributeModal) {
            this.elements.attributeModal.style.display = 'none';
        }
    }

    saveAttributeSource(nodeId, singleUse = false) {
        const selectedBibId = this.selectedTraySourceId;
        // Deselect right away after one use
        if (singleUse) this.selectedTraySourceId = null;

        if (nodeId == null) {
            dialogController?.alert('No target node selected.', 'Attribution');
            return;
        }

        if (selectedBibId == null) {
            dialogController?.alert('Please select a source from the tray above before attributing.', 'No Source Selected');
            return;
        }

        const fragStart = (this.elements.fragmentStart?.value || '').trim();
        const fragEnd = (this.elements.fragmentEnd?.value || '').trim();

        const result = RvrOps.attributeSourceToNode(nodeId, selectedBibId, fragStart, fragEnd);
        this.closeAttributeSourceModal();

        if (!result.ok) {
            dialogController?.alert(result.reason || 'Failed to attribute source.', 'Error');
        }
    }

    // -------------------------------------------------------------------------
    // Source Discovery Modal
    // -------------------------------------------------------------------------

    openSourceDiscoveryModal(centerNodes = null) {
        if (centerNodes != null) {
            this.discoveryCenterNodes = centerNodes;
        } else {
            const highlighted = this.graphController?.visualizer?.assignable?.highlightedNodes;
            this.discoveryCenterNodes = (highlighted && highlighted.size > 0)
                ? Array.from(highlighted)
                : null;
        }

        this.switchDiscoveryPanel('graph');
        this.filterGraphCitations();

        // Clear create form
        if (this.elements.newTitle) this.elements.newTitle.value = '';
        if (this.elements.newAuthor) this.elements.newAuthor.value = '';
        if (this.elements.newYear) this.elements.newYear.value = '';
        if (this.elements.newType) this.elements.newType.value = 'Other';
        if (this.elements.newUrl) this.elements.newUrl.value = '';

        if (this.elements.discoveryModal) {
            this.elements.discoveryModal.style.display = 'flex';
        }
    }

    closeSourceDiscoveryModal() {
        if (this.elements.discoveryModal) {
            this.elements.discoveryModal.style.display = 'none';
        }
        this.discoveryCenterNodes = null;
    }

    switchDiscoveryPanel(panel) {
        this.elements.tabGraph?.classList.toggle('active', panel === 'graph');
        this.elements.tabCreate?.classList.toggle('active', panel === 'create');

        this.elements.panelGraph?.classList.toggle('active', panel === 'graph');
        this.elements.panelCreate?.classList.toggle('active', panel === 'create');

        if (panel === 'graph') {
            this.filterGraphCitations();
        }
    }

    filterGraphCitations() {
        if (!this.elements.citationResults) return;

        const allBibs = RvrOps.getAllBibliographies();
        const query = (this.elements.citationSearch?.value || '').trim();
        const sortKey = this.elements.citationSort?.value || 'alphabetical';

        let nearbyNodeIds = null;
        if (sortKey === 'nearby') {
            const centerNodes = this.discoveryCenterNodes || (
                this.graphController?.visualizer?.assignable?.highlightedNodes &&
                this.graphController.visualizer.assignable.highlightedNodes.size > 0
                    ? Array.from(this.graphController.visualizer.assignable.highlightedNodes)
                    : null
            );

            if (centerNodes && centerNodes.length > 0 && typeof BibliographyUtils !== 'undefined') {
                nearbyNodeIds = BibliographyUtils.bfsNearbyNodes(
                    centerNodes,
                    2,
                    labStateManager.state.hyperedges || {}
                );
            }
        }

        const filtered = typeof BibliographyUtils !== 'undefined'
            ? BibliographyUtils.filterAndSort(allBibs, query, sortKey, nearbyNodeIds)
            : allBibs;

        this.renderGraphCitations(filtered);
    }

    renderGraphCitations(results) {
        const container = this.elements.citationResults;
        if (!container) return;

        const trayIds = new Set((labStateManager.state.activeTray || []).map(i => i.local_id));

        if (!results || results.length === 0) {
            container.innerHTML = '<p class="empty-state">No matching citations found.</p>';
            return;
        }

        container.innerHTML = results.map(bib => {
            const inTray = trayIds.has(bib.local_id);
            const count = bib.count || 0;
            const meta = [
                bib.author ? BibliographyUtils._escapeHtml(bib.author) : null,
                bib.year ? BibliographyUtils._escapeHtml(String(bib.year)) : null,
                BibliographyUtils._escapeHtml(bib.bib_type || 'Other'),
                `used by ${count} node${count === 1 ? '' : 's'}`
            ].filter(Boolean).join(' &middot; ');

            return `
                <div class="discovery-result-item" data-id="${bib.local_id}" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--border-soft); cursor: pointer;">
                    <div class="result-text" style="flex: 1; min-width: 0; padding-right: 12px;">
                        <div class="result-title" style="font-weight: 600;">${BibliographyUtils._escapeHtml(bib.title || 'Untitled')}</div>
                        <div class="result-meta" style="font-size: 0.85em; color: var(--text-muted);">${meta}</div>
                    </div>
                    ${bib.url ? `<a class="btn-secondary btn-small source-link-btn" href="${bib.url}" target="_blank" title="View Source">
                        🔗
                    </a>`: ''}
                    <button class="btn btn-primary btn-small result-add" type="button" ${inTray ? 'disabled' : ''} data-id="${bib.local_id}">
                        <span class="btn-icon">${inTray ? '✓' : '➕'}</span>
                        <span class="btn-text"> ${inTray ? 'In Tray' : 'Add to Tray'}</span>
                    </button>
                </div>
            `;
        }).join('');

        // Row click opens the bibliography details modal
        container.querySelectorAll('.discovery-result-item').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('.result-add')) return;
                const id = parseInt(row.dataset.id, 10);
                const bib = (labStateManager.state.resources?.bibliographies || {})[id];
                if (bib && typeof modalController !== 'undefined') {
                    modalController.openBibliographyDetail(bib);
                }
            });
        });

        container.querySelectorAll('.result-add').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id, 10);
                const added = RvrOps.addToActiveTray(id);
                if (!added) {
                    dialogController?.alert(`Tray is full (max ${RvrOps.MAX_TRAY_ITEMS}). Remove a source first.`, 'Tray Full');
                } else {
                    this.filterGraphCitations();
                }
            });
        });
    }

    createBibliography() {
        const title = (this.elements.newTitle?.value || '').trim();
        if (!title) {
            dialogController?.alert('Title is required to create a bibliography.', 'Validation Error');
            return;
        }

        const bibData = {
            title,
            author: (this.elements.newAuthor?.value || '').trim(),
            year: (this.elements.newYear?.value || '').trim(),
            bib_type: this.elements.newType?.value || 'Other',
            url: (this.elements.newUrl?.value || '').trim()
        };

        const result = RvrOps.createBibliography(bibData);
        if (!result.ok) {
            dialogController?.alert(result.reason || 'Failed to create bibliography.', 'Error');
            return;
        }

        this.closeSourceDiscoveryModal();
    }
}

// Expose globally
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AttributionUIController;
} else {
    window.AttributionUIController = AttributionUIController;
}
