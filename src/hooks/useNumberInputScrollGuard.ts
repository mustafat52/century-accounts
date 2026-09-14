import { useEffect } from 'react';

// Browsers treat a mouse-wheel scroll over a FOCUSED <input type="number">
// as if you'd clicked its tiny up/down spinner arrows — silently
// incrementing or decrementing the value — instead of scrolling the page.
// A person scrolling past a field they just finished typing in (attention
// already elsewhere) can quietly corrupt a real price/quantity with a few
// wheel notches, with no error, warning, or visual cue that it happened.
//
// The fix: the instant a wheel event fires with its target being the
// currently-focused number field, blur it immediately — before the
// browser applies its default "scroll = spinner" behavior. Once focus is
// gone, that same scroll gesture just falls through and scrolls the page
// normally, exactly like it would over any other element. No value is
// touched, and normal scrolling isn't interrupted.
export function useNumberInputScrollGuard() {
  useEffect(() => {
    function handleWheel(e: WheelEvent) {
      const active = document.activeElement as HTMLElement | null;
      if (!active || active.tagName !== 'INPUT') return;
      if ((active as HTMLInputElement).type !== 'number') return;
      // Only when the wheel event actually happened over THIS field — a
      // scroll elsewhere on the page while some unrelated number field
      // still happens to be focused shouldn't lose that focus for no reason.
      if (e.target === active) {
        active.blur();
      }
    }

    // passive: true — this never calls preventDefault, so it doesn't cost
    // scroll performance; it just quietly drops focus first.
    document.addEventListener('wheel', handleWheel, { passive: true });
    return () => document.removeEventListener('wheel', handleWheel);
  }, []);
}