import fs from 'fs';
import path from 'path';
import { sendStrategyCheckingLog } from '../telegram/telegramBot.js';

const logDir = path.join(process.cwd(), 'logs');
const logFile = path.join(logDir, 'trade_history.log');

/**
 * Ghi log lịch sử (cả lỗi / không đạt điều kiện) ra file trade_history.log
 * @param {string} symbol - Symbol
 * @param {string} reason - Lý do (bỏ qua/vào lệnh)
 * @param {Object} extraData - Dữ liệu kèm theo
 */
export function logTradeHistory(symbol, reason, extraData = {}) {
    try {
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            symbol,
            reason,
            ...extraData
        };

        fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');

        // Bắn log vào Telegram song song (không đợi response)
        sendStrategyCheckingLog(logEntry).catch(err => {
            console.error(`Lỗi khi gửi Telegram log cho ${symbol}:`, err.message);
        });
    } catch (error) {
        console.error(`Lỗi khi ghi trade history log cho ${symbol}:`, error.message);
    }
}
