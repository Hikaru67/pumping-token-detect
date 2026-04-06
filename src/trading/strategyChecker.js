import { countSuperOverboughtRSI, getOverboughtTimeframes } from '../utils/dataProcessor.js';
import * as candlestickPatternDefault from '../indicators/candlestickPattern.js';

let checkReversalSignal = candlestickPatternDefault.checkReversalSignal;

// Hỗ trợ mock cho test
export function mockReversalSignal(mockFunc) {
  checkReversalSignal = mockFunc;
}
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
 * Helper kiểm tra nến đảo chiều có cache để tránh gọi API nhiều lần cho cùng 1 token
 */
async function checkReversalSignalCached(token, timeframes) {
  if (!token._reversalCache) token._reversalCache = {};

  const tfToFetch = [];
  const cachedResult = { hasSignal: false, timeframes: [] };

  for (const tf of timeframes) {
    if (token._reversalCache[tf] !== undefined) {
      if (token._reversalCache[tf]) {
        cachedResult.hasSignal = true;
        cachedResult.timeframes.push(tf);
      }
    } else {
      tfToFetch.push(tf);
    }
  }

  if (tfToFetch.length > 0) {
    const fetchResult = await checkReversalSignal(token, tfToFetch);
    for (const tf of tfToFetch) {
      token._reversalCache[tf] = fetchResult.timeframes.includes(tf);
      if (token._reversalCache[tf]) {
        if (!cachedResult.timeframes.includes(tf)) {
          cachedResult.timeframes.push(tf);
        }
        cachedResult.hasSignal = true;
      }
    }
  }

  return cachedResult;
}

/**
 * Điều kiện RSI chung của Chiến thuật 1 & 2
 */
function checkStrategy1RSIConditions(rsiData) {
  const smallTimeframes = ['Min5', 'Min15', 'Min30'];
  const superOverboughtSmall = smallTimeframes.filter(tf => isSuperOverbought(rsiData, tf));

  if (superOverboughtSmall.length !== smallTimeframes.length) {
    return {
      matched: false,
      reason: `Chưa đủ RSI super overbought ở khung nhỏ: ${superOverboughtSmall.length}/${smallTimeframes.length} (cần: ${smallTimeframes.join(', ')})`,
    };
  }

  if (!isOverbought80(rsiData, 'Hour4')) {
    return {
      matched: false,
      reason: 'RSI 4h chưa đạt 80+',
    };
  }

  return { matched: true };
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

  const rsiCond = checkStrategy1RSIConditions(token.rsi);
  if (!rsiCond.matched) {
    return rsiCond;
  }

  // Kiểm tra nến đảo chiều ở khung 5m (sử dụng cache)
  const reversalResult = await checkReversalSignalCached(token, ['Min5']);

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
 * Chiến thuật 2: Khi điều kiện RSI chiến thuật 1 thỏa mãn VÀ có số lượng RSI super overbought cao (4-5 RSI đạt max)
 * Vào 10% tài khoản và KHÔNG cần điều kiện nến đảo chiều
 * @param {Object} token - Token object có RSI data
 * @returns {Promise<Object>} { matched: boolean, reason: string, superOverboughtCount: number }
 */
export async function checkStrategy2(token) {
  if (!token || !token.rsi || typeof token.rsi !== 'object') {
    return { matched: false, reason: 'Token không có RSI data' };
  }

  // Khác C1, chỉ check rsi thay vì check cả signal
  const rsiCond = checkStrategy1RSIConditions(token.rsi);

  if (!rsiCond.matched) {
    return {
      matched: false,
      reason: `Chiến thuật 1 chưa thỏa mãn: ${rsiCond.reason}`,
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

  // Thêm điều kiện: RSI H8 >= 80
  if (!isOverbought80(token.rsi, 'Hour8')) {
    return {
      matched: false,
      reason: 'RSI H8 chưa đạt 80+',
    };
  }

  return {
    matched: true,
    reason: `Chiến thuật 2: S1 thỏa mãn + H8 >= 80 + ${superOverboughtCount} RSI >= 90`,
    superOverboughtCount,
  };
}

/**
 * Chiến thuật 6: Tương tự Chiến thuật 2 nhưng thêm 1 khung super overbought là 8h (H8 >= 90)
 * và thay điều kiện H8 >= 80 thành D1 >= 80
 * Cũng vào 10% tài khoản và KHÔNG cần điều kiện nến đảo chiều
 * @param {Object} token - Token object có RSI data
 * @returns {Promise<Object>} { matched: boolean, reason: string, superOverboughtCount: number }
 */
export async function checkStrategy6(token) {
  if (!token || !token.rsi || typeof token.rsi !== 'object') {
    return { matched: false, reason: 'Token không có RSI data' };
  }

  const rsiCond = checkStrategy1RSIConditions(token.rsi);

  if (!rsiCond.matched) {
    return {
      matched: false,
      reason: `Chiến thuật 1 chưa thỏa mãn: ${rsiCond.reason}`,
    };
  }

  // Đếm số lượng RSI super overbought
  const superOverboughtCount = countSuperOverboughtRSI(token.rsi);

  // Cần ít nhất 5 RSI super overbought (3 khung M5, M15, M30 từ S1 + có thể thêm khung khác + bắt buộc H8)
  // Thực tế bài toán yêu cầu đảm bảo >= 4 khung SO giống C2 nhưng yêu cầu thêm H8 là SO.
  if (superOverboughtCount < 4) {
    return {
      matched: false,
      reason: `Số lượng RSI super overbought (${superOverboughtCount}) < 4`,
      superOverboughtCount,
    };
  }

  // Thêm điều kiện: RSI H8 >= 90 (super overbought)
  if (!isSuperOverbought(token.rsi, 'Hour8')) {
    return {
      matched: false,
      reason: 'RSI H8 chưa đạt super overbought (90+)',
    };
  }

  // ĐK mới: RSI D1 >= 80
  if (!isOverbought80(token.rsi, 'Day1')) {
    return {
      matched: false,
      reason: 'RSI Day1 chưa đạt 80+',
    };
  }

  return {
    matched: true,
    reason: `Chiến thuật 6: S1 thỏa mãn + H8 >= 90 + D1 >= 80 + ${superOverboughtCount} RSI >= 90`,
    superOverboughtCount,
  };
}

/**
 * Chiến thuật 3: Khi đạt super overbought ở 3/4 khung 30m, 1h, 4h, 8h nhưng các khung bé 5m, 15m vẫn chưa đạt 80+
 * Chỉ vào 1% tài khoản khi có nến đảo chiều khung 5m, 15m
 * @param {Object} token - Token object có RSI data
 * @returns {Promise<Object>} { matched: boolean, reason: string, reversalTimeframes: Array<string> }
 */
export async function checkStrategy3(token) {
  if (!token || !token.rsi || typeof token.rsi !== 'object') {
    return { matched: false, reason: 'Token không có RSI data' };
  }

  const rsiData = token.rsi;

  // Kiểm tra super overbought ở khung lớn: 30m, 1h, 4h, 8h
  const largeTimeframes = ['Min30', 'Hour1', 'Hour4', 'Hour8'];
  const superOverboughtLarge = largeTimeframes.filter(tf => isSuperOverbought(rsiData, tf));

  if (superOverboughtLarge.length < 3) {
    return {
      matched: false,
      reason: 'Chưa có RSI super overbought ở khung lớn (30m, 1h, 4h, 8h)',
    };
  }

  // Kiểm tra các khung bé 5m, 15m chưa đạt 80+
  const smallTimeframes = ['Min5', 'Min15'];
  const overbought80Small = smallTimeframes.filter(tf => isOverbought80(rsiData, tf));

  if (overbought80Small.length > 0) {
    return {
      matched: false,
      reason: `Các khung bé (5m, 15m) đã đạt 80+: ${overbought80Small.join(', ')}`,
    };
  }

  // Kiểm tra nến đảo chiều ở khung 5m hoặc 15m (sử dụng cache)
  const reversalResult = await checkReversalSignalCached(token, ['Min5', 'Min15']);

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
 * Chiến thuật 4: Khi RSI khung M5, M15, M30, H1, H4 đạt >= 90
 * RSI khung D1 đạt >= 80, và RSI khung H8 đạt >= 80
 * Vào lệnh 30% tài khoản
 * @param {Object} token - Token object có RSI data
 * @returns {Promise<Object>} { matched: boolean, reason: string }
 */
export async function checkStrategy4(token) {
  if (!token || !token.rsi || typeof token.rsi !== 'object') {
    return { matched: false, reason: 'Token không có RSI data' };
  }

  const rsiData = token.rsi;

  // Kiểm tra RSI M5, M15, M30, H1, H4 đều đạt >= 90
  const timeframes90 = ['Min5', 'Min15', 'Min30', 'Hour1', 'Hour4'];
  const superOverbought90 = timeframes90.filter(tf => isSuperOverbought(rsiData, tf));

  if (superOverbought90.length !== timeframes90.length) {
    return {
      matched: false,
      reason: `Chưa đủ RSI >= 90 ở các khung M5, M15, M30, H1, H4: ${superOverbought90.length}/${timeframes90.length}`,
    };
  }

  // Kiểm tra RSI D1 >= 80 và H8 >= 80
  if (!isOverbought80(rsiData, 'Day1')) {
    return {
      matched: false,
      reason: 'RSI D1 chưa đạt 80+',
    };
  }

  if (!isOverbought80(rsiData, 'Hour8')) {
    return {
      matched: false,
      reason: 'RSI H8 chưa đạt 80+',
    };
  }

  return {
    matched: true,
    reason: `Chiến thuật 4: RSI M5-H4 >= 90, H8 >= 80, D1 >= 80`,
  };
}

/**
 * Chiến thuật 5 (Blow-off Top / Macro Overheat): 
 * Khi đạt super overbought (>= 90) ở khung 1h, 4h, 8h, 1d
 * Khung nhỏ (5m, 15m) đạt >= 85 nhưng chưa tới 90
 * KHÔNG CẦN nến đảo chiều
 * Vào lệnh 15% tài khoản
 * @param {Object} token - Token object có RSI data
 * @returns {Promise<Object>} { matched: boolean, reason: string }
 */
export async function checkStrategy5(token) {
  if (!token || !token.rsi || typeof token.rsi !== 'object') {
    return { matched: false, reason: 'Token không có RSI data' };
  }

  const rsiData = token.rsi;

  // Kiểm tra super overbought >= 90 ở khung lớn: 1h, 4h, 8h, 1d
  const macroTimeframes = ['Hour1', 'Hour4', 'Hour8', 'Day1'];
  const superOverboughtMacro = macroTimeframes.filter(tf => isSuperOverbought(rsiData, tf));

  if (superOverboughtMacro.length !== macroTimeframes.length) {
    return {
      matched: false,
      reason: `Chưa đủ RSI >= 90 ở các khung lớn (1h, 4h, 8h, 1d): ${superOverboughtMacro.length}/${macroTimeframes.length}`,
    };
  }

  // Khung nhỏ 5m, 15m đạt >= 85 (bắt đầu chững/kiệt sức)
  const microTimeframes = ['Min5', 'Min15'];
  const overbought85Micro = microTimeframes.filter(tf => {
    const rsi = rsiData[tf];
    return rsi !== null && !isNaN(rsi) && rsi >= 85;
  });

  if (overbought85Micro.length !== microTimeframes.length) {
    return {
      matched: false,
      reason: `Khung 5m, 15m chưa đạt >= 85 (có thể đã xả hoặc chưa tới mức nóng): ${overbought85Micro.length}/${microTimeframes.length}`,
    };
  }

  return {
    matched: true,
    reason: `Chiến thuật 5 (Blow-off Top): Macro Overheat (H1-D1 >= 90), Micro Exhaustion (M5/15 >= 85) (Không chờ nến)`,
  };
}

/**
 * Kiểm tra tất cả các chiến thuật và trả về chiến thuật phù hợp nhất
 * @param {Object} token - Token object có RSI data
 * @returns {Promise<Object>} { strategy: number|null, result: Object, volumePercent: number }
 */
export async function checkAllStrategies(token) {
  // Kiểm tra ưu tiên các chiến thuật không cần chờ nến đảo chiều trước:
  // Thứ tự: Strategy 4 > Strategy 6 > Strategy 2 > Strategy 5 > Strategy 1 > Strategy 3

  // Check Strategy 4 (Không cần nến đảo chiều)
  const strategy4Result = await checkStrategy4(token);
  if (strategy4Result.matched) {
    await appendSignalLog(
      `[${token.symbol || 'UNKNOWN'}] Chiến thuật 4 THỎA MÃN: ${strategy4Result.reason}`
    );
    return {
      strategy: 4,
      result: strategy4Result,
      volumePercent: config.tradingStrategy4VolumePercent || 30, // 30% tài khoản mặc định
    };
  }

  // Check Strategy 6 (Không cần nến đảo chiều)
  const strategy6Result = await checkStrategy6(token);
  if (strategy6Result.matched) {
    await appendSignalLog(
      `[${token.symbol || 'UNKNOWN'}] Chiến thuật 6 THỎA MÃN: ${strategy6Result.reason}`
    );
    return {
      strategy: 6,
      result: strategy6Result,
      volumePercent: config.tradingStrategy6VolumePercent || 10, // 10% tài khoản, giống C2
    };
  }

  // Check Strategy 2 (Không cần nến đảo chiều)
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

  // Check Strategy 5 (Không cần nến đảo chiều)
  const strategy5Result = await checkStrategy5(token);
  if (strategy5Result.matched) {
    await appendSignalLog(
      `[${token.symbol || 'UNKNOWN'}] Chiến thuật 5 THỎA MÃN: ${strategy5Result.reason}`
    );
    return {
      strategy: 5,
      result: strategy5Result,
      volumePercent: config.tradingStrategy5VolumePercent || 15, // 15% tài khoản mặc định
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
    const { getBaseSymbol } = await import('../utils/symbolUtils.js');
    const { getOpenPositionVolume } = await import('./tradingService.js');
    const _baseSymbol = getBaseSymbol(token.symbol);
    const currentOpenVol = await getOpenPositionVolume(_baseSymbol);

    if (currentOpenVol > 0) {
      // Đã có vị thế mở, không thỏa mãn S3 nữa để giảm spam log check
      await appendSignalLog(
        `[${token.symbol || 'UNKNOWN'}] Chiến thuật 3 BẦN CÙNG BỎ QUA: Đã có lệnh mở nhồi sẵn (${currentOpenVol})`
      );
    } else {
      await appendSignalLog(
        `[${token.symbol || 'UNKNOWN'}] Chiến thuật 3 THỎA MÃN: ${strategy3Result.reason}`
      );
      return {
        strategy: 3,
        result: strategy3Result,
        volumePercent: config.tradingStrategy3VolumePercent || 1, // 1% tài khoản
      };
    }
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

