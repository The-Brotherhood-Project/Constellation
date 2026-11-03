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
 * AI Assist Controller
 * Handles OpenRouter model fetching, suggestion generation, and node import
 * for the Web Curator Lab AI Node Suggestions modal.
 */

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

// Curated list of high-quality models to show when API is unavailable or as fallback
const FALLBACK_MODELS = [
    { id: 'anthropic/claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
    { id: 'openai/gpt-4o', name: 'GPT-4o' },
    { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini' },
    { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash' },
    { id: 'google/gemini-flash-1.5', name: 'Gemini 1.5 Flash' },
    { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B Instruct' },
    { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat' },
    { id: 'mistralai/mistral-large', name: 'Mistral Large' },
    { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B Instruct' },
];

class AIAssistController {
    constructor() {
        this.elements = {};
        this.suggestions = []; // Current suggestion list
    }

    init() {
        this.elements = {
            openBtn: document.getElementById('btn-llm-suggest'),
            modal: document.getElementById('llm-modal'),
            closeBtn: document.querySelector('#llm-modal .close'),
            queryInput: document.getElementById('llm-query'),
            modelSelect: document.getElementById('llm-model-select'),
            selectionReminder: document.getElementById('llm-selection-reminder'),
            selectedCount: document.getElementById('llm-selected-count'),
            getBtn: document.getElementById('btn-get-llm-suggestions'),
            loading: document.getElementById('llm-loading'),
            results: document.getElementById('llm-results'),
        };

        if (this.elements.openBtn) {
            this.elements.openBtn.addEventListener('click', () => this.openModal());
        }
        if (this.elements.closeBtn) {
            this.elements.closeBtn.addEventListener('click', () => this.closeModal());
        }
        if (this.elements.getBtn) {
            this.elements.getBtn.addEventListener('click', () => this.getSuggestions());
        }

        // Close on backdrop click
        if (this.elements.modal) {
            this.elements.modal.addEventListener('click', (e) => {
                if (e.target === this.elements.modal) this.closeModal();
            });
        }
    }

    openModal() {
        if (!this.elements.modal) return;

        // Update selection reminder
        const state = window.labStateManager ? window.labStateManager.state : null;
        const selectedCount = state && state.selectedNodes ? state.selectedNodes.size : 0;
        if (this.elements.selectedCount) {
            this.elements.selectedCount.textContent = selectedCount;
        }
        if (this.elements.selectionReminder) {
            this.elements.selectionReminder.style.display = selectedCount > 0 ? 'block' : 'none';
        }

        this.elements.modal.classList.add('active');
        this.elements.modal.style.display = 'block';

        // Populate model dropdown
        this._populateModels();
    }

    closeModal() {
        if (!this.elements.modal) return;
        this.elements.modal.classList.remove('active');
        this.elements.modal.style.display = 'none';
    }

    // -------------------------------------------------------------------------
    // Model fetching
    // -------------------------------------------------------------------------

    async _populateModels() {
        const select = this.elements.modelSelect;
        if (!select) return;

        const apiKey = window.settingsManager ? window.settingsManager.getApiKey() : '';
        const favoriteModel = window.settingsManager ? window.settingsManager.getFavoriteModel() : '';

        let models = FALLBACK_MODELS;

        if (apiKey) {
            try {
                const resp = await fetch(`${OPENROUTER_BASE}/models`, {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });
                if (resp.ok) {
                    const data = await resp.json();
                    models = this._filterTopModels(data.data || [], favoriteModel);
                }
            } catch (e) {
                console.warn('AI Assist: Could not fetch models from OpenRouter, using fallback list.', e);
            }
        }

        // Build option list — favorite first (if not already in list)
        const seen = new Set();
        const finalModels = [];

        if (favoriteModel) {
            finalModels.push({ id: favoriteModel, name: `★ ${favoriteModel} (Favorite)` });
            seen.add(favoriteModel);
        }

        for (const m of models) {
            if (!seen.has(m.id)) {
                finalModels.push(m);
                seen.add(m.id);
            }
        }

        select.innerHTML = '';
        for (const m of finalModels) {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.name;
            select.appendChild(opt);
        }

        // Try to select favorite first, else leave first option selected
        if (favoriteModel && seen.has(favoriteModel)) {
            select.value = favoriteModel;
        }
    }

    /**
     * Filter the raw OpenRouter model list down to the top ~10
     * Criteria: instruction-tuned, large context, reasonable pricing, well-known providers
     */
    _filterTopModels(rawModels, favoriteModel) {
        const PREFERRED_PREFIXES = [
            'anthropic/', 'openai/', 'google/', 'meta-llama/', 'deepseek/',
            'mistralai/', 'qwen/', 'cohere/', 'microsoft/', 'x-ai/'
        ];

        const scored = rawModels
            .filter(m => {
                // Must have a usable context window and pricing info
                if (!m.id || !m.name) return false;
                // Exclude image/vision-only and embedding models
                const nameLower = (m.name || '').toLowerCase();
                if (nameLower.includes('embed') || nameLower.includes('dall-e') || nameLower.includes('whisper')) return false;
                return true;
            })
            .map(m => {
                let score = 0;
                const idLower = m.id.toLowerCase();

                // Preferred provider bonus
                for (const prefix of PREFERRED_PREFIXES) {
                    if (m.id.startsWith(prefix)) { score += 10; break; }
                }

                // Context length bonus
                const ctx = m.context_length || 0;
                if (ctx >= 128000) score += 5;
                else if (ctx >= 32000) score += 3;
                else if (ctx >= 8000) score += 1;

                // Price-efficiency: prefer low prompt cost (per token)
                const promptCost = parseFloat(m.pricing?.prompt || '1');
                if (promptCost <= 0.000001) score += 4;      // very cheap
                else if (promptCost <= 0.000003) score += 2; // cheap

                // Favor instruction/chat models
                if (idLower.includes('instruct') || idLower.includes('chat') || idLower.includes('sonnet') || idLower.includes('gpt')) {
                    score += 3;
                }

                // Slight bonus for favorite
                if (favoriteModel && m.id === favoriteModel) score += 20;

                return { id: m.id, name: m.name, score };
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);

        return scored.map(m => ({ id: m.id, name: m.name }));
    }

    // -------------------------------------------------------------------------
    // Suggestion fetching
    // -------------------------------------------------------------------------

    async getSuggestions() {
        const apiKey = window.settingsManager ? window.settingsManager.getApiKey() : '';
        if (!apiKey) {
            if (window.dialogController) {
                window.dialogController.alert('Please enter your OpenRouter API key in Settings first.', 'No API Key');
            }
            return;
        }

        const query = this.elements.queryInput ? this.elements.queryInput.value.trim() : '';
        if (!query) {
            if (window.dialogController) {
                window.dialogController.alert('Please enter a topic or prompt for suggestions.', 'Empty Query');
            }
            return;
        }

        const model = this.elements.modelSelect ? this.elements.modelSelect.value : '';
        if (!model) {
            if (window.dialogController) {
                window.dialogController.alert('No model selected. Please wait for models to load or check your API key.', 'No Model');
            }
            return;
        }

        // Build context nodes
        const state = window.labStateManager ? window.labStateManager.state : null;
        let contextNodes = [];
        if (state) {
            const nodeMap = state.nodes || {};
            const selected = state.selectedNodes;
            if (selected && selected.size > 0) {
                // Use only selected nodes
                for (const localId of selected) {
                    const n = nodeMap[localId];
                    if (n) contextNodes.push({ title: n.title, description: n.description || '' });
                }
            } else {
                // Use all nodes (limited to avoid token overflow)
                contextNodes = Object.values(nodeMap).slice(0, 30).map(n => ({
                    title: n.title,
                    description: n.description || ''
                }));
            }
        }

        const graphName = state && state.metadata ? state.metadata.name : 'Unnamed Graph';
        const userMsg = window.buildSuggestNodesUserMessage
            ? window.buildSuggestNodesUserMessage(query, graphName, contextNodes)
            : `Topic: ${query}`;

        // Show loading
        this._setLoading(true);
        if (this.elements.results) this.elements.results.innerHTML = '';

        try {
            const resp = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': window.location.href,
                    'X-Title': 'Web Curator Lab'
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: window.SUGGEST_NODES_SYSTEM_PROMPT || '' },
                        { role: 'user', content: userMsg }
                    ],
                    response_format: { type: 'json_object' }
                })
            });

            if (!resp.ok) {
                const errText = await resp.text();
                throw new Error(`OpenRouter API error ${resp.status}: ${errText}`);
            }

            const data = await resp.json();
            const rawContent = data.choices?.[0]?.message?.content || '';
            const parsed = this._parseResponse(rawContent);
            this.suggestions = parsed;
            this._renderResults(parsed);
        } catch (e) {
            console.error('AI Assist error:', e);
            if (this.elements.results) {
                this.elements.results.innerHTML = `<p class="empty-state" style="color:var(--danger-color, red);">Error: ${e.message}</p>`;
            }
        } finally {
            this._setLoading(false);
        }
    }

    _parseResponse(raw) {
        try {
            // Strip markdown fences if present
            const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
            const obj = JSON.parse(cleaned);
            return Array.isArray(obj.suggestions) ? obj.suggestions : [];
        } catch (e) {
            console.error('AI Assist: Failed to parse response JSON', e, raw);
            return [];
        }
    }

    // -------------------------------------------------------------------------
    // Results rendering
    // -------------------------------------------------------------------------

    _renderResults(suggestions) {
        const container = this.elements.results;
        if (!container) return;

        if (!suggestions || suggestions.length === 0) {
            container.innerHTML = '<p class="empty-state">No suggestions returned. Try a different query or model.</p>';
            return;
        }

        // Toolbar
        const toolbar = document.createElement('div');
        toolbar.className = 'llm-toolbar';

        const selectAllBtn = document.createElement('button');
        selectAllBtn.className = 'btn btn-secondary btn-small';
        selectAllBtn.textContent = 'Select All';
        selectAllBtn.addEventListener('click', () => this._toggleSelectAll(container, selectAllBtn));

        const importSelectedBtn = document.createElement('button');
        importSelectedBtn.className = 'btn btn-primary btn-small';
        importSelectedBtn.textContent = 'Import Selected';
        importSelectedBtn.addEventListener('click', () => this._importSelected(container));

        toolbar.appendChild(selectAllBtn);
        toolbar.appendChild(importSelectedBtn);
        container.appendChild(toolbar);

        // Cards
        suggestions.forEach((s, idx) => {
            const card = document.createElement('div');
            card.className = 'llm-suggestion-card';
            card.dataset.idx = idx;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'llm-suggestion-checkbox';

            const textDiv = document.createElement('div');
            textDiv.style.flex = '1';

            const titleEl = document.createElement('div');
            titleEl.className = 'llm-suggestion-title';
            titleEl.textContent = s.title || '(untitled)';

            const descEl = document.createElement('div');
            descEl.className = 'llm-suggestion-description';
            descEl.textContent = s.description || '';

            textDiv.appendChild(titleEl);
            textDiv.appendChild(descEl);

            const importBtn = document.createElement('button');
            importBtn.className = 'btn btn-secondary btn-small';
            importBtn.textContent = 'Use';
            importBtn.addEventListener('click', () => this._importSingle(s, card));

            card.appendChild(checkbox);
            card.appendChild(textDiv);
            card.appendChild(importBtn);
            container.appendChild(card);
        });
    }

    _toggleSelectAll(container, btn) {
        const checkboxes = container.querySelectorAll('.llm-suggestion-checkbox');
        const allChecked = Array.from(checkboxes).every(c => c.checked);
        checkboxes.forEach(c => { c.checked = !allChecked; });
        btn.textContent = allChecked ? 'Select All' : 'Deselect All';
    }

    _importSingle(suggestion, card) {
        if (!window.GraphOps) return;
        GraphOps.addNode({
            title: suggestion.title || 'Untitled',
            description: suggestion.description || '',
            prerequisite: '',
            domain_id: null,
            assessable: true
        });
        card.classList.add('imported');
        const useBtn = card.querySelector('.btn-small:last-child');
        if (useBtn) {
            useBtn.textContent = '✓ Added';
            useBtn.disabled = true;
        }
    }

    _importSelected(container) {
        const cards = container.querySelectorAll('.llm-suggestion-card');
        let count = 0;
        cards.forEach(card => {
            const checkbox = card.querySelector('.llm-suggestion-checkbox');
            if (checkbox && checkbox.checked) {
                const idx = parseInt(card.dataset.idx, 10);
                const s = this.suggestions[idx];
                if (s && !card.classList.contains('imported')) {
                    this._importSingle(s, card);
                    count++;
                }
            }
        });
        if (count === 0 && window.dialogController) {
            window.dialogController.alert('No suggestions selected. Check one or more boxes first.', 'Nothing Selected');
        }
    }

    _setLoading(isLoading) {
        if (this.elements.loading) {
            this.elements.loading.style.display = isLoading ? 'block' : 'none';
        }
        if (this.elements.getBtn) {
            this.elements.getBtn.disabled = isLoading;
            this.elements.getBtn.textContent = isLoading ? 'Thinking...' : 'Get Suggestions';
        }
    }
}

const aiAssistController = new AIAssistController();

if (typeof window !== 'undefined') {
    window.AIAssistController = AIAssistController;
    window.aiAssistController = aiAssistController;
}
