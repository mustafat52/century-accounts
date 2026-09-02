import { useMemo, useState, type FormEvent } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { parseFractionInches, formatFractionInches } from '../../lib/fractionInches';

export default function CategoriesStock() {
  const { categories, stockLines, dataLoading, addCategory, deleteCategory, addStockLine, updateStockQuantity, deleteStockLine } =
    useInventory();

  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [stockCategoryId, setStockCategoryId] = useState('');
  const [lengthRaw, setLengthRaw] = useState('');
  const [widthRaw, setWidthRaw] = useState('');
  const [quantityRaw, setQuantityRaw] = useState('1');

  const visibleStock = useMemo(
    () => (categoryFilter === 'all' ? stockLines : stockLines.filter((s) => s.categoryId === categoryFilter)),
    [stockLines, categoryFilter]
  );

  async function handleAddCategory(e: FormEvent) {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    const created = await addCategory({ name: newCategoryName });
    if (!created) {
      setFormError('Could not add category — name may already be in use.');
      return;
    }
    setNewCategoryName('');
    setFormError('');
  }

  async function handleDeleteCategory(id: string) {
    if (!confirm('Delete this category? It must have no stock lines first.')) return;
    const ok = await deleteCategory(id);
    if (!ok) setFormError('Could not delete category — it still has stock lines referencing it.');
  }

  async function handleAddStock(e: FormEvent) {
    e.preventDefault();
    setFormError('');

    const length = parseFractionInches(lengthRaw);
    const width = parseFractionInches(widthRaw);
    const quantity = parseInt(quantityRaw, 10);

    if (!stockCategoryId) return setFormError('Choose a category.');
    if (length === null || width === null) return setFormError('Enter sizes like 72, 21 5/8, or 21⅝.');
    if (!Number.isFinite(quantity) || quantity < 0) return setFormError('Quantity must be zero or more.');

    setSubmitting(true);
    const created = await addStockLine({ categoryId: stockCategoryId, lengthIn: length, widthIn: width, quantity });
    setSubmitting(false);
    if (!created) return setFormError('Could not add stock line.');

    setLengthRaw('');
    setWidthRaw('');
    setQuantityRaw('1');
  }

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">
          <h1>Categories &amp; Stock</h1>
          <p>
            Glass categories the shop stocks, and the whole-sheet sizes and quantities on hand for each. Sizes accept
            fraction notation — try <span className="num">21 5/8</span>.
          </p>
        </div>
      </div>

      <div className="view-body">
        {formError && (
          <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 16 }}>{formError}</div>
        )}

        {/* Stock has more fields than Categories, so it gets the wider
            column — the shared .two-col class defaults to 1.4fr/1fr for
            other pages, overridden here since that ratio was backwards
            for this page's content and was part of what caused the
            overflow. */}
        <div className="two-col" style={{ gridTemplateColumns: '0.85fr 1.3fr' }}>
          {/* ---------- Categories ---------- */}
          <div className="panel">
            <div className="panel-head">
              <h3>Categories</h3>
            </div>
            <form onSubmit={handleAddCategory} style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div className="form-field">
                <label>New category</label>
                <input
                  type="text"
                  placeholder="e.g. Color Mirrors"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-primary btn-small" style={{ marginTop: 10 }}>
                Add category
              </button>
            </form>

            <div className="chip-row" style={{ flexWrap: 'wrap', padding: '14px 20px 18px', marginBottom: 0 }}>
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

            {categories.length > 0 && (
              <div className="table-scroll">
                <table>
                  <tbody>
                    {categories.map((c) => (
                      <tr key={c.id}>
                        <td>{c.name}</td>
                        <td style={{ width: 1, textAlign: 'right' }}>
                          <button type="button" className="btn btn-ghost btn-small" onClick={() => handleDeleteCategory(c.id)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ---------- Stock ---------- */}
          <div className="panel">
            <div className="panel-head">
              <h3>Stock on hand</h3>
            </div>

            <form onSubmit={handleAddStock} style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              {/* Category gets its own full-width row — category names can
                  run long, and cramming a select in next to three number
                  fields was the main cause of the overflow. */}
              <div className="form-field" style={{ marginBottom: 12 }}>
                <label>Category</label>
                <select value={stockCategoryId} onChange={(e) => setStockCategoryId(e.target.value)}>
                  <option value="">Select…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* auto-fit + minmax means these wrap onto a new line on
                  their own whenever the panel is too narrow to fit all
                  three side by side — no fixed pixel widths, so this can
                  never overflow the panel regardless of how narrow it gets. */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))',
                  gap: 12,
                }}
              >
                <div className="form-field">
                  <label>Length</label>
                  <input
                    className="num"
                    type="text"
                    placeholder="72 or 21 5/8"
                    value={lengthRaw}
                    onChange={(e) => setLengthRaw(e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>Width</label>
                  <input
                    className="num"
                    type="text"
                    placeholder="96"
                    value={widthRaw}
                    onChange={(e) => setWidthRaw(e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>Quantity</label>
                  <input
                    className="num"
                    type="number"
                    min={0}
                    value={quantityRaw}
                    onChange={(e) => setQuantityRaw(e.target.value)}
                  />
                </div>
              </div>

              <button type="submit" className="btn btn-primary btn-small" style={{ marginTop: 12 }} disabled={submitting}>
                {submitting ? 'Adding…' : 'Add stock line'}
              </button>
            </form>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Size</th>
                    <th>Origin</th>
                    <th>Quantity</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleStock.length === 0 && !dataLoading && (
                    <tr>
                      <td colSpan={5} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '28px 20px' }}>
                        {categoryFilter === 'all' ? 'No stock lines yet — add one above.' : 'No stock in this category.'}
                      </td>
                    </tr>
                  )}
                  {visibleStock.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <div className="row-name">{s.categoryName}</div>
                      </td>
                      <td className="num">
                        {formatFractionInches(s.lengthIn)} × {formatFractionInches(s.widthIn)}
                      </td>
                      <td>
                        <span className={`badge ${s.origin}`}>{s.origin}</span>
                      </td>
                      <td>
                        <input
                          className="num"
                          type="number"
                          min={0}
                          value={s.quantity}
                          onChange={(e) => {
                            const q = parseInt(e.target.value, 10);
                            if (Number.isFinite(q) && q >= 0) updateStockQuantity(s.id, q);
                          }}
                          style={{
                            width: 64,
                            background: 'var(--surface-2)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius)',
                            padding: '5px 8px',
                          }}
                        />
                      </td>
                      <td style={{ width: 1, textAlign: 'right' }}>
                        <button type="button" className="btn btn-ghost btn-small" onClick={() => deleteStockLine(s.id)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}