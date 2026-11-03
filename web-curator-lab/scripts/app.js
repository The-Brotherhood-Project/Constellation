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
 * Web Curator Lab Application Entry Point
 * Initializes all modular controllers, importer, and restores persistent offline state.
 */

import { encodeKNWV2, encodeRVRV1, decodeFile, computeCID } from './utils/codec.js';

// Expose codec functions globally so non-module scripts can call them
window.decodeFile = decodeFile;
window.encodeKNWV2 = encodeKNWV2;
window.encodeRVRV1 = encodeRVRV1;
window.computeCID = computeCID;

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Settings & Importer Component
    if (window.settingsManager) {
        window.settingsManager.initUI();
    }

    if (window.ImporterComponent) {
        window.importerComponent = new ImporterComponent({
            title: 'Import to Workspace',
            triggerButtons: ['#btn-import-workspace'],
            decodeFile,
            fileTypes: window.labStateManager ? window.labStateManager.getImporterConfigs() : []
        });
    }

    // 2. Initialize UI Controllers
    window.draftUIController = new DraftUIController();
    window.exportUIController = new ExportUIController();
    if (window.aiAssistController) {
        window.aiAssistController.init();
    }
    window.graphUIController = new GraphUIController();
    window.graphUIController.init();
    window.attributionUIController = new AttributionUIController();
    window.attributionUIController.init();

    // 3. Restore saved draft state from localStorage (key: web_curator_lab)
    const saved = LocalStorageManager.loadState();
    if (saved && saved.nodes && Object.keys(saved.nodes).length > 0) {
        labStateManager.loadState(saved);
    } else {
        // Trigger initial render
        labStateManager.notifyStateChange();
    }
});
