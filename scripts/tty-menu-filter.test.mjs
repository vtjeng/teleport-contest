import assert from 'node:assert/strict';
import test from 'node:test';

import { PICK_ANY } from '../js/const.js';
import { game, resetGame } from '../js/gstate.js';
import { GameDisplay } from '../js/game_display.js';
import { parseNethackrc } from '../js/options.js';
import { ROLE_NONE, aligns, races, roles } from '../js/roles.js';
import {
    applyRoleFilterSelection,
    buildRoleFilterMenuSpec,
    gotRoleFilter,
    renderTtyMenu,
    resetRoleFilteringTty,
    selectTtyMenu,
    ttyMenuLayout,
} from '../js/tty_menu.js';

function menuState(keys = '', filter = null) {
    resetGame();
    game.nhDisplay = new GameDisplay(null);
    game.flags = {
        initrole: 1,
        initrace: 2,
        initgend: 1,
        initalign: 0,
    };
    game.iflags = {};
    if (filter) game.roleFilter = structuredClone(filter);
    for (const character of keys)
        game.nhDisplay.pushKey(character.charCodeAt(0));
    return game;
}

function rowText(state, row) {
    return state.nhDisplay.grid[row]
        .map((cell) => cell.ch)
        .join('')
        .trimEnd();
}

test('the 24x80 role filter menu has the source page boundaries', () => {
    const state = menuState();
    const spec = buildRoleFilterMenuSpec(state);
    const first = ttyMenuLayout(state.nhDisplay, spec);

    // tty_end_menu() reserves one of 24 rows for dmore(), leaving 23 menu
    // lines. The source filter's race section ends exactly on page one.
    assert.equal(first.pageSize, 23);
    assert.equal(first.pageCount, 2);
    assert.equal(first.lines.length, 23);
    assert.equal(first.footerRow, 23);
    assert.equal(first.footerText, '(1 of 2)');
    assert.equal(first.fullScreen, true);

    renderTtyMenu(state, spec);
    assert.equal(rowText(state, 0), ' Pick all that apply');
    assert.equal(rowText(state, 2), ' Unacceptable roles');
    assert.equal(rowText(state, 22), ' O - orc');
    assert.equal(rowText(state, 23), ' (1 of 2)');
    assert.equal(state.nhDisplay.grid[0][1].attr, 1);
    assert.deepEqual(
        [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
        [9, 23],
    );

    const second = ttyMenuLayout(state.nhDisplay, spec, 1);
    assert.equal(second.lines.length, 9);
    assert.equal(second.footerRow, 9);
    assert.equal(second.footerText, '(2 of 2)');
    assert.equal(second.lines[1].text, 'Unacceptable genders');
    assert.equal(second.lines[5].text, 'Unacceptable alignments');
});

test('page commands redraw the exact footer and space commits on the last page', async () => {
    const state = menuState('>|^> ');
    const footers = [];
    state._preNhgetchHook = () => footers.push(
        Array.from({ length: state.nhDisplay.rows }, (_, row) => rowText(state, row))
            .find((line) => /\(\d+ of \d+\)$/u.test(line)),
    );

    const selected = await selectTtyMenu(
        state,
        buildRoleFilterMenuSpec(state),
    );
    assert.deepEqual(selected, []);
    assert.deepEqual(footers, [
        ' (1 of 2)',
        ' (2 of 2)',
        ' (2 of 2)',
        ' (1 of 2)',
        ' (2 of 2)',
    ]);
});

test('PICK_ANY tracks global groups and numeric counts', async () => {
    const groupedState = menuState('G\n');
    const groupedItems = Array.from({ length: 30 }, (_, index) => ({
        selector: String.fromCharCode('a'.charCodeAt(0) + (index % 21)),
        groupSelector: [0, 24, 29].includes(index) ? 'G' : '',
        label: `choice ${index}`,
        value: index,
    }));
    const grouped = await selectTtyMenu(groupedState, {
        title: 'Synthetic grouped choices',
        titleAttr: 0,
        how: PICK_ANY,
        items: groupedItems,
    });
    assert.deepEqual(grouped, [
        { value: 0, count: -1 },
        { value: 24, count: -1 },
        { value: 29, count: -1 },
    ]);

    const countedState = menuState('12a\n');
    const counted = await selectTtyMenu(countedState, {
        title: 'Synthetic counted choice',
        titleAttr: 0,
        how: PICK_ANY,
        items: [{ selector: 'a', label: 'apples', value: 'apple' }],
    });
    assert.deepEqual(counted, [{ value: 'apple', count: 12 }]);

    // 12 is an explicit count chosen to prove that select-all skips an
    // already selected entry instead of overwriting its count.
    const selectAllState = menuState('12a.\n');
    const selectAll = await selectTtyMenu(selectAllState, {
        title: 'Synthetic select all',
        titleAttr: 0,
        how: PICK_ANY,
        items: [
            { selector: 'a', label: 'apples', value: 'apple' },
            { selector: 'b', label: 'bananas', value: 'banana' },
        ],
    });
    assert.deepEqual(selectAll, [
        { value: 'apple', count: 12 },
        { value: 'banana', count: -1 },
    ]);

    // set_all_on_page() updates only newly selected entries. An existing
    // preselection therefore keeps its initial '*' while the new item gets
    // set_item_state()'s '+'.
    const markerState = menuState('.\n');
    const markerBoundaries = [];
    markerState._preNhgetchHook = () => markerBoundaries.push([
        rowText(markerState, 2).slice(41),
        rowText(markerState, 3).slice(41),
    ]);
    await selectTtyMenu(markerState, {
        title: 'Synthetic selection markers',
        titleAttr: 0,
        how: PICK_ANY,
        items: [
            {
                selector: 'a', label: 'apples', value: 'apple',
                selected: true,
            },
            { selector: 'b', label: 'bananas', value: 'banana' },
        ],
    });
    assert.deepEqual(markerBoundaries[1], [
        'a * apples',
        'b + bananas',
    ]);
});

test('PICK_ANY bulk commands distinguish all items from the current page', async () => {
    const baseItems = () => Array.from({ length: 30 }, (_, index) => ({
        selector: String.fromCharCode(65 + (index % 26)),
        label: `choice ${index}`,
        value: index,
        selected: index === 0 || index === 5,
        count: index === 0 ? 12 : index === 5 ? 7 : -1,
        bulkSelectable: index !== 5,
    }));
    const expectedValues = {
        ',': [0, ...Array.from({ length: 20 }, (_, i) => i + 1)],
        '>,': [0, 5, ...Array.from({ length: 9 }, (_, i) => i + 21)],
        '\\': [5],
        '>\\': [0, 5],
        '~': [1, 2, 3, 4, ...Array.from({ length: 16 }, (_, i) => i + 5)],
        '>~': [0, 5, ...Array.from({ length: 9 }, (_, i) => i + 21)],
        '.': Array.from({ length: 30 }, (_, index) => index),
        '-': [5],
        '@': Array.from({ length: 29 }, (_, i) => i + 1),
    };

    for (const [commands, expected] of Object.entries(expectedValues)) {
        const state = menuState(`${commands}\n`);
        const selected = await selectTtyMenu(state, {
            title: 'Synthetic bulk commands',
            titleAttr: 0,
            how: PICK_ANY,
            items: baseItems(),
        });
        assert.deepEqual(
            selected.map(({ value }) => value),
            expected,
            commands,
        );
        const retained = new Map(
            selected.map(({ value, count }) => [value, count]),
        );
        if (retained.has(0)) assert.equal(retained.get(0), 12, commands);
        assert.equal(retained.get(5), 7, commands);
    }
});

test('gold remains a group accelerator when its selector is off-page', async () => {
    const state = menuState('>$\n');
    const items = Array.from({ length: 30 }, (_, index) => ({
        selector: index === 0 ? '$' : String.fromCharCode(65 + (index % 26)),
        groupSelector: index === 0 || index === 29 ? '$' : '',
        label: `choice ${index}`,
        value: index,
    }));

    assert.deepEqual(await selectTtyMenu(state, {
        title: 'Synthetic gold group',
        titleAttr: 0,
        how: PICK_ANY,
        items,
    }), [
        { value: 0, count: -1 },
        { value: 29, count: -1 },
    ]);
});

test('gotRoleFilter and menu construction do not install filter aliases', () => {
    const state = menuState();
    delete state.roleFilter;
    state.rfilter = {
        roles: roles.map((_, index) => index === 3),
        mask: 0,
    };
    const before = state.rfilter;

    assert.equal(gotRoleFilter(state), true);
    buildRoleFilterMenuSpec(state);
    assert.equal(Object.hasOwn(state, 'roleFilter'), false);
    assert.equal(state.rfilter, before);
});

test('an invalid PICK_ANY key preserves a pending count', async () => {
    // 12 proves that x is rejected within xwaitforspace(). Escape clears
    // that count, then a selects the item without a numeric quantity.
    const state = menuState('12x\x1ba\n');
    assert.deepEqual(await selectTtyMenu(state, {
        title: 'Synthetic invalid key while counting',
        titleAttr: 0,
        how: PICK_ANY,
        items: [{ selector: 'a', label: 'apples', value: 'apple' }],
    }), [{ value: 'apple', count: -1 }]);
});

test('uppercase selectors commit role, race, and alignment filters', async () => {
    const state = menuState('rRH>L\n');
    const changed = await resetRoleFilteringTty(state);

    assert.equal(changed, true);
    const ranger = roles.findIndex((role) => role.name.m === 'Ranger');
    const rogue = roles.findIndex((role) => role.name.m === 'Rogue');
    assert.equal(state.roleFilter.roles[ranger], true);
    assert.equal(state.roleFilter.roles[rogue], true);
    assert.ok(state.roleFilter.mask & races[0].selfmask);
    assert.ok(state.roleFilter.mask & aligns[0].allow);
    assert.equal(state.rfilter, state.roleFilter);
    assert.deepEqual(
        [
            state.flags.initrole,
            state.flags.initrace,
            state.flags.initgend,
            state.flags.initalign,
        ],
        [ROLE_NONE, ROLE_NONE, ROLE_NONE, ROLE_NONE],
    );
});

test('an empty commit clears filters while cancel preserves them', async () => {
    const original = {
        roles: roles.map((_, index) => index === 4),
        mask: races[4].selfmask,
    };
    const cleared = menuState('-\n', original);
    assert.equal(await resetRoleFilteringTty(cleared), false);
    assert.equal(cleared.roleFilter.mask, 0);
    assert.ok(cleared.roleFilter.roles.every((filtered) => !filtered));
    assert.deepEqual(
        [
            cleared.flags.initrole,
            cleared.flags.initrace,
            cleared.flags.initgend,
            cleared.flags.initalign,
        ],
        [ROLE_NONE, ROLE_NONE, ROLE_NONE, ROLE_NONE],
    );

    const cancelled = menuState('\x1b', original);
    const flagsBefore = { ...cancelled.flags };
    assert.equal(await resetRoleFilteringTty(cancelled), false);
    assert.deepEqual(cancelled.roleFilter, original);
    assert.deepEqual(cancelled.flags, flagsBefore);
});

test('applying a cancelled versus empty result is unambiguous', () => {
    const state = menuState('', {
        roles: roles.map((_, index) => index === 0),
        mask: 0,
    });
    const flagsBefore = { ...state.flags };
    assert.equal(applyRoleFilterSelection(state, null), false);
    assert.equal(state.roleFilter.roles[0], true);
    assert.deepEqual(state.flags, flagsBefore);

    assert.equal(applyRoleFilterSelection(state, []), false);
    assert.ok(state.roleFilter.roles.every((filtered) => !filtered));
    assert.equal(state.flags.initrole, ROLE_NONE);
});

test('NUL follows tty_nhgetch and cancels PICK_ANY like Escape', async () => {
    const original = {
        roles: roles.map((_, index) => index === 0),
        mask: races[1].selfmask,
    };
    const state = menuState('\0', original);
    const flagsBefore = { ...state.flags };

    assert.equal(await resetRoleFilteringTty(state), false);
    assert.deepEqual(state.roleFilter, original);
    assert.deepEqual(state.flags, flagsBefore);
});

test('MENU_SEARCH prompts on the top line and matches across pages', async () => {
    const state = menuState(':F?MALE\n>\n');
    const boundaries = [];
    state._preNhgetchHook = () => boundaries.push({
        top: rowText(state, 0),
        cursor: [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
        secondPageFemale: rowText(state, 3),
    });

    const selected = await selectTtyMenu(
        state,
        buildRoleFilterMenuSpec(state),
    );

    assert.deepEqual(selected, [{ value: 'female', count: -1 }]);
    // Boundary 1 follows ':'. The six later query boundaries show the
    // case-insensitive wildcard text growing one character at a time.
    assert.deepEqual(boundaries[1], {
        top: 'Search for:',
        cursor: [12, 0],
        secondPageFemale: ' a - an Archeologist',
    });
    assert.equal(boundaries[7].top, 'Search for: F?MALE');
    assert.deepEqual(boundaries[7].cursor, [18, 0]);
    // After the query commits, tty_getlin() leaves row zero cleared. The
    // off-page match becomes visible only after '>' displays page two.
    assert.equal(boundaries[8].top, '');
    assert.equal(boundaries[9].secondPageFemale, ' F * female');
});

test('MENU_SEARCH honors erase, kill, and Escape editing', async () => {
    const erased = menuState(':orcx\x7f\n\n');
    assert.deepEqual(await selectTtyMenu(erased, buildRoleFilterMenuSpec(erased)), [
        { value: 'orc', count: -1 },
    ]);

    const killed = menuState(':orc\x15human\n\n');
    assert.deepEqual(await selectTtyMenu(killed, buildRoleFilterMenuSpec(killed)), [
        { value: 'human', count: -1 },
    ]);

    const restarted = menuState(':orc\x1bhuman\n\n');
    const prompts = [];
    restarted._preNhgetchHook = () => prompts.push(rowText(restarted, 0));
    assert.deepEqual(
        await selectTtyMenu(restarted, buildRoleFilterMenuSpec(restarted)),
        [{ value: 'human', count: -1 }],
    );
    assert.equal(prompts[5], 'Search for:');

    const nulRestarted = menuState(':orc\0human\n\n');
    assert.deepEqual(
        await selectTtyMenu(
            nulRestarted,
            buildRoleFilterMenuSpec(nulRestarted),
        ),
        [{ value: 'human', count: -1 }],
    );

    const cancelled = menuState(':\x1b\n');
    assert.deepEqual(
        await selectTtyMenu(cancelled, buildRoleFilterMenuSpec(cancelled)),
        [],
    );
});

test('MENU_SEARCH applies a pending count and matches the stored dash marker', async () => {
    // 12 is a multi-digit count chosen to verify that search consumes the
    // same pending count as an explicit selector.
    const counted = menuState('12:orc\n\n');
    assert.deepEqual(
        await selectTtyMenu(counted, buildRoleFilterMenuSpec(counted)),
        [{ value: 'orc', count: 12 }],
    );

    const selected = menuState(':- apple\n\n');
    assert.deepEqual(await selectTtyMenu(selected, {
        title: 'Synthetic preselection',
        how: PICK_ANY,
        items: [{
            selector: 'a',
            label: 'apple',
            value: 'apple',
            selected: true,
        }],
    }), []);
});

test('mapped PICK_ANY commands beat groups but not explicit selectors', async () => {
    const mappedGroup = menuState('#\n');
    mappedGroup.iflags = parseNethackrc(
        'OPTIONS=menu_select_all:#',
    ).iflags;
    const items = [
        {
            selector: 'a', groupSelector: '#', label: 'alpha', value: 'a',
        },
        { selector: 'b', label: 'beta', value: 'b' },
    ];
    assert.deepEqual(await selectTtyMenu(mappedGroup, {
        title: 'Synthetic mapped group collision',
        titleAttr: 0,
        how: PICK_ANY,
        items,
    }), [
        { value: 'a', count: -1 },
        { value: 'b', count: -1 },
    ]);

    const explicit = menuState('#\n');
    explicit.iflags = parseNethackrc(
        'OPTIONS=menu_select_all:#',
    ).iflags;
    assert.deepEqual(await selectTtyMenu(explicit, {
        title: 'Synthetic mapped selector collision',
        titleAttr: 0,
        how: PICK_ANY,
        items: [
            { selector: '#', label: 'literal hash', value: 'hash' },
            { selector: 'b', label: 'beta', value: 'b' },
        ],
    }), [{ value: 'hash', count: -1 }]);
});

test('the first duplicate incoming-key mapping wins during menu dispatch', async () => {
    const state = menuState('#z');
    state.iflags = parseNethackrc(
        'OPTIONS=menu_search:#,menu_next_page:#',
    ).iflags;
    const items = Array.from({ length: 22 }, (_, index) => ({
        selector: index === 21 ? 'z' : 'a',
        label: `choice ${index}`,
        value: index,
    }));

    // Right-to-left option parsing appends MENU_NEXT_PAGE first. If the
    // later duplicate won, '#' would prompt for a search string instead.
    assert.equal(await selectTtyMenu(state, {
        title: 'Synthetic duplicate aliases',
        titleAttr: 0,
        items,
    }), 21);
});
