/**
 * Lab State Manager
 * Authoritative client state for the standalone Web Curator Lab.
 * Conforms to KNW v2.0 specification with isolated resources.
 */

class LabStateManager {
    constructor() {
        this.state = this.getInitialState();
        this.subscribers = [];
        this.activeTab = 'workspace';
    }

    /**
     * Get initial default state
     */
    getInitialState() {
        return {
            metadata: {
                cid: null,
                version_label: '',
                license: {
                    name: 'CC-BY-SA-4.0',
                    url: 'https://creativecommons.org/licenses/by-sa/4.0/'
                },
                copyright: '',
                created: null
            },
            // Dictionary keyed by local_id (number)
            nodes: {},
            // Dictionary keyed by local_id (number)
            domains: {},
            // Set of selected IDs
            selectedNodes: new Set(),
            selectedDomains: new Set(),
            // Set of collapsed domain IDs
            collapsedDomains: new Set(),
            // Permanent positions dictionary (now outside node objects and not calculated in CID)
            positions: {},
            // Temporary buffer positions dictionary keyed by local_id (number) -> {x, y}
            bufferPositions: {},
            // Dictionary keyed by local_id: Array of pathways (each pathway is an array of prerequisite node IDs)
            hyperedges: {},
            // Isolated resources for separate RVR export
            rvrMetadata: {
                cid: null,
                version_label: '',
                license: {
                    name: 'CC-BY-SA-4.0',
                    url: 'https://creativecommons.org/licenses/by-sa/4.0/'
                },
                copyright: '',
                created: null
            },
            resources: {
                bibliographies: {},             // Keys are local_id for quick lookup
                attachments: {}                 // Keys are node local_id and values are arrays of attachments
            },
            // Active source tray for attribution (up to 6 items)
            activeTray: [],
        };
    }

    /**
     * Load state from storage or import
     * @param {Object} loadedData
     */
    loadState(loadedData) {
        if (!loadedData) return;

        this.state = {
            metadata: {
                cid: loadedData.metadata?.cid || null,
                version_label: loadedData.metadata?.version_label || '',
                license: loadedData.metadata?.license || {
                    name: 'CC-BY-SA-4.0',
                    url: 'https://creativecommons.org/licenses/by-sa/4.0/'
                },
                copyright: loadedData.metadata?.copyright || '',
                created: loadedData.metadata?.created || null
            },
            nodes: loadedData.nodes || {},
            domains: loadedData.domains || {},
            selectedNodes: new Set(),
            selectedDomains: new Set(),
            collapsedDomains: new Set(loadedData.collapsedDomains || []),
            positions: loadedData.positions || {},
            bufferPositions: loadedData.bufferPositions || {},
            hyperedges: loadedData.hyperedges || {},
            rvrMetadata: {
                cid: loadedData.rvrMetadata?.cid || null,
                version_label: loadedData.rvrMetadata?.version_label || '',
                license: loadedData.rvrMetadata?.license || {
                    name: 'CC-BY-SA-4.0',
                    url: 'https://creativecommons.org/licenses/by-sa/4.0/'
                },
                copyright: loadedData.rvrMetadata?.copyright || '',
                created: loadedData.rvrMetadata?.created || null
            },
            resources: loadedData.resources || {
                bibliographies: {},
                attachments: {}
            },
            activeTray: loadedData.activeTray || [],
        };

        this.notifyStateChange();
    }

    /**
     * Reset workspace to fresh blank state
     */
    resetState() {
        this.state = this.getInitialState();
        this.notifyStateChange();
    }

    /**
     * Set active tab
     */
    setActiveTab(tabName) {
        this.activeTab = tabName;
        this.notifyTabChange(tabName);
    }

    getActiveTab() {
        return this.activeTab;
    }

    /**
     * Subscribe to state modifications
     */
    subscribe(callback) {
        if (typeof callback === 'function') {
            this.subscribers.push(callback);
        }
    }

    /**
     * Notify state change listeners
     */
    notifyStateChange() {
        if (this.subscribers && this.subscribers.length > 0) {
            this.subscribers.forEach(callback => {
                try {
                    callback(this.state);
                } catch (err) {
                    console.error('Error in state change subscriber:', err);
                }
            });
        }
    }

    onTabChange(callback) {
        if (!this.tabSubscribers) this.tabSubscribers = [];
        if (typeof callback === 'function') {
            this.tabSubscribers.push(callback);
        }
    }

    notifyTabChange(tabName) {
        if (this.tabSubscribers) {
            this.tabSubscribers.forEach(cb => {
                try {
                    cb(tabName);
                } catch (e) {
                    console.error('Error in tab change subscriber:', e);
                }
            });
        }
    }

    async loadGraph(payload, meta = {}) {
        if (!payload || payload.format !== 'knw') {
            throw new Error(`Invalid format: expected a .knw knowledge graph file, got "${payload?.format || 'unknown'}"`);
        }

        const hasExisting = Object.keys(this.state.nodes || {}).length > 0;
        if (hasExisting && window.dialogController) {
            const nodeCount = payload.graph?.nodes?.length || 0;
            const domainCount = payload.graph?.domains?.length || 0;
            const label = payload.metadata?.version_label || meta?.filename || 'Skill Graph';
            const confirmed = await window.dialogController.confirm(
                `Import graph "${label}" with ${nodeCount} nodes and ${domainCount} domains? Current workspace and resource overlay will be replaced.`,
                'Import Graph'
            );
            if (!confirmed) return false;
        }

        const { metadata = {}, graph = {}, positions = {} } = payload;
        const nodesDict = {};
        const domainsDict = {};
        const hyperedgesDict = {};

        if (Array.isArray(graph.domains)) {
            graph.domains.forEach(d => {
                const id = parseInt(d.local_id, 10);
                domainsDict[id] = {
                    local_id: id,
                    title: d.title || `Domain ${id}`,
                    description: d.description || '',
                    parent_id: d.parent_id !== null && d.parent_id !== undefined ? parseInt(d.parent_id, 10) : null
                };
            });
        }

        if (Array.isArray(graph.nodes)) {
            graph.nodes.forEach(n => {
                const id = parseInt(n.local_id, 10);
                nodesDict[id] = {
                    local_id: id,
                    title: n.title || `Node ${id}`,
                    description: n.description || '',
                    prerequisite: n.prerequisite || '',
                    mentions: Array.isArray(n.mentions) ? n.mentions : [],
                    domain_id: n.domain_id !== null && n.domain_id !== undefined ? parseInt(n.domain_id, 10) : null,
                    assessable: n.assessable !== false
                };

                if (n.prerequisite && typeof PrerequisiteUtils !== 'undefined') {
                    try {
                        hyperedgesDict[id] = PrerequisiteUtils.extractPathways(n.prerequisite);
                    } catch (e) {
                        hyperedgesDict[id] = [];
                    }
                } else {
                    hyperedgesDict[id] = [];
                }
            });
        }

        this.loadState({
            metadata: metadata,
            nodes: nodesDict,
            domains: domainsDict,
            hyperedges: hyperedgesDict,
            positions: positions,
            resources: { bibliographies: {}, attachments: {} }
        });

        if (typeof LocalStorageManager !== 'undefined') {
            LocalStorageManager.saveState(this.state);
        }
        this.notifyStateChange();

        if (window.dialogController) {
            await window.dialogController.alert(
                `Successfully imported Knowledge Graph "${metadata.version_label || meta?.filename || 'Skill Graph'}".`,
                'Import Success'
            );
        }
        return true;
    }

    async loadRVR(payload, meta = {}) {
        if (!payload || payload.format !== 'rvr') {
            throw new Error(`Invalid format: expected a .rvr resource overlay file, got "${payload?.format || 'unknown'}"`);
        }

        const hasGraph = Object.keys(this.state.nodes || {}).length > 0;
        if (!hasGraph) {
            if (window.dialogController) {
                await window.dialogController.alert(
                    'Cannot import resources without a loaded graph. Please import a .knw graph first.',
                    'No Graph Loaded'
                );
            }
            return false;
        }

        const { metadata = {}, resources = {} } = payload;
        const { graph_data, ...cleanMetadata } = metadata;

        const activeGraphCid = this.state.metadata?.cid;
        const targetGraphCid = graph_data?.cid || payload.graph_cid || null;

        if (activeGraphCid && targetGraphCid && activeGraphCid !== targetGraphCid) {
            if (window.dialogController) {
                const proceed = await window.dialogController.confirm(
                    `Graph CID Mismatch Warning!\n\n` +
                    `This resource overlay was created for graph CID:\n${targetGraphCid}\n\n` +
                    `The currently loaded graph has CID:\n${activeGraphCid}\n\n` +
                    `Node attachments may not line up with the current graph concepts.\n\n` +
                    `Do you want to proceed anyway?`,
                    'CID Mismatch Confirmation'
                );
                if (!proceed) return false;
            }
        }

        const bibList = resources.bibliographies || [];
        const attList = resources.attachments || [];

        if (window.dialogController) {
            const confirmed = await window.dialogController.confirm(
                `Import resource overlay "${cleanMetadata.version_label || meta?.filename || 'Overlay'}" (${bibList.length} sources, ${attList.length} attachments)? This will replace the previous overlay for this graph.`,
                'Import Resource Overlay'
            );
            if (!confirmed) return false;
        }

        const bibliographiesDict = {};
        bibList.forEach(b => {
            const id = parseInt(b.local_id, 10);
            bibliographiesDict[id] = {
                local_id: id,
                title: b.title || '',
                bib_type: b.bib_type || 'other',
                author: b.author || '',
                year: b.year ?? null,
                url: b.url || '',
                notes: b.notes || '',
                raw_citation: b.raw_citation || ''
            };
        });

        const attachmentsDict = {};
        attList.forEach(a => {
            const nodeId = parseInt(a.node_id, 10);
            if (!attachmentsDict[nodeId]) {
                attachmentsDict[nodeId] = [];
            }
            attachmentsDict[nodeId].push({
                local_id: a.local_id !== undefined ? parseInt(a.local_id, 10) : null,
                node_id: nodeId,
                bib_id: a.bib_id !== undefined && a.bib_id !== null ? parseInt(a.bib_id, 10) : null,
                locator: a.locator || '',
                commentary: a.commentary || '',
                purpose: a.purpose || '',
                attribution_type: a.attribution_type || 'manual'
            });
        });

        this.state.rvrMetadata = cleanMetadata;
        this.state.resources = {
            bibliographies: bibliographiesDict,
            attachments: attachmentsDict
        };

        if (typeof LocalStorageManager !== 'undefined') {
            LocalStorageManager.saveState(this.state);
        }
        this.notifyStateChange();

        if (window.dialogController) {
            await window.dialogController.alert(
                `Successfully imported Resource Overlay "${cleanMetadata.version_label || meta?.filename || 'Overlay'}".`,
                'Import Success'
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
                description: 'Import a complete skill graph and domain structure (KNW v2.0). Replaces current workspace graph and resource overlay.',
                callback: (payload, meta) => this.loadGraph(payload, meta)
            },
            {
                type: 'rvr',
                label: 'Resource Overlay (.rvr)',
                accept: '.rvr',
                description: 'Import curated learning resources, citations, and attachments (RVR v1.0). Replaces current overlay.',
                callback: (payload, meta) => this.loadRVR(payload, meta)
            }
        ];
    }
}

// Singleton instance
const labStateManager = new LabStateManager();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LabStateManager, labStateManager };
} else {
    window.LabStateManager = LabStateManager;
    window.labStateManager = labStateManager;
}
