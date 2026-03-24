/**
 * Integration Test: Đặt Take Profit cho vị thế SHORT đang mở
 *
 * Cách chạy:
 *   node tests/test_live_take_profit.js <SYMBOL>
 * Ví dụ:
 *   node tests/test_live_take_profit.js BTC
 */
import { getBingxOpenPositions, cancelAllBingxOrders } from '../src/api/bingxService.js';
import { fetchTickerData } from '../src/api/apiClient.js';
import { placeTakeProfitOrders, getTPState } from '../src/trading/takeProfitService.js';
import { config } from '../src/config.js';

async function runTest() {
  const symbolArg = process.argv[2];
  if (!symbolArg) {
    console.error('❌ Thiếu symbol. Cách dùng: node tests/test_live_take_profit.js <SYMBOL>');
    console.error('   Ví dụ: node tests/test_live_take_profit.js BTC');
    process.exit(1);
  }

  const symbol = symbolArg.toUpperCase();
  const bingxSymbol = symbol.includes('-') ? symbol : `${symbol}-USDT`;
  const mexcSymbol = `${symbol}_USDT`;

  console.log(`\n🔍 [Test] Kiểm tra vị thế SHORT cho ${bingxSymbol}...`);

  try {
    // 1. Lấy trạng thái position từ BingX
    const positions = await getBingxOpenPositions(bingxSymbol);
    const shortPos = Array.isArray(positions)
      ? positions.find(p => p.symbol === bingxSymbol && p.positionSide === 'SHORT')
      : null;

    if (!shortPos) {
      console.error(`❌ Không tìm thấy vị thế SHORT cho ${bingxSymbol} trên BingX`);
      console.error(`   Cần mở vị thế trước để test đặt lệnh Take Profit.`);
      return;
    }

    // Lấy thông số từ vị thế đang mở
    const avgEntryPrice = parseFloat(shortPos.avgPrice || shortPos.entryPrice || '0');
    let totalQty = parseFloat(shortPos.positionAmt || shortPos.positionVolume || '0');
    // Với lệnh SHORT trên API có thể qty bị âm
    totalQty = Math.abs(totalQty);

    if (totalQty <= 0) {
      console.error(`❌ Vị thế ${bingxSymbol} có volume bằng 0, không hợp lệ.`);
      return;
    }

    console.log(`✅ Tìm thấy vị thế SHORT!`);
    console.log(`   📍 Entry Price trung bình: ${avgEntryPrice}`);
    console.log(`   📦 Tổng số lượng (qty): ${totalQty}`);

    // 2. Tìm pump percentage từ MEXC Tickers
    console.log(`\n📊 [Test] Lấy pump percentage từ MEXC ticker cho ${mexcSymbol}...`);
    const tickers = await fetchTickerData();
    const ticker = tickers.find(t => t.symbol === mexcSymbol);

    if (!ticker) {
      console.error(`❌ Không tìm thấy ticker ${mexcSymbol} trên MEXC để tính pump%.`);
      return;
    }

    const pumpPercent = parseFloat(ticker.riseFallRate || '0');
    console.log(`✅ MEXC Ticker: Tỉ lệ biến động (riseFallRate): ${(pumpPercent * 100).toFixed(2)}%`);

    // 3. Đặt lệnh Take Profit mô phỏng quy trình của bot
    console.log(`\n🚀 [Test] Cancel các lệnh cũ để unlock quantity...`);
    try {
      await cancelAllBingxOrders(bingxSymbol);
      console.log(`   ✅ Đã cancel lệnh cũ thành công`);
    } catch (err) {
      console.warn(`   ⚠️  Không cancel được lệnh cũ (có thể không có):`, err.message);
    }

    console.log(`\n🚀 [Test] Bắt đầu gọi placeTakeProfitOrders...`);
    // Tạm kích hoạt TP config để function không bị skip nếu env đang false
    // Note: placeTakeProfitOrders không check config.tpEnabled bên trong
    const orderResult = await placeTakeProfitOrders(symbol, avgEntryPrice, totalQty, pumpPercent);

    console.log(`\n✅ Kết quả: \n`, JSON.stringify(orderResult, null, 2));

    const state = getTPState(symbol);
    if (state) {
      console.log(`\n📌 Khởi tạo thành công TP State Tracker cho ${symbol}:`);
      console.log(`   - TP1 Order ID: ${state.tp1OrderId}`);
      console.log(`   - TP2 Order ID: ${state.tp2OrderId}`);
      console.log(`   - TP3 Order ID: ${state.tp3OrderId}`);
    } else {
      console.log(`\n⚠️  Có vẻ không khởi tạo được TP state map cho ${symbol}`);
    }

  } catch (error) {
    console.error(`\n❌ Đã xảy ra lỗi khi test TP:`, error.message);
  }
}

runTest();
