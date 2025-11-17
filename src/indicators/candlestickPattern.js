import { fetchKlineData } from '../api/apiClient.js';
import { getRSIStatus } from './rsiCalculator.js';
import { config } from '../config.js';

/**
 * Kiểm tra nến có phải là Hammer (búa) - tín hiệu đảo chiều tăng
 * Hammer: bóng dưới dài (ít nhất 2x thân), thân nhỏ, bóng trên ngắn
 * @param {number} open - Giá mở
 * @param {number} close - Giá đóng
 * @param {number} high - Giá cao nhất
 * @param {number} low - Giá thấp nhất
 * @returns {boolean} true nếu là Hammer
 */
function isHammer(open, close, high, low) {
  const body = Math.abs(close - open);
  const lowerShadow = Math.min(open, close) - low;
  const upperShadow = high - Math.max(open, close);
  const range = high - low;

  if (range === 0) return false;

  // Bóng dưới dài (ít nhất 2x thân) và bóng trên ngắn
  return lowerShadow >= body * 2 && upperShadow <= body * 0.5;
}

/**
 * Kiểm tra nến có phải là Doji - tín hiệu đảo chiều
 * Doji: mở và đóng gần bằng nhau (thân rất nhỏ)
 * @param {number} open - Giá mở
 * @param {number} close - Giá đóng
 * @param {number} high - Giá cao nhất
 * @param {number} low - Giá thấp nhất
 * @returns {boolean} true nếu là Doji
 */
function isDoji(open, close, high, low) {
  const body = Math.abs(close - open);
  const range = high - low;

  if (range === 0) return false;

  // Thân nhỏ hơn 5% của range
  return body <= range * 0.05;
}

/**
 * Kiểm tra Bullish Engulfing - nến xanh nhấn chìm nến đỏ trước đó
 * @param {Array} candles - Mảng 2 nến gần nhất [previous, current]
 * @returns {boolean} true nếu là Bullish Engulfing
 */
function isBullishEngulfing(candles) {
  if (candles.length < 2) return false;

  const [prev, curr] = candles;
  const prevOpen = prev.open;
  const prevClose = prev.close;
  const currOpen = curr.open;
  const currClose = curr.close;

  // Nến trước là đỏ (giảm)
  // Nến hiện tại là xanh (tăng)
  // Nến xanh nhấn chìm hoàn toàn nến đỏ
  return prevClose < prevOpen && // Nến trước đỏ
         currClose > currOpen && // Nến hiện tại xanh
         currOpen < prevClose && // Mở thấp hơn đóng của nến trước
         currClose > prevOpen;   // Đóng cao hơn mở của nến trước
}

/**
 * Kiểm tra tín hiệu đảo chiều tăng từ nến
 * @param {Array} candles - Mảng các nến (ít nhất 2 nến)
 * @returns {boolean} true nếu có tín hiệu đảo chiều
 */
function hasReversalSignal(candles) {
  if (!Array.isArray(candles) || candles.length < 2) {
    return false;
  }

  const lastCandle = candles[candles.length - 1];
  const { open, close, high, low } = lastCandle;

  // Kiểm tra Hammer
  if (isHammer(open, close, high, low)) {
    return true;
  }

  // Kiểm tra Doji
  if (isDoji(open, close, high, low)) {
    return true;
  }

  // Kiểm tra Bullish Engulfing
  if (isBullishEngulfing(candles.slice(-2))) {
    return true;
  }

  return false;
}

/**
 * Kiểm tra tín hiệu đảo chiều cho một timeframe cụ thể
 * @param {string} symbol - Symbol của token
 * @param {string} timeframe - Timeframe cần kiểm tra
 * @returns {Promise<Object>} { timeframe, hasSignal: boolean }
 */
async function checkReversalSignalForTimeframe(symbol, timeframe) {
  try {
    // Lấy dữ liệu kline để kiểm tra pattern
    const klineData = await fetchKlineData(symbol, timeframe, 10); // Chỉ cần 10 nến gần nhất
    
    if (!klineData || !klineData.close || !Array.isArray(klineData.close) || klineData.close.length < 2) {
      return {
        timeframe,
        hasSignal: false,
      };
    }

    // Tạo mảng candles từ kline data
    // Bỏ nến cuối cùng (nến đang chạy/chưa đóng cửa) - chỉ dùng nến đã đóng
    const candles = [];
    const length = klineData.close.length;
    // Chỉ lấy từ nến đầu tiên đến nến áp chót (bỏ nến cuối cùng)
    const closedCandlesCount = length > 1 ? length - 1 : length;
    
    for (let i = 0; i < closedCandlesCount; i++) {
      candles.push({
        open: klineData.open[i],
        close: klineData.close[i],
        high: klineData.high[i],
        low: klineData.low[i],
      });
    }

    // Kiểm tra tín hiệu đảo chiều (chỉ dùng nến đã đóng)
    const hasSignal = candles.length >= 2 && hasReversalSignal(candles);
    
    return {
      timeframe,
      hasSignal,
    };
  } catch (error) {
    console.warn(`⚠️  Lỗi khi kiểm tra tín hiệu đảo chiều cho ${symbol} ${timeframe}:`, error.message);
    return {
      timeframe,
      hasSignal: false,
    };
  }
}

/**
 * Xử lý batch timeframes với giới hạn concurrent cho việc check reversal signal
 * @param {Array<string>} timeframes - Danh sách timeframes cần kiểm tra
 * @param {string} symbol - Symbol của token
 * @param {number} maxConcurrent - Số lượng concurrent tối đa
 * @returns {Promise<Array>} Kết quả check reversal signal cho từng timeframe
 */
async function processReversalSignalBatch(timeframes, symbol, maxConcurrent) {
  const results = [];
  
  // Xử lý từng batch
  for (let i = 0; i < timeframes.length; i += maxConcurrent) {
    const batch = timeframes.slice(i, i + maxConcurrent);
    
    // Check song song trong batch
    const batchPromises = batch.map(tf => checkReversalSignalForTimeframe(symbol, tf));
    const batchResults = await Promise.allSettled(batchPromises);
    
    // Xử lý kết quả batch
    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        // Lỗi khi gọi function
        results.push({
          timeframe: batch[j],
          hasSignal: false,
        });
      }
    }
  }
  
  return results;
}

/**
 * Kiểm tra token có tín hiệu đảo chiều từ candlestick pattern
 * @param {Object} token - Token object có RSI data
 * @param {Array<string>} timeframes - Các timeframes cần kiểm tra (đã được filter RSI oversold trước đó)
 * @returns {Promise<Object>} { hasSignal: boolean, timeframes: Array<string> }
 * 
 * Lưu ý: Hàm này giả định các timeframes đã được filter để chỉ có RSI oversold.
 * Hàm sẽ chỉ check candlestick pattern, không check lại RSI oversold.
 */
export async function checkReversalSignal(token, timeframes = ['Min5', 'Min15', 'Min30', 'Min60']) {
  if (!token || !token.symbol || !token.rsi) {
    return { hasSignal: false, timeframes: [] };
  }

  if (!Array.isArray(timeframes) || timeframes.length === 0) {
    return { hasSignal: false, timeframes: [] };
  }

  // Kiểm tra song song cho các timeframes (với giới hạn concurrent)
  const maxConcurrent = config.rsiMaxConcurrentTimeframes; // Dùng cùng config với RSI
  const results = await processReversalSignalBatch(timeframes, token.symbol, maxConcurrent);
  
  // Lọc các timeframes có signal
  const signalTimeframes = results
    .filter(r => r.hasSignal)
    .map(r => r.timeframe);

  return {
    hasSignal: signalTimeframes.length > 0,
    timeframes: signalTimeframes,
  };
}

