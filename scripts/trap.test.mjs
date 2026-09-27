import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const C_TRAP = readFileSync(
    new URL('../nethack-c/upstream/src/trap.c', import.meta.url), 'utf8',
);
const C_PICKUP = readFileSync(
    new URL('../nethack-c/upstream/src/pickup.c', import.meta.url), 'utf8',
);
const JS_TRAP = readFileSync(new URL('../js/trap.js', import.meta.url), 'utf8');
const JS_PICKUP = readFileSync(
    new URL('../js/pickup.js', import.meta.url), 'utf8',
);

function cFunction(source, declaration, endMarker) {
    const start = source.indexOf(declaration);
    assert.notEqual(start, -1, `missing C declaration: ${declaration}`);
    const end = source.indexOf(endMarker, start);
    assert.notEqual(end, -1, `missing C function boundary: ${endMarker}`);
    return source.slice(start, end);
}

test('chest_trap flushes its trigger message before the Luck roll', () => {
    const cChestTrap = cFunction(
        C_TRAP,
        'chest_trap(\n    struct obj *obj,',
        '\nstruct trap *\nt_at(',
    );
    const jsStart = JS_TRAP.indexOf('export async function chest_trap(');
    assert.notEqual(jsStart, -1);
    const jsChestTrap = JS_TRAP.slice(jsStart);

    const cMessage = cChestTrap.indexOf(
        'You(disarm ? "set it off!" : "trigger a trap!");',
    );
    const cFlush = cChestTrap.indexOf(
        'display_nhwindow(WIN_MESSAGE, FALSE);', cMessage,
    );
    const cLuck = cChestTrap.indexOf(
        'if (Luck > -13 && rn2(13 + Luck) > 7)', cMessage,
    );
    assert.ok(cMessage >= 0 && cMessage < cFlush && cFlush < cLuck);

    const jsMessage = jsChestTrap.indexOf('await ttyPline(');
    const jsFlush = jsChestTrap.indexOf(
        'await displayPendingTtyMessageWindow(state);', jsMessage,
    );
    const jsLuck = jsChestTrap.indexOf(
        'if (Luck > -13 && rn2(13 + Luck) > 7)', jsMessage,
    );
    assert.ok(jsMessage >= 0 && jsMessage < jsFlush && jsFlush < jsLuck);
});

test('loot, disarm, and tip preserve their discarded-result chest_trap calls', () => {
    assert.match(C_PICKUP, /\(void\) chest_trap\(obj, HAND, FALSE\);/u);
    assert.match(C_TRAP, /\(void\) chest_trap\(box, FINGER, TRUE\);/u);
    assert.match(C_PICKUP, /\(void\) chest_trap\(box, HAND, FALSE\);/u);

    assert.match(JS_PICKUP, /await chest_trap\(obj, HAND, false, state\);/u);
    assert.match(JS_TRAP, /await chest_trap\(box, FINGER, true, state\);/u);
    assert.match(JS_PICKUP, /await chest_trap\(box, HAND, false, state\);/u);
});
