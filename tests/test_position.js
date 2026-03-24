import { getOpenPositionVolume } from '../src/trading/tradingService.js';
import { config } from '../src/config.js';

async function runTest() {
  console.log('Bắt đầu test gọi API getOpenPositionVolume()...');

  if (!config.bingxApiKey || !config.bingxApiSecret) {
    console.warn('⚠️  CẢNH BÁO: BINGX_API_KEY hoặc BINGX_API_SECRET chưa được cấu hình trong .env!');
  } else {
    console.log(`✅ Đã load được API Key: ${config.bingxApiKey.substring(0, 5)}...`);
  }

  // Nhận symbol từ command line hoặc mặc định là BTC-USDT
  const testSymbol = process.argv[2] || 'SIREN-USDT';
  console.log(`\n🔍 Đang truy vấn vị thế SHORT đang mở của cặp: ${testSymbol}`);

  try {
    const volume = await getOpenPositionVolume(testSymbol);
    console.log('');
    console.log('===== KẾT QUẢ API =====');
    console.log(`📉 Vị thế SHORT hiện tại của ${testSymbol}: ${volume}`);
    console.log('=======================');

    if (volume === 0) {
      console.log(`\nLưu ý: Volume = 0 thường có nghĩa là bạn đang TẤT TOÁN (không mở lệnh SHORT) đồng ${testSymbol} trên sàn, hoặc API Key cấp quyền (Read) đang bị thiếu/lỗi.`);
    }
  } catch (err) {
    console.error('\n❌ Có lỗi xảy ra trong quá trình truy vấn API:', err.message);
  }
}

runTest();
