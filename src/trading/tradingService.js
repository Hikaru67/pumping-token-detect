import { 
  getBingxAccountBalance, 
  checkBingxContractSymbol, 
  placeBingxSwapOrder,
  getBingxSwapTickers,
  callBingxPublicApi
} from '../api/bingxService.js';
import { config } from '../config.js';
import { getBaseSymbol } from '../utils/symbolUtils.js';

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
    
    // Balance data format từ BingX: { balance: "1000.00", availableBalance: "950.00", ... }
    if (balanceData && typeof balanceData === 'object') {
      const balance = parseFloat(balanceData.balance || balanceData.availableBalance || '0');
      return balance;
    }
    
    // Nếu là array, lấy phần tử đầu tiên
    if (Array.isArray(balanceData) && balanceData.length > 0) {
      const first = balanceData[0];
      const balance = parseFloat(first.balance || first.availableBalance || '0');
      return balance;
    }
    
    console.warn('⚠️  Không tìm thấy balance data');
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
 * @param {number} volume - Volume vào lệnh
 * @param {number} leverage - Đòn bẩy (mặc định: 2)
 * @returns {Promise<Object>} Kết quả đặt lệnh
 */
export async function placeShortOrder(symbol, volume, leverage = 2) {
  try {
    // Normalize symbol
    const normalizedSymbol = symbol.includes('-') ? symbol : `${symbol}-USDT`;
    
    // Đặt lệnh SHORT (SELL) với đòn bẩy
    const orderPayload = {
      symbol: normalizedSymbol.toUpperCase(),
      side: 'SELL', // SHORT position
      type: 'MARKET', // Market order
      quantity: volume.toString(),
      leverage: leverage,
      marginMode: 'CROSSED', // Cross margin
      positionSide: 'SHORT', // SHORT position
    };
    
    console.log(`📤 Đang đặt lệnh SHORT: ${normalizedSymbol}, Volume: ${volume}, Leverage: ${leverage}x`);
    
    const result = await placeBingxSwapOrder(orderPayload);
    
    console.log(`✅ Đã đặt lệnh SHORT thành công:`, result);
    return {
      success: true,
      orderId: result.orderId || result.id,
      symbol: normalizedSymbol,
      volume,
      leverage,
      result,
    };
  } catch (error) {
    console.error(`❌ Lỗi khi đặt lệnh SHORT cho ${symbol}:`, error.message);
    return {
      success: false,
      error: error.message,
      symbol,
      volume,
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
  if (fundingRate !== null && fundingRate <= fundingRateThreshold) {
    return {
      canTrade: false,
      reason: `Funding rate quá âm: ${(fundingRate * 100).toFixed(2)}% <= ${(fundingRateThreshold * 100).toFixed(2)}%`,
      fundingRate,
    };
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
  
  // 3. Kiểm tra giá pump
  const pumpOk = checkPumpPercentage(token, pumpThreshold);
  if (!pumpOk) {
    return {
      canTrade: false,
      reason: `Pump % (${(token.riseFallRate * 100).toFixed(2)}%) < threshold (${pumpThreshold}%)`,
      fundingRate,
    };
  }
  
  return {
    canTrade: true,
    reason: 'Tất cả điều kiện đều thỏa mãn',
    fundingRate,
  };
}

