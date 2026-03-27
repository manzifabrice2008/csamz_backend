const { normalizeTradeValue } = require('./studentClassification');

const validLevels = new Set(['L3', 'L4', 'L5']);

const explodeValues = (value) => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => explodeValues(item));
  }

  if (typeof value !== 'string') {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const uniqueValues = (values) => [...new Set(values)];

const getTeacherTrades = (teacher) => {
  const trades = uniqueValues(explodeValues(teacher?.trades).map((trade) => normalizeTradeValue(trade)).filter(Boolean));
  if (trades.length > 0) return trades;
  return uniqueValues(explodeValues(teacher?.trade).map((trade) => normalizeTradeValue(trade)).filter(Boolean));
};

const getTeacherLevels = (teacher) => {
  const levels = uniqueValues(
    explodeValues(teacher?.levels).map((level) => level.toUpperCase()).filter((level) => validLevels.has(level))
  );

  if (levels.length > 0) return levels;

  return uniqueValues(
    explodeValues(teacher?.level).map((level) => level.toUpperCase()).filter((level) => validLevels.has(level))
  );
};

module.exports = {
  getTeacherTrades,
  getTeacherLevels,
  validLevels,
};
