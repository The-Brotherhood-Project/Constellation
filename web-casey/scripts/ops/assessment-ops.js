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
 * Assessment Operations for Casey
 * 3-tier self-assessment CRUD + canonical CPB payload builder.
 * issuer_did and signature are always null (self-reported).
 * user_did comes from settingsManager; if blank, exports with null after confirmation.
 */

class AssessmentOps {
    static setAssessment(nodeId, status, notes) {
        if (!status) return;
        const id = parseInt(nodeId, 10);
        if (isNaN(id)) throw new Error('Invalid node ID');
        const allowed = ['want_to', 'in_progress', 'mastered'];
        if (!allowed.includes(status)) throw new Error('Invalid status: ' + status);

        caseyStateManager.state.selfAssessment.assessments[id] = {
            status,
            notes: (notes || '').trim(),
            last_updated: new Date().toISOString()
        };
        LocalStorageManager.saveState(caseyStateManager.state);
        caseyStateManager.notifyStateChange();
    }

    static removeAssessment(nodeId) {
        const id = parseInt(nodeId, 10);
        if (!isNaN(id) && caseyStateManager.state.selfAssessment.assessments[id]) {
            delete caseyStateManager.state.selfAssessment.assessments[id];
            LocalStorageManager.saveState(caseyStateManager.state);
            caseyStateManager.notifyStateChange();
        }
    }

    /**
     * Build canonical CPB v1 payload for export.
     * user_did is taken from settingsManager – if empty, caller should confirm before proceeding.
     * issuer_did and signature are always null.
     */
    static prepareSelfAssessmentCPB(options) {
        options = options || {};
        const graphMeta = caseyStateManager.state.graph.metadata;
        const assessments = caseyStateManager.state.selfAssessment.assessments || {};
        const algData = caseyStateManager.state.selfAssessment.algorithm_data;
        const userDid = (window.settingsManager ? window.settingsManager.getUserDid() : '') || null;

        const capabilities = [];
        for (const [nodeIdStr, item] of Object.entries(assessments)) {
            capabilities.push({
                node_id: parseInt(nodeIdStr, 10),
                result: {
                    primary: item.status,
                    notes: item.notes || '',
                    last_updated: item.last_updated || new Date().toISOString()
                }
            });
        }
        capabilities.sort((a, b) => a.node_id - b.node_id);

        return {
            metadata: {
                user_did: userDid,
                issuer_did: null,
                graph_data: {
                    cid: graphMeta.cid || null,
                    version_label: options.versionLabel || graphMeta.version_label || ''
                },
                algorithm_data: {
                    did: algData.did,
                    name: algData.name,
                    version: algData.version
                },
                created: new Date().toISOString(),
                use_before: null,
                signature: null
            },
            capabilities,
            evaluation_set: []
        };
    }
}

window.AssessmentOps = AssessmentOps;
