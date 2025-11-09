/**
 * Bỏ đuôi _USDT hoặc _USDC trong symbol để so sánh
 * @param {string} symbol - Symbol gốc
 * @returns {string} Symbol đã bỏ đuôi
 */
export function getBaseSymbol(symbol) {
  if (!symbol) return '';
  return symbol.replace(/_USDT$|_USDC$/, '');
}

/**
 * Phát hiện thay đổi trong top 1
 * So sánh base symbol (bỏ đuôi _USDT/_USDC) để tránh alert khi cùng mã nhưng khác đuôi
 * Kiểm tra whitelist: nếu top 1 mới nằm trong whitelist thì không alert
 * @param {Array} currentTop10 - Top 10 hiện tại
 * @param {Object} previousData - Dữ liệu top 10 trước đó (có thể null)
 * @returns {boolean} true nếu có thay đổi ở top 1 và không nằm trong whitelist
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

  // So sánh base symbol (bỏ đuôi _USDT/_USDC) để tránh alert khi cùng mã nhưng khác đuôi
  const currentBaseSymbol = getBaseSymbol(currentTop1Symbol);
  const previousBaseSymbol = getBaseSymbol(previousTop1Symbol);

  // Kiểm tra nếu top 1 base symbol không thay đổi
  if (currentBaseSymbol === previousBaseSymbol) {
    return false;
  }

  // Kiểm tra whitelist: nếu top 1 mới nằm trong whitelist thì không alert
  const whitelist = previousData.top1Whitelist || [];
  if (whitelist.includes(currentBaseSymbol)) {
    return false; // Nằm trong whitelist, không alert
  }

  // Top 1 thay đổi và không nằm trong whitelist
  return true;
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
      inWhitelist: false,
    };
  }

  const currentTop1 = currentTop10.length > 0 ? currentTop10[0] : null;
  const previousTop1 = previousData.top10.length > 0 ? previousData.top10[0] : null;
  const currentBaseSymbol = getBaseSymbol(currentTop1 ? currentTop1.symbol : null);
  const whitelist = previousData.top1Whitelist || [];
  const inWhitelist = whitelist.includes(currentBaseSymbol);

  return {
    changed: detectTop1Change(currentTop10, previousData),
    currentTop1,
    previousTop1,
    inWhitelist,
  };
}

/**
 * Cập nhật whitelist top 1 (chỉ giữ 2 gần nhất)
 * @param {Object} previousData - Dữ liệu trước đó
 * @param {string} newTop1BaseSymbol - Base symbol của top 1 mới
 * @returns {Array} Whitelist mới
 */
export function updateTop1Whitelist(previousData, newTop1BaseSymbol) {
  if (!newTop1BaseSymbol) {
    return previousData?.top1Whitelist || [];
  }

  const currentWhitelist = previousData?.top1Whitelist || [];
  
  // Loại bỏ symbol mới nếu đã có trong whitelist (để thêm vào đầu)
  const filteredWhitelist = currentWhitelist.filter(symbol => symbol !== newTop1BaseSymbol);
  
  // Thêm symbol mới vào đầu
  const newWhitelist = [newTop1BaseSymbol, ...filteredWhitelist];
  
  // Chỉ giữ 2 gần nhất
  return newWhitelist.slice(0, 2);
}

/**
 * Kiểm tra xem confluence có chứa ít nhất 1 timeframe lớn (4h, 8h, 1d) không
 * @param {Object} confluence - Confluence object từ checkRSIConfluence
 * @returns {boolean} true nếu có ít nhất 1 timeframe lớn trong confluence
 */
function hasLargeTimeframeInConfluence(confluence) {
  if (!confluence || !confluence.hasConfluence || !confluence.timeframes) {
    return false;
  }

  // Các timeframe lớn: 4h, 8h, 1d
  const largeTimeframes = ['Hour4', 'Hour8', 'Day1'];
  
  // Kiểm tra xem có ít nhất 1 timeframe lớn trong confluence không
  return confluence.timeframes.some(tf => largeTimeframes.includes(tf));
}

/**
 * Phát hiện các token có RSI confluence tăng so với lần check trước
 * Chỉ trả về các token có confluence tăng VÀ có ít nhất 1 timeframe lớn (4h, 8h, 1d) trong confluence hiện tại
 * @param {Array} currentTop10 - Top 10 hiện tại (có RSI data)
 * @param {Object} previousData - Dữ liệu top 10 trước đó (có thể null)
 * @returns {Array} Mảng các token có confluence tăng: [{ token, previousCount, currentCount, increase }]
 */
export function detectRSIConfluenceIncrease(currentTop10, previousData) {
  // Lần chạy đầu tiên, không có dữ liệu để so sánh
  if (!previousData || !previousData.top10 || previousData.top10.length === 0) {
    return [];
  }

  const previousTop10 = previousData.top10;
  const increases = [];

  // Tạo map của previousTop10 để tra cứu nhanh theo symbol
  const previousTokenMap = new Map();
  previousTop10.forEach(token => {
    if (token && token.symbol) {
      previousTokenMap.set(token.symbol, token);
    }
  });

  // So sánh từng token trong currentTop10
  currentTop10.forEach(currentToken => {
    if (!currentToken || !currentToken.symbol) {
      return;
    }

    const previousToken = previousTokenMap.get(currentToken.symbol);
    
    // Nếu token không có trong previous data, bỏ qua (token mới)
    if (!previousToken) {
      return;
    }

    // Lấy RSI confluence count hiện tại và trước đó
    const currentConfluence = currentToken.rsiConfluence || {};
    const previousConfluence = previousToken.rsiConfluence || {};
    
    const currentCount = currentConfluence.hasConfluence ? (currentConfluence.count || 0) : 0;
    const previousCount = previousConfluence.hasConfluence ? (previousConfluence.count || 0) : 0;

    // Nếu confluence count tăng VÀ confluence hiện tại có ít nhất 1 timeframe lớn
    if (currentCount > previousCount && hasLargeTimeframeInConfluence(currentConfluence)) {
      increases.push({
        token: currentToken,
        previousCount,
        currentCount,
        increase: currentCount - previousCount,
        previousConfluence: previousConfluence,
        currentConfluence: currentConfluence,
      });
    }
  });

  return increases;
}

/**
 * Lấy thông tin chi tiết về RSI confluence increase
 * @param {Array} currentTop10 - Top 10 hiện tại (có RSI data)
 * @param {Object} previousData - Dữ liệu top 10 trước đó
 * @returns {Object} Thông tin về confluence increase
 */
export function getRSIConfluenceIncreaseInfo(currentTop10, previousData) {
  const increases = detectRSIConfluenceIncrease(currentTop10, previousData);

  return {
    hasIncrease: increases.length > 0,
    increases: increases,
    count: increases.length,
  };
}

