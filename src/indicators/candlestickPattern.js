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

  const signalTimeframes = [];
  
  // Kiểm tra từng timeframe (đã được filter RSI oversold trước đó)
  for (const timeframe of timeframes) {
    try {
      // Lấy dữ liệu kline để kiểm tra pattern
      const klineData = await fetchKlineData(token.symbol, timeframe, 10); // Chỉ cần 10 nến gần nhất
      
      if (!klineData || !klineData.close || !Array.isArray(klineData.close) || klineData.close.length < 2) {
        continue;
      }

      // Tạo mảng candles từ kline data
      const candles = [];
      const length = klineData.close.length;
      for (let i = 0; i < length; i++) {
        candles.push({
          open: klineData.open[i],
          close: klineData.close[i],
          high: klineData.high[i],
          low: klineData.low[i],
        });
      }

      // Kiểm tra tín hiệu đảo chiều
      if (hasReversalSignal(candles)) {
        signalTimeframes.push(timeframe);
      }

      // Delay nhỏ để tránh rate limit
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.warn(`⚠️  Lỗi khi kiểm tra tín hiệu đảo chiều cho ${token.symbol} ${timeframe}:`, error.message);
      continue;
    }
  }

  return {
    hasSignal: signalTimeframes.length > 0,
    timeframes: signalTimeframes,
  };
}

