import { fetchKlineData } from '../api/apiClient.js';
import { calculateRSI, checkRSIConfluence, formatTimeframe, getRSIStatus } from '../indicators/rsiCalculator.js';
import { config } from '../config.js';

/**
 * Bỏ đuôi _USDT hoặc _USDC trong symbol để so sánh
 * @param {string} symbol - Symbol gốc
 * @returns {string} Symbol đã bỏ đuôi
 */
function getBaseSymbol(symbol) {
  if (!symbol) return '';
  return symbol.replace(/_USDT$|_USDC$/, '');
}

/**
 * Parse và format fundingRate từ token
 * @param {*} fundingRate - Giá trị fundingRate từ API
 * @returns {number} FundingRate đã được format (0 nếu không hợp lệ)
 */
function parseFundingRate(fundingRate) {
  if (fundingRate !== undefined && 
      fundingRate !== null && 
      typeof fundingRate === 'number' &&
      !isNaN(fundingRate)) {
    return parseFloat(fundingRate.toFixed(6));
  }
  return 0;
}

/**
 * Delay để tránh rate limit
 * @param {number} ms - Số milliseconds cần delay
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


async function calculateRSIForToken(symbol, timeframes = config.rsiTimeframes) {
  const rsiData = {};
  const errors = [];

  // Định nghĩa thứ tự timeframe (từ nhỏ đến lớn) để biết timeframe nào lớn hơn
  const timeframeOrder = ['Min1', 'Min5', 'Min15', 'Min30', 'Min60', 'Hour1', 'Hour4', 'Hour8', 'Day1', 'Week1', 'Month1'];
  
  // Sắp xếp timeframes theo thứ tự từ nhỏ đến lớn
  const sortedTimeframes = [...timeframes].sort((a, b) => {
    const indexA = timeframeOrder.indexOf(a);
    const indexB = timeframeOrder.indexOf(b);
    return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
  });

  // Tính RSI tuần tự để tránh rate limit (thêm delay nhỏ giữa các request)
  for (const timeframe of sortedTimeframes) {
    try {
      // Lấy kline data từ API
      // Format response: { time: [...], open: [...], close: [...], high: [...], low: [...], vol: [...], amount: [...] }
      const klineData = await fetchKlineData(symbol, timeframe, config.rsiPeriod + 50);
      
      if (!klineData || !Array.isArray(klineData.close) || klineData.close.length === 0) {
        console.warn(`⚠️  Không có dữ liệu kline cho ${symbol} (${timeframe})`);
        rsiData[timeframe] = null;
        
        // Nếu không có dữ liệu kline, skip tất cả các timeframe lớn hơn
        const currentIndex = timeframeOrder.indexOf(timeframe);
        if (currentIndex !== -1) {
          const remainingTimeframes = sortedTimeframes.filter(tf => {
            const tfIndex = timeframeOrder.indexOf(tf);
            return tfIndex > currentIndex;
          });
          if (remainingTimeframes.length > 0) {
            console.warn(`   ⏭️  Bỏ qua các timeframe lớn hơn: ${remainingTimeframes.map(tf => formatTimeframe(tf)).join(', ')}`);
            for (const tf of remainingTimeframes) {
              rsiData[tf] = null;
            }
          }
        }
        
        // Delay nhỏ trước khi tiếp tục
        await delay(config.rsiDelayBetweenTimeframes || 100);
        break; // Dừng vòng lặp vì đã skip các timeframe lớn hơn
      }

      // Trích xuất giá đóng cửa (close price)
      // MEXC kline format: { close: [price1, price2, ...] }
      // Sử dụng realClose nếu có, nếu không thì dùng close
      const closes = (klineData.realClose || klineData.close || [])
        .map(close => parseFloat(close))
        .filter(val => !isNaN(val) && val > 0);
      
      if (closes.length < config.rsiPeriod + 1) {
        console.warn(`⚠️  Không đủ dữ liệu close price để tính RSI cho ${symbol} (${timeframe}): chỉ có ${closes.length} candles, cần ít nhất ${config.rsiPeriod + 1}`);
        rsiData[timeframe] = null;
        
        // Nếu không đủ dữ liệu, skip tất cả các timeframe lớn hơn
        const currentIndex = timeframeOrder.indexOf(timeframe);
        if (currentIndex !== -1) {
          const remainingTimeframes = sortedTimeframes.filter(tf => {
            const tfIndex = timeframeOrder.indexOf(tf);
            return tfIndex > currentIndex;
          });
          if (remainingTimeframes.length > 0) {
            console.warn(`   ⏭️  Bỏ qua các timeframe lớn hơn: ${remainingTimeframes.map(tf => formatTimeframe(tf)).join(', ')}`);
            for (const tf of remainingTimeframes) {
              rsiData[tf] = null;
            }
          }
        }
        
        await delay(config.rsiDelayBetweenTimeframes || 100);
        break; // Dừng vòng lặp vì đã skip các timeframe lớn hơn
      }
      
      // Tính RSI
      const rsi = calculateRSI(closes);
      rsiData[timeframe] = rsi;
      
      if (rsi !== null) {
        console.log(`   ✅ ${symbol} ${formatTimeframe(timeframe)}: RSI = ${rsi.toFixed(2)}`);
      }
      
      // Delay nhỏ giữa các request để tránh rate limit
      await delay(config.rsiDelayBetweenTimeframes || 100);
    } catch (error) {
      console.warn(`⚠️  Lỗi khi tính RSI cho ${symbol} (${timeframe}): ${error.message}`);
      rsiData[timeframe] = null;
      errors.push({ timeframe, error: error.message });
      
      // Nếu có lỗi nghiêm trọng (không phải lỗi network tạm thời), có thể skip các timeframe lớn hơn
      // Nhưng để an toàn, chỉ skip khi lỗi liên quan đến dữ liệu không đủ
      if (error.message.includes('Không đủ') || error.message.includes('không có dữ liệu')) {
        const currentIndex = timeframeOrder.indexOf(timeframe);
        if (currentIndex !== -1) {
          const remainingTimeframes = sortedTimeframes.filter(tf => {
            const tfIndex = timeframeOrder.indexOf(tf);
            return tfIndex > currentIndex;
          });
          if (remainingTimeframes.length > 0) {
            console.warn(`   ⏭️  Bỏ qua các timeframe lớn hơn: ${remainingTimeframes.map(tf => formatTimeframe(tf)).join(', ')}`);
            for (const tf of remainingTimeframes) {
              rsiData[tf] = null;
            }
          }
        }
        await delay(config.rsiDelayBetweenTimeframes || 100);
        break; // Dừng vòng lặp
      }
      
      // Delay ngay cả khi có lỗi
      await delay(config.rsiDelayBetweenTimeframes || 100);
    }
  }

  // Kiểm tra confluence
  const confluence = checkRSIConfluence(rsiData);

  return {
    rsiData,
    confluence,
    errors,
  };
}

/**
 * Lọc và sắp xếp token để lấy top 10 pump dựa trên riseFallRate
 * Loại bỏ các symbol trùng lặp (chỉ khác đuôi _USDT/_USDC)
 * @param {Array} data - Dữ liệu từ API
 * @returns {Array} Top 10 token có riseFallRate cao nhất
 */
export function getTop10PumpTokens(data) {
  if (!Array.isArray(data)) {
    throw new Error('Dữ liệu đầu vào phải là array');
  }

  if (data.length === 0) {
    console.warn('⚠️  API trả về mảng rỗng');
    return [];
  }

  // Lọc các token hợp lệ
  // Chỉ cần volume24 > 0 và có symbol, không cần kiểm tra giá
  const validTokens = data.filter(token => {
    return (
      token &&
      typeof token.volume24 === 'number' &&
      token.volume24 > 0 &&
      token.symbol &&
      typeof token.riseFallRate === 'number' &&
      !isNaN(token.riseFallRate)
    );
  });

  if (validTokens.length === 0) {
    console.warn('⚠️  Không có token hợp lệ nào');
    return [];
  }

  // Group các token theo base symbol (bỏ đuôi _USDT/_USDC)
  // Chỉ giữ lại token có riseFallRate cao nhất trong mỗi group
  const symbolMap = new Map();
  
  validTokens.forEach(token => {
    const baseSymbol = getBaseSymbol(token.symbol);
    const existing = symbolMap.get(baseSymbol);
    
    // Nếu chưa có hoặc token hiện tại có riseFallRate cao hơn, thay thế
    if (!existing || token.riseFallRate > existing.riseFallRate) {
      symbolMap.set(baseSymbol, token);
    }
  });

  // Chuyển Map thành array
  const uniqueTokens = Array.from(symbolMap.values());

  if (uniqueTokens.length === 0) {
    console.warn('⚠️  Không có token nào sau khi lọc trùng lặp');
    return [];
  }

  // Sắp xếp theo riseFallRate giảm dần (tăng nhiều nhất)
  const sortedTokens = uniqueTokens.sort((a, b) => b.riseFallRate - a.riseFallRate);

  // Lấy top 10 và thêm rank (chưa có RSI) - PUMP TOKENS
  const top10WithoutRSI = sortedTokens.slice(0, 10).map((token, index) => ({
    rank: index + 1,
    symbol: token.symbol,
    riseFallRate: parseFloat(token.riseFallRate.toFixed(4)),
    riseFallValue: token.riseFallValue,
    high24Price: token.high24Price,
    lower24Price: token.lower24Price,
    lastPrice: token.lastPrice,
    volume24: token.volume24,
    contractId: token.contractId,
    fundingRate: parseFundingRate(token.fundingRate),
  }));

  return top10WithoutRSI;
}

/**
 * Đếm số lượng RSI overbought và oversold
 * @param {Object} rsiData - Object chứa RSI của các timeframes
 * @returns {Object} { overboughtCount, oversoldCount }
 */
export function countRSIOverboughtOversold(rsiData) {
  if (!rsiData || typeof rsiData !== 'object') {
    return { overboughtCount: 0, oversoldCount: 0 };
  }

  let overboughtCount = 0;
  let oversoldCount = 0;

  Object.entries(rsiData).forEach(([timeframe, rsi]) => {
    if (rsi !== null && !isNaN(rsi)) {
      const status = getRSIStatus(rsi, timeframe);
      if (status === 'overbought') {
        overboughtCount++;
      } else if (status === 'oversold') {
        oversoldCount++;
      }
    }
  });

  return { overboughtCount, oversoldCount };
}

/**
 * Lấy danh sách các timeframes có RSI oversold
 * @param {Object} rsiData - Object chứa RSI của các timeframes
 * @param {Array<string>} targetTimeframes - Các timeframes cần check (optional, nếu không có thì check tất cả)
 * @returns {Array<string>} Danh sách timeframes có RSI oversold
 */
export function getOversoldTimeframes(rsiData, targetTimeframes = null) {
  if (!rsiData || typeof rsiData !== 'object') {
    return [];
  }

  const oversoldTimeframes = [];
  const timeframesToCheck = targetTimeframes || Object.keys(rsiData);

  for (const tf of timeframesToCheck) {
    const rsi = rsiData[tf];
    if (rsi !== null && !isNaN(rsi)) {
      const status = getRSIStatus(rsi, tf);
      if (status === 'oversold') {
        oversoldTimeframes.push(tf);
      }
    }
  }

  return oversoldTimeframes;
}

/**
 * Lấy danh sách các timeframes có RSI overbought
 * @param {Object} rsiData - Object chứa RSI của các timeframes
 * @param {Array<string>} targetTimeframes - Các timeframes cần check (optional, nếu không có thì check tất cả)
 * @returns {Array<string>} Danh sách timeframes có RSI overbought
 */
export function getOverboughtTimeframes(rsiData, targetTimeframes = null) {
  if (!rsiData || typeof rsiData !== 'object') {
    return [];
  }

  const overboughtTimeframes = [];
  const timeframesToCheck = targetTimeframes || Object.keys(rsiData);

  for (const tf of timeframesToCheck) {
    const rsi = rsiData[tf];
    if (rsi !== null && !isNaN(rsi)) {
      const status = getRSIStatus(rsi, tf);
      if (status === 'overbought') {
        overboughtTimeframes.push(tf);
      }
    }
  }

  return overboughtTimeframes;
}

/**
 * Đếm số lượng timeframes có RSI >= SUPER_OVER_BOUGHT threshold
 * @param {Object} rsiData - Object chứa RSI của các timeframes
 * @returns {number} Số lượng timeframes có RSI >= SUPER_OVER_BOUGHT threshold
 */
export function countSuperOverboughtRSI(rsiData) {
  if (!rsiData || typeof rsiData !== 'object') {
    return 0;
  }

  const superOverboughtThreshold = config.rsiSuperOverboughtThreshold;
  let count = 0;
  for (const [tf, rsi] of Object.entries(rsiData)) {
    if (rsi !== null && !isNaN(rsi) && rsi >= superOverboughtThreshold) {
      count++;
    }
  }

  return count;
}

/**
 * Tính tổng SUM giá trị RSI theo status (overbought hoặc oversold)
 * @param {Object} rsiData - Object chứa RSI của các timeframes
 * @param {string} status - 'overbought' hoặc 'oversold'
 * @returns {number} Tổng SUM giá trị RSI theo status
 */
function getSumRSIByStatus(rsiData, status) {
  if (!rsiData || typeof rsiData !== 'object') {
    return 0;
  }

  let sum = 0;
  Object.entries(rsiData).forEach(([timeframe, rsi]) => {
    if (rsi !== null && !isNaN(rsi)) {
      const rsiStatus = getRSIStatus(rsi, timeframe);
      if (rsiStatus === status) {
        sum += rsi;
      }
    }
  });

  return sum;
}

/**
 * Tính tổng SUM giá trị RSI overbought (tổng các giá trị RSI > threshold)
 * @param {Object} rsiData - Object chứa RSI của các timeframes
 * @returns {number} Tổng SUM giá trị RSI overbought
 */
function getSumRSIOverbought(rsiData) {
  return getSumRSIByStatus(rsiData, 'overbought');
}

/**
 * Tính tổng SUM giá trị RSI oversold (tổng các giá trị RSI < threshold)
 * @param {Object} rsiData - Object chứa RSI của các timeframes
 * @returns {number} Tổng SUM giá trị RSI oversold
 */
function getSumRSIOversold(rsiData) {
  return getSumRSIByStatus(rsiData, 'oversold');
}

/**
 * Sắp xếp top 10 theo số lượng RSI overbought/oversold và tổng RSI quá bán
 * @param {Array} top10 - Top 10 tokens đã có RSI
 * @param {boolean} isPump - true nếu là pump alert, false nếu là drop alert
 * @returns {Array} Top 10 tokens đã được sắp xếp lại
 * 
 * Logic sắp xếp:
 * - Pump alert: Ưu tiên 1 = overboughtCount (nhiều nhất lên trước), Ưu tiên 2 = sumRSIOverbought (lớn đến bé)
 * - Drop alert: Ưu tiên 1 = oversoldCount (nhiều nhất lên trước), Ưu tiên 2 = sumRSIOversold (bé đến lớn)
 */
function sortTop10ByRSI(top10, isPump = true) {
  if (!Array.isArray(top10) || top10.length === 0) {
    return top10;
  }

  // Tính toán số lượng overbought/oversold và tổng SUM giá trị RSI cho mỗi token
  const tokensWithRSICounts = top10.map(token => {
    const rsiData = token.rsi || {};
    const counts = countRSIOverboughtOversold(rsiData);
    const sumRSIOverbought = getSumRSIOverbought(rsiData);
    const sumRSIOversold = getSumRSIOversold(rsiData);
    
    return {
      ...token,
      _rsiOverboughtCount: counts.overboughtCount,
      _rsiOversoldCount: counts.oversoldCount,
      _sumRSIOverbought: sumRSIOverbought,
      _sumRSIOversold: sumRSIOversold,
    };
  });

  // Sắp xếp:
  // 1. Ưu tiên 1: 
  //    - Pump alert: theo overboughtCount (nhiều nhất lên trước)
  //    - Drop alert: theo oversoldCount (nhiều nhất lên trước)
  // 2. Ưu tiên 2: Tổng SUM giá trị RSI:
  //    - Pump alert: sumRSIOverbought (lớn đến bé)
  //    - Drop alert: sumRSIOversold (bé đến lớn)
  const sorted = tokensWithRSICounts.sort((a, b) => {
    // Ưu tiên 1: Theo overboughtCount (pump) hoặc oversoldCount (drop)
    if (isPump) {
      // Pump alert: sắp xếp theo overboughtCount (nhiều nhất lên trước)
      if (b._rsiOverboughtCount !== a._rsiOverboughtCount) {
        return b._rsiOverboughtCount - a._rsiOverboughtCount;
      }
    } else {
      // Drop alert: sắp xếp theo oversoldCount (nhiều nhất lên trước)
      if (b._rsiOversoldCount !== a._rsiOversoldCount) {
        return b._rsiOversoldCount - a._rsiOversoldCount;
      }
    }
    
    // Ưu tiên 2: Tổng SUM giá trị RSI
    if (isPump) {
      // Pump alert: sumRSIOverbought (lớn đến bé)
      return b._sumRSIOverbought - a._sumRSIOverbought;
    } else {
      // Drop alert: sumRSIOversold (bé đến lớn)
      return a._sumRSIOversold - b._sumRSIOversold;
    }
  });

  // Loại bỏ các trường tạm thời (_rsiOverboughtCount, _rsiOversoldCount, etc.) và cập nhật rank
  return sorted.map((token, index) => {
    const { _rsiOverboughtCount, _rsiOversoldCount, _sumRSIOverbought, _sumRSIOversold, ...cleanToken } = token;
    return {
      ...cleanToken,
      rank: index + 1,
    };
  });
}

/**
 * Tính RSI cho một token (wrapper function)
 * @param {Object} token - Token object
 * @returns {Promise<Object>} Token với RSI data
 */
async function calculateRSIForTokenWrapper(token) {
  try {
    console.log(`🔍 Đang tính RSI cho ${token.symbol}...`);
    const rsiInfo = await calculateRSIForToken(token.symbol, config.rsiTimeframes);
    
    return {
      ...token,
      rsi: rsiInfo.rsiData,
      rsiConfluence: rsiInfo.confluence,
      rsiErrors: rsiInfo.errors,
    };
  } catch (error) {
    console.error(`❌ Lỗi khi tính RSI cho ${token.symbol}: ${error.message}`);
    return {
      ...token,
      rsi: {},
      rsiConfluence: {
        hasConfluence: false,
        status: 'neutral',
        timeframes: [],
        count: 0,
      },
      rsiErrors: [{ error: error.message }],
    };
  }
}

/**
 * Tính RSI cho top 10 tokens (song song để tăng tốc)
 * @param {Array} top10 - Top 10 tokens (chưa có RSI)
 * @param {boolean} isPump - true nếu là pump alert, false nếu là drop alert (mặc định: true)
 * @param {Function} onTokenRSIComplete - Callback được gọi sau khi tính RSI xong cho mỗi token (async)
 * @returns {Promise<Array>} Top 10 tokens với RSI đã được tính và sắp xếp lại
 */
export async function addRSIToTop10(top10, isPump = true, onTokenRSIComplete = null) {
  if (!Array.isArray(top10) || top10.length === 0) {
    return top10;
  }

  console.log(`📊 Đang tính RSI cho ${top10.length} tokens...`);
  console.log(`   Timeframes: ${config.rsiTimeframes.join(', ')}`);

  // Tính RSI cho từng token (tuần tự để tránh rate limit)
  const top10WithRSI = [];
  
  for (let i = 0; i < top10.length; i++) {
    const token = top10[i];
    try {
      console.log(`\n🔍 Đang tính RSI cho ${token.symbol} (${i + 1}/${top10.length})...`);
      const rsiInfo = await calculateRSIForToken(token.symbol, config.rsiTimeframes);
      
      const tokenWithRSI = {
        ...token,
        rsi: rsiInfo.rsiData,
        rsiConfluence: rsiInfo.confluence,
        rsiErrors: rsiInfo.errors,
      };
      
      top10WithRSI.push(tokenWithRSI);
      
      // Gọi callback nếu có (để check và gửi signal alert ngay)
      if (onTokenRSIComplete && typeof onTokenRSIComplete === 'function') {
        try {
          await onTokenRSIComplete(tokenWithRSI, i);
        } catch (callbackError) {
          console.warn(`⚠️  Lỗi trong callback onTokenRSIComplete cho ${token.symbol}:`, callbackError.message);
        }
      }
      
      // Delay nhỏ giữa các token để tránh rate limit
      if (i < top10.length - 1) {
        await delay(config.rsiDelayBetweenTokens || 200);
      }
    } catch (error) {
      console.error(`❌ Lỗi khi tính RSI cho ${token.symbol}: ${error.message}`);
      const tokenWithError = {
        ...token,
        rsi: {},
        rsiConfluence: {
          hasConfluence: false,
          status: 'neutral',
          timeframes: [],
          count: 0,
        },
        rsiErrors: [{ error: error.message }],
      };
      
      top10WithRSI.push(tokenWithError);
      
      // Không gọi callback cho token có lỗi (vì không có RSI data để check signal)
      // Callback sẽ tự check và bỏ qua nếu không có RSI data
      
      // Delay ngay cả khi có lỗi
      if (i < top10.length - 1) {
        await delay(config.rsiDelayBetweenTokens || 200);
      }
    }
  }

  console.log('\n✅ Đã tính RSI cho tất cả tokens');
  
  // Sắp xếp lại top 10 theo số lượng RSI overbought/oversold và tổng RSI quá bán
  console.log(`\n🔄 Đang sắp xếp top 10 theo RSI (${isPump ? 'Pump' : 'Drop'} alert)...`);
  const sortedTop10 = sortTop10ByRSI(top10WithRSI, isPump);
  
  console.log('✅ Đã sắp xếp top 10 theo RSI:');
  sortedTop10.forEach((token, index) => {
    // Sử dụng cached values từ sortTop10ByRSI nếu có, nếu không thì tính lại
    const rsiData = token.rsi || {};
    const counts = countRSIOverboughtOversold(rsiData);
    const sumRSIOverbought = getSumRSIOverbought(rsiData);
    const sumRSIOversold = getSumRSIOversold(rsiData);
    
    if (isPump) {
      console.log(`   ${index + 1}. ${token.symbol} - Overbought: ${counts.overboughtCount}, Sum RSI Overbought: ${sumRSIOverbought.toFixed(2)}, Oversold: ${counts.oversoldCount}`);
    } else {
      console.log(`   ${index + 1}. ${token.symbol} - Oversold: ${counts.oversoldCount}, Sum RSI Oversold: ${sumRSIOversold.toFixed(2)}, Overbought: ${counts.overboughtCount}`);
    }
  });
  
  return sortedTop10;
}

/**
 * Lọc và sắp xếp token để lấy top 10 drop dựa trên riseFallRate
 * Loại bỏ các symbol trùng lặp (chỉ khác đuôi _USDT/_USDC)
 * @param {Array} data - Dữ liệu từ API
 * @returns {Array} Top 10 token có riseFallRate thấp nhất (giảm nhiều nhất)
 */
export function getTop10DropTokens(data) {
  if (!Array.isArray(data)) {
    throw new Error('Dữ liệu đầu vào phải là array');
  }

  if (data.length === 0) {
    console.warn('⚠️  API trả về mảng rỗng');
    return [];
  }

  // Lọc các token hợp lệ
  // Chỉ cần volume24 > 0 và có symbol, không cần kiểm tra giá
  const validTokens = data.filter(token => {
    return (
      token &&
      typeof token.volume24 === 'number' &&
      token.volume24 > 0 &&
      token.symbol &&
      typeof token.riseFallRate === 'number' &&
      !isNaN(token.riseFallRate)
    );
  });

  if (validTokens.length === 0) {
    console.warn('⚠️  Không có token hợp lệ nào');
    return [];
  }

  // Group các token theo base symbol (bỏ đuôi _USDT/_USDC)
  // Chỉ giữ lại token có riseFallRate thấp nhất trong mỗi group (giảm nhiều nhất)
  const symbolMap = new Map();
  
  validTokens.forEach(token => {
    const baseSymbol = getBaseSymbol(token.symbol);
    const existing = symbolMap.get(baseSymbol);
    
    // Nếu chưa có hoặc token hiện tại có riseFallRate thấp hơn (giảm nhiều hơn), thay thế
    if (!existing || token.riseFallRate < existing.riseFallRate) {
      symbolMap.set(baseSymbol, token);
    }
  });

  // Chuyển Map thành array
  const uniqueTokens = Array.from(symbolMap.values());

  if (uniqueTokens.length === 0) {
    console.warn('⚠️  Không có token nào sau khi lọc trùng lặp');
    return [];
  }

  // Sắp xếp theo riseFallRate tăng dần (giảm nhiều nhất - số âm nhỏ nhất)
  const sortedTokens = uniqueTokens.sort((a, b) => a.riseFallRate - b.riseFallRate);

  // Lấy top 10 và thêm rank (chưa có RSI) - DROP TOKENS
  const top10WithoutRSI = sortedTokens.slice(0, 10).map((token, index) => ({
    rank: index + 1,
    symbol: token.symbol,
    riseFallRate: parseFloat(token.riseFallRate.toFixed(4)),
    riseFallValue: token.riseFallValue,
    high24Price: token.high24Price,
    lower24Price: token.lower24Price,
    lastPrice: token.lastPrice,
    volume24: token.volume24,
    contractId: token.contractId,
    fundingRate: parseFundingRate(token.fundingRate),
  }));

  return top10WithoutRSI;
}

