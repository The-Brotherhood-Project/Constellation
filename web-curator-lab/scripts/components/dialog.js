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
 * Custom Dialog Controller
 * Manages confirm, alert, and prompt dialogs using the existing #dialogModal HTML markup
 */

class DialogController {
    constructor() {
        // Inject dialog modal into body first
        this.injectDialog();

        this.modal = document.getElementById('dialogModal');
        this.titleEl = document.getElementById('dialog-title');
        this.bodyEl = document.getElementById('dialog-body');
        this.inputContainer = document.getElementById('dialog-input-container');
        this.inputEl = document.getElementById('dialog-input');
        this.cancelBtn = document.getElementById('dialog-cancel-btn');
        this.confirmBtn = document.getElementById('dialog-confirm-btn');

        this.resolvePromise = null;

        if (this.cancelBtn) {
            this.cancelBtn.addEventListener('click', () => this.handleClose(false));
        }
        if (this.confirmBtn) {
            this.confirmBtn.addEventListener('click', () => {
                if (this.inputContainer && this.inputContainer.style.display !== 'none') {
                    this.handleClose(this.inputEl.value);
                } else {
                    this.handleClose(true);
                }
            });
        }
    }

    /**
     * Show Confirmation Dialog
     * @param {string} message 
     * @param {string} title 
     * @returns {Promise<boolean>}
     */
    confirm(message, title = 'Confirm') {
        return new Promise(resolve => {
            this.resolvePromise = resolve;
            if (this.titleEl) this.titleEl.textContent = title;
            if (this.bodyEl) this.bodyEl.textContent = message;
            if (this.inputContainer) this.inputContainer.style.display = 'none';
            if (this.cancelBtn) this.cancelBtn.style.display = 'inline-block';
            if (this.confirmBtn) this.confirmBtn.textContent = 'OK';
            if (this.modal) this.modal.style.display = 'flex';
        });
    }

    /**
     * Show Alert Dialog
     * @param {string} message 
     * @param {string} title 
     * @returns {Promise<void>}
     */
    alert(message, title = 'Notice') {
        return new Promise(resolve => {
            this.resolvePromise = resolve;
            if (this.titleEl) this.titleEl.textContent = title;
            if (this.bodyEl) this.bodyEl.textContent = message;
            if (this.inputContainer) this.inputContainer.style.display = 'none';
            if (this.cancelBtn) this.cancelBtn.style.display = 'none';
            if (this.confirmBtn) this.confirmBtn.textContent = 'OK';
            if (this.modal) this.modal.style.display = 'flex';
        });
    }

    /**
     * Show Prompt Dialog
     * @param {string} message 
     * @param {string} defaultValue 
     * @param {string} title 
     * @returns {Promise<string|null>}
     */
    prompt(message, defaultValue = '', title = 'Input') {
        return new Promise(resolve => {
            this.resolvePromise = resolve;
            if (this.titleEl) this.titleEl.textContent = title;
            if (this.bodyEl) this.bodyEl.textContent = message;
            if (this.inputContainer) {
                this.inputContainer.style.display = 'block';
                if (this.inputEl) {
                    this.inputEl.value = defaultValue;
                    setTimeout(() => this.inputEl.focus(), 50);
                }
            }
            if (this.cancelBtn) this.cancelBtn.style.display = 'inline-block';
            if (this.confirmBtn) this.confirmBtn.textContent = 'OK';
            if (this.modal) this.modal.style.display = 'flex';
        });
    }

    handleClose(value) {
        if (this.modal) this.modal.style.display = 'none';
        if (this.resolvePromise) {
            const res = this.resolvePromise;
            this.resolvePromise = null;
            res(value);
        }
    }

    injectDialog() {
        const dialog = document.createElement('div');
        
        dialog.id = 'dialogModal';
        dialog.classList.add('dialog-overlay');
        dialog.style.display = 'none';
        dialog.innerHTML = 
            `<div class="dialog-modal">
                <div id="dialog-title" class="dialog-title">Confirm</div>
                <div id="dialog-body" class="dialog-message">
                    <!-- Message goes here -->
                </div>
                <div id="dialog-input-container" class="form-group" style="display: none;">
                    <input type="text" id="dialog-input" style="width: 100%;">
                </div>
                <div class="dialog-buttons">
                    <button id="dialog-cancel-btn" class="btn btn-secondary dialog-btn-cancel" >Cancel</button>
                    <button id="dialog-confirm-btn" class="btn btn-primary dialog-btn-confirm" >OK</button>
                </div>
            </div>`;
        
        document.body.appendChild(dialog);
    }
}

const dialogController = new DialogController();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DialogController, dialogController };
} else {
    window.DialogController = DialogController;
    window.dialogController = dialogController;
}
