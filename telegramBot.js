import axios from 'axios';
import { config } from './config.js';
import { formatTimeframe, getRSIStatus } from './rsiCalculator.js';

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
    if (topicId !== null && topicId !== undefined && !isNaN(topicId)) {
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
  const channelId = config.telegramChannelId || config.telegramChatId; // Channel cũ (ưu tiên telegramChannelId nếu có)
  const topicChatId = config.telegramTopicChatId || config.telegramChatId; // Group để gửi vào topic
  const hasChannel = channelId && channelId.trim() !== '';
  const hasTopic = config.telegramTopicId !== null && config.telegramTopicId !== undefined && !isNaN(config.telegramTopicId) && topicChatId && topicChatId.trim() !== '';

  if (!hasChannel && !hasTopic) {
    console.warn('⚠️  Chưa cấu hình Telegram Chat ID hoặc Topic, bỏ qua việc gửi thông báo');
    return false;
  }

  try {
    const message = formatAlertMessage(top10, alertReason, confluenceInfo);
    const disableNotification = forceSilent ? true : config.telegramDisableNotification;
    
    let successCount = 0;
    let totalAttempts = 0;

    // Gửi vào channel cũ (nếu có)
    if (hasChannel) {
      totalAttempts++;
      const success = await sendToTelegramChat(channelId, message, null, disableNotification);
      if (success) {
        successCount++;
        console.log(`✅ Đã gửi thông báo Telegram vào channel: ${channelId}`);
      } else {
        console.error(`❌ Lỗi khi gửi vào channel: ${channelId}`);
      }
    }

    // Gửi vào group topic mới (nếu có)
    if (hasTopic) {
      totalAttempts++;
      const success = await sendToTelegramChat(topicChatId, message, config.telegramTopicId, disableNotification);
      if (success) {
        successCount++;
        console.log(`✅ Đã gửi thông báo Telegram vào topic ${config.telegramTopicId} trong group: ${topicChatId}`);
      } else {
        console.error(`❌ Lỗi khi gửi vào topic ${config.telegramTopicId} trong group: ${topicChatId}`);
      }
    }

    // Trả về true nếu ít nhất 1 nơi gửi thành công
    return successCount > 0;
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
  const dropChannelId = config.telegramDropChannelId || config.telegramDropChatId; // Channel cũ (ưu tiên telegramDropChannelId nếu có)
  const dropTopicChatId = config.telegramDropTopicChatId || config.telegramDropChatId; // Group để gửi vào topic
  const hasDropChannel = dropChannelId && dropChannelId.trim() !== '';
  const hasDropTopic = config.telegramDropTopicId !== null && config.telegramDropTopicId !== undefined && !isNaN(config.telegramDropTopicId) && dropTopicChatId && dropTopicChatId.trim() !== '';

  if (!hasDropChannel && !hasDropTopic) {
    console.warn('⚠️  Chưa cấu hình Telegram Drop Chat ID hoặc Topic, bỏ qua việc gửi thông báo drop');
    return false;
  }

  try {
    const message = formatDropAlertMessage(top10, alertReason, confluenceInfo);
    const disableNotification = forceSilent ? true : config.telegramDropDisableNotification;
    
    let successCount = 0;
    let totalAttempts = 0;

    // Gửi vào channel cũ (nếu có)
    if (hasDropChannel) {
      totalAttempts++;
      const success = await sendToTelegramChat(dropChannelId, message, null, disableNotification);
      if (success) {
        successCount++;
        console.log(`✅ Đã gửi thông báo Drop Telegram vào channel: ${dropChannelId}`);
      } else {
        console.error(`❌ Lỗi khi gửi Drop vào channel: ${dropChannelId}`);
      }
    }

    // Gửi vào group topic mới (nếu có)
    if (hasDropTopic) {
      totalAttempts++;
      const success = await sendToTelegramChat(dropTopicChatId, message, config.telegramDropTopicId, disableNotification);
      if (success) {
        successCount++;
        console.log(`✅ Đã gửi thông báo Drop Telegram vào topic ${config.telegramDropTopicId} trong group: ${dropTopicChatId}`);
      } else {
        console.error(`❌ Lỗi khi gửi Drop vào topic ${config.telegramDropTopicId} trong group: ${dropTopicChatId}`);
      }
    }

    // Trả về true nếu ít nhất 1 nơi gửi thành công
    return successCount > 0;
  } catch (error) {
    console.error('❌ Lỗi khi gửi Drop Telegram:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    return false;
  }
}

