import { useEffect, useMemo, useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { supabase } from '../../lib/supabaseClient';
import { formatFractionInches } from '../../lib/fractionInches';

// This page is deliberately self-contained rather than routed through
// InventoryContext: it's read-only, paginated, and only ever needed once
// the person navigates here, so it fetches directly with its own local
// state rather than adding an always-loaded "cuttingJobs" array to a
// context that's already eagerly loaded on every inventory page.

const PAGE_SIZE = 20;

interface HistoryPiece {
  id: string;
  lengthIn: number;
  widthIn: number;
  xIn: number;
  yIn: number;
  rotated: boolean;
  customerName: string;
}

interface HistorySheet {
  id: string;
  sheetLengthIn: number;
  sheetWidthIn: number;
  origin: string;
  sortOrder: number;
  pieces: HistoryPiece[];
  // Leftover/waste SIZES only — not positions. inv_waste only ever stored
  // length_in/width_in per region plus which sheet it came from
  // (source_plan_sheet_id); the on-sheet x/y of a leftover region only
  // ever existed in-memory during the live plan and was never persisted.
  // So, unlike the live Cutting Plan diagram, history can't draw these as
  // positioned rectangles — only list their sizes.
  wasteSizes: { lengthIn: number; widthIn: number }[];
}

interface HistoryJob {
  id: string;
  categoryId: string;
  categoryName: string;
  confirmedAt: string;
  items: { id: string; lengthIn: number; widthIn: number; quantity: number; customerName: string | null }[];
  sheets: HistorySheet[];
}

async function fetchJobsPage(offset: number): Promise<{ jobs: Omit<HistoryJob, 'categoryName'>[]; hasMore: boolean }> {
  const { data: jobRows, error: jobErr } = await supabase
    .from('inv_cutting_jobs')
    .select(
      `id, category_id, confirmed_at,
       inv_cutting_job_items ( id, length_in, width_in, quantity, customer_name, sort_order ),
       inv_plan_sheets ( id, sheet_length_in, sheet_width_in, origin, sort_order,
         inv_plan_sheet_items ( id, job_item_id, length_in, width_in, x_in, y_in, rotated )
       )`
    )
    .eq('status', 'confirmed')
    .order('confirmed_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (jobErr || !jobRows) {
    if (jobErr) console.error(jobErr);
    return { jobs: [], hasMore: false };
  }

  // Waste rows aren't nested in the select above — source_plan_sheet_id
  // is a plain column, not necessarily set up as a PostgREST-embeddable
  // relationship, so fetching by id list directly is more robust than
  // relying on an assumed embed name.
  const sheetIds: string[] = jobRows.flatMap((j: any) => (j.inv_plan_sheets ?? []).map((s: any) => s.id));
  const wasteBySheet = new Map<string, { lengthIn: number; widthIn: number }[]>();
  if (sheetIds.length > 0) {
    const { data: wasteRows, error: wasteErr } = await supabase
      .from('inv_waste')
      .select('source_plan_sheet_id, length_in, width_in')
      .in('source_plan_sheet_id', sheetIds);
    if (wasteErr) console.error(wasteErr);
    (wasteRows ?? []).forEach((w: any) => {
      if (!w.source_plan_sheet_id) return;
      const list = wasteBySheet.get(w.source_plan_sheet_id) ?? [];
      list.push({ lengthIn: Number(w.length_in), widthIn: Number(w.width_in) });
      wasteBySheet.set(w.source_plan_sheet_id, list);
    });
  }

  const jobs = jobRows.map((j: any) => {
    const customerNameByItemId = new Map<string, string | null>();
    const items = (j.inv_cutting_job_items ?? [])
      .slice()
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map((it: any) => {
        customerNameByItemId.set(it.id, it.customer_name);
        return {
          id: it.id,
          lengthIn: Number(it.length_in),
          widthIn: Number(it.width_in),
          quantity: Number(it.quantity),
          customerName: it.customer_name,
        };
      });

    const sheets: HistorySheet[] = (j.inv_plan_sheets ?? [])
      .slice()
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map((s: any) => ({
        id: s.id,
        sheetLengthIn: Number(s.sheet_length_in),
        sheetWidthIn: Number(s.sheet_width_in),
        origin: s.origin,
        sortOrder: s.sort_order,
        pieces: (s.inv_plan_sheet_items ?? []).map((p: any) => ({
          id: p.id,
          lengthIn: Number(p.length_in),
          widthIn: Number(p.width_in),
          xIn: Number(p.x_in),
          yIn: Number(p.y_in),
          rotated: Boolean(p.rotated),
          customerName: (p.job_item_id && customerNameByItemId.get(p.job_item_id)) || '',
        })),
        wasteSizes: wasteBySheet.get(s.id) ?? [],
      }));

    return {
      id: j.id,
      categoryId: j.category_id,
      confirmedAt: j.confirmed_at,
      items,
      sheets,
    };
  });

  return { jobs, hasMore: jobRows.length === PAGE_SIZE };
}

function textFitsWidth(text: string, availableWidthIn: number, fontSizeIn: number): boolean {
  return text.length * fontSizeIn * 0.6 <= availableWidthIn * 0.95;
}

function HistorySheetDiagram({ sheet }: { sheet: HistorySheet }) {
  const labelSize = Math.max(sheet.sheetWidthIn, sheet.sheetLengthIn) * 0.032;

  return (
    <svg
      viewBox={`0 0 ${sheet.sheetWidthIn} ${sheet.sheetLengthIn}`}
      style={{ width: '100%', height: 'auto', maxHeight: 320, background: 'var(--surface-2)', borderRadius: 4 }}
    >
      <rect
        x={0}
        y={0}
        width={sheet.sheetWidthIn}
        height={sheet.sheetLengthIn}
        fill="rgba(236, 231, 219, 0.07)"
        stroke="var(--border)"
        strokeWidth={0.5}
      />
      {sheet.pieces.map((p) => {
        const dimsLabel = `${Math.round(p.widthIn)}×${Math.round(p.lengthIn)}`;
        const nameFits = Boolean(p.customerName) && textFitsWidth(p.customerName, p.widthIn, labelSize);
        const dimsFits = textFitsWidth(dimsLabel, p.widthIn, labelSize * (nameFits ? 0.85 : 1));
        return (
          <g key={p.id}>
            <rect x={p.xIn} y={p.yIn} width={p.widthIn} height={p.lengthIn} fill="var(--gold-dim)" stroke="var(--gold)" strokeWidth={0.5} />
            <title>
              {p.customerName ? `${p.customerName} — ` : ''}
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
                {p.customerName}
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
  );
}

function JobCard({ job }: { job: HistoryJob }) {
  const [expanded, setExpanded] = useState(false);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);

  const totalPieces = job.items.reduce((sum, it) => sum + it.quantity, 0);
  const customerNames = Array.from(new Set(job.items.map((it) => it.customerName).filter(Boolean))) as string[];
  const activeSheet = job.sheets[activeSheetIndex] ?? null;

  const when = new Date(job.confirmedAt);
  const dateLabel = when.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const timeLabel = when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '14px 20px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontFamily: 'var(--font-display)' }}>{job.categoryName || 'Uncategorized'}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
            <span className="num">
              {dateLabel} · {timeLabel}
            </span>
            {' · '}
            {totalPieces} piece{totalPieces === 1 ? '' : 's'} · {job.sheets.length} sheet{job.sheets.length === 1 ? '' : 's'}
            {customerNames.length > 0 && <> · {customerNames.join(', ')}</>}
          </div>
        </div>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{expanded ? 'Hide' : 'View'}</span>
      </button>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {job.sheets.length > 1 && (
            <div style={{ display: 'flex', gap: 2, padding: '10px 20px 0', overflowX: 'auto' }}>
              {job.sheets.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveSheetIndex(i)}
                  style={{
                    flex: '0 0 auto',
                    padding: '8px 16px',
                    fontSize: 13,
                    fontWeight: 600,
                    color: i === activeSheetIndex ? 'var(--gold-bright)' : 'var(--text-muted)',
                    background: i === activeSheetIndex ? 'var(--surface-2)' : 'transparent',
                    border: 'none',
                    borderBottom: i === activeSheetIndex ? '2px solid var(--gold)' : '2px solid transparent',
                    cursor: 'pointer',
                    borderRadius: '4px 4px 0 0',
                  }}
                >
                  Sheet {i + 1}
                </button>
              ))}
            </div>
          )}

          {activeSheet && (
            <div style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3>
                  <span className="num">
                    {formatFractionInches(activeSheet.sheetWidthIn)} × {formatFractionInches(activeSheet.sheetLengthIn)}
                  </span>
                </h3>
                <span className={`badge ${activeSheet.origin}`}>{activeSheet.origin}</span>
              </div>

              <div style={{ maxWidth: 480 }}>
                <HistorySheetDiagram sheet={activeSheet} />
              </div>

              <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--text-muted)' }}>
                {activeSheet.pieces.length} piece{activeSheet.pieces.length === 1 ? '' : 's'} placed
              </div>

              {activeSheet.wasteSizes.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className="badge waste">waste</span>
                  <span className="num" style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                    leftover{activeSheet.wasteSizes.length > 1 ? 's' : ''}:{' '}
                    {activeSheet.wasteSizes
                      .map((r) => `${formatFractionInches(r.widthIn)} × ${formatFractionInches(r.lengthIn)}`)
                      .join(', ')}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CuttingHistory() {
  const { categories } = useInventory();
  const [jobs, setJobs] = useState<HistoryJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [error, setError] = useState('');

  const categoryNameById = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  async function loadPage(nextOffset: number, append: boolean) {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError('');
    try {
      const { jobs: pageJobs, hasMore: more } = await fetchJobsPage(nextOffset);
      const withNames: HistoryJob[] = pageJobs.map((j) => ({
        ...j,
        categoryName: categoryNameById.get(j.categoryId) ?? '',
      }));
      setJobs((prev) => (append ? [...prev, ...withNames] : withNames));
      setHasMore(more);
      setOffset(nextOffset + PAGE_SIZE);
    } catch (err) {
      console.error(err);
      setError('Could not load cutting history.');
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }

  useEffect(() => {
    loadPage(0, false);
    // Re-runs once categories finish their first load so job category
    // names resolve correctly, but not on every later categories edit —
    // a job's category assignment at cut time shouldn't shift around
    // just because someone renames or adds categories afterward.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories.length > 0]);

  const visibleJobs = categoryFilter === 'all' ? jobs : jobs.filter((j) => j.categoryId === categoryFilter);

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">
          <h1>Cutting History</h1>
          <p>Every confirmed cutting job, most recent first — the sheet layout as it was actually cut.</p>
        </div>
      </div>

      <div className="view-body">
        {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 16 }}>{error}</div>}

        <div className="chip-row" style={{ flexWrap: 'wrap', marginBottom: 16 }}>
          <button
            type="button"
            className={`chip${categoryFilter === 'all' ? ' is-active' : ''}`}
            onClick={() => setCategoryFilter('all')}
          >
            All categories
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`chip${categoryFilter === c.id ? ' is-active' : ''}`}
              onClick={() => setCategoryFilter(categoryFilter === c.id ? 'all' : c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>

        {loading && <div style={{ color: 'var(--text-muted)', padding: '20px 0' }}>Loading history…</div>}

        {!loading && visibleJobs.length === 0 && (
          <div className="panel">
            <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No confirmed cutting jobs yet — this fills in once a cut is confirmed from the Cutting Plan page.
            </div>
          </div>
        )}

        {visibleJobs.map((job) => (
          <JobCard key={job.id} job={job} />
        ))}

        {hasMore && (
          <button type="button" className="btn btn-ghost" onClick={() => loadPage(offset, true)} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </>
  );
}