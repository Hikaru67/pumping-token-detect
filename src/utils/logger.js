import fs from 'fs/promises';
import path from 'path';
import { config } from '../config.js';

const logDir = config.dataDir || './data';
const signalLogFile = path.join(logDir, 'trading_signals.log');

async function ensureLogDir() {
  try {
    await fs.mkdir(logDir, { recursive: true });
  } catch (error) {
    console.error('Lỗi khi tạo thư mục log:', error.message);
  }
}

/**
 * Ghi log tín hiệu/chiến thuật vào file trading_signals.log
 * @param {string} message - Nội dung log (đã format)
 */
export async function appendSignalLog(message) {
  try {
    await ensureLogDir();
    const line = `[${new Date().toISOString()}] ${message}\n`;
    await fs.appendFile(signalLogFile, line, 'utf-8');
  } catch (error) {
    console.error('Lỗi khi ghi file log tín hiệu:', error.message);
  }
}


