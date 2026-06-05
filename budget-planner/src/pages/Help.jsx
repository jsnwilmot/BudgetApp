const appAreas = [
  ['Dashboard', 'Use this for the daily cash-flow overview, alerts, and projection chart.'],
  ['Planner', 'Use this for pay-period forecasting and validating planned items.'],
  ['Transactions', 'Review derived income, expenses, transfers, and adjustments.'],
  ['Reports', 'Review filtered summaries, charts, trends, print view, and CSV exports.'],
  ['Manage', 'Open setup pages for scheduled items, accounts, savings buckets, budgets, and categories.'],
  ['Settings', 'Use this for backups, restore, reset, repair, and app preferences.'],
];

const plannerTotals = [
  ['Total Income', 'Income planned or entered for the pay period.'],
  ['Total Expenses', 'True expenses plus transfers to savings, matching cash leaving chequing.'],
  ['Total Transfers to Savings', 'The savings-transfer portion of total expenses.'],
  ['Net Chequing Change', 'Income minus total expenses.'],
  ['Projected Chequing', 'Forecast chequing after planned and actual items.'],
  ['Validated Chequing', 'Chequing based only on confirmed/validated items.'],
  ['Projected Savings', 'Forecast savings after transfers and savings adjustments.'],
];

const bucketBalanceLabels = [
  [
    'Starting Bucket Balance',
    'The amount already assigned to the bucket before projected movement.',
  ],
  [
    'Current Projected Bucket Balance',
    "Starting balance plus planner transfers, transfer records, and adjustments through today's current pay period.",
  ],
  [
    'Current Validated Bucket Balance',
    'The current balance using only validated planner transfers, validated transfer records, and all bucket adjustments.',
  ],
  [
    'Final Projected Bucket Balance',
    'The end-of-projection bucket forecast, including future planned transfers.',
  ],
];

const transferTypes = [
  [
    'To Savings Bucket',
    'Moves money from chequing to savings and increases the selected bucket.',
  ],
  [
    'From Savings Bucket',
    'Moves money from savings back to chequing and decreases the selected bucket.',
  ],
  [
    'Account Transfer',
    'Moves money between your own accounts without changing any bucket.',
  ],
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
      'Clearing browser or site data can remove FinPath data. Export a backup first if you want to keep it.',
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
        <HelpCard title="About FinPath">
          <p>
            FinPath helps you track pay periods, bills, savings buckets,
            transfers, and budgets.
          </p>
          <p className="font-semibold text-slate-950">
            Track smarter. Save better.
          </p>
          <p>
            FinPath is local-first, so your data stays in this browser/device.
            Export backups regularly so you have a recovery file.
          </p>
        </HelpCard>

        <HelpCard title="Getting Started">
          <p>
            FinPath opens with fictional demo data so you can explore the
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
            Export a backup before major updates or before clearing browser
            data. Also export before importing another backup, changing devices,
            or uninstalling the PWA. A future desktop version is planned with
            app-managed local database storage.
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

      <HelpCard title="Backups and Migration">
          <p>
            Export Backup saves a versioned JSON file with your FinPath
            settings, accounts, categories, scheduled items, planner entries,
            savings buckets, transfers, budgets, and local metadata.
          </p>
          <p>
            Import Backup validates the file, shows a preview, and requires
            confirmation before replacing local data on this device.
          </p>
          <p>
            Backup files preserve stable record IDs so relationships can move
            cleanly into a future desktop version with local database storage.
          </p>
        </HelpCard>

        <HelpCard title="Data Health">
          <p>
            Data Health checks your local FinPath records for missing links,
            duplicate IDs, invalid dates, invalid amounts, and transfer risks.
          </p>
          <p>
            Errors should be fixed before relying on reports, backups, or a
            future desktop import. Warnings may affect totals or filtered views.
          </p>
          <p>
            Export a backup before making major changes. The health check does
            not delete records or rewrite IDs.
          </p>
        </HelpCard>

        <HelpCard title="App Updates">
          <p>
            After a user-facing update, FinPath may show a one-time
            What&apos;s New popup with the main changes in plain language.
          </p>
          <p>
            The popup is local to this browser/device and appears once per app
            version. Export a backup after major updates so your local data has
            a recent recovery file.
          </p>
          <p>
            If the installed PWA or browser tab looks stale after an update,
            refresh the app and review the What&apos;s New notes.
          </p>
        </HelpCard>

        <HelpCard title="Stable Web/PWA Release">
          <p>
            FinPath is ready for stable web/PWA daily use while remaining
            local-first. Your data is saved on this browser/device.
          </p>
          <p>
            Export backups regularly, especially before clearing browser data,
            switching devices, importing a backup, or installing a major update.
          </p>
          <p>
            If totals look wrong, run Data Health from Settings. Future desktop
            migration will use exported backups.
          </p>
        </HelpCard>

        <HelpCard title="Splash Screen">
          <p>
            FinPath shows a brief branded splash screen while the app starts.
            It uses the same local data and does not upload anything.
          </p>
          <p>
            The splash screen fades out automatically when the app is ready.
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

        <HelpCard title="Mobile and Tablet Use">
          <p>
            FinPath is designed to work on desktop, tablet, phone-sized screens,
            and installed PWA windows.
          </p>
          <p>
            On smaller screens, some lists appear as stacked cards and wide
            planner/report areas may scroll within their own section for easier
            reading.
          </p>
          <p>
            Your data still stays saved locally on this browser/device.
          </p>
        </HelpCard>
      </div>

      <HelpCard title="Using the App">
        <p>
          Navigation was simplified so daily pages stay at the top level and
          setup pages live under Manage.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {appAreas.map(([title, description]) => (
            <div key={title} className="rounded-xl border border-slate-200 p-3">
              <p className="font-semibold text-slate-950">{title}</p>
              <p className="mt-1 text-sm text-slate-600">{description}</p>
            </div>
          ))}
        </div>
      </HelpCard>

      <HelpCard title="Planner Total Rows">
        <div className="grid gap-3 md:grid-cols-2">
          {plannerTotals.map(([title, description]) => (
            <div key={title} className="rounded-xl border border-slate-200 p-3">
              <p className="font-semibold text-slate-950">{title}</p>
              <p className="mt-1 text-sm text-slate-600">{description}</p>
            </div>
          ))}
        </div>
      </HelpCard>

      <HelpCard title="Savings Bucket Balances">
        <p>
          Savings Buckets separates what is current from what is still a future
          forecast.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {bucketBalanceLabels.map(([title, description]) => (
            <div key={title} className="rounded-xl border border-slate-200 p-3">
              <p className="font-semibold text-slate-950">{title}</p>
              <p className="mt-1 text-sm text-slate-600">{description}</p>
            </div>
          ))}
        </div>
        <p>
          Validated planner transfers appear as read-only Bucket Activity
          because they are derived from planner cells. They are not silently
          converted into transfer records or added to backups as transfers.
        </p>
        <p>
          Manual transfer records are saved account movements that can be
          edited or deleted. If the same savings movement exists as both a
          validated planner transfer and a manual transfer record, both are
          counted and the page shows a warning.
        </p>
      </HelpCard>

      <HelpCard title="Reports">
        <p>
          Reports summarize saved FinPath data from the planner, transactions,
          transfers, savings buckets, budget targets, categories, and
          adjustments.
        </p>
        <p>
          Transfers are shown separately from income and expenses so internal
          account movement does not inflate spending.
        </p>
        <p>
          Savings transfers affect savings movement. Budget reports compare
          category spending against monthly budget targets.
        </p>
      </HelpCard>

      <HelpCard title="Transfers">
        <p>
          Use Add Transfer when money moves between your own accounts. A
          transfer updates account projections and, when a savings bucket is
          selected, updates the bucket projection too.
        </p>
        <p>
          Use manual adjustments for corrections, fees, interest, refunds, or
          unexpected changes that are not money moving between your own
          accounts.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {transferTypes.map(([title, description]) => (
            <div key={title} className="rounded-xl border border-slate-200 p-3">
              <p className="font-semibold text-slate-950">{title}</p>
              <p className="mt-1 text-sm text-slate-600">{description}</p>
            </div>
          ))}
        </div>
        <p>
          Example: move $175 from chequing to savings for Property Taxes, or
          move $1,150 from Deferred Taxes savings back to chequing.
        </p>
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
