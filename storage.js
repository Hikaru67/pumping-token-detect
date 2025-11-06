import fs from 'fs/promises';
import path from 'path';
import { config } from './config.js';

/**
 * Đảm bảo thư mục data tồn tại
 */
async function ensureDataDir() {
  try {
    await fs.mkdir(config.dataDir, { recursive: true });
  } catch (error) {
    console.error('Lỗi khi tạo thư mục data:', error.message);
  }
}

/**
 * Lưu top 10 vào file JSON
 * @param {Array} top10 - Top 10 token
 */
export async function saveTop10(top10) {
  await ensureDataDir();

  const data = {
    timestamp: new Date().toISOString(),
    top10: top10,
  };

  try {
    await fs.writeFile(
      config.historyFile,
      JSON.stringify(data, null, 2),
      'utf-8'
    );
    console.log(`✅ Đã lưu top 10 vào ${config.historyFile}`);
  } catch (error) {
    console.error('Lỗi khi lưu file:', error.message);
    throw error;
  }
}

/**
 * Đọc top 10 đã lưu từ file JSON
 * @returns {Object|null} Dữ liệu top 10 hoặc null nếu chưa có
 */
export async function loadTop10() {
  try {
    const data = await fs.readFile(config.historyFile, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File chưa tồn tại, đây là lần chạy đầu tiên
      console.log('📝 Chưa có dữ liệu lịch sử, đây là lần chạy đầu tiên');
      return null;
    }
    console.error('Lỗi khi đọc file:', error.message);
    return null;
  }
}

