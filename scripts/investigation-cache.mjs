// Tracked per-session source investigations are shared by the loop and CI.
// Fixed entries stale on upper-bound changes; synthetic entries also carry
// their immutable manifest/recording identity so a replacement case cannot
// reuse an old source diagnosis.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const text = value => typeof value === 'string' && value.trim().length > 0;
const texts = value => Array.isArray(value) && value.every(text);
const SHA256 = /^[a-f\d]{64}$/u;
const SHA = /^[a-f\d]{40}$/u;
const EVALUATION_PATH = /^challenges\/evaluations\/[a-z0-9][a-z0-9.-]*\.json$/u;
const SYNTHETIC_SESSION = /^synthetic\/(v[1-9][0-9]*)\/([a-z0-9][a-z0-9-]*)$/u;

export function syntheticSessionParts(session) {
    const match = SYNTHETIC_SESSION.exec(session ?? '');
    return match ? { batch: match[1], caseId: match[2] } : null;
}

function sameSyntheticIdentity(record, entry) {
    const parts = syntheticSessionParts(entry.session);
    if (!parts) return true;
    return record.corpus === 'synthetic'
        && record.batch === parts.batch
        && record.caseId === parts.caseId
        && text(record.manifestPath)
        && SHA256.test(record.manifestSha256 ?? '')
        && SHA256.test(record.recordingSha256 ?? '')
        && EVALUATION_PATH.test(record.evaluationPath ?? '')
        && SHA.test(record.evaluationCommit ?? '')
        && (!entry.manifestPath || record.manifestPath === entry.manifestPath)
        && (!entry.manifestSha256 || record.manifestSha256 === entry.manifestSha256)
        && (!entry.recordingSha256 || record.recordingSha256 === entry.recordingSha256);
}

function syntheticRecordShape(record, session) {
    const parts = syntheticSessionParts(session);
    return Boolean(parts && record && record.session === session
        && record.corpus === 'synthetic' && record.batch === parts.batch
        && record.caseId === parts.caseId
        && Number.isInteger(record.remainingScreens) && record.remainingScreens >= 0
        && Number.isInteger(record.recordedSteps) && record.recordedSteps >= 0
        && ['partial', 'complete'].includes(record.status) && text(record.summary)
        && SHA.test(record.commit)
        && record.mismatch?.session === session
        && record.mismatch.remainingScreens === record.remainingScreens
        && texts(record.evidence) && record.evidence.length > 0
        && text(record.manifestPath) && SHA256.test(record.manifestSha256 ?? '')
        && SHA256.test(record.recordingSha256 ?? '')
        && EVALUATION_PATH.test(record.evaluationPath ?? '')
        && SHA.test(record.evaluationCommit ?? ''));
}

export function validInvestigation(record, session, entry = { session }) {
    const synthetic = Boolean(syntheticSessionParts(session));
    if (!record || record.session !== session
        || (synthetic
            ? (!Number.isInteger(record.remainingScreens) || record.remainingScreens < 0
                || !Number.isInteger(record.recordedSteps) || record.recordedSteps < 0)
            : (!Number.isInteger(record.remainingScreensUpperBound)
                || record.remainingScreensUpperBound < 0))
        || !['partial', 'complete'].includes(record.status)
        || !text(record.summary) || !/^[a-f\d]{40}$/u.test(record.commit)
        || record.mismatch?.session !== session
        || (synthetic
            ? record.mismatch.remainingScreens !== record.remainingScreens
            : record.mismatch.remainingScreensUpperBound !== record.remainingScreensUpperBound)
        || !texts(record.evidence) || record.evidence.length === 0) return false;
    if (synthetic && !sameSyntheticIdentity(record, entry)) return false;
    if (record.source != null && (!text(record.source.file) || !texts(record.source.functions)))
        return false;
    if (record.status === 'partial') return true;
    const source = record.source;
    return ['file-port', 'lua-port', 'divergence-fix'].includes(record.goalKind)
        && source && text(source.file) && /\.(c|lua)$/u.test(source.file)
        && texts(source.functions) && source.functions.length > 0
        && text(source.branch) && texts(source.callers) && source.callers.length > 0
        && texts(source.dependencies);
}

export function readInvestigation(root, entry) {
    // Saved scans also reach this reader. Accept only canonical workload IDs,
    // preserving the holdout prefix without allowing paths outside the cache.
    if (!text(entry.session)
        || (!/^(?:holdout\/)?[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(entry.session)
            && !SYNTHETIC_SESSION.test(entry.session)))
        return { status: 'invalid' };
    const path = `investigations/${entry.session}.json`;
    let record;
    try {
        record = JSON.parse(readFileSync(join(root, path), 'utf8'));
    } catch (error) {
        return { status: error.code === 'ENOENT' ? 'missing' : 'invalid', path };
    }
    if (!validInvestigation(record, entry.session, entry)) {
        const synthetic = Boolean(syntheticSessionParts(entry.session));
        const identityFields = syntheticRecordShape(record, entry.session);
        if (identityFields) return { status: 'stale', path, reason: 'synthetic provenance changed' };
        return { status: 'invalid', path };
    }
    if (syntheticSessionParts(entry.session)) {
        if (record.remainingScreens !== entry.remainingScreens) {
            return { status: 'stale', path,
                previousRemainingScreens: record.remainingScreens };
        }
    } else if (record.remainingScreensUpperBound !== entry.remainingScreensUpperBound) {
        return { status: 'stale', path,
            previousRemainingScreensUpperBound: record.remainingScreensUpperBound };
    }
    return { status: record.status, path, result: record };
}
