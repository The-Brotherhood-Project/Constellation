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
 * Graph Operations for Casey
 * Pure operations for loading and navigating KNW graphs.
 * All mutations go through caseyStateManager.
 */

class GraphOps {
    static loadGraph(knwData) {
        if (!knwData || !knwData.graph) throw new Error('Invalid KNW graph data');

        const nodesMap = {};
        const hyperedgesMap = {};
        if (Array.isArray(knwData.graph.nodes)) {
            for (const node of knwData.graph.nodes) {
                const id = parseInt(node.local_id ?? node.id, 10);
                if (!isNaN(id)) {
                    nodesMap[id] = {
                        local_id: id,
                        title: node.title || `Node ${id}`,
                        description: node.description || '',
                        domain_id: (node.domain_id !== undefined && node.domain_id !== null && node.domain_id !== '')
                            ? parseInt(node.domain_id, 10) : null,
                        assessable: node.assessable === true,
                        prerequisite: node.prerequisite || ''
                    };
                }

                if (node.prerequisite && typeof PrerequisiteUtils !== 'undefined') {
                    try {
                        hyperedgesMap[id] = PrerequisiteUtils.extractPathways(node.prerequisite);
                    } catch (e) {
                        hyperedgesMap[id] = [];
                    }
                } else {
                    hyperedgesMap[id] = [];
                }
            }
        }

        const domainsMap = {};
        if (Array.isArray(knwData.graph.domains)) {
            for (const dom of knwData.graph.domains) {
                const id = parseInt(dom.local_id ?? dom.id, 10);
                if (!isNaN(id)) {
                    domainsMap[id] = {
                        local_id: id,
                        name: dom.name || `Domain ${id}`,
                        description: dom.description || '',
                        parent_id: (dom.parent_id !== undefined && dom.parent_id !== null)
                            ? parseInt(dom.parent_id, 10) : null
                    };
                }
            }
        }

        caseyStateManager.state.graph = {
            metadata: {
                cid: knwData.metadata?.cid || null,
                version_label: knwData.metadata?.version_label || '',
                license: knwData.metadata?.license || { name: 'CC-BY-SA-4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
                copyright: knwData.metadata?.copyright || '',
                created: knwData.metadata?.created || null
            },
            nodes: nodesMap,
            domains: domainsMap,
            hyperedges: hyperedgesMap,
            positions: knwData.positions || {},
            bufferPositions: {}
        };

        GraphOps._reconcileResources();
        LocalStorageManager.saveState(caseyStateManager.state);
        caseyStateManager.notifyStateChange();
    }

    static _reconcileResources() {
        const nodes = caseyStateManager.state.graph.nodes || {};
        const attachments = caseyStateManager.state.resources.attachments || {};
        const unresolved = [];
        for (const [nodeIdStr, attList] of Object.entries(attachments)) {
            const nodeId = parseInt(nodeIdStr, 10);
            if (!nodes[nodeId]) {
                for (const att of attList) {
                    unresolved.push({ ...att, missing_node_id: nodeId });
                }
            }
        }
        caseyStateManager.state.resources.unresolved = unresolved;
    }

    static updateNodePosition(nodeId, pos) {
        if (!caseyStateManager.state.graph.positions) caseyStateManager.state.graph.positions = {};
        caseyStateManager.state.graph.positions[nodeId] = { x: pos.x, y: pos.y };
        LocalStorageManager.saveState(caseyStateManager.state);
    }

    static clearWorkspace() {
        caseyStateManager.resetWorkspace();
        LocalStorageManager.clearState();
    }
}

window.GraphOps = GraphOps;
