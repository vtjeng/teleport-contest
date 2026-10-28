// Fixed two-lead ranking comparison; no discovery scan or gameplay execution.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import * as after from '../../../scripts/delegation-ranking.mjs';
const sourceBase = '32578f23091dad34635a9b4fe0bfb45ed9840e39';
const toolBase = 'd1d8ac170b75dca71abe29819b5daa9972301221';
const digest = text => createHash('sha256').update(text).digest('hex');
const blob = (sha, path) => execFileSync('git', ['show', `${sha}:${path}`], { encoding: 'utf8' });
const original = blob(toolBase, 'scripts/delegation-ranking.mjs');
const espree = pathToFileURL(createRequire(import.meta.url).resolve('espree')).href;
const before = await import('data:text/javascript;base64,' + Buffer.from(original.replace("'espree'", JSON.stringify(espree))).toString('base64'));
const inputs = [
    ['source-audit:edge-c-only:src/rect.c:rnd_rect:rn2', 'js/rect.js', 'rnd_rect'],
    ['source-audit:edge-c-only:src/sp_lev.c:check_room:rn2', 'js/mklev.js', 'check_room'],
];
const rows = inputs.map(([key, path, owner]) => {
    const source = blob(sourceBase, path);
    const hint = tool => tool.delegationRankingHint('edge-c-only', 'rn2', tool.defaultImportDelegations(source, owner));
    return { key, path, sourceSha256: digest(source), before: hint(before), after: hint(after) };
});
console.log(JSON.stringify({ sourceBase, toolBase, beforeToolSha256: digest(original),
    afterToolSha256: digest(readFileSync(new URL('../../../scripts/delegation-ranking.mjs', import.meta.url))),
    candidates: rows.length, filtered: 0,
    beforeDeprioritized: rows.filter(r => r.before).length,
    afterDeprioritized: rows.filter(r => r.after).length, rows }, null, 2));
