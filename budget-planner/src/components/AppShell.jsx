import {
  BarChart3,
  CalendarClock,
  CalendarDays,
  Landmark,
  ListChecks,
  LayoutDashboard,
  PiggyBank,
  Settings,
  Tags,
} from 'lucide-react';

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
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <aside className="no-print fixed left-0 top-0 h-screen w-72 border-r border-slate-200 bg-white p-5 print:hidden">
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
                onClick={() => onPageChange(item.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
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

      <main className="app-main ml-72 min-h-screen p-6 print:ml-0 print:p-0">
        {children}
      </main>
    </div>
  );
}
