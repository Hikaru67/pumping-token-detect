import axios from 'axios';
import { config } from './config.js';

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

