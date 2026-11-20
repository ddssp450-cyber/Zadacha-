// "ноември 2026" style label for a date's month, capitalised: "Ноември 2026".
export const monthLabel = (d: Date) => {
  const s = d.toLocaleDateString('bg-BG', { month: 'long', year: 'numeric' }).replace(/\s*г\.$/, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const nextMonth = (day = 20) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, day);
};

// Local-time YYYY-MM-DD (toISOString would shift the day near midnight).
export const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
