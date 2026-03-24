import { config } from '../config.js';
import { checkAllStrategies } from './strategyChecker.js';
import { fetchKlineData } from '../api/apiClient.js';
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
import { placeTakeProfitOrders, updateTakeProfitOrders, getTPState } from './takeProfitService.js';

// Lưu trữ các lệnh đã vào để tránh vào lệnh trùng lặp
const executedOrders = new Map(); // key: symbol, value: { timestamp, strategy, volume }

/**
 * Kiểm tra xem đã vào lệnh cho symbol này chưa (trong vòng 1 giờ cho cùng 1 chiến thuật)
 * @param {string} symbol - Symbol
 * @param {number} strategy - Chiến thuật đang xét
 * @returns {boolean} true nếu đã vào lệnh gần đây cho chiến thuật này
 */
function hasRecentOrder(symbol, strategy) {
  // Ở đây chặn spam 1 chiến thuật duy nhất trong 1 giờ.
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

  // Chỉ block 1 giờ đối với chiến thuật bị trùng (ví dụ S1 cứ nổ hoài).
  // Nếu tín hiệu mạnh lên thành S5 hoặc S4 thì vẫn cho đi qua.
  if (order.strategy === strategy) {
    return true;
  }

  return false;
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
    return {
      executed: false,
      reason: strategyResult.result.reason,
      orderResult: null,
    };
  }

  console.log(`   🎯 [${token.symbol}] Chiến thuật ${strategyResult.strategy} thỏa mãn: ${strategyResult.result.reason}`);
  console.log(`   💰 [${token.symbol}] Volume mục tiêu: ${strategyResult.volumePercent}% tài khoản`);

  // Ghi log khi chiến thuật thỏa mãn
  logTradeHistory(token.symbol, `Chiến thuật ${strategyResult.strategy} thỏa mãn: ${strategyResult.result.reason}`, {
    strategy: strategyResult.strategy,
    volumePercent: strategyResult.volumePercent
  });

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

  // Lấy giá hiện tại (nến M1 mới nhất) thao tác kiểm tra giá xả và chuẩn bị convert size lệnh ra Token
  let currentExecutionPrice = token.lastPrice;
  
  try {
    const currentKline = await fetchKlineData(token.symbol, 'Min1', 2);
    if (currentKline && currentKline.close && currentKline.close.length > 0) {
      const currentPriceStr = currentKline.close[currentKline.close.length - 1];
      const currentPrice = parseFloat(currentPriceStr);
      
      if (!isNaN(currentPrice) && token.lastPrice) {
        currentExecutionPrice = currentPrice;
        // dropPercent: Tính tỷ lệ giá rơi từ token.lastPrice xuống currentPrice 
        const dropPercent = ((token.lastPrice - currentPrice) / token.lastPrice) * 100;
        
        if (dropPercent >= 3) {
          console.log(`   ❌ [${token.symbol}] Bỏ qua lệnh: Giá đã xả ${dropPercent.toFixed(2)}% so với lúc lấy tín hiệu (M1: ${currentPrice}, Khởi điểm: ${token.lastPrice})`);
          logTradeHistory(token.symbol, `Bỏ qua lệnh: Giá xả ${dropPercent.toFixed(2)}% (M1: ${currentPrice}, Check: ${token.lastPrice})`, {
            strategy: strategyResult.strategy,
          });
          return {
            executed: false,
            reason: `Giá bị xả >3% trước khi vào lệnh (M1: ${currentPrice}, Check: ${token.lastPrice})`,
            orderResult: null,
            fundingRate: preTradeCheck.fundingRate,
          };
        }
        
        console.log(`   ✅ [${token.symbol}] Chênh lệch giá an toàn: ${dropPercent.toFixed(2)}% (M1: ${currentPrice}, Khởi điểm: ${token.lastPrice})`);
      }
    }
  } catch (err) {
    console.warn(`   ⚠️  [${token.symbol}] Lỗi khi lấy nến M1 để kiểm tra giá xả, tiếp tục xử lý...: ${err.message}`);
  }

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

  // Cấu hình khối lượng quy định tối đa (mặc định S4 hoặc cứng 30%)
  const maxVolumePercent = config.tradingStrategy4VolumePercent || 30;
  const maxAllowedVolume = calculateEntryVolume(
    accountBalance,
    maxVolumePercent,
    config.tradingLeverage
  );

  // Lấy volume hiện hành trên vị thế SHORT
  const _baseSymbol = getBaseSymbol(token.symbol);
  const { getOpenPositionVolume } = await import('./tradingService.js');
  const currentOpenVol = await getOpenPositionVolume(_baseSymbol);

  if (currentOpenVol > 0) {
    console.log(`   📈 [${token.symbol}] Vị thế SHORT hiện tại đang mở: ${currentOpenVol.toFixed(8)}`);

    // 1. Kiểm tra nếu volume bằng hoạch vượt quá 30% tài khoản thì gác lại
    if (currentOpenVol >= maxAllowedVolume) {
      console.log(`   ⏭️  [${token.symbol}] Bỏ qua: Volume mở (${currentOpenVol}) đã kịch trần quy định tối đa (${maxAllowedVolume} = ${maxVolumePercent}% tk)`);
      logTradeHistory(token.symbol, `Bỏ qua: Lệnh đã đạt giới hạn tối đa (${maxVolumePercent}%)`, { currentOpenVol, maxAllowedVolume });
      return {
        executed: false,
        reason: `Đã đạt full rổ lệnh tối đa (${maxVolumePercent}% tài khoản)`,
        orderResult: null,
        fundingRate: preTradeCheck.fundingRate,
      };
    }

    // 2. Chống nhồi dư volume (ví dụ S2 đòi vô 10% nhưng dư địa chỉ còn 5% mới đủ 30%)
    if (currentOpenVol + finalEntryVolume > maxAllowedVolume) {
      finalEntryVolume = maxAllowedVolume - currentOpenVol;
      console.log(`   ⚠️  [${token.symbol}] Ghìm volume: Chỉ vào thêm ${finalEntryVolume.toFixed(8)} để lệnh không quá ${maxAllowedVolume}`);
    }

    // 3. Với S4 chuyên nhồi tẹt thì fill cho đủ nốt 30% 
    if (strategyResult.strategy === 4) {
      finalEntryVolume = maxAllowedVolume - currentOpenVol;
      console.log(`   🚨 [${token.symbol}] [Strategy 4] Gắn rát đẩy volume lên limit = ${finalEntryVolume.toFixed(8)}`);
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

  // Chuyển đổi Volume (USDT Notional Value) sang Quantity (Lượng Token) để gọi API BingX
  // Quantity = (Margin * Leverage) / Khớp Giá Hiện Tại
  let finalTokenQuantity = finalEntryVolume / currentExecutionPrice;
  
  // Làm tròn để tránh API từ chối do quá nhiều số thập phân
  if (finalTokenQuantity > 100) {
    finalTokenQuantity = Math.floor(finalTokenQuantity);
  } else if (finalTokenQuantity > 10) {
    finalTokenQuantity = parseFloat(finalTokenQuantity.toFixed(2));
  } else {
    finalTokenQuantity = parseFloat(finalTokenQuantity.toFixed(4));
  }

  console.log(`   📊 [${token.symbol}] Kế hoạch Notional Volume trích lập: ${finalEntryVolume.toFixed(2)} USDT (Leverage ${config.tradingLeverage}x)`);
  console.log(`   🔢 [${token.symbol}] Số lượng Quantity (Tokens) chuyển đổi ra để vào lệnh: ${finalTokenQuantity}`);

  // Đặt lệnh SHORT
  const baseSymbol = getBaseSymbol(token.symbol);
  const orderResult = await placeShortOrder(
    baseSymbol,
    finalTokenQuantity,
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

    // Đặt Take Profit orders (async, không block luồng chính)
    if (config.tpEnabled) {
      const pumpPercent = token.riseFallRate || 0; // riseFallRate là decimal (0.50 = 50%)
      const existingTPState = getTPState(baseSymbol);

      if (existingTPState) {
        // Đã có TP state → nhồi lệnh, cần update TP orders theo avg price mới
        console.log(`   🔄 [${token.symbol}] Phát hiện nhồi lệnh, cập nhật TP orders...`);
        updateTakeProfitOrders(baseSymbol, pumpPercent)
          .then(() => console.log(`   ✅ [${token.symbol}] Đã cập nhật TP orders`))
          .catch(err => console.warn(`   ⚠️  [${token.symbol}] Lỗi cập nhật TP:`, err.message));
      } else {
        // Lần đầu vào lệnh → đặt TP mới
        placeTakeProfitOrders(
          baseSymbol,
          currentExecutionPrice,
          finalTokenQuantity,
          pumpPercent
        )
          .then(() => console.log(`   ✅ [${token.symbol}] Đã đặt TP orders`))
          .catch(err => console.warn(`   ⚠️  [${token.symbol}] Lỗi đặt TP:`, err.message));
      }
    }

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

