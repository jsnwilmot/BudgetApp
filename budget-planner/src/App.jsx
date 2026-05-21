import { useEffect, useMemo, useState } from 'react';
import AppShell from './components/AppShell';
import CellEditor from './components/CellEditor';
import {
  accounts,
  appSettings,
  manualAdjustments,
  scheduledItems,
} from './data/seedData';
import {
  deletePlannerEntry,
  getAllPlannerEntries,
  savePlannerEntry,
} from './data/db';
import { buildPlannerRows } from './logic/projectionLogic';
import Dashboard from './pages/Dashboard';
import Planner from './pages/Planner';
import Settings from './pages/Settings';

export default function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [plannerEntries, setPlannerEntries] = useState({});
  const [selectedCell, setSelectedCell] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    async function loadPlannerEntries() {
      try {
        const savedEntries = await getAllPlannerEntries();
        setPlannerEntries(savedEntries);
      } catch (error) {
        console.error(error);
        setStatusMessage('Could not load saved planner entries.');
      } finally {
        setLoading(false);
      }
    }

    loadPlannerEntries();
  }, []);

  const plannerData = useMemo(() => {
    return buildPlannerRows({
      settings: appSettings,
      accounts,
      scheduledItems,
      manualAdjustments,
      plannerEntries,
    });
  }, [plannerEntries]);

  async function handleSaveCell(entryKey, entry) {
    try {
      const savedEntry = await savePlannerEntry(entryKey, entry);

      setPlannerEntries((currentEntries) => ({
        ...currentEntries,
        [entryKey]: savedEntry,
      }));

      setSelectedCell(null);
      setStatusMessage('Saved.');
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
      setStatusMessage('Entry cleared.');
    } catch (error) {
      console.error(error);
      setStatusMessage('Could not clear planner entry.');
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