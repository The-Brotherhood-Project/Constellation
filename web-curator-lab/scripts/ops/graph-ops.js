/**
 * Graph Operations
 * Pure CRUD operations for Nodes, Domains, and Prerequisite Hyperedges.
 * Updates labStateManager and handles automatic prerequisite reduction and hyperedge derivation.
 *
 * Prerequisite utilities (comparison, mention sync, propagation) live in expression-utils.js.
 */
class GraphOps {
    /**
     * Get next available integer local ID for a node
     */
    static getNextNodeId() {
        const nodes = labStateManager.state.nodes || {};
        const ids = Object.keys(nodes).map(k => parseInt(k, 10)).filter(n => !isNaN(n));
        return ids.length > 0 ? Math.max(...ids) + 1 : 1;
    }

    /**
     * Get next available integer local ID for a domain
     */
    static getNextDomainId() {
        const domains = labStateManager.state.domains || {};
        const ids = Object.keys(domains).map(k => parseInt(k, 10)).filter(n => !isNaN(n));
        return ids.length > 0 ? Math.max(...ids) + 1 : 1;
    }

    /**
     * Add a new node to the graph
     * @param {Object} nodeData { local_id, title, description, domain_id, prerequisite, assessable, x, y }
     */
    static addNode(nodeData) {
        const localId = parseInt(nodeData.local_id ?? nodeData.id, 10) || this.getNextNodeId();
        if (labStateManager.state.nodes[localId]) {
            throw new Error(`Node with ID ${localId} already exists`);
        }

        const domainId = nodeData.domain_id !== undefined && nodeData.domain_id !== null && nodeData.domain_id !== ''
            ? parseInt(nodeData.domain_id, 10)
            : null;

        if (domainId !== null && !labStateManager.state.domains[domainId]) {
            throw new Error(`Domain with ID ${domainId} does not exist`);
        }

        const prerequisiteStr = (nodeData.prerequisite || '').trim();

        const newNode = {
            local_id: localId,
            title: (nodeData.title || `Node ${localId}`).trim(),
            description: (nodeData.description || '').trim(),
            prerequisite: prerequisiteStr,
            mentions: Array.isArray(nodeData.mentions) ? nodeData.mentions : [],
            domain_id: domainId,
            //x: typeof nodeData.x === 'number' ? nodeData.x : 0,
            //y: typeof nodeData.y === 'number' ? nodeData.y : 0,
            assessable: nodeData.assessable !== false
        };

        labStateManager.state.nodes[localId] = newNode;

        // Sync prerequisite & hyperedges (also updates mentions)
        this.syncPrerequisite(localId, prerequisiteStr);

        labStateManager.notifyStateChange();
        return newNode;
    }

    /**
     * Update an existing node.
     * Supports changing local_id, title, description, domain_id, prerequisite, assessable, x, y.
     * Pass propagate: true to re-simplify downstream mentions when the prerequisite changes.
     * @param {number} localId - current ID of the node to update
     * @param {Object} patchData
     */
    static updateNode(localId, patchData) {
        const id = parseInt(localId, 10);
        const node = labStateManager.state.nodes[id];
        if (!node) {
            throw new Error(`Node with ID ${id} not found`);
        }

        // --- ID change ---
        if (patchData.local_id !== undefined) {
            const newId = parseInt(patchData.local_id, 10);
            if (!isNaN(newId) && newId !== id) {
                this.changeNodeId(id, newId);
                // changeNodeId calls notifyStateChange internally and handles prerequisites.
                // Apply any remaining non-id patches to the renamed node.
                const remaining = { ...patchData };
                delete remaining.local_id;
                if (Object.keys(remaining).length > 0) {
                    this.updateNode(newId, remaining);
                }
                return labStateManager.state.nodes[newId];
            }
        }

        if (patchData.title !== undefined) {
            node.title = (patchData.title || '').trim();
        }

        if (patchData.description !== undefined) {
            node.description = (patchData.description || '').trim();
        }

        if (patchData.domain_id !== undefined) {
            const domainId = patchData.domain_id !== null && patchData.domain_id !== ''
                ? parseInt(patchData.domain_id, 10)
                : null;
            if (domainId !== null && !labStateManager.state.domains[domainId]) {
                throw new Error(`Domain with ID ${domainId} does not exist`);
            }
            node.domain_id = domainId;
        }

        if (patchData.assessable !== undefined) {
            node.assessable = Boolean(patchData.assessable);
        }

        // if (typeof patchData.x === 'number') node.x = patchData.x;
        // if (typeof patchData.y === 'number') node.y = patchData.y;

        if (patchData.prerequisite !== undefined) {
            const newPrereqStr = (patchData.prerequisite || '').trim();
            const oldPrereqStr = node.prerequisite || '';
            this.syncPrerequisite(id, newPrereqStr, oldPrereqStr);

            if (patchData.propagate === true) {
                this.propagatePrerequisiteChange(id);
            }
        }

        labStateManager.notifyStateChange();
        return node;
    }

    /**
     * Change a node's local_id. Rewrites all prerequisite expressions in the graph
     * that reference the old ID, updates hyperedge keys, domain_id refs (if any node references
     * its own domain incorrectly — normally n/a), and mention arrays.
     * 
     * node will simply be deleted if newId is left null
     * @param {number} oldId
     * @param {number} newId
     */
    static changeNodeId(oldId, newId = null) {
        const state = labStateManager.state;

        if (!state.nodes[oldId]) {
            throw new Error(`Node with ID ${oldId} not found`);
        }
        if (newId !== null && state.nodes[newId]) {
            throw new Error(`Node with ID ${newId} already exists`);
        }

        // 1. Move the node record to the new key, updating its local_id field
        const node = state.nodes[oldId];
        const mentions = node.mentions || [];
        const pres = ExpressionUtils.extractNodeIds(node.prerequisite || '');
        if (newId !== null) {
            node.local_id = newId;
            state.nodes[newId] = node;
        }
        delete state.nodes[oldId];

        // 2. Move hyperedge record
        if (state.hyperedges[oldId] !== undefined) {
            if (newId !== null) {
                state.hyperedges[newId] = state.hyperedges[oldId];
            }
            delete state.hyperedges[oldId];
        }

        // 3. Update all nodes that reference oldId in their prerequisite (stored in mentions array)
        for (const n of mentions) {
            // Rewrite the hyperedge sets for this node — replace oldId with newId in each pathway
            const pathways = state.hyperedges[n.local_id];
            if (Array.isArray(pathways)) {
                state.hyperedges[n.local_id] = pathways.map(pathway => {
                    if (pathway instanceof Set) {
                        const s = new Set(pathway);
                        if (s.has(oldId)) { s.delete(oldId); if (newId !== null) { s.add(newId); } }
                        return s;
                    }
                    // Array fallback
                    if (newId === null) {
                        return pathway.filter(id => id !== oldId);
                    } else {
                        return pathway.map(id => id === oldId ? newId  : id);
                    }
                });
            }

            // Generate the prerequisite string from the new dnf pathways
            n.prerequisite = ExpressionUtils.dnfToExpr(pathways);
        }

        // 4. Update all nodes that reference oldId in their mentions array (stored in pres array)
        for (const n of pres) {
            const idx = n.mentions.indexOf(oldId);
            if (idx !== -1) {
                if (newId === null) {
                    n.mentions.splice(idx, 1);
                } else {
                    n.mentions[idx] = newId;
                }
            }
        }

        labStateManager.notifyStateChange();
    }

    /**
     * Change a domain's local_id. Updates all references in nodes (domain_id) and
     * in other domains (parent_id).
     * 
     * domain will simply be disbanded (without its contents deleted) if newId is left null
     * @param {number} oldId
     * @param {number} newId
     */
    static changeDomainId(oldId, newId = null) {
        const state = labStateManager.state;

        if (!state.domains[oldId]) {
            throw new Error(`Domain with ID ${oldId} not found`);
        }
        if (newId !== null && state.domains[newId]) {
            throw new Error(`Domain with ID ${newId} already exists`);
        }

        // 1. Move domain record
        const domain = state.domains[oldId];
        const parentId = domain.parent_id;
        if (newId !== null) {
            domain.local_id = newId;
            state.domains[newId] = domain;
        }
        delete state.domains[oldId];

        // 2. Update nodes that belonged to old domain
        for (const n of Object.values(state.nodes)) {
            // Update domain_id to newId, or set it to grandparent if newId is null (deletion)
            if (n.domain_id === oldId) n.domain_id = newId !== null ? newId : parentId;
        }

        // 3. Update subdomains that had oldId as parent
        for (const d of Object.values(state.domains)) {
            // Update parent_id to newId, or set it to grandparent if newId is null (deletion)
            if (d.parent_id === oldId) d.parent_id = newId !== null ? newId : parentId;
        }

        labStateManager.notifyStateChange();
    }

    /**
     * Delete a node from the graph and clean up any dependent references
     * 
     * LEGACY METHOD, DO NOT USE
     * @param {number} localId 
     */
    static deleteNode(localId) {
        const id = parseInt(localId, 10);
        if (!labStateManager.state.nodes[id]) {
            return false;
        }

        delete labStateManager.state.nodes[id];
        delete labStateManager.state.hyperedges[id];

        // Clean up dependent prerequisites and mentions across remaining nodes
        const state = labStateManager.state;
        for (const node of Object.values(state.nodes)) {
            // Remove from mentions
            if (Array.isArray(node.mentions)) {
                node.mentions = node.mentions.filter(mId => mId !== id);
            }

            // If deleted node was in pathways, re-sync prerequisite
            const pathways = state.hyperedges[node.local_id] || [];
            const containsDeleted = pathways.some(p => {
                if (p instanceof Set) return p.has(id);
                return Array.isArray(p) && p.includes(id);
            });
            if (containsDeleted) {
                const updatedPathways = pathways
                    .map(p => {
                        if (p instanceof Set) { const s = new Set(p); s.delete(id); return s; }
                        return p.filter(reqId => reqId !== id);
                    })
                    .filter(p => (p instanceof Set ? p.size > 0 : p.length > 0));

                if (typeof ExpressionUtils !== 'undefined' && ExpressionUtils.dnfToExpr) {
                    const asArrays = updatedPathways.map(p => p instanceof Set ? Array.from(p) : p);
                    const oldPrereq = node.prerequisite;
                    node.prerequisite = asArrays.length > 0 ? ExpressionUtils.dnfToExpr(asArrays) : '';
                    state.hyperedges[node.local_id] = updatedPathways;
                    // Sync mentions after prerequisite change
                    this.syncMentions(node.local_id, node.prerequisite, oldPrereq);
                } else {
                    node.prerequisite = '';
                    state.hyperedges[node.local_id] = [];
                }
            }
        }

        labStateManager.notifyStateChange();
        return true;
    }

    /**
     * Add a domain
     * @param {Object} domainData { local_id, title, description, parent_id }
     */
    static addDomain(domainData) {
        const localId = parseInt(domainData.local_id ?? domainData.id, 10) || this.getNextDomainId();
        if (labStateManager.state.domains[localId]) {
            throw new Error(`Domain with ID ${localId} already exists`);
        }

        const parentId = domainData.parent_id !== undefined && domainData.parent_id !== null && domainData.parent_id !== ''
            ? parseInt(domainData.parent_id, 10)
            : null;

        if (parentId !== null && parentId === localId) {
            throw new Error('A domain cannot be its own parent');
        }

        if (parentId !== null && !labStateManager.state.domains[parentId]) {
            throw new Error(`Parent domain with ID ${parentId} does not exist`);
        }

        const title = (domainData.title || domainData.name || `Domain ${localId}`).trim();
        const description = (domainData.description || '').trim();

        const domain = {
            local_id: localId,
            title: title,
            description: description,
            parent_id: parentId
        };

        labStateManager.state.domains[localId] = domain;
        labStateManager.notifyStateChange();
        return domain;
    }

    /**
     * Update an existing domain.
     * Supports changing local_id (ID rename with full reference update).
     * @param {number} localId 
     * @param {Object} patchData 
     */
    static updateDomain(localId, patchData) {
        const id = parseInt(localId, 10);
        const domain = labStateManager.state.domains[id];
        if (!domain) {
            throw new Error(`Domain with ID ${id} not found`);
        }

        // --- ID change ---
        if (patchData.local_id !== undefined) {
            const newId = parseInt(patchData.local_id, 10);
            if (!isNaN(newId) && newId !== id) {
                this.changeDomainId(id, newId);
                const remaining = { ...patchData };
                delete remaining.local_id;
                if (Object.keys(remaining).length > 0) {
                    this.updateDomain(newId, remaining);
                }
                return labStateManager.state.domains[newId];
            }
        }

        if (patchData.title !== undefined) {
            domain.title = (patchData.title || '').trim();
        }
        if (patchData.name !== undefined) {
            domain.title = (patchData.name || '').trim();
        }
        if (patchData.description !== undefined) {
            domain.description = (patchData.description || '').trim();
        }

        if (patchData.parent_id !== undefined) {
            const parentId = patchData.parent_id !== null && patchData.parent_id !== ''
                ? parseInt(patchData.parent_id, 10)
                : null;

            if (parentId !== null && parentId === id) {
                throw new Error('A domain cannot be its own parent');
            }
            if (parentId !== null && !labStateManager.state.domains[parentId]) {
                throw new Error(`Parent domain with ID ${parentId} does not exist`);
            }
            domain.parent_id = parentId;
        }

        labStateManager.notifyStateChange();
        return domain;
    }

    /**
     * Simplify a node's prerequisite and update and sync its prerequisite
     * @param {number} nodeId - node ID
     * @returns {string | null} simplified prerequisite expression
     */
    static simplifyPrerequisite(nodeId) {
        const node = labStateManager.state.nodes[nodeId];
        if (!node) return null;

        const expr = node.prerequisite || '';
        const contextNodes = new Map(Object.entries(labStateManager.state.hyperedges || {})
            .map(([key, value]) => [parseInt(key), value]));
        const simplifiedExpr = PrerequisiteUtils.simplifyPrerequisite(nodeId, expr, contextNodes);
        if (PrerequisiteUtils.prereqsEqual(expr, simplifiedExpr)) return expr;
        node.prerequisite = simplifiedExpr;
        this.syncPrerequisite(nodeId, simplifiedExpr, expr);
        return simplifiedExpr;
    }

    /**
     * Delete a domain including all its contents
     * For just disbanding a domain without deleting its contents, use changeDomainId with null as newId
     * @param {number} localId 
     */
    static deleteDomain(localId) {
        const id = parseInt(localId, 10);
        const { nodes, domains } = labStateManager.state;

        const domain = domains[id];
        if (!domain) throw new Error(`Domain with ID ${id} not found`);

        const childNodes = Object.values(nodes).filter(node => node.domain_id === id);
        const childDomains = Object.values(domains).filter(d => d.parent_id === id);

        // Delete the target domain
        this.changeDomainId(id, null);

        // Delete the child nodes and recurse through the nested domains
        childNodes.forEach(node => this.changeNodeId(node.local_id, null));
        childDomains.forEach(domain => this.deleteDomain(domain.local_id));

        labStateManager.notifyStateChange();
    }

    /**
     * Synchronize a node's prerequisite string, hyperedges, and mentions.
     * @param {number} nodeId 
     * @param {string} newPrereqExpr - new prerequisite expression
     * @param {string} oldPrereqExpr - previous expression (for mention cleanup); defaults to current node value
     */
    static syncPrerequisite(nodeId, newPrereqExpr, oldPrereqExpr) {
        const state = labStateManager.state;
        const node = state.nodes[nodeId];
        if (!node) return;

        const oldExpr = oldPrereqExpr !== undefined ? oldPrereqExpr : (node.prerequisite || '');
        const expr = (newPrereqExpr || '').trim();

        if (!expr) {
            const prev = node.prerequisite || '';
            node.prerequisite = '';
            state.hyperedges[nodeId] = [];
            // Remove visualizer's highlighted pathway by telling it that there are no pathways
            graphUIController.updatePathways(nodeId, 0);
            if (typeof PrerequisiteUtils !== 'undefined') {
                this.syncMentions(nodeId, '', prev);
            }
            return;
        }

        try {
            if (typeof PrerequisiteUtils !== 'undefined') {
                const contextNodes = new Map();
                for (const [k, v] of Object.entries(state.hyperedges)) {
                    const nid = parseInt(k, 10);
                    if (nid !== nodeId) {
                        contextNodes.set(nid, v || []);
                    }
                }

                const simplified = PrerequisiteUtils.simplifyPrerequisite(nodeId, expr, contextNodes);
                node.prerequisite = simplified;
                const pathways = simplified ? PrerequisiteUtils.extractPathways(simplified) : [];

                // Tell the visualiser the new pathway length so that it can adjust its highlight index
                graphUIController.updatePathways(nodeId, pathways.length);

                state.hyperedges[nodeId] = pathways;
                this.syncMentions(nodeId, simplified, oldExpr);
            } else {
                node.prerequisite = expr;
                state.hyperedges[nodeId] = [];
            }
        } catch (err) {
            console.warn(`Prerequisite parsing warning for node ${nodeId}:`, err.message);
            node.prerequisite = expr;
            state.hyperedges[nodeId] = [];
        }
    }

    /**
     * Update the mentions arrays on the nodes referenced by a node's prerequisites.
     * Call this whenever a node's prerequisite expression changes.
     * @param {number} nodeId - the node whose prerequisite changed
     * @param {string} newPrereq
     * @param {string} oldPrereq
     */
    static syncMentions(nodeId, newPrereq, oldPrereq) {
        const state = labStateManager.state;
        // Remove this node from old referenced nodes' mentions
        if (oldPrereq && oldPrereq.trim()) {
            const oldIds = ExpressionUtils.extractNodeIds(oldPrereq);
            for (const refId of oldIds) {
                const refNode = state.nodes[refId];
                if (refNode && Array.isArray(refNode.mentions)) {
                    refNode.mentions = refNode.mentions.filter(m => m !== nodeId);
                }
            }
        }
        // Add this node to new referenced nodes' mentions
        if (newPrereq && newPrereq.trim()) {
            const newIds = ExpressionUtils.extractNodeIds(newPrereq);
            for (const refId of newIds) {
                const refNode = state.nodes[refId];
                if (refNode) {
                    if (!Array.isArray(refNode.mentions)) refNode.mentions = [];
                    if (!refNode.mentions.includes(nodeId)) refNode.mentions.push(nodeId);
                }
            }
        }
    }

    /**
     * Propagate a prerequisite change from nodeId upward through the mentions chain.
     * For every node that mentions nodeId, re-simplify its prerequisite.
     * If the result is DNF-equal to the old one, abort that branch early.
     * Recurses on any node whose prerequisite actually changed.
     * 
     * IMPORTANT: call this AFTER the triggering node's hyperedge is already updated.
     * 
     * @param {number} nodeId - the node whose prerequisite or hyperedge just changed
     * @param {Set<number>} [visited] - used internally to prevent infinite loops
     */
    static propagatePrerequisiteChange(nodeId, visited = new Set()) {
        const state = labStateManager.state;
        if (visited.has(nodeId)) return;
        visited.add(nodeId);

        const triggerNode = state.nodes[nodeId];
        if (!triggerNode || !Array.isArray(triggerNode.mentions) || triggerNode.mentions.length === 0) return;

        for (const mentionerNodeId of triggerNode.mentions) {
            const mentionerNode = state.nodes[mentionerNodeId];
            if (!mentionerNode) continue;

            const oldPrereq = mentionerNode.prerequisite || '';

            // Re-simplify the mentioner's existing prerequisite against updated context
            try {
                const contextNodes = new Map();
                for (const [k, v] of Object.entries(state.hyperedges)) {
                    const nid = parseInt(k, 10);
                    if (nid !== mentionerNodeId) {
                        contextNodes.set(nid, v || []);
                    }
                }

                const newPrereq = PrerequisiteUtils.simplifyPrerequisite(mentionerNodeId, oldPrereq, contextNodes);

                // Compare via DNF — abort branch if nothing changed
                if (PrerequisiteUtils.prereqsEqual(oldPrereq, newPrereq)) continue;

                // Apply the change
                const oldMentions = [...(mentionerNode.mentions || [])];
                mentionerNode.prerequisite = newPrereq;
                state.hyperedges[mentionerNodeId] = newPrereq ? PrerequisiteUtils.extractPathways(newPrereq) : [];

                // Sync mentions for the changed prerequisite
                // Hyperarcs are manually updated above (calling syncPrerequisite here is clumsy)
                this.syncMentions(mentionerNodeId, newPrereq, oldPrereq);

                // Recurse — but only if the mentions chain continues
                this.propagatePrerequisiteChange(mentionerNodeId, visited);
            } catch {
                // Parsing error means this mentioner's prereq can't be re-evaluated — skip
                continue;
            }
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GraphOps };
} else {
    window.GraphOps = GraphOps;
}