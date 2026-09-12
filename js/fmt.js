// Numbers the way a snail keeper wants to read them. Kept out of i18n.js so the
// diary and the panels format the same way, and so the tests can check them.

// Millimetres, as the largest unit that still says something: 8 mm, 4,2 cm,
// 1,35 m, 2,4 km. A snail's odometer spends months in each of those.
export function distance(mm, lang = 'sv') {
  const d = (n, dec) => number(n, dec, lang);
  if (mm < 10) return `${d(mm, 0)} mm`;
  if (mm < 1000) return `${d(mm / 10, 1)} cm`;
  if (mm < 1000000) return `${d(mm / 1000, mm < 10000 ? 2 : 1)} m`;
  return `${d(mm / 1000000, 2)} km`;
}

export function size(mm, lang = 'sv') { return `${number(mm, 1, lang)} mm`; }

export function number(n, dec = 0, lang = 'sv') {
  const s = Number(n).toFixed(dec);
  return lang === 'sv' ? s.replace('.', ',') : s;
}

// Whole days and years, because hours stop mattering after the first evening.
export function age(ms, lang = 'sv') {
  const days = Math.floor(ms / 86400000);
  if (days < 1) {
    const h = Math.floor(ms / 3600000);
    if (h < 1) return lang === 'sv' ? `${Math.max(1, Math.floor(ms / 60000))} min` : `${Math.max(1, Math.floor(ms / 60000))} min`;
    return lang === 'sv' ? `${h} h` : `${h} h`;
  }
  if (days < 365) return lang === 'sv' ? `${days} ${days === 1 ? 'dag' : 'dagar'}` : `${days} ${days === 1 ? 'day' : 'days'}`;
  const years = Math.floor(days / 365);
  const rest = days % 365;
  const y = lang === 'sv' ? `${years} år` : `${years} ${years === 1 ? 'year' : 'years'}`;
  if (!rest) return y;
  return `${y} ${rest} ${lang === 'sv' ? (rest === 1 ? 'dag' : 'dagar') : rest === 1 ? 'day' : 'days'}`;
}

// How long something lasted, for the sealed-up stretches: "3 dagar", "5 h".
export function span(ms, lang = 'sv') {
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return lang === 'sv' ? `${days} ${days === 1 ? 'dag' : 'dagar'}` : `${days} ${days === 1 ? 'day' : 'days'}`;
  const h = Math.floor(ms / 3600000);
  if (h >= 1) return `${h} h`;
  return `${Math.max(1, Math.round(ms / 60000))} min`;
}

export function percent(v, lang = 'sv') { return `${number(Math.round(v * 100), 0, lang)} %`; }
