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
};

// Validate required config
if (!config.telegramBotToken || !config.telegramChatId) {
  console.warn('⚠️  Cảnh báo: TELEGRAM_BOT_TOKEN và TELEGRAM_CHAT_ID chưa được cấu hình!');
  console.warn('   Vui lòng tạo file .env và cấu hình các giá trị này.');
}

