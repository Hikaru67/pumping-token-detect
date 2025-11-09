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
 * @returns {string} Message đã format
 */
function formatAlertMessage(top10) {
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

  let message = '*TOP 10 PUMP TOKENS*\n\n';

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
        const timeframeOrder = ['Min1', 'Min5', 'Min15', 'Min30', 'Hour1', 'Hour4', 'Day1', 'Week1', 'Month1'];
        rsiEntries.sort((a, b) => {
          const indexA = timeframeOrder.indexOf(a[0]);
          const indexB = timeframeOrder.indexOf(b[0]);
          return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
        });
        
        // Tạo chuỗi RSI cho các timeframes với format đẹp hơn
        const rsiStrings = rsiEntries.map(([timeframe, rsi]) => {
          const formattedTF = formatTimeframe(timeframe);
          const status = getRSIStatus(rsi);
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
    
    if (token.riseFallValue !== undefined && token.riseFallValue !== null && !isNaN(token.riseFallValue)) {
      message += `   Thay đổi giá trị: ${sign}${token.riseFallValue}\n`;
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
 * Gửi thông báo đến Telegram
 * @param {Array} top10 - Top 10 token
 * @returns {Promise<boolean>} true nếu gửi thành công
 */
export async function sendTelegramAlert(top10) {
  if (!config.telegramBotToken || !config.telegramChatId) {
    console.warn('⚠️  Telegram chưa được cấu hình, bỏ qua việc gửi thông báo');
    return false;
  }

  // Validate input
  if (!Array.isArray(top10) || top10.length === 0) {
    console.warn('⚠️  Không có dữ liệu để gửi');
    return false;
  }

  try {
    const message = formatAlertMessage(top10);
    const TELEGRAM_API_URL = `https://api.telegram.org/bot${config.telegramBotToken}`;
    
    const response = await axios.post(
      `${TELEGRAM_API_URL}/sendMessage`,
      {
        chat_id: config.telegramChatId,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      },
      {
        timeout: 10000,
      }
    );

    if (response.data.ok) {
      console.log('✅ Đã gửi thông báo Telegram thành công');
      return true;
    } else {
      console.error('❌ Lỗi khi gửi Telegram:', response.data.description);
      return false;
    }
  } catch (error) {
    if (error.response) {
      console.error('❌ Lỗi Telegram API:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('❌ Lỗi khi gửi Telegram:', error.message);
      if (error.stack) {
        console.error('Stack trace:', error.stack);
      }
    }
    return false;
  }
}

