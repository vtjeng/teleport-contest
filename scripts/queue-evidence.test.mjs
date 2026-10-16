import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {closeSync, ftruncateSync, mkdtempSync, openSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {EVIDENCE_LIMITS, readQueueEvidence, validateEvidenceContract} from './queue-evidence.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fileEntry = (name, bytes) => ({name, bytes: bytes.length, sha256: hash(bytes), base64: bytes.toString('base64')});
const task = {id: 'probe', base: 'a'.repeat(40),
    evidenceContract: {version: 1, complete: ['capture'], block: ['stderr']}};
const state = {queue: {tasks: {}}};
function fixture(t) {
    const dir = mkdtempSync(join(tmpdir(), 'typed-evidence-'));
    t.after(() => rmSync(dir, {recursive: true, force: true}));
    const path = join(dir, 'envelope.json');
    const envelope = {version: 1, task: task.id, base: task.base,
        files: [fileEntry('capture.json', Buffer.from('{"observed":true}\n')), fileEntry('stderr.log', Buffer.alloc(0))],
        references: {capture: ['capture.json'], stderr: ['stderr.log']}};
    const save = value => {writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value)); return path;};
    return {path, envelope, save};
}

test('retention preserves exact original formatting and empty evidence; it does not assert runtime success', t => {
    const f = fixture(t), raw = JSON.stringify({...f.envelope,
        receipts: [{command: ['compare'], exitCode: 1, error: 'Original failure'}]}, null, 3) + '\n';
    const result = readQueueEvidence(f.save(raw), task, 'block', state);
    assert.equal(result.output, raw);
    assert.equal(result.sha256, hash(Buffer.from(raw)));
    assert.equal(result.bytes, Buffer.byteLength(raw));
    assert.equal(JSON.parse(result.output).receipts[0].exitCode, 1);
});

test('typed evidence rejects incomplete, misbound or corrupt envelopes', async t => {
    const mutations = {
        'wrong task': e => {e.task = 'other';},
        'wrong base': e => {e.base = 'b'.repeat(40);},
        'wrong version': e => {e.version = 2;},
        'missing required reference': e => {delete e.references.capture;},
        'missing referenced file': e => {e.references.capture = ['absent'];},
        'duplicate file': e => {e.files.push(e.files[0]);},
        'altered hash': e => {e.files[0].sha256 = '0'.repeat(64);},
        'altered byte count': e => {e.files[0].bytes++;},
        'truncated payload': e => {e.files[0].base64 = e.files[0].base64.slice(0, -4);},
        'permissive base64': e => {e.files[0].base64 = '!'.repeat(e.files[0].base64.length);},
        'oversized decoded data': e => {e.files[0].bytes = EVIDENCE_LIMITS.decodedBytes + 1;},
        'unexpected linked target': e => {e.targetTask = 'old';},
    };
    for (const [label, mutate] of Object.entries(mutations)) await t.test(label, t => {
        const f = fixture(t); mutate(f.envelope);
        assert.throws(() => readQueueEvidence(f.save(f.envelope), task, 'complete', state), /queue evidence:/u);
    });
    const f = fixture(t);
    for (const raw of ['PASS 35 files verified', '{"version":1', '\ufeff' + JSON.stringify(f.envelope)])
        assert.throws(() => readQueueEvidence(f.save(raw), task, 'complete', state), /queue evidence:/u);
    writeFileSync(f.path, Buffer.from([0xff]));
    assert.throws(() => readQueueEvidence(f.path, task, 'complete', state), /UTF-8 JSON/u);
    const descriptor = openSync(f.path, 'w');
    ftruncateSync(descriptor, EVIDENCE_LIMITS.envelopeBytes + 1); closeSync(descriptor);
    assert.throws(() => readQueueEvidence(f.path, task, 'complete', state), /bounded regular/u);
});

test('contracts require explicit complete/block references and pin linked packet identity', t => {
    const f = fixture(t), digest = 'c'.repeat(64);
    const linkedState = {queue: {tasks: {old: {status: 'completed', result: {digest}}}}};
    const contract = {...task.evidenceContract, targetTask: 'old', targetDigest: digest};
    validateEvidenceContract(contract, linkedState);
    const linkedTask = {...task, evidenceContract: contract};
    Object.assign(f.envelope, {targetTask: 'old', targetDigest: digest});
    assert.ok(readQueueEvidence(f.save(f.envelope), linkedTask, 'complete', linkedState));
    assert.throws(() => validateEvidenceContract({...contract, targetDigest: 'd'.repeat(64)}, linkedState), /digest/u);
    assert.throws(() => validateEvidenceContract({...contract, targetTask: 'missing'}, linkedState), /linked target/u);
    assert.throws(() => validateEvidenceContract({...contract, block: []}, linkedState), /reference/u);
    assert.throws(() => validateEvidenceContract({...contract, typo: true}, linkedState), /unknown contract/u);
    assert.throws(() => readQueueEvidence(undefined, task, 'complete', state), /requires --evidence/u);
    assert.equal(readQueueEvidence(undefined, {id: 'legacy'}, 'complete', state), undefined);
});

test('linked recovery identities survive supersession, resumption, completion and a newer block', () => {
    const old = 'b'.repeat(64), newer = 'c'.repeat(64), result = 'd'.repeat(64);
    const contract = {...task.evidenceContract, targetTask: 'old', targetDigest: old};
    for (const status of ['blocked', 'superseded', 'claimed', 'completed']) {
        const state = {queue: {tasks: {old: {status, recovery: `/archive/${newer}.json`,
            recoveryPackets: [`/archive/${old}.json`, `/archive/${newer}.json`], result: {digest: result}}}}};
        validateEvidenceContract(contract, state);
        validateEvidenceContract({...contract, targetDigest: newer}, state);
        validateEvidenceContract({...contract, targetDigest: result}, state);
        assert.throws(() => validateEvidenceContract({...contract, targetDigest: 'e'.repeat(64)}, state), /digest/u);
    }
});
