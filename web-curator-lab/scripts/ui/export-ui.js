/**
 * Export and Import UI Controller
 * Manages .knw v2.0 and .rvr v1.0 file import and export completely offline
 */
class ExportUIController {
    constructor() {
        this.versionLabelInput = document.getElementById('version-label');
        this.exportFormatSelect = document.getElementById('export-format-select');
        this.btnExport = document.getElementById('btn-export-workspace');
        this.btnImport = document.getElementById('btn-import-workspace');
        this.fileInput = document.getElementById('import-file-input');
        this.btnSaveSnapshot = document.getElementById('btn-save-snapshot');

        this.initEventListeners();
    }

    initEventListeners() {
        // Export button in Export tab
        if (this.btnExport) {
            this.btnExport.addEventListener('click', async () => {
                const format = this.exportFormatSelect?.value || 'knw';
                if (format === 'rvr') {
                    await this.exportRVR();
                } else {
                    await this.exportKNW();
                }
            });
        }

        // Save Snapshot button (saves label & stores snapshot to localStorage)
        if (this.btnSaveSnapshot) {
            this.exportFormatSelect.addEventListener('change', () => {
                // Reset label input
                this.versionLabelInput.value = '';
                // Change the text of the save and export button
                const format = this.exportFormatSelect?.value || 'knw';
                this.btnSaveSnapshot.textContent = `Save ${format.toUpperCase()} Data`;
                this.btnExport.textContent = `Export ${format.toUpperCase()} File`;

                // Autoselect label for the new format
                this.autoselectLabel();
            });

            this.btnSaveSnapshot.addEventListener('click', async () => {
                const label = this.versionLabelInput ? this.versionLabelInput.value.trim() : '';
                const format = this.exportFormatSelect?.value || 'knw';
                await this.updateMetadata(format, label);
                const saved = LocalStorageManager.saveState(labStateManager.state);
                labStateManager.notifyStateChange();
                if (saved) {
                    await dialogController.alert(`A snapshot of the ${format.toUpperCase()} data has been saved to local offline storage.`, 'Data Saved');
                } else {
                    await dialogController.alert('Could not save data to storage.', 'Error');
                }
            });
        }

        // Import is now managed by ImporterComponent in components/importer.js
        this._subscribeToTabChange();
    }

    /**
     * Build clean graph block from current state
     */
    buildGraphBlock() {
        const state = labStateManager.state;
        const nodesList = Object.values(state.nodes || {}).map(node => ({
            local_id: parseInt(node.local_id, 10),
            title: node.title || '',
            description: node.description || '',
            prerequisite: node.prerequisite || '',
            mentions: Array.isArray(node.mentions) ? node.mentions : [],
            domain_id: node.domain_id !== null && node.domain_id !== undefined ? parseInt(node.domain_id, 10) : null,
            //x: typeof node.x === 'number' ? node.x : 0,
            //y: typeof node.y === 'number' ? node.y : 0,
            assessable: node.assessable !== false
        }));

        const domainsList = Object.values(state.domains || {}).map(domain => ({
            local_id: parseInt(domain.local_id, 10),
            title: domain.title || '',
            description: domain.description || '',
            parent_id: domain.parent_id !== null && domain.parent_id !== undefined ? parseInt(domain.parent_id, 10) : null
        }));

        return { nodes: nodesList, domains: domainsList };
    }

    /**
     * Build clean resources block from current state.
     * If the setting 'deleteUnusedBibliographies' is true, bibliographies with
     * references.length < 1 are omitted when calculating CIDs or exporting.
     */
    buildResourcesBlock() {
        const state = labStateManager.state;
        const bibMap = state.resources?.bibliographies || {};
        const attMap = state.resources?.attachments || {};

        const deleteUnused = typeof window !== 'undefined' && window.settingsManager
            ? Boolean(window.settingsManager.state?.deleteUnusedBibliographies)
            : false;

        let bibliographies = Object.values(bibMap).map(b => ({
            local_id: parseInt(b.local_id, 10),
            title: b.title || '',
            bib_type: b.bib_type || 'other',
            author: b.author || '',
            year: typeof b.year === 'number' ? b.year : (parseInt(b.year, 10) || null),
            url: b.url || '',
            references: Array.isArray(b.references) ? b.references : []
        }));

        if (deleteUnused) {
            bibliographies = bibliographies.filter(b => Array.isArray(b.references) && b.references.length > 0);
        }

        const attachments = [];
        for (const [nodeId, attList] of Object.entries(attMap)) {
            if (Array.isArray(attList)) {
                attList.forEach(a => {
                    attachments.push({
                        node_id: parseInt(a.node_id ?? nodeId, 10),
                        bib_id: parseInt(a.bib_id, 10),
                        fragment_start: a.fragment_start || '',
                        fragment_end: a.fragment_end || ''
                    });
                });
            }
        }

        return { bibliographies, attachments };
    }

    /**
     * Export current graph state to a .knw v2.0 file
     */
    async exportKNW() {
        const state = labStateManager.state;
        const label = this.versionLabelInput?.value || state.metadata.version_label || 'Unknown Graph';
        const { metadata, graphBlock } = await this.updateMetadata('knw', label);

        try {
            const result = await window.encodeKNWV2(metadata, graphBlock, state.positions || {});
            const knwBytes = result.bytes || result;

            LocalStorageManager.saveState(state);
            labStateManager.notifyStateChange();

            this.downloadBlob(knwBytes, `${label.toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'graph'}.knw`);
        } catch (err) {
            console.error('KNW export failed:', err);
            await dialogController.alert(`Failed to export .knw file: ${err.message}`, 'Export Error');
        }
    }

    /**
     * Export current resource overlay to a .rvr v1.0 file
     */
    async exportRVR() {
        const state = labStateManager.state;
        const label = this.versionLabelInput?.value || state.rvrMetadata.version_label || 'Unknown Overlay';
        const { metadata, resourcesBlock } = await this.updateMetadata('rvr', label);
        
        // Add graph-related coupling information to the metadata before exporting
        metadata['graph_data'] = {
            cid: state.metadata.cid,
            version_label: state.metadata.version_label
        }

        try {
            const result = await window.encodeRVRV1(metadata, resourcesBlock);
            const rvrBytes = result.bytes || result;

            LocalStorageManager.saveState(state);
            labStateManager.notifyStateChange();

            this.downloadBlob(rvrBytes, `${label.toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'overlay'}.rvr`);
        } catch (err) {
            console.error('RVR export failed:', err);
            await dialogController.alert(`Failed to export .rvr file: ${err.message}`, 'Export Error');
        }
    }

    async updateMetadata(format, newVersionLabel = null) {
        // Updates metadata in the state and returns the updated metadata and the graph/resources block
        // Does NOT change license
        const state = labStateManager.state;

        // Handle version label separately, changing version label does not by itself change cid/content
        if (newVersionLabel) {
            if (format === 'knw') state.metadata.version_label = newVersionLabel;
            if (format === 'rvr') state.rvrMetadata.version_label = newVersionLabel;
        }
        
        // Update graph regardless of format, as it's always required
        const graphBlock = this.buildGraphBlock();
        const graphCid = await window.computeCID(graphBlock);
        if (graphCid !== state.metadata.cid) {
            // Update metadata if cid changed
            state.metadata.cid = graphCid;
            const created = new Date().toISOString();
            state.metadata.created = created;
            state.metadata.copyright = this.updateCopyright(state.metadata.copyright, created);
        }

        if (format === 'rvr') {
            const resourcesBlock = this.buildResourcesBlock();
            const resourcesCid = await window.computeCID(resourcesBlock);
            if (resourcesCid !== state.rvrMetadata.cid) {
                // Update metadata if cid changed
                state.rvrMetadata.cid = resourcesCid;
                const created = new Date().toISOString();
                state.rvrMetadata.created = created;
                state.rvrMetadata.copyright = this.updateCopyright(state.rvrMetadata.copyright, created);
            }

            return { metadata: state.rvrMetadata, resourcesBlock };
        }
        
        return { metadata: state.metadata, graphBlock };
    }

    updateCopyright(copyright, created) {
        // Default copyright notice format
        if (!copyright) return `(C) ${created.slice(0, 4)} The Brotherhood Project`

        // TODO: Update copyright notice with the new date
        return copyright
    }

    /**
     * Download blob helper
     */
    downloadBlob(bytes, filename) {
        const blob = new Blob([bytes], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    _subscribeToTabChange() {
        labStateManager.onTabChange(tabName => {
            if (tabName !== 'save') return;

            // Automatically pick current label from state
            this.autoselectLabel();
        });
    }

    autoselectLabel() {
        const format = this.exportFormatSelect?.value || 'knw'
        this.versionLabelInput.value = format === 'knw' ? labStateManager.state.metadata.version_label || ''
            : labStateManager.state.rvrMetadata.version_label || '';
    }

}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ExportUIController };
} else {
    window.ExportUIController = ExportUIController;
}
