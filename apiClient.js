import axios from 'axios';
import { config } from './config.js';

/**
 * Call MEXC Futures API để lấy dữ liệu kline/OHLCV
 * @param {string} symbol - Symbol của token (ví dụ: 'BTC_USDT')
 * @param {string} interval - Khung thời gian (ví dụ: 'Min15', 'Hour1', 'Day1')
 * @param {number} limit - Số lượng candles cần lấy (mặc định: 200 để đủ tính RSI)
 * @returns {Promise<Object>} Object chứa dữ liệu kline với format: { time, open, close, high, low, vol, amount }
 */
export async function fetchKlineData(symbol, interval, limit = 200) {
  try {
    // MEXC Futures API endpoint cho kline data
    // Format: https://contract.mexc.com/api/v1/contract/kline/{symbol}?interval={interval}&limit={limit}
    // Response format: { success: true, data: { time: [...], open: [...], close: [...], high: [...], low: [...], vol: [...], amount: [...] } }
    const url = `https://contract.mexc.com/api/v1/contract/kline/${symbol}`;
    
    // Tính toán start time: lấy limit candles từ hiện tại về trước
    // Mỗi interval có duration khác nhau (15m = 900s, 1h = 3600s, etc.)
    const now = Math.floor(Date.now() / 1000);
    const intervalSeconds = getIntervalSeconds(interval);
    const startTime = now - (limit * intervalSeconds);
    
    const response = await axios.get(url, {
      params: {
        interval: interval,
        start: startTime,
        end: now,
      },
      timeout: 15000, // Tăng timeout lên 15s vì có thể cần nhiều thời gian hơn
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.data || !response.data.success) {
      throw new Error(`API response không hợp lệ cho ${symbol}: ${JSON.stringify(response.data)}`);
    }

    if (!response.data.data || typeof response.data.data !== 'object') {
      throw new Error(`Dữ liệu kline từ API không hợp lệ cho ${symbol}: ${JSON.stringify(response.data.data)}`);
    }

    const data = response.data.data;
    
    // Kiểm tra xem có close array không
    if (!Array.isArray(data.close) || data.close.length === 0) {
      throw new Error(`Không có dữ liệu close price cho ${symbol}`);
    }

    // MEXC kline data format: { time: [...], open: [...], close: [...], high: [...], low: [...], vol: [...], amount: [...] }
    return data;
  } catch (error) {
    if (error.response) {
      const errorData = error.response.data || {};
      throw new Error(`API Error khi lấy kline ${symbol}: ${error.response.status} - ${error.response.statusText} - ${JSON.stringify(errorData)}`);
    } else if (error.request) {
      throw new Error(`Không thể kết nối đến MEXC API để lấy kline ${symbol}`);
    } else {
      throw new Error(`Error khi lấy kline ${symbol}: ${error.message}`);
    }
  }
}

/**
 * Chuyển đổi interval thành số giây
 * @param {string} interval - Interval (ví dụ: 'Min15', 'Hour1', 'Day1')
 * @returns {number} Số giây
 */
function getIntervalSeconds(interval) {
  const intervalMap = {
    'Min1': 60,
    'Min5': 300,
    'Min15': 900,
    'Min30': 1800,
    'Hour1': 3600,
    'Hour4': 14400,
    'Hour8': 28800,
    'Day1': 86400,
    'Week1': 604800,
    'Month1': 2592000,
  };
  
  return intervalMap[interval] || 900; // Mặc định 15 phút nếu không tìm thấy
}

/**
 * Call MEXC Futures API để lấy dữ liệu ticker
 * @returns {Promise<Object>} Dữ liệu từ API
 */
export async function fetchTickerData() {
  try {
    const response = await axios.get(config.mexcApiUrl, {
      timeout: 10000, // 10 seconds timeout
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.data || !response.data.success) {
      throw new Error('API response không hợp lệ');
    }

    if (!Array.isArray(response.data.data)) {
      throw new Error('Dữ liệu từ API không phải là array');
    }

    if (response.data.data.length === 0) {
      console.warn('⚠️  API trả về mảng rỗng');
      return [];
    }

    return response.data.data;
  } catch (error) {
    if (error.response) {
      // API trả về error response
      throw new Error(`API Error: ${error.response.status} - ${error.response.statusText}`);
    } else if (error.request) {
      // Request được gửi nhưng không nhận được response
      throw new Error('Không thể kết nối đến MEXC API. Kiểm tra kết nối mạng.');
    } else {
      // Lỗi khác
      throw new Error(`Error: ${error.message}`);
    }
  }
}

