/**
 * Local Storage Manager for Casey
 * Handles offline persistence using key 'web_casey_workspace'
 */

const CASEY_STORAGE_KEY = 'web_casey_workspace';

class LocalStorageManager {
    static loadState() {
        try {
            const raw = localStorage.getItem(CASEY_STORAGE_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            console.error('Failed to load Casey state from localStorage:', e);
            return null;
        }
    }

    static saveState(state) {
        try {
            if (!state) return false;
            localStorage.setItem(CASEY_STORAGE_KEY, JSON.stringify({
                graph: state.graph || {},
                resources: state.resources || {},
                capabilities: state.capabilities || {},
                selfAssessment: state.selfAssessment || {},
                savedAt: new Date().toISOString()
            }));
            return true;
        } catch (e) {
            console.error('Failed to save Casey state to localStorage:', e);
            return false;
        }
    }

    static clearState() {
        try {
            localStorage.removeItem(CASEY_STORAGE_KEY);
            return true;
        } catch (e) {
            console.error('Failed to clear Casey state from localStorage:', e);
            return false;
        }
    }
}

window.LocalStorageManager = LocalStorageManager;
window.CASEY_STORAGE_KEY = CASEY_STORAGE_KEY;
