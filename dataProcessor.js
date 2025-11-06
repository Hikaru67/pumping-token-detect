/**
 * Bỏ đuôi _USDT hoặc _USDC trong symbol để so sánh
 * @param {string} symbol - Symbol gốc
 * @returns {string} Symbol đã bỏ đuôi
 */
function getBaseSymbol(symbol) {
  if (!symbol) return '';
  return symbol.replace(/_USDT$|_USDC$/, '');
}

/**
 * Lọc và sắp xếp token để lấy top 10 pump dựa trên riseFallRate
 * Loại bỏ các symbol trùng lặp (chỉ khác đuôi _USDT/_USDC)
 * @param {Array} data - Dữ liệu từ API
 * @returns {Array} Top 10 token có riseFallRate cao nhất
 */
export function getTop10PumpTokens(data) {
  if (!Array.isArray(data)) {
    throw new Error('Dữ liệu đầu vào phải là array');
  }

  if (data.length === 0) {
    console.warn('⚠️  API trả về mảng rỗng');
    return [];
  }

  // Lọc các token hợp lệ
  // Chỉ cần volume24 > 0 và có symbol, không cần kiểm tra giá
  const validTokens = data.filter(token => {
    return (
      token &&
      typeof token.volume24 === 'number' &&
      token.volume24 > 0 &&
      token.symbol &&
      typeof token.riseFallRate === 'number' &&
      !isNaN(token.riseFallRate)
    );
  });

  if (validTokens.length === 0) {
    console.warn('⚠️  Không có token hợp lệ nào');
    return [];
  }

  // Group các token theo base symbol (bỏ đuôi _USDT/_USDC)
  // Chỉ giữ lại token có riseFallRate cao nhất trong mỗi group
  const symbolMap = new Map();
  
  validTokens.forEach(token => {
    const baseSymbol = getBaseSymbol(token.symbol);
    const existing = symbolMap.get(baseSymbol);
    
    // Nếu chưa có hoặc token hiện tại có riseFallRate cao hơn, thay thế
    if (!existing || token.riseFallRate > existing.riseFallRate) {
      symbolMap.set(baseSymbol, token);
    }
  });

  // Chuyển Map thành array
  const uniqueTokens = Array.from(symbolMap.values());

  if (uniqueTokens.length === 0) {
    console.warn('⚠️  Không có token nào sau khi lọc trùng lặp');
    return [];
  }

  // Sắp xếp theo riseFallRate giảm dần (tăng nhiều nhất)
  const sortedTokens = uniqueTokens.sort((a, b) => b.riseFallRate - a.riseFallRate);

  // Lấy top 10 và thêm rank
  const top10 = sortedTokens.slice(0, 10).map((token, index) => {
    const riseFallRate = parseFloat(token.riseFallRate.toFixed(4));
    const fundingRate = (token.fundingRate !== undefined && 
                        token.fundingRate !== null && 
                        typeof token.fundingRate === 'number' &&
                        !isNaN(token.fundingRate))
      ? parseFloat(token.fundingRate.toFixed(6)) 
      : 0;

    return {
      rank: index + 1,
      symbol: token.symbol,
      riseFallRate,
      riseFallValue: token.riseFallValue,
      high24Price: token.high24Price,
      lower24Price: token.lower24Price,
      lastPrice: token.lastPrice,
      volume24: token.volume24,
      contractId: token.contractId,
      fundingRate,
    };
  });

  return top10;
}

