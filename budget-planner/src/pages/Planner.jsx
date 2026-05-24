import { useEffect, useRef } from 'react';
import { CheckCircle2, ListChecks, MessageSquareText, Pencil } from 'lucide-react';
import AlertList from '../components/AlertList';
import { getEntryKey, formatCurrency } from '../logic/projectionLogic';

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

function getTodayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function getCurrentPayPeriodIndex(payPeriods) {
  const today = getTodayDateKey();

  const currentIndex = payPeriods.findIndex((period, index) => {
    const nextPeriod = payPeriods[index + 1];

    return period.date <= today && (!nextPeriod || today < nextPeriod.date);
  });

  if (currentIndex >= 0) {
    return currentIndex;
  }

  return payPeriods.findIndex((period) => period.date >= today);
}

function PlannerRow({
  row,
  payPeriods,
  plannerEntries,
  currency,
  onCellClick,
}) {
  const editable = ['income', 'expense', 'transfer'].includes(row.type);

  return (
    <tr className={getRowClass(row.type)}>
      <th className="sticky left-0 z-30 min-w-56 border border-slate-200 bg-inherit px-3 py-2 text-left text-sm">
        {row.name}
      </th>

      {payPeriods.map((period) => {
        const amount = row.amountsByPeriod[period.date] || 0;
        const plannedAmount = row.plannedByPeriod?.[period.date] || 0;
        const entryKey = getEntryKey(row.id, period.date);
        const entry = plannerEntries[entryKey];

        const changed = Boolean(entry?.useActual);
        const validated = Boolean(entry?.validated);
        const hasNote = Boolean(entry?.notes?.trim());
        const hasLineItems = Boolean(entry?.lineItems?.length);
        const canEdit = editable;

        return (
          <td
            key={period.date}
            className={`min-w-36 border border-slate-200 px-2 py-2 text-right text-sm ${getAmountClass(amount)}`}
          >
            {canEdit ? (
              <button
                type="button"
                onClick={() =>
                  onCellClick({
                    row,
                    period,
                    entryKey,
                    plannedAmount,
                    effectiveAmount: amount,
                  })
                }
                className="group flex w-full items-center justify-end gap-2 rounded-lg px-2 py-1 hover:bg-white"
                title={hasNote ? entry.notes : 'Edit planned amount'}
              >
                <span>
                  {amount === 0 ? '—' : formatCurrency(amount, currency)}
                </span>

                {hasLineItems ? (
                  <ListChecks size={14} className="text-purple-600" />
                ) : null}

                {hasNote ? (
                  <MessageSquareText size={14} className="text-blue-600" />
                ) : null}

                {validated ? (
                  <CheckCircle2 size={14} className="text-emerald-600" />
                ) : changed || hasLineItems ? (
                  <Pencil size={13} className="text-amber-600" />
                ) : (
                  <Pencil
                    size={13}
                    className="text-slate-300 opacity-0 group-hover:opacity-100"
                  />
                )}
              </button>
            ) : (
              <span>
                {amount === 0 ? '—' : formatCurrency(amount, currency)}
              </span>
            )}
          </td>
        );
      })}
    </tr>
  );
}

export default function Planner({
  plannerData,
  plannerEntries,
  settings,
  alerts = [],
  onCellClick,
}) {
  const gridScrollRef = useRef(null);
  const currency = settings?.currency || 'CAD';
  const incomeRows = plannerData.rows.filter((row) => row.type === 'income');
  const expenseRows = plannerData.rows.filter((row) => row.type === 'expense');
  const transferRows = plannerData.rows.filter((row) => row.type === 'transfer');
  useEffect(() => {
  const grid = gridScrollRef.current;

  if (!grid) {
    return;
  }

  const currentPayPeriodIndex = getCurrentPayPeriodIndex(
    plannerData.payPeriods
  );

  if (currentPayPeriodIndex <= 0) {
    grid.scrollLeft = 0;
    return;
  }

  const payPeriodColumnWidth = 144;

  grid.scrollLeft = currentPayPeriodIndex * payPeriodColumnWidth;
}, [plannerData.payPeriods]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Pay Period Planner
        </p>
        <h2 className="text-2xl font-bold text-slate-950 sm:text-3xl">
          Biweekly budget grid
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Click a planned amount to enter the actual value, add a note, mark it as validated, or add line items for misc rows.
        </p>
      </div>

      <AlertList
        title="Planner Warnings"
        helper="Projected balances that may need attention."
        alerts={alerts}
        maxItems={3}
      />

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div ref={gridScrollRef} className="max-h-[72vh] overflow-auto">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-40 min-w-56 border border-slate-200 bg-slate-900 px-3 py-3 text-left text-sm font-bold text-white">
                  Item
                </th>

                {plannerData.payPeriods.map((period) => (
                  <th
                    key={period.date}
                    className="sticky top-0 z-30 min-w-36 border border-slate-200 bg-slate-900 px-3 py-3 text-right text-sm font-bold text-white"
                  >
                    {period.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              <tr className="bg-emerald-100">
                <th className="sticky left-0 z-30 min-w-56 border border-slate-200 bg-emerald-100 px-3 py-2 text-left text-sm font-bold text-emerald-950">
                  Income
                </th>
                <td
                  colSpan={plannerData.payPeriods.length}
                  className="border border-slate-200 bg-emerald-100 px-3 py-2"
                />
              </tr>

              

              {incomeRows.map((row) => (
                <PlannerRow
                  key={row.id}
                  row={row}
                  payPeriods={plannerData.payPeriods}
                  plannerEntries={plannerEntries}
                  currency={currency}
                  onCellClick={onCellClick}
                />
              ))}

              <tr className="bg-blue-100">
              <th className="sticky left-0 z-30 min-w-56 border border-slate-200 bg-blue-100 px-3 py-2 text-left text-sm font-bold text-blue-950">
                Expenses
              </th>
              <td
                colSpan={plannerData.payPeriods.length}
                className="border border-slate-200 bg-blue-100 px-3 py-2"
              />
            </tr>

              {expenseRows.map((row) => (
                <PlannerRow
                  key={row.id}
                  row={row}
                  payPeriods={plannerData.payPeriods}
                  plannerEntries={plannerEntries}
                  currency={currency}
                  onCellClick={onCellClick}
                />
              ))}

                <tr className="bg-slate-200">
                  <th className="sticky left-0 z-30 min-w-56 border border-slate-200 bg-slate-200 px-3 py-2 text-left text-sm font-bold text-slate-950">
                    Transfers to Savings
                  </th>
                  <td
                    colSpan={plannerData.payPeriods.length}
                    className="border border-slate-200 bg-slate-200 px-3 py-2"
                  />
                </tr>

              {transferRows.map((row) => (
                <PlannerRow
                  key={row.id}
                  row={row}
                  payPeriods={plannerData.payPeriods}
                  plannerEntries={plannerEntries}
                  currency={currency}
                  onCellClick={onCellClick}
                />
              ))}

            <tr className="bg-white">
              <th className="sticky left-0 z-30 min-w-56 border border-slate-200 bg-white px-3 py-2 text-left text-sm font-bold text-slate-950">
                Totals and Account Projection
              </th>
              <td
                colSpan={plannerData.payPeriods.length}
                className="border border-slate-200 bg-white px-3 py-2"
              />
            </tr>

              {plannerData.projectionRows.map((row) => (
                <PlannerRow
                  key={row.id}
                  row={row}
                  payPeriods={plannerData.payPeriods}
                  plannerEntries={plannerEntries}
                  currency={currency}
                  onCellClick={onCellClick}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
