const manageItems = [
  {
    id: 'scheduled-items',
    title: 'Scheduled Items',
    description:
      'Set up recurring income, bills, savings transfers, and planned payments.',
  },
  {
    id: 'accounts',
    title: 'Accounts',
    description: 'Set starting balances and make account corrections.',
  },
  {
    id: 'savings-buckets',
    title: 'Savings Buckets',
    description: 'Track what your savings money is assigned to.',
  },
  {
    id: 'budgets',
    title: 'Budgets',
    description: 'Set monthly category limits and track spending.',
  },
  {
    id: 'categories',
    title: 'Categories',
    description: 'Organize income, bills, expenses, transfers, and reports.',
  },
];

export default function Manage({ onOpenPage }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Manage
        </p>
        <h2 className="text-2xl font-bold text-slate-950 sm:text-3xl">
          Setup and organization
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Keep everyday navigation focused while still giving you quick access
          to setup pages, budgets, savings buckets, and categories.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {manageItems.map((item) => (
          <section
            key={item.id}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h3 className="text-lg font-bold text-slate-950">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {item.description}
            </p>
            <button
              type="button"
              onClick={() => onOpenPage(item.id)}
              className="mt-4 min-h-11 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Open {item.title}
            </button>
          </section>
        ))}
      </div>
    </div>
  );
}
