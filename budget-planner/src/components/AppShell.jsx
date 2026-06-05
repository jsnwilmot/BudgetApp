import {
  BarChart3,
  CalendarDays,
  CircleHelp,
  Menu,
  ListChecks,
  LayoutDashboard,
  SlidersHorizontal,
  Settings,
  X,
} from 'lucide-react';
import { useState } from 'react';

const managePageIds = [
  'manage',
  'scheduled-items',
  'accounts',
  'savings-buckets',
  'budgets',
  'categories',
];

const pageLabels = {
  dashboard: 'Dashboard',
  planner: 'Planner',
  transactions: 'Transactions',
  reports: 'Reports',
  manage: 'Manage',
  'scheduled-items': 'Scheduled Items',
  accounts: 'Accounts',
  'savings-buckets': 'Savings Buckets',
  budgets: 'Budgets',
  categories: 'Categories',
  settings: 'Settings',
  help: 'Help',
};

const navItems = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    id: 'planner',
    label: 'Planner',
    icon: CalendarDays,
  },
  {
    id: 'transactions',
    label: 'Transactions',
    icon: ListChecks,
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: BarChart3,
  },
  {
    id: 'manage',
    label: 'Manage',
    icon: SlidersHorizontal,
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
  },
  {
    id: 'help',
    label: 'Help',
    icon: CircleHelp,
  },
];

const brandLogo = `${import.meta.env.BASE_URL}brand/finpath-logo-horizontal.png`;

export default function AppShell({ currentPage, onPageChange, children }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const currentItem =
    navItems.find((item) => item.id === currentPage) || {
      label: pageLabels[currentPage] || 'Dashboard',
    };

  function handlePageChange(pageId) {
    onPageChange(pageId);
    setMobileMenuOpen(false);
  }

  function isNavItemActive(itemId) {
    if (itemId === 'manage') {
      return managePageIds.includes(currentPage);
    }

    return currentPage === itemId;
  }

  return (
    <div className="min-h-screen bg-[var(--color-finpath-white)] text-slate-900">
      <header className="no-print sticky top-0 z-40 border-b border-[var(--color-finpath-surface)] bg-[var(--color-finpath-navy)] px-3 py-3 shadow-sm print:hidden sm:px-4 lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src={brandLogo}
              alt="FinPath"
              className="h-9 w-auto max-w-[108px] shrink-0 rounded-sm bg-white px-2 py-1 sm:h-10 sm:max-w-[132px]"
            />
            <h1 className="min-w-0 truncate text-base font-bold text-white sm:text-lg">
              {currentItem.label}
            </h1>
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-[var(--color-finpath-teal)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--color-finpath-surface)]"
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            Menu
          </button>
        </div>

        {mobileMenuOpen ? (
          <nav className="mt-3 grid max-h-[70vh] gap-2 overflow-y-auto pb-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isNavItemActive(item.id);

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handlePageChange(item.id)}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
                    active
                      ? 'bg-[var(--color-finpath-teal)] text-[var(--color-finpath-ink)]'
                      : 'text-white hover:bg-[var(--color-finpath-surface)]'
                  }`}
                >
                  <Icon size={18} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        ) : null}
      </header>

      <aside className="no-print fixed left-0 top-0 hidden h-screen w-72 border-r border-[var(--color-finpath-surface)] bg-[var(--color-finpath-navy)] p-5 print:hidden lg:block">
        <div className="mb-8">
          <img
            src={brandLogo}
            alt="FinPath"
            className="w-full rounded-xl bg-white px-3 py-3"
          />
          <p className="mt-3 text-sm font-semibold text-[var(--color-finpath-mint)]">
            Track smarter. Save better.
          </p>
          <p className="mt-1 text-xs text-[var(--color-finpath-muted)]">
            By Rose &amp; Paw Digital Designs
          </p>
        </div>

        <nav className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isNavItemActive(item.id);

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handlePageChange(item.id)}
                className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
                  active
                    ? 'bg-[var(--color-finpath-teal)] text-[var(--color-finpath-ink)]'
                    : 'text-[var(--color-finpath-muted)] hover:bg-[var(--color-finpath-surface)] hover:text-white'
                }`}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="app-main min-h-screen p-3 print:ml-0 print:p-0 sm:p-5 lg:ml-72 lg:p-6">
        {children}
      </main>
    </div>
  );
}
