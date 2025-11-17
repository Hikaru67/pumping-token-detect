import axios from 'axios';
import { config } from '../config.js';
import { formatTimeframe, getRSIStatus } from '../indicators/rsiCalculator.js';
import { checkReversalSignal } from '../indicators/candlestickPattern.js';

/**
 * Bỏ đuôi _USDT hoặc _USDC trong symbol
 * @param {string} symbol - Symbol gốc
 * @returns {string} Symbol đã bỏ đuôi
 */
function cleanSymbol(symbol) {
  if (!symbol) return '';
  return symbol.replace(/_USDT$|_USDC$/, '');
}

/**
 * Escape Markdown special characters
 * @param {string} text - Text cần escape
 * @returns {string} Text đã escape
 */
function escapeMarkdown(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

/**
 * Format thông báo alert cho Telegram
 * @param {Array} top10 - Top 10 token
 * @param {string} alertReason - Lý do gửi alert (optional)
 * @param {Object} confluenceInfo - Thông tin RSI confluence increase (optional)
 * @returns {string} Message đã format
 */
function formatAlertMessage(top10, alertReason = '', confluenceInfo = null) {
  // Validate input
  if (!Array.isArray(top10) || top10.length === 0) {
    return '⚠️ Không có dữ liệu để hiển thị';
  }

  const timestamp = new Date().toLocaleString('vi-VN', { 
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  let message = '';
  
  // Thêm lý do alert nếu có
  if (alertReason) {
    if (alertReason.includes('RSI Confluence tăng')) {
      message += '📊 *🚨 RSI CONFLUENCE TĂNG 🚨*\n';
      
      // Hiển thị danh sách token thay đổi nếu có
      if (confluenceInfo && confluenceInfo.increases && confluenceInfo.increases.length > 0) {
        const tokenList = confluenceInfo.increases.map(increase => {
          const cleanSymbolName = escapeMarkdown(cleanSymbol(increase.token.symbol));
          return `$${cleanSymbolName}`;
        }).join(', ');
        message += `⚠️ RSI confluence tăng: ${tokenList}\n\n`;
      } else {
        message += '⚠️ RSI confluence tăng\n\n';
      }
    } else if (alertReason.includes('Top 1 thay đổi')) {
      message += '🔄 *🚨 TOP 1 THAY ĐỔI 🚨*\n\n';
    } else if (alertReason.includes('Lần đầu chạy')) {
      message += '📝 *Lần đầu chạy*\n\n';
    }
  } else {
    message += '\n';
  }

  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
  
  top10.forEach((token, index) => {
    const medal = medals[index] || `${index + 1}.`;
    const riseFallPercent = (token.riseFallRate * 100).toFixed(2);
    const sign = token.riseFallRate >= 0 ? '+' : '';
    const cleanSymbolName = escapeMarkdown(cleanSymbol(token.symbol));
    
    message += `${medal} *#${token.rank} $${cleanSymbolName} ${sign}${riseFallPercent}%`;
    
    // Thêm funding rate
    if (token.fundingRate !== undefined && token.fundingRate !== null && !isNaN(token.fundingRate)) {
      const fundingPercent = (token.fundingRate * 100).toFixed(4);
      const fundingSign = token.fundingRate >= 0 ? '+' : '';
      message += ` 💹 Funding Rate: ${fundingSign}${fundingPercent}%`;
    }
    message += `\n`;
    
    // Hiển thị RSI - luôn hiển thị nếu có dữ liệu
    if (token.rsi && typeof token.rsi === 'object') {
      const rsiEntries = Object.entries(token.rsi).filter(([_, rsi]) => rsi !== null && !isNaN(rsi));
      
      if (rsiEntries.length > 0) {
        // Sắp xếp RSI entries theo thứ tự timeframe (từ nhỏ đến lớn)
        const timeframeOrder = ['Min1', 'Min5', 'Min15', 'Min30', 'Min60', 'Hour1', 'Hour4', 'Hour8', 'Day1', 'Week1', 'Month1'];
        rsiEntries.sort((a, b) => {
          const indexA = timeframeOrder.indexOf(a[0]);
          const indexB = timeframeOrder.indexOf(b[0]);
          return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
        });
        
        // Tạo chuỗi RSI cho các timeframes với format ngắn gọn
        const rsiStrings = rsiEntries.map(([timeframe, rsi]) => {
          const formattedTF = formatTimeframe(timeframe);
          const status = getRSIStatus(rsi, timeframe);
          let emoji = '⚪️'; // neutral
          let rsiValue = rsi.toFixed(1);
          
          if (status === 'oversold') {
            emoji = '🟢'; // oversold (có thể mua vào)
            rsiValue = `*${rsiValue}*`; // Bold cho oversold
          } else if (status === 'overbought') {
            emoji = '🔴'; // overbought (có thể bán ra)
            rsiValue = `*${rsiValue}*`; // Bold cho overbought
          }
          
          return `${formattedTF}${emoji}${rsiValue}`;
        });
        
        message += `   📊 RSI: ${rsiStrings.join(' • ')}\n`;
      } else {
        // Nếu không có RSI data, thông báo
        message += `   📊 RSI: ⚠️ Không có dữ liệu\n`;
      }
    } else {
      // Nếu không có RSI object, thông báo
      message += `   📊 RSI: ⚠️ Chưa tính toán\n`;
    }
    
    message += `\n`;
  });

  // Kiểm tra độ dài message (Telegram limit: 4096 characters)
  if (message.length > 4096) {
    console.warn('⚠️  Message quá dài, sẽ bị cắt bớt');
    message = message.substring(0, 4090) + '...';
  }

  return message;
}

/**
 * Format số lớn (ví dụ: 1000000 -> 1M)
 * @param {number} num - Số cần format
 * @returns {string} Số đã format
 */
function formatNumber(num) {
  if (typeof num !== 'number' || isNaN(num)) {
    return '0';
  }
  
  const absNum = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  
  if (absNum >= 1000000000) {
    return sign + (absNum / 1000000000).toFixed(2) + 'B';
  }
  if (absNum >= 1000000) {
    return sign + (absNum / 1000000).toFixed(2) + 'M';
  }
  if (absNum >= 1000) {
    return sign + (absNum / 1000).toFixed(2) + 'K';
  }
  return sign + absNum.toString();
}

/**
 * Format thông báo alert cho Drop Tokens
 * @param {Array} top10 - Top 10 drop tokens
 * @param {string} alertReason - Lý do gửi alert (optional)
 * @param {Object} confluenceInfo - Thông tin RSI confluence increase (optional)
 * @returns {string} Message đã format
 */
function formatDropAlertMessage(top10, alertReason = '', confluenceInfo = null) {
  // Validate input
  if (!Array.isArray(top10) || top10.length === 0) {
    return '⚠️ Không có dữ liệu để hiển thị';
  }

  const timestamp = new Date().toLocaleString('vi-VN', { 
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  let message = '';
  
  // Thêm lý do alert nếu có
  if (alertReason) {
    if (alertReason.includes('RSI Confluence tăng')) {
      message += '⚠️ RSI CONFLUENCE TĂNG';
      
      // Hiển thị danh sách token thay đổi nếu có
      if (confluenceInfo && confluenceInfo.increases && confluenceInfo.increases.length > 0) {
        const tokenList = confluenceInfo.increases.map(increase => {
          const cleanSymbolName = escapeMarkdown(cleanSymbol(increase.token.symbol));
          return `$${cleanSymbolName}`;
        }).join(', ');
        message += `: ${tokenList}\n\n`;
      } else {
        message += '\n\n';
      }
    } else if (alertReason.includes('Top 1 thay đổi')) {
      message += '🔄 *🚨 TOP 1 THAY ĐỔI 🚨*\n\n';
    } else if (alertReason.includes('Lần đầu chạy')) {
      message += '📝 *Lần đầu chạy*\n\n';
    }
  } else {
    message += '\n';
  }

  const medals = ['🔻', '🔻', '🔻', '🔻', '🔻', '🔻', '🔻', '🔻', '🔻', '🔻'];
  
  top10.forEach((token, index) => {
    const medal = medals[index] || `${index + 1}.`;
    const riseFallPercent = (token.riseFallRate * 100).toFixed(2);
    const sign = token.riseFallRate >= 0 ? '+' : '';
    const cleanSymbolName = escapeMarkdown(cleanSymbol(token.symbol));
    
    message += `${medal} *#${token.rank} $${cleanSymbolName}*\n`;
    message += `   Biến động: *${sign}${riseFallPercent}%*\n`;
    
    // Thêm funding rate
    if (token.fundingRate !== undefined && token.fundingRate !== null && !isNaN(token.fundingRate)) {
      const fundingPercent = (token.fundingRate * 100).toFixed(4);
      const fundingSign = token.fundingRate >= 0 ? '+' : '';
      message += `   Funding Rate: ${fundingSign}${fundingPercent}%\n`;
    }
    
    // Hiển thị RSI - luôn hiển thị nếu có dữ liệu
    if (token.rsi && typeof token.rsi === 'object') {
      const rsiEntries = Object.entries(token.rsi).filter(([_, rsi]) => rsi !== null && !isNaN(rsi));
      
      if (rsiEntries.length > 0) {
        // Sắp xếp RSI entries theo thứ tự timeframe (từ nhỏ đến lớn)
        const timeframeOrder = ['Min1', 'Min5', 'Min15', 'Min30', 'Min60', 'Hour1', 'Hour4', 'Hour8', 'Day1', 'Week1', 'Month1'];
        rsiEntries.sort((a, b) => {
          const indexA = timeframeOrder.indexOf(a[0]);
          const indexB = timeframeOrder.indexOf(b[0]);
          return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
        });
        
        // Tạo chuỗi RSI cho các timeframes với format đẹp hơn
        const rsiStrings = rsiEntries.map(([timeframe, rsi]) => {
          const formattedTF = formatTimeframe(timeframe);
          const status = getRSIStatus(rsi, timeframe);
          let emoji = '⚪'; // neutral
          let rsiValue = rsi.toFixed(1);
          
          if (status === 'oversold') {
            emoji = '🟢'; // oversold (có thể mua vào)
            rsiValue = `*${rsiValue}*`; // Bold cho oversold
          } else if (status === 'overbought') {
            emoji = '🔴'; // overbought (có thể bán ra)
            rsiValue = `*${rsiValue}*`; // Bold cho overbought
          }
          
          return `${formattedTF}${emoji}${rsiValue}`;
        });
        
        message += `   📊 RSI: ${rsiStrings.join(' • ')}\n`;
        
        // Hiển thị confluence nếu có (nổi bật hơn)
        if (token.rsiConfluence && token.rsiConfluence.hasConfluence) {
          const confluenceEmoji = token.rsiConfluence.status === 'oversold' ? '🟢' : '🔴';
          const confluenceText = token.rsiConfluence.status === 'oversold' 
            ? 'OVERSOLD CONFLUENCE ⬆️' 
            : 'OVERBOUGHT CONFLUENCE ⬇️';
          const timeframesList = token.rsiConfluence.timeframes.map(tf => formatTimeframe(tf)).join(', ');
          
          message += `   ${confluenceEmoji} *${confluenceText}* \\(${token.rsiConfluence.count} TFs: ${timeframesList}\\)\n`;
        }
      } else {
        // Nếu không có RSI data, thông báo
        message += `   📊 RSI: ⚠️ Không có dữ liệu\n`;
      }
    } else {
      // Nếu không có RSI object, thông báo
      message += `   📊 RSI: ⚠️ Chưa tính toán\n`;
    }
    
    if (token.high24Price > 0 && token.lower24Price > 0) {
      message += `   Giá 24h: ${token.lower24Price} → ${token.high24Price}\n`;
    }
    
    if (token.lastPrice > 0) {
      message += `   Giá hiện tại: ${token.lastPrice}\n`;
    }
    
    message += `   Volume 24h: ${formatNumber(token.volume24)}\n\n`;
  });

  message += `⏰ Thời gian: ${timestamp}`;

  // Kiểm tra độ dài message (Telegram limit: 4096 characters)
  if (message.length > 4096) {
    console.warn('⚠️  Message quá dài, sẽ bị cắt bớt');
    message = message.substring(0, 4090) + '...';
  }

  return message;
}

/**
 * Format thông báo signal alert cho các token có tín hiệu đảo chiều
 * @param {Array} signalTokens - Mảng các token có tín hiệu đảo chiều
 * @returns {string} Message đã format
 */
function formatSignalAlertMessage(signalTokens) {
  if (!Array.isArray(signalTokens) || signalTokens.length === 0) {
    return '⚠️ Không có dữ liệu signal để hiển thị';
  }

  const timestamp = new Date().toLocaleString('vi-VN', { 
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  let message = '🔄 *🚨 TÍN HIỆU ĐẢO CHIỀU 🚨*\n\n';
  
  signalTokens.forEach((item, index) => {
    const { token, signalTimeframes } = item;
    const cleanSymbolName = escapeMarkdown(cleanSymbol(token.symbol));
    const riseFallPercent = (token.riseFallRate * 100).toFixed(2);
    const sign = token.riseFallRate >= 0 ? '+' : '';
    
    message += `*${index + 1}. $${cleanSymbolName}*\n`;
    message += `   Biến động: *${sign}${riseFallPercent}%*\n`;
    
    // Hiển thị RSI oversold cho các timeframes có signal
    const rsiStrings = signalTimeframes.map(tf => {
      const rsi = token.rsi[tf];
      if (rsi === null || rsi === undefined || isNaN(rsi)) return null;
      const formattedTF = formatTimeframe(tf);
      return `${formattedTF}🟢*${rsi.toFixed(1)}*`;
    }).filter(Boolean);
    
    if (rsiStrings.length > 0) {
      message += `   📊 RSI Oversold: ${rsiStrings.join(' • ')}\n`;
    }
    
    // Hiển thị timeframes có signal
    const tfList = signalTimeframes.map(tf => formatTimeframe(tf)).join(', ');
    message += `   🔄 Tín hiệu đảo chiều: ${tfList}\n`;
    
    if (token.lastPrice > 0) {
      message += `   Giá hiện tại: ${token.lastPrice}\n`;
    }
    
    message += `   Volume 24h: ${formatNumber(token.volume24)}\n\n`;
  });

  message += `⏰ Thời gian: ${timestamp}`;

  // Kiểm tra độ dài message (Telegram limit: 4096 characters)
  if (message.length > 4096) {
    console.warn('⚠️  Signal message quá dài, sẽ bị cắt bớt');
    message = message.substring(0, 4090) + '...';
  }

  return message;
}

/**
 * Format message cho một token có signal
 * @param {Object} token - Token object
 * @param {Array<string>} signalTimeframes - Các timeframes có signal
 * @param {string} reason - Lý do alert (optional, để phân biệt nến đảo chiều hay RSI tăng)
 * @param {boolean} hasSuperOverbought - Flag để highlight khi có 3+ RSI >= SUPER_OVER_BOUGHT
 * @returns {string} Formatted message
 */
function formatSingleSignalMessage(token, signalTimeframes, reason = '', hasSuperOverbought = false) {
  if (!token || !token.symbol) {
    return '';
  }

  const cleanSymbolName = cleanSymbol(token.symbol);
  const timestamp = new Date().toLocaleString('vi-VN', { 
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  
  let message = ``;
  
  // Highlight nếu có 3+ RSI >= SUPER_OVER_BOUGHT
  if (hasSuperOverbought) {
    message += `🔥 *⚡ SUPER OVERBOUGHT ⚡*\n`;
  }
  
  message += `*$${cleanSymbolName}*\n`;
  
  // Hiển thị đầy đủ tất cả RSI timeframes (giống format alert thông thường)
  if (token.rsi && typeof token.rsi === 'object') {
    const rsiEntries = Object.entries(token.rsi).filter(([_, rsi]) => rsi !== null && !isNaN(rsi));
    
    if (rsiEntries.length > 0) {
      // Sắp xếp RSI entries theo thứ tự timeframe (từ nhỏ đến lớn)
      const timeframeOrder = ['Min1', 'Min5', 'Min15', 'Min30', 'Min60', 'Hour1', 'Hour4', 'Hour8', 'Day1', 'Week1', 'Month1'];
      rsiEntries.sort((a, b) => {
        const indexA = timeframeOrder.indexOf(a[0]);
        const indexB = timeframeOrder.indexOf(b[0]);
        return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
      });
      
      // Tạo chuỗi RSI cho các timeframes với format đẹp hơn
      const rsiStrings = rsiEntries.map(([timeframe, rsi]) => {
        const formattedTF = formatTimeframe(timeframe);
        const status = getRSIStatus(rsi, timeframe);
        let emoji = '⚪'; // neutral
        let rsiValue = rsi.toFixed(1);
        
        // Đánh dấu các timeframes có signal
        const hasSignal = signalTimeframes.includes(timeframe);
        
        if (status === 'oversold') {
          emoji = '🟢'; // oversold (có thể mua vào)
          rsiValue = `*${rsiValue}*`; // Bold cho oversold
        } else if (status === 'overbought') {
          emoji = '🔴'; // overbought (có thể bán ra)
          rsiValue = `*${rsiValue}*`; // Bold cho overbought
        }
        
        // Thêm dấu hiệu nếu có signal đảo chiều
        const signalMark = hasSignal ? '🔄' : '';
        
        return `${formattedTF}${emoji}${rsiValue}${signalMark}`;
      });
      
      message += `📊 RSI: ${rsiStrings.join(' • ')}\n`;
      
      // Hiển thị confluence nếu có
      if (token.rsiConfluence && token.rsiConfluence.hasConfluence) {
        const confluenceEmoji = token.rsiConfluence.status === 'oversold' ? '🟢' : '🔴';
        const confluenceText = token.rsiConfluence.status === 'oversold' 
          ? 'OVERSOLD CONFLUENCE ⬆️' 
          : 'OVERBOUGHT CONFLUENCE ⬇️';
        const timeframesList = token.rsiConfluence.timeframes.map(tf => formatTimeframe(tf)).join(', ');
        
        message += `${confluenceEmoji} *${confluenceText}* \\(${token.rsiConfluence.count} TFs: ${timeframesList}\\)\n`;
      }
      
      // Hiển thị timeframes có signal
      if (signalTimeframes && signalTimeframes.length > 0) {
        const tfList = signalTimeframes.map(tf => formatTimeframe(tf)).join(', ');
        // Chỉ hiển thị "Tín hiệu đảo chiều" nếu thực sự có nến đảo chiều
        if (reason && reason.includes('Nến đảo chiều')) {
          message += `🔄 *Tín hiệu đảo chiều:* ${tfList}\n`;
        } else {
          // Nếu là RSI tăng, hiển thị timeframes có RSI overbought/oversold
          message += `📊 *Timeframes có RSI:* ${tfList}\n`;
        }
      }
    } else {
      message += `📊 RSI: ⚠️ Không có dữ liệu\n`;
    }
  } else {
    message += `📊 RSI: ⚠️ Chưa tính toán\n`;
  }
  
  // Thông tin giá và volume
  if (token.high24Price > 0 && token.lower24Price > 0) {
    message += `💰 Giá 24h: ${token.lower24Price} → ${token.high24Price}\n`;
  }
  
  if (token.lastPrice > 0) {
    message += `💰 Giá hiện tại: ${token.lastPrice}\n`;
  }
  
  if (token.riseFallRate !== undefined) {
    const sign = token.riseFallRate >= 0 ? '+' : '';
    const percent = Math.abs(token.riseFallRate * 100).toFixed(2);
    message += `📈 Biến động 24h: ${sign}${percent}%\n`;
  }
  
  // Funding rate nếu có
  if (token.fundingRate !== undefined && token.fundingRate !== null && !isNaN(token.fundingRate)) {
    const fundingPercent = (token.fundingRate * 100).toFixed(4);
    const fundingSign = token.fundingRate >= 0 ? '+' : '';
    message += `💹 Funding Rate: ${fundingSign}${fundingPercent}%\n`;
  }
  
  if (token.volume24) {
    message += `📊 Volume 24h: ${formatNumber(token.volume24)}\n`;
  }
  
  message += `\n⏰ ${timestamp}`;
  
  return message;
}

/**
 * Gửi signal alert cho một token riêng lẻ (gửi ngay khi phát hiện)
 * Gửi vào cả channel (TELEGRAM_CHAT_ID) và group topic (TELEGRAM_SIGNAL_TOPIC_ID) nếu có config
 * @param {Object} token - Token object có tín hiệu đảo chiều
 * @param {Array<string>} signalTimeframes - Các timeframes có signal
 * @param {boolean} forceSilent - Bắt buộc gửi ở chế độ im lặng
 * @param {string} reason - Lý do alert (optional, để format message đúng)
 * @param {boolean} hasSuperOverbought - Flag để highlight khi có 3+ RSI >= SUPER_OVER_BOUGHT
 * @returns {Promise<boolean>} true nếu gửi thành công ít nhất một destination
 */
export async function sendSingleSignalAlert(token, signalTimeframes, forceSilent = false, reason = '', hasSuperOverbought = false) {
  if (!config.telegramBotToken) {
    return false;
  }

  if (!token || !signalTimeframes || signalTimeframes.length === 0) {
    return false;
  }

  // Kiểm tra có ít nhất một destination để gửi
  const hasChannel = config.telegramChatId && config.telegramChatId.trim() !== '';
  const hasGroupTopic = config.telegramGroupId && config.telegramSignalTopicId;

  if (!hasChannel && !hasGroupTopic) {
    console.warn(`⚠️  Không có destination để gửi signal alert cho ${token.symbol}`);
    return false;
  }

  try {
    const message = formatSingleSignalMessage(token, signalTimeframes, reason, hasSuperOverbought);
    const disableNotification = forceSilent ? true : config.telegramDisableNotification;
    
    let channelSuccess = false;
    let topicSuccess = false;

    // Gửi vào channel nếu có config
    if (hasChannel) {
      try {
        channelSuccess = await sendToTelegramChat(
          config.telegramChatId,
          message,
          null, // Channel không có topic
          disableNotification
        );
        if (channelSuccess) {
          console.log(`✅ Đã gửi signal alert cho ${token.symbol} vào channel ${config.telegramChatId}`);
        }
      } catch (error) {
        console.error(`❌ Lỗi khi gửi signal alert cho ${token.symbol} vào channel:`, error.message);
      }
    }

    // Gửi vào group topic nếu có config
    if (hasGroupTopic) {
      try {
        topicSuccess = await sendToTelegramChat(
          config.telegramGroupId,
          message,
          config.telegramSignalTopicId,
          disableNotification
        );
        if (topicSuccess) {
          console.log(`✅ Đã gửi signal alert cho ${token.symbol} vào topic ${config.telegramSignalTopicId}`);
        }
      } catch (error) {
        console.error(`❌ Lỗi khi gửi signal alert cho ${token.symbol} vào topic:`, error.message);
      }
    }

    const overallSuccess = channelSuccess || topicSuccess;
    if (!overallSuccess) {
      console.error(`❌ Không thể gửi signal alert cho ${token.symbol} vào bất kỳ destination nào`);
    }

    return overallSuccess;
  } catch (error) {
    console.error(`❌ Lỗi khi gửi signal alert cho ${token.symbol}:`, error.message);
    return false;
  }
}

/**
 * Gửi signal alert vào topic signal (batch - nhiều token cùng lúc)
 * @param {Array} signalTokens - Mảng các token có tín hiệu đảo chiều
 * @param {boolean} forceSilent - Bắt buộc gửi ở chế độ im lặng
 * @returns {Promise<boolean>} true nếu gửi thành công
 */
export async function sendSignalAlert(signalTokens, forceSilent = false) {
  if (!config.telegramBotToken || !config.telegramGroupId || !config.telegramSignalTopicId) {
    return false;
  }

  if (!Array.isArray(signalTokens) || signalTokens.length === 0) {
    return false;
  }

  try {
    const message = formatSignalAlertMessage(signalTokens);
    const disableNotification = forceSilent ? true : config.telegramDisableNotification;
    
    const success = await sendToTelegramChat(
      config.telegramGroupId,
      message,
      config.telegramSignalTopicId,
      disableNotification
    );

    if (success) {
      console.log(`✅ Đã gửi signal alert (batch) cho ${signalTokens.length} token(s) vào topic ${config.telegramSignalTopicId}`);
    } else {
      console.error(`❌ Lỗi khi gửi signal alert (batch) vào topic ${config.telegramSignalTopicId}`);
    }

    return success;
  } catch (error) {
    console.error('❌ Lỗi khi gửi signal alert (batch):', error.message);
    return false;
  }
}

/**
 * Kiểm tra topic ID có hợp lệ không
 * @param {number|null|undefined} topicId - Topic ID
 * @returns {boolean} true nếu topic ID hợp lệ
 */
function isValidTopicId(topicId) {
  return topicId !== null && topicId !== undefined && !isNaN(topicId);
}

/**
 * Gửi message đến một chat/topic cụ thể
 * @param {string} chatId - Chat ID
 * @param {string} message - Message content
 * @param {number|null} topicId - Topic ID (optional)
 * @param {boolean} disableNotification - Silent mode
 * @returns {Promise<boolean>} true nếu gửi thành công
 */
async function sendToTelegramChat(chatId, message, topicId = null, disableNotification = false) {
  if (!config.telegramBotToken || !chatId) {
    return false;
  }

  try {
    const TELEGRAM_API_URL = `https://api.telegram.org/bot${config.telegramBotToken}`;
    
    const payload = {
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      disable_notification: disableNotification,
    };
    
    // Thêm message_thread_id nếu có topic ID
    if (isValidTopicId(topicId)) {
      payload.message_thread_id = topicId;
    }
    
    const response = await axios.post(
      `${TELEGRAM_API_URL}/sendMessage`,
      payload,
      {
        timeout: 10000,
      }
    );

    return response.data.ok;
  } catch (error) {
    if (error.response) {
      console.error('❌ Lỗi Telegram API:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('❌ Lỗi khi gửi Telegram:', error.message);
    }
    return false;
  }
}

/**
 * Gửi alert đến nhiều địa chỉ (channel và topic)
 * @param {string} message - Message content
 * @param {Object} options - Options object
 * @param {string} options.channelId - Channel ID để gửi (optional)
 * @param {string} options.topicChatId - Group ID để gửi vào topic (optional)
 * @param {number|null} options.topicId - Topic ID (optional)
 * @param {boolean} options.disableNotification - Silent mode
 * @param {string} options.label - Label cho log (ví dụ: "Pump" hoặc "Drop")
 * @returns {Promise<boolean>} true nếu ít nhất 1 nơi gửi thành công
 */
async function sendToMultipleDestinations(message, options) {
  const { channelId, topicChatId, topicId, disableNotification, label = '' } = options;
  
  const hasChannel = channelId && channelId.trim() !== '';
  const hasTopic = isValidTopicId(topicId) && topicChatId && topicChatId.trim() !== '';

  if (!hasChannel && !hasTopic) {
    return false;
  }

  let successCount = 0;

  // Gửi vào channel (nếu có)
  if (hasChannel) {
    const success = await sendToTelegramChat(channelId, message, null, disableNotification);
    if (success) {
      successCount++;
      const labelText = label ? `${label} ` : '';
      console.log(`✅ Đã gửi thông báo ${labelText}Telegram vào channel: ${channelId}`);
    } else {
      const labelText = label ? `${label} ` : '';
      console.error(`❌ Lỗi khi gửi ${labelText}vào channel: ${channelId}`);
    }
  }

  // Gửi vào group topic (nếu có)
  if (hasTopic) {
    const success = await sendToTelegramChat(topicChatId, message, topicId, disableNotification);
    if (success) {
      successCount++;
      const labelText = label ? `${label} ` : '';
      console.log(`✅ Đã gửi thông báo ${labelText}Telegram vào topic ${topicId} trong group: ${topicChatId}`);
    } else {
      const labelText = label ? `${label} ` : '';
      console.error(`❌ Lỗi khi gửi ${labelText}vào topic ${topicId} trong group: ${topicChatId}`);
    }
  }

  return successCount > 0;
}

export async function sendTelegramAlert(top10, alertReason = '', confluenceInfo = null, forceSilent = false) {
  if (!config.telegramBotToken) {
    console.warn('⚠️  Telegram Bot Token chưa được cấu hình, bỏ qua việc gửi thông báo');
    return false;
  }

  // Validate input
  if (!Array.isArray(top10) || top10.length === 0) {
    console.warn('⚠️  Không có dữ liệu để gửi');
    return false;
  }

  // Xác định các địa chỉ gửi
  const channelId = config.telegramChatId; // Channel ID (channel riêng)
  const groupId = config.telegramGroupId; // Group ID (để gửi vào topic)

  if (!channelId && !groupId) {
    console.warn('⚠️  Chưa cấu hình Telegram Chat ID (channel) hoặc Group ID, bỏ qua việc gửi thông báo');
    return false;
  }

  try {
    const message = formatAlertMessage(top10, alertReason, confluenceInfo);
    const disableNotification = forceSilent ? true : config.telegramDisableNotification;
    
    return await sendToMultipleDestinations(message, {
      channelId,
      topicChatId: groupId,
      topicId: config.telegramTopicId,
      disableNotification,
      label: 'Pump',
    });
  } catch (error) {
    console.error('❌ Lỗi khi gửi Telegram:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    return false;
  }
}

/**
 * Gửi thông báo Drop Tokens đến Telegram channel riêng
 * @param {Array} top10 - Top 10 drop tokens
 * @param {string} alertReason - Lý do gửi alert (optional)
 * @param {Object} confluenceInfo - Thông tin RSI confluence increase (optional)
 * @param {boolean} forceSilent - Bắt buộc gửi ở chế độ im lặng (override config)
 * @returns {Promise<boolean>} true nếu gửi thành công
 */
export async function sendTelegramDropAlert(top10, alertReason = '', confluenceInfo = null, forceSilent = false) {
  if (!config.telegramBotToken) {
    console.warn('⚠️  Telegram Bot Token chưa được cấu hình, bỏ qua việc gửi thông báo drop');
    return false;
  }

  // Validate input
  if (!Array.isArray(top10) || top10.length === 0) {
    console.warn('⚠️  Không có dữ liệu drop để gửi');
    return false;
  }

  // Xác định các địa chỉ gửi cho drop
  const dropChannelId = config.telegramDropChatId; // Channel ID cho drop (channel riêng)
  const dropGroupId = config.telegramDropGroupId; // Group ID cho drop (để gửi vào topic)

  if (!dropChannelId && !dropGroupId) {
    console.warn('⚠️  Chưa cấu hình Telegram Drop Chat ID (channel) hoặc Group ID, bỏ qua việc gửi thông báo drop');
    return false;
  }

  try {
    const message = formatDropAlertMessage(top10, alertReason, confluenceInfo);
    const disableNotification = forceSilent ? true : config.telegramDropDisableNotification;
    
    return await sendToMultipleDestinations(message, {
      channelId: dropChannelId,
      topicChatId: dropGroupId,
      topicId: config.telegramDropTopicId,
      disableNotification,
      label: 'Drop',
    });
  } catch (error) {
    console.error('❌ Lỗi khi gửi Drop Telegram:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    return false;
  }
}

