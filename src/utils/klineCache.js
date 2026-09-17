import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

const cacheFile = path.join(config.dataDir || './data', 'kline_cache.json');
const memoryCache = new Map();
const inFlightRequests = new Map();
let loaded = false;
let writeTimer = null;

const intervalSecondsMap = {
  Min1: 60, Min5: 300, Min15: 900, Min30: 1800, Min60: 3600,
  Hour1: 3600, Hour4: 14400, Hour8: 28800, Day1: 86400,
  Week1: 604800, Month1: 2592000,
};

function intervalSeconds(interval) {
  return intervalSecondsMap[interval] || 86400;
}

function normalizeSymbol(symbol) {
  return String(symbol || '').trim().toUpperCase();
}

function cacheKey(symbol, interval) {
  return `${normalizeSymbol(symbol)}|${interval}`;
}

function toSeconds(time) {
  const value = Number(time);
  return value > 100000000000 ? Math.floor(value / 1000) : value;
}

function bucketFor(timeSeconds, timeframe) {
  return Math.floor(timeSeconds / intervalSeconds(timeframe));
}

function cloneData(data) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [
    key,
    Array.isArray(value) ? [...value] : value,
  ]));
}

function normalizeData(data) {
  const times = Array.isArray(data?.time) ? data.time : [];
  const fields = ['open', 'high', 'low', 'close', 'vol', 'amount'];
  if (!times.length || !Array.isArray(data.close)) return null;

  const candles = times.map((time, index) => ({
    time,
    open: data.open?.[index],
    high: data.high?.[index],
    low: data.low?.[index],
    close: data.close[index],
    vol: data.vol?.[index],
    amount: data.amount?.[index],
  })).filter(candle => Number.isFinite(Number(candle.time)) && Number.isFinite(Number(candle.close)));

  candles.sort((a, b) => Number(a.time) - Number(b.time));
  return {
    time: candles.map(c => c.time),
    ...Object.fromEntries(fields.slice(0, 3).map(field => [field, candles.map(c => c[field])])),
    close: candles.map(c => c.close),
    vol: candles.map(c => c.vol),
    amount: candles.map(c => c.amount),
  };
}

function mergeData(existing, incoming, maxLength) {
  const merged = new Map();
  for (const data of [existing, incoming]) {
    if (!data?.time) continue;
    data.time.forEach((time, index) => merged.set(String(time), {
      time, open: data.open?.[index], high: data.high?.[index], low: data.low?.[index],
      close: data.close?.[index], vol: data.vol?.[index], amount: data.amount?.[index],
    }));
  }
  const candles = [...merged.values()]
    .filter(c => Number.isFinite(Number(c.time)) && Number.isFinite(Number(c.close)))
    .sort((a, b) => Number(a.time) - Number(b.time))
    .slice(-maxLength);
  return normalizeData({
    time: candles.map(c => c.time), open: candles.map(c => c.open), high: candles.map(c => c.high),
    low: candles.map(c => c.low), close: candles.map(c => c.close), vol: candles.map(c => c.vol),
    amount: candles.map(c => c.amount),
  });
}

function scheduleWrite() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    try {
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      const payload = Object.fromEntries(memoryCache.entries());
      const tempFile = `${cacheFile}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(payload), 'utf8');
      fs.renameSync(tempFile, cacheFile);
    } catch (error) {
      console.warn('⚠️ Không ghi được Kline cache:', error.message);
    }
  }, Math.max(0, config.klineCacheWriteDebounceMs || 750));
}

function loadOnce() {
  if (loaded) return;
  loaded = true;
  try {
    if (!fs.existsSync(cacheFile)) return;
    const payload = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    Object.entries(payload || {}).forEach(([key, entry]) => {
      if (entry?.data && entry.lastFetchedAt) memoryCache.set(key, entry);
    });
  } catch (error) {
    console.warn('⚠️ Không đọc được Kline cache:', error.message);
  }
}

function isRateLimitError(error) {
  return /510|rate.?limit|too frequent|requests are too frequent|429/i.test(error?.message || '');
}

function applyLivePrice(data, timeframe, livePrice) {
  const price = Number(livePrice);
  if (!Number.isFinite(price) || price <= 0 || !data?.time?.length) return data;

  const result = cloneData(data);
  const seconds = intervalSeconds(timeframe);
  const now = Math.floor(Date.now() / 1000);
  const currentBucket = bucketFor(now, timeframe);
  const lastIndex = result.time.length - 1;
  const lastBucket = bucketFor(toSeconds(result.time[lastIndex]), timeframe);

  if (lastBucket === currentBucket) {
    result.close[lastIndex] = price;
    return result;
  }

  // Một số response chỉ trả nến đã đóng; tạo live view tạm thời nhưng không lưu vào cache gốc.
  const previousClose = Number(result.close[lastIndex]);
  result.time.push(currentBucket * seconds);
  result.open.push(previousClose);
  result.high.push(Math.max(previousClose, price));
  result.low.push(Math.min(previousClose, price));
  result.close.push(price);
  result.vol.push(0);
  result.amount.push(0);
  return result;
}

export async function getCachedKlineData({ symbol, timeframe, limit, fetchRemote, livePrice, includeLiveCandle = false }) {
  if (config.klineCacheEnabled === false) {
    const fresh = await fetchRemote(limit);
    return includeLiveCandle ? applyLivePrice(fresh, timeframe, livePrice) : fresh;
  }

  loadOnce();
  const key = cacheKey(symbol, timeframe);
  const now = Math.floor(Date.now() / 1000);
  const requestedLimit = Math.max(1, Number(limit) || 200);
  const currentBucket = bucketFor(now, timeframe);
  let entry = memoryCache.get(key);
  const needsInitialFetch = !entry?.data;
  const needsRefresh = entry && entry.lastFetchedBucket !== currentBucket;
  // Nếu caller mới yêu cầu lịch sử dài hơn, chỉ mở rộng một lần; không lặp lại
  // request trong cùng bucket đối với token mới có ít nến hơn yêu cầu.
  const needsLargerHistory = entry && entry.data.time.length < requestedLimit
    && (entry.requestedLimit || 0) < requestedLimit;

  if (needsInitialFetch || needsRefresh || needsLargerHistory) {
    const requestLimit = needsInitialFetch || needsLargerHistory
      ? Math.max(requestedLimit, entry?.requestedLimit || 0)
      : 2;
    let request;
    if (inFlightRequests.has(key)) {
      request = inFlightRequests.get(key);
    } else {
      request = fetchRemote(requestLimit).then(remoteData => {
        const normalized = normalizeData(remoteData);
        if (!normalized) throw new Error(`Dữ liệu Kline không hợp lệ cho ${symbol}`);
        const retainedLimit = Math.max(requestedLimit, entry?.requestedLimit || 0);
        entry = {
          data: mergeData(entry?.data, normalized, retainedLimit),
          requestedLimit: retainedLimit,
          lastFetchedAt: Date.now(),
          lastFetchedBucket: currentBucket,
        };
        memoryCache.set(key, entry);
        scheduleWrite();
        return entry.data;
      }).finally(() => inFlightRequests.delete(key));
      inFlightRequests.set(key, request);
    }

    try {
      await request;
      // Request có thể được tạo bởi caller khác; đọc lại entry mới nhất từ RAM.
      entry = memoryCache.get(key);
    } catch (error) {
      entry = memoryCache.get(key) || entry;
      if (!entry?.data || !config.klineCacheStaleOnRateLimit || !isRateLimitError(error)) throw error;
      // Đánh dấu đã thử đủ lịch sử trong bucket này để tránh retry liên tục
      // với token mới niêm yết chỉ có ít candle hơn yêu cầu.
      entry.requestedLimit = Math.max(entry.requestedLimit || 0, requestedLimit);
      console.warn(`⚠️ MEXC rate limit: dùng Kline cache cũ cho ${symbol} (${timeframe})`);
    }
  }

  if (!entry?.data) throw new Error(`Không có Kline cache cho ${symbol} (${timeframe})`);
  const result = {
    ...cloneData(entry.data),
    time: entry.data.time.slice(-requestedLimit),
    open: entry.data.open.slice(-requestedLimit),
    high: entry.data.high.slice(-requestedLimit),
    low: entry.data.low.slice(-requestedLimit),
    close: entry.data.close.slice(-requestedLimit),
    vol: entry.data.vol.slice(-requestedLimit),
    amount: entry.data.amount.slice(-requestedLimit),
  };
  return includeLiveCandle ? applyLivePrice(result, timeframe, livePrice) : result;
}

export function resetKlineCacheForTests() {
  memoryCache.clear();
  inFlightRequests.clear();
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  loaded = true;
}
