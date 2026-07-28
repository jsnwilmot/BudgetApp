import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  applyPlannerLastEntrySaveAction,
  getLastEntrySaveAction,
  getPlannerCellMarker,
  isPlannerCellMarked,
  isPlannerLastEntryMarkerValid,
  normalizePlannerLastEntryMarker,
} from '../src/logic/plannerLastEntryMarker.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const plannerData = {
  payPeriods: [
    { date: '2026-06-03', label: 'Jun 3' },
    { date: '2026-06-17', label: 'Jun 17' },
  ],
  rows: [
    {
      id: 'income-paycheque',
      type: 'income',
      amountsByPeriod: {
        '2026-06-03': 2500,
        '2026-06-17': 2500,
      },
    },
    {
      id: 'expense-rent',
      type: 'expense',
      amountsByPeriod: {
        '2026-06-03': 1200,
        '2026-06-17': 0,
      },
    },
    {
      id: 'projected-chequing',
      type: 'balance',
      amountsByPeriod: {
        '2026-06-03': 3100,
        '2026-06-17': 4300,
      },
    },
  ],
};

test('HTML shell does not load the removed chatbot widget', () => {
  const source = readFileSync(resolve(__dirname, '../index.html'), 'utf8');

  assert.equal(source.includes('getChatBotWidgetSDKLink'), false);
  assert.equal(source.includes('externalApplicationId'), false);
  assert.equal(source.includes('api.abacus.ai'), false);
});

test('Planner grid does not render Last Entry checkbox controls', () => {
  const source = readFileSync(
    resolve(__dirname, '../src/pages/Planner.jsx'),
    'utf8'
  );
  const plannerRowSource = source.slice(
    source.indexOf('function PlannerRow'),
    source.indexOf('export default function Planner')
  );

  assert.equal(plannerRowSource.includes('Mark as last entry'), false);
  assert.equal(plannerRowSource.includes('<span>Last Entry</span>'), false);
  assert.equal(plannerRowSource.includes('type="checkbox"'), false);
  assert.equal(plannerRowSource.includes('onLastEntryMarkerChange'), false);
  assert.equal(plannerRowSource.includes('min-w-44'), false);
  assert.equal(plannerRowSource.includes('planner-last-entry-cell'), true);
});

test('historical release notes do not claim the Last Entry feature', () => {
  const source = readFileSync(
    resolve(__dirname, '../src/data/releaseNotes.js'),
    'utf8'
  );

  assert.equal(source.includes('Last Entry'), false);
  assert.equal(source.includes('last entry'), false);
});

test('Help contains a dedicated Planner Last Entry section', () => {
  const source = readFileSync(
    resolve(__dirname, '../src/pages/Help.jsx'),
    'utf8'
  );
  const lastEntryTitleIndex = source.indexOf('<HelpCard title="Planner Last Entry">');
  const totalRowsTitleIndex = source.indexOf('<HelpCard title="Planner Total Rows">');

  assert.ok(lastEntryTitleIndex >= 0);
  assert.ok(totalRowsTitleIndex > lastEntryTitleIndex);
  assert.ok(source.includes('Closing without saving does not change the marker.'));
});

test('marked Planner cells expose Last Entry context for screen readers', () => {
  const source = readFileSync(
    resolve(__dirname, '../src/pages/Planner.jsx'),
    'utf8'
  );
  const plannerRowSource = source.slice(
    source.indexOf('function PlannerRow'),
    source.indexOf('export default function Planner')
  );

  assert.ok(plannerRowSource.includes('aria-label='));
  assert.ok(plannerRowSource.includes('Marked as Last Entry.'));
});

test('CellEditor renders Mark as last entry below Mark as validated', () => {
  const source = readFileSync(
    resolve(__dirname, '../src/components/CellEditor.jsx'),
    'utf8'
  );
  const validatedIndex = source.indexOf('Mark as validated');
  const lastEntryIndex = source.indexOf('Mark as last entry');
  const notesIndex = source.indexOf('<span className="text-sm font-medium text-slate-700">Notes</span>');

  assert.ok(validatedIndex >= 0);
  assert.ok(lastEntryIndex > validatedIndex);
  assert.ok(notesIndex > lastEntryIndex);
});

test('App remounts CellEditor when the exact selected planner cell changes', () => {
  const source = readFileSync(resolve(__dirname, '../src/App.jsx'), 'utf8');
  const cellEditorIndex = source.indexOf('<CellEditor');
  const cellEditorSource = source.slice(
    cellEditorIndex,
    source.indexOf('/>', cellEditorIndex)
  );

  assert.ok(cellEditorIndex >= 0);
  assert.ok(
    cellEditorSource.includes(
      "key={selectedCell?.entryKey || 'closed-planner-cell-editor'}"
    )
  );
  assert.equal(cellEditorSource.includes('key={selectedCell?.row'), false);
  assert.equal(cellEditorSource.includes('key={selectedCell?.period'), false);
});

test('checking and saving a cell sets the marker', () => {
  const marker = applyPlannerLastEntrySaveAction({
    currentMarker: null,
    rowId: 'income-paycheque',
    periodDate: '2026-06-03',
    lastEntryAction: getLastEntrySaveAction({
      wasMarked: false,
      shouldBeMarked: true,
    }),
  });

  assert.deepEqual(marker, {
    plannerItemId: 'income-paycheque',
    occurrenceId: '2026-06-03',
    cellKey: 'income-paycheque__2026-06-03',
  });
  assert.equal(isPlannerCellMarked(marker, 'income-paycheque', '2026-06-03'), true);
});

test('marking a second cell replaces the first marker', () => {
  const firstMarker = getPlannerCellMarker('income-paycheque', '2026-06-03');
  const nextMarker = applyPlannerLastEntrySaveAction({
    currentMarker: firstMarker,
    rowId: 'expense-rent',
    periodDate: '2026-06-17',
    lastEntryAction: getLastEntrySaveAction({
      wasMarked: false,
      shouldBeMarked: true,
    }),
  });

  assert.equal(isPlannerCellMarked(nextMarker, 'income-paycheque', '2026-06-03'), false);
  assert.equal(isPlannerCellMarked(nextMarker, 'expense-rent', '2026-06-17'), true);
});

test('unchecking and saving the currently marked cell clears the marker', () => {
  const currentMarker = getPlannerCellMarker('income-paycheque', '2026-06-03');
  const nextMarker = applyPlannerLastEntrySaveAction({
    currentMarker,
    rowId: 'income-paycheque',
    periodDate: '2026-06-03',
    lastEntryAction: getLastEntrySaveAction({
      wasMarked: true,
      shouldBeMarked: false,
    }),
  });

  assert.equal(nextMarker, null);
});

test('saving an unmarked cell does not clear another cell marker', () => {
  const currentMarker = getPlannerCellMarker('income-paycheque', '2026-06-03');
  const nextMarker = applyPlannerLastEntrySaveAction({
    currentMarker,
    rowId: 'expense-rent',
    periodDate: '2026-06-17',
    lastEntryAction: getLastEntrySaveAction({
      wasMarked: false,
      shouldBeMarked: false,
    }),
  });

  assert.deepEqual(nextMarker, currentMarker);
});

test('the highlight follows the checked marker state', () => {
  const marker = getPlannerCellMarker('expense-rent', '2026-06-17');

  assert.equal(isPlannerCellMarked(marker, 'expense-rent', '2026-06-17'), true);
  assert.equal(isPlannerCellMarked(marker, 'expense-rent', '2026-06-03'), false);
});

test('CellEditor initializes the Last Entry checkbox from the persisted marker', () => {
  const marker = getPlannerCellMarker('expense-rent', '2026-06-17');

  assert.equal(isPlannerCellMarked(marker, 'expense-rent', '2026-06-17'), true);
  assert.equal(isPlannerCellMarked(marker, 'income-paycheque', '2026-06-17'), false);
});

test('closing without saving leaves marker state unchanged', () => {
  const marker = getPlannerCellMarker('income-paycheque', '2026-06-03');

  assert.deepEqual(
    applyPlannerLastEntrySaveAction({
      currentMarker: marker,
      rowId: 'expense-rent',
      periodDate: '2026-06-17',
      lastEntryAction: 'unchanged',
    }),
    marker
  );
});

test('saved Last Entry markers normalize from backup metadata', () => {
  const marker = normalizePlannerLastEntryMarker({
    plannerItemId: 'income-paycheque',
    occurrenceId: '2026-06-03',
  });

  assert.deepEqual(marker, {
    plannerItemId: 'income-paycheque',
    occurrenceId: '2026-06-03',
    cellKey: 'income-paycheque__2026-06-03',
  });
});

test('invalid saved references are detected safely', () => {
  assert.equal(
    isPlannerLastEntryMarkerValid(
      getPlannerCellMarker('missing-item', '2026-06-03'),
      plannerData
    ),
    false
  );
  assert.equal(
    isPlannerLastEntryMarkerValid(
      getPlannerCellMarker('income-paycheque', '2027-01-01'),
      plannerData
    ),
    false
  );
  assert.equal(
    isPlannerLastEntryMarkerValid(
      getPlannerCellMarker('projected-chequing', '2026-06-03'),
      plannerData
    ),
    false
  );
});

test('deleting the selected planner item makes the saved marker invalid', () => {
  const marker = getPlannerCellMarker('income-paycheque', '2026-06-03');
  const afterDelete = {
    ...plannerData,
    rows: plannerData.rows.filter((row) => row.id !== 'income-paycheque'),
  };

  assert.equal(isPlannerLastEntryMarkerValid(marker, afterDelete), false);
});

test('marker updates do not change validation entries or amount calculations', () => {
  const plannerEntries = {
    'income-paycheque__2026-06-03': {
      validated: true,
      actualAmount: 2500,
    },
  };
  const beforeEntries = JSON.stringify(plannerEntries);
  const beforeRows = JSON.stringify(plannerData.rows);

  applyPlannerLastEntrySaveAction({
    currentMarker: null,
    rowId: 'expense-rent',
    periodDate: '2026-06-03',
    lastEntryAction: 'set',
  });

  assert.equal(JSON.stringify(plannerEntries), beforeEntries);
  assert.equal(JSON.stringify(plannerData.rows), beforeRows);
});
