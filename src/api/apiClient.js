import axios from 'axios';
import http from 'http';
import https from 'https';
import { config } from '../config.js';

/**
 * Keep-alive agents để tái sử dụng TCP connection giữa các requests.
 * Thay vì mỗi request phải mở TCP+TLS handshake mới (~30-65ms),
 * connection được giữ sống và reuse → tiết kiệm đáng kể khi có 70+ requests/cycle.
 *
 * maxSockets: số connections tối đa đồng thời đến cùng 1 host
 * maxFreeSockets: số connections nhàn rỗi được giữ trong pool
 * timeout: đóng connection nhàn rỗi sau N ms (tránh leak)
 */
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 20,
  maxFreeSockets: 10,
  timeout: 30000,
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 20,
  maxFreeSockets: 10,
  timeout: 30000,
});

/**
 * Axios instance dùng chung cho toàn bộ MEXC API calls.
 * Mọi request qua instance này đều share cùng connection pool.
 */
const axiosInstance = axios.create({
  httpAgent,
  httpsAgent,
});

/**
 * Chuyển đổi interval để gọi API (Hour1 -> Min60)
 * @param {string} interval - Interval gốc (ví dụ: 'Hour1')
 * @returns {string} Interval để gọi API (ví dụ: 'Min60')
 */
function convertIntervalForAPI(interval) {
  // Chuyển Hour1 thành Min60 khi gọi API
  if (interval === 'Hour1') {
    return 'Min60';
  }
  return interval;
}

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
    // Format: {MEXC_KLINE_API_BASE_URL}/{symbol}?interval={interval}&limit={limit}
    // Response format: { success: true, data: { time: [...], open: [...], close: [...], high: [...], low: [...], vol: [...], amount: [...] } }
    const url = `${config.mexcKlineApiBaseUrl}/${symbol}`;

    // Chuyển đổi interval cho API (Hour1 -> Min60)
    const apiInterval = convertIntervalForAPI(interval);

    // Tính toán start time: lấy limit candles từ hiện tại về trước
    // Mỗi interval có duration khác nhau (15m = 900s, 1h = 3600s, etc.)
    const now = Math.floor(Date.now() / 1000);
    const intervalSeconds = getIntervalSeconds(interval); // Vẫn dùng interval gốc để tính toán
    const startTime = now - (limit * intervalSeconds);

    const response = await axiosInstance.get(url, {
      params: {
        interval: apiInterval, // Dùng apiInterval đã convert
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
    'Min60': 3600,
    'Hour1': 3600,
    'Hour4': 14400,
    'Hour8': 28800,
    'Day1': 86400,
    'Week1': 604800,
    'Month1': 2592000,
  };

  return intervalMap[interval] || 86400; // Mặc định 15 phút nếu không tìm thấy
}

/**
 * Call MEXC Futures API để lấy dữ liệu ticker
 * @returns {Promise<Object>} Dữ liệu từ API
 */
export async function fetchTickerData() {
  try {
    const response = await axiosInstance.get(config.mexcApiUrl, {
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

/**
 * Lấy lịch sử funding rate của một symbol từ MEXC
 * @param {string} symbol - Symbol (ví dụ: 'BTC_USDT')
 * @returns {Promise<Array>} Danh sách lịch sử funding rate
 */
export async function fetchFundingRateHistory(symbol) {
  try {
    const url = `https://futures.mexc.co/api/v1/contract/funding_rate/history`;
    const response = await axiosInstance.get(url, {
      params: {
        symbol: symbol,
        page_num: 1,
        page_size: 10
      },
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.data || !response.data.success) {
      throw new Error(`API response không hợp lệ cho ${symbol}`);
    }

    return response.data.data?.resultList || [];
  } catch (error) {
    console.error(`❌ Lỗi khi lấy lịch sử funding cho ${symbol}:`, error.message);
    return [];
  }
}

