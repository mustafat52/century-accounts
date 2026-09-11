import { useMemo, useState } from 'react';
import { useInventory, type CuttingJobItemInput } from '../../context/InventoryContext';
import { parseFractionInches, formatFractionInches } from '../../lib/fractionInches';
import type { PlacedPiece, PlanResult, SheetUsage } from '../../lib/cuttingAlgorithm';
import {
  newDraftRow,
  customerNameForPiece,
  untrackedScrapArea,
  groupSheets,
  textFitsWidth,
  type DraftRow,
} from '../../lib/sheetGrouping';
import { CuttingTicket } from '../../components/CuttingTicket';

function SheetDiagram({ sheet, rows }: { sheet: SheetUsage; rows: DraftRow[] }) {
  const labelSize = Math.max(sheet.sheetWidthIn, sheet.sheetLengthIn) * 0.032;
  const scrapArea = untrackedScrapArea(sheet);
  const scrapNote = scrapArea > 1 ? `+ ~${Math.round(scrapArea)} sq in of trim, too irregular to log as its own stock line` : null;

  return (
    <div>
      <svg
        viewBox={`0 0 ${sheet.sheetWidthIn} ${sheet.sheetLengthIn}`}
        style={{ width: '100%', height: 'auto', maxHeight: 320, background: 'var(--surface-2)', borderRadius: 4 }}
      >
        {/* Base sheet fill — this used to be `fill="none"`, which let the
            container's own background show through and made any untracked
            area look like an unexplained void rather than "still sheet
            material, just not logged as its own line." */}
        <rect
          x={0}
          y={0}
          width={sheet.sheetWidthIn}
          height={sheet.sheetLengthIn}
          fill="rgba(236, 231, 219, 0.07)"
          stroke="var(--border)"
          strokeWidth={0.5}
        />

        {sheet.leftoverRegions.map((r, i) => {
          const label = `${Math.round(r.widthIn)}×${Math.round(r.lengthIn)}`;
          const fits = textFitsWidth(label, r.widthIn, labelSize * 0.85);
          return (
            <g key={i}>
              <rect
                x={r.xIn}
                y={r.yIn}
                width={r.widthIn}
                height={r.lengthIn}
                fill="var(--danger-dim)"
                stroke="var(--danger)"
                strokeDasharray="2,1.5"
                strokeWidth={0.4}
              />
              {fits && (
                <text
                  x={r.xIn + r.widthIn / 2}
                  y={r.yIn + r.lengthIn / 2}
                  fontSize={labelSize * 0.85}
                  fill="var(--danger)"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {label}
                </text>
              )}
            </g>
          );
        })}

        {sheet.placedPieces.map((p: PlacedPiece, i) => {
          const name = customerNameForPiece(p.pieceId, rows);
          const dimsLabel = `${Math.round(p.widthIn)}×${Math.round(p.lengthIn)}`;
          const nameFits = Boolean(name) && textFitsWidth(name, p.widthIn, labelSize);
          const dimsFits = textFitsWidth(dimsLabel, p.widthIn, labelSize * (nameFits ? 0.85 : 1));
          return (
            <g key={i}>
              <rect x={p.xIn} y={p.yIn} width={p.widthIn} height={p.lengthIn} fill="var(--gold-dim)" stroke="var(--gold)" strokeWidth={0.5} />
              <title>
                {name ? `${name} — ` : ''}
                {Math.round(p.widthIn)}" × {Math.round(p.lengthIn)}"
              </title>
              {nameFits && (
                <text
                  x={p.xIn + p.widthIn / 2}
                  y={p.yIn + p.lengthIn / 2 - labelSize * 0.6}
                  fontSize={labelSize}
                  fontWeight={600}
                  fill="var(--gold-bright)"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {name}
                </text>
              )}
              {dimsFits && (
                <text
                  x={p.xIn + p.widthIn / 2}
                  y={p.yIn + p.lengthIn / 2 + (nameFits ? labelSize * 0.9 : 0)}
                  fontSize={labelSize * (nameFits ? 0.85 : 1)}
                  fill="var(--gold)"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {dimsLabel}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {scrapNote && (
        <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--text-muted)', fontStyle: 'italic' }}>{scrapNote}</div>
      )}
    </div>
  );
}

export default function CuttingPlan() {
  const { categories, generatePlan, confirmCut } = useInventory();

  const [categoryId, setCategoryId] = useState('');
  const [rows, setRows] = useState<DraftRow[]>([newDraftRow()]);
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [planRows, setPlanRows] = useState<DraftRow[]>([]); // rows as they were AT generation time, so labels stay correct even if the form is edited afterward
  const [confirmedItems, setConfirmedItems] = useState<CuttingJobItemInput[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmedMessage, setConfirmedMessage] = useState('');
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const [isTicketOpen, setIsTicketOpen] = useState(false);

  const totalPieces = useMemo(
    () => rows.reduce((sum, r) => sum + (parseInt(r.quantityRaw, 10) || 0), 0),
    [rows]
  );

  const groups = useMemo(() => (plan ? groupSheets(plan.sheets, planRows) : []), [plan, planRows]);
  const activeGroup = groups[activeGroupIndex] ?? null;

  function updateRow(key: string, patch: Partial<DraftRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, newDraftRow()]);
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
      items.push({ lengthIn: length, widthIn: width, quantity, customerName: row.customerName.trim() || undefined });
    }
    if (items.length === 0) return setError('Add at least one piece to cut.');

    const result = generatePlan(categoryId, items);
    setPlan(result);
    setPlanRows(rows);
    setConfirmedItems(items);
    setActiveGroupIndex(0);
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
    setPlanRows([]);
    setConfirmedItems(null);
    setRows([newDraftRow()]);
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
                  gridTemplateColumns: 'minmax(110px, 1.3fr) minmax(90px, 1fr) minmax(90px, 1fr) minmax(70px, 0.7fr) auto',
                  gap: 12,
                  alignItems: 'end',
                  marginBottom: 12,
                }}
              >
                <div className="form-field">
                  <label>{idx === 0 ? 'Customer (optional)' : ' '}</label>
                  <input
                    type="text"
                    placeholder="e.g. Kapoor Residence"
                    value={row.customerName}
                    onChange={(e) => updateRow(row.key, { customerName: e.target.value })}
                  />
                </div>
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

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
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
                  No stock or waste offcut in this category is big enough for{' '}
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

            {groups.length > 0 && (
              <div className="panel" style={{ marginBottom: 0 }}>
                <div className="panel-head">
                  <h3>
                    Cutting layouts · {plan.sheets.length} sheet{plan.sheets.length === 1 ? '' : 's'} total across{' '}
                    {groups.length} distinct layout{groups.length === 1 ? '' : 's'}
                  </h3>
                </div>

                {/* Excel-style sheet tabs — sheets with an identical cut
                    pattern (same pieces, same positions, same customer
                    labels) collapse into one tab with a ×N count instead
                    of repeating an identical card N times. */}
                <div
                  style={{
                    display: 'flex',
                    gap: 2,
                    padding: '10px 20px 0',
                    borderBottom: '1px solid var(--border)',
                    overflowX: 'auto',
                  }}
                >
                  {groups.map((g, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setActiveGroupIndex(i)}
                      style={{
                        flex: '0 0 auto',
                        padding: '8px 16px',
                        fontSize: 13,
                        fontWeight: 600,
                        color: i === activeGroupIndex ? 'var(--gold-bright)' : 'var(--text-muted)',
                        background: i === activeGroupIndex ? 'var(--surface-2)' : 'transparent',
                        border: 'none',
                        borderBottom: i === activeGroupIndex ? '2px solid var(--gold)' : '2px solid transparent',
                        cursor: 'pointer',
                        borderRadius: '4px 4px 0 0',
                      }}
                    >
                      Layout {i + 1}
                      {g.count > 1 && (
                        <span style={{ marginLeft: 6, color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>×{g.count}</span>
                      )}
                    </button>
                  ))}
                </div>

                {activeGroup && (
                  <div style={{ padding: '20px' }}>
                    <div className="gap-between" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <h3>
                        <span className="num">
                          {formatFractionInches(activeGroup.representative.sheetWidthIn)} × {formatFractionInches(activeGroup.representative.sheetLengthIn)}
                        </span>
                        {activeGroup.count > 1 && (
                          <span style={{ marginLeft: 10, fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 400 }}>
                            — this exact layout is used on {activeGroup.count} sheets
                          </span>
                        )}
                      </h3>
                      <span className={`badge ${activeGroup.representative.origin}`}>{activeGroup.representative.origin}</span>
                    </div>

                    <div style={{ maxWidth: 480 }}>
                      <SheetDiagram sheet={activeGroup.representative} rows={planRows} />
                    </div>

                    <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--text-muted)' }}>
                      {activeGroup.representative.placedPieces.length} piece
                      {activeGroup.representative.placedPieces.length === 1 ? '' : 's'} placed ·{' '}
                      {(activeGroup.representative.usedAreaFraction * 100).toFixed(0)}% of sheet used
                    </div>
                    {activeGroup.representative.leftoverClassification && (
                      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span className={`badge ${activeGroup.representative.leftoverClassification}`}>
                          {activeGroup.representative.leftoverClassification}
                        </span>
                        <span className="num" style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                          leftover{activeGroup.representative.leftoverRegions.length > 1 ? 's' : ''}:{' '}
                          {activeGroup.representative.leftoverRegions
                            .map((r) => `${formatFractionInches(r.widthIn)} × ${formatFractionInches(r.lengthIn)}`)
                            .join(', ')}
                          {activeGroup.count > 1 ? ` (×${activeGroup.count})` : ''}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ padding: '0 20px 20px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setIsTicketOpen(true)}>
                    Print Cutting Ticket
                  </button>
                  <button type="button" className="btn btn-primary" onClick={handleConfirmCut} disabled={confirming}>
                    {confirming ? 'Confirming…' : `Confirm & Cut — ${plan.sheets.length} sheet${plan.sheets.length === 1 ? '' : 's'}`}
                  </button>
                  <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                    Print the ticket to hand to the cutter before or after confirming — deducting stock is separate.
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {isTicketOpen && plan && (
          <CuttingTicket
            plan={plan}
            rows={planRows}
            categoryName={categories.find((c) => c.id === categoryId)?.name ?? ''}
            onClose={() => setIsTicketOpen(false)}
          />
        )}
      </div>
    </>
  );
}