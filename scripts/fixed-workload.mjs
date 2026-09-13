// The operational fixed workload: the historical public recordings plus the
// now-open local-holdout recordings. Their directories remain separate so
// provenance and historical score rows stay readable.

import { join } from 'node:path';

import { PROJECT_ROOT, listSessionFiles } from './scoring-workspace.mjs';

export const EXPECTED_PUBLIC_DEVELOPMENT_COUNT = 33;
export const EXPECTED_LOCAL_HOLDOUT_COUNT = 11;
export const EXPECTED_FIXED_WORKLOAD_COUNT =
    EXPECTED_PUBLIC_DEVELOPMENT_COUNT + EXPECTED_LOCAL_HOLDOUT_COUNT;

export function fixedWorkload(root = PROJECT_ROOT) {
    const publicFiles = listSessionFiles(join(root, 'sessions'));
    if (publicFiles.length !== EXPECTED_PUBLIC_DEVELOPMENT_COUNT)
        throw new Error('development count changed');

    const holdoutFiles = listSessionFiles(join(root, 'sessions', 'holdout'));
    if (holdoutFiles.length !== EXPECTED_LOCAL_HOLDOUT_COUNT)
        throw new Error('local holdout count changed');

    const scanFiles = [
        ...publicFiles,
        ...holdoutFiles.map(file => `holdout/${file}`),
    ];
    // The scorer reports basenames. Prefixing the holdout targets prevents a
    // same-named file in the two physical corpora from colliding in its bundle.
    const scoringEntries = [
        ...publicFiles.map(file => ({ source: file, target: file })),
        ...holdoutFiles.map(file => ({
            source: `holdout/${file}`,
            target: `holdout--${file}`,
        })),
    ].sort((left, right) => left.target.localeCompare(right.target));
    return { publicFiles, holdoutFiles, scanFiles, scoringEntries };
}
