/**
 * Resource Operations for Casey
 * Manages multi-RVR overlays. Mushes multiple RVRs with composite `${rvr_cid}:${local_id}` keys.
 */

class ResourceOps {
    /**
     * Import and overlay an RVR payload onto current state.
     * @param {Object} rvrData - decoded RVR payload { metadata, resources }
     * @param {boolean} forceMismatch - bypass graph CID mismatch guard
     */
    static importRVR(rvrData, forceMismatch) {
        if (!rvrData || !rvrData.resources) throw new Error('Invalid RVR resource payload');

        const rvrCid = rvrData.metadata?.cid || ('rvr-' + Date.now());
        const activeGraphCid = caseyStateManager.state.graph.metadata.cid;
        const targetGraphCid = rvrData.metadata?.graph_cid
            || rvrData.metadata?.graph_data?.cid
            || null;

        const isMismatch = activeGraphCid && targetGraphCid && activeGraphCid !== targetGraphCid;
        if (isMismatch && !forceMismatch) {
            throw new Error('GRAPH_CID_MISMATCH:' + targetGraphCid + ':' + activeGraphCid);
        }

        const rvrMeta = {
            cid: rvrCid,
            version_label: rvrData.metadata?.version_label || '',
            license: rvrData.metadata?.license || {},
            copyright: rvrData.metadata?.copyright || '',
            created: rvrData.metadata?.created || new Date().toISOString(),
            graph_cid: targetGraphCid,
            is_mismatch: !!isMismatch
        };

        // Append or replace in rvrMetadatas array
        const idx = caseyStateManager.state.resources.rvrMetadatas.findIndex(m => m.cid === rvrCid);
        if (idx >= 0) {
            caseyStateManager.state.resources.rvrMetadatas[idx] = rvrMeta;
        } else {
            caseyStateManager.state.resources.rvrMetadatas.push(rvrMeta);
        }

        // Mush bibliographies: composite key `${rvrCid}:${local_id}`
        const bibs = rvrData.resources.bibliographies || [];
        for (const bib of bibs) {
            const localId = bib.local_id ?? bib.id;
            const key = rvrCid + ':' + localId;
            caseyStateManager.state.resources.bibliographies[key] = {
                ...bib,
                composite_key: key,
                rvr_cid: rvrCid,
                origin_local_id: localId
            };
        }

        // Mush attachments onto node buckets
        const graphNodes = caseyStateManager.state.graph.nodes || {};
        const atts = rvrData.resources.attachments || [];
        for (const att of atts) {
            const nodeId = parseInt(att.node_id ?? att.node_local_id, 10);
            const sourceId = att.bib_id ?? att.source_id;
            const compositeKey = rvrCid + ':' + sourceId;
            const entry = {
                rvr_cid: rvrCid,
                source_composite_key: compositeKey,
                source_id: sourceId,
                node_id: nodeId,
                fragment: att.fragment || '',
                notes: att.notes || ''
            };

            if (!isNaN(nodeId)) {
                if (!caseyStateManager.state.resources.attachments[nodeId]) {
                    caseyStateManager.state.resources.attachments[nodeId] = [];
                }
                const exists = caseyStateManager.state.resources.attachments[nodeId].some(
                    a => a.source_composite_key === compositeKey && a.fragment === entry.fragment
                );
                if (!exists) caseyStateManager.state.resources.attachments[nodeId].push(entry);

                if (!graphNodes[nodeId]) {
                    caseyStateManager.state.resources.unresolved.push(entry);
                }
            }
        }

        LocalStorageManager.saveState(caseyStateManager.state);
        caseyStateManager.notifyStateChange();
    }

    /**
     * Return all attachments with full bibliography details for a node.
     */
    static getResourcesForNode(nodeId) {
        const attList = caseyStateManager.state.resources.attachments[nodeId] || [];
        return attList.map(att => ({
            ...att,
            bibliography: caseyStateManager.state.resources.bibliographies[att.source_composite_key] || null
        }));
    }

    static clearResources() {
        caseyStateManager.state.resources = { rvrMetadatas: [], bibliographies: {}, attachments: {}, unresolved: [] };
        LocalStorageManager.saveState(caseyStateManager.state);
        caseyStateManager.notifyStateChange();
    }

    /**
     * Get a Map of node ID -> count of active attachments for graph badges (showSourceCount: true).
     * @returns {Map<number, number>}
     */
    static getSourceCountByNodeId() {
        const countMap = new Map();
        const attDict = caseyStateManager.state.resources?.attachments || {};

        for (const [nodeIdStr, attList] of Object.entries(attDict)) {
            const nodeId = parseInt(nodeIdStr, 10);
            if (Array.isArray(attList) && attList.length > 0) {
                countMap.set(nodeId, attList.length);
            }
        }

        return countMap;
    }
}

window.ResourceOps = ResourceOps;
