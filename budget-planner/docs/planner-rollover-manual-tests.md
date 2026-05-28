# Pay Period Planner rollover manual tests

Use these checks before release to confirm the planner stays usable after the original projection range ends.

## 1. Today inside the current generated range

1. Set the pay period anchor date to a recent pay date.
2. Set the pay frequency to 14 days.
3. Set the projection range to 12 months.
4. Open the Pay Period Planner.
5. Confirm the Current Pay Period Summary shows the pay period that includes today.
6. Confirm the grid scrolls near the current pay period.

Expected result: the planner shows today inside the generated range and still projects at least 12 months forward from today.

## 2. Today after the original final generated pay period

1. Use an old pay period anchor date, for example `2026-06-03`.
2. Use a 14-day pay frequency and a 12-month projection range.
3. Test with today's date after the old final period, for example after `2027-06-02`.
4. Open the Pay Period Planner.

Expected result: the planner still shows a current pay period and extends at least 12 months into the future.

## 3. December to January year rollover

1. Use a pay period range that crosses December into January.
2. Add or confirm at least one recurring monthly item.
3. Open the Pay Period Planner.

Expected result: pay periods continue into January of the next year without stopping or showing an empty current period.

## 4. Recurring monthly item appears in the new year

1. Add a monthly recurring bill or income item.
2. Confirm it appears in December.
3. Move into the January pay periods in the grid.

Expected result: the monthly recurring item appears in the correct assigned January pay period.

## 5. One-time item does not duplicate

1. Add a one-time scheduled item.
2. Confirm it appears once in the assigned pay period.
3. Review the next several generated pay periods.

Expected result: the one-time item does not repeat in later pay periods.

## 6. Saved planner entries outside the visible/current focus remain stored

1. Edit a planner cell in an older pay period.
2. Add an actual amount, line item, note, or validation flag.
3. Move forward to a later generated range.
4. Export or inspect app data.

Expected result: the saved planner entry remains in `plannerEntries`. The rollover logic does not delete, rename, or rewrite saved entry keys.
