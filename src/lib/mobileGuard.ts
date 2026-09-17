// The UI already hides every mutating control below the mobile breakpoint
// (see the `desktop-only` class throughout src/pages and src/components).
// This module is the second layer behind that: every add/update/delete
// function handed to AppContext/InventoryContext consumers gets wrapped
// with guardMobile before it's exposed, so even a control that's missed,
// a stale cached page, or a detail view that mixes viewing with an
// in-page action (e.g. a "Record Payment" button inside a row's detail
// modal) can't actually write anything while in mobile view — it just
// surfaces this notice instead. Belt-and-suspenders, not a security
// boundary (see useIsMobile.ts) — the real enforcement for who can read/
// write what is Supabase RLS.

let lastNoticeAt = 0;

export function notifyDesktopOnly(): void {
  const now = Date.now();
  // Rapid double-taps / double-clicks on a slipped-through control
  // shouldn't stack multiple native alert() dialogs.
  if (now - lastNoticeAt < 500) return;
  lastNoticeAt = now;
  window.alert(
    'This is view-only on mobile. Please use a computer to add, edit, or record anything — everything here is still visible, just not editable from a phone or tablet.'
  );
}

/**
 * Wraps a mutating action so it becomes a no-op (with a friendly notice)
 * whenever `isMobile` is true.
 *
 * IMPORTANT: this module is shared by BOTH AppContext.tsx (accounting)
 * and InventoryContext.tsx (inventory) — this was discovered via a real
 * build failure across ~7 AppContext call sites (addCustomer, addVendor,
 * etc.) after an earlier pass changed this function's exported type to
 * more honestly reflect a blocked call's shape (Promise<T | undefined>
 * instead of claiming Promise<T>). AppContext's own interface declares
 * its action types without `| undefined`, and rewriting AppContext's
 * types is out of scope for inventory work — so this wrapper is kept
 * fully signature-compatible with every existing caller in both contexts
 * (`F` in, `F` out). Only the RUNTIME behavior is improved: a blocked
 * call now genuinely returns `Promise.resolve(undefined)` rather than a
 * bare, synchronous `undefined` masquerading as a Promise. What the
 * caller actually receives via `await` is identical either way
 * (`undefined`) — this only fixes the type lying about *how* that value
 * arrives, without requiring any change at any call site.
 *
 * Read-only functions (fetches, open/close modal toggles, login/logout,
 * printing) should NOT be passed through this — only functions that
 * actually add/update/delete data.
 */
export function guardMobile<F extends (...args: any[]) => any>(fn: F, isMobile: boolean): F {
  if (!isMobile) return fn;
  return (async (..._args: Parameters<F>) => {
    notifyDesktopOnly();
    return undefined;
  }) as F;
}