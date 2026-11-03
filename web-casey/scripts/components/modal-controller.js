/**
 * Modal Controller
 * Manages Create Node, Edit Node, Create Domain, and Edit Domain modals
 */
class ModalController {
    constructor() {
        this.initModals();
    }

    initModals() {
        // Close modal buttons (crosses and cancel buttons)
        document.querySelectorAll('.modal .close, .modal .btn-secondary').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // If it's a dialog modal, handled by DialogController
                const modal = e.target.closest('.modal');
                if (modal && modal.id !== 'dialogModal') {
                    this.closeModal(modal);
                }
            });
        });

        // Window background click to close
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal') && e.target.id !== 'dialogModal') {
                this.closeModal(e.target);
            }
        });

        // Click on active version info to open metadata modal
        const versionInfoEl = document.getElementById('active-version-info');
        if (versionInfoEl) {
            versionInfoEl.addEventListener('click', () => {
                this.openMetadataModal();
            });
        }

        // Bind form submits
        this.bindNodeModalEvents();
        this.bindDomainModalEvents();
    }

    openMetadataModal() {
        const modal = document.getElementById('metadata-modal');
        const container = document.getElementById('metadata-content');
        if (!modal) return;

        if (container) {
            const meta = caseyStateManager.state.metadata || {};
            const nodes = Object.values(caseyStateManager.state.nodes || {});
            const domains = Object.values(caseyStateManager.state.domains || {});
            const graphMetadata = `
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <h3 style="margin-top: 0;">Graph Metadata</h3>
                    <div><strong>Version Label:</strong> ${meta.version_label || 'None'}</div>
                    <div><strong>CID:</strong> <code style="word-break: break-all;">${meta.cid || 'Not yet saved/exported'}</code></div>
                    <div><strong>Nodes:</strong> ${nodes.length}</div>
                    <div><strong>Domains:</strong> ${domains.length}</div>
                    <div><strong>Created:</strong> ${meta.created ? new Date(meta.created).toLocaleString() : 'None'}</div>
                    <div><strong>License:</strong> ${meta.license?.name || 'None'}</div>
                    <div><strong>Copyright Notice:</strong> ${meta.copyright || 'None'}</div>
                </div>
            `;

            const rvrMeta = caseyStateManager.state.rvrMetadata || {};
            const bibliographies = Object.values(caseyStateManager.state.resources.bibliographies || {});
            const attachments = Object.values(caseyStateManager.state.resources.attachments || {});
            const roverlayMetadata = `
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <h3 style="margin-top: 0;">Roverlay Metadata</h3>
                    <div><strong>Version Label:</strong> ${rvrMeta.version_label || 'None'}</div>
                    <div><strong>CID:</strong> <code style="word-break: break-all;">${rvrMeta.cid || 'Not yet saved/exported'}</code></div>
                    <div><strong>Bibliographies:</strong> ${bibliographies.length}</div>
                    <div><strong>Attachments:</strong> ${attachments.length}</div>
                    <div><strong>Created:</strong> ${rvrMeta.created ? new Date(rvrMeta.created).toLocaleString() : 'None'}</div>
                    <div><strong>License:</strong> ${rvrMeta.license?.name || 'None'}</div>
                    <div><strong>Copyright Notice:</strong> ${rvrMeta.copyright || 'None'}</div>
                </div>
            `;

            container.innerHTML = graphMetadata + roverlayMetadata;
        }

        this.openModal(modal);
    }

    openModal(modal) {
        if (!modal) return;
        modal.classList.add('active');
        modal.style.display = 'block';
    }

    closeModal(modal) {
        if (!modal) return;
        modal.classList.remove('active');
        modal.style.display = 'none';
    }

    bindNodeModalEvents() {
        // Open Add Node Modal button in header
        const btnOpenAddNode = document.getElementById('btn-open-add-node-modal');
        const createModal = document.getElementById('createNodeModal');
        if (btnOpenAddNode && createModal) {
            btnOpenAddNode.addEventListener('click', () => {
                const nextId = GraphOps.getNextNodeId();
                document.getElementById('modal-node-id').value = nextId;
                document.getElementById('modal-node-title').value = '';
                document.getElementById('modal-node-desc').value = '';
                document.getElementById('modal-node-pre').value = '';
                document.getElementById('modal-node-parent-domain').value = '';
                this.openModal(createModal);
            });
        }

        // Add to Draft submit in createNodeModal
        if (createModal) {
            const addBtn = createModal.querySelector('.btn-primary');
            if (addBtn) {
                addBtn.addEventListener('click', async () => {
                    const localId = parseInt(document.getElementById('modal-node-id').value, 10);
                    const title = document.getElementById('modal-node-title').value;
                    const desc = document.getElementById('modal-node-desc').value;
                    const pre = document.getElementById('modal-node-pre').value;
                    const domId = document.getElementById('modal-node-parent-domain').value;

                    if (!title.trim()) {
                        await dialogController.alert('Node title is required', 'Validation Error');
                        return;
                    }

                    try {
                        GraphOps.addNode({
                            local_id: localId,
                            title: title,
                            description: desc,
                            prerequisite: pre,
                            domain_id: domId
                        });
                        this.closeModal(createModal);
                    } catch (err) {
                        await dialogController.alert(err.message, 'Error Adding Node');
                    }
                });
            }
        }

        // Edit Node Modal submit
        const editModal = document.getElementById('editModal');
        if (editModal) {
            // Add automatic prerequisite simplification and validation on unfocus
            document.getElementById('edit-node-pre').addEventListener('blur', (e) => {
                const pre = e.target.value.trim();
                if (pre && PrerequisiteUtils !== undefined) {
                    const originalId = parseInt(editModal.dataset.nodeId, 10);
                    const contextNodes = new Map(Object.entries(caseyStateManager.state.hyperedges || {})
                        .map(([key, value]) => [parseInt(key), value]));
                    e.target.value = PrerequisiteUtils.simplifyPrerequisite(originalId, pre, contextNodes);
                }
            });

            const updateBtn = editModal.querySelector('.btn-primary');
            if (updateBtn) {
                updateBtn.addEventListener('click', async () => {
                    const originalId = parseInt(editModal.dataset.nodeId, 10);
                    const newIdVal = document.getElementById('edit-node-id').value.trim();
                    const newId = newIdVal ? parseInt(newIdVal, 10) : originalId;
                    const title = document.getElementById('edit-node-title').value;
                    const desc = document.getElementById('edit-node-desc').value;
                    const pre = document.getElementById('edit-node-pre').value;
                    const propagate = document.getElementById('edit-node-propagate').checked;

                    if (!title.trim()) {
                        await dialogController.alert('Node title is required', 'Validation Error');
                        return;
                    }

                    if (isNaN(newId) || newId <= 0) {
                        await dialogController.alert('Node ID must be a positive integer', 'Validation Error');
                        return;
                    }

                    try {
                        GraphOps.updateNode(originalId, {
                            local_id: newId !== originalId ? newId : undefined,
                            title: title,
                            description: desc,
                            prerequisite: pre,
                            propagate: propagate
                        });
                        this.closeModal(editModal);
                    } catch (err) {
                        await dialogController.alert(err.message, 'Error Updating Node');
                    }
                });
            }
        }
    }

    bindDomainModalEvents() {
        // Open Add Domain button in header
        const btnGroupDomain = document.getElementById('btn-group-domain');
        const createDomainModal = document.getElementById('createDomainModal');
        if (btnGroupDomain && createDomainModal) {
            btnGroupDomain.addEventListener('click', () => {
                const nextId = GraphOps.getNextDomainId();
                document.getElementById('create-domain-id').value = nextId;
                document.getElementById('create-domain-title').value = '';
                document.getElementById('create-domain-desc').value = '';
                document.getElementById('domain-parent-domain').value = '';
                this.openModal(createDomainModal);
            });
        }

        // Create Domain submit
        if (createDomainModal) {
            const createBtn = createDomainModal.querySelector('.btn-primary');
            if (createBtn) {
                createBtn.addEventListener('click', async () => {
                    const localId = parseInt(document.getElementById('create-domain-id').value, 10);
                    const title = document.getElementById('create-domain-title').value;
                    const desc = document.getElementById('create-domain-desc').value;
                    const parentId = document.getElementById('domain-parent-domain').value;

                    if (!title.trim()) {
                        await dialogController.alert('Domain title is required', 'Validation Error');
                        return;
                    }

                    try {
                        GraphOps.addDomain({
                            local_id: localId,
                            title: title,
                            description: desc,
                            parent_id: parentId
                        });

                        // If there are selections, put all of the selected nodes under the new domain
                        const { selectedNodes, selectedDomains } = caseyStateManager.state;
                        selectedNodes.forEach(node => GraphOps.updateNode(node, { domain_id: localId }));
                        selectedDomains.forEach(domain => GraphOps.updateDomain(domain, { parent_id: localId }));
                        selectedNodes.clear();
                        selectedDomains.clear();
                    } catch (err) {
                        await dialogController.alert(err.message, 'Error Creating Domain');
                    } finally {
                        this.closeModal(createDomainModal);
                        caseyStateManager.notifyStateChange();
                    }
                });
            }
        }

        // Edit Domain Modal submit
        const editDomainModal = document.getElementById('editDomainModal');
        if (editDomainModal) {
            const updateBtn = editDomainModal.querySelector('.btn-primary');
            if (updateBtn) {
                updateBtn.addEventListener('click', async () => {
                    const originalId = parseInt(editDomainModal.dataset.domainId, 10);
                    const newIdVal = document.getElementById('edit-domain-id').value.trim();
                    const newId = newIdVal ? parseInt(newIdVal, 10) : originalId;
                    const title = document.getElementById('edit-domain-title').value;
                    const desc = document.getElementById('edit-domain-desc').value;

                    if (!title.trim()) {
                        await dialogController.alert('Domain title is required', 'Validation Error');
                        return;
                    }

                    if (isNaN(newId) || newId <= 0) {
                        await dialogController.alert('Domain ID must be a positive integer', 'Validation Error');
                        return;
                    }

                    try {
                        GraphOps.updateDomain(originalId, {
                            local_id: newId !== originalId ? newId : undefined,
                            title: title,
                            description: desc
                        });
                        this.closeModal(editDomainModal);
                    } catch (err) {
                        await dialogController.alert(err.message, 'Error Updating Domain');
                    }
                });
            }
        }
    }

    // -------------------------------------------------------------------------
    // View Attributions Modal
    // -------------------------------------------------------------------------

    /**
     * Opens the View Attributions modal for a given node, listing all attached sources.
     * @param {string} nodeId
     */
    openViewAttributions(nodeId) {
        const modal = document.getElementById('viewAttributionsModal');
        if (!modal) return;

        const node = caseyStateManager.state.nodes[nodeId];
        const titleEl = document.getElementById('view-attributions-node-title');
        if (titleEl) titleEl.textContent = node ? (node.title || `#${nodeId}`) : `#${nodeId}`;

        this._renderAttributionsList(nodeId);
        this.openModal(modal);
    }

    /**
     * Re-renders the attributions list inside the modal (called after deletes).
     * @param {string} nodeId
     */
    _renderAttributionsList(nodeId) {
        const list = document.getElementById('view-attributions-list');
        const selectAllBtn = document.getElementById('btn-attributions-select-all');
        const massDeleteBtn = document.getElementById('btn-attributions-mass-delete');
        if (!list) return;

        const attachments = (caseyStateManager.state.resources?.attachments?.[nodeId] || []);
        const bibs = caseyStateManager.state.resources?.bibliographies || {};

        if (attachments.length === 0) {
            list.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px 0;">No sources attributed to this node.</p>';
            if (selectAllBtn) selectAllBtn.disabled = true;
            if (massDeleteBtn) massDeleteBtn.disabled = true;
            return;
        }

        if (selectAllBtn) selectAllBtn.disabled = false;

        const TYPE_ICONS = { Book: '📚', Article: '📄', Video: '🎥', Website: '🌐', Other: '📎' };

        list.innerHTML = attachments.map((att, idx) => {
            const bib = bibs[att.bib_id];
            if (!bib) return '';
            const icon = TYPE_ICONS[bib.bib_type] || TYPE_ICONS.Other;
            const meta = [
                bib.author ? BibliographyUtils._escapeHtml(bib.author) : null,
                bib.year ? String(bib.year) : null,
                bib.bib_type || 'Other',
                att.fragment_start ? `from: ${BibliographyUtils._escapeHtml(att.fragment_start)}` : null,
                att.fragment_end ? `to: ${BibliographyUtils._escapeHtml(att.fragment_end)}` : null
            ].filter(Boolean).join(' · ');

            const clickableStyle = !bib.url || bib.url === '' ? 'style="cursor: default; background-color: inherit; border-color: var(--border-color); transform: none"' : '';

            return `
                <div class="source-item-row" data-idx="${idx}" data-bib-id="${att.bib_id}" ${clickableStyle}>
                    <input type="checkbox" class="attribution-checkbox" data-idx="${idx}"
                        style="margin-right: 12px; flex-shrink: 0; width: 16px; height: 16px; cursor: pointer;">
                    <div class="source-icon">${icon}</div>
                    <div class="source-main-info">
                        <div class="source-title">${BibliographyUtils._escapeHtml(bib.title || 'Untitled')}</div>
                        <div class="source-meta-info">${meta}</div>
                    </div>
                    <div class="source-actions">
                        <button class="btn btn-danger btn-small btn-delete-attachment" type="button"
                            data-idx="${idx}" title="Remove this attribution">
                            <span class="btn-icon">🗑</span>
                            <span class="btn-text">Remove</span>
                        </button>
                    </div>
                    <div class="source-arrow">›</div>
                </div>`;
        }).join('');

        // Row click → open URL
        list.querySelectorAll('.source-item-row').forEach((row) => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('input, button')) return;
                const idx = parseInt(row.dataset.idx, 10);
                const att = attachments[idx];
                const bib = bibs[att?.bib_id];
                const url = BibliographyUtils._constructUrl(bib.url, bib.bib_type, att.fragment_start, att.fragment_end);
                if (url) window.open(url, '_blank');
            });
        });

        // Individual delete buttons
        list.querySelectorAll('.btn-delete-attachment').forEach((btn) => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.idx, 10);
                const att = attachments[idx];
                const confirmed = await dialogController?.confirm(
                    'Remove this source attribution?', 'Remove Attribution'
                );
                if (!confirmed) return;
                RvrOps.removeAttachment(nodeId, att.bib_id, att.fragment_start, att.fragment_end);
                this._renderAttributionsList(nodeId);
            });
        });

        // Checkbox changes → enable/disable mass delete
        const updateMassDelete = () => {
            const massDeleteBtn = document.getElementById('btn-attributions-mass-delete');
            const checked = list.querySelectorAll('.attribution-checkbox:checked').length;
            if (massDeleteBtn) massDeleteBtn.disabled = (checked < 1);
            console.log(massDeleteBtn.disabled);
        };
        list.querySelectorAll('.attribution-checkbox').forEach(cb => {
            cb.addEventListener('change', updateMassDelete);
        });

        // Select All / Deselect All
        if (selectAllBtn) {
            // Remove old listener by cloning
            const newSelectAll = selectAllBtn.cloneNode(true);
            selectAllBtn.parentNode.replaceChild(newSelectAll, selectAllBtn);
            let allSelected = false;
            newSelectAll.addEventListener('click', () => {
                allSelected = !allSelected;
                list.querySelectorAll('.attribution-checkbox').forEach(cb => { cb.checked = allSelected; });
                newSelectAll.querySelector('.btn-text').textContent = allSelected ? ' Deselect All' : ' Select All';
                updateMassDelete();
            });
        }

        // Mass delete
        if (massDeleteBtn) {
            const newMassDelete = massDeleteBtn.cloneNode(true);
            massDeleteBtn.parentNode.replaceChild(newMassDelete, massDeleteBtn);
            newMassDelete.addEventListener('click', async () => {
                const checkedBoxes = list.querySelectorAll('.attribution-checkbox:checked');
                const indices = Array.from(checkedBoxes).map(cb => parseInt(cb.dataset.idx, 10));
                if (indices.length === 0) return;
                const confirmed = await dialogController?.confirm(
                    `Remove ${indices.length} attribution(s)?`, 'Mass Remove'
                );
                if (!confirmed) return;
                // Collect atts to remove (indices descending to not shift positions)
                const toRemove = indices.map(i => attachments[i]).filter(Boolean);
                toRemove.forEach(att => {
                    RvrOps.removeAttachment(nodeId, att.bib_id, att.fragment_start, att.fragment_end);
                });
                this._renderAttributionsList(nodeId);
            });

            // Replace and refresh
            updateMassDelete();
        }
    }

    /**
     * Opens the read-only Bibliography Detail modal for a bibliography object.
     * Lists attachments used from this bibliography.
     * Opened from being clicked on the search result list on the discovery modal.
     * @param {Object} bib
     */
    openBibliographyDetail(bib) {
        const modal = document.getElementById('bibliographyDetailModal');
        const container = document.getElementById('bibliography-detail-content');
        if (!modal || !container || !bib) return;

        const TYPE_ICONS = { Book: '📚', Article: '📄', Video: '🎥', Website: '🌐', Other: '📎' };
        const icon = TYPE_ICONS[bib.bib_type] || TYPE_ICONS.Other;

        const field = (label, value) => value
            ? `<div class="form-group">
                   <label>${label}</label>
                   <div class="readonly-field">${BibliographyUtils._escapeHtml(String(value))}</div>
               </div>`
            : '';

        // Gather all attachments referring to this bibliography across the graph using bib.references
        const state = caseyStateManager.state;
        const attDict = state.resources?.attachments || {};
        const nodesDict = state.nodes || {};

        const attachmentsByNode = (bib.references || []).map(nodeId => {
            const nodeIdStr = String(nodeId);
            const matches = (attDict[nodeIdStr] || []).filter(a => a.bib_id === bib.local_id);
            return {
                nodeId: nodeIdStr,
                node: nodesDict[nodeIdStr],
                attachments: matches
            };
        });

        // Sort by node ID
        attachmentsByNode.sort((a, b) => parseInt(a.nodeId, 10) - parseInt(b.nodeId, 10));

        let attachmentsHtml = '';
        if (attachmentsByNode.length === 0) {
            attachmentsHtml = '<p style="color: var(--text-muted); font-size: 0.9em; margin: 4px 0 0 0;">No nodes currently reference this bibliography.</p>';
        } else {
            attachmentsHtml = `
                <div class="sources-container" style="margin-top: 8px;">
                    ${attachmentsByNode.map(entry => {
                        const nodeTitle = entry.node ? (entry.node.title || 'Untitled Node') : 'Unknown Node';
                        const nodeLabel = `#${BibliographyUtils._escapeHtml(entry.nodeId)}: ${BibliographyUtils._escapeHtml(nodeTitle)}`;
                        
                        // If there are specific attachment fragments, list them
                        const fragments = entry.attachments.map(att => {
                            const parts = [];
                            if (att.fragment_start) parts.push(`from: ${BibliographyUtils._escapeHtml(att.fragment_start)}`);
                            if (att.fragment_end) parts.push(`to: ${BibliographyUtils._escapeHtml(att.fragment_end)}`);
                            return parts.length > 0 ? parts.join(' · ') : '';
                        });

                        const fragmentText = fragments.length > 0 
                            ? fragments.join('; ') 
                            : 'Referenced';

                        // The original class already defaults to pointer, just ignore if there is a valid url
                        const clickableStyle = !bib.url || bib.url === '' ? 'style="cursor: default; background-color: inherit; border-color: var(--border-color); transform: none"' : '';
                        const url = BibliographyUtils._constructUrl(bib.url, bib.bib_type, att.fragment_start, att.fragment_end);

                        return `
                            <div class="source-item-row" data-url="${url}" ${clickableStyle}">
                                <div class="source-icon" style="font-size: 1.1em; width: 32px; height: 32px;">🔗</div>
                                <div class="source-main-info">
                                    <div class="source-title">${nodeLabel}</div>
                                    <div class="source-meta-info">${fragmentText}</div>
                                </div>
                                ${url ? '<div class="source-arrow">›</div>' : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }

        container.innerHTML = `
            <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 18px;">
                <div class="source-icon" style="font-size: 1.6em; width: 44px; height: 44px;">${icon}</div>
                <div>
                    <div style="font-weight: 700; font-size: 1.1em;">${BibliographyUtils._escapeHtml(bib.title || 'Untitled')}</div>
                    <div style="color: var(--text-muted); font-size: 0.85em;">${bib.bib_type || 'Other'}</div>
                </div>
            </div>
            ${field('Author', bib.author)}
            ${field('Year', bib.year)}
            ${bib.url ? `<div class="form-group">
                <label>URL</label>
                <a href="${BibliographyUtils._escapeHtml(bib.url)}" target="_blank" rel="noopener">
                    <code style="font-size: 1.2em;">${BibliographyUtils._escapeHtml(bib.url)}</code>
                </a>
            </div>` : ''}
            <div class="form-group">
                <label>Referenced By Nodes (${attachmentsByNode.length})</label>
                ${attachmentsHtml}
            </div>
        `;

        // If bib has a URL, make the attachment rows clickable to open it
        if (bib.url) {
            container.querySelectorAll('.source-item-row[data-url]').forEach(row => {
                row.addEventListener('click', () => {
                    const url = row.dataset.url;
                    if (url) window.open(url, '_blank');
                });
            });
        }

        // Wire up delete button with confirmation dialog
        const deleteBtn = modal.querySelector('.btn-danger');
        if (deleteBtn) {
            const newDeleteBtn = deleteBtn.cloneNode(true);
            deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);

            newDeleteBtn.addEventListener('click', async () => {
                const confirmed = await dialogController?.confirm(
                    `Are you sure you want to permanently delete "${bib.title || 'Untitled'}" and remove all its references across the graph?`,
                    'Delete Bibliography'
                );

                if (!confirmed) return;

                if (typeof RvrOps !== 'undefined') {
                    RvrOps.deleteBibliography(bib.local_id);
                }

                this.closeModal(modal);

                // Refresh attribution UI discovery search & active tray if present
                if (typeof window !== 'undefined' && window.attributionUIController) {
                    window.attributionUIController.filterGraphCitations();
                    window.attributionUIController.updateAttributionDisplay();
                }
            });
        }

        this.openModal(modal);
    }

    /**
     * Open Edit Node modal with populated data
     * @param {Object} node 
     */
    openEditNode(node) {
        const modal = document.getElementById('editModal');
        if (!modal || !node) return;

        // Store original ID so the submit handler knows what to look up
        modal.dataset.nodeId = node.local_id;

        document.getElementById('edit-node-id-display').textContent = `#${node.local_id}`;
        const idInput = document.getElementById('edit-node-id');
        idInput.value = node.local_id;
        idInput.removeAttribute('disabled'); // Allow ID editing
        document.getElementById('edit-node-title').value = node.title || '';
        document.getElementById('edit-node-desc').value = node.description || '';
        document.getElementById('edit-node-pre').value = node.prerequisite || '';
        const propagateChk = document.getElementById('edit-node-propagate');
        if (propagateChk) propagateChk.checked = false;

        this.openModal(modal);
    }

    /**
     * Open Edit Domain modal with populated data
     * @param {Object} domain 
     */
    openEditDomain(domain) {
        const modal = document.getElementById('editDomainModal');
        if (!modal || !domain) return;

        // Store original ID so the submit handler knows what to look up
        modal.dataset.domainId = domain.local_id;

        const idInput = document.getElementById('edit-domain-id');
        idInput.value = domain.local_id;
        idInput.removeAttribute('disabled'); // Allow ID editing
        document.getElementById('edit-domain-title').value = domain.title || '';
        document.getElementById('edit-domain-desc').value = domain.description || '';

        this.openModal(modal);
    }
}

const modalController = new ModalController();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ModalController, modalController };
} else {
    window.ModalController = ModalController;
    window.modalController = modalController;
}
