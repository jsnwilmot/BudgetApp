import { useEffect, useMemo, useState } from 'react';
import AppShell from './components/AppShell';
import CellEditor from './components/CellEditor';
import {
  accounts as seedAccounts,
  appSettings,
  manualAdjustments as seedManualAdjustments,
  savingsBuckets as seedSavingsBuckets,
  scheduledItems as seedScheduledItems,
} from './data/seedData';
import {
  deleteManualAdjustment,
  deletePlannerEntry,
  deleteSavingsBucketAdjustment,
  getAllAccounts,
  getAllManualAdjustments,
  getAllPlannerEntries,
  getAllSavingsBucketAdjustments,
  getAllSavingsBuckets,
  getAllScheduledItems,
  saveAccount,
  saveManualAdjustment,
  savePlannerEntry,
  saveSavingsBucket,
  saveSavingsBucketAdjustment,
  saveScheduledItem,
} from './data/db';
import { buildPlannerRows } from './logic/projectionLogic';
import Accounts from './pages/Accounts';
import Dashboard from './pages/Dashboard';
import Planner from './pages/Planner';
import SavingsBuckets from './pages/SavingsBuckets';
import ScheduledItems from './pages/ScheduledItems';
import Settings from './pages/Settings';

export default function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [plannerEntries, setPlannerEntries] = useState({});
  const [scheduledItems, setScheduledItems] = useState(seedScheduledItems);
  const [accounts, setAccounts] = useState(seedAccounts);
  const [manualAdjustments, setManualAdjustments] = useState(seedManualAdjustments);
  const [savingsBuckets, setSavingsBuckets] = useState(seedSavingsBuckets);
  const [savingsBucketAdjustments, setSavingsBucketAdjustments] = useState([]);
  const [selectedCell, setSelectedCell] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    async function loadSavedData() {
      try {
        const [
          savedPlannerEntries,
          savedScheduledItems,
          savedAccounts,
          savedManualAdjustments,
          savedSavingsBuckets,
          savedSavingsBucketAdjustments,
        ] = await Promise.all([
          getAllPlannerEntries(),
          getAllScheduledItems(),
          getAllAccounts(),
          getAllManualAdjustments(),
          getAllSavingsBuckets(),
          getAllSavingsBucketAdjustments(),
        ]);

        setPlannerEntries(savedPlannerEntries);

        if (savedScheduledItems.length > 0) {
          const savedItemsById = new Map(
            savedScheduledItems.map((item) => [item.id, item])
          );

          const mergedSeedItems = seedScheduledItems.map((seedItem) => {
            return savedItemsById.get(seedItem.id) || seedItem;
          });

          const seedIds = new Set(seedScheduledItems.map((item) => item.id));

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

          const mergedBuckets = seedSavingsBuckets.map((seedBucket) => {
            return savedBucketsById.get(seedBucket.id) || seedBucket;
          });

          setSavingsBuckets(mergedBuckets);
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
      settings: appSettings,
      accounts,
      scheduledItems,
      manualAdjustments,
      savingsBucketAdjustments,
      plannerEntries,
    });
  }, [
    plannerEntries,
    scheduledItems,
    accounts,
    manualAdjustments,
    savingsBucketAdjustments,
  ]);

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
    } catch (error) {
      console.error(error);
      setStatusMessage('Could not save scheduled item.');
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

      setSavingsBuckets((currentBuckets) =>
        currentBuckets.map((bucket) =>
          bucket.id === savedBucket.id ? savedBucket : bucket
        )
      );

      setStatusMessage('Savings bucket saved.');
    } catch (error) {
      console.error(error);
      setStatusMessage('Could not save savings bucket.');
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
          <Dashboard plannerData={plannerData} />
        ) : null}

        {currentPage === 'planner' ? (
          <Planner
            plannerData={plannerData}
            plannerEntries={plannerEntries}
            onCellClick={setSelectedCell}
          />
        ) : null}

        {currentPage === 'scheduled-items' ? (
          <ScheduledItems
            scheduledItems={scheduledItems}
            onSaveScheduledItem={handleSaveScheduledItem}
          />
        ) : null}

        {currentPage === 'accounts' ? (
          <Accounts
            accounts={accounts}
            manualAdjustments={manualAdjustments}
            payPeriods={plannerData.payPeriods}
            onSaveAccount={handleSaveAccount}
            onSaveManualAdjustment={handleSaveManualAdjustment}
            onDeleteManualAdjustment={handleDeleteManualAdjustment}
          />
        ) : null}

        {currentPage === 'savings-buckets' ? (
          <SavingsBuckets
            savingsBuckets={savingsBuckets}
            savingsBucketAdjustments={savingsBucketAdjustments}
            plannerData={plannerData}
            onSaveSavingsBucket={handleSaveSavingsBucket}
            onSaveSavingsBucketAdjustment={handleSaveSavingsBucketAdjustment}
            onDeleteSavingsBucketAdjustment={handleDeleteSavingsBucketAdjustment}
          />
        ) : null}

        {currentPage === 'reports' ? (
          <Dashboard plannerData={plannerData} />
        ) : null}

        {currentPage === 'settings' ? (
          <Settings settings={appSettings} />
        ) : null}
      </AppShell>

      <CellEditor
        selectedCell={selectedCell}
        plannerEntries={plannerEntries}
        onClose={() => setSelectedCell(null)}
        onSave={handleSaveCell}
        onClear={handleClearCell}
      />
    </>
  );
}