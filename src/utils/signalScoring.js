import { config } from '../config.js';

const LARGE_TIMEFRAMES = ['Day1', 'Week1', 'Hour8', 'Hour4'];
const MEDIUM_TIMEFRAMES = ['Hour1', 'Min60', 'Min30'];
const SMALL_TIMEFRAMES = ['Min15', 'Min5', 'Min1'];

function getTimeframeGroup(timeframe) {
  if (!timeframe) return 'small';
  if (LARGE_TIMEFRAMES.includes(timeframe)) return 'large';
  if (MEDIUM_TIMEFRAMES.includes(timeframe)) return 'medium';
  if (SMALL_TIMEFRAMES.includes(timeframe)) return 'small';
  return 'small';
}

function getWeightByGroup(weights, timeframe) {
  const group = getTimeframeGroup(timeframe);
  if (group === 'large') return weights.large;
  if (group === 'medium') return weights.medium;
  return weights.small;
}

function getRsiDepthMultiplier(rsi) {
  if (typeof rsi !== 'number' || isNaN(rsi)) {
    return 0;
  }

  const {
    rsiLevel1,
    rsiLevel2,
    rsiLevelHigh,
    rsiDelta,
    rsiMaxMultiplier,
  } = config.singleSignalScore;

  const neutralBaseline = 50;

  if (rsi <= neutralBaseline) {
    return 0;
  }

  if (rsi < rsiLevel1) {
    const range = Math.max(1, rsiLevel1 - neutralBaseline);
    const ratio = (rsi - neutralBaseline) / range;
    return Math.max(0, Math.min(1, ratio));
  }

  if (rsi < rsiLevel2) {
    return 1.0;
  }

  if (rsi < rsiLevelHigh) {
    return 1.2;
  }

  const cappedRsi = Math.min(rsi, 100);
  const highRange = Math.max(1, 100 - rsiLevelHigh);
  const ratio = Math.min(cappedRsi - rsiLevelHigh, highRange) / highRange;
  const multiplier = 1.2 + ratio * rsiDelta;

  return Math.min(multiplier, rsiMaxMultiplier);
}

export function calculateRsiScore(rsiData = {}) {
  const {
    rsiMaxScore,
    rsiWeightLarge,
    rsiWeightMedium,
    rsiWeightSmall,
  } = config.singleSignalScore;

  const weights = {
    large: rsiWeightLarge,
    medium: rsiWeightMedium,
    small: rsiWeightSmall,
  };

  let score = 0;

  Object.entries(rsiData).forEach(([timeframe, rsi]) => {
    if (typeof rsi !== 'number' || isNaN(rsi)) {
      return;
    }

    const weight = getWeightByGroup(weights, timeframe);
    const multiplier = getRsiDepthMultiplier(rsi);
    if (multiplier > 0) {
      score += weight * multiplier;
    }
  });

  return Math.min(score, rsiMaxScore);
}

function calculateDivergenceScore(divergenceTimeframes = []) {
  const {
    divergenceMaxScore,
    divergenceWeightLarge,
    divergenceWeightMedium,
    divergenceWeightSmall,
    divergenceBonusPerExtra,
  } = config.singleSignalScore;

  const weights = {
    large: divergenceWeightLarge,
    medium: divergenceWeightMedium,
    small: divergenceWeightSmall,
  };

  const uniqueTimeframes = [...new Set(divergenceTimeframes)];
  let score = 0;

  uniqueTimeframes.forEach(timeframe => {
    score += getWeightByGroup(weights, timeframe);
  });

  if (uniqueTimeframes.length > 1) {
    score += (uniqueTimeframes.length - 1) * divergenceBonusPerExtra;
  }

  return Math.min(score, divergenceMaxScore);
}

function calculateCandlestickScore(candlestickTimeframes = []) {
  const {
    candleMaxScore,
    candleWeightLarge,
    candleWeightMedium,
    candleWeightSmall,
    candleBonusSpecial,
  } = config.singleSignalScore;

  const weights = {
    large: candleWeightLarge,
    medium: candleWeightMedium,
    small: candleWeightSmall,
  };

  const uniqueTimeframes = [...new Set(candlestickTimeframes)];
  let score = 0;

  uniqueTimeframes.forEach(timeframe => {
    score += getWeightByGroup(weights, timeframe);
  });

  // Bonus placeholder: nếu có từ 2 timeframe trở lên, thưởng nhẹ
  if (uniqueTimeframes.length > 1) {
    score += candleBonusSpecial;
  }

  return Math.min(score, candleMaxScore);
}

export function calculateSingleSignalScore({
  rsiData = {},
  divergenceTimeframes = [],
  candlestickTimeframes = [],
} = {}) {
  const rsiScore = calculateRsiScore(rsiData);
  const divergenceScore = calculateDivergenceScore(divergenceTimeframes);
  const candleScore = calculateCandlestickScore(candlestickTimeframes);

  const totalScore = Math.min(
    rsiScore + divergenceScore + candleScore,
    100
  );

  return {
    total: totalScore,
    components: {
      rsi: rsiScore,
      divergence: divergenceScore,
      candle: candleScore,
    },
  };
}

