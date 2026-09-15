import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

function fixture(t, output) {
    const root = mkdtempSync(join(tmpdir(), 'smoke-recorder-test-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    copyFileSync(new URL('./smoke-recorder.mjs', import.meta.url), join(root, 'smoke.mjs'));
    const install = join(root, 'install');
    mkdirSync(install);
    writeFileSync(join(install, 'nethack'), 'unused fixture binary');
    writeFileSync(join(install, 'save'), 'existing game');
    // Substitute only the driver, keeping the production smoke command, file
    // copying, subprocess launch, result checks and cleanup in the test.
    writeFileSync(join(root, 'record-session.mjs'), `
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
unlinkSync(join(process.env.NETHACK_INSTALL, 'save'));
writeFileSync(process.argv[3], JSON.stringify(${JSON.stringify(output)}));
`);
    return { install, run: () => spawnSync(process.execPath, [join(root, 'smoke.mjs')], {
        encoding: 'utf8', env: { ...process.env, NETHACK_INSTALL: install,
            NETHACK_BINARY: join(install, 'nethack') },
    }) };
}

test('smoke launches the driver against a private copy and preserves original saves', (t) => {
    // 199 is the existing minimum startup RNG count, not a score target.
    const f = fixture(t, { segments: [{ steps: [{ rng: Array(199).fill('fixture draw'), screen: 'startup' }] }] });
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /199 core RNG calls/);
    assert.equal(readFileSync(join(f.install, 'save'), 'utf8'), 'existing game');
});

test('a configuration screen without initialized RNG is not recorder readiness', (t) => {
    const f = fixture(t, { segments: [{ steps: [{ rng: [], screen: 'configuration error' }] }] });
    const result = f.run();
    assert.equal(result.status, 1); // A visible screen alone cannot pass readiness.
    assert.match(result.stderr, /did not reach fresh-game/);
    assert.equal(readFileSync(join(f.install, 'save'), 'utf8'), 'existing game');
});
