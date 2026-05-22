const appAreas = [
  ['Dashboard', 'Review cash-flow summaries, alerts, and projection charts.'],
  ['Pay Period Planner', 'Edit projected and actual amounts by pay period.'],
  ['Transactions', 'Review derived income, expenses, transfers, and adjustments.'],
  ['Scheduled Items', 'Manage recurring income, bills, subscriptions, savings, and debt payments.'],
  ['Accounts', 'Track local account balances and manual account adjustments.'],
  ['Savings Buckets', 'Plan savings goals and record bucket transfer activity.'],
  ['Budgets', 'Set monthly category targets and monitor spending room.'],
  ['Categories', 'Manage category names used by scheduled items, budgets, and reports.'],
  ['Reports', 'Review filtered summaries, charts, trends, print view, and CSV exports.'],
  ['Settings', 'Edit planner settings, export backups, import backups, repair data, and reset the app.'],
];

const faqs = [
  {
    question: 'Can other users see my data?',
    answer:
      'No account or cloud sync is included. Data is stored locally in this browser/device unless you export and share a backup file.',
  },
  {
    question: 'What happens if I clear browser data?',
    answer:
      'Clearing browser or site data can remove Budget Planner data. Export a backup first if you want to keep it.',
  },
  {
    question: 'How do I start with a blank app?',
    answer:
      'Open Settings, go to Data Management, and use Factory Reset to Empty App. It requires typing DELETE before anything is cleared.',
  },
  {
    question: 'How do I restore the demo?',
    answer:
      'Open Settings, go to Data Management, and use Reset to Demo Data. It requires typing DEMO.',
  },
  {
    question: 'How do I move data to another device?',
    answer:
      'Export a backup JSON file from the old device, move that file to the new device, then import it from Settings.',
  },
  {
    question: 'Does the app connect to my bank?',
    answer:
      'No. There are no bank connections, logins, cloud sync, receipt scanning, or AI categorization in this phase.',
  },
  {
    question: 'Can I use it offline?',
    answer:
      'After the app has loaded once, the PWA app shell can load offline where supported. Your local data stays on the device/browser profile.',
  },
];

function HelpCard({ title, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h3 className="text-lg font-bold text-slate-950">{title}</h3>
      <div className="mt-3 space-y-3 text-sm leading-6 text-slate-600">
        {children}
      </div>
    </section>
  );
}

export default function Help() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Help
        </p>
        <h2 className="text-2xl font-bold text-slate-950 sm:text-3xl">
          Help Guide
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          A quick guide to starting with demo data, setting up your own planner,
          protecting local data, and using the main app areas.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <HelpCard title="Getting Started">
          <p>
            Budget Planner opens with fictional demo data so you can explore the
            app before setting up your own records.
          </p>
          <p>
            You can explore the demo, start empty from Settings, or import a
            backup. Changes are saved locally in this browser/device.
          </p>
        </HelpCard>

        <HelpCard title="Local Data and Backups">
          <p>
            Data is stored in browser-managed local storage. Clearing
            browser/site data, switching browsers, switching devices, or
            uninstalling the PWA can remove local records.
          </p>
          <p>
            Export backups regularly, especially before clearing data,
            importing another backup, changing devices, or uninstalling the PWA.
            A future desktop version is planned with app-managed local database
            storage.
          </p>
        </HelpCard>

        <HelpCard title="Backup Reminders">
          <p>
            The app tracks when you last exported a backup and recommends a new
            one if no backup exists or the last backup is older than 30 days.
          </p>
          <p>
            This reminder does not mean data has been uploaded anywhere.
            Backups are downloaded files that you need to store somewhere safe.
          </p>
        </HelpCard>

        <HelpCard title="Demo Data">
          <p>
            Demo records are fictional and show accounts, income, bills, savings
            buckets, budgets, transactions, reports, multi-line notes, and
            alerts.
          </p>
          <p>
            To restore the public demo, open Settings, go to Data Management,
            and choose Reset to Demo Data.
          </p>
        </HelpCard>

        <HelpCard title="Starting Fresh">
          <p>
            To clear the demo and begin with a blank planner, open Settings and
            use Factory Reset to Empty App.
          </p>
          <p>
            Empty mode keeps required defaults like planner settings and base
            categories, but clears demo/user accounts, scheduled items, budgets,
            savings buckets, adjustments, and planner entries.
          </p>
        </HelpCard>

        <HelpCard title="Importing a Backup">
          <p>
            Importing a backup replaces current local data. Export the current
            app data first if you may need to keep it.
          </p>
          <p>
            After a backup is imported, the app reloads/restores the imported
            settings and records.
          </p>
        </HelpCard>

        <HelpCard title="PWA Install">
          <p>
            Supported desktop browsers may show an install icon in the address
            bar. On mobile, use the browser menu and choose Add to Home Screen
            or Install App.
          </p>
          <p>
            Exact wording depends on browser and device. Installed PWA data is
            still browser-managed, so backups remain important.
          </p>
        </HelpCard>
      </div>

      <HelpCard title="Using the App">
        <div className="grid gap-3 md:grid-cols-2">
          {appAreas.map(([title, description]) => (
            <div key={title} className="rounded-xl border border-slate-200 p-3">
              <p className="font-semibold text-slate-950">{title}</p>
              <p className="mt-1 text-sm text-slate-600">{description}</p>
            </div>
          ))}
        </div>
      </HelpCard>

      <HelpCard title="Common Questions">
        <div className="grid gap-3">
          {faqs.map((item) => (
            <div key={item.question} className="rounded-xl bg-slate-50 p-3">
              <p className="font-semibold text-slate-950">{item.question}</p>
              <p className="mt-1 text-sm text-slate-600">{item.answer}</p>
            </div>
          ))}
        </div>
      </HelpCard>
    </div>
  );
}
