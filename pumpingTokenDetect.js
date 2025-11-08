import { startScheduler } from './scheduler.js';

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
startScheduler();

