import { useEffect } from 'react';

// Every text/number/date/etc input, select, and textarea in the app — the
// generic set of things a person tabs through to fill in a form. Excludes
// checkboxes/radios/buttons, which have their own native meaning for
// arrow keys (radio-group cycling) that shouldn't be hijacked.
const FIELD_SELECTOR =
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="file"]):not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled]):not([readonly])';

type Direction = 'up' | 'down' | 'left' | 'right';

function isVisible(el: HTMLElement): boolean {
  return Boolean(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

function centerOf(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// Fields are scoped to the open modal, if there is one — so arrow keys
// inside a dialog never jump out to fields sitting behind it on the page.
// With no modal open (e.g. a page's own search box, the Login screen),
// the whole document is fair game.
function fieldsInScope(active: HTMLElement): HTMLElement[] {
  const scope = active.closest('.modal') ?? document.body;
  return Array.from(scope.querySelectorAll<HTMLElement>(FIELD_SELECTOR)).filter(
    (el) => el !== active && isVisible(el)
  );
}

// Picks whichever candidate field is physically closest in the given
// direction, weighting how far "off-axis" it is more heavily than raw
// distance — so moving down a column of fields doesn't accidentally jump
// sideways to a nearer field in a neighboring column.
function pickNextField(active: HTMLElement, direction: Direction): HTMLElement | null {
  const a = centerOf(active);
  let best: HTMLElement | null = null;
  let bestScore = Infinity;

  for (const el of fieldsInScope(active)) {
    const c = centerOf(el);
    const dx = c.x - a.x;
    const dy = c.y - a.y;

    let primary: number;
    let cross: number;

    if (direction === 'down') {
      if (dy <= 4) continue;
      primary = dy;
      cross = Math.abs(dx);
    } else if (direction === 'up') {
      if (dy >= -4) continue;
      primary = -dy;
      cross = Math.abs(dx);
    } else if (direction === 'right') {
      if (dx <= 4) continue;
      primary = dx;
      cross = Math.abs(dy);
    } else {
      if (dx >= -4) continue;
      primary = -dx;
      cross = Math.abs(dy);
    }

    const score = primary + cross * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }

  return best;
}

// Lets arrow keys move between any fields in the app — every direction,
// on every field type. This deliberately replaces the browser's native
// per-field arrow behavior everywhere it would otherwise apply:
//   - number inputs: Up/Down no longer increments/decrements the value
//     (the mouse-click spinner arrows inside the box still work fine)
//   - select dropdowns: Up/Down no longer cycles the selected option —
//     open the dropdown first (click, or Enter/Space), and arrows work
//     normally again while it's actually open
//   - text inputs: arrow keys no longer move the text cursor at all —
//     click where you want the cursor, or use Home/End
// This is a deliberate, app-wide tradeoff traded for field-to-field
// jumping in every direction, not an oversight.
export function useArrowFieldNavigation() {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const direction: Direction | null =
        e.key === 'ArrowUp' ? 'up' : e.key === 'ArrowDown' ? 'down' : e.key === 'ArrowLeft' ? 'left' : e.key === 'ArrowRight' ? 'right' : null;
      if (!direction) return;

      const active = document.activeElement as HTMLElement | null;
      if (!active) return;

      const tag = active.tagName;
      if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') return;

      const type = (active as HTMLInputElement).type;
      if (tag === 'INPUT' && ['checkbox', 'radio', 'button', 'submit', 'file', 'hidden'].includes(type)) return;

      // Always intercept — even when there's nowhere to go — so native
      // cursor movement / number spinner / select cycling never sneaks
      // through inconsistently depending on field position.
      e.preventDefault();

      const next = pickNextField(active, direction);
      if (next) next.focus();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);
}