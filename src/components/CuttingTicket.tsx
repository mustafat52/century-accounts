import { formatFractionInches } from '../lib/fractionInches';
import type { PlanResult, SheetUsage } from '../lib/cuttingAlgorithm';
import { groupSheets, customerNameForPiece, textFitsWidth, type DraftRow } from '../lib/sheetGrouping';

// Print-safe rendering of a sheet's cut layout: black-on-white, since the
// app's dark theme (gold/teal/red on near-black) prints terribly on a
// standard office printer and wastes ink even when it doesn't. Waste vs.
// stock is also labeled as text on the region itself, not just by color —
// most shop printers are black & white.
function TicketDiagram({ sheet, rows }: { sheet: SheetUsage; rows: DraftRow[] }) {
  const labelSize = Math.max(sheet.sheetWidthIn, sheet.sheetLengthIn) * 0.032;

  return (
    <svg viewBox={`0 0 ${sheet.sheetWidthIn} ${sheet.sheetLengthIn}`} style={{ width: '100%', height: 'auto', maxHeight: 280 }}>
      <rect x={0} y={0} width={sheet.sheetWidthIn} height={sheet.sheetLengthIn} fill="#fafafa" stroke="#333" strokeWidth={0.5} />

      {sheet.leftoverRegions.map((r, i) => {
        const label = `WASTE ${Math.round(r.widthIn)}×${Math.round(r.lengthIn)}`;
        const fits = textFitsWidth(label, r.widthIn, labelSize * 0.85);
        return (
          <g key={i}>
            <rect x={r.xIn} y={r.yIn} width={r.widthIn} height={r.lengthIn} fill="#ffffff" stroke="#666" strokeDasharray="2,1.5" strokeWidth={0.4} />
            {fits && (
              <text x={r.xIn + r.widthIn / 2} y={r.yIn + r.lengthIn / 2} fontSize={labelSize * 0.85} fill="#888" textAnchor="middle" dominantBaseline="middle">
                {label}
              </text>
            )}
          </g>
        );
      })}

      {sheet.placedPieces.map((p, i) => {
        const name = customerNameForPiece(p.pieceId, rows);
        const dimsLabel = `${Math.round(p.widthIn)}×${Math.round(p.lengthIn)}`;
        const nameFits = name && textFitsWidth(name, p.widthIn, labelSize);
        const dimsFits = textFitsWidth(dimsLabel, p.widthIn, labelSize * (name ? 0.85 : 1));
        return (
          <g key={i}>
            <rect x={p.xIn} y={p.yIn} width={p.widthIn} height={p.lengthIn} fill="#ececec" stroke="#000" strokeWidth={0.7} />
            {nameFits && (
              <text
                x={p.xIn + p.widthIn / 2}
                y={p.yIn + p.lengthIn / 2 - labelSize * 0.6}
                fontSize={labelSize}
                fontWeight={700}
                fill="#111"
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
                fill="#333"
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
  );
}

interface CuttingTicketProps {
  plan: PlanResult;
  rows: DraftRow[];
  categoryName: string;
  onClose: () => void;
}

export function CuttingTicket({ plan, rows, categoryName, onClose }: CuttingTicketProps) {
  const groups = groupSheets(plan.sheets, rows);
  const today = new Date().toLocaleDateString();

  return (
    <div className="ticket-overlay">
      <div className="ticket-toolbar no-print">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          Print
        </button>
      </div>

      <div className="ticket-pages">
        {groups.map((g, i) => (
            <div className="ticket-page" key={i}>
              <div className="ticket-head">
                <div>
                  <div className="ticket-title">Cutting Ticket</div>
                  <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>{categoryName}</div>
                </div>
                <div className="ticket-meta">
                  <div>
                    Layout {i + 1} of {groups.length}
                  </div>
                  <div>
                    {g.count} sheet{g.count === 1 ? '' : 's'} ·{' '}
                    {formatFractionInches(g.representative.sheetWidthIn)} × {formatFractionInches(g.representative.sheetLengthIn)} ·{' '}
                    {g.representative.origin}
                  </div>
                  <div>{today}</div>
                </div>
              </div>

              <div className="ticket-diagram-wrap">
                <TicketDiagram sheet={g.representative} rows={rows} />
              </div>

              <table className="ticket-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Size</th>
                    <th>Rotated</th>
                  </tr>
                </thead>
                <tbody>
                  {g.representative.placedPieces.map((p, idx) => (
                    <tr key={idx}>
                      <td>{customerNameForPiece(p.pieceId, rows) || '—'}</td>
                      <td>
                        {formatFractionInches(p.widthIn)} × {formatFractionInches(p.lengthIn)}
                      </td>
                      <td>{p.rotated ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {g.representative.leftoverRegions.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#888', marginBottom: 6 }}>
                    Leftover ({g.representative.leftoverClassification})
                  </div>
                  {g.representative.leftoverRegions.map((r, ri) => (
                    <div key={ri} style={{ fontSize: 11, color: '#333' }}>
                      {formatFractionInches(r.widthIn)} × {formatFractionInches(r.lengthIn)}
                    </div>
                  ))}
                </div>
              )}

              {g.count > 1 && (
                <div style={{ marginTop: 12, fontSize: 11, fontStyle: 'italic', color: '#666' }}>
                  Repeat this exact layout on {g.count} sheets.
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
  );
}