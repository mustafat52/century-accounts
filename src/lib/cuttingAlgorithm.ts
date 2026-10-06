// Guillotine cutting-stock optimizer (multi-strategy search).
//
// WHY THIS REPLACED THE OLD SHELF PACKER
// The previous version packed pieces in rows ("shelves") in one fixed
// order, in a single pass. That is fast but leaves a lot of glass on the
// table:
//   1. Only ONE ordering was ever tried (largest area first). Real cutting
//      optimizers try many orderings/strategies and keep the best result.
//   2. A shelf is as tall as its first piece; every shorter piece in that
//      row left an unused strip ABOVE it that was neither reused for later
//      pieces nor reported as offcut (the old plans silently dropped ~4% of
//      all sheet area from their own accounting).
//   3. Rotation was chosen to save width only, ignoring the height wasted.
//   4. Choosing which stock size to open counted sheets, not glass used.
//
// HOW IT WORKS NOW
// Every sheet is kept as a set of FREE RECTANGLES. Placing a piece in a
// free rectangle splits the remainder into two new free rectangles with one
// edge-to-edge cut, so every layout is guillotine-valid by construction
// (each cut runs the full width/length of the rectangle being cut, which is
// what a glass cutter can actually do). Free space is therefore always
// accounted for exactly, and later pieces can use gaps next to short pieces.
//
// A piece goes into the best free rectangle across ALL open sheets (not the
// first one that fits). The search then runs the whole plan many times with
// different piece orderings, fit rules, split rules and stock-size rules,
// plus a randomized/hill-climbing phase, and keeps the plan that is best by:
//   1. fewest pieces left unfulfilled,
//   2. least FRESH glass area consumed (waste offcuts are used first, as the
//      client requires, and cost nothing),
//   3. fewest sheets,
//   4. fewest distinct cutting patterns (repeat layouts are easier to cut),
//   5. biggest, most reusable leftover pieces.
// A final pass "right-sizes" each sheet to the smallest stock that still
// holds its layout.
//
// Coordinates: x runs along a sheet's WIDTH, y along its LENGTH.

export interface Piece {
  /** Caller-supplied id (e.g. a per-instance key derived from a job item), used to trace a placement back to its request. */
  id: string;
  lengthIn: number;
  widthIn: number;
}

// Origin tag used only within planning, for source-preference ordering —
// 'fresh' means pulled from inv_stock; 'waste' means pulled from the
// inv_waste ledger (previously a separate "remnant" concept living in
// inv_stock, merged into inv_waste per the client's own instruction: the
// old 50%-used stock/waste split added no value, since the algorithm
// already checks whatever's sitting in the waste pool before reaching
// for a fresh sheet — so there's no reason to keep some leftovers in a
// separate "remnant stock" bucket at all. Everything leftover is waste;
// waste is simply checked first.
export type StockOrigin = 'fresh' | 'waste';

// Only one value now — kept as a named type (rather than a bare boolean)
// so call sites read `leftoverClassification === 'waste'` instead of a
// less self-explanatory `!= null`, and so a future distinction could be
// reintroduced without a wider rename if ever needed again.
export type LeftoverClassification = 'waste';

export interface AvailableStock {
  stockId: string;
  lengthIn: number;
  widthIn: number;
  origin: StockOrigin;
  /** How many identical sheets of this size/origin are available. Consumed as sheets are opened during planning — this is a working copy, not the live DB value. */
  quantity: number;
}

export interface PlacedPiece {
  pieceId: string;
  lengthIn: number; // as placed, i.e. after rotation is applied
  widthIn: number;
  xIn: number;
  yIn: number;
  rotated: boolean;
}

export interface LeftoverRegion {
  xIn: number;
  yIn: number;
  widthIn: number;
  lengthIn: number;
}

export interface SheetUsage {
  sourceStockId: string;
  sheetLengthIn: number;
  sheetWidthIn: number;
  origin: StockOrigin;
  placedPieces: PlacedPiece[];
  /** Every distinct pocket of unused space on this sheet, decomposed into non-overlapping guillotine-valid rectangles. Empty array if the sheet is fully used. */
  leftoverRegions: LeftoverRegion[];
  /** Every leftover region is waste (see StockOrigin). Null when leftoverRegions is empty. */
  leftoverClassification: LeftoverClassification | null;
  usedAreaFraction: number;
}

export interface PlanResult {
  sheets: SheetUsage[];
  unfulfillable: Piece[];
}

export interface PlanOptions {
  /** Blade thickness lost on every cut, in inches. Default 0. */
  kerfIn?: number;
  /** Max milliseconds spent on the random/local search after the fixed strategy grid. Default 600. */
  timeBudgetMs?: number;
  /** Hard cap on search runs after the grid. Default 2000. */
  maxIterations?: number;
  /** Seed for the search's random generator (same input + seed = same plan when the cap, not the clock, ends the search). */
  seed?: number;
}


// ---------- Options ----------

export interface PlanOptions {
  /** Blade/score thickness lost per cut, in inches. Default 0. */
  kerfIn?: number;
  /** Wall-clock cap for the search, in ms. Default 1500. */
  timeBudgetMs?: number;
  /** Cap on search iterations after the systematic phase. Default 8000. */
  maxIterations?: number;
  /** Seed for the search's random choices (same seed = same plan). */
  seed?: number;
}

// ---------- Internals ----------

const EPS = 1e-9;
const MIN_DIM = 1e-6;
const REPORT_EPS = 0.01; // sub-hundredth-inch slivers aren't worth logging

interface Rect {
  x: number;
  y: number;
  w: number; // along x (sheet width direction)
  l: number; // along y (sheet length direction)
}

interface WorkSheet {
  stockId: string;
  lengthIn: number;
  widthIn: number;
  origin: StockOrigin;
  free: Rect[];
  placed: PlacedPiece[];
}

type FitRule = 'baf' | 'bssf' | 'blsf';
type SplitRule = 'H' | 'V' | 'maxLargest' | 'minLargest' | 'shorterAxis';
type SourceRule = 'smallest' | 'efficient' | 'largest' | 'random';

interface Config {
  fit: FitRule;
  split: SplitRule;
  source: SourceRule;
}

interface Metric {
  unfulfilled: number;
  freshArea: number;
  sheetCount: number;
  patterns: number;
  leftoverSquares: number;
}

interface RunResult {
  sheets: WorkSheet[];
  unfulfillable: Piece[];
  metric: Metric;
  order: Piece[];
  config: Config;
}

function pieceArea(p: { lengthIn: number; widthIn: number }): number {
  return p.lengthIn * p.widthIn;
}

function fitsWithinBounds(piece: { lengthIn: number; widthIn: number }, bounds: { lengthIn: number; widthIn: number }): boolean {
  return (
    (piece.widthIn <= bounds.widthIn + EPS && piece.lengthIn <= bounds.lengthIn + EPS) ||
    (piece.lengthIn <= bounds.widthIn + EPS && piece.widthIn <= bounds.lengthIn + EPS)
  );
}

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function fitScore(r: Rect, pw: number, pl: number, rule: FitRule): number {
  const lw = r.w - pw;
  const ll = r.l - pl;
  const small = Math.min(lw, ll);
  const large = Math.max(lw, ll);
  if (rule === 'baf') return r.w * r.l - pw * pl + 1e-6 * small;
  if (rule === 'bssf') return small + 1e-6 * large;
  return large + 1e-6 * small;
}

interface Placement {
  sheet: WorkSheet;
  idx: number;
  rotated: boolean;
  pw: number;
  pl: number;
  score: number;
}

/** Best free rectangle for `piece` across the given sheets, in either orientation. */
function findBestPlacement(sheets: WorkSheet[], piece: Piece, rule: FitRule): Placement | null {
  let best: Placement | null = null;
  const square = piece.widthIn === piece.lengthIn;
  for (const sheet of sheets) {
    for (let i = 0; i < sheet.free.length; i++) {
      const r = sheet.free[i];
      if (piece.widthIn <= r.w + EPS && piece.lengthIn <= r.l + EPS) {
        const s = fitScore(r, piece.widthIn, piece.lengthIn, rule);
        if (!best || s < best.score) best = { sheet, idx: i, rotated: false, pw: piece.widthIn, pl: piece.lengthIn, score: s };
      }
      if (!square && piece.lengthIn <= r.w + EPS && piece.widthIn <= r.l + EPS) {
        const s = fitScore(r, piece.lengthIn, piece.widthIn, rule);
        if (!best || s < best.score) best = { sheet, idx: i, rotated: true, pw: piece.lengthIn, pl: piece.widthIn, score: s };
      }
    }
  }
  return best;
}

/** Places the piece in the chosen free rectangle and splits the remainder with one guillotine cut. */
function applyPlacement(p: Placement, piece: Piece, split: SplitRule, kerf: number): void {
  const sheet = p.sheet;
  const r = sheet.free[p.idx];
  sheet.free.splice(p.idx, 1);
  sheet.placed.push({ pieceId: piece.id, lengthIn: p.pl, widthIn: p.pw, xIn: r.x, yIn: r.y, rotated: p.rotated });

  const rw = r.w - p.pw - kerf; // width left to the right of the piece
  const tl = r.l - p.pl - kerf; // length left above the piece
  const rwPos = Math.max(0, rw);
  const tlPos = Math.max(0, tl);

  const hRight: Rect = { x: r.x + p.pw + kerf, y: r.y, w: rw, l: p.pl };
  const hTop: Rect = { x: r.x, y: r.y + p.pl + kerf, w: r.w, l: tl };
  const vRight: Rect = { x: r.x + p.pw + kerf, y: r.y, w: rw, l: r.l };
  const vTop: Rect = { x: r.x, y: r.y + p.pl + kerf, w: p.pw, l: tl };

  const aH = Math.max(rwPos * p.pl, r.w * tlPos);
  const aV = Math.max(rwPos * r.l, p.pw * tlPos);

  let useH: boolean;
  if (split === 'H') useH = true;
  else if (split === 'V') useH = false;
  else if (split === 'maxLargest') useH = aH >= aV;
  else if (split === 'minLargest') useH = aH <= aV;
  else useH = rw <= tl; // shorterAxis

  for (const rect of useH ? [hRight, hTop] : [vRight, vTop]) {
    if (rect.w > MIN_DIM && rect.l > MIN_DIM) sheet.free.push(rect);
  }
}

interface SizeOption {
  lengthIn: number;
  widthIn: number;
}

/** Throwaway simulation: how much of the remaining queue would ONE sheet of this size hold? */
function simulateOneSheet(order: Piece[], from: number, size: SizeOption, cfg: Config, kerf: number): { packedArea: number; all: boolean } {
  const ws: WorkSheet = {
    stockId: '__sim__',
    lengthIn: size.lengthIn,
    widthIn: size.widthIn,
    origin: 'fresh',
    free: [{ x: 0, y: 0, w: size.widthIn, l: size.lengthIn }],
    placed: [],
  };
  let packed = 0;
  let all = true;
  for (let i = from; i < order.length; i++) {
    const pl = findBestPlacement([ws], order[i], cfg.fit);
    if (!pl) {
      all = false;
      continue;
    }
    applyPlacement(pl, order[i], cfg.split, kerf);
    packed += pieceArea(order[i]);
  }
  return { packedArea: packed, all };
}

/**
 * Which stock to open when no open sheet can take the piece. Waste offcuts
 * are always considered before fresh sheets (the client's standing rule);
 * within that group the rule decides.
 */
function chooseSource(
  pool: AvailableStock[],
  order: Piece[],
  from: number,
  cfg: Config,
  kerf: number,
  rng: () => number
): AvailableStock | null {
  const piece = order[from];
  const fits = pool.filter((s) => s.quantity > 0 && fitsWithinBounds(piece, s));
  if (fits.length === 0) return null;
  const waste = fits.filter((s) => s.origin === 'waste');
  const group = waste.length > 0 ? waste : fits;

  const seen = new Set<string>();
  const sizes: AvailableStock[] = [];
  for (const s of group) {
    const k = `${s.lengthIn}x${s.widthIn}`;
    if (!seen.has(k)) {
      seen.add(k);
      sizes.push(s);
    }
  }

  let chosen: AvailableStock;
  if (cfg.source === 'smallest') {
    chosen = sizes.reduce((a, b) => (pieceArea(b) < pieceArea(a) ? b : a));
  } else if (cfg.source === 'largest') {
    chosen = sizes.reduce((a, b) => (pieceArea(b) > pieceArea(a) ? b : a));
  } else if (cfg.source === 'random') {
    chosen = sizes[Math.floor(rng() * sizes.length)];
  } else {
    // 'efficient': the smallest size that holds everything still queued;
    // otherwise the size that is filled best.
    let bestKey: number[] | null = null;
    chosen = sizes[0];
    for (const s of sizes) {
      const sim = simulateOneSheet(order, from, s, cfg, kerf);
      const area = pieceArea(s);
      const key = sim.all ? [0, area, 0] : [1, -sim.packedArea / area, area];
      if (!bestKey || key[0] < bestKey[0] || (key[0] === bestKey[0] && (key[1] < bestKey[1] - 1e-12 || (Math.abs(key[1] - bestKey[1]) <= 1e-12 && key[2] < bestKey[2])))) {
        bestKey = key;
        chosen = s;
      }
    }
  }
  const k = `${chosen.lengthIn}x${chosen.widthIn}`;
  return group.find((s) => `${s.lengthIn}x${s.widthIn}` === k) ?? null;
}

/** Shrinks each sheet to the smallest available stock that still holds its layout. */
function rightSizeSheets(sheets: WorkSheet[], pool: AvailableStock[]): void {
  for (const ws of sheets) {
    let maxX = 0;
    let maxY = 0;
    for (const p of ws.placed) {
      maxX = Math.max(maxX, p.xIn + p.widthIn);
      maxY = Math.max(maxY, p.yIn + p.lengthIn);
    }
    const curArea = ws.lengthIn * ws.widthIn;
    const candidates = pool.filter(
      (s) =>
        s.quantity > 0 &&
        s.widthIn + EPS >= maxX &&
        s.lengthIn + EPS >= maxY &&
        // must fit INSIDE the current sheet in both directions, so the
        // existing free rectangles can simply be clipped to it
        s.widthIn <= ws.widthIn + EPS &&
        s.lengthIn <= ws.lengthIn + EPS &&
        pieceArea(s) < curArea - 1e-6
    );
    if (candidates.length === 0) continue;
    const wasteFirst = candidates.filter((s) => s.origin === 'waste');
    const group = wasteFirst.length > 0 ? wasteFirst : candidates;
    const next = group.reduce((a, b) => (pieceArea(b) < pieceArea(a) ? b : a));
    // give the old stock back, take the new one
    const old = pool.find((s) => s.stockId === ws.stockId);
    if (old) old.quantity += 1;
    next.quantity -= 1;

    const newW = next.widthIn;
    const newL = next.lengthIn;
    const clipped: Rect[] = [];
    for (const r of ws.free) {
      const w = Math.min(r.x + r.w, newW) - r.x;
      const l = Math.min(r.y + r.l, newL) - r.y;
      if (w > MIN_DIM && l > MIN_DIM) clipped.push({ x: r.x, y: r.y, w, l });
    }
    ws.stockId = next.stockId;
    ws.widthIn = newW;
    ws.lengthIn = newL;
    ws.origin = next.origin;
    ws.free = clipped;
  }
}

function patternKey(ws: WorkSheet): string {
  const placed = [...ws.placed]
    .sort((a, b) => a.xIn - b.xIn || a.yIn - b.yIn)
    .map((p) => `${p.widthIn}x${p.lengthIn}@${p.xIn},${p.yIn}`)
    .join('|');
  return `${ws.widthIn}x${ws.lengthIn}:${ws.origin}:${placed}`;
}

function computeMetric(sheets: WorkSheet[], unfulfilled: number): Metric {
  let freshArea = 0;
  let leftoverSquares = 0;
  const patterns = new Set<string>();
  for (const ws of sheets) {
    if (ws.origin === 'fresh') freshArea += ws.lengthIn * ws.widthIn;
    for (const r of ws.free) {
      if (r.w > REPORT_EPS && r.l > REPORT_EPS) leftoverSquares += (r.w * r.l) ** 2;
    }
    patterns.add(patternKey(ws));
  }
  return { unfulfilled, freshArea, sheetCount: sheets.length, patterns: patterns.size, leftoverSquares };
}

/** < 0 when `a` is the better plan. */
function compareMetric(a: Metric, b: Metric): number {
  if (a.unfulfilled !== b.unfulfilled) return a.unfulfilled - b.unfulfilled;
  if (Math.abs(a.freshArea - b.freshArea) > 1e-6) return a.freshArea - b.freshArea;
  if (a.sheetCount !== b.sheetCount) return a.sheetCount - b.sheetCount;
  if (a.patterns !== b.patterns) return a.patterns - b.patterns;
  return b.leftoverSquares - a.leftoverSquares;
}

function runPlan(order: Piece[], cfg: Config, stock: AvailableStock[], kerf: number, rng: () => number): RunResult {
  const pool: AvailableStock[] = stock.map((s) => ({ ...s }));
  const sheets: WorkSheet[] = [];
  const unfulfillable: Piece[] = [];

  for (let i = 0; i < order.length; i++) {
    const piece = order[i];
    let placement = findBestPlacement(sheets, piece, cfg.fit);
    if (!placement) {
      const src = chooseSource(pool, order, i, cfg, kerf, rng);
      if (!src) {
        unfulfillable.push(piece);
        continue;
      }
      src.quantity -= 1;
      const ws: WorkSheet = {
        stockId: src.stockId,
        lengthIn: src.lengthIn,
        widthIn: src.widthIn,
        origin: src.origin,
        free: [{ x: 0, y: 0, w: src.widthIn, l: src.lengthIn }],
        placed: [],
      };
      placement = findBestPlacement([ws], piece, cfg.fit);
      if (!placement) {
        src.quantity += 1;
        unfulfillable.push(piece);
        continue;
      }
      sheets.push(ws);
    }
    applyPlacement(placement, piece, cfg.split, kerf);
  }

  rightSizeSheets(sheets, pool);
  return { sheets, unfulfillable, metric: computeMetric(sheets, unfulfillable.length), order, config: cfg };
}

type OrderKey = (p: Piece) => number;
const ORDER_KEYS: OrderKey[] = [
  (p) => pieceArea(p),
  (p) => Math.max(p.lengthIn, p.widthIn),
  (p) => Math.min(p.lengthIn, p.widthIn),
  (p) => 2 * (p.lengthIn + p.widthIn),
  (p) => p.widthIn,
  (p) => p.lengthIn,
];
const FIT_RULES: FitRule[] = ['baf', 'bssf', 'blsf'];
const SPLIT_RULES: SplitRule[] = ['shorterAxis', 'maxLargest', 'minLargest', 'H', 'V'];
const SYSTEMATIC_SOURCES: SourceRule[] = ['efficient', 'smallest', 'largest'];

function sortedBy(pieces: Piece[], key: OrderKey): Piece[] {
  return [...pieces].sort((a, b) => key(b) - key(a) || pieceArea(b) - pieceArea(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Full optimizer. Pure function: no side effects, no DB access;
 * `availableStock` quantities are only mutated on internal working copies.
 */
export function generateCuttingPlan(pieces: Piece[], availableStock: AvailableStock[], options: PlanOptions = {}): PlanResult {
  const kerf = Math.max(0, options.kerfIn ?? 0);
  const budgetMs = options.timeBudgetMs ?? 1500;
  const maxIterations = options.maxIterations ?? 8000;
  const rng = mulberry32(options.seed ?? 20260506);

  const feasible: Piece[] = [];
  const impossible: Piece[] = [];
  for (const p of pieces) {
    if (availableStock.some((s) => s.quantity > 0 && fitsWithinBounds(p, s))) feasible.push(p);
    else impossible.push(p);
  }
  if (feasible.length === 0) return { sheets: [], unfulfillable: impossible };

  const state: { best: RunResult | null } = { best: null };
  const consider = (r: RunResult) => {
    if (!state.best || compareMetric(r.metric, state.best.metric) < 0) state.best = r;
  };

  // Phase 1 — systematic: every ordering x fit rule x split rule x stock rule.
  for (const key of ORDER_KEYS) {
    const order = sortedBy(feasible, key);
    for (const fit of FIT_RULES) {
      for (const split of SPLIT_RULES) {
        for (const source of SYSTEMATIC_SOURCES) {
          consider(runPlan(order, { fit, split, source }, availableStock, kerf, rng));
        }
      }
    }
  }

  // Phase 2 — randomized restarts + hill climbing around the best plan.
  const start = now();
  const swapOrder = (base: Piece[], swaps: number): Piece[] => {
    const o = [...base];
    for (let s = 0; s < swaps && o.length > 1; s++) {
      const i = Math.floor(rng() * o.length);
      const j = Math.floor(rng() * o.length);
      [o[i], o[j]] = [o[j], o[i]];
    }
    return o;
  };
  for (let it = 0; it < maxIterations && now() - start < budgetMs; it++) {
    const incumbent = state.best as RunResult;
    let order: Piece[];
    let cfg: Config;
    const mode = it % 3;
    if (mode === 0) {
      order = swapOrder(incumbent.order, 1 + Math.floor(rng() * 3));
      cfg = incumbent.config;
    } else if (mode === 1) {
      order = swapOrder(sortedBy(feasible, ORDER_KEYS[Math.floor(rng() * ORDER_KEYS.length)]), 1 + Math.floor(rng() * 4));
      cfg = {
        fit: FIT_RULES[Math.floor(rng() * FIT_RULES.length)],
        split: SPLIT_RULES[Math.floor(rng() * SPLIT_RULES.length)],
        source: (['efficient', 'smallest', 'largest', 'random'] as SourceRule[])[Math.floor(rng() * 4)],
      };
    } else {
      order = swapOrder(incumbent.order, 1);
      cfg = {
        fit: FIT_RULES[Math.floor(rng() * FIT_RULES.length)],
        split: SPLIT_RULES[Math.floor(rng() * SPLIT_RULES.length)],
        source: incumbent.config.source,
      };
    }
    consider(runPlan(order, cfg, availableStock, kerf, rng));
  }

  const final = state.best as RunResult;
  const sheets: SheetUsage[] = final.sheets.map((ws) => {
    const usedArea = ws.placed.reduce((sum, p) => sum + p.lengthIn * p.widthIn, 0);
    const totalArea = ws.lengthIn * ws.widthIn;
    const leftoverRegions: LeftoverRegion[] = ws.free
      .filter((r) => r.w > REPORT_EPS && r.l > REPORT_EPS)
      .map((r) => ({ xIn: r.x, yIn: r.y, widthIn: r.w, lengthIn: r.l }));
    return {
      sourceStockId: ws.stockId,
      sheetLengthIn: ws.lengthIn,
      sheetWidthIn: ws.widthIn,
      origin: ws.origin,
      placedPieces: ws.placed,
      leftoverRegions,
      leftoverClassification: leftoverRegions.length > 0 ? 'waste' : null,
      usedAreaFraction: totalArea > 0 ? usedArea / totalArea : 0,
    };
  });

  return { sheets, unfulfillable: [...impossible, ...final.unfulfillable] };
}