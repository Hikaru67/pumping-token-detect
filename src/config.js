import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // MEXC API
  mexcApiUrl: process.env.MEXC_API_URL || 'https://futures.mexc.co/api/v1/contract/ticker',
  mexcKlineApiBaseUrl: process.env.MEXC_KLINE_API_BASE_URL || 'https://contract.mexc.co/api/v1/contract/kline',

  // Binance API (public futures)
  binanceApiBaseUrl: process.env.BINANCE_API_BASE_URL || 'https://fapi.binance.com',
  binanceApiTimeout: parseInt(process.env.BINANCE_API_TIMEOUT || '10000', 10),
  binanceExchangeInfoCacheMs: parseInt(process.env.BINANCE_EXCHANGE_INFO_CACHE_MS || '300000', 10), // 5 phút

  // BingX API
  bingxApiBaseUrl: process.env.BINGX_BASE_URL || 'https://open-api.bingx.com',
  bingxApiKey: process.env.BINGX_API_KEY || '',
  bingxApiSecret: process.env.BINGX_API_SECRET || '',
  bingxRecvWindow: parseInt(process.env.BINGX_RECV_WINDOW || '5000', 10),
  bingxApiTimeout: parseInt(process.env.BINGX_API_TIMEOUT || '15000', 10),

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

  // Telegram Primary Signal (cho RSI super overbought - gửi song song với signal thông thường)
  telegramPrimarySignalChatId: process.env.TELEGRAM_PRIMARY_SIGNAL_CHAT_ID || '', // Channel ID cho primary signal (optional)
  telegramPrimarySignalTopicId: process.env.TELEGRAM_PRIMARY_SIGNAL_TOPIC_ID && process.env.TELEGRAM_PRIMARY_SIGNAL_TOPIC_ID.trim() !== ''
    ? parseInt(process.env.TELEGRAM_PRIMARY_SIGNAL_TOPIC_ID, 10)
    : null, // Topic ID cho primary signal alerts (RSI super overbought) - dùng chung group với TELEGRAM_GROUP_ID

  // Telegram Auto Trade (thông báo khi vào lệnh tự động)
  telegramAutoTradeTopicId: process.env.TELEGRAM_AUTO_TRADE_TOPIC_ID && process.env.TELEGRAM_AUTO_TRADE_TOPIC_ID.trim() !== ''
    ? parseInt(process.env.TELEGRAM_AUTO_TRADE_TOPIC_ID, 10)
    : null, // Topic ID cho auto trade alerts (khi vào lệnh được trigger) - dùng chung group với TELEGRAM_GROUP_ID

  // Telegram Strategy Checking Log (thông báo khi check strategy)
  telegramStrategyCheckingLogTopicId: process.env.TELEGRAM_STRATEGY_CHECKING_LOG_TOPIC_ID && process.env.TELEGRAM_STRATEGY_CHECKING_LOG_TOPIC_ID.trim() !== ''
    ? parseInt(process.env.TELEGRAM_STRATEGY_CHECKING_LOG_TOPIC_ID, 10)
    : null, // Topic ID cho strategy checking logs - dùng chung group với TELEGRAM_GROUP_ID

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
  pumpCandidateLimit: parseInt(process.env.PUMP_CANDIDATE_LIMIT || '15', 10),

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
  rsiMaxConcurrentTokens: parseInt(process.env.RSI_MAX_CONCURRENT_TOKENS || '2', 10), // Số lượng tokens tính song song tối đa

  // Signal Alert Configuration
  signalAlertMinRSICount: parseInt(process.env.SIGNAL_ALERT_MIN_RSI_COUNT || '3', 10), // Số lượng RSI overbought/oversold tối thiểu để trigger signal alert
  singleSignalMinTotalScore: parseFloat(process.env.SINGLE_SIGNAL_MIN_TOTAL_SCORE || '20', 10), // Tổng điểm tối thiểu để gửi single signal alert (default: 20)

  // Single Signal Scoring Configuration
  singleSignalScore: {
    rsiMaxScore: parseFloat(process.env.SINGLE_SIGNAL_RSI_MAX_SCORE || '50'),
    rsiWeightLarge: parseFloat(process.env.SINGLE_SIGNAL_RSI_WEIGHT_LARGE || '5'),
    rsiWeightMedium: parseFloat(process.env.SINGLE_SIGNAL_RSI_WEIGHT_MEDIUM || '3.5'),
    rsiWeightSmall: parseFloat(process.env.SINGLE_SIGNAL_RSI_WEIGHT_SMALL || '2.5'),
    rsiLevel1: parseFloat(process.env.SINGLE_SIGNAL_RSI_LEVEL1 || '80'), // threshold 1
    rsiLevel2: parseFloat(process.env.SINGLE_SIGNAL_RSI_LEVEL2 || '85'), // threshold 2
    rsiLevelHigh: parseFloat(process.env.SINGLE_SIGNAL_RSI_LEVEL_HIGH || '90'), // high threshold for delta
    rsiDelta: parseFloat(process.env.SINGLE_SIGNAL_RSI_DELTA || '0.8'),
    rsiMaxMultiplier: parseFloat(process.env.SINGLE_SIGNAL_RSI_MAX_MULTIPLIER || '1.8'),

    divergenceMaxScore: parseFloat(process.env.SINGLE_SIGNAL_DIVERGENCE_MAX_SCORE || '20'),
    divergenceWeightLarge: parseFloat(process.env.SINGLE_SIGNAL_DIVERGENCE_WEIGHT_LARGE || '10'),
    divergenceWeightMedium: parseFloat(process.env.SINGLE_SIGNAL_DIVERGENCE_WEIGHT_MEDIUM || '6'),
    divergenceWeightSmall: parseFloat(process.env.SINGLE_SIGNAL_DIVERGENCE_WEIGHT_SMALL || '3'),
    divergenceBonusPerExtra: parseFloat(process.env.SINGLE_SIGNAL_DIVERGENCE_BONUS || '1'),

    candleMaxScore: parseFloat(process.env.SINGLE_SIGNAL_CANDLE_MAX_SCORE || '30'),
    candleWeightLarge: parseFloat(process.env.SINGLE_SIGNAL_CANDLE_WEIGHT_LARGE || '15'),
    candleWeightMedium: parseFloat(process.env.SINGLE_SIGNAL_CANDLE_WEIGHT_MEDIUM || '9'),
    candleWeightSmall: parseFloat(process.env.SINGLE_SIGNAL_CANDLE_WEIGHT_SMALL || '4'),
    candleBonusSpecial: parseFloat(process.env.SINGLE_SIGNAL_CANDLE_BONUS || '3'),
  },

  // Trading Configuration
  tradingEnabled: process.env.TRADING_ENABLED === 'true', // Bật/tắt trading tự động
  tradingLeverage: parseInt(process.env.TRADING_LEVERAGE || '2', 10), // Đòn bẩy (mặc định: 2x)
  tradingFundingRateThreshold: parseFloat(process.env.TRADING_FUNDING_RATE_THRESHOLD || '-0.5', 10), // Ngưỡng funding rate (ví dụ: -0.5 = -0.5%)
  tradingFundingCollectCycleSkip: parseInt(process.env.TRADING_FUNDING_COLLECT_CYCLE_SKIP || '1', 10), // Bỏ qua nếu chu kỳ trả funding là X giờ (mặc định: 1h)
  tradingPumpThreshold: parseFloat(process.env.TRADING_PUMP_THRESHOLD || '30', 10), // Ngưỡng pump % (ví dụ: 30 = 30%)

  // Volume % cho từng chiến thuật
  tradingStrategy1VolumePercent: parseFloat(process.env.TRADING_STRATEGY1_VOLUME_PERCENT || '2', 10), // 2% tài khoản
  tradingStrategy2VolumePercent: parseFloat(process.env.TRADING_STRATEGY2_VOLUME_PERCENT || '10', 10), // 10% tài khoản
  tradingStrategy3VolumePercent: parseFloat(process.env.TRADING_STRATEGY3_VOLUME_PERCENT || '1', 10), // 1% tài khoản
  tradingStrategy5VolumePercent: parseFloat(process.env.TRADING_STRATEGY5_VOLUME_PERCENT || '15', 10), // 15% tài khoản

  // Take Profit Configuration
  tpEnabled: process.env.TP_ENABLED === 'true', // Bật/tắt take profit tự động
  // TP level ratios: TP_price = avg_entry × (1 - pump% × ratio)
  tpRatio1: parseFloat(process.env.TP_RATIO_1 || '0.20'), // TP1 tại pump% × 20%
  tpRatio2: parseFloat(process.env.TP_RATIO_2 || '0.40'), // TP2 tại pump% × 40%
  tpRatio3: parseFloat(process.env.TP_RATIO_3 || '0.80'), // TP3 tại pump% × 80%
  // % position đóng tại mỗi TP level (tổng phải = 100)
  tpClosePercent1: parseFloat(process.env.TP_CLOSE_PERCENT_1 || '30'), // Đóng 30% tại TP1
  tpClosePercent2: parseFloat(process.env.TP_CLOSE_PERCENT_2 || '30'), // Đóng 30% tại TP2
  tpClosePercent3: parseFloat(process.env.TP_CLOSE_PERCENT_3 || '40'), // Đóng 40% tại TP3
  // Tự động kéo SL về entry khi TP1 khớp
  tpBreakevenSlEnabled: process.env.TP_BREAKEVEN_SL_ENABLED !== 'false', // Mặc định bật
  // Chu kỳ monitor TP1 fill status để đặt SL breakeven (ms)
  tpMonitorIntervalMs: parseInt(process.env.TP_MONITOR_INTERVAL_MS || '60000', 10),
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

if (!config.bingxApiKey || !config.bingxApiSecret) {
  console.warn('ℹ️  Thông tin: BINGX_API_KEY/BINGX_API_SECRET chưa được cấu hình.');
  console.warn('   Các request riêng tư tới BingX sẽ bị bỏ qua cho đến khi bạn cung cấp đủ thông tin.');
}

