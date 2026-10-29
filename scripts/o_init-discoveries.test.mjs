import assert from 'node:assert/strict';
import test from 'node:test';

import { NROFARTIFACTS } from '../js/artifacts.js';
import {
    discovered_cmp,
    doclassdisco,
    dodiscovered,
    init_objects,
    oclass_to_name,
    sortloot_descr,
} from '../js/o_init.js';
import { ECMD_OK, MENU_TRADITIONAL, TOPLINE_NON_EMPTY } from '../js/const.js';
import {
    objects_globals_init,
    OBJ_NAME,
    POT_HEALING,
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

test('dodiscovered renders sortloot, class-alphabetical, and global-alphabetical orders', async () => {
    const alphabetical = discoveryState({
        discosort: 'a',
        inv_order: [SCROLL_CLASS, POTION_CLASS],
    });
    discover(alphabetical, POT_WATER);
    discover(alphabetical, SCR_MAIL);
    discover(alphabetical, POT_HEALING);
    let { messages, windows } = await run(alphabetical);
    assert.deepEqual(messages, []);
    assert.deepEqual(windows[0].slice(2).map((line) =>
        line.text.replace(/ \([^)]*\)$/u, '')),
    [
        '* potion of healing',
        '* potion of water',
        '* scroll of mail',
    ]);
    assert.ok(windows[0].slice(2).every((line) => !line.heading));

    const byClass = discoveryState({
        discosort: 'c',
        inv_order: [POTION_CLASS],
    });
    discover(byClass, POT_WATER);
    discover(byClass, POT_HEALING);
    ({ messages, windows } = await run(byClass));
    assert.deepEqual(messages, []);
    assert.deepEqual(windows[0].slice(2).map((line) =>
        line.text.replace(/ \([^)]*\)$/u, '')),
    [
        'Potions',
        '* potion of healing',
        '* potion of water',
    ]);

    const sortloot = discoveryState({
        discosort: 's',
        inv_order: [POTION_CLASS],
    });
    discover(sortloot, POT_WATER);
    discover(sortloot, POT_HEALING);
    ({ messages, windows } = await run(sortloot));
    assert.deepEqual(messages, []);
    assert.equal(windows.length, 1);
    assert.equal(windows[0][2].text, 'Potions');
    const lootTypes = [POT_WATER, POT_HEALING].sort((first, second) =>
        discovered_cmp(
            `* ${sortloot_descr(first, sortloot)}potion of ${OBJ_NAME(sortloot.objects[first], sortloot)}`,
            `* ${sortloot_descr(second, sortloot)}potion of ${OBJ_NAME(sortloot.objects[second], sortloot)}`,
        ));
    assert.deepEqual(windows[0].slice(3).map((line) =>
        line.text.replace(/ \([^)]*\)$/u, '')),
        lootTypes.map((otyp) => `* potion of ${OBJ_NAME(sortloot.objects[otyp], sortloot)}`));

    // An unrecognized letter is not a stop: C falls back to 'o'.
    const state = discoveryState({ discosort: 'z' });
    discover(state, POT_WATER);
    await run(state);
    assert.equal(state.flags.discosort, 'o');
});

test('discovered_cmp ignores the two byte encounter prefix', () => {
    // o_init.c compares strcmpi(s1 + 2, s2 + 2), so '*' and the blank do not
    // affect ordering, and comparison is case insensitive.
    assert.equal(discovered_cmp('* Apple', '  banana'), -1);
    assert.equal(discovered_cmp('  Scroll', '* scroll'), 0);
    assert.equal(discovered_cmp('* wand', '  ring'), 1);
});

test('oclass_to_name lowercases let_to_name output', () => {
    // o_init.c copies let_to_name(WEAPON_CLASS, FALSE, FALSE), then lowcases
    // every byte in the copied buffer.
    assert.equal(oclass_to_name(WEAPON_CLASS), 'weapons');
});

test('sortloot_descr formats invent.c loot_classify ordering fields', () => {
    // The C helper supplies a known, dknown dummy potion to loot_classify and
    // formats orderclass/subclass/disco as %02d%02d%1d plus one space.
    const state = {};
    objects_globals_init(state);
    init_objects(state, () => 0);
    state.flags = { inv_order: '$")[%?+!=/(*`0_', sortpack: false };
    state.svc = { context: { current_fruit: 0 } };
    assert.equal(sortloot_descr(POT_WATER, state), '05012 ');
});

test('doclassdisco keeps the artifact dump caller after the skipped void helper', async () => {
    const state = discoveryState();
    discover(state, POT_WATER); // Give the class chooser a discovered class.
    state.flags.menu_style = MENU_TRADITIONAL;
    state.wizard = true;
    const answers = ['a', 'y']; // Select artifacts, then the C wizard dump arm.
    const windows = [];
    const result = await doclassdisco(state, {
        message: async () => {},
        yesNo: async (_prompt, _choices, _default, addcmdq) => {
            // doclassdisco uses yn_function(..., TRUE); y_n also records
            // its answer in the repeat queue through that same TRUE flag.
            assert.equal(addcmdq, true);
            return answers.shift();
        },
        textWindow: async (lines) => windows.push(lines),
    });
    // o_init.c sets ct=NROFARTIFACTS and reaches display_nhwindow even
    // when the unported void dump helper contributes no output.
    assert.equal(result, ECMD_OK);
    assert.deepEqual(windows, [[]]);
});

test('doclassdisco clears the message window on traditional cancellation', async () => {
    const state = discoveryState();
    discover(state, POT_WATER); // Ensure C prompts rather than taking the empty arm.
    state.flags.menu_style = MENU_TRADITIONAL;
    state._pending_message = 'View discoveries for which sort of objects?';
    const cleared = [];
    state.nhDisplay = {
        toplin: TOPLINE_NON_EMPTY,
        clearRow: (row) => cleared.push(row),
        setCursor: () => {},
    };
    assert.equal(await doclassdisco(state, {
        message: async () => {},
        yesNo: async () => '\0', // C's cancelled class choice is the zero byte.
        textWindow: async () => assert.fail('cancelled choice has no text window'),
    }), ECMD_OK);
    assert.deepEqual(cleared, [0]); // WIN_MESSAGE occupies the terminal's top row.
    assert.equal(state._pending_message, '');
});
