import React, { createContext, useContext, useState, useMemo, useEffect, useCallback } from 'react';
import type { StockCategory, StockLine, WasteLine, NewStockCategoryInput, NewStockLineInput } from '../inventoryTypes';
import { supabase } from '../lib/supabaseClient';
import { mapStockCategory, mapStockLine, mapWasteLine } from '../lib/inventoryMappers';
import { generateCuttingPlan, type Piece, type AvailableStock, type PlanResult } from '../lib/cuttingAlgorithm';

export interface CuttingJobItemInput {
  lengthIn: number;
  widthIn: number;
  quantity: number;
  /** Optional — whose piece this is, shown on the cutting diagram and persisted with the job. */
  customerName?: string;
}

interface InventoryContextValue {
  categories: StockCategory[];
  stockLines: StockLine[];
  wasteLines: WasteLine[];
  dataLoading: boolean;

  addCategory: (input: NewStockCategoryInput) => Promise<StockCategory | null>;
  deleteCategory: (id: string) => Promise<boolean>;

  addStockLine: (input: NewStockLineInput) => Promise<StockLine | null>;
  updateStockQuantity: (id: string, quantity: number) => Promise<void>;
  deleteStockLine: (id: string) => Promise<void>;

  // ---------- Cutting plan (Phase 2) ----------
  // generatePlan is a pure preview — it reads the current in-memory
  // stockLines and runs the algorithm client-side; nothing is written to
  // the database. confirmCut is the only action that mutates data, per
  // the plan/commit split in the spec.
  generatePlan: (categoryId: string, items: CuttingJobItemInput[]) => PlanResult;
  confirmCut: (categoryId: string, items: CuttingJobItemInput[], plan: PlanResult) => Promise<boolean>;

  // open/close-modal pattern, mirrored from AppContext — no inventory
  // modals exist yet in Phase 1, but Phase 2's cutting-plan flow will add
  // one here the same way InvoiceModal etc. are wired in AppContext.
}

const InventoryContext = createContext<InventoryContextValue | null>(null);

export function InventoryProvider({ children }: { children: React.ReactNode }) {
  const [categories, setCategories] = useState<StockCategory[]>([]);
  const [stockLines, setStockLines] = useState<StockLine[]>([]);
  const [wasteLines, setWasteLines] = useState<WasteLine[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  const refreshCategories = useCallback(async () => {
    const { data } = await supabase.from('inv_categories').select('*').order('name');
    if (data) setCategories(data.map(mapStockCategory));
  }, []);

  const refreshStockLines = useCallback(async () => {
    const { data } = await supabase.from('inv_stock_effective').select('*').order('created_at', { ascending: false });
    if (data) setStockLines(data.map(mapStockLine));
  }, []);

  const refreshWasteLines = useCallback(async () => {
    const { data } = await supabase.from('inv_waste_effective').select('*').order('created_at', { ascending: false });
    if (data) setWasteLines(data.map(mapWasteLine));
  }, []);

  const loadAllData = useCallback(async () => {
    setDataLoading(true);
    await Promise.all([refreshCategories(), refreshStockLines(), refreshWasteLines()]);
    setDataLoading(false);
  }, [refreshCategories, refreshStockLines, refreshWasteLines]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // ---------- Categories ----------
  const addCategory = async (input: NewStockCategoryInput): Promise<StockCategory | null> => {
    const trimmed = input.name.trim();
    if (!trimmed) return null;
    const { data, error } = await supabase.from('inv_categories').insert({ name: trimmed }).select().single();
    if (error || !data) return null;
    const newCategory = mapStockCategory(data);
    setCategories((prev) => [...prev, newCategory].sort((a, b) => a.name.localeCompare(b.name)));
    return newCategory;
  };

  const deleteCategory = async (id: string): Promise<boolean> => {
    const { error } = await supabase.from('inv_categories').delete().eq('id', id);
    if (error) return false;
    setCategories((prev) => prev.filter((c) => c.id !== id));
    return true;
  };

  // ---------- Stock ----------
  const addStockLine = async (input: NewStockLineInput): Promise<StockLine | null> => {
    const { data: stockRow, error } = await supabase
      .from('inv_stock')
      .insert({
        category_id: input.categoryId,
        length_in: input.lengthIn,
        width_in: input.widthIn,
        quantity: input.quantity,
        origin: 'fresh',
      })
      .select()
      .single();
    if (error || !stockRow) return null;
    // Re-fetch from the view so the new line arrives with category_name
    // filled in, rather than hand-joining it from the categories list here.
    const { data: full } = await supabase.from('inv_stock_effective').select('*').eq('id', stockRow.id).single();
    if (!full) return null;
    const newLine = mapStockLine(full);
    setStockLines((prev) => [newLine, ...prev]);
    return newLine;
  };

  const updateStockQuantity = async (id: string, quantity: number) => {
    const { error } = await supabase.from('inv_stock').update({ quantity }).eq('id', id);
    if (error) return;
    setStockLines((prev) => prev.map((s) => (s.id === id ? { ...s, quantity } : s)));
  };

  const deleteStockLine = async (id: string) => {
    const { error } = await supabase.from('inv_stock').delete().eq('id', id);
    if (error) return;
    setStockLines((prev) => prev.filter((s) => s.id !== id));
  };

  // ---------- Cutting plan ----------

  // Pure preview: expands each requested row into individual piece
  // instances (id = "rowIndex:instanceIndex", parsed back out in
  // confirmCut to link a placement to its originating job item), builds
  // the available-stock pool from THIS category's current stock lines,
  // and runs the algorithm. Nothing here touches the database.
  const generatePlan = (categoryId: string, items: CuttingJobItemInput[]): PlanResult => {
    const pieces: Piece[] = [];
    items.forEach((item, rowIndex) => {
      for (let i = 0; i < item.quantity; i++) {
        pieces.push({ id: `${rowIndex}:${i}`, lengthIn: item.lengthIn, widthIn: item.widthIn });
      }
    });

    // Fresh stock — any pre-existing 'remnant' rows (from before the
    // waste/stock split was removed) still map into the waste-preferred
    // tier below, so old data isn't orphaned by this change.
    const stockPool: AvailableStock[] = stockLines
      .filter((s) => s.categoryId === categoryId)
      .map((s) => ({
        stockId: s.id,
        lengthIn: s.lengthIn,
        widthIn: s.widthIn,
        origin: s.origin === 'remnant' ? 'waste' : 'fresh',
        quantity: s.quantity,
      }));

    // Existing waste offcuts — checked first by the algorithm (see
    // pickStockForPiece), per the client's own instruction: always see
    // whether a requested size can already be cut from what's sitting in
    // the waste pool before reaching for a fresh sheet.
    const wastePool: AvailableStock[] = wasteLines
      .filter((w) => w.categoryId === categoryId)
      .map((w) => ({ stockId: w.id, lengthIn: w.lengthIn, widthIn: w.widthIn, origin: 'waste', quantity: 1 }));

    return generateCuttingPlan(pieces, [...stockPool, ...wastePool]);
  };

  // Commits a previously-generated plan: creates the job + job items,
  // then for each sheet used — a plan_sheet row, its placed-piece rows,
  // consuming whichever material it was sourced from (deduct fresh stock,
  // or delete the waste offcut it came from), and logging every leftover
  // region as waste. Deliberately sequential client-side inserts with
  // manual rollback-on-failure, NOT a single RPC — this project's
  // AppContext.tsx documents that RPCs taking a jsonb body silently fail
  // in this environment ("No API key found in request"), and this
  // operation's payload (a full plan with nested sheets/items) is exactly
  // that shape.
  const confirmCut = async (
    categoryId: string,
    items: CuttingJobItemInput[],
    plan: PlanResult
  ): Promise<boolean> => {
    const { data: jobRow, error: jobErr } = await supabase
      .from('inv_cutting_jobs')
      .insert({ category_id: categoryId, status: 'confirmed', confirmed_at: new Date().toISOString() })
      .select()
      .single();
    if (jobErr || !jobRow) return false;

    const jobItemRows = items.map((item, idx) => ({
      job_id: jobRow.id,
      length_in: item.lengthIn,
      width_in: item.widthIn,
      quantity: item.quantity,
      customer_name: item.customerName?.trim() || null,
      sort_order: idx,
    }));
    const { data: insertedJobItems, error: jobItemsErr } = await supabase
      .from('inv_cutting_job_items')
      .insert(jobItemRows)
      .select();
    if (jobItemsErr || !insertedJobItems) {
      await supabase.from('inv_cutting_jobs').delete().eq('id', jobRow.id);
      return false;
    }
    // sort_order was set in insertion order above, so this recovers which
    // real job_item UUID corresponds to which original row index.
    const jobItemIdByRow = new Map<number, string>();
    insertedJobItems.forEach((row: any) => jobItemIdByRow.set(row.sort_order, row.id));

    try {
      for (let sheetIdx = 0; sheetIdx < plan.sheets.length; sheetIdx++) {
        const sheet = plan.sheets[sheetIdx];

        // inv_plan_sheets.leftover_length_in/width_in are single-value
        // columns (this sheet can now have MULTIPLE leftover regions) —
        // they hold the largest region as a quick-glance summary; the
        // actual per-region records are the inv_waste/inv_stock rows
        // written below, which are the real source of truth and can
        // outnumber 1 per sheet.
        const largestRegion = sheet.leftoverRegions.reduce<typeof sheet.leftoverRegions[number] | null>(
          (max, r) => (!max || r.widthIn * r.lengthIn > max.widthIn * max.lengthIn ? r : max),
          null
        );

        const { data: sheetRow, error: sheetErr } = await supabase
          .from('inv_plan_sheets')
          .insert({
            job_id: jobRow.id,
            source_stock_id: sheet.sourceStockId,
            sheet_length_in: sheet.sheetLengthIn,
            sheet_width_in: sheet.sheetWidthIn,
            origin: sheet.origin,
            leftover_length_in: largestRegion?.lengthIn ?? null,
            leftover_width_in: largestRegion?.widthIn ?? null,
            leftover_classification: sheet.leftoverClassification,
            sort_order: sheetIdx,
          })
          .select()
          .single();
        if (sheetErr || !sheetRow) throw new Error('Failed to create plan sheet');

        const itemRows = sheet.placedPieces.map((p) => {
          const [rowIndexStr] = p.pieceId.split(':');
          const jobItemId = jobItemIdByRow.get(Number(rowIndexStr)) ?? null;
          return {
            plan_sheet_id: sheetRow.id,
            job_item_id: jobItemId,
            length_in: p.lengthIn,
            width_in: p.widthIn,
            x_in: p.xIn,
            y_in: p.yIn,
            rotated: p.rotated,
          };
        });
        const { error: itemsErr } = await supabase.from('inv_plan_sheet_items').insert(itemRows);
        if (itemsErr) throw new Error('Failed to create plan sheet items');

        // Which table sheet.sourceStockId actually belongs to can't be
        // read off sheet.origin alone — a legacy 'remnant' inv_stock row
        // (from before this waste/stock split was removed) is ALSO
        // tagged algorithm-origin 'waste' by generatePlan above, so it
        // needs the inv_stock quantity path, not the inv_waste deletion
        // path. Looking the id up against the actual current lists
        // disambiguates correctly regardless.
        const isFromWastePool = wasteLines.some((w) => w.id === sheet.sourceStockId);

        if (isFromWastePool) {
          // Consumed a waste offcut — it's cut up now, so it no longer
          // exists as available material. Deleted outright rather than a
          // quantity decrement, since inv_waste rows are always qty 1.
          const { error: consumeErr } = await supabase.from('inv_waste').delete().eq('id', sheet.sourceStockId);
          if (consumeErr) throw new Error('Failed to consume waste offcut');
        } else {
          // Sourced from inv_stock (fresh, or a legacy remnant row) —
          // deduct one sheet as before. Reads the quantity from local
          // state rather than a fresh SELECT — fine for this internal
          // single-shop tool, but a real race (two confirms in flight at
          // once) could under-count. Flagged rather than silently
          // assumed safe.
          const sourceLine = stockLines.find((s) => s.id === sheet.sourceStockId);
          const currentQty = sourceLine?.quantity ?? 0;
          const { error: qtyErr } = await supabase
            .from('inv_stock')
            .update({ quantity: Math.max(0, currentQty - 1) })
            .eq('id', sheet.sourceStockId);
          if (qtyErr) throw new Error('Failed to deduct stock quantity');
        }

        // Every leftover region is logged as waste now — no more
        // >50%-used split creating a separate reusable-stock entry. The
        // client's own reasoning: the algorithm already checks the waste
        // pool first (see generatePlan above) before touching fresh
        // stock, so a second "half-used, keep as stock" bucket added
        // nothing — everything just goes to waste, and reuse is decided
        // dynamically at plan time, not pre-judged by a percentage.
        for (const region of sheet.leftoverRegions) {
          const { error: wasteErr } = await supabase.from('inv_waste').insert({
            category_id: categoryId,
            length_in: region.lengthIn,
            width_in: region.widthIn,
            source_plan_sheet_id: sheetRow.id,
          });
          if (wasteErr) throw new Error('Failed to log waste');
        }
      }
    } catch (err) {
      // Best-effort rollback — the job row cascades to job_items/plan_sheets/
      // plan_sheet_items via ON DELETE CASCADE, but any inv_stock quantity
      // already deducted, inv_waste rows already deleted (consumed), or
      // new inv_waste rows already inserted before the failure are NOT
      // automatically undone (there's no cascade path back from those).
      // Matches this codebase's existing "manual rollback, not true
      // atomicity" tradeoff elsewhere in AppContext.tsx, but is more
      // consequential here since it touches physical stock counts —
      // surfacing the error rather than hiding it
      // is the best this can do without a working RPC path.
      await supabase.from('inv_cutting_jobs').delete().eq('id', jobRow.id);
      console.error(err);
      return false;
    }

    await loadAllData();
    return true;
  };

  const value = useMemo<InventoryContextValue>(
    () => ({
      categories,
      stockLines,
      wasteLines,
      dataLoading,
      addCategory,
      deleteCategory,
      addStockLine,
      updateStockQuantity,
      deleteStockLine,
      generatePlan,
      confirmCut,
    }),
    [categories, stockLines, wasteLines, dataLoading]
  );

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

export function useInventory() {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error('useInventory must be used within InventoryProvider');
  return ctx;
}