import axios from 'axios';
import crypto from 'crypto';
import { config } from '../config.js';

/**
 * Cung cấp hàm chuẩn hóa cho MEXC
 */
function toMexcSymbol(symbol) {
  if (!symbol) return symbol;
  let normalized = symbol.toUpperCase().trim();
  if (normalized.includes('-')) {
    normalized = normalized.replace('-', '_');
  } else if (!normalized.includes('_')) {
    normalized = `${normalized}_USDT`;
  }
  return normalized;
}

/**
 * MEXC Futures API Client
 * Document: https://mexcdevelop.github.io/apidocs/contract_v1_en/
 */

const BASE_URL = 'https://contract.mexc.com';

function getMexcSignature(apiKey, secretKey, reqTime) {
  const signString = apiKey + reqTime;
  return crypto.createHmac('sha256', secretKey).update(signString).digest('hex');
}

/**
 * Gọi API Private của MEXC Futures V1
 * @param {string} endpoint - API Endpoint (ví dụ: '/api/v1/private/account/assets')
 * @param {string} method - 'GET' hoặc 'POST'
 * @param {Object} data - Payload data (nếu có đối với POST)
 * @returns {Promise<Object>} Data trả về từ API
 */
async function callMexcPrivateApi(endpoint, method = 'GET', data = {}) {
  const reqTime = Date.now().toString();
  const apiKey = process.env.MEXC_API_KEY || config.mexcApiKey;
  const secretKey = process.env.MEXC_SECRET_KEY || config.mexcSecretKey;

  if (!apiKey || !secretKey) {
    throw new Error('Thiếu cấu hình MEXC_API_KEY hoặc MEXC_SECRET_KEY trong file .env');
  }

  const signature = getMexcSignature(apiKey, secretKey, reqTime);

  const headers = {
    'ApiKey': apiKey,
    'Request-Time': reqTime,
    'Signature': signature,
    'Content-Type': 'application/json'
  };

  const url = `${BASE_URL}${endpoint}`;

  try {
    const response = await axios({
      method: method,
      url: url,
      headers: headers,
      data: method === 'POST' ? data : undefined,
    });

    if (response.data && response.data.success !== undefined && !response.data.success) {
      throw new Error(`MEXC API Error (${response.data.code}): ${response.data.message || JSON.stringify(response.data)}`);
    }

    return response.data;
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(`MEXC API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

// =============================================================================
// === RAW MEXC API WRAPPERS (tên gốc theo doc MEXC) ===========================
// =============================================================================

/** Lấy số dư tài khoản từ MEXC */
export async function getMexcAccountBalance(currency = 'USDT') {
  const response = await callMexcPrivateApi('/api/v1/private/account/assets', 'GET');
  if (response && response.data) {
    const assets = response.data;
    const asset = assets.find(a => a.currency === currency);
    return asset ? parseFloat(asset.availableBalance) : 0;
  }
  return 0;
}

/** Lấy thông tin chi tiết Symbol (tick size, min lot, v.v.) */
export async function getMexcSymbolInfo(symbol) {
  const normalizedSymbol = toMexcSymbol(symbol);
  
  const response = await axios.get(`${BASE_URL}/api/v1/contract/detail`, { params: { symbol: normalizedSymbol } });
  if (response.data && response.data.success && response.data.data) {
    return response.data.data;
  }
  throw new Error('Không lấy được thông tin contract từ MEXC');
}

/** Chuyển đổi Margin Mode — marginType: 1-Isolated, 2-Cross */
export async function switchMexcMarginMode(symbol, marginType = 1, positionType = 1) {
  return await callMexcPrivateApi('/api/v1/private/position/change_margin', 'POST', {
    symbol, openType: marginType, positionType
  });
}

/** Đổi đòn bẩy */
export async function setMexcLeverage(symbol, leverage, positionType = 1) {
  return await callMexcPrivateApi('/api/v1/private/position/change_leverage', 'POST', {
    symbol, leverage, positionType
  });
}

/** Đặt lệnh Market / Limit (raw MEXC format) */
export async function placeMexcOrder(data = {}) {
  return await callMexcPrivateApi('/api/v1/private/order/create', 'POST', data);
}

/** Đặt lệnh Trigger (Stop Loss) — MEXC dùng endpoint riêng */
export async function placeMexcPlanOrder(data = {}) {
  return await callMexcPrivateApi('/api/v1/private/planorder/place/v2', 'POST', data);
}

/** Lấy lịch sử lệnh */
export async function getMexcOrderHistory(symbol, limit = 50) {
  const params = symbol ? `?symbol=${symbol}&page_size=${limit}` : `?page_size=${limit}`;
  const response = await callMexcPrivateApi(`/api/v1/private/order/history${params}`, 'GET');
  return response.data || [];
}

// =============================================================================
// === CHUẨN HOÁ MEXC POSITION OBJECT → interface contract `vol` field =========
// =============================================================================

/**
 * MEXC position response fields:
 *   holdVol       → số token đang giữ  (tương đương BingX positionAmt)
 *   openAvgPrice  → giá entry trung bình
 *   positionType  → 1=Long, 2=Short
 */
function normalizeMexcPosition(pos) {
  if (!pos) return pos;
  const positionSide = pos.positionType === 2 ? 'SHORT' : 'LONG';
  return {
    ...pos,
    symbol: pos.symbol,
    positionSide,
    vol: Math.abs(parseFloat(pos.holdVol || pos.vol || '0')),
    avgPrice: parseFloat(pos.openAvgPrice || pos.avgPrice || '0'),
    positionValue: parseFloat(pos.holdVol || '0') * parseFloat(pos.openAvgPrice || '0'),
  };
}

/**
 * Chuẩn hoá MEXC OrderStatus → { order: { orderId, status } }
 * MEXC trạng thái: 1-init, 2-pending, 3-filled, 4-cancelled, 5-invalid
 */
function normalizeMexcOrderStatus(raw) {
  const stateMap = { 1: 'NEW', 2: 'NEW', 3: 'FILLED', 4: 'CANCELED', 5: 'REJECTED' };
  const rawStatus = raw?.state ?? raw?.status;
  const status = typeof rawStatus === 'number' ? (stateMap[rawStatus] || 'NEW') : rawStatus;
  return {
    order: {
      orderId: raw?.orderId || raw?.id,
      status,
    },
    raw,
  };
}

// =============================================================================
// === INTERFACE-COMPATIBLE EXPORTS (theo exchangeInterface.js) ================
// =============================================================================

/**
 * Lấy số dư khả dụng USDT
 */
export async function getAccountBalance(currency = 'USDT') {
  return getMexcAccountBalance(currency);
}

/**
 * Lấy danh sách vị thế đang mở — kết quả đã chuẩn hoá với `vol`
 */
export async function getOpenPositions(symbol = '') {
  const normSymbol = toMexcSymbol(symbol);
  const params = normSymbol ? `?symbol=${normSymbol}` : '';
  const response = await callMexcPrivateApi(`/api/v1/private/position/open_positions${params}`, 'GET');
  const data = response.data || [];
  return Array.isArray(data) ? data.map(normalizeMexcPosition) : [];
}

/**
 * Đặt lệnh Market / Limit — input dùng `vol`
 * side: 1=open long, 2=close short, 3=open short, 4=close long
 * type: 1=limit, 5=market
 */
export async function placeOrder(order = {}) {
  const { vol, price, symbol, side, type = 5, openType = 2, leverage } = order;
  const normSymbol = toMexcSymbol(symbol);
  const mexcPayload = { symbol: normSymbol, price, vol, side, type, openType, leverage };
  const result = await placeMexcOrder(mexcPayload);
  return {
    orderId: result?.data,
    symbol: normSymbol,
    raw: result,
  };
}

/**
 * Hủy 1 lệnh — MEXC nhận list orderId
 */
export async function cancelOrder(symbol, orderId) {
  // MEXC endpoint này dường như không yêu cầu symbol, nhưng nếu có thể, vẫn truyền list
  return await callMexcPrivateApi('/api/v1/private/order/cancel', 'POST', [orderId]);
}

/**
 * Hủy tất cả lệnh đang chờ của symbol
 */
export async function cancelAllOrders(symbol) {
  return await callMexcPrivateApi('/api/v1/private/order/cancel_all', 'POST', { symbol: toMexcSymbol(symbol) });
}

/**
 * Lấy danh sách lệnh đang chờ khớp
 */
export async function getOpenOrders(symbol) {
  const normSymbol = toMexcSymbol(symbol);
  const params = normSymbol ? `?symbol=${normSymbol}` : '';
  const response = await callMexcPrivateApi(`/api/v1/private/order/list/open_orders${params}`, 'GET');
  return response.data || [];
}

/**
 * Truy vấn trạng thái 1 lệnh — chuẩn hoá output thành { order: { orderId, status } }
 */
export async function getOrderStatus(symbol, orderId) {
  const response = await callMexcPrivateApi(`/api/v1/private/order/get/${orderId}`, 'GET');
  return normalizeMexcOrderStatus(response.data);
}

/**
 * Lấy tick size của symbol
 */
export async function getSymbolTickSize(symbol) {
  const normSymbol = toMexcSymbol(symbol);
  try {
    const symbolInfo = await getMexcSymbolInfo(normSymbol);
    return parseFloat(symbolInfo.priceUnit || 0);
  } catch (error) {
    console.warn(`Lỗi khi lấy tick size cho ${normSymbol} từ MEXC, dùng mặc định 0.0001:`, error.message);
    return 0.0001;
  }
}

/**
 * Kiểm tra symbol có tồn tại trên sàn không
 * @returns {Promise<{ exists: boolean, symbol: string, info: any }>}
 */
export async function checkContractSymbol(symbol) {
  const normSymbol = toMexcSymbol(symbol);
  try {
    const info = await getMexcSymbolInfo(normSymbol);
    return { exists: info !== null && info !== undefined, symbol: normSymbol, info };
  } catch {
    return { exists: false, symbol: normSymbol, info: null };
  }
}

/**
 * Đặt lệnh Stop Market (Stop Loss) qua planorder của MEXC
 * Input: { symbol, side (BUY/SELL), vol, stopPrice, positionSide }
 */
export async function placeStopOrder(order = {}) {
  const { symbol, side, vol, stopPrice, positionSide } = order;
  const normSymbol = toMexcSymbol(symbol);
  // MEXC: side 1=open long, 2=close short, 3=open short, 4=close long
  // Để close short (SL cho lệnh short) → side = 4 nếu positionSide LONG, ngược lại
  const mexcSide = (positionSide === 'SHORT' || side === 'BUY') ? 4 : 2;
  const payload = {
    symbol: normSymbol,
    vol,
    side: mexcSide,
    type: 5,           // Market order
    openType: 2,       // Cross margin
    triggerPrice: stopPrice,
    triggerType: 1,    // 1 = >= (giá tăng lên stopPrice thì kích hoạt, dùng cho SL short)
    executeCycle: 1,   // Không hết hạn
  };
  const result = await placeMexcPlanOrder(payload);
  return {
    orderId: result?.data,
    symbol: normSymbol,
    raw: result,
  };
}

/**
 * Lấy lịch sử lệnh
 */
export async function getOrderHistory(symbol, limit = 50) {
  return getMexcOrderHistory(toMexcSymbol(symbol), limit);
}
