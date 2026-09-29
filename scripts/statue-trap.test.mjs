// Source-pinned coverage for trap.c:trapeffect_statue_trap().
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { STATUE_TRAP } from '../js/const.js';
import { preflight_dotrap } from '../js/trap_effects.js';

const cSource = readFileSync(
    new URL('../nethack-c/upstream/src/trap.c', import.meta.url), 'utf8',
);

test('C activates a statue trap only for the hero and discards its result', () => {
    const match = cSource.match(
        /staticfn int\ntrapeffect_statue_trap\([\s\S]*?\n\}\n/u,
    );
    assert.ok(match, 'trap.c defines trapeffect_statue_trap');
    assert.match(match[0], /if \(mtmp == &gy\.youmonst\)/u);
    assert.match(
        match[0],
        /\(void\) activate_statue_trap\(trap, u\.ux, u\.uy, FALSE\);/u,
    );
    assert.match(match[0], /return Trap_Effect_Finished;/u);
    assert.match(match[0], /monsters don't trigger statue traps/u);
});

test('hero preflight admits the unseen statue trap effect', () => {
    const state = { u: { usteed: null } };
    const trap = { ttyp: STATUE_TRAP, tseen: false };
    assert.doesNotThrow(() => preflight_dotrap(trap, state));
});

test('seen statue traps reach the generic C escape check in dotrap', () => {
    const state = { u: { usteed: null } };
    const trap = { ttyp: STATUE_TRAP, tseen: true };
    assert.doesNotThrow(() => preflight_dotrap(trap, state));
});
