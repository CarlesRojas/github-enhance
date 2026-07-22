// Tiny token-based date formatter (moment-style tokens, no dependencies).
//
// Supported tokens:
//   YYYY 2026   YY 26
//   MMMM July   MMM Jul   MM 07   M 7
//   DD 22       D 22
//   dddd Wednesday   ddd Wed
//   HH 14   H 14   hh 02   h 2   (h/hh = 12-hour)
//   mm 30   m 30
//   ss 09   s 9
//   A PM    a pm
//
// Wrap literal text in [square brackets] to keep it from being parsed,
// e.g. "YYYY-MM-DD [at] HH:mm".

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0');
}

// Longest-first so e.g. YYYY wins over YY at the same position.
const TOKENS = [
  'YYYY', 'YY',
  'MMMM', 'MMM', 'MM', 'M',
  'DD', 'D',
  'dddd', 'ddd',
  'HH', 'H',
  'hh', 'h',
  'mm', 'm',
  'ss', 's',
  'A', 'a',
];
const TOKEN_RE = new RegExp(TOKENS.join('|'), 'g');

function tokenValue(token: string, d: Date): string {
  const h24 = d.getHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  switch (token) {
    case 'YYYY': return String(d.getFullYear());
    case 'YY': return pad(d.getFullYear() % 100);
    case 'MMMM': return MONTHS[d.getMonth()];
    case 'MMM': return MONTHS[d.getMonth()].slice(0, 3);
    case 'MM': return pad(d.getMonth() + 1);
    case 'M': return String(d.getMonth() + 1);
    case 'DD': return pad(d.getDate());
    case 'D': return String(d.getDate());
    case 'dddd': return DAYS[d.getDay()];
    case 'ddd': return DAYS[d.getDay()].slice(0, 3);
    case 'HH': return pad(h24);
    case 'H': return String(h24);
    case 'hh': return pad(h12);
    case 'h': return String(h12);
    case 'mm': return pad(d.getMinutes());
    case 'm': return String(d.getMinutes());
    case 'ss': return pad(d.getSeconds());
    case 's': return String(d.getSeconds());
    case 'A': return h24 < 12 ? 'AM' : 'PM';
    case 'a': return h24 < 12 ? 'am' : 'pm';
    default: return token;
  }
}

export function formatDate(date: Date, pattern: string): string {
  // Split out [literal] escapes and only tokenise the non-escaped parts.
  return pattern
    .split(/(\[[^\]]*\])/g)
    .map((part) => {
      if (part.startsWith('[') && part.endsWith(']')) return part.slice(1, -1);
      return part.replace(TOKEN_RE, (m) => tokenValue(m, date));
    })
    .join('');
}

/**
 * Remove the year token (YY–YYYY) and one adjacent separator from a pattern,
 * e.g. "MMM D, YYYY" -> "MMM D", "YYYY-MM-DD HH:mm" -> "MM-DD HH:mm".
 */
export function stripYear(pattern: string): string {
  return pattern
    .replace(/^Y{2,4}[\s,/.\-]+/, '') // leading "YYYY-" / "YYYY "
    .replace(/[\s,/.\-]+Y{2,4}/g, '') // " YYYY" / ", YYYY" / "/YYYY"
    .replace(/Y{2,4}/g, '') // any bare leftover
    .replace(/\s{2,}/g, ' ')
    .trim();
}
