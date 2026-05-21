import { useMemo, useState } from 'react';
import AppShell from './components/AppShell';
import CellEditor from './components/CellEditor';
import {
  accounts,
  appSettings,
  manualAdjustments,
  scheduledItems,
} from './data/seedData';
import { buildPlannerRows } from './logic/projectionLogic';
import Dashboard from './pages/Dashboard';
import Planner from './pages/Planner';
import Settings from './pages/Settings';

export default function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [plannerEntries, setPlannerEntries] = useState({});
  const [selectedCell, setSelectedCell] = useState(null);

  const plannerData = useMemo(() => {
    return buildPlannerRows({
      settings: appSettings,
      accounts,
      scheduledItems,
      manualAdjustments,
      plannerEntries,
    });
  }, [plannerEntries]);

  function handleSaveCell(entryKey, entry) {
    setPlannerEntries((currentEntries) => ({
      ...currentEntries,
      [entryKey]: entry,
    }));

    setSelectedCell(null);
  }

  function handleClearCell(entryKey) {
    setPlannerEntries((currentEntries) => {
      const nextEntries = { ...currentEntries };
      delete nextEntries[entryKey];
      return nextEntries;
    });

    setSelectedCell(null);
  }

  return (
    <>
      <AppShell currentPage={currentPage} onPageChange={setCurrentPage}>
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