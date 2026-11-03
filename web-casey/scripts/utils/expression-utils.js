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
 * All the prerequisite utils, this is the main api
 */
class PrerequisiteUtils {
    /**
     * Performs a transitive reduction based on the context given
     * @param {int} nodeId - The id of the node
     * @param {string} prerequisite - The prerequisite expression
     * @param {Map<int, List<list<int>>} contextNodes - The context nodes, where the key is the node id and the value is the pathways
     * @param {Map<int, List<int>>} extraContext - Extra context in the form of node id -> node id who mentions it can be provided for faster reduction
     * @returns {string} - The simplified prerequisite expression
     */
    /**
     * Check if two DNF arrays represent the same logical expression,
     * regardless of clause order or literal order within clauses.
     * @param {Array<Array<number>>} dnf1
     * @param {Array<Array<number>>} dnf2
     * @returns {boolean}
     */
    static dnfEqual(dnf1, dnf2) {
        if (!Array.isArray(dnf1) || !Array.isArray(dnf2)) return false;
        if (dnf1.length !== dnf2.length) return false;
        // Normalise: sort literals within each clause, then sort clauses
        const normalise = dnf => dnf
            .map(clause => [...clause].sort((a, b) => a - b))
            .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
        const a = normalise(dnf1);
        const b = normalise(dnf2);
        return JSON.stringify(a) === JSON.stringify(b);
    }

    /**
     * Compare two prerequisite expression strings semantically via their DNF.
     * Returns true if they are logically equivalent (modulo ordering).
     * Returns true if both are empty / blank.
     * @param {string} expr1
     * @param {string} expr2
     * @returns {boolean}
     */
    static prereqsEqual(expr1, expr2) {
        const e1 = (expr1 || '').trim();
        const e2 = (expr2 || '').trim();
        if (e1 === '' && e2 === '') return true;
        if (e1 === '' || e2 === '') return false;
        try {
            const d1 = ExpressionUtils.exprToDnf(e1);
            const d2 = ExpressionUtils.exprToDnf(e2);
            return this.dnfEqual(d1, d2);
        } catch {
            // If parsing fails fall back to string comparison
            return e1 === e2;
        }
    }

    /**
     * Rewrite all occurrences of oldId with newId inside a prerequisite expression string.
     * Only replaces whole-word integer tokens to avoid partial matches.
     * @param {string} expr
     * @param {number} oldId
     * @param {number} newId
     * @returns {string}
     */
    static rewriteIdsInExpr(expr, oldId, newId) {
        if (!expr) return expr;
        // Replace the integer as a whole word (not adjacent to other digits)
        return expr.replace(new RegExp(`(?<![\\d])${oldId}(?![\\d])`, 'g'), String(newId));
    }

    /**
     * Performs a transitive reduction based on the context given
     * @param {int} nodeId - The id of the node
     * @param {string} prerequisite - The prerequisite expression
     * @param {Map<int, List<List<int>>} contextNodes
     * @param {Map<int, List<int>>} extraContext
     * @returns {string}
     */
    static simplifyPrerequisite(nodeId, prerequisite, contextNodes, extraContext = null) {
        // Remove the nodeId from contextNodes if present
        // This is a critical guard, DO NOT REMOVE
        contextNodes.delete(nodeId);

        const parsedPrerequisite = this.parseExpression(prerequisite, new Set(contextNodes.keys()));
        const pathways = this.extractPathways(parsedPrerequisite, true);

        const hyperarcs = HypergraphUtils.mapHyperarcs(contextNodes);
        const extractedContext = extraContext != null ? HypergraphUtils.extractContext(extraContext, contextNodes) : null;
        const reversedContext = HypergraphUtils.reverseContext(contextNodes);
        const reversedHyperarcs = HypergraphUtils.mapHyperarcs(reversedContext);

        const reducedHyperarcs = HypergraphUtils.performTransitiveReduction(nodeId, pathways, hyperarcs, reversedHyperarcs, extractedContext);
        const reducedDnf = reducedHyperarcs.map(set => Array.from(set).sort((a,b)=>a-b));

        if (reducedDnf.length === 0) return '';
        return ExpressionUtils.dnfToExpr(reducedDnf);
    }

    /**
     * Parse expr string into pathway list-of-sets
     * @param {string} expr
     * @returns {List<List<int>> | List<Set<int>>}
     */
    static extractPathways(expr, returnAsSet = false) {
        // Catch empty string
        if (expr === "") return [];
        const dnf = ExpressionUtils.exprToDnf(expr);
        const pathways = HypergraphUtils.extractPaths(dnf);
        if (returnAsSet) return pathways;
        return pathways.map(pathway => [...pathway]);
    }

    /**
     * Parse AST into pathway list-of-sets
     * @param {Object} ast
     * @returns {List<Set<int>>}
     */
    static extractPathwaysFromAst(ast) {
        const dnf = ASTUtils.astToDnf(ast);
        return HypergraphUtils.extractPaths(dnf);
    }

    /**
     * Normalise and validate expression string
     * @param {string} expression
     * @param {Set<int>} nodeIds
     * @returns {string}
     */
    static parseExpression(expression, nodeIds) {
        const normalisedExpression = ExpressionUtils.normalizeExpression(expression);
        // Catch empty before validating
        if (normalisedExpression === "") return "";
        if (!ExpressionUtils.validateExpression(normalisedExpression, nodeIds))
            throw new Error("Invalid expression");
        return normalisedExpression;
    }
}

/**
 * AST utilities: convert an n‑ary AST (operators 'and'/'or' with an `args` array)
 * into DNF (array of clauses, each clause is an array of integer literals).
 */
class ASTUtils {
    /**
     * Check if a node is a leaf (has a 'node' key).
     * @param {Object|number} node 
     * @returns {boolean}
     */
    static isLeaf(node) {
        return typeof node === 'object' && node !== null && 'node' in node;
    }

    /**
     * Recursively convert an AST node to DNF.
     * Supported node shapes:
     *   - { node: number }
     *   - { and: [child, ...] }
     *   - { or: [child, ...] }
     * @param {Object|number} node 
     * @returns {Array<Array<number>>} Raw DNF (duplicates allowed).
     */
    static toDnf(node) {
        // Allow plain numbers for convenience (converted to { node: num } internally)
        if (typeof node === 'number') {
            return [[node]];
        }

        if (this.isLeaf(node)) {
            return [[node.node]];
        }

        if ('or' in node) {
            let clauses = [];
            for (const child of node.or) {
                clauses.push(...this.toDnf(child));
            }
            return clauses;
        }

        if ('and' in node) {
            // Start with an empty conjunction (neutral element for AND)
            let result = [[]];
            for (const child of node.and) {
                const childDnf = this.toDnf(child);
                const newResult = [];
                for (const clause of result) {
                    for (const childClause of childDnf) {
                        newResult.push(clause.concat(childClause));
                    }
                }
                result = newResult;
            }
            return result;
        }

        throw new Error('Invalid AST node: must have "node", "and", or "or" key');
    }

    /**
     * Converts an AST into DNF with deduplication and sorting.
     * @param {Object|number} ast 
     * @returns {Array<Array<number>>}
     */
    static astToDnf(ast) {
        let raw = this.toDnf(ast);

        // Clean up: remove duplicate literals inside each clause, sort, and remove duplicate clauses
        const cleaned = raw.map(clause => {
            const unique = Array.from(new Set(clause));
            unique.sort((a, b) => a - b);
            return unique;
        });

        const seen = new Set();
        const result = [];
        for (const clause of cleaned) {
            const key = JSON.stringify(clause);
            if (!seen.has(key)) {
                seen.add(key);
                result.push(clause);
            }
        }
        return result;
    }

    /**
     * Converts a DNF array back into an AST in the { node, and, or } format.
     * @param {Array<Array<number>>} dnf 
     * @returns {Object}
     */
    static dnfToAst(dnf) {
        if (!Array.isArray(dnf) || dnf.length === 0) {
            throw new Error('Invalid DNF: must be a non‑empty array of clauses');
        }

        // Build an AND node for each clause (or a single literal)
        // Filter out empty clauses instead of throwing an error
        const clauseNodes = dnf.filter(clause => clause.length > 0).map(clause => {
            if (!Array.isArray(clause) || clause.length === 0) {
                // Extra guard, should NOT trigger
                throw new Error('Invalid clause: must be a non‑empty array of integers');
            }
            // If only one literal, return { node: ... }
            if (clause.length === 1) {
                return { node: clause[0] };
            }
            // Otherwise create an AND node with all literals as children
            return { and: clause.map(num => ({ node: num })) };
        });

        // If only one clause, return that node directly
        if (clauseNodes.length === 1) {
            return clauseNodes[0];
        }

        // Otherwise, combine all clauses under an OR node
        return { or: clauseNodes };
    }

    /**
     * Convert an AST back to a string expression with minimal parentheses.
     * @param {Object} ast 
     * @param {string} parentOp - Parent operator ('and' or 'or'), or null for root.
     * @returns {string}
     */
    static astToExpr(ast, parentOp = null) {
        // Handle leaf nodes
        if (this.isLeaf(ast)) {
            return ast.node.toString();
        }

        // Determine operator and children
        let op, children;
        if ('and' in ast) {
            op = 'and';
            children = ast.and;
        } else if ('or' in ast) {
            op = 'or';
            children = ast.or;
        } else {
            throw new Error('Invalid AST node: must have "node", "and", or "or" key');
        }

        const opStr = op === 'and' ? ' AND ' : ' OR ';
        const childStrings = children.map(child => {
            let str = this.astToExpr(child, op);
            // Parenthesise if child is a compound node with a different operator
            // AND children with OR parent need parens; OR children with AND parent need parens.
            // Also, if the child has a single operand, it's effectively a leaf, so no parens needed.
            const childIsCompound = this.isCompound(child);
            if (childIsCompound && this.getOp(child) !== op) {
                str = '(' + str + ')';
            }
            return str;
        });

        let expr = childStrings.join(opStr);
        // Wrap entire expression if parent exists and has higher precedence
        if (parentOp === 'and' && op === 'or') {
            expr = '(' + expr + ')';
        }
        return expr;
    }

    /**
     * Check if an AST node is compound (has 'and' or 'or').
     * @param {Object} node 
     * @returns {boolean}
     */
    static isCompound(node) {
        return typeof node === 'object' && node !== null && ('and' in node || 'or' in node);
    }

    /**
     * Get the operator of a compound node, or null if leaf.
     * @param {Object} node 
     * @returns {string|null}
     */
    static getOp(node) {
        if ('and' in node) return 'and';
        if ('or' in node) return 'or';
        return null;
    }
}

/**
 * Expression utilities: parse a boolean string into an n‑ary AST and convert to DNF.
 */
class ExpressionUtils {
    /**
     * Normalize expression by handling case insensitivity and operator variations
     * @param {string} expression - Raw expression
     * @returns {string} Normalized expression
     */
    static normalizeExpression(expression) {
        return expression
            .trim()
            .replace(/\s+/g, ' ') // Normalize whitespace
            .replace(/([()\[\]])/g, ' $1 ') // Add spaces around brackets/parentheses
            .replace(/(and|AND|And|aNd|&&|&)/g, ' AND ') // Various AND operators (add spaces)
            .replace(/(or|OR|Or|oR|\|\|)/g, ' OR ') // Various OR operators (add spaces)
            .replace(/,/g, ' AND ') // Comma as AND
            .replace(/\s+/g, ' ') // Clean up extra spaces
            .trim();
    }

    /**
     * Extract node IDs from expression using regex
     * @param {string} expression - Expression to parse
     * @returns {Array} Array of node IDs
     */
    static extractNodeIds(expression) {
        const matches = expression.match(/\b\d+\b/g);
        if (!matches) return [];
        
        // Convert to integers and remove duplicates while preserving order
        const uniqueIds = [];
        const seen = new Set();
        
        for (const match of matches) {
            const id = parseInt(match);
            if (!seen.has(id)) {
                seen.add(id);
                uniqueIds.push(id);
            }
        }
        
        return uniqueIds;
    }

    /**
     * Validate expression structure
     * @param {string} expression - Expression to validate (should be normalized)
     * @param {Set<int>} nodeIds - Set of node IDs in the expression for reference
     * @returns {boolean} Whether expression is valid
     */
    static validateExpression(expression, nodeIds) {
        if (!expression || nodeIds.size === 0) {
            return false;
        }

        // Check for balanced parentheses and brackets
        const parentheses = expression.match(/[()]/g) || [];
        const brackets = expression.match(/[\[\]]/g) || [];
        let parenBalance = 0;
        let bracketBalance = 0;
        
        // Check parentheses balance
        for (const char of parentheses) {
            if (char === '(') parenBalance++;
            else parenBalance--;
            if (parenBalance < 0) return false; // Unbalanced
        }
        if (parenBalance !== 0) return false; // Unbalanced
        
        // Check brackets balance
        for (const char of brackets) {
            if (char === '[') bracketBalance++;
            else bracketBalance--;
            if (bracketBalance < 0) return false; // Unbalanced
        }
        if (bracketBalance !== 0) return false; // Unbalanced

        // Check for valid operators (expression should already be normalized)
        const tokens = expression.split(/\s+/).filter(token => 
            token && !['(', ')', '[', ']', ','].includes(token)
        );

        // Basic structure validation
        let expectingOperand = true;
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            
            if (expectingOperand) {
                // Should be a number or opening bracket/parenthesis
                if (token === '(' || token === '[') {
                    continue; // Skip brackets/parentheses in token-level validation
                } else if (/^\d+$/.test(token)) {
                    expectingOperand = false;
                } else {
                    return false; // Unexpected operator
                }
            } else {
                // Should be an operator or closing bracket/parenthesis
                if (token === ')' || token === ']') {
                    continue;
                } else if (['AND', 'OR'].includes(token)) {
                    expectingOperand = true;
                } else {
                    return false; // Unexpected operand
                }
            }
        }

        const { hasNonExistentNodes } = this.checkForNonExistentNodes(expression, nodeIds);
        if (hasNonExistentNodes) {
            return false;
        }

        return true;
    }

    /**
     * Check if expression contains references to non-existent nodes
     * @param {string} expression - Prerequisite expression
     * @param {Set<int>} contextNodes - Context nodes to check against
     * @returns {Object} Object with hasNonExistentNodes boolean and missingNodes array
     */
    static checkForNonExistentNodes(expression, contextNodes) {
        const nodeIds = this.extractNodeIds(expression);
        const missingNodes = nodeIds.filter(id => !contextNodes.has(id));
        
        return {
            hasNonExistentNodes: missingNodes.length > 0,
            missingNodes: missingNodes
        };
    }

    static exprToDnf(expr) {
        // Tokenizer (unchanged) ...
        const tokens = [];
        let i = 0;
        expr = expr.toLowerCase();
        while (i < expr.length) {
            const ch = expr[i];
            if (ch === ' ') { i++; continue; }
            if (ch === '(' || ch === ')') { tokens.push(ch); i++; continue; }
            if (ch >= '0' && ch <= '9') {
                let num = '';
                while (i < expr.length && expr[i] >= '0' && expr[i] <= '9') {
                    num += expr[i];
                    i++;
                }
                tokens.push(parseInt(num, 10));
                continue;
            }
            if (ch >= 'a' && ch <= 'z') {
                let word = '';
                while (i < expr.length && expr[i] >= 'a' && expr[i] <= 'z') {
                    word += expr[i];
                    i++;
                }
                if (word === 'and' || word === 'or') {
                    tokens.push(word);
                } else {
                    throw new Error(`Unexpected token: ${word}`);
                }
                continue;
            }
            throw new Error(`Invalid character: ${ch}`);
        }

        // ----- Updated Parser (returns { node, and, or } directly) -----
        let pos = 0;

        function parseExpr() {
            return parseOr();
        }

        function parseOr() {
            let left = parseAnd();
            const operands = [left];
            while (pos < tokens.length && tokens[pos] === 'or') {
                pos++; // consume 'or'
                const right = parseAnd();
                operands.push(right);
            }
            return operands.length === 1 ? operands[0] : { or: operands };
        }

        function parseAnd() {
            let left = parsePrimary();
            const operands = [left];
            while (pos < tokens.length && tokens[pos] === 'and') {
                pos++; // consume 'and'
                const right = parsePrimary();
                operands.push(right);
            }
            return operands.length === 1 ? operands[0] : { and: operands };
        }

        function parsePrimary() {
            const token = tokens[pos];
            if (typeof token === 'number') {
                pos++;
                return { node: token };
            }
            if (token === '(') {
                pos++; // consume '('
                const node = parseExpr();
                if (tokens[pos] !== ')') {
                    throw new Error('Expected closing parenthesis');
                }
                pos++; // consume ')'
                return node;
            }
            throw new Error(`Unexpected token: ${token}`);
        }

        const ast = parseExpr();
        if (pos !== tokens.length) {
            throw new Error('Extra tokens after expression');
        }

        // Convert to DNF using the updated ASTUtils
        return ASTUtils.astToDnf(ast);
    }

    /**
     * Convert a DNF array back to a string expression.
     * @param {Array<Array<number>>} dnf - The DNF representation.
     * @returns {string} Expression string (e.g., "(1 AND 2) OR (3 AND 4)").
     */
    static dnfToExpr(dnf) {
        const ast = ASTUtils.dnfToAst(dnf);
        return ASTUtils.astToExpr(ast);
    }

    /**
     * Convert a string expression to an AST.
     * @param {string} expr - The expression string.
     * @returns {Object} AST root node with 'op' and 'args' properties for each child AST node.
     */
    static exprToAst(expr) {
        const dnf = this.exprToDnf(expr);
        return ASTUtils.dnfToAst(dnf);
    }
}

class HypergraphUtils {
    /**
     * Perform transitive reduction on a given node assuming the rest is already reduced
     * @param {int} node 
     * @param {List<Set<int>>} pathways 
     * @param {Map<string, Set<int>>} hyperarcs 
     * @param {Map<string, Set<int>>} reversedHyperarcs 
     * @param {Map<int, List<string>>} extraContext - Extra context in the form of node id -> plausible hyperarc names
     * @returns {List<int>} Reduced hyperarcs in the form of node id -> plausible hyperarc names
     */
    static performTransitiveReduction(node, pathways, hyperarcs, reversedHyperarcs, extraContext = null) {
        const minimisedPathways = this.minimisePathways(pathways, reversedHyperarcs);
        const filteredPathways = this.filterWithTailDominance(minimisedPathways);
        const reducedPathways = this.filterWithArcRedundancy(node, filteredPathways, hyperarcs, extraContext);

        return reducedPathways;
    }

    /**
     * Returns the actual hyperarc names instead of the node indices
     * @param {Map<int, List<int>>} context 
     * @param {Map<int, List<List<int>>>} nodes 
     * @returns {Map<int, List<string>>}
     */
    static extractContext(context, nodes) {
        const extractedContext = new Map();
        
        const extractHyperarcNames = (nodeId) => {
            const pathwayCount = nodes.get(nodeId)?.length || 0;
            const hyperarcs = [];
            for (let i = 0; i < pathwayCount; i++) {
                hyperarcs.push(`${nodeId}-${i}`);
            }
            return hyperarcs;
        }

        [...context.entries()].forEach(([nodeId, mentions]) => {
            // Flattened names of all the hyperarcs going in to the nodes that mention this node
            const hyperarcs = mentions.map(mention => extractHyperarcNames(mention)).flat();
            extractedContext.set(nodeId, hyperarcs);
        })

        return extractedContext;
    }

    /**
     * Add all the tailSets to the hyperarc map to the given node in the exact index
     * @param {int} node 
     * @param {dict<int, Set<int>> | List<Set<int>>>} tailSets 
     * @param {Map<string, Set<int>>} hyperarcs 
     */
    static plantHyperarcs(node, tailSets, hyperarcs) {
        // Two pipelines to handle the case where tailSets is a dict or a set
        if (tailSets instanceof Array) {
            tailSets.forEach((tailSet, index) => {
                hyperarcs.set(`${node}-${index}`, tailSet);
            })
        } else {
            [...tailSets.entries()].forEach(([index, tailSet]) => {
                hyperarcs.set(`${node}-${index}`, tailSet);
            })
        }
    }

    /**
     * Remove all the hyperarcs from the hyperarc map to the given node in the exact index
     * @param {int} node 
     * @param {List<int>} indices 
     * @param {Map<string, Set<int>>} hyperarcs 
     */
    static removeHyperarcs(node, indices, hyperarcs) {
        for (const index of indices) {
            hyperarcs.delete(`${node}-${index}`);
        }
    }

    /**
     * Minimise the pathways internally using contextual hyperarcs and reachability
     * @param {List<Set<int>>} pathways
     * @param {Map<string, Set<int>>} implicationHyperarcs 
     */
    static minimisePathways(pathways, implicationHyperarcs) {
        const minimise = (pathway) => {
            if (pathway.size === 0 || pathway.size === 1) return pathway;
            const elements = [...pathway];

            for (let i = elements.length - 1; i >= 0; i--) {
                const node = elements[i];
                const rest = new Set(elements.filter((_, j)=> j !== i));

                // Check if all the node is reachable using the rest of the pathway
                const isReachable = this.checkReachability_bbfs(rest, node, implicationHyperarcs);

                // If reachable, then it was redundant
                if (isReachable) elements.splice(i, 1);
            }
            return new Set(elements);
        }

        return pathways.map(minimise);
    }

    /**
     * Filter out the hyperarcs that are not essential using BBFS redundancy search
     * @param {int} node 
     * @param {List<Set<int>>} pathways 
     * @param {Map<string, Set<int>>} hyperarcs 
     * @param {Map<int, List<string>>} extraContext - Extra context in the form of node id -> plausible hyperarc names, checks all nodes if not given
     * @returns {List<Set<int>>}
     */
    static filterWithArcRedundancy(node, pathways, hyperarcs, extraContext = null) {
        // Keep a counter for cleaning the map up after the loop
        const length = pathways.length;

        const acceptedArcs = [];

        // Add all the pathways to the hyperarc map
        this.plantHyperarcs(node, pathways, hyperarcs);

        for (let i = 0; i < length; i++) {
            // Temporarily remove the current pathway
            const sources = pathways.splice(i, 1)[0];

            // Remove the current pathway from the hyperarc map
            this.removeHyperarcs(node, [i], hyperarcs);

            // Run a BFS search for the node
            const isReachable = this.checkReachability_bbfs(sources, node, hyperarcs, extraContext);
                
            // Put this back whether or not it was essential because of index changes,
            // We are returning the accepted arcs anyways. So we keep the old array unmodified.
            pathways.splice(i, 0, sources);

            // If not reachable, it was essential, accept it
            if (!isReachable) {
                acceptedArcs.push(sources);
                // Plant back at the right index according to pathways
                this.plantHyperarcs(node, new Map([[i, new Set(sources)]]), hyperarcs);
            }
        }

        // Clean up the map by deleting up to the maximum index       
        this.removeHyperarcs(node, Array.from({length: length}, (_, i) => i), hyperarcs);

        return acceptedArcs;
    }

     /**
     * Filter out the hyperarcs that are not essential using tail dominance
     * @param {List<Set<int>>} hyperarcs 
     * @returns {List<Set<int>>}
     */
    static filterWithTailDominance(hyperarcs) {
        // Sort the hyperarcs by tail size in ascending order
        hyperarcs.sort((a, b) => a.size - b.size);

        const accepted = [];
        // Filter out arc who are already tail domainated by an accepted arc
        hyperarcs.forEach((hyperarc) => {
            const isSubset = accepted.some(acceptedArc => acceptedArc.isSubsetOf(hyperarc));
            if (!isSubset) {
                accepted.push(hyperarc);
            }
        })
        return accepted;
    }
    
    /**
     * Check if the target node is reachable from the sources using BBFS
     * @param {Set<int>} sources 
     * @param {int} target 
     * @param {Map<string, Set<int>>} hyperarcs 
     * @param {Map<int, List<string>>} extraContext - Extra context in the form of node id -> plausible hyperarc names, checks all nodes if not given
     * @returns {boolean}
     */
    static checkReachability_bbfs(sources, target, hyperarcs, extraContext = null) {
        // Convert the map to array for ease of use
        const hyperarcsArray = [...hyperarcs.entries()];

        // Initialise a counter for all hyperarcs
        const counters = new Map(hyperarcsArray.map(([key, value]) => [key, value.size]));
        const visited = new Set(sources);
        const queue = [...sources];
        while (queue.length > 0) {
            const current = queue.shift();
            if (current === target) {
                return true;
            }
            // If extra context given then use the smaller set of plausible hyperarcs for that node, or use the entire graph
            const smartContext = extraContext != null ? this.findHyperarcNames(extraContext.get(current), hyperarcs): null;
            const plausibleHyperarcs = smartContext != null ? smartContext : hyperarcsArray;
            plausibleHyperarcs.forEach(([key, value]) => {
                // Could be null because the name could not be resolved,
                // should not happen, but just in case
                if (value == null) return;

                // check if current is in the tail
                if (value.has(current)) {
                    // Decrement counter
                    const count = counters.get(key);
                    counters.set(key, count - 1);
                    if (count === 1) {
                        const tail = parseInt(key.split('-')[0]);
                        if (!visited.has(tail)) {
                            // Add tail to visited
                            visited.add(tail);
                            // Add tail to queue
                            queue.push(tail);
                        }
                    }
                }
            });
        }
        return false;
    }

    /**
     * Constructs a reverse context map that represents implication
     * @param {Map<int, List<List<int>>>} contextNodes 
     * @returns {Map<int, List<List<int>>>}
     */
    static reverseContext(contextNodes) {
        const reversed = new Map();
        for (const [nodeId, tailSets] of contextNodes.entries()) {
            for (const tail of tailSets) {
                for (const prereq of tail) {
                    if (!reversed.has(prereq)) reversed.set(prereq, []);
                    reversed.get(prereq).push([nodeId]);
                }
            }
        }
        return reversed;
    }

    /**
     * Find the hyperarcs that have the given names and return the hyperarcs indexed to their names
     * @param {List<string>} arcNames 
     * @param {Map<string, Set<int>>} hyperarcs 
     * @returns {Array<string, Set<int>> | null}
     */
    static findHyperarcNames(arcNames, hyperarcs) {
        // guard clause
        if (arcNames == null) return null;

        return arcNames.map((arcName) => {
            const arc = hyperarcs.get(arcName);
            return arc ? [arcName, arc] : null
        }).filter(item => item != null);
    }

    /**
     * Pathways is a map from head to the list of hyperarcs going IN a node.
     * Hyperarcs are uniquely identified by head and tail set id in pathways.
     * @param {Map<int, List<List<int>>>} pathways 
     * @returns {Map<string, Set<int>>}
     */
    static mapHyperarcs(pathways) {
        const hyperarcs = new Map();
        [...pathways.entries()].forEach(([head, tailSets]) => {           
            tailSets.map((tailSet, id) => hyperarcs.set(`${head}-${id}`, new Set(tailSet)))
        });
        return hyperarcs;
    }

    /**
     * Returns the pathways as list of sets
     * @param {List<List<int>>} pathways 
     * @returns {List<Set<int>>}
     */
    static extractPaths(pathways) {
        const paths = [];
        pathways.forEach((tailSet) => {
            paths.push(new Set(tailSet));
        })
        return paths;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { HypergraphUtils, ExpressionUtils, ASTUtils, PrerequisiteUtils };
} else {
    window.HypergraphUtils = HypergraphUtils;
    window.ExpressionUtils = ExpressionUtils;
    window.ASTUtils = ASTUtils;
    window.PrerequisiteUtils = PrerequisiteUtils;
}
