import { checkTPState } from '../trading/takeProfitService.js';
import { config } from '../config.js';

let tpMonitorTimer = null;
let isChecking = false;

/**
 * Khởi động TP monitor scheduler
 * Chạy checkTPState() mỗi tpMonitorIntervalMs để phát hiện TP1 fill và đặt SL breakeven
 */
export function startTakeProfitScheduler() {
  if (!config.tpEnabled) {
    console.log('ℹ️  Take Profit scheduler đã tắt (TP_ENABLED=false)');
    return;
  }

  const interval = config.tpMonitorIntervalMs || 60000;
  console.log(`🚀 Khởi động Take Profit Monitor (interval: ${interval / 1000}s)`);

  tpMonitorTimer = setInterval(async () => {
    if (isChecking) {
      console.log('⏳ TP Monitor đang chạy, bỏ qua lần này...');
      return;
    }
    isChecking = true;
    try {
      await checkTPState();
    } catch (err) {
      console.error('❌ Lỗi trong TP Monitor:', err.message);
    } finally {
      isChecking = false;
    }
  }, interval);

  console.log('✅ Take Profit Monitor đã sẵn sàng\n');
}

/**
 * Dừng TP monitor scheduler
 */
export function stopTakeProfitScheduler() {
  if (tpMonitorTimer) {
    clearInterval(tpMonitorTimer);
    tpMonitorTimer = null;
    console.log('🛑 Take Profit Monitor đã dừng');
  }
}
