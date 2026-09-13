// Tracked per-session source investigations are shared by the loop and CI.
// Only a change in the session's remaining-screen count makes a result stale.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const text = value => typeof value === 'string' && value.trim().length > 0;
const texts = value => Array.isArray(value) && value.every(text);

function validRecord(record, session) {
    if (!record || record.session !== session
        || !Number.isInteger(record.remainingScreensUpperBound)
        || record.remainingScreensUpperBound < 0
        || !['partial', 'complete'].includes(record.status)
        || !text(record.summary) || !/^[a-f\d]{40}$/u.test(record.commit)
        || record.mismatch?.session !== session
        || record.mismatch.remainingScreensUpperBound !== record.remainingScreensUpperBound
        || !texts(record.evidence) || record.evidence.length === 0) return false;
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
        || !/^(?:holdout\/)?[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(entry.session))
        return { status: 'invalid' };
    const path = `investigations/${entry.session}.json`;
    let record;
    try {
        record = JSON.parse(readFileSync(join(root, path), 'utf8'));
    } catch (error) {
        return { status: error.code === 'ENOENT' ? 'missing' : 'invalid', path };
    }
    if (!validRecord(record, entry.session)) return { status: 'invalid', path };
    if (record.remainingScreensUpperBound !== entry.remainingScreensUpperBound) {
        return { status: 'stale', path,
            previousRemainingScreensUpperBound: record.remainingScreensUpperBound };
    }
    return { status: record.status, path, result: record };
}
