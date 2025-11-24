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
      console.log('🚀 ~ closedCloses:', closedCloses)

      const lows = findLastTwoLows(closedCloses);
      console.log('🚀 ~ lows:', lows)
      if (!lows) {
        continue;
      }

      const { prevLowIndex, lastLowIndex } = lows;

      // Tính RSI tại từng điểm low
      // RSI tại một điểm được tính từ dữ liệu trước đó (cần ít nhất period + 1 nến)
      // Lấy dữ liệu từ đầu đến điểm low (bao gồm cả điểm low) để tính RSI tại điểm đó
      const closesForPrevRSI = closedCloses.slice(0, prevLowIndex + 1);
      const closesForLastRSI = closedCloses.slice(0, lastLowIndex + 1);

      // Kiểm tra có đủ dữ liệu để tính RSI không (cần ít nhất period + 1 nến)
      if (closesForPrevRSI.length < config.rsiPeriod + 1 || closesForLastRSI.length < config.rsiPeriod + 1) {
        continue;
      }

      // Tính RSI tại điểm prevLow (RSI của nến tại prevLowIndex)
      // calculateRSI trả về RSI của nến cuối cùng trong mảng
      const rsiPrev = calculateRSI(closesForPrevRSI, config.rsiPeriod);
      // Tính RSI tại điểm lastLow (RSI của nến tại lastLowIndex)
      const rsiLast = calculateRSI(closesForLastRSI, config.rsiPeriod);

      if (rsiPrev === null || rsiLast === null || isNaN(rsiPrev) || isNaN(rsiLast)) {
        continue;
      }

      const pricePrev = closedCloses[prevLowIndex];
      const priceLast = closedCloses[lastLowIndex];

      // Bullish divergence: giá giảm (priceLast < pricePrev) nhưng RSI tăng (rsiLast > rsiPrev)
      // Điều này cho thấy momentum đang tăng mặc dù giá đang giảm, báo hiệu khả năng đảo chiều tăng
      // Cần đảm bảo sự khác biệt đủ lớn để tránh false signals
      const priceDiffPercent = ((priceLast - pricePrev) / pricePrev) * 100;
      const rsiDiff = rsiLast - rsiPrev;
      
      // Chỉ xem là divergence nếu:
      // 1. Giá giảm ít nhất 0.1% (tránh noise)
      // 2. RSI tăng ít nhất 1 điểm (tránh noise)
      if (priceLast < pricePrev && rsiLast > rsiPrev && priceDiffPercent < -0.1 && rsiDiff > 1) {
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
