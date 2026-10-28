// Explicit receipt writer for these two source-only commands. No game imports.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const dir = 'diagnostics/divergence-evidence/character-tables/progression-20261028/';
const pin = JSON.parse(readFileSync(dir + 'inputs.json'));
const hash = p => createHash('sha256').update(readFileSync(p)).digest('hex');
for (const id of ['target', 'controls']) {
    const runner = dir + 'compare.mjs';
    const argv = ['node', runner, id];
    const inputs = [dir + 'inputs.json', ...Object.keys(pin.hashes)];
    const result = spawnSync(argv[0], argv.slice(1), { encoding: 'utf8' });
    if (result.error || result.signal || result.status !== 0) throw new Error(result.stderr || String(result.error));
    const output = dir + id + '-output.json';
    writeFileSync(output, result.stdout);
    writeFileSync(dir + id + '-receipt.json', JSON.stringify({
        schemaVersion: 1, commandId: id, argv, cwd: '.', ...pin.provenance,
        recordedAt: new Date().toISOString(), exitCode: result.status,
        toolVersions: { node: process.version }, runnerSha256: hash(runner),
        inputHashes: Object.fromEntries(inputs.map(p => [p, hash(p)])), outputs: [output],
    }, null, 2) + '\n');
    console.log(`${id}: exit ${result.status}; ${output}`);
}
