import { useState } from "react";
import DataManagement from "../components/DataManagement";

const currencyOptions = ["CAD", "USD"];
const payFrequencyOptions = [7, 14, 28, 30];
const projectionMonthOptions = [3, 6, 12, 18, 24];
const billAssignmentOptions = [
  {
    value: "previous-pay-period",
    label: "Previous pay period before due date"
  },
  {
    value: "same-pay-period",
    label: "Same pay period as due date"
  }
];

function settingsToForm(settings) {
  return {
    currency: settings.currency || "CAD",
    payPeriodAnchorDate: settings.payPeriodAnchorDate || "",
    payFrequencyDays: String(settings.payFrequencyDays || 14),
    projectionMonths: String(settings.projectionMonths || 12),
    monthlyBillAssignmentRule:
      settings.monthlyBillAssignmentRule || "previous-pay-period"
  };
}

function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && value === date.toISOString().slice(0, 10);
}

function validateSettings(formState) {
  if (!currencyOptions.includes(formState.currency)) {
    return "Choose CAD or USD for currency.";
  }

  if (!isValidDateString(formState.payPeriodAnchorDate)) {
    return "Enter a valid pay period anchor date.";
  }

  if (!payFrequencyOptions.includes(Number(formState.payFrequencyDays))) {
    return "Choose a supported pay frequency.";
  }

  if (!projectionMonthOptions.includes(Number(formState.projectionMonths))) {
    return "Choose a supported projection range.";
  }

  if (
    !billAssignmentOptions.some(
      (option) => option.value === formState.monthlyBillAssignmentRule
    )
  ) {
    return "Choose a monthly bill assignment rule.";
  }

  return "";
}

function buildSettingsPayload(formState) {
  return {
    currency: formState.currency,
    payPeriodAnchorDate: formState.payPeriodAnchorDate,
    payFrequencyDays: Number(formState.payFrequencyDays),
    projectionMonths: Number(formState.projectionMonths),
    monthlyBillAssignmentRule: formState.monthlyBillAssignmentRule
  };
}

function buildProjectionChangeWarnings(formState, settings) {
  const warnings = [];

  if (formState.payPeriodAnchorDate !== settings.payPeriodAnchorDate) {
    warnings.push(
      "Changing the anchor date may move planner entries to different pay periods."
    );
  }

  if (Number(formState.payFrequencyDays) !== Number(settings.payFrequencyDays)) {
    warnings.push(
      "Changing pay frequency rebuilds the spacing and number of visible pay periods."
    );
  }

  if (Number(formState.projectionMonths) !== Number(settings.projectionMonths)) {
    warnings.push(
      "Changing projection range changes which pay periods are visible, but saved entries outside the range remain stored."
    );
  }

  return warnings;
}

export default function Settings({
  settings,
  appData,
  onSaveSettings,
  onResetSettings,
  onImportData,
  onRepairLocalData,
  onResetLocalData
}) {
  const [formState, setFormState] = useState(() => settingsToForm(settings));
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const projectionChangeWarnings = buildProjectionChangeWarnings(
    formState,
    settings
  );

  function updateField(fieldName, value) {
    setFormState((current) => ({
      ...current,
      [fieldName]: value
    }));
    setMessage("");
    setErrorMessage("");
  }

  async function handleSave(event) {
    event.preventDefault();

    const validationError = validateSettings(formState);

    if (validationError) {
      setErrorMessage(validationError);
      setMessage("");
      return;
    }

    try {
      const savedSettings = await onSaveSettings(buildSettingsPayload(formState));
      setFormState(settingsToForm(savedSettings));
      setMessage("Settings saved. Planner projections have been updated.");
      setErrorMessage("");
    } catch (error) {
      console.error(error);
      setErrorMessage("Could not save settings.");
      setMessage("");
    }
  }

  function handleCancel() {
    setFormState(settingsToForm(settings));
    setMessage("Unsaved changes cancelled.");
    setErrorMessage("");
  }

  async function handleReset() {
    try {
      const defaultSettings = await onResetSettings();
      setFormState(settingsToForm(defaultSettings));
      setMessage("Settings reset to defaults.");
      setErrorMessage("");
    } catch (error) {
      console.error(error);
      setErrorMessage("Could not reset settings.");
      setMessage("");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Settings
        </p>
        <h2 className="text-2xl font-bold text-slate-950 sm:text-3xl">
          Budget planner settings
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Update the local planner settings used by dashboard projections,
          reports, and pay period planning.
        </p>
      </div>

      <section className="max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Planner Settings
          </p>
          <h3 className="mt-1 text-2xl font-bold text-slate-950">
            Projection setup
          </h3>
          <p className="mt-2 text-sm text-slate-600">
            These settings are saved locally and recalculate the planner as soon
            as you save.
          </p>
        </div>

        {message && (
          <div
            className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
            role="status"
          >
            {message}
          </div>
        )}

        {errorMessage && (
          <div
            className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
            role="alert"
          >
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Currency
              </span>
              <select
                value={formState.currency}
                onChange={(event) => updateField("currency", event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900"
              >
                {currencyOptions.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Pay period anchor date
              </span>
              <input
                type="date"
                value={formState.payPeriodAnchorDate}
                onChange={(event) =>
                  updateField("payPeriodAnchorDate", event.target.value)
                }
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900"
                required
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Pay frequency
              </span>
              <select
                value={formState.payFrequencyDays}
                onChange={(event) =>
                  updateField("payFrequencyDays", event.target.value)
                }
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900"
              >
                {payFrequencyOptions.map((days) => (
                  <option key={days} value={days}>
                    Every {days} days
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Projection range
              </span>
              <select
                value={formState.projectionMonths}
                onChange={(event) =>
                  updateField("projectionMonths", event.target.value)
                }
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900"
              >
                {projectionMonthOptions.map((months) => (
                  <option key={months} value={months}>
                    {months} months
                  </option>
                ))}
              </select>
            </label>

            <label className="block md:col-span-2">
              <span className="text-sm font-medium text-slate-700">
                Monthly bill assignment rule
              </span>
              <select
                value={formState.monthlyBillAssignmentRule}
                onChange={(event) =>
                  updateField("monthlyBillAssignmentRule", event.target.value)
                }
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900"
              >
                {billAssignmentOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                Monthly items are placed according to this rule when projections
                rebuild.
              </p>
            </label>
          </div>

          {projectionChangeWarnings.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold">Projection changes</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {projectionChangeWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
            className="min-h-11 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Save Settings
            </button>

            <button
              type="button"
              onClick={handleCancel}
            className="min-h-11 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Cancel Changes
            </button>

            <button
              type="button"
              onClick={handleReset}
            className="min-h-11 rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              Reset to Defaults
            </button>
          </div>
        </form>
      </section>

      <DataManagement
        appData={appData}
        onImportData={onImportData}
        onRepairLocalData={onRepairLocalData}
        onResetLocalData={onResetLocalData}
      />
    </div>
  );
}
