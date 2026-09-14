import { startTelegramListener } from './src/telegram/telegramListener.js';

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
  console.log('\n👋 Đang dừng Telegram service...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Đang dừng Telegram service...');
  process.exit(0);
});

console.log('='.repeat(60));
console.log('🤖 Khởi động Telegram Listener Service');
console.log('='.repeat(60));

startTelegramListener();
