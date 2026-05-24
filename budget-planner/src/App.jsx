import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import AppShell from './components/AppShell';
import CellEditor from './components/CellEditor';
import ReleaseNotesModal, {
  RELEASE_NOTES_STORAGE_KEY,
} from './components/ReleaseNotesModal';
import {
  createBackupSnapshot,
  getBackupFileName,
} from './services/backupService';
import { downloadTextFile } from './utils/downloadFile';
import { APP_VERSION, RELEASE_NOTES } from './data/releaseNotes';
import {
  accounts as seedAccounts,
  appSettings,
  budgetTargets as seedBudgetTargets,
  categories as seedCategories,
  manualAdjustments as seedManualAdjustments,
  plannerEntries as seedPlannerEntries,
  savingsBucketAdjustments as seedSavingsBucketAdjustments,
  savingsBuckets as seedSavingsBuckets,
  scheduledItems as seedScheduledItems,
  transfers as seedTransfers,
} from './data/seedData';
import {
  archiveCategory,
  archiveBudgetTarget,
  deleteManualAdjustment,
  deletePlannerEntry,
  deleteScheduledItem,
  deleteSavingsBucketAdjustment,
  deleteTransfer,
  getAppMetadata,
  getAppSettings,
  getAllAccounts,
  getAllBudgetTargets,
  getAllCategories,
  getAllManualAdjustments,
  getAllPlannerEntries,
  getAllSavingsBucketAdjustments,
  getAllSavingsBuckets,
  getAllScheduledItems,
  getAllTransfers,
  normalizeAppSettings,
  normalizeAppMetadata,
  replaceAccounts,
  replaceBudgetTargets,
  replaceCategories,
  replaceManualAdjustments,
  replacePlannerEntries,
  replaceSavingsBucketAdjustments,
  replaceSavingsBuckets,
  replaceScheduledItems,
  replaceTransfers,
  repairLocalData,
  resetAppToDemoData,
  resetAppToEmptyState,
  resetAppSettings,
  resetBudgetTargets,
  resetCategoriesToDefaults,
  saveAccount,
  saveAppSettings,
  saveAppMetadata,
  saveLastBackupAt,
  saveBudgetTarget,
  saveManualAdjustment,
  saveCategory,
  savePlannerEntry,
  saveSavingsBucket,
  saveSavingsBucketAdjustment,
  saveScheduledItem,
  saveTransfer,
  validateAppSettings,
} from './data/db';
import {
  getCurrentAppDataVersion,
  getCurrentAppVersion,
  getSafeAppData,
} from './data/migrations';
import { generateAlerts, getAlertCounts } from './logic/alertLogic';
import { calculateBudgetUsage } from './logic/budgetLogic';
import { buildPlannerRows, calculatePeriodTotals } from './logic/projectionLogic';
import { normalizeScheduledItem } from './logic/scheduledItemLogic';
import { buildTransactionsFromAppData } from './logic/transactionLogic';

const Accounts = lazy(() => import('./pages/Accounts'));
const Budgets = lazy(() => import('./pages/Budgets'));
const Categories = lazy(() => import('./pages/Categories'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Help = lazy(() => import('./pages/Help'));
const Manage = lazy(() => import('./pages/Manage'));
const Planner = lazy(() => import('./pages/Planner'));
const Reports = lazy(() => import('./pages/Reports'));
const SavingsBuckets = lazy(() => import('./pages/SavingsBuckets'));
const ScheduledItems = lazy(() => import('./pages/ScheduledItems'));
const Settings = lazy(() => import('./pages/Settings'));
const Transactions = lazy(() => import('./pages/Transactions'));
const finPathLogo = `${import.meta.env.BASE_URL}brand/finpath-logo-horizontal.png`;

function PageLoadingFallback() {
  return (
    <div className="rounded-2xl border border-[#13BFA5] bg-[var(--color-finpath-navy)] p-5 text-sm font-medium text-white shadow-sm">
      <img
        src={finPathLogo}
        alt="FinPath"
        className="h-12 w-auto rounded-lg bg-white px-3 py-2"
      />
      <p className="mt-3 text-[var(--color-finpath-muted)]">
        Loading your planner...
      </p>
    </div>
  );
}

function markReleaseNotesSeen() {
  localStorage.setItem(RELEASE_NOTES_STORAGE_KEY, APP_VERSION);
}

function buildExportPlannerRows(plannerData) {
  const projectedChequingRow = plannerData.projectionRows.find(
    (row) => row.id === 'projected-chequing'
  );

  return plannerData.payPeriods.map((period) => {
    const totals = calculatePeriodTotals(plannerData.rows, period.date);

    return {
      payPeriodLabel: period.label,
      date: period.date,
      income: totals.income,
      fixedExpenses: totals.expenses,
      savingsTransfersIn: totals.transfers,
      remainingBalance:
        projectedChequingRow?.amountsByPeriod?.[period.date] ?? 0,
    };
  });
}

const normalizedSeedScheduledItems = seedScheduledItems.map((item) =>
  normalizeScheduledItem(item)
);

function getCurrentMonthKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
}

function getComparableSettings(settings) {
  return {
    currency: settings.currency,
    payPeriodAnchorDate: settings.payPeriodAnchorDate,
    payFrequencyDays: Number(settings.payFrequencyDays),
    projectionMonths: Number(settings.projectionMonths),
    monthlyBillAssignmentRule: settings.monthlyBillAssignmentRule,
  };
}

function hasCustomSavedSettings(savedSettings) {
  return (
    JSON.stringify(getComparableSettings(savedSettings)) !==
    JSON.stringify(getComparableSettings(appSettings))
  );
}

function hasCustomSavedCategories(savedCategories = []) {
  if (savedCategories.length !== seedCategories.length) {
    return true;
  }

  const defaultCategoryMap = new Map(
    seedCategories.map((category) => [category.id, category])
  );

  return savedCategories.some((category) => {
    const defaultCategory = defaultCategoryMap.get(category.id);

    return (
      !defaultCategory ||
      category.name !== defaultCategory.name ||
      category.type !== defaultCategory.type ||
      category.active !== defaultCategory.active
    );
  });
}

function hasNoUserRecords({
  accounts = [],
  scheduledItems = [],
  manualAdjustments = [],
  savingsBuckets = [],
  savingsBucketAdjustments = [],
  transfers = [],
  budgetTargets = [],
  plannerEntries = {},
}) {
  return (
    accounts.length === 0 &&
    scheduledItems.length === 0 &&
    manualAdjustments.length === 0 &&
    savingsBuckets.length === 0 &&
    savingsBucketAdjustments.length === 0 &&
    transfers.length === 0 &&
    budgetTargets.length === 0 &&
    Object.keys(plannerEntries).length === 0
  );
}

export default function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [settings, setSettings] = useState(appSettings);
  const [budgetTargets, setBudgetTargets] = useState(seedBudgetTargets);
  const [categories, setCategories] = useState(seedCategories);
  const [plannerEntries, setPlannerEntries] = useState(seedPlannerEntries);
  const [scheduledItems, setScheduledItems] = useState(
    normalizedSeedScheduledItems
  );
  const [accounts, setAccounts] = useState(seedAccounts);
  const [manualAdjustments, setManualAdjustments] = useState(
    seedManualAdjustments
  );
  const [savingsBuckets, setSavingsBuckets] = useState(seedSavingsBuckets);
  const [savingsBucketAdjustments, setSavingsBucketAdjustments] = useState(
    seedSavingsBucketAdjustments
  );
  const [transfers, setTransfers] = useState(seedTransfers);
  const [appMetadata, setAppMetadata] = useState(() =>
    normalizeAppMetadata({})
  );
  const [selectedCell, setSelectedCell] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState('');
  const [dismissedAlertIds, setDismissedAlertIds] = useState([]);
  const [releaseNotesSeen, setReleaseNotesSeen] = useState(
    () => localStorage.getItem(RELEASE_NOTES_STORAGE_KEY) === APP_VERSION
  );
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  function applyLoadedData(loadedData) {
    setSettings(loadedData.settings);
    setBudgetTargets(loadedData.budgetTargets);
    setCategories(loadedData.categories);
    setPlannerEntries(loadedData.plannerEntries);
    setScheduledItems(loadedData.scheduledItems);
    setAccounts(loadedData.accounts);
    setManualAdjustments(loadedData.manualAdjustments);
    setSavingsBuckets(
      loadedData.savingsBuckets.filter((bucket) => !bucket.deletedAt)
    );
    setSavingsBucketAdjustments(loadedData.savingsBucketAdjustments);
    setTransfers(loadedData.transfers || []);
    setAppMetadata(loadedData.appMetadata);
  }

  useEffect(() => {
    async function loadSavedData() {
      try {
        const [
          savedSettings,
          savedBudgetTargets,
          savedCategories,
          savedPlannerEntries,
          savedScheduledItems,
          savedAccounts,
          savedManualAdjustments,
          savedSavingsBuckets,
          savedSavingsBucketAdjustments,
          savedTransfers,
          savedAppMetadata,
        ] = await Promise.all([
          getAppSettings(),
          getAllBudgetTargets(),
          getAllCategories(),
          getAllPlannerEntries(),
          getAllScheduledItems(),
          getAllAccounts(),
          getAllManualAdjustments(),
          getAllSavingsBuckets(),
          getAllSavingsBucketAdjustments(),
          getAllTransfers(),
          getAppMetadata(),
        ]);

        const hasSavedRecords =
          savedBudgetTargets.length > 0 ||
          Object.keys(savedPlannerEntries).length > 0 ||
          savedScheduledItems.length > 0 ||
          savedAccounts.length > 0 ||
          savedManualAdjustments.length > 0 ||
          savedSavingsBuckets.length > 0 ||
          savedSavingsBucketAdjustments.length > 0 ||
          savedTransfers.length > 0;
        const hasExistingUserData =
          hasSavedRecords ||
          hasCustomSavedSettings(savedSettings) ||
          hasCustomSavedCategories(savedCategories) ||
          Boolean(savedAppMetadata.lastBackupAt);

        if (!savedAppMetadata.dataMode && !hasExistingUserData) {
          const demoData = await resetAppToDemoData();
          applyLoadedData(demoData);
          return;
        }

        applyLoadedData({
          settings: savedSettings,
          budgetTargets: savedBudgetTargets,
          categories: savedCategories,
          plannerEntries: savedPlannerEntries,
          scheduledItems: savedScheduledItems,
          accounts: savedAccounts,
          manualAdjustments: savedManualAdjustments,
          savingsBuckets: savedSavingsBuckets,
          savingsBucketAdjustments: savedSavingsBucketAdjustments,
          transfers: savedTransfers,
          appMetadata: savedAppMetadata,
        });
      } catch (error) {
        console.error(error);
        setStatusMessage('Could not load saved planner data.');
      } finally {
        setLoading(false);
      }
    }

    loadSavedData();
  }, []);

  const plannerData = useMemo(() => {
    return buildPlannerRows({
      settings,
      accounts,
      scheduledItems,
      manualAdjustments,
      savingsBucketAdjustments,
      transfers,
      plannerEntries,
    });
  }, [
    plannerEntries,
    settings,
    scheduledItems,
    accounts,
    manualAdjustments,
    savingsBucketAdjustments,
    transfers,
  ]);

  const appData = useMemo(
    () => ({
      appVersion: getCurrentAppVersion(),
      appDataVersion: getCurrentAppDataVersion(),
      settings,
      budgetTargets,
      categories,
      plannerEntries,
      scheduledItems,
      accounts,
      manualAdjustments,
      savingsBuckets,
      savingsBucketAdjustments,
      transfers,
      appMetadata,
      planner: {
        entries: plannerEntries,
        payPeriods: plannerData.payPeriods,
        rows: buildExportPlannerRows(plannerData),
      },
      savings: {
        buckets: savingsBuckets,
        transfers: [...savingsBucketAdjustments, ...transfers],
      },
    }),
    [
      accounts,
      manualAdjustments,
      plannerData,
      plannerEntries,
      savingsBucketAdjustments,
      savingsBuckets,
      transfers,
      scheduledItems,
      settings,
      budgetTargets,
      categories,
      appMetadata,
    ]
  );

  const showReleaseNotes = !loading && !releaseNotesSeen;

  const alertTransactions = useMemo(
    () =>
      buildTransactionsFromAppData({
        scheduledItems,
        manualAdjustments,
        savingsBucketAdjustments,
        transfers,
        savingsBuckets,
        accounts,
        categories,
      }),
    [
      accounts,
      categories,
      manualAdjustments,
      savingsBucketAdjustments,
      transfers,
      savingsBuckets,
      scheduledItems,
    ]
  );

  const currentBudgetUsage = useMemo(
    () =>
      calculateBudgetUsage({
        budgetTargets,
        transactions: alertTransactions,
        categories,
        selectedMonth: getCurrentMonthKey(),
      }),
    [alertTransactions, budgetTargets, categories]
  );

  const activeAlerts = useMemo(
    () =>
      generateAlerts({
        plannerData,
        budgetUsageRows: currentBudgetUsage.rows,
        scheduledItems,
        accounts,
        categories,
        budgetTargets,
        transactions: alertTransactions,
        savingsBuckets,
        savingsBucketAdjustments,
        transfers,
        settings,
        appMetadata,
      }),
    [
      accounts,
      alertTransactions,
      budgetTargets,
      categories,
      currentBudgetUsage.rows,
      plannerData,
      savingsBucketAdjustments,
      savingsBuckets,
      scheduledItems,
      settings,
      transfers,
      appMetadata,
    ]
  );

  const visibleAlerts = useMemo(() => {
    const dismissedIds = new Set(dismissedAlertIds);

    return activeAlerts.filter((alert) => {
      return alert.severity === 'danger' || !dismissedIds.has(alert.id);
    });
  }, [activeAlerts, dismissedAlertIds]);

  const alertCounts = useMemo(
    () => getAlertCounts(visibleAlerts),
    [visibleAlerts]
  );
  const isEmptyApp = useMemo(
    () =>
      appMetadata.dataMode === 'empty' ||
      hasNoUserRecords({
        accounts,
        scheduledItems,
        manualAdjustments,
        savingsBuckets,
        savingsBucketAdjustments,
        transfers,
        budgetTargets,
        plannerEntries,
      }),
    [
      accounts,
      appMetadata.dataMode,
      budgetTargets,
      manualAdjustments,
      plannerEntries,
      savingsBucketAdjustments,
      transfers,
      savingsBuckets,
      scheduledItems,
    ]
  );

  const plannerAlerts = useMemo(
    () => visibleAlerts.filter((alert) => alert.source === 'planner'),
    [visibleAlerts]
  );

  const budgetAlerts = useMemo(
    () => visibleAlerts.filter((alert) => alert.source === 'budgets'),
    [visibleAlerts]
  );

  const scheduledItemAlerts = useMemo(
    () => visibleAlerts.filter((alert) => alert.source === 'scheduled-items'),
    [visibleAlerts]
  );

  function handleAlertAction(pageId) {
    setCurrentPage(pageId);
  }

  function handleDismissAlert(alert) {
    if (!alert || alert.severity === 'danger') {
      return;
    }

    setDismissedAlertIds((currentIds) =>
      currentIds.includes(alert.id) ? currentIds : [...currentIds, alert.id]
    );
  }

  async function handleCompleteOnboarding() {
    const savedMetadata = await saveAppMetadata({
      ...appMetadata,
      onboardingCompletedAt: new Date().toISOString(),
    });

    setAppMetadata(savedMetadata);
    setStatusMessage('Onboarding dismissed. You can open Help anytime.');
    return savedMetadata;
  }

  async function handleStartEmptyFromOnboarding() {
    await handleCompleteOnboarding();
    setCurrentPage('settings');
    setStatusMessage(
      'To start empty, use Factory Reset to Empty App in Settings > Data Management. It requires typing DELETE.'
    );
  }

  async function handleImportBackupFromOnboarding() {
    await handleCompleteOnboarding();
    setCurrentPage('settings');
    setStatusMessage(
      'Use Import Backup in Settings > Data Management. Importing replaces current local data, so export first if needed.'
    );
  }

  async function handleSaveCell(entryKey, entry) {
    try {
      const savedEntry = await savePlannerEntry(entryKey, entry);

      setPlannerEntries((currentEntries) => ({
        ...currentEntries,
        [entryKey]: savedEntry,
      }));

      setSelectedCell(null);
      setStatusMessage('Planner entry saved.');
    } catch (error) {
      console.error(error);
      setStatusMessage('Could not save planner entry.');
    }
  }

  async function handleClearCell(entryKey) {
    try {
      await deletePlannerEntry(entryKey);

      setPlannerEntries((currentEntries) => {
        const nextEntries = { ...currentEntries };
        delete nextEntries[entryKey];
        return nextEntries;
      });

      setSelectedCell(null);
      setStatusMessage('Planner entry cleared.');
    } catch (error) {
      console.error(error);
      setStatusMessage('Could not clear planner entry.');
    }
  }

  async function handleSaveScheduledItem(updatedItem) {
    try {
      const savedItem = await saveScheduledItem(updatedItem);

      setScheduledItems((currentItems) => {
        const itemExists = currentItems.some((item) => item.id === savedItem.id);

        if (itemExists) {
          return currentItems.map((item) =>
            item.id === savedItem.id ? savedItem : item
          );
        }

        return [...currentItems, savedItem];
      });

      setStatusMessage('Scheduled item saved.');
      return savedItem;
    } catch (error) {
      console.error(error);
      setStatusMessage('Could not save scheduled item.');
      throw error;
    }
  }

  async function handleDuplicateScheduledItem(item) {
    const timestamp = new Date().toISOString();
    const duplicateItem = normalizeScheduledItem({
      ...item,
      id: `scheduled-${crypto.randomUUID()}`,
      name: `${item.name} Copy`,
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    return handleSaveScheduledItem(duplicateItem);
  }

  async function handleDeleteScheduledItem(id) {
    try {
      await deleteScheduledItem(id);

      setScheduledItems((currentItems) =>
        currentItems.filter((item) => item.id !== id)
      );

      setStatusMessage('Scheduled item deleted.');
    } catch (error) {
      console.error(error);
      setStatusMessage('Could not delete scheduled item.');
      throw error;
    }
  }

async function handleSaveAccount(updatedAccount) {
  try {
    const savedAccount = await saveAccount(updatedAccount);

    setAccounts((currentAccounts) => {
      const accountExists = currentAccounts.some(
        (account) => account.id === savedAccount.id
      );

      if (accountExists) {
        return currentAccounts.map((account) =>
          account.id === savedAccount.id ? savedAccount : account
        );
      }

      return [...currentAccounts, savedAccount];
    });

    setStatusMessage('Account saved.');
    return savedAccount;
  } catch (error) {
    console.error(error);
    setStatusMessage('Could not save account.');
    throw error;
  }
}

  async function handleSaveManualAdjustment(adjustment) {
    try {
      const savedAdjustment = await saveManualAdjustment(adjustment);

      setManualAdjustments((currentAdjustments) => {
        const exists = currentAdjustments.some(
          (item) => item.id === savedAdjustment.id
        );

        if (exists) {
          return currentAdjustments.map((item) =>
            item.id === savedAdjustment.id ? savedAdjustment : item
          );
        }

        return [...currentAdjustments, savedAdjustment];
      });

      setStatusMessage('Manual adjustment saved.');
    } catch (error) {
      console.error(error);
      setStatusMessage('Could not save manual adjustment.');
    }
  }

  async function handleDeleteManualAdjustment(id) {
    try {
      await deleteManualAdjustment(id);

      setManualAdjustments((currentAdjustments) =>
        currentAdjustments.filter((adjustment) => adjustment.id !== id)
      );

      setStatusMessage('Manual adjustment deleted.');
    } catch (error) {
      console.error(error);
      setStatusMessage('Could not delete manual adjustment.');
    }
  }

  async function handleSaveSavingsBucket(updatedBucket) {
    try {
      const savedBucket = await saveSavingsBucket(updatedBucket);

      setSavingsBuckets((currentBuckets) => {
        const exists = currentBuckets.some(
          (bucket) => bucket.id === savedBucket.id
        );

        if (exists) {
          return currentBuckets.map((bucket) =>
            bucket.id === savedBucket.id ? savedBucket : bucket
          );
        }

        return [...currentBuckets, savedBucket];
      });

      setStatusMessage('Savings bucket saved.');
    } catch (error) {
      console.error(error);
      setStatusMessage('Could not save savings bucket.');
    }
  }

  async function handleDeleteSavingsBucket({
    bucketId,
    moveToBucketId,
    amountToMove,
  }) {
    try {
      const bucketToDelete = savingsBuckets.find(
        (bucket) => bucket.id === bucketId
      );
      const targetBucket = savingsBuckets.find(
        (bucket) => bucket.id === moveToBucketId
      );

      if (!bucketToDelete || !targetBucket) {
        setStatusMessage('Could not delete savings bucket.');
        return;
      }

      const deletedBucketRecord = {
        ...bucketToDelete,
        deletedAt: new Date().toISOString(),
        active: false,
      };

      const updatedTargetBucket = {
        ...targetBucket,
        startingAmount:
          (Number(targetBucket.startingAmount) || 0) +
          (Number(amountToMove) || 0),
      };

      const [savedDeletedBucket, savedTargetBucket] = await Promise.all([
        saveSavingsBucket(deletedBucketRecord),
        saveSavingsBucket(updatedTargetBucket),
      ]);

      setSavingsBuckets((currentBuckets) =>
        currentBuckets
          .filter((bucket) => bucket.id !== savedDeletedBucket.id)
          .map((bucket) =>
            bucket.id === savedTargetBucket.id ? savedTargetBucket : bucket
          )
      );

      setStatusMessage('Savings bucket deleted and funds moved.');
    } catch (error) {
      console.error(error);
      setStatusMessage('Could not delete savings bucket.');
    }
  }

  async function handleSaveSavingsBucketAdjustment(adjustment) {
    try {
      const savedAdjustment = await saveSavingsBucketAdjustment(adjustment);

      setSavingsBucketAdjustments((currentAdjustments) => {
        const exists = currentAdjustments.some(
          (item) => item.id === savedAdjustment.id
        );

        if (exists) {
          return currentAdjustments.map((item) =>
            item.id === savedAdjustment.id ? savedAdjustment : item
          );
        }

        return [...currentAdjustments, savedAdjustment];
      });

      setStatusMessage('Savings bucket adjustment saved.');
    } catch (error) {
      console.error(error);
      setStatusMessage('Could not save savings bucket adjustment.');
    }
  }

  async function handleDeleteSavingsBucketAdjustment(id) {
    try {
      await deleteSavingsBucketAdjustment(id);

      setSavingsBucketAdjustments((currentAdjustments) =>
        currentAdjustments.filter((adjustment) => adjustment.id !== id)
      );

      setStatusMessage('Savings bucket adjustment deleted.');
    } catch (error) {
      console.error(error);
      setStatusMessage('Could not delete savings bucket adjustment.');
    }
  }

  async function handleSaveTransfer(transfer) {
    try {
      const savedTransfer = await saveTransfer(transfer);

      setTransfers((currentTransfers) => {
        const exists = currentTransfers.some((item) => item.id === savedTransfer.id);

        if (exists) {
          return currentTransfers.map((item) =>
            item.id === savedTransfer.id ? savedTransfer : item
          );
        }

        return [...currentTransfers, savedTransfer];
      });

      setStatusMessage('Transfer saved.');
      return savedTransfer;
    } catch (error) {
      console.error(error);
      setStatusMessage('Could not save transfer.');
      throw error;
    }
  }

  async function handleDeleteTransfer(id) {
    try {
      await deleteTransfer(id);

      setTransfers((currentTransfers) =>
        currentTransfers.filter((transfer) => transfer.id !== id)
      );

      setStatusMessage('Transfer deleted.');
    } catch (error) {
      console.error(error);
      setStatusMessage('Could not delete transfer.');
      throw error;
    }
  }

  async function handleSaveCategory(updatedCategory) {
    try {
      const savedCategory = await saveCategory(updatedCategory);

      setCategories((currentCategories) => {
        const exists = currentCategories.some(
          (category) => category.id === savedCategory.id
        );

        const nextCategories = exists
          ? currentCategories.map((category) =>
              category.id === savedCategory.id ? savedCategory : category
            )
          : [...currentCategories, savedCategory];

        return nextCategories.sort(
          (left, right) =>
            left.type.localeCompare(right.type) ||
            Number(left.sortOrder || 0) - Number(right.sortOrder || 0) ||
            left.name.localeCompare(right.name)
        );
      });

      setStatusMessage('Category saved.');
      return savedCategory;
    } catch (error) {
      console.error(error);
      setStatusMessage('Could not save category.');
      throw error;
    }
  }

  async function handleSaveBudgetTarget(updatedTarget) {
    try {
      const savedTarget = await saveBudgetTarget(updatedTarget);

      setBudgetTargets((currentTargets) => {
        const exists = currentTargets.some((target) => target.id === savedTarget.id);

        if (exists) {
          return currentTargets.map((target) =>
            target.id === savedTarget.id ? savedTarget : target
          );
        }

        return [...currentTargets, savedTarget];
      });

      setStatusMessage('Budget target saved.');
      return savedTarget;
    } catch (error) {
      console.error(error);
      setStatusMessage('Could not save budget target.');
      throw error;
    }
  }

  async function handleArchiveBudgetTarget(budgetTargetId) {
    try {
      const archivedTarget = await archiveBudgetTarget(budgetTargetId);

      setBudgetTargets((currentTargets) =>
        currentTargets.map((target) =>
          target.id === archivedTarget.id ? archivedTarget : target
        )
      );

      setStatusMessage('Budget target archived.');
      return archivedTarget;
    } catch (error) {
      console.error(error);
      setStatusMessage('Could not archive budget target.');
      throw error;
    }
  }

  async function handleResetBudgetTargets() {
    try {
      const resetTargets = await resetBudgetTargets();
      setBudgetTargets(resetTargets);
      setStatusMessage('Budget targets reset.');
      return resetTargets;
    } catch (error) {
      console.error(error);
      setStatusMessage('Could not reset budget targets.');
      throw error;
    }
  }

  async function handleArchiveCategory(categoryId) {
    try {
      const archivedCategory = await archiveCategory(categoryId);

      setCategories((currentCategories) =>
        currentCategories.map((category) =>
          category.id === archivedCategory.id ? archivedCategory : category
        )
      );

      setStatusMessage('Category archived.');
      return archivedCategory;
    } catch (error) {
      console.error(error);
      setStatusMessage('Could not archive category.');
      throw error;
    }
  }

  async function handleResetCategories() {
    try {
      const defaultCategories = await resetCategoriesToDefaults();
      setCategories(defaultCategories);
      setStatusMessage('Categories reset to defaults.');
      return defaultCategories;
    } catch (error) {
      console.error(error);
      setStatusMessage('Could not reset categories.');
      throw error;
    }
  }

  async function handleSaveSettings(updatedSettings) {
    const validation = validateAppSettings(updatedSettings);

    if (!validation.valid) {
      throw new Error(validation.errors.join(' '));
    }

    const savedSettings = await saveAppSettings(updatedSettings);
    setSettings(savedSettings);
    setStatusMessage('Settings saved. Planner projections updated.');
    return savedSettings;
  }

  async function handleResetSettings() {
    const defaultSettings = await resetAppSettings();
    setSettings(defaultSettings);
    setStatusMessage('Settings reset to defaults.');
    return defaultSettings;
  }

  async function handleBackupExported(timestamp) {
    const savedMetadata = await saveLastBackupAt(timestamp);
    setAppMetadata(savedMetadata);
    return savedMetadata;
  }

  async function exportCurrentBackup() {
    const backup = createBackupSnapshot(appData);

    downloadTextFile({
      content: JSON.stringify(backup, null, 2),
      filename: getBackupFileName(),
      mimeType: 'application/json;charset=utf-8',
    });

    await handleBackupExported(backup.metadata.createdAt);
    setStatusMessage('Backup exported successfully. Keep this file somewhere safe.');
    return backup;
  }

  function handleCloseReleaseNotes() {
    markReleaseNotesSeen();
    setReleaseNotesSeen(true);
  }

  function handleViewReleaseNotesHelp() {
    markReleaseNotesSeen();
    setReleaseNotesSeen(true);
    setCurrentPage('help');
  }

  async function handleReleaseNotesBackupExport() {
    try {
      await exportCurrentBackup();
      markReleaseNotesSeen();
      setReleaseNotesSeen(true);
    } catch (error) {
      console.error(error);
      setStatusMessage('Backup export failed.');
    }
  }

  async function handleImportData(importedData) {
    const safeImportedData = getSafeAppData(importedData);
    const importedHasRecords =
      safeImportedData.budgetTargets.length > 0 ||
      Object.keys(safeImportedData.plannerEntries).length > 0 ||
      safeImportedData.scheduledItems.length > 0 ||
      safeImportedData.accounts.length > 0 ||
      safeImportedData.manualAdjustments.length > 0 ||
      safeImportedData.savingsBuckets.length > 0 ||
      safeImportedData.savingsBucketAdjustments.length > 0 ||
      safeImportedData.transfers.length > 0;
    const importedAppMetadata = {
      ...safeImportedData.appMetadata,
      dataMode:
        safeImportedData.appMetadata.dataMode ||
        (importedHasRecords ? 'custom' : 'empty'),
    };
    const importedSettings = normalizeAppSettings(safeImportedData.settings);
    const importedPlannerEntries = safeImportedData.plannerEntries;
    const importedCategories = safeImportedData.categories;
    const importedBudgetTargets = safeImportedData.budgetTargets;
    const importedScheduledItems = safeImportedData.scheduledItems;
    const importedAccounts = safeImportedData.accounts;
    const importedManualAdjustments = safeImportedData.manualAdjustments;
    const importedSavingsBuckets = safeImportedData.savingsBuckets;
    const importedSavingsBucketAdjustments =
      safeImportedData.savingsBucketAdjustments;
    const importedTransfers = safeImportedData.transfers;

    const [
      savedImportedAppMetadata,
      ,
      savedImportedBudgetTargets,
      savedImportedCategories,
      ,
      savedImportedScheduledItems,
    ] =
      await Promise.all([
        saveAppMetadata(importedAppMetadata),
        saveAppSettings(importedSettings),
        replaceBudgetTargets(importedBudgetTargets),
        replaceCategories(importedCategories),
        replacePlannerEntries(importedPlannerEntries),
        replaceScheduledItems(importedScheduledItems),
        replaceAccounts(importedAccounts),
        replaceManualAdjustments(importedManualAdjustments),
        replaceSavingsBuckets(importedSavingsBuckets),
        replaceSavingsBucketAdjustments(importedSavingsBucketAdjustments),
        replaceTransfers(importedTransfers),
      ]);

    setSettings(importedSettings);
    setBudgetTargets(savedImportedBudgetTargets);
    setCategories(savedImportedCategories);
    setAppMetadata(savedImportedAppMetadata);
    setPlannerEntries(importedPlannerEntries);
    setScheduledItems(savedImportedScheduledItems);
    setAccounts(importedAccounts);
    setManualAdjustments(importedManualAdjustments);
    setSavingsBuckets(importedSavingsBuckets.filter((bucket) => !bucket.deletedAt));
    setSavingsBucketAdjustments(importedSavingsBucketAdjustments);
    setTransfers(importedTransfers);
    setStatusMessage('Backup imported successfully.');
  }

  async function handleResetToDemoData() {
    const demoData = await resetAppToDemoData();

    applyLoadedData(demoData);
    setDismissedAlertIds([]);
    setStatusMessage('Demo data restored.');
    return demoData;
  }

  async function handleResetToEmptyState() {
    const emptyData = await resetAppToEmptyState();
    applyLoadedData(emptyData);
    setDismissedAlertIds([]);
    setStatusMessage('Factory reset to empty app completed.');
    return emptyData;
  }

  async function handleRepairLocalData() {
    const repairedData = await repairLocalData();

    applyLoadedData(repairedData);
    setStatusMessage('Local data repaired successfully.');

    return repairedData;
  }

  async function handleResetLocalData() {
    return handleResetToEmptyState();
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-finpath-navy)] p-4 text-white">
        <div className="rounded-2xl border border-[#13BFA5] bg-[#102C42] p-6 shadow-sm">
          <img
            src={finPathLogo}
            alt="FinPath"
            className="h-16 w-auto rounded-xl bg-white px-4 py-3"
          />
          <p className="mt-4 text-xl font-bold text-white">
            Loading your planner...
          </p>
          <p className="mt-1 text-sm text-[var(--color-finpath-muted)]">
            Track smarter. Save better.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <AppShell currentPage={currentPage} onPageChange={setCurrentPage}>
        {statusMessage ? (
          <div className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 shadow-sm">
            {statusMessage}
          </div>
        ) : null}

        <Suspense fallback={<PageLoadingFallback />}>
          {currentPage === 'dashboard' ? (
            <Dashboard
              plannerData={plannerData}
              settings={settings}
              alerts={visibleAlerts}
              alertCounts={alertCounts}
              appMetadata={appMetadata}
              isEmptyApp={isEmptyApp}
              onAlertAction={handleAlertAction}
              onDismissAlert={handleDismissAlert}
              onCompleteOnboarding={handleCompleteOnboarding}
              onStartEmpty={handleStartEmptyFromOnboarding}
              onImportBackup={handleImportBackupFromOnboarding}
              onOpenHelp={() => setCurrentPage('help')}
            />
          ) : null}

          {currentPage === 'planner' ? (
            <Planner
              plannerData={plannerData}
              plannerEntries={plannerEntries}
              settings={settings}
              alerts={plannerAlerts}
              onCellClick={setSelectedCell}
            />
          ) : null}

          {currentPage === 'manage' ? (
            <Manage onOpenPage={setCurrentPage} />
          ) : null}

          {currentPage === 'scheduled-items' ? (
            <ScheduledItems
              scheduledItems={scheduledItems}
              categories={categories}
              savingsBuckets={savingsBuckets}
              settings={settings}
              alerts={scheduledItemAlerts}
              onAlertAction={handleAlertAction}
              onDismissAlert={handleDismissAlert}
              onSaveScheduledItem={handleSaveScheduledItem}
              onDuplicateScheduledItem={handleDuplicateScheduledItem}
              onDeleteScheduledItem={handleDeleteScheduledItem}
            />
          ) : null}

          {currentPage === 'transactions' ? (
            <Transactions
              settings={settings}
              scheduledItems={scheduledItems}
              manualAdjustments={manualAdjustments}
              savingsBucketAdjustments={savingsBucketAdjustments}
              transfers={transfers}
              savingsBuckets={savingsBuckets}
              accounts={accounts}
              categories={categories}
            />
          ) : null}

          {currentPage === 'accounts' ? (
            <Accounts
              accounts={accounts}
              categories={categories}
              manualAdjustments={manualAdjustments}
              transfers={transfers}
              savingsBuckets={savingsBuckets}
              payPeriods={plannerData.payPeriods}
              settings={settings}
              onSaveAccount={handleSaveAccount}
              onSaveManualAdjustment={handleSaveManualAdjustment}
              onDeleteManualAdjustment={handleDeleteManualAdjustment}
              onSaveTransfer={handleSaveTransfer}
              onDeleteTransfer={handleDeleteTransfer}
            />
          ) : null}

          {currentPage === 'savings-buckets' ? (
            <SavingsBuckets
              savingsBuckets={savingsBuckets}
              savingsBucketAdjustments={savingsBucketAdjustments}
              transfers={transfers}
              accounts={accounts}
              scheduledItems={scheduledItems}
              plannerData={plannerData}
              settings={settings}
              onSaveSavingsBucket={handleSaveSavingsBucket}
              onDeleteSavingsBucket={handleDeleteSavingsBucket}
              onSaveSavingsBucketAdjustment={handleSaveSavingsBucketAdjustment}
              onDeleteSavingsBucketAdjustment={handleDeleteSavingsBucketAdjustment}
              onSaveTransfer={handleSaveTransfer}
              onDeleteTransfer={handleDeleteTransfer}
            />
          ) : null}

          {currentPage === 'budgets' ? (
            <Budgets
              settings={settings}
              budgetTargets={budgetTargets}
              categories={categories}
              scheduledItems={scheduledItems}
              manualAdjustments={manualAdjustments}
              savingsBucketAdjustments={savingsBucketAdjustments}
              transfers={transfers}
              savingsBuckets={savingsBuckets}
              accounts={accounts}
              alerts={budgetAlerts}
              onAlertAction={handleAlertAction}
              onDismissAlert={handleDismissAlert}
              onSaveBudgetTarget={handleSaveBudgetTarget}
              onArchiveBudgetTarget={handleArchiveBudgetTarget}
              onResetBudgetTargets={handleResetBudgetTargets}
            />
          ) : null}

          {currentPage === 'categories' ? (
            <Categories
              categories={categories}
              onSaveCategory={handleSaveCategory}
              onArchiveCategory={handleArchiveCategory}
              onResetCategories={handleResetCategories}
            />
          ) : null}

          {currentPage === 'reports' ? (
            <Reports
              settings={settings}
              budgetTargets={budgetTargets}
              categories={categories}
              plannerData={plannerData}
              plannerRows={plannerData.payPeriods}
              scheduledItems={scheduledItems}
              manualAdjustments={manualAdjustments}
              accounts={accounts}
              miscExpenses={manualAdjustments.filter(
                (adjustment) => adjustment.type === 'misc-expense'
              )}
              savingsBuckets={savingsBuckets}
              savingsTransfers={[...savingsBucketAdjustments, ...transfers]}
            />
          ) : null}

          {currentPage === 'settings' ? (
            <Settings
              settings={settings}
              appData={appData}
              onSaveSettings={handleSaveSettings}
              onResetSettings={handleResetSettings}
              onImportData={handleImportData}
              onBackupExported={handleBackupExported}
              onRepairLocalData={handleRepairLocalData}
              onResetToDemoData={handleResetToDemoData}
              onResetToEmptyState={handleResetToEmptyState}
              onResetLocalData={handleResetLocalData}
              onShowHelp={() => setCurrentPage('help')}
            />
          ) : null}

          {currentPage === 'help' ? <Help /> : null}
        </Suspense>
      </AppShell>

      <CellEditor
        selectedCell={selectedCell}
        plannerEntries={plannerEntries}
        settings={settings}
        onClose={() => setSelectedCell(null)}
        onSave={handleSaveCell}
        onClear={handleClearCell}
      />

      {needRefresh ? (
        <div className="fixed bottom-4 left-4 right-4 z-50 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl sm:left-auto sm:max-w-sm">
          <p className="text-sm font-semibold text-slate-950">
            A new version is available.
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Refresh to update FinPath. Your local data stays in this
            browser profile.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => updateServiceWorker(true)}
              className="min-h-11 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Refresh App
            </button>
            <button
              type="button"
              onClick={() => setNeedRefresh(false)}
              className="min-h-11 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Later
            </button>
          </div>
        </div>
      ) : null}

      {showReleaseNotes ? (
        <ReleaseNotesModal
          releaseNotes={RELEASE_NOTES}
          onClose={handleCloseReleaseNotes}
          onViewHelp={handleViewReleaseNotesHelp}
          onExportBackup={handleReleaseNotesBackupExport}
        />
      ) : null}
    </>
  );
}
