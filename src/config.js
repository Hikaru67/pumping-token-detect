import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // MEXC API
  mexcApiUrl: process.env.MEXC_API_URL || 'https://futures.mexc.com/api/v1/contract/ticker',
  
  // Telegram Bot - Pump Tokens
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID || '', // Channel ID (channel riêng)
  telegramGroupId: process.env.TELEGRAM_GROUP_ID || '', // Group ID (để gửi vào topic)
  telegramDisableNotification: process.env.TELEGRAM_DISABLE_NOTIFICATION === 'true', // Silent mode (không có âm thanh/thông báo)
  telegramTopicId: process.env.TELEGRAM_TOPIC_ID && process.env.TELEGRAM_TOPIC_ID.trim() !== '' 
    ? parseInt(process.env.TELEGRAM_TOPIC_ID, 10) 
    : null, // Topic ID trong group (message_thread_id)
  telegramSignalTopicId: process.env.TELEGRAM_SIGNAL_TOPIC_ID && process.env.TELEGRAM_SIGNAL_TOPIC_ID.trim() !== '' 
    ? parseInt(process.env.TELEGRAM_SIGNAL_TOPIC_ID, 10) 
    : null, // Topic ID cho signal alerts (tín hiệu đảo chiều)
  
  // Telegram Bot - Drop Tokens
  telegramDropChatId: process.env.TELEGRAM_DROP_CHAT_ID || '', // Channel ID cho drop (channel riêng)
  telegramDropGroupId: process.env.TELEGRAM_DROP_GROUP_ID || '', // Group ID cho drop (để gửi vào topic)
  telegramDropDisableNotification: process.env.TELEGRAM_DROP_DISABLE_NOTIFICATION === 'true', // Silent mode cho drop alerts
  telegramDropTopicId: process.env.TELEGRAM_DROP_TOPIC_ID && process.env.TELEGRAM_DROP_TOPIC_ID.trim() !== '' 
    ? parseInt(process.env.TELEGRAM_DROP_TOPIC_ID, 10) 
    : null, // Topic ID trong group cho drop alerts (message_thread_id)
  
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
  rsiSuperOverboughtThreshold: parseFloat(process.env.RSI_SUPER_OVER_BOUGHT || '90', 10), // RSI siêu overbought (highlight signal)
  
  // Số lượng timeframes cần có confluence (mặc định: ít nhất 2 timeframes)
  rsiConfluenceMinTimeframes: parseInt(process.env.RSI_CONFLUENCE_MIN_TIMEFRAMES || '2', 10),
  
  // RSI Delay Configuration (để tránh rate limit)
  rsiDelayBetweenTimeframes: parseInt(process.env.RSI_DELAY_BETWEEN_TIMEFRAMES || '100', 10), // Delay giữa các timeframes (ms) - không dùng khi tính song song
  rsiDelayBetweenTokens: parseInt(process.env.RSI_DELAY_BETWEEN_TOKENS || '200', 10), // Delay giữa các tokens (ms)
  
  // RSI Concurrent Configuration (để tính song song)
  rsiMaxConcurrentTimeframes: parseInt(process.env.RSI_MAX_CONCURRENT_TIMEFRAMES || '5', 10), // Số lượng timeframes tính song song tối đa cho 1 token
  
  // Signal Alert Configuration
  signalAlertMinRSICount: parseInt(process.env.SIGNAL_ALERT_MIN_RSI_COUNT || '3', 10), // Số lượng RSI overbought/oversold tối thiểu để trigger signal alert
};

// Validate required config
if (!config.telegramBotToken) {
  console.warn('⚠️  Cảnh báo: TELEGRAM_BOT_TOKEN chưa được cấu hình!');
  console.warn('   Vui lòng tạo file .env và cấu hình giá trị này.');
}
if (!config.telegramChatId && !config.telegramGroupId) {
  console.warn('⚠️  Cảnh báo: TELEGRAM_CHAT_ID (channel) hoặc TELEGRAM_GROUP_ID chưa được cấu hình!');
  console.warn('   Vui lòng cấu hình ít nhất một trong hai giá trị này.');
}

if (!config.telegramDropChatId) {
  console.warn('⚠️  Cảnh báo: TELEGRAM_DROP_CHAT_ID chưa được cấu hình!');
  console.warn('   Drop tokens sẽ không được gửi alert nếu không có channel này.');
}

