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

function getTypeLabel(type) {
  if (type === 'income') return 'Income';
  if (type === 'expense') return 'Expense';
  if (type === 'transfer') return 'Transfer';
  return 'Item';
}

function PeriodSummaryCard({ label, value, helper, currency }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-slate-950">
        {typeof value === 'number'
          ? formatCurrency(value, currency)
          : value || 'Not available'}
      </p>
      {helper ? (
        <p className="mt-1 text-xs leading-5 text-slate-500">{helper}</p>
      ) : null}
    </div>
  );
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

function getRowAmount(row, periodDate) {
  return Number(row?.amountsByPeriod?.[periodDate]) || 0;
}

function getCurrentPeriodSummary({ plannerData, plannerEntries, period }) {
  if (!period) {
    return {
      totals: {},
      attentionItems: [],
      attentionOverflow: 0,
    };
  }

  const getProjectionValue = (rowId) =>
    getRowAmount(
      plannerData.projectionRows.find((row) => row.id === rowId),
      period.date
    );
  const attentionItems = plannerData.rows
    .filter((row) => ['income', 'expense', 'transfer'].includes(row.type))
    .map((row) => {
      const entryKey = getEntryKey(row.id, period.date);
      const amount = getRowAmount(row, period.date);

      return {
        row,
        entryKey,
        amount,
        plannedAmount: Number(row.plannedByPeriod?.[period.date]) || 0,
        entry: plannerEntries[entryKey],
      };
    })
    .filter((item) => item.amount !== 0 && !item.entry?.validated);

  return {
    totals: {
      totalIncome: getProjectionValue('total-income'),
      totalExpenses: getProjectionValue('total-expenses'),
      totalTransfers: getProjectionValue('total-transfers'),
      netChequingChange: getProjectionValue('net-chequing-change'),
      projectedChequing: getProjectionValue('projected-chequing'),
      validatedChequing: getProjectionValue('validated-chequing'),
      projectedSavings: getProjectionValue('projected-savings'),
    },
    attentionItems: attentionItems.slice(0, 8),
    attentionOverflow: Math.max(0, attentionItems.length - 8),
  };
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
  const currentPayPeriodIndex = getCurrentPayPeriodIndex(plannerData.payPeriods);
  const currentPayPeriod =
    currentPayPeriodIndex >= 0
      ? plannerData.payPeriods[currentPayPeriodIndex]
      : null;
  const currentSummary = getCurrentPeriodSummary({
    plannerData,
    plannerEntries,
    period: currentPayPeriod,
  });
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

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-950">
              Current Pay Period Summary
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              The key totals and unvalidated items for the pay period that
              includes today.
            </p>
          </div>
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">
            {currentPayPeriod?.label || 'No current pay period'}
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <PeriodSummaryCard
            label="Current Pay Period"
            value={currentPayPeriod?.date || 'Not available'}
            currency={currency}
          />
          <PeriodSummaryCard
            label="Total Income"
            value={currentSummary.totals.totalIncome}
            currency={currency}
          />
          <PeriodSummaryCard
            label="Total Expenses"
            value={currentSummary.totals.totalExpenses}
            currency={currency}
          />
          <PeriodSummaryCard
            label="Total Transfers to Savings"
            value={currentSummary.totals.totalTransfers}
            currency={currency}
          />
          <PeriodSummaryCard
            label="Net Chequing Change"
            value={currentSummary.totals.netChequingChange}
            currency={currency}
          />
          <PeriodSummaryCard
            label="Projected Chequing"
            value={currentSummary.totals.projectedChequing}
            helper="Forecast balance after planned and actual items."
            currency={currency}
          />
          <PeriodSummaryCard
            label="Validated Chequing"
            value={currentSummary.totals.validatedChequing}
            helper="Bank-check balance using only confirmed items."
            currency={currency}
          />
          <PeriodSummaryCard
            label="Projected Savings"
            value={currentSummary.totals.projectedSavings}
            helper="Forecast savings after planned transfers and adjustments."
            currency={currency}
          />
        </div>

        <div className="mt-5 rounded-xl border border-slate-200 p-4">
          <h4 className="text-base font-semibold text-slate-950">
            What still needs attention
          </h4>

          {currentSummary.attentionItems.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              No non-zero current-period items need validation.
            </p>
          ) : (
            <div className="mt-3 grid gap-2">
              {currentSummary.attentionItems.map((item) => (
                <button
                  key={item.entryKey}
                  type="button"
                  onClick={() =>
                    onCellClick({
                      row: item.row,
                      period: currentPayPeriod,
                      entryKey: item.entryKey,
                      plannedAmount: item.plannedAmount,
                      effectiveAmount: item.amount,
                    })
                  }
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <span>
                    <span className="font-semibold text-slate-950">
                      {item.row.name}
                    </span>
                    <span className="ml-2 text-slate-500">
                      {getTypeLabel(item.row.type)}
                    </span>
                  </span>
                  <span className="font-semibold text-slate-950">
                    {formatCurrency(item.amount, currency)}
                  </span>
                </button>
              ))}

              {currentSummary.attentionOverflow > 0 ? (
                <p className="text-sm font-medium text-slate-500">
                  + {currentSummary.attentionOverflow} more items
                </p>
              ) : null}
            </div>
          )}
        </div>
      </section>

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
