import { DB_VERSION, STORE_NAMES, getStoreKeyPath } from '../data/databaseSchema.js';

const FORMAT = 'finpath-indexeddb';
const FORMAT_VERSION = 1;
const MAX_VALUE_DEPTH = 64;

function fail(message = 'Complete backup contains invalid data.') {
  throw new Error(message);
}

function requireFields(object, fields) {
  if (Object.getPrototypeOf(object ?? {}) !== Object.prototype ||
      Object.keys(object ?? {}).length !== fields.length ||
      !fields.every((field) => Object.hasOwn(object, field))) {
    fail();
  }
}

function encodeBytes(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunks = [];
  for (let i = 0; i < bytes.length; i += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  }
  return btoa(chunks.join(''));
}

function encodeValue(value, seen = new WeakSet(), depth = 0) {
  if (depth > MAX_VALUE_DEPTH) fail('Backup contains a value nested too deeply.');
  if (value === undefined) return ['undefined'];
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return ['scalar', value];
  }
  if (typeof value === 'number') {
    return ['number', Object.is(value, -0) ? '-0' : String(value)];
  }
  if (typeof value === 'bigint') return ['bigint', String(value)];
  if (typeof value !== 'object' || seen.has(value)) {
    fail('Backup contains an unsupported value or shared object reference.');
  }
  seen.add(value);
  const prototype = Object.getPrototypeOf(value);
  if (prototype === Date.prototype && Number.isFinite(value.getTime())) {
    return ['date', value.toISOString()];
  }
  if (prototype === ArrayBuffer.prototype && !value.resizable) {
    return ['buffer', encodeBytes(value)];
  }
  if (prototype === Uint8Array.prototype) {
    return ['bytes', encodeValue(value.buffer, seen, depth + 1), value.byteOffset, value.length];
  }
  if (prototype === Array.prototype || prototype === Object.prototype) {
    const entries = Object.keys(value).map((key) => [
      key, encodeValue(value[key], seen, depth + 1),
    ]);
    return prototype === Array.prototype ? ['array', value.length, entries] : ['object', entries];
  }
  fail('Backup contains an unsupported IndexedDB value type.');
}

function decodeProperties(result, entries, depth) {
  if (!Array.isArray(entries)) fail();
  const keys = new Set();
  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' ||
        keys.has(entry[0]) || (Array.isArray(result) && entry[0] === 'length')) {
      fail();
    }
    const [key, value] = entry;
    keys.add(key);
    Object.defineProperty(result, key, {
      value: decodeValue(value, depth + 1), enumerable: true, writable: true, configurable: true,
    });
  }
  return result;
}

function decodeValue(node, depth = 0) {
  if (depth > MAX_VALUE_DEPTH || !Array.isArray(node)) fail();
  const [type, value, offset, length] = node;
  if (type === 'undefined' && node.length === 1) return undefined;
  if (type === 'bytes' && node.length === 4 && Array.isArray(value) && value[0] === 'buffer' &&
      Number.isSafeInteger(offset) && offset >= 0 && Number.isSafeInteger(length) && length >= 0) {
    const buffer = decodeValue(value, depth + 1);
    if (offset + length > buffer.byteLength) fail();
    return new Uint8Array(buffer, offset, length);
  }
  if (type === 'array' && node.length === 3 && Number.isInteger(value) &&
      value >= 0 && value <= 0xffffffff) {
    const result = decodeProperties(new Array(value), offset, depth);
    if (result.length !== value) fail();
    return result;
  }
  if (node.length !== 2) fail();
  if (type === 'scalar' && (value === null || typeof value === 'string' || typeof value === 'boolean')) {
    return value;
  }
  if (type === 'number' && typeof value === 'string') {
    const number = Number(value);
    if (String(number) === value || value === '-0') return number;
  }
  if (type === 'bigint' && typeof value === 'string' && /^(0|-?[1-9]\d*)$/.test(value)) {
    return BigInt(value);
  }
  if (type === 'object') return decodeProperties({}, value, depth);
  if (type === 'date' && isTimestamp(value)) return new Date(value);
  if (type === 'buffer' && typeof value === 'string') {
    const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
    if (encodeBytes(bytes.buffer) !== value) fail();
    return bytes.buffer;
  }
  fail();
}

function isTimestamp(value) {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

async function digestPayload(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function isFullBackup(backup) {
  return Boolean(backup && typeof backup === 'object' &&
    (Object.hasOwn(backup, 'format') || Object.hasOwn(backup, 'stores')));
}

function withRecordLocation(storeName, index, action) {
  try {
    return action();
  } catch (error) {
    // Identify the row without exposing an account ID or financial value.
    throw new Error(`Store "${storeName}", record ${index + 1}: ${error.message}`, { cause: error });
  }
}

export async function createFullBackup(snapshot) {
  const payload = {
    appName: 'FinPath',
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    databaseVersion: snapshot.databaseVersion,
    exportedAt: new Date().toISOString(),
    stores: snapshot.stores.map(({ name, keyPath, records }) => ({
      name, keyPath, count: records.length,
      records: records.map(([key, value], index) =>
        withRecordLocation(name, index, () => [encodeValue(key), encodeValue(value)])
      ),
    })),
  };
  const backup = {
    ...payload,
    integrity: { algorithm: 'SHA-256', digest: await digestPayload(payload) },
  };
  // A reversible value is not necessarily an admissible store record.
  await validateFullBackup(backup);
  return backup;
}

export function matchesBackupRecord(pair, key, record) {
  return JSON.stringify(pair) === JSON.stringify([encodeValue(key), encodeValue(record)]);
}

function referenceWarnings(recordsByStore, compareKeys) {
  const keysByStore = new Map(Object.entries(recordsByStore).map(
    ([name, records]) => [name, records.map(([key]) => key)]
  ));
  function hasKey(store, key) {
    const keys = keysByStore.get(store);
    let first = 0;
    let end = keys.length;
    try {
      while (first < end) {
        const middle = Math.floor((first + end) / 2);
        const order = compareKeys(keys[middle], key);
        if (order === 0) return true;
        if (order < 0) first = middle + 1;
        else end = middle;
      }
    } catch (error) {
      if (error.name !== 'DataError') throw error;
    }
    return false;
  }
  const references = {
    budgetTargets: { categoryId: 'categories' },
    scheduledItems: {
      categoryId: 'categories', accountId: 'accounts',
      savingsBucketId: 'savingsBuckets', bucketId: 'savingsBuckets',
    },
    manualAdjustments: { categoryId: 'categories', accountId: 'accounts' },
    savingsBuckets: { linkedAccountId: 'accounts' },
    savingsBucketAdjustments: { bucketId: 'savingsBuckets', savingsBucketId: 'savingsBuckets' },
    transfers: {
      fromAccountId: 'accounts', toAccountId: 'accounts',
      bucketId: 'savingsBuckets', savingsBucketId: 'savingsBuckets',
    },
    plannerEntries: { scheduledItemId: 'scheduledItems' },
  };
  const warnings = [];
  for (const [store, fields] of Object.entries(references)) {
    let missing = 0;
    for (const [, record] of recordsByStore[store]) {
      for (const [field, target] of Object.entries(fields)) {
        const key = record[field];
        if (key !== undefined && key !== null && key !== '' && !hasKey(target, key)) missing++;
      }
    }
    if (missing) warnings.push(`${store}: ${missing} existing unresolved reference(s), preserved as stored.`);
  }
  return warnings;
}

export async function validateFullBackup(backup, compareKeys = indexedDB.cmp.bind(indexedDB)) {
  requireFields(backup, [
    'appName', 'format', 'formatVersion', 'databaseVersion', 'exportedAt', 'stores', 'integrity',
  ]);
  const { appName, format, formatVersion, databaseVersion, exportedAt, stores, integrity } = backup;
  if (appName !== 'FinPath' || format !== FORMAT ||
      formatVersion !== FORMAT_VERSION || databaseVersion !== DB_VERSION) {
    fail('Unsupported complete FinPath backup format or database version.');
  }
  if (!isTimestamp(exportedAt) || !Array.isArray(stores) || stores.length !== STORE_NAMES.length) {
    fail('Complete backup is missing required database stores or metadata.');
  }
  requireFields(integrity, ['algorithm', 'digest']);
  if (integrity.algorithm !== 'SHA-256' || typeof integrity.digest !== 'string' ||
      !/^[0-9a-f]{64}$/.test(integrity.digest)) {
    fail('Complete backup integrity metadata is invalid.');
  }

  const recordsByStore = {};
  const storeCounts = [];
  for (const [index, store] of stores.entries()) {
    requireFields(store, ['name', 'keyPath', 'count', 'records']);
    const { name, keyPath, count, records } = store;
    if (name !== STORE_NAMES[index] || keyPath !== getStoreKeyPath(name) ||
        !Array.isArray(records) || count !== records.length) {
      fail('Complete backup store, key path, or record count does not match the manifest.');
    }
    const decoded = [];
    for (const [index, pair] of records.entries()) {
      withRecordLocation(name, index, () => {
        if (!Array.isArray(pair) || pair.length !== 2) fail();
        const key = decodeValue(pair[0]);
        const record = decodeValue(pair[1]);
        if (!record || Object.getPrototypeOf(record) !== Object.prototype) {
          fail('Backup records must be plain objects.');
        }
        if (!Object.hasOwn(record, keyPath)) {
          fail('Complete backup record is missing its primary key.');
        }
        try {
          if (compareKeys(key, record[keyPath]) !== 0) fail('Backup record primary key does not match.');
        } catch (error) {
          if (error.name === 'DataError') fail('Complete backup contains an invalid IndexedDB primary key.');
          throw error;
        }
        if (decoded.length && compareKeys(decoded.at(-1)[0], key) >= 0) {
          fail('Complete backup contains duplicate or unordered record keys.');
        }
        // Require canonical reversible values, including property order and array shape.
        if (!matchesBackupRecord(pair, key, record)) fail();
        decoded.push([key, record]);
      });
    }
    recordsByStore[name] = decoded;
    storeCounts.push({ label: name, value: count });
  }
  const payload = { appName, format, formatVersion, databaseVersion, exportedAt, stores };
  if (await digestPayload(payload) !== integrity.digest) {
    fail('Complete backup integrity check failed.');
  }
  return {
    recordsByStore,
    storeCounts,
    warnings: referenceWarnings(recordsByStore, compareKeys),
    metadata: { appName, exportVersion: formatVersion, schemaVersion: databaseVersion, exportedAt },
  };
}
