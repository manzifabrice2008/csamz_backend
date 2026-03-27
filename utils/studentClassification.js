const TRADE_LABELS = {
  "software development": "Software Development",
  "computer systems and networks": "Computer System and Architecture",
  "computer system and architecture": "Computer System and Architecture",
  "plumbing technology": "Plumbing Technology",
  "building construction": "Building Construction",
  "wood technology": "Wood Technology",
};

const normalizeTradeValue = (value) => {
  if (typeof value !== 'string') return '';
  const compact = value.trim().replace(/\s+/g, ' ');
  if (!compact) return '';
  const lowered = compact.toLowerCase();
  return TRADE_LABELS[lowered] || compact;
};

const normalizeLevelValue = (value, fallback = 'L3') => {
  if (typeof value !== 'string') return fallback;

  const compact = value.trim().toUpperCase();
  if (!compact) return fallback;

  if (['L3', 'L4', 'L5'].includes(compact)) {
    return compact;
  }

  const levelNumber = compact.replace(/[^0-9]/g, '');
  if (['3', '4', '5'].includes(levelNumber)) {
    return `L${levelNumber}`;
  }

  return fallback;
};

const normalizeStudentRecord = (student) => {
  if (!student) return student;

  return {
    ...student,
    trade: normalizeTradeValue(student.trade),
    level: normalizeLevelValue(student.level),
  };
};

module.exports = {
  normalizeTradeValue,
  normalizeLevelValue,
  normalizeStudentRecord,
};
