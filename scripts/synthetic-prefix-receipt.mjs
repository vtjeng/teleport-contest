// Reuse a completed prefix replay without turning a case-total score into evidence.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { digest, reuseKey } from './checkpoint-reuse.mjs';
import { requireReportOnlyImportTree } from './fetch-hosted-checkpoint.mjs';

function inputKey(root, boundary) {
    try {
        requireReportOnlyImportTree(root);
        const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
        return digest(JSON.stringify({ version: 1, inputs: reuseKey(root, head), boundary }));
    } catch {
        // Dirty execution inputs or unavailable provenance require an ordinary replay.
        return null;
    }
}

export async function verifyWithPrefixReceipt(root, boundary, replay) {
    const key = inputKey(root, boundary);
    const directory = join(root, '.cache', 'synthetic-prefix-receipts');
    const path = key && join(directory, `${key}.json`);
    if (path) {
        try {
            const receipt = JSON.parse(readFileSync(path, 'utf8'));
            if (isDeepStrictEqual(receipt, { version: 1, key, boundary, matched: true })) return;
        } catch { /* Missing or damaged receipts are cache misses. */ }
    }
    await replay();
    if (!key || inputKey(root, boundary) !== key) return;
    try {
        mkdirSync(directory, { recursive: true });
        // Identical keys have identical successful contents. Readers reject partial writes.
        writeFileSync(path, JSON.stringify({ version: 1, key, boundary, matched: true }));
    } catch { /* Cache storage failure does not invalidate a successful replay. */ }
}
