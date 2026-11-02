import { getHistoricalReviewState } from '../logic/plannerHistory';
import { Plus, Trash2 } from 'lucide-react';
import { getLastEntrySaveAction, isPlannerCellMarked } from '../logic/plannerLastEntryMarker';
import { formatCurrency, getLineItemTotal, sumLineItems } from '../logic/projectionLogic';

function createLineItem() {
  return {
    id: crypto.randomUUID(),
    description: '',
    amount: '',
  };
}

function HistoricalReviewFields({ state, source, accounts, savingsBuckets, categories }) {
  if (!state.amount && !state.source) return null;
  const label = (records, id) => records.find((record) => record.id === id)?.name || (id ? 'Missing record' : 'None');
  return (
    <fieldset className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
      <legend className="font-semibold text-amber-950">Historical accuracy needs review</legend>
      <p className="text-sm text-amber-950">
        Notes, validation and marker changes do not verify missing historical facts.
        Compare an original backup or statement before checking either confirmation.
        Leave unchecked to keep the warnings.
      </p>
      {state.amount ? (
        <label className="flex items-start gap-2 text-sm">
          <input name="reviewHistoricalAmount" type="checkbox" className="mt-1" />
          <span>I verified the saved amount against an original backup or statement.</span>
        </label>
      ) : null}
      {state.source ? (
        <>
          <p className="text-sm">
            Source details are provisional: {source?.name || 'Missing source'};
            type: {source?.type || 'Unknown'};
            account: {label(accounts, source?.accountId)};
            category: {label(categories, source?.categoryId)};
            bucket: {label(savingsBuckets, source?.bucketId || source?.savingsBucketId)}.
            If these differ from the original, restore the correct details before confirming.
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input name="reviewHistoricalSource" type="checkbox" className="mt-1" />
            <span>I verified these original source details against an original backup or statement.</span>
          </label>
        </>
      ) : null}
      <label className="block text-sm">
        Backup or statement reference (required for confirmation)
        <input name="historicalEvidence" type="text" maxLength="500"
          onInput={(event) => event.currentTarget.setCustomValidity('')}
          className="mt-1 w-full rounded-lg border border-amber-300 px-3 py-2"
          placeholder="For example: original backup filename and entry date" />
      </label>
    </fieldset>
  );
}

function readHistoricalReview(form, formData) {
  const review = {
    amount: formData.get('reviewHistoricalAmount') === 'on',
    source: formData.get('reviewHistoricalSource') === 'on',
    evidence: String(formData.get('historicalEvidence') || '').trim(),
  };
  if ((review.amount || review.source) && !review.evidence) {
    const input = form.elements.namedItem('historicalEvidence');
    input.setCustomValidity('Enter the original backup or statement reference before confirming.');
    input.reportValidity();
    return null;
  }
  return review;
}

export default function CellEditor({
  selectedCell,
  plannerEntries,
  plannerLastEntryMarker,
  settings,
  accounts = [],
  savingsBuckets = [],
  categories = [],
  onClose,
  onSave,
  onClear,
}) {
  if (!selectedCell) {
    return null;
  }

  const entry = plannerEntries[selectedCell.entryKey] || {};
  const reviewState = plannerEntries[selectedCell.entryKey] ? getHistoricalReviewState(entry) : { amount: false, source: false };
  const reviewFields = <HistoricalReviewFields state={reviewState} source={selectedCell.row.item}
    accounts={accounts} savingsBuckets={savingsBuckets} categories={categories} />;
  const currency = settings?.currency || 'CAD';
  const isLineItemCell = Boolean(selectedCell.row.item?.allowLineItems);
  const isLastEntryCell = isPlannerCellMarked(
    plannerLastEntryMarker,
    selectedCell.row.id,
    selectedCell.period.date
  );
  const hasSavedLineItems = Boolean(entry.lineItems?.length);
  const hasSavedActualAmount =
    entry.actualAmount !== undefined &&
    entry.actualAmount !== null &&
    entry.actualAmount !== '';
  const actualAmount =
    entry.actualAmount ?? selectedCell.effectiveAmount ?? selectedCell.plannedAmount;
  const shouldPrefillLineItem =
    isLineItemCell &&
    !hasSavedLineItems &&
    hasSavedActualAmount &&
    Number(actualAmount) > 0;
  const lineItems = hasSavedLineItems
    ? entry.lineItems
    : [
        {
          ...createLineItem(),
          description: shouldPrefillLineItem ? 'Imported amount' : '',
          amount: shouldPrefillLineItem ? actualAmount : '',
        },
      ];

  function handleStandardSubmit(event) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const historicalReview = readHistoricalReview(event.currentTarget, formData);
    if (!historicalReview) return;
    const useActual = formData.get('useActual') === 'on';
    const validated = formData.get('validated') === 'on';
    const markAsLastEntry = formData.get('lastEntry') === 'on';
    const actualAmountValue = Number(formData.get('actualAmount'));
    const notes = String(formData.get('notes') || '');

    onSave(
      selectedCell.entryKey,
      {
        ...entry,
        scheduledItemId: selectedCell.row.id,
        payPeriodDate: selectedCell.period.date,
        plannedAmount: selectedCell.plannedAmount,
        actualAmount: Number.isNaN(actualAmountValue)
          ? selectedCell.plannedAmount
          : actualAmountValue,
        useActual,
        validated,
        notes,
        lineItems: [],
        updatedAt: new Date().toISOString(),
      },
      {
        historicalReview,
        lastEntryAction: getLastEntrySaveAction({
          wasMarked: isLastEntryCell,
          shouldBeMarked: markAsLastEntry,
        }),
      }
    );
  }

  function handleLineItemSubmit(event) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const historicalReview = readHistoricalReview(event.currentTarget, formData);
    if (!historicalReview) return;
    const validated = formData.get('validated') === 'on';
    const markAsLastEntry = formData.get('lastEntry') === 'on';
    const notes = String(formData.get('notes') || '');

    const descriptions = formData.getAll('lineDescription');
    const amounts = formData.getAll('lineAmount');

    const cleanedLineItems = descriptions
      .map((description, index) => ({
        id: String(formData.getAll('lineId')[index] || crypto.randomUUID()),
        description: String(description || '').trim(),
        amount: Number(amounts[index]) || 0,
      }))
      .filter((item) => item.description || item.amount > 0);

    const total = sumLineItems(cleanedLineItems);

    onSave(
      selectedCell.entryKey,
      {
        ...entry,
        scheduledItemId: selectedCell.row.id,
        payPeriodDate: selectedCell.period.date,
        plannedAmount: selectedCell.plannedAmount,
        actualAmount: total,
        useActual: true,
        validated,
        notes,
        lineItems: cleanedLineItems,
        updatedAt: new Date().toISOString(),
      },
      {
        historicalReview,
        lastEntryAction: getLastEntrySaveAction({
          wasMarked: isLastEntryCell,
          shouldBeMarked: markAsLastEntry,
        }),
      }
    );
  }

  function addLineItem(event) {
    event.preventDefault();

    const container = document.getElementById('line-items-container');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'grid grid-cols-[minmax(0,1fr)_96px_40px] gap-2 sm:grid-cols-[1fr_120px_40px]';
    row.innerHTML = `
      <input type="hidden" name="lineId" value="${crypto.randomUUID()}" />
      <input
        name="lineDescription"
        type="text"
        placeholder="Description"
        class="min-w-0 rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
      />
      <input
        name="lineAmount"
        type="number"
        step="0.01"
        min="0"
        placeholder="0.00"
        class="min-w-0 rounded-xl border border-slate-300 px-3 py-2 text-right outline-none focus:border-slate-900"
      />
      <button
        type="button"
        class="rounded-xl border border-red-200 px-2 py-2 text-red-600 hover:bg-red-50"
        onclick="this.parentElement.remove()"
        aria-label="Remove line item"
        title="Remove line"
      >
        X
      </button>
    `;

    container.appendChild(row);
  }

  return (
    <div className="fixed inset-0 z-50 max-h-[100dvh] w-full overflow-y-auto border-slate-200 bg-white p-4 shadow-2xl sm:inset-y-0 sm:left-auto sm:w-[460px] sm:border-l sm:p-5">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {isLineItemCell ? 'Edit Line Items' : 'Edit Planner Cell'}
          </p>
          <h3 className="mt-1 break-words text-xl font-bold text-slate-950">
            {selectedCell.row.name}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Pay period: {selectedCell.period.label}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="min-h-11 shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          Close
        </button>
      </div>

      <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm text-slate-500">
          {isLineItemCell ? 'Current cell total' : 'Planned amount'}
        </p>
        <p className="mt-1 text-2xl font-bold text-slate-950">
          {formatCurrency(
            isLineItemCell
              ? getLineItemTotal(entry, selectedCell.effectiveAmount)
              : selectedCell.plannedAmount,
            currency
          )}
        </p>
      </div>

      {isLineItemCell ? (
        <form onSubmit={handleLineItemSubmit} className="space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-slate-700">
                Line items
              </span>

              <button
                type="button"
                onClick={addLineItem}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                <Plus size={14} />
                Add item
              </button>
            </div>

            <div id="line-items-container" className="space-y-2">
              {lineItems.map((item) => (
                <div
                  key={item.id}
                className="grid grid-cols-[minmax(0,1fr)_96px_40px] gap-2 sm:grid-cols-[1fr_120px_40px]"
                >
                  <input type="hidden" name="lineId" defaultValue={item.id} />

                  <input
                    name="lineDescription"
                    type="text"
                    defaultValue={item.description}
                    placeholder="Description"
                    className="min-w-0 rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
                  />

                  <input
                    name="lineAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={item.amount}
                    placeholder="0.00"
                    className="min-w-0 rounded-xl border border-slate-300 px-3 py-2 text-right outline-none focus:border-slate-900"
                  />

                  <button
                    type="button"
                    onClick={(event) => event.currentTarget.parentElement.remove()}
                    className="rounded-xl border border-red-200 px-2 py-2 text-red-600 hover:bg-red-50"
                    aria-label="Remove line item"
                    title="Remove line"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
            <input
              name="validated"
              type="checkbox"
              defaultChecked={entry.validated ?? false}
              className="h-4 w-4"
            />
            <span className="text-sm font-medium text-slate-700">
              Mark as validated
            </span>
          </label>

          <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
            <input
              name="lastEntry"
              type="checkbox"
              defaultChecked={isLastEntryCell}
              className="h-4 w-4"
            />
            <span className="text-sm font-medium text-slate-700">
              Mark as last entry
            </span>
          </label>

          {reviewFields}

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Notes</span>
            <textarea
              name="notes"
              rows="4"
              defaultValue={entry.notes || ''}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-slate-900"
              placeholder="Optional note for this pay period"
            />
          </label>

          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <button
              type="submit"
              className="min-h-11 flex-1 rounded-xl bg-slate-950 px-4 py-2 font-semibold text-white hover:bg-slate-800"
            >
              Save Line Items
            </button>

            <button
              type="button"
              onClick={() => onClear(selectedCell.entryKey)}
              className="min-h-11 rounded-xl border border-red-200 px-4 py-2 font-semibold text-red-600 hover:bg-red-50"
            >
              Clear
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleStandardSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              Actual amount
            </span>
            <input
              name="actualAmount"
              type="number"
              step="0.01"
              min="0"
              defaultValue={actualAmount}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-slate-900"
            />
          </label>

          <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
            <input
              name="useActual"
              type="checkbox"
              defaultChecked={entry.useActual ?? true}
              className="h-4 w-4"
            />
            <span className="text-sm font-medium text-slate-700">
              Use actual amount in projection
            </span>
          </label>

          <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
            <input
              name="validated"
              type="checkbox"
              defaultChecked={entry.validated ?? false}
              className="h-4 w-4"
            />
            <span className="text-sm font-medium text-slate-700">
              Mark as validated
            </span>
          </label>

          <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
            <input
              name="lastEntry"
              type="checkbox"
              defaultChecked={isLastEntryCell}
              className="h-4 w-4"
            />
            <span className="text-sm font-medium text-slate-700">
              Mark as last entry
            </span>
          </label>

          {reviewFields}

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Notes</span>
            <textarea
              name="notes"
              rows="4"
              defaultValue={entry.notes || ''}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-slate-900"
              placeholder="Optional note"
            />
          </label>

          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <button
              type="submit"
              className="min-h-11 flex-1 rounded-xl bg-slate-950 px-4 py-2 font-semibold text-white hover:bg-slate-800"
            >
              Save
            </button>

            <button
              type="button"
              onClick={() => onClear(selectedCell.entryKey)}
              className="min-h-11 rounded-xl border border-red-200 px-4 py-2 font-semibold text-red-600 hover:bg-red-50"
            >
              Clear
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
