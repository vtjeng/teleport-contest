// Opt-in byte retention, separate from runtime success and batch acceptance.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstatSync, readFileSync} from 'node:fs';
import {basename, isAbsolute} from 'node:path';
import {TextDecoder} from 'node:util';

const ensure = (value, message) => assert.ok(value, `queue evidence: ${message}`);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const name = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:/-]*$/u.test(value)
    && !isAbsolute(value) && !value.split('/').some(part => !part || part === '.' || part === '..')
    && !Object.hasOwn(Object.prototype, value);
const names = value => Array.isArray(value) && value.every(name) && new Set(value).size === value.length;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const EVIDENCE_LIMITS = Object.freeze({envelopeBytes: 128 * 1024 * 1024,
    decodedBytes: 64 * 1024 * 1024, files: 4096});

export function validateEvidenceContract(contract, state) {
    ensure(object(contract) && contract.version === 1, 'unsupported contract version');
    ensure(Object.keys(contract).every(key => ['version', 'complete', 'block', 'targetTask', 'targetDigest'].includes(key)),
        'unknown contract field');
    for (const phase of ['complete', 'block'])
        ensure(names(contract[phase]) && contract[phase].length > 0, `${phase} needs required reference names`);
    if (contract.targetTask !== undefined) {
        const target = state.queue.tasks[contract.targetTask];
        ensure(Object.hasOwn(state.queue.tasks, contract.targetTask) && target
            && (target.result || target.recovery), 'linked target must have a preserved result or recovery');
        const digests = [target.result?.digest,
            ...new Set([...(target.recoveryPackets ?? []), ...(target.recovery ? [target.recovery] : [])])]
            .map(value => value?.endsWith('.json') ? basename(value, '.json') : value);
        ensure(/^[a-f0-9]{64}$/u.test(contract.targetDigest) && digests.includes(contract.targetDigest),
            'linked target digest differs from preserved packet');
    } else ensure(contract.targetDigest === undefined, 'target digest needs a linked target task');
}

export function readQueueEvidence(file, task, phase, state) {
    const contract = task.evidenceContract;
    if (!file) {
        ensure(!contract, 'assignment requires --evidence <existing-envelope.json>');
        return undefined;
    }
    if (contract) validateEvidenceContract(contract, state);
    ensure(['complete', 'block'].includes(phase), 'unsupported retention phase');
    const stat = lstatSync(file);
    ensure(stat.isFile() && stat.size <= EVIDENCE_LIMITS.envelopeBytes, 'expected a bounded regular envelope file');
    const bytes = readFileSync(file);
    ensure(bytes.length <= EVIDENCE_LIMITS.envelopeBytes, 'envelope exceeds byte limit');
    let output, envelope;
    try {
        output = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes);
        envelope = JSON.parse(output);
    } catch {throw new Error('queue evidence: expected complete UTF-8 JSON, not verifier output');}
    ensure(object(envelope) && envelope.version === 1, 'unsupported envelope version');
    ensure(envelope.task === task.id && envelope.base === task.base, 'envelope task/base differs from assignment');
    ensure(envelope.targetTask === contract?.targetTask, 'linked target differs from contract');
    ensure(envelope.targetDigest === contract?.targetDigest, 'linked target digest differs from contract');
    ensure(Array.isArray(envelope.files) && envelope.files.length > 0
        && envelope.files.length <= EVIDENCE_LIMITS.files, 'expected bounded embedded files');
    const files = new Set();
    let total = 0;
    for (const entry of envelope.files) {
        ensure(object(entry) && name(entry.name) && !files.has(entry.name), 'invalid or duplicate file name');
        ensure(Number.isSafeInteger(entry.bytes) && entry.bytes >= 0
            && typeof entry.sha256 === 'string' && /^[a-f0-9]{64}$/u.test(entry.sha256)
            && typeof entry.base64 === 'string', 'file needs byte count, SHA-256 and base64');
        total += entry.bytes;
        ensure(total <= EVIDENCE_LIMITS.decodedBytes, 'decoded evidence exceeds byte limit');
        // Buffer's permissive decoder alone would silently accept corrupt base64.
        ensure(entry.base64.length === Math.ceil(entry.bytes / 3) * 4, 'base64 length differs from byte count');
        const decoded = Buffer.from(entry.base64, 'base64');
        ensure(decoded.length === entry.bytes && decoded.toString('base64') === entry.base64
            && hash(decoded) === entry.sha256, 'embedded file bytes/hash differ');
        files.add(entry.name);
    }
    ensure(object(envelope.references), 'expected named file references');
    for (const [key, value] of Object.entries(envelope.references))
        ensure(name(key) && names(value) && value.length > 0 && value.every(item => files.has(item)),
            'reference names a missing or duplicate embedded file');
    for (const key of contract?.[phase] ?? [])
        ensure(Object.hasOwn(envelope.references, key), `missing required reference ${key}`);
    return {version: 1, sha256: hash(bytes), bytes: bytes.length, output};
}
