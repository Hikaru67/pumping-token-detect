import { config } from '../config.js';
import { checkAllStrategies } from './strategyChecker.js';
import {
  checkPreTradeConditions,
  getAccountBalance,
  calculateEntryVolume,
  placeShortOrder,
} from './tradingService.js';
import { countSuperOverboughtRSI } from '../utils/dataProcessor.js';
import { getBaseSymbol } from '../utils/symbolUtils.js';
import { sendAutoTradeNotification } from '../telegram/telegramBot.js';

// Lưu trữ các lệnh đã vào để tránh vào lệnh trùng lặp
const executedOrders = new Map(); // key: symbol, value: { timestamp, strategy, volume }

/**
 * Kiểm tra xem đã vào lệnh cho symbol này chưa (trong vòng 1 giờ)
 * @param {string} symbol - Symbol
 * @returns {boolean} true nếu đã vào lệnh gần đây
 */
function hasRecentOrder(symbol) {
  const baseSymbol = getBaseSymbol(symbol);
  const order = executedOrders.get(baseSymbol);
  
  if (!order) {
    return false;
  }
  
  // Kiểm tra nếu lệnh đã vào trong vòng 1 giờ
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  if (order.timestamp < oneHourAgo) {
    // Xóa lệnh cũ
    executedOrders.delete(baseSymbol);
    return false;
  }
  
  return true;
}

/**
 * Lưu lệnh đã thực hiện
 * @param {string} symbol - Symbol
 * @param {number} strategy - Chiến thuật (1, 2, hoặc 3)
 * @param {number} volume - Volume đã vào
 */
function saveExecutedOrder(symbol, strategy, volume) {
  const baseSymbol = getBaseSymbol(symbol);
  executedOrders.set(baseSymbol, {
    timestamp: Date.now(),
    strategy,
    volume,
  });
}

/**
 * Kiểm tra và vào lệnh cho một token khi có tín hiệu super overbought
 * @param {Object} token - Token object có RSI data
 * @returns {Promise<Object>} { executed: boolean, reason: string, orderResult: Object|null }
 */
export async function checkAndExecuteTrade(token) {
  // Kiểm tra trading có được bật không
  if (!config.tradingEnabled) {
    return {
      executed: false,
      reason: 'Trading chưa được bật (TRADING_ENABLED=false)',
      orderResult: null,
    };
  }
  
  // Kiểm tra token có RSI data không
  if (!token || !token.rsi || typeof token.rsi !== 'object') {
    return {
      executed: false,
      reason: 'Token không có RSI data',
      orderResult: null,
    };
  }
  
  // Kiểm tra có RSI super overbought không (ít nhất 1 RSI >= 90)
  const superOverboughtCount = countSuperOverboughtRSI(token.rsi);
  if (superOverboughtCount === 0) {
    return {
      executed: false,
      reason: 'Không có RSI super overbought',
      orderResult: null,
    };
  }
  
  console.log(`\n🔍 [${token.symbol}] Kiểm tra trading trigger (${superOverboughtCount} RSI super overbought)...`);
  
  // Kiểm tra đã vào lệnh gần đây chưa
  if (hasRecentOrder(token.symbol)) {
    return {
      executed: false,
      reason: 'Đã vào lệnh cho symbol này trong vòng 1 giờ gần đây',
      orderResult: null,
    };
  }
  
  // Kiểm tra các điều kiện trước khi vào lệnh
  const preTradeCheck = await checkPreTradeConditions(
    token,
    config.tradingFundingRateThreshold,
    config.tradingPumpThreshold
  );
  
  if (!preTradeCheck.canTrade) {
    console.log(`   ⏭️  [${token.symbol}] Bỏ qua: ${preTradeCheck.reason}`);
    return {
      executed: false,
      reason: preTradeCheck.reason,
      orderResult: null,
      fundingRate: preTradeCheck.fundingRate,
    };
  }
  
  console.log(`   ✅ [${token.symbol}] Điều kiện trước vào lệnh OK (Funding rate: ${preTradeCheck.fundingRate ? (preTradeCheck.fundingRate * 100).toFixed(4) + '%' : 'N/A'})`);
  
  // Kiểm tra các chiến thuật
  const strategyResult = await checkAllStrategies(token);
  
  if (!strategyResult.strategy) {
    console.log(`   ⏭️  [${token.symbol}] Không có chiến thuật nào thỏa mãn: ${strategyResult.result.reason}`);
    return {
      executed: false,
      reason: strategyResult.result.reason,
      orderResult: null,
      fundingRate: preTradeCheck.fundingRate,
    };
  }
  
  console.log(`   🎯 [${token.symbol}] Chiến thuật ${strategyResult.strategy} thỏa mãn: ${strategyResult.result.reason}`);
  console.log(`   💰 [${token.symbol}] Volume vào lệnh: ${strategyResult.volumePercent}% tài khoản`);
  
  // Lấy số dư tài khoản
  const accountBalance = await getAccountBalance();
  if (accountBalance <= 0) {
    console.error(`   ❌ [${token.symbol}] Số dư tài khoản = 0`);
    return {
      executed: false,
      reason: 'Số dư tài khoản = 0',
      orderResult: null,
      fundingRate: preTradeCheck.fundingRate,
    };
  }
  
  console.log(`   💵 [${token.symbol}] Số dư tài khoản: ${accountBalance.toFixed(2)} USDT`);
  
  // Tính volume vào lệnh
  const entryVolume = calculateEntryVolume(
    accountBalance,
    strategyResult.volumePercent,
    config.tradingLeverage
  );
  
  if (entryVolume <= 0) {
    console.error(`   ❌ [${token.symbol}] Volume vào lệnh = 0`);
    return {
      executed: false,
      reason: 'Volume vào lệnh = 0',
      orderResult: null,
      fundingRate: preTradeCheck.fundingRate,
    };
  }
  
  console.log(`   📊 [${token.symbol}] Volume vào lệnh (sau đòn bẩy ${config.tradingLeverage}x): ${entryVolume.toFixed(8)}`);
  
  // Đặt lệnh SHORT
  const baseSymbol = getBaseSymbol(token.symbol);
  const orderResult = await placeShortOrder(
    baseSymbol,
    entryVolume,
    config.tradingLeverage
  );
  
  if (orderResult.success) {
    console.log(`   ✅ [${token.symbol}] Đã vào lệnh SHORT thành công!`);
    console.log(`      Order ID: ${orderResult.orderId}`);
    console.log(`      Symbol: ${orderResult.symbol}`);
    console.log(`      Volume: ${entryVolume.toFixed(8)}`);
    console.log(`      Leverage: ${config.tradingLeverage}x`);
    
    // Lưu lệnh đã thực hiện
    saveExecutedOrder(token.symbol, strategyResult.strategy, entryVolume);
    
    const tradeResult = {
      executed: true,
      reason: `Chiến thuật ${strategyResult.strategy}: ${strategyResult.result.reason}`,
      orderResult,
      fundingRate: preTradeCheck.fundingRate,
      strategy: strategyResult.strategy,
      volume: entryVolume,
    };
    
    // Gửi thông báo Telegram khi vào lệnh thành công (async, không block)
    sendAutoTradeNotification(tradeResult, token)
      .then(success => {
        if (success) {
          console.log(`   📨 [${token.symbol}] Đã gửi thông báo auto trade vào Telegram`);
        }
      })
      .catch(error => {
        console.warn(`   ⚠️  [${token.symbol}] Lỗi khi gửi thông báo auto trade:`, error.message);
      });
    
    return tradeResult;
  } else {
    console.error(`   ❌ [${token.symbol}] Lỗi khi vào lệnh: ${orderResult.error}`);
    return {
      executed: false,
      reason: `Lỗi khi vào lệnh: ${orderResult.error}`,
      orderResult,
      fundingRate: preTradeCheck.fundingRate,
    };
  }
}

/**
 * Reset executed orders (dùng cho testing)
 */
export function resetExecutedOrders() {
  executedOrders.clear();
}

