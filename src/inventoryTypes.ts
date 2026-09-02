// Inventory module's domain types — kept separate from types.ts per spec
// section 7 ("inventory types should probably live in their own file"),
// but following the same conventions used there: camelCase fields, plain
// interface names with no module prefix.

export type StockOrigin = 'fresh' | 'remnant';
export type CuttingJobStatus = 'draft' | 'planned' | 'confirmed';
export type LeftoverClassification = 'waste' | 'stock';

export interface StockCategory {
  id: string;
  name: string;
}

export interface StockLine {
  id: string;
  categoryId: string;
  categoryName: string;
  lengthIn: number;
  widthIn: number;
  quantity: number;
  origin: StockOrigin;
  sourcePlanSheetId: string | null;
}

export interface WasteLine {
  id: string;
  categoryId: string;
  categoryName: string;
  lengthIn: number;
  widthIn: number;
  sourcePlanSheetId: string | null;
  createdAt: string;
}

// ---- Phase 2 (Cutting Plan) shapes — declared now against the schema
// that already exists, not wired into the UI until the algorithm ships.

export interface CuttingJob {
  id: string;
  jobNo: string;
  categoryId: string;
  status: CuttingJobStatus;
  createdAt: string;
  confirmedAt: string | null;
}

export interface CuttingJobItem {
  id: string;
  jobId: string;
  lengthIn: number;
  widthIn: number;
  quantity: number;
  sortOrder: number;
}

export interface PlanSheetItem {
  id: string;
  planSheetId: string;
  jobItemId: string | null;
  lengthIn: number;
  widthIn: number;
  xIn: number;
  yIn: number;
  rotated: boolean;
}

export interface PlanSheet {
  id: string;
  jobId: string;
  sourceStockId: string | null;
  sheetLengthIn: number;
  sheetWidthIn: number;
  origin: StockOrigin;
  leftoverLengthIn: number | null;
  leftoverWidthIn: number | null;
  leftoverClassification: LeftoverClassification | null;
  sortOrder: number;
  items: PlanSheetItem[];
}

// ---- Input shapes for context actions (mirrors NewCustomerInput etc. in AppContext.tsx) ----

export interface NewStockCategoryInput {
  name: string;
}

export interface NewStockLineInput {
  categoryId: string;
  lengthIn: number;
  widthIn: number;
  quantity: number;
}
