import { formatCurrency } from '../logic/projectionLogic';

function getRowClass(type) {
  if (type === 'income') return 'bg-emerald-50';
  if (type === 'expense') return 'bg-blue-50';
  if (type === 'transfer') return 'bg-slate-50';
  if (type === 'balance') return 'bg-orange-50 font-bold';
  if (type === 'total') return 'bg-white font-bold';
  return 'bg-white';
}

function getAmountClass(value) {
  if (value < 0) return 'text-red-600 font-semibold';
  if (value > 0) return 'text-slate-950';
  return 'text-slate-300';
}

function PlannerRow({ row, payPeriods }) {
  return (
    <tr className={getRowClass(row.type)}>
      <th className="sticky left-0 z-10 min-w-64 border border-slate-200 bg-inherit px-3 py-2 text-left text-sm">
        {row.name}
      </th>

      {payPeriods.map((period) => {
        const amount = row.amountsByPeriod[period.date] || 0;

        return (
          <td
            key={period.date}
            className={`min-w-32 border border-slate-200 px-3 py-2 text-right text-sm ${getAmountClass(amount)}`}
          >
            {amount === 0 ? '—' : formatCurrency(amount)}
          </td>
        );
      })}
    </tr>
  );
}

export default function Planner({ plannerData }) {
  const incomeRows = plannerData.rows.filter((row) => row.type === 'income');
  const expenseRows = plannerData.rows.filter((row) => row.type === 'expense');
  const transferRows = plannerData.rows.filter((row) => row.type === 'transfer');

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Pay Period Planner
        </p>
        <h2 className="text-3xl font-bold text-slate-950">
          Biweekly budget grid
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Planned values are generated from schedules. Editing and validation comes in the next phase.
        </p>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 min-w-64 border border-slate-200 bg-slate-900 px-3 py-3 text-left text-sm font-bold text-white">
                  Item
                </th>

                {plannerData.payPeriods.map((period) => (
                  <th
                    key={period.date}
                    className="sticky top-0 z-10 min-w-32 border border-slate-200 bg-slate-900 px-3 py-3 text-right text-sm font-bold text-white"
                  >
                    {period.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              <tr>
                <td
                  colSpan={plannerData.payPeriods.length + 1}
                  className="border border-slate-200 bg-emerald-100 px-3 py-2 text-sm font-bold text-emerald-950"
                >
                  Income
                </td>
              </tr>
              {incomeRows.map((row) => (
                <PlannerRow
                  key={row.id}
                  row={row}
                  payPeriods={plannerData.payPeriods}
                />
              ))}

              <tr>
                <td
                  colSpan={plannerData.payPeriods.length + 1}
                  className="border border-slate-200 bg-blue-100 px-3 py-2 text-sm font-bold text-blue-950"
                >
                  Expenses
                </td>
              </tr>
              {expenseRows.map((row) => (
                <PlannerRow
                  key={row.id}
                  row={row}
                  payPeriods={plannerData.payPeriods}
                />
              ))}

              <tr>
                <td
                  colSpan={plannerData.payPeriods.length + 1}
                  className="border border-slate-200 bg-slate-200 px-3 py-2 text-sm font-bold text-slate-950"
                >
                  Transfers to Savings
                </td>
              </tr>
              {transferRows.map((row) => (
                <PlannerRow
                  key={row.id}
                  row={row}
                  payPeriods={plannerData.payPeriods}
                />
              ))}

              <tr>
                <td
                  colSpan={plannerData.payPeriods.length + 1}
                  className="border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-950"
                >
                  Totals and Account Projection
                </td>
              </tr>
              {plannerData.projectionRows.map((row) => (
                <PlannerRow
                  key={row.id}
                  row={row}
                  payPeriods={plannerData.payPeriods}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}