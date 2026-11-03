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
 * Casey Application Entry Point
 * Only this file is loaded as type="module" (required for the codec ES import).
 * All other scripts are plain window globals loaded via <script src="...">.
 */

import {
    decodeFile,
    encodeCPBV1
} from './utils/codec.js';

// Expose codec functions globally so non-module scripts can call them
window.decodeFile = decodeFile;
window.encodeCPBV1 = encodeCPBV1;

document.addEventListener('DOMContentLoaded', () => {
    // 1. Init settings first (applies theme, wires settings modal)
    if (window.settingsManager) {
        settingsManager.initUI();
    }

    // 2. Init Importer Component
    if (window.ImporterComponent && window.caseyStateManager) {
        window.importerComponent = new ImporterComponent({
            title: 'Import Data',
            triggerButtons: ['#btn-import-graph', '#btn-hero-import-knw', '#btn-hero-cap-import'],
            decodeFile,
            fileTypes: window.caseyStateManager ? caseyStateManager.getImporterConfigs() : []
        });
    }

    // 3. Init UI controllers
    window.navUIController = new NavUIController();
    window.learningUIController = new LearningUIController();
    window.learningUIController.init();
    window.capabilityUIController = new CapabilityUIController();
    window.capabilityUIController.init();
    window.exportUIController = new ExportUIController();

    // 4. Restore saved workspace from localStorage
    const saved = LocalStorageManager.loadState();
    if (saved && saved.graph && Object.keys(saved.graph.nodes || {}).length > 0) {
        caseyStateManager.loadState(saved);
    } else {
        caseyStateManager.notifyStateChange();
    }
});
