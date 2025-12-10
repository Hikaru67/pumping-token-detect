import axios from 'axios';
import crypto from 'crypto';
import { config } from '../config.js';

const DEFAULT_BASE_URL = 'https://open-api.bingx.com';
let httpClient = axios;

/**
 * Cho phép inject HTTP client (dùng cho testing)
 * @param {(config: import('axios').AxiosRequestConfig) => Promise<import('axios').AxiosResponse>} client
 */
export function setBingxHttpClient(client) {
  httpClient = client || axios;
}

/**
 * Build query string with keys sorted alphabetically (required for BingX signatures)
 * @param {Record<string, string|number>} params
 * @returns {string}
 */
function buildQueryString(params = {}) {
  return Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
}

function normalizeContractSymbol(symbol, quote = 'USDT') {
  if (!symbol || typeof symbol !== 'string') {
    throw new Error('Symbol không hợp lệ.');
  }

  const trimmed = symbol.trim().toUpperCase();
  if (trimmed.includes('-')) {
    return trimmed;
  }
  return `${trimmed}-${quote.trim().toUpperCase()}`;
}

/**
 * Create HMAC SHA256 signature for BingX request
 * @param {string} payload
 * @returns {string}
 */
function createSignature(payload) {
  if (!config.bingxApiSecret) {
    throw new Error('BINGX_API_SECRET chưa được cấu hình.');
  }
  return crypto.createHmac('sha256', config.bingxApiSecret).update(payload).digest('hex');
}

/**
 * Parse BingX API response and throw errors when needed
 * @param {import('axios').AxiosResponse} response
 * @returns {any}
 */
function parseResponse(response) {
  if (!response || typeof response !== 'object') {
    throw new Error('BingX API không trả về dữ liệu.');
  }

  const payload = response.data;
  if (!payload) {
    throw new Error('BingX API trả về dữ liệu rỗng.');
  }

  // Hầu hết các API BingX trả về dạng { code: 0, msg: 'success', data: {...} }
  if (Object.prototype.hasOwnProperty.call(payload, 'code') && payload.code !== 0) {
    const message = payload.msg || payload.message || 'Không rõ lỗi';
    const error = new Error(`BingX API trả lỗi ${payload.code}: ${message}`);
    error.response = payload;
    throw error;
  }

  return Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload;
}

/**
 * Chuẩn hóa cấu hình request
 * @param {object} options
 * @param {string} options.endpoint - Endpoint vd: /openApi/swap/v2/market/ticker
 * @param {('GET'|'POST'|'DELETE')} [options.method='GET']
 * @param {Record<string, any>} [options.params={}]
 * @param {boolean} [options.requiresSignature=true]
 * @returns {Promise<any>}
 */
export async function callBingxApi({
  endpoint,
  method = 'GET',
  params = {},
  requiresSignature = true,
} = {}) {
  if (!endpoint || typeof endpoint !== 'string') {
    throw new Error('Endpoint BingX không hợp lệ.');
  }

  const baseUrl = config.bingxApiBaseUrl || DEFAULT_BASE_URL;
  const normalizedMethod = method.toUpperCase();
  const requestParams = { ...params };
  const headers = {};

  if (requiresSignature) {
    if (!config.bingxApiKey) {
      throw new Error('BINGX_API_KEY chưa được cấu hình.');
    }
    if (!config.bingxApiSecret) {
      throw new Error('BINGX_API_SECRET chưa được cấu hình.');
    }

    requestParams.timestamp = requestParams.timestamp || Date.now();
    if (config.bingxRecvWindow) {
      requestParams.recvWindow = requestParams.recvWindow || config.bingxRecvWindow;
    }
  } else if (config.bingxApiKey) {
    // Một số endpoint công khai vẫn cần API key
    headers['X-BX-APIKEY'] = config.bingxApiKey;
  }

  let queryString = buildQueryString(requestParams);
  if (requiresSignature) {
    headers['X-BX-APIKEY'] = config.bingxApiKey;
    const signature = createSignature(queryString);
    queryString = queryString ? `${queryString}&signature=${signature}` : `signature=${signature}`;
  }

  const url = normalizedMethod === 'GET' && queryString
    ? `${baseUrl}${endpoint}?${queryString}`
    : `${baseUrl}${endpoint}`;

  const axiosConfig = {
    method: normalizedMethod,
    url,
    headers,
    timeout: config.bingxApiTimeout || 15000,
  };

  if (normalizedMethod !== 'GET') {
    axiosConfig.data = queryString;
    axiosConfig.headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  try {
    const response = await httpClient(axiosConfig);
    return parseResponse(response);
  } catch (error) {
    console.log('🚀 ~ error:', error)
    if (error.response) {
      const message = error.response.data?.msg || error.response.data?.message || error.response.statusText;
      throw new Error(`BingX API Error ${error.response.status}: ${message}`);
    }
    if (error.request) {
      throw new Error('Không thể kết nối tới BingX API. Vui lòng kiểm tra mạng hoặc API key.');
    }
    throw error;
  }
}

/**
 * Helper cho public API (không cần chữ ký)
 * @param {string} endpoint
 * @param {Record<string, any>} params
 * @param {('GET'|'POST'|'DELETE')} method
 */
export function callBingxPublicApi(endpoint, params = {}, method = 'GET') {
  return callBingxApi({ endpoint, params, method, requiresSignature: false });
}

/**
 * Helper cho private API (cần chữ ký)
 * @param {string} endpoint
 * @param {Record<string, any>} params
 * @param {('GET'|'POST'|'DELETE')} method
 */
export function callBingxPrivateApi(endpoint, params = {}, method = 'GET') {
  return callBingxApi({ endpoint, params, method, requiresSignature: true });
}

/**
 * Ví dụ tiện ích: lấy ticker hợp đồng
 * Docs: https://bingx-api.github.io/docs/swapV2/quote/market.html#ticker
 * @param {string} [symbol]
 */
export async function getBingxSwapTickers(symbol) {
  // NOTE: `/market/ticker` trả 100404 trên env sandbox; `/quote/ticker` hoạt động.
  const data = await callBingxPublicApi('/openApi/swap/v2/quote/ticker', symbol ? { symbol } : {});
  return data;
}

/**
 * Ví dụ tiện ích: lấy số dư tài khoản hợp đồng
 * Docs: https://bingx-api.github.io/docs/swapV2/account/balance.html
 * @param {string} [currency='USDT']
 */
export async function getBingxAccountBalance(currency = 'USDT') {
  return callBingxPrivateApi('/openApi/swap/v2/user/balance', { currency });
}

/**
 * Kiểm tra BingX có hỗ trợ contract symbol cụ thể hay không
 * Docs: https://bingx-api.github.io/docs/swapV2/quote/market.html#symbols
 * @param {string} symbol - Ví dụ: BTC hoặc BTC-USDT
 * @param {string} [quote='USDT']
 * @returns {Promise<{ exists: boolean, symbol: string, info?: object | null }>}
 */
export async function checkBingxContractSymbol(symbol, quote = 'USDT') {
  const normalizedSymbol = normalizeContractSymbol(symbol, quote);
  
  // Thử các endpoint khác nhau để lấy thông tin symbol
  const endpoints = [
    // `/market/ticker` trả 100404 trên sandbox → dùng `/quote/ticker`
    { path: '/openApi/swap/v2/quote/ticker', params: { symbol: normalizedSymbol } },
    { path: '/openApi/swap/v2/quote/contracts', params: {} },
    { path: '/openApi/swap/v2/market/symbols', params: {} },
  ];
  
  for (const { path, params } of endpoints) {
    try {
      const data = await callBingxPublicApi(path, params);
      
      // Nếu là object có symbol, kiểm tra trực tiếp
      if (data && typeof data === 'object' && data.symbol) {
        if ((data.symbol || '').toUpperCase() === normalizedSymbol) {
          return {
            exists: true,
            symbol: normalizedSymbol,
            info: data,
          };
        }
      }
      
      // Nếu là array, tìm trong array
      if (Array.isArray(data)) {
        const info = data.find((item) => {
          const itemSymbol = item.symbol || item.contractName || item.name;
          return itemSymbol && itemSymbol.toUpperCase() === normalizedSymbol;
        });
        
        if (info) {
          return {
            exists: true,
            symbol: normalizedSymbol,
            info: info,
          };
        }
      }
      
      // Nếu data có field chứa array (như data.symbols, data.contracts)
      if (data && typeof data === 'object') {
        for (const key of ['symbols', 'contracts', 'data']) {
          if (Array.isArray(data[key])) {
            const info = data[key].find((item) => {
              const itemSymbol = item.symbol || item.contractName || item.name;
              return itemSymbol && itemSymbol.toUpperCase() === normalizedSymbol;
            });
            
            if (info) {
              return {
                exists: true,
                symbol: normalizedSymbol,
                info: info,
              };
            }
          }
        }
      }
    } catch (error) {
      // Tiếp tục thử endpoint tiếp theo
      console.log(`⚠️  Endpoint ${path} không khả dụng: ${error.message}`);
      continue;
    }
  }
  
  // Nếu tất cả endpoint đều fail, trả về false
  console.warn(`⚠️  Không thể kiểm tra symbol ${normalizedSymbol} từ bất kỳ endpoint nào`);
  return {
    exists: false,
    symbol: normalizedSymbol,
    info: null,
  };
}

/**
 * Lấy danh sách vị thế đang mở (swap perpetual)
 * Docs: https://bingx-api.github.io/docs/swapV2/account/position.html
 * @param {string} [symbol] - Nếu truyền sẽ lọc theo symbol
 */
export async function getBingxOpenPositions(symbol) {
  const params = symbol ? { symbol } : {};
  return callBingxPrivateApi('/openApi/swap/v2/user/positions', params);
}

/**
 * Mở/đặt lệnh hợp đồng
 * Docs: https://bingx-api.github.io/docs/swapV2/trade/order.html
 * @param {object} order
 * @param {string} order.symbol - Ví dụ: BTC-USDT
 * @param {('BUY'|'SELL')} order.side
 * @param {('MARKET'|'LIMIT')} order.type
 * @param {string|number} order.quantity - Khối lượng
 * @param {string|number} [order.price] - Bắt buộc với LIMIT
 * @param {number} [order.leverage] - Đòn bẩy
 * @param {('ISOLATED'|'CROSSED')} [order.marginMode]
 * @param {string} [order.positionSide] - LONG/SHORT/BOTH
 * @param {string} [order.clientOrderId]
 */
export async function placeBingxSwapOrder(order = {}) {
  if (!order.symbol) {
    throw new Error('placeBingxSwapOrder: Thiếu symbol.');
  }
  if (!order.side) {
    throw new Error('placeBingxSwapOrder: Thiếu side (BUY/SELL).');
  }
  if (!order.type) {
    throw new Error('placeBingxSwapOrder: Thiếu type (MARKET/LIMIT).');
  }
  if (!order.quantity) {
    throw new Error('placeBingxSwapOrder: Thiếu quantity.');
  }
  if (order.type === 'LIMIT' && !order.price) {
    throw new Error('placeBingxSwapOrder: Lệnh LIMIT cần price.');
  }

  // Thêm positionSide mặc định nếu chưa có
  // LONG cho BUY, SHORT cho SELL, hoặc BOTH
  const orderWithDefaults = {
    ...order,
    positionSide: order.positionSide || (order.side === 'BUY' ? 'LONG' : 'SHORT'),
  };

  return callBingxPrivateApi('/openApi/swap/v2/trade/order', orderWithDefaults, 'POST');
}

/**
 * Lấy lịch sử lệnh (bao gồm cả lệnh đã hoàn thành/hủy)
 * Docs: https://bingx-api.github.io/docs/swapV2/trade/allOrders.html
 * @param {object} params
 * @param {string} params.symbol
 * @param {number} [params.startTime]
 * @param {number} [params.endTime]
 * @param {number} [params.limit=100]
 */
export async function getBingxOrderHistory(params = {}) {
  if (!params.symbol) {
    throw new Error('getBingxOrderHistory: symbol là bắt buộc.');
  }
  const query = {
    limit: 100,
    ...params,
  };
  return callBingxPrivateApi('/openApi/swap/v2/trade/allOrders', query);
}


