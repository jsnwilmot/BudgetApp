import { useEffect, useMemo, useState } from 'react';
import AppShell from './components/AppShell';
import CellEditor from './components/CellEditor';
import {
  accounts as seedAccounts,
  appSettings,
  budgetTargets as seedBudgetTargets,
  categories as seedCategories,
  manualAdjustments as seedManualAdjustments,
  savingsBuckets as seedSavingsBuckets,
  scheduledItems as seedScheduledItems,
} from './data/seedData';
import {
  clearAllSavedData,
  archiveCategory,
  archiveBudgetTarget,
  deleteManualAdjustment,
  deletePlannerEntry,
  deleteScheduledItem,
  deleteSavingsBucketAdjustment,
  getAppSettings,
  getAllAccounts,
  getAllBudgetTargets,
  getAllCategories,
  getAllManualAdjustments,
  getAllPlannerEntries,
  getAllSavingsBucketAdjustments,
  getAllSavingsBuckets,
  getAllScheduledItems,
  normalizeAppSettings,
  replaceAccounts,
  replaceBudgetTargets,
  replaceCategories,
  replaceManualAdjustments,
  replacePlannerEntries,
  replaceSavingsBucketAdjustments,
  replaceSavingsBuckets,
  replaceScheduledItems,
  resetAppSettings,
  resetBudgetTargets,
  resetCategoriesToDefaults,
  saveAccount,
  saveAppSettings,
  saveBudgetTarget,
  saveManualAdjustment,
  saveCategory,
  savePlannerEntry,
  saveSavingsBucket,
  saveSavingsBucketAdjustment,
  saveScheduledItem,
  validateAppSettings,
} from './data/db';
import { buildPlannerRows, calculatePeriodTotals } from './logic/projectionLogic';
import { normalizeScheduledItem } from './logic/scheduledItemLogic';
import Accounts from './pages/Accounts';
import Budgets from './pages/Budgets';
import Categories from './pages/Categories';
import Dashboard from './pages/Dashboard';
import Planner from './pages/Planner';
import Reports from './pages/Reports';
import SavingsBuckets from './pages/SavingsBuckets';
import ScheduledItems from './pages/ScheduledItems';
import Settings from './pages/Settings';
import Transactions from './pages/Transactions';

function normalizePlannerEntries(entries) {
  if (Array.isArray(entries)) {
    return entries.reduce((result, entry) => {
      if (entry?.entryKey) {
        result[entry.entryKey] = entry;
      }

      return result;
    }, {});
  }

  return entries && typeof entries === 'object' ? entries : {};
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

function getArrayValue(value) {
  return Array.isArray(value) ? value : [];
}

const normalizedSeedScheduledItems = seedScheduledItems.map((item) =>
  normalizeScheduledItem(item)
);

export default function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [settings, setSettings] = useState(appSettings);
  const [budgetTargets, setBudgetTargets] = useState(seedBudgetTargets);
  const [categories, setCategories] = useState(seedCategories);
  const [plannerEntries, setPlannerEntries] = useState({});
  const [scheduledItems, setScheduledItems] = useState(
    normalizedSeedScheduledItems
  );
  const [accounts, setAccounts] = useState(seedAccounts);
  const [manualAdjustments, setManualAdjustments] = useState(
    seedManualAdjustments
  );
  const [savingsBuckets, setSavingsBuckets] = useState(seedSavingsBuckets);
  const [savingsBucketAdjustments, setSavingsBucketAdjustments] = useState([]);
  const [selectedCell, setSelectedCell] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState('');

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
        ]);

        setSettings(savedSettings);
        setBudgetTargets(savedBudgetTargets);
        setCategories(savedCategories);
        setPlannerEntries(savedPlannerEntries);

        if (savedScheduledItems.length > 0) {
          const savedItemsById = new Map(
            savedScheduledItems.map((item) => [item.id, item])
          );

          const mergedSeedItems = normalizedSeedScheduledItems.map((seedItem) => {
            return savedItemsById.get(seedItem.id) || seedItem;
          });

          const seedIds = new Set(
            normalizedSeedScheduledItems.map((item) => item.id)
          );

          const customItems = savedScheduledItems.filter((item) => {
            return !seedIds.has(item.id);
          });

          setScheduledItems([...mergedSeedItems, ...customItems]);
        }

        if (savedAccounts.length > 0) {
          const savedAccountsById = new Map(
            savedAccounts.map((account) => [account.id, account])
          );

          const mergedAccounts = seedAccounts.map((seedAccount) => {
            return savedAccountsById.get(seedAccount.id) || seedAccount;
          });

          setAccounts(mergedAccounts);
        }

        if (savedSavingsBuckets.length > 0) {
          const savedBucketsById = new Map(
            savedSavingsBuckets.map((bucket) => [bucket.id, bucket])
          );

          const mergedSeedBuckets = seedSavingsBuckets.map((seedBucket) => {
            return savedBucketsById.get(seedBucket.id) || seedBucket;
          });

          const seedBucketIds = new Set(
            seedSavingsBuckets.map((bucket) => bucket.id)
          );

          const customBuckets = savedSavingsBuckets.filter((bucket) => {
            return !seedBucketIds.has(bucket.id);
          });

          const allBuckets = [...mergedSeedBuckets, ...customBuckets].filter(
            (bucket) => !bucket.deletedAt
          );

          setSavingsBuckets(allBuckets);
        }

        setManualAdjustments(savedManualAdjustments);
        setSavingsBucketAdjustments(savedSavingsBucketAdjustments);
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
      plannerEntries,
    });
  }, [
    plannerEntries,
    settings,
    scheduledItems,
    accounts,
    manualAdjustments,
    savingsBucketAdjustments,
  ]);

  const appData = useMemo(
    () => ({
      settings,
      budgetTargets,
      categories,
      plannerEntries,
      scheduledItems,
      accounts,
      manualAdjustments,
      savingsBuckets,
      savingsBucketAdjustments,
      planner: {
        entries: plannerEntries,
        payPeriods: plannerData.payPeriods,
        rows: buildExportPlannerRows(plannerData),
      },
      savings: {
        buckets: savingsBuckets,
        transfers: savingsBucketAdjustments,
      },
    }),
    [
      accounts,
      manualAdjustments,
      plannerData,
      plannerEntries,
      savingsBucketAdjustments,
      savingsBuckets,
      scheduledItems,
      settings,
      budgetTargets,
      categories,
    ]
  );

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

      setAccounts((currentAccounts) =>
        currentAccounts.map((account) =>
          account.id === savedAccount.id ? savedAccount : account
        )
      );

      setStatusMessage('Account balance saved.');
    } catch (error) {
      console.error(error);
      setStatusMessage('Could not save account balance.');
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

  async function handleImportData(importedData) {
    const importedSettings = normalizeAppSettings(importedData?.settings);
    const importedPlannerEntries = normalizePlannerEntries(
      importedData?.plannerEntries || importedData?.planner?.entries || {}
    );
    const importedCategories = Array.isArray(importedData?.categories)
      ? importedData.categories
      : seedCategories;
    const importedBudgetTargets = Array.isArray(importedData?.budgetTargets)
      ? importedData.budgetTargets
      : [];
    const importedScheduledItems = Array.isArray(importedData?.scheduledItems)
      ? importedData.scheduledItems.map((item) => normalizeScheduledItem(item))
      : [];
    const importedAccounts = Array.isArray(importedData?.accounts)
      ? importedData.accounts
      : [];
    const importedManualAdjustments = Array.isArray(
      importedData?.manualAdjustments
    )
      ? importedData.manualAdjustments
      : [];
    const importedSavingsBuckets = Array.isArray(importedData?.savingsBuckets)
      ? importedData.savingsBuckets
      : getArrayValue(importedData?.savings?.buckets);
    const importedSavingsBucketAdjustments = Array.isArray(
      importedData?.savingsBucketAdjustments
    )
      ? importedData.savingsBucketAdjustments
      : getArrayValue(importedData?.savings?.transfers);

    const [
      ,
      savedImportedBudgetTargets,
      savedImportedCategories,
      ,
      savedImportedScheduledItems,
    ] =
      await Promise.all([
        saveAppSettings(importedSettings),
        replaceBudgetTargets(importedBudgetTargets),
        replaceCategories(importedCategories),
        replacePlannerEntries(importedPlannerEntries),
        replaceScheduledItems(importedScheduledItems),
        replaceAccounts(importedAccounts),
        replaceManualAdjustments(importedManualAdjustments),
        replaceSavingsBuckets(importedSavingsBuckets),
        replaceSavingsBucketAdjustments(importedSavingsBucketAdjustments),
      ]);

    setSettings(importedSettings);
    setBudgetTargets(savedImportedBudgetTargets);
    setCategories(savedImportedCategories);
    setPlannerEntries(importedPlannerEntries);
    setScheduledItems(
      importedScheduledItems.length > 0
        ? savedImportedScheduledItems
        : normalizedSeedScheduledItems
    );
    setAccounts(importedAccounts.length > 0 ? importedAccounts : seedAccounts);
    setManualAdjustments(importedManualAdjustments);
    setSavingsBuckets(
      importedSavingsBuckets.length > 0
        ? importedSavingsBuckets.filter((bucket) => !bucket.deletedAt)
        : seedSavingsBuckets
    );
    setSavingsBucketAdjustments(importedSavingsBucketAdjustments);
    setStatusMessage('Backup imported successfully.');
  }

  async function handleResetLocalData() {
    await clearAllSavedData();
    setSettings(appSettings);
    setBudgetTargets(seedBudgetTargets);
    setCategories(seedCategories);
    setPlannerEntries({});
    setScheduledItems(normalizedSeedScheduledItems);
    setAccounts(seedAccounts);
    setManualAdjustments(seedManualAdjustments);
    setSavingsBuckets(seedSavingsBuckets);
    setSavingsBucketAdjustments([]);
    setStatusMessage('Local data reset successfully.');
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-700">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Budget Planner
          </p>
          <p className="mt-2 text-xl font-bold text-slate-950">
            Loading saved planner data...
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

        {currentPage === 'dashboard' ? (
          <Dashboard plannerData={plannerData} settings={settings} />
        ) : null}

        {currentPage === 'planner' ? (
          <Planner
            plannerData={plannerData}
            plannerEntries={plannerEntries}
            settings={settings}
            onCellClick={setSelectedCell}
          />
        ) : null}

        {currentPage === 'scheduled-items' ? (
          <ScheduledItems
            scheduledItems={scheduledItems}
            categories={categories}
            settings={settings}
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
            payPeriods={plannerData.payPeriods}
            settings={settings}
            onSaveAccount={handleSaveAccount}
            onSaveManualAdjustment={handleSaveManualAdjustment}
            onDeleteManualAdjustment={handleDeleteManualAdjustment}
          />
        ) : null}

        {currentPage === 'savings-buckets' ? (
          <SavingsBuckets
            savingsBuckets={savingsBuckets}
            savingsBucketAdjustments={savingsBucketAdjustments}
            scheduledItems={scheduledItems}
            plannerData={plannerData}
            settings={settings}
            onSaveSavingsBucket={handleSaveSavingsBucket}
            onDeleteSavingsBucket={handleDeleteSavingsBucket}
            onSaveSavingsBucketAdjustment={handleSaveSavingsBucketAdjustment}
            onDeleteSavingsBucketAdjustment={handleDeleteSavingsBucketAdjustment}
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
            savingsBuckets={savingsBuckets}
            accounts={accounts}
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
            savingsTransfers={savingsBucketAdjustments}
          />
        ) : null}

        {currentPage === 'settings' ? (
          <Settings
            settings={settings}
            appData={appData}
            onSaveSettings={handleSaveSettings}
            onResetSettings={handleResetSettings}
            onImportData={handleImportData}
            onResetLocalData={handleResetLocalData}
          />
        ) : null}
      </AppShell>

      <CellEditor
        selectedCell={selectedCell}
        plannerEntries={plannerEntries}
        settings={settings}
        onClose={() => setSelectedCell(null)}
        onSave={handleSaveCell}
        onClear={handleClearCell}
      />
    </>
  );
}
