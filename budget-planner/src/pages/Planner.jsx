import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ListChecks, MessageSquareText, Pencil } from 'lucide-react';
import AlertList from '../components/AlertList';
import SavedPlannerHistory from '../components/SavedPlannerHistory';
import { isPlannerCellMarked } from '../logic/plannerLastEntryMarker';
import { getEntryKey, formatCurrency, getPlannerPeriodType } from '../logic/projectionLogic';
import { getConfirmedAmount, getSavedPlannerEntriesBeforeAnchor } from '../logic/plannerHistory';
import { getPayPeriodsForYear } from '../logic/dateLogic';

const ITEM_WIDTH = 224;
const COMPACT_ITEM_WIDTH = 144;
const PERIOD_WIDTH = 144;
const FULL_GRID_LIMIT = 48;
const OVERSCAN = 4;
const navigationClass = 'min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-50';

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
  plannerLastEntryMarker,
  currency,
  onCellClick,
  today,
  leading,
  trailing,
}) {
  const editable = ['income', 'expense', 'transfer'].includes(row.type);
  const endDate = row.item?.endDate;
  const inactive = row.item?.active === false;

  return (
    <tr className={getRowClass(row.type)}>
      <th scope="row" className="sticky left-0 z-30 break-words border border-slate-200 bg-inherit px-3 py-2 text-left text-sm">
        {row.name}
        {inactive || endDate ? (
          <span className="block text-xs font-normal text-slate-600">
            {inactive ? 'Inactive' : `${endDate < today ? 'Ended' : 'Ends'} ${endDate}`}
          </span>
        ) : null}
      </th>

      {leading > 0 && <td aria-hidden="true" />}
      {payPeriods.map((period, index) => {
        const plannedAmount = row.plannedByPeriod?.[period.date];
        const entryKey = getEntryKey(row.id, period.date);
        const entry = plannerEntries[entryKey];

        const changed = Boolean(entry?.useActual);
        const validated = Boolean(entry?.validated);
        const hasNote = Boolean(entry?.notes?.trim());
        const hasLineItems = Boolean(entry?.lineItems?.length);
        const forecastAllowed = !inactive && (!endDate || period.date <= endDate);
        const canEdit = editable && (forecastAllowed || Boolean(entry));
        const savedDraft = entry && !validated && !forecastAllowed;
        const warnings = row.historyWarningsByPeriod?.[period.date];
        const sourceConflict = warnings?.source === 'Source conflict';
        const amount = savedDraft || sourceConflict
          ? (getConfirmedAmount(entry) ?? 0)
          : row.amountsByPeriod[period.date] || 0;
        const historicalType = getPlannerPeriodType(row, period.date);
        const cellDetails = [warnings?.amount, sourceConflict && 'Source conflict. Excluded from totals.',
          savedDraft && 'Saved draft. Excluded from totals.',
          historicalType !== row.type && getTypeLabel(historicalType)].filter(Boolean);
        const lastEntrySelected = isPlannerCellMarked(
          plannerLastEntryMarker,
          row.id,
          period.date
        );
        const amountLabel =
          amount === 0 ? 'No amount' : formatCurrency(amount, currency);

        return (
          <td
            key={period.date}
            aria-colindex={leading + index + 2}
            className={`min-w-36 border border-slate-200 px-2 py-2 text-right text-sm ${getAmountClass(amount)} ${
              lastEntrySelected ? 'planner-last-entry-cell' : ''
            }`}
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
                aria-label={`${row.name}, ${period.label} ${period.date.slice(0, 4)}, ${amountLabel}.${
                  lastEntrySelected ? ' Marked as Last Entry.' : ''
                }`}
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

                {validated && !warnings?.amount && !sourceConflict ? (
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
            {cellDetails.length > 0 ? (
              <span className="block text-xs font-normal text-slate-600">
                {cellDetails.join(' · ')}
              </span>
            ) : null}
          </td>
        );
      })}
      {trailing > 0 && <td aria-hidden="true" />}
    </tr>
  );
}

export default function Planner({
  plannerData,
  buildPlannerThroughYear,
  plannerEntries,
  plannerLastEntryMarker,
  settings,
  alerts = [],
  onCellClick,
}) {
  const gridScrollRef = useRef(null);
  const positionedView = useRef(null);
  const [selectedYear, setSelectedYear] = useState(null);
  const [todayRequest, setTodayRequest] = useState(0);
  const [viewport, setViewport] = useState({ first: 0, count: 8, itemWidth: ITEM_WIDTH });
  const { currentPayPeriod, today } = plannerData;
  const localYear = Number(today.slice(0, 4));
  const currentYear = Number((currentPayPeriod?.date ?? today).slice(0, 4));
  const year = selectedYear ?? currentYear;
  const anchor = plannerData.payPeriods[0]?.date;
  const anchorYear = anchor ? Number(anchor.slice(0, 4)) : localYear;
  const savedHistory = useMemo(() => getSavedPlannerEntriesBeforeAnchor(plannerEntries, anchor),
    [plannerEntries, anchor]);
  const oldestSavedYear = savedHistory.length ? Number(savedHistory[0].date.slice(0, 4)) : anchorYear;
  const rollingEndYear = Number(plannerData.calculationEndDate.slice(0, 4));
  const firstYear = Math.max(1000, Math.min(anchorYear, oldestSavedYear, localYear, year) - 1);
  const lastYear = Math.min(9999, Math.max(rollingEndYear, localYear + 1, year + 1));
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index);
  const requestedYear = year >= anchorYear && `${year}-12-31` > plannerData.calculationEndDate ? year : null;
  const viewData = useMemo(() => requestedYear ? buildPlannerThroughYear(requestedYear) : plannerData,
    [buildPlannerThroughYear, plannerData, requestedYear]);
  const payPeriods = useMemo(() => getPayPeriodsForYear(viewData.payPeriods, year), [viewData, year]);
  const periodCount = payPeriods.length;
  const firstVisible = Math.min(viewport.first, Math.max(0, periodCount - 1));
  const leading = periodCount > FULL_GRID_LIMIT ? Math.max(0, firstVisible - OVERSCAN) : 0;
  const end = periodCount > FULL_GRID_LIMIT
    ? Math.min(periodCount, firstVisible + viewport.count + OVERSCAN)
    : periodCount;
  const trailing = periodCount - end;
  const visiblePeriods = payPeriods.slice(leading, end);
  const renderedColumns = visiblePeriods.length + Number(leading > 0) + Number(trailing > 0);
  const positionKey = `${year}|${payPeriods[0]?.date ?? ''}|${payPeriods[1]?.date ?? ''}|${todayRequest}`;
  const currentIndex = selectedYear === null
    ? payPeriods.findIndex(({ date }) => date === currentPayPeriod?.date)
    : 0;
  const currency = settings?.currency || 'CAD';
  const incomeRows = viewData.rows.filter((row) => row.type === 'income');
  const expenseRows = viewData.rows.filter((row) => row.type === 'expense');
  const transferRows = viewData.rows.filter((row) => row.type === 'transfer');
  const currentSummary = getCurrentPeriodSummary({
    plannerData,
    plannerEntries,
    period: currentPayPeriod,
  });
  function updateViewport(grid) {
    const first = Math.floor(grid.scrollLeft / PERIOD_WIDTH);
    const itemWidth = grid.clientWidth < 480 ? COMPACT_ITEM_WIDTH : ITEM_WIDTH;
    const count = Math.max(1, Math.ceil((grid.clientWidth - itemWidth) / PERIOD_WIDTH) + 1);
    setViewport((previous) => previous.first === first && previous.count === count && previous.itemWidth === itemWidth
      ? previous : { first, count, itemWidth });
  }

  useLayoutEffect(() => {
    if (positionedView.current !== positionKey) {
      positionedView.current = positionKey;
      gridScrollRef.current.scrollLeft = Math.max(0, currentIndex) * PERIOD_WIDTH;
    }
  }, [positionKey, currentIndex]);

  useEffect(() => {
    const grid = gridScrollRef.current;
    const observer = new ResizeObserver(() => updateViewport(grid));
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

  function showToday() {
    setSelectedYear(null);
    setTodayRequest((request) => request + 1);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Pay Period Planner
        </p>
        <h2 className="text-2xl font-bold text-slate-950 sm:text-3xl">
          Pay-period budget grid
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Click a planned amount to enter the actual value, add a note, mark it
          as validated, mark it as the last entry, or add line items for misc
          rows.
        </p>
        {plannerData.calculationEndDate && (
          <p className="mt-1 text-sm text-slate-500">
            Your regular forecast is {plannerData.forecastMonths} months.
            Rolling calculations extend through {plannerData.calculationEndDate}.
          </p>
        )}
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
        <div className="space-y-3 border-b border-slate-200 p-4">
          <h3 className="text-lg font-semibold text-slate-950" aria-live="polite">Planner for {year}</h3>
          <div role="group" aria-label="Planner year navigation" className="flex flex-wrap items-end gap-2">
            <button type="button" className={navigationClass} disabled={year === 1000}
              onClick={() => setSelectedYear(year - 1)}>
              Previous Year
            </button>
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              Planner year
              <select className={navigationClass} value={year}
                onChange={(event) => setSelectedYear(Number(event.target.value))}>
                {years.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <button type="button" className={navigationClass} disabled={year === 9999}
              onClick={() => setSelectedYear(year + 1)}>
              Next Year
            </button>
            <button type="button" className={navigationClass} onClick={showToday}>Today</button>
          </div>
          {periodCount > 0 && (
            <p className="text-sm text-slate-600">
              Unvalidated amounts are projections.
              {payPeriods.at(-1).date > plannerData.forecastEndDate &&
                ' This year extends beyond your regular forecast.'}
            </p>
          )}
        </div>
        <div
          ref={gridScrollRef}
          role="region"
          aria-label="Scrollable pay periods"
          tabIndex={0}
          onScroll={(event) => updateViewport(event.currentTarget)}
          className="max-h-[72vh] overflow-auto"
        >
          {periodCount === 0 ? (
            <p className="p-4 text-sm text-slate-600">
              No pay periods start in {year}.{anchor && ` Your Planner starts on ${anchor}.`}
            </p>
          ) : (
          <table
            aria-colcount={periodCount + 1}
            className="table-fixed border-separate border-spacing-0"
            style={{ width: viewport.itemWidth + periodCount * PERIOD_WIDTH }}
          >
            <colgroup>
              <col style={{ width: viewport.itemWidth }} />
              {leading > 0 && <col style={{ width: leading * PERIOD_WIDTH }} />}
              {visiblePeriods.map((period) => <col key={period.date} style={{ width: PERIOD_WIDTH }} />)}
              {trailing > 0 && <col style={{ width: trailing * PERIOD_WIDTH }} />}
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 top-0 z-40 border border-slate-200 bg-slate-900 px-3 py-3 text-left text-sm font-bold text-white">
                  Item
                </th>

                {leading > 0 && <th aria-hidden="true" className="sticky top-0 bg-slate-900" />}
                {visiblePeriods.map((period, index) => (
                  <th
                    key={period.date}
                    scope="col"
                    aria-colindex={leading + index + 2}
                    className="sticky top-0 z-30 min-w-36 border border-slate-200 bg-slate-900 px-3 py-3 text-right text-sm font-bold text-white"
                  >
                    <time dateTime={period.date}>{period.label} {period.date.slice(0, 4)}</time>
                  </th>
                ))}
                {trailing > 0 && <th aria-hidden="true" className="sticky top-0 bg-slate-900" />}
              </tr>
            </thead>

            <tbody>
              <tr className="bg-emerald-100">
                <th className="sticky left-0 z-30 border border-slate-200 bg-emerald-100 px-3 py-2 text-left text-sm font-bold text-emerald-950">
                  Income
                </th>
                <td
                  colSpan={Math.max(1, renderedColumns)}
                  className="border border-slate-200 bg-emerald-100 px-3 py-2"
                />
              </tr>

              

              {incomeRows.map((row) => (
                <PlannerRow
                  key={row.id}
                  row={row}
                  payPeriods={visiblePeriods}
                  today={today}
                  leading={leading}
                  trailing={trailing}
                  plannerEntries={plannerEntries}
                  plannerLastEntryMarker={plannerLastEntryMarker}
                  currency={currency}
                  onCellClick={onCellClick}
                />
              ))}

              <tr className="bg-blue-100">
              <th className="sticky left-0 z-30 border border-slate-200 bg-blue-100 px-3 py-2 text-left text-sm font-bold text-blue-950">
                Expenses
              </th>
              <td
                colSpan={Math.max(1, renderedColumns)}
                className="border border-slate-200 bg-blue-100 px-3 py-2"
              />
            </tr>

              {expenseRows.map((row) => (
                <PlannerRow
                  key={row.id}
                  row={row}
                  payPeriods={visiblePeriods}
                  today={today}
                  leading={leading}
                  trailing={trailing}
                  plannerEntries={plannerEntries}
                  plannerLastEntryMarker={plannerLastEntryMarker}
                  currency={currency}
                  onCellClick={onCellClick}
                />
              ))}

                <tr className="bg-slate-200">
                  <th className="sticky left-0 z-30 border border-slate-200 bg-slate-200 px-3 py-2 text-left text-sm font-bold text-slate-950">
                    Transfers to Savings
                  </th>
                  <td
                    colSpan={Math.max(1, renderedColumns)}
                    className="border border-slate-200 bg-slate-200 px-3 py-2"
                  />
                </tr>

              {transferRows.map((row) => (
                <PlannerRow
                  key={row.id}
                  row={row}
                  payPeriods={visiblePeriods}
                  today={today}
                  leading={leading}
                  trailing={trailing}
                  plannerEntries={plannerEntries}
                  plannerLastEntryMarker={plannerLastEntryMarker}
                  currency={currency}
                  onCellClick={onCellClick}
                />
              ))}

            <tr className="bg-white">
              <th className="sticky left-0 z-30 border border-slate-200 bg-white px-3 py-2 text-left text-sm font-bold text-slate-950">
                Totals and Account Projection
              </th>
              <td
                colSpan={Math.max(1, renderedColumns)}
                className="border border-slate-200 bg-white px-3 py-2"
              />
            </tr>

              {viewData.projectionRows.map((row) => (
                <PlannerRow
                  key={row.id}
                  row={row}
                  payPeriods={visiblePeriods}
                  today={today}
                  leading={leading}
                  trailing={trailing}
                  plannerEntries={plannerEntries}
                  plannerLastEntryMarker={plannerLastEntryMarker}
                  currency={currency}
                  onCellClick={onCellClick}
                />
              ))}
            </tbody>
          </table>
          )}
        </div>
      </section>
      <SavedPlannerHistory
        records={savedHistory.filter(({ date }) => date.startsWith(`${year}-`))}
        marker={plannerLastEntryMarker}
        currency={currency}
      />
    </div>
  );
}
