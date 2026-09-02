import { useMemo, useState } from 'react';
import { useInventory, type CuttingJobItemInput } from '../../context/InventoryContext';
import { parseFractionInches, formatFractionInches } from '../../lib/fractionInches';
import type { PlanResult, SheetUsage } from '../../lib/cuttingAlgorithm';

interface DraftRow {
  key: string;
  lengthRaw: string;
  widthRaw: string;
  quantityRaw: string;
}

function newRow(): DraftRow {
  return { key: crypto.randomUUID(), lengthRaw: '', widthRaw: '', quantityRaw: '1' };
}

// Sheet dimension -> the leftover rectangle's position on the sheet. The
// algorithm only returns the leftover's size, but since a right-strip
// leftover always spans the sheet's full length and a top-strip leftover
// always spans its full width, which one it was — and therefore where it
// sits — is recoverable from that alone.
function leftoverRect(sheet: SheetUsage): { x: number; y: number; w: number; h: number } | null {
  if (sheet.leftoverLengthIn == null || sheet.leftoverWidthIn == null) return null;
  const isRightStrip = sheet.leftoverLengthIn === sheet.sheetLengthIn;
  if (isRightStrip) {
    return { x: sheet.sheetWidthIn - sheet.leftoverWidthIn, y: 0, w: sheet.leftoverWidthIn, h: sheet.leftoverLengthIn };
  }
  return { x: 0, y: sheet.sheetLengthIn - sheet.leftoverLengthIn, w: sheet.sheetWidthIn, h: sheet.leftoverLengthIn };
}

function SheetDiagram({ sheet }: { sheet: SheetUsage }) {
  const leftover = leftoverRect(sheet);
  const labelSize = Math.max(sheet.sheetWidthIn, sheet.sheetLengthIn) * 0.028;

  return (
    <svg
      viewBox={`0 0 ${sheet.sheetWidthIn} ${sheet.sheetLengthIn}`}
      style={{ width: '100%', height: 'auto', maxHeight: 280, background: 'var(--surface-2)', borderRadius: 4 }}
    >
      <rect x={0} y={0} width={sheet.sheetWidthIn} height={sheet.sheetLengthIn} fill="none" stroke="var(--border)" strokeWidth={0.5} />

      {leftover && (
        <rect
          x={leftover.x}
          y={leftover.y}
          width={leftover.w}
          height={leftover.h}
          fill={sheet.leftoverClassification === 'waste' ? 'var(--danger-dim)' : 'var(--success-dim)'}
          stroke={sheet.leftoverClassification === 'waste' ? 'var(--danger)' : 'var(--success)'}
          strokeDasharray="2,1.5"
          strokeWidth={0.4}
        />
      )}

      {sheet.placedPieces.map((p, i) => (
        <g key={i}>
          <rect
            x={p.xIn}
            y={p.yIn}
            width={p.widthIn}
            height={p.lengthIn}
            fill="var(--gold-dim)"
            stroke="var(--gold)"
            strokeWidth={0.5}
          />
          <text
            x={p.xIn + p.widthIn / 2}
            y={p.yIn + p.lengthIn / 2}
            fontSize={labelSize}
            fill="var(--gold-bright)"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {Math.round(p.widthIn)}×{Math.round(p.lengthIn)}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function CuttingPlan() {
  const { categories, generatePlan, confirmCut } = useInventory();

  const [categoryId, setCategoryId] = useState('');
  const [rows, setRows] = useState<DraftRow[]>([newRow()]);
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [confirmedItems, setConfirmedItems] = useState<CuttingJobItemInput[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmedMessage, setConfirmedMessage] = useState('');

  const totalPieces = useMemo(
    () => rows.reduce((sum, r) => sum + (parseInt(r.quantityRaw, 10) || 0), 0),
    [rows]
  );

  function updateRow(key: string, patch: Partial<DraftRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, newRow()]);
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }

  function handleGeneratePlan() {
    setError('');
    setConfirmedMessage('');
    if (!categoryId) return setError('Choose a category.');

    const items: CuttingJobItemInput[] = [];
    for (const row of rows) {
      const length = parseFractionInches(row.lengthRaw);
      const width = parseFractionInches(row.widthRaw);
      const quantity = parseInt(row.quantityRaw, 10);
      if (length === null || width === null) return setError('Every row needs a valid length and width.');
      if (!Number.isFinite(quantity) || quantity <= 0) return setError('Every row needs a quantity of at least 1.');
      items.push({ lengthIn: length, widthIn: width, quantity });
    }
    if (items.length === 0) return setError('Add at least one piece to cut.');

    const result = generatePlan(categoryId, items);
    setPlan(result);
    setConfirmedItems(items);
  }

  async function handleConfirmCut() {
    if (!plan || !confirmedItems || !categoryId) return;
    setConfirming(true);
    const ok = await confirmCut(categoryId, confirmedItems, plan);
    setConfirming(false);
    if (!ok) {
      setError('Could not commit the cut — stock and waste were not changed. Nothing was saved.');
      return;
    }
    setConfirmedMessage(
      `Cut confirmed: ${plan.sheets.length} sheet${plan.sheets.length === 1 ? '' : 's'} used, stock updated.`
    );
    setPlan(null);
    setConfirmedItems(null);
    setRows([newRow()]);
  }

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">
          <h1>Cutting Plan</h1>
          <p>
            Enter the pieces you need cut, generate a plan, then confirm to deduct stock and log the leftover.
            Nothing changes until you confirm.
          </p>
        </div>
      </div>

      <div className="view-body">
        {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 16 }}>{error}</div>}
        {confirmedMessage && <div style={{ color: 'var(--success)', fontSize: 13, marginBottom: 16 }}>{confirmedMessage}</div>}

        <div className="panel">
          <div className="panel-head">
            <h3>Batch entry</h3>
          </div>

          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <div className="form-field" style={{ maxWidth: 320, marginBottom: 16 }}>
              <label>Category</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Select…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {rows.map((row, idx) => (
              <div
                key={row.key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(90px, 1fr) minmax(90px, 1fr) minmax(70px, 0.7fr) auto',
                  gap: 12,
                  alignItems: 'end',
                  marginBottom: 12,
                }}
              >
                <div className="form-field">
                  <label>{idx === 0 ? 'Length' : ' '}</label>
                  <input
                    className="num"
                    type="text"
                    placeholder="72 or 21 5/8"
                    value={row.lengthRaw}
                    onChange={(e) => updateRow(row.key, { lengthRaw: e.target.value })}
                  />
                </div>
                <div className="form-field">
                  <label>{idx === 0 ? 'Width' : ' '}</label>
                  <input
                    className="num"
                    type="text"
                    placeholder="96"
                    value={row.widthRaw}
                    onChange={(e) => updateRow(row.key, { widthRaw: e.target.value })}
                  />
                </div>
                <div className="form-field">
                  <label>{idx === 0 ? 'Quantity' : ' '}</label>
                  <input
                    className="num"
                    type="number"
                    min={1}
                    value={row.quantityRaw}
                    onChange={(e) => updateRow(row.key, { quantityRaw: e.target.value })}
                  />
                </div>
                <button type="button" className="btn btn-ghost btn-small" onClick={() => removeRow(row.key)}>
                  Remove
                </button>
              </div>
            ))}

            <div className="flex-row" style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button type="button" className="btn btn-ghost btn-small" onClick={addRow}>
                + Add row
              </button>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
                {totalPieces} piece{totalPieces === 1 ? '' : 's'} total
              </span>
            </div>
          </div>

          <div style={{ padding: '16px 20px' }}>
            <button type="button" className="btn btn-primary" onClick={handleGeneratePlan}>
              Generate Plan
            </button>
          </div>
        </div>

        {plan && (
          <>
            {plan.unfulfillable.length > 0 && (
              <div className="panel" style={{ borderColor: 'var(--danger)' }}>
                <div className="panel-head">
                  <h3 style={{ color: 'var(--danger)' }}>Unfulfillable pieces</h3>
                </div>
                <div style={{ padding: '14px 20px', fontSize: 13, color: 'var(--text-muted)' }}>
                  No stock size (fresh or remnant) in this category is big enough for{' '}
                  {plan.unfulfillable.length} piece{plan.unfulfillable.length === 1 ? '' : 's'}:{' '}
                  {plan.unfulfillable.map((p, i) => (
                    <span key={p.id} className="num">
                      {i > 0 ? ', ' : ''}
                      {formatFractionInches(p.widthIn)} × {formatFractionInches(p.lengthIn)}
                    </span>
                  ))}
                  . Add larger stock, or reduce these pieces, then generate the plan again.
                </div>
              </div>
            )}

            {plan.sheets.length > 0 && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                  {plan.sheets.map((sheet, i) => (
                    <div className="panel" key={i} style={{ margin: 0 }}>
                      <div className="panel-head">
                        <h3>
                          Sheet {i + 1} · <span className="num">{formatFractionInches(sheet.sheetWidthIn)} × {formatFractionInches(sheet.sheetLengthIn)}</span>
                        </h3>
                        <span className={`badge ${sheet.origin}`}>{sheet.origin}</span>
                      </div>
                      <div style={{ padding: '16px 20px' }}>
                        <SheetDiagram sheet={sheet} />
                        <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--text-muted)' }}>
                          {sheet.placedPieces.length} piece{sheet.placedPieces.length === 1 ? '' : 's'} placed ·{' '}
                          {(sheet.usedAreaFraction * 100).toFixed(0)}% of sheet used
                        </div>
                        {sheet.leftoverClassification && (
                          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className={`badge ${sheet.leftoverClassification}`}>{sheet.leftoverClassification}</span>
                            <span className="num" style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                              leftover {formatFractionInches(sheet.leftoverWidthIn!)} × {formatFractionInches(sheet.leftoverLengthIn!)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 20 }}>
                  <button type="button" className="btn btn-primary" onClick={handleConfirmCut} disabled={confirming}>
                    {confirming ? 'Confirming…' : 'Confirm & Cut'}
                  </button>
                  <span style={{ marginLeft: 12, fontSize: 12.5, color: 'var(--text-muted)' }}>
                    Deducts stock and logs the leftovers above. This can't be undone from here.
                  </span>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}