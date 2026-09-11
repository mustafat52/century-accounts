import type { SheetUsage } from './cuttingAlgorithm';

export interface DraftRow {
  key: string;
  customerName: string;
  lengthRaw: string;
  widthRaw: string;
  quantityRaw: string;
}

export function newDraftRow(): DraftRow {
  return {
    key: typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).slice(2),
    customerName: '',
    lengthRaw: '',
    widthRaw: '',
    quantityRaw: '1',
  };
}

// A piece's id is "rowIndex:instanceIndex" (see generatePlan in
// InventoryContext) — this recovers which draft row, and therefore which
// customer name, a placed piece came from.
export function customerNameForPiece(pieceId: string, rows: DraftRow[]): string {
  const rowIndex = Number(pieceId.split(':')[0]);
  return rows[rowIndex]?.customerName?.trim() || '';
}

// Two sheets are "the same layout" for grouping purposes only if every
// placed piece matches in size, position, rotation, AND customer name —
// same geometry with a different customer's name on it is NOT the same
// layout to a shop that's handing back labeled pieces.
export function sheetSignature(sheet: SheetUsage, rows: DraftRow[]): string {
  const pieces = [...sheet.placedPieces]
    .sort((a, b) => a.xIn - b.xIn || a.yIn - b.yIn)
    .map((p) => `${p.widthIn}x${p.lengthIn}@${p.xIn},${p.yIn}${p.rotated ? 'R' : ''}:${customerNameForPiece(p.pieceId, rows)}`)
    .join('|');
  const leftovers = [...sheet.leftoverRegions]
    .sort((a, b) => a.xIn - b.xIn || a.yIn - b.yIn)
    .map((r) => `${r.widthIn}x${r.lengthIn}@${r.xIn},${r.yIn}`)
    .join('|');
  return `${sheet.sheetWidthIn}x${sheet.sheetLengthIn}:${sheet.origin}::${pieces}::${leftovers}:${sheet.leftoverClassification ?? ''}`;
}

export interface SheetGroup {
  representative: SheetUsage;
  count: number;
}

export function groupSheets(sheets: SheetUsage[], rows: DraftRow[]): SheetGroup[] {
  const order: string[] = [];
  const groups = new Map<string, SheetGroup>();
  for (const sheet of sheets) {
    const sig = sheetSignature(sheet, rows);
    const existing = groups.get(sig);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(sig, { representative: sheet, count: 1 });
      order.push(sig);
    }
  }
  return order.map((sig) => groups.get(sig)!);
}

// Now that computeLeftoverRegions (cuttingAlgorithm.ts) tracks 100% of
// unused space exactly, this should always be ~0 — kept as a safety-net
// display in case of a future edge case, rather than deleted outright.
export function untrackedScrapArea(sheet: SheetUsage): number {
  const totalArea = sheet.sheetWidthIn * sheet.sheetLengthIn;
  const usedArea = sheet.placedPieces.reduce((sum, p) => sum + p.widthIn * p.lengthIn, 0);
  const trackedLeftoverArea = sheet.leftoverRegions.reduce((sum, r) => sum + r.widthIn * r.lengthIn, 0);
  return Math.max(0, totalArea - usedArea - trackedLeftoverArea);
}

// Rough estimate of whether a label will actually fit inside a region
// this wide — used by both the on-screen diagram and the printable
// ticket to avoid text spilling into a neighboring piece/region when a
// leftover strip (or a piece) is narrow, e.g. a 4"-wide sliver can't hold
// "WASTE 4×36".
export function textFitsWidth(text: string, availableWidthIn: number, fontSizeIn: number): boolean {
  return text.length * fontSizeIn * 0.6 <= availableWidthIn * 0.95;
}