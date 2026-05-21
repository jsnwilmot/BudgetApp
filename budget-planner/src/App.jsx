import { useMemo, useState } from 'react';
import AppShell from './components/AppShell';
import {
  accounts,
  appSettings,
  manualAdjustments,
  savingsBuckets,
  scheduledItems,
} from './data/seedData';
import { buildPlannerRows } from './logic/projectionLogic';
import Dashboard from './pages/Dashboard';
import Planner from './pages/Planner';
import Settings from './pages/Settings';

export default function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');

  const plannerData = useMemo(() => {
    return buildPlannerRows({
      settings: appSettings,
      accounts,
      scheduledItems,
      savingsBuckets,
      manualAdjustments,
    });
  }, []);

  return (
    <AppShell currentPage={currentPage} onPageChange={setCurrentPage}>
      {currentPage === 'dashboard' ? (
        <Dashboard plannerData={plannerData} />
      ) : null}

      {currentPage === 'planner' ? (
        <Planner plannerData={plannerData} />
      ) : null}

      {currentPage === 'reports' ? (
        <Dashboard plannerData={plannerData} />
      ) : null}

      {currentPage === 'settings' ? (
        <Settings settings={appSettings} />
      ) : null}
    </AppShell>
  );
}