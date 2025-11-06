import cron from 'node-cron';
import { fetchTickerData } from './apiClient.js';
import { getTop10PumpTokens } from './dataProcessor.js';
import { saveTop10, loadTop10 } from './storage.js';
import { detectTop1Change, getTop1ChangeInfo } from './comparator.js';
import { sendTelegramAlert } from './telegramBot.js';
import { config } from './config.js';

let isRunning = false;

/**
 * Hàm chính để xử lý một lần check
 */
async function checkPumpTokens() {
  // Tránh chạy đồng thời nhiều lần
  if (isRunning) {
    console.log('⏳ Đang chạy lần check trước đó, bỏ qua lần này...');
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    console.log('\n🔄 Bắt đầu check pump tokens...');
    
    // 1. Fetch dữ liệu từ API
    console.log('📡 Đang lấy dữ liệu từ MEXC API...');
    const apiData = await fetchTickerData();
    console.log(`✅ Đã lấy ${apiData.length} tokens từ API`);

    // 2. Xử lý và tính toán top 10
    console.log('🔢 Đang tính toán riseFallRate và lọc top 10...');
    const top10 = getTop10PumpTokens(apiData);
    
    if (top10.length === 0) {
      console.warn('⚠️  Không có token nào để hiển thị');
      return;
    }
    
    console.log('✅ Đã tính toán top 10 (theo RiseFallRate):');
    top10.forEach(token => {
      const percent = (token.riseFallRate * 100).toFixed(2);
      const sign = token.riseFallRate >= 0 ? '+' : '';
      console.log(`   ${token.rank}. ${token.symbol} - ${sign}${percent}%`);
    });

    // 3. Load dữ liệu trước đó
    const previousData = await loadTop10();

    // 4. Kiểm tra và gửi alert
    // Nếu lần đầu chạy (chưa có dữ liệu), gửi alert luôn
    // Nếu đã có dữ liệu, chỉ gửi khi top 1 thay đổi
    if (previousData === null) {
      console.log('📝 Lần đầu chạy - Gửi top 10 hiện tại');
      await sendTelegramAlert(top10);
    } else {
      // Kiểm tra thay đổi top 1
      const changeInfo = getTop1ChangeInfo(top10, previousData);
      
      if (changeInfo.changed) {
        console.log('🚨 Phát hiện thay đổi ở top 1!');
        console.log(`   Top 1 trước: ${changeInfo.previousTop1 ? changeInfo.previousTop1.symbol : 'N/A'}`);
        console.log(`   Top 1 hiện tại: ${changeInfo.currentTop1 ? changeInfo.currentTop1.symbol : 'N/A'}`);
        
        // Gửi thông báo Telegram
        await sendTelegramAlert(top10);
      } else {
        console.log('✅ Không có thay đổi ở top 1');
      }
    }

    // 6. Lưu top 10 mới
    await saveTop10(top10);

    const duration = Date.now() - startTime;
    console.log(`✅ Hoàn thành check trong ${duration}ms\n`);

  } catch (error) {
    console.error('❌ Lỗi trong quá trình check:', error.message);
    console.error(error.stack);
  } finally {
    isRunning = false;
  }
}

/**
 * Khởi động scheduler
 */
export function startScheduler() {
  console.log('🚀 Khởi động Pump Token Alert System');
  console.log(`⏰ Lịch chạy: ${config.cronSchedule} (mỗi 1 phút)`);
  console.log(`📁 Thư mục data: ${config.dataDir}`);
  console.log(`📄 File lịch sử: ${config.historyFile}`);
  
  if (!config.telegramBotToken || !config.telegramChatId) {
    console.warn('⚠️  Telegram chưa được cấu hình, sẽ không gửi thông báo');
  } else {
    console.log('✅ Telegram đã được cấu hình');
  }

  // Chạy ngay lần đầu
  checkPumpTokens();

  // Schedule chạy theo cron
  cron.schedule(config.cronSchedule, () => {
    checkPumpTokens();
  });

  console.log('✅ Scheduler đã được khởi động\n');
}

