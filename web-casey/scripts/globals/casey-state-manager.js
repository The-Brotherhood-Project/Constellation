/**
 * Casey State Manager
 * Authoritative single client state store for Casey.
 * Manages active graph, multi-RVR overlays, disparate capability records,
 * and self-assessment state.
 */

class CaseyStateManager {
    constructor() {
        this.state = this.getInitialState();
        this.subscribers = [];
        this.activeTab = 'learning';
    }

    getInitialState() {
        return {
            // 1. Active Skill Graph (.knw v2)
            graph: {
                metadata: {
                    cid: null,
                    version_label: '',
                    license: { name: 'CC-BY-SA-4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
                    copyright: '',
                    created: null
                },
                nodes: {},
                domains: {},
                hyperedges: {},
                positions: {},
                bufferPositions: {},
                collapsedDomains: new Set()
            },

            // 2. Multi-RVR Overlays
            resources: {
                rvrMetadatas: [],
                bibliographies: {},   // keyed by `${rvr_cid}:${source_local_id}`
                attachments: {},      // keyed by node_id -> array of attachment objects
                unresolved: []
            },

            // 3. Capability Records (.cpb v1)
            capabilities: {
                records: [],
                activeCapabilityId: 'self-assessment'
            },

            // 4. Self-Assessment (lives in state, also serializable as CPB)
            selfAssessment: {
                algorithm_data: {
                    name: 'self-assessment',
                    version: '1.0.0',
                    did: 'did:alg:61d4c5c8-c22f-4e16-b2b7-0becf09b8e21'
                },
                assessments: {}
                // [nodeId]: { status: 'want_to'|'in_progress'|'mastered', notes: '', last_updated: ISO }
            },

            // 5. UI state
            uiState: {
                selectedNodeId: null,
                selectedDomainId: null
            }
        };
    }

    loadState(loaded) {
        if (!loaded) return;
        this.state = {
            graph: {
                metadata: {
                    cid: loaded.graph?.metadata?.cid || null,
                    version_label: loaded.graph?.metadata?.version_label || '',
                    license: loaded.graph?.metadata?.license || { name: 'CC-BY-SA-4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
                    copyright: loaded.graph?.metadata?.copyright || '',
                    created: loaded.graph?.metadata?.created || null
                },
                nodes: loaded.graph?.nodes || {},
                domains: loaded.graph?.domains || {},
                hyperedges: loaded.graph?.hyperedges || {},
                positions: loaded.graph?.positions || {},
                bufferPositions: {},
                collapsedDomains: new Set()
            },
            resources: {
                rvrMetadatas: loaded.resources?.rvrMetadatas || [],
                bibliographies: loaded.resources?.bibliographies || {},
                attachments: loaded.resources?.attachments || {},
                unresolved: loaded.resources?.unresolved || []
            },
            capabilities: {
                records: loaded.capabilities?.records || [],
                activeCapabilityId: loaded.capabilities?.activeCapabilityId || 'self-assessment'
            },
            selfAssessment: {
                algorithm_data: loaded.selfAssessment?.algorithm_data || {
                    name: 'self-assessment',
                    version: '1.0.0',
                    did: 'did:alg:61d4c5c8-c22f-4e16-b2b7-0becf09b8e21'
                },
                assessments: loaded.selfAssessment?.assessments || {}
            },
            uiState: {
                selectedNodeId: null,
                selectedDomainId: null
            }
        };
        this.notifyStateChange();
    }

    subscribe(callback) {
        this.subscribers.push(callback);
    }

    notifyStateChange() {
        for (const cb of this.subscribers) {
            try { cb(this.state); } catch (e) { console.error('Subscriber error:', e); }
        }
    }

    getActiveTab() { return this.activeTab; }

    setActiveTab(tabName) {
        this.activeTab = tabName;
        this.notifyStateChange();
    }

    resetWorkspace() {
        this.state = this.getInitialState();
        this.notifyStateChange();
    }

    async loadGraph(payload, meta = {}) {
        if (!payload || payload.format !== 'knw') {
            throw new Error(`Invalid format: expected a .knw knowledge graph file, got "${payload?.format || 'unknown'}"`);
        }

        const hasExisting = Object.keys(this.state.graph?.nodes || {}).length > 0;
        if (hasExisting && window.dialogController) {
            const nodeCount = payload.graph?.nodes?.length || 0;
            const label = payload.metadata?.version_label || meta?.filename || 'Skill Graph';
            const confirmed = await window.dialogController.confirm(
                `Import graph "${label}" with ${nodeCount} nodes? Current workspace graph and attached resources will be deleted.`,
                'Import Knowledge Graph'
            );
            if (!confirmed) return false;
        }

        if (typeof GraphOps !== 'undefined') {
            GraphOps.loadGraph(payload);
        } else {
            throw new Error('GraphOps not available');
        }

        if (window.dialogController) {
            await window.dialogController.alert(
                `Successfully loaded Knowledge Graph "${payload.metadata?.version_label || meta?.filename || 'Skill Graph'}".`,
                'Import Complete'
            );
        }
        return true;
    }

    async loadRVR(payload, meta = {}) {
        if (!payload || payload.format !== 'rvr') {
            throw new Error(`Invalid format: expected a .rvr resource overlay file, got "${payload?.format || 'unknown'}"`);
        }

        const hasGraph = Object.keys(this.state.graph?.nodes || {}).length > 0;
        if (!hasGraph) {
            if (window.dialogController) {
                await window.dialogController.alert(
                    'Cannot import resources without a loaded graph. Please import a .knw knowledge graph first.',
                    'No Graph Loaded'
                );
            }
            return false;
        }

        const activeGraphCid = this.state.graph.metadata.cid;
        const targetGraphCid = payload.graph_cid
            || payload.metadata?.graph_cid
            || payload.metadata?.graph_data?.cid
            || null;

        let forceMismatch = false;
        if (activeGraphCid && targetGraphCid && activeGraphCid !== targetGraphCid) {
            if (window.dialogController) {
                const proceed = await window.dialogController.confirm(
                    `Graph CID Mismatch Warning!\n\n` +
                    `This resource overlay was created for graph CID:\n${targetGraphCid}\n\n` +
                    `The currently loaded graph has CID:\n${activeGraphCid}\n\n` +
                    `The node IDs in this overlay may not represent the same concepts/skills in your graph, which could be misleading.\n\n` +
                    `Do you want to force import anyway?`,
                    'CID Mismatch Confirmation'
                );
                if (!proceed) return false;
                forceMismatch = true;
            }
        }

        if (typeof ResourceOps !== 'undefined') {
            ResourceOps.importRVR(payload, forceMismatch);
        } else {
            throw new Error('ResourceOps not available');
        }

        const bibCount = payload.resources?.bibliographies?.length || 0;
        const attCount = payload.resources?.attachments?.length || 0;
        if (window.dialogController) {
            await window.dialogController.alert(
                `Successfully imported resource overlay "${payload.metadata?.version_label || meta?.filename || 'Overlay'}" (${bibCount} bibliographies, ${attCount} attachments).`,
                'Import Complete'
            );
        }
        return true;
    }

    async loadCPB(payload, meta = {}) {
        if (!payload || payload.format !== 'cpb') {
            throw new Error(`Invalid format: expected a .cpb capability file, got "${payload?.format || 'unknown'}"`);
        }

        const hasGraph = Object.keys(this.state.graph?.nodes || {}).length > 0;
        if (!hasGraph) {
            if (window.dialogController) {
                await window.dialogController.alert(
                    'Cannot import capability records without a loaded graph. Please import a .knw knowledge graph first.',
                    'No Graph Loaded'
                );
            }
            return false;
        }

        const activeGraphCid = this.state.graph.metadata.cid;
        const targetGraphCid = payload.metadata?.graph_data?.cid;

        let forceMismatch = false;
        if (activeGraphCid && targetGraphCid && activeGraphCid !== targetGraphCid) {
            if (window.dialogController) {
                const proceed = await window.dialogController.confirm(
                    `Graph CID Mismatch Warning!\n\n` +
                    `This capability profile was generated for graph CID:\n${targetGraphCid}\n\n` +
                    `The currently loaded graph has CID:\n${activeGraphCid}\n\n` +
                    `Node capability ratings may not correspond accurately to the concepts in this graph.\n\n` +
                    `Do you want to force import anyway?`,
                    'CID Mismatch Confirmation'
                );
                if (!proceed) return false;
                forceMismatch = true;
            }
        }

        const isSelfAssessment = typeof CapabilityOps !== 'undefined' && CapabilityOps.isSelfAssessment(payload);
        if (isSelfAssessment && window.dialogController) {
            const mergeAsActive = await window.dialogController.confirm(
                'This capability file is recognized as a Self-Assessment record.\n\n' +
                'Click "OK" to merge this into your active Self-Assessment progress,\n' +
                'or "Cancel" to import it as a separate read-only capability file.',
                'Self-Assessment Detected'
            );

            if (mergeAsActive) {
                CapabilityOps.importCPB(payload, true, forceMismatch);
                await window.dialogController.alert(
                    'Self-assessment progress merged successfully.',
                    'Assessment Updated'
                );
                return true;
            }
        }

        if (typeof CapabilityOps !== 'undefined') {
            CapabilityOps.importCPB(payload, false, forceMismatch);
        } else {
            throw new Error('CapabilityOps not available');
        }

        const algName = payload.metadata?.algorithm_data?.name || 'Capability Record';
        const count = payload.capabilities?.length || 0;
        if (window.dialogController) {
            await window.dialogController.alert(
                `Successfully imported capability profile "${algName}" with ${count} evaluated nodes.`,
                'Import Complete'
            );
        }
        return true;
    }

    getImporterConfigs() {
        return [
            {
                type: 'knw',
                label: 'Knowledge Graph (.knw)',
                accept: '.knw',
                description: 'Import a complete skill graph and domain hierarchy (KNW v2.0). Replaces current workspace graph.',
                callback: (payload, meta) => this.loadGraph(payload, meta)
            },
            {
                type: 'rvr',
                label: 'Resource Overlay (.rvr)',
                accept: '.rvr',
                description: 'Overlay curated learning resources, citations, and attachments (RVR v1.0).',
                callback: (payload, meta) => this.loadRVR(payload, meta)
            },
            {
                type: 'cpb',
                label: 'Capability Profile (.cpb)',
                accept: '.cpb',
                description: 'Import capability assessment records, evaluator metrics, or self-assessment progress (CPB v1.0).',
                callback: (payload, meta) => this.loadCPB(payload, meta)
            }
        ];
    }
}

const caseyStateManager = new CaseyStateManager();
window.CaseyStateManager = CaseyStateManager;
window.caseyStateManager = caseyStateManager;
