import assert from 'node:assert/strict';
import test from 'node:test';

import { NROFARTIFACTS } from '../js/artifacts.js';
import {
    dodiscovered,
    init_objects,
    UnsupportedDiscoveryDisplayError,
} from '../js/o_init.js';
import {
    objects_globals_init,
    POT_WATER,
    POTION_CLASS,
    SCR_MAIL,
    SCROLL_CLASS,
    WEAPON_CLASS,
} from '../js/objects.js';

// dodiscovered() reads the catalog, svd.disco, svb.bases and flags.inv_order,
// and hands its finished lines to an injected window owner. Building the state
// directly keeps each case's discovered set exact; the live command is covered
// by the recorded no-time-command differentials.
function discoveryState({ discosort = 'o', inv_order } = {}) {
    const state = {};
    objects_globals_init(state);
    // Fixed zero choices initialize the catalog and its descriptions without
    // consuming randomness.
    init_objects(state, () => 0);
    state.flags = {
        discosort,
        inv_order: inv_order ?? [WEAPON_CLASS, SCROLL_CLASS, POTION_CLASS],
    };
    state.iflags = { menu_requested: false };
    // artifacts.c artidisco[] holds the discovered artifacts in order and is
    // empty until discover_artifact() writes one, which no ported path does.
    state.artidisco = new Array(NROFARTIFACTS).fill(0);
    return state;
}

// C marks a type discovered by writing its index into svd.disco at the slot
// init_objects() assigned; oc_name_known is what interesting_to_discover()
// then reads.
function discover(state, otyp) {
    state.svd.disco[otyp] = otyp;
    state.objects[otyp].oc_name_known = 1;
}

async function run(state) {
    const messages = [];
    const windows = [];
    const time = await dodiscovered(state, {
        message: (text) => { messages.push(text); },
        textWindow: (lines) => { windows.push(lines); },
    });
    return { messages, time, windows };
}

test('dodiscovered answers a hero who has discovered nothing', async () => {
    // o_init.c counts uniques, artifacts and per-class types into ct, and
    // prints this instead of opening the window when ct is still zero.
    const { messages, time, windows } = await run(discoveryState());

    assert.deepEqual(messages, ["You haven't discovered anything yet..."]);
    assert.deepEqual(windows, []);
    // The command takes no game time in either arm.
    assert.equal(time, false);
});

test('dodiscovered heads the window with the default order', async () => {
    const state = discoveryState();
    discover(state, POT_WATER);
    const { messages, windows } = await run(state);

    assert.deepEqual(messages, []);
    assert.equal(windows.length, 1);
    // disco_orders_descr[] entry for 'o', then C's blank separator line.
    assert.deepEqual(windows[0].slice(0, 2), [
        { text: 'Discoveries, by order of discovery within each class',
            heading: false },
        { text: '', heading: false },
    ]);
});

test('dodiscovered heads each class and marks unencountered types', async () => {
    const state = discoveryState();
    discover(state, POT_WATER);
    discover(state, SCR_MAIL);
    // C writes "* " for a type the hero has not encountered and two spaces
    // for one it has, so flipping this flag moves only the prefix.
    state.objects[SCR_MAIL].oc_encountered = 1;

    const { windows } = await run(state);
    const body = windows[0].slice(2);

    // Classes come out in flags.inv_order, so scrolls precede potions here
    // even though the potion was discovered first.
    assert.deepEqual(body.map((line) => line.heading), [
        true, false, true, false,
    ]);
    assert.deepEqual(body.map((line) => line.text.slice(0, 2)),
        ['Sc', '  ', 'Po', '* ']);
    assert.equal(body[0].text, 'Scrolls');
    assert.equal(body[2].text, 'Potions');
});

test('dodiscovered stops on the three orders it does not sort', async () => {
    // Only 'o' needs no disco_output_sorted(); 's', 'c' and 'a' all buffer
    // their lines for it, and it is not ported.
    //
    // Each case discovers a type first. C does not consult the sort order
    // until it has gathered, so with nothing discovered it reaches its
    // `ct == 0` arm and prints the "nothing yet" answer instead; a fixture
    // that discovers nothing would assert against a state C never sorts.
    for (const discosort of ['s', 'c', 'a']) {
        const sorted = discoveryState({ discosort });
        discover(sorted, POT_WATER);
        await assert.rejects(
            () => run(sorted),
            (error) => error instanceof UnsupportedDiscoveryDisplayError
                && error.branch === 'disco_output_sorted()',
            `discosort ${discosort}`,
        );
    }

    // An unrecognized letter is not a stop: C falls back to 'o'.
    const state = discoveryState({ discosort: 'z' });
    discover(state, POT_WATER);
    await run(state);
    assert.equal(state.flags.discosort, 'o');
});
