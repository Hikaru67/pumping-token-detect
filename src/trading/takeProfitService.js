import {
  placeBingxSwapOrder,
  getBingxOpenPositions,
  getBingxOpenOrders,
  cancelAllBingxOrders,
  getSymbolTickSize,
  getBingxUSDTBalance,
} from '../api/bingxService.js';
import { config } from '../config.js';
import { getBaseSymbol } from '../utils/symbolUtils.js';
import {
  sendTakeProfitNotification,
  sendBreakevenSLNotification,
  sendTakeProfitFilledNotification,
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
 *   tp1Price,       // Giá TP1
 *   tp2Price,       // Giá TP2
 *   tp3Price,       // Giá TP3
 *   tp1Filled,      // TP1 đã khớp chưa
 *   tp2Filled,      // TP2 đã khớp chưa
 *   tp3Filled,      // TP3 đã khớp chưa
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
 * TP_price = avgEntryPrice × (1 - dropRatio)
 *
 * @param {number} avgEntryPrice - Giá entry trung bình
 * @param {number} pumpPercent   - Pump % (0.50 = 50%)
 * @param {number|null} tickSize - tickSize của symbol (để làm tròn giá)
 * @returns {{ tp1Price, tp2Price, tp3Price }}
 */
export function calculateTPLevels(avgEntryPrice, pumpPercent, tickSize = null) {
  const absPump = Math.abs(pumpPercent);

  // Tỷ lệ drop tối đa cho phép là 99% (để tránh giá <= 0 khi pump > 100%)
  const maxDrop = 0.8;
  const dropRatio1 = Math.min(absPump * config.tpRatio1, maxDrop);
  const dropRatio2 = Math.min(absPump * config.tpRatio2, maxDrop);
  const dropRatio3 = Math.min(absPump * config.tpRatio3, maxDrop);

  const tp1Price = roundToTickSize(avgEntryPrice * (1 - dropRatio1), tickSize);
  const tp2Price = roundToTickSize(avgEntryPrice * (1 - dropRatio2), tickSize);
  const tp3Price = roundToTickSize(avgEntryPrice * (1 - dropRatio3), tickSize);

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

  const absPump = Math.abs(pumpPercent);
  const maxDrop = 0.8;
  const dropRatio1 = Math.min(absPump * config.tpRatio1, maxDrop);
  const dropRatio2 = Math.min(absPump * config.tpRatio2, maxDrop);
  const dropRatio3 = Math.min(absPump * config.tpRatio3, maxDrop);

  const { tp1Price, tp2Price, tp3Price } = calculateTPLevels(avgEntryPrice, pumpPercent, tickSize);
  const { qty1, qty2, qty3 } = calculateTPQuantities(totalQty);

  const balance = await getBingxUSDTBalance();
  const pnlPercent1 = balance > 0 ? (((avgEntryPrice - tp1Price) * qty1) / balance) * 100 : 0;
  const pnlPercent2 = balance > 0 ? (((avgEntryPrice - tp2Price) * qty2) / balance) * 100 : 0;
  const pnlPercent3 = balance > 0 ? (((avgEntryPrice - tp3Price) * qty3) / balance) * 100 : 0;

  console.log(`\n📐 [${symbol}] Tính mức TP (pump ${(pumpPercent * 100).toFixed(1)}%, entry ${avgEntryPrice}):`);
  console.log(`   TP1: ${(config.tpClosePercent1)}% qty (${qty1}) @ ${tp1Price} (profit ${(dropRatio1 * 100).toFixed(2)}% | PNL ~${pnlPercent1.toFixed(2)}% acc)`);
  console.log(`   TP2: ${(config.tpClosePercent2)}% qty (${qty2}) @ ${tp2Price} (profit ${(dropRatio2 * 100).toFixed(2)}% | PNL ~${pnlPercent2.toFixed(2)}% acc)`);
  console.log(`   TP3: ${(config.tpClosePercent3)}% qty (${qty3}) @ ${tp3Price} (profit ${(dropRatio3 * 100).toFixed(2)}% | PNL ~${pnlPercent3.toFixed(2)}% acc)`);

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
    tp1Price,
    tp2Price,
    tp3Price,
    tp1Filled: false,
    tp2Filled: false,
    tp3Filled: false,
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
      { level: 1, price: tp1Price, qty: qty1, profitPercent: dropRatio1 * 100, accountPnlPercent: pnlPercent1 },
      { level: 2, price: tp2Price, qty: qty2, profitPercent: dropRatio2 * 100, accountPnlPercent: pnlPercent2 },
      { level: 3, price: tp3Price, qty: qty3, profitPercent: dropRatio3 * 100, accountPnlPercent: pnlPercent3 },
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
      const { symbol, slPlaced } = state;

      // Đặt SL breakeven nếu TP1 đã khớp và SL chưa đặt
      if (state.tp1Filled && !slPlaced && config.tpBreakevenSlEnabled) {
        await placeBreakevenStopLoss(baseSymbol, state);
      }

      let openOrders = null;
      let ordersArr = null;
      let checkOpenOrdersFailed = false;

      // Lấy danh sách open orders 1 lần cho cả 3 mức TP để tiết kiệm API call
      try {
        openOrders = await getBingxOpenOrders(symbol);
        ordersArr = Array.isArray(openOrders) ? openOrders : (openOrders?.orders || []);
      } catch (err) {
        console.warn(`   ⚠️  [${baseSymbol}] Lỗi check open orders:`, err.message);
        checkOpenOrdersFailed = true;
      }

      if (checkOpenOrdersFailed) continue;

      // Duyệt qua các mức TP (1, 2, 3)
      for (let level = 1; level <= 3; level++) {
        const orderIdKey = `tp${level}OrderId`;
        const filledKey = `tp${level}Filled`;
        const priceKey = `tp${level}Price`;

        const tpOrderId = state[orderIdKey];
        const isFilled = state[filledKey];

        if (!isFilled && tpOrderId) {
          const tpStillOpen = ordersArr.some(o => String(o.orderId || o.id) === String(tpOrderId));

          if (!tpStillOpen) {
            // Lệnh không còn trong mảng open orders -> Lấy status cụ thể bằng API
            let isActuallyFilled = false;
            try {
              const { getBingxOrderStatus } = await import('../api/bingxService.js');
              const orderInfo = await getBingxOrderStatus(symbol, tpOrderId);
              const status = orderInfo?.order?.status || orderInfo?.status;

              if (status === 'FILLED') {
                isActuallyFilled = true;
              } else if (status === 'CANCELED' || status === 'FAILED' || status === 'REJECTED') {
                console.log(`   ℹ️  [${baseSymbol}] TP${level} (ID ${tpOrderId}) bị huỷ/từ chối (status=${status})`);
                state[orderIdKey] = null; // Bỏ theo dõi TP này để khỏi check nữa
              } else if (!status) {
                console.warn(`   ⚠️  [${baseSymbol}] Không tìm thấy TP${level} status, đợi lấy lại...`);
              } else {
                console.log(`   ⏳ [${baseSymbol}] TP${level} (ID ${tpOrderId}) thực tế vẫn là ${status} nhưng chưa hiện trong list openOrders`);
              }
            } catch (err) {
              console.warn(`   ⚠️  [${baseSymbol}] Lỗi query status TP${level} (ID ${tpOrderId}):`, err.message);
            }

            if (isActuallyFilled) {
              console.log(`   ✅ [${baseSymbol}] Lệnh TP${level} đã khớp hoàn toàn (FILLED)!`);
              state[filledKey] = true;

              // Gửi báo cáo TP khớp qua vi-VN Telegram
              sendTakeProfitFilledNotification({
                symbol: baseSymbol,
                level,
                tpOrderId,
                price: state[priceKey]
              }).catch(err => console.warn(`⚠️ Lỗi gửi Telegram TP${level} filled:`, err.message));

              // Nếu là TP1 => trigger S/L
              if (level === 1 && config.tpBreakevenSlEnabled && !state.slPlaced) {
                await placeBreakevenStopLoss(baseSymbol, state);
              }
            }
          } else {
             console.log(`   ⏳ [${baseSymbol}] TP${level} chưa khớp (còn trong open orders)`);
          }
        }
      }

      // Check xem liệu vị thế (position) có còn sống không
      // Phòng trừ bị SL cán sạch lệnh hoặc ngắt lệnh tay
      const positions = await getBingxOpenPositions(symbol);
      const stillOpen = Array.isArray(positions)
        ? positions.some(p => p.symbol === symbol && p.positionSide === 'SHORT'
          && Math.abs(parseFloat(p.positionAmt || '0')) > 0)
        : false;

      // Nếu position đã huỷ hoàn toàn, hoặc tất cả TP đã khớp
      const allTpFilled = state.tp1Filled && state.tp2Filled && state.tp3Filled;

      if (!stillOpen || allTpFilled) {
        console.log(`   ℹ️  [${baseSymbol}] Position đã đóng hoàn toàn hoặc All TPs Filled, cleanup TP state`);
        tpStateMap.delete(baseSymbol);
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
