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
import { logTradeHistory } from './tradeLogger.js';

// Lưu trữ các lệnh đã vào để tránh vào lệnh trùng lặp
const executedOrders = new Map(); // key: symbol, value: { timestamp, strategy, volume }

/**
/**
 * Kiểm tra xem đã vào lệnh cho symbol này chưa (trong vòng 1 giờ)
 * @param {string} symbol - Symbol
 * @param {number} strategy - Chiến thuật đang xét
 * @returns {boolean} true nếu đã vào lệnh gần đây
 */
function hasRecentOrder(symbol, strategy) {
  // Bỏ qua block lệnh 1 giờ nếu đang thực hiện Chiến thuật 4 (nhồi lệnh)
  if (strategy === 4) {
    return false;
  }

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
    logTradeHistory(token ? token.symbol : 'UNKNOWN', 'Trading chưa được bật (TRADING_ENABLED=false)');
    return {
      executed: false,
      reason: 'Trading chưa được bật (TRADING_ENABLED=false)',
      orderResult: null,
    };
  }

  // Kiểm tra token có RSI data không
  if (!token || !token.rsi || typeof token.rsi !== 'object') {
    logTradeHistory(token ? token.symbol : 'UNKNOWN', 'Token không có RSI data');
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

  // Kiểm tra giá pump có đạt ngưỡng tối thiểu không (rule toàn cục)
  const pumpPercent = token.riseFallRate ? (token.riseFallRate * 100) : 0;
  if (pumpPercent < config.tradingPumpThreshold) {
    console.log(`   ⏭️  [${token.symbol}] Bỏ qua: Biên độ dao động giá (${pumpPercent.toFixed(2)}%) < ngưỡng quy định toàn cục (${config.tradingPumpThreshold}%)`);
    logTradeHistory(token.symbol, `Bỏ qua: Biên độ giá (${pumpPercent.toFixed(2)}%) < ${config.tradingPumpThreshold}%`, { pumpPercent });
    return {
      executed: false,
      reason: `Biên độ giá (${pumpPercent.toFixed(2)}%) < ${config.tradingPumpThreshold}%`,
      orderResult: null,
    };
  }

  // Kiểm tra các chiến thuật trước (để lấy strategy id)
  const strategyResult = await checkAllStrategies(token);

  if (!strategyResult.strategy) {
    console.log(`   ⏭️  [${token.symbol}] Không có chiến thuật nào thỏa mãn: ${strategyResult.result.reason}`);
    logTradeHistory(token.symbol, `Không có chiến thuật nào thỏa mãn: ${strategyResult.result.reason}`);
    return {
      executed: false,
      reason: strategyResult.result.reason,
      orderResult: null,
    };
  }

  console.log(`   🎯 [${token.symbol}] Chiến thuật ${strategyResult.strategy} thỏa mãn: ${strategyResult.result.reason}`);
  console.log(`   💰 [${token.symbol}] Volume mục tiêu: ${strategyResult.volumePercent}% tài khoản`);

  // Kiểm tra đã vào lệnh gần đây chưa
  if (hasRecentOrder(token.symbol, strategyResult.strategy)) {
    logTradeHistory(token.symbol, 'Đã vào lệnh cho symbol này trong vòng 1 giờ gần đây', { strategy: strategyResult.strategy });
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
    logTradeHistory(token.symbol, `Bỏ qua điều kiện pre-trade: ${preTradeCheck.reason}`, { fundingRate: preTradeCheck.fundingRate });
    return {
      executed: false,
      reason: preTradeCheck.reason,
      orderResult: null,
      fundingRate: preTradeCheck.fundingRate,
    };
  }

  console.log(`   ✅ [${token.symbol}] Điều kiện trước vào lệnh OK (Funding rate: ${preTradeCheck.fundingRate ? (preTradeCheck.fundingRate * 100).toFixed(4) + '%' : 'N/A'})`);

  console.log(`   ✅ [${token.symbol}] Điều kiện trước vào lệnh OK (Funding rate: ${preTradeCheck.fundingRate ? (preTradeCheck.fundingRate * 100).toFixed(4) + '%' : 'N/A'})`);

  // Lấy số dư tài khoản
  const accountBalance = await getAccountBalance();
  if (accountBalance <= 0) {
    console.error(`   ❌ [${token.symbol}] Số dư tài khoản = 0`);
    logTradeHistory(token.symbol, 'Số dư tài khoản = 0');
    return {
      executed: false,
      reason: 'Số dư tài khoản = 0',
      orderResult: null,
      fundingRate: preTradeCheck.fundingRate,
    };
  }

  console.log(`   💵 [${token.symbol}] Số dư tài khoản: ${accountBalance.toFixed(2)} USDT`);

  console.log(`   💵 [${token.symbol}] Số dư tài khoản: ${accountBalance.toFixed(2)} USDT`);

  // Tính volume vào lệnh mục tiêu
  const targetEntryVolume = calculateEntryVolume(
    accountBalance,
    strategyResult.volumePercent,
    config.tradingLeverage
  );

  let finalEntryVolume = targetEntryVolume;

  // Cập nhật logic nhồi lệnh (Strategy 4)
  if (strategyResult.strategy === 4) {
    const _baseSymbol = getBaseSymbol(token.symbol);
    const { getOpenPositionVolume } = await import('./tradingService.js');
    const currentOpenVol = await getOpenPositionVolume(_baseSymbol);

    if (currentOpenVol > 0) {
      console.log(`   📈 [${token.symbol}] [Strategy 4] Vị thế SHORT hiện tại: ${currentOpenVol}`);
      finalEntryVolume = targetEntryVolume - currentOpenVol;

      // Safety check (Nếu volume hiện tại đã vượt volume max mục tiêu thì báo ko vào)
      if (finalEntryVolume <= 0) {
        console.log(`   ⏭️  [${token.symbol}] [Strategy 4] Bỏ qua: Volume mở (${currentOpenVol}) đã đạt khối lượng của hệ thống quy định (${targetEntryVolume})`);
        logTradeHistory(token.symbol, 'Strategy 4: Đã đạt full volume theo quy định', { currentOpenVol, targetEntryVolume });
        return {
          executed: false,
          reason: 'Đã đạt full volume theo quy định',
          orderResult: null,
          fundingRate: preTradeCheck.fundingRate,
        };
      }
    }
  }

  if (finalEntryVolume <= 0) {
    console.error(`   ❌ [${token.symbol}] Volume vào lệnh = 0`);
    logTradeHistory(token.symbol, 'Volume vào lệnh = 0');
    return {
      executed: false,
      reason: 'Volume vào lệnh = 0',
      orderResult: null,
      fundingRate: preTradeCheck.fundingRate,
    };
  }

  console.log(`   📊 [${token.symbol}] Volume vào lệnh (sau đòn bẩy ${config.tradingLeverage}x): ${finalEntryVolume.toFixed(8)}`);

  // Đặt lệnh SHORT
  const baseSymbol = getBaseSymbol(token.symbol);
  const orderResult = await placeShortOrder(
    baseSymbol,
    finalEntryVolume,
    config.tradingLeverage
  );

  if (orderResult.success) {
    console.log(`   ✅ [${token.symbol}] Đã vào lệnh SHORT thành công!`);
    console.log(`      Order ID: ${orderResult.orderId}`);
    console.log(`      Symbol: ${orderResult.symbol}`);
    console.log(`      Volume: ${finalEntryVolume.toFixed(8)}`);
    console.log(`      Leverage: ${config.tradingLeverage}x`);

    // Lưu lệnh đã thực hiện
    saveExecutedOrder(token.symbol, strategyResult.strategy, finalEntryVolume);

    const tradeResult = {
      executed: true,
      reason: `Chiến thuật ${strategyResult.strategy}: ${strategyResult.result.reason}`,
      orderResult,
      fundingRate: preTradeCheck.fundingRate,
      strategy: strategyResult.strategy,
      volume: finalEntryVolume,
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
    logTradeHistory(token.symbol, `Lỗi khi vào lệnh qua API BingX: ${orderResult.error}`);
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

