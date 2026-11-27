"""Exercise local-date rollover and bounded history in disposable Chromium profiles."""

import argparse
from datetime import date, timedelta
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
from time import perf_counter

from playwright.sync_api import expect, sync_playwright

from atomic_import import DATE, StaticHandler
from full_backup import census, open_settings
from historical_integrity import RENT_ID, open_planner, rent_records, rent_row, select_year


ZONE = "America/Edmonton"


def at_local(page, year, month, day, hour=12, minute=0):
    # Let Chromium resolve wall time using its own local timezone rules.
    return page.evaluate("parts => new Date(...parts).toISOString()",
                         [year, month - 1, day, hour, minute])


def confirmed(pay_date=DATE, **fields):
    return {
        "entryKey": f"{RENT_ID}__{pay_date}",
        "scheduledItemId": RENT_ID, "payPeriodDate": pay_date,
        "plannedAmount": 1200, "validated": True, "useActual": False,
        **fields,
    }


def track_writes(page):
    page.evaluate("""() => {
      window.storageWrites = [];
      const transaction = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function(names, mode, options) {
        const tx = transaction.call(this, names, mode, options);
        if (tx.mode === 'readwrite') window.storageWrites.push([...tx.objectStoreNames]);
        return tx;
      };
    }""")


def period_table(page):
    return page.get_by_role("region", name="Scrollable pay periods").get_by_role("table")


def dates_on_grid(page):
    return period_table(page).locator("thead time").evaluate_all(
        "(headers) => headers.map(header => header.dateTime)"
    )


def expect_range(page, endpoint):
    expect(page.get_by_text(
        f"Rolling calculations extend through {endpoint}.", exact=False
    )).to_be_visible()


def verify_clock(chromium, executable, profile, origin):
    records = rent_records()
    records["appSettings"][0]["projectionMonths"] = 3
    records["scheduledItems"][0]["amount"] = 1700
    records["plannerEntries"] = [confirmed(
        scheduledItemSnapshot={
            "id": RENT_ID, "name": "Synthetic rent", "type": "expense",
            "accountId": "Old-cash", "categoryId": "Old-category",
        },
        scheduledItemSnapshotProvenance="captured-at-entry-save",
    )]
    records["appMetadata"][0]["plannerLastEntryMarker"] = {
        "plannerItemId": RENT_ID, "occurrenceId": DATE, "cellKey": f"{RENT_ID}__{DATE}",
    }
    context, page = open_settings(
        chromium, executable, profile, origin, records, timezone_id=ZONE,
        configure_clock=lambda page: page.clock.install(time=at_local(page, 2026, 11, 30, 23, 58)),
    )
    try:
        before = census(page)
        track_writes(page)
        open_planner(page)
        expect_range(page, "2027-02-18")
        november_dates = dates_on_grid(page)
        assert november_dates[0] == DATE and november_dates[-1] == "2026-12-30"

        page.clock.fast_forward(120_000)
        expect_range(page, "2027-12-31")
        assert dates_on_grid(page) == november_dates
        select_year(page, 2027)
        december_dates = dates_on_grid(page)
        expected_2027 = [(date(2027, 1, 13) + timedelta(days=14 * index)).isoformat()
                         for index in range(26)]
        assert december_dates == expected_2027

        page.get_by_role("button", name="Dashboard", exact=True).click()
        expect(page.get_by_role("heading", name="3-Month Account Projection")).to_be_visible()
        next_pay = page.get_by_text("Next Pay Date", exact=True).locator("..")
        expect(next_pay.get_by_text("Dec 02", exact=True)).to_be_visible()
        open_planner(page)

        page.clock.set_system_time(at_local(page, 2027, 1, 1))
        page.evaluate("""() => {
          Object.defineProperty(document, 'visibilityState', {configurable: true, value: 'hidden'});
          document.dispatchEvent(new Event('visibilitychange'));
        }""")
        expect(page.get_by_text("2026-11-18", exact=True)).to_be_visible()
        page.evaluate("""() => {
          delete document.visibilityState;
          document.dispatchEvent(new Event('visibilitychange'));
        }""")
        expect(page.get_by_text("2026-12-30", exact=True)).to_be_visible()
        expect_range(page, "2027-12-31")
        assert dates_on_grid(page) == november_dates
        select_year(page, 2027)
        assert dates_on_grid(page) == december_dates
        select_year(page, 2026)
        expect(rent_row(page).get_by_role("cell").first).to_contain_text("1,200.00")
        assert census(page) == before
        assert page.evaluate("window.storageWrites") == []
    finally:
        context.close()

    context, page = open_settings(
        chromium, executable, profile, origin, timezone_id=ZONE,
        configure_clock=lambda page: page.clock.set_fixed_time(at_local(page, 2027, 1, 1)),
    )
    try:
        assert census(page) == before
        open_planner(page)
        expect_range(page, "2027-12-31")
        assert dates_on_grid(page) == november_dates
        select_year(page, 2027)
        assert dates_on_grid(page) == december_dates
        select_year(page, 2026)
        expect(page.get_by_role("button", name="Marked as Last Entry.", exact=False)).to_have_count(1)
        expect(rent_row(page).get_by_role("cell").first).to_contain_text("1,200.00")
        print("PASS CP-14/16/24/42: Edmonton midnight and visibility refresh, 26 starts in 2027, exact 11-store equality after reopen", flush=True)
    finally:
        context.close()


def verify_warnings(chromium, executable, profile, origin):
    records = rent_records()
    records["plannerEntries"] = [
        confirmed(),
        confirmed("2026-06-17", plannedAmount=None),
        confirmed("2026-07-01", scheduledItemSnapshot={"id": "conflicting", "type": "expense"}),
    ]
    context, page = open_settings(
        chromium, executable, profile, origin, records, timezone_id=ZONE,
        configure_clock=lambda page: page.clock.set_fixed_time(at_local(page, 2026, 6, 4)),
    )
    try:
        before = census(page)
        track_writes(page)
        open_planner(page)
        row = rent_row(page)
        expect(row).not_to_contain_text("Source unverified")
        expect(row.get_by_role("cell").nth(1)).to_contain_text("Amount needs review")
        expect(row.get_by_role("cell").nth(2)).to_contain_text("Source conflict. Excluded from totals.")
        balance_row = page.get_by_role("row", name="Validated Chequing", exact=False)
        for index in range(3):
            expect(balance_row.get_by_role("cell").nth(index)).to_have_text("$65.00")
        row.get_by_role("cell").first.get_by_role("button").click()
        expect(page.get_by_text("FinPath could not verify the original account", exact=False)).to_be_visible()
        expect(page.get_by_text("The saved amount is preserved.", exact=False)).to_be_visible()
        assert census(page) == before
        assert page.evaluate("window.storageWrites") == []
        print("PASS B-F1: editor explains uncertain source, grid flags missing and conflicting history, validated chequing remains 65", flush=True)
    finally:
        context.close()


def long_records():
    records = rent_records()
    start = date(2016, 1, 6)
    records["appSettings"][0].update(payPeriodAnchorDate=start.isoformat(), projectionMonths=3,
                                    payFrequencyDays=7)
    period_dates = [(start + timedelta(days=7 * i)).isoformat() for i in range(522)]
    records["scheduledItems"] = []
    for index in range(12):
        identifier = f"synthetic-income-{index}"
        records["scheduledItems"].append({
            "id": identifier, "name": f"Synthetic income {index}", "type": "income",
            "frequency": "weekly", "accountId": "Old-cash", "amount": 100,
            "startDate": start.isoformat(),
        })
        records["plannerEntries"].extend({
            "entryKey": f"{identifier}__{pay_date}", "scheduledItemId": identifier,
            "payPeriodDate": pay_date, "plannedAmount": 100, "validated": True, "useActual": False,
        } for pay_date in period_dates)
    return records


def verify_long_grid(chromium, executable, profile, origin):
    records = long_records()
    context, page = open_settings(
        chromium, executable, profile, origin, records, timezone_id=ZONE,
        configure_clock=lambda page: page.clock.set_fixed_time(at_local(page, 2026, 12, 1)),
    )
    try:
        before = census(page)
        track_writes(page)
        started = perf_counter()
        open_planner(page)
        table = period_table(page)
        column_count = int(table.get_attribute("aria-colcount")) - 1
        assert column_count == 52
        expect_range(page, "2027-12-31")
        grid = page.get_by_role("region", name="Scrollable pay periods")
        expect(table.locator('thead time[datetime="2026-11-25"]')).to_have_count(1)
        open_ms = (perf_counter() - started) * 1000
        counts = [len(dates_on_grid(page))]
        assert "2016-01-06" not in dates_on_grid(page)
        select_year(page, 2016)
        expect(table).to_have_attribute("aria-colcount", "53")
        expect(table.locator('thead time[datetime="2016-01-06"]')).to_have_count(1)
        counts.append(len(dates_on_grid(page)))
        grid.evaluate("(element) => { element.scrollLeft = element.scrollWidth; }")
        final_date = date(2016, 1, 6) + timedelta(days=7 * (column_count - 1))
        expect(table.locator(f'thead time[datetime="{final_date.isoformat()}"]')).to_have_count(1)
        counts.append(len(dates_on_grid(page)))
        assert all(0 < count <= 24 for count in counts), counts
        assert len(before["stores"]["plannerEntries"]["rows"]) == len(records["plannerEntries"])
        assert census(page) == before
        assert page.evaluate("window.storageWrites") == []
        print(f"PASS CP-26: {column_count} columns in one year, {len(records['plannerEntries'])} saved entries, "
              f"mounted columns current/start/end {counts}, Planner open {open_ms:.0f} ms", flush=True)
    finally:
        context.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    args = parser.parse_args()
    build = Path(__file__).resolve().parents[2] / "dist"
    assert (build / "index.html").is_file(), "Run npm run build first"
    with TemporaryDirectory(prefix="finpath-continuous-") as profiles, ThreadingHTTPServer(
        ("127.0.0.1", 0), partial(StaticHandler, directory=str(build)),
    ) as server:
        Thread(target=server.serve_forever, daemon=True).start()
        try:
            origin = f"http://127.0.0.1:{server.server_port}"
            with sync_playwright() as playwright:
                for check in (verify_clock, verify_warnings, verify_long_grid):
                    check(playwright.chromium, args.chromium, str(Path(profiles) / check.__name__), origin)
        finally:
            server.shutdown()


if __name__ == "__main__":
    main()
