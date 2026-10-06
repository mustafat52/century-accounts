// Run with: npm test   (Node 22+, no extra dependencies)
// Tiny assert helpers so this file needs no Node type definitions.
function equal(actual: number, expected: number) {
  if (actual !== expected) throw new Error(`Expected ${expected} but got ${actual}`);
}
const assert = { equal };
import { roundUpTo6, glassLine, simpleLine, quotationTotals } from '../src/lib/quotationMath.ts';

assert.equal(roundUpTo6(46), 48);
assert.equal(roundUpTo6(48), 48);
assert.equal(roundUpTo6(0), 0);
assert.equal(roundUpTo6(-3), 0);

// 36in x 36in, qty 1 -> 9 sft; rate 100, polish 10/rft, fixing 25/sft
const g = glassLine({ lengthIn: 36, widthIn: 36, qty: 1, ratePerSft: 100, polishRate: 10, fixingRatePerSft: 25 });
assert.equal(g.sft, 9);
assert.equal(g.workGlass, 900);
assert.equal(g.rft, 12);
assert.equal(g.polishAmt, 120);
assert.equal(g.fixingAmt, 225);
assert.equal(g.amount, 1245);

// Labour-only row: glass rate 0, polish/fixing still charged
const l = glassLine({ lengthIn: 36, widthIn: 36, qty: 1, ratePerSft: 0, polishRate: 0, fixingRatePerSft: 25 });
assert.equal(l.amount, 225);

// Rounds up before computing: 46x30 -> 48x30
assert.equal(glassLine({ lengthIn: 46, widthIn: 30, qty: 1, ratePerSft: 1, polishRate: 0, fixingRatePerSft: 0 }).sft, 10);

assert.equal(simpleLine(3, 33.333).amount, 100);

// GST kept to paise, not whole rupees
const t = quotationTotals(1001, 10, true, 50);
assert.equal(t.discountAmount, 100.1);
assert.equal(t.taxable, 900.9);
assert.equal(t.gst, 162.16);
assert.equal(t.grandTotal, 1113.06);
assert.equal(quotationTotals(1000, 0, false, 0).grandTotal, 1000);

console.log('quotationMath: all checks passed');