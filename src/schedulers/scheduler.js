import cron from 'node-cron';
import { fetchTickerData } from '../api/apiClient.js';
import { getTop10PumpTokens, addRSIToTop10, countRSIOverboughtOversold, getOversoldTimeframes, getOverboughtTimeframes, countSuperOverboughtRSI } from '../utils/dataProcessor.js';
import { saveTop10, loadTop10 } from '../utils/storage.js';
import { detectTop1Change, getTop1ChangeInfo, updateTop1Whitelist, getBaseSymbol, getRSIConfluenceIncreaseInfo, isQuietHours } from '../utils/comparator.js';
import { sendTelegramAlert, sendSingleSignalAlert } from '../telegram/telegramBot.js';
import { checkReversalSignal } from '../indicators/candlestickPattern.js';
import { checkRsiBullishDivergence } from '../indicators/divergence.js';
import { config } from '../config.js';
import { calculateSingleSignalScore } from '../utils/signalScoring.js';

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

    const pumpCandidateLimit = config.pumpCandidateLimit || 10;

    // 2. Xử lý và tính toán top candidates
    console.log(`🔢 Đang tính toán riseFallRate và lọc top ${pumpCandidateLimit} candidates...`);
    const topCandidates = getTop10PumpTokens(apiData, pumpCandidateLimit);
    
    if (topCandidates.length === 0) {
      console.warn('⚠️  Không có token nào để hiển thị');
      return;
    }
    
    console.log(`✅ Đã tính toán top ${pumpCandidateLimit} (theo RiseFallRate):`);
    topCandidates.forEach(token => {
      const percent = (token.riseFallRate * 100).toFixed(2);
      const sign = token.riseFallRate >= 0 ? '+' : '';
      console.log(`   ${token.rank}. ${token.symbol} - ${sign}${percent}%`);
    });

    // Xác định quiet hours mode (dùng cho cả alert thông thường và signal alert)
    const isQuietHoursMode = isQuietHours();

    // 4. Load dữ liệu trước đó để so sánh số lượng RSI oversold và signal alerts đã gửi
    const previousData = await loadTop10();
    const lastSignalAlerts = previousData?.lastSignalAlerts || {};

    // Helper function để tìm token tương ứng trong previousData
    const findPreviousToken = (currentSymbol) => {
      if (!previousData || !previousData.top10 || !Array.isArray(previousData.top10)) {
        return null;
      }
      const baseSymbol = getBaseSymbol(currentSymbol);
      return previousData.top10.find(token => {
        const prevBaseSymbol = getBaseSymbol(token.symbol);
        return prevBaseSymbol === baseSymbol;
      }) || null;
    };

    /**
     * So sánh signal hiện tại với signal đã gửi gần nhất
     * @param {string} symbol - Token symbol
     * @param {Array<string>} currentTimeframes - Timeframes có signal hiện tại
     * @param {Object} lastSignalAlerts - Object chứa signal alerts đã gửi
     * @returns {boolean} true nếu signal giống với lần gần nhất
     */
    const isSameAsLastSignal = (symbol, currentTimeframes, lastSignalAlerts) => {
      if (!lastSignalAlerts || typeof lastSignalAlerts !== 'object') {
        return false;
      }

      const baseSymbol = getBaseSymbol(symbol);
      const lastSignal = lastSignalAlerts[baseSymbol];

      if (!lastSignal || !Array.isArray(lastSignal.timeframes)) {
        return false;
      }

      // So sánh timeframes (sắp xếp để so sánh)
      const currentSorted = [...currentTimeframes].sort();
      const lastSorted = [...lastSignal.timeframes].sort();

      if (currentSorted.length !== lastSorted.length) {
        return false;
      }

      return currentSorted.every((tf, index) => tf === lastSorted[index]);
    };

    /**
     * Lưu signal alert đã gửi
     * @param {string} symbol - Token symbol
     * @param {Array<string>} timeframes - Timeframes có signal
     * @param {Object} lastSignalAlerts - Object chứa signal alerts đã gửi (sẽ được cập nhật)
     */
    const saveSignalAlert = (symbol, timeframes, lastSignalAlerts) => {
      const baseSymbol = getBaseSymbol(symbol);
      lastSignalAlerts[baseSymbol] = {
        timeframes: [...timeframes].sort(),
        timestamp: new Date().toISOString(),
      };
    };

    /**
     * Kiểm tra và xử lý signal alert cho một token
     * @param {Object} tokenWithRSI - Token đã có RSI data
     * @param {Object} previousToken - Token tương ứng trong previousData (có thể null)
     * @param {boolean} isPump - true nếu là pump alert (check overbought), false nếu là drop alert (check oversold)
     * @returns {Promise<Object>} { shouldSend: boolean, reason: string, timeframes: Array<string> }
     */
    const checkSignalAlert = async (tokenWithRSI, previousToken, isPump = true) => {
      const statusType = isPump ? 'overbought' : 'oversold';
      const statusEmoji = isPump ? '🔴' : '🟢';
      
      console.log(`\n   🔍 [${tokenWithRSI.symbol}] Đang kiểm tra signal alert (${isPump ? 'Pump' : 'Drop'})...`);
      
      // Đếm số lượng RSI overbought/oversold hiện tại
      const { overboughtCount, oversoldCount } = countRSIOverboughtOversold(tokenWithRSI.rsi);
      const currentCount = isPump ? overboughtCount : oversoldCount;
      console.log(`   📊 [${tokenWithRSI.symbol}] Số lượng RSI ${statusType} hiện tại: ${currentCount}`);
      
      // Đếm số lượng RSI overbought/oversold trước đó
      const { overboughtCount: prevOverboughtCount, oversoldCount: prevOversoldCount } = previousToken 
        ? countRSIOverboughtOversold(previousToken.rsi) 
        : { overboughtCount: 0, oversoldCount: 0 };
      const previousCount = isPump ? prevOverboughtCount : prevOversoldCount;
      console.log(`   📊 [${tokenWithRSI.symbol}] Số lượng RSI ${statusType} trước đó: ${previousCount} ${previousToken ? '' : '(token mới)'}`);
      
      // Kiểm tra số lượng RSI có tăng không
      const countIncreased = currentCount > previousCount;
      console.log(`   📈 [${tokenWithRSI.symbol}] RSI ${statusType} tăng: ${countIncreased ? '✅ Có' : '❌ Không'}`);
      
      // Kiểm tra token có tối thiểu N RSI overbought/oversold (điều kiện bắt buộc)
      const minRequiredCount = config.signalAlertMinRSICount;
      if (currentCount < minRequiredCount) {
        console.log(`   ⏭️  [${tokenWithRSI.symbol}] Bỏ qua: Chỉ có ${currentCount} RSI ${statusType}, cần tối thiểu ${minRequiredCount}`);
        return { shouldSend: false, reason: `Chỉ có ${currentCount} RSI ${statusType}, cần tối thiểu ${minRequiredCount}`, timeframes: [] };
      }

      // Kiểm tra có 3 mốc RSI >= SUPER_OVER_BOUGHT không (để highlight)
      const superOverboughtCount = isPump 
        ? countSuperOverboughtRSI(tokenWithRSI.rsi)
        : 0; // Chỉ check cho pump alert
      const hasSuperOverbought = superOverboughtCount >= 3;
      if (hasSuperOverbought) {
        console.log(`   🔥 [${tokenWithRSI.symbol}] ⚡ SUPER OVERBOUGHT: ${superOverboughtCount} timeframes có RSI >= ${config.rsiSuperOverboughtThreshold}`);
      }

      const result = {
        shouldSend: false,
        reason: '',
        timeframes: [],
        hasSuperOverbought: hasSuperOverbought, // Flag để highlight
        superOverboughtCount: superOverboughtCount,
        candlestickTimeframes: [],
        divergenceTimeframes: [],
        scoring: null,
      };

      // Check 1: Có nến đảo chiều không?
      // Luôn check tất cả các timeframes được chọn, không lọc theo RSI status
      const targetTimeframes = ['Min5', 'Min15', 'Min30', 'Min60'];
      const statusTimeframes = isPump 
        ? getOverboughtTimeframes(tokenWithRSI.rsi, targetTimeframes)
        : getOversoldTimeframes(tokenWithRSI.rsi, targetTimeframes);
      console.log(`   📊 [${tokenWithRSI.symbol}] Timeframes có RSI ${statusType} trong [Min5, Min15, Min30, Min60]: ${statusTimeframes.length > 0 ? statusTimeframes.join(', ') : 'Không có'}`);
      
      // Kiểm tra tín hiệu đảo chiều từ nến - luôn check tất cả targetTimeframes, không lọc theo RSI
      console.log(`   🔍 [${tokenWithRSI.symbol}] Đang check nến đảo chiều cho: ${targetTimeframes.join(', ')}`);
      const signalResult = await checkReversalSignal(tokenWithRSI, targetTimeframes);
      
      if (signalResult.hasSignal && signalResult.timeframes.length > 0) {
        result.shouldSend = true;
        result.reason = 'Nến đảo chiều';
        result.timeframes = signalResult.timeframes;
        result.candlestickTimeframes = signalResult.timeframes;
        console.log(`   🚨 [${tokenWithRSI.symbol}] ✅ Tín hiệu đảo chiều tại: ${signalResult.timeframes.join(', ')}`);
      } else {
        console.log(`   ⏭️  [${tokenWithRSI.symbol}] Không có nến đảo chiều`);
      }

      // Check 2: RSI có phân kỳ không? (bullish divergence)
      console.log(`   🔍 [${tokenWithRSI.symbol}] Đang check RSI bullish divergence cho: ${targetTimeframes.join(', ')}`);
      const divergenceResult = await checkRsiBullishDivergence(tokenWithRSI, targetTimeframes);

      if (divergenceResult.hasDivergence && divergenceResult.timeframes.length > 0) {
        result.shouldSend = true;
        result.divergenceTimeframes = divergenceResult.timeframes;
        if (result.reason) {
          result.reason += ' + RSI divergence';
        } else {
          result.reason = 'RSI divergence';
        }
        console.log(`   📉 [${tokenWithRSI.symbol}] ✅ RSI bullish divergence tại: ${divergenceResult.timeframes.join(', ')}`);
      } else {
        console.log(`   ⏭️  [${tokenWithRSI.symbol}] Không có RSI bullish divergence`);
      }

      // Check 3: Số lượng RSI overbought/oversold có tăng không?
      if (countIncreased) {
        result.shouldSend = true;
        if (result.reason) {
          result.reason += ` + RSI ${statusType} tăng`;
        } else {
          result.reason = `RSI ${statusType} tăng (${previousCount} → ${currentCount})`;
        }
        console.log(`   📈 [${tokenWithRSI.symbol}] ✅ RSI ${statusType} tăng từ ${previousCount} → ${currentCount}`);
        
        // Nếu chưa có timeframes từ nến đảo chiều, lấy tất cả timeframes có RSI overbought/oversold
        if (result.timeframes.length === 0) {
          result.timeframes = isPump 
            ? getOverboughtTimeframes(tokenWithRSI.rsi)
            : getOversoldTimeframes(tokenWithRSI.rsi);
          result.rsiSignalTimeframes = result.timeframes;
          console.log(`   📊 [${tokenWithRSI.symbol}] Lấy tất cả timeframes có RSI ${statusType}: ${result.timeframes.join(', ')}`);
        }
      } else {
        console.log(`   ⏭️  [${tokenWithRSI.symbol}] RSI ${statusType} không tăng (${previousCount} → ${currentCount})`);
      }

      // Check 4: Kiểm tra xem signal có giống với lần gần nhất không?
      if (result.shouldSend && result.timeframes.length > 0) {
        const isSame = isSameAsLastSignal(tokenWithRSI.symbol, result.timeframes, lastSignalAlerts);
        if (isSame) {
          console.log(`   ⏭️  [${tokenWithRSI.symbol}] Bỏ qua: Signal giống với lần gần nhất (${result.timeframes.join(', ')})`);
          result.shouldSend = false;
          result.reason = 'Signal trùng với lần gần nhất';
        } else {
          console.log(`   ✅ [${tokenWithRSI.symbol}] Sẽ gửi alert (Lý do: ${result.reason}, Timeframes: ${result.timeframes.join(', ')})`);
        }
      } else {
        const reasons = [];
        if (!result.shouldSend) reasons.push('Không thỏa điều kiện');
        if (result.timeframes.length === 0) reasons.push('Không có timeframes');
        console.log(`   ❌ [${tokenWithRSI.symbol}] Không gửi alert: ${reasons.join(', ')}`);
      }

      if (result.shouldSend) {
        result.scoring = calculateSingleSignalScore({
          rsiData: tokenWithRSI.rsi,
          candlestickTimeframes: result.candlestickTimeframes || [],
          divergenceTimeframes: result.divergenceTimeframes || [],
        });

        if (result.scoring) {
          const { total, components } = result.scoring;
          console.log(`   🎯 [${tokenWithRSI.symbol}] Score: ${total.toFixed(1)} (RSI ${components.rsi.toFixed(1)} | Div ${components.divergence.toFixed(1)} | Candle ${components.candle.toFixed(1)})`);
          
          // Kiểm tra tổng điểm có đạt threshold tối thiểu không
          const minTotalScore = config.singleSignalMinTotalScore;
          if (total < minTotalScore) {
            console.log(`   ⏭️  [${tokenWithRSI.symbol}] Bỏ qua: Tổng điểm (${total.toFixed(1)}) < threshold tối thiểu (${minTotalScore})`);
            result.shouldSend = false;
            result.reason = `Tổng điểm (${total.toFixed(1)}) < threshold (${minTotalScore})`;
          }
        }
      }

      return result;
    };

    // 3. Tính RSI cho top 10 tokens và check signal alert ngay khi tính xong mỗi token
    console.log(`\n📊 Đang tính RSI cho top ${pumpCandidateLimit} tokens...`);
    
    // Callback để check và gửi signal alert ngay khi tính RSI xong cho mỗi token
    const onTokenRSIComplete = async (tokenWithRSI, index) => {
      // Chỉ check signal alert nếu có config
      if (!config.telegramSignalTopicId || !config.telegramGroupId) {
        return;
      }

      // Bỏ qua nếu token không có RSI data (có lỗi khi tính RSI)
      if (!tokenWithRSI.rsi || typeof tokenWithRSI.rsi !== 'object' || Object.keys(tokenWithRSI.rsi).length === 0) {
        return;
      }

      try {
        // Tìm token tương ứng trong previousData để so sánh
        const previousToken = findPreviousToken(tokenWithRSI.symbol);
        
        // Kiểm tra signal alert (true = pump alert, check overbought)
        const signalCheck = await checkSignalAlert(tokenWithRSI, previousToken, true);
        
        // Gửi alert nếu thỏa điều kiện
        if (signalCheck.shouldSend && signalCheck.timeframes.length > 0) {
          const sendSuccess = await sendSingleSignalAlert(
            tokenWithRSI, 
            signalCheck.timeframes, 
            isQuietHoursMode,
            signalCheck.reason, // Truyền reason để format message đúng
            signalCheck.hasSuperOverbought, // Truyền flag highlight
            signalCheck.scoring || null,
            {
              candlestickTimeframes: signalCheck.candlestickTimeframes || [],
              divergenceTimeframes: signalCheck.divergenceTimeframes || [],
            }
          );
          if (sendSuccess) {
            console.log(`   ✅ Đã gửi signal alert cho ${tokenWithRSI.symbol} (Lý do: ${signalCheck.reason})`);
            // Lưu signal alert đã gửi để tránh trùng lặp
            saveSignalAlert(tokenWithRSI.symbol, signalCheck.timeframes, lastSignalAlerts);
          }
        }
      } catch (error) {
        console.warn(`   ⚠️  Lỗi khi kiểm tra signal cho ${tokenWithRSI.symbol}:`, error.message);
      }
    };
    
    const topCandidatesWithRSI = await addRSIToTop10(topCandidates, true, onTokenRSIComplete); // true = pump alert
    const top10 = topCandidatesWithRSI.slice(0, 10);
    
    // Log RSI confluence nếu có
    top10.forEach(token => {
      if (token.rsiConfluence && token.rsiConfluence.hasConfluence) {
        const confluenceStatus = token.rsiConfluence.status === 'oversold' ? '🟢 Oversold' : '🔴 Overbought';
        console.log(`   ${token.symbol}: ${confluenceStatus} Confluence (${token.rsiConfluence.count} timeframes)`);
      }
    });

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
      console.log('📝 Lần đầu chạy - Gửi top 10 hiện tại');
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
          console.log('✅ Top 1 thay đổi nhưng nằm trong whitelist, bỏ qua alert');
          console.log(`   Top 1 trước: ${changeInfo.previousTop1 ? changeInfo.previousTop1.symbol : 'N/A'}`);
          console.log(`   Top 1 hiện tại: ${changeInfo.currentTop1 ? changeInfo.currentTop1.symbol : 'N/A'} (trong whitelist)`);
          } else {
            console.log('🚨 Phát hiện thay đổi ở top 1!');
          console.log(`   Top 1 trước: ${changeInfo.previousTop1 ? changeInfo.previousTop1.symbol : 'N/A'}`);
          console.log(`   Top 1 hiện tại: ${changeInfo.currentTop1 ? changeInfo.currentTop1.symbol : 'N/A'}`);
          
          shouldSendAlert = true;
          alertReason = 'Top 1 thay đổi';
        }
        
        // Cập nhật whitelist: thêm top 1 mới vào whitelist (chỉ giữ 3 gần nhất)
        newWhitelist = updateTop1Whitelist(previousData, currentBaseSymbol);
        console.log(`   Whitelist mới: ${newWhitelist.join(', ')}`);
      } else {
        console.log('✅ Không có thay đổi ở top 1');
        // Không thay đổi, giữ nguyên whitelist
        newWhitelist = previousData.top1Whitelist || [];
      }

      // Kiểm tra RSI confluence increase
      // Trigger khi: có ít nhất 1 timeframe lớn (4h, 8h, 1d) HOẶC có ít nhất 3 RSI quá bán
      confluenceInfo = getRSIConfluenceIncreaseInfo(top10, previousData, true); // true = pump alert
      
      if (confluenceInfo.hasIncrease) {
        console.log(`\n📊 Phát hiện RSI Confluence tăng cho ${confluenceInfo.count} token(s):`);
        
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
          
          // Kiểm tra nếu có ít nhất 3 RSI quá bán
          const hasMinOversold = increase.currentConfluence.status === 'oversold' && increase.currentCount >= 3;
          const minOversoldStr = hasMinOversold ? ' [≥3 RSI quá bán]' : '';
          
          console.log(`   🚨 ${increase.token.symbol}: ${statusText} Confluence tăng từ ${increase.previousCount} → ${increase.currentCount} TFs (${timeframesList})${largeTimeframesStr}${minOversoldStr}`);
        });
        
        // Trigger alert khi có confluence increase thỏa điều kiện
        shouldSendAlert = true;
        if (alertReason) {
          alertReason += ' + RSI Confluence tăng';
        } else {
          alertReason = 'RSI Confluence tăng';
        }
      } else {
        console.log('✅ Không có RSI Confluence tăng (hoặc không thỏa điều kiện: có timeframe lớn hoặc ≥3 RSI quá bán)');
      }
    }

    // 6. Gửi alert thông thường nếu cần
    if (shouldSendAlert) {
      if (isQuietHoursMode) {
        console.log(`\n📨 Gửi alert Telegram im lặng (Lý do: ${alertReason}) - Khung giờ 23h-1h`);
      } else {
        console.log(`\n📨 Gửi alert Telegram (Lý do: ${alertReason})`);
      }
      
      // Chỉ truyền confluenceInfo nếu alertReason có chứa "RSI Confluence tăng"
      const infoToSend = alertReason.includes('RSI Confluence tăng') ? confluenceInfo : null;
      await sendTelegramAlert(top10, alertReason, infoToSend, isQuietHoursMode);
    } else {
      console.log('✅ Không có thay đổi đáng kể, bỏ qua alert');
    }

    // Lưu ý: Signal alert đã được gửi ngay trong callback onTokenRSIComplete khi tính RSI xong mỗi token

    // 7. Lưu top 10 mới (có RSI), whitelist và lastSignalAlerts
    await saveTop10(top10, newWhitelist, lastSignalAlerts);

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
  console.log(`   - Overbought (khung lớn - h/d): > ${config.rsiOverboughtThreshold}`);
  console.log(`   - Overbought (khung bé - m): > ${config.rsiOverboughtThresholdSmall}`);
  console.log(`   - Confluence min timeframes: ${config.rsiConfluenceMinTimeframes}`);
  
  if (!config.telegramBotToken || !config.telegramChatId) {
    console.warn('⚠️  Telegram chưa được cấu hình, sẽ không gửi thông báo');
  } else {
    console.log('✅ Telegram đã được cấu hình');
    console.log(`   - Silent mode: ${config.telegramDisableNotification ? '🔇 Bật (không có âm thanh/thông báo)' : '🔔 Tắt (có âm thanh/thông báo)'}`);
  }

  // Chạy ngay lần đầu
  checkPumpTokens();

  // Schedule chạy theo cron
  cron.schedule(config.cronSchedule, () => {
    checkPumpTokens();
  });

  console.log('✅ Scheduler đã được khởi động\n');
}

