const OBJECT_ID = /^[a-f0-9]{24}$/i;

function isObjectId(value) {
  return typeof value === 'string' && OBJECT_ID.test(value);
}

/** Strips control characters and caps length. User content is always rendered as text. */
function cleanString(value, max = 500) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

function cleanStringArray(value, { max = 20, maxLen = 40 } = {}) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const item of value) {
    const s = cleanString(item, maxLen);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function isEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim()) && value.length <= 254;
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Derives a unique-ish username from a display name. */
function slugifyUsername(name, fallback = 'user') {
  const base = String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 18);
  return base || fallback;
}

module.exports = {
  isObjectId,
  cleanString,
  cleanStringArray,
  isEmail,
  clampNumber,
  parseDate,
  slugifyUsername,
  escapeRegex: (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
};
