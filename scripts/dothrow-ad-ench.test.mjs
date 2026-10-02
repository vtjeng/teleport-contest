import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const DOTHROW_C = readFileSync(
    new URL('../nethack-c/upstream/src/dothrow.c', import.meta.url), 'utf8',
);
const DOTHROW_JS = readFileSync(new URL('../js/dothrow.js', import.meta.url), 'utf8');

test('throwit awaits the source passive-object effect after hit and mulch checks', () => {
    // C dothrow.c:2226 discards passive_obj's void result only after the hit
    // survived throw settlement and mulch handling; JS must finish its effects.
    const cHit = DOTHROW_C.indexOf('passive_obj(mon, obj, (struct attack *) 0)');
    const jsHit = DOTHROW_JS.indexOf('await passive_obj(mon, obj, null, state, operationEnv)');
    assert.ok(cHit >= 0);
    assert.ok(jsHit >= 0);
    assert.ok(DOTHROW_C.lastIndexOf('should_mulch_missile(obj)', cHit) < cHit);
    assert.ok(DOTHROW_JS.lastIndexOf('should_mulch_missile(obj, state, operationEnv)', jsHit) < jsHit);
    assert.ok(DOTHROW_JS.lastIndexOf('await hmon(', jsHit) < jsHit);
});
