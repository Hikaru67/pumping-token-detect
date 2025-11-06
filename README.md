# 🚀 Pump Token Alert System

Hệ thống tự động theo dõi và cảnh báo top 10 token có tỷ lệ pump cao nhất trong 24h từ MEXC Futures API, tự động gửi thông báo Telegram khi có thay đổi ở top 3.

## ✨ Tính năng

- 📊 Theo dõi top 10 token có pump ratio cao nhất (high24Price/low24Price)
- ⏰ Tự động check mỗi 1 phút
- 💾 Lưu trữ lịch sử top 10 vào JSON file
- 🔔 Gửi thông báo Telegram khi top 3 thay đổi
- 🛡️ Xử lý lỗi và retry logic

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
├── main.js              # Entry point
├── scheduler.js         # Cron job scheduler
├── apiClient.js         # MEXC API client
├── dataProcessor.js     # Xử lý và tính toán pump ratio
├── storage.js           # Lưu trữ top 10 vào JSON
├── comparator.js        # So sánh và phát hiện thay đổi
├── telegramBot.js       # Gửi thông báo Telegram
├── config.js            # Cấu hình
├── package.json         # Dependencies
├── .env.example         # File mẫu cấu hình
├── .gitignore          # Git ignore
├── README.md           # Tài liệu này
└── data/               # Thư mục lưu dữ liệu (tự động tạo)
    └── top10_history.json
```

## 🔍 Logic hoạt động

1. **Tính toán Pump Ratio:**
   ```
   pumpRatio = high24Price / lower24Price
   ```

2. **Lọc token hợp lệ:**
   - Loại bỏ token có `lower24Price = 0` hoặc `high24Price = 0`
   - Loại bỏ token có `volume24 = 0`

3. **Sắp xếp và lấy top 10:**
   - Sort giảm dần theo `pumpRatio`
   - Lấy 10 token đầu tiên

4. **Phát hiện thay đổi:**
   - So sánh top 3 hiện tại với top 3 trước đó
   - Phát hiện thay đổi về symbol hoặc thứ tự ranking

5. **Gửi thông báo:**
   - Gửi Telegram alert khi có thay đổi ở top 3

## 📊 Format thông báo Telegram

```
🚀 TOP PUMP ALERT - Thay đổi Top 3

📊 Top 3 hiện tại:

🥇 #1 GIGGLE_USDT
   Pump: 2.26x (+126.00%)
   Giá: 121.25 → 274.25
   Giá hiện tại: 228.72
   Volume 24h: 10.93M

🥈 #2 TOKEN_B
   ...

⏰ Thời gian: 15/01/2025 14:30:25
```

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

## 🚀 Mở rộng

Các tính năng có thể mở rộng:

- [ ] Filter theo volume threshold
- [ ] Filter theo market cap
- [ ] Alert khi pump ratio vượt ngưỡng
- [ ] Dashboard web để xem real-time
- [ ] Lưu lịch sử vào database
- [ ] Phân tích xu hướng và biểu đồ

## 📄 License

MIT

## 🤝 Đóng góp

Mọi đóng góp đều được chào đón! Vui lòng tạo issue hoặc pull request.

