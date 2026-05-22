import { useMemo, useState } from 'react';
import {
  Copy,
  ListChecks,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Trash2,
} from 'lucide-react';
import AlertList from '../components/AlertList';
import { formatCurrency } from '../logic/projectionLogic';
import {
  getCategoryTypesForScheduledType,
  getMonthlyEquivalentAmount,
  getProjectionType,
  getScheduledItemOccurrences,
  isValidDateString,
  normalizeScheduledItem,
  scheduledItemFrequencies,
  scheduledItemTypes,
} from '../logic/scheduledItemLogic';

const typeLabels = {
  income: 'Income',
  expense: 'Expense',
  transfer: 'Transfer',
  savings: 'Savings',
  debt: 'Debt',
  general: 'General',
};

const frequencyLabels = {
  once: 'Once',
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

function formatType(type) {
  return typeLabels[type] || 'Expense';
}

function formatFrequency(frequency) {
  return frequencyLabels[frequency] || 'Monthly';
}

function getTypeClass(type) {
  if (type === 'income') return 'bg-emerald-100 text-emerald-800';
  if (type === 'expense') return 'bg-blue-100 text-blue-800';
  if (type === 'transfer' || type === 'savings') {
    return 'bg-teal-100 text-teal-800';
  }
  if (type === 'debt') return 'bg-red-100 text-red-800';
  return 'bg-slate-100 text-slate-700';
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

function getToday() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

function getDatePlusDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function formatDueDate(dateString) {
  if (!dateString || !isValidDateString(dateString)) {
    return 'Not scheduled';
  }

  return new Date(`${dateString}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

function getDueDisplay(item) {
  if (item.frequency === 'monthly') {
    return item.dueDay ? `Day ${item.dueDay}` : formatDueDate(item.startDate);
  }

  if (item.frequency === 'yearly') {
    if (item.dueMonth && item.dueDay) {
      return `Month ${item.dueMonth}, day ${item.dueDay}`;
    }

    return formatDueDate(item.startDate);
  }

  return formatDueDate(item.startDate);
}

function createNewScheduledItem(settings) {
  const startDate =
    settings?.payPeriodAnchorDate && isValidDateString(settings.payPeriodAnchorDate)
      ? settings.payPeriodAnchorDate
      : new Date().toISOString().slice(0, 10);

  return normalizeScheduledItem({
    id: `scheduled-${crypto.randomUUID()}`,
    name: '',
    type: 'expense',
    amount: 0,
    frequency: 'monthly',
    startDate,
    endDate: null,
    dueDay: Number(startDate.slice(8, 10)),
    dueMonth: Number(startDate.slice(5, 7)),
    categoryId: null,
    accountId: 'acct-chequing',
    savingsBucketId: null,
    active: true,
    allowLineItems: false,
    notes: '',
    isCustom: true,
    createdAt: new Date().toISOString(),
  });
}

function getOrderedCategoryOptions(categories, type, selectedCategoryId) {
  const allowedTypes = getCategoryTypesForScheduledType(type);
  const selectedCategory = categories.find(
    (category) => category.id === selectedCategoryId
  );
  const options = categories
    .filter((category) => {
      return (
        allowedTypes.includes(category.type) &&
        (category.active !== false || category.id === selectedCategoryId)
      );
    })
    .sort((left, right) => {
      return (
        allowedTypes.indexOf(left.type) - allowedTypes.indexOf(right.type) ||
        Number(left.sortOrder || 0) - Number(right.sortOrder || 0) ||
        left.name.localeCompare(right.name)
      );
    });

  if (
    selectedCategory &&
    !options.some((category) => category.id === selectedCategory.id)
  ) {
    return [...options, selectedCategory];
  }

  return options;
}

function getAssignmentRuleLabel(rule) {
  if (rule === 'same-pay-period') {
    return 'same pay period as the due date';
  }

  return 'previous pay period before the due date';
}

function validateScheduledItem(formState) {
  const name = String(formState.name || '').trim();
  const amount = Number(formState.amount);
  const dueDay = formState.dueDay === '' ? null : Number(formState.dueDay);
  const startDateIsValid = isValidDateString(formState.startDate);
  const endDateIsValid =
    !formState.endDate || isValidDateString(formState.endDate);

  if (!name) return 'Name is required.';
  if (formState.amount === '') return 'Amount is required.';
  if (!Number.isFinite(amount)) return 'Amount must be a valid number.';
  if (amount < 0) return 'Amount must be greater than or equal to 0.';
  if (!scheduledItemTypes.includes(formState.type)) return 'Choose a valid type.';
  if (!scheduledItemFrequencies.includes(formState.frequency)) {
    return 'Choose a valid frequency.';
  }

  if (
    ['once', 'weekly', 'biweekly', 'yearly'].includes(formState.frequency) &&
    !startDateIsValid
  ) {
    return 'Start date is required for this frequency.';
  }

  if (formState.frequency === 'monthly' && !dueDay && !startDateIsValid) {
    return 'Monthly items need a due day or a valid start date.';
  }

  if (dueDay !== null && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)) {
    return 'Due day must be between 1 and 31.';
  }

  if (!endDateIsValid) return 'End date must be a valid date.';

  if (
    formState.endDate &&
    startDateIsValid &&
    new Date(`${formState.endDate}T00:00:00`) <=
      new Date(`${formState.startDate}T00:00:00`)
  ) {
    return 'End date must be after the start date.';
  }

  return '';
}

function ScheduledItemForm({ item, categories, settings, onCancel, onSave }) {
  const normalizedItem = normalizeScheduledItem(item);
  const [formState, setFormState] = useState({
    ...normalizedItem,
    amount: String(normalizedItem.amount ?? 0),
    dueDay: normalizedItem.dueDay ?? '',
    dueMonth: normalizedItem.dueMonth ?? '',
    endDate: normalizedItem.endDate ?? '',
    notes: normalizedItem.notes ?? '',
    categoryId: normalizedItem.categoryId ?? '',
    active: normalizedItem.active ?? true,
    allowLineItems: normalizedItem.allowLineItems ?? false,
  });
  const [errorMessage, setErrorMessage] = useState('');

  const categoryOptions = useMemo(
    () =>
      getOrderedCategoryOptions(
        categories,
        formState.type,
        formState.categoryId
      ),
    [categories, formState.categoryId, formState.type]
  );

  function updateField(fieldName, value) {
    setFormState((current) => ({
      ...current,
      [fieldName]: value,
    }));
    setErrorMessage('');
  }

  function handleSubmit(event) {
    event.preventDefault();

    const validationError = validateScheduledItem(formState);

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    const cleanedItem = normalizeScheduledItem({
      ...formState,
      name: String(formState.name || '').trim(),
      amount: Number(formState.amount),
      dueDay: formState.dueDay === '' ? null : Number(formState.dueDay),
      dueMonth: formState.dueMonth === '' ? null : Number(formState.dueMonth),
      endDate: formState.endDate || null,
      notes: String(formState.notes || '').trim(),
      categoryId: formState.categoryId || null,
      active: Boolean(formState.active),
      allowLineItems: Boolean(formState.allowLineItems),
      updatedAt: new Date().toISOString(),
    });

    onSave(cleanedItem);
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[500px] overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-2xl">
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

      {errorMessage ? (
        <div
          className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
          role="alert"
        >
          {errorMessage}
        </div>
      ) : null}

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
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-900"
            >
              {scheduledItemTypes.map((type) => (
                <option key={type} value={type}>
                  {formatType(type)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Frequency</span>
            <select
              value={formState.frequency}
              onChange={(event) => updateField('frequency', event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-900"
            >
              {scheduledItemFrequencies.map((frequency) => (
                <option key={frequency} value={frequency}>
                  {formatFrequency(frequency)}
                </option>
              ))}
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
            />
          </label>
        </div>

        <div className="grid grid-cols-3 gap-3">
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
            <span className="text-sm font-medium text-slate-700">Due Month</span>
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

          <label className="block">
            <span className="text-sm font-medium text-slate-700">End Date</span>
            <input
              type="date"
              value={formState.endDate}
              onChange={(event) => updateField('endDate', event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
            />
          </label>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-800">Timing guide</p>
          <p className="mt-1 text-sm text-slate-600">
            Monthly items use the due day or start date day and are placed in the{' '}
            {getAssignmentRuleLabel(settings?.monthlyBillAssignmentRule)}.
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

function SummaryCard({ label, value, helper }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{helper}</p>
    </div>
  );
}

export default function ScheduledItems({
  scheduledItems,
  categories = [],
  settings,
  alerts = [],
  onAlertAction,
  onDismissAlert,
  onSaveScheduledItem,
  onDuplicateScheduledItem,
  onDeleteScheduledItem,
}) {
  const [selectedItem, setSelectedItem] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [frequencyFilter, setFrequencyFilter] = useState('all');
  const [activeFilter, setActiveFilter] = useState('active');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const currency = settings?.currency || 'CAD';

  const normalizedItems = useMemo(
    () => scheduledItems.map((item) => normalizeScheduledItem(item)),
    [scheduledItems]
  );

  const filteredItems = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return normalizedItems
      .filter((item) => {
        if (normalizedSearch && !item.name.toLowerCase().includes(normalizedSearch)) {
          return false;
        }

        if (typeFilter !== 'all' && item.type !== typeFilter) return false;
        if (frequencyFilter !== 'all' && item.frequency !== frequencyFilter) {
          return false;
        }
        if (activeFilter === 'active' && !item.active) return false;
        if (activeFilter === 'inactive' && item.active) return false;
        if (categoryFilter === '__uncategorized' && item.categoryId) return false;
        if (
          categoryFilter !== 'all' &&
          categoryFilter !== '__uncategorized' &&
          item.categoryId !== categoryFilter
        ) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        const typeOrder = {
          income: 1,
          expense: 2,
          debt: 3,
          transfer: 4,
          savings: 5,
          general: 6,
        };
        return (
          (typeOrder[a.type] || 99) - (typeOrder[b.type] || 99) ||
          a.name.localeCompare(b.name)
        );
      });
  }, [
    activeFilter,
    categoryFilter,
    frequencyFilter,
    normalizedItems,
    searchTerm,
    typeFilter,
  ]);

  const upcomingItems = useMemo(() => {
    const startDate = getToday();
    const endDate = getDatePlusDays(startDate, 30);

    return normalizedItems
      .flatMap((item) => {
        return getScheduledItemOccurrences(item, startDate, endDate).map(
          (dueDate) => ({
            item,
            dueDate,
          })
        );
      })
      .sort((left, right) => left.dueDate.localeCompare(right.dueDate))
      .slice(0, 12);
  }, [normalizedItems]);

  const summary = useMemo(() => {
    return normalizedItems.reduce(
      (result, item) => {
        if (!item.active) {
          return result;
        }

        result.activeItems += 1;

        if (getProjectionType(item.type) === 'expense') {
          result.monthlyExpenses += getMonthlyEquivalentAmount(item);
        }

        if (getProjectionType(item.type) === 'income') {
          result.monthlyIncome += getMonthlyEquivalentAmount(item);
        }

        return result;
      },
      {
        activeItems: 0,
        monthlyExpenses: 0,
        monthlyIncome: 0,
      }
    );
  }, [normalizedItems]);

  async function handleSave(item) {
    try {
      await onSaveScheduledItem(item);
      setSelectedItem(null);
      setMessage('Scheduled item saved.');
      setErrorMessage('');
    } catch (error) {
      console.error(error);
      setErrorMessage('Could not save scheduled item.');
      setMessage('');
    }
  }

  function handleAddNew() {
    setSelectedItem(createNewScheduledItem(settings));
    setMessage('');
    setErrorMessage('');
  }

  async function handleToggleActive(item) {
    try {
      await onSaveScheduledItem({
        ...item,
        active: !item.active,
        updatedAt: new Date().toISOString(),
      });
      setMessage(item.active ? 'Scheduled item deactivated.' : 'Scheduled item activated.');
      setErrorMessage('');
    } catch (error) {
      console.error(error);
      setErrorMessage('Could not update scheduled item status.');
      setMessage('');
    }
  }

  async function handleDuplicate(item) {
    try {
      await onDuplicateScheduledItem(item);
      setMessage('Scheduled item duplicated.');
      setErrorMessage('');
    } catch (error) {
      console.error(error);
      setErrorMessage('Could not duplicate scheduled item.');
      setMessage('');
    }
  }

  async function handleDelete(item) {
    const confirmed = window.confirm(
      'Delete this scheduled item? Deactivating is safer if you may need it later.'
    );

    if (!confirmed) {
      return;
    }

    try {
      await onDeleteScheduledItem(item.id);
      setMessage('Scheduled item deleted.');
      setErrorMessage('');
    } catch (error) {
      console.error(error);
      setErrorMessage('Could not delete scheduled item.');
      setMessage('');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Scheduled Items
          </p>
          <h2 className="text-3xl font-bold text-slate-950">
            Income, expenses, and transfers
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Manage the planned items that generate the pay period planner.
            Inactive items stay saved but do not affect projections.
          </p>
        </div>

        <button
          type="button"
          onClick={handleAddNew}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <Plus size={16} />
          Add Scheduled Item
        </button>
      </div>

      {message ? (
        <div
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
          role="status"
        >
          {message}
        </div>
      ) : null}

      {errorMessage ? (
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
          role="alert"
        >
          {errorMessage}
        </div>
      ) : null}

      <AlertList
        title="Scheduled Item Warnings"
        helper="Upcoming bills and scheduled item setup issues."
        alerts={alerts}
        maxItems={4}
        onAction={onAlertAction}
        onDismiss={onDismissAlert}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Active Items"
          value={summary.activeItems}
          helper="Items currently affecting the planner."
        />
        <SummaryCard
          label="Monthly Expenses"
          value={formatCurrency(summary.monthlyExpenses, currency)}
          helper="Monthly equivalent of active expense items."
        />
        <SummaryCard
          label="Monthly Income"
          value={formatCurrency(summary.monthlyIncome, currency)}
          helper="Monthly equivalent of active income items."
        />
        <SummaryCard
          label="Upcoming Next 30 Days"
          value={upcomingItems.filter((entry) => entry.item.active).length}
          helper="Active scheduled occurrences."
        />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="block xl:col-span-1">
            <span className="text-sm font-medium text-slate-700">Search</span>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              placeholder="Search by name"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Type</span>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
            >
              <option value="all">All types</option>
              {scheduledItemTypes.map((type) => (
                <option key={type} value={type}>
                  {formatType(type)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Frequency</span>
            <select
              value={frequencyFilter}
              onChange={(event) => setFrequencyFilter(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
            >
              <option value="all">All frequencies</option>
              {scheduledItemFrequencies.map((frequency) => (
                <option key={frequency} value={frequency}>
                  {formatFrequency(frequency)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Status</span>
            <select
              value={activeFilter}
              onChange={(event) => setActiveFilter(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="all">All</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Category</span>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
            >
              <option value="all">All categories</option>
              <option value="__uncategorized">Uncategorized</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                  {category.active === false ? ' (archived)' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px]">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="px-4 py-3 text-left text-sm font-bold">Name</th>
                <th className="px-4 py-3 text-left text-sm font-bold">Type</th>
                <th className="px-4 py-3 text-left text-sm font-bold">Category</th>
                <th className="px-4 py-3 text-left text-sm font-bold">Frequency</th>
                <th className="px-4 py-3 text-right text-sm font-bold">Amount</th>
                <th className="px-4 py-3 text-left text-sm font-bold">Due</th>
                <th className="px-4 py-3 text-center text-sm font-bold">Line Items</th>
                <th className="px-4 py-3 text-center text-sm font-bold">Status</th>
                <th className="px-4 py-3 text-right text-sm font-bold">Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan="9" className="px-4 py-8 text-center text-sm text-slate-500">
                    No scheduled items match these filters.
                  </td>
                </tr>
              ) : null}

              {filteredItems.map((item) => (
                <tr
                  key={item.id}
                  className={`border-t border-slate-200 ${
                    item.active ? 'bg-white' : 'bg-slate-50 text-slate-500'
                  }`}
                >
                  <td className="px-4 py-3 text-sm font-semibold text-slate-950">
                    <span className="block max-w-[220px] truncate">
                      {item.name || 'Unnamed item'}
                    </span>
                    {item.endDate ? (
                      <span className="text-xs font-normal text-slate-500">
                        Ends {formatDueDate(item.endDate)}
                      </span>
                    ) : null}
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

                  <td className="px-4 py-3 text-sm text-slate-600">
                    {getDueDisplay(item)}
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
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedItem(item)}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        <Pencil size={14} />
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDuplicate(item)}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        <Copy size={14} />
                        Duplicate
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleActive(item)}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        {item.active ? <PowerOff size={14} /> : <Power size={14} />}
                        {item.active ? 'Deactivate' : 'Activate'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h3 className="text-xl font-bold text-slate-950">
            Upcoming next 30 days
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Upcoming scheduled occurrences based on the current date.
          </p>
        </div>

        {upcomingItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            No scheduled items are due in the next 30 days.
          </div>
        ) : (
          <div className="grid gap-3">
            {upcomingItems.map(({ item, dueDate }) => (
              <div
                key={`${item.id}-${dueDate}`}
                className="grid gap-3 rounded-xl border border-slate-200 px-4 py-3 md:grid-cols-[minmax(0,1fr)_120px_140px_160px_100px]"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-950">
                    {item.name}
                  </p>
                  <p className="text-sm text-slate-500">{formatType(item.type)}</p>
                </div>
                <div className="text-sm font-semibold text-slate-950">
                  {formatCurrency(item.amount, currency)}
                </div>
                <div className="text-sm text-slate-600">
                  {formatDueDate(dueDate)}
                </div>
                <div className="truncate text-sm text-slate-600">
                  {getCategoryName(item.categoryId, categories)}
                </div>
                <div>
                  {item.active ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700">
                      Active
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500">
                      Inactive
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
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
