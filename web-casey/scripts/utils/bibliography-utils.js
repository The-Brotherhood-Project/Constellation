/**
 * Bibliography Utilities
 * Stateless helper functions for hashing, bibliography filtering, sorting, and graph queries.
 * No domain state is stored here.
 */

class BibliographyUtils {
    /**
     * Compute a deterministic 32-bit hex hash for a bibliography source.
     * @param {Object} bib - { title, author, year, bib_type, url }
     * @returns {string} 8-character hex string
     */
    static computeBibHash(bib) {
        if (!bib) return '00000000';
        const title = (bib.title || '').trim().toLowerCase();
        const author = (bib.author || '').trim().toLowerCase();
        const year = bib.year != null ? String(bib.year).trim() : '';
        const type = (bib.bib_type || bib.type || 'Other').trim().toLowerCase();
        const url = (bib.url || '').trim().toLowerCase();

        const seed = `${title}|${author}|${year}|${type}|${url}`;
        let h = 0;
        for (let i = 0; i < seed.length; i++) {
            h = ((h << 5) - h) + seed.charCodeAt(i);
            h |= 0;
        }
        return (h >>> 0).toString(16).padStart(8, '0');
    }

    /**
     * BFS traversal over node prerequisites up to `maxDepth` hops away from starting nodes.
     * Useful for the "Nearby nodes" sorting algorithm.
     * Supports single startNodeId or an iterable/array/Set of startNodeIds.
     * @param {number|Iterable<number>} startNodeIds - Root node ID or iterable of root node IDs to explore from
     * @param {number} maxDepth - Max number of hops (e.g. 2)
     * @param {Object} hyperedges - state.hyperedges dictionary
     * @returns {Set<number>} Set of reachable node IDs (including starting nodes)
     */
    static bfsNearbyNodes(startNodeIds, maxDepth, hyperedges) {
        const result = new Set();
        if (startNodeIds == null || !hyperedges) return result;

        // Normalize startNodeIds to an array
        let starts = [];
        if (typeof startNodeIds[Symbol.iterator] === 'function' && typeof startNodeIds !== 'string') {
            starts = Array.from(startNodeIds);
        } else {
            starts = [startNodeIds];
        }

        const visited = new Set();
        const queue = [];

        const depth = Math.max(0, maxDepth | 0);
        for (const s of starts) {
            const num = parseInt(s, 10);
            if (!isNaN(num) && !visited.has(num)) {
                visited.add(num);
                result.add(num);
                queue.push([num, depth]);
            }
        }

        while (queue.length > 0) {
            const [currentId, remaining] = queue.shift();
            if (remaining <= 0) continue;

            const pathways = hyperedges[currentId] || [];
            for (const pathway of pathways) {
                const prereqIds = pathway instanceof Set ? [...pathway] : (Array.isArray(pathway) ? pathway : []);
                for (const prereqId of prereqIds) {
                    const numId = parseInt(prereqId, 10);
                    if (isNaN(numId) || visited.has(numId)) continue;
                    visited.add(numId);
                    result.add(numId);
                    queue.push([numId, remaining - 1]);
                }
            }
        }

        return result;
    }

    /**
     * Filter and sort bibliography records.
     * @param {Array<Object>} bibList - List of bibliography objects with usage metadata
     * @param {string} query - Search string
     * @param {string} sortKey - 'alphabetical' | 'most-used' | 'recently-added' | 'nearby'
     * @param {Set<number>|null} nearbyNodeIds - Precomputed set of nearby node IDs if sortKey is 'nearby'
     * @returns {Array<Object>}
     */
    static filterAndSort(bibList, query = '', sortKey = 'alphabetical', nearbyNodeIds = null) {
        if (!Array.isArray(bibList)) return [];

        let results = bibList.slice();
        const q = (query || '').toLowerCase().trim();

        if (q) {
            results = results.filter(b =>
                (b.title || '').toLowerCase().includes(q) ||
                (b.author || '').toLowerCase().includes(q) ||
                String(b.year || '').includes(q)
            );
        }

        if (sortKey === 'alphabetical') {
            results.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        } else if (sortKey === 'most-used') {
            results.sort((a, b) => (b.count || 0) - (a.count || 0));
        } else if (sortKey === 'recently-added') {
            // Sort by local_id descending (higher ID was created later)
            results.sort((a, b) => (b.local_id || 0) - (a.local_id || 0));
        } else if (sortKey === 'nearby' && nearbyNodeIds && nearbyNodeIds.size > 0) {
            // Score by whether references touch the nearby node IDs
            const score = (b) => {
                const refs = Array.isArray(b.references) ? b.references : [];
                return refs.some(nodeId => nearbyNodeIds.has(nodeId)) ? 0 : 1;
            };
            results.sort((a, b) => {
                const diff = score(a) - score(b);
                if (diff !== 0) return diff;
                return (b.count || 0) - (a.count || 0);
            });
        }

        return results;
    }

    static _escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Constructs a targeted url based on the given parameters.
     * @param {string} url 
     * @param {string} type 
     * @param {string | number} start 
     * @param {string | number} end 
     */
    static _constructUrl(url, type = 'other', start = null, end = null) {
        if (!url) return '';
        const cleaned = this._escapeHtml(url.trim());

        if (type.toLowerCase() === 'pdf') {
            if (!start) return cleaned;
            if (Number.isInteger(start)) return cleaned.concat('#page=' + start);

            // Unknown type, ignore
            if (typeof start !== 'string') return cleaned;
            const s = start.replaceAll('page', '').replaceAll('pg.', '').replaceAll('pg', '')
                .replaceAll('pp.', '').replaceAll('p.', '').replaceAll('p', '').trim();
            
            // If it is a number, then add 'page=', or it must be a simple destination
            if (Number.isInteger(Number(s))) return cleaned.concat('#page=' + s);
            else return cleaned.concat(s);
        }

        if (type.toLowerCase() === 'video') {
            if (!start) return cleaned;
            if (Number.isInteger(start)) return cleaned.concat('#t=' + start);

            // Check for timestamp format (hh:mm:ss)
            if (start.includes(':')) {
                const arr = start.split(':').reverse();
                const tArr = arr.map(t => Number.isInteger(Number(t)) ? Number(t) : 0);
                const sec = tArr[0] + (tArr.length > 1 ? 60 * tArr[1] : 0) + (tArr.length > 2 ? 3600 * tArr[2] : 0);

                // If no valid timestamp, continue to the next step
                return cleaned.concat('#t=' + sec);
            }

            // Unknown type, ignore
            if (typeof start !== 'string') return cleaned;
            const s = start.replace('hour', 'h').replace('min', 'm').replace('sec', 's')
                .replaceAll(' ', '').trim();

            if (Number.isInteger(Number(s))) return cleaned.concat('#t=' + s);
            else return cleaned.concat(s);
        }

        // If type is not known, just return the cleaned url
        return cleaned;
    }
}

// Expose globally
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BibliographyUtils;
} else {
    window.BibliographyUtils = BibliographyUtils;
}
