import { useMemo, useRef, useState } from "react";
import {
  createBackupSnapshot,
  getBackupFileName,
  validateBackupFile
} from "../services/backupService";
import {
  appSettings,
  budgetTargets,
  categories,
  getDemoAppState,
  getEmptyAppState
} from "../data/seedData";
import {
  getCurrentAppDataVersion,
  getCurrentAppVersion,
  getDataHealthSummary,
  getSafeAppData
} from "../data/migrations";
import { downloadTextFile } from "../utils/downloadFile";
import { rowsToCsv } from "../utils/csv";

const PRIMARY_STORAGE_KEY = "budgetAppData";

const POSSIBLE_STORAGE_KEYS = [
  "budgetAppData",
  "budget-planner-state",
  "budgetPlannerState",
  "budgetPlannerData",
  "payPlannerData",
  "plannerData"
];

const defaultAppState = {
  appVersion: getCurrentAppVersion(),
  appDataVersion: getCurrentAppDataVersion(),
  appMetadata: {},
  settings: appSettings,
  budgetTargets,
  categories,
  planner: {
    rows: [],
    payPeriods: [],
    income: [],
    fixedExpenses: [],
    miscPayments: [],
    miscExpenses: []
  },
  savings: {
    buckets: [],
    transfers: []
  },
  transfers: []
};

function getActiveStorageKey() {
  for (const key of POSSIBLE_STORAGE_KEYS) {
    const stored = localStorage.getItem(key);

    if (stored) {
      return key;
    }
  }

  return PRIMARY_STORAGE_KEY;
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getStoredAppData() {
  const activeKey = getActiveStorageKey();
  const stored = localStorage.getItem(activeKey);

  if (!stored) {
    return {
      storageKey: activeKey,
      data: defaultAppState
    };
  }

  const parsed = safeJsonParse(stored);

  if (!parsed || typeof parsed !== "object") {
    return {
      storageKey: activeKey,
      data: defaultAppState
    };
  }

  return {
    storageKey: activeKey,
    data: parsed
  };
}

function saveStoredAppData(data) {
  const activeKey = getActiveStorageKey();
  localStorage.setItem(activeKey, JSON.stringify(data));

  return activeKey;
}

function getDatedFileName(prefix, extension) {
  const date = new Date().toISOString().slice(0, 10);
  return `${prefix}-${date}.${extension}`;
}

function formatBackupDate(timestamp) {
  if (!timestamp) {
    return "No backup exported yet.";
  }

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? "No backup exported yet."
    : date.toLocaleString();
}

function getCountRows(summary = {}) {
  return [
    ["Settings", summary.settings],
    ["Accounts", summary.accounts],
    ["Transactions", summary.transactions],
    ["Scheduled items", summary.scheduledItems],
    ["Savings buckets", summary.savingsBuckets],
    ["Categories", summary.categories],
    ["Budget targets", summary.budgetTargets],
    ["Manual adjustments", summary.manualAdjustments],
    ["Savings adjustments", summary.savingsAdjustments],
    ["Transfers", summary.transfers],
    ["Planner entries", summary.plannerEntries]
  ].map(([label, value]) => ({
    label,
    value: Number.isFinite(Number(value)) ? Number(value) : 0
  }));
}

function normalizeMoney(value) {
  if (value === "" || value === null || value === undefined) {
    return 0;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function getArrayFromPossiblePaths(data, paths) {
  for (const path of paths) {
    const value = path.reduce((current, key) => current?.[key], data);

    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

function calculateTransferTotals(bucketId, transfers = []) {
  return transfers.reduce(
    (totals, transfer) => {
      const amount = normalizeMoney(transfer.amount);

      const toBucketId =
        transfer.toBucketId ||
        transfer.toBucket ||
        transfer.destinationBucketId ||
        transfer.bucketToId;

      const fromBucketId =
        transfer.fromBucketId ||
        transfer.fromBucket ||
        transfer.sourceBucketId ||
        transfer.bucketFromId;

      const directBucketId =
        transfer.bucketId ||
        transfer.savingsBucketId;

      const transferType =
        transfer.type ||
        transfer.direction ||
        transfer.transferType;
      const normalizedTransferType = String(transferType || "").toLowerCase();

      if (toBucketId === bucketId) {
        totals.totalTransfersIn += amount;
      }

      if (fromBucketId === bucketId) {
        totals.totalTransfersOut += amount;
      }

      if (
        directBucketId === bucketId &&
        (normalizedTransferType === "in" ||
          normalizedTransferType === "transfer_in" ||
          normalizedTransferType === "to_savings_bucket")
      ) {
        totals.totalTransfersIn += amount;
      }

      if (
        directBucketId === bucketId &&
        (normalizedTransferType === "out" ||
          normalizedTransferType === "transfer_out" ||
          normalizedTransferType === "from_savings_bucket")
      ) {
        totals.totalTransfersOut += amount;
      }

      totals.netTransferAmount =
        totals.totalTransfersIn - totals.totalTransfersOut;

      return totals;
    },
    {
      totalTransfersIn: 0,
      totalTransfersOut: 0,
      netTransferAmount: 0
    }
  );
}

function getPlannerRows(appData) {
  return getArrayFromPossiblePaths(appData, [
    ["planner", "rows"],
    ["planner", "payPeriods"],
    ["plannerRows"],
    ["payPeriods"],
    ["rows"]
  ]);
}

function getSavingsBuckets(appData) {
  return getArrayFromPossiblePaths(appData, [
    ["savings", "buckets"],
    ["savingsBuckets"],
    ["buckets"]
  ]);
}

function getSavingsTransfers(appData) {
  return getArrayFromPossiblePaths(appData, [
    ["savings", "transfers"],
    ["bucketTransfers"],
    ["savingsTransfers"],
    ["transfers"]
  ]);
}

function getBucketId(bucket) {
  return bucket.id || bucket.bucketId || bucket.name || bucket.bucketName;
}

function getBucketName(bucket) {
  return bucket.name || bucket.bucketName || bucket.label || "";
}

function getBucketBalance(bucket) {
  return normalizeMoney(
    bucket.balance ??
      bucket.currentBalance ??
      bucket.startingAmount ??
      bucket.amount ??
      bucket.value ??
      0
  );
}

function buildPlannerCsvRows(plannerRows) {
  return plannerRows.map((row) => ({
    "Pay Period":
      row.payPeriodName ||
      row.payPeriodLabel ||
      row.name ||
      row.label ||
      row.payPeriod ||
      row.date ||
      "",
    Income: normalizeMoney(
      row.income ??
        row.totalIncome ??
        row.incomeTotal ??
        row.payAmount ??
        0
    ),
    "Fixed Expenses": normalizeMoney(
      row.fixedExpenses ??
        row.fixedExpenseTotal ??
        row.fixedExpensesTotal ??
        row.billsTotal ??
        0
    ),
    "Misc Payments": normalizeMoney(
      row.miscPaymentsTotal ??
        row.miscPayments ??
        row.additionalPaymentsTotal ??
        0
    ),
    "Misc Expenses": normalizeMoney(
      row.miscExpensesTotal ??
        row.miscExpenses ??
        row.additionalExpensesTotal ??
        0
    ),
    "Savings Transfers In": normalizeMoney(
      row.savingsTransfersIn ??
        row.transfersIn ??
        row.totalTransfersIn ??
        0
    ),
    "Savings Transfers Out": normalizeMoney(
      row.savingsTransfersOut ??
        row.transfersOut ??
        row.totalTransfersOut ??
        0
    ),
    "Remaining Balance": normalizeMoney(
      row.remainingBalance ??
        row.balance ??
        row.availableBalance ??
        row.netBalance ??
        0
    )
  }));
}

function buildSavingsCsvRows(savingsBuckets, transfers) {
  return savingsBuckets.map((bucket) => {
    const bucketId = getBucketId(bucket);
    const calculatedTotals = calculateTransferTotals(bucketId, transfers);

    const totalTransfersIn =
      bucket.totalTransfersIn ?? calculatedTotals.totalTransfersIn;

    const totalTransfersOut =
      bucket.totalTransfersOut ?? calculatedTotals.totalTransfersOut;

    const netTransferAmount =
      bucket.netTransferAmount ?? totalTransfersIn - totalTransfersOut;

    return {
      "Bucket Name": getBucketName(bucket),
      "Current Balance": getBucketBalance(bucket),
      "Total Transfers In": normalizeMoney(totalTransfersIn),
      "Total Transfers Out": normalizeMoney(totalTransfersOut),
      "Net Transfer Amount": normalizeMoney(netTransferAmount),
      "Created Date": bucket.createdAt || bucket.createdDate || "",
      "Last Updated Date":
        bucket.updatedAt ||
        bucket.lastUpdatedDate ||
        bucket.modifiedAt ||
        ""
    };
  });
}

export default function DataManagement({
  appData,
  onDataReload,
  onBackupExported,
  onImportData,
  onRepairLocalData,
  onResetLocalData,
  onResetToDemoData,
  onResetToEmptyState,
  onShowHelp
}) {
  const fileInputRef = useRef(null);

  const [pendingImport, setPendingImport] = useState(null);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [demoConfirmation, setDemoConfirmation] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [, setHealthCheckNonce] = useState(0);

  const activeStorageKey = useMemo(() => getActiveStorageKey(), []);
  const dataHealth = (() => {
    const { data } =
      appData && typeof appData === "object"
        ? { data: appData }
        : getStoredAppData();

    return getDataHealthSummary(data);
  })();

  function clearMessages() {
    setSuccessMessage("");
    setErrorMessage("");
  }

  function reloadApp() {
    if (typeof onDataReload === "function") {
      onDataReload();
      return;
    }

    window.location.reload();
  }

  function getCurrentAppData() {
    if (appData && typeof appData === "object") {
      return {
        storageKey: activeStorageKey,
        data: appData
      };
    }

    return getStoredAppData();
  }

  async function handleExportBackup() {
    clearMessages();

    const { storageKey, data } = getCurrentAppData();
    const backup = createBackupSnapshot({
      storageKey,
      ...data
    });

    downloadTextFile({
      content: JSON.stringify(backup, null, 2),
      filename: getBackupFileName(),
      mimeType: "application/json;charset=utf-8"
    });

    try {
      if (typeof onBackupExported === "function") {
        await onBackupExported(backup.metadata.createdAt);
      }
    } catch (error) {
      console.error(error);
      setErrorMessage("Backup downloaded, but the backup reminder could not be updated.");
      return;
    }

    setSuccessMessage("Backup exported successfully. Keep this file somewhere safe.");
  }

  function handleChooseImportFile() {
    clearMessages();

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }

  function handleImportBackup(event) {
    clearMessages();

    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith(".json")) {
      setErrorMessage("Please select a JSON backup file.");
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const parsedBackup = JSON.parse(reader.result);
        const validation = validateBackupFile(parsedBackup);

        if (!validation.valid) {
          setErrorMessage(validation.message);
          return;
        }

        setPendingImport({
          ...parsedBackup,
          data: validation.data,
          summary: validation.summary,
          previewMetadata: validation.metadata,
          warnings: validation.warnings || [],
          referenceWarningCounts: validation.referenceWarningCounts || {}
        });
        setShowImportConfirm(true);
      } catch {
        setErrorMessage("The selected file is not valid JSON.");
      }
    };

    reader.onerror = () => {
      setErrorMessage("The backup file could not be read.");
    };

    reader.readAsText(file);
  }

  async function confirmImportBackup() {
    clearMessages();

    if (!pendingImport) {
      setErrorMessage("No backup file is ready to import.");
      return;
    }

    const backupData = pendingImport.data;
    const storageKeyFromBackup = backupData?.storageKey;
    const dataToRestore = { ...backupData };

    delete dataToRestore.storageKey;

    try {
      if (typeof onImportData === "function") {
        await onImportData(dataToRestore);
      } else {
        if (storageKeyFromBackup) {
          localStorage.setItem(
            storageKeyFromBackup,
            JSON.stringify(dataToRestore)
          );
        } else {
          saveStoredAppData(dataToRestore);
        }
      }
    } catch (error) {
      console.error(error);
      setErrorMessage("Backup import failed.");
      return;
    }

    setPendingImport(null);
    setShowImportConfirm(false);
    setSuccessMessage("Backup imported successfully.");

    reloadApp();
  }

  function cancelImportBackup() {
    setPendingImport(null);
    setShowImportConfirm(false);
    setSuccessMessage("");
    setErrorMessage("Import cancelled. Your current data was not changed.");
  }

  function handleExportPlannerCsv() {
    clearMessages();

    const { data } = getCurrentAppData();
    const plannerRows = getPlannerRows(data);

    const headers = [
      "Pay Period",
      "Income",
      "Fixed Expenses",
      "Misc Payments",
      "Misc Expenses",
      "Savings Transfers In",
      "Savings Transfers Out",
      "Remaining Balance"
    ];

    const rows = buildPlannerCsvRows(plannerRows);
    const csv = rowsToCsv(headers, rows);

    downloadTextFile({
      content: csv,
      filename: getDatedFileName("budget-planner-export", "csv"),
      mimeType: "text/csv;charset=utf-8"
    });

    setSuccessMessage("Planner CSV exported successfully.");
  }

  function handleExportSavingsBucketsCsv() {
    clearMessages();

    const { data } = getCurrentAppData();
    const savingsBuckets = getSavingsBuckets(data);
    const transfers = getSavingsTransfers(data);

    const headers = [
      "Bucket Name",
      "Current Balance",
      "Total Transfers In",
      "Total Transfers Out",
      "Net Transfer Amount",
      "Created Date",
      "Last Updated Date"
    ];

    const rows = buildSavingsCsvRows(savingsBuckets, transfers);
    const csv = rowsToCsv(headers, rows);

    downloadTextFile({
      content: csv,
      filename: getDatedFileName("savings-buckets-export", "csv"),
      mimeType: "text/csv;charset=utf-8"
    });

    setSuccessMessage("Savings buckets CSV exported successfully.");
  }

  async function handleRepairLocalData() {
    clearMessages();

    try {
      if (typeof onRepairLocalData === "function") {
        await onRepairLocalData();
      } else {
        const { data } = getCurrentAppData();
        saveStoredAppData(getSafeAppData(data));
      }
    } catch (error) {
      console.error(error);
      setErrorMessage("Local data repair failed.");
      return;
    }

    setSuccessMessage("Local data repaired successfully.");
  }

  function handleRunHealthCheck() {
    clearMessages();
    setHealthCheckNonce(Date.now());
    setSuccessMessage("Data Health rechecked. No records were changed.");
  }

  async function handleResetLocalData() {
    clearMessages();

    if (deleteConfirmation !== "DELETE") {
      setErrorMessage("Type DELETE to confirm factory reset.");
      return;
    }

    try {
      if (typeof onResetToEmptyState === "function") {
        await onResetToEmptyState();
      } else if (typeof onResetLocalData === "function") {
        await onResetLocalData();
      } else {
        saveStoredAppData({
          ...defaultAppState,
          ...getEmptyAppState()
        });
      }
    } catch (error) {
      console.error(error);
      setErrorMessage("Factory reset failed.");
      return;
    }

    setDeleteConfirmation("");
    setSuccessMessage("Factory reset to empty app completed.");

    reloadApp();
  }

  async function handleResetDemoData() {
    clearMessages();

    if (demoConfirmation !== "DEMO") {
      setErrorMessage("Type DEMO to confirm demo reset.");
      return;
    }

    try {
      if (typeof onResetToDemoData === "function") {
        await onResetToDemoData();
      } else {
        saveStoredAppData({
          ...defaultAppState,
          ...getDemoAppState()
        });
      }
    } catch (error) {
      console.error(error);
      setErrorMessage("Reset to demo data failed.");
      return;
    }

    setDemoConfirmation("");
    setSuccessMessage("Demo data restored successfully.");

    reloadApp();
  }

  return (
    <section className="max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Data Management
        </p>
        <h3 className="mt-1 text-xl font-bold text-slate-950 sm:text-2xl">
          Backup, restore, and export
        </h3>
        <p className="mt-2 text-sm text-slate-600">
          Export a full backup, restore from a saved file, download CSV reports,
          repair local records, or reset the app to demo or empty data.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Local data location: this browser profile ({activeStorageKey})
        </p>
      </div>

      {successMessage && (
        <div
          className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
          role="status"
        >
          {successMessage}
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

      <div className="grid gap-5">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h4 className="text-lg font-semibold text-slate-950">
            Local data safety
          </h4>
          <p className="mt-2 text-sm text-slate-700">
            Your data is stored locally in this browser on this device. Clearing
            browser data, clearing site data, switching browsers, switching
            devices, or uninstalling the PWA can remove your budget data. Export
            backups regularly and keep them somewhere safe.
          </p>
          <p className="mt-2 text-sm font-medium text-slate-800">
            Export a backup before major updates or before clearing browser
            data.
          </p>
          <p className="mt-2 text-sm text-slate-700">
            A future desktop version is planned with app-managed local database
            storage for stronger long-term data safety.
          </p>
          <p className="mt-2 text-sm text-slate-700">
            Backup files are versioned and designed to support future desktop
            import without changing saved record IDs.
          </p>
          <p className="mt-2 text-sm text-slate-700">
            The public demo uses fictional sample records. You can edit them,
            restore them with Reset to Demo Data, or clear them with Factory
            Reset to Empty App.
          </p>
          {typeof onShowHelp === "function" ? (
            <button
              type="button"
              onClick={onShowHelp}
              className="mt-3 min-h-11 w-full rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 sm:w-auto"
            >
              Open Help Guide
            </button>
          ) : null}
        </div>

        <div className="rounded-xl border border-slate-200 p-4">
          <h4 className="text-lg font-semibold text-slate-950">
            Data health
          </h4>
          <p className="mt-1 text-sm text-slate-600">
            A compact check of the local data currently loaded by the app.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                App version
              </p>
              <p className="mt-1 text-lg font-bold text-slate-950">
                {dataHealth.appVersion}
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Data version
              </p>
              <p className="mt-1 text-lg font-bold text-slate-950">
                {dataHealth.appDataVersion}
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Data warnings
              </p>
              <p className="mt-1 text-lg font-bold text-slate-950">
                {dataHealth.warningsCount}
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Data errors
              </p>
              <p className="mt-1 text-lg font-bold text-slate-950">
                {dataHealth.errorsCount || 0}
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Last backup
              </p>
              <p className="mt-1 text-base font-bold text-slate-950">
                {formatBackupDate(dataHealth.lastBackupAt)}
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Backup status
              </p>
              <p className="mt-1 text-lg font-bold text-slate-950">
                {dataHealth.backupStatus?.label || "No backup yet"}
              </p>
            </div>
          </div>

          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            {getCountRows(dataHealth.counts).map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
              >
                <dt className="text-slate-600">{row.label}</dt>
                <dd className="font-semibold text-slate-950">{row.value}</dd>
              </div>
            ))}
          </dl>

          {dataHealth.backupStatus?.ageDays !== null &&
            dataHealth.backupStatus?.ageDays !== undefined && (
              <p className="mt-3 text-sm text-slate-500">
                Last backup age: {dataHealth.backupStatus.ageDays} days.
              </p>
            )}

          {dataHealth.referenceWarningCounts ? (
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              {[
                [
                  "Missing transfer account references",
                  dataHealth.referenceWarningCounts
                    .missingTransferAccountReferences,
                ],
                [
                  "Missing transfer bucket references",
                  dataHealth.referenceWarningCounts
                    .missingTransferBucketReferences,
                ],
                [
                  "Scheduled transfers without buckets",
                  dataHealth.referenceWarningCounts
                    .scheduledTransfersWithoutBucketLinks,
                ],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
                >
                  <dt className="text-slate-600">{label}</dt>
                  <dd className="font-semibold text-slate-950">
                    {Number.isFinite(Number(value)) ? Number(value) : 0}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleRunHealthCheck}
              className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 sm:w-auto"
            >
              Run Health Check
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {dataHealth.healthDetails?.errors?.length ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                <p className="text-sm font-semibold text-red-900">
                  Errors
                </p>
                <div className="mt-2 space-y-2">
                  {dataHealth.healthDetails.errors.map((issue) => (
                    <div
                      key={issue.id}
                      className="break-anywhere text-sm text-red-900"
                    >
                      <p className="font-semibold">{issue.title}</p>
                      <p>{issue.message}</p>
                      <p className="mt-1 text-red-800">{issue.guidance}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {dataHealth.healthDetails?.warnings?.length ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-semibold text-amber-900">
                  Warnings
                </p>
                <div className="mt-2 space-y-2">
                  {dataHealth.healthDetails.warnings.map((issue) => (
                    <div
                      key={issue.id}
                      className="break-anywhere text-sm text-amber-900"
                    >
                      <p className="font-semibold">{issue.title}</p>
                      <p>{issue.message}</p>
                      <p className="mt-1 text-amber-800">{issue.guidance}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : !dataHealth.healthDetails?.errors?.length ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                No serious data health warnings found in the loaded records.
              </div>
            ) : null}

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p className="font-semibold text-slate-950">
                Health check guidance
              </p>
              <p className="mt-1">
                Data Health does not delete records, generate IDs, merge
                duplicates, or rewrite planner keys. Export a backup before
                making manual corrections.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 p-4">
          <h4 className="text-lg font-semibold text-slate-950">
            Safe actions
          </h4>
          <p className="mt-1 text-sm text-slate-600">
            Download local backup and CSV files without changing your app data.
            Repair Local Data normalizes records and does not delete user records.
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleExportBackup}
              className="min-h-11 w-full rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 sm:w-auto"
            >
              Export Backup
            </button>

            <button
              type="button"
              onClick={handleExportPlannerCsv}
              className="min-h-11 w-full rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 sm:w-auto"
            >
              Export Planner CSV
            </button>

            <button
              type="button"
              onClick={handleExportSavingsBucketsCsv}
              className="min-h-11 w-full rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 sm:w-auto"
            >
              Export Savings Buckets CSV
            </button>

            <button
              type="button"
              onClick={handleRepairLocalData}
              className="min-h-11 w-full rounded-xl border border-blue-300 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-50 sm:w-auto"
            >
              Repair Local Data
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h4 className="text-lg font-semibold text-slate-950">
            Risky actions
          </h4>
          <p className="mt-1 text-sm text-slate-700">
            Importing a backup replaces your current local data. Reset to Demo
            Data restores fictional sample records. Factory Reset to Empty App
            clears user and demo records from this browser/device. Export a
            backup first if you want to keep current data.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={handleImportBackup}
            className="hidden"
          />

          <div className="mt-4">
            <button
              type="button"
              onClick={handleChooseImportFile}
              className="min-h-11 w-full rounded-xl border border-amber-400 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-amber-100 sm:w-auto"
            >
              Import Backup
            </button>
          </div>

          {showImportConfirm && (
            <div className="mt-4 rounded-xl border border-amber-300 bg-white p-4">
              <p className="text-sm font-medium text-slate-800">
                Importing this file will replace your current FinPath data on
                this device. Export a backup first if you want to keep your
                current data. The app will reload after import.
              </p>

              {pendingImport?.previewMetadata ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-900">
                    Backup details
                  </p>
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    {[
                      ["App", pendingImport.previewMetadata.appName],
                      ["App version", pendingImport.previewMetadata.appVersion],
                      ["Export version", pendingImport.previewMetadata.exportVersion],
                      ["Schema version", pendingImport.previewMetadata.schemaVersion],
                      ["Exported at", pendingImport.previewMetadata.exportedAt],
                      ["Source", pendingImport.previewMetadata.source],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                      >
                        <dt className="text-slate-600">{label}</dt>
                        <dd className="break-anywhere font-semibold text-slate-950 sm:text-right">
                          {value || "Unknown"}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}

              {pendingImport?.summary ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-900">
                    This backup contains:
                  </p>
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    {getCountRows(pendingImport.summary).map((row) => (
                      <div
                        key={row.label}
                        className="flex items-center justify-between gap-3"
                      >
                        <dt className="text-slate-600">{row.label}</dt>
                        <dd className="font-semibold text-slate-950">
                          {row.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-600">
                  Backup summary unavailable.
                </p>
              )}

              {pendingImport?.warnings?.length ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm font-semibold text-amber-900">
                    Import warnings
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
                    {pendingImport.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={confirmImportBackup}
                  className="min-h-11 w-full rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 sm:w-auto"
                >
                  Import Backup
                </button>

                <button
                  type="button"
                  onClick={cancelImportBackup}
                  className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 sm:w-auto"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="mt-5 rounded-xl border border-amber-200 bg-white p-4">
            <h5 className="text-base font-semibold text-amber-800">
              Reset to Demo Data
            </h5>
            <p className="mt-1 text-sm text-slate-600">
              This replaces your current local data with fictional sample
              records. Export a backup first if you want to keep your current
              data. Type DEMO to confirm.
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <input
                value={demoConfirmation}
                onChange={(event) => setDemoConfirmation(event.target.value)}
                placeholder="Type DEMO"
                className="min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm sm:w-48"
              />

              <button
                type="button"
                onClick={handleResetDemoData}
                disabled={demoConfirmation !== "DEMO"}
                className="min-h-11 w-full rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                Reset to Demo Data
              </button>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-red-200 bg-white p-4">
            <h5 className="text-base font-semibold text-red-700">
              Factory Reset to Empty App
            </h5>
            <p className="mt-1 text-sm text-slate-600">
              This clears local planner data, accounts, scheduled items,
              budgets, savings buckets, adjustments, and user records from this
              browser/device. This cannot be undone unless you have a backup.
              Type DELETE to confirm.
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <input
                value={deleteConfirmation}
                onChange={(event) =>
                  setDeleteConfirmation(event.target.value)
                }
                placeholder="Type DELETE"
                className="min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm sm:w-48"
              />

              <button
                type="button"
                onClick={handleResetLocalData}
                disabled={deleteConfirmation !== "DELETE"}
                className="min-h-11 w-full rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                Factory Reset to Empty App
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
