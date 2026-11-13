import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';


const TRAP_C = readFileSync('nethack-c/upstream/src/trap.c', 'utf8');
const TRAP_H = readFileSync('nethack-c/upstream/include/trap.h', 'utf8');

test('trap.c dispatches the vibrating square to its hero effect', () => {
    assert.match(TRAP_C,
        /case VIBRATING_SQUARE:\s*return trapeffect_vibrating_square\(mtmp, trap, trflags\);/u);
    assert.match(TRAP_H,
        /undestroyable_trap\(ttyp\)[\s\S]*?\(ttyp\) == VIBRATING_SQUARE/u);
});
