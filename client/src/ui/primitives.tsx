import type {
  ReactNode,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

export type IconName =
  | 'dashboard'
  | 'users'
  | 'bus'
  | 'pilgrim'
  | 'wallet'
  | 'receipt'
  | 'ledger'
  | 'report'
  | 'shield'
  | 'settings'
  | 'search'
  | 'plus'
  | 'close'
  | 'download'
  | 'edit'
  | 'eye'
  | 'trash'
  | 'check'
  | 'alert'
  | 'arrow-right'
  | 'arrow-left'
  | 'refresh'
  | 'file'
  | 'menu'
  | 'sun'
  | 'moon'
  | 'user'
  | 'logout'
  | 'chevron-down'
  | 'check-circle'
  | 'clock'
  | 'lock';

const paths: Record<IconName, string> = {
  dashboard: 'M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  bus: 'M8 6v6m8-6v6M2 12h19.6M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3m12 0a2 2 0 1 0 4 0m-4 0a2 2 0 1 1-4 0m-5-6h2',
  pilgrim: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  wallet: 'M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4m-4 0h4m-4 0a1 1 0 0 0 1 1v6a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V6m16 9a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  receipt: 'M9 14 6 11l3-3m6 3 3-3-3-3M4 22h16a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1Z',
  ledger: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15Z',
  report: 'M3 3v18h18M7 15l3-4 3 3 4-6',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7.5 7.5 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.5 7.5 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.06-.4.1-.8.1-1.2Z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35',
  plus: 'M12 5v14M5 12h14',
  close: 'M18 6 6 18M6 6l12 12',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m4-5 5 5 5-5m-5 5V3',
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z',
  eye: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Zm11 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  trash: 'M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6',
  check: 'm20 6-11 11-5-5',
  alert: 'M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  'arrow-right': 'M5 12h14m-7-7 7 7-7 7',
  'arrow-left': 'M19 12H5m7 7-7-7 7-7',
  refresh: 'M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6',
  menu: 'M3 6h18M3 12h18M3 18h18',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42',
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  'chevron-down': 'm6 9 6 6 6-6',
  'check-circle': 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6v6l4 2',
  lock: 'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2ZM7 11V7a5 5 0 0 1 10 0v4',
};

export const Icon = ({ name, size = 18 }: { name: IconName; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={paths[name]} />
  </svg>
);

export const Spinner = ({ label }: { label?: string }) => (
  <span className="row" style={{ gap: 10 }}>
    <span className="spinner" />
    {label ? <span className="muted small">{label}</span> : null}
  </span>
);

export const LoadingBlock = ({ label = 'جارٍ التحميل...' }: { label?: string }) => (
  <div className="loading-row">
    <Spinner label={label} />
  </div>
);

export const EmptyState = ({
  title,
  description,
  action,
  icon = 'file',
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: IconName;
}) => (
  <div className="empty-state">
    <span className="empty-icon">
      <Icon name={icon} size={24} />
    </span>
    <strong>{title}</strong>
    {description ? <div className="small">{description}</div> : null}
    {action ? <div className="mt-3">{action}</div> : null}
  </div>
);

export const Badge = ({
  children,
  tone = 'default',
  dot,
}: {
  children: ReactNode;
  tone?: 'default' | 'success' | 'danger' | 'warning' | 'info' | 'primary';
  dot?: boolean;
}) => {
  const statusTone = tone === 'success' || tone === 'danger' || tone === 'warning';
  const withDot = dot ?? statusTone;
  return (
    <span className={`badge${tone === 'default' ? '' : ` ${tone}`}${withDot ? '' : ' plain'}`}>
      {children}
    </span>
  );
};

export const Alert = ({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'success' | 'warning' | 'error';
  children: ReactNode;
}) => <div className={`alert ${tone}`}>{children}</div>;

export const Skeleton = ({
  width = '100%',
  height = 14,
  radius,
}: {
  width?: string | number;
  height?: string | number;
  radius?: number;
}) => (
  <div className="skeleton" style={{ width, height, borderRadius: radius }} aria-hidden="true" />
);

export const TableSkeleton = ({ rows = 5 }: { rows?: number }) => (
  <div className="loading-row" style={{ flexDirection: 'column', gap: 12, alignItems: 'stretch' }}>
    {Array.from({ length: rows }, (_, index) => (
      <Skeleton key={index} height={18} width={`${100 - (index % 3) * 8}%`} />
    ))}
  </div>
);

export const StatCard = ({
  label,
  value,
  hint,
  icon,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: IconName;
  tone?: 'default' | 'success' | 'danger' | 'warning' | 'info';
}) => (
  <div className={`stat-card${tone === 'default' ? '' : ` accent-${tone}`}`}>
    <div className="stat-head">
      {icon ? (
        <span className="stat-icon">
          <Icon name={icon} size={18} />
        </span>
      ) : null}
      <span className="label">{label}</span>
    </div>
    <span className="value nums">{value}</span>
    {hint ? <span className="hint">{hint}</span> : null}
  </div>
);

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

export const Tabs = ({
  items,
  active,
  onChange,
}: {
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
}) => (
  <div className="tabs" role="tablist">
    {items.map((item) => (
      <button
        key={item.id}
        type="button"
        role="tab"
        aria-selected={active === item.id}
        className={`tab${active === item.id ? ' active' : ''}`}
        onClick={() => onChange(item.id)}
      >
        {item.label}
        {typeof item.count === 'number' ? <span className="tab-count">{item.count}</span> : null}
      </button>
    ))}
  </div>
);

export const Field = ({
  label,
  required,
  error,
  hint,
  children,
  className = '',
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) => (
  <div className={`field ${className}`}>
    <label>
      {label} {required ? <span className="required">*</span> : null}
    </label>
    {children}
    {error ? <span className="error">{error}</span> : null}
    {!error && hint ? <span className="hint">{hint}</span> : null}
  </div>
);

export const TextInput = ({
  invalid,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) => (
  <input
    {...props}
    className={`input${props.className ? ` ${props.className}` : ''}`}
    aria-invalid={invalid || undefined}
  />
);

export const SelectInput = ({
  invalid,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) => (
  <select
    {...props}
    className={`select${props.className ? ` ${props.className}` : ''}`}
    aria-invalid={invalid || undefined}
  >
    {children}
  </select>
);

export const TextArea = ({
  invalid,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) => (
  <textarea
    {...props}
    className={`textarea${props.className ? ` ${props.className}` : ''}`}
    aria-invalid={invalid || undefined}
  />
);

export const Modal = ({
  title,
  children,
  footer,
  onClose,
  size = 'default',
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  size?: 'default' | 'wide' | 'narrow';
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`modal${size === 'wide' ? ' wide' : size === 'narrow' ? ' narrow' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="إغلاق">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
};

export const PageHeader = ({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) => (
  <div className="page-header">
    <div>
      <h1>{title}</h1>
      {subtitle ? <div className="subtitle">{subtitle}</div> : null}
    </div>
    {actions ? <div className="page-actions">{actions}</div> : null}
  </div>
);

/** Hierarchical location, e.g. المناديب / أحمد محمود / رحلة 26 أكتوبر. */
export const Breadcrumbs = ({ items }: { items: Array<{ label: string; to?: string }> }) => (
  <nav className="breadcrumbs" aria-label="مسار التنقل">
    {items.map((item, index) => (
      <span key={`${item.label}-${index}`} className="crumb">
        {index > 0 ? <span className="sep">/</span> : null}
        {item.to && index < items.length - 1 ? (
          <Link to={item.to}>{item.label}</Link>
        ) : (
          <span aria-current={index === items.length - 1 ? 'page' : undefined}>{item.label}</span>
        )}
      </span>
    ))}
  </nav>
);

export const Pagination = ({
  page,
  pageSize,
  total,
  totalPages,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPage: (page: number) => void;
}) => (
  <div className="pagination">
    <span>
      إجمالي <strong>{total}</strong> سجل — صفحة {page} من {totalPages}
    </span>
    <div className="actions">
      <button
        type="button"
        className="btn secondary sm"
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
      >
        <Icon name="arrow-right" size={14} /> السابق
      </button>
      <select
        className="select page-select"
        value={page}
        onChange={(event) => onPage(Number(event.target.value))}
        aria-label="رقم الصفحة"
      >
        {Array.from({ length: totalPages }, (_, index) => index + 1).map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn secondary sm"
        onClick={() => onPage(page + 1)}
        disabled={page >= totalPages}
      >
        التالي <Icon name="arrow-left" size={14} />
      </button>
      <span className="small">عدد الصفوف: {pageSize}</span>
    </div>
  </div>
);

export const useDebouncedValue = <T,>(value: T, delay = 350): T => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
};
