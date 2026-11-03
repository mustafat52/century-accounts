import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import Topbar from '../components/Topbar';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabaseClient';
import { addDaysLocal } from '../utils/format';
import { useIsMobile } from '../hooks/useIsMobile';
import { AREAS, mapActivity, describeTitle, describeDetails, tableLabel, collapseEditPairs, type ActivityEntry, type ActivityLookups } from '../lib/activityLog';

const PAGE_SIZE = 50;
const COLLAPSED_LINES = 4;

const ACTION_STYLE: Record<ActivityEntry['action'], { label: string; color: string }> = {
  insert: { label: 'Added', color: 'var(--success)' },
  update: { label: 'Changed', color: '#d9a441' },
  delete: { label: 'Deleted', color: 'var(--danger)' },
};

// Owner-only. Reads public.activity_log, which the database fills
// automatically (see migrations/007_activity_log.sql); RLS also restricts
// reading to owners, so this page is a convenience gate, not the real one.
export default function ActivityLog() {
  const { currentUserRole, quotations, customers, vendors, workers, invoices, employees } = useApp();

  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [area, setArea] = useState('all');
  const [actor, setActor] = useState('all');
  const [action, setAction] = useState<'all' | ActivityEntry['action']>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const isMobile = useIsMobile();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const lookups = useMemo<ActivityLookups>(
    () => ({
      quotations: new Map(quotations.map((q) => [q.dbId, q.id])),
      customers: new Map(customers.map((c) => [c.id, c.name])),
      vendors: new Map(vendors.map((v) => [v.id, v.name])),
      workers: new Map(workers.map((w) => [w.id, w.name])),
      invoices: new Map(invoices.map((i) => [i.dbId, i.id])),
    }),
    [quotations, customers, vendors, workers, invoices]
  );

  const load = useCallback(
    async (reset: boolean, offset: number) => {
      setLoading(true);
      setError('');
      let q = supabase.from('activity_log').select('*').order('created_at', { ascending: false }).order('id', { ascending: false });
      const tables = AREAS.find((a) => a.key === area)?.tables ?? [];
      if (tables.length) q = q.in('table_name', tables);
      if (actor !== 'all') q = q.eq('actor_id', actor);
      if (action !== 'all') q = q.eq('action', action);
      if (fromDate) q = q.gte('created_at', new Date(`${fromDate}T00:00:00`).toISOString());
      if (toDate) q = q.lt('created_at', new Date(`${addDaysLocal(toDate, 1)}T00:00:00`).toISOString());

      const { data, error: err } = await q.range(offset, offset + PAGE_SIZE - 1);
      setLoading(false);
      if (err) {
        console.error('[Loading activity log]', err);
        setError(`Could not load the activity log: ${err.message}. If this is the first time, make sure migration 007_activity_log.sql has been run.`);
        return;
      }
      const rows = (data ?? []).map(mapActivity);
      setEntries((prev) => (reset ? rows : [...prev, ...rows]));
      setHasMore(rows.length === PAGE_SIZE);
    },
    [area, actor, action, fromDate, toDate]
  );

  useEffect(() => {
    if (currentUserRole === 'owner') void load(true, 0);
  }, [load, currentUserRole]);

  const actorOptions = useMemo(() => {
    const map = new Map<string, string>();
    employees.forEach((e) => map.set(e.id, e.displayName || e.email));
    entries.forEach((e) => {
      if (e.actorId && !map.has(e.actorId)) map.set(e.actorId, e.actorName);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [employees, entries]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return collapseEditPairs(entries)
      .map((e) => ({ e, title: describeTitle(e, lookups), lines: describeDetails(e, lookups) }))
      .filter((r) => !term || `${r.title} ${r.lines.join(' ')} ${r.e.actorName} ${tableLabel(r.e.tableName)}`.toLowerCase().includes(term));
  }, [entries, lookups, search]);

  if (currentUserRole !== 'owner') return <Navigate to="/" replace />;

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Phones get a shorter stamp (no seconds) so it fits on one line of a card.
  const when = (iso: string) =>
    new Date(iso).toLocaleString(
      'en-IN',
      isMobile
        ? { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }
        : { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }
    );

  const activeFilters = [area !== 'all', actor !== 'all', action !== 'all', !!fromDate, !!toDate].filter(Boolean).length;
  const clearFilters = () => {
    setArea('all');
    setActor('all');
    setAction('all');
    setFromDate('');
    setToDate('');
  };

  const areaField = (
    <div className="form-field">
      <label>Area</label>
      <select value={area} onChange={(e) => setArea(e.target.value)}>
        {AREAS.map((a) => (
          <option key={a.key} value={a.key}>
            {a.label}
          </option>
        ))}
      </select>
    </div>
  );
  const whoField = (
    <div className="form-field">
      <label>Who</label>
      <select value={actor} onChange={(e) => setActor(e.target.value)}>
        <option value="all">Everyone</option>
        {actorOptions.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );
  const typeField = (
    <div className="form-field">
      <label>Type</label>
      <select value={action} onChange={(e) => setAction(e.target.value as typeof action)}>
        <option value="all">All</option>
        <option value="insert">Added</option>
        <option value="update">Changed</option>
        <option value="delete">Deleted</option>
      </select>
    </div>
  );
  const fromField = (
    <div className="form-field">
      <label>From</label>
      <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
    </div>
  );
  const toField = (
    <div className="form-field">
      <label>To</label>
      <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
    </div>
  );
  const searchField = (
    <div className="form-field">
      <label>{isMobile ? 'Search' : 'Search (loaded entries)'}</label>
      <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. QUO-223, Ravi, payment" />
    </div>
  );

  return (
    <>
      <Topbar title="Activity Log" subtitle="Every change made in the app: who did it, when, and exactly what changed" />
      <div className="view-body">
        {isMobile ? (
          // Phone: search stays visible, the five filters tuck behind one
          // button (with a count of how many are active) instead of
          // pushing the entries a whole screen down.
          <div style={{ marginBottom: 14 }}>
            {searchField}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
              <button className="btn btn-ghost btn-small" onClick={() => setFiltersOpen((o) => !o)}>
                {filtersOpen ? 'Hide filters' : activeFilters > 0 ? `Filters (${activeFilters})` : 'Filters'}
              </button>
              {activeFilters > 0 && (
                <button className="btn btn-ghost btn-small" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>
            {filtersOpen && (
              <div className="log-filter-grid">
                {areaField}
                {whoField}
                {typeField}
                <div />
                {fromField}
                {toField}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="form-row" style={{ marginBottom: 12 }}>
              {areaField}
              {whoField}
              {typeField}
            </div>
            <div className="form-row" style={{ marginBottom: 16 }}>
              {fromField}
              {toField}
              {searchField}
            </div>
          </>
        )}

        {error && <p style={{ margin: '0 0 14px', color: 'var(--danger)', fontSize: 13 }}>{error}</p>}

        <div className="panel">
          <div className="panel-head">
            <h3>
              {rows.length} entr{rows.length === 1 ? 'y' : 'ies'}
              {search ? ' matching' : ' shown'}
            </h3>
            <button className="btn btn-ghost btn-small" onClick={() => void load(true, 0)} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
          <div className="table-scroll">
            <table className="table-cards">
              <thead>
                <tr>
                  <th style={{ whiteSpace: 'nowrap' }}>When</th>
                  <th>Who</th>
                  <th>What</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ e, title, lines }) => {
                  const open = expanded.has(e.id);
                  const shown = open ? lines : lines.slice(0, COLLAPSED_LINES);
                  const style = ACTION_STYLE[e.action];
                  return (
                    <tr key={e.id} style={isMobile ? { borderLeft: `3px solid ${style.color}` } : undefined}>
                      <td className="row-sub card-meta" style={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                        {when(e.createdAt)}
                      </td>
                      <td className="card-meta" style={{ verticalAlign: 'top' }}>
                        <span className="mobile-label">By</span>
                        {e.actorName}
                      </td>
                      <td className="card-main" style={{ verticalAlign: 'top', overflowWrap: 'anywhere' }}>
                        <div>
                          <span style={{ color: style.color, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginRight: 8 }}>{style.label}</span>
                          <strong>{title}</strong>
                        </div>
                        {shown.map((l, i) => (
                          <div key={i} className="row-sub" style={{ marginTop: 2 }}>
                            {l}
                          </div>
                        ))}
                        {lines.length > COLLAPSED_LINES && (
                          <button className="btn btn-ghost btn-small" style={{ marginTop: 4 }} onClick={() => toggle(e.id)}>
                            {open ? 'Show less' : `Show all ${lines.length} lines`}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && !loading && (
                  <tr>
                    <td colSpan={3} className="row-sub">
                      Nothing logged for these filters yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div style={{ padding: 16, textAlign: 'center' }}>
              <button className="btn btn-ghost" onClick={() => void load(false, entries.length)} disabled={loading}>
                {loading ? 'Loading…' : 'Load older entries'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}