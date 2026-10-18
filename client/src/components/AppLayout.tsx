import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { BrandMark } from '../ui/BrandMark';
import { Icon } from '../ui/primitives';
import type { IconName } from '../ui/primitives';
import { initialsOf, roleLabel } from '../lib/format';
import { useTheme } from '../theme/useTheme';
import type { User } from '../api/types';

/**
 * Name + a secondary line (the role). The role is skipped when it is the same
 * text as the name (e.g. an account literally named «مدير النظام»), falling
 * back to the username so nothing is shown twice.
 */
const identityOf = (user: Pick<User, 'fullName' | 'role' | 'username'> | null) => {
  if (!user) return { name: '', role: '', detail: '' };
  const role = roleLabel[user.role];
  const sameAsName = role.trim() === user.fullName.trim();
  return {
    name: user.fullName,
    role: sameAsName ? user.username : role,
    detail: sameAsName ? user.username : `${role} · ${user.username}`,
  };
};

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

const dashboardNav: NavItem = {
  to: '/dashboard',
  label: 'لوحة التحكم',
  icon: 'dashboard',
  end: true,
};

const operationsNav: NavItem[] = [
  { to: '/delegates', label: 'المناديب', icon: 'users' },
  { to: '/trips', label: 'الرحلات', icon: 'bus' },
  { to: '/pilgrims', label: 'المعتمرون', icon: 'pilgrim' },
];

const financeNav: NavItem[] = [
  { to: '/accounts', label: 'حسابات المناديب', icon: 'file' },
  { to: '/payments', label: 'سجل الدفعات', icon: 'wallet' },
];

// Low-level movement log, manager only (also enforced by the API).
const managerFinanceNav: NavItem[] = [
  { to: '/finance/movements', label: 'سجل الحركات المالية', icon: 'ledger' },
];

const adminNav: NavItem[] = [
  { to: '/reports', label: 'التقارير', icon: 'report' },
  { to: '/finance/adjustments', label: 'التسويات والاستردادات', icon: 'refresh' },
  { to: '/users', label: 'المستخدمون', icon: 'settings' },
  { to: '/audit', label: 'سجل التدقيق', icon: 'shield' },
];

const titleFor = (pathname: string): string => {
  const all = [dashboardNav, ...operationsNav, ...financeNav, ...managerFinanceNav, ...adminNav];
  const match = all
    .filter((item) => pathname === item.to || pathname.startsWith(`${item.to}/`))
    .sort((a, b) => b.to.length - a.to.length)[0];
  return match?.label ?? 'الحساب';
};

export const AppLayout = () => {
  const { user, logout, isManager } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const identity = identityOf(user);
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [lastPath, setLastPath] = useState(location.pathname);
  const menuRef = useRef<HTMLDivElement>(null);

  if (lastPath !== location.pathname) {
    setLastPath(location.pathname);
    setDrawerOpen(false);
    setMenuOpen(false);
  }

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const visibleAdmin = isManager
    ? adminNav
    : adminNav.filter((item) => item.to === '/reports');

  const sections: NavSection[] = [
    { items: [dashboardNav] },
    { label: 'العمليات', items: operationsNav },
    { label: 'المالية', items: isManager ? [...financeNav, ...managerFinanceNav] : financeNav },
    { label: 'التقارير والإدارة', items: visibleAdmin },
  ];

  const renderItems = (items: NavItem[]) =>
    items.map((item) => (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
      >
        <Icon name={item.icon} size={18} />
        <span>{item.label}</span>
      </NavLink>
    ));

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app-shell">
      {drawerOpen ? (
        <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />
      ) : null}

      <aside className={`sidebar${drawerOpen ? ' open' : ''}`}>
        <div className="sidebar-brand">
          <BrandMark />
          <div>
            <div className="brand-name">سكاي توب</div>
            <div className="brand-sub">نظام الإدارة الداخلية</div>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="التنقل الرئيسي">
          {sections.map((section) => (
            <div key={section.label ?? 'root'}>
              {section.label ? <div className="nav-section">{section.label}</div> : null}
              {renderItems(section.items)}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <span className="avatar">{user ? initialsOf(user.fullName) : ''}</span>
            <div className="user-meta">
              <div className="user-name">{identity.name}</div>
              <div className="user-role">{identity.detail}</div>
            </div>
            <button
              type="button"
              className="icon-btn"
              title="تسجيل الخروج"
              aria-label="تسجيل الخروج"
              onClick={() => void handleLogout()}
            >
              <Icon name="logout" size={17} />
            </button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button
            type="button"
            className="icon-btn menu-btn"
            aria-label="فتح القائمة"
            onClick={() => setDrawerOpen((open) => !open)}
          >
            <Icon name="menu" size={20} />
          </button>

          <div className="topbar-title">{titleFor(location.pathname)}</div>

          <div className="topbar-actions">
            <button
              type="button"
              className="icon-btn"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}
              aria-label={theme === 'dark' ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن'}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
            </button>

            <div className="user-menu-anchor" ref={menuRef}>
              <button
                type="button"
                className="user-chip"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <span className="avatar sm">{user ? initialsOf(user.fullName) : ''}</span>
                <span className="user-lines">
                  <span className="user-name">{identity.name}</span>
                  <span className="user-sub">{identity.role}</span>
                </span>
                <Icon name="chevron-down" size={15} />
              </button>

              {menuOpen ? (
                <div className="dropdown" role="menu">
                  <div className="dropdown-head">
                    <div className="name">{identity.name}</div>
                    <div className="meta">{identity.detail}</div>
                  </div>
                  <button
                    type="button"
                    className="dropdown-item"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      navigate('/profile');
                    }}
                  >
                    <Icon name="user" size={16} /> الحساب الشخصي
                  </button>
                  <button
                    type="button"
                    className="dropdown-item danger"
                    role="menuitem"
                    onClick={() => void handleLogout()}
                  >
                    <Icon name="logout" size={16} /> تسجيل الخروج
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <Outlet />
      </div>
    </div>
  );
};
