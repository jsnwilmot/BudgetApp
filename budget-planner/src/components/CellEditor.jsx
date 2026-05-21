import { formatCurrency } from '../logic/projectionLogic';

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
  const actualAmount =
    entry.actualAmount ?? selectedCell.effectiveAmount ?? selectedCell.plannedAmount;

  function handleSubmit(event) {
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
      actualAmount: Number.isNaN(actualAmountValue) ? selectedCell.plannedAmount : actualAmountValue,
      useActual,
      validated,
      notes,
      updatedAt: new Date().toISOString(),
    });
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-96 border-l border-slate-200 bg-white p-5 shadow-2xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Edit Planner Cell
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
        <p className="text-sm text-slate-500">Planned amount</p>
        <p className="mt-1 text-2xl font-bold text-slate-950">
          {formatCurrency(selectedCell.plannedAmount)}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
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
    </div>
  );
}