import { Plus, Trash2 } from 'lucide-react';
import { formatCurrency, sumLineItems } from '../logic/projectionLogic';

function createLineItem() {
  return {
    id: crypto.randomUUID(),
    description: '',
    amount: '',
  };
}

export default function CellEditor({
  selectedCell,
  plannerEntries,
  onClose,
  onSave,
  onClear,
}) {
  if (!selectedCell) {
    return null;
  }

  const entry = plannerEntries[selectedCell.entryKey] || {};
  const isLineItemCell = Boolean(selectedCell.row.item?.allowLineItems);
  const lineItems =
    entry.lineItems && entry.lineItems.length > 0
      ? entry.lineItems
      : [createLineItem()];

  const actualAmount =
    entry.actualAmount ?? selectedCell.effectiveAmount ?? selectedCell.plannedAmount;

  function handleStandardSubmit(event) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const useActual = formData.get('useActual') === 'on';
    const validated = formData.get('validated') === 'on';
    const actualAmountValue = Number(formData.get('actualAmount'));
    const notes = String(formData.get('notes') || '');

    onSave(selectedCell.entryKey, {
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
    });
  }

  function handleLineItemSubmit(event) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const validated = formData.get('validated') === 'on';
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

    onSave(selectedCell.entryKey, {
      scheduledItemId: selectedCell.row.id,
      payPeriodDate: selectedCell.period.date,
      plannedAmount: selectedCell.plannedAmount,
      actualAmount: total,
      useActual: true,
      validated,
      notes,
      lineItems: cleanedLineItems,
      updatedAt: new Date().toISOString(),
    });
  }

  function addLineItem(event) {
    event.preventDefault();

    const container = document.getElementById('line-items-container');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'grid grid-cols-[1fr_120px_36px] gap-2';
    row.innerHTML = `
      <input type="hidden" name="lineId" value="${crypto.randomUUID()}" />
      <input
        name="lineDescription"
        type="text"
        placeholder="Description"
        class="rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
      />
      <input
        name="lineAmount"
        type="number"
        step="0.01"
        min="0"
        placeholder="0.00"
        class="rounded-xl border border-slate-300 px-3 py-2 text-right outline-none focus:border-slate-900"
      />
      <button
        type="button"
        class="rounded-xl border border-red-200 px-2 py-2 text-red-600 hover:bg-red-50"
        onclick="this.parentElement.remove()"
        title="Remove line"
      >
        ×
      </button>
    `;

    container.appendChild(row);
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-[460px] overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-2xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {isLineItemCell ? 'Edit Line Items' : 'Edit Planner Cell'}
          </p>
          <h3 className="mt-1 text-xl font-bold text-slate-950">
            {selectedCell.row.name}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Pay period: {selectedCell.period.label}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-200 px-3 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100"
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
            isLineItemCell ? sumLineItems(entry.lineItems || []) : selectedCell.plannedAmount
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
                  className="grid grid-cols-[1fr_120px_36px] gap-2"
                >
                  <input type="hidden" name="lineId" defaultValue={item.id} />

                  <input
                    name="lineDescription"
                    type="text"
                    defaultValue={item.description}
                    placeholder="Description"
                    className="rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
                  />

                  <input
                    name="lineAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={item.amount}
                    placeholder="0.00"
                    className="rounded-xl border border-slate-300 px-3 py-2 text-right outline-none focus:border-slate-900"
                  />

                  <button
                    type="button"
                    onClick={(event) => event.currentTarget.parentElement.remove()}
                    className="rounded-xl border border-red-200 px-2 py-2 text-red-600 hover:bg-red-50"
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

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="flex-1 rounded-xl bg-slate-950 px-4 py-2 font-semibold text-white hover:bg-slate-800"
            >
              Save Line Items
            </button>

            <button
              type="button"
              onClick={() => onClear(selectedCell.entryKey)}
              className="rounded-xl border border-red-200 px-4 py-2 font-semibold text-red-600 hover:bg-red-50"
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

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="flex-1 rounded-xl bg-slate-950 px-4 py-2 font-semibold text-white hover:bg-slate-800"
            >
              Save
            </button>

            <button
              type="button"
              onClick={() => onClear(selectedCell.entryKey)}
              className="rounded-xl border border-red-200 px-4 py-2 font-semibold text-red-600 hover:bg-red-50"
            >
              Clear
            </button>
          </div>
        </form>
      )}
    </div>
  );
}