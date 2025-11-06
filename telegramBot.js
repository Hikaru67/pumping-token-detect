import axios from 'axios';
import { config } from './config.js';

const TELEGRAM_API_URL = `https://api.telegram.org/bot${config.telegramBotToken}`;

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
 * Format thông báo alert cho Telegram
 * @param {Array} top10 - Top 10 token
 * @returns {string} Message đã format
 */
function formatAlertMessage(top10) {
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
    const cleanSymbolName = cleanSymbol(token.symbol);
    
    message += `${medal} *#${token.rank} $${cleanSymbolName}*\n`;
    message += `   Biến động: *${sign}${riseFallPercent}%*\n`;
    
    // Thêm funding rate
    if (token.fundingRate !== undefined && token.fundingRate !== null) {
      const fundingPercent = (token.fundingRate * 100).toFixed(4);
      const fundingSign = token.fundingRate >= 0 ? '+' : '';
      message += `   Funding Rate: ${fundingSign}${fundingPercent}%\n`;
    }
    
    if (token.riseFallValue !== undefined && token.riseFallValue !== null) {
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

  return message;
}

/**
 * Format số lớn (ví dụ: 1000000 -> 1M)
 * @param {number} num - Số cần format
 * @returns {string} Số đã format
 */
function formatNumber(num) {
  if (num >= 1000000000) {
    return (num / 1000000000).toFixed(2) + 'B';
  }
  if (num >= 1000000) {
    return (num / 1000000).toFixed(2) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(2) + 'K';
  }
  return num.toString();
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

  try {
    const message = formatAlertMessage(top10);
    
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

