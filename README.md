# Pump Token Alert System

Theo dõi và cảnh báo top token pump/drop từ MEXC Futures, tích hợp auto-trading SHORT trên BingX.

---

## Tính năng

- 📊 Theo dõi top 10 token pump/drop (24h) từ MEXC
- 📈 Tính RSI đa timeframe + RSI Confluence
- 🔔 Gửi alert Telegram khi top 1 thay đổi hoặc RSI Confluence tăng
- 🤖 Auto SHORT trên BingX khi phát hiện tín hiệu pump
- 🎯 Tự động đặt Take Profit (TP1/TP2/TP3) và SL breakeven
- 🛡️ Monitor trạng thái lệnh, cảnh báo khi cán SL hoặc TP khớp

---

## Cài đặt

```bash
npm install
cp .env.example .env
# Điền thông tin vào .env
npm start
```

---

## Cấu hình `.env`

### Telegram

```env
TELEGRAM_BOT_TOKEN=          # Token từ @BotFather
TELEGRAM_CHAT_ID=            # Channel ID cho pump alerts
TELEGRAM_DROP_CHAT_ID=       # Channel ID cho drop alerts
TELEGRAM_GROUP_ID=           # Group ID (nếu dùng topic)
TELEGRAM_TOPIC_ID=           # Topic ID cho pump
TELEGRAM_DROP_TOPIC_ID=      # Topic ID cho drop
TELEGRAM_SIGNAL_TOPIC_ID=    # Topic ID cho single signal
TELEGRAM_AUTO_TRADE_TOPIC_ID= # Topic ID cho auto trade logs
TELEGRAM_DISABLE_NOTIFICATION=false
TELEGRAM_DROP_DISABLE_NOTIFICATION=false
```

### BingX (Auto Trading)

```env
BINGX_API_KEY=
BINGX_API_SECRET=
BINGX_BASE_URL=https://open-api.bingx.com
```

### Take Profit

```env
TP_ENABLED=false
TP_RATIO_1=0.20        # TP1 = entry × (1 - pump% × 0.20)
TP_RATIO_2=0.40        # TP2 = entry × (1 - pump% × 0.40)
TP_RATIO_3=0.80        # TP3 = entry × (1 - pump% × 0.80)
TP_CLOSE_PERCENT_1=30  # Đóng 30% tại TP1
TP_CLOSE_PERCENT_2=30  # Đóng 30% tại TP2
TP_CLOSE_PERCENT_3=40  # Đóng 40% tại TP3
TP_BREAKEVEN_SL_ENABLED=true   # Kéo SL về entry khi TP1 khớp
TP_MONITOR_INTERVAL_MS=60000   # Check mỗi 60 giây
```

### RSI

```env
RSI_TIMEFRAMES=Min5,Min15,Min30,Min60,Hour4,Hour8,Day1
RSI_PERIOD=14
RSI_OVERSOLD_THRESHOLD=26
RSI_OVERBOUGHT_THRESHOLD=80
RSI_OVERBOUGHT_THRESHOLD_SMALL=85
RSI_CONFLUENCE_MIN_TIMEFRAMES=3
```

### Scheduler

```env
CRON_SCHEDULE=*/1 * * * *       # Pump check: mỗi 1 phút
CRON_SCHEDULE_DROP=*/1 * * * *  # Drop check
```

---

## Cấu trúc dự án

```
src/
├── api/
│   ├── apiClient.js          # MEXC API
│   ├── bingxService.js       # BingX API (positions/orders/balance)
│   └── binanceService.js     # Binance futures (symbol check)
├── telegram/
│   └── telegramBot.js        # Gửi thông báo Telegram
├── indicators/
│   ├── rsiCalculator.js      # Tính RSI & confluence
│   └── candlestickPattern.js # Pattern nến đảo chiều
├── schedulers/
│   ├── scheduler.js          # Cron pump tokens
│   └── dropScheduler.js      # Cron drop tokens
├── trading/
│   ├── tradingTrigger.js     # Trigger auto SHORT
│   └── takeProfitService.js  # Quản lý TP/SL
├── utils/
│   ├── comparator.js
│   ├── dataProcessor.js
│   └── storage.js
└── config.js
main.js
```

---

## Bảo mật

- **Không** commit file `.env` lên Git
- **Không** chia sẻ Bot Token hay API Key
