import { useMemo, useState } from 'react';
import { ListChecks, Pencil, Plus } from 'lucide-react';
import { formatCurrency } from '../logic/projectionLogic';

function formatType(type) {
  if (type === 'income') return 'Income';
  if (type === 'expense') return 'Expense';
  if (type === 'transfer') return 'Transfer';
  return type;
}

function formatFrequency(frequency) {
  if (frequency === 'biweekly') return 'Biweekly';
  if (frequency === 'monthly') return 'Monthly';
  if (frequency === 'annual') return 'Annual';
  if (frequency === 'manual') return 'Manual';
  return frequency;
}

function getTypeClass(type) {
  if (type === 'income') return 'bg-emerald-100 text-emerald-800';
  if (type === 'expense') return 'bg-blue-100 text-blue-800';
  if (type === 'transfer') return 'bg-slate-200 text-slate-800';
  return 'bg-slate-100 text-slate-700';
}

function getCategoryTypesForItemType(type) {
  if (type === 'income') return ['income', 'general'];
  if (type === 'expense') return ['expense', 'debt', 'general'];
  if (type === 'transfer') return ['transfer', 'savings', 'general'];
  return ['general'];
}

function getCategoryName(categoryId, categories = []) {
  if (!categoryId) {
    return 'Uncategorized';
  }

  return (
    categories.find((category) => category.id === categoryId)?.name ||
    'Missing category'
  );
}

function createNewScheduledItem() {
  return {
    id: `scheduled-${crypto.randomUUID()}`,
    name: '',
    type: 'expense',
    amount: 0,
    frequency: 'biweekly',
    startDate: '2026-06-03',
    dueDay: '',
    dueMonth: '',
    accountId: 'acct-chequing',
    fromAccountId: 'acct-chequing',
    toAccountId: 'acct-savings',
    active: true,
    allowLineItems: false,
    notes: '',
    isCustom: true,
    createdAt: new Date().toISOString(),
  };
}

function getAssignmentRuleLabel(rule) {
  if (rule === 'same-pay-period') {
    return 'same pay period as the due date';
  }

  return 'previous pay period before the due date';
}

function ScheduledItemForm({ item, categories, settings, onCancel, onSave }) {
  const [formState, setFormState] = useState({
    ...item,
    amount: item.amount ?? 0,
    dueDay: item.dueDay ?? '',
    dueMonth: item.dueMonth ?? '',
    notes: item.notes ?? '',
    categoryId: item.categoryId ?? '',
    active: item.active ?? true,
    allowLineItems: item.allowLineItems ?? false,
  });

  const categoryOptions = useMemo(() => {
    const allowedTypes = getCategoryTypesForItemType(formState.type);
    const selectedCategory = categories.find(
      (category) => category.id === formState.categoryId
    );
    const options = categories
      .filter((category) => {
        return (
          allowedTypes.includes(category.type) &&
          (category.active !== false || category.id === formState.categoryId)
        );
      })
      .sort(
        (left, right) =>
          Number(left.sortOrder || 0) - Number(right.sortOrder || 0) ||
          left.name.localeCompare(right.name)
      );

    if (
      selectedCategory &&
      !options.some((category) => category.id === selectedCategory.id)
    ) {
      return [...options, selectedCategory];
    }

    return options;
  }, [categories, formState.categoryId, formState.type]);

  function updateField(fieldName, value) {
    setFormState((current) => ({
      ...current,
      [fieldName]: value,
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();

    const cleanedItem = {
      ...formState,
      name: String(formState.name || '').trim(),
      amount: Number(formState.amount) || 0,
      dueDay: formState.dueDay === '' ? undefined : Number(formState.dueDay),
      dueMonth: formState.dueMonth === '' ? undefined : Number(formState.dueMonth),
      notes: String(formState.notes || '').trim(),
      categoryId: formState.categoryId || undefined,
      active: Boolean(formState.active),
      allowLineItems: Boolean(formState.allowLineItems),
      updatedAt: new Date().toISOString(),
    };

    if (!cleanedItem.name) {
      return;
    }

    onSave(cleanedItem);
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-[460px] overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-2xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {item.isCustom && !item.updatedAt ? 'Add Scheduled Item' : 'Edit Scheduled Item'}
          </p>
          <h3 className="mt-1 text-xl font-bold text-slate-950">
            {item.name || 'New Scheduled Item'}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Changes affect future planner projections.
          </p>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-200 px-3 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          Close
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Name</span>
          <input
            type="text"
            value={formState.name}
            onChange={(event) => updateField('name', event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
            placeholder="Example: Internet, Refund, Extra Savings"
            required
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Type</span>
            <select
              value={formState.type}
              onChange={(event) => updateField('type', event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
            >
              <option value="income">Income</option>
              <option value="expense">Expense</option>
              <option value="transfer">Transfer</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Frequency</span>
            <select
              value={formState.frequency}
              onChange={(event) => updateField('frequency', event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
            >
              <option value="biweekly">Biweekly</option>
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
              <option value="manual">Manual</option>
            </select>
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Category</span>
          <select
            value={formState.categoryId}
            onChange={(event) => updateField('categoryId', event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-900"
          >
            <option value="">Uncategorized</option>
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
                {category.active === false ? ' (archived)' : ''}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Amount</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={formState.amount}
              onChange={(event) => updateField('amount', event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Start Date</span>
            <input
              type="date"
              value={formState.startDate}
              onChange={(event) => updateField('startDate', event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
              required
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Due Day</span>
            <input
              type="number"
              min="1"
              max="31"
              value={formState.dueDay}
              onChange={(event) => updateField('dueDay', event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
              placeholder="1 to 31"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              Due Month, annual only
            </span>
            <input
              type="number"
              min="1"
              max="12"
              value={formState.dueMonth}
              onChange={(event) => updateField('dueMonth', event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
              placeholder="1 to 12"
            />
          </label>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-800">
            Timing guide
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Recurring items appear every {settings?.payFrequencyDays || 14} days
            from the start date. Monthly items use the due day and are placed in
            the {getAssignmentRuleLabel(settings?.monthlyBillAssignmentRule)}.
          </p>
        </div>

        <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
          <input
            type="checkbox"
            checked={formState.active}
            onChange={(event) => updateField('active', event.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-sm font-medium text-slate-700">
            Active in planner
          </span>
        </label>

        <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
          <input
            type="checkbox"
            checked={formState.allowLineItems}
            onChange={(event) => updateField('allowLineItems', event.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-sm font-medium text-slate-700">
            Allow multiple line items in planner cells
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Notes</span>
          <textarea
            rows="4"
            value={formState.notes}
            onChange={(event) => updateField('notes', event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
            placeholder="Optional note"
          />
        </label>

        <button
          type="submit"
          className="w-full rounded-xl bg-slate-950 px-4 py-2 font-semibold text-white hover:bg-slate-800"
        >
          Save Scheduled Item
        </button>
      </form>
    </div>
  );
}

export default function ScheduledItems({
  scheduledItems,
  categories = [],
  settings,
  onSaveScheduledItem,
}) {
  const [selectedItem, setSelectedItem] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const currency = settings?.currency || 'CAD';

  const filteredItems = useMemo(() => {
    return scheduledItems
      .filter((item) => {
        if (typeFilter === 'all') return true;
        return item.type === typeFilter;
      })
      .sort((a, b) => {
        const typeOrder = { income: 1, expense: 2, transfer: 3 };
        return (
          (typeOrder[a.type] || 99) - (typeOrder[b.type] || 99) ||
          a.name.localeCompare(b.name)
        );
      });
  }, [scheduledItems, typeFilter]);

  const totals = useMemo(() => {
    return scheduledItems.reduce(
      (summary, item) => {
        if (!item.active) return summary;

        if (item.type === 'income') summary.income += Number(item.amount) || 0;
        if (item.type === 'expense') summary.expenses += Number(item.amount) || 0;
        if (item.type === 'transfer') summary.transfers += Number(item.amount) || 0;

        return summary;
      },
      {
        income: 0,
        expenses: 0,
        transfers: 0,
      }
    );
  }, [scheduledItems]);

  async function handleSave(item) {
    await onSaveScheduledItem(item);
    setSelectedItem(null);
  }

  function handleAddNew() {
    setSelectedItem(createNewScheduledItem());
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Scheduled Items
          </p>
          <h2 className="text-3xl font-bold text-slate-950">
            Income, expenses, and transfers
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Add or edit the recurring rules that generate the pay period planner.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium outline-none focus:border-slate-900"
          >
            <option value="all">All items</option>
            <option value="income">Income only</option>
            <option value="expense">Expenses only</option>
            <option value="transfer">Transfers only</option>
          </select>

          <button
            type="button"
            onClick={handleAddNew}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <Plus size={16} />
            Add Scheduled Item
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">
            Active Income Items
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {formatCurrency(totals.income, currency)}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Sum of configured item amounts.
          </p>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">
            Active Expense Items
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {formatCurrency(totals.expenses, currency)}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Sum of configured item amounts.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">
            Active Transfer Items
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {formatCurrency(totals.transfers, currency)}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Chequing to savings transfers.
          </p>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-900 text-white">
              <th className="px-4 py-3 text-left text-sm font-bold">Name</th>
              <th className="px-4 py-3 text-left text-sm font-bold">Type</th>
              <th className="px-4 py-3 text-left text-sm font-bold">Category</th>
              <th className="px-4 py-3 text-left text-sm font-bold">Frequency</th>
              <th className="px-4 py-3 text-right text-sm font-bold">Amount</th>
              <th className="px-4 py-3 text-right text-sm font-bold">Due</th>
              <th className="px-4 py-3 text-center text-sm font-bold">Line Items</th>
              <th className="px-4 py-3 text-center text-sm font-bold">Active</th>
              <th className="px-4 py-3 text-right text-sm font-bold">Action</th>
            </tr>
          </thead>

          <tbody>
            {filteredItems.map((item) => (
              <tr key={item.id} className="border-t border-slate-200">
                <td className="px-4 py-3 text-sm font-semibold text-slate-950">
                  {item.name}
                </td>

                <td className="px-4 py-3 text-sm">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-bold ${getTypeClass(
                      item.type
                    )}`}
                  >
                    {formatType(item.type)}
                  </span>
                </td>

                <td className="px-4 py-3 text-sm text-slate-600">
                  <span className="block max-w-[160px] truncate">
                    {getCategoryName(item.categoryId, categories)}
                  </span>
                </td>

                <td className="px-4 py-3 text-sm text-slate-600">
                  {formatFrequency(item.frequency)}
                </td>

                <td className="px-4 py-3 text-right text-sm font-semibold text-slate-950">
                  {formatCurrency(item.amount, currency)}
                </td>

                <td className="px-4 py-3 text-right text-sm text-slate-600">
                  {item.frequency === 'monthly' && item.dueDay
                    ? `Day ${item.dueDay}`
                    : null}

                  {item.frequency === 'annual' && item.dueMonth && item.dueDay
                    ? `Month ${item.dueMonth}, Day ${item.dueDay}`
                    : null}

                  {item.frequency === 'biweekly' ? item.startDate : null}

                  {item.frequency === 'manual' ? 'Manual' : null}
                </td>

                <td className="px-4 py-3 text-center text-sm">
                  {item.allowLineItems ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-1 text-xs font-bold text-purple-700">
                      <ListChecks size={13} />
                      Yes
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500">
                      No
                    </span>
                  )}
                </td>

                <td className="px-4 py-3 text-center text-sm">
                  {item.active ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700">
                      Active
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500">
                      Inactive
                    </span>
                  )}
                </td>

                <td className="px-4 py-3 text-right text-sm">
                  <button
                    type="button"
                    onClick={() => setSelectedItem(item)}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <Pencil size={14} />
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {selectedItem ? (
        <ScheduledItemForm
          item={selectedItem}
          categories={categories}
          settings={settings}
          onCancel={() => setSelectedItem(null)}
          onSave={handleSave}
        />
      ) : null}
    </div>
  );
}
