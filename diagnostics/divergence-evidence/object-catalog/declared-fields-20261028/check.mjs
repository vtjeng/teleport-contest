// Manual source-table evidence runner; no game imports or runtime probes.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const mode = process.argv.slice(2);
if (mode.length !== 1 || !['target', 'control'].includes(mode[0])) {
    throw new Error('usage: node check.mjs target|control');
}
execFileSync('python3', [fileURLToPath(new URL('./audit.py', import.meta.url)),
    ...(mode[0] === 'control' ? ['--control'] : [])], { stdio: 'inherit' });
