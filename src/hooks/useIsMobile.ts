import { useEffect, useState } from 'react';

// Single source of truth for "mobile / view-only" mode, kept in sync on
// purpose with the `@media (max-width: 860px)` breakpoint in global.css
// (.mobile-nav, .desktop-only, etc.) — a window under 860px wide is the
// same "mobile" surface everywhere, whether the check is happening in CSS
// or in JS. Per spec (progress.md section 7), this is a UI-layer signal,
// not a security boundary: the app is used by two trusted staff members
// over Supabase RLS that already grants them full read/write access, so
// there is no per-user data partitioning to bypass. What this hook drives
// is the product decision — full functionality on a computer, view-only
// on a phone/tablet, installable as a PWA — not access control.
const MOBILE_QUERY = '(max-width: 860px)';

function getIsMobile(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(MOBILE_QUERY).matches;
}

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(getIsMobile);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const handleChange = () => setIsMobile(mql.matches);
    // Safari < 14 only supports the deprecated addListener/removeListener
    // pair — this branch keeps things working there without dropping
    // support for the standard EventTarget API everywhere else.
    if (mql.addEventListener) {
      mql.addEventListener('change', handleChange);
      return () => mql.removeEventListener('change', handleChange);
    }
    mql.addListener(handleChange);
    return () => mql.removeListener(handleChange);
  }, []);

  return isMobile;
}