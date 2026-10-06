// Single source of truth for quotation arithmetic. QuotationModal (live
// preview) and AppContext (what actually gets saved) both import from
// here, so the number on screen can never drift from the stored number.

// Glass is billed in 6-inch increments: any entered length/width rounds UP
// to the next multiple of 6 (46in bills as 48in, never 45in).
export const roundUpTo6 = (n: number): number => (n > 0 ? Math.ceil(n / 6) * 6 : 0);

export const round2 = (n: number): number => Math.round(n * 100) / 100;

// Glass rates below this (₹ per sft) trigger a confirmation in
// QuotationModal. Real glass is never this cheap; a value this low is
// almost always a placeholder or typo (see QUO-209 / QUO-223).
export const LOW_GLASS_RATE_THRESHOLD = 20;

export const GST_RATE = 0.18;

export interface GlassLineInput {
  lengthIn: number;
  widthIn: number;
  qty: number;
  ratePerSft: number; // 0 for labour-only rows
  polishRate: number;
  fixingRatePerSft: number;
}

export function glassLine(i: GlassLineInput) {
  const len = roundUpTo6(i.lengthIn);
  const wid = roundUpTo6(i.widthIn);
  const sft = round2(((len * wid) / 144) * i.qty);
  const workGlass = round2(sft * i.ratePerSft);
  const rft = round2(((2 * (len + wid)) / 12) * i.qty);
  const polishAmt = round2(rft * (i.polishRate || 0));
  const fixingAmt = round2(sft * (i.fixingRatePerSft || 0));
  return { len, wid, sft, workGlass, rft, polishAmt, fixingAmt, amount: round2(workGlass + polishAmt + fixingAmt) };
}

export function simpleLine(quantity: number, rate: number) {
  return { amount: round2(quantity * rate) };
}

export function quotationTotals(subtotal: number, discountPercent: number, gstEnabled: boolean, transportation: number) {
  const discountAmount = round2(subtotal * (discountPercent / 100));
  const taxable = round2(subtotal - discountAmount);
  const gst = gstEnabled ? round2(taxable * GST_RATE) : 0;
  const grandTotal = round2(taxable + gst + (transportation || 0));
  return { subtotal: round2(subtotal), discountAmount, taxable, gst, grandTotal };
}