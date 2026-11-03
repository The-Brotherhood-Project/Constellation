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
 * Graph Controller
 * Generic visualizer controller for vis.js graph rendering.
 * Handles node/domain/pathway interaction, selection, and context menu rendering.
 * Reusable across both the main Graph Visualizer tab and the Source Attribution tab.
 * No domain state is stored here.
 */

class GraphController {
    /**
     * @param {Object} [options]
     * @param {boolean} [options.showSourceCount=false] - Whether to show source count badge on nodes
     * @param {Function} [options.sourceCountCallback] - Returns a map of nodeId -> source attachment count
     * @param {Function} [options.nodeClickIntercept] - Custom intercept hook for node click (event, nodeId), breaks click early if it returns true
     * @param {Function} [options.domainClickIntercept] - Custom intercept hook for domain click (event, domainId), breaks click early if it returns true
     * @param {Function} [options.unfocusCallback] - Custom callback hook for unfocus (event)
     * @param {Function} [options.buildNodeContextMenuItems] - Function(nodeId) -> Array of menu items
     * @param {Function} [options.buildDomainContextMenuItems] - Function(domainId) -> Array of menu items
     */
    constructor(options = {}) {
        this.visualizer = null;
        this.options = {
            showSourceCount: options.showSourceCount === true,
            sourceCountCallback: options.sourceCountCallback || (options.showSourceCount ? (() => new Map()) : null),
            nodeClickIntercept: options.nodeClickIntercept || (() => false),
            domainClickIntercept: options.domainClickIntercept || (() => false),
            unfocusCallback: options.unfocusCallback || (() => {}),
            nodeContextItems: options.nodeContextItems || (() => []),
            domainContextItems: options.domainContextItems || (() => [])
        };

        this._container = null;
    }

    // -------------------------------------------------------------------------
    // Initialisation
    // -------------------------------------------------------------------------

    /**
     * Create and wire up the GraphVisualizer inside the given container element.
     * @param {HTMLElement} container
     */
    init(state, container) {
        this._container = container;
        // Keeps a reference to the graph state from stateManager
        // Must include nodes, domains, hyperedges, bufferPositions and collapsedDomains as direct properties
        this.state = state;

        this.visualizer = new GraphVisualizer(container, {
            showSourceCount:   this.options.showSourceCount === true,
            onNodeClick:       (event, nodeId) => this._onNodeClick(event, nodeId),
            onPathwayClick:    (edgeData)       => this._onPathwayClick(edgeData),
            onPositionChange:  (nodeId, pos)    => this._onPositionChange(nodeId, pos),
            onDomainClick:     (event, domainId) => this._onDomainClick(event, domainId),
            onUnfocus:         ()               => this._onUnfocus()
        });

        // Initiate all highlighted pathways at 0 if it exists
        for (const [node, pathways] of Object.entries(this.state.hyperedges || {})) {
            if (pathways && pathways.length > 0) {
                this.visualizer.assignable.highlightedPathways.set(parseInt(node, 10), 0);
            }
        }
    }

    // -------------------------------------------------------------------------
    // State → Visualizer adapter
    // -------------------------------------------------------------------------

    /**
     * Ensure all current nodes have a concrete, non-null position in state.bufferPositions.
     */
    _ensureBufferPositions() {
        const state = this.state;
        if (!state.bufferPositions) {
            state.bufferPositions = {};
        }

        const nodes = Object.values(state.nodes || {});
        if (nodes.length === 0) return;

        const activeNodeIds = new Set(nodes.map(n => n.local_id));
        for (const idStr of Object.keys(state.bufferPositions)) {
            const numId = parseInt(idStr, 10);
            if (!activeNodeIds.has(numId)) {
                delete state.bufferPositions[idStr];
            }
        }

        const unpositionedNodes = [];

        nodes.forEach(n => {
            const id = n.local_id;
            const existingBuf = state.bufferPositions[id];
            if (existingBuf && typeof existingBuf.x === 'number' && typeof existingBuf.y === 'number'
                && Number.isFinite(existingBuf.x) && Number.isFinite(existingBuf.y)) {
                return;
            }

            const existingPos = state.positions[id] || {};
            if (typeof existingPos?.x === 'number' && typeof existingPos?.y === 'number'
                && Number.isFinite(existingPos.x) && Number.isFinite(existingPos.y)) {
                state.bufferPositions[id] = { x: existingPos.x, y: existingPos.y };
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
    }

    /**
     * Convert state into the {nodes, cycles, domains} shape
     * expected by GraphVisualizer.updateVisualization().
     * @returns {{ nodes: Array, cycles: Array, domains: Array }}
     */
    _buildGraphState() {
        const state = this.state;
        const collapsedDomains = state.collapsedDomains || new Set();

        this._ensureBufferPositions();

        const nodes = Object.values(state.nodes || {}).map(n => {
            const rawPathways = state.hyperedges[n.local_id] || [];
            const pathways = rawPathways.map(pathway => {
                if (pathway instanceof Set) {
                    return [...pathway].sort((a, b) => a - b);
                }
                return Array.isArray(pathway) ? [...pathway] : [];
            });

            const bufPos = state.bufferPositions[n.local_id];
            const pos = (bufPos && typeof bufPos.x === 'number' && typeof bufPos.y === 'number')
                ? { x: bufPos.x, y: bufPos.y }
                : { x: 0, y: 0 };

            return {
                id:              n.local_id,
                title:           n.title || '',
                pathways,
                position:        pos,
                defaultPosition: { ...pos },
                domainId:        n.domain_id ?? null
            };
        });

        const domains = Object.values(state.domains || {}).map(d => ({
            id:          d.local_id,
            title:       d.title || '',
            parent_id:   d.parent_id ?? null,
            isCollapsed: collapsedDomains.has(d.local_id)
        }));

        return { nodes, cycles: [], domains };
    }

    /**
     * Push current graph state into the visualizer.
     * @param {Object} state - The current state of the graph.
     */
    updateVisualization(state = null) {
        if (!this.visualizer) return;
        // Manually reassign and rebuild if state is provided
        if (state) this.state = state;
        const graphState = this._buildGraphState();

        // Call the callback to build source counts
        let counts = null;
        if (this.options.showSourceCount && this.options.sourceCountCallback) {
            counts = this.options.sourceCountCallback();
        }

        this.visualizer.updateVisualization(graphState, counts);
    }

    // -------------------------------------------------------------------------
    // Visualizer event handlers
    // -------------------------------------------------------------------------

    _onNodeClick(event, nodeId) {
        const id = parseInt(nodeId, 10);

        // Custom hook (e.g. Source Attribution tab node click to open attribute modal)
        if (typeof this.options.nodeClickIntercept === 'function') {
            const handled = this.options.nodeClickIntercept(event, id);
            this.visualizer.clearNodeGroupHighlights(0);
            this.visualizer.assignable.highlightedDomains.clear();
            if (handled) { this.updateVisualization(); return; }
        }

        // Default click selection
        this.visualizer.clearNodeGroupHighlights(0);
        this.visualizer.assignable.highlightedDomains.clear();
        this.visualizer.assignable.highlightedNodes.add(id);

        this._buildContextMenu(event.pageX, event.pageY, this.options.nodeContextItems(id));
        this.updateVisualization();
    }

    _onPathwayClick(edgeData) {
        const { pathways, referenceIndex } = this.visualizer.getUniqueEdgeContribution(edgeData, true);

        if (pathways && pathways.length > 0) {
            const next = pathways[referenceIndex ? (referenceIndex + 1) % pathways.length : 0];
            this.visualizer.assignable.highlightedPathways.set(next.nodeId, next.pathwayIndex);
        }

        this._destroyContextMenu();
        this.updateVisualization();
    }

    _onPositionChange(nodeId, pos) {
        const id = parseInt(nodeId, 10);
        const state = this.state;
        if (!state.bufferPositions) state.bufferPositions = {};
        if (state.nodes[id] && pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
            state.bufferPositions[id] = { x: pos.x, y: pos.y };
        }
    }

    _onDomainClick(event, domainId) {
        const id = parseInt(domainId, 10);

        if (typeof this.options.domainClickIntercept === 'function') {
            const handled = this.options.domainClickIntercept(event, id);
            this.visualizer.clearNodeGroupHighlights(0);
            this.visualizer.assignable.highlightedDomains.clear();
            if (handled) { this.updateVisualization(); return; }
        }

        // Default click selection
        this.visualizer.clearNodeGroupHighlights(0);
        this.visualizer.assignable.highlightedDomains.clear();
        this.visualizer.assignable.highlightedDomains.add(id);

        this._buildContextMenu(event.pageX, event.pageY, this.options.domainContextItems(id));
        this.updateVisualization();
    }

    _onUnfocus() {
        // Custom callback for unfocus event
        if (typeof this.options.unfocusCallback === 'function') {
            this.options.unfocusCallback();
        }
        this.visualizer.clearNodeGroupHighlights(0);
        this.visualizer.assignable.highlightedDomains.clear();
        this._destroyContextMenu();
        this.updateVisualization();
    }

    // -------------------------------------------------------------------------
    // Context menus
    // -------------------------------------------------------------------------

    _buildContextMenu(pageX, pageY, items) {
        this._destroyContextMenu();

        const containerRect = this._container.getBoundingClientRect();
        const x = pageX - containerRect.left - window.scrollX;
        const y = pageY - containerRect.top  - window.scrollY;

        const menu = document.createElement('div');
        menu.className = 'graph-context-menu';
        menu.style.left = `${x}px`;
        menu.style.top  = `${y}px`;

        items.forEach(item => {
            const el = document.createElement('div');
            el.className = 'context-menu-item';
            if (item.destructive) el.classList.add('context-menu-item--destructive');
            el.textContent = item.label;
            el.addEventListener('click', () => {
                this._destroyContextMenu();
                item.action();
            });
            menu.appendChild(el);
        });

        this._container.appendChild(menu);
    }

    _destroyContextMenu() {
        const existing = this._container?.querySelectorAll('.graph-context-menu');
        existing?.forEach(el => el.remove());
    }

    handleResize() {
        if (this.visualizer) this.visualizer.handleResize();
    }
}

// Expose globally
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GraphController;
} else {
    window.GraphController = GraphController;
}
