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
 * Local Storage Manager for Web Curator Lab
 * Handles offline persistence using key 'web_curator_lab'
 */

const STORAGE_KEY = 'web_curator_lab';

class LocalStorageManager {
    /**
     * Load draft state from localStorage
     * @returns {Object|null}
     */
    static loadState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            console.error('Failed to load state from localStorage:', e);
            return null;
        }
    }

    /**
     * Save current state to localStorage
     * @param {Object} state
     * @returns {boolean}
     */
    static saveState(state) {
        try {
            if (!state) return false;
            const serialized = JSON.stringify({
                metadata: state.metadata || {},
                nodes: state.nodes || {},
                domains: state.domains || {},
                hyperedges: state.hyperedges || {},
                positions: state.positions || {},
                bufferPositions: state.bufferPositions || {},
                rvrMetadata: state.rvrMetadata || {},
                resources: state.resources || { bibliographies: {}, attachments: {} },
                activeTray: state.activeTray || [],
                savedAt: new Date().toISOString()
            });
            localStorage.setItem(STORAGE_KEY, serialized);
            return true;
        } catch (e) {
            console.error('Failed to save state to localStorage:', e);
            return false;
        }
    }

    /**
     * Clear draft from localStorage
     */
    static clearState() {
        try {
            localStorage.removeItem(STORAGE_KEY);
            return true;
        } catch (e) {
            console.error('Failed to clear state from localStorage:', e);
            return false;
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LocalStorageManager, STORAGE_KEY };
} else {
    window.LocalStorageManager = LocalStorageManager;
}
