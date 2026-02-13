/**
 * DecisionEngine - DAG-based decision tracking for narrative games
 * 
 * ARCHITECTURE PRINCIPLES:
 * 1. Every decision MUST have effects that are consumed downstream
 * 2. Ghost decisions (no downstream impact) are detected and warned
 * 3. State is persisted to localStorage for cross-tape continuity
 * 4. O(1) lookups via Map data structures
 * 
 * @version 1.0.0
 */

const DECISION_KEY = 'seed_archive_decisions_v1';

class DecisionEngine {
  #decisions;       // Map<decisionId, Decision>
  #effects;         // Map<effectId, Effect>
  #consumers;       // Map<effectId, Consumer[]>
  #producedBy;      // Map<effectId, decisionId> - reverse lookup
  #playerState;     // Current player state
  #history;         // Chronological choice history

  constructor() {
    this.#decisions = new Map();
    this.#effects = new Map();
    this.#consumers = new Map();
    this.#producedBy = new Map();
    this.#playerState = {
      trust: 0,
      guard: 0,
      honesty: 0,
      vulnerability: 0,
      activeFlags: new Set(),
      memories: [],
      arcFlags: new Set()
    };
    this.#history = [];
  }

  // ═══════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════

  async load(dataPath = '/data/decisions.json') {
    try {
      const response = await fetch(dataPath);
      if (!response.ok) throw new Error(`Failed to load ${dataPath}`);
      
      const data = await response.json();
      
      // Index decisions
      for (const [id, decision] of Object.entries(data.decisions || {})) {
        this.#decisions.set(id, { id, ...decision });
      }
      
      // Index effects
      for (const [id, effect] of Object.entries(data.effects || {})) {
        this.#effects.set(id, { id, ...effect });
      }
      
      // Build consumer index and reverse lookup
      for (const [consumerId, consumer] of Object.entries(data.consumers || {})) {
        for (const effectId of consumer.checks || []) {
          if (!this.#consumers.has(effectId)) {
            this.#consumers.set(effectId, []);
          }
          this.#consumers.get(effectId).push({ id: consumerId, ...consumer });
        }
      }
      
      // Build producer reverse lookup
      for (const [decId, decision] of this.#decisions) {
        for (const option of decision.options || []) {
          for (const effectId of option.effects || []) {
            this.#producedBy.set(effectId, decId);
          }
        }
      }
      
      // Restore saved state
      this.#restoreState();
      
      // Validate for ghost decisions
      const ghosts = this.detectGhosts();
      if (ghosts.length > 0) {
        console.warn('⚠️ Potential ghost effects detected:', ghosts);
      }
      
      console.log(`✓ DecisionEngine loaded: ${this.#decisions.size} decisions, ${this.#effects.size} effects`);
      return this;
    } catch (error) {
      console.error('DecisionEngine load error:', error);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // GHOST DETECTION - Find effects never consumed
  // ═══════════════════════════════════════════════════════════════════

  detectGhosts() {
    const ghosts = [];
    
    for (const [effectId, effect] of this.#effects) {
      const consumers = this.#consumers.get(effectId) || [];
      
      // Stat effects are always "consumed" (they affect endings)
      if (effect.type === 'stat') continue;
      
      // Arc effects are consumed by ending conditions
      if (effect.type === 'arc') continue;
      
      // Flag/memory effects need explicit consumers
      if (consumers.length === 0) {
        ghosts.push({
          effectId,
          type: effect.type,
          producedBy: this.#producedBy.get(effectId),
          description: effect.description
        });
      }
    }
    
    return ghosts;
  }

  // ═══════════════════════════════════════════════════════════════════
  // DECISION MAKING
  // ═══════════════════════════════════════════════════════════════════

  makeChoice(decisionId, optionId) {
    const decision = this.#decisions.get(decisionId);
    if (!decision) {
      throw new Error(`Unknown decision: ${decisionId}`);
    }
    
    const option = decision.options?.find(o => o.id === optionId);
    if (!option) {
      throw new Error(`Unknown option: ${optionId} for decision ${decisionId}`);
    }
    
    // Record the choice
    this.#history.push({
      decisionId,
      optionId,
      timestamp: Date.now(),
      tape: decision.tape
    });
    
    // Apply effects
    const appliedEffects = [];
    for (const effectId of option.effects || []) {
      const result = this.#applyEffect(effectId);
      if (result) {
        appliedEffects.push({ id: effectId, ...result });
      }
    }
    
    // Persist state
    this.#saveState();
    
    return {
      decision: decisionId,
      option: optionId,
      effects: appliedEffects,
      state: this.getState()
    };
  }

  #applyEffect(effectId) {
    const effect = this.#effects.get(effectId);
    if (!effect) {
      console.warn(`Unknown effect: ${effectId}`);
      return null;
    }
    
    switch (effect.type) {
      case 'stat':
        const stat = effect.stat;
        const delta = effect.delta;
        if (this.#playerState.hasOwnProperty(stat)) {
          this.#playerState[stat] = Math.max(0, Math.min(100, 
            this.#playerState[stat] + delta));
        }
        return { type: 'stat', stat, delta, newValue: this.#playerState[stat] };
        
      case 'flag':
        this.#playerState.activeFlags.add(effectId);
        return { type: 'flag', flag: effectId };
        
      case 'memory':
        this.#playerState.memories.push({
          id: effectId,
          description: effect.description,
          timestamp: Date.now()
        });
        return { type: 'memory', memory: effectId };
        
      case 'arc':
        this.#playerState.arcFlags.add(effectId);
        return { type: 'arc', arc: effectId };
        
      default:
        return { type: 'unknown', effectId };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // STATE QUERIES
  // ═══════════════════════════════════════════════════════════════════

  getState() {
    return {
      trust: this.#playerState.trust,
      guard: this.#playerState.guard,
      honesty: this.#playerState.honesty,
      vulnerability: this.#playerState.vulnerability,
      flags: [...this.#playerState.activeFlags],
      memories: [...this.#playerState.memories],
      arcs: [...this.#playerState.arcFlags],
      history: [...this.#history]
    };
  }

  hasFlag(flagId) {
    return this.#playerState.activeFlags.has(flagId);
  }

  hasAnyFlag(...flagIds) {
    return flagIds.some(f => this.#playerState.activeFlags.has(f));
  }

  hasAllFlags(...flagIds) {
    return flagIds.every(f => this.#playerState.activeFlags.has(f));
  }

  getStat(statName) {
    return this.#playerState[statName] || 0;
  }

  getMemories() {
    return [...this.#playerState.memories];
  }

  hasMemory(memoryId) {
    return this.#playerState.memories.some(m => m.id === memoryId);
  }

  getHistory() {
    return [...this.#history];
  }

  getLastChoice(decisionId) {
    const entries = this.#history.filter(h => h.decisionId === decisionId);
    return entries.length > 0 ? entries[entries.length - 1] : null;
  }

  wasChoiceMade(decisionId, optionId) {
    return this.#history.some(h => 
      h.decisionId === decisionId && h.optionId === optionId);
  }

  // ═══════════════════════════════════════════════════════════════════
  // TAPE QUERIES
  // ═══════════════════════════════════════════════════════════════════

  getDecisionsForTape(tapeId) {
    const results = [];
    for (const [id, decision] of this.#decisions) {
      if (decision.tape === tapeId) {
        const lastChoice = this.getLastChoice(id);
        results.push({
          id,
          ...decision,
          chosen: lastChoice?.optionId || null
        });
      }
    }
    return results;
  }

  getPendingDecisions(tapeId) {
    return this.getDecisionsForTape(tapeId).filter(d => d.chosen === null);
  }

  getEffectsForTape(tapeId) {
    // Get all effects that have consumers in this tape
    const results = [];
    for (const [effectId, consumers] of this.#consumers) {
      const tapeConsumers = consumers.filter(c => c.tape === tapeId);
      if (tapeConsumers.length > 0) {
        const isActive = this.hasFlag(effectId) || this.hasMemory(effectId);
        results.push({
          effectId,
          isActive,
          consumers: tapeConsumers
        });
      }
    }
    return results;
  }

  // ═══════════════════════════════════════════════════════════════════
  // CALLBACK SYSTEM - For narrative text variations
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Get narrative variant based on player history
   * Returns the first matching variant from the provided options
   */
  getVariant(variants) {
    // variants = [{ requires: [...flags], text: "..." }, ...]
    for (const variant of variants) {
      const requires = variant.requires || [];
      const hasAll = requires.every(flag => 
        this.hasFlag(flag) || this.hasMemory(flag));
      if (hasAll) {
        return variant;
      }
    }
    return variants.find(v => !v.requires) || variants[0];
  }

  /**
   * Generate callback text for a specific memory
   * Useful for "remember when you..." moments
   */
  getCallbackText(effectId, templates) {
    const effect = this.#effects.get(effectId);
    if (!effect) return null;
    
    const isActive = this.hasFlag(effectId) || this.hasMemory(effectId);
    if (!isActive) return null;
    
    // templates = { active: "...", inactive: "..." }
    return templates.active || null;
  }

  // ═══════════════════════════════════════════════════════════════════
  // ENDING DETERMINATION
  // ═══════════════════════════════════════════════════════════════════

  determineEnding(endings) {
    // Check endings in order of specificity
    for (const [endingId, ending] of Object.entries(endings)) {
      // Check requires flags
      if (ending.requires) {
        const hasRequirements = ending.requires.every(flag => 
          this.hasFlag(flag) || this.#playerState.arcFlags.has(flag));
        if (!hasRequirements) continue;
      }
      
      // Check min_trust
      if (ending.min_trust && this.#playerState.trust < ending.min_trust) {
        continue;
      }
      
      // Check min_guard
      if (ending.min_guard && this.#playerState.guard < ending.min_guard) {
        continue;
      }
      
      return { id: endingId, ...ending };
    }
    
    // Default ending
    return { id: 'default', description: 'The story continues...' };
  }

  // ═══════════════════════════════════════════════════════════════════
  // PERSISTENCE
  // ═══════════════════════════════════════════════════════════════════

  #saveState() {
    const state = {
      stats: {
        trust: this.#playerState.trust,
        guard: this.#playerState.guard,
        honesty: this.#playerState.honesty,
        vulnerability: this.#playerState.vulnerability
      },
      flags: [...this.#playerState.activeFlags],
      memories: this.#playerState.memories,
      arcs: [...this.#playerState.arcFlags],
      history: this.#history
    };
    
    try {
      localStorage.setItem(DECISION_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to save state to localStorage:', e);
    }
  }

  #restoreState() {
    try {
      const saved = localStorage.getItem(DECISION_KEY);
      if (!saved) return;
      
      const state = JSON.parse(saved);
      
      if (state.stats) {
        Object.assign(this.#playerState, state.stats);
      }
      
      if (state.flags) {
        this.#playerState.activeFlags = new Set(state.flags);
      }
      
      if (state.memories) {
        this.#playerState.memories = state.memories;
      }
      
      if (state.arcs) {
        this.#playerState.arcFlags = new Set(state.arcs);
      }
      
      if (state.history) {
        this.#history = state.history;
      }
      
      console.log(`✓ Restored state: ${this.#history.length} choices, ${this.#playerState.activeFlags.size} flags`);
    } catch (e) {
      console.warn('Failed to restore state from localStorage:', e);
    }
  }

  resetState() {
    this.#playerState = {
      trust: 0,
      guard: 0,
      honesty: 0,
      vulnerability: 0,
      activeFlags: new Set(),
      memories: [],
      arcFlags: new Set()
    };
    this.#history = [];
    localStorage.removeItem(DECISION_KEY);
  }

  // ═══════════════════════════════════════════════════════════════════
  // DEBUG UTILITIES
  // ═══════════════════════════════════════════════════════════════════

  exportState() {
    return JSON.stringify(this.getState(), null, 2);
  }

  importState(jsonString) {
    try {
      const state = JSON.parse(jsonString);
      localStorage.setItem(DECISION_KEY, JSON.stringify(state));
      this.#restoreState();
      return true;
    } catch (e) {
      console.error('Failed to import state:', e);
      return false;
    }
  }

  printGraph() {
    console.group('Decision Graph');
    console.log(`Decisions: ${this.#decisions.size}`);
    console.log(`Effects: ${this.#effects.size}`);
    console.log(`Consumer edges: ${this.#consumers.size}`);
    console.groupEnd();
  }

  printState() {
    console.group('Player State');
    console.log('Stats:', {
      trust: this.#playerState.trust,
      guard: this.#playerState.guard,
      honesty: this.#playerState.honesty,
      vulnerability: this.#playerState.vulnerability
    });
    console.log('Flags:', [...this.#playerState.activeFlags]);
    console.log('Arcs:', [...this.#playerState.arcFlags]);
    console.log('History:', this.#history);
    console.groupEnd();
  }
}

// Singleton export
const engine = new DecisionEngine();
export default engine;
