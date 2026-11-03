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
 * Settings Manager for Casey
 * Manages theme (dark/light) and user DID profile.
 * Persistence key: 'web_casey_settings'
 */

const CASEY_SETTINGS_KEY = 'web_casey_settings';

class CaseySettingsManager {
    constructor() {
        this.state = this.getInitialState();
        this.elements = {};
        this.loadSettings();
        this.applyTheme();
    }

    getInitialState() {
        return {
            darkMode: false,
            userDid: ''
        };
    }

    loadSettings() {
        try {
            const raw = localStorage.getItem(CASEY_SETTINGS_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                this.state.darkMode = Boolean(parsed.darkMode);
                this.state.userDid = parsed.userDid || '';
            } else {
                const currentTheme = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : null;
                if (currentTheme) {
                    this.state.darkMode = (currentTheme === 'dark');
                } else if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                    this.state.darkMode = true;
                }
            }
        } catch (e) {
            console.warn('Failed to load Casey settings:', e);
        }
    }

    saveSettings() {
        try {
            localStorage.setItem(CASEY_SETTINGS_KEY, JSON.stringify({
                darkMode: this.state.darkMode,
                userDid: this.state.userDid
            }));
            return true;
        } catch (e) {
            console.error('Failed to save Casey settings:', e);
            return false;
        }
    }

    applyTheme() {
        if (typeof document === 'undefined') return;
        const theme = this.state.darkMode ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        this._updateThemeButtonUI();
    }

    toggleDarkMode() {
        this.state.darkMode = !this.state.darkMode;
        this.applyTheme();
        this.saveSettings();
    }

    getUserDid() {
        return this.state.userDid || '';
    }

    /**
     * Wire up settings modal UI
     */
    initUI() {
        this.elements = {
            modal: document.getElementById('settingsModal'),
            openBtn: document.getElementById('btn-open-settings'),
            themeToggleBtn: document.getElementById('settings-theme-toggle-btn'),
            themeToggleLabel: document.getElementById('settings-theme-toggle-label'),
            userDidInput: document.getElementById('settings-user-did'),
            saveBtn: document.getElementById('btn-save-settings'),
            cancelBtns: document.querySelectorAll('#settingsModal .btn-cancel-settings')
        };

        if (this.elements.openBtn && this.elements.modal) {
            this.elements.openBtn.addEventListener('click', () => this.openModal());
        }

        if (this.elements.themeToggleBtn) {
            this.elements.themeToggleBtn.addEventListener('click', () => this.toggleDarkMode());
        }

        if (this.elements.saveBtn) {
            this.elements.saveBtn.addEventListener('click', () => this.handleSave());
        }

        if (this.elements.cancelBtns) {
            this.elements.cancelBtns.forEach(btn => {
                btn.addEventListener('click', () => this.closeModal());
            });
        }

        // Close on overlay click
        if (this.elements.modal) {
            this.elements.modal.addEventListener('click', (e) => {
                if (e.target === this.elements.modal) this.closeModal();
            });
        }

        // Close on Escape key
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.elements.modal && this.elements.modal.classList.contains('active')) {
                this.closeModal();
            }
        });

        this.applyTheme();
    }

    openModal() {
        if (!this.elements.modal) return;
        if (this.elements.userDidInput) {
            this.elements.userDidInput.value = this.state.userDid || '';
        }
        this._updateThemeButtonUI();
        this.elements.modal.classList.add('show');
        this.elements.modal.style.display = 'flex';
    }

    closeModal() {
        if (!this.elements.modal) return;
        this.elements.modal.classList.remove('show');
        this.elements.modal.style.display = 'none';
    }

    handleSave() {
        if (this.elements.userDidInput) {
            this.state.userDid = this.elements.userDidInput.value.trim();
        }
        this.saveSettings();
        this.closeModal();
        if (window.dialogController) {
            window.dialogController.alert('Settings saved.', 'Settings');
        }
        // Refresh export tab preview if available
        if (window.exportUIController && typeof window.exportUIController.renderExportPreview === 'function') {
            window.exportUIController.renderExportPreview();
        }
    }

    _updateThemeButtonUI() {
        if (!this.elements.themeToggleBtn) return;
        if (this.state.darkMode) {
            this.elements.themeToggleBtn.classList.add('is-dark');
            this.elements.themeToggleBtn.setAttribute('aria-pressed', 'true');
            if (this.elements.themeToggleLabel) this.elements.themeToggleLabel.textContent = 'Dark mode';
        } else {
            this.elements.themeToggleBtn.classList.remove('is-dark');
            this.elements.themeToggleBtn.setAttribute('aria-pressed', 'false');
            if (this.elements.themeToggleLabel) this.elements.themeToggleLabel.textContent = 'Light mode';
        }
    }
}

const settingsManager = new CaseySettingsManager();
window.CaseySettingsManager = CaseySettingsManager;
window.settingsManager = settingsManager;
