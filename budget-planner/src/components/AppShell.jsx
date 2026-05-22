import {
  BarChart3,
  CalendarClock,
  CalendarDays,
  Menu,
  Landmark,
  ListChecks,
  LayoutDashboard,
  PiggyBank,
  Settings,
  Tags,
  WalletCards,
  X,
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    id: 'planner',
    label: 'Pay Period Planner',
    icon: CalendarDays,
  },
  {
    id: 'transactions',
    label: 'Transactions',
    icon: ListChecks,
  },
  {
    id: 'scheduled-items',
    label: 'Scheduled Items',
    icon: CalendarClock,
  },
  {
    id: 'accounts',
    label: 'Accounts',
    icon: Landmark,
  },
  {
    id: 'savings-buckets',
    label: 'Savings Buckets',
    icon: PiggyBank,
  },
  {
    id: 'budgets',
    label: 'Budgets',
    icon: WalletCards,
  },
  {
    id: 'categories',
    label: 'Categories',
    icon: Tags,
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: BarChart3,
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
  },
];

export default function AppShell({ currentPage, onPageChange, children }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const currentItem =
    navItems.find((item) => item.id === currentPage) || navItems[0];

  function handlePageChange(pageId) {
    onPageChange(pageId);
    setMobileMenuOpen(false);
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="no-print sticky top-0 z-40 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur print:hidden lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Budget Planner
            </p>
            <h1 className="truncate text-lg font-bold text-slate-950">
              {currentItem.label}
            </h1>
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            Menu
          </button>
        </div>

        {mobileMenuOpen ? (
          <nav className="mt-3 grid max-h-[70vh] gap-2 overflow-y-auto pb-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = currentPage === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handlePageChange(item.id)}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
                    active
                      ? 'bg-slate-950 text-white'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
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

      <aside className="no-print fixed left-0 top-0 hidden h-screen w-72 border-r border-slate-200 bg-white p-5 print:hidden lg:block">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Personal Finance
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">
            Budget Planner
          </h1>
        </div>

        <nav className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = currentPage === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handlePageChange(item.id)}
                className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
                  active
                    ? 'bg-slate-950 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                }`}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="app-main min-h-screen p-4 print:ml-0 print:p-0 sm:p-5 lg:ml-72 lg:p-6">
        {children}
      </main>
    </div>
  );
}
