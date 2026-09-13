import { getRSIStatus, formatTimeframe } from '../indicators/rsiCalculator.js';
import { config } from '../config.js';

const RSI_UI_CONFIG = {
  'oversold': { emoji: '🟢', isBold: true },
  'overbought': { emoji: '🟠', isBold: true },
  'superOverbought': { emoji: '🔴', isBold: true },
  'neutral': { emoji: '⚪', isBold: false }
};

const CONFLUENCE_UI_CONFIG = {
  'oversold': { emoji: '🟢', text: 'OVERSOLD CONFLUENCE ⬆️' },
  'overbought': { emoji: '🟠', text: 'OVERBOUGHT CONFLUENCE ⬇️' },
  'superOverbought': { emoji: '🔴', text: 'SUPER OVERBOUGHT CONFLUENCE ⬇️' },
};

export class TokenWrapper {
  constructor(rawData) {
    // Copy toàn bộ dữ liệu gốc để giữ nguyên tương thích
    Object.assign(this, rawData);
  }

  /**
   * Lấy tổng số lượng timeframe của RSI
   */
  getTotalTimeframesCount() {
    if (!this.rsi || typeof this.rsi !== 'object') return 0;
    return Object.keys(this.rsi).filter(tf => this.rsi[tf] !== null && !isNaN(this.rsi[tf])).length;
  }

  /**
   * Lấy số lượng RSI đạt ngưỡng Super Overbought
   */
  getSuperOverboughtCount() {
    if (!this.rsi || typeof this.rsi !== 'object') return 0;
    let count = 0;
    for (const [tf, rsi] of Object.entries(this.rsi)) {
      if (rsi !== null && !isNaN(rsi) && rsi >= config.rsiSuperOverboughtThreshold) {
        count++;
      }
    }
    return count;
  }

  /**
   * Trả về string format RSI hiển thị cho UI (Telegram)
   */
  formatRSIDisplay(timeframe) {
    if (!this.rsi || this.rsi[timeframe] == null || isNaN(this.rsi[timeframe])) return '';
    const rsiValue = this.rsi[timeframe];
    const status = getRSIStatus(rsiValue, timeframe);
    const uiConfig = RSI_UI_CONFIG[status] || RSI_UI_CONFIG['neutral'];
    
    let valueStr = rsiValue.toFixed(1);
    if (uiConfig.isBold) {
      valueStr = `*${valueStr}*`;
    }
    return `${uiConfig.emoji}${valueStr}`;
  }

  /**
   * Helper kiểm tra trạng thái overbought (bao gồm cả superOverbought)
   */
  isOverboughtGroup(timeframe) {
    if (!this.rsi || this.rsi[timeframe] == null) return false;
    const status = getRSIStatus(this.rsi[timeframe], timeframe);
    return status === 'overbought' || status === 'superOverbought';
  }

  /**
   * Trả về string hiển thị Confluence cho UI (Telegram)
   * @returns {string|null} - null nếu không có confluence
   */
  formatConfluenceDisplay() {
    if (!this.rsiConfluence || !this.rsiConfluence.hasConfluence) return null;
    const uiConf = CONFLUENCE_UI_CONFIG[this.rsiConfluence.status];
    if (!uiConf) return null;
    const timeframesList = this.rsiConfluence.timeframes.map(tf => formatTimeframe(tf)).join(', ');
    return `${uiConf.emoji} *${uiConf.text}* (${this.rsiConfluence.count} TFs: ${timeframesList})`;
  }
}
