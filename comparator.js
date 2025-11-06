/**
 * Phát hiện thay đổi trong top 1
 * @param {Array} currentTop10 - Top 10 hiện tại
 * @param {Object} previousData - Dữ liệu top 10 trước đó (có thể null)
 * @returns {boolean} true nếu có thay đổi ở top 1
 */
export function detectTop1Change(currentTop10, previousData) {
  // Lần chạy đầu tiên, không có dữ liệu để so sánh
  if (!previousData || !previousData.top10 || previousData.top10.length === 0) {
    return false;
  }

  const previousTop10 = previousData.top10;

  // Lấy top 1 symbol hiện tại
  const currentTop1Symbol = currentTop10.length > 0 ? currentTop10[0].symbol : null;
  
  // Lấy top 1 symbol trước đó
  const previousTop1Symbol = previousTop10.length > 0 ? previousTop10[0].symbol : null;

  // Kiểm tra nếu top 1 symbol thay đổi
  return currentTop1Symbol !== previousTop1Symbol;
}

/**
 * Lấy thông tin chi tiết về thay đổi top 1
 * @param {Array} currentTop10 - Top 10 hiện tại
 * @param {Object} previousData - Dữ liệu top 10 trước đó
 * @returns {Object} Thông tin về thay đổi
 */
export function getTop1ChangeInfo(currentTop10, previousData) {
  if (!previousData || !previousData.top10) {
    return {
      changed: false, // Không gửi alert lần đầu tiên
      currentTop1: currentTop10.length > 0 ? currentTop10[0] : null,
      previousTop1: null,
    };
  }

  const currentTop1 = currentTop10.length > 0 ? currentTop10[0] : null;
  const previousTop1 = previousData.top10.length > 0 ? previousData.top10[0] : null;

  return {
    changed: detectTop1Change(currentTop10, previousData),
    currentTop1,
    previousTop1,
  };
}

