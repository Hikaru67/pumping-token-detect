/**
 * Phát hiện thay đổi trong top 3
 * @param {Array} currentTop10 - Top 10 hiện tại
 * @param {Object} previousData - Dữ liệu top 10 trước đó (có thể null)
 * @returns {boolean} true nếu có thay đổi ở top 3
 */
export function detectTop3Changes(currentTop10, previousData) {
  // Lần chạy đầu tiên, không có dữ liệu để so sánh
  if (!previousData || !previousData.top10 || previousData.top10.length === 0) {
    return false;
  }

  const previousTop10 = previousData.top10;

  // Lấy top 3 symbols hiện tại
  const currentTop3Symbols = currentTop10.slice(0, 3).map(token => token.symbol);
  
  // Lấy top 3 symbols trước đó
  const previousTop3Symbols = previousTop10.slice(0, 3).map(token => token.symbol);

  // Kiểm tra nếu top 3 symbols thay đổi
  if (JSON.stringify(currentTop3Symbols) !== JSON.stringify(previousTop3Symbols)) {
    return true;
  }

  // Kiểm tra nếu ranking thay đổi (cùng symbols nhưng khác thứ tự)
  const currentSorted = [...currentTop3Symbols].sort();
  const previousSorted = [...previousTop3Symbols].sort();
  
  if (
    JSON.stringify(currentSorted) === JSON.stringify(previousSorted) &&
    JSON.stringify(currentTop3Symbols) !== JSON.stringify(previousTop3Symbols)
  ) {
    return true;
  }

  return false;
}

/**
 * Lấy thông tin chi tiết về thay đổi top 3
 * @param {Array} currentTop10 - Top 10 hiện tại
 * @param {Object} previousData - Dữ liệu top 10 trước đó
 * @returns {Object} Thông tin về thay đổi
 */
export function getTop3ChangeInfo(currentTop10, previousData) {
  if (!previousData || !previousData.top10) {
    return {
      changed: true,
      currentTop3: currentTop10.slice(0, 3),
      previousTop3: [],
    };
  }

  const currentTop3 = currentTop10.slice(0, 3);
  const previousTop3 = previousData.top10.slice(0, 3);

  return {
    changed: detectTop3Changes(currentTop10, previousData),
    currentTop3,
    previousTop3,
  };
}

