/**
 * RelationshipEngine - Single-focus relationship dynamics
 * 
 * This engine is designed for ONE central relationship (you + Minji)
 * Unlike multi-character systems, this tracks a deepening connection.
 * 
 * KEY INSIGHT: Depth comes from emotional resonance, not character count.
 * 
 * @version 1.0.0
 */

import engine from './DecisionEngine.js';

const RELATIONSHIP_KEY = 'seed_archive_relationship_v1';

class RelationshipEngine {
  #state;
  #milestones;
  
  constructor() {
    // Relationship state - evolves across tapes
    this.#state = {
      phase: 'strangers',           // strangers → acquaintances → friends → close → intimate
      firstImpression: null,        // eager | guarded | passive
      firstPhysicalContact: null,   // timestamp or null
      firstVulnerability: null,     // timestamp or null
      biggestTrustMoment: null,     // decision ID
      biggestGuardMoment: null,     // decision ID
      sharedGames: 0,
      lateNightCalls: 0,
      jealousMoments: 0,
      vulnerableMoments: 0,
      insideJokes: [],
      unsaidThings: [],             // Things that were hidden
      soilType: null                // rich | rocky | barren
    };
    
    // Relationship milestones that unlock content
    this.#milestones = {
      first_smile_caught: {
        threshold: { any: ['e_caught_smiling'] },
        description: 'She caught you smiling'
      },
      first_touch: {
        threshold: { any: ['e_physical_contact'] },
        description: 'First physical contact'
      },
      first_3am: {
        threshold: { any: ['e_voice_heard_3am', 'e_voice_shared'] },
        description: 'Shared the night together'
      },
      sunrise_together: {
        threshold: { any: ['e_sunrise_together'] },
        description: 'Talked until sunrise'
      },
      jealousy_revealed: {
        threshold: { any: ['e_jealousy_shown'] },
        description: 'Your jealousy surfaced'
      },
      committed: {
        threshold: { any: ['e_committed'] },
        description: 'You chose to lean in'
      },
      soil_chosen: {
        threshold: { any: ['e_soil_rich', 'e_soil_rocky', 'e_soil_barren'] },
        description: 'You chose your soil'
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════

  async initialize() {
    this.#restoreState();
    this.#syncWithDecisions();
    return this;
  }

  #syncWithDecisions() {
    // Sync state from DecisionEngine
    const state = engine.getState();
    
    // Update counts based on flags
    if (engine.hasFlag('e_game_memory')) this.#state.sharedGames++;
    if (engine.hasAnyFlag('e_voice_heard_3am', 'e_voice_shared')) this.#state.lateNightCalls++;
    if (engine.hasFlag('e_jealousy_shown')) this.#state.jealousyMoments++;
    if (engine.hasFlag('e_vulnerability_shown')) this.#state.vulnerableMoments++;
    
    // Set first impression
    if (engine.hasFlag('e_first_impression_eager')) this.#state.firstImpression = 'eager';
    else if (engine.hasFlag('e_first_impression_guarded')) this.#state.firstImpression = 'guarded';
    else if (engine.hasFlag('e_first_impression_passive')) this.#state.firstImpression = 'passive';
    
    // Set soil type
    if (engine.hasFlag('e_soil_rich')) this.#state.soilType = 'rich';
    else if (engine.hasFlag('e_soil_rocky')) this.#state.soilType = 'rocky';
    else if (engine.hasFlag('e_soil_barren')) this.#state.soilType = 'barren';
    
    // Update phase based on trust level
    this.#updatePhase();
  }

  #updatePhase() {
    const trust = engine.getStat('trust');
    const guard = engine.getStat('guard');
    const net = trust - guard;
    
    if (net < -5) {
      this.#state.phase = 'strangers';
    } else if (net < 5) {
      this.#state.phase = 'acquaintances';
    } else if (net < 15) {
      this.#state.phase = 'friends';
    } else if (net < 25) {
      this.#state.phase = 'close';
    } else {
      this.#state.phase = 'intimate';
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // TONE SYSTEM - How she speaks based on relationship state
  // ═══════════════════════════════════════════════════════════════════

  getTone() {
    const trust = engine.getStat('trust');
    const guard = engine.getStat('guard');
    
    // Calculate tone based on trust/guard balance
    if (trust > guard + 10) {
      return {
        warmth: 'high',
        openness: 'vulnerable',
        playfulness: 'high',
        description: 'She speaks to you like someone who trusts you'
      };
    } else if (trust > guard) {
      return {
        warmth: 'medium',
        openness: 'cautious',
        playfulness: 'medium',
        description: 'She speaks to you with growing warmth'
      };
    } else if (guard > trust + 5) {
      return {
        warmth: 'low',
        openness: 'guarded',
        playfulness: 'minimal',
        description: 'She speaks to you carefully'
      };
    } else {
      return {
        warmth: 'neutral',
        openness: 'neutral',
        playfulness: 'testing',
        description: 'She speaks to you like she\'s still figuring you out'
      };
    }
  }

  getDialogueVariant(baseDialogues) {
    const tone = this.getTone();
    const phase = this.#state.phase;
    
    // baseDialogues structure:
    // { default: "...", intimate: "...", guarded: "...", friends: "..." }
    
    if (baseDialogues[phase]) return baseDialogues[phase];
    if (tone.warmth === 'high' && baseDialogues.intimate) return baseDialogues.intimate;
    if (tone.warmth === 'low' && baseDialogues.guarded) return baseDialogues.guarded;
    return baseDialogues.default || baseDialogues[Object.keys(baseDialogues)[0]];
  }

  // ═══════════════════════════════════════════════════════════════════
  // CALLBACK SYSTEM - "Remember when..." moments
  // ═══════════════════════════════════════════════════════════════════

  getCallback(callbackId) {
    const callbacks = {
      'first_message': {
        requires: ['e_replied_fast', 'e_replied_slow'],
        variants: {
          e_replied_fast: "You replied to that first message in under a minute. She noticed.",
          e_replied_slow: "You waited three hours to reply. She noticed that too."
        }
      },
      'sigma_smile': {
        requires: ['e_caught_smiling'],
        text: "She still teases you about the smile she caught when she said 'sigma'."
      },
      'princess_tycoon': {
        requires: ['e_game_memory'],
        text: "Princess tycoon became your game. Two hours that turned into something else entirely."
      },
      'scratch_touch': {
        requires: ['e_physical_contact'],
        text: "Three seconds. That's how long you held her hand examining that scratch. Neither of you has mentioned it since."
      },
      '3am_call': {
        requires: ['e_voice_heard_3am'],
        text: "The 3am call. You talked until the sun came up. Some nights are written in permanent ink."
      },
      'jealousy': {
        requires: ['e_jealousy_shown'],
        variants: {
          e_territorial: "You told her to tell him she was busy. The fifth word was silent: 'with me.'",
          e_different_answer: "She called you 'different.' You still don't know if that's good or dangerous.",
          e_mask_worn: "You changed the subject when she mentioned him. She saw through it."
        }
      },
      'sunrise': {
        requires: ['e_sunrise_together'],
        text: "The sunrise you shared on the phone. Neither of you wanted to hang up first."
      },
      'soil_choice': {
        requires: ['e_soil_rich', 'e_soil_rocky', 'e_soil_barren'],
        variants: {
          e_soil_rich: "You chose rich soil. You're all in.",
          e_soil_rocky: "You chose rocky soil. Cautious, but still planting.",
          e_soil_barren: "You chose barren ground. The seed waits."
        }
      }
    };
    
    const callback = callbacks[callbackId];
    if (!callback) return null;
    
    // Check if requirements met
    const hasRequirement = callback.requires.some(flag => 
      engine.hasFlag(flag) || engine.hasMemory(flag));
    
    if (!hasRequirement) return null;
    
    // Return appropriate variant
    if (callback.variants) {
      for (const [flag, text] of Object.entries(callback.variants)) {
        if (engine.hasFlag(flag)) return text;
      }
    }
    
    return callback.text || null;
  }

  /**
   * Get all active callbacks for a given tape
   * Useful for assembling "previously on..." summaries
   */
  getActiveCallbacks(tapeId) {
    const tapeCallbacks = {
      tape1: [],
      tape2: ['first_message', 'sigma_smile', 'princess_tycoon'],
      tape3: ['scratch_touch', '3am_call', 'jealousy'],
      tape4: ['sunrise', 'jealousy'],
      tape5: ['soil_choice', 'sunrise', 'scratch_touch', 'princess_tycoon']
    };
    
    const active = [];
    for (const callbackId of (tapeCallbacks[tapeId] || [])) {
      const text = this.getCallback(callbackId);
      if (text) {
        active.push({ id: callbackId, text });
      }
    }
    return active;
  }

  // ═══════════════════════════════════════════════════════════════════
  // MILESTONE SYSTEM - Unlock special content
  // ═══════════════════════════════════════════════════════════════════

  hasMilestone(milestoneId) {
    const milestone = this.#milestones[milestoneId];
    if (!milestone) return false;
    
    if (milestone.threshold.any) {
      return milestone.threshold.any.some(flag => engine.hasFlag(flag));
    }
    if (milestone.threshold.all) {
      return milestone.threshold.all.every(flag => engine.hasFlag(flag));
    }
    return false;
  }

  getMilestones() {
    const active = [];
    for (const [id, milestone] of Object.entries(this.#milestones)) {
      if (this.hasMilestone(id)) {
        active.push({ id, ...milestone });
      }
    }
    return active;
  }

  // ═══════════════════════════════════════════════════════════════════
  // NARRATIVE GENERATION - Dynamic text based on state
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Generate a personalized narrative introduction for a tape
   */
  getTapeIntroduction(tapeId) {
    const callbacks = this.getActiveCallbacks(tapeId);
    const tone = this.getTone();
    const phase = this.#state.phase;
    
    const introductions = {
      tape1: {
        default: "A notification illuminates your screen. A message from a number you don't recognize."
      },
      tape2: {
        default: "Weeks have passed. The messages are no longer from a stranger.",
        friends: "Weeks have passed. She messages you now like it's the most natural thing in the world.",
        close: "Weeks have passed. Her name on your screen makes you feel something you're not ready to name."
      },
      tape3: {
        default: "Months pass. Patterns form. You notice things you didn't before.",
        close: "Months pass. You know her patterns now. And she knows yours.",
        intimate: "Months pass. You've stopped counting how many times you've talked until 3am."
      },
      tape4: {
        default: "Seasons change. The seed in the ground has roots now.",
        intimate: "Seasons change. What started as an accident has become something you can't imagine losing."
      },
      tape5: {
        default: "The final tape. What grows here depends entirely on the soil you chose.",
        rich: "The final tape. Rich soil. Full investment. Whatever grows, you're ready.",
        rocky: "The final tape. Rocky soil. Hard-won roots. What survives here will be strong.",
        barren: "The final tape. Barren ground. The seed waits still. Some things need more time."
      }
    };
    
    const tapeIntros = introductions[tapeId];
    if (!tapeIntros) return null;
    
    // Try soil type first for tape5
    if (tapeId === 'tape5' && this.#state.soilType && tapeIntros[this.#state.soilType]) {
      return tapeIntros[this.#state.soilType];
    }
    
    // Try phase
    if (tapeIntros[phase]) return tapeIntros[phase];
    
    return tapeIntros.default;
  }

  /**
   * Generate summary of relationship for end-of-tape reflection
   */
  getRelationshipSummary() {
    const trust = engine.getStat('trust');
    const guard = engine.getStat('guard');
    const memories = engine.getMemories();
    const milestones = this.getMilestones();
    
    return {
      phase: this.#state.phase,
      trust,
      guard,
      net: trust - guard,
      memories: memories.length,
      milestones: milestones.length,
      soilType: this.#state.soilType,
      firstImpression: this.#state.firstImpression,
      summary: this.#generateSummaryText()
    };
  }

  #generateSummaryText() {
    const trust = engine.getStat('trust');
    const guard = engine.getStat('guard');
    const net = trust - guard;
    
    if (net >= 20) {
      return "You've built something real. The walls are down. She sees you.";
    } else if (net >= 10) {
      return "You're letting her in. Slowly. Carefully. But definitely.";
    } else if (net >= 0) {
      return "You're still deciding. The door is ajar, but you're holding it.";
    } else if (net >= -10) {
      return "You're protecting yourself. Maybe too much. The door is closing.";
    } else {
      return "The walls are up. You've chosen safety over risk.";
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // PERSISTENCE
  // ═══════════════════════════════════════════════════════════════════

  #saveState() {
    try {
      localStorage.setItem(RELATIONSHIP_KEY, JSON.stringify(this.#state));
    } catch (e) {
      console.warn('Failed to save relationship state:', e);
    }
  }

  #restoreState() {
    try {
      const saved = localStorage.getItem(RELATIONSHIP_KEY);
      if (saved) {
        this.#state = { ...this.#state, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Failed to restore relationship state:', e);
    }
  }

  reset() {
    this.#state = {
      phase: 'strangers',
      firstImpression: null,
      firstPhysicalContact: null,
      firstVulnerability: null,
      biggestTrustMoment: null,
      biggestGuardMoment: null,
      sharedGames: 0,
      lateNightCalls: 0,
      jealousMoments: 0,
      vulnerableMoments: 0,
      insideJokes: [],
      unsaidThings: [],
      soilType: null
    };
    localStorage.removeItem(RELATIONSHIP_KEY);
  }

  // ═══════════════════════════════════════════════════════════════════
  // DEBUG
  // ═══════════════════════════════════════════════════════════════════

  printState() {
    console.group('Relationship State');
    console.log('Phase:', this.#state.phase);
    console.log('First Impression:', this.#state.firstImpression);
    console.log('Soil Type:', this.#state.soilType);
    console.log('Tone:', this.getTone());
    console.log('Milestones:', this.getMilestones());
    console.log('Summary:', this.getRelationshipSummary());
    console.groupEnd();
  }
}

// Singleton export
const relationshipEngine = new RelationshipEngine();
export default relationshipEngine;
