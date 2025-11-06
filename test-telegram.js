import { sendTelegramAlert } from './telegramBot.js';
import { config } from './config.js';

// Dữ liệu mẫu top 10 để test (đã sắp xếp theo riseFallRate giảm dần)
const mockTop10 = [
  {
    rank: 1,
    symbol: 'SOONNETWORK_USDT',
    riseFallRate: 0.8193,
    riseFallValue: 0.6655,
    high24Price: 3.0308,
    lower24Price: 0.7075,
    lastPrice: 1.4777,
    volume24: 37543310,
    contractId: 1224,
    fundingRate: -0.010194,
  },
  {
    rank: 2,
    symbol: 'GIGGLE_USDT',
    riseFallRate: 0.3007,
    riseFallValue: 52.88,
    high24Price: 274.25,
    lower24Price: 121.25,
    lastPrice: 228.72,
    volume24: 10929767,
    contractId: 1514,
    fundingRate: -0.000003,
  },
  {
    rank: 3,
    symbol: 'ZEC_USDT',
    riseFallRate: 0.0584,
    riseFallValue: 28.2,
    high24Price: 514.93,
    lower24Price: 424.59,
    lastPrice: 510.4,
    volume24: 59657551,
    contractId: 22,
    fundingRate: -0.001978,
  },
  {
    rank: 4,
    symbol: 'ASTER_USDC',
    riseFallRate: 0.0049,
    riseFallValue: 0.0054,
    high24Price: 1.1704,
    lower24Price: 0.9959,
    lastPrice: 1.0895,
    volume24: 522435372,
    contractId: 1500,
    fundingRate: -0.000071,
  },
  {
    rank: 5,
    symbol: 'TOKEN_8',
    riseFallRate: 0.02,
    riseFallValue: 2.0,
    high24Price: 100,
    lower24Price: 95,
    lastPrice: 98,
    volume24: 1000000,
    contractId: 100,
    fundingRate: 0.0001,
  },
  {
    rank: 6,
    symbol: 'TOKEN_9',
    riseFallRate: 0.01,
    riseFallValue: 0.5,
    high24Price: 50,
    lower24Price: 48,
    lastPrice: 49,
    volume24: 500000,
    contractId: 101,
    fundingRate: 0.00005,
  },
  {
    rank: 7,
    symbol: 'TOKEN_10',
    riseFallRate: 0.005,
    riseFallValue: 0.12,
    high24Price: 25,
    lower24Price: 24,
    lastPrice: 24.5,
    volume24: 250000,
    contractId: 102,
    fundingRate: -0.0001,
  },
  {
    rank: 8,
    symbol: 'BTC_USDT',
    riseFallRate: -0.0047,
    riseFallValue: -493.8,
    high24Price: 104499,
    lower24Price: 101137.1,
    lastPrice: 103185.7,
    volume24: 1786838928,
    contractId: 10,
    fundingRate: 0.000089,
  },
  {
    rank: 9,
    symbol: 'ETH_USDT',
    riseFallRate: -0.0046,
    riseFallValue: -15.92,
    high24Price: 3478.57,
    lower24Price: 3273.47,
    lastPrice: 3379.69,
    volume24: 432709510,
    contractId: 11,
    fundingRate: 0.000053,
  },
  {
    rank: 10,
    symbol: 'SOL_USDT',
    riseFallRate: -0.0099,
    riseFallValue: -1.6,
    high24Price: 163.84,
    lower24Price: 153.58,
    lastPrice: 158.76,
    volume24: 246403452,
    contractId: 51,
    fundingRate: -0.000028,
  },
];

async function testTelegram() {
  console.log('🧪 Bắt đầu test gửi message Telegram...\n');
  
  // Kiểm tra cấu hình
  if (!config.telegramBotToken || !config.telegramChatId) {
    console.error('❌ Lỗi: Telegram chưa được cấu hình!');
    console.error('   Vui lòng kiểm tra file .env và đảm bảo có:');
    console.error('   - TELEGRAM_BOT_TOKEN');
    console.error('   - TELEGRAM_CHAT_ID');
    process.exit(1);
  }

  console.log('✅ Cấu hình Telegram đã được thiết lập');
  console.log(`   Bot Token: ${config.telegramBotToken.substring(0, 10)}...`);
  console.log(`   Chat ID: ${config.telegramChatId}\n`);

  try {
    console.log('📤 Đang gửi message test...\n');
    const success = await sendTelegramAlert(mockTop10);
    
    if (success) {
      console.log('\n✅ Test thành công! Kiểm tra Telegram của bạn để xem message.');
    } else {
      console.log('\n❌ Test thất bại! Kiểm tra lại cấu hình.');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Lỗi khi test:', error.message);
    process.exit(1);
  }
}

testTelegram();

