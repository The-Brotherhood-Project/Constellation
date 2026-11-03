/**
 * Graph UI Controller
 * Manages the Graph Visualizer tab buttons (reset, randomise, fix, refresh)
 * and coordinates between labStateManager and the tab's GraphController instance.
 * No domain state is stored here.
 */
class GraphUIController {
    init() {
        this._bindButtons();
        this._subscribeToState();
        this._subscribeToTabChange();

        // Graph Controller
        this.graphController = new GraphController({
            showSourceCount: false,
            nodeClickIntercept: this.interceptNodeClick.bind(this),
            unfocusCallback: this._cancelInteractionMode.bind(this),
            nodeContextItems: this._buildNodeContextMenuItems.bind(this),
            domainContextItems: this._buildDomainContextMenuItems.bind(this),
        });

        const container = document.getElementById('graph-container');
        if (!container) return;
        this.graphController.init(labStateManager.state, container);
        
        // Ephemeral interaction mode flags (prerequisite add/remove mode)
        this._addingPrereqFor = null;
        this._removingPrereqFor = null;
    }

    // -------------------------------------------------------------------------
    // Button bindings
    // -------------------------------------------------------------------------

    _bindButtons() {
        this._bind('btn-reset-layout',  () => this.resetLayout());
        this._bind('btn-randomize',     () => this.randomisePositions());
        this._bind('btn-fix-positions', () => this.fixPositions());
        this._bind('btn-refresh-graph', () => this.refreshGraph());

        window.addEventListener('resize', () => {
            if (labStateManager.getActiveTab() === 'graph') {
                this.graphController?.handleResize();
            }
        });
    }

    _bind(id, handler) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', handler);
        else console.warn(`GraphUIController: element #${id} not found`);
    }

    // -------------------------------------------------------------------------
    // Tab actions
    // -------------------------------------------------------------------------

    /**
     * Reset layout: restores buffer positions from permanent node details.
     */
    resetLayout() {
        const state = labStateManager.state;
        const nodes = Object.values(state.nodes || {});
        if (nodes.length === 0) return;

        state.bufferPositions = {};

        const unpositionedNodes = [];
        nodes.forEach(n => {
            const pos = state.positions[n.local_id] || {};
            if (typeof pos?.x === 'number' && typeof pos?.y === 'number'
                && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
                state.bufferPositions[n.local_id] = { x: pos.x, y: pos.y };
            } else {
                unpositionedNodes.push({
                    id: n.local_id,
                    title: n.title || '',
                    domainId: n.domain_id ?? null,
                    prerequisites: n.prerequisite || ''
                });
            }
        });

        if (unpositionedNodes.length > 0 && typeof GraphUtils !== 'undefined' && GraphUtils.generateDefaultPositions) {
            const generated = GraphUtils.generateDefaultPositions(unpositionedNodes, {
                width: 800,
                height: 600,
                layout: 'hierarchical'
            });

            unpositionedNodes.forEach(un => {
                const pos = generated.get(un.id);
                if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
                    state.bufferPositions[un.id] = { x: pos.x, y: pos.y };
                } else {
                    state.bufferPositions[un.id] = { x: 0, y: 0 };
                }
            });
        }

        const positionsMap = new Map();
        Object.entries(state.bufferPositions).forEach(([idStr, pos]) => {
            positionsMap.set(parseInt(idStr, 10), pos);
        });

        this.graphController.updateVisualization(labStateManager.state);
        this.graphController.visualizer?.applyPositions(positionsMap);
    }

    /**
     * Randomise node positions using algorithmic layout into bufferPositions.
     */
    randomisePositions() {
        const state = labStateManager.state;
        const nodes = Object.values(state.nodes || {});
        if (nodes.length === 0) return;

        if (!state.bufferPositions) state.bufferPositions = {};

        const layoutNodes = nodes.map(n => ({
            id: n.local_id,
            title: n.title || '',
            domainId: n.domain_id ?? null,
            prerequisites: n.prerequisite || ''
        }));

        if (typeof GraphUtils !== 'undefined' && GraphUtils.generateDefaultPositions) {
            const newPositions = GraphUtils.generateDefaultPositions(layoutNodes, {
                width: 800,
                height: 600,
                layout: 'hierarchical'
            });

            const positionsMap = new Map();
            layoutNodes.forEach(n => {
                const pos = newPositions.get(n.id);
                if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
                    state.bufferPositions[n.id] = { x: pos.x, y: pos.y };
                    positionsMap.set(n.id, state.bufferPositions[n.id]);
                }
            });

            this.graphController.updateVisualization(labStateManager.state);
            this.graphController.visualizer.applyPositions(positionsMap);
        }
    }

    /**
     * Fix positions: records all buffer positions into permanent node details and persists.
     */
    fixPositions() {
        const state = labStateManager.state;
        const bufferPositions = state.bufferPositions || {};

        if (this.graphController.visualizer?.network) {
            const livePositions = this.graphController.visualizer.network.getPositions();
            if (livePositions) {
                Object.entries(livePositions).forEach(([visId, pos]) => {
                    const parsed = typeof GraphUtils !== 'undefined' ? GraphUtils.parseVisId(visId) : null;
                    if (parsed && parsed.type === 'node' && state.nodes[parsed.id] && pos
                        && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
                        bufferPositions[parsed.id] = { x: pos.x, y: pos.y };
                    }
                });
            }
        }

        // Copy from buffer to permanent position
        Object.entries(state.nodes || {}).forEach(([idStr, _]) => {
            const numId = parseInt(idStr, 10);
            const buf = bufferPositions[numId];
            
            // Create on the spot if not existing
            if (!state.positions[numId]) state.positions[numId] = {};
            const pos = state.positions[numId];
            if (buf && Number.isFinite(buf.x) && Number.isFinite(buf.y)) {
                pos.x = buf.x;
                pos.y = buf.y;
            }
        });

        LocalStorageManager.saveState(state);
    }

    /**
     * Emergency manual refresh: just call updateVisualization.
     */
    refreshGraph() {
        this.graphController.updateVisualization(labStateManager.state);
    }

        // -------------------------------------------------------------------------
    // Prerequisite mode
    // -------------------------------------------------------------------------

    beginAddPrerequisite(nodeId) {
        this._addingPrereqFor = nodeId;
        this._removingPrereqFor = null;
        this._showHelperText('adding');
    }

    beginRemovePrerequisite(nodeId) {
        this._removingPrereqFor = nodeId;
        this._addingPrereqFor = null;
        this._showHelperText('removing');
    }

    interceptNodeClick(event, id) {
        // Add prerequisite mode
        if (this._addingPrereqFor !== null) {
            if (id !== this._addingPrereqFor) {
                this._finishAddPrerequisite(id, event.altKey, event.shiftKey, event.ctrlKey || event.metaKey);
            }
            return true;
        }

        // Remove prerequisite mode
        if (this._removingPrereqFor !== null) {
            if (id !== this._removingPrereqFor) {
                this._finishRemovePrerequisite(id, event.shiftKey, event.ctrlKey || event.metaKey);
            }
            return true;
        }

        return false;
    }

    _finishAddPrerequisite(prereqNodeId, newPathway = false, addToAll = false, propagateChange = false) {
        const targetId = this._addingPrereqFor;
        this._cancelInteractionMode();

        const state = labStateManager.state;
        const node = state.nodes[targetId];
        if (!node) return;

        const pathways = (state.hyperedges[targetId] || []).map(p =>
            Array.isArray(p) ? p : (p instanceof Set ? [...p] : [])
        );

        if (pathways.length < 1) {
            pathways.push([]);
            // Turn off newPathway forcefully because we have already created a new pathway
            // Will be picked up by !newPathway below as index 0
            newPathway = false;
        };

        if (addToAll) {
            pathways.forEach(p => { if (!p.includes(prereqNodeId)) p.push(prereqNodeId) });
        } else if (newPathway === false) {
            // Add to a new single-item pathway (AND'd with existing ones)
            const currentPathway = pathways[this.graphController.visualizer.assignable.highlightedPathways.get(targetId) || 0];
            currentPathway.push(prereqNodeId);
        }

        // Independent from addToAll
        if (newPathway) pathways.push([prereqNodeId]);

        const newPrereq = ExpressionUtils.dnfToExpr(pathways);
        const contextNodes = new Map(Object.entries(labStateManager.state.hyperedges || {})
            .map(([key, value]) => [parseInt(key, 10), value]));
        const simplified = PrerequisiteUtils.simplifyPrerequisite(targetId, newPrereq, contextNodes);

        try {
            GraphOps.updateNode(targetId, { prerequisite: simplified, propagate: propagateChange });
        } catch (e) {
            console.error('Failed to add prerequisite:', e);
        }
    }

    _finishRemovePrerequisite(prereqNodeId, removeFromAll = false, propagateChange = false) {
        const targetId = this._removingPrereqFor;
        this._cancelInteractionMode();

        const state = labStateManager.state;
        if (!state.nodes[targetId]) return;

        const pathways = (state.hyperedges[targetId] || []).map(p =>
            Array.isArray(p) ? p : (p instanceof Set ? [...p] : [])
        );
        if (pathways.length < 1) return;

        if (removeFromAll) {
            pathways.forEach(p => {
                const idx = p.indexOf(prereqNodeId);
                if (idx >= 0) p.splice(idx, 1);
            });
        } else {
            const currentPathway = pathways[this.graphController.visualizer.assignable.highlightedPathways.get(targetId) || 0];
            const idx = currentPathway ? currentPathway.indexOf(prereqNodeId) : -1;
            if (idx < 0) return;
            currentPathway.splice(idx, 1);
        }

        const newPrereq = ExpressionUtils.dnfToExpr(pathways);
        const contextNodes = new Map(Object.entries(labStateManager.state.hyperedges || {})
            .map(([key, value]) => [parseInt(key, 10), value]));
        const simplified = PrerequisiteUtils.simplifyPrerequisite(targetId, newPrereq, contextNodes);

        try {
            GraphOps.updateNode(targetId, { prerequisite: simplified, propagate: propagateChange });
        } catch (e) {
            console.error('Failed to remove prerequisite:', e);
        }
    }

    _cancelInteractionMode() {
        this._addingPrereqFor = null;
        this._removingPrereqFor = null;
        this._showHelperText(null);
    }

    _showHelperText(mode) {
        const adding   = document.getElementById('prerequisite-adding-helper-text');
        const removing = document.getElementById('prerequisite-removing-helper-text');
        if (!adding || !removing) return;

        adding.style.display   = mode === 'adding'   ? '' : 'none';
        removing.style.display = mode === 'removing' ? '' : 'none';
    }

    // -------------------------------------------------------------------------
    // Tab change subscription
    // -------------------------------------------------------------------------

    _subscribeToTabChange() {
        labStateManager.onTabChange(tabName => {
            if (tabName !== 'graph') return;

            this.graphController.updateVisualization(labStateManager.state);
            setTimeout(() => this.graphController.visualizer.fitToView(), 150);
        });
    }

    // -------------------------------------------------------------------------
    // Context menu
    // -------------------------------------------------------------------------

    _buildNodeContextMenuItems(nodeId) {
        const state = labStateManager.state;
        const node = state.nodes[nodeId];
        if (!node) return;

        const hasPrereqs = (state.hyperedges[nodeId] || []).some(p => {
            const arr = p instanceof Set ? [...p] : p;
            return arr.length > 0;
        });

        const items = [
            {
                label: '✏️ Edit Node',
                action: () => {
                    this.graphController.visualizer.assignable.highlightedNodes.clear();
                    this.graphController.visualizer.assignable.highlightedDomains.clear();
                    modalController.openEditNode(node);
                    this.graphController.updateVisualization(labStateManager.state);
                }
            },
            {
                label: '🔗 Add Prerequisite',
                action: () => this.beginAddPrerequisite(nodeId)
            }
        ];

        if (hasPrereqs) {
            items.push({
                label: '✂️ Remove Prerequisite',
                action: () => this.beginRemovePrerequisite(nodeId)
            });
        }

        items.push({
            label: '🔄 Simplify Prerequisite',
            action: () => {
                this.graphController.visualizer.assignable.highlightedNodes.clear();
                this.graphController.visualizer.assignable.highlightedDomains.clear();
                GraphOps.simplifyPrerequisite(nodeId);
                this.graphController.updateVisualization(labStateManager.state);
            }
        });

        items.push({
            label: '🗑️ Delete Node',
            destructive: true,
            action: () => {
                try {
                    GraphOps.deleteNode(nodeId);
                } catch (e) {
                    console.error('Failed to delete node:', e);
                }
            }
        });

        return items;
    }

    _buildDomainContextMenuItems(domainId) {
        const state = labStateManager.state;
        const domain = state.domains[domainId];
        if (!domain) return;

        const isCollapsed = state.collapsedDomains.has(domainId);

        const items = [
            {
                label: '✏️ Edit Domain',
                action: () => {
                    this.graphController.visualizer.assignable.highlightedNodes.clear();
                    this.graphController.visualizer.assignable.highlightedDomains.clear();
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
                label: '🗑️ Delete Domain',
                destructive: true,
                action: () => {
                    try {
                        GraphOps.deleteDomain(domainId);
                    } catch (e) {
                        console.error('Failed to delete domain:', e);
                    }
                }
            }
        ];

        return items;
    }

    // -------------------------------------------------------------------------
    // Helper outside calls
    // -------------------------------------------------------------------------

    updatePathways(nodeId, pathwayLength = 0) {
        const id = parseInt(nodeId, 10);
        const len = parseInt(pathwayLength, 10);
        if (len === 0) {
            // No pathways to highlight
            this.graphController.visualizer.assignable.highlightedPathways.delete(id);
        } else if (len >= 0) {
            const currIdx = this.graphController.visualizer.assignable.highlightedPathways.get(id);
            if (currIdx === null || currIdx === undefined) {
                // There was no pathway selected, but now there is, set to 0
                this.graphController.visualizer.assignable.highlightedPathways.set(id, 0);
            } else if (currIdx >= len) {
                // The current index is out of range, set to last valid index
                this.graphController.visualizer.assignable.highlightedPathways.set(id, len - 1);
            }
            // Else the current index is valid, keep it as is
        }
    }

    // -------------------------------------------------------------------------
    // State subscription
    // -------------------------------------------------------------------------

    _subscribeToState() {
        labStateManager.subscribe(() => {
            if (labStateManager.getActiveTab() !== 'graph') return;
            this.graphController.updateVisualization(labStateManager.state);
        });
    }
}

// Expose globally
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GraphUIController;
} else {
    window.GraphUIController = GraphUIController;
}
