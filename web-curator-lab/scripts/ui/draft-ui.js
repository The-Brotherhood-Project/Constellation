/**
 * Draft UI Controller
 * Renders the workspace tree list using the canonical tree-item pattern matching lab-styles.css
 */

class DraftUIController {
    constructor() {
        this.nodesListEl = document.getElementById('draft-nodes-list');
        this.draftCountNumEl = document.getElementById('draft-count-num');
        this.draftCountEnderEl = document.getElementById('draft-count-ender');
        this.versionLabelEl = document.getElementById('current-version-label');
        this.btnGroupDomain = document.getElementById('btn-group-domain');

        this.initSidebarForm();
        this.initHeaderButtons();

        // Subscribe to state changes
        labStateManager.subscribe((state) => {
            this.render(state);
            LocalStorageManager.saveState(state);
        });
    }

    initSidebarForm() {
        const btnAddSidebar = document.getElementById('btn-add-node');
        if (btnAddSidebar) {
            btnAddSidebar.addEventListener('click', async () => {
                const idVal = document.getElementById('node-id').value;
                const localId = idVal ? parseInt(idVal, 10) : GraphOps.getNextNodeId();
                const title = document.getElementById('node-title').value;
                const desc = document.getElementById('node-desc').value;
                const pre = document.getElementById('node-pre').value;
                const domVal = document.getElementById('node-parent-domain').value;

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
                        domain_id: domVal,
                        assessable: false
                    });

                    document.getElementById('node-title').value = '';
                    document.getElementById('node-desc').value = '';
                    document.getElementById('node-pre').value = '';
                    document.getElementById('node-id').value = GraphOps.getNextNodeId();
                } catch (err) {
                    await dialogController.alert(err.message, 'Error Adding Node');
                }
            });
        }
    }

    initHeaderButtons() {
        // Add Domain button (supports grouping selected items or creating new domain)
        if (this.btnGroupDomain) {
            this.btnGroupDomain.addEventListener('click', () => {
                const hasSelections = labStateManager.state.selectedNodes.size > 0 || labStateManager.state.selectedDomains.size > 0;
                const commonParent = this.getCommonParentFromSelection();

                const createDomainModal = document.getElementById('createDomainModal');
                const nextId = GraphOps.getNextDomainId();
                document.getElementById('create-domain-id').value = nextId;
                document.getElementById('create-domain-title').value = '';
                document.getElementById('create-domain-desc').value = '';
                
                // If grouping items with a common parent, prefill that parent ID
                const parentDomainInput = document.getElementById('domain-parent-domain');
                if (parentDomainInput) {
                    parentDomainInput.value = (hasSelections && commonParent !== false && commonParent !== null && commonParent !== undefined) ? commonParent : '';
                }

                modalController.openModal(createDomainModal);
            });
        }

        // Clear workspace
        const btnClear = document.getElementById('btn-clear-workspace');
        if (btnClear) {
            btnClear.addEventListener('click', async () => {
                const confirmed = await dialogController.confirm(
                    'Are you sure you want to clear all nodes and domains from this workspace? This cannot be undone.',
                    'Clear Workspace'
                );
                if (confirmed) {
                    labStateManager.resetState();
                    LocalStorageManager.clearState();
                    // Redirect to draft tab
                    this.switchTab('workspace')
                }
            });
        }

        // Tab switching
        const tabBtns = document.querySelectorAll('.nav-tabs .tab-btn');
        const tabSelect = document.getElementById('lab-tab-select');

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.id.replace('tab-', '');
                this.switchTab(tab);
            });
        });

        if (tabSelect) {
            tabSelect.addEventListener('change', (e) => {
                this.switchTab(e.target.value);
            });
        }
    }

    switchTab(tabName) {
        document.querySelectorAll('.nav-tabs .tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.id === `tab-${tabName}`);
        });

        const tabSelect = document.getElementById('lab-tab-select');
        if (tabSelect) tabSelect.value = tabName;

        document.querySelectorAll('.view-section').forEach(view => {
            view.classList.toggle('active', view.id === `view-${tabName}`);
            view.style.display = view.id === `view-${tabName}` ? 'block' : 'none';
        });

        labStateManager.setActiveTab(tabName);
    }

    render(state) {
        // Version label & CID
        if (this.versionLabelEl) {
            const label = state.metadata?.version_label || 'None';
            const cid = state.metadata?.cid;
            this.versionLabelEl.textContent = label;
            if (cid) {
                this.versionLabelEl.title = `CID: ${cid}`;
            } else {
                this.versionLabelEl.removeAttribute('title');
            }
        }

        // Active version banner visibility
        const activeVerDisplay = document.querySelector('.active-version-display');
        if (activeVerDisplay) {
            activeVerDisplay.style.display = 'flex';
        }

        // Count badge
        const nodes = Object.values(state.nodes || {});
        const count = nodes.length;
        if (this.draftCountNumEl) this.draftCountNumEl.textContent = count;
        if (this.draftCountEnderEl) this.draftCountEnderEl.textContent = count === 1 ? ' Node' : ' Nodes';

        // Auto-fill next node ID in sidebar if empty
        const nodeIdInput = document.getElementById('node-id');
        if (nodeIdInput && !nodeIdInput.value) {
            nodeIdInput.value = GraphOps.getNextNodeId();
        }

        // Grouping button label & visibility
        const hasSelections = state.selectedNodes.size > 0 || state.selectedDomains.size > 0;
        const canGroup = this.getCommonParentFromSelection() !== false;
        if (this.btnGroupDomain) {
            this.btnGroupDomain.style.display = hasSelections && !canGroup ? 'none' : 'inline-flex';
            const btnText = this.btnGroupDomain.querySelector('.btn-text');
            if (btnText) {
                btnText.textContent = hasSelections && canGroup ? 'Group Under Domain' : 'Add Domain';
            }
            const btnIcon = this.btnGroupDomain.querySelector('.btn-icon');
            if (btnIcon) {
                btnIcon.textContent = hasSelections && canGroup ? '📁' : '⭕';
            }
        }

        if (!this.nodesListEl) return;

        const domains = Object.values(state.domains || {});
        if (nodes.length === 0 && domains.length === 0) {
            this.nodesListEl.innerHTML = '<p class="empty-state">No items in workspace. Add your first node or domain to get started!</p>';
            return;
        }

        // Render root items recursively
        const rootItems = this.getRootItems(state);
        const html = this.renderTreeItems(rootItems, 0, state);
        this.nodesListEl.innerHTML = html;

        this.bindTreeActions();
    }

    getRootItems(state) {
        const rootItems = [];
        const domains = Object.values(state.domains || {}).sort((a, b) => a.local_id - b.local_id);
        const nodes = Object.values(state.nodes || {}).sort((a, b) => a.local_id - b.local_id);

        domains.forEach(d => {
            if (!d.parent_id) {
                rootItems.push({ ...d, type: 'domain' });
            }
        });

        nodes.forEach(n => {
            if (!n.domain_id) {
                rootItems.push({ ...n, type: 'node' });
            }
        });

        return rootItems;
    }

    getChildren(domainId, state) {
        const children = [];
        const domains = Object.values(state.domains || {}).sort((a, b) => a.local_id - b.local_id);
        const nodes = Object.values(state.nodes || {}).sort((a, b) => a.local_id - b.local_id);

        domains.forEach(d => {
            if (d.parent_id === domainId) {
                children.push({ ...d, type: 'domain' });
            }
        });

        nodes.forEach(n => {
            if (n.domain_id === domainId) {
                children.push({ ...n, type: 'node' });
            }
        });

        return children;
    }

    renderTreeItems(items, depth, state) {
        return items.map(item => {
            if (item.type === 'domain') {
                return this.renderDomainItem(item, depth, state);
            } else {
                return this.renderNodeItem(item, depth, state);
            }
        }).join('');
    }

    renderDomainItem(domain, depth, state) {
        const levelIndent = 10;
        const currentPadding = (depth * levelIndent) + 5;
        const isCollapsed = state.collapsedDomains.has(domain.local_id);
        const isSelected = state.selectedDomains.has(domain.local_id);
        const hasSelections = state.selectedNodes.size > 0 || state.selectedDomains.size > 0;
        const canMove = hasSelections && !isSelected && !state.selectedDomains.has(domain.local_id);

        const children = this.getChildren(domain.local_id, state);
        const childrenHtml = (!isCollapsed && children.length > 0)
            ? this.renderTreeItems(children, depth + 1, state)
            : '';

        return `
            <div class="tree-item domain-item ${isCollapsed ? 'collapsed' : ''} ${isSelected ? 'selected' : ''}" data-domain-id="${domain.local_id}">
                <div class="tree-item-header" style="padding-left: ${currentPadding}px;">
                    <input type="checkbox" class="selection-checkbox" ${isSelected ? 'checked' : ''} data-domain-id="${domain.local_id}">
                    <span class="folder-icon" data-toggle-domain="${domain.local_id}">${isCollapsed ? '▶' : '▼'}</span>
                    <div class="tree-item-content">
                        <span class="tree-item-id">${domain.local_id}</span>
                        <span class="tree-item-title">${this.escapeHtml(domain.title)}</span>
                        ${domain.description ? `<span class="tree-item-description">${this.escapeHtml(domain.description)}</span>` : ''}
                    </div>
                    <div class="tree-item-actions">
                        ${domain.parent_id ? `
                            <button class="btn btn-secondary btn-small btn-eject-domain" data-id="${domain.local_id}" title="Eject Domain">
                                <span class="btn-text">Eject</span><span class="btn-icon">➡️</span>
                            </button>
                        ` : ''}
                        ${children.length > 0 ? `
                            <button class="btn btn-secondary btn-small btn-disband-domain" data-id="${domain.local_id}" title="Disband Domain">
                                <span class="btn-text">Disband</span><span class="btn-icon">🗑️</span>
                            </button>
                        ` : ''}
                        ${canMove ? `
                            <button class="btn btn-primary btn-small btn-move-domain" data-id="${domain.local_id}" title="Move Selected Here">
                                <span class="btn-text">Move</span><span class="btn-icon">✅</span>
                            </button>
                        ` : ''}
                        <button class="btn btn-secondary btn-small btn-edit-domain" data-id="${domain.local_id}">
                            <span class="btn-text">Edit</span><span class="btn-icon">✏️</span>
                        </button>
                        <button class="btn btn-danger btn-small btn-delete-domain" data-id="${domain.local_id}">
                            <span class="btn-text">Delete</span><span class="btn-icon">❌</span>
                        </button>
                    </div>
                </div>
                <div class="tree-item-children" style="display: ${isCollapsed ? 'none' : 'block'};">
                    ${childrenHtml}
                </div>
            </div>
        `;
    }

    renderNodeItem(node, depth, state) {
        const levelIndent = 15;
        const currentPadding = (depth * levelIndent) + 5;
        const isSelected = state.selectedNodes.has(node.local_id);

        return `
            <div class="tree-item node-item ${isSelected ? 'selected' : ''}" data-node-id="${node.local_id}">
                <div class="tree-item-header" style="padding-left: ${currentPadding}px;">
                    <input type="checkbox" class="selection-checkbox" ${isSelected ? 'checked' : ''} data-node-id="${node.local_id}">
                    <div class="tree-item-content">
                        <span class="tree-item-id" ${node.assessable ? 'style="background-color: var(--primary-color)"' : ''}">${node.local_id}</span>
                        <span class="tree-item-title">${this.escapeHtml(node.title)}</span>
                    </div>
                    <div class="tree-item-actions">
                        ${node.domain_id ? `
                            <button class="btn btn-secondary btn-small btn-eject-node" data-id="${node.local_id}" title="Eject Node">
                                <span class="btn-text">Eject</span><span class="btn-icon">➡️</span>
                            </button>
                        ` : ''}
                        <button class="btn btn-secondary btn-small btn-edit-node" data-id="${node.local_id}">
                            <span class="btn-text">Edit</span><span class="btn-icon">✏️</span>
                        </button>
                        <button class="btn btn-danger btn-small btn-delete-node" data-id="${node.local_id}">
                            <span class="btn-text">Delete</span><span class="btn-icon">❌</span>
                        </button>
                    </div>
                </div>
                <div class="tree-item-details">
                    ${node.description ? `<p>${this.escapeHtml(node.description)}</p>` : ''}
                    ${node.prerequisite ? `<p><strong>Prereqs:</strong> <code>${this.escapeHtml(node.prerequisite)}</code></p>` : ''}
                </div>
            </div>
        `;
    }

    bindTreeActions() {
        // Selection checkboxes
        this.nodesListEl.querySelectorAll('.selection-checkbox[data-node-id]').forEach(cb => {
            cb.addEventListener('change', (e) => {
                e.stopPropagation();
                const id = parseInt(cb.dataset.nodeId, 10);
                this.toggleNodeSelection(id);
            });
        });

        this.nodesListEl.querySelectorAll('.selection-checkbox[data-domain-id]').forEach(cb => {
            cb.addEventListener('change', (e) => {
                e.stopPropagation();
                const id = parseInt(cb.dataset.domainId, 10);
                this.toggleDomainSelection(id);
            });
        });

        // Folder toggle (collapse/expand)
        this.nodesListEl.querySelectorAll('.folder-icon').forEach(icon => {
            icon.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(icon.dataset.toggleDomain, 10);
                this.toggleDomainCollapse(id);
            });
        });

        // Move button
        this.nodesListEl.querySelectorAll('.btn-move-domain').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const targetDomainId = parseInt(btn.dataset.id, 10);
                try {
                    this.moveSelectedToDomain(targetDomainId);
                } catch (err) {
                    dialogController.alert(err.message, 'Move Error');
                }
            });
        });

        // Eject Node
        this.nodesListEl.querySelectorAll('.btn-eject-node').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id, 10);
                const node = labStateManager.state.nodes[id];
                if (!node || !node.domain_id) return;
                const parentDomain = labStateManager.state.domains[node.domain_id];
                const grandparentId = parentDomain ? parentDomain.parent_id : null;
                GraphOps.updateNode(id, { domain_id: grandparentId });
            });
        });

        // Eject Domain
        this.nodesListEl.querySelectorAll('.btn-eject-domain').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id, 10);
                const domain = labStateManager.state.domains[id];
                if (!domain || !domain.parent_id) return;
                const parentDomain = labStateManager.state.domains[domain.parent_id];
                const grandparentId = parentDomain ? parentDomain.parent_id : null;
                GraphOps.updateDomain(id, { parent_id: grandparentId });
            });
        });

        // Disband Domain
        this.nodesListEl.querySelectorAll('.btn-disband-domain').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id, 10);
                const domain = labStateManager.state.domains[id];
                if (!domain) return;
                
                const confirmed = await dialogController.confirm(
                    `Are you sure you want to disband domain #${id} "${domain.title}"?`,
                    'Disband Domain'
                );
                if (confirmed) GraphOps.changeDomainId(id, null);
            });
        });

        // Edit Node
        this.nodesListEl.querySelectorAll('.btn-edit-node').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id, 10);
                const node = labStateManager.state.nodes[id];
                if (node) modalController.openEditNode(node);
            });
        });

        // Delete Node
        this.nodesListEl.querySelectorAll('.btn-delete-node').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id, 10);
                const node = labStateManager.state.nodes[id];
                if (!node) return;

                const confirmed = await dialogController.confirm(
                    `Are you sure you want to delete node #${id} "${node.title}"?`,
                    'Delete Node'
                );
                if (confirmed) {
                    // Use the changeNodeId method to delete the node from the graph
                    GraphOps.changeNodeId(id, null);
                }
            });
        });

        // Edit Domain
        this.nodesListEl.querySelectorAll('.btn-edit-domain').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id, 10);
                const domain = labStateManager.state.domains[id];
                if (domain) modalController.openEditDomain(domain);
            });
        });

        // Delete Domain
        this.nodesListEl.querySelectorAll('.btn-delete-domain').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id, 10);
                const domain = labStateManager.state.domains[id];
                if (!domain) return;

                const confirmed = await dialogController.confirm(
                    `Are you sure you want to delete domain #${id} "${domain.title}" including all its content?`,
                    'Delete Domain'
                );
                if (confirmed) GraphOps.deleteDomain(id);
            });
        });
    }

    /**
     * Toggle node selection
     */
    toggleNodeSelection(nodeId) {
        const { selectedNodes } = labStateManager.state;
        const id = parseInt(nodeId, 10);
        if (selectedNodes.has(id)) {
            selectedNodes.delete(id);
        } else {
            selectedNodes.add(id);
        }
        labStateManager.notifyStateChange();
    }

    /**
     * Toggle domain selection
     */
    toggleDomainSelection(domainId) {
        const { selectedDomains } = labStateManager.state;
        const id = parseInt(domainId, 10);
        if (selectedDomains.has(id)) {
            selectedDomains.delete(id);
        } else {
            selectedDomains.add(id);
        }
        labStateManager.notifyStateChange();
    }

    /**
     * Toggle domain collapse
     */
    toggleDomainCollapse(domainId) {
        const { collapsedDomains } = labStateManager.state;
        const id = parseInt(domainId, 10);
        if (collapsedDomains.has(id)) {
            collapsedDomains.delete(id);
        } else {
            collapsedDomains.add(id);
        }
        labStateManager.notifyStateChange();
    }

    /**
     * Move selected items into target domain
     */
    moveSelectedToDomain(targetDomainId) {
        const { nodes, domains, selectedNodes, selectedDomains } = labStateManager.state;
        const targetId = parseInt(targetDomainId, 10);
        if (!domains[targetId]) {
            throw new Error(`Target domain ${targetId} not found`);
        }
        
        // Move nodes
        for (const nodeId of selectedNodes) {
            const node = nodes[nodeId];
            if (node) {
                node.domain_id = targetId;
            }
        }

        // Move domains
        for (const domainId of selectedDomains) {
            if (domainId === targetId) continue;
            // Prevent cycles
            if (this.isDescendantDomain(targetId, domainId)) continue;
            const domain = domains[domainId];
            if (domain) {
                domain.parent_id = targetId;
            }
        }

        selectedNodes.clear();
        selectedDomains.clear();
        labStateManager.notifyStateChange();
    }

    isDescendantDomain(checkId, ancestorId) {
        const { domains } = labStateManager.state;
        let cur = domains[checkId];
        while (cur && cur.parent_id !== null) {
            if (cur.parent_id === ancestorId) return true;
            cur = domains[cur.parent_id];
        }
        return false;
    }

    /**
     * Check if selection has a common parent
     */
    getCommonParentFromSelection() {
        const { nodes, domains, selectedNodes, selectedDomains } = labStateManager.state;
        const hasNodes = selectedNodes.size > 0;
        const hasDomains = selectedDomains.size > 0;
        if (!hasNodes && !hasDomains) return null;

        let commonParent = undefined;

        for (const nid of selectedNodes) {
            const n = nodes[nid];
            if (!n) continue;
            const p = n.domain_id ?? null;
            if (commonParent === undefined) commonParent = p;
            else if (commonParent !== p) return false;
        }

        for (const did of selectedDomains) {
            const d = domains[did];
            if (!d) continue;
            const p = d.parent_id ?? null;
            if (commonParent === undefined) commonParent = p;
            else if (commonParent !== p) return false;
        }

        return commonParent;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DraftUIController };
} else {
    window.DraftUIController = DraftUIController;
}
