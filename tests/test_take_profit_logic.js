/**
 * Test script cho Take Profit logic
 * Chạy: node tests/test_take_profit_logic.js
 */
import { calculateTPLevels, roundToTickSize, getTpStateMap } from '../src/trading/takeProfitService.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAILED: ${message}`);
    failed++;
  }
}

function approxEqual(a, b, tolerance = 0.0001) {
  return Math.abs(a - b) <= tolerance;
}

// ─────────────────────────────────────────
// Test 1: roundToTickSize
// ─────────────────────────────────────────
console.log('\n📐 Test 1: roundToTickSize');

assert(roundToTickSize(1.23456, 0.01) === 1.23, 'Round 1.23456 with tickSize 0.01 → 1.23');
assert(roundToTickSize(1.23456, 0.001) === 1.235, 'Round 1.23456 with tickSize 0.001 → 1.235');
assert(roundToTickSize(100.7, 1) === 101, 'Round 100.7 with tickSize 1 → 101');
assert(roundToTickSize(100.5, null) === 100.5, 'No tickSize → unchanged');

// ─────────────────────────────────────────
// Test 2: calculateTPLevels - basic
// ─────────────────────────────────────────
console.log('\n📐 Test 2: calculateTPLevels – pump 50%, entry $100');

// Override config để test độc lập
import { config } from '../src/config.js';
const origRatio1 = config.tpRatio1;
const origRatio2 = config.tpRatio2;
const origRatio3 = config.tpRatio3;
config.tpRatio1 = 0.20;
config.tpRatio2 = 0.40;
config.tpRatio3 = 0.60;

const { tp1Price: tp1a, tp2Price: tp2a, tp3Price: tp3a } = calculateTPLevels(100, 0.50);
// pump 50%, tpRatio1=0.20 → profit 10% → price = 100 × (1 - 0.50 × 0.20) = 100 × 0.90 = 90
assert(approxEqual(tp1a, 90), `TP1 @ 90 (got ${tp1a})`);
// tpRatio2=0.40 → profit 20% → 100 × 0.80 = 80
assert(approxEqual(tp2a, 80), `TP2 @ 80 (got ${tp2a})`);
// tpRatio3=0.60 → profit 30% → 100 × 0.70 = 70
assert(approxEqual(tp3a, 70), `TP3 @ 70 (got ${tp3a})`);

// ─────────────────────────────────────────
// Test 3: calculateTPLevels - pump 30%, entry $500
// ─────────────────────────────────────────
console.log('\n📐 Test 3: calculateTPLevels – pump 30%, entry $500');

const { tp1Price: tp1b, tp2Price: tp2b, tp3Price: tp3b } = calculateTPLevels(500, 0.30);
// TP1: 500 × (1 - 0.30 × 0.20) = 500 × 0.94 = 470
assert(approxEqual(tp1b, 470), `TP1 @ 470 (got ${tp1b})`);
// TP2: 500 × (1 - 0.30 × 0.40) = 500 × 0.88 = 440
assert(approxEqual(tp2b, 440), `TP2 @ 440 (got ${tp2b})`);
// TP3: 500 × (1 - 0.30 × 0.60) = 500 × 0.82 = 410
assert(approxEqual(tp3b, 410), `TP3 @ 410 (got ${tp3b})`);

// ─────────────────────────────────────────
// Test 4: calculateTPLevels - pump 100%, entry $1, tickSize 0.0001
// ─────────────────────────────────────────
console.log('\n📐 Test 4: calculateTPLevels – pump 100%, entry $1, tickSize 0.0001');

const { tp1Price: tp1c, tp2Price: tp2c, tp3Price: tp3c } = calculateTPLevels(1, 1.00, 0.0001);
// TP1: 1 × (1 - 1.0 × 0.20) = 0.80
assert(approxEqual(tp1c, 0.80), `TP1 @ 0.80 (got ${tp1c})`);
// TP2: 0.60
assert(approxEqual(tp2c, 0.60), `TP2 @ 0.60 (got ${tp2c})`);
// TP3: 0.40
assert(approxEqual(tp3c, 0.40), `TP3 @ 0.40 (got ${tp3c})`);

// ─────────────────────────────────────────
// Test 5: TP State Map starts empty
// ─────────────────────────────────────────
console.log('\n📐 Test 5: TP State Map initial state');

const stateMap = getTpStateMap();
assert(stateMap instanceof Map, 'getTpStateMap returns a Map');
assert(stateMap.size === 0, 'State map starts empty');

// ─────────────────────────────────────────
// Restore config
// ─────────────────────────────────────────
config.tpRatio1 = origRatio1;
config.tpRatio2 = origRatio2;
config.tpRatio3 = origRatio3;

// ─────────────────────────────────────────
// Summary
// ─────────────────────────────────────────
console.log(`\n${'='.repeat(40)}`);
console.log(`✅ Passed: ${passed} | ❌ Failed: ${failed}`);
if (failed > 0) process.exit(1);
