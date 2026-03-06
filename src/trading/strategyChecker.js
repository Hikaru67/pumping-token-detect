import { countSuperOverboughtRSI, getOverboughtTimeframes } from '../utils/dataProcessor.js';
import { checkReversalSignal } from '../indicators/candlestickPattern.js';
import { config } from '../config.js';
import { appendSignalLog } from '../utils/logger.js';

/**
 * Kiểm tra RSI có đạt super overbought (>= 90) không
 * @param {Object} rsiData - Object chứa RSI của các timeframes
 * @param {string} timeframe - Timeframe cần kiểm tra
 * @returns {boolean} true nếu RSI >= 90
 */
function isSuperOverbought(rsiData, timeframe) {
  if (!rsiData || typeof rsiData !== 'object') {
    return false;
  }
  
  const rsi = rsiData[timeframe];
  if (rsi === null || isNaN(rsi)) {
    return false;
  }
  
  return rsi >= config.rsiSuperOverboughtThreshold; // >= 90
}

/**
 * Kiểm tra RSI có đạt >= 80 không
 * @param {Object} rsiData - Object chứa RSI của các timeframes
 * @param {string} timeframe - Timeframe cần kiểm tra
 * @returns {boolean} true nếu RSI >= 80
 */
function isOverbought80(rsiData, timeframe) {
  if (!rsiData || typeof rsiData !== 'object') {
    return false;
  }
  
  const rsi = rsiData[timeframe];
  if (rsi === null || isNaN(rsi)) {
    return false;
  }
  
  return rsi >= 80;
}

/**
 * Chiến thuật 1: Vào lệnh khi RSI ở khung 5m, 15m, 30m đạt 90+ (super overbought), 
 * 4h đạt 80+ và có cây nến m5 rút râu đảo chiều
 * @param {Object} token - Token object có RSI data
 * @returns {Promise<Object>} { matched: boolean, reason: string, reversalTimeframes: Array<string> }
 */
export async function checkStrategy1(token) {
  if (!token || !token.rsi || typeof token.rsi !== 'object') {
    return { matched: false, reason: 'Token không có RSI data' };
  }
  
  const rsiData = token.rsi;
  
  // Kiểm tra RSI 5m, 15m, 30m đạt 90+
  const smallTimeframes = ['Min5', 'Min15', 'Min30'];
  const superOverboughtSmall = smallTimeframes.filter(tf => isSuperOverbought(rsiData, tf));
  
  if (superOverboughtSmall.length !== smallTimeframes.length) {
    return {
      matched: false,
      reason: `Chưa đủ RSI super overbought ở khung nhỏ: ${superOverboughtSmall.length}/${smallTimeframes.length} (cần: ${smallTimeframes.join(', ')})`,
    };
  }
  
  // Kiểm tra RSI 4h đạt 80+
  if (!isOverbought80(rsiData, 'Hour4')) {
    return {
      matched: false,
      reason: 'RSI 4h chưa đạt 80+',
    };
  }
  
  // Kiểm tra nến đảo chiều ở khung 5m
  const reversalResult = await checkReversalSignal(token, ['Min5']);
  
  if (!reversalResult.hasSignal || !reversalResult.timeframes.includes('Min5')) {
    return {
      matched: false,
      reason: 'Chưa có nến đảo chiều ở khung 5m',
    };
  }
  
  return {
    matched: true,
    reason: `Chiến thuật 1: RSI 5m/15m/30m >= 90, 4h >= 80, có nến đảo chiều 5m`,
    reversalTimeframes: reversalResult.timeframes,
  };
}

/**
 * Chiến thuật 2: Khi chiến thuật 1 thỏa mãn VÀ có số lượng RSI super overbought cao (4-5 RSI đạt max)
 * Vào 10% tài khoản và không cần điều kiện nến đảo chiều
 * @param {Object} token - Token object có RSI data
 * @returns {Promise<Object>} { matched: boolean, reason: string, superOverboughtCount: number }
 */
export async function checkStrategy2(token) {
  if (!token || !token.rsi || typeof token.rsi !== 'object') {
    return { matched: false, reason: 'Token không có RSI data' };
  }
  
  // Kiểm tra chiến thuật 1 trước
  const strategy1Result = await checkStrategy1(token);
  
  if (!strategy1Result.matched) {
    return {
      matched: false,
      reason: `Chiến thuật 1 chưa thỏa mãn: ${strategy1Result.reason}`,
    };
  }
  
  // Đếm số lượng RSI super overbought
  const superOverboughtCount = countSuperOverboughtRSI(token.rsi);
  
  // Cần ít nhất 4 RSI super overbought
  if (superOverboughtCount < 4) {
    return {
      matched: false,
      reason: `Số lượng RSI super overbought (${superOverboughtCount}) < 4`,
      superOverboughtCount,
    };
  }
  
  return {
    matched: true,
    reason: `Chiến thuật 2: Chiến thuật 1 thỏa mãn + ${superOverboughtCount} RSI super overbought`,
    superOverboughtCount,
  };
}

/**
 * Chiến thuật 3: Khi đạt super overbought ở khung 1h, 4h, 8h nhưng các khung bé 5m, 15m, 30m vẫn chưa đạt 80+
 * Chỉ vào 1% tài khoản khi có nến đảo chiều khung 5m, 15m
 * @param {Object} token - Token object có RSI data
 * @returns {Promise<Object>} { matched: boolean, reason: string, reversalTimeframes: Array<string> }
 */
export async function checkStrategy3(token) {
  if (!token || !token.rsi || typeof token.rsi !== 'object') {
    return { matched: false, reason: 'Token không có RSI data' };
  }
  
  const rsiData = token.rsi;
  
  // Kiểm tra super overbought ở khung lớn: 1h, 4h, 8h
  const largeTimeframes = ['Hour1', 'Hour4', 'Hour8'];
  const superOverboughtLarge = largeTimeframes.filter(tf => isSuperOverbought(rsiData, tf));
  
  if (superOverboughtLarge.length === 0) {
    return {
      matched: false,
      reason: 'Chưa có RSI super overbought ở khung lớn (1h, 4h, 8h)',
    };
  }
  
  // Kiểm tra các khung bé 5m, 15m, 30m chưa đạt 80+
  const smallTimeframes = ['Min5', 'Min15', 'Min30'];
  const overbought80Small = smallTimeframes.filter(tf => isOverbought80(rsiData, tf));
  
  if (overbought80Small.length > 0) {
    return {
      matched: false,
      reason: `Các khung bé đã đạt 80+: ${overbought80Small.join(', ')}`,
    };
  }
  
  // Kiểm tra nến đảo chiều ở khung 5m hoặc 15m
  const reversalResult = await checkReversalSignal(token, ['Min5', 'Min15']);
  
  if (!reversalResult.hasSignal || reversalResult.timeframes.length === 0) {
    return {
      matched: false,
      reason: 'Chưa có nến đảo chiều ở khung 5m hoặc 15m',
    };
  }
  
  // Kiểm tra nến đảo chiều phải ở 5m hoặc 15m
  const validReversalTimeframes = reversalResult.timeframes.filter(tf => 
    ['Min5', 'Min15'].includes(tf)
  );
  
  if (validReversalTimeframes.length === 0) {
    return {
      matched: false,
      reason: 'Nến đảo chiều không ở khung 5m hoặc 15m',
    };
  }
  
  return {
    matched: true,
    reason: `Chiến thuật 3: Super overbought ở khung lớn (${superOverboughtLarge.join(', ')}), khung bé chưa đạt 80+, có nến đảo chiều ${validReversalTimeframes.join(', ')}`,
    reversalTimeframes: validReversalTimeframes,
  };
}

/**
 * Kiểm tra tất cả các chiến thuật và trả về chiến thuật phù hợp nhất
 * @param {Object} token - Token object có RSI data
 * @returns {Promise<Object>} { strategy: number|null, result: Object, volumePercent: number }
 */
export async function checkAllStrategies(token) {
  // Kiểm tra theo thứ tự: Strategy 2 > Strategy 1 > Strategy 3
  // (Strategy 2 có điều kiện cao nhất nên check trước)
  
  // Check Strategy 2
  const strategy2Result = await checkStrategy2(token);
  if (strategy2Result.matched) {
    await appendSignalLog(
      `[${token.symbol || 'UNKNOWN'}] Chiến thuật 2 THỎA MÃN: ${strategy2Result.reason}`
    );
    return {
      strategy: 2,
      result: strategy2Result,
      volumePercent: config.tradingStrategy2VolumePercent || 10, // 10% tài khoản
    };
  }
  
  // Check Strategy 1
  const strategy1Result = await checkStrategy1(token);
  if (strategy1Result.matched) {
    await appendSignalLog(
      `[${token.symbol || 'UNKNOWN'}] Chiến thuật 1 THỎA MÃN: ${strategy1Result.reason}`
    );
    return {
      strategy: 1,
      result: strategy1Result,
      volumePercent: config.tradingStrategy1VolumePercent || 2, // 2% tài khoản
    };
  }
  
  // Check Strategy 3
  const strategy3Result = await checkStrategy3(token);
  if (strategy3Result.matched) {
    await appendSignalLog(
      `[${token.symbol || 'UNKNOWN'}] Chiến thuật 3 THỎA MÃN: ${strategy3Result.reason}`
    );
    return {
      strategy: 3,
      result: strategy3Result,
      volumePercent: config.tradingStrategy3VolumePercent || 1, // 1% tài khoản
    };
  }
  
  await appendSignalLog(
    `[${token.symbol || 'UNKNOWN'}] KHÔNG có chiến thuật nào thỏa mãn`
  );
  return {
    strategy: null,
    result: { matched: false, reason: 'Không có chiến thuật nào thỏa mãn' },
    volumePercent: 0,
  };
}

