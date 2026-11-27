"""Run against the built app using a fresh loopback origin and synthetic Chromium profiles."""

import argparse
from functools import partial
from hashlib import sha256
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
from tempfile import TemporaryDirectory
from threading import Thread

from playwright.sync_api import expect, sync_playwright


DB = "budget-planner-db"
KEY_PATHS = {
    "accounts": "id", "appMetadata": "id", "appSettings": "id",
    "budgetTargets": "id", "categories": "id", "manualAdjustments": "id",
    "plannerEntries": "entryKey", "savingsBucketAdjustments": "id",
    "savingsBuckets": "id", "scheduledItems": "id", "transfers": "id",
}
STAMP = "2026-06-03T00:00:00.000Z"
DATE = "2026-06-03"
APP_VERSION = re.search(
    r"export const APP_VERSION = '([^']+)';",
    (Path(__file__).resolve().parents[2] / "src/data/releaseNotes.js").read_text(encoding="utf-8"),
)[1]


def fixture(tag):
    """Author the expected keys and financial facts independently of the app."""
    account = f"{tag}-cash"
    savings = f"{tag}-bank"
    bucket = f"{tag}-bucket"
    category = f"{tag}-category"
    schedule = f"{tag}-bill"
    cell = f"{schedule}__{DATE}"
    records = {
        "appMetadata": [{
            "id": "app-metadata", "dataMode": "custom", "createdAt": STAMP,
            "updatedAt": STAMP, "onboardingCompletedAt": STAMP,
            "plannerLastEntryMarker": {
                "plannerItemId": schedule, "occurrenceId": DATE, "cellKey": cell,
            },
        }],
        "appSettings": [{
            "id": "app-settings", "currency": "CAD" if tag == "Old" else "USD",
            "payPeriodAnchorDate": DATE, "payFrequencyDays": 14,
            "projectionMonths": 12, "monthlyBillAssignmentRule": "previous-pay-period",
        }],
        "accounts": [
            {"id": account, "name": f"{tag} Cash", "type": "chequing", "startingBalance": 501.25},
            {"id": savings, "name": f"{tag} Savings", "type": "savings", "startingBalance": 75.50},
        ],
        "budgetTargets": [{"id": f"{tag}-budget", "categoryId": category, "amount": 55}],
        "categories": [{"id": category, "name": f"{tag} expense", "type": "expense"}],
        "manualAdjustments": [{
            "id": f"{tag}-manual", "accountId": account, "date": DATE,
            "payPeriodDate": DATE, "amount": -7.25,
        }],
        "plannerEntries": [{
            "entryKey": cell, "actualAmount": 23.45, "validated": True, "useActual": True,
            "lineItems": [{"id": f"{tag}-line", "amount": 23.45}],
            "historicalSource": {"scheduledItemId": schedule, "evidence": ["synthetic", 2]},
        }],
        "savingsBucketAdjustments": [{
            "id": f"{tag}-allocation", "bucketId": bucket, "date": DATE,
            "payPeriodDate": DATE, "amount": -1.50,
        }],
        "savingsBuckets": [
            {"id": bucket, "linkedAccountId": savings, "name": f"{tag} bucket", "startingAmount": 12.50},
            {"id": f"{tag}-deleted", "linkedAccountId": savings, "name": f"{tag} deleted bucket",
             "startingAmount": 0, "active": False, "deletedAt": STAMP},
        ],
        "scheduledItems": [{
            "id": schedule, "name": f"{tag} bill", "type": "expense", "amount": 23.45,
            "frequency": "biweekly", "startDate": DATE, "categoryId": category, "accountId": account,
        }],
        "transfers": [{
            "id": f"{tag}-transfer", "date": DATE, "payPeriodDate": DATE,
            "fromAccountId": account, "toAccountId": savings, "bucketId": bucket,
            "transferType": "to_savings_bucket", "amount": 11.25, "validated": True,
        }],
    }
    return records


SEED = """async ({name, paths, records}) => {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 9);
    request.onupgradeneeded = () => {
      for (const [store, keyPath] of Object.entries(paths)) {
        request.result.createObjectStore(store, { keyPath });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  records.savingsBuckets[1].rawEvidence = [undefined, -0, Uint8Array.of(0, 255)];
  await new Promise((resolve, reject) => {
    const tx = db.transaction(Object.keys(paths), 'readwrite');
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error);
    for (const [store, entries] of Object.entries(records)) {
      for (const entry of entries) tx.objectStore(store).add(entry);
    }
  });
  db.close();
}"""


SNAPSHOT = """async (name) => {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onupgradeneeded = () => request.transaction.abort();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  function encode(value) {
    if (value === undefined) return ['undefined'];
    if (Object.is(value, -0)) return ['negative-zero'];
    if (value instanceof Uint8Array) return ['bytes', Array.from(value)];
    if (Array.isArray(value)) return ['array', value.map(encode)];
    if (value !== null && typeof value === 'object') {
      return ['object', Object.keys(value).map(key => [key, encode(value[key])])];
    }
    return ['scalar', value];
  }
  const stores = await new Promise((resolve, reject) => {
    const names = Array.from(db.objectStoreNames);
    const tx = db.transaction(names, 'readonly');
    const result = {};
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(tx.error);
    for (const name of names) {
      const store = tx.objectStore(name);
      const rows = [];
      result[name] = {keyPath: store.keyPath, rows};
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        rows.push([cursor.primaryKey, encode(cursor.value)]);
        cursor.continue();
      };
    }
  });
  const version = db.version;
  db.close();
  return {version, stores};
}"""


INSTALL_FAULT = """(scenario) => {
  const scope = new WeakSet();
  const transaction = IDBDatabase.prototype.transaction;
  const clear = IDBObjectStore.prototype.clear;
  const put = IDBObjectStore.prototype.put;
  const add = IDBObjectStore.prototype.add;
  function record(event) {
    const journal = JSON.parse(sessionStorage.getItem('import-journal'));
    journal.push(event);
    sessionStorage.setItem('import-journal', JSON.stringify(journal));
  }
  sessionStorage.setItem('import-journal', '[]');
  new MutationObserver(() => {
    if (document.body.textContent.includes('Backup imported successfully.')) {
      record({event: 'success-message'});
    }
  }).observe(document.body, {subtree: true, childList: true, characterData: true});
  window.addEventListener('beforeunload', () => record({event: 'reload'}));
  IDBDatabase.prototype.transaction = function(names, mode, options) {
    const tx = transaction.call(this, names, mode, options);
    if (mode !== 'readwrite') return tx;
    scope.add(tx);
    record({event: 'start', stores: Array.from(tx.objectStoreNames)});
    tx.addEventListener('complete', () => record({event: 'complete'}));
    tx.addEventListener('abort', () => record({event: 'abort', error: tx.error?.name}));
    return tx;
  };
  IDBObjectStore.prototype.clear = function() {
    if (scope.has(this.transaction) && scenario === 'early') {
      record({event: 'synchronous-error', store: this.name});
      throw new DOMException('Synthetic clear failure', 'InvalidStateError');
    }
    return clear.call(this);
  };
  IDBObjectStore.prototype.put = function(value) {
    const tx = this.transaction;
    if (!scope.has(tx)) return put.call(this, value);
    const store = this.name;
    const failMiddle = scenario === 'middle' && store === 'accounts' && value.id === 'New-cash';
    const failFinal = scenario === 'final' && store === 'appSettings';
    const request = put.call(this, value);
    request.addEventListener('success', () => {
      record({event: 'put', store, key: request.result});
      if (scenario === 'abort' && store === 'accounts') tx.abort();
    });
    if (failMiddle || failFinal) {
      // Native add with an existing key fails asynchronously and is not cancelled.
      const duplicate = add.call(this, value);
      duplicate.addEventListener('error', () => {
        record({event: 'request-error', store, error: duplicate.error.name});
      });
    }
    return request;
  };
}"""


class StaticHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        return super().translate_path(path.removeprefix("/BudgetApp"))

    def log_message(self, *_args):
        pass


def boot(chromium, executable, profile, origin, *, timezone_id=None):
    context = chromium.launch_persistent_context(
        profile, executable_path=executable, service_workers="block",
        headless=True, args=["--disable-background-networking"],
        viewport={"width": 1400, "height": 1000},
        timezone_id=timezone_id,
    )
    context.set_default_timeout(10000)
    context.route("**/*", lambda route: (
        route.continue_() if route.request.url.startswith(origin + "/") else route.abort()
    ))
    context.route(origin + "/probe", lambda route: route.fulfill(body="isolated synthetic test"))
    return context, context.pages[0]


def show_settings(page, origin):
    page.goto(origin + "/BudgetApp/")
    page.get_by_role("button", name="Settings", exact=True).click()
    expect(page.get_by_role("heading", name="Backup, restore, and export")).to_be_visible()


def use_import(page, backup, confirm=True):
    page.locator('input[type="file"]').set_input_files({
        "name": "synthetic.json",
        "mimeType": "application/json",
        "buffer": json.dumps(backup).encode(),
    })
    if confirm:
        prepare_restore(page)
        page.get_by_role("button", name="Import Backup", exact=True).nth(1).click()


def prepare_restore(page):
    with page.expect_download() as capture:
        page.get_by_role("button", name="Download Safety Backup", exact=True).click()
    page.get_by_role("checkbox", name="I saved and will keep the pre-restore backup.").check()
    return capture.value


def legacy_backup(records):
    data = {name: rows for name, rows in records.items() if name not in
            {"appMetadata", "appSettings", "plannerEntries"}}
    data.update(appMetadata=records["appMetadata"][0], settings=records["appSettings"][0],
                plannerEntries={row["entryKey"]: row for row in records["plannerEntries"]})
    return {"appName": "FinPath", "exportVersion": 1, "schemaVersion": 2, "data": data}


def unwrap(encoded):
    kind, value = encoded
    if kind == "object":
        return {key: unwrap(item) for key, item in value}
    if kind == "array":
        return [unwrap(item) for item in value]
    assert kind == "scalar", (kind, value)
    return value


def assert_success(snapshot, expected):
    for name, rows in expected.items():
        key_path = KEY_PATHS[name]
        stored = {key: unwrap(value) for key, value in snapshot["stores"][name]["rows"]}
        assert set(stored) == {row[key_path] for row in rows}, name
        for row in rows:
            actual = stored[row[key_path]]
            for field, value in row.items():
                if name != "appMetadata" or field != "updatedAt":
                    assert actual[field] == value, (name, field, actual[field], value)


def check_case(chromium, executable, origin, scenario):
    old = fixture("Old")
    new = fixture("New")
    backup = legacy_backup(new)
    if scenario == "invalid":
        backup["data"]["accounts"] = [new["accounts"][0], new["accounts"][0]]

    with TemporaryDirectory(prefix="finpath-synthetic-import-") as profile:
        context, page = boot(chromium, executable, profile, origin)
        try:
            page.goto(origin + "/probe")
            page.evaluate(SEED, {"name": DB, "paths": KEY_PATHS, "records": old})
            page.evaluate("version => localStorage.setItem('budgetApp:lastSeenReleaseNotesVersion', version)", APP_VERSION)
            show_settings(page, origin)
            before = page.evaluate(SNAPSHOT, DB)
            assert before["version"] == 9
            assert {name: info["keyPath"] for name, info in before["stores"].items()} == KEY_PATHS
            assert all(before["stores"][name]["rows"] for name in KEY_PATHS)
            archived = dict(dict(before["stores"]["savingsBuckets"]["rows"])["Old-deleted"][1])
            assert archived["deletedAt"] == ["scalar", STAMP]
            assert archived["rawEvidence"] == ["array", [
                ["undefined"], ["negative-zero"], ["bytes", [0, 255]],
            ]]
            page.evaluate(INSTALL_FAULT, scenario)
            if scenario == "success":
                with page.expect_navigation(wait_until="domcontentloaded"):
                    use_import(page, backup)
            elif scenario == "invalid":
                use_import(page, backup, confirm=False)
                expect(page.get_by_text("Accounts contains duplicate id New-cash.", exact=True)).to_be_visible()
            else:
                use_import(page, backup)
                expect(page.get_by_text("Backup import failed.", exact=True)).to_be_visible()
                expect(page.get_by_text("Backup imported successfully.", exact=True)).to_have_count(0)

            journal = page.evaluate("JSON.parse(sessionStorage.getItem('import-journal'))")
            events = [event["event"] for event in journal]
            after = page.evaluate(SNAPSHOT, DB)

            if scenario == "invalid":
                assert journal == [], journal
            else:
                assert events.count("start") == 1, journal
                assert journal[0]["stores"] == sorted(KEY_PATHS), journal
            if scenario == "success":
                assert events.count("complete") == 1 and "abort" not in events, journal
                assert len([e for e in events if e == "put"]) == sum(map(len, new.values())), journal
                assert events.index("complete") > max(i for i, e in enumerate(events) if e == "put")
                assert events.index("reload") > events.index("complete"), journal
                assert_success(after, new)
            else:
                assert after == before, scenario
                assert not {"success-message", "complete", "reload"}.intersection(events), journal
                expect(page.get_by_role("combobox", name="Currency", exact=True)).to_have_value("CAD")
                if scenario != "invalid":
                    assert events.count("abort") == 1 and events[-1] == "abort", journal
                if scenario in {"middle", "final"}:
                    expected_store = "accounts" if scenario == "middle" else "appSettings"
                    assert journal[-2] == {
                        "event": "request-error", "store": expected_store, "error": "ConstraintError",
                    }, journal
                if scenario == "middle":
                    assert not any(e.get("store") == "appSettings" for e in journal)
                if scenario == "final":
                    assert events.count("put") == sum(map(len, new.values())), journal
                if scenario == "early":
                    assert events == ["start", "synchronous-error", "abort"], journal
                if scenario == "abort":
                    assert any(e["event"] == "put" and e["store"] == "accounts" for e in journal)

            print(f"{scenario}: {events.count('put')} put successes, "
                  f"{events.count('complete')} complete, {events.count('abort')} abort", flush=True)
        finally:
            context.close()

        context, page = boot(chromium, executable, profile, origin)
        try:
            show_settings(page, origin)
            assert page.evaluate(SNAPSHOT, DB) == after
            currency = "USD" if scenario == "success" else "CAD"
            expect(page.get_by_role("combobox", name="Currency", exact=True)).to_have_value(currency)
            fingerprint = sha256(json.dumps(after, sort_keys=True).encode()).hexdigest()
            print(f"PASS {scenario}: all 11 stores verified after Chromium reopen, "
                  f"snapshot {fingerprint}", flush=True)
        finally:
            context.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    args = parser.parse_args()
    build = Path(__file__).resolve().parents[2] / "dist"
    assert (build / "index.html").is_file(), "Run npm run build first"
    handler = partial(StaticHandler, directory=str(build))
    with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
        Thread(target=server.serve_forever, daemon=True).start()
        try:
            origin = f"http://127.0.0.1:{server.server_port}"
            with sync_playwright() as playwright:
                for case in ("success", "invalid", "early", "middle", "final", "abort"):
                    check_case(playwright.chromium, args.chromium, origin, case)
        finally:
            server.shutdown()


if __name__ == "__main__":
    main()
