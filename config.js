import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // MEXC API
  mexcApiUrl: process.env.MEXC_API_URL || 'https://futures.mexc.com/api/v1/contract/ticker',
  
  // Telegram Bot - Pump Tokens
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID || '', // Channel/Group cũ (vẫn gửi vào đây)
  telegramChannelId: process.env.TELEGRAM_CHANNEL_ID || '', // Channel cũ riêng (optional, nếu khác với telegramChatId)
  telegramDisableNotification: process.env.TELEGRAM_DISABLE_NOTIFICATION === 'true', // Silent mode (không có âm thanh/thông báo)
  telegramTopicId: process.env.TELEGRAM_TOPIC_ID && process.env.TELEGRAM_TOPIC_ID.trim() !== '' 
    ? parseInt(process.env.TELEGRAM_TOPIC_ID, 10) 
    : null, // Topic ID trong group (message_thread_id)
  telegramTopicChatId: process.env.TELEGRAM_TOPIC_CHAT_ID || '', // Group ID để gửi vào topic (optional, nếu khác với telegramChatId)
  
  // Telegram Bot - Drop Tokens
  telegramDropChatId: process.env.TELEGRAM_DROP_CHAT_ID || '', // Channel/Group cũ cho drop (vẫn gửi vào đây)
  telegramDropChannelId: process.env.TELEGRAM_DROP_CHANNEL_ID || '', // Channel cũ riêng cho drop (optional, nếu khác với telegramDropChatId)
  telegramDropDisableNotification: process.env.TELEGRAM_DROP_DISABLE_NOTIFICATION === 'true', // Silent mode cho drop alerts
  telegramDropTopicId: process.env.TELEGRAM_DROP_TOPIC_ID && process.env.TELEGRAM_DROP_TOPIC_ID.trim() !== '' 
    ? parseInt(process.env.TELEGRAM_DROP_TOPIC_ID, 10) 
    : null, // Topic ID trong group cho drop alerts (message_thread_id)
  telegramDropTopicChatId: process.env.TELEGRAM_DROP_TOPIC_CHAT_ID || '', // Group ID để gửi vào topic cho drop (optional, nếu khác với telegramDropChatId)
  
  // Scheduler
  cronSchedule: process.env.CRON_SCHEDULE || '*/1 * * * *', // Mỗi 1 phút
  cronScheduleDrop: process.env.CRON_SCHEDULE_DROP || '*/1 * * * *', // Mỗi 1 phút (có thể config riêng)
  
  // Storage
  dataDir: process.env.DATA_DIR || './data',
  historyFile: process.env.HISTORY_FILE || './data/top10_history.json',
  dropHistoryFile: process.env.DROP_HISTORY_FILE || './data/top10_drop_history.json',
  
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
  rsiOverboughtThreshold: parseFloat(process.env.RSI_OVERBOUGHT_THRESHOLD || '70', 10), // Cho khung lớn (hours/days)
  rsiOverboughtThresholdSmall: parseFloat(process.env.RSI_OVERBOUGHT_THRESHOLD_SMALL || '70', 10), // Cho khung bé (minutes)
  
  // Số lượng timeframes cần có confluence (mặc định: ít nhất 2 timeframes)
  rsiConfluenceMinTimeframes: parseInt(process.env.RSI_CONFLUENCE_MIN_TIMEFRAMES || '2', 10),
  
  // RSI Delay Configuration (để tránh rate limit)
  rsiDelayBetweenTimeframes: parseInt(process.env.RSI_DELAY_BETWEEN_TIMEFRAMES || '100', 10), // Delay giữa các timeframes (ms)
  rsiDelayBetweenTokens: parseInt(process.env.RSI_DELAY_BETWEEN_TOKENS || '200', 10), // Delay giữa các tokens (ms)
};

// Validate required config
if (!config.telegramBotToken || !config.telegramChatId) {
  console.warn('⚠️  Cảnh báo: TELEGRAM_BOT_TOKEN và TELEGRAM_CHAT_ID chưa được cấu hình!');
  console.warn('   Vui lòng tạo file .env và cấu hình các giá trị này.');
}

if (!config.telegramDropChatId) {
  console.warn('⚠️  Cảnh báo: TELEGRAM_DROP_CHAT_ID chưa được cấu hình!');
  console.warn('   Drop tokens sẽ không được gửi alert nếu không có channel này.');
}

