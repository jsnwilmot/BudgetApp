"""Verify pre-anchor Planner history and recovery using isolated Chromium databases."""

import argparse
from copy import deepcopy
from functools import partial
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread

from playwright.sync_api import expect, sync_playwright

from atomic_import import DATE, StaticHandler, legacy_backup, use_import
from continuous_planner import ZONE, period_table, track_writes
from full_backup import census, open_settings, restore
from historical_integrity import encoded_fields, open_planner, select_year
from year_navigation import fixed_day, ledger_records, verify_balance, verify_year


SAVED_DATE = "2025-11-05"
SOURCE_ID = "pre-anchor-bill"
ENTRY_KEY = f"{SOURCE_ID}__{SAVED_DATE}"
NOTES = "Synthetic receipt before the anchor"
HISTORY = "Saved entries before the Planner start"
MARKER = {"plannerItemId": SOURCE_ID, "occurrenceId": SAVED_DATE, "cellKey": ENTRY_KEY}


def history_records():
    records = ledger_records()
    records["appMetadata"][0]["plannerLastEntryMarker"] = MARKER
    records["plannerEntries"].extend([
        {
            "entryKey": ENTRY_KEY, "scheduledItemId": SOURCE_ID, "payPeriodDate": SAVED_DATE,
            "plannedAmount": 100, "actualAmount": 82.75, "useActual": True, "validated": True,
            "notes": NOTES, "lineItems": [
                {"id": "part-a", "description": "Synthetic charge A", "amount": 70},
                {"id": "part-b", "description": "Synthetic charge B", "amount": 12.75},
            ],
            "scheduledItemSnapshot": {
                "id": SOURCE_ID, "name": "Synthetic pre-anchor bill", "type": "expense",
                "accountId": "Old-cash", "categoryId": "Old-category", "allowLineItems": True,
            },
            "scheduledItemSnapshotProvenance": "captured-at-entry-save",
        },
        {
            "entryKey": "older-source__2023-10-25", "scheduledItemId": "older-source",
            "payPeriodDate": "2023-10-25", "plannedAmount": 40, "validated": True,
            "notes": "Synthetic legacy entry with no snapshot",
        },
        {
            "entryKey": "earlier-in-year__2026-01-14", "scheduledItemId": "earlier-in-year",
            "payPeriodDate": "2026-01-14", "plannedAmount": 22, "validated": True,
            "scheduledItemSnapshot": {"id": "other-source", "type": "income"},
        },
    ])
    return records


def open_profile(env, records=None):
    return open_settings(*env, records, configure_clock=fixed_day(2026, 11, 30), timezone_id=ZONE)


def verify_saved_record(page, verified=True):
    select_year(page, 2025)
    expect(page.get_by_text("No pay periods start in 2025.", exact=False)).to_be_visible()
    expect(period_table(page)).to_have_count(0)
    history = page.get_by_role("region", name=HISTORY)
    expect(history).to_contain_text("excluded from Planner totals")
    row = history.locator("summary")
    expect(row).to_have_count(1)
    for value in (SAVED_DATE, "Validated", "$82.75", "Marked as Last Entry"):
        expect(row).to_contain_text(value)
    row.focus()
    row.press("Enter")
    expect(history.get_by_text(NOTES, exact=False)).to_be_visible()
    expect(history.get_by_text(ENTRY_KEY, exact=True)).to_be_visible()
    expect(history.get_by_text("Synthetic charge A · $70.00", exact=True)).to_be_visible()
    expect(history.get_by_text("Synthetic charge B · $12.75", exact=True)).to_be_visible()
    expect(history.get_by_text("$100.00", exact=True)).to_be_visible()
    warning = history.get_by_text("The original source details could not be verified.", exact=False)
    if verified:
        expect(row).to_contain_text("Synthetic pre-anchor bill")
        expect(history.get_by_text("Old-cash", exact=True)).to_be_visible()
        expect(history.get_by_text("Old-category", exact=True)).to_be_visible()
        expect(warning).to_have_count(0)
    else:
        expect(row).to_contain_text(SOURCE_ID)
        expect(warning).to_be_visible()
        expect(history.get_by_text("Old-cash", exact=True)).to_have_count(0)
    expect(history.locator("form, input, textarea, [contenteditable='true']")).to_have_count(0)


def verify_navigation_and_export(env, records):
    context, page = open_profile(env, records)
    try:
        before = census(page)
        track_writes(page)
        open_planner(page)
        verify_year(page, 2026)
        original_grid = period_table(page).inner_text()
        verify_balance(page, "Validated Chequing", DATE, "$65.00")
        before_anchor = page.get_by_role("region", name=HISTORY)
        before_anchor.locator("summary").click()
        expect(before_anchor.get_by_text("Source conflict.", exact=False)).to_be_visible()
        verify_saved_record(page)
        select_year(page, 2023)
        older = page.get_by_role("region", name=HISTORY)
        older.locator("summary").click()
        expect(older.get_by_text("Synthetic legacy entry with no snapshot", exact=False)).to_be_visible()
        expect(older.get_by_text("The original source details could not be verified.", exact=False)).to_be_visible()
        select_year(page, 2024)
        expect(page.get_by_text("No pay periods start in 2024. Your Planner starts on 2026-06-03.", exact=True)).to_be_visible()
        expect(page.get_by_role("region", name=HISTORY)).to_have_count(0)
        select_year(page, 2026)
        assert period_table(page).inner_text() == original_grid
        page.get_by_role("button", name="Dashboard", exact=True).click()
        expect(page.get_by_role("heading", name="3-Month Account Projection")).to_be_visible()
        expect(page.get_by_text("Chequing After Next Period", exact=True).locator("..")).to_contain_text("$65.00")
        assert census(page) == before
        assert page.evaluate("window.storageWrites") == []
        print("PASS D-F1 navigation: 2025 and older history, same-year history, empty year, unchanged anchored grid and forecast, zero writes", flush=True)

        page.reload(wait_until="domcontentloaded")
        track_writes(page)
        open_planner(page)
        verify_saved_record(page)
        assert census(page) == before
        assert page.evaluate("window.storageWrites") == []
        print("PASS D-F1 refresh: exact all-store equality with original key, amount, validation, source, notes, lines and marker", flush=True)

        page.get_by_role("button", name="Settings", exact=True).click()
        with page.expect_download() as capture:
            page.get_by_role("button", name="Export Backup", exact=True).click()
        return json.loads(Path(capture.value.path()).read_text(encoding="utf-8")), before
    finally:
        context.close()


def verify_restored(env, before=None):
    context, page = open_profile(env)
    try:
        restored = census(page)
        if before is not None:
            assert restored == before
        stored = encoded_fields(restored, "plannerEntries", ENTRY_KEY)
        assert stored["entryKey"] == ["scalar", ENTRY_KEY]
        assert stored["payPeriodDate"] == ["scalar", SAVED_DATE]
        assert stored["actualAmount"] == ["scalar", 82.75]
        assert stored["validated"] == ["scalar", True]
        track_writes(page)
        open_planner(page)
        verify_saved_record(page, verified=before is not None)
        select_year(page, 2026)
        verify_balance(page, "Validated Chequing", DATE, "$65.00")
        assert census(page) == restored
        assert page.evaluate("window.storageWrites") == []
        kind = "complete" if before is not None else "legacy without source snapshot"
        print(f"PASS D-F1 {kind} restore: saved record and marker accessible after browser reopening", flush=True)
    finally:
        context.close()


def import_legacy(env, records):
    records = deepcopy(records)
    for entry in records["plannerEntries"]:
        entry.pop("scheduledItemSnapshot", None)
        entry.pop("scheduledItemSnapshotProvenance", None)
    context, page = open_profile(env, ledger_records())
    try:
        with page.expect_navigation(wait_until="domcontentloaded"):
            use_import(page, legacy_backup(records))
        stored_keys = [key[1] for key, _ in census(page)["stores"]["plannerEntries"]["rows"]]
        assert stored_keys == sorted(row["entryKey"] for row in records["plannerEntries"])
    finally:
        context.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    args = parser.parse_args()
    build = Path(__file__).resolve().parents[2] / "dist"
    assert (build / "index.html").is_file(), "Run npm run build first"
    with TemporaryDirectory(prefix="finpath-pre-anchor-") as profiles, ThreadingHTTPServer(
        ("127.0.0.1", 0), partial(StaticHandler, directory=str(build)),
    ) as server:
        Thread(target=server.serve_forever, daemon=True).start()
        try:
            origin = f"http://127.0.0.1:{server.server_port}"
            with sync_playwright() as playwright:
                def env(name):
                    return playwright.chromium, args.chromium, str(Path(profiles) / name), origin

                records = history_records()
                archive, before = verify_navigation_and_export(env("navigation"), records)
                restore(*env("complete"), archive, before, "success")
                verify_restored(env("complete"), before)
                import_legacy(env("legacy"), records)
                verify_restored(env("legacy"))
        finally:
            server.shutdown()


if __name__ == "__main__":
    main()
