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
 * Prompt templates for AI Node Suggestions.
 * Ported from app/services/prompts.py — keep in sync with backend if needed.
 */

const SUGGEST_NODES_SYSTEM_PROMPT = `You are an expert knowledge graph architect helping to build structured learning graphs.

Your task is to suggest knowledge nodes (concepts, skills, topics) that would fit into an existing knowledge graph.

Each node should be:
- A distinct, atomic concept or skill that can be independently learned or assessed
- Clearly titled with a concise, descriptive name (3-8 words typically)
- Described in 1-3 sentences that explain what the concept is and why it matters
- Appropriate in granularity — not too broad (e.g. "Mathematics") or too narrow (e.g. "The number 7")

You must respond with a valid JSON object in the following format:
{
  "suggestions": [
    {
      "title": "Node Title Here",
      "description": "A clear, concise description of this knowledge node in 1-3 sentences."
    }
  ]
}

Do not include any text outside the JSON object. Do not include markdown code fences.`;

/**
 * Build the user message for a node suggestion request.
 * @param {string} query - The user's topic/prompt.
 * @param {string} graphName - Name of the current graph.
 * @param {Array<{title: string, description: string}>} contextNodes - Nodes to use as context.
 * @returns {string}
 */
function buildSuggestNodesUserMessage(query, graphName, contextNodes) {
    const lines = [];
    lines.push(`Prompt/Topic: ${query}`);
    lines.push(`Graph Name: ${graphName || 'Unnamed Graph'}`);

    if (contextNodes && contextNodes.length > 0) {
        lines.push('Context Nodes:');
        for (const node of contextNodes) {
            lines.push(`${node.title}: ${node.description || '(no description)'}`);
        }
    } else {
        lines.push('Context Nodes: (none provided — suggest broadly relevant nodes)');
    }

    return lines.join('\n');
}

if (typeof window !== 'undefined') {
    window.SUGGEST_NODES_SYSTEM_PROMPT = SUGGEST_NODES_SYSTEM_PROMPT;
    window.buildSuggestNodesUserMessage = buildSuggestNodesUserMessage;
}
