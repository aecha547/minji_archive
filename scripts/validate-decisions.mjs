#!/usr/bin/env node
/**
 * validate-decisions.mjs - Ghost Decision Detector
 * 
 * Run with: node scripts/validate-decisions.mjs
 * 
 * This script validates the decision graph to ensure:
 * 1. Every effect is consumed by at least one downstream decision
 * 2. Every decision has at least one option with unique effects
 * 3. No broken references (effects/decisions that don't exist)
 * 4. Tape ordering is valid (no backwards dependencies)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, '../public/data/decisions.json');

function validate(jsonPath) {
  console.log('══════════════════════════════════════════════════════════════');
  console.log('  DECISION GRAPH VALIDATOR');
  console.log('══════════════════════════════════════════════════════════════\n');
  
  // Load data
  let data;
  try {
    const raw = fs.readFileSync(jsonPath, 'utf-8');
    data = JSON.parse(raw);
  } catch (e) {
    console.error('✗ FATAL: Failed to load decisions.json:', e.message);
    process.exit(1);
  }
  
  const decisions = data.decisions || {};
  const effects = data.effects || {};
  const consumers = data.consumers || {};
  const tapeOrder = data.meta?.tapes || [];
  
  const errors = [];
  const warnings = [];
  const stats = {
    decisions: Object.keys(decisions).length,
    effects: Object.keys(effects).length,
    options: 0,
    ghosts: 0,
    broken: 0,
    unused: 0
  };
  
  // Build indexes
  const producedEffects = new Map(); // effectId -> [decisionIds that produce it]
  const consumedEffects = new Map(); // effectId -> [decisionIds that consume it]
  const allEffectIds = new Set(Object.keys(effects));
  const allDecisionIds = new Set(Object.keys(decisions));
  
  // ─── CHECK 1: Index all produced effects ───
  for (const [decId, decision] of Object.entries(decisions)) {
    for (const option of decision.options || []) {
      stats.options++;
      for (const effectId of option.effects || []) {
        if (!producedEffects.has(effectId)) {
          producedEffects.set(effectId, []);
        }
        producedEffects.get(effectId).push(decId);
      }
    }
  }
  
  // ─── CHECK 2: Index all consumed effects ───
  for (const [consumerId, consumer] of Object.entries(consumers)) {
    for (const effectId of consumer.checks || []) {
      if (!consumedEffects.has(effectId)) {
        consumedEffects.set(effectId, []);
      }
      consumedEffects.get(effectId).push(consumerId);
    }
  }
  
  // ─── CHECK 3: Broken references ───
  console.log('Checking for broken references...');
  
  for (const [decId, decision] of Object.entries(decisions)) {
    for (const option of decision.options || []) {
      for (const effectId of option.effects || []) {
        if (!allEffectIds.has(effectId)) {
          errors.push({
            type: 'BROKEN_EFFECT_REFERENCE',
            message: `Decision "${decId}" option "${option.id}" references non-existent effect "${effectId}"`,
            severity: 'error'
          });
          stats.broken++;
        }
      }
    }
  }
  
  for (const [consumerId, consumer] of Object.entries(consumers)) {
    for (const effectId of consumer.checks || []) {
      if (!allEffectIds.has(effectId)) {
        errors.push({
          type: 'BROKEN_CONSUMER_REFERENCE',
          message: `Consumer "${consumerId}" checks non-existent effect "${effectId}"`,
          severity: 'error'
        });
        stats.broken++;
      }
    }
  }
  
  // ─── CHECK 4: Ghost effects (produced but never consumed) ───
  console.log('Checking for ghost effects...');
  
  for (const [effectId, producers] of producedEffects) {
    const effect = effects[effectId];
    const effectConsumers = consumedEffects.get(effectId) || [];
    
    // Stat effects are always "consumed" (they affect endings via getStat)
    if (effect?.type === 'stat') continue;
    
    // Arc effects are consumed by ending conditions
    if (effect?.type === 'arc') continue;
    
    // Flag/memory effects need explicit consumers
    if (effectConsumers.length === 0 && !effect?.consumed_by?.length) {
      // Check if effect has inline consumed_by
      if (effect?.consumed_by && effect.consumed_by.length > 0) continue;
      
      warnings.push({
        type: 'GHOST_EFFECT',
        message: `Effect "${effectId}" is produced by [${producers.join(', ')}] but has no consumers. ${effect?.description || ''}`,
        severity: 'warning',
        effectId,
        producers
      });
      stats.ghosts++;
    }
  }
  
  // ─── CHECK 5: Unused effects (defined but never produced) ───
  console.log('Checking for unused effects...');
  
  for (const effectId of allEffectIds) {
    if (!producedEffects.has(effectId)) {
      warnings.push({
        type: 'UNUSED_EFFECT',
        message: `Effect "${effectId}" is defined but never produced by any decision`,
        severity: 'warning',
        effectId
      });
      stats.unused++;
    }
  }
  
  // ─── CHECK 6: Ghost decisions (all options produce identical effects) ───
  console.log('Checking for ghost decisions...');
  
  for (const [decId, decision] of Object.entries(decisions)) {
    const optionEffectSets = decision.options?.map(opt => {
      return new Set(opt.effects || []);
    }) || [];
    
    if (optionEffectSets.length >= 2) {
      const allIdentical = optionEffectSets.every((set, i, arr) => {
        if (i === 0) return true;
        return setsEqual(set, arr[0]);
      });
      
      if (allIdentical) {
        errors.push({
          type: 'GHOST_DECISION',
          message: `Decision "${decId}" has all identical effect sets. This choice changes nothing.`,
          severity: 'error',
          decisionId: decId
        });
      }
    }
  }
  
  // ─── CHECK 7: Tape ordering ───
  console.log('Checking tape ordering...');
  
  const tapeIndex = {};
  tapeOrder.forEach((tape, i) => tapeIndex[tape] = i);
  
  for (const [consumerId, consumer] of Object.entries(consumers)) {
    const consumerTape = consumer.tape;
    const consumerIdx = tapeIndex[consumerTape];
    
    if (consumerIdx === undefined) {
      warnings.push({
        type: 'UNKNOWN_TAPE',
        message: `Consumer "${consumerId}" references unknown tape "${consumerTape}"`,
        severity: 'warning'
      });
      continue;
    }
    
    for (const effectId of consumer.checks || []) {
      const producers = producedEffects.get(effectId) || [];
      for (const producerDecId of producers) {
        const producerDec = decisions[producerDecId];
        const producerTape = producerDec?.tape;
        const producerIdx = tapeIndex[producerTape];
        
        if (producerIdx !== undefined && producerIdx > consumerIdx) {
          errors.push({
            type: 'BACKWARD_DEPENDENCY',
            message: `Consumer in "${consumerTape}" depends on effect from later tape "${producerTape}" (${effectId})`,
            severity: 'error',
            consumerTape,
            producerTape
          });
        }
      }
    }
  }
  
  // ─── REPORT ───
  console.log('\n────────────────────────────────────────────────────────────────');
  console.log('  STATISTICS');
  console.log('────────────────────────────────────────────────────────────────');
  console.log(`  Decisions:      ${stats.decisions}`);
  console.log(`  Options:        ${stats.options}`);
  console.log(`  Effects:        ${stats.effects}`);
  console.log(`  Broken refs:    ${stats.broken}`);
  console.log(`  Ghost effects:  ${stats.ghosts}`);
  console.log(`  Unused effects: ${stats.unused}`);
  console.log('────────────────────────────────────────────────────────────────\n');
  
  if (errors.length > 0) {
    console.log('────────────────────────────────────────────────────────────────');
    console.log('  ✗ ERRORS');
    console.log('────────────────────────────────────────────────────────────────');
    errors.forEach((e, i) => {
      console.log(`  ${i + 1}. [${e.type}] ${e.message}`);
    });
    console.log('');
  }
  
  if (warnings.length > 0) {
    console.log('────────────────────────────────────────────────────────────────');
    console.log('  ⚠ WARNINGS');
    console.log('────────────────────────────────────────────────────────────────');
    warnings.forEach((w, i) => {
      console.log(`  ${i + 1}. [${w.type}] ${w.message}`);
    });
    console.log('');
  }
  
  // ─── VERDICT ───
  console.log('══════════════════════════════════════════════════════════════');
  
  if (errors.length === 0 && warnings.length === 0) {
    console.log('  ✓ VALIDATION PASSED — NO GHOST DECISIONS');
    console.log('══════════════════════════════════════════════════════════════');
    process.exit(0);
  } else if (errors.length === 0) {
    console.log('  ✓ VALIDATION PASSED (with warnings)');
    console.log('══════════════════════════════════════════════════════════════');
    process.exit(0);
  } else {
    console.log('  ✗ VALIDATION FAILED');
    console.log('══════════════════════════════════════════════════════════════');
    process.exit(1);
  }
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

// Run validation
validate(DATA_PATH);
