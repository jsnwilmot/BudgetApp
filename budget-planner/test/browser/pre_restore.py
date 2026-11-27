"""Exercise the pre-restore safety backup through the built FinPath UI."""

import argparse
from copy import deepcopy
from functools import partial
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread

from playwright.sync_api import expect, sync_playwright

from atomic_import import DB, KEY_PATHS, INSTALL_FAULT, StaticHandler, fixture, legacy_backup, use_import
from full_backup import census, open_settings, rehash, restore


MUTATE = """async ([dbName, scenario]) => {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('accounts', 'readwrite');
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
      const store = tx.objectStore('accounts');
      if (scenario === 'unsupported') {
        const row = [23];
        row.id = 'synthetic-unsupported';
        store.add(row);
      } else if (scenario === 'missing') {
        store.delete('Old-cash');
      } else if (scenario === 'extra') {
        store.add({id: 'Old-extra'});
      } else {
        const read = store.get('Old-cash');
        read.onsuccess = () => store.put({...read.result, syntheticEdit: true});
      }
    });
  } finally {
    db.close();
  }
}"""


def download_safety_backup(page):
    with page.expect_download() as download:
        page.get_by_role("button", name="Download Safety Backup", exact=True).click()
    assert download.value.suggested_filename.startswith("finpath-pre-restore-")
    assert download.value.suggested_filename.endswith(".json")
    return json.loads(Path(download.value.path()).read_text(encoding="utf-8"))


def assert_no_success(page):
    expect(page.get_by_text("Backup imported successfully.", exact=True)).to_have_count(0)
    expect(page.get_by_text("Complete database backup restored successfully.", exact=True)).to_have_count(0)


def check_case(chromium, executable, profile, origin, scenario):
    context, page = open_settings(chromium, executable, profile, origin, fixture("Old"))
    try:
        if scenario == "unsupported":
            page.evaluate(MUTATE, [DB, scenario])
        before = census(page)
        confirm = page.get_by_role("button", name="Import Backup", exact=True).nth(1)
        saved = page.get_by_role("checkbox", name="I saved and will keep the pre-restore backup.")

        if scenario == "read failure":
            page.evaluate("""() => {
              const transaction = IDBDatabase.prototype.transaction;
              IDBDatabase.prototype.transaction = function (names, mode, options) {
                if (mode === 'readonly' && names.length === 11 && !window.injectedReadFailure) {
                  window.injectedReadFailure = true;
                  throw new DOMException('Synthetic snapshot read failure', 'InvalidStateError');
                }
                return transaction.call(this, names, mode, options);
              };
            }""")
        if scenario == "download cancelled":
            page.evaluate("""document.addEventListener('click', (event) => {
              if (event.target.download?.startsWith('finpath-pre-restore-')) event.preventDefault();
            }, true)""")

        downloads = []
        page.on("download", lambda event: downloads.append(event))
        if scenario not in {"changed", "missing", "extra"}:
            page.evaluate(INSTALL_FAULT, "success")
        if scenario == "cancel":
            page.evaluate("""() => {
              window.completedReads = [];
              const transaction = IDBDatabase.prototype.transaction;
              IDBDatabase.prototype.transaction = function (names, mode, options) {
                const tx = transaction.call(this, names, mode, options);
                if (mode === 'readonly') {
                  tx.addEventListener('complete', () =>
                    window.completedReads.push(Array.from(tx.objectStoreNames)));
                }
                return tx;
              };
            }""")
        use_import(page, legacy_backup(fixture("New")), confirm=False)
        expect(confirm).to_be_disabled()
        expect(saved).to_have_count(0)

        archive = None
        if scenario in {"unsupported", "read failure", "download cancelled"}:
            if scenario == "download cancelled":
                page.get_by_role("button", name="Download Safety Backup", exact=True).click()
            message = {
                "unsupported": 'Store "accounts", record 3: Backup records must be plain objects.',
                "read failure": "Synthetic snapshot read failure",
                "download cancelled": "Could not start the pre-restore backup download.",
            }[scenario]
            expect(page.get_by_role("alert").filter(has_text=message)).to_be_visible()
            expect(confirm).to_be_disabled()
            expect(saved).to_have_count(0)
            assert not downloads
            assert page.evaluate("JSON.parse(sessionStorage.getItem('import-journal'))") == []
        else:
            archive = download_safety_backup(page)
            expect(saved).not_to_be_checked()
            expect(confirm).to_be_disabled()
            if scenario == "cancel":
                assert page.evaluate("window.completedReads") == [sorted(KEY_PATHS)]
                assert {s["name"]: (s["keyPath"], s["count"]) for s in archive["stores"]} == {
                    name: (store["keyPath"], len(store["rows"]))
                    for name, store in before["stores"].items()
                }
                independent_hash = deepcopy(archive)
                rehash(independent_hash)
                assert independent_hash["integrity"] == archive["integrity"]
                page.get_by_role("button", name="Cancel", exact=True).click()
                expect(page.get_by_text("Import cancelled.", exact=False)).to_be_visible()
                assert page.evaluate("JSON.parse(sessionStorage.getItem('import-journal'))") == []
            else:
                page.evaluate(MUTATE, [DB, scenario])
                changed = census(page)
                assert changed != before
                before = changed
                page.evaluate(INSTALL_FAULT, "early")
                saved.check()
                confirm.click()
                expect(page.get_by_role("alert").filter(
                    has_text="Current data changed after the safety backup."
                )).to_be_visible()
                expect(confirm).to_be_disabled()
                expect(saved).to_have_count(0)
                journal = page.evaluate("JSON.parse(sessionStorage.getItem('import-journal'))")
                assert [event["event"] for event in journal] == ["start", "abort"], journal
        assert census(page) == before, "safety gate modified stored records or backup metadata"
        assert_no_success(page)
        print(f"PASS pre-restore {scenario}: exact equality across all 11 stores", flush=True)
        return archive, before
    finally:
        context.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    args = parser.parse_args()
    build = Path(__file__).resolve().parents[2] / "dist"
    assert (build / "index.html").is_file(), "Run npm run build first"
    with TemporaryDirectory(prefix="finpath-pre-restore-") as profiles, ThreadingHTTPServer(
        ("127.0.0.1", 0), partial(StaticHandler, directory=str(build)),
    ) as server:
        Thread(target=server.serve_forever, daemon=True).start()
        try:
            origin = f"http://127.0.0.1:{server.server_port}"
            with sync_playwright() as playwright:
                def env(name):
                    return playwright.chromium, args.chromium, str(Path(profiles) / name), origin

                archive, original = check_case(*env("cancel"), "cancel")
                restore(*env("recover-safety-backup"), archive, original, "success")
                for case in ("unsupported", "read failure", "download cancelled", "changed", "missing", "extra"):
                    check_case(*env(case), case)
        finally:
            server.shutdown()


if __name__ == "__main__":
    main()
