"""Export from one synthetic Chromium database and verify recovery in another."""

import argparse
from copy import deepcopy
from functools import partial
from hashlib import sha256
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread

from atomic_import import (
    APP_VERSION, DB, DATE, KEY_PATHS, SEED, SNAPSHOT, INSTALL_FAULT, StaticHandler,
    boot, fixture, prepare_restore, show_settings, use_import,
)
from playwright.sync_api import expect, sync_playwright


# The census reads real cursors independently of the export and restoration code.
TYPED_CENSUS = SNAPSHOT.replace(
    "if (value instanceof Uint8Array) return ['bytes', Array.from(value)];",
    """if (typeof value === 'bigint') return ['bigint', String(value)];
    if (typeof value === 'number' && !Number.isFinite(value)) return ['number', String(value)];
    if (value instanceof Date) return ['date', value.toISOString()];
    if (value instanceof Set) return ['set', Array.from(value, encode)];
    if (value instanceof ArrayBuffer) return ['buffer', Array.from(new Uint8Array(value))];
    if (value instanceof Uint8Array) {
      return ['bytes', value.byteOffset, value.length, encode(value.buffer)];
    }""",
).replace(
    "if (Array.isArray(value)) return ['array', value.map(encode)];",
    "if (Array.isArray(value)) return ['array', value.length, Object.entries(value).map("
    "([key, item]) => [key, encode(item)])];",
).replace("rows.push([cursor.primaryKey", "rows.push([encode(cursor.primaryKey)")
SEED_EMPTY = SEED.replace(
    "records.savingsBuckets[1].rawEvidence = [undefined, -0, Uint8Array.of(0, 255)];", ""
)
SEED_FULL = SEED.replace(
    "records.savingsBuckets[1].rawEvidence = [undefined, -0, Uint8Array.of(0, 255)];",
    """const sparse = new Array(4);
  sparse[2] = undefined;
  const buffer = Uint8Array.of(17, 0, 255, 31).buffer;
  records.savingsBuckets[1].rawEvidence = [
    undefined, -0, new Uint8Array(buffer, 1, 2), new Uint8Array([11, 12]).buffer,
    new Date('2024-02-29T00:00:00.000Z'), 9007199254740993n, sparse,
    null, true, NaN, Infinity, -Infinity,
    { ['__proto__']: 'stored field', nested: { value: undefined } },
  ];
  if (records.savingsBuckets[1].id === 'New-deleted') {
    for (const id of [42, new Date('2024-03-01T00:00:00.000Z'), Uint8Array.of(17, 255), ['compound', 44]]) {
      records.savingsBuckets.push({id, name: 'Synthetic archived key', active: false, deletedAt: '2024-03-01'});
    }
  }""",
)
FULL_FAULT = INSTALL_FAULT.replace(
    "store === 'appSettings'", "store === 'transfers'"
).replace("Backup imported successfully.", "Complete database backup restored successfully.")


def fingerprint(snapshot):
    return sha256(json.dumps(snapshot, sort_keys=True).encode()).hexdigest()


def open_settings(chromium, executable, profile, origin, records=None, empty=False):
    context, page = boot(chromium, executable, profile, origin)
    try:
        if records is not None:
            page.goto(origin + "/probe")
            page.evaluate(SEED_EMPTY if empty else SEED_FULL, {
                "name": DB, "paths": KEY_PATHS, "records": records,
            })
            page.evaluate("version => localStorage.setItem('budgetApp:lastSeenReleaseNotesVersion', version)", APP_VERSION)
        show_settings(page, origin)
        return context, page
    except BaseException:
        context.close()
        raise


def census(page):
    return page.evaluate(TYPED_CENSUS, DB)


def export_from(chromium, executable, profile, origin, records, *, empty=False):
    context, page = open_settings(chromium, executable, profile, origin, records, empty)
    try:
        before = census(page)
        assert before["version"] == 9
        assert {name: info["keyPath"] for name, info in before["stores"].items()} == KEY_PATHS
        assert all(not store["rows"] for store in before["stores"].values()) == empty
        if not empty:
            assert all(store["rows"] for store in before["stores"].values())
        page.evaluate("""() => {
          window.reads = [];
          const original = IDBDatabase.prototype.transaction;
          IDBDatabase.prototype.transaction = function(names, mode, options) {
            const tx = original.call(this, names, mode, options);
            if (tx.mode === 'readonly') {
              tx.addEventListener('complete', () => window.reads.push(Array.from(tx.objectStoreNames)));
            }
            return tx;
          };
        }""")
        with page.expect_download() as capture:
            page.get_by_role("button", name="Export Backup", exact=True).click()
        backup = json.loads(Path(capture.value.path()).read_text())
        expect(page.get_by_text("Complete database backup downloaded.", exact=False)).to_be_visible()
        assert page.evaluate("window.reads") == [sorted(KEY_PATHS)]
        assert {s["name"]: s["count"] for s in backup["stores"]} == {
            name: len(store["rows"]) for name, store in before["stores"].items()
        }
        return backup, before
    finally:
        context.close()


def rehash(backup):
    payload = {key: value for key, value in backup.items() if key != "integrity"}
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
    backup["integrity"]["digest"] = sha256(encoded).hexdigest()


def bad_backups(backup):
    def corrupt(case, change, message, *, resign=True):
        bad = deepcopy(backup)
        change(bad)
        if resign:
            rehash(bad)
        return case, bad, message

    yield corrupt("missing-store", lambda b: b["stores"].pop(), "missing required database stores")
    yield corrupt("wrong-name", lambda b: b["stores"][0].update(name="other"), "does not match the manifest")
    yield corrupt("count", lambda b: b["stores"][0].update(count=0), "does not match the manifest")
    yield corrupt("incomplete", lambda b: (
        b["stores"][-1]["records"].clear(), b["stores"][-1].update(count=0),
    ), "integrity check failed", resign=False)
    yield corrupt("version", lambda b: b.update(formatVersion=2), "Unsupported complete")
    yield corrupt("schema", lambda b: b.update(databaseVersion=10), "Unsupported complete")
    yield corrupt("identity", lambda b: b.update(appName="Other"), "Unsupported complete")
    yield corrupt("key-path", lambda b: b["stores"][0].update(keyPath="entryKey"), "does not match the manifest")
    yield corrupt("mismatched-key", lambda b: b["stores"][0]["records"][0].__setitem__(
        0, ["scalar", "wrong"],
    ), "primary key does not match")
    yield corrupt("invalid-key", lambda b: b["stores"][0]["records"][0].__setitem__(
        0, ["scalar", True],
    ), "invalid IndexedDB primary key")
    yield corrupt("duplicate", lambda b: (
        b["stores"][0]["records"].append(b["stores"][0]["records"][0]), b["stores"][0].update(count=2),
    ), "duplicate or unordered")
    yield corrupt("invalid-record", lambda b: b["stores"][0]["records"][0].__setitem__(
        1, ["object", []],
    ), "missing its primary key")
    yield corrupt("unsupported-value", lambda b: b["stores"][0]["records"][0][1][1].append(
        ["extra", ["set", []]],
    ), "invalid data")
    yield corrupt("modified-value", lambda b: b["stores"][0]["records"][0][1][1].append(
        ["extra", ["scalar", "changed"]],
    ), "integrity check failed", resign=False)


def verify_invalid(chromium, executable, profile, origin, backup):
    context, page = open_settings(chromium, executable, profile, origin, fixture("Old"))
    try:
        before = census(page)
        page.evaluate(FULL_FAULT, "invalid")
        for case, bad, message in bad_backups(backup):
            use_import(page, bad, confirm=False)
            expect(page.get_by_role("alert").filter(has_text=message)).to_be_visible()
            expect(page.get_by_role("button", name="Import Backup", exact=True)).to_have_count(1)
            assert page.evaluate("JSON.parse(sessionStorage.getItem('import-journal'))") == []
            assert census(page) == before
            print(f"PASS {case}: no restore transaction and exact all-store equality", flush=True)
    finally:
        context.close()


def restore(chromium, executable, profile, origin, backup, source, scenario):
    context, page = open_settings(chromium, executable, profile, origin, fixture("Old"))
    try:
        before = census(page)
        page.evaluate(FULL_FAULT, scenario)
        use_import(page, backup, confirm=False)
        expect(page.get_by_text("Complete database backup (all 11 stores).", exact=False)).to_be_visible()
        assert census(page) == before, "preview modified the destination before confirmation"
        prepare_restore(page)
        if scenario == "success":
            with page.expect_navigation(wait_until="domcontentloaded"):
                page.get_by_role("button", name="Import Backup", exact=True).nth(1).click()
            after = census(page)
            assert after == source, "source and restored typed inventories differ"
        else:
            page.get_by_role("button", name="Import Backup", exact=True).nth(1).click()
            expect(page.get_by_text("Complete database restore failed.", exact=True)).to_be_visible()
            expect(page.get_by_text("Complete database backup restored successfully.", exact=True)).to_have_count(0)
            after = census(page)
            assert after == before, "partial replacement after native abort"
        journal = page.evaluate("JSON.parse(sessionStorage.getItem('import-journal'))")
        events = [e["event"] for e in journal]
        assert journal[0] == {"event": "start", "stores": sorted(KEY_PATHS)}
        assert events.count("start") == 1
        if scenario == "success":
            assert events.count("complete") == 1 and "abort" not in events
            assert events.index("complete") < events.index("reload")
        else:
            assert events.count("abort") == 1 and events[-1] == "abort"
            assert not {"complete", "reload", "success-message"}.intersection(events)
            if scenario == "early":
                assert events == ["start", "synchronous-error", "abort"]
            if scenario in {"middle", "final"}:
                expected = "accounts" if scenario == "middle" else "transfers"
                assert journal[-2] == {"event": "request-error", "store": expected, "error": "ConstraintError"}
            if scenario == "final":
                assert events.count("put") == sum(s["count"] for s in backup["stores"])
            if scenario == "abort":
                assert "put" in events
    finally:
        context.close()

    context, page = open_settings(chromium, executable, profile, origin)
    try:
        assert census(page) == after, "stored data changed after reopening Chromium and app hydration"
        print(f"PASS {scenario}: {events.count('put')} puts, {events.count('complete')} complete, "
              f"{events.count('abort')} abort, reopened snapshot {fingerprint(after)}", flush=True)
    finally:
        context.close()


def verify_unsupported_export(chromium, executable, profile, origin, kind):
    context, page = open_settings(chromium, executable, profile, origin, fixture("Old"))
    try:
        page.evaluate("""async ([dbName, kind]) => {
          const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open(dbName);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          const name = kind === 'array' ? 'accounts' : 'savingsBuckets';
          await new Promise((resolve, reject) => {
            const tx = db.transaction(name, 'readwrite');
            tx.oncomplete = resolve;
            tx.onabort = () => reject(tx.error);
            const store = tx.objectStore(name);
            if (kind === 'array') {
              const row = [137.8];
              row.id = 'synthetic-array-row';
              store.add(row);
            } else {
              const read = store.get('Old-deleted');
              read.onsuccess = () => store.put({...read.result, unsupported: new Set(['retain'])});
            }
          });
          db.close();
        }""", [DB, kind])
        before = census(page)
        if kind == "array":
            assert before["stores"]["accounts"]["rows"][-1] == [
                ["scalar", "synthetic-array-row"],
                ["array", 1, [["0", ["scalar", 137.8]], ["id", ["scalar", "synthetic-array-row"]]]],
            ]
            message = 'Store "accounts", record 3: Backup records must be plain objects.'
        else:
            archived = before["stores"]["savingsBuckets"]["rows"][-1][1]
            assert dict(archived[1])["unsupported"] == ["set", [["scalar", "retain"]]]
            message = 'Store "savingsBuckets", record 2: Backup contains an unsupported IndexedDB value type.'

        page.evaluate("""() => {
          window.exportWriteScopes = [];
          const open = IDBDatabase.prototype.transaction;
          IDBDatabase.prototype.transaction = function(names, mode, options) {
            const tx = open.call(this, names, mode, options);
            if (tx.mode === 'readwrite') window.exportWriteScopes.push(Array.from(tx.objectStoreNames));
            return tx;
          };
        }""")
        downloads = []
        page.on("download", lambda download: downloads.append(download))
        page.get_by_role("button", name="Export Backup", exact=True).click()
        expect(page.get_by_role("alert").filter(has_text=message)).to_be_visible()
        expect(page.get_by_text("Complete database backup downloaded.", exact=False)).to_have_count(0)
        assert not downloads
        assert page.evaluate("window.exportWriteScopes") == []
        assert census(page) == before
        print(f"PASS refused {kind}: no file, success or writes, all 11 stores unchanged, "
              f"census {fingerprint(before)}", flush=True)
    finally:
        context.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    args = parser.parse_args()
    build = Path(__file__).resolve().parents[2] / "dist"
    assert (build / "index.html").is_file(), "Run npm run build first"
    with TemporaryDirectory(prefix="finpath-full-backup-") as profiles, ThreadingHTTPServer(
        ("127.0.0.1", 0), partial(StaticHandler, directory=str(build)),
    ) as server:
        Thread(target=server.serve_forever, daemon=True).start()
        try:
            origin = f"http://127.0.0.1:{server.server_port}"
            with sync_playwright() as playwright:
                def env(name):
                    return playwright.chromium, args.chromium, str(Path(profiles) / name), origin

                records = fixture("New")
                records["accounts"][1]["active"] = False
                records["plannerEntries"][0]["historicalSource"] = {
                    "scheduledItemId": "archived-source", "originalValue": 23.45,
                }
                records["appMetadata"][0]["plannerLastEntryMarker"].update(
                    occurrenceId="2024-02-29", cellKey=f"New-bill__2024-02-29",
                )
                records["plannerEntries"][0]["entryKey"] = "New-bill__2024-02-29"
                assert DATE != records["appMetadata"][0]["plannerLastEntryMarker"]["occurrenceId"]
                backup, source = export_from(*env("source"), records)
                check = deepcopy(backup)
                rehash(check)
                assert check["integrity"] == backup["integrity"]
                print(f"PASS full snapshot: 11 stores and independent digest, source {fingerprint(source)}", flush=True)
                verify_invalid(*env("invalid-target"), backup)
                for scenario in ("success", "early", "middle", "final", "abort"):
                    restore(*env(f"target-{scenario}"), backup, source, scenario)
                empty_backup, empty_source = export_from(
                    *env("empty-source"), {name: [] for name in KEY_PATHS}, empty=True,
                )
                restore(*env("empty-target"), empty_backup, empty_source, "success")
                verify_unsupported_export(*env("unsupported-set"), "set")
                verify_unsupported_export(*env("unsupported-array"), "array")
        finally:
            server.shutdown()


if __name__ == "__main__":
    main()
