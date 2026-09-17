import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { parseFractionInches, formatFractionInches } from '../../lib/fractionInches';
import type { StockCategory, StockLine } from '../../inventoryTypes';

// The quantity field used to fire a database write on every keystroke —
// typing "150" fired three separate writes (for "1", then "15", then
// "150"), and if someone got interrupted or mistyped partway through,
// whatever half-finished number was on screen at that moment was already
// saved as the real stock count. This fixes both problems: the value only
// commits on blur or Enter (never mid-keystroke), and any REDUCTION
// specifically asks for confirmation first — going up is low-risk (worst
// case, add a correcting line later), but silently wiping out real stock
// on a typo is the direction actually worth guarding.
function StockQuantityCell({
  stockLine,
  onCommit,
}: {
  stockLine: StockLine;
  onCommit: (id: string, quantity: number) => void;
}) {
  const [draft, setDraft] = useState(String(stockLine.quantity));

  // Keep the draft in sync if the real value changes from elsewhere
  // (another tab, a cutting job consuming this stock line, etc.) —
  // without this, a stale draft could silently overwrite a newer value
  // the next time this cell commits.
  useEffect(() => {
    setDraft(String(stockLine.quantity));
  }, [stockLine.quantity]);

  function commit() {
    const q = parseInt(draft, 10);
    if (!Number.isFinite(q) || q < 0) {
      setDraft(String(stockLine.quantity)); // invalid entry — revert, don't write
      return;
    }
    if (q === stockLine.quantity) return; // no actual change, nothing to do

    if (q < stockLine.quantity) {
      const ok = confirm(
        `Reduce ${stockLine.categoryName} ${formatFractionInches(stockLine.lengthIn)} × ${formatFractionInches(
          stockLine.widthIn
        )} from ${stockLine.quantity} to ${q}?`
      );
      if (!ok) {
        setDraft(String(stockLine.quantity));
        return;
      }
    }

    onCommit(stockLine.id, q);
  }

  return (
    <input
      className="num"
      type="number"
      min={0}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); // blur triggers commit()
        if (e.key === 'Escape') setDraft(String(stockLine.quantity));
      }}
      style={{
        width: 64,
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '5px 8px',
      }}
    />
  );
}

// Category names could previously only be set at creation — fixing a
// typo meant deleting and recreating the category, which also requires
// it to have zero stock lines first. This gives it the same
// click-to-edit, commit-on-blur-or-Enter treatment as StockQuantityCell
// above, just for a name instead of a number.
function CategoryNameCell({
  category,
  onCommit,
}: {
  category: StockCategory;
  onCommit: (id: string, name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(category.name);

  useEffect(() => {
    setDraft(category.name);
  }, [category.name]);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (!trimmed || trimmed === category.name) {
      setDraft(category.name); // no real change, or emptied out — revert
      return;
    }
    onCommit(category.id, trimmed);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Click to rename"
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          font: 'inherit',
          color: 'inherit',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {category.name}
      </button>
    );
  }

  return (
    <input
      autoFocus
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); // blur triggers commit()
        if (e.key === 'Escape') {
          setDraft(category.name);
          setEditing(false);
        }
      }}
      style={{
        width: '100%',
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '4px 8px',
        font: 'inherit',
        color: 'inherit',
      }}
    />
  );
}

export default function CategoriesStock() {
  const {
    categories,
    stockLines,
    dataLoading,
    addCategory,
    updateCategory,
    deleteCategory,
    addStockLine,
    updateStockQuantity,
    deleteStockLine,
    isMobileView,
  } = useInventory();

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

  async function handleRenameCategory(id: string, name: string) {
    const ok = await updateCategory(id, name);
    if (!ok) setFormError('Could not rename category — name may already be in use.');
  }

  async function handleDeleteCategory(id: string) {
    if (!confirm('Delete this category? It must have no stock lines first.')) return;
    const ok = await deleteCategory(id);
    if (!ok) setFormError('Could not delete category — it still has stock lines referencing it.');
  }

  async function handleDeleteStock(s: (typeof stockLines)[number]) {
    // Removing a stock line is as destructive as a quantity reduction to
    // zero (arguably more so — it also drops the size/origin record, not
    // just the count), so it gets the same explicit-confirmation
    // treatment as StockQuantityCell's reduce path, naming exactly what's
    // about to disappear.
    const ok = confirm(
      `Remove this stock line entirely — ${s.categoryName} ${formatFractionInches(s.lengthIn)} × ${formatFractionInches(
        s.widthIn
      )}, qty ${s.quantity}? This can't be undone.`
    );
    if (!ok) return;
    await deleteStockLine(s.id);
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

    // Adding a size that's already sitting in stock used to always create
    // a second row for the same category/size — fine if it's genuinely a
    // separate batch, but usually just a papercut (e.g. a new delivery of
    // a size already stocked). Only matches 'fresh' stock — a waste-origin
    // remnant that happens to be the same size is a different kind of
    // thing and shouldn't get folded into it silently.
    const existing = stockLines.find(
      (s) => s.categoryId === stockCategoryId && s.origin === 'fresh' && s.lengthIn === length && s.widthIn === width
    );

    if (existing) {
      const combined = existing.quantity + quantity;
      const categoryName = categories.find((c) => c.id === stockCategoryId)?.name ?? 'this category';
      const mergeInstead = confirm(
        `${categoryName} ${formatFractionInches(length)} × ${formatFractionInches(existing.widthIn)} already has ${
          existing.quantity
        } in stock. Add ${quantity} more to make ${combined}?\n\nCancel to add this as a separate line instead.`
      );
      if (mergeInstead) {
        setSubmitting(true);
        await updateStockQuantity(existing.id, combined);
        setSubmitting(false);
        setLengthRaw('');
        setWidthRaw('');
        setQuantityRaw('1');
        return;
      }
      // else fall through — add as a genuinely separate line, as before
    }

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
            <form onSubmit={handleAddCategory} className="desktop-only" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
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
                        <td>
                          {isMobileView ? (
                            c.name
                          ) : (
                            <CategoryNameCell category={c} onCommit={handleRenameCategory} />
                          )}
                        </td>
                        <td style={{ width: 1, textAlign: 'right' }}>
                          <button type="button" className="btn btn-ghost btn-small desktop-only" onClick={() => handleDeleteCategory(c.id)}>
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

            <form onSubmit={handleAddStock} className="desktop-only" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
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
                        {isMobileView ? (
                          <span className="num">{s.quantity}</span>
                        ) : (
                          <StockQuantityCell stockLine={s} onCommit={updateStockQuantity} />
                        )}
                      </td>
                      <td style={{ width: 1, textAlign: 'right' }}>
                        <button type="button" className="btn btn-ghost btn-small desktop-only" onClick={() => handleDeleteStock(s)}>
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