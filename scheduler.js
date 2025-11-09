import cron from 'node-cron';
import { fetchTickerData } from './apiClient.js';
import { getTop10PumpTokens, addRSIToTop10 } from './dataProcessor.js';
import { saveTop10, loadTop10 } from './storage.js';
import { detectTop1Change, getTop1ChangeInfo, updateTop1Whitelist, getBaseSymbol } from './comparator.js';
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
    const top10WithoutRSI = getTop10PumpTokens(apiData);
    
    if (top10WithoutRSI.length === 0) {
      console.warn('⚠️  Không có token nào để hiển thị');
      return;
    }
    
    console.log('✅ Đã tính toán top 10 (theo RiseFallRate):');
    top10WithoutRSI.forEach(token => {
      const percent = (token.riseFallRate * 100).toFixed(2);
      const sign = token.riseFallRate >= 0 ? '+' : '';
      console.log(`   ${token.rank}. ${token.symbol} - ${sign}${percent}%`);
    });

    // 3. Tính RSI cho top 10 tokens
    console.log('\n📊 Đang tính RSI cho top 10 tokens...');
    const top10 = await addRSIToTop10(top10WithoutRSI);
    
    // Log RSI confluence nếu có
    top10.forEach(token => {
      if (token.rsiConfluence && token.rsiConfluence.hasConfluence) {
        const confluenceStatus = token.rsiConfluence.status === 'oversold' ? '🟢 Oversold' : '🔴 Overbought';
        console.log(`   ${token.symbol}: ${confluenceStatus} Confluence (${token.rsiConfluence.count} timeframes)`);
      }
    });

    // 4. Load dữ liệu trước đó
    const previousData = await loadTop10();

    // 5. Kiểm tra và gửi alert
    // Nếu lần đầu chạy (chưa có dữ liệu), gửi alert luôn
    // Nếu đã có dữ liệu, chỉ gửi khi top 1 thay đổi và không nằm trong whitelist
    let newWhitelist = [];
    
    if (previousData === null) {
      console.log('📝 Lần đầu chạy - Gửi top 10 hiện tại');
      await sendTelegramAlert(top10);
      
      // Lần đầu: thêm top 1 vào whitelist
      const currentTop1 = top10.length > 0 ? top10[0] : null;
      if (currentTop1) {
        const baseSymbol = getBaseSymbol(currentTop1.symbol);
        newWhitelist = [baseSymbol];
      }
    } else {
      // Kiểm tra thay đổi top 1
      const changeInfo = getTop1ChangeInfo(top10, previousData);
      const currentTop1 = top10.length > 0 ? top10[0] : null;
      const currentBaseSymbol = currentTop1 ? getBaseSymbol(currentTop1.symbol) : null;
      
      if (changeInfo.changed) {
        if (changeInfo.inWhitelist) {
          console.log('✅ Top 1 thay đổi nhưng nằm trong whitelist, bỏ qua alert');
          console.log(`   Top 1 trước: ${changeInfo.previousTop1 ? changeInfo.previousTop1.symbol : 'N/A'}`);
          console.log(`   Top 1 hiện tại: ${changeInfo.currentTop1 ? changeInfo.currentTop1.symbol : 'N/A'} (trong whitelist)`);
        } else {
          console.log('🚨 Phát hiện thay đổi ở top 1!');
          console.log(`   Top 1 trước: ${changeInfo.previousTop1 ? changeInfo.previousTop1.symbol : 'N/A'}`);
          console.log(`   Top 1 hiện tại: ${changeInfo.currentTop1 ? changeInfo.currentTop1.symbol : 'N/A'}`);
          
          // Gửi thông báo Telegram
          await sendTelegramAlert(top10);
        }
        
        // Cập nhật whitelist: thêm top 1 mới vào whitelist (chỉ giữ 2 gần nhất)
        newWhitelist = updateTop1Whitelist(previousData, currentBaseSymbol);
        console.log(`   Whitelist mới: ${newWhitelist.join(', ')}`);
      } else {
        console.log('✅ Không có thay đổi ở top 1');
        // Không thay đổi, giữ nguyên whitelist
        newWhitelist = previousData.top1Whitelist || [];
      }
    }

    // 6. Lưu top 10 mới (có RSI) và whitelist
    await saveTop10(top10, newWhitelist);

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
  console.log(`📊 RSI Configuration:`);
  console.log(`   - Timeframes: ${config.rsiTimeframes.join(', ')}`);
  console.log(`   - Period: ${config.rsiPeriod}`);
  console.log(`   - Oversold: < ${config.rsiOversoldThreshold}`);
  console.log(`   - Overbought: > ${config.rsiOverboughtThreshold}`);
  console.log(`   - Confluence min timeframes: ${config.rsiConfluenceMinTimeframes}`);
  
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

