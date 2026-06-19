export const parseRealScorers = (value) => {
  if (!value || value === 'null' || value === 'undefined') return [];
  return String(value)
    .replace(/[{}"“”]/g, '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/(.+?)\s+(\d+)'?/);
      return match ? { name: match[1].trim(), min: Number(match[2]) } : { name: part, min: 45 };
    })
    .sort((a, b) => a.min - b.min);
};
