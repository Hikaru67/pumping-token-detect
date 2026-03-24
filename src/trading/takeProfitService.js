import {
  placeBingxSwapOrder,
  getBingxOpenPositions,
  getBingxOpenOrders,
  cancelAllBingxOrders,
  getSymbolTickSize,
} from '../api/bingxService.js';
import { config } from '../config.js';
import { getBaseSymbol } from '../utils/symbolUtils.js';
import {
  sendTakeProfitNotification,
  sendBreakevenSLNotification,
} from '../telegram/telegramBot.js';

/**
 * In-memory map theo dõi TP state của từng symbol SHORT đang mở
 * key: baseSymbol (ví dụ: BTC)
 * value: {
 *   symbol,         // BTC-USDT
 *   avgEntryPrice,  // Giá entry trung bình
 *   pumpPercent,    // Pump % tại thời điểm vào lệnh (0.50 = 50%)
 *   totalQty,       // Tổng số lượng token đang giữ
 *   tp1OrderId,     // Order ID lệnh TP1
 *   tp2OrderId,     // Order ID lệnh TP2
 *   tp3OrderId,     // Order ID lệnh TP3
 *   tp1Filled,      // TP1 đã khớp chưa
 *   slPlaced,       // SL breakeven đã đặt chưa
 *   slOrderId,      // Order ID SL
 * }
 */
const tpStateMap = new Map();

// Expose state map for testing
export function getTpStateMap() {
  return tpStateMap;
}

/**
 * Làm tròn giá theo tickSize
 * @param {number} price
 * @param {number|null} tickSize
 * @returns {number}
 */
export function roundToTickSize(price, tickSize) {
  if (!tickSize || tickSize <= 0) return parseFloat(price.toFixed(8));
  const rounded = Math.round(price / tickSize) * tickSize;
  // Số chữ số thập phân của tickSize
  const decimals = (tickSize.toString().split('.')[1] || '').length;
  return parseFloat(rounded.toFixed(decimals));
}

/**
 * Tính 3 mức giá TP dựa trên avg entry price và pump %
 * TP_price = avgEntryPrice × (1 - pumpPercent × tpRatio)
 *
 * @param {number} avgEntryPrice - Giá entry trung bình
 * @param {number} pumpPercent   - Pump % (0.50 = 50%)
 * @param {number|null} tickSize - tickSize của symbol (để làm tròn giá)
 * @returns {{ tp1Price, tp2Price, tp3Price }}
 */
export function calculateTPLevels(avgEntryPrice, pumpPercent, tickSize = null) {
  const absPump = Math.abs(pumpPercent);
  const tp1Price = roundToTickSize(avgEntryPrice * (1 - absPump * config.tpRatio1), tickSize);
  const tp2Price = roundToTickSize(avgEntryPrice * (1 - absPump * config.tpRatio2), tickSize);
  const tp3Price = roundToTickSize(avgEntryPrice * (1 - absPump * config.tpRatio3), tickSize);
  return { tp1Price, tp2Price, tp3Price };
}

/**
 * Tính quantity cần đóng ở mỗi TP level
 * @param {number} totalQty - Tổng qty hiện tại
 * @returns {{ qty1, qty2, qty3 }}
 */
function calculateTPQuantities(totalQty) {
  const qty1 = parseFloat((totalQty * config.tpClosePercent1 / 100).toFixed(6));
  const qty2 = parseFloat((totalQty * config.tpClosePercent2 / 100).toFixed(6));
  // qty3 = phần còn lại để tránh rounding error gây sót quantity
  const qty3 = parseFloat((totalQty - qty1 - qty2).toFixed(6));
  return { qty1, qty2, qty3 };
}

/**
 * Đặt 3 lệnh LIMIT BUY để take profit cho vị thế SHORT
 * @param {string} symbol         - Symbol (ví dụ: BTC-USDT)
 * @param {number} avgEntryPrice  - Giá entry trung bình
 * @param {number} totalQty       - Tổng qty đang giữ
 * @param {number} pumpPercent    - Pump % (0.50 = 50%)
 * @returns {Promise<{ success: boolean, orderIds: {...} }>}
 */
export async function placeTakeProfitOrders(symbol, avgEntryPrice, totalQty, pumpPercent) {
  const normalizedSymbol = symbol.includes('-') ? symbol.toUpperCase() : `${symbol.toUpperCase()}-USDT`;
  const baseSymbol = getBaseSymbol(symbol);

  const tickSize = await getSymbolTickSize(normalizedSymbol);
  const { tp1Price, tp2Price, tp3Price } = calculateTPLevels(avgEntryPrice, pumpPercent, tickSize);
  const { qty1, qty2, qty3 } = calculateTPQuantities(totalQty);

  console.log(`\n📐 [${symbol}] Tính mức TP (pump ${(pumpPercent * 100).toFixed(1)}%, entry ${avgEntryPrice}):`);
  console.log(`   TP1: ${(config.tpClosePercent1)}% qty (${qty1}) @ ${tp1Price} (profit ${(config.tpRatio1 * pumpPercent * 100).toFixed(2)}%)`);
  console.log(`   TP2: ${(config.tpClosePercent2)}% qty (${qty2}) @ ${tp2Price} (profit ${(config.tpRatio2 * pumpPercent * 100).toFixed(2)}%)`);
  console.log(`   TP3: ${(config.tpClosePercent3)}% qty (${qty3}) @ ${tp3Price} (profit ${(config.tpRatio3 * pumpPercent * 100).toFixed(2)}%)`);

  const levels = [
    { level: 1, price: tp1Price, qty: qty1 },
    { level: 2, price: tp2Price, qty: qty2 },
    { level: 3, price: tp3Price, qty: qty3 },
  ];

  const orderIds = { tp1OrderId: null, tp2OrderId: null, tp3OrderId: null };
  const keyMap = { 1: 'tp1OrderId', 2: 'tp2OrderId', 3: 'tp3OrderId' };

  for (const { level, price, qty } of levels) {
    if (qty <= 0) {
      console.warn(`   ⚠️  [${symbol}] TP${level} qty = 0, bỏ qua`);
      continue;
    }
    try {
      const result = await placeBingxSwapOrder({
        symbol: normalizedSymbol,
        side: 'BUY',          // Đóng SHORT bằng BUY
        type: 'LIMIT',
        quantity: qty.toString(),
        price: price.toString(),
        positionSide: 'SHORT',
      });
      const orderId = result?.order?.orderID || result?.order?.orderId || result?.orderId || result?.id;
      orderIds[keyMap[level]] = orderId;
      console.log(`   ✅ [${symbol}] Đặt TP${level} LIMIT BUY @ ${price} x ${qty} | orderId: ${orderId}`);
    } catch (err) {
      console.error(`   ❌ [${symbol}] Lỗi khi đặt TP${level}:`, err.message);
    }
  }

  // Lưu TP state
  tpStateMap.set(baseSymbol, {
    symbol: normalizedSymbol,
    avgEntryPrice,
    pumpPercent,
    totalQty,
    ...orderIds,
    tp1Filled: false,
    slPlaced: false,
    slOrderId: null,
  });

  // Gửi Telegram
  sendTakeProfitNotification({
    symbol,
    avgEntryPrice,
    pumpPercent,
    totalQty,
    levels: [
      { level: 1, price: tp1Price, qty: qty1, profitPercent: config.tpRatio1 * pumpPercent * 100 },
      { level: 2, price: tp2Price, qty: qty2, profitPercent: config.tpRatio2 * pumpPercent * 100 },
      { level: 3, price: tp3Price, qty: qty3, profitPercent: config.tpRatio3 * pumpPercent * 100 },
    ],
    isUpdate: false,
  }).catch(err => console.warn(`⚠️  [${symbol}] Lỗi gửi Telegram TP:`, err.message));

  return { success: true, orderIds };
}

/**
 * Cập nhật TP orders khi nhồi lệnh (avg entry price thay đổi)
 * 1. Cancel tất cả TP orders cũ
 * 2. Lấy avg entry price mới từ BingX
 * 3. Đặt TP orders mới
 *
 * @param {string} symbol      - Symbol (ví dụ: BTC-USDT)
 * @param {number} pumpPercent - Pump % mới nhất
 * @returns {Promise<void>}
 */
export async function updateTakeProfitOrders(symbol, pumpPercent) {
  const normalizedSymbol = symbol.includes('-') ? symbol.toUpperCase() : `${symbol.toUpperCase()}-USDT`;
  const baseSymbol = getBaseSymbol(symbol);

  console.log(`\n🔄 [${symbol}] Cập nhật TP orders (nhồi lệnh detected)...`);

  // 1. Cancel tất cả TP orders cũ của symbol
  try {
    await cancelAllBingxOrders(normalizedSymbol);
    console.log(`   ✅ [${symbol}] Đã cancel tất cả lệnh cũ`);
  } catch (err) {
    console.warn(`   ⚠️  [${symbol}] Lỗi cancel orders cũ: ${err.message}`);
  }

  // 2. Lấy avg entry price mới từ BingX position API
  let avgEntryPrice = null;
  let totalQty = null;
  try {
    const positions = await getBingxOpenPositions(normalizedSymbol);
    const shortPos = Array.isArray(positions)
      ? positions.find(p => p.symbol === normalizedSymbol && p.positionSide === 'SHORT')
      : null;

    if (shortPos) {
      avgEntryPrice = parseFloat(shortPos.avgPrice || shortPos.entryPrice || '0');
      // positionAmt là qty tuyệt đối (có thể âm cho SHORT)
      totalQty = Math.abs(parseFloat(shortPos.positionAmt || shortPos.positionVolume || '0'));
      console.log(`   📊 [${symbol}] Avg entry price mới: ${avgEntryPrice}, totalQty: ${totalQty}`);
    }
  } catch (err) {
    console.error(`   ❌ [${symbol}] Không lấy được position info:`, err.message);
  }

  if (!avgEntryPrice || avgEntryPrice <= 0 || !totalQty || totalQty <= 0) {
    console.warn(`   ⚠️  [${symbol}] Không có position hợp lệ, bỏ qua update TP`);
    tpStateMap.delete(baseSymbol);
    return;
  }

  // 3. Đặt TP mới với avg price và qty mới
  await placeTakeProfitOrders(symbol, avgEntryPrice, totalQty, pumpPercent);
  // Note: placeTakeProfitOrders gửi Telegram với isUpdate=false,
  // nhưng chúng ta cần override notifications nếu muốn
  const state = tpStateMap.get(baseSymbol);
  if (state) {
    // Mark là update để Telegram format đúng
    state._isUpdate = true;
  }
}

/**
 * Đặt lệnh Stop Loss tại entry price (breakeven) để bảo vệ lợi nhuận còn lại
 * Dùng STOP_MARKET (trigger = entry price, đóng ngay khi giá quay về entry)
 *
 * @param {string} baseSymbol  - Symbol base (ví dụ: BTC)
 * @param {Object} state       - TP state của symbol
 * @returns {Promise<void>}
 */
async function placeBreakevenStopLoss(baseSymbol, state) {
  const { symbol, avgEntryPrice } = state;
  console.log(`\n🛡️  [${baseSymbol}] Đặt Stop Loss tại entry price ${avgEntryPrice} (breakeven)...`);

  try {
    // Lấy qty hiện tại của position để đặt SL cho đúng số lượng còn lại
    const positions = await getBingxOpenPositions(symbol);
    const shortPos = Array.isArray(positions)
      ? positions.find(p => p.symbol === symbol && p.positionSide === 'SHORT')
      : null;

    if (!shortPos) {
      console.log(`   ℹ️  [${baseSymbol}] Không còn position, bỏ qua đặt SL`);
      tpStateMap.delete(baseSymbol);
      return;
    }

    const remainingQty = Math.abs(parseFloat(shortPos.positionAmt || shortPos.positionVolume || '0'));
    if (remainingQty <= 0) {
      console.log(`   ℹ️  [${baseSymbol}] Quantity = 0, position đã đóng hết`);
      tpStateMap.delete(baseSymbol);
      return;
    }

    // Đặt STOP_MARKET để đóng SHORT khi giá quay lên entry (khoá lời)
    const result = await placeBingxSwapOrder({
      symbol: symbol,
      side: 'BUY',
      type: 'STOP_MARKET',
      quantity: remainingQty.toString(),
      stopPrice: avgEntryPrice.toString(),
      positionSide: 'SHORT',
    });

    const slOrderId = result?.orderId || result?.id;
    state.slPlaced = true;
    state.slOrderId = slOrderId;
    console.log(`   ✅ [${baseSymbol}] Đặt SL breakeven @ ${avgEntryPrice} thành công | orderId: ${slOrderId}`);

    // Gửi Telegram notification
    sendBreakevenSLNotification({
      symbol: baseSymbol,
      entryPrice: avgEntryPrice,
      remainingQty,
      slOrderId,
    }).catch(err => console.warn(`⚠️  Lỗi gửi Telegram SL breakeven:`, err.message));

  } catch (err) {
    console.error(`   ❌ [${baseSymbol}] Lỗi khi đặt SL breakeven:`, err.message);
  }
}

/**
 * Monitor: kiểm tra TP1 fill status và đặt SL breakeven nếu cần
 * Được gọi bởi TP scheduler mỗi interval
 */
export async function checkTPState() {
  if (tpStateMap.size === 0) return;

  console.log(`\n🕐 [TP Monitor] Đang check ${tpStateMap.size} position(s)...`);

  for (const [baseSymbol, state] of tpStateMap.entries()) {
    try {
      const { symbol, tp1Filled, slPlaced, tp1OrderId } = state;

      // Nếu TP1 đã fill và SL chưa đặt → đặt SL breakeven
      if (tp1Filled && !slPlaced && config.tpBreakevenSlEnabled) {
        await placeBreakevenStopLoss(baseSymbol, state);
        continue;
      }

      // Nếu TP1 chưa fill → check bằng open orders
      if (!tp1Filled && tp1OrderId) {
        let tp1StillOpen = false;
        try {
          const openOrders = await getBingxOpenOrders(symbol);
          const ordersArr = Array.isArray(openOrders) ? openOrders : (openOrders?.orders || []);
          tp1StillOpen = ordersArr.some(o => String(o.orderId || o.id) === String(tp1OrderId));
        } catch (err) {
          console.warn(`   ⚠️  [${baseSymbol}] Lỗi check open orders:`, err.message);
          continue;
        }

        if (!tp1StillOpen) {
          // TP1 không còn trong open orders → đã fill (hoặc bị cancel)
          // Kiểm tra position còn mở không để phân biệt fill vs cancel
          const positions = await getBingxOpenPositions(symbol);
          const stillOpen = Array.isArray(positions)
            ? positions.some(p => p.symbol === symbol && p.positionSide === 'SHORT'
                && Math.abs(parseFloat(p.positionAmt || '0')) > 0)
            : false;

          if (stillOpen) {
            console.log(`   ✅ [${baseSymbol}] TP1 đã khớp! Sẽ đặt SL breakeven...`);
            state.tp1Filled = true;
            if (config.tpBreakevenSlEnabled) {
              await placeBreakevenStopLoss(baseSymbol, state);
            }
          } else {
            // Position đóng hết rồi → cleanup
            console.log(`   ℹ️  [${baseSymbol}] Position đã đóng hoàn toàn, cleanup TP state`);
            tpStateMap.delete(baseSymbol);
          }
        } else {
          console.log(`   ⏳ [${baseSymbol}] TP1 chưa khớp (còn trong open orders)`);
        }
      } else if (!tp1OrderId) {
        // Không có TP1 order ID → kiểm tra position còn sống không
        const positions = await getBingxOpenPositions(symbol);
        const stillOpen = Array.isArray(positions)
          ? positions.some(p => p.symbol === symbol && p.positionSide === 'SHORT'
              && Math.abs(parseFloat(p.positionAmt || '0')) > 0)
          : false;
        if (!stillOpen) {
          tpStateMap.delete(baseSymbol);
        }
      }
    } catch (err) {
      console.warn(`   ⚠️  [${baseSymbol}] Lỗi trong TP monitor:`, err.message);
    }
  }
}

/**
 * Lấy TP state của một symbol (để confirm có TP hay không trước khi update)
 * @param {string} symbol
 * @returns {Object|undefined}
 */
export function getTPState(symbol) {
  return tpStateMap.get(getBaseSymbol(symbol));
}

/**
 * Xóa TP state của một symbol (dùng cho testing hoặc manual cleanup)
 * @param {string} symbol
 */
export function clearTPState(symbol) {
  tpStateMap.delete(getBaseSymbol(symbol));
}
