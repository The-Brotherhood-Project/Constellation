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
 * RVR Operations
 * Pure CRUD operations for Bibliographies, Attachments, and the Active Source Tray.
 * Updates labStateManager directly and maintains the backward-reference map on bibliographies.
 * No local state is stored here.
 */

class RvrOps {
    static MAX_TRAY_ITEMS = 6;

    /**
     * Get next available integer local ID for a bibliography.
     * @returns {number}
     */
    static getNextBibId() {
        const bibs = labStateManager.state.resources?.bibliographies || {};
        const ids = Object.keys(bibs).map(k => parseInt(k, 10)).filter(n => !isNaN(n));
        return ids.length > 0 ? Math.max(...ids) + 1 : 1;
    }

    /**
     * Add a bibliography to the active source tray (max 6 items).
     * @param {number} bibId - Bibliography local_id
     * @returns {boolean} True if added, false if full or already in tray
     */
    static addToActiveTray(bibId) {
        const id = parseInt(bibId, 10);
        const state = labStateManager.state;
        const bib = state.resources?.bibliographies?.[id];
        if (!bib) return false;

        if (!Array.isArray(state.activeTray)) state.activeTray = [];

        if (state.activeTray.length >= this.MAX_TRAY_ITEMS) {
            return false;
        }

        if (state.activeTray.some(item => item.local_id === id)) {
            return false; // already in tray
        }

        state.activeTray.push({
            local_id: id,
            title: bib.title || '',
            author: bib.author || '',
            year: bib.year ?? null,
            bib_type: bib.bib_type || 'Other',
            url: bib.url || ''
        });

        LocalStorageManager.saveState(state);
        labStateManager.notifyStateChange();
        return true;
    }

    /**
     * Remove a bibliography from the active tray.
     * If it was the selected source, deselects it.
     * @param {number} bibId
     */
    static removeFromActiveTray(bibId) {
        const id = parseInt(bibId, 10);
        const state = labStateManager.state;
        if (!Array.isArray(state.activeTray)) return;

        const before = state.activeTray.length;
        state.activeTray = state.activeTray.filter(item => item.local_id !== id);

        if (state.activeTray.length !== before) {
            LocalStorageManager.saveState(state);
            labStateManager.notifyStateChange();
        }
    }

    /**
     * Create a new bibliography and automatically add it to the active tray.
     * @param {Object} bibData - { title, author, year, bib_type, url }
     * @returns {{ ok: boolean, bib?: Object, reason?: string }}
     */
    static createBibliography(bibData) {
        const title = (bibData?.title || '').trim();
        if (!title) {
            return { ok: false, reason: 'Title is required to create a bibliography.' };
        }

        const state = labStateManager.state;
        if (!state.resources) state.resources = { bibliographies: {}, attachments: {} };
        if (!state.resources.bibliographies) state.resources.bibliographies = {};

        const localId = this.getNextBibId();
        const yearNum = bibData.year !== '' && bibData.year != null ? parseInt(bibData.year, 10) : null;

        const newBib = {
            local_id: localId,
            title: title,
            author: (bibData.author || '').trim(),
            year: isNaN(yearNum) ? null : yearNum,
            bib_type: (bibData.bib_type || bibData.type || 'Other').trim() || 'Other',
            url: (bibData.url || '').trim(),
            references: [] // Array of node local_ids this bibliography is attached to
        };

        state.resources.bibliographies[localId] = newBib;

        // Try adding to the active tray
        this.addToActiveTray(localId);

        LocalStorageManager.saveState(state);
        labStateManager.notifyStateChange();

        return { ok: true, bib: newBib };
    }

    /**
     * Attribute a bibliography source to a graph node.
     * Updates state.resources.attachments[nodeId] and updates the bibliography's backward-reference map (references).
     * @param {number} nodeId - Target node local_id
     * @param {number} bibId - Bibliography local_id
     * @param {string} fragmentStart - Optional fragment start
     * @param {string} fragmentEnd - Optional fragment end
     * @returns {{ ok: boolean, bib?: Object, reason?: string }}
     */
    static attributeSourceToNode(nodeId, bibId, fragmentStart = '', fragmentEnd = '') {
        const nId = parseInt(nodeId, 10);
        const bId = parseInt(bibId, 10);
        const state = labStateManager.state;

        if (isNaN(nId) || !state.nodes[nId]) {
            return { ok: false, reason: 'Target node not found.' };
        }
        if (isNaN(bId) || !state.resources?.bibliographies?.[bId]) {
            return { ok: false, reason: 'Bibliography source not found.' };
        }

        if (!state.resources.attachments) state.resources.attachments = {};
        if (!Array.isArray(state.resources.attachments[nId])) {
            state.resources.attachments[nId] = [];
        }

        // Look for duplicate
        const attList = state.resources.attachments[nId] || [];
        const idx = attList.findIndex(a =>
            a.bib_id === bId &&
            (a.fragment_start || '') === (fragmentStart || '') &&
            (a.fragment_end || '') === (fragmentEnd || '')
        );
        if (idx >= 0) {
            return { ok: false, reason: 'Exact attribution already exists on this node.' };
        }

        // Add attachment
        attList.push({
            node_id: nId,
            bib_id: bId,
            fragment_start: (fragmentStart || '').trim(),
            fragment_end: (fragmentEnd || '').trim()
        });

        // Maintain the backward reference map on the bibliography
        const bib = state.resources.bibliographies[bId];
        if (!Array.isArray(bib.references)) bib.references = [];
        if (!bib.references.includes(nId)) {
            bib.references.push(nId);
        }

        labStateManager.notifyStateChange();
        return { ok: true, bib };
    }

    /**
     * Remove an attachment from a node and synchronize the bibliography's references map.
     * @param {number} nodeId
     * @param {number} bibId
     * @param {string} fragmentStart
     * @param {string} fragmentEnd
     */
    static removeAttachment(nodeId, bibId, fragmentStart = '', fragmentEnd = '') {
        const nId = parseInt(nodeId, 10);
        const bId = parseInt(bibId, 10);
        const state = labStateManager.state;

        const attList = state.resources?.attachments?.[nId];
        if (!Array.isArray(attList)) return;

        const idx = attList.findIndex(a =>
            a.bib_id === bId &&
            (a.fragment_start || '') === (fragmentStart || '') &&
            (a.fragment_end || '') === (fragmentEnd || '')
        );

        if (idx >= 0) {
            attList.splice(idx, 1);
            if (attList.length === 0) {
                delete state.resources.attachments[nId];
            }

            // Check if any other attachment on nId still references bId
            const stillAttached = (state.resources.attachments[nId] || []).some(a => a.bib_id === bId);
            if (!stillAttached) {
                const bib = state.resources.bibliographies?.[bId];
                if (bib && Array.isArray(bib.references)) {
                    bib.references = bib.references.filter(id => id !== nId);
                }
            }

            LocalStorageManager.saveState(state);
            labStateManager.notifyStateChange();
        }
    }

    /**
     * Get all bibliographies with metadata (e.g. usage count and node references).
     * @returns {Array<Object>} List of bibliographies with count and references
     */
    static getAllBibliographies() {
        const state = labStateManager.state;
        const bibDict = state.resources?.bibliographies || {};
        const attDict = state.resources?.attachments || {};

        return Object.values(bibDict).map(b => {
            const id = b.local_id;
            // Count total attachments across all nodes
            let count = 0;
            const nodeIds = [];
            for (const [nodeIdStr, attList] of Object.entries(attDict)) {
                const nId = parseInt(nodeIdStr, 10);
                const matches = (attList || []).filter(a => a.bib_id === id);
                if (matches.length > 0) {
                    count += matches.length;
                    if (!nodeIds.includes(nId)) nodeIds.push(nId);
                }
            }

            return {
                ...b,
                count,
                references: Array.isArray(b.references) && b.references.length > 0 ? b.references : nodeIds
            };
        });
    }

    /**
     * Delete an entire bibliography.
     * Cleans up all attachments referenced by this bibliography (using references array),
     * removes it from the active tray if present, and deletes it from bibliographies.
     * @param {number} bibId
     * @returns {boolean} Whether the deletion succeeded
     */
    static deleteBibliography(bibId) {
        const bId = parseInt(bibId, 10);
        const state = labStateManager.state;
        const bib = state.resources?.bibliographies?.[bId];
        if (!bib) return false;

        // Clean up attachments across referenced nodes using bib.references
        const referencedNodes = Array.isArray(bib.references) ? [...bib.references] : [];
        if (state.resources?.attachments) {
            for (const nodeId of referencedNodes) {
                const nId = parseInt(nodeId, 10);
                const attList = state.resources.attachments[nId];
                if (Array.isArray(attList)) {
                    state.resources.attachments[nId] = attList.filter(a => a.bib_id !== bId);
                    if (state.resources.attachments[nId].length === 0) {
                        delete state.resources.attachments[nId];
                    }
                }
            }
        }

        // Also remove from active tray if present
        if (Array.isArray(state.activeTray)) {
            state.activeTray = state.activeTray.filter(item => item.local_id !== bId);
        }

        // Delete the bibliography itself
        if (state.resources?.bibliographies) {
            delete state.resources.bibliographies[bId];
        }

        LocalStorageManager.saveState(state);
        labStateManager.notifyStateChange();
        return true;
    }

    /**
     * Get a Map of node ID -> count of active attachments for graph badges (showSourceCount: true).
     * @returns {Map<number, number>}
     */
    static getSourceCountByNodeId() {
        const countMap = new Map();
        const attDict = labStateManager.state.resources?.attachments || {};

        for (const [nodeIdStr, attList] of Object.entries(attDict)) {
            const nodeId = parseInt(nodeIdStr, 10);
            if (Array.isArray(attList) && attList.length > 0) {
                countMap.set(nodeId, attList.length);
            }
        }

        return countMap;
    }
}

// Expose globally
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RvrOps;
} else {
    window.RvrOps = RvrOps;
}
