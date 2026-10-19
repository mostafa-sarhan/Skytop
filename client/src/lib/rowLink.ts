import type { KeyboardEvent, MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';

/** Controls inside a row keep their own behaviour (no row navigation). */
const INTERACTIVE =
  'a, button, input, select, textarea, label, summary, [role="button"], [role="menuitem"], [role="option"], [data-row-ignore]';

/** True when the event belongs to a control inside the row, not the row. */
const fromControl = (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>): boolean => {
  const target = event.target as Node;
  // React events bubble through portals (e.g. the shared select's menu or a
  // dialog opened from the row): anything not physically inside the row is
  // not a row click.
  if (!event.currentTarget.contains(target)) return true;
  const control = target instanceof Element ? target.closest(INTERACTIVE) : null;
  return Boolean(control && event.currentTarget.contains(control));
};

export interface RowLinkProps {
  className: string;
  tabIndex: number;
  'data-href': string;
  onClick: (event: MouseEvent<HTMLElement>) => void;
  onAuxClick: (event: MouseEvent<HTMLElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

/**
 * Makes table rows / cards open their detail page from anywhere on them:
 *   const rowLink = useRowLink();
 *   <tr {...rowLink(`/trips/${trip.id}`)}>
 * Mouse (Ctrl/⌘/Shift or middle click opens a new tab), Enter / Space while
 * the row itself has focus, and a visible focus ring (`.row-link`). Buttons,
 * links and inputs inside keep working on their own, and selecting text does
 * not navigate. The row keeps its native semantics (tables stay tables); the
 * entity's name link inside remains the screen-reader path.
 */
export const useRowLink = () => {
  const navigate = useNavigate();
  return (to: string, state?: unknown, extraClass = ''): RowLinkProps => ({
    className: `row-link${extraClass ? ` ${extraClass}` : ''}`,
    tabIndex: 0,
    'data-href': to,
    onClick: (event) => {
      if (fromControl(event)) return;
      if (window.getSelection()?.toString()) return;
      if (event.ctrlKey || event.metaKey || event.shiftKey) {
        window.open(to, '_blank', 'noopener');
        return;
      }
      navigate(to, { state });
    },
    onAuxClick: (event) => {
      if (event.button !== 1 || fromControl(event)) return;
      window.open(to, '_blank', 'noopener');
    },
    onKeyDown: (event) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        navigate(to, { state });
      }
    },
  });
};
