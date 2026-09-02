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

export type StockOrigin = 'fresh' | 'remnant';

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

export type LeftoverClassification = 'waste' | 'stock';

export interface SheetUsage {
  sourceStockId: string;
  sheetLengthIn: number;
  sheetWidthIn: number;
  origin: StockOrigin;
  placedPieces: PlacedPiece[];
  /** Null when the sheet is fully used (no leftover worth logging). */
  leftoverLengthIn: number | null;
  leftoverWidthIn: number | null;
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
 * Remnants are checked first (spec: "remnants preferred over fresh
 * stock"); within whichever pool has a fit, the smallest-area candidate
 * that fits is chosen, so sheet selection doesn't burn a large sheet on a
 * small piece when a smaller one would do.
 */
function pickStockForPiece(pool: AvailableStock[], piece: Piece): AvailableStock | null {
  const candidates = pool.filter((s) => s.quantity > 0 && fitsWithinBounds(piece, s));
  if (candidates.length === 0) return null;

  const remnants = candidates.filter((s) => s.origin === 'remnant');
  const chosenPool = remnants.length > 0 ? remnants : candidates.filter((s) => s.origin === 'fresh');
  if (chosenPool.length === 0) return null;

  return chosenPool.reduce((smallest, s) => (pieceArea(s) < pieceArea(smallest) ? s : smallest));
}

/**
 * Computes the single largest leftover rectangle on a finished sheet, as
 * two guillotine-valid candidates — a right-side strip (one vertical cut
 * at the widest shelf's used width, spanning the full sheet length) and a
 * top strip (one horizontal cut above the topmost shelf, spanning the
 * full sheet width) — and returns whichever has the larger area. This is
 * a deliberate simplification: shelf packing can leave smaller scattered
 * gaps this doesn't capture, but both candidates are always genuinely
 * free and genuinely guillotine-cuttable, which is what matters for
 * something that gets logged back into stock or waste.
 */
function computeLeftoverRectangle(sheet: OpenSheet): { lengthIn: number; widthIn: number } | null {
  const maxUsedWidth = sheet.shelves.reduce((max, s) => Math.max(max, s.usedWidth), 0);
  const usedHeight = sheet.shelves.reduce((sum, s) => sum + s.height, 0);

  const rightStrip = { widthIn: sheet.widthIn - maxUsedWidth, lengthIn: sheet.lengthIn };
  const topStrip = { widthIn: sheet.widthIn, lengthIn: sheet.lengthIn - usedHeight };

  const rightArea = Math.max(0, rightStrip.widthIn) * Math.max(0, rightStrip.lengthIn);
  const topArea = Math.max(0, topStrip.widthIn) * Math.max(0, topStrip.lengthIn);

  const EPSILON = 0.01; // sub-hundredth-inch leftovers aren't worth logging
  if (rightArea <= EPSILON && topArea <= EPSILON) return null;

  return rightArea >= topArea
    ? { widthIn: Math.max(0, rightStrip.widthIn), lengthIn: Math.max(0, rightStrip.lengthIn) }
    : { widthIn: Math.max(0, topStrip.widthIn), lengthIn: Math.max(0, topStrip.lengthIn) };
}

/**
 * Runs the full heuristic: sorts pieces largest-first, packs them onto
 * already-open sheets where possible, opens new sheets (remnants
 * preferred) when none fit, and classifies each finished sheet's leftover
 * per the >50%-used-is-waste rule (spec section 2). Pure function — no
 * side effects, no DB access; `availableStock` quantities are only
 * mutated on the local working copy this function makes internally.
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
    const leftover = computeLeftoverRectangle(sheet);

    return {
      sourceStockId: sheet.stockId,
      sheetLengthIn: sheet.lengthIn,
      sheetWidthIn: sheet.widthIn,
      origin: sheet.origin,
      placedPieces: sheet.placed,
      leftoverLengthIn: leftover?.lengthIn ?? null,
      leftoverWidthIn: leftover?.widthIn ?? null,
      leftoverClassification: leftover ? (usedAreaFraction > 0.5 ? 'waste' : 'stock') : null,
      usedAreaFraction,
    };
  });

  return { sheets, unfulfillable };
}