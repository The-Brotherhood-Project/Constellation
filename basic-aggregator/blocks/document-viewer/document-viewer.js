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
 * Document Viewer Component Controller
 * Uses vendored marked.js to render markdown client-side.
 */
(function() {
    'use strict';

    class DocumentViewerController {
        constructor() {
            this.modal = document.getElementById('document-viewer-modal');
            this.titleEl = document.getElementById('doc-viewer-title');
            this.badgeEl = document.getElementById('doc-viewer-badge');
            this.downloadBtn = document.getElementById('doc-viewer-download');
            this.renderedEl = document.getElementById('doc-viewer-rendered');
            this.registry = window.__DOCUMENTS_REGISTRY__ || {};

            this.initEvents();
            this.checkHash();
        }

        initEvents() {
            if (!this.modal) return;

            // Close buttons & overlay click
            this.modal.querySelectorAll('[data-action="close"]').forEach(el => {
                el.addEventListener('click', () => this.close());
            });

            // Keyboard Escape
            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.modal.classList.contains('active')) {
                    this.close();
                }
            });

            // Card click delegation
            document.addEventListener('click', (e) => {
                const actionBtn = e.target.closest('.doc-view-btn, .doc-link-action');
                if (actionBtn) {
                    e.preventDefault();
                    const docId = actionBtn.getAttribute('data-doc-id');
                    if (docId) {
                        this.openDocument(docId);
                    }
                }
            });

            // Hash navigation
            window.addEventListener('hashchange', () => {
                this.checkHash();
            });
        }

        checkHash() {
            const hash = window.location.hash;
            if (hash.startsWith('#view=')) {
                const docId = decodeURIComponent(hash.substring(6));
                this.openDocument(docId, false);
            }
        }

        openDocument(docId, updateHash = true) {
            const doc = this.registry[docId];
            if (!doc) {
                console.warn(`[DocumentViewer] Document not found: ${docId}`);
                return;
            }

            if (this.titleEl) this.titleEl.textContent = doc.title || doc.file_name;
            if (this.badgeEl) {
                this.badgeEl.textContent = doc.category || 'Document';
                this.badgeEl.className = 'badge badge-category';
            }
            if (this.downloadBtn) {
                this.downloadBtn.href = `content/documents/${doc.file_name}`;
                this.downloadBtn.setAttribute('download', doc.file_name);
            }

            // Convert markdown using marked
            if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
                this.renderedEl.innerHTML = marked.parse(doc.body_markdown || '');
            } else {
                // Fallback to preformatted text if marked is not yet loaded
                const pre = document.createElement('pre');
                pre.textContent = doc.body_markdown || '';
                this.renderedEl.innerHTML = '';
                this.renderedEl.appendChild(pre);
            }

            this.modal.classList.add('active');
            this.modal.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';

            if (updateHash) {
                window.location.hash = `view=${encodeURIComponent(docId)}`;
            }
        }

        close() {
            if (!this.modal) return;
            this.modal.classList.remove('active');
            this.modal.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
            if (window.location.hash.startsWith('#view=')) {
                history.pushState("", document.title, window.location.pathname + window.location.search);
            }
        }
    }

    // Initialize once DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.documentViewer = new DocumentViewerController();
        });
    } else {
        window.documentViewer = new DocumentViewerController();
    }
})();
