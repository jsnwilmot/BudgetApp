import { useMemo, useState } from 'react';
import { Archive, Pencil, Plus, RotateCcw } from 'lucide-react';

const categoryTypes = [
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'savings', label: 'Savings' },
  { value: 'debt', label: 'Debt' },
  { value: 'general', label: 'General' },
];

const defaultCategoryColor = '#64748b';
const defaultCategoryIcon = 'tag';

function getColorInputValue(value) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || ''))
    ? value
    : defaultCategoryColor;
}

function formatType(type) {
  return categoryTypes.find((option) => option.value === type)?.label || 'General';
}

function createCategory(categories) {
  return {
    id: `cat-${crypto.randomUUID()}`,
    name: '',
    type: 'expense',
    color: defaultCategoryColor,
    icon: defaultCategoryIcon,
    active: true,
    sortOrder: categories.length + 1,
    createdAt: new Date().toISOString(),
  };
}

function CategoryForm({ category, categories, onCancel, onSave }) {
  const [formState, setFormState] = useState({
    ...category,
    name: category.name || '',
    type: category.type || 'expense',
    color: category.color || defaultCategoryColor,
    icon: category.icon || defaultCategoryIcon,
    active: category.active !== false,
  });
  const [errorMessage, setErrorMessage] = useState('');

  function updateField(fieldName, value) {
    setFormState((current) => ({
      ...current,
      [fieldName]: value,
    }));
    setErrorMessage('');
  }

  function handleSubmit(event) {
    event.preventDefault();

    const cleanedCategory = {
      ...formState,
      name: String(formState.name || '').trim(),
      type: formState.type || 'general',
      color: String(formState.color || defaultCategoryColor).trim(),
      icon: String(formState.icon || defaultCategoryIcon).trim(),
      active: Boolean(formState.active),
      updatedAt: new Date().toISOString(),
    };

    if (!cleanedCategory.name) {
      setErrorMessage('Category name is required.');
      return;
    }

    if (!categoryTypes.some((option) => option.value === cleanedCategory.type)) {
      setErrorMessage('Choose a supported category type.');
      return;
    }

    const duplicate = categories.some((existingCategory) => {
      return (
        existingCategory.id !== cleanedCategory.id &&
        existingCategory.active !== false &&
        cleanedCategory.active &&
        existingCategory.type === cleanedCategory.type &&
        String(existingCategory.name || '').trim().toLowerCase() ===
          cleanedCategory.name.toLowerCase()
      );
    });

    if (duplicate) {
      setErrorMessage('An active category with this name already exists for this type.');
      return;
    }

    onSave(cleanedCategory);
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {category.createdAt ? 'Edit Category' : 'Add Category'}
          </p>
          <h3 className="mt-1 text-2xl font-bold text-slate-950">
            {formState.name || 'New category'}
          </h3>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Cancel
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
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Name</span>
            <input
              type="text"
              value={formState.name}
              onChange={(event) => updateField('name', event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              placeholder="Example: Groceries"
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Type</span>
            <select
              value={formState.type}
              onChange={(event) => updateField('type', event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
            >
              {categoryTypes.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Color</span>
            <div className="mt-1 flex gap-2">
              <input
                type="color"
                value={getColorInputValue(formState.color)}
                onChange={(event) => updateField('color', event.target.value)}
                className="h-10 w-12 rounded-lg border border-slate-300 bg-white p-1"
                aria-label="Category color"
              />
              <input
                type="text"
                value={formState.color}
                onChange={(event) => updateField('color', event.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
                placeholder="#64748b"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Icon text</span>
            <input
              type="text"
              value={formState.icon}
              onChange={(event) => updateField('icon', event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              placeholder="tag"
            />
          </label>
        </div>

        <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
          <input
            type="checkbox"
            checked={formState.active}
            onChange={(event) => updateField('active', event.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-sm font-medium text-slate-700">
            Active in category pickers
          </span>
        </label>

        <button
          type="submit"
          className="w-full rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Save Category
        </button>
      </form>
    </section>
  );
}

export default function Categories({
  categories = [],
  onSaveCategory,
  onArchiveCategory,
  onResetCategories,
}) {
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const groupedCategories = useMemo(() => {
    return categoryTypes.map((typeOption) => ({
      ...typeOption,
      categories: categories
        .filter((category) => category.type === typeOption.value)
        .sort(
          (left, right) =>
            Number(left.sortOrder || 0) - Number(right.sortOrder || 0) ||
            left.name.localeCompare(right.name)
        ),
    }));
  }, [categories]);

  async function handleSave(category) {
    try {
      await onSaveCategory(category);
      setSelectedCategory(null);
      setMessage('Category saved.');
      setErrorMessage('');
    } catch (error) {
      console.error(error);
      setErrorMessage('Could not save category.');
      setMessage('');
    }
  }

  async function handleArchive(category) {
    const confirmed = window.confirm(
      'Archive this category? Older records will still show its name.'
    );

    if (!confirmed) {
      return;
    }

    try {
      await onArchiveCategory(category.id);
      setMessage('Category archived. Older records can still display it.');
      setErrorMessage('');
    } catch (error) {
      console.error(error);
      setErrorMessage('Could not archive category.');
      setMessage('');
    }
  }

  async function handleReset() {
    const confirmed = window.confirm(
      'Reset categories to the starter list? This replaces your category list.'
    );

    if (!confirmed) {
      return;
    }

    try {
      await onResetCategories();
      setSelectedCategory(null);
      setMessage('Categories reset to defaults.');
      setErrorMessage('');
    } catch (error) {
      console.error(error);
      setErrorMessage('Could not reset categories.');
      setMessage('');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Categories
          </p>
          <h2 className="text-3xl font-bold text-slate-950">
            Category management
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Categories keep scheduled items, reports, and future budgets using
            the same labels. Archived categories stay readable in older records.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              setSelectedCategory(createCategory(categories));
              setMessage('');
              setErrorMessage('');
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <Plus size={16} />
            Add Category
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            <RotateCcw size={16} />
            Reset Defaults
          </button>
        </div>
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

      {selectedCategory ? (
        <CategoryForm
          key={selectedCategory.id}
          category={selectedCategory}
          categories={categories}
          onCancel={() => setSelectedCategory(null)}
          onSave={handleSave}
        />
      ) : null}

      <section className="space-y-5">
        {categories.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
            <h3 className="text-lg font-semibold text-slate-950">
              No categories yet
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Add a category or reset to defaults to start organizing reports.
            </p>
          </div>
        ) : null}

        {groupedCategories.map((group) => {
          if (group.categories.length === 0) {
            return null;
          }

          return (
            <section
              key={group.value}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="border-b border-slate-200 px-5 py-4">
                <h3 className="text-xl font-bold text-slate-950">
                  {group.label}
                </h3>
              </div>

              <div className="divide-y divide-slate-200">
                {group.categories.map((category) => (
                  <div
                    key={category.id}
                    className="grid gap-4 px-5 py-4 md:grid-cols-[minmax(0,1fr)_120px_120px_180px]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="h-4 w-4 shrink-0 rounded-full border border-slate-200"
                        style={{ backgroundColor: category.color }}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-950">
                          {category.name}
                        </p>
                        <p className="truncate text-sm text-slate-500">
                          Icon text: {category.icon || defaultCategoryIcon}
                        </p>
                      </div>
                    </div>

                    <div className="text-sm text-slate-600">
                      {formatType(category.type)}
                    </div>

                    <div>
                      {category.active !== false ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700">
                          Active
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500">
                          Archived
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap justify-start gap-2 md:justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCategory(category);
                          setMessage('');
                          setErrorMessage('');
                        }}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        <Pencil size={14} />
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => handleArchive(category)}
                        disabled={category.active === false}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Archive size={14} />
                        Archive
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </section>
    </div>
  );
}
