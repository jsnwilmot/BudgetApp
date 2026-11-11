"""P1.1b1 independent pre-implementation wire/DTO reference. Synthetic only.
No imports/calls to JavaScript; writes only the NEW fixed fixture on explicit run.
"""
import hashlib
import json
import pathlib
import struct


def units(s):
    b = s.encode('utf-16-be', 'surrogatepass')
    return [int.from_bytes(b[i:i+2], 'big') for i in range(0, len(b), 2)]


def cj(v):
    if v is None:
        return 'null'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, str):
        return '"'+''.join('\\"' if c == 34 else '\\\\' if c == 92 else
                           ('\\u%04x' % c) if c < 32 or c > 126 else chr(c)
                           for c in units(v))+'"'
    if isinstance(v, int):
        assert 0 <= v <= 2**53-1
        return str(v)
    if isinstance(v, list):
        return '['+','.join(cj(x) for x in v)+']'
    return '{'+','.join(cj(k)+':'+cj(v[k]) for k in sorted(v, key=units))+'}'


D = 'FinPath/P1.1b/'
P = 'FinPath/P1/'
KINDS = ['chunk', 'value', 'map', 'version', 'origin', 'dataset', 'data-root',
         'journal', 'event', 'model-root']
CAPS = ['command-transients-v1', 'logical-fp-map1-v1', 'committed-sequence-v1',
        'bounded-batch-pages-v1', 'append-inventory-v1']


def sha(domain, b):
    return hashlib.sha256((domain+'\n').encode('ascii')+b).hexdigest()


def h(domain, v):
    return sha(domain, cj(v).encode('ascii'))


empty = dict(tag='leaf', entries=[], total=0, live=0)
mid = h(P+'map/1', empty)
data = dict(originsRoot=mid, datasetsRoot=mid)
did = h(P+'data-root/1', data)
root = dict(instanceId='p1-instance', generation='local-generation', revision='0',
            dataRoot=did, operationsRoot=mid, journal=None)
rid = h(P+'model-root/1', root)
records = [dict(kind='map', id=mid, body=empty),
           dict(kind='data-root', id=did, body=data),
           dict(kind='model-root', id=rid, body=root)]


def page(rows, sequence):
    frames = []
    for r in rows:
        codec = 2 if r['kind'] == 'chunk' else 1
        b = (r['body']['data'] if codec == 2 else cj(r['body'])).encode('ascii')
        prefix = struct.pack('>BB32sI', KINDS.index(r['kind'])+1, codec,
                             bytes.fromhex(r['id']), len(b))
        assert len(prefix) == 38
        frames.append(prefix+b)
    payload = b''.join(frames)
    header = struct.pack('>4sBBHQHHI', b'FPW1', 1, 0, 24, sequence, len(rows), 0, len(payload))
    assert len(header) == 24
    raw = header+payload
    assert len(raw)+32 <= 65536
    return raw


raw = page(records, 1)
pid = sha(D+'page/1', raw)
delta = dict(profile='FP-WRITER-INVENTORY-1', physicalInstance='writer-vector',
             generation='local-generation', revision=0, previous=None,
             firstSequence=1, objects=3, pages=[[pid, len(raw), 3]], logicalRoot=rid)
delta_id = h(D+'inventory-delta/1', delta)
seal = dict(profile='FP-WRITER-SEAL-1', physicalInstance='writer-vector',
            generation='local-generation', revision=0, baseState=None, logicalRoot=rid,
            inventoryRoot=delta_id, previous=None, operationId=None,
            semanticDigest=None, requestFingerprint=None, pinRoot=None,
            effects=dict(versions=0, newObjects=3))
seal_id = h(D+'command-seal/1', seal)
state = dict(profile='P1.1b-WRITER-MODEL-1', capabilities=CAPS,
             layout='fp-tv-chunk61440-cj1', physicalInstance='writer-vector',
             generation='local-generation', revision=0, logicalRoot=rid, dataRoot=did,
             inventoryRoot=delta_id, sealRoot=seal_id, pinRoot=None, sequence=3,
             objects=6, payloadBytes=0)
fixed = len(raw)+32+len(cj(delta))+32+len(cj(seal))+32
for _ in range(16):
    n = fixed+len(cj(state))+32
    if n == state['payloadBytes']:
        break
    state['payloadBytes'] = n
else:
    raise AssertionError('cost fixed point')
guard = dict(physicalInstance='writer-vector', generation='local-generation', revision=0,
             stateRoot=h(D+'state/1', state), logicalRoot=rid, inventoryRoot=delta_id,
             capabilityDigest=h(D+'capabilities/1', CAPS))
pin = dict(profile='FP-WRITER-PINS-1', physicalInstance='writer-vector', generation='local-generation',
           revision=1, previous=None, pins=[dict(kind='object', id=mid)])
chunk = dict(kind='chunk', id=sha(P+'chunk/1', b'"\\\n"'), body=dict(data='"\\\n"'))
chunk_page = page([chunk], 4)
out = dict(reference='independent Python before writer implementation', kinds=KINDS,
           capabilities=CAPS, records=records, pageHex=raw.hex(), pageHash=pid,
           delta=dict(body=delta, hash=delta_id), seal=dict(body=seal, hash=seal_id),
           state=dict(body=state, hash=guard['stateRoot']), guard=guard,
           pin=dict(body=pin, hash=h(D+'pins/1', pin)),
           physicalRequest=dict(body=dict(guard=guard, semanticDigest='a'*64),
                                hash=h(D+'physical-request/1', dict(guard=guard, semanticDigest='a'*64))),
           chunk=dict(record=chunk, pageHex=chunk_page.hex(), hash=sha(D+'page/1', chunk_page)),
           fpBits={'negativeZero': struct.pack('>d', -0.0).hex(),
                   'subnormal': struct.pack('>d', 5e-324).hex()})
pathlib.Path(__file__).with_name('writerGolden.json').write_text(json.dumps(out, indent=2, ensure_ascii=True)+'\n')
