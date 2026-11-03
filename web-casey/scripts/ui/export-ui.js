/**
 * Export UI Controller for Casey
 * - Shows self-assessment metadata summary
 * - Saves localStorage snapshot
 * - Encodes and downloads self-assessment as .cpb binary
 *
 * user_did is taken from settingsManager; if blank, user is warned and asked to confirm
 * before exporting with null user_did.
 */

class ExportUIController {
    constructor() {
        this.versionLabelInput = document.getElementById('export-version-label');
        this.btnSaveSnapshot = document.getElementById('btn-save-snapshot');
        this.btnExportCpb = document.getElementById('btn-export-cpb');

        this._bindButtons();

        caseyStateManager.subscribe((state) => this._render(state));
    }

    _bindButtons() {
        if (this.btnSaveSnapshot) {
            this.btnSaveSnapshot.addEventListener('click', async () => {
                const ok = LocalStorageManager.saveState(caseyStateManager.state);
                if (ok) dialogController.alert('Workspace snapshot saved to local storage.', 'Snapshot Saved');
                else dialogController.alert('Could not save to storage.', 'Storage Error');
            });
        }

        if (this.btnExportCpb) {
            this.btnExportCpb.addEventListener('click', () => this._exportCPB());
        }
    }

    async _exportCPB() {
        const state = caseyStateManager.state;
        const hasGraph = Object.keys(state.graph.nodes || {}).length > 0;

        if (!hasGraph) {
            dialogController.alert('No Skill Graph loaded — cannot export.', 'No Graph');
            return;
        }

        // Warn if user_did is blank
        const userDid = window.settingsManager ? settingsManager.getUserDid() : '';
        if (!userDid) {
            const proceed = await dialogController.confirm(
                'You have not set a User DID in Settings.\n\n' +
                'The exported capability file will have user_did = null.\n\n' +
                'Proceed with export anyway?',
                'No User DID'
            );
            if (!proceed) return;
        }

        const assessCount = Object.keys(state.selfAssessment.assessments || {}).length;
        if (assessCount === 0) {
            const proceed = await dialogController.confirm(
                'You have no assessments recorded. Export an empty capability file anyway?',
                'Empty Assessment'
            );
            if (!proceed) return;
        }

        try {
            const versionLabel = this.versionLabelInput ? this.versionLabelInput.value.trim() : '';
            const payload = AssessmentOps.prepareSelfAssessmentCPB({ versionLabel });
            const result = await encodeCPBV1(payload);

            const blob = new Blob([result.bytes], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const safeLabel = (versionLabel || 'self-assessment').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
            a.href = url;
            a.download = safeLabel + '-' + result.cid.slice(0, 8) + '.cpb';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            dialogController.alert('Exported "' + a.download + '".\n\nCID: ' + result.cid, 'Export Complete');
        } catch (err) {
            console.error('Export error:', err);
            dialogController.alert('Export failed: ' + err.message, 'Export Error');
        }
    }

    _render(state) {
        const graphMeta = state.graph.metadata;
        const alg = state.selfAssessment.algorithm_data;
        const count = Object.keys(state.selfAssessment.assessments || {}).length;
        const userDid = window.settingsManager ? settingsManager.getUserDid() : '';

        const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
        set('meta-alg-name', alg?.name || 'self-assessment');
        set('meta-alg-version', alg?.version || '1.0.0');
        set('meta-alg-did', alg?.did || 'did:alg:61d4c5c8-c22f-4e16-b2b7-0becf09b8e21');
        set('meta-graph-cid', graphMeta.cid || 'None');
        set('meta-user-did', userDid || '(not set — will export as null)');
        set('meta-assessed-count', count + ' node' + (count === 1 ? '' : 's'));
    }
}

window.ExportUIController = ExportUIController;
