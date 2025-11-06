/**
 * Lọc và sắp xếp token để lấy top 10 pump dựa trên riseFallRate
 * @param {Array} data - Dữ liệu từ API
 * @returns {Array} Top 10 token có riseFallRate cao nhất
 */
export function getTop10PumpTokens(data) {
  if (!Array.isArray(data)) {
    throw new Error('Dữ liệu đầu vào phải là array');
  }

  // Lọc các token hợp lệ
  // Chỉ cần volume24 > 0 và có symbol, không cần kiểm tra giá
  const validTokens = data.filter(token => {
    return (
      token.volume24 > 0 &&
      token.symbol &&
      token.riseFallRate !== undefined &&
      token.riseFallRate !== null
    );
  });

  // Sắp xếp theo riseFallRate giảm dần (tăng nhiều nhất)
  const sortedTokens = validTokens.sort((a, b) => b.riseFallRate - a.riseFallRate);

  // Lấy top 10 và thêm rank
  const top10 = sortedTokens.slice(0, 10).map((token, index) => ({
    rank: index + 1,
    symbol: token.symbol,
    riseFallRate: parseFloat(token.riseFallRate.toFixed(4)),
    riseFallValue: token.riseFallValue,
    high24Price: token.high24Price,
    lower24Price: token.lower24Price,
    lastPrice: token.lastPrice,
    volume24: token.volume24,
    contractId: token.contractId,
    fundingRate: token.fundingRate !== undefined && token.fundingRate !== null 
      ? parseFloat(token.fundingRate.toFixed(6)) 
      : 0,
  }));

  return top10;
}

