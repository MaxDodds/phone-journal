// Day keys are local-time "YYYY-MM-DD" strings, so they sort and compare as plain strings.
export const pad = (n) => String(n).padStart(2, '0');

export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const parseKey = (k) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (k, n) => {
  const d = parseKey(k);
  d.setDate(d.getDate() + n);
  return dayKey(d);
};

// Streak math for a daily journal. Today never counts as missed — it's still open.
export function journalStats(entries, start, today = dayKey()) {
  const days = new Set(entries.map((e) => e.day));
  const out = {
    start,
    days,
    total: entries.length,
    doneToday: days.has(today),
    streak: 0,
    longest: 0,
    missed: 0,
    missedDays: new Set(),
  };
  if (!start) return out;

  let run = 0;
  for (let d = start; d <= today; d = addDays(d, 1)) {
    if (days.has(d)) {
      run++;
      out.longest = Math.max(out.longest, run);
    } else if (d !== today) {
      out.missed++;
      out.missedDays.add(d);
      run = 0;
    }
  }

  let d = out.doneToday ? today : addDays(today, -1);
  while (days.has(d)) {
    out.streak++;
    d = addDays(d, -1);
  }
  return out;
}
