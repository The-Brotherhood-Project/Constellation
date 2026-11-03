/**
 * Capability Operations for Casey
 * Manages disparate CPB records, metric parsing, and highlight mapping.
 */

const SELF_ASSESSMENT_ALG_DID = 'did:alg:61d4c5c8-c22f-4e16-b2b7-0becf09b8e21';

class CapabilityOps {
    static isSelfAssessment(cpbPayload) {
        if (!cpbPayload?.metadata) return false;
        const alg = cpbPayload.metadata.algorithm_data || {};
        return alg.did === SELF_ASSESSMENT_ALG_DID
            || (alg.name || '').toLowerCase() === 'self-assessment';
    }

    /**
     * Import a CPB payload.
     * @param {Object} cpbPayload
     * @param {boolean} mergeAsSelf - merge entries into local self-assessment
     * @param {boolean} forceMismatch - bypass graph CID guard
     */
    static importCPB(cpbPayload, mergeAsSelf, forceMismatch) {
        if (!cpbPayload?.metadata) throw new Error('Invalid CPB payload');

        const activeGraphCid = caseyStateManager.state.graph.metadata.cid;
        const targetGraphCid = cpbPayload.metadata.graph_data?.cid;
        const isMismatch = activeGraphCid && targetGraphCid && activeGraphCid !== targetGraphCid;

        if (isMismatch && !forceMismatch) {
            throw new Error('GRAPH_CID_MISMATCH:' + targetGraphCid + ':' + activeGraphCid);
        }

        if (mergeAsSelf) {
            for (const cap of (cpbPayload.capabilities || [])) {
                const nodeId = parseInt(cap.node_id, 10);
                if (isNaN(nodeId)) continue;
                let status = 'in_progress';
                if (cap.result && typeof cap.result === 'object') {
                    const prim = String(cap.result.primary || '').toLowerCase();
                    if (['want_to', 'in_progress', 'mastered'].includes(prim)) status = prim;
                    else if (['true', 'passed', 'yes', 'complete', 'mastered'].includes(prim)) status = 'mastered';
                }
                caseyStateManager.state.selfAssessment.assessments[nodeId] = {
                    status,
                    notes: (cap.result && cap.result.notes) || '',
                    last_updated: new Date().toISOString()
                };
            }
            caseyStateManager.state.capabilities.activeCapabilityId = 'self-assessment';
            LocalStorageManager.saveState(caseyStateManager.state);
            caseyStateManager.notifyStateChange();
            return { type: 'merged_self_assessment' };
        }

        const recordId = cpbPayload.cid || ('cpb-' + Date.now());
        const algName = cpbPayload.metadata.algorithm_data?.name || '';
        const issuerSnippet = (cpbPayload.metadata.issuer_did || 'Anonymous').slice(0, 16);
        const recordName = algName
            ? algName + ' (' + issuerSnippet + ')'
            : 'Capability ' + recordId.slice(0, 8);

        const record = {
            id: recordId,
            name: recordName,
            isSelfAssessment: false,
            metadata: cpbPayload.metadata,
            capabilities: cpbPayload.capabilities || [],
            evaluation_set: cpbPayload.evaluation_set || [],
            is_mismatch: !!isMismatch,
            imported_at: new Date().toISOString()
        };

        const existing = caseyStateManager.state.capabilities.records.findIndex(r => r.id === recordId);
        if (existing >= 0) caseyStateManager.state.capabilities.records[existing] = record;
        else caseyStateManager.state.capabilities.records.push(record);

        caseyStateManager.state.capabilities.activeCapabilityId = recordId;
        LocalStorageManager.saveState(caseyStateManager.state);
        caseyStateManager.notifyStateChange();
        return { type: 'record_imported', recordId };
    }

    /**
     * Map a result.primary value to a vis highlight group index.
     * Group 1 = Gray (want_to / false / low)
     * Group 2 = Orange (in_progress / medium)
     * Group 3 = Green (mastered / true / high)
     * Group 4 = Blue (unassessed / default)
     */
    static parseMetricToGroup(primaryVal) {
        if (primaryVal === undefined || primaryVal === null || primaryVal === '') return 4;

        if (typeof primaryVal === 'boolean') return primaryVal ? 3 : 1;

        const s = String(primaryVal).trim().toLowerCase();

        if (['true', 'yes', 'passed', 'pass', 'complete', 'completed', 'mastered'].includes(s)) return 3;
        if (['false', 'no', 'failed', 'fail', 'none', 'unknown', 'not_started', 'want_to'].includes(s)) return 1;
        if (['in_progress', 'practiced', 'familiar', 'partial'].includes(s)) return 2;

        const n = parseFloat(s);
        if (!isNaN(n)) {
            // Continuous 0–1 float
            if (n >= 0 && n <= 1) {
                if (n < 0.35) return 1;
                if (n < 0.75) return 2;
                return 3;
            }
            // Integer scale (1–5 or 1–3)
            if (n <= 1) return 1;
            if (n <= 3) return 2;
            return 3;
        }

        return 2; // Unknown → neutral
    }

    /**
     * Build a map of { nodeId -> highlight group } for the active capability.
     */
    static getActiveHighlightMap() {
        const state = caseyStateManager.state;
        const activeId = state.capabilities.activeCapabilityId;
        const map = {};

        if (activeId === 'self-assessment') {
            for (const [nodeIdStr, item] of Object.entries(state.selfAssessment.assessments || {})) {
                const id = parseInt(nodeIdStr, 10);
                if (item.status === 'want_to') map[id] = 1;
                else if (item.status === 'in_progress') map[id] = 2;
                else if (item.status === 'mastered') map[id] = 3;
            }
            return map;
        }

        const record = state.capabilities.records.find(r => r.id === activeId);
        if (record) {
            for (const cap of (record.capabilities || [])) {
                const id = parseInt(cap.node_id, 10);
                if (!isNaN(id)) {
                    const primary = (cap.result && typeof cap.result === 'object') ? cap.result.primary : cap.result;
                    map[id] = CapabilityOps.parseMetricToGroup(primary);
                }
            }
        }
        return map;
    }

    static setActive(capabilityId) {
        caseyStateManager.state.capabilities.activeCapabilityId = capabilityId;
        caseyStateManager.notifyStateChange();
    }
}

window.CapabilityOps = CapabilityOps;
window.SELF_ASSESSMENT_ALG_DID = SELF_ASSESSMENT_ALG_DID;
