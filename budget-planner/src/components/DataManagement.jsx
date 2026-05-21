import { useMemo, useRef, useState } from "react";
import {
  createBackupSnapshot,
  getBackupFileName,
  validateBackupFile
} from "../services/backupService";
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
  settings: {
    currency: "CAD",
    payPeriodAnchorDate: "",
    payFrequencyDays: 14,
    projectionMonths: 6
  },
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
  }
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

      if (toBucketId === bucketId) {
        totals.totalTransfersIn += amount;
      }

      if (fromBucketId === bucketId) {
        totals.totalTransfersOut += amount;
      }

      if (directBucketId === bucketId && transferType === "in") {
        totals.totalTransfersIn += amount;
      }

      if (directBucketId === bucketId && transferType === "out") {
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

export default function DataManagement({ onDataReload }) {
  const fileInputRef = useRef(null);

  const [lastBackupTimestamp, setLastBackupTimestamp] = useState("");
  const [pendingImport, setPendingImport] = useState(null);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const activeStorageKey = useMemo(() => getActiveStorageKey(), []);

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

  function handleExportBackup() {
    clearMessages();

    const { storageKey, data } = getStoredAppData();
    const backup = createBackupSnapshot({
      storageKey,
      ...data
    });

    downloadTextFile({
      content: JSON.stringify(backup, null, 2),
      filename: getBackupFileName(),
      mimeType: "application/json;charset=utf-8"
    });

    setLastBackupTimestamp(backup.metadata.createdAt);
    setSuccessMessage("Backup exported successfully.");
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

        setPendingImport(parsedBackup);
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

  function confirmImportBackup() {
    clearMessages();

    if (!pendingImport) {
      setErrorMessage("No backup file is ready to import.");
      return;
    }

    const backupData = pendingImport.data;
    const storageKeyFromBackup = backupData?.storageKey;
    const dataToRestore = { ...backupData };

    delete dataToRestore.storageKey;

    if (storageKeyFromBackup) {
      localStorage.setItem(storageKeyFromBackup, JSON.stringify(dataToRestore));
    } else {
      saveStoredAppData(dataToRestore);
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

    const { data } = getStoredAppData();
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

    const { data } = getStoredAppData();
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

  function handleResetLocalData() {
    clearMessages();

    if (deleteConfirmation !== "DELETE") {
      setErrorMessage("Type DELETE to confirm reset.");
      return;
    }

    saveStoredAppData(defaultAppState);

    setDeleteConfirmation("");
    setSuccessMessage("Local data reset successfully.");

    reloadApp();
  }

  return (
    <section className="max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Data Management
        </p>
        <h3 className="mt-1 text-2xl font-bold text-slate-950">
          Backup, restore, and export
        </h3>
        <p className="mt-2 text-sm text-slate-600">
          Export a full backup, restore from a saved file, download CSV reports,
          or reset local data.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Active local storage key: {activeStorageKey}
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
        <div className="rounded-xl border border-slate-200 p-4">
          <h4 className="text-lg font-semibold text-slate-950">
            Safe actions
          </h4>
          <p className="mt-1 text-sm text-slate-600">
            Download backups and CSV files without changing your app data.
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleExportBackup}
              className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Export Backup
            </button>

            <button
              type="button"
              onClick={handleExportPlannerCsv}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Export Planner CSV
            </button>

            <button
              type="button"
              onClick={handleExportSavingsBucketsCsv}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Export Savings Buckets CSV
            </button>
          </div>

          {lastBackupTimestamp && (
            <p className="mt-3 text-sm text-slate-500">
              Last backup exported:{" "}
              {new Date(lastBackupTimestamp).toLocaleString()}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h4 className="text-lg font-semibold text-slate-950">
            Risky actions
          </h4>
          <p className="mt-1 text-sm text-slate-700">
            Importing a backup replaces your current local data. Resetting local
            data deletes your planner, savings buckets, transfers, and settings.
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
              className="rounded-xl border border-amber-400 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-amber-100"
            >
              Import Backup
            </button>
          </div>

          {showImportConfirm && (
            <div className="mt-4 rounded-xl border border-amber-300 bg-white p-4">
              <p className="text-sm font-medium text-slate-800">
                Importing this backup will replace your current local data. This
                cannot be undone unless you exported a backup first.
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={confirmImportBackup}
                  className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
                >
                  Import Backup
                </button>

                <button
                  type="button"
                  onClick={cancelImportBackup}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="mt-5 rounded-xl border border-red-200 bg-white p-4">
            <h5 className="text-base font-semibold text-red-700">
              Reset Local Data
            </h5>
            <p className="mt-1 text-sm text-slate-600">
              Type DELETE to confirm. This resets the app back to the starter
              state.
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <input
                value={deleteConfirmation}
                onChange={(event) =>
                  setDeleteConfirmation(event.target.value)
                }
                placeholder="Type DELETE"
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />

              <button
                type="button"
                onClick={handleResetLocalData}
                disabled={deleteConfirmation !== "DELETE"}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reset Local Data
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}