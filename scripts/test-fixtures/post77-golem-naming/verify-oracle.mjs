import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url));
const provenance = JSON.parse(readFileSync(join(dir, 'source-provenance.json')));
for (const [path, expected] of Object.entries(provenance.sha256))
    assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), expected, path);
const source = readFileSync('nethack-c/upstream/src/do_name.c', 'utf8');
const oracle = readFileSync(join(dir, 'oracle.c'), 'utf8');
for (const symbol of provenance.functions) {
    const start = source.indexOf(`\n${symbol}(`) + 1;
    assert.ok(start > 0);
    assert.ok(oracle.includes(source.slice(start, source.indexOf('\n}', start) + 2)), symbol);
}
for (const [file, expected] of [['oracle.c', provenance.oracleSha256], ['adapters.h', provenance.adaptersSha256]])
    assert.equal(createHash('sha256').update(readFileSync(join(dir, file))).digest('hex'), expected);
const temporary = mkdtempSync(join(tmpdir(), 'post77-golem-naming-'));
try {
    const binary = join(temporary, 'oracle');
    execFileSync(process.env.CC ?? 'clang', ['-std=c11', '-O2', join(dir, 'oracle.c'), '-o', binary]);
    const output = execFileSync(binary, [], { encoding: 'utf8' });
    assert.equal(output, readFileSync(join(dir, 'expected.txt'), 'utf8'));
    process.stdout.write(output);
} finally {
    rmSync(temporary, { recursive: true, force: true });
}
