import { config } from './config.js';

/**
 * Tính RSI (Relative Strength Index) từ dữ liệu giá đóng cửa
 * @param {Array<number>} closes - Mảng giá đóng cửa (close prices)
 * @param {number} period - Chu kỳ RSI (mặc định 14)
 * @returns {number|null} Giá trị RSI (0-100) hoặc null nếu không đủ dữ liệu
 */
export function calculateRSI(closes, period = config.rsiPeriod) {
  if (!Array.isArray(closes) || closes.length < period + 1) {
    return null; // Không đủ dữ liệu để tính RSI
  }

  // Tính toán các thay đổi giá (gains và losses)
  const changes = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }

  // Tách gains và losses
  const gains = changes.map(change => change > 0 ? change : 0);
  const losses = changes.map(change => change < 0 ? Math.abs(change) : 0);

  // Tính Average Gain và Average Loss ban đầu (simple average của period đầu tiên)
  let avgGain = gains.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((sum, val) => sum + val, 0) / period;

  // Tính toán RSI bằng cách sử dụng Wilder's Smoothing Method
  // RSI = 100 - (100 / (1 + RS))
  // RS = Average Gain / Average Loss
  // Wilder's smoothing: newAvg = (oldAvg * (period - 1) + newValue) / period
  
  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }

  // Tránh chia cho 0
  if (avgLoss === 0) {
    return avgGain > 0 ? 100 : 50; // Nếu không có loss, RSI = 100; nếu không có gain, RSI = 50
  }

  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));

  return parseFloat(rsi.toFixed(2));
}

/**
 * Xác định trạng thái RSI (oversold, neutral, overbought)
 * @param {number} rsi - Giá trị RSI
 * @returns {string} 'oversold' | 'neutral' | 'overbought'
 */
export function getRSIStatus(rsi) {
  if (rsi === null || isNaN(rsi)) {
    return 'neutral';
  }

  if (rsi < config.rsiOversoldThreshold) {
    return 'oversold';
  } else if (rsi > config.rsiOverboughtThreshold) {
    return 'overbought';
  } else {
    return 'neutral';
  }
}

/**
 * Kiểm tra RSI confluence - khi nhiều timeframes có cùng trạng thái RSI
 * @param {Object} rsiData - Object chứa RSI của các timeframes { 'Min15': 25, 'Hour1': 30, ... }
 * @returns {Object} Thông tin confluence { hasConfluence, status, timeframes, count }
 */
export function checkRSIConfluence(rsiData) {
  if (!rsiData || typeof rsiData !== 'object') {
    return {
      hasConfluence: false,
      status: 'neutral',
      timeframes: [],
      count: 0,
    };
  }

  // Đếm số lượng timeframes cho mỗi trạng thái
  const statusCounts = {
    oversold: [],
    overbought: [],
    neutral: [],
  };

  Object.entries(rsiData).forEach(([timeframe, rsi]) => {
    if (rsi !== null && !isNaN(rsi)) {
      const status = getRSIStatus(rsi);
      statusCounts[status].push(timeframe);
    }
  });

  // Kiểm tra confluence: ít nhất minTimeframes timeframes có cùng trạng thái
  const minTimeframes = config.rsiConfluenceMinTimeframes;
  
  if (statusCounts.oversold.length >= minTimeframes) {
    return {
      hasConfluence: true,
      status: 'oversold',
      timeframes: statusCounts.oversold,
      count: statusCounts.oversold.length,
      rsiValues: statusCounts.oversold.map(tf => ({ timeframe: tf, rsi: rsiData[tf] })),
    };
  }
  
  if (statusCounts.overbought.length >= minTimeframes) {
    return {
      hasConfluence: true,
      status: 'overbought',
      timeframes: statusCounts.overbought,
      count: statusCounts.overbought.length,
      rsiValues: statusCounts.overbought.map(tf => ({ timeframe: tf, rsi: rsiData[tf] })),
    };
  }

  // Không có confluence
  return {
    hasConfluence: false,
    status: 'neutral',
    timeframes: [],
    count: 0,
    rsiValues: Object.entries(rsiData).map(([tf, rsi]) => ({ timeframe: tf, rsi })),
  };
}

/**
 * Format timeframe để hiển thị đẹp hơn
 * @param {string} timeframe - Timeframe từ MEXC (ví dụ: 'Min15', 'Hour1')
 * @returns {string} Timeframe đã format (ví dụ: '15m', '1h')
 */
export function formatTimeframe(timeframe) {
  const mapping = {
    'Min1': '1m',
    'Min5': '5m',
    'Min15': '15m',
    'Min30': '30m',
    'Hour1': '1h',
    'Hour4': '4h',
    'Day1': '1d',
    'Week1': '1w',
    'Month1': '1M',
  };
  
  return mapping[timeframe] || timeframe;
}

