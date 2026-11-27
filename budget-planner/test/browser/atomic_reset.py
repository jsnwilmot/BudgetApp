"""Compare both UI resets with the accepted synthetic data and prove rollback."""

import argparse
from copy import deepcopy
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread

from playwright.sync_api import expect, sync_playwright

from atomic_import import KEY_PATHS, STAMP, StaticHandler, fixture, unwrap
from full_backup import census, fingerprint, open_settings

LAST_BACKUP = "2026-06-02T00:00:00.000Z"
# Captured from the pre-change implementation with this synthetic fixture.
# Only the two timestamps created by the reset are removed from the hash.
EXPECTED = {
    "demo": "62f7b44e9e3df6c7e18addea0c81bbaf1411001074a8af26667f0eeca889b5f9",
    "empty": "d9cec8238db6091a0eb261964ed827dbaf24c6e6e79cab4b21c4f522416bbd6a",
}
ACTIONS = {
    "demo": ("DEMO", "Reset to Demo Data", "Reset to demo data failed."),
    "empty": ("DELETE", "Factory Reset to Empty App", "Factory reset failed."),
}
UI_COUNTS = {
    "Settings": "appSettings", "Accounts": "accounts", "Scheduled items": "scheduledItems",
    "Savings buckets": "savingsBuckets", "Categories": "categories", "Budget targets": "budgetTargets",
    "Manual adjustments": "manualAdjustments", "Savings adjustments": "savingsBucketAdjustments",
    "Transfers": "transfers", "Planner entries": "plannerEntries",
}

TRACK = """(fail) => {
  const journalKey = 'reset-journal';
  sessionStorage.setItem(journalKey, '[]');
  function log(event, details = {}) {
    const entries = JSON.parse(sessionStorage.getItem(journalKey));
    entries.push({event, ...details});
    sessionStorage.setItem(journalKey, JSON.stringify(entries));
  }
  const watched = new WeakSet();
  const transaction = IDBDatabase.prototype.transaction;
  const clear = IDBObjectStore.prototype.clear;
  const put = IDBObjectStore.prototype.put;
  const add = IDBObjectStore.prototype.add;
  let injected = false;
  IDBDatabase.prototype.transaction = function(names, mode, options) {
    const tx = transaction.call(this, names, mode, options);
    if (tx.mode === 'readwrite') {
      watched.add(tx);
      log('start', {stores: Array.from(tx.objectStoreNames)});
      tx.addEventListener('complete', () => log('complete'));
      tx.addEventListener('abort', () => log('abort'));
    }
    return tx;
  };
  IDBObjectStore.prototype.clear = function() {
    const request = clear.call(this);
    if (watched.has(this.transaction)) {
      request.addEventListener('success', () => log('clear', {store: this.name}));
    }
    return request;
  };
  IDBObjectStore.prototype.put = function(value) {
    const request = put.call(this, value);
    if (watched.has(this.transaction)) {
      request.addEventListener('success', () =>
        log('put', {store: this.name, currency: document.querySelector('select').value}));
      if (fail && this.name === 'categories' && !injected) {
        injected = true;
        const duplicate = add.call(this, value);
        duplicate.addEventListener('error', () => log('request-error', {error: duplicate.error.name}));
      }
    }
    return request;
  };
  new MutationObserver(() => {
    const text = document.body.textContent;
    if (text.includes('Demo data restored') || text.includes('Factory reset to empty app completed.')) {
      log('success-message');
    }
  }).observe(document.body, {subtree: true, childList: true, characterData: true});
  window.addEventListener('beforeunload', () => log('reload'));
}"""


def assert_ui_matches(page, snapshot, currency):
    expect(page.get_by_role("combobox", name="Currency", exact=True)).to_have_value(currency)
    for label, store in UI_COUNTS.items():
        rows = snapshot["stores"][store]["rows"]
        count = len(rows)
        if store == "savingsBuckets":
            count = sum(not unwrap(dict(row[1][1]).get("deletedAt", ["scalar", None])) for row in rows)
        term = page.get_by_text(label, exact=True)
        counter = page.locator("dt").and_(term).locator("xpath=following-sibling::dd[1]")
        expect(counter).to_have_text(str(count))


def assert_reset_data(snapshot, mode):
    assert snapshot["version"] == 9
    assert {name: store["keyPath"] for name, store in snapshot["stores"].items()} == KEY_PATHS
    metadata = unwrap(snapshot["stores"]["appMetadata"]["rows"][0][1])
    assert metadata["dataMode"] == mode
    assert metadata["lastBackupAt"] == LAST_BACKUP
    assert metadata["onboardingCompletedAt"] == STAMP
    assert metadata["plannerLastEntryMarker"] is None
    comparable = deepcopy(snapshot)
    for name in ("appSettings", "appMetadata"):
        fields = comparable["stores"][name]["rows"][0][1][1]
        fields[:] = [field for field in fields if field[0] != "updatedAt"]
    observed = fingerprint(comparable)
    assert observed == EXPECTED[mode], (mode, observed)


def check_case(chromium, executable, profile, origin, mode, fail):
    records = fixture("Old")
    records["appSettings"][0]["currency"] = "USD"
    records["appMetadata"][0]["lastBackupAt"] = LAST_BACKUP
    context, page = open_settings(chromium, executable, profile, origin, records)
    try:
        before = census(page)
        assert {name: s["keyPath"] for name, s in before["stores"].items()} == KEY_PATHS
        assert all(s["rows"] for s in before["stores"].values())
        archived = dict(before["stores"]["savingsBuckets"]["rows"][-1][1][1])
        assert archived["deletedAt"] == ["scalar", STAMP]
        assert "rawEvidence" in archived
        assert_ui_matches(page, before, "USD")
        page.evaluate(TRACK, fail)
        code, button_name, error = ACTIONS[mode]
        button = page.get_by_role("button", name=button_name, exact=True)
        expect(button).to_be_disabled()
        page.get_by_placeholder(f"Type {code}", exact=True).fill(code)
        if fail:
            button.click()
            expect(page.get_by_role("alert").filter(has_text=error)).to_be_visible()
        else:
            with page.expect_navigation(wait_until="domcontentloaded"):
                button.click()
        journal = page.evaluate("JSON.parse(sessionStorage.getItem('reset-journal'))")
        events = [entry["event"] for entry in journal]
        assert journal[0] == {"event": "start", "stores": sorted(KEY_PATHS)}
        assert events.count("start") == 1
        assert all(e["currency"] == "USD" for e in journal if e["event"] == "put")

        after = census(page)
        if fail:
            assert after == before
            assert events.count("abort") == 1 and events[-1] == "abort"
            assert not {"complete", "success-message", "reload"}.intersection(events)
            assert journal[-2] == {"event": "request-error", "error": "ConstraintError"}
            assert {"event": "clear", "store": "budgetTargets"} in journal[:-2]
            assert "put" in events[:-2]
            assert_ui_matches(page, before, "USD")
        else:
            assert events.count("complete") == 1 and "abort" not in events
            assert events.index("complete") < events.index("reload")
            assert {entry["store"] for entry in journal if entry["event"] == "clear"} == set(KEY_PATHS)
            assert_reset_data(after, mode)
    finally:
        context.close()

    context, page = open_settings(chromium, executable, profile, origin)
    try:
        assert census(page) == after
        assert_ui_matches(page, after, "USD" if fail else "CAD")
        counts = {name: len(store["rows"]) for name, store in after["stores"].items()}
        print(f"PASS {mode} {'rollback' if fail else 'reset'}: "
              f"{events.count('clear')} clears, {events.count('put')} puts, "
              f"{events.count('complete')} complete, {events.count('abort')} abort, "
              f"reopened {fingerprint(after)}, counts {counts}", flush=True)
    finally:
        context.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    args = parser.parse_args()
    build = Path(__file__).resolve().parents[2] / "dist"
    assert (build / "index.html").is_file(), "Run npm run build first"
    with TemporaryDirectory(prefix="finpath-atomic-reset-") as profiles, ThreadingHTTPServer(
        ("127.0.0.1", 0), partial(StaticHandler, directory=str(build)),
    ) as server:
        Thread(target=server.serve_forever, daemon=True).start()
        try:
            origin = f"http://127.0.0.1:{server.server_port}"
            with sync_playwright() as pw:
                for mode in ACTIONS:
                    for fail in (False, True):
                        profile = str(Path(profiles) / f"{mode}-{fail}")
                        check_case(pw.chromium, args.chromium, profile, origin, mode, fail)
        finally:
            server.shutdown()


if __name__ == "__main__":
    main()
