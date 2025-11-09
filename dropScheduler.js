import cron from 'node-cron';
import { fetchTickerData } from './apiClient.js';
import { getTop10DropTokens, addRSIToTop10 } from './dataProcessor.js';
import { saveTop10Drop, loadTop10Drop } from './storage.js';
import { detectTop1Change, getTop1ChangeInfo, updateTop1Whitelist, getBaseSymbol, getRSIConfluenceIncreaseInfo } from './comparator.js';
import { sendTelegramDropAlert } from './telegramBot.js';
import { config } from './config.js';

let isRunning = false;

/**
 * Hàm chính để xử lý một lần check drop tokens
 */
async function checkDropTokens() {
  // Tránh chạy đồng thời nhiều lần
  if (isRunning) {
    console.log('⏳ [DROP] Đang chạy lần check trước đó, bỏ qua lần này...');
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    console.log('\n🔄 [DROP] Bắt đầu check drop tokens...');
    
    // 1. Fetch dữ liệu từ API
    console.log('📡 [DROP] Đang lấy dữ liệu từ MEXC API...');
    const apiData = await fetchTickerData();
    console.log(`✅ [DROP] Đã lấy ${apiData.length} tokens từ API`);

    // 2. Xử lý và tính toán top 10 drop tokens
    console.log('🔢 [DROP] Đang tính toán riseFallRate và lọc top 10 drop...');
    const top10WithoutRSI = getTop10DropTokens(apiData);
    
    if (top10WithoutRSI.length === 0) {
      console.warn('⚠️  [DROP] Không có token nào để hiển thị');
      return;
    }
    
    console.log('✅ [DROP] Đã tính toán top 10 drop (theo RiseFallRate):');
    top10WithoutRSI.forEach(token => {
      const percent = (token.riseFallRate * 100).toFixed(2);
      const sign = token.riseFallRate >= 0 ? '+' : '';
      console.log(`   ${token.rank}. ${token.symbol} - ${sign}${percent}%`);
    });

    // 3. Tính RSI cho top 10 drop tokens
    console.log('\n📊 [DROP] Đang tính RSI cho top 10 drop tokens...');
    const top10 = await addRSIToTop10(top10WithoutRSI);
    
    // Log RSI confluence nếu có
    top10.forEach(token => {
      if (token.rsiConfluence && token.rsiConfluence.hasConfluence) {
        const confluenceStatus = token.rsiConfluence.status === 'oversold' ? '🟢 Oversold' : '🔴 Overbought';
        console.log(`   [DROP] ${token.symbol}: ${confluenceStatus} Confluence (${token.rsiConfluence.count} timeframes)`);
      }
    });

    // 4. Load dữ liệu trước đó
    const previousData = await loadTop10Drop();

    // 5. Kiểm tra và gửi alert
    // Nếu lần đầu chạy (chưa có dữ liệu), gửi alert luôn
    // Nếu đã có dữ liệu, gửi alert khi:
    //   - Top 1 thay đổi và không nằm trong whitelist
    //   - RSI confluence tăng (số lượng timeframes có confluence tăng)
    let newWhitelist = [];
    let shouldSendAlert = false;
    let alertReason = '';
    let confluenceInfo = null;
    
    if (previousData === null) {
      console.log('📝 [DROP] Lần đầu chạy - Gửi top 10 drop hiện tại');
      shouldSendAlert = true;
      alertReason = 'Lần đầu chạy';
      
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
          console.log('✅ [DROP] Top 1 thay đổi nhưng nằm trong whitelist, bỏ qua alert');
          console.log(`   [DROP] Top 1 trước: ${changeInfo.previousTop1 ? changeInfo.previousTop1.symbol : 'N/A'}`);
          console.log(`   [DROP] Top 1 hiện tại: ${changeInfo.currentTop1 ? changeInfo.currentTop1.symbol : 'N/A'} (trong whitelist)`);
        } else {
          console.log('🚨 [DROP] Phát hiện thay đổi ở top 1!');
          console.log(`   [DROP] Top 1 trước: ${changeInfo.previousTop1 ? changeInfo.previousTop1.symbol : 'N/A'}`);
          console.log(`   [DROP] Top 1 hiện tại: ${changeInfo.currentTop1 ? changeInfo.currentTop1.symbol : 'N/A'}`);
          
          shouldSendAlert = true;
          alertReason = 'Top 1 thay đổi';
        }
        
        // Cập nhật whitelist: thêm top 1 mới vào whitelist (chỉ giữ 3 gần nhất)
        newWhitelist = updateTop1Whitelist(previousData, currentBaseSymbol);
        console.log(`   [DROP] Whitelist mới: ${newWhitelist.join(', ')}`);
      } else {
        console.log('✅ [DROP] Không có thay đổi ở top 1');
        // Không thay đổi, giữ nguyên whitelist
        newWhitelist = previousData.top1Whitelist || [];
      }

      // Kiểm tra RSI confluence increase (chỉ trigger khi có ít nhất 1 timeframe lớn: 4h, 8h, 1d)
      confluenceInfo = getRSIConfluenceIncreaseInfo(top10, previousData);
      
      if (confluenceInfo.hasIncrease) {
        console.log(`\n📊 [DROP] Phát hiện RSI Confluence tăng cho ${confluenceInfo.count} token(s) (có ít nhất 1 timeframe lớn: 4h, 8h, 1d):`);
        
        confluenceInfo.increases.forEach(increase => {
          const statusEmoji = increase.currentConfluence.status === 'oversold' ? '🟢' : '🔴';
          const statusText = increase.currentConfluence.status === 'oversold' ? 'Oversold' : 'Overbought';
          const timeframesList = increase.currentConfluence.timeframes.join(', ');
          
          // Tìm các timeframe lớn trong confluence
          const largeTimeframes = increase.currentConfluence.timeframes.filter(tf => 
            ['Hour4', 'Hour8', 'Day1'].includes(tf)
          );
          const largeTimeframesStr = largeTimeframes.length > 0 
            ? ` [Timeframes lớn: ${largeTimeframes.join(', ')}]` 
            : '';
          
          console.log(`   🚨 [DROP] ${increase.token.symbol}: ${statusText} Confluence tăng từ ${increase.previousCount} → ${increase.currentCount} TFs (${timeframesList})${largeTimeframesStr}`);
        });
        
        // Trigger alert khi có confluence increase với timeframe lớn
        shouldSendAlert = true;
        if (alertReason) {
          alertReason += ' + RSI Confluence tăng';
        } else {
          alertReason = 'RSI Confluence tăng';
        }
      } else {
        console.log('✅ [DROP] Không có RSI Confluence tăng (hoặc không có timeframe lớn: 4h, 8h, 1d)');
      }
    }

    // Gửi alert nếu cần
    if (shouldSendAlert) {
      console.log(`\n📨 [DROP] Gửi alert Telegram (Lý do: ${alertReason})`);
      // Chỉ truyền confluenceInfo nếu alertReason có chứa "RSI Confluence tăng"
      const infoToSend = alertReason.includes('RSI Confluence tăng') ? confluenceInfo : null;
      await sendTelegramDropAlert(top10, alertReason, infoToSend);
    } else {
      console.log('✅ [DROP] Không có thay đổi đáng kể, bỏ qua alert');
    }

    // 6. Lưu top 10 drop mới (có RSI) và whitelist
    await saveTop10Drop(top10, newWhitelist);

    const duration = Date.now() - startTime;
    console.log(`✅ [DROP] Hoàn thành check trong ${duration}ms\n`);

  } catch (error) {
    console.error('❌ [DROP] Lỗi trong quá trình check:', error.message);
    console.error(error.stack);
  } finally {
    isRunning = false;
  }
}

/**
 * Khởi động scheduler cho drop tokens
 */
export function startDropScheduler() {
  console.log('🚀 [DROP] Khởi động Drop Token Alert System');
  console.log(`⏰ [DROP] Lịch chạy: ${config.cronScheduleDrop} (mỗi 1 phút)`);
  console.log(`📁 [DROP] Thư mục data: ${config.dataDir}`);
  console.log(`📄 [DROP] File lịch sử: ${config.dropHistoryFile}`);
  console.log(`📊 [DROP] RSI Configuration:`);
  console.log(`   - Timeframes: ${config.rsiTimeframes.join(', ')}`);
  console.log(`   - Period: ${config.rsiPeriod}`);
  console.log(`   - Oversold: < ${config.rsiOversoldThreshold}`);
  console.log(`   - Overbought: > ${config.rsiOverboughtThreshold}`);
  console.log(`   - Confluence min timeframes: ${config.rsiConfluenceMinTimeframes}`);
  
  if (!config.telegramBotToken || !config.telegramDropChatId) {
    console.warn('⚠️  [DROP] Telegram Drop channel chưa được cấu hình, sẽ không gửi thông báo');
  } else {
    console.log('✅ [DROP] Telegram Drop channel đã được cấu hình');
    console.log(`   - Silent mode: ${config.telegramDropDisableNotification ? '🔇 Bật (không có âm thanh/thông báo)' : '🔔 Tắt (có âm thanh/thông báo)'}`);
  }

  // Chạy ngay lần đầu
  checkDropTokens();

  // Schedule chạy theo cron
  cron.schedule(config.cronScheduleDrop, () => {
    checkDropTokens();
  });

  console.log('✅ [DROP] Drop Scheduler đã được khởi động\n');
}

