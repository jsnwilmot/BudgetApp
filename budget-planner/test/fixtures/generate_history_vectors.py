"""Independent Python FP-MAP-1 reference; no JS model calls.
Run explicitly: python3 test/fixtures/generate_history_vectors.py
Writes only the synthetic fixed vector fixture. CI consumes it, not this code.
"""
import hashlib
import json
import pathlib
import struct


def units(s):
    b = s.encode('utf-16-be', 'surrogatepass')
    return [int.from_bytes(b[i:i + 2], 'big') for i in range(0, len(b), 2)]


def quote(s):
    return '"' + ''.join('\\"' if c == 34 else '\\\\' if c == 92 else
        ('\\u%04x' % c) if c < 32 or c > 126 else chr(c) for c in units(s)) + '"'


def cj(v):
    if v is None:
        return 'null'
    if isinstance(v, bool):
        return str(v).lower()
    if isinstance(v, str):
        return quote(v)
    if isinstance(v, int):
        return str(v)
    if isinstance(v, list):
        return '[' + ','.join(cj(x) for x in v) + ']'
    return '{' + ','.join(quote(k) + ':' + cj(v[k]) for k in sorted(v, key=units)) + '}'


def h(domain, body):
    return hashlib.sha256((domain + '\n' + cj(body)).encode('ascii')).hexdigest()


P = 'FinPath/P1/'
V = 'FinPath/FP-TV-1/node'
NODES = {}


def arr(refs):
    if len(refs) <= 64:
        return h(V, ['arr-leaf', refs])
    capacity = 64
    while capacity * 64 < len(refs):
        capacity *= 64
    return h(V, ['arr-branch', len(refs), [arr(refs[i:i+capacity]) for i in range(0, len(refs), capacity)]])


def value(v):
    if v is None:
        n = ['n']
    elif isinstance(v, bool):
        n = ['b', v]
    elif isinstance(v, str):
        n = ['s', v]
    elif isinstance(v, (int, float)):
        n = ['f64', struct.pack('>d', v).hex()]
    elif isinstance(v, list):
        return arr([value(x) for x in v])
    else:
        n = ['obj', list(v), [[k, value(v[k])] for k in sorted(v, key=units)]]
    return h(V, n)


def intern(body):
    ref = h(P+'map/1', body)
    NODES[ref] = body
    return ref


def leaf(entries):
    return intern(dict(tag='leaf', entries=entries, total=len(entries), live=sum(not e['deleted'] for e in entries)))


def summary(ref):
    n = NODES[ref]
    return dict(ref=ref, firstKeyRef=n['entries'][0]['keyRef'] if n['tag'] == 'leaf' else n['children'][0]['firstKeyRef'], total=n['total'], live=n['live'])


def branch(children):
    return intern(dict(tag='branch', children=children, total=sum(c['total'] for c in children), live=sum(c['live'] for c in children)))


KEYS = {}


def key_order(k):
    return (0, units(k)) if isinstance(k, str) else (1, [units(x) for x in k])


def entry(k):
    kr = value(['s', k] if isinstance(k, str) else ['k', k])
    KEYS[kr] = k
    vr = value(dict(id=k, amount='1.25'))
    ver = h(P+'version/1', dict(datasetId='vector', store='accounts', keyRef=kr, valueRef=vr,
        deleted=False, previous=None, sourceVersionRef=None, localRevision='1'))
    return dict(keyRef=kr, valueRef=vr, versionRef=ver, deleted=False)


def put(root, k, item):
    n = NODES[root]
    if n['tag'] == 'leaf':
        entries = list(n['entries'])
        pos = next((i for i, e in enumerate(entries) if key_order(KEYS[e['keyRef']]) >= key_order(k)), len(entries))
        exists = pos < len(entries) and KEYS[entries[pos]['keyRef']] == k
        entries[pos:pos+(1 if exists else 0)] = [item]
        return [leaf(entries)] if len(entries) <= 64 else [leaf(entries[:32]), leaf(entries[32:])]
    pos = 0
    for i, child in enumerate(n['children'][1:], 1):
        if key_order(KEYS[child['firstKeyRef']]) <= key_order(k):
            pos = i
        else:
            break
    children = list(n['children'])
    children[pos:pos+1] = [summary(r) for r in put(children[pos]['ref'], k, item)]
    return [branch(children)] if len(children) <= 64 else [branch(children[:32]), branch(children[32:])]


def update(root, k, item):
    result = put(root, k, item)
    return result[0] if len(result) == 1 else branch([summary(r) for r in result])


def shape(root):
    n = NODES[root]
    return len(n['entries']) if n['tag'] == 'leaf' else [shape(c['ref']) for c in n['children']]


vectors = dict(reference='Independent Python struct/hashlib persistent map reference', maps=[])
root = leaf([])
for count in range(4098):
    if count in [0, 1, 32, 64, 65, 4096, 4097]:
        vectors['maps'].append(dict(count=count, root=root, shape=shape(root)))
    if count < 4097:
        k = 'k%05d' % count
        root = update(root, k, entry(k))
mixed = ['2', '10', '__proto__', '\ud800', '😀', '\ue000', ['A', '2'], ['A', '10']]
root = leaf([])
for k in mixed:
    root = update(root, k, entry(k))
vectors['mixed'] = dict(input=mixed, ordered=sorted(mixed, key=key_order), root=root, shape=shape(root))
integer_own = dict([('2', 'two'), ('10', 'ten'), ('id', 'indices')])
vectors['integerOwn'] = dict(keys=list(integer_own), hash=value(integer_own))
empty = leaf([])
data = dict(originsRoot=empty, datasetsRoot=empty)
data_ref = h(P+'data-root/1', data)
model = dict(instanceId='vector-instance', generation='local-g', revision='0', dataRoot=data_ref, operationsRoot=empty, journal=None)
vectors['initial'] = dict(emptyMap=empty, dataRoot=data_ref, root=h(P+'model-root/1', model))
records = []
for ordinal, (kind, body) in enumerate([('map', NODES[empty]), ('data-root', data), ('model-root', model)], 1):
    identity = h(P+kind+'/1', body)
    record_digest = h(P+'record/1', dict(id=identity, kind=kind, body=body))
    cost = len(cj(body)) + len(cj(dict(id=identity, kind=kind, ordinal=ordinal, recordDigest=record_digest)))
    records.append(dict(tag='leaf', id=identity, ordinal=ordinal, recordDigest=record_digest, payloadBytes=cost))


def index_root(rows, depth=0):
    if len(rows) == 1:
        return h(P+'index-leaf/1', rows[0])
    children = []
    for slot in '0123456789abcdef':
        group = [r for r in rows if r['id'][depth] == slot]
        children.append(index_root(group, depth+1) if group else None)
    return h(P+'index-branch/1', dict(tag='branch', children=children))


vectors['initial']['indexRoot'] = index_root(records)
vectors['initial']['records'] = records
vectors['initial']['retainedBytes'] = sum(r['payloadBytes'] for r in records)
journal = dict(previous=None, beforeModelRoot=vectors['initial']['root'], afterDataRoot=data_ref,
    operationId='local-op', requestDigest='a'*64, revision='1', kind='MODEL_ONLY')
vectors['journal'] = dict(body=journal, canonical=cj(journal), hash=h(P+'journal/1', journal))
pathlib.Path(__file__).with_name('historyGolden.json').write_text(json.dumps(vectors, ensure_ascii=True, indent=2)+'\n', encoding='utf8')
