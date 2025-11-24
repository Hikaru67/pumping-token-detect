import { fetchKlineData } from '../api/apiClient.js';
import { config } from '../config.js';

const DEFAULT_TIMEFRAMES = ['Min5', 'Min15', 'Min30', 'Min60'];

function findLastTwoLows(closes) {
  const lows = [];

  for (let i = 1; i < closes.length - 1; i++) {
    const prev = closes[i - 1];
    const curr = closes[i];
    const next = closes[i + 1];

    if (curr < prev && curr < next) {
      lows.push(i);
    }
  }

  if (lows.length < 2) {
    return null;
  }

  const lastLowIndex = lows[lows.length - 1];
  const prevLowIndex = lows[lows.length - 2];

  return { prevLowIndex, lastLowIndex };
}

function calculateRSI(closes, period) {
  if (!Array.isArray(closes) || closes.length <= period) {
    return null;
  }

  let gainSum = 0;
  let lossSum = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) {
      gainSum += diff;
    } else {
      lossSum -= diff;
    }
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - diff) / period;
    }
  }

  if (avgLoss === 0) {
    return 100;
  }

  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);
  return rsi;
}

export async function checkRsiBullishDivergence(token, timeframes = DEFAULT_TIMEFRAMES) {
  if (!token || !token.symbol) {
    return { hasDivergence: false, timeframes: [] };
  }

  if (!Array.isArray(timeframes) || timeframes.length === 0) {
    return { hasDivergence: false, timeframes: [] };
  }

  const divergenceTimeframes = [];

  for (const timeframe of timeframes) {
    try {
      const klineData = await fetchKlineData(token.symbol, timeframe, config.rsiPeriod + 50);

      if (!klineData || !Array.isArray(klineData.close) || klineData.close.length < config.rsiPeriod + 5) {
        continue;
      }

      const closes = (klineData.realClose || klineData.close || [])
        .map(v => parseFloat(v))
        .filter(v => !isNaN(v));

      if (closes.length < config.rsiPeriod + 5) {
        continue;
      }

      const closedCloses = closes.slice(0, closes.length - 1);

      const lows = findLastTwoLows(closedCloses);
      if (!lows) {
        continue;
      }

      const { prevLowIndex, lastLowIndex } = lows;

      const closesPrev = closedCloses.slice(0, prevLowIndex + 1);
      const closesLast = closedCloses.slice(0, lastLowIndex + 1);

      const rsiPrev = calculateRSI(closesPrev, config.rsiPeriod);
      const rsiLast = calculateRSI(closesLast, config.rsiPeriod);

      if (rsiPrev === null || rsiLast === null) {
        continue;
      }

      const pricePrev = closedCloses[prevLowIndex];
      const priceLast = closedCloses[lastLowIndex];

      if (priceLast < pricePrev && rsiLast > rsiPrev) {
        divergenceTimeframes.push(timeframe);
      }
    } catch (error) {
      console.warn(`⚠️  Lỗi khi kiểm tra RSI divergence cho ${token.symbol} ${timeframe}:`, error.message);
      continue;
    }
  }

  return {
    hasDivergence: divergenceTimeframes.length > 0,
    timeframes: divergenceTimeframes,
  };
}
