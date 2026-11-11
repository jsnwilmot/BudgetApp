"""Independent standard-library reference. Not imported by JS or run in CI.

Regenerate explicitly from budget-planner:
  python3 test/fixtures/generate_backup_vectors.py
Only writes the committed synthetic vector fixture next to this script.
Python struct/hashlib and an independent UTF-16 canonical writer establish
fixed expected bytes/hashes; no JS codec calls or generated-at-assertion values.
"""
import hashlib
import json
import pathlib
import struct


def units(value):
    raw = value.encode("utf-16-be", "surrogatepass")
    return [int.from_bytes(raw[i:i + 2], "big") for i in range(0, len(raw), 2)]


def quote(value):
    return '"' + ''.join('\\"' if c == 34 else '\\\\' if c == 92 else
                         ('\\u%04x' % c) if c < 32 or c > 126 else chr(c)
                         for c in units(value)) + '"'


def cj(value):
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, str):
        return quote(value)
    if isinstance(value, int):
        assert 0 <= value <= 9007199254740991
        return str(value)
    if isinstance(value, list):
        return '[' + ','.join(cj(v) for v in value) + ']'
    return '{' + ','.join(quote(k) + ':' + cj(value[k]) for k in sorted(value, key=units)) + '}'


def h(domain, value):
    return hashlib.sha256((domain + '\n' + cj(value)).encode('ascii')).hexdigest()


NODE = 'FinPath/FP-TV-1/node'
PREFIX = 'FinPath/FP-FULL-1/'
NODES = {}


def intern(value):
    key = h(NODE, value)
    NODES[key] = value
    return key


def array(refs):
    if len(refs) <= 64:
        return intern(['arr-leaf', refs])
    capacity = 64
    while capacity * 64 < len(refs):
        capacity *= 64
    return intern(['arr-branch', len(refs),
                   [array(refs[i:i + capacity]) for i in range(0, len(refs), capacity)]])


def encode(value):
    if value is None:
        return intern(['n'])
    if isinstance(value, bool):
        return intern(['b', value])
    if isinstance(value, str):
        return intern(['s', value])
    if isinstance(value, (int, float)):
        return intern(['f64', struct.pack('>d', value).hex()])
    if isinstance(value, list):
        return array([encode(v) for v in value])
    return intern(['obj', list(value), [[k, encode(value[k])] for k in sorted(value, key=units)]])


raw = ['appMetadata', 'appSettings', 'budgetTargets', 'categories', 'plannerEntries', 'scheduledItems',
       'accounts', 'manualAdjustments', 'savingsBuckets', 'savingsBucketAdjustments', 'transfers']
schema = {s: 'entryKey' if s == 'plannerEntries' else 'id' for s in raw}
schema.update(financialControl='id', recordRevisions=['collection', 'key'], checkpointDrafts=['id', 'revision'],
              checkpointDraftHeads='id', financialAudit='id', protectedSnapshots='id')
b1caps = ['synthetic-repository-v1', 'raw-snapshot-v1', 'atomic-command-v1', 'inactive-draft-v1']
caps = ['canonical-json-v1', 'closed-content-graph-v1', 'foreign-provenance-v1', 'full-raw17-v1',
        'inactive-state-only-v1', 'typed-values-v1']
receipt = dict(operationId='init', kind='initialize', generation='g', stateRevision='0', financialRevision='0', snapshotId='init')
control = dict(id='financial-control', protocolVersion=1, synthetic=True, mode='inactive-only', capabilities=b1caps,
               generation='g', stateRevision='0', financialRevision='0')
stores = {s: [] for s in schema}
stores['financialControl'] = [dict(key='financial-control', value=control)]
stores['financialAudit'] = [dict(key='init', value=dict(id='init', commandIdentity='0' * 64, receipt=receipt,
    affected=[dict(collection=s) for s in raw], consent=dict(confirmed=True, action='initialize')))]
stores['protectedSnapshots'] = [dict(key='init', value=dict(id='init', before=dict(
    stores={s: [] for s in schema if s not in ['financialAudit', 'protectedSnapshots']},
    history=dict(financialAudit=[], protectedSnapshots=[]))))]
snapshot = dict(synthetic=True, protocolVersion=1, databaseName='finpath-synthetic-b1-golden', stores=stores)
manifest = []
for store in sorted(schema):
    rows = [dict(key=['s', r['key']], valueRef=encode(r['value'])) for r in stores[store]]
    body = dict(store=store, keyPath=schema[store], count=len(rows), rows=rows)
    manifest.append(dict(**body, keysetDigest=h(PREFIX + 'keys', dict(store=store, keyPath=schema[store], keys=[r['key'] for r in rows])),
                         collectionDigest=h(PREFIX + 'collection', body)))
source = dict(storageSchema=1, protocolVersion=1, databaseName=snapshot['databaseName'], snapshotDigest='',
              controlRef=next(m for m in manifest if m['store'] == 'financialControl')['rows'][0]['valueRef'])
data = dict(appDataVersion=3, format='FP-FULL-1', sourceProfile='finpath-b1-raw17-v1', requiredCapabilities=caps,
            source=source, manifest=manifest, nodes=[dict(id=k, value=NODES[k]) for k in sorted(NODES)],
            provenance=dict(sourceEnvelopes=[], qualifications=[]), derived={})
source['snapshotDigest'] = h(PREFIX + 'snapshot', dict(sourceProfile=data['sourceProfile'], storageSchema=1,
    protocolVersion=1, controlRef=source['controlRef'], manifest=manifest))
producer = dict(appVersion='synthetic-golden', exportedAt='2026-12-31T00:00:00.000Z')
envelope = dict(appName='FinPath', exportVersion=2, schemaVersion=3, **producer,
    metadata=dict(appName='FinPath', **producer, exportVersion=2, schemaVersion=3, appDataVersion=3,
                  source='synthetic-harness', synthetic=True, requiredCapabilities=caps), data=data,
    integrity=dict(algorithm='SHA-256', canonicalization='FP-CJ-1', valueCodec='FP-TV-1', graph='FP-GRAPH-1'))
envelope['integrity']['contentDigest'] = h(PREFIX + 'envelope', envelope)
vectors = dict(reference='Python struct/hashlib independent FP-CJ-1/FP-TV-1 reference', snapshot=snapshot, producer=producer,
               canonicalEnvelope=cj(envelope), snapshotDigest=source['snapshotDigest'], contentDigest=envelope['integrity']['contentDigest'])
vectors['nodes'] = [dict(value=v, canonical=cj(v), hash=h(NODE, v)) for v in
    [['n'], ['u'], ['b', True], ['f64', '8000000000000000'], ['f64', '0000000000000001'],
     ['f64', '3fb999999999999a'], ['s', 'é'], ['s', 'e\u0301'], ['s', '\ud800'], ['s', '😀'], ['s', '\n"\\']]]
vectors['canonicalObject'] = dict(value={'\ue000': 'last', '😀': 'middle', 'Z': '\u0000', '__proto__': 'own'},
                                  canonical=cj({'\ue000': 'last', '😀': 'middle', 'Z': '\u0000', '__proto__': 'own'}))
vectors['chunks'] = []
for length in [0, 64, 65, 4096, 4097]:
    NODES.clear()
    root = array([intern(['n'])] * length if length else [])
    vectors['chunks'].append(dict(length=length, root=root, uniqueNodes=len(NODES)))
vectors['keyset'] = dict(payload=dict(store='example', keyPath=['id', 'revision'], keys=[['k', ['A', '10']], ['k', ['A', '2']], ['k', ['😀', '0']]]))
vectors['keyset']['hash'] = h(PREFIX + 'keys', vectors['keyset']['payload'])
pathlib.Path(__file__).with_name('backupGolden.json').write_text(json.dumps(vectors, ensure_ascii=True, indent=2) + '\n', encoding='utf-8')
