import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { ADMITTED_COMMANDS } from '../js/cmd.js';
import { PICK_ANY } from '../js/const.js';
import { extcmdlist } from '../js/extcmdlist_data.js';
import { game } from '../js/gstate.js';
import { display_pickinv } from '../js/invent.js';
import { runSegment } from '../js/jsmain.js';
import { wiz_identify } from '../js/wizcmds.js';

function loadSession(name) {
    return JSON.parse(readFileSync(
        `recordings/wizcmds.c/${name}.session.json`,
        'utf8',
    ));
}

async function replayAndCompare(name) {
    const recorded = loadSession(name).segments[0];
    // Inspect the live grid at the menu boundary and compare the cursor and
    // random traces.
    const prefix = name === 'wizidentify-debug' ? '.#wizidentify\n' : '.\u0009';
    const preview = await runSegment({ ...recorded, moves: prefix });
    const menuLines = gameGridLines();
    assert.ok(menuLines.includes('                                Debug Identify'));
    assert.ok(menuLines.includes(
        '                                (all items are permanently identified already)',
    ));
    assert.ok(menuLines.includes('                                (end)'));

    const replay = await runSegment(recorded);
    const expected = recorded.steps;
    assert.equal(preview.getCursors().length, expected.length - 1);
    assert.deepEqual(
        replay.getCursors(),
        expected.map((step) => step.cursor),
        `${name}: cursor positions stay aligned with the C recording`,
    );
    // js/rng.js keeps the source-independent draw expression; recorder lines
    // append their C call site after " @", which is metadata rather than
    // behavior and is omitted from the local comparison.
    assert.deepEqual(
        replay.getRngLog(),
        expected.flatMap((step) => step.rng)
            .map((line) => line.split(' @ ')[0]),
        `${name}: wizard identify does not add random calls`,
    );
    assert.ok(
        !replay.getUnported().some((entry) => entry.includes('partial inventory')),
        `${name}: display-only identify does not stop at the old refusal`,
    );
}

function gameGridLines() {
    return game.nhDisplay.grid.map((row) => row.map((cell) => cell.ch).join('').trimEnd());
}

test('wiz_identify is admitted as an extended wizard command', async () => {
    const entry = extcmdlist.find((candidate) => candidate.ef_txt === 'wizidentify');
    assert.ok(entry, 'the source extcmdlist row is present');
    assert.equal(entry.ef_funct, 'wiz_identify');
    assert.ok(ADMITTED_COMMANDS.includes('wizidentify'));
    assert.equal(typeof wiz_identify, 'function');

    // Seed 7704501 independently reaches the zero-unidentified-item menu
    // through the source #wizidentify extended-command path.
    await replayAndCompare('wizidentify-debug');
});

test('wiz_identify is reached through its direct Ctrl-I binding', async () => {
    // Seed 7704502 independently reaches the same source function through
    // its command-table key and dismisses the display-only menu with Escape.
    await replayAndCompare('wizidentify-direct');
});

test('wizard identify selects and fully identifies one incomplete item', async () => {
    const segment = loadSession('wizidentify-debug').segments[0];
    // The independent startup case supplies the real wizard inventory; making
    // one object incomplete reaches the C PICK_ANY branch without inventing a
    // synthetic object shape that naming code could not consume.
    await runSegment({ ...segment, moves: '.' });
    const object = game.invent;
    assert.ok(object);
    object.known = false;
    object.dknown = false;
    object.bknown = false;
    object.rknown = false;

    game.iflags.override_ID = 9; // Ctrl-I, C('I') from wizcmds.c:55.
    let selectedItems;
    const result = await display_pickinv(
        null, null, null, false, false, game,
        {
            menu: async (items, _state, how) => {
                assert.equal(how, PICK_ANY);
                assert.equal(
                    items[0].text,
                    'Debug Identify -- unidentified or partially identified item',
                );
                selectedItems = items;
                return [{ value: object, count: 1 }];
            },
        },
    );
    assert.equal(result, null);
    assert.ok(selectedItems.some((item) => item.value === object));
    assert.equal(object.known, true);
    assert.equal(object.dknown, true);
    assert.equal(object.bknown, true);
    assert.equal(object.rknown, true);
    assert.equal(game.iflags.override_ID, 0);
});
