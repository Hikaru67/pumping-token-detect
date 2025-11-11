# 🚀 Pump Token Alert System

Hệ thống tự động theo dõi và cảnh báo top 10 token có tỷ lệ pump cao nhất trong 24h từ MEXC Futures API, tự động gửi thông báo Telegram khi có thay đổi ở top 3.

📢 **Channel Telegram:** [@pumping_token_detect](https://t.me/pumping_token_detect)

## ✨ Tính năng

- 📊 Theo dõi top 10 token có **riseFallRate** cao nhất (tỷ lệ biến động giá trong 24h)
- 📉 Theo dõi top 10 **drop tokens** (token giảm nhiều nhất)
- ⏰ Tự động check mỗi 1 phút
- 💾 Lưu trữ lịch sử top 10 vào JSON file
- 🔔 Gửi thông báo Telegram với **top 10** khi:
  - Top 1 thay đổi (với whitelist 3 slots để tránh spam)
  - RSI Confluence tăng (chỉ khi có ít nhất 1 timeframe lớn: 4h, 8h, 1d)
- 📈 Hiển thị **RSI** (Relative Strength Index) cho nhiều timeframes
- 🎯 **RSI Confluence** - Phát hiện khi nhiều timeframes có cùng trạng thái (oversold/overbought)
- 💰 Hiển thị **funding rate** và thông tin chi tiết
- 🎯 Symbol được làm sạch (bỏ đuôi _USDT/_USDC)
- 🚀 Gửi alert ngay lần đầu chạy (không cần đợi thay đổi)
- 🔇 **Silent mode** - Gửi thông báo im lặng (không có âm thanh/thông báo)
- 🛡️ Xử lý lỗi và validation đầy đủ

## 📋 Yêu cầu

- Node.js >= 18.0.0
- npm hoặc yarn

## 🚀 Cài đặt

1. **Clone repository hoặc tạo project mới**

```bash
cd pump-token-alert
```

2. **Cài đặt dependencies**

```bash
npm install
```

3. **Cấu hình environment variables**

Sao chép file `.env.example` thành `.env`:

```bash
cp .env.example .env
```

Chỉnh sửa file `.env` và điền các thông tin:

```env
# Telegram Bot Token (lấy từ @BotFather)
TELEGRAM_BOT_TOKEN=your_bot_token_here

# Telegram Chat ID (lấy từ @userinfobot)
TELEGRAM_CHAT_ID=your_chat_id_here

# Telegram Drop Chat ID (cho drop tokens, optional)
TELEGRAM_DROP_CHAT_ID=your_drop_chat_id_here

# Silent mode - Gửi thông báo im lặng (không có âm thanh/thông báo)
# Giá trị: true hoặc false (mặc định: false)
TELEGRAM_DISABLE_NOTIFICATION=false

# Silent mode cho drop alerts (optional, mặc định: false)
TELEGRAM_DROP_DISABLE_NOTIFICATION=false

# RSI Configuration - Timeframes để tính RSI
# MEXC hỗ trợ: Min1, Min5, Min15, Min30, Hour1, Hour4, Hour8, Day1, Week1, Month1
RSI_TIMEFRAMES=Min15,Min30,Hour1,Hour4

# RSI Period (số chu kỳ để tính RSI, mặc định: 14)
RSI_PERIOD=14

# RSI Oversold Threshold (mặc định: 30)
RSI_OVERSOLD_THRESHOLD=30

# RSI Overbought Threshold cho khung lớn (hours/days, mặc định: 70)
RSI_OVERBOUGHT_THRESHOLD=70

# RSI Overbought Threshold cho khung bé (minutes, mặc định: 70)
RSI_OVERBOUGHT_THRESHOLD_SMALL=70

# RSI Confluence - Số lượng timeframes tối thiểu để có confluence (mặc định: 2)
RSI_CONFLUENCE_MIN_TIMEFRAMES=2
```

### 🔧 Cách lấy Telegram Bot Token và Chat ID

1. **Tạo Telegram Bot:**
   - Mở Telegram và tìm @BotFather
   - Gửi lệnh `/newbot` và làm theo hướng dẫn
   - Copy bot token được cung cấp

2. **Lấy Chat ID:**
   - Tìm @userinfobot trên Telegram
   - Gửi bất kỳ tin nhắn nào cho bot này
   - Bot sẽ trả về Chat ID của bạn
   - Hoặc nếu muốn gửi vào channel/group, thêm bot vào channel/group và lấy Chat ID từ API

## 🎯 Sử dụng

### Chạy hệ thống

```bash
npm start
```

Hoặc chạy với watch mode (tự động restart khi code thay đổi):

```bash
npm run dev
```

### Dừng hệ thống

Nhấn `Ctrl+C` để dừng hệ thống một cách an toàn.

## 📁 Cấu trúc dự án

```
pump-token-alert/
├── pumpingTokenDetect.js  # Entry point cho pump tokens
├── dropTokenDetect.js     # Entry point cho drop tokens
├── scheduler.js           # Cron job scheduler cho pump tokens
├── dropScheduler.js       # Cron job scheduler cho drop tokens
├── apiClient.js           # MEXC API client
├── dataProcessor.js       # Xử lý và tính toán riseFallRate, RSI
├── rsiCalculator.js       # Tính toán RSI và confluence
├── storage.js             # Lưu trữ top 10 vào JSON
├── comparator.js          # So sánh và phát hiện thay đổi
├── telegramBot.js         # Gửi thông báo Telegram
├── config.js              # Cấu hình
├── package.json           # Dependencies
├── .env.example           # File mẫu cấu hình
├── .gitignore            # Git ignore
├── README.md             # Tài liệu này
└── data/                 # Thư mục lưu dữ liệu (tự động tạo)
    ├── top10_history.json
    └── top10_drop_history.json
```

## 🔍 Logic hoạt động

1. **Sắp xếp theo RiseFallRate:**
   - Sử dụng `riseFallRate` từ API (tỷ lệ biến động giá trong 24h)
   - Sort giảm dần để lấy token tăng nhiều nhất

2. **Lọc token hợp lệ:**
   - Token phải có `volume24 > 0`
   - Token phải có `riseFallRate` hợp lệ (không null/undefined/NaN)
   - Token phải có `symbol`

3. **Lấy top 10:**
   - Sort giảm dần theo `riseFallRate`
   - Lấy 10 token đầu tiên

4. **Tính RSI cho top 10:**
   - Tính RSI cho mỗi token với nhiều timeframes (mặc định: 15m, 30m, 1h, 4h)
   - Phát hiện RSI Confluence khi nhiều timeframes có cùng trạng thái (oversold/overbought)
   - Sử dụng threshold khác nhau cho overbought: khung bé (minutes) và khung lớn (hours/days)

5. **Phát hiện thay đổi:**
   - **Lần đầu chạy:** Gửi alert ngay với top 10 hiện tại
   - **Các lần sau:** Gửi alert khi:
     - Top 1 thay đổi (với whitelist 3 slots để tránh spam)
     - RSI Confluence tăng (chỉ khi có ít nhất 1 timeframe lớn: 4h, 8h, 1d)

6. **Gửi thông báo:**
   - Gửi Telegram alert với **top 10** khi có thay đổi
   - Message bao gồm: RiseFallRate, Funding Rate, RSI cho các timeframes, RSI Confluence, giá 24h, giá hiện tại, volume
   - Hiển thị danh sách token có RSI Confluence tăng

## 📊 Format thông báo Telegram

```
*TOP 10 PUMP TOKENS*

📊 Top 10 Pump Tokens (theo RiseFallRate):

🥇 #1 $SOONNETWORK
   Biến động: +81.93%
   Funding Rate: -1.0194%
   📊 RSI: 15m🟢25.3 • 30m🟢28.1 • 1h⚪45.2 • 4h🔴75.8
   🟢 OVERSOLD CONFLUENCE ⬆️ (2 TFs: 15m, 30m)
   Giá 24h: 0.7075 → 3.0308
   Giá hiện tại: 1.4777
   Volume 24h: 37.54M

🥈 #2 $GIGGLE
   Biến động: +30.07%
   Funding Rate: -0.0003%
   ...

🥉 #3 $ZEC
   ...

4️⃣ #4 $ASTER
   ...

... (đến top 10)

⏰ Thời gian: 15/01/2025 14:30:25
```

**Ví dụ alert khi RSI Confluence tăng:**

```
*TOP 10 PUMP TOKENS*

📊 *🚨 RSI CONFLUENCE TĂNG 🚨*
⚠️ RSI confluence tăng: $BTC, $ETH, $SOL

🥇 #1 $BTC
   Biến động: +5.23%
   📊 RSI: 15m⚪45.2 • 30m⚪52.1 • 1h🔴78.5 • 4h🔴82.3
   🔴 OVERBOUGHT CONFLUENCE ⬇️ (2 TFs: 1h, 4h)
   ...
```

**Lưu ý:**
- Symbol được làm sạch (bỏ đuôi _USDT/_USDC)
- Hiển thị đầy đủ top 10 tokens
- Bao gồm Funding Rate cho mỗi token
- Hiển thị RSI cho các timeframes với emoji: 🟢 (oversold), 🔴 (overbought), ⚪ (neutral)
- Hiển thị RSI Confluence khi có (oversold/overbought với số lượng timeframes)
- Khi có RSI Confluence tăng, hiển thị danh sách token thay đổi

## ⚙️ Cấu hình nâng cao

### Thay đổi tần suất check

Chỉnh sửa `CRON_SCHEDULE` trong file `.env`:

```env
# Mỗi 30 giây
CRON_SCHEDULE=*/30 * * * * *

# Mỗi 5 phút
CRON_SCHEDULE=*/5 * * * *

# Mỗi giờ
CRON_SCHEDULE=0 * * * *
```

### Thay đổi thư mục lưu trữ

```env
DATA_DIR=./custom_data
HISTORY_FILE=./custom_data/top10_history.json
```

### Bật/tắt Silent Mode (Gửi thông báo im lặng)

Silent mode cho phép gửi thông báo Telegram mà không có âm thanh/thông báo (useful khi có quá nhiều alerts):

```env
# Bật silent mode cho pump alerts
TELEGRAM_DISABLE_NOTIFICATION=true

# Bật silent mode cho drop alerts
TELEGRAM_DROP_DISABLE_NOTIFICATION=true
```

**Lưu ý:**
- `TELEGRAM_DISABLE_NOTIFICATION=true` → Thông báo im lặng (không có âm thanh/thông báo)
- `TELEGRAM_DISABLE_NOTIFICATION=false` hoặc không set → Thông báo bình thường (có âm thanh/thông báo)
- Có thể cấu hình riêng cho pump alerts và drop alerts

### Cấu hình RSI (Relative Strength Index)

Hệ thống tính RSI cho nhiều timeframes và phát hiện confluence:

```env
# Timeframes để tính RSI (mặc định: 15m, 30m, 1h, 4h)
RSI_TIMEFRAMES=Min15,Min30,Hour1,Hour4

# RSI Period - số chu kỳ để tính RSI (mặc định: 14)
RSI_PERIOD=14

# RSI Oversold Threshold - RSI < 30 được coi là oversold (mặc định: 30)
RSI_OVERSOLD_THRESHOLD=30

# RSI Overbought Threshold cho khung lớn (hours/days, mặc định: 70)
RSI_OVERBOUGHT_THRESHOLD=70

# RSI Overbought Threshold cho khung bé (minutes, mặc định: 70)
# Có thể set cao hơn để giảm false signals từ khung nhỏ
RSI_OVERBOUGHT_THRESHOLD_SMALL=75

# RSI Confluence - số lượng timeframes tối thiểu để có confluence (mặc định: 2)
RSI_CONFLUENCE_MIN_TIMEFRAMES=2
```

**RSI Confluence:**
- Confluence xảy ra khi nhiều timeframes có cùng trạng thái (oversold hoặc overbought)
- Alert chỉ trigger khi RSI Confluence tăng VÀ có ít nhất 1 timeframe lớn (4h, 8h, 1d) trong confluence
- Giúp xác nhận tín hiệu mạnh hơn từ nhiều khung thời gian

**Top 1 Whitelist:**
- Hệ thống tự động thêm top 1 mới vào whitelist (giữ 3 gần nhất)
- Tránh spam alert khi top 1 thay đổi giữa các token đã từng ở vị trí đó

## 🐛 Xử lý lỗi

Hệ thống tự động xử lý các lỗi phổ biến:

- ❌ API timeout → Retry sau
- ❌ Network error → Log và tiếp tục
- ❌ Invalid data → Skip và tiếp tục
- ❌ Telegram error → Log và tiếp tục

## 📝 Logs

Hệ thống sẽ hiển thị logs trong console:

- ✅ Thành công
- ⚠️ Cảnh báo
- ❌ Lỗi
- 📊 Thông tin

## 🔒 Bảo mật

- ⚠️ **KHÔNG** commit file `.env` lên Git
- ⚠️ **KHÔNG** chia sẻ Telegram Bot Token
- ✅ File `.gitignore` đã được cấu hình để bỏ qua các file nhạy cảm

## 🧪 Test

Test gửi message Telegram:

```bash
npm run test:telegram
```

## 🚀 Mở rộng

Các tính năng có thể mở rộng:

- [ ] Filter theo volume threshold
- [ ] Filter theo market cap
- [ ] Alert khi riseFallRate vượt ngưỡng
- [ ] Dashboard web để xem real-time
- [ ] Lưu lịch sử vào database
- [ ] Phân tích xu hướng và biểu đồ
- [ ] Retry logic cho API calls
- [ ] Rate limiting cho Telegram API

## 📄 License

MIT

## 🤝 Đóng góp

Mọi đóng góp đều được chào đón! Vui lòng tạo issue hoặc pull request.
