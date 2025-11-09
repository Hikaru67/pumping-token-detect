import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // MEXC API
  mexcApiUrl: process.env.MEXC_API_URL || 'https://futures.mexc.com/api/v1/contract/ticker',
  
  // Telegram Bot
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
  
  // Scheduler
  cronSchedule: process.env.CRON_SCHEDULE || '*/1 * * * *', // Mỗi 1 phút
  
  // Storage
  dataDir: process.env.DATA_DIR || './data',
  historyFile: process.env.HISTORY_FILE || './data/top10_history.json',
  
  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
  
  // RSI Configuration
  // Các khung thời gian để tính RSI (ví dụ: '1m', '5m', '15m', '1h', '4h', '1d')
  // MEXC hỗ trợ: Min1, Min5, Min15, Min30, Hour1, Hour4, Day1, Week1, Month1
  rsiTimeframes: process.env.RSI_TIMEFRAMES 
    ? process.env.RSI_TIMEFRAMES.split(',').map(tf => tf.trim())
    : ['Min15', 'Min30', 'Hour1', 'Hour4'], // Mặc định: 15m, 30m, 1h, 4h
  
  // RSI Period (số chu kỳ để tính RSI, mặc định là 14)
  rsiPeriod: parseInt(process.env.RSI_PERIOD || '14', 10),
  
  // RSI Confluence thresholds
  // RSI < oversoldThreshold: oversold (mua vào)
  // RSI > overboughtThreshold: overbought (bán ra)
  rsiOversoldThreshold: parseFloat(process.env.RSI_OVERSOLD_THRESHOLD || '30', 10),
  rsiOverboughtThreshold: parseFloat(process.env.RSI_OVERBOUGHT_THRESHOLD || '70', 10),
  
  // Số lượng timeframes cần có confluence (mặc định: ít nhất 2 timeframes)
  rsiConfluenceMinTimeframes: parseInt(process.env.RSI_CONFLUENCE_MIN_TIMEFRAMES || '2', 10),
};

// Validate required config
if (!config.telegramBotToken || !config.telegramChatId) {
  console.warn('⚠️  Cảnh báo: TELEGRAM_BOT_TOKEN và TELEGRAM_CHAT_ID chưa được cấu hình!');
  console.warn('   Vui lòng tạo file .env và cấu hình các giá trị này.');
}

