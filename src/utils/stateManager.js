import fs from 'fs/promises';
import path from 'path';
import { config } from '../config.js';

const ensureDataDir = async () => {
  try {
    await fs.mkdir(config.dataDir, { recursive: true });
  } catch (err) {
    // Ignore error if directory already exists
  }
};

/**
 * Lưu state vào file JSON (async, không ném lỗi làm crash app)
 */
export async function saveStateToFile(filename, data) {
  try {
    await ensureDataDir();
    const filePath = path.join(config.dataDir, filename);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`❌ [StateManager] Lỗi khi lưu state file ${filename}:`, err.message);
  }
}

/**
 * Đọc state từ file JSON
 * Trả về null nếu file không tồn tại
 */
export async function loadStateFromFile(filename) {
  try {
    const filePath = path.join(config.dataDir, filename);
    const rawData = await fs.readFile(filePath, 'utf8');
    return JSON.parse(rawData);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`⚠️  [StateManager] Lỗi khi đọc state file ${filename} (có thể bị hỏng):`, err.message);
    }
    return null;
  }
}
