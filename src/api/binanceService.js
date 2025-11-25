import axios from 'axios';
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


