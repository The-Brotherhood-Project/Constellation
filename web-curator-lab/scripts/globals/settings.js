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
 * Settings Manager for Web Curator Lab
 * Handles settings state (API key, save-preference, theme),
 * persistence using key 'web_curator_lab_settings', and theme switching.
 */

const SETTINGS_STORAGE_KEY = 'web_curator_lab_settings';

class SettingsManager {
    constructor() {
        this.state = this.getInitialState();
        this.elements = {};
        this.loadSettings();
    }

    getInitialState() {
        return {
            apiKey: '',
            saveApiKey: false,
            darkMode: false,
            favoriteModel: '',
            deleteUnusedBibliographies: false
        };
    }

    /**
     * Load settings from localStorage
     */
    loadSettings() {
        try {
            const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                this.state.saveApiKey = Boolean(parsed.saveApiKey);
                this.state.apiKey = this.state.saveApiKey ? (parsed.apiKey || '') : '';
                this.state.darkMode = Boolean(parsed.darkMode);
                this.state.favoriteModel = parsed.favoriteModel || '';
                this.state.deleteUnusedBibliographies = Boolean(parsed.deleteUnusedBibliographies);
            } else {
                // Check system/html preference for initial dark mode
                const currentTheme = document.documentElement.getAttribute('data-theme');
                if (currentTheme) {
                    this.state.darkMode = (currentTheme === 'dark');
                } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                    this.state.darkMode = true;
                }
            }
        } catch (e) {
            console.error('Failed to load settings:', e);
        }
    }

    /**
     * Save settings to localStorage
     */
    saveSettings() {
        try {
            const dataToSave = {
                saveApiKey: this.state.saveApiKey,
                apiKey: this.state.saveApiKey ? this.state.apiKey : '',
                darkMode: this.state.darkMode,
                favoriteModel: this.state.favoriteModel,
                deleteUnusedBibliographies: this.state.deleteUnusedBibliographies
            };
            localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(dataToSave));
            return true;
        } catch (e) {
            console.error('Failed to save settings:', e);
            return false;
        }
    }

    /**
     * Apply theme to <html> element
     */
    applyTheme() {
        const theme = this.state.darkMode ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        this.updateThemeButtonUI();
    }

    /**
     * Toggle dark mode
     */
    toggleDarkMode() {
        this.state.darkMode = !this.state.darkMode;
        this.applyTheme();
        this.saveSettings();
    }

    /**
     * Initialize UI bindings
     */
    initUI() {
        this.elements = {
            modal: document.getElementById('settingsModal'),
            openBtn: document.getElementById('btn-open-settings'),
            apiKeyInput: document.getElementById('settings-api-key'),
            saveKeyCheckbox: document.getElementById('settings-save-key'),
            themeToggleBtn: document.getElementById('settings-theme-toggle-btn'),
            themeToggleLabel: document.getElementById('settings-theme-toggle-label'),
            saveBtn: document.getElementById('btn-save-settings'),
            favoriteModelInput: document.getElementById('settings-favorite-model'),
            deleteUnusedBibsCheckbox: document.getElementById('settings-delete-unused-bibliographies')
        };

        // Open settings modal button
        if (this.elements.openBtn && this.elements.modal) {
            this.elements.openBtn.addEventListener('click', () => {
                this.openModal();
            });
        }

        // Theme toggle button
        if (this.elements.themeToggleBtn) {
            this.elements.themeToggleBtn.addEventListener('click', () => {
                this.toggleDarkMode();
            });
        }

        // Save settings button
        if (this.elements.saveBtn) {
            this.elements.saveBtn.addEventListener('click', () => {
                this.handleSave();
            });
        }

        // Checkbox toggle changes
        if (this.elements.saveKeyCheckbox) {
            this.elements.saveKeyCheckbox.addEventListener('change', (e) => {
                this.state.saveApiKey = e.target.checked;
            });
        }

        // Apply theme immediately
        this.applyTheme();
    }

    openModal() {
        if (!this.elements.modal) return;

        // Populate fields from state
        if (this.elements.apiKeyInput) {
            this.elements.apiKeyInput.value = this.state.apiKey || '';
        }
        if (this.elements.saveKeyCheckbox) {
            this.elements.saveKeyCheckbox.checked = this.state.saveApiKey;
        }
        if (this.elements.favoriteModelInput) {
            this.elements.favoriteModelInput.value = this.state.favoriteModel || '';
        }
        if (this.elements.deleteUnusedBibsCheckbox) {
            this.elements.deleteUnusedBibsCheckbox.checked = Boolean(this.state.deleteUnusedBibliographies);
        }
        this.updateThemeButtonUI();

        this.elements.modal.classList.add('active');
        this.elements.modal.style.display = 'block';
    }

    closeModal() {
        if (!this.elements.modal) return;
        this.elements.modal.classList.remove('active');
        this.elements.modal.style.display = 'none';
    }

    async handleSave() {
        if (this.elements.apiKeyInput) {
            this.state.apiKey = this.elements.apiKeyInput.value.trim();
        }
        if (this.elements.saveKeyCheckbox) {
            this.state.saveApiKey = this.elements.saveKeyCheckbox.checked;
        }
        if (this.elements.favoriteModelInput) {
            this.state.favoriteModel = this.elements.favoriteModelInput.value.trim();
        }
        if (this.elements.deleteUnusedBibsCheckbox) {
            this.state.deleteUnusedBibliographies = this.elements.deleteUnusedBibsCheckbox.checked;
        }

        this.saveSettings();
        this.closeModal();

        // Recalculate CID if exportUIController is available
        if (typeof window !== 'undefined' && window.exportUIController) {
            try {
                // Skip if the current cid does not exist
                if (window.labStateManager?.state?.rvrMetadata?.cid == null || window.labStateManager?.state?.rvrMetadata?.cid === '') {
                    return;
                }

                const resourcesBlock = window.exportUIController.buildResourcesBlock();
                const { computeCID } = await import('../utils/knw-codec.js');
                const roverlayCid = await computeCID(resourcesBlock);
                if (window.labStateManager?.state?.rvrMetadata) {
                    window.labStateManager.state.rvrMetadata.cid = roverlayCid;
                    if (window.LocalStorageManager) {
                        window.LocalStorageManager.saveState(window.labStateManager.state);
                    }
                    window.labStateManager.notifyStateChange();
                }
            } catch (err) {
                console.error('Failed to recalculate CID on settings change:', err);
            }
        }

        if (window.dialogController) {
            window.dialogController.alert('Settings saved successfully.', 'Settings');
        }
    }

    updateThemeButtonUI() {
        if (!this.elements.themeToggleBtn) return;

        if (this.state.darkMode) {
            this.elements.themeToggleBtn.classList.add('is-dark');
            this.elements.themeToggleBtn.setAttribute('aria-pressed', 'true');
            if (this.elements.themeToggleLabel) {
                this.elements.themeToggleLabel.textContent = 'Dark mode';
            }
        } else {
            this.elements.themeToggleBtn.classList.remove('is-dark');
            this.elements.themeToggleBtn.setAttribute('aria-pressed', 'false');
            if (this.elements.themeToggleLabel) {
                this.elements.themeToggleLabel.textContent = 'Light mode';
            }
        }
    }

    getApiKey() {
        return this.state.apiKey || '';
    }

    getFavoriteModel() {
        return this.state.favoriteModel || '';
    }
}

const settingsManager = new SettingsManager();

if (typeof window !== 'undefined') {
    window.SettingsManager = SettingsManager;
    window.settingsManager = settingsManager;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SettingsManager, settingsManager, SETTINGS_STORAGE_KEY };
}
