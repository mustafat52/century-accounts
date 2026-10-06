export function formatINR(amount: number): string {
  return '₹' + amount.toLocaleString('en-IN');
}

// Capitalizes only the first character of a string, leaving the rest
// untouched — used on free-text entry fields (names, descriptions, areas,
// etc.) so typed entries start with a capital letter by default without
// forcing awkward Title Case on every word. Safe to call on phone numbers,
// GSTINs, or anything non-alphabetic — capitalizing a digit is a no-op.
export function capitalizeFirst(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}


// ---------- Calendar dates (timezone-safe) ----------
// `new Date().toISOString().slice(0, 10)` gives the UTC date, which in
// India (UTC+5:30) is still "yesterday" between midnight and 5:30am.
// These build YYYY-MM-DD from LOCAL date parts instead.
export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayLocal(): string {
  return formatLocalDate(new Date());
}

// Adds whole days to a YYYY-MM-DD string using pure calendar arithmetic,
// so the result never shifts with the viewer's timezone.
export function addDaysLocal(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}