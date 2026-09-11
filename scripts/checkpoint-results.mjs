// Checkpoint evidence belongs to the repository, not to a disposable worktree.
// Resolve lazily so importing this module (including for CLI help) does no I/O.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function checkpointResultsDirectory(root) {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'],
        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    return join(common, 'checkpoint-results');
}

export function readCheckpointResult(root, commit) {
    return JSON.parse(readFileSync(join(checkpointResultsDirectory(root), commit, 'latest.json'), 'utf8'));
}
