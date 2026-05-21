import DataManagement from "../components/DataManagement";

export default function Settings({ settings }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Settings
        </p>
        <h2 className="text-3xl font-bold text-slate-950">
          Budget planner settings
        </h2>
      </div>

      <section className="max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-sm font-medium text-slate-500">Currency</dt>
            <dd className="mt-1 text-lg font-semibold text-slate-950">
              {settings.currency}
            </dd>
          </div>

          <div>
            <dt className="text-sm font-medium text-slate-500">
              Pay Period Anchor Date
            </dt>
            <dd className="mt-1 text-lg font-semibold text-slate-950">
              {settings.payPeriodAnchorDate}
            </dd>
          </div>

          <div>
            <dt className="text-sm font-medium text-slate-500">
              Pay Frequency
            </dt>
            <dd className="mt-1 text-lg font-semibold text-slate-950">
              Every {settings.payFrequencyDays} days
            </dd>
          </div>

          <div>
            <dt className="text-sm font-medium text-slate-500">
              Projection Range
            </dt>
            <dd className="mt-1 text-lg font-semibold text-slate-950">
              {settings.projectionMonths} months
            </dd>
          </div>

          <div className="col-span-2">
            <dt className="text-sm font-medium text-slate-500">
              Monthly Bill Assignment Rule
            </dt>
            <dd className="mt-1 text-lg font-semibold text-slate-950">
              Previous pay period before due date
            </dd>
          </div>
        </dl>
      </section>

      <DataManagement />
    </div>
  );
}