/**
 * Exchange Service Router
 *
 * File này là entry point DUY NHẤT mà phần còn lại của codebase import.
 * Để switch sàn, chỉ cần đổi biến môi trường:
 *
 *   EXCHANGE_PROVIDER=bingx   (mặc định)
 *   EXCHANGE_PROVIDER=mexc
 *
 * Tất cả export đều tuân theo contract định nghĩa trong exchangeInterface.js
 */

const provider = (process.env.EXCHANGE_PROVIDER || 'bingx').toLowerCase().trim();

let service;

if (provider === 'mexc') {
  service = await import('./mexcService.js');
  console.log('🔀 [ExchangeService] Đang dùng: MEXC');
} else {
  service = await import('./bingxService.js');
  console.log('🔀 [ExchangeService] Đang dùng: BingX');
}

// Re-export toàn bộ interface
export const {
  getAccountBalance,
  getOpenPositions,
  placeOrder,
  cancelOrder,
  cancelAllOrders,
  getOpenOrders,
  getOrderStatus,
  getSymbolTickSize,
  checkContractSymbol,
  placeStopOrder,
  getOrderHistory,
} = service;
