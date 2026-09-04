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
