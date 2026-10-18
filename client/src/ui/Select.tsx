import { Children, isValidElement, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement, ReactNode, SelectHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { matchesArabic } from '../lib/arabicSearch';
import { FieldContext } from './fieldContext';

/**
 * The one dropdown of the app (used through `SelectInput`).
 *
 * Call sites keep the familiar API — `<SelectInput value onChange>` with
 * `<option>` children. A visually hidden native <select> stays the value
 * carrier: choosing an option sets its value and dispatches a real `change`
 * event, so every existing onChange handler, form and payload behaves exactly
 * as before. The visible part is a combobox button + a listbox menu that is
 * portalled to <body> (never clipped by cards / tables / modals) and opens
 * upward when there is not enough room below.
 *
 * Long lists (more than SEARCH_THRESHOLD options) get a search box with
 * Arabic-friendly matching; `searchable` can force it on or off.
 */

const SEARCH_THRESHOLD = 10;
const MENU_MAX_HEIGHT = 320;
const MENU_MIN_WIDTH = 220;
const GAP = 4;

interface Option {
  value: string;
  label: string;
  disabled: boolean;
}

const textOf = (node: ReactNode): string => {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
};

const collectOptions = (children: ReactNode): Option[] => {
  const out: Option[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const element = child as ReactElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>;
    if (element.type === 'option') {
      const label = textOf(element.props.children).replace(/\s+/g, ' ').trim();
      out.push({ value: String(element.props.value ?? label), label, disabled: Boolean(element.props.disabled) });
    } else if (element.props.children) {
      out.push(...collectOptions(element.props.children)); // fragments / optgroups
    }
  });
  return out;
};

type Placement = { top: number; left: number; width: number; maxHeight: number; up: boolean };

export const Select = ({
  invalid,
  searchable,
  children,
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean; searchable?: boolean }) => {
  const field = useContext(FieldContext);
  const id = useId();
  const listId = `${id}-list`;
  const nativeRef = useRef<HTMLSelectElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const [place, setPlace] = useState<Placement | null>(null);

  const options = useMemo(() => collectOptions(children), [children]);
  const value = props.value === undefined || props.value === null ? '' : String(props.value);
  const selected = options.find((o) => o.value === value);
  const placeholder = options.find((o) => o.value === '');
  const realCount = options.filter((o) => o.value !== '').length;
  const withSearch = searchable ?? realCount > SEARCH_THRESHOLD;
  const visible = useMemo(
    () => (withSearch && query.trim() ? options.filter((o) => o.value !== '' && matchesArabic(o.label, query)) : options),
    [options, query, withSearch],
  );
  const isInvalid = invalid || Boolean(field?.invalid);
  const disabled = Boolean(props.disabled);

  const place_ = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const width = Math.min(Math.max(r.width, MENU_MIN_WIDTH), vw - 16);
    // RTL: align the menu's right edge with the control, kept inside the screen.
    const left = Math.min(Math.max(8, r.right - width), vw - width - 8);
    const below = vh - r.bottom - GAP - 8;
    const above = r.top - GAP - 8;
    const up = below < Math.min(MENU_MAX_HEIGHT, 240) && above > below;
    const maxHeight = Math.max(140, Math.min(MENU_MAX_HEIGHT, up ? above : below));
    setPlace({ top: up ? r.top - GAP : r.bottom + GAP, left, width, maxHeight, up });
  }, []);

  const close = useCallback((focusTrigger: boolean) => {
    setOpen(false);
    setQuery('');
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

  const openMenu = () => {
    if (disabled) return;
    place_();
    setQuery('');
    const index = options.findIndex((o) => o.value === value && !o.disabled);
    setActive(index >= 0 ? index : options.findIndex((o) => !o.disabled));
    setOpen(true);
  };

  /** Writes through the hidden native select so the caller's onChange runs as before. */
  const choose = (option: Option | undefined) => {
    if (!option || option.disabled) return;
    const native = nativeRef.current;
    if (native && native.value !== option.value) {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(native, option.value);
      native.dispatchEvent(new Event('change', { bubbles: true }));
    }
    close(true);
  };

  // Keep the menu attached to the control while scrolling / resizing.
  useLayoutEffect(() => {
    if (!open) return undefined;
    const update = () => place_();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, place_]);

  // Close on outside press.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open, close]);

  // Keyboard focus: the search box on long lists, otherwise the control itself.
  useEffect(() => {
    if (!open) return;
    if (withSearch) searchRef.current?.focus();
    else triggerRef.current?.focus();
  }, [open, withSearch]);

  // Escape closes only the menu, wherever focus is: handled on the document in
  // the capture phase, before e.g. a surrounding modal's Escape listener.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      close(true);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, close]);

  // Keep the active option visible.
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const move = (step: number) => {
    if (!visible.length) return;
    let i = visible.findIndex((o) => o === options[active]);
    for (let n = 0; n < visible.length; n += 1) {
      i = (i + step + visible.length) % visible.length;
      if (!visible[i]!.disabled) break;
    }
    setActive(options.indexOf(visible[i]!));
  };

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        openMenu();
      } else if (event.key.length === 1 && !withSearch) {
        // Type-ahead on short lists: jump to the first option starting with the letter.
        const match = options.find((o) => !o.disabled && o.value !== '' && o.label.startsWith(event.key));
        if (match) choose(match);
      }
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'Home':
      case 'End':
        if (event.currentTarget === searchRef.current) break;
        event.preventDefault();
        setActive(options.indexOf((event.key === 'Home' ? visible : [...visible].reverse()).find((o) => !o.disabled)!));
        break;
      case 'Enter':
        event.preventDefault();
        choose(options[active] && visible.includes(options[active]!) ? options[active] : visible.find((o) => !o.disabled));
        break;
      case 'Escape':
        // Close only the menu (not a surrounding modal).
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case 'Tab':
        close(false);
        break;
      default:
    }
  };

  return (
    <div className={`select-wrap${className ? ` ${className}` : ''}`}>
      <select
        {...props}
        ref={nativeRef}
        className="select-native"
        aria-hidden="true"
        tabIndex={-1}
      >
        {children}
      </select>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        className={`select select-trigger${open ? ' is-open' : ''}${value === '' ? ' is-placeholder' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={field?.labelId}
        aria-label={field ? undefined : props['aria-label']}
        aria-invalid={isInvalid || undefined}
        aria-activedescendant={open && active >= 0 ? `${id}-opt-${active}` : undefined}
        disabled={disabled}
        title={selected?.label}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onKeyDown}
      >
        <span className="select-value">{selected?.label ?? placeholder?.label ?? ''}</span>
        <svg className="select-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && place
        ? createPortal(
            <div
              ref={menuRef}
              className={`select-menu${place.up ? ' is-up' : ''}`}
              style={{
                top: place.up ? undefined : place.top,
                bottom: place.up ? window.innerHeight - place.top : undefined,
                left: place.left,
                width: place.width,
                maxHeight: place.maxHeight,
              }}
            >
              {withSearch ? (
                <div className="select-search">
                  <input
                    ref={searchRef}
                    className="input input-search"
                    value={query}
                    placeholder="بحث..."
                    aria-label="بحث في القائمة"
                    aria-controls={listId}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setActive(-1);
                    }}
                    onKeyDown={onKeyDown}
                  />
                </div>
              ) : null}
              <ul id={listId} role="listbox" className="select-options" aria-labelledby={field?.labelId}>
                {visible.length === 0 ? <li className="select-empty">لا توجد نتائج</li> : null}
                {visible.map((option) => {
                  const index = options.indexOf(option);
                  const isSelected = option.value === value;
                  return (
                    <li
                      key={`${option.value}-${index}`}
                      id={`${id}-opt-${index}`}
                      data-index={index}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={option.disabled || undefined}
                      className={`select-option${index === active ? ' is-active' : ''}${isSelected ? ' is-selected' : ''}${option.value === '' ? ' is-placeholder' : ''}`}
                      onMouseEnter={() => setActive(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => choose(option)}
                    >
                      <span>{option.label}</span>
                      {isSelected ? (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="m20 6-11 11-5-5" />
                        </svg>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
};
