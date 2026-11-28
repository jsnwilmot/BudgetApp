"""Verify Settings cadence protection with synthetic Chromium databases."""

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
from continuous_planner import ZONE, confirmed, track_writes
from full_backup import census, open_settings, restore
from historical_integrity import RENT_ID, encoded_fields, open_planner, rent_records, select_year
from pre_anchor_history import ENTRY_KEY, HISTORY, MARKER, history_records
from year_navigation import fixed_day, verify_balance


FEE_ID = "synthetic__utilities"
FEE_KEY = f"{FEE_ID}__2026-06-17"
OFF_CADENCE_KEY = f"{RENT_ID}__2026-06-10"


def fixture():
    records = rent_records()
    records["appSettings"][0]["projectionMonths"] = 3
    records["appMetadata"][0]["plannerLastEntryMarker"] = MARKER
    records["scheduledItems"].append({
        "id": FEE_ID, "name": "Synthetic utilities", "type": "expense", "amount": 50,
        "accountId": "Old-cash", "categoryId": "Old-category", "frequency": "once",
        "startDate": "2026-06-17",
    })
    saved = next(entry for entry in history_records()["plannerEntries"] if entry["entryKey"] == ENTRY_KEY)
    records["plannerEntries"] = [
        confirmed(scheduledItemSnapshot=records["scheduledItems"][0],
                  scheduledItemSnapshotProvenance="captured-at-entry-save"),
        confirmed("2026-06-10", plannedAmount=25, notes="Synthetic off-cadence history"),
        confirmed("2026-06-17", entryKey=FEE_KEY, scheduledItemId=FEE_ID, plannedAmount=70,
                  useActual=True, actualAmount=50, notes="Synthetic item with delimiter",
                  lineItems=[{"id": "fee-part", "description": "Synthetic fee", "amount": 50}]),
        confirmed("2026-07-01", validated=False, plannedAmount=99, notes="Synthetic on-cadence draft"),
        confirmed("2026-06-24", validated=False, plannedAmount=98, notes="Synthetic weekly draft"),
        saved,
    ]
    return records


def open_profile(env, records=None):
    return open_settings(*env, records, configure_clock=fixed_day(2026, 6, 4), timezone_id=ZONE)


def set_cadence(page, frequency, anchor=DATE):
    page.get_by_label("Pay period anchor date", exact=True).fill(anchor)
    page.get_by_role("combobox", name="Pay frequency").select_option(str(frequency))


def assert_refusal(page, action, before, newly_stranded, already_off_cadence):
    page.evaluate("window.storageWrites.length = 0")
    reset = action == "Reset to Defaults"
    page.get_by_role("button", name=action, exact=True).click()
    alert = page.get_by_role("alert").filter(has_text="would fall outside the new pay-period schedule")
    expect(alert).to_contain_text("Could not reset settings." if reset else "Could not save settings.")
    noun = "entry" if newly_stranded == 1 else "entries"
    expect(alert).to_contain_text(f"{newly_stranded} validated Planner {noun} would fall outside")
    verb = "entry is" if already_off_cadence == 1 else "entries are"
    expect(alert).to_contain_text(f"{already_off_cadence} other validated {verb} already outside")
    expect(alert).to_contain_text("Keep the current anchor and frequency")
    expect(page.get_by_text("Settings saved.", exact=False)).to_have_count(0)
    expect(page.get_by_text("Settings reset to defaults.", exact=True)).to_have_count(0)
    assert census(page) == before
    assert page.evaluate("window.storageWrites") == []


def assert_allowed(page, action, before, expected):
    page.evaluate("window.storageWrites.length = 0")
    page.get_by_role("button", name=action, exact=True).click()
    text = "Settings reset to defaults." if action == "Reset to Defaults" else "Settings saved. Planner projections have been updated."
    expect(page.get_by_text(text, exact=True).first).to_be_visible()
    after = census(page)
    assert page.evaluate("window.storageWrites") == [["appSettings"]]
    for name, store in before["stores"].items():
        if name != "appSettings":
            assert after["stores"][name] == store, name
    assert after["version"] == before["version"] == 9
    settings = encoded_fields(after, "appSettings", "app-settings")
    for field, value in expected.items():
        assert settings[field] == ["scalar", value]
    return after


def verify_settings_actions(env, records):
    context, page = open_profile(env, records)
    try:
        original = census(page)
        track_writes(page)
        set_cadence(page, 14, "2026-06-04")
        assert_refusal(page, "Save Settings", original, 2, 2)
        set_cadence(page, 28)
        assert_refusal(page, "Save Settings", original, 1, 2)
        page.get_by_role("button", name="Cancel Changes", exact=True).click()
        expect(page.get_by_role("combobox", name="Pay frequency")).to_have_value("14")
        open_planner(page)
        verify_balance(page, "Validated Chequing", DATE, "$65.00")
        verify_balance(page, "Validated Chequing", "2026-06-17", "$15.00")
        select_year(page, 2025)
        expect(page.get_by_role("region", name=HISTORY).locator("summary")).to_contain_text("Marked as Last Entry")
        assert census(page) == original
        print("PASS CP-12 Save refuses anchor +1 and 14→28 with exact new and existing counts, no writes and unchanged financial history", flush=True)

        page.get_by_role("button", name="Settings", exact=True).click()
        before = assert_allowed(page, "Save Settings", original, {"payFrequencyDays": 14})
        for label, value, field, expected in (
            ("Projection range", "6", "projectionMonths", 6),
            ("Currency", "USD", "currency", "USD"),
            ("Monthly bill assignment rule", "same-pay-period", "monthlyBillAssignmentRule", "same-pay-period"),
        ):
            page.get_by_role("combobox", name=label).select_option(value)
            before = assert_allowed(page, "Save Settings", before, {field: expected, "payFrequencyDays": 14})
        set_cadence(page, 7)
        before = assert_allowed(page, "Save Settings", before, {"payFrequencyDays": 7})
        set_cadence(page, 14)
        assert_refusal(page, "Save Settings", before, 1, 1)
        assert_refusal(page, "Reset to Defaults", before, 1, 1)
        print("PASS CP-12 unchanged and unrelated saves, 14→7 permitted, 7→14 Save and Reset refuse only newly excluded validated history", flush=True)

        with page.expect_download() as capture:
            page.get_by_role("button", name="Export Backup", exact=True).click()
        archive = json.loads(Path(capture.value.path()).read_text(encoding="utf-8"))
        assert archive["formatVersion"] == 1 and archive["databaseVersion"] == 9
        return archive, before
    finally:
        context.close()


def verify_safe_reset_and_drafts(env):
    records = fixture()
    records["appSettings"][0].update(payPeriodAnchorDate="2026-05-27", payFrequencyDays=7)
    for entry in records["plannerEntries"]:
        if entry["entryKey"] == OFF_CADENCE_KEY:
            entry["validated"] = False
    context, page = open_profile(env, records)
    try:
        before = census(page)
        track_writes(page)
        assert_allowed(page, "Reset to Defaults", before, {
            "payPeriodAnchorDate": DATE, "payFrequencyDays": 14, "projectionMonths": 12,
        })
        print("PASS CP-12 Reset changes anchor and cadence when all validated dates are retained; draft dates do not block", flush=True)
    finally:
        context.close()


def verify_save_without_confirmed_history(env):
    records = fixture()
    records["plannerEntries"] = [entry for entry in records["plannerEntries"] if not entry["validated"]]
    records["appMetadata"][0]["plannerLastEntryMarker"] = None
    context, page = open_profile(env, records)
    try:
        track_writes(page)
        set_cadence(page, 28, "2026-06-04")
        assert_allowed(page, "Save Settings", census(page), {
            "payPeriodAnchorDate": "2026-06-04", "payFrequencyDays": 28,
        })
        print("PASS CP-12 cadence save with drafts only writes settings and preserves the drafts", flush=True)
    finally:
        context.close()


def verify_restored_refusal(env, records, original=None):
    if original is None:
        legacy = deepcopy(records)
        legacy["appSettings"][0]["payFrequencyDays"] = 7
        context, page = open_profile(env, rent_records())
        try:
            with page.expect_navigation(wait_until="domcontentloaded"):
                use_import(page, legacy_backup(legacy))
        finally:
            context.close()
    context, page = open_profile(env)
    try:
        before = census(page)
        if original is not None:
            assert before == original
        keys = [key[1] for key, _ in before["stores"]["plannerEntries"]["rows"]]
        assert keys == sorted(entry["entryKey"] for entry in records["plannerEntries"])
        fee = encoded_fields(before, "plannerEntries", FEE_KEY)
        assert fee["actualAmount"] == ["scalar", 50]
        assert fee["notes"] == ["scalar", "Synthetic item with delimiter"]
        expect(page.get_by_role("combobox", name="Pay frequency")).to_have_value("7")
        track_writes(page)
        assert_refusal(page, "Reset to Defaults", before, 1, 1)
        open_planner(page)
        select_year(page, 2025)
        expect(page.get_by_role("region", name=HISTORY).locator("summary")).to_contain_text("Marked as Last Entry")
        assert census(page) == before
        assert page.evaluate("window.storageWrites") == []
        kind = "complete" if original is not None else "legacy"
        print(f"PASS CP-12 {kind} backup reopening retains original keys, marker and guarded settings with zero rejected writes", flush=True)
    finally:
        context.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    args = parser.parse_args()
    build = Path(__file__).resolve().parents[2] / "dist"
    assert (build / "index.html").is_file(), "Run npm run build first"
    with TemporaryDirectory(prefix="finpath-cadence-") as profiles, ThreadingHTTPServer(
        ("127.0.0.1", 0), partial(StaticHandler, directory=str(build)),
    ) as server:
        Thread(target=server.serve_forever, daemon=True).start()
        try:
            origin = f"http://127.0.0.1:{server.server_port}"
            with sync_playwright() as playwright:
                def env(name):
                    return playwright.chromium, args.chromium, str(Path(profiles) / name), origin

                records = fixture()
                archive, original = verify_settings_actions(env("settings"), records)
                verify_safe_reset_and_drafts(env("safe-reset"))
                verify_save_without_confirmed_history(env("drafts"))
                restore(*env("complete"), archive, original, "success")
                verify_restored_refusal(env("complete"), records, original)
                verify_restored_refusal(env("legacy"), records)
        finally:
            server.shutdown()


if __name__ == "__main__":
    main()
