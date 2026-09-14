import axios from 'axios';
import { config } from '../config.js';
import { getBingxOpenPositions, getBingxUSDTBalance, getBingxIncomeHistory } from '../api/bingxService.js';

let lastUpdateId = 0;
let isPolling = false;

/**
 * Format số với prefix +/- (cho percentage/PNL)
 */
function formatNumberWithSign(num, decimals = 2) {
  if (isNaN(num)) return '0.00';
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toFixed(decimals)}`;
}

/**
 * Xử lý lệnh /orders hoặc /positions
 */
async function handleOrdersCommand(chatId, topicId = null) {
  try {
    // Thông báo đang xử lý
    await sendReply(chatId, topicId, "🔄 Đang lấy danh sách lệnh từ BingX...");

    const balance = await getBingxUSDTBalance();
    if (balance <= 0) {
      await sendReply(chatId, topicId, "⚠️ Không thể lấy số dư tài khoản hoặc số dư = 0.");
      return;
    }

    const positions = await getBingxOpenPositions();
    if (!positions || positions.length === 0) {
      await sendReply(chatId, topicId, "ℹ️ Hiện không có lệnh nào đang mở.");
      return;
    }

    // Lọc các vị thế có số lượng > 0
    const activePositions = positions.filter(p => Math.abs(parseFloat(p.positionAmt || p.positionVolume || '0')) > 0);

    if (activePositions.length === 0) {
      await sendReply(chatId, topicId, "ℹ️ Hiện không có lệnh nào đang mở.");
      return;
    }

    let message = `📋 *DANH SÁCH LỆNH ĐANG MỞ*\n`;
    let totalUnrealizedProfit = 0;

    activePositions.forEach((pos, index) => {
      const symbol = pos.symbol;
      const side = pos.positionSide === 'SHORT' ? '🔴 SHORT' : '🟢 LONG';
      const avgPrice = parseFloat(pos.avgPrice || pos.entryPrice || '0');
      const markPrice = parseFloat(pos.markPrice || '0');
      const positionAmt = Math.abs(parseFloat(pos.positionAmt || pos.positionVolume || '0'));
      const unrealizedProfit = parseFloat(pos.unrealizedProfit || '0');

      totalUnrealizedProfit += unrealizedProfit;

      // Tính % giá thay đổi
      let priceChangePercent = 0;
      if (avgPrice > 0 && markPrice > 0) {
        priceChangePercent = ((markPrice - avgPrice) / avgPrice) * 100;
        if (pos.positionSide === 'SHORT') {
          priceChangePercent = priceChangePercent;
        }
      }

      // Tính Volume (USDT) của vị thế (tổng giá trị bao gồm đòn bẩy)
      const positionValueUSDT = positionAmt * avgPrice;
      const volumePercent = (positionValueUSDT / balance) * 100;

      // Tính PNL % tài khoản
      const pnlPercentAccount = (unrealizedProfit / balance) * 100;

      message += `*${index + 1}. $${symbol.replace(/_USDT$|-USDT$/, '')}* ${side}\n`;
      message += `📍 *Entry:* ${avgPrice}\n`;
      message += `💰 *Market price:* ${markPrice}\n`;
      message += `📦 *Volume:* ${volumePercent.toFixed(2)}% \n`;
      message += `📈 *PNL:* ${formatNumberWithSign(pnlPercentAccount)}% \n`;
      message += `📊 *Price change:* ${formatNumberWithSign(priceChangePercent)}%\n\n`;
    });

    const totalPnlPercentAccount = (totalUnrealizedProfit / balance) * 100;
    message += `──────────────────\n`;
    message += `💰 *Total PNL:* ${formatNumberWithSign(totalPnlPercentAccount)}% \n\n`;

    const timestamp = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    message += `⏰ ${timestamp}`;

    await sendReply(chatId, topicId, message);
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh /orders:", error.message);
    await sendReply(chatId, topicId, "❌ Đã xảy ra lỗi khi lấy danh sách lệnh.");
  }
}

/**
 * Xử lý lệnh /pnl
 */
async function handlePnlCommand(chatId, topicId = null) {
  try {
    await sendReply(chatId, topicId, "🔄 Đang tính toán PNL từ BingX (có thể mất vài giây)...");

    const balance = await getBingxUSDTBalance();
    if (balance <= 0) {
      await sendReply(chatId, topicId, "⚠️ Không thể lấy số dư tài khoản hoặc số dư = 0.");
      return;
    }

    const now = Date.now();
    const sixMonthsAgo = now - 180 * 24 * 60 * 60 * 1000;

    // Lấy toàn bộ lịch sử 180 ngày
    const incomeHistory = await getBingxIncomeHistory(sixMonthsAgo, now);

    // Tính toán PNL cho từng khoảng thời gian
    // Các incomeType quan trọng: REALIZED_PNL, TRADING_FEE, FUNDING_FEE
    const calculatePnlForDays = (days) => {
      const startTime = now - days * 24 * 60 * 60 * 1000;
      const records = incomeHistory.filter(record => record.time >= startTime);
      const totalIncome = records.reduce((sum, record) => sum + parseFloat(record.income || '0'), 0);
      return totalIncome;
    };

    const pnl1d = calculatePnlForDays(1);
    const pnl7d = calculatePnlForDays(7);
    const pnl30d = calculatePnlForDays(30);
    const pnl90d = calculatePnlForDays(90);
    const pnl180d = calculatePnlForDays(180);

    let message = `📊 *BÁO CÁO PNL TÀI KHOẢN*\n`;

    message += `📅 *1 Ngày qua:* ${formatNumberWithSign((pnl1d / balance) * 100)}%\n`;
    message += `📅 *7 Ngày qua:* ${formatNumberWithSign((pnl7d / balance) * 100)}%\n`;
    message += `📅 *30 Ngày qua:* ${formatNumberWithSign((pnl30d / balance) * 100)}%\n`;
    message += `📅 *3 Tháng qua:* ${formatNumberWithSign((pnl90d / balance) * 100)}%\n`;
    message += `📅 *6 Tháng qua:* ${formatNumberWithSign((pnl180d / balance) * 100)}%\n`;

    const timestamp = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    message += `⏰ ${timestamp}`;

    await sendReply(chatId, topicId, message);
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh /pnl:", error.message);
    await sendReply(chatId, topicId, "❌ Đã xảy ra lỗi khi lấy báo cáo PNL.");
  }
}

/**
 * Gửi tin nhắn phản hồi
 */
async function sendReply(chatId, topicId, message) {
  if (!config.telegramBotToken) return;
  const TELEGRAM_API_URL = `https://api.telegram.org/bot${config.telegramBotToken}`;

  const payload = {
    chat_id: chatId,
    text: message,
    parse_mode: 'Markdown',
  };

  if (topicId) {
    payload.message_thread_id = topicId;
  }

  try {
    await axios.post(`${TELEGRAM_API_URL}/sendMessage`, payload, { timeout: 10000 });
  } catch (error) {
    console.error("Lỗi khi gửi phản hồi Telegram:", error.message);
  }
}

/**
 * Vòng lặp long-polling để nhận tin nhắn mới
 */
async function pollUpdates() {
  if (!config.telegramBotToken || !isPolling) return;
  const url = `https://api.telegram.org/bot${config.telegramBotToken}/getUpdates`;

  try {
    const response = await axios.get(url, {
      params: { offset: lastUpdateId + 1, timeout: 30 },
      timeout: 35000, // Timeout dài hơn timeout của long polling một chút
    });

    if (response.data && response.data.ok) {
      const updates = response.data.result;
      for (const update of updates) {
        lastUpdateId = update.update_id;

        if (update.message && update.message.text) {
          const text = update.message.text.trim();
          const chatId = update.message.chat.id;
          const topicId = update.message.is_topic_message ? update.message.message_thread_id : null;

          // Bắt lệnh (có thể dạng /orders hoặc /orders@bot_username)
          if (text.startsWith('/orders') || text.startsWith('/positions')) {
            console.log(`[TelegramListener] Nhận lệnh ${text} từ chat ${chatId}`);
            // Không await để vòng lặp tiếp tục ngay
            handleOrdersCommand(chatId, topicId);
          } else if (text.startsWith('/pnl')) {
            console.log(`[TelegramListener] Nhận lệnh ${text} từ chat ${chatId}`);
            handlePnlCommand(chatId, topicId);
          }
        }
      }
    }
  } catch (error) {
    // Bỏ qua lỗi timeout hoặc lỗi kết nối, chỉ log khi cần thiết
    if (!error.message.includes('timeout')) {
      // console.warn("Lỗi khi getUpdates:", error.message);
    }
  }

  // Tiếp tục vòng lặp sau 1s nếu có lỗi hoặc ngay lập tức nếu thành công (long polling)
  if (isPolling) {
    setTimeout(pollUpdates, 1000);
  }
}

/**
 * Khởi động listener
 */
export function startTelegramListener() {
  if (!config.telegramBotToken) {
    console.warn("⚠️ Không có telegramBotToken, bỏ qua khởi động Telegram Listener");
    return;
  }

  if (isPolling) return;
  isPolling = true;
  console.log("🚀 Khởi động Telegram Listener (long-polling)...");
  pollUpdates();
}

/**
 * Dừng listener
 */
export function stopTelegramListener() {
  isPolling = false;
  console.log("🛑 Dừng Telegram Listener...");
}
