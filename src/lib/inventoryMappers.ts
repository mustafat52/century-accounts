// Mirrors the snake_case-DB-row -> camelCase-app-type pattern in
// lib/mappers.ts. Reads from inv_stock_effective / inv_waste_effective
// (the joined views defined in the schema addition), not the raw tables,
// since those views already carry category_name.

import type { StockCategory, StockLine, WasteLine } from '../inventoryTypes';

export function mapStockCategory(row: any): StockCategory {
  return {
    id: row.id,
    name: row.name,
  };
}

export function mapStockLine(row: any): StockLine {
  return {
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    lengthIn: Number(row.length_in),
    widthIn: Number(row.width_in),
    quantity: Number(row.quantity),
    origin: row.origin,
    sourcePlanSheetId: row.source_plan_sheet_id,
  };
}

export function mapWasteLine(row: any): WasteLine {
  return {
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    lengthIn: Number(row.length_in),
    widthIn: Number(row.width_in),
    sourcePlanSheetId: row.source_plan_sheet_id,
    createdAt: row.created_at,
  };
}
