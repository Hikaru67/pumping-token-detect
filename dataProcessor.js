import { fetchKlineData } from './apiClient.js';
import { calculateRSI, checkRSIConfluence, formatTimeframe } from './rsiCalculator.js';
import { config } from './config.js';

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
 * Delay để tránh rate limit
 * @param {number} ms - Số milliseconds cần delay
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Tính RSI cho một token với nhiều timeframes
 * @param {string} symbol - Symbol của token
 * @param {Array<string>} timeframes - Mảng các timeframes cần tính RSI
 * @returns {Promise<Object>} Object chứa RSI của các timeframes và confluence info
 */
async function calculateRSIForToken(symbol, timeframes = config.rsiTimeframes) {
  const rsiData = {};
  const errors = [];

  // Tính RSI tuần tự để tránh rate limit (thêm delay nhỏ giữa các request)
  for (const timeframe of timeframes) {
    try {
      // Lấy kline data từ API
      // Format response: { time: [...], open: [...], close: [...], high: [...], low: [...], vol: [...], amount: [...] }
      const klineData = await fetchKlineData(symbol, timeframe, config.rsiPeriod + 50);
      
      if (!klineData || !Array.isArray(klineData.close) || klineData.close.length === 0) {
        console.warn(`⚠️  Không có dữ liệu kline cho ${symbol} (${timeframe})`);
        rsiData[timeframe] = null;
        // Delay nhỏ trước khi tiếp tục
        await delay(100);
        continue;
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
        await delay(100);
        continue;
      }
      
      // Tính RSI
      const rsi = calculateRSI(closes);
      rsiData[timeframe] = rsi;
      
      if (rsi !== null) {
        console.log(`   ✅ ${symbol} ${formatTimeframe(timeframe)}: RSI = ${rsi.toFixed(2)}`);
      }
      
      // Delay nhỏ giữa các request để tránh rate limit (100ms)
      await delay(100);
    } catch (error) {
      console.warn(`⚠️  Lỗi khi tính RSI cho ${symbol} (${timeframe}): ${error.message}`);
      rsiData[timeframe] = null;
      errors.push({ timeframe, error: error.message });
      // Delay ngay cả khi có lỗi
      await delay(100);
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

  // Lấy top 10 và thêm rank (chưa có RSI)
  const top10WithoutRSI = sortedTokens.slice(0, 10).map((token, index) => {
    const riseFallRate = parseFloat(token.riseFallRate.toFixed(4));
    const fundingRate = (token.fundingRate !== undefined && 
                        token.fundingRate !== null && 
                        typeof token.fundingRate === 'number' &&
                        !isNaN(token.fundingRate))
      ? parseFloat(token.fundingRate.toFixed(6)) 
      : 0;

    return {
      rank: index + 1,
      symbol: token.symbol,
      riseFallRate,
      riseFallValue: token.riseFallValue,
      high24Price: token.high24Price,
      lower24Price: token.lower24Price,
      lastPrice: token.lastPrice,
      volume24: token.volume24,
      contractId: token.contractId,
      fundingRate,
    };
  });

  return top10WithoutRSI;
}

/**
 * Tính RSI cho top 10 tokens
 * @param {Array} top10 - Top 10 tokens (chưa có RSI)
 * @returns {Promise<Array>} Top 10 tokens với RSI đã được tính
 */
export async function addRSIToTop10(top10) {
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
      
      top10WithRSI.push({
        ...token,
        rsi: rsiInfo.rsiData,
        rsiConfluence: rsiInfo.confluence,
        rsiErrors: rsiInfo.errors,
      });
      
      // Delay nhỏ giữa các token để tránh rate limit (200ms)
      if (i < top10.length - 1) {
        await delay(200);
      }
    } catch (error) {
      console.error(`❌ Lỗi khi tính RSI cho ${token.symbol}: ${error.message}`);
      top10WithRSI.push({
        ...token,
        rsi: {},
        rsiConfluence: {
          hasConfluence: false,
          status: 'neutral',
          timeframes: [],
          count: 0,
        },
        rsiErrors: [{ error: error.message }],
      });
      
      // Delay ngay cả khi có lỗi
      if (i < top10.length - 1) {
        await delay(200);
      }
    }
  }

  console.log('\n✅ Đã tính RSI cho tất cả tokens');
  
  return top10WithRSI;
}

