"""Verify Planner year navigation, carry-forward and recovery with synthetic data."""

import argparse
import csv
from datetime import date, timedelta
from functools import partial
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread

from playwright.sync_api import expect, sync_playwright

from atomic_import import DATE, StaticHandler, legacy_backup, use_import
from continuous_planner import ZONE, at_local, confirmed, dates_on_grid, period_table, track_writes
from full_backup import census, open_settings, restore
from historical_integrity import (
    RENT_ID, encoded_fields, open_planner, rent_records, rent_row, select_year,
)


DECEMBER = "2026-12-30"
JANUARY = "2027-01-13"


def fixed_day(year, month, day):
    def configure(page):
        page.clock.set_fixed_time(at_local(page, year, month, day))
    return configure


def expected_dates(year, anchor=DATE, stride=14):
    first = date.fromisoformat(anchor)
    end = date(year, 12, 31)
    starts = []
    while first <= end:
        if first.year == year:
            starts.append(first.isoformat())
        first += timedelta(days=stride)
    return starts


def verify_year(page, year):
    expect(page.get_by_role("heading", name=f"Planner for {year}", exact=True)).to_be_visible()
    expect(page.get_by_role("combobox", name="Planner year", exact=True)).to_have_value(str(year))
    assert dates_on_grid(page) == expected_dates(year)


def verify_balance(page, label, pay_date, amount):
    dates = dates_on_grid(page)
    row = period_table(page).get_by_role("row").filter(has=page.get_by_role("rowheader", name=label, exact=True))
    expect(row.get_by_role("cell").nth(dates.index(pay_date))).to_have_text(amount)


def ledger_records():
    records = rent_records()
    records["appSettings"][0]["projectionMonths"] = 3
    records["accounts"][1]["startingBalance"] = 75
    bucket = records["savingsBuckets"][0]
    bucket["startingAmount"] = 20
    rent = records["scheduledItems"][0]
    rent.update(active=False, amount=1700)
    records["plannerEntries"] = [
        confirmed(
            scheduledItemSnapshot={**rent, "amount": 1200},
            scheduledItemSnapshotProvenance="captured-at-entry-save",
            notes="Confirmed synthetic rent",
        ),
        confirmed("2026-06-17", validated=False, plannedAmount=75, notes="Synthetic draft"),
    ]
    for key, kind, amount, start, changes, entry_changes in [
        ("dec-salary", "income", 500, DECEMBER, {}, {}),
        ("dec-saving", "transfer", 100, DECEMBER, {"bucketId": bucket["id"]}, {}),
        ("jan-salary", "income", 125, JANUARY, {}, {}),
        ("jan-bill", "expense", 25, JANUARY,
         {"frequency": "biweekly", "endDate": JANUARY, "allowLineItems": True},
         {"useActual": True, "actualAmount": 20, "notes": "Two synthetic components",
          "lineItems": [
              {"id": "synthetic-charge-a", "description": "Synthetic line A", "amount": 7},
              {"id": "synthetic-charge-b", "description": "Synthetic line B", "amount": 13},
          ]}),
    ]:
        item = {
            "id": key, "name": key, "type": kind, "amount": amount,
            "startDate": start, "frequency": "once", "accountId": "Old-cash",
            **changes,
        }
        records["scheduledItems"].append(item)
        records["plannerEntries"].append({
            "entryKey": f"{key}__{start}", "scheduledItemId": key, "payPeriodDate": start,
            "plannedAmount": amount, "useActual": False, "validated": True,
            "scheduledItemSnapshot": item, "scheduledItemSnapshotProvenance": "captured-at-entry-save",
            **entry_changes,
        })
    for key, direction, amount, start, source, destination in [
        ("dec-manual-in", "to_savings_bucket", 40, DECEMBER, "Old-cash", "Old-bank"),
        ("jan-manual-out", "from_savings_bucket", 15, JANUARY, "Old-bank", "Old-cash"),
    ]:
        records["transfers"].append({
            "id": key, "transferType": direction, "amount": amount, "validated": True,
            "date": start, "payPeriodDate": start, "fromAccountId": source,
            "toAccountId": destination, "bucketId": bucket["id"], "notes": key,
        })
    records["manualAdjustments"] = [{
        "id": "synthetic-fee", "accountId": "Old-cash", "date": DECEMBER,
        "payPeriodDate": DECEMBER, "amount": -10, "type": "misc-expense",
    }]
    records["savingsBucketAdjustments"] = [{
        "id": "synthetic-adjustment", "date": DECEMBER,
        "payPeriodDate": DECEMBER, "bucketId": bucket["id"], "amount": 3,
    }]
    records["appMetadata"][0]["plannerLastEntryMarker"] = {
        "plannerItemId": RENT_ID, "occurrenceId": DATE, "cellKey": f"{RENT_ID}__{DATE}",
    }
    return records


def assert_today_scroll(page, current_date):
    grid = page.get_by_role("region", name="Scrollable pay periods")
    assert grid.evaluate("""(grid, date) => {
      const target = grid.querySelector(`time[datetime="${date}"]`).parentElement.getBoundingClientRect();
      const viewport = grid.getBoundingClientRect();
      const itemWidth = grid.querySelector("th").getBoundingClientRect().width;
      return grid.scrollLeft > 0 &&
        target.left >= viewport.left + itemWidth - 2 && target.right <= viewport.right + 2;
    }""", current_date)


def edit_historical_note(page, original):
    select_year(page, 2027)
    row = period_table(page).get_by_role("row").filter(
        has=page.get_by_role("rowheader", name="jan-bill", exact=False))
    row.get_by_role("cell").first.get_by_role("button").click()
    updated_note = "Updated synthetic note"
    page.get_by_role("textbox", name="Notes", exact=True).fill(updated_note)
    page.get_by_role("button", name="Save Line Items", exact=True).click()
    expect(page.get_by_text("Planner entry saved.", exact=True)).to_be_visible()
    after_edit = census(page)
    key = f"jan-bill__{JANUARY}"
    original_entry = encoded_fields(original, "plannerEntries", key)
    changed_entry = encoded_fields(after_edit, "plannerEntries", key)
    assert changed_entry.pop("notes") == ["scalar", updated_note]
    assert changed_entry.pop("updatedAt")[0] == "scalar"
    original_entry.pop("notes")
    assert changed_entry == original_entry
    for name in original["stores"]:
        if name == "plannerEntries":
            continue
        assert after_edit["stores"][name] == original["stores"][name]
    assert [pair for pair in after_edit["stores"]["plannerEntries"]["rows"] if pair[0] != ["scalar", key]] == [
        pair for pair in original["stores"]["plannerEntries"]["rows"] if pair[0] != ["scalar", key]
    ]
    verify_balance(page, "Validated Chequing", JANUARY, "$535.00")
    return after_edit


def verify_navigation(chromium, executable, profile, origin):
    context, page = open_settings(
        chromium, executable, profile, origin, ledger_records(),
        configure_clock=fixed_day(2026, 11, 30), timezone_id=ZONE,
    )
    try:
        original = census(page)
        track_writes(page)
        open_planner(page)
        verify_year(page, 2026)
        assert_today_scroll(page, "2026-11-18")
        verify_balance(page, "Validated Chequing", DATE, "$65.00")
        verify_balance(page, "Validated Chequing", DECEMBER, "$415.00")
        verify_balance(page, "Projected Savings", DECEMBER, "$218.00")
        expect(rent_row(page)).to_contain_text("Saved draft. Excluded from totals.")
        marker = page.get_by_role("button", name="Marked as Last Entry.", exact=False)
        expect(marker).to_have_count(1)

        toolbar = page.get_by_role("group", name="Planner year navigation", exact=True)
        previous = toolbar.get_by_role("button", name="Previous Year", exact=True)
        selector = toolbar.get_by_role("combobox", name="Planner year", exact=True)
        next_year = toolbar.get_by_role("button", name="Next Year", exact=True)
        today = toolbar.get_by_role("button", name="Today", exact=True)
        previous.focus()
        previous.press("Tab")
        expect(selector).to_be_focused()
        selector.press("ArrowUp")
        expect(page.get_by_text("No pay periods start in 2025.", exact=False)).to_be_visible()
        selector.press("ArrowDown")
        verify_year(page, 2026)
        selector.press("Tab")
        expect(next_year).to_be_focused()
        next_year.press("Enter")
        verify_year(page, 2027)
        expect(marker).to_have_count(0)
        expect(page.get_by_text("This year extends beyond your regular forecast.", exact=False)).to_be_visible()
        expect(page.get_by_text("2026-11-18", exact=True)).to_be_visible()
        verify_balance(page, "Validated Chequing", JANUARY, "$535.00")
        verify_balance(page, "Projected Savings", JANUARY, "$203.00")

        january_bill = period_table(page).get_by_role("row").filter(
            has=page.get_by_role("rowheader", name="jan-bill", exact=False))
        expect(january_bill.get_by_role("cell").nth(1)).to_have_text("—")
        january_bill.get_by_role("cell").first.get_by_role("button").click()
        expect(page.get_by_text("Pay period: Jan 13 2027", exact=True)).to_be_visible()
        expect(page.get_by_text("Current cell total", exact=True).locator("..")).to_contain_text("$20.00")
        expect(page.locator('input[name="lineDescription"]').first).to_have_value("Synthetic line A")
        expect(page.get_by_role("textbox", name="Notes", exact=True)).to_have_value("Two synthetic components")
        expect(page.get_by_label("Mark as validated")).to_be_checked()
        page.get_by_role("button", name="Close", exact=True).click()

        next_year.click()
        verify_year(page, 2028)
        next_year.click()
        verify_year(page, 2029)
        verify_balance(page, "Validated Chequing", expected_dates(2029)[0], "$535.00")
        verify_balance(page, "Projected Savings", expected_dates(2029)[0], "$203.00")
        select_year(page, 2026)
        expect(marker).to_have_count(1)
        verify_balance(page, "Validated Chequing", DATE, "$65.00")
        previous.click()
        expect(page.get_by_text("No pay periods start in 2025.", exact=False)).to_be_visible()
        expect(period_table(page)).to_have_count(0)
        today.focus()
        today.press("Space")
        verify_year(page, 2026)
        assert_today_scroll(page, "2026-11-18")
        page.get_by_role("region", name="Scrollable pay periods").evaluate("grid => { grid.scrollLeft = 0; }")
        today.click()
        assert_today_scroll(page, "2026-11-18")

        page.get_by_role("button", name="Dashboard", exact=True).click()
        expect(page.get_by_role("heading", name="3-Month Account Projection")).to_be_visible()
        next_pay = page.get_by_text("Next Pay Date", exact=True).locator("..")
        expect(next_pay.get_by_text("Dec 02", exact=True)).to_be_visible()
        open_planner(page)
        verify_year(page, 2026)
        assert census(page) == original
        assert page.evaluate("window.storageWrites") == []
        page.reload(wait_until="domcontentloaded")
        open_planner(page)
        verify_year(page, 2026)
        assert_today_scroll(page, "2026-11-18")
        assert census(page) == original
        print("PASS year navigation: keyboard and mouse, 2025 through 2029, Today positioning and exact 11-store equality after refresh", flush=True)
        fixed_day(2027, 1, 14)(page)
        page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
        expect(page.get_by_text(JANUARY, exact=True)).to_be_visible()
        edited = edit_historical_note(page, original)
        print("PASS historical editor: intentional note edit retains amount, line items, snapshot, keys and all other records", flush=True)

        page.get_by_role("button", name="Settings", exact=True).click()
        with page.expect_download() as download:
            page.get_by_role("button", name="Export Backup", exact=True).click()
        return json.loads(Path(download.value.path()).read_text(encoding="utf-8")), edited
    finally:
        context.close()


def open_period_reports(page):
    page.get_by_role("button", name="Reports", exact=True).click()
    page.get_by_role("button", name="Pay Period", exact=True).click()
    return page.get_by_role("combobox").filter(has=page.locator(f'option[value="{JANUARY}"]'))


def verify_reports(page):
    page.get_by_role("button", name="Dashboard", exact=True).click()
    expect(page.get_by_role("heading", name="3-Month Account Projection")).to_be_visible()
    for label, amount in (("Chequing After Next Period", "$535.00"),
                          ("Savings After Next Period", "$203.00")):
        expect(page.get_by_text(label, exact=True).locator("..").get_by_text(amount, exact=True)).to_be_visible()
    report_period = open_period_reports(page)
    for start, amount in ((DECEMBER, "$415.00"), (JANUARY, "$535.00")):
        report_period.select_option(start)
        balance = page.get_by_text("Remaining Balance", exact=True).locator("..")
        expect(balance.get_by_text(amount, exact=True)).to_be_visible()
    bucket_balances = page.get_by_role("heading", name="Bucket Balances", exact=True).locator("xpath=../..")
    report_bucket = bucket_balances.get_by_role("row").filter(
        has=page.get_by_role("cell", name="Old bucket", exact=True))
    expect(report_bucket.get_by_role("cell").nth(1)).to_have_text("$148.00")
    expect(report_bucket.get_by_role("cell").nth(2)).to_have_text("$148.00")
    page.emulate_media(media="print")
    expect(page.get_by_text(f"Jan 13 ({JANUARY})", exact=False).first).to_be_visible()
    page.emulate_media(media="screen")

    page.get_by_role("button", name="Transactions", exact=True).click()
    movement = page.get_by_role("row").filter(has_text="jan-manual-out")
    expect(movement).to_have_count(1)
    expect(movement).to_contain_text("$15.00")
    page.get_by_role("button", name="Manage", exact=True).click()
    page.get_by_role("button", name="Open Savings Buckets", exact=True).click()
    for label in ("Current Validated Buckets", "Current Projected Buckets", "Final Projected Buckets"):
        expect(page.get_by_text(label, exact=True).locator("..").get_by_text("$148.00", exact=True)).to_be_visible()


def verify_recovered(chromium, executable, profile, origin, original):
    context, page = open_settings(
        chromium, executable, profile, origin,
        configure_clock=fixed_day(2027, 1, 14), timezone_id=ZONE,
    )
    try:
        assert census(page) == original
        track_writes(page)
        open_planner(page)
        verify_year(page, 2027)
        verify_balance(page, "Validated Chequing", JANUARY, "$535.00")
        expect(page.get_by_role("button", name="jan-bill, Jan 13 2027", exact=False)).to_have_attribute(
            "title", "Updated synthetic note")
        select_year(page, 2026)
        expect(page.get_by_role("button", name="Marked as Last Entry.", exact=False)).to_have_count(1)
        verify_reports(page)
        assert census(page) == original
        assert page.evaluate("window.storageWrites") == []
        print("PASS restored ledger: original marker and both years, Reports $415/$535, bucket $148 and selected-period print layout", flush=True)
    finally:
        context.close()


def verify_legacy(chromium, executable, profile, origin):
    records = ledger_records()
    for entry in records["plannerEntries"]:
        entry.pop("scheduledItemSnapshot", None)
        entry.pop("scheduledItemSnapshotProvenance", None)
    context, page = open_settings(
        chromium, executable, profile, origin, rent_records(),
        configure_clock=fixed_day(2027, 1, 14), timezone_id=ZONE,
    )
    try:
        with page.expect_navigation(wait_until="domcontentloaded"):
            use_import(page, legacy_backup(records))
        after_import = census(page)
        expected_keys = sorted(row["entryKey"] for row in records["plannerEntries"])
        stored_keys = [key[1] for key, _ in after_import["stores"]["plannerEntries"]["rows"]]
        assert stored_keys == expected_keys
        track_writes(page)
        open_planner(page)
        verify_balance(page, "Validated Chequing", JANUARY, "$535.00")
        select_year(page, 2026)
        verify_balance(page, "Validated Chequing", DATE, "$65.00")
        expect(page.get_by_role("button", name="Marked as Last Entry.", exact=False)).to_have_count(1)
        assert census(page) == after_import
        assert page.evaluate("window.storageWrites") == []
        print("PASS legacy recovery: cross-year ledger, original keys and marker, zero navigation writes", flush=True)
    finally:
        context.close()


def verify_report_export(chromium, executable, profile, origin):
    context, page = open_settings(
        chromium, executable, profile, origin, ledger_records(),
        configure_clock=fixed_day(2027, 1, 14), timezone_id=ZONE,
    )
    try:
        before = census(page)
        report_period = open_period_reports(page)
        report_period.select_option(JANUARY)
        with page.expect_download() as download:
            page.get_by_role("button", name="Export Current Report CSV", exact=True).click()
        assert JANUARY in download.value.suggested_filename
        with Path(download.value.path()).open(encoding="utf-8-sig", newline="") as csv_file:
            rows = list(csv.reader(csv_file))
        assert ["Summary", "Remaining Balance", "535"] in rows
        assert any(row[:2] == ["Report Metadata", "Period"] and JANUARY in row[2] for row in rows)
        assert census(page) == before
        print("PASS Reports CSV: selected January pay period and reconciled balance in the downloaded file", flush=True)
    finally:
        context.close()


def verify_touch_layout(chromium, executable, profile, origin):
    context, page = open_settings(
        chromium, executable, profile, origin, ledger_records(), has_touch=True,
        configure_clock=fixed_day(2026, 12, 1), timezone_id=ZONE,
    )
    try:
        original = census(page)
        track_writes(page)
        open_planner(page)
        for width in (375, 414, 768):
            page.set_viewport_size({"width": width, "height": 900})
            toolbar = page.get_by_role("group", name="Planner year navigation", exact=True)
            toolbar.get_by_role("button", name="Next Year", exact=True).tap()
            verify_year(page, 2027)
            assert page.evaluate("document.documentElement.scrollWidth === window.innerWidth")
            grid = page.get_by_role("region", name="Scrollable pay periods")
            assert grid.evaluate("(grid) => grid.scrollWidth > grid.clientWidth")
            date_header = period_table(page).get_by_role("columnheader", name="Jan 13 2027", exact=True)
            assert date_header.evaluate("""(header) => {
              const grid = header.closest('[role="region"]');
              const cell = header.getBoundingClientRect();
              const view = grid.getBoundingClientRect();
              return cell.left >= view.left && cell.right <= view.right;
            }""")
            toolbar.get_by_role("button", name="Previous Year", exact=True).tap()
            verify_year(page, 2026)
            toolbar.get_by_role("button", name="Today", exact=True).tap()
            assert_today_scroll(page, "2026-11-18")
        assert census(page) == original
        assert page.evaluate("window.storageWrites") == []
        print("PASS touch layout: 375px, 414px and 768px Chromium viewports, internal scroll and readable dates", flush=True)
    finally:
        context.close()


def verify_future_anchor(chromium, executable, profile, origin):
    records = {store: [] for store in rent_records()}
    records["appSettings"] = [{
        "id": "app-settings", "currency": "CAD", "payPeriodAnchorDate": "2028-02-29",
        "payFrequencyDays": 28, "projectionMonths": 3,
    }]
    records["appMetadata"] = [{"id": "app-metadata", "dataMode": "empty"}]
    context, page = open_settings(
        chromium, executable, profile, origin, records, empty=True,
        configure_clock=fixed_day(2026, 12, 1), timezone_id=ZONE,
    )
    try:
        before = census(page)
        track_writes(page)
        open_planner(page)
        expect(page.get_by_text("No current pay period", exact=True)).to_be_visible()
        expect(page.get_by_text("No pay periods start in 2026.", exact=False)).to_be_visible()
        select_year(page, 2027)
        expect(page.get_by_text("No pay periods start in 2027.", exact=False)).to_be_visible()
        page.get_by_role("button", name="Next Year", exact=True).click()
        assert dates_on_grid(page) == expected_dates(2028, anchor="2028-02-29", stride=28)
        expect(period_table(page).get_by_role("columnheader", name="Feb 29 2028", exact=True)).to_be_visible()
        page.get_by_role("button", name="Today", exact=True).click()
        expect(page.get_by_text("No pay periods start in 2026.", exact=False)).to_be_visible()
        assert census(page) == before
        assert page.evaluate("window.storageWrites") == []
        print("PASS future anchor and empty data: no invented starts, February 29 and 28-day cadence", flush=True)
    finally:
        context.close()


def verify_offline(chromium, executable, profile, origin):
    context, page = open_settings(
        chromium, executable, profile, origin, ledger_records(), service_workers="allow",
        configure_clock=fixed_day(2027, 1, 1), timezone_id=ZONE,
    )
    try:
        before = census(page)
        page.wait_for_function("navigator.serviceWorker.getRegistration().then(registration => Boolean(registration?.active))")
        if not page.evaluate("Boolean(navigator.serviceWorker.controller)"):
            page.reload(wait_until="domcontentloaded")
        page.wait_for_function("Boolean(navigator.serviceWorker.controller)")
        context.set_offline(True)
        page.reload(wait_until="domcontentloaded")
        track_writes(page)
        open_planner(page)
        verify_year(page, 2026)
        select_year(page, 2027)
        verify_balance(page, "Validated Chequing", JANUARY, "$535.00")
        assert census(page) == before
        assert page.evaluate("window.storageWrites") == []
        print("PASS offline Chromium reload: controlled by the production service worker, years and original records available", flush=True)
    finally:
        context.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    args = parser.parse_args()
    build = Path(__file__).resolve().parents[2] / "dist"
    assert (build / "index.html").is_file(), "Run npm run build first"
    with TemporaryDirectory(prefix="finpath-year-nav-") as profiles, ThreadingHTTPServer(
        ("127.0.0.1", 0), partial(StaticHandler, directory=str(build)),
    ) as server:
        Thread(target=server.serve_forever, daemon=True).start()
        try:
            origin = f"http://127.0.0.1:{server.server_port}"
            with sync_playwright() as playwright:
                def env(name):
                    return playwright.chromium, args.chromium, str(Path(profiles) / name), origin

                archive, original = verify_navigation(*env("navigation"))
                restore(*env("restore"), archive, original, "success")
                verify_recovered(*env("restore"), original)
                verify_legacy(*env("legacy"))
                verify_report_export(*env("report-export"))
                verify_touch_layout(*env("layout"))
                verify_future_anchor(*env("future"))
                verify_offline(*env("offline"))
        finally:
            server.shutdown()


if __name__ == "__main__":
    main()
