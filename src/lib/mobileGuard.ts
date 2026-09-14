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
 * whenever `isMobile` is true. Read-only functions (fetches, open/close
 * modal toggles, login/logout, printing) should NOT be passed through
 * this — only functions that actually add/update/delete data.
 */
export function guardMobile<F extends (...args: any[]) => any>(fn: F, isMobile: boolean): F {
  if (!isMobile) return fn;
  return ((..._args: Parameters<F>) => {
    notifyDesktopOnly();
    return undefined;
  }) as F;
}