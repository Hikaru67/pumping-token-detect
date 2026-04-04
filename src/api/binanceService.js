import axios from 'axios';
import crypto from 'crypto';
import { config } from '../config.js';

const DEFAULT_BINANCE_FUTURES_BASE_URL = 'https://fapi.binance.com';
let httpClient = axios;

const exchangeInfoCache = {
  timestamp: 0,
  data: null,
};

/**
 * Cho phép inject HTTP client để testing
 * @param {(config: import('axios').AxiosRequestConfig) => Promise<import('axios').AxiosResponse>} client
 */
export function setBinanceHttpClient(client) {
  httpClient = client || axios;
}

function buildQueryString(params = {}) {
  return Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
}

async function callBinancePublicApi({ endpoint, params = {}, method = 'GET' } = {}) {
  if (!endpoint || typeof endpoint !== 'string') {
    throw new Error('Endpoint Binance không hợp lệ.');
  }

  const baseUrl = config.binanceApiBaseUrl || DEFAULT_BINANCE_FUTURES_BASE_URL;
  const normalizedMethod = method.toUpperCase();
  const queryString = buildQueryString(params);

  const url = normalizedMethod === 'GET' && queryString
    ? `${baseUrl}${endpoint}?${queryString}`
    : `${baseUrl}${endpoint}`;

  const axiosConfig = {
    method: normalizedMethod,
    url,
    timeout: config.binanceApiTimeout || 10000,
  };

  try {
    const response = await httpClient(axiosConfig);
    if (!response || typeof response !== 'object' || !response.data) {
      throw new Error('Binance API không trả về dữ liệu.');
    }
    return response.data;
  } catch (error) {
    if (error.response) {
      const message = error.response.data?.msg || error.response.data?.message || error.response.statusText;
      throw new Error(`Binance API Error ${error.response.status}: ${message}`);
    }
    if (error.request) {
      throw new Error('Không thể kết nối tới Binance API. Vui lòng kiểm tra mạng.');
    }
    throw error;
  }
}

/**
 * Gọi Binance Futures Private API (yêu cầu ký HMAC SHA256)
 * @param {object} options
 * @param {string} options.endpoint
 * @param {('GET'|'POST'|'DELETE')} [options.method='GET']
 * @param {Record<string, any>} [options.params={}]
 */
async function callBinancePrivateApi({ endpoint, method = 'GET', params = {} } = {}) {
  const apiKey = process.env.BINANCE_API_KEY || config.binanceApiKey;
  const secretKey = process.env.BINANCE_SECRET_KEY || config.binanceSecretKey;

  if (!apiKey || !secretKey) {
    throw new Error('Thiếu cấu hình BINANCE_API_KEY hoặc BINANCE_SECRET_KEY trong file .env');
  }

  const baseUrl = config.binanceApiBaseUrl || DEFAULT_BINANCE_FUTURES_BASE_URL;
  const signedParams = { ...params, timestamp: Date.now(), recvWindow: 5000 };
  const queryString = buildQueryString(signedParams);
  const signature = crypto.createHmac('sha256', secretKey).update(queryString).digest('hex');
  const fullQuery = `${queryString}&signature=${signature}`;

  const normalizedMethod = method.toUpperCase();
  const url = (normalizedMethod === 'GET' || normalizedMethod === 'DELETE')
    ? `${baseUrl}${endpoint}?${fullQuery}`
    : `${baseUrl}${endpoint}`;

  const axiosConfig = {
    method: normalizedMethod,
    url,
    headers: { 'X-MBX-APIKEY': apiKey },
    timeout: config.binanceApiTimeout || 10000,
  };

  if (normalizedMethod === 'POST') {
    axiosConfig.data = fullQuery;
    axiosConfig.headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  try {
    const response = await httpClient(axiosConfig);
    if (!response || !response.data) throw new Error('Binance Private API không trả về dữ liệu.');
    return response.data;
  } catch (error) {
    if (error.response) {
      const message = error.response.data?.msg || error.response.statusText;
      throw new Error(`Binance Private API Error ${error.response.status}: ${message}`);
    }
    throw error;
  }
}

function shouldUseExchangeInfoCache(forceRefresh = false) {
  if (forceRefresh) {
    return false;
  }
  const cacheTtl = config.binanceExchangeInfoCacheMs || 300000; // 5 phút mặc định
  return exchangeInfoCache.data && Date.now() - exchangeInfoCache.timestamp < cacheTtl;
}

export async function getBinanceFuturesExchangeInfo(forceRefresh = false) {
  if (shouldUseExchangeInfoCache(forceRefresh)) {
    return exchangeInfoCache.data;
  }

  const data = await callBinancePublicApi({ endpoint: '/fapi/v1/exchangeInfo' });
  if (!data || !Array.isArray(data.symbols)) {
    throw new Error('Binance exchangeInfo response không hợp lệ.');
  }

  exchangeInfoCache.data = data;
  exchangeInfoCache.timestamp = Date.now();
  return data;
}

function normalizeBinanceSymbol(symbol, quote = 'USDT') {
  if (!symbol || typeof symbol !== 'string') {
    throw new Error('Symbol không hợp lệ.');
  }
  const normalizedQuote = (quote || 'USDT').trim().toUpperCase();
  const trimmed = symbol.trim().toUpperCase();
  const withoutSeparators = trimmed.replace(/[-_]/g, '');

  if (withoutSeparators.endsWith(normalizedQuote)) {
    return withoutSeparators;
  }

  return `${withoutSeparators}${normalizedQuote}`;
}

/**
 * Kiểm tra token có hợp đồng futures trên Binance (USDT-M) hay không
 * @param {string} symbol
 * @param {string} [quote='USDT']
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<{ exists: boolean, symbol: string, info: object | null }>}
 */
export async function checkBinanceFuturesSymbol(symbol, quote = 'USDT', forceRefresh = false) {
  const normalizedSymbol = normalizeBinanceSymbol(symbol, quote);
  const exchangeInfo = await getBinanceFuturesExchangeInfo(forceRefresh);

  const target = exchangeInfo.symbols.find(
    (item) => (item.symbol || '').toUpperCase() === normalizedSymbol
  );

  const exists = Boolean(
    target
    && target.contractType
    && target.contractType.toUpperCase() !== 'NONE'
    && target.status === 'TRADING'
  );

  return {
    exists,
    symbol: normalizedSymbol,
    info: target || null,
  };
}

// =============================================================================
// === INTERFACE-COMPATIBLE EXPORTS (theo exchangeInterface.js) ================
// =============================================================================

/**
 * Kiểm tra symbol có tồn tại trên Binance Futures không
 * @param {string} symbol
 * @returns {Promise<{ exists: boolean, symbol: string, info: any }>}
 */
export async function checkContractSymbol(symbol) {
  return checkBinanceFuturesSymbol(symbol);
}

/**
 * Lấy tickSize (bước giá tối thiểu) của symbol từ Binance Futures
 * @param {string} symbol
 * @returns {Promise<number|null>}
 */
export async function getSymbolTickSize(symbol) {
  try {
    const result = await checkBinanceFuturesSymbol(symbol);
    if (!result.exists || !result.info) return null;
    // Binance trả về pricePrecision là số chữ số thập phân
    const pricePrecision = result.info.pricePrecision;
    if (pricePrecision !== undefined && pricePrecision !== null) {
      return 1 / Math.pow(10, parseInt(pricePrecision, 10));
    }
    // Fallback: tìm trong filters
    const priceFilter = (result.info.filters || []).find(f => f.filterType === 'PRICE_FILTER');
    if (priceFilter && priceFilter.tickSize) {
      return parseFloat(priceFilter.tickSize);
    }
    return null;
  } catch (error) {
    console.warn(`⚠️  Không lấy được tickSize cho ${symbol} từ Binance:`, error.message);
    return null;
  }
}

// --- Các hàm sau KHÔNG có trên Binance Futures public API (yêu cầu trading key) ---
// Nếu cần tích hợp trading qua Binance Futures, cần implement thêm với signed API key.

/**
 * Lấy số dư khả dụng tài khoản Binance Futures
 * @param {string} [currency='USDT']
 * @returns {Promise<number>}
 */
export async function getAccountBalance(currency = 'USDT') {
  // GET /fapi/v2/balance — trả về array các asset
  const data = await callBinancePrivateApi({ endpoint: '/fapi/v2/balance' });
  if (!Array.isArray(data)) return 0;
  const asset = data.find(a => a.asset === currency);
  return asset ? parseFloat(asset.availableBalance || asset.balance || '0') : 0;
}

/**
 * Chuẩn hoá Binance position object về interface contract
 * Binance dùng positionAmt (âm = SHORT, dương = LONG), avgPrice
 */
function normalizeBinancePosition(pos) {
  if (!pos) return pos;
  const rawAmt = parseFloat(pos.positionAmt || '0');
  const positionSide = rawAmt < 0 ? 'SHORT' : 'LONG';
  const avgPrice = parseFloat(pos.entryPrice || pos.avgPrice || '0');
  return {
    ...pos,
    symbol: (pos.symbol || '').replace('USDT', '-USDT'), // BTCUSDT → BTC-USDT
    positionSide,
    vol: Math.abs(rawAmt),
    avgPrice,
    positionValue: Math.abs(rawAmt) * avgPrice,
  };
}

/**
 * Lấy danh sách vị thế đang mở trên Binance Futures
 * @param {string} [symbol]
 * @returns {Promise<Array>}
 */
export async function getOpenPositions(symbol) {
  // GET /fapi/v2/positionRisk
  const binanceSymbol = symbol ? symbol.replace('-', '') : undefined;
  const data = await callBinancePrivateApi({
    endpoint: '/fapi/v2/positionRisk',
    params: binanceSymbol ? { symbol: binanceSymbol } : {},
  });
  if (!Array.isArray(data)) return [];
  return data
    .filter(p => parseFloat(p.positionAmt || '0') !== 0)
    .map(normalizeBinancePosition);
}

/**
 * Đặt lệnh Market / Limit trên Binance Futures
 * Input theo interface: { symbol, side (BUY/SELL), type (MARKET/LIMIT), vol, price, positionSide }
 * @returns {Promise<OrderResult>}
 */
export async function placeOrder(order = {}) {
  const { symbol, side, type, vol, price, positionSide } = order;
  const binanceSymbol = (symbol || '').replace('-', '');
  const params = {
    symbol: binanceSymbol,
    side,                      // BUY | SELL
    type,                      // MARKET | LIMIT
    quantity: vol,
    positionSide: positionSide || (side === 'BUY' ? 'LONG' : 'SHORT'),
    ...(type === 'LIMIT' && { price, timeInForce: 'GTC' }),
  };
  const result = await callBinancePrivateApi({ endpoint: '/fapi/v1/order', method: 'POST', params });
  return {
    orderId: result?.orderId,
    symbol,
    raw: result,
  };
}

/**
 * Hủy 1 lệnh
 * @param {string} symbol
 * @param {string|number} orderId
 */
export async function cancelOrder(symbol, orderId) {
  const binanceSymbol = (symbol || '').replace('-', '');
  return callBinancePrivateApi({
    endpoint: '/fapi/v1/order',
    method: 'DELETE',
    params: { symbol: binanceSymbol, orderId },
  });
}

/**
 * Hủy toàn bộ lệnh đang chờ của symbol
 * @param {string} symbol
 */
export async function cancelAllOrders(symbol) {
  const binanceSymbol = (symbol || '').replace('-', '');
  return callBinancePrivateApi({
    endpoint: '/fapi/v1/allOpenOrders',
    method: 'DELETE',
    params: { symbol: binanceSymbol },
  });
}

/**
 * Lấy danh sách lệnh đang chờ khớp
 * @param {string} symbol
 */
export async function getOpenOrders(symbol) {
  const binanceSymbol = (symbol || '').replace('-', '');
  const data = await callBinancePrivateApi({
    endpoint: '/fapi/v1/openOrders',
    params: { symbol: binanceSymbol },
  });
  return Array.isArray(data) ? data : [];
}

/**
 * Chuẩn hoá Binance order status sang interface format
 * Binance status: NEW, PARTIALLY_FILLED, FILLED, CANCELED, REJECTED, EXPIRED
 */
function normalizeBinanceOrderStatus(raw) {
  return {
    order: {
      orderId: raw?.orderId,
      status: raw?.status, // Đã giống interface (FILLED, CANCELED...)
    },
    raw,
  };
}

/**
 * Truy vấn trạng thái 1 lệnh cụ thể
 * @param {string} symbol
 * @param {string|number} orderId
 * @returns {Promise<OrderStatus>}
 */
export async function getOrderStatus(symbol, orderId) {
  const binanceSymbol = (symbol || '').replace('-', '');
  const raw = await callBinancePrivateApi({
    endpoint: '/fapi/v1/order',
    params: { symbol: binanceSymbol, orderId },
  });
  return normalizeBinanceOrderStatus(raw);
}

/**
 * Đặt lệnh Stop Market (Stop Loss)
 * @param {Object} order
 * @param {string} order.symbol
 * @param {'BUY'|'SELL'} order.side
 * @param {string|number} order.vol       - Số lượng token
 * @param {string|number} order.stopPrice - Giá kích hoạt
 * @param {'LONG'|'SHORT'} [order.positionSide]
 * @returns {Promise<OrderResult>}
 */
export async function placeStopOrder(order = {}) {
  const { symbol, side, vol, stopPrice, positionSide } = order;
  const binanceSymbol = (symbol || '').replace('-', '');
  const params = {
    symbol: binanceSymbol,
    side,
    type: 'STOP_MARKET',
    quantity: vol,
    stopPrice,
    positionSide: positionSide || (side === 'BUY' ? 'LONG' : 'SHORT'),
    closePosition: false,
  };
  const result = await callBinancePrivateApi({ endpoint: '/fapi/v1/order', method: 'POST', params });
  return {
    orderId: result?.orderId,
    symbol,
    raw: result,
  };
}

/**
 * Lấy lịch sử lệnh (hoàn thành / hủy)
 * @param {string} symbol
 * @param {number} [limit=50]
 */
export async function getOrderHistory(symbol, limit = 50) {
  const binanceSymbol = (symbol || '').replace('-', '');
  const data = await callBinancePrivateApi({
    endpoint: '/fapi/v1/allOrders',
    params: { symbol: binanceSymbol, limit },
  });
  return Array.isArray(data) ? data : [];
}
