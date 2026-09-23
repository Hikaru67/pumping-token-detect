const DAY_SECONDS = 24 * 60 * 60;
const THREE_DAY_SECONDS = 3 * DAY_SECONDS;
const WEEK_SECONDS = 7 * DAY_SECONDS;

function toSeconds(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric > 100000000000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
}

function finitePositive(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function finiteOrZero(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function combineRows(rows, time, livePrice = null) {
  const priceValues = rows.flatMap(row => [row.high, row.low]);
  if (livePrice !== null) priceValues.push(livePrice);

  const firstRow = rows[0];
  const lastRow = rows.at(-1);
  const fallbackPrice = livePrice ?? lastRow?.close ?? firstRow?.open ?? null;

  return {
    time,
    open: firstRow?.open ?? fallbackPrice,
    high: priceValues.length > 0 ? Math.max(...priceValues) : fallbackPrice,
    low: priceValues.length > 0 ? Math.min(...priceValues) : fallbackPrice,
    close: livePrice ?? lastRow?.close ?? fallbackPrice,
    vol: rows.reduce((sum, row) => sum + row.vol, 0),
    amount: rows.reduce((sum, row) => sum + row.amount, 0),
  };
}

/**
 * Aggregate daily MEXC klines into complete UTC 3-day candles and an optional
 * provisional candle closed at livePrice. The input arrays are never mutated.
 */
export function aggregateDailyKlinesTo3D(klineData, { nowMs = Date.now(), livePrice } = {}) {
  const rowsByDay = new Map();
  const times = Array.isArray(klineData?.time) ? klineData.time : [];

  for (let index = 0; index < times.length; index += 1) {
    const time = toSeconds(times[index]);
    const open = finitePositive(klineData?.open?.[index]);
    const high = finitePositive(klineData?.high?.[index]);
    const low = finitePositive(klineData?.low?.[index]);
    const close = finitePositive(klineData?.close?.[index]);
    if (time === null || open === null || high === null || low === null || close === null) continue;

    const dayIndex = Math.floor(time / DAY_SECONDS);
    const row = {
      time,
      dayIndex,
      open,
      high,
      low,
      close,
      vol: finiteOrZero(klineData?.vol?.[index]),
      amount: finiteOrZero(klineData?.amount?.[index]),
    };

    const currentForDay = rowsByDay.get(dayIndex);
    if (!currentForDay || currentForDay.time <= row.time) rowsByDay.set(dayIndex, row);
  }

  const nowSeconds = Math.floor(Number(nowMs) / 1000);
  const currentDayIndex = Math.floor(nowSeconds / DAY_SECONDS);
  const currentBucketIndex = Math.floor(currentDayIndex / 3);
  const bucketRows = new Map();

  for (const row of rowsByDay.values()) {
    const bucketIndex = Math.floor(row.dayIndex / 3);
    if (!bucketRows.has(bucketIndex)) bucketRows.set(bucketIndex, []);
    bucketRows.get(bucketIndex).push(row);
  }

  for (const rows of bucketRows.values()) rows.sort((left, right) => left.dayIndex - right.dayIndex);

  const closedCandles = [];
  for (const [bucketIndex, rows] of bucketRows.entries()) {
    if (bucketIndex >= currentBucketIndex) continue;

    const firstDayIndex = bucketIndex * 3;
    const expectedDays = [firstDayIndex, firstDayIndex + 1, firstDayIndex + 2];
    if (!expectedDays.every((dayIndex, index) => rows[index]?.dayIndex === dayIndex)) continue;
    if (rows.length !== 3) continue;

    closedCandles.push(combineRows(rows, firstDayIndex * DAY_SECONDS));
  }
  closedCandles.sort((left, right) => left.time - right.time);

  const numericLivePrice = finitePositive(livePrice);
  let liveCandle = null;
  if (numericLivePrice !== null) {
    const currentRows = bucketRows.get(currentBucketIndex) || [];
    liveCandle = combineRows(
      currentRows,
      currentBucketIndex * THREE_DAY_SECONDS,
      numericLivePrice,
    );
  }

  return {
    closedCandles,
    liveCandle,
    candles: liveCandle ? [...closedCandles, liveCandle] : closedCandles,
  };
}

/**
 * Build a Week1 RSI close series without assuming the exchange's week-start
 * weekday. A weekly candle is closed when its own open timestamp plus seven
 * days is no later than now; a live ticker price represents the current week.
 */
export function buildWeeklyRsiCloses(klineData, { nowMs = Date.now(), livePrice } = {}) {
  const closes = [];
  const times = Array.isArray(klineData?.time) ? klineData.time : [];
  const values = Array.isArray(klineData?.close) ? klineData.close : [];
  const nowSeconds = Math.floor(Number(nowMs) / 1000);

  for (let index = 0; index < Math.min(times.length, values.length); index += 1) {
    const openTime = toSeconds(times[index]);
    const close = finitePositive(values[index]);
    if (openTime === null || close === null) continue;
    if (openTime + WEEK_SECONDS <= nowSeconds) closes.push(close);
  }

  const numericLivePrice = finitePositive(livePrice);
  if (numericLivePrice !== null) closes.push(numericLivePrice);
  return closes;
}
