import {
  getBingxAccountBalance,
  checkBingxContractSymbol,
  placeBingxSwapOrder,
  getBingxSwapTickers,
  callBingxPublicApi,
  getBingxOpenPositions
} from '../api/bingxService.js';
import { config } from '../config.js';
import { getBaseSymbol } from '../utils/symbolUtils.js';
import { fetchFundingRateHistory } from '../api/apiClient.js';

/**
 * Láy volume (kích thước) của vị thế SHORT đang mở cho một token
 * @param {string} symbol - Symbol (ví dụ: BTC-USDT)
 * @returns {Promise<number>} Kích thước vị thế đang mở (số lượng token)
 */
export async function getOpenPositionVolume(symbol) {
  try {
    const normalizedSymbol = symbol.includes('-') ? symbol : `${symbol}-USDT`;
    const positions = await getBingxOpenPositions(normalizedSymbol.toUpperCase());

    if (positions && Array.isArray(positions)) {
      // Tìm vị thế SHORT cho symbol này
      const shortPosition = positions.find(
        pos => pos.symbol === normalizedSymbol.toUpperCase() && pos.positionSide === 'SHORT'
      );

      if (shortPosition) {
        // Trả về positionValue (giá trị USDT) thay vì positionAmt (số lượng token)
        return parseFloat(shortPosition.positionValue || '0');
      }
    }
    return 0;
  } catch (error) {
    console.warn(`⚠️  Lỗi khi lấy open position cho ${symbol}:`, error.message);
    return 0;
  }
}

/**
 * Lấy funding rate từ BingX
 * @param {string} symbol - Symbol (ví dụ: BTC-USDT hoặc BTC)
 * @returns {Promise<number|null>} Funding rate (số thập phân, ví dụ: -0.0001 = -0.01%)
 */
export async function getBingxFundingRate(symbol) {
  try {
    // Normalize symbol
    const normalizedSymbol = symbol.includes('-') ? symbol : `${symbol}-USDT`;

    // Thử lấy từ ticker trước (có thể chứa funding rate)
    try {
      const tickerData = await getBingxSwapTickers(normalizedSymbol.toUpperCase());

      // Nếu là array, tìm symbol trong array
      if (Array.isArray(tickerData)) {
        const item = tickerData.find(item => {
          const itemSymbol = item.symbol || item.contractName;
          return itemSymbol && itemSymbol.toUpperCase() === normalizedSymbol.toUpperCase();
        });
        if (item && item.fundingRate !== undefined) {
          return parseFloat(item.fundingRate);
        }
      }

      // Nếu là object, kiểm tra trực tiếp
      if (tickerData && typeof tickerData === 'object' && tickerData.fundingRate !== undefined) {
        return parseFloat(tickerData.fundingRate);
      }
    } catch (tickerError) {
      // Tiếp tục thử endpoint khác
      console.log(`   ⚠️  Không lấy được funding rate từ ticker, thử endpoint khác...`);
    }

    // Thử endpoint funding rate riêng
    try {
      const data = await callBingxPublicApi('/openApi/swap/v2/quote/fundingRate', {
        symbol: normalizedSymbol.toUpperCase()
      });

      if (data && typeof data === 'object' && data.fundingRate !== undefined) {
        // Funding rate từ BingX là số thập phân (ví dụ: -0.0001 = -0.01%)
        return parseFloat(data.fundingRate);
      }

      // Nếu data là array, tìm symbol trong array
      if (Array.isArray(data)) {
        const item = data.find(item => {
          const itemSymbol = item.symbol || item.contractName;
          return itemSymbol && itemSymbol.toUpperCase() === normalizedSymbol.toUpperCase();
        });
        if (item && item.fundingRate !== undefined) {
          return parseFloat(item.fundingRate);
        }
      }
    } catch (rateError) {
      // Nếu endpoint này không hoạt động, bỏ qua
      console.log(`   ⚠️  Endpoint funding rate không khả dụng: ${rateError.message}`);
    }

    console.warn(`⚠️  Không tìm thấy funding rate cho ${symbol}`);
    return null;
  } catch (error) {
    console.warn(`⚠️  Lỗi khi lấy funding rate cho ${symbol}:`, error.message);
    return null;
  }
}

/**
 * Lấy số dư tài khoản USDT
 * @returns {Promise<number>} Số dư USDT (sau khi nhân đòn bẩy)
 */
export async function getAccountBalance() {
  try {
    const balanceData = await getBingxAccountBalance('USDT');

    // BingX API trả về data có dạng { balance: { asset: "USDT", balance: "1000", availableMargin: "950" } }
    let balanceObj = balanceData;
    if (balanceData && balanceData.balance && typeof balanceData.balance === 'object') {
      balanceObj = balanceData.balance;
    }

    if (balanceObj && typeof balanceObj === 'object' && !Array.isArray(balanceObj)) {
      const balance = parseFloat(balanceObj.balance || balanceObj.availableMargin || balanceObj.availableBalance || '0');
      if (!isNaN(balance)) return balance;
    }

    // Nếu là array, lấy phần tử đầu tiên
    if (Array.isArray(balanceData) && balanceData.length > 0) {
      const first = balanceData[0];
      const firstObj = (first.balance && typeof first.balance === 'object') ? first.balance : first;
      const balance = parseFloat(firstObj.balance || firstObj.availableMargin || firstObj.availableBalance || '0');
      if (!isNaN(balance)) return balance;
    }

    console.warn('⚠️  Không tìm thấy balance data hợp lệ');
    return 0;
  } catch (error) {
    console.error('❌ Lỗi khi lấy account balance:', error.message);
    return 0;
  }
}

/**
 * Tính volume vào lệnh dựa trên % tài khoản
 * @param {number} accountBalance - Số dư tài khoản
 * @param {number} volumePercent - % tài khoản (ví dụ: 2 = 2%)
 * @param {number} leverage - Đòn bẩy (mặc định: 2)
 * @returns {number} Volume vào lệnh (sau khi nhân đòn bẩy)
 */
export function calculateEntryVolume(accountBalance, volumePercent, leverage = 2) {
  if (!accountBalance || accountBalance <= 0) {
    return 0;
  }

  // Volume = (accountBalance * volumePercent / 100) * leverage
  const volume = (accountBalance * volumePercent / 100) * leverage;
  return parseFloat(volume.toFixed(8));
}

/**
 * Kiểm tra symbol có tồn tại trên BingX không
 * @param {string} symbol - Symbol (ví dụ: BTC hoặc BTC-USDT)
 * @returns {Promise<boolean>} true nếu symbol tồn tại
 */
export async function checkSymbolExists(symbol) {
  try {
    const baseSymbol = getBaseSymbol(symbol);
    const result = await checkBingxContractSymbol(baseSymbol);
    return result.exists;
  } catch (error) {
    console.warn(`⚠️  Lỗi khi kiểm tra symbol ${symbol}:`, error.message);
    return false;
  }
}

/**
 * Kiểm tra giá pump có >= threshold không
 * @param {Object} token - Token object từ MEXC API
 * @param {number} pumpThreshold - Ngưỡng pump % (ví dụ: 30 = 30%)
 * @returns {boolean} true nếu pump >= threshold
 */
export function checkPumpPercentage(token, pumpThreshold) {
  if (!token || typeof token.riseFallRate !== 'number') {
    return false;
  }

  // riseFallRate từ MEXC là số thập phân (ví dụ: 0.3 = 30%)
  const pumpPercent = token.riseFallRate * 100;
  return pumpPercent >= pumpThreshold;
}

/**
 * Đặt lệnh SHORT trên BingX
 * @param {string} symbol - Symbol (ví dụ: BTC-USDT)
 * @param {number} quantity - Số lượng TÓKEN (size) vào lệnh
 * @param {number} leverage - Đòn bẩy (mặc định: 2)
 * @returns {Promise<Object>} Kết quả đặt lệnh
 */
export async function placeShortOrder(symbol, quantity, leverage = 2) {
  try {
    // Normalize symbol
    const normalizedSymbol = symbol.includes('-') ? symbol : `${symbol}-USDT`;

    // Đặt lệnh SHORT (SELL) với đòn bẩy
    const orderPayload = {
      symbol: normalizedSymbol.toUpperCase(),
      side: 'SELL', // SHORT position
      type: 'MARKET', // Market order
      quantity: quantity.toString(),
      leverage: leverage,
      marginMode: 'CROSSED', // Cross margin
      positionSide: 'SHORT', // SHORT position
    };

    console.log(`📤 Đang đặt lệnh SHORT: ${normalizedSymbol}, Quantity (Tokens): ${quantity}, Leverage: ${leverage}x`);

    const result = await placeBingxSwapOrder(orderPayload);

    console.log(`✅ Đã đặt lệnh SHORT thành công:`, result);
    return {
      success: true,
      orderId: result.orderId || result.id,
      symbol: normalizedSymbol,
      volume: quantity, // Vẫn trả về field volume để tương thích logic log cũ bên trigger
      leverage,
      result,
    };
  } catch (error) {
    console.error(`❌ Lỗi khi đặt lệnh SHORT cho ${symbol}:`, error.message);
    return {
      success: false,
      error: error.message,
      symbol,
      volume: quantity,
      leverage,
    };
  }
}

/**
 * Kiểm tra các điều kiện trước khi vào lệnh
 * @param {Object} token - Token object
 * @param {number} fundingRateThreshold - Ngưỡng funding rate (ví dụ: -0.5 = -0.5%)
 * @param {number} pumpThreshold - Ngưỡng pump % (ví dụ: 30 = 30%)
 * @returns {Promise<Object>} { canTrade: boolean, reason: string, fundingRate: number|null }
 */
export async function checkPreTradeConditions(token, fundingRateThreshold, pumpThreshold) {
  const baseSymbol = getBaseSymbol(token.symbol);

  // 1. Kiểm tra funding rate
  const fundingRate = await getBingxFundingRate(baseSymbol);

  // Kiểm tra chu kỳ funding từ MEXC
  const rawSymbol = token.symbol; // Symbol gốc từ MEXC (ví dụ POLYX_USDT)
  const mexcFundingHistory = await fetchFundingRateHistory(rawSymbol);

  if (mexcFundingHistory && mexcFundingHistory.length > 0) {
    const latestFunding = mexcFundingHistory[0];
    const collectCycle = latestFunding.collectCycle; // Chu kỳ trả (1h, 4h, 8h...)
    const mexcFundingRate = latestFunding.fundingRate; // Tỉ lệ funding thực tế từ MEXC

    // Nếu chu kỳ trả là 1h (config) và funding rate quá âm
    if (collectCycle === config.tradingFundingCollectCycleSkip && (mexcFundingRate * 100) <= fundingRateThreshold) {
      return {
        canTrade: false,
        reason: `Bỏ qua: Funding cycle quá ngắn (${collectCycle}h) và rate quá âm (${(mexcFundingRate * 100).toFixed(4)}% <= ${fundingRateThreshold}%)`,
        fundingRate: mexcFundingRate,
      };
    }
  }

  // 2. Kiểm tra symbol có trên BingX không
  const symbolExists = await checkSymbolExists(baseSymbol);
  if (!symbolExists) {
    return {
      canTrade: false,
      reason: `Symbol ${baseSymbol} không tồn tại trên BingX`,
      fundingRate,
    };
  }

  return {
    canTrade: true,
    reason: 'Tất cả điều kiện đều thỏa mãn',
    fundingRate,
  };
}

