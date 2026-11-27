"""Verify confirmed history and atomic schedule updates in disposable Chromium."""

import argparse
from datetime import datetime, timezone
from functools import partial
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import re
from tempfile import TemporaryDirectory
from threading import Thread

from playwright.sync_api import expect, sync_playwright

from atomic_import import DATE, StaticHandler, fixture, legacy_backup, use_import
from full_backup import census, open_settings as open_profile, restore


RENT = "Synthetic rent"
RENT_ID = "Old-bill"
RENT_KEY = f"{RENT_ID}__{DATE}"


def open_settings(*args):
    return open_profile(*args, timezone_id="UTC", configure_clock=lambda page:
                        page.clock.set_fixed_time(datetime(2026, 11, 27, 12, tzinfo=timezone.utc)))


def rent_records():
    records = fixture("Old")
    records["accounts"][0]["startingBalance"] = 1265
    records["scheduledItems"][0].update(name=RENT, amount=1200)
    records["manualAdjustments"] = []
    records["transfers"] = []
    records["plannerEntries"] = []
    records["appMetadata"][0]["plannerLastEntryMarker"] = None
    return records


def encoded_fields(snapshot, store, key):
    return next(dict(value[1]) for stored_key, value in snapshot["stores"][store]["rows"]
                if stored_key == ["scalar", key])


def open_planner(page):
    page.get_by_role("button", name="Planner", exact=True).click()
    expect(page.get_by_role("heading", name="Biweekly budget grid")).to_be_visible()


def open_schedules(page):
    page.get_by_role("button", name="Manage", exact=True).click()
    page.get_by_role("button", name=re.compile("Scheduled Items")).click()
    expect(page.get_by_role("heading", name="Income, expenses, and transfers")).to_be_visible()


def rent_row(page):
    return page.get_by_role("row", name=re.compile(f"^{RENT}"))


def edit_rent(page, *, amount=None, end=None):
    rent_row(page).get_by_role("button", name="Edit", exact=True).click()
    if amount is not None:
        page.get_by_label("Amount", exact=True).fill(str(amount))
    if end is not None:
        page.get_by_label("End Date", exact=True).fill(end)
    page.get_by_role("button", name="Save Scheduled Item", exact=True).click()


def assert_rent(page, next_amount, next_balance="$65.00"):
    row = rent_row(page)
    expect(row.get_by_role("cell").nth(0)).to_contain_text("1,200.00")
    expect(row.get_by_role("cell").nth(1)).to_contain_text(next_amount)
    validated = page.get_by_role("row", name=re.compile("^Validated Chequing"))
    expect(validated.get_by_role("cell").nth(0)).to_have_text("$65.00")
    expect(validated.get_by_role("cell").nth(1)).to_have_text(next_balance)


def verify_financial_flow(chromium, executable, profile, origin):
    records = rent_records()
    service = {
        "id": "synthetic-service", "name": "Synthetic service", "type": "expense",
        "accountId": "Old-bank", "categoryId": "Old-category", "allowLineItems": True,
    }
    records["scheduledItems"].append({
        **service, "active": False, "amount": 25, "frequency": "once", "startDate": DATE,
    })
    records["plannerEntries"] = [{
        "entryKey": f"synthetic-service__{DATE}", "scheduledItemId": "synthetic-service",
        "payPeriodDate": DATE, "plannedAmount": 25, "actualAmount": 31.25, "useActual": True,
        "validated": True, "notes": "Synthetic service note",
        "lineItems": [{"id": "service-line", "description": "Synthetic service line", "amount": 31.25}],
        "scheduledItemSnapshot": service, "scheduledItemSnapshotProvenance": "captured-at-entry-save",
    }]
    context, page = open_settings(chromium, executable, profile, origin, records)
    try:
        open_planner(page)
        rent_row(page).get_by_role("cell").nth(0).get_by_role("button").click()
        page.get_by_label("Use actual amount in projection").uncheck()
        page.get_by_label("Mark as validated").check()
        page.get_by_label("Mark as last entry").check()
        page.get_by_role("textbox", name="Notes", exact=True).fill("Synthetic validation note")
        page.get_by_role("button", name="Save", exact=True).click()
        expect(page.get_by_text("Planner entry saved.", exact=True)).to_be_visible()
        assert_rent(page, "1,200.00")
        confirmed = census(page)
        saved = encoded_fields(confirmed, "plannerEntries", RENT_KEY)
        source = dict(saved["scheduledItemSnapshot"][1])
        assert saved["plannedAmount"] == ["scalar", 1200]
        assert saved["useActual"] == ["scalar", False]
        assert source["id"] == ["scalar", RENT_ID]
        assert source["type"] == ["scalar", "expense"]
        assert source["accountId"] == ["scalar", "Old-cash"]
        assert source["categoryId"] == ["scalar", "Old-category"]

        open_schedules(page)
        edit_rent(page, amount=1700)
        expect(rent_row(page)).to_contain_text("1,700.00")
        open_planner(page)
        assert_rent(page, "1,700.00")
        before_view = census(page)
        assert before_view["stores"]["plannerEntries"] == confirmed["stores"]["plannerEntries"]
        rent_row(page).get_by_role("cell").nth(0).get_by_role("button").click()
        expect(page.get_by_role("textbox", name="Notes", exact=True)).to_have_value("Synthetic validation note")
        expect(page.get_by_text("$1,200.00", exact=True).last).to_be_visible()
        page.get_by_role("button", name="Close", exact=True).click()
        assert census(page) == before_view
        print("PASS A: historical 1200, future 1700, validated chequing 65, exact read-only review", flush=True)

        open_schedules(page)
        edit_rent(page, end="2026-06-17")
        expect(page.get_by_role("heading", name="Edit Scheduled Item")).to_have_count(0)
        open_planner(page)
        assert_rent(page, "1,700.00")
        expect(rent_row(page).get_by_role("rowheader")).to_contain_text("Ended 2026-06-17")
        expect(rent_row(page).get_by_role("cell").nth(2)).to_have_text("—")
        print("PASS C: ended June 17, no later forecasts, original confirmed value retained", flush=True)

        open_schedules(page)
        page.get_by_role("combobox", name="Status", exact=True).select_option("all")
        rent_row(page).get_by_role("button", name="Deactivate", exact=True).click()
        expect(rent_row(page).get_by_role("button", name="Activate", exact=True)).to_be_visible()
        before_delete = census(page)
        page.once("dialog", lambda dialog: dialog.accept())
        rent_row(page).get_by_role("button", name="Delete", exact=True).click()
        expect(page.get_by_text(re.compile("has validated Planner history"))).to_be_visible()
        assert census(page) == before_delete
        open_planner(page)
        assert_rent(page, "—")
        expect(rent_row(page).get_by_role("rowheader")).to_contain_text("Inactive")
        expect(rent_row(page).get_by_role("cell").nth(1).get_by_role("button")).to_have_count(0)
        source_snapshot = census(page)
        assert source_snapshot["stores"]["plannerEntries"] == confirmed["stores"]["plannerEntries"]
        print("PASS B: inactive confirmed 1200 and chequing 65, no forecast, deletion refused", flush=True)

        page.get_by_role("button", name="Settings", exact=True).click()
        with page.expect_download() as download:
            page.get_by_role("button", name="Export Backup", exact=True).click()
        archive = json.loads(Path(download.value.path()).read_text(encoding="utf-8"))
        assert archive["formatVersion"] == 1 and archive["databaseVersion"] == 9
        return archive, source_snapshot
    finally:
        context.close()


FAULT = """() => {
  const transact = IDBDatabase.prototype.transaction;
  const put = IDBObjectStore.prototype.put;
  const add = IDBObjectStore.prototype.add;
  const originalTransactions = new WeakSet();
  window.scheduleJournal = [];
  IDBDatabase.prototype.transaction = function(names, mode, options) {
    const tx = transact.call(this, names, mode, options);
    if (mode === 'readwrite') {
      originalTransactions.add(tx);
      window.scheduleJournal.push('start:' + [...tx.objectStoreNames].join(','));
      tx.addEventListener('complete', () => window.scheduleJournal.push('complete'));
      tx.addEventListener('abort', () => window.scheduleJournal.push('abort'));
    }
    return tx;
  };
  IDBObjectStore.prototype.put = function(record) {
    const request = put.call(this, record);
    if (!originalTransactions.has(this.transaction)) return request;
    request.addEventListener('success', () => window.scheduleJournal.push('put:' + this.name));
    if (this.name === 'scheduledItems') {
      const duplicate = add.call(this, record);
      duplicate.addEventListener('error', () => window.scheduleJournal.push(duplicate.error.name));
    }
    return request;
  };
}"""


def legacy_rent_records():
    records = rent_records()
    records["plannerEntries"] = [{
        "entryKey": f"{RENT_ID}__{date}", "scheduledItemId": RENT_ID, "payPeriodDate": date,
        "plannedAmount": 1200, "useActual": False, "validated": True,
        "notes": "Legacy rent", "lineItems": [],
    } for date in (DATE, "2026-06-17")]
    return records


def verify_rollback(chromium, executable, profile, origin):
    context, page = open_settings(chromium, executable, profile, origin, legacy_rent_records())
    try:
        before = census(page)
        open_schedules(page)
        page.evaluate(FAULT)
        edit_rent(page, amount=1700)
        expect(page.get_by_text("Could not save scheduled item.", exact=True).first).to_be_visible()
        expect(page.get_by_text("Scheduled item saved.", exact=True)).to_have_count(0)
        assert page.evaluate("window.scheduleJournal") == [
            "start:plannerEntries,scheduledItems", "put:plannerEntries", "put:plannerEntries",
            "put:scheduledItems", "ConstraintError", "abort",
        ]
        assert census(page) == before
    finally:
        context.close()
    context, page = open_settings(chromium, executable, profile, origin)
    try:
        assert census(page) == before
        open_schedules(page)
        expect(rent_row(page)).to_contain_text("1,200.00")
        print("PASS D: two history puts and schedule put succeeded before native abort; exact 11-store rollback after reopen", flush=True)
    finally:
        context.close()


def verify_marker(chromium, executable, profile, origin):
    records = rent_records()
    # This marker is within the long forecast and beyond the short rolling
    # forecast before the December extension activates.
    date = "2027-07-14"
    field = {"plannerItemId": RENT_ID, "occurrenceId": date, "cellKey": f"{RENT_ID}__{date}"}
    records["appMetadata"][0]["plannerLastEntryMarker"] = field
    context, page = open_settings(chromium, executable, profile, origin, records)
    try:
        original = census(page)
        page.evaluate("""() => {
          const transaction = IDBDatabase.prototype.transaction;
          window.metadataWrites = [];
          IDBDatabase.prototype.transaction = function(names, mode, options) {
            const tx = transaction.call(this, names, mode, options);
            if (mode === 'readwrite' && [...tx.objectStoreNames].includes('appMetadata')) {
              window.metadataWrites.push([...tx.objectStoreNames]);
            }
            return tx;
          };
        }""")
        open_planner(page)
        marker = page.get_by_role("button", name=re.compile("Marked as Last Entry."))
        expect(marker).to_have_count(1)
        for months, expected in (("3", 0), ("12", 1)):
            page.get_by_role("button", name="Settings", exact=True).click()
            page.get_by_role("combobox", name="Projection range", exact=True).select_option(months)
            page.get_by_role("button", name="Save Settings", exact=True).click()
            expect(page.get_by_text("Settings saved. Planner projections have been updated.", exact=True)).to_be_visible()
            open_planner(page)
            expect(marker).to_have_count(expected)
            current = census(page)
            assert {key: value for key, value in current["stores"].items() if key != "appSettings"} == {
                key: value for key, value in original["stores"].items() if key != "appSettings"
            }
        assert page.evaluate("window.metadataWrites") == []
        print("PASS E: Last Entry leaves and reappears in the range with zero metadata writes", flush=True)
    finally:
        context.close()


def verify_legacy(chromium, executable, profile, origin):
    records = legacy_rent_records()
    context, page = open_settings(chromium, executable, profile, origin, rent_records())
    try:
        with page.expect_navigation(wait_until="domcontentloaded"):
            use_import(page, legacy_backup(records))
        before = census(page)
        saved = encoded_fields(before, "plannerEntries", RENT_KEY)
        assert "scheduledItemSnapshot" not in saved
        assert saved["plannedAmount"] == ["scalar", 1200]
        open_planner(page)
        first_cell = rent_row(page).get_by_role("cell").nth(0)
        expect(first_cell).to_contain_text("1,200.00")
        expect(first_cell).not_to_contain_text("Source unverified")
        first_cell.get_by_role("button").click()
        expect(page.get_by_text("FinPath could not verify the original account", exact=False)).to_be_visible()
        page.get_by_role("button", name="Close", exact=True).click()
        assert census(page) == before
        open_schedules(page)
        edit_rent(page, amount=1700)
        expect(rent_row(page)).to_contain_text("1,700.00")
        after = census(page)
        assert {name: value for name, value in after["stores"].items()
                if name not in {"plannerEntries", "scheduledItems"}} == {
            name: value for name, value in before["stores"].items()
            if name not in {"plannerEntries", "scheduledItems"}
        }
        assert [key for key, _ in after["stores"]["plannerEntries"]["rows"]] == [
            key for key, _ in before["stores"]["plannerEntries"]["rows"]
        ]
        patched = encoded_fields(after, "plannerEntries", RENT_KEY)
        assert patched.pop("scheduledItemSnapshotProvenance") == ["scalar", "unverified-current-source"]
        assert dict(patched.pop("scheduledItemSnapshot")[1])["accountId"] == ["scalar", "Old-cash"]
        assert patched == saved
        open_planner(page)
        assert_rent(page, "1,200.00", "-$1,135.00")
        print("PASS F legacy: unchanged keys and confirmed values, no startup rewrite, pre-edit source remains unverified", flush=True)
    finally:
        context.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    args = parser.parse_args()
    build = Path(__file__).resolve().parents[2] / "dist"
    assert (build / "index.html").is_file(), "Run npm run build first"
    with TemporaryDirectory(prefix="finpath-historical-") as profiles, ThreadingHTTPServer(
        ("127.0.0.1", 0), partial(StaticHandler, directory=str(build)),
    ) as server:
        Thread(target=server.serve_forever, daemon=True).start()
        try:
            origin = f"http://127.0.0.1:{server.server_port}"
            with sync_playwright() as playwright:
                def env(name):
                    return playwright.chromium, args.chromium, str(Path(profiles) / name), origin

                archive, expected = verify_financial_flow(*env("financial"))
                restore(*env("restore-current"), archive, expected, "success")
                verify_rollback(*env("rollback"))
                verify_marker(*env("marker"))
                verify_legacy(*env("legacy"))
        finally:
            server.shutdown()


if __name__ == "__main__":
    main()
