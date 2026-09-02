import { useMemo, useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { formatFractionInches } from '../../lib/fractionInches';

export default function WasteLedger() {
  const { categories, wasteLines, dataLoading } = useInventory();
  const [categoryFilter, setCategoryFilter] = useState('all');

  const visibleWaste = useMemo(
    () => (categoryFilter === 'all' ? wasteLines : wasteLines.filter((w) => w.categoryId === categoryFilter)),
    [wasteLines, categoryFilter]
  );

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">
          <h1>Waste &amp; Remnants</h1>
          <p>
            Everything the cutting algorithm has classified as waste — leftover pieces where more than 50% of the
            source sheet was used. Reusable remnants show up on the Categories &amp; Stock page instead.
          </p>
        </div>
      </div>

      <div className="view-body">
        <div className="panel">
          <div className="panel-head">
            <h3>Waste log</h3>
          </div>

          <div className="chip-row" style={{ flexWrap: 'wrap', padding: '14px 20px', margin: 0, borderBottom: '1px solid var(--border)' }}>
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

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Size</th>
                  <th>Logged</th>
                </tr>
              </thead>
              <tbody>
                {visibleWaste.length === 0 && !dataLoading && (
                  <tr>
                    <td colSpan={3} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '28px 20px' }}>
                      {categoryFilter === 'all'
                        ? 'No waste logged yet — this fills in once cutting plans are confirmed.'
                        : 'No waste in this category.'}
                    </td>
                  </tr>
                )}
                {visibleWaste.map((w) => (
                  <tr key={w.id}>
                    <td>
                      <div className="row-name">{w.categoryName}</div>
                    </td>
                    <td className="num">
                      {formatFractionInches(w.lengthIn)} × {formatFractionInches(w.widthIn)}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>
                      {new Date(w.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}