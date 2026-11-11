"""Independent CJ/hash/ordinal closure references; never imports/runs JS/P1."""
import hashlib
import json
import pathlib

SHA = '7bd40fdb0dc23ec94fbc1a522260d0403b1f22ec'
P = 'FinPath/P1/'
D = 'FinPath/P1.1a/'


def cj(v):
    if v is None:
        return 'null'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, int):
        assert v >= 0
        return str(v)
    if isinstance(v, str):
        out = '"'
        for b in [int.from_bytes(v.encode('utf-16-be', 'surrogatepass')[i:i+2], 'big')
                  for i in range(0, len(v.encode('utf-16-be', 'surrogatepass')), 2)]:
            out += '\\"' if b == 34 else '\\\\' if b == 92 else ('\\u%04x' % b) if b < 32 or b > 126 else chr(b)
        return out + '"'
    if isinstance(v, list):
        return '[' + ','.join(cj(x) for x in v) + ']'
    assert isinstance(v, dict)
    return '{' + ','.join(cj(k)+':'+cj(v[k]) for k in sorted(v, key=lambda s: s.encode('utf-16-be', 'surrogatepass'))) + '}'


def h(domain, value):
    return hashlib.sha256((domain+'\n'+cj(value)).encode('ascii')).hexdigest()


records = []


def record(kind, body, forced=None):
    rid = forced or h(P+kind+'/1', body)
    if any(r['id'] == rid for r in records):
        return rid
    digest = h(P+'record/1', dict(id=rid, kind=kind, body=body))
    ordinal = len(records)+1
    cost = (len(body['data']) if kind == 'chunk' else len(cj(body)))+len(cj(dict(id=rid, kind=kind, ordinal=ordinal, recordDigest=digest)))
    records.append(dict(id=rid, kind=kind, body=body, ordinal=ordinal, payloadBytes=cost, recordDigest=digest))
    return rid


empty = record('map', dict(tag='leaf', entries=[], total=0, live=0))
data = record('data-root', dict(originsRoot=empty, datasetsRoot=empty))
root = record('model-root', dict(instanceId='vector-instance', generation='local-g', revision='0', dataRoot=data, operationsRoot=empty, journal=None))


def trie(rows, depth=0):
    if len(rows) == 1:
        r = rows[0]
        return h(P+'index-leaf/1', dict(tag='leaf', id=r['id'], ordinal=r['ordinal'], recordDigest=r['recordDigest'], payloadBytes=r['payloadBytes']))
    children = []
    for char in '0123456789abcdef':
        group = [r for r in rows if r['id'][depth] == char]
        children.append(trie(group, depth+1) if group else None)
    return h(P+'index-branch/1', dict(tag='branch', children=children))


binding = dict(sha=SHA, instanceId='vector-instance', generation='local-g', modelRoot=root, indexRoot=trie(records))
census = dict(objects=3, bytes=sum(r['payloadBytes'] for r in records), byKind={r['kind']: dict(count=1, bytes=r['payloadBytes']) for r in records})


def manifest(kind, rows):
    pages = []
    tip = None
    for start in range(0, len(rows), 128):
        body = dict(kind=kind, index=len(pages), previous=tip, rows=rows[start:start+128])
        tip = h(D+'page/1', body)
        pages.append(dict(id=tip, body=body))
    return pages, dict(tip=tip, pages=len(pages), rows=len(rows), bytes=sum(len(cj(p)) for p in pages))


inventory_rows = [[r['id'], r['kind'], r['ordinal'], r['payloadBytes'], r['recordDigest']] for r in sorted(records, key=lambda r:r['id'])]
ip, im = manifest('inventory', inventory_rows)
inventory_digest = h(D+'inventory/1', dict(binding=binding, census=census, manifest=im))


def delta(baseline, candidate):
    difference = abs(baseline-candidate)
    return dict(direction='decrease' if candidate < baseline else 'increase' if candidate > baseline else 'equal', bytes=difference, basisPoints=difference*10000//baseline if baseline else 0)


def plan(full):
    pins = [dict(kind='full-inventory', id=binding['indexRoot'])] if full else []
    rows = dict(roots=[1, 2, 3] if full else [2, 3], excluded=[], pins=pins)
    pages = {}; manifests = {}
    for kind, data_rows in rows.items():
        pages[kind], manifests[kind] = manifest(kind, data_rows)
    page_bytes = sum(x['bytes'] for x in manifests.values())
    proof = dict(profile='P1.1a-VERIFICATION-1', modelOnly=True, experimentOnly=True,
                 status='VERIFIED_COUNTERFACTUAL', method='reverse-ordinal-v1', planId='0'*64,
                 sourceInventoryDigest=inventory_digest, rootsTip=manifests['roots']['tip'],
                 excludedTip=manifests['excluded']['tip'], pinsTip=manifests['pins']['tip'],
                 keptCount=3, keptBytes=census['bytes'])
    proof_bytes = len(cj(proof))
    header_bytes = 0
    for _ in range(32):
        overhead = page_bytes+header_bytes+proof_bytes
        accounting = dict(pageBytes=page_bytes, headerBytes=header_bytes, verificationBytes=proof_bytes, overheadBytes=overhead,
                          accountedBytes=census['bytes']+overhead,
                          mapDelta=delta(census['byKind']['map']['bytes'], census['byKind']['map']['bytes']+overhead),
                          totalDelta=delta(census['bytes'], census['bytes']+overhead), mapGoal=False, totalGoal=False, noRegression=False)
        body = dict(profile='P1.1a-RETENTION-PLAN-1', modelOnly=True, experimentOnly=True,
                    source=dict(**binding, inventoryDigest=inventory_digest, census=census),
                    policy=dict(fullInventoryPinned=full, roots='all-non-map-plus-pins', kept='source-minus-exclusions'),
                    manifests=manifests,
                    candidate=dict(keptCount=3, keptBytes=census['bytes'], excludedMapCount=0, excludedMapBytes=0,
                                   protectedMapCount=1, protectedMapBytes=census['byKind']['map']['bytes'], byKind=census['byKind'], ordinalPolicy='source-gaps-preserved'),
                    accounting=accounting,
                    qualifications=['MODEL_ONLY','EXPERIMENT_ONLY','NOT_P1_INVENTORY','NOT_BACKUP','NOT_RESTORE','WRITER_INDEX_NATIVE_COST_UNKNOWN'])
        size = len(cj(dict(planId='0'*64, body=body)))
        if size == header_bytes:
            break
        header_bytes = size
    else:
        raise AssertionError('header fixed point')
    result = dict(planId=h(D+'plan/1', body), body=body)
    assert len(cj(result)) == header_bytes
    return dict(plan=result, canonical=cj(result), pages=pages)


# Independent reachability example: committed roots retain5; unpinned4 is work.
abstract = [dict(ordinal=1, kind='chunk', refs=[]), dict(ordinal=2, kind='map', refs=[1]),
            dict(ordinal=3, kind='version', refs=[1]), dict(ordinal=4, kind='map', refs=[2, 3]),
            dict(ordinal=5, kind='map', refs=[2, 3]), dict(ordinal=6, kind='model-root', refs=[5])]


def closure(extra):
    keep = {r['ordinal'] for r in abstract if r['kind'] != 'map'} | set(extra)
    changed = True
    while changed:
        before = len(keep)
        for r in abstract:
            if r['ordinal'] in keep:
                keep.update(r['refs'])
        changed = len(keep) != before
    return sorted(keep)


out = dict(empty=plan(False), fullPin=plan(True), inventoryDigest=inventory_digest,
           inventoryPages=ip, records=list(records),
           closure=dict(records=abstract, unpinned=closure([]), pinned=closure([4])))


def typed(v):
    if isinstance(v, str):
        node = ['s', v]
    elif isinstance(v, list):
        node = ['arr-leaf', [typed(x) for x in v]]
    else:
        node = ['obj', list(v), [[k, typed(v[k])] for k in sorted(v)]]
    rid = h('FinPath/FP-TV-1/node', node)
    if any(r['id'] == rid for r in records):
        return rid
    raw = cj(node)
    chunk = hashlib.sha256((P+'chunk/1\n'+raw).encode('ascii')).hexdigest()
    record('chunk', dict(data=raw), chunk)
    children = node[1] if node[0] == 'arr-leaf' else [x[1] for x in node[2]] if node[0] == 'obj' else []
    record('value', dict(logicalBytes=len(raw), chunks=[chunk], children=children), rid)
    return rid


entries = []
for key in ['k00000', 'k00001']:
    key_ref = typed(['s', key])
    value_ref = typed(dict(id=key, amount='1.25'))
    version_ref = record('version', dict(datasetId='vector', store='accounts', keyRef=key_ref,
        valueRef=value_ref, deleted=False, previous=None, sourceVersionRef=None, localRevision='1'))
    entries.append(dict(keyRef=key_ref, valueRef=value_ref, versionRef=version_ref, deleted=False))
    final_map = record('map', dict(tag='leaf', entries=list(entries), total=len(entries), live=len(entries)))
excluded = [r['ordinal'] for r in records if r['kind'] == 'map' and r['id'] not in [empty, final_map]]
out['tiny'] = dict(records=records, root=final_map, sourceIndexRoot=trie(records),
    pins=[dict(kind='object', id=final_map)], excluded=excluded,
    keptOrdinals=[r['ordinal'] for r in records if r['ordinal'] not in excluded])
pathlib.Path(__file__).with_name('retentionGolden.json').write_text(json.dumps(out, ensure_ascii=True, indent=2)+'\n', encoding='utf8')
