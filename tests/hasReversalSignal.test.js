import test from 'node:test';
import assert from 'node:assert/strict';

import { hasReversalSignal } from '../src/indicators/candlestickPattern.js';

test('hasReversalSignal detects inverted hammer from provided data', () => {
  const candles = [
    { open: 0.003188, close: 0.003172, high: 0.003299, low: 0.002977 },
    { open: 0.003172, close: 0.003355, high: 0.00338, low: 0.003037 },
    { open: 0.003355, close: 0.003606, high: 0.00389, low: 0.003313 },
    { open: 0.003606, close: 0.003805, high: 0.003843, low: 0.003536 },
    { open: 0.003805, close: 0.003511, high: 0.00388, low: 0.003391 },
    { open: 0.003511, close: 0.003689, high: 0.003765, low: 0.003461 },
    { open: 0.003689, close: 0.004156, high: 0.004403, low: 0.00368 },
    { open: 0.004156, close: 0.004083, high: 0.004268, low: 0.004047 },
    { open: 0.004083, close: 0.004116, high: 0.004376, low: 0.004083 },
  ];

  const result = hasReversalSignal(candles);

  assert.equal(result, true, 'Expected inverted hammer to be detected as reversal signal');
});

