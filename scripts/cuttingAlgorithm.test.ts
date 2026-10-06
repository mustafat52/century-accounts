// Run with: npm test   (Node 22+, no extra dependencies)
import { generateCuttingPlan } from '../src/lib/cuttingAlgorithm.ts';
import type { PlanResult, Piece, AvailableStock } from '../src/lib/cuttingAlgorithm.ts';

function check(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}
function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface R { x: number; y: number; w: number; l: number }

// A layout is guillotine-valid if the whole rectangle can be split by one
// edge-to-edge cut that no item straddles, recursively on both halves.
function isGuillotine(region: R, items: R[]): boolean {
  if (items.length <= 1) return true;
  const e = 1e-7;
  const xs = [...new Set(items.flatMap((i) => [i.x, i.x + i.w]))].filter((c) => c > region.x + e && c < region.x + region.w - e);
  for (const c of xs) {
    if (items.some((i) => i.x < c - e && i.x + i.w > c + e)) continue;
    const left = items.filter((i) => i.x + i.w <= c + e);
    const right = items.filter((i) => i.x >= c - e);
    if (left.length && right.length) {
      return isGuillotine({ ...region, w: c - region.x }, left) && isGuillotine({ x: c, y: region.y, w: region.x + region.w - c, l: region.l }, right);
    }
  }
  const ys = [...new Set(items.flatMap((i) => [i.y, i.y + i.l]))].filter((c) => c > region.y + e && c < region.y + region.l - e);
  for (const c of ys) {
    if (items.some((i) => i.y < c - e && i.y + i.l > c + e)) continue;
    const low = items.filter((i) => i.y + i.l <= c + e);
    const high = items.filter((i) => i.y >= c - e);
    if (low.length && high.length) {
      return isGuillotine({ ...region, l: c - region.y }, low) && isGuillotine({ x: region.x, y: c, w: region.w, l: region.y + region.l - c }, high);
    }
  }
  return false;
}

function overlap(a: R, b: R) {
  const e = 1e-7;
  return a.x < b.x + b.w - e && b.x < a.x + a.w - e && a.y < b.y + b.l - e && b.y < a.y + a.l - e;
}

function validate(plan: PlanResult, pieces: Piece[], label: string) {
  const placedIds = new Set<string>();
  for (const s of plan.sheets) {
    const items: R[] = [
      ...s.placedPieces.map((p) => ({ x: p.xIn, y: p.yIn, w: p.widthIn, l: p.lengthIn })),
      ...s.leftoverRegions.map((r) => ({ x: r.xIn, y: r.yIn, w: r.widthIn, l: r.lengthIn })),
    ];
    for (const it of items) {
      check(it.x >= -1e-7 && it.y >= -1e-7 && it.x + it.w <= s.sheetWidthIn + 1e-7 && it.y + it.l <= s.sheetLengthIn + 1e-7, `${label}: item outside sheet`);
    }
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) check(!overlap(items[i], items[j]), `${label}: overlap`);
    const area = items.reduce((a, r) => a + r.w * r.l, 0);
    // all glass accounted for (slivers under 0.01in are intentionally not reported)
    check(Math.abs(area - s.sheetWidthIn * s.sheetLengthIn) < 0.05 * (s.sheetWidthIn + s.sheetLengthIn), `${label}: glass area not fully accounted for (${area} vs ${s.sheetWidthIn * s.sheetLengthIn})`);
    check(isGuillotine({ x: 0, y: 0, w: s.sheetWidthIn, l: s.sheetLengthIn }, items), `${label}: layout is not guillotine-cuttable`);
    for (const p of s.placedPieces) {
      check(!placedIds.has(p.pieceId), `${label}: piece placed twice`);
      placedIds.add(p.pieceId);
      const src = pieces.find((x) => x.id === p.pieceId)!;
      const ok = (p.widthIn === src.widthIn && p.lengthIn === src.lengthIn && !p.rotated) || (p.widthIn === src.lengthIn && p.lengthIn === src.widthIn && p.rotated);
      check(ok, `${label}: placed piece size/rotation does not match the request`);
    }
  }
  for (const p of pieces) check(placedIds.has(p.id) || plan.unfulfillable.some((u) => u.id === p.id), `${label}: piece ${p.id} lost`);
}

// ---- hand-made cases ----
const stockOf = (l: number, w: number, q = 50, origin: 'fresh' | 'waste' = 'fresh', id = 'S'): AvailableStock => ({ stockId: id, lengthIn: l, widthIn: w, origin, quantity: q });

{
  // four 48x36 pieces tile a 96x72 sheet exactly: 1 sheet, no waste
  const pieces: Piece[] = [0, 1, 2, 3].map((i) => ({ id: `a:${i}`, lengthIn: 48, widthIn: 36 }));
  const plan = generateCuttingPlan(pieces, [stockOf(96, 72)]);
  validate(plan, pieces, 'exact tiling');
  check(plan.sheets.length === 1 && plan.sheets[0].leftoverRegions.length === 0, 'exact tiling should use 1 sheet with zero waste');
}
{
  // waste offcut is used before fresh stock
  const pieces: Piece[] = [{ id: 'w:0', lengthIn: 24, widthIn: 24 }];
  const plan = generateCuttingPlan(pieces, [stockOf(96, 72), stockOf(30, 30, 1, 'waste', 'W')]);
  validate(plan, pieces, 'waste first');
  check(plan.sheets.length === 1 && plan.sheets[0].origin === 'waste', 'a piece that fits a waste offcut must use it, not a fresh sheet');
}
{
  // a piece bigger than every stock is reported, not dropped
  const pieces: Piece[] = [{ id: 'big:0', lengthIn: 200, widthIn: 200 }];
  const plan = generateCuttingPlan(pieces, [stockOf(96, 72)]);
  check(plan.sheets.length === 0 && plan.unfulfillable.length === 1, 'oversize piece must be unfulfillable');
}
{
  // right-sizing: one small piece should not burn the biggest sheet
  const pieces: Piece[] = [{ id: 'r:0', lengthIn: 30, widthIn: 20 }];
  const plan = generateCuttingPlan(pieces, [stockOf(144, 96, 5, 'fresh', 'BIG'), stockOf(48, 36, 5, 'fresh', 'SMALL')]);
  check(plan.sheets[0].sourceStockId === 'SMALL', 'should cut a small piece from the smallest sheet that holds it');
}
{
  // stock quantity is respected
  const pieces: Piece[] = Array.from({ length: 6 }, (_, i) => ({ id: `q:${i}`, lengthIn: 72, widthIn: 48 }));
  const plan = generateCuttingPlan(pieces, [stockOf(96, 72, 2)]);
  validate(plan, pieces, 'quantity');
  check(plan.sheets.length <= 2, 'cannot use more sheets than are in stock');
  check(plan.unfulfillable.length > 0, 'pieces that no longer fit in stock must be reported');
}

// ---- random orders: every plan must be physically valid ----
const sizes = [[96, 72], [120, 84], [144, 96]];
const t0 = Date.now();
for (let seed = 1; seed <= 120; seed++) {
  const r = rng(seed);
  const stock: AvailableStock[] = [];
  const n = 1 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) { const [l, w] = sizes[Math.floor(r() * sizes.length)]; stock.push(stockOf(l, w, 50, 'fresh', `S${i}`)); }
  for (let i = 0; i < Math.floor(r() * 4); i++) stock.push(stockOf(20 + Math.floor(r() * 50), 15 + Math.floor(r() * 40), 1, 'waste', `W${i}`));
  const pieces: Piece[] = [];
  const types = 2 + Math.floor(r() * 6);
  for (let t = 0; t < types; t++) {
    const l = 6 + Math.floor(r() * 54) + (r() < 0.3 ? 0.5 : 0), w = 6 + Math.floor(r() * 42), q = 1 + Math.floor(r() * 6);
    for (let i = 0; i < q; i++) pieces.push({ id: `${t}:${i}`, lengthIn: l, widthIn: w });
  }
  const plan = generateCuttingPlan(pieces, stock, { seed });
  validate(plan, pieces, `random #${seed}`);
  const again = generateCuttingPlan(pieces, stock, { seed, timeBudgetMs: 5000, maxIterations: 50 });
  validate(again, pieces, `random #${seed} (second run)`);
}
check(Date.now() - t0 < 120000, 'search is too slow');

// ---- big order stays responsive ----
{
  const r = rng(99);
  const pieces: Piece[] = Array.from({ length: 150 }, (_, i) => ({ id: `b:${i}`, lengthIn: 8 + Math.floor(r() * 40), widthIn: 6 + Math.floor(r() * 30) }));
  const s = Date.now();
  const plan = generateCuttingPlan(pieces, [stockOf(144, 96)]);
  validate(plan, pieces, 'big order');
  check(Date.now() - s < 4000, 'a 150-piece order should plan in a few seconds at most');
}

console.log('cuttingAlgorithm: all checks passed');