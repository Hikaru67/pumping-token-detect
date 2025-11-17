import { startScheduler } from './src/schedulers/scheduler.js';
import { startDropScheduler } from './src/schedulers/dropScheduler.js';

// Xử lý lỗi không bắt được
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection tại:', promise, 'lý do:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Xử lý tín hiệu dừng (Ctrl+C)
process.on('SIGINT', () => {
  console.log('\n👋 Đang dừng hệ thống...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Đang dừng hệ thống...');
  process.exit(0);
});

// Khởi động hệ thống
console.log('='.repeat(60));
console.log('🚀 Khởi động Pump & Drop Token Alert System');
console.log('='.repeat(60));

// Khởi động Pump Token Scheduler
startScheduler();

// Khởi động Drop Token Scheduler
// off drop scheduler
// startDropScheduler();

console.log('='.repeat(60));
console.log('✅ Tất cả schedulers đã được khởi động');
console.log('='.repeat(60));

