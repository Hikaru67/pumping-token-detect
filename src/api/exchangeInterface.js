/**
 * Exchange Service Interface Contract
 *
 * Đây là tài liệu interface chung cho tất cả exchange adapter.
 * Mỗi exchange service (bingxService.js, mexcService.js) phải export
 * đầy đủ các hàm dưới đây với cùng tên, cùng input/output format.
 *
 * === CHUẨN HOÁ OUTPUT ===
 *
 * Position object:
 * {
 *   symbol:       string,   // Ví dụ: "BTC-USDT"
 *   positionSide: string,   // "SHORT" | "LONG"
 *   vol:          number,   // Số lượng token đang giữ (đã chuẩn hóa về số dương)
 *   avgPrice:     number,   // Giá entry trung bình
 *   positionValue:number,   // Giá trị USDT của vị thế (vol * avgPrice)
 * }
 *
 * OrderResult (output của placeOrder, placeStopOrder):
 * {
 *   orderId: string|number,
 *   symbol:  string,
 * }
 *
 * OrderStatus (output của getOrderStatus):
 * {
 *   order: {
 *     orderId: string,
 *     status:  'FILLED' | 'CANCELED' | 'NEW' | 'PARTIALLY_FILLED' | 'REJECTED' | 'FAILED',
 *   }
 * }
 *
 * === DANH SÁCH HÀM ===
 */

/**
 * Lấy số dư khả dụng của tài khoản
 * @param {string} [currency='USDT']
 * @returns {Promise<number>} Số dư khả dụng
 */
// export async function getAccountBalance(currency = 'USDT') {}

/**
 * Lấy danh sách vị thế đang mở
 * @param {string} symbol - Ví dụ: "BTC-USDT"
 * @returns {Promise<Array<Position>>} Danh sách vị thế (đã chuẩn hoá)
 */
// export async function getOpenPositions(symbol) {}

/**
 * Đặt lệnh Market / Limit
 * @param {Object} order
 * @param {string} order.symbol       - Ví dụ: "BTC-USDT"
 * @param {'BUY'|'SELL'} order.side
 * @param {'MARKET'|'LIMIT'} order.type
 * @param {string|number} order.vol   - Số lượng token
 * @param {string|number} [order.price] - Bắt buộc nếu LIMIT
 * @param {'LONG'|'SHORT'} [order.positionSide]
 * @returns {Promise<OrderResult>}
 */
// export async function placeOrder(order) {}

/**
 * Hủy một lệnh đang chờ
 * @param {string} symbol
 * @param {string|number} orderId
 * @returns {Promise<any>}
 */
// export async function cancelOrder(symbol, orderId) {}

/**
 * Hủy toàn bộ lệnh đang chờ của một symbol
 * @param {string} symbol
 * @returns {Promise<any>}
 */
// export async function cancelAllOrders(symbol) {}

/**
 * Lấy danh sách lệnh đang chờ khớp
 * @param {string} symbol
 * @returns {Promise<Array<Order>>}
 */
// export async function getOpenOrders(symbol) {}

/**
 * Truy vấn trạng thái của một lệnh cụ thể
 * @param {string} symbol
 * @param {string|number} orderId
 * @returns {Promise<OrderStatus>}
 */
// export async function getOrderStatus(symbol, orderId) {}

/**
 * Lấy tick size (bước giá nhỏ nhất) của symbol
 * @param {string} symbol
 * @returns {Promise<number|null>}
 */
// export async function getSymbolTickSize(symbol) {}

/**
 * Kiểm tra symbol có tồn tại trên sàn không
 * @param {string} symbol
 * @returns {Promise<{ exists: boolean, symbol: string, info: any }>}
 */
// export async function checkContractSymbol(symbol) {}

/**
 * Đặt lệnh Trigger / Stop Market (dùng để đặt Stop Loss)
 * @param {Object} order
 * @param {string} order.symbol
 * @param {'BUY'|'SELL'} order.side
 * @param {string|number} order.vol        - Số lượng token
 * @param {string|number} order.stopPrice  - Giá kích hoạt
 * @param {'LONG'|'SHORT'} [order.positionSide]
 * @returns {Promise<OrderResult>}
 */
// export async function placeStopOrder(order) {}

/**
 * Lấy lịch sử lệnh (đã hoàn thành / hủy)
 * @param {string} symbol
 * @param {number} [limit=50]
 * @returns {Promise<Array<Order>>}
 */
// export async function getOrderHistory(symbol, limit) {}
