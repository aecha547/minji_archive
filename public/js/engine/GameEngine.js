/**
 * GameEngine - Unified API for narrative games
 * 
 * This provides a simple interface that combines:
 * - DecisionEngine (choice tracking, effects, ghost prevention)
 * - RelationshipEngine (tone, callbacks, milestones)
 * 
 * Usage in tape HTML files:
 * 
 *   import game from '/js/engine/GameEngine.js';
 *   
 *   await game.initialize();
 *   
 *   // Make a choice
 *   const result = await game.presentChoice('d_tape1_reply_speed', {
 *     text: "Reply immediately",
 *     preview: "Curiosity over caution"
 *   });
 *   
 *   // Get narrative variant based on history
 *   const intro = game.getVariant({
 *     default: "She messages you...",
 *     intimate: "Her name appears and you smile before you realize..."
 *   });
 */

import DecisionEngine from './DecisionEngine.js';
import RelationshipEngine from './RelationshipEngine.js';

class GameEngine {
  #initialized = false;
  #currentTape = null;
  
  async initialize(tapeId = null) {
    if (this.#initialized) return this;
    
    // Load decision graph
    await DecisionEngine.load('/data/decisions.json');
    
    // Initialize relationship state
    await RelationshipEngine.initialize();
    
    this.#currentTape = tapeId;
    this.#initialized = true;
    
    console.log('✓ GameEngine initialized');
    return this;
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // DECISION MAKING
  // ═══════════════════════════════════════════════════════════════════
  
  /**
   * Make a choice and get the result
   */
  makeChoice(decisionId, optionId) {
    if (!this.#initialized) {
      console.warn('GameEngine not initialized. Call initialize() first.');
    }
    
    const result = DecisionEngine.makeChoice(decisionId, optionId);
    
    // Sync relationship state after choice
    RelationshipEngine.initialize();
    
    return result;
  }
  
  /**
   * Check if a choice was already made
   */
  wasChoiceMade(decisionId, optionId = null) {
    if (optionId) {
      return DecisionEngine.wasChoiceMade(decisionId, optionId);
    }
    return DecisionEngine.getLastChoice(decisionId) !== null;
  }
  
  /**
   * Get the last chosen option for a decision
   */
  getChosenOption(decisionId) {
    const last = DecisionEngine.getLastChoice(decisionId);
    return last?.optionId || null;
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // STATE QUERIES
  // ═══════════════════════════════════════════════════════════════════
  
  getStats() {
    return {
      trust: DecisionEngine.getStat('trust'),
      guard: DecisionEngine.getStat('guard'),
      honesty: DecisionEngine.getStat('honesty'),
      vulnerability: DecisionEngine.getStat('vulnerability')
    };
  }
  
  hasFlag(flagId) {
    return DecisionEngine.hasFlag(flagId);
  }
  
  hasAnyFlag(...flagIds) {
    return DecisionEngine.hasAnyFlag(...flagIds);
  }
  
  getHistory() {
    return DecisionEngine.getHistory();
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // NARRATIVE VARIANTS
  // ═══════════════════════════════════════════════════════════════════
  
  /**
   * Get a narrative variant based on player state
   * variants = { default: "...", [condition]: "..." }
   */
  getVariant(variants) {
    // Check for trust-based variants
    const trust = DecisionEngine.getStat('trust');
    const guard = DecisionEngine.getStat('guard');
    
    // Priority: flag conditions → trust level → default
    for (const [key, text] of Object.entries(variants)) {
      if (key === 'default') continue;
      
      // Check if key is a flag requirement
      if (this.hasFlag(key) || this.hasAnyFlag(key)) {
        return text;
      }
      
      // Check if key is a trust threshold
      if (key.startsWith('trust_')) {
        const threshold = parseInt(key.split('_')[1]);
        if (!isNaN(threshold) && trust >= threshold) {
          return text;
        }
      }
      
      // Check if key is a guard threshold
      if (key.startsWith('guard_')) {
        const threshold = parseInt(key.split('_')[1]);
        if (!isNaN(threshold) && guard >= threshold) {
          return text;
        }
      }
    }
    
    // Check relationship phase
    const phase = RelationshipEngine.getTone?.() || null;
    if (phase && variants[phase?.warmth]) {
      return variants[phase.warmth];
    }
    
    return variants.default || Object.values(variants)[0];
  }
  
  /**
   * Get a callback ("remember when...") text
   */
  getCallback(callbackId) {
    return RelationshipEngine.getCallback(callbackId);
  }
  
  /**
   * Get all active callbacks for the current tape
   */
  getActiveCallbacks(tapeId = null) {
    return RelationshipEngine.getActiveCallbacks(tapeId || this.#currentTape);
  }
  
  /**
   * Get tape introduction text based on relationship state
   */
  getTapeIntroduction(tapeId = null) {
    return RelationshipEngine.getTapeIntroduction(tapeId || this.#currentTape);
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // RELATIONSHIP
  // ═══════════════════════════════════════════════════════════════════
  
  getTone() {
    return RelationshipEngine.getTone();
  }
  
  getPhase() {
    return RelationshipEngine.getRelationshipSummary()?.phase || 'strangers';
  }
  
  hasMilestone(milestoneId) {
    return RelationshipEngine.hasMilestone(milestoneId);
  }
  
  getMilestones() {
    return RelationshipEngine.getMilestones();
  }
  
  getRelationshipSummary() {
    return RelationshipEngine.getRelationshipSummary();
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // TAPE-SPECIFIC
  // ═══════════════════════════════════════════════════════════════════
  
  setCurrentTape(tapeId) {
    this.#currentTape = tapeId;
  }
  
  getDecisionsForTape(tapeId = null) {
    return DecisionEngine.getDecisionsForTape(tapeId || this.#currentTape);
  }
  
  getPendingDecisions(tapeId = null) {
    return DecisionEngine.getPendingDecisions(tapeId || this.#currentTape);
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // ENDINGS
  // ═══════════════════════════════════════════════════════════════════
  
  getEnding(endings) {
    return DecisionEngine.determineEnding(endings);
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // PERSISTENCE
  // ═══════════════════════════════════════════════════════════════════
  
  resetAll() {
    DecisionEngine.resetState();
    RelationshipEngine.reset();
    this.#initialized = false;
  }
  
  exportState() {
    return DecisionEngine.exportState();
  }
  
  importState(jsonString) {
    return DecisionEngine.importState(jsonString);
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // DEBUG
  // ═══════════════════════════════════════════════════════════════════
  
  printState() {
    DecisionEngine.printState();
    RelationshipEngine.printState();
  }
}

// Singleton export
const game = new GameEngine();
export default game;

// Also export individual engines for advanced use
export { DecisionEngine, RelationshipEngine };
