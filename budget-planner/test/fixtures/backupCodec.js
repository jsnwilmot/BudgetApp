import { IDBFactory } from 'fake-indexeddb';
import { openSyntheticRepository, prepareSyntheticCommand } from '../../experimental/checkpoint/storageRepository.js';
import { storageFixture, draftRequest, request } from './syntheticStorage.js';

export const PRODUCER = Object.freeze({ appVersion: 'synthetic-codec-test', exportedAt: '2026-12-31T00:00:00.000Z' });
export async function sourceFixture(name = 'codec-test', mutateSeed = () => {}) {
  const factory = new IDBFactory(), databaseName = `finpath-synthetic-b1-${name}`;
  const opened = await openSyntheticRepository({ factory, name: databaseName, synthetic: true });
  if (!opened.ok) throw Error('synthetic fixture open');
  const repository = opened.repository, f = storageFixture();
  mutateSeed(f.seed);
  if (!(await repository.initialize(f.seed)).ok) throw Error('synthetic fixture seed');
  const execute = async r => {
    const prepared = prepareSyntheticCommand((await repository.snapshot()).snapshot, r);
    if (!prepared.ok || !(await repository.execute(prepared.command)).ok) throw Error('synthetic fixture command');
  };
  await execute(draftRequest('draft-0'));
  await execute(draftRequest('draft-1', '1'));
  await execute(request('delete-temporary', [{ store: 'categories', key: 'temporary-deleted', delete: true }]));
  const snapshot = (await repository.snapshot()).snapshot;
  // Actual native key/value reads, independently from repository.snapshot().
  const native = await new Promise((resolve, reject) => {
    const r = factory.open(databaseName, 1);
    r.onerror = () => reject(r.error);
    r.onsuccess = () => {
      const db = r.result, tx = db.transaction([...db.objectStoreNames], 'readonly'), stores = {};
      for (const s of db.objectStoreNames) {
        const store = tx.objectStore(s), keys = store.getAllKeys(), values = store.getAll();
        values.onsuccess = () => { stores[s] = { keyPath: store.keyPath, keys: keys.result, values: values.result }; };
      }
      tx.oncomplete = () => { db.close(); resolve(stores); }; tx.onabort = () => reject(tx.error);
    };
  });
  repository.close();
  return { snapshot, native, financial: f.financial };
}
