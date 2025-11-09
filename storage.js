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
 * @param {Array} top1Whitelist - Whitelist top 1 (chỉ 3 gần nhất)
 */
export async function saveTop10(top10, top1Whitelist = null) {
  await ensureDataDir();

  const data = {
    timestamp: new Date().toISOString(),
    top10: top10,
    top1Whitelist: top1Whitelist || [],
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
    const parsed = JSON.parse(data);
    
    // Validate structure
    if (!parsed || typeof parsed !== 'object') {
      console.warn('⚠️  File lịch sử không hợp lệ, sẽ tạo mới');
      return null;
    }
    
    if (!Array.isArray(parsed.top10)) {
      console.warn('⚠️  Dữ liệu top10 không hợp lệ, sẽ tạo mới');
      return null;
    }
    
    return parsed;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File chưa tồn tại, đây là lần chạy đầu tiên
      console.log('📝 Chưa có dữ liệu lịch sử, đây là lần chạy đầu tiên');
      return null;
    }
    if (error instanceof SyntaxError) {
      console.error('⚠️  File JSON bị corrupt, sẽ tạo mới:', error.message);
      return null;
    }
    console.error('Lỗi khi đọc file:', error.message);
    return null;
  }
}

/**
 * Lưu top 10 drop tokens vào file JSON
 * @param {Array} top10 - Top 10 drop tokens
 * @param {Array} top1Whitelist - Whitelist top 1 (chỉ 3 gần nhất)
 */
export async function saveTop10Drop(top10, top1Whitelist = null) {
  await ensureDataDir();

  const data = {
    timestamp: new Date().toISOString(),
    top10: top10,
    top1Whitelist: top1Whitelist || [],
  };

  try {
    await fs.writeFile(
      config.dropHistoryFile,
      JSON.stringify(data, null, 2),
      'utf-8'
    );
    console.log(`✅ Đã lưu top 10 drop tokens vào ${config.dropHistoryFile}`);
  } catch (error) {
    console.error('Lỗi khi lưu file drop:', error.message);
    throw error;
  }
}

/**
 * Đọc top 10 drop tokens đã lưu từ file JSON
 * @returns {Object|null} Dữ liệu top 10 drop tokens hoặc null nếu chưa có
 */
export async function loadTop10Drop() {
  try {
    const data = await fs.readFile(config.dropHistoryFile, 'utf-8');
    const parsed = JSON.parse(data);
    
    // Validate structure
    if (!parsed || typeof parsed !== 'object') {
      console.warn('⚠️  File lịch sử drop không hợp lệ, sẽ tạo mới');
      return null;
    }
    
    if (!Array.isArray(parsed.top10)) {
      console.warn('⚠️  Dữ liệu top10 drop không hợp lệ, sẽ tạo mới');
      return null;
    }
    
    return parsed;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File chưa tồn tại, đây là lần chạy đầu tiên
      console.log('📝 Chưa có dữ liệu lịch sử drop, đây là lần chạy đầu tiên');
      return null;
    }
    if (error instanceof SyntaxError) {
      console.error('⚠️  File JSON drop bị corrupt, sẽ tạo mới:', error.message);
      return null;
    }
    console.error('Lỗi khi đọc file drop:', error.message);
    return null;
  }
}

