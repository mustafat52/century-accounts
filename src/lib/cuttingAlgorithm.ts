// Shelf-based guillotine cutting-stock heuristic (spec section 3).
//
// This class of problem (2D cutting stock with a guillotine constraint) is
// NP-hard — there's no algorithm that finds the mathematically perfect
// answer quickly at any real scale. Every production cutting/nesting
// system, including expensive commercial ones, uses a heuristic that gets
// a very good answer fast rather than a guaranteed-optimal one. This file
// is that heuristic, not a shortcut around a "real" solution.
//
// Coordinate convention used throughout this file: x runs along a sheet's
// WIDTH, y runs along its LENGTH. Shelves stack upward along y; within a
// shelf, pieces pack left-to-right along x. This isn't an arbitrary
// choice — it's what makes computeLeftoverRectangle's worked example in
// the spec (a 72x96 sheet with a 44x56 piece cut leaving a 72x40 leftover)
// come out exactly right; see the matching test in
// cuttingAlgorithm.test-manual.ts.

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
  /** One classification for the whole sheet (per the >50%-used rule) — applies uniformly to every region in leftoverRegions. Null when leftoverRegions is empty. */
  leftoverClassification: LeftoverClassification | null;
  usedAreaFraction: number;
}

export interface PlanResult {
  sheets: SheetUsage[];
  unfulfillable: Piece[];
}

// ---------- Internal working shapes ----------

interface Shelf {
  y: number;
  height: number;
  usedWidth: number;
}

interface OpenSheet {
  stockId: string;
  lengthIn: number;
  widthIn: number;
  origin: StockOrigin;
  shelves: Shelf[];
  placed: PlacedPiece[];
}

function pieceArea(p: { lengthIn: number; widthIn: number }): number {
  return p.lengthIn * p.widthIn;
}

/** Whether `piece` can fit within `bounds` in EITHER orientation (rotation allowed per spec section 2). */
function fitsWithinBounds(
  piece: { lengthIn: number; widthIn: number },
  bounds: { lengthIn: number; widthIn: number }
): boolean {
  return (
    (piece.widthIn <= bounds.widthIn && piece.lengthIn <= bounds.lengthIn) ||
    (piece.lengthIn <= bounds.widthIn && piece.widthIn <= bounds.lengthIn)
  );
}

/**
 * Tries to place `piece` onto `sheet` using shelf packing: first see if it
 * fits (in either orientation) on the remaining width of an existing
 * shelf; failing that, try opening a new shelf in the sheet's remaining
 * height. Mutates `sheet.shelves`/`sheet.placed` on success.
 */
function tryPlaceOnSheet(piece: Piece, sheet: OpenSheet): boolean {
  for (const shelf of sheet.shelves) {
    const remainingWidth = sheet.widthIn - shelf.usedWidth;

    if (piece.widthIn <= remainingWidth && piece.lengthIn <= shelf.height) {
      sheet.placed.push({
        pieceId: piece.id,
        widthIn: piece.widthIn,
        lengthIn: piece.lengthIn,
        xIn: shelf.usedWidth,
        yIn: shelf.y,
        rotated: false,
      });
      shelf.usedWidth += piece.widthIn;
      return true;
    }

    if (piece.lengthIn <= remainingWidth && piece.widthIn <= shelf.height) {
      sheet.placed.push({
        pieceId: piece.id,
        widthIn: piece.lengthIn,
        lengthIn: piece.widthIn,
        xIn: shelf.usedWidth,
        yIn: shelf.y,
        rotated: true,
      });
      shelf.usedWidth += piece.lengthIn;
      return true;
    }
  }

  // No existing shelf had room — try opening a new one above the last.
  const usedHeight = sheet.shelves.reduce((sum, s) => sum + s.height, 0);
  const remainingHeight = sheet.lengthIn - usedHeight;

  if (piece.lengthIn <= remainingHeight && piece.widthIn <= sheet.widthIn) {
    sheet.shelves.push({ y: usedHeight, height: piece.lengthIn, usedWidth: piece.widthIn });
    sheet.placed.push({
      pieceId: piece.id,
      widthIn: piece.widthIn,
      lengthIn: piece.lengthIn,
      xIn: 0,
      yIn: usedHeight,
      rotated: false,
    });
    return true;
  }

  if (piece.widthIn <= remainingHeight && piece.lengthIn <= sheet.widthIn) {
    sheet.shelves.push({ y: usedHeight, height: piece.widthIn, usedWidth: piece.lengthIn });
    sheet.placed.push({
      pieceId: piece.id,
      widthIn: piece.lengthIn,
      lengthIn: piece.widthIn,
      xIn: 0,
      yIn: usedHeight,
      rotated: true,
    });
    return true;
  }

  return false;
}

/**
 * Picks which stock to pull when no open sheet has room for a piece.
 * Existing waste offcuts are checked first (client's own instruction:
 * always check whether a requested size can already be cut from the
 * waste pool before touching a fresh sheet — there's no reason to keep
 * some leftovers in a separate reusable-stock bucket when the algorithm
 * checks waste first anyway); within whichever pool has a fit, the
 * smallest-area candidate that fits is chosen, so sheet selection doesn't
 * burn a large sheet on a small piece when a smaller one would do.
 */
function pickStockForPiece(pool: AvailableStock[], piece: Piece): AvailableStock | null {
  const candidates = pool.filter((s) => s.quantity > 0 && fitsWithinBounds(piece, s));
  if (candidates.length === 0) return null;

  const wastePieces = candidates.filter((s) => s.origin === 'waste');
  const chosenPool = wastePieces.length > 0 ? wastePieces : candidates.filter((s) => s.origin === 'fresh');
  if (chosenPool.length === 0) return null;

  return chosenPool.reduce((smallest, s) => (pieceArea(s) < pieceArea(smallest) ? s : smallest));
}

/**
 * Decomposes ALL unused space on a finished sheet into non-overlapping,
 * guillotine-valid rectangles — not just the single largest one. For each
 * shelf, whatever's unused to the right of its pieces becomes its own
 * rectangle (bounded to that shelf's own height, so it doesn't overlap
 * neighboring shelves); the space above the topmost shelf becomes one
 * final full-width rectangle. Every point on the sheet that isn't under a
 * placed piece falls into exactly one of these — this is an exact
 * accounting of unused space, not a heuristic pick-one approximation.
 *
 * (v1 of this tracked only the single largest leftover rectangle, per an
 * early reading of the spec's "compute its single largest leftover
 * rectangle" wording — real usage showed that silently dropped genuine
 * reusable/wasted area whenever a piece left room on two sides at once,
 * so this now tracks everything.)
 */
function computeLeftoverRegions(sheet: OpenSheet): LeftoverRegion[] {
  const EPSILON = 0.01; // sub-hundredth-inch slivers aren't worth logging
  const regions: LeftoverRegion[] = [];

  for (const shelf of sheet.shelves) {
    const widthIn = sheet.widthIn - shelf.usedWidth;
    if (widthIn > EPSILON) {
      regions.push({ xIn: shelf.usedWidth, yIn: shelf.y, widthIn, lengthIn: shelf.height });
    }
  }

  const usedHeight = sheet.shelves.reduce((sum, s) => sum + s.height, 0);
  const topLengthIn = sheet.lengthIn - usedHeight;
  if (topLengthIn > EPSILON) {
    regions.push({ xIn: 0, yIn: usedHeight, widthIn: sheet.widthIn, lengthIn: topLengthIn });
  }

  return regions;
}

/**
 * Runs the full heuristic: sorts pieces largest-first, packs them onto
 * already-open sheets where possible, opens new sheets (existing waste
 * offcuts preferred over fresh stock) when none fit, and logs every
 * finished sheet's leftover as waste. Pure function — no side effects, no
 * DB access; `availableStock` quantities are only mutated on the local
 * working copy this function makes internally.
 */
export function generateCuttingPlan(pieces: Piece[], availableStock: AvailableStock[]): PlanResult {
  const sorted = [...pieces].sort((a, b) => pieceArea(b) - pieceArea(a));
  const pool: AvailableStock[] = availableStock.map((s) => ({ ...s }));
  const openSheets: OpenSheet[] = [];
  const unfulfillable: Piece[] = [];

  for (const piece of sorted) {
    let placed = false;
    for (const sheet of openSheets) {
      if (tryPlaceOnSheet(piece, sheet)) {
        placed = true;
        break;
      }
    }
    if (placed) continue;

    const chosen = pickStockForPiece(pool, piece);
    if (!chosen) {
      unfulfillable.push(piece);
      continue;
    }

    chosen.quantity -= 1;
    const newSheet: OpenSheet = {
      stockId: chosen.stockId,
      lengthIn: chosen.lengthIn,
      widthIn: chosen.widthIn,
      origin: chosen.origin,
      shelves: [],
      placed: [],
    };
    // chosen was selected specifically because it fits, so this should
    // always succeed — but if it somehow doesn't, treat the piece as
    // unfulfillable rather than silently dropping it.
    if (tryPlaceOnSheet(piece, newSheet)) {
      openSheets.push(newSheet);
    } else {
      unfulfillable.push(piece);
    }
  }

  const sheets: SheetUsage[] = openSheets.map((sheet) => {
    const usedArea = sheet.placed.reduce((sum, p) => sum + p.lengthIn * p.widthIn, 0);
    const totalArea = sheet.lengthIn * sheet.widthIn;
    const usedAreaFraction = totalArea > 0 ? usedArea / totalArea : 0;
    const leftoverRegions = computeLeftoverRegions(sheet);

    return {
      sourceStockId: sheet.stockId,
      sheetLengthIn: sheet.lengthIn,
      sheetWidthIn: sheet.widthIn,
      origin: sheet.origin,
      placedPieces: sheet.placed,
      leftoverRegions,
      // Every leftover region is waste now, full stop — no more
      // >50%-used threshold deciding stock vs. waste (see StockOrigin's
      // comment above for why). usedAreaFraction is kept on SheetUsage
      // since it's still a useful efficiency stat to show, it just no
      // longer drives this classification.
      leftoverClassification: leftoverRegions.length > 0 ? 'waste' : null,
      usedAreaFraction,
    };
  });

  return { sheets, unfulfillable };
}