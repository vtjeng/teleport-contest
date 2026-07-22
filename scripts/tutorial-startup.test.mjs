import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { ENGRAVE, SLP_GAS_TRAP, SQKY_BOARD } from '../js/const.js';
import { game, resetGame } from '../js/gstate.js';
import { GameDisplay } from '../js/game_display.js';
import { PM_HEALER, PM_KNIGHT, PM_MONK } from '../js/monsters.js';
import {
    LARGE_BOX,
    LEATHER_ARMOR,
    LEATHER_GLOVES,
    WAN_SECRET_DOOR_DETECTION,
} from '../js/objects.js';
import {
    ask_do_tutorial,
    buildTutorialMenuSpec,
    maybe_do_tutorial,
} from '../js/tutorial_startup.js';
import {
    _tutorialLevelInternals,
    loadTutorialLevel,
    TUTORIAL_MAP,
} from '../js/tutorial_level.js';

function tutorialState(keys = '', overrides = {}) {
    resetGame();
    game.nhDisplay = new GameDisplay(null);
    game.flags = { tutorial: true };
    game.iflags = {
        menu_overlay: true,
        menu_headings: { attr: 1, color: 8 },
    };
    game.program_state = {};
    game.specialLevels = [{
        proto: 'tut-1',
        dlevel: { dnum: 8, dlevel: 1 },
    }];
    Object.assign(game, overrides);
    for (const ch of keys) game.nhDisplay.pushKey(ch.charCodeAt(0));
    return game;
}

function rowText(state, row) {
    return state.nhDisplay.grid[row]
        .map((cell) => cell.ch).join('').trimEnd();
}

function descriptorValue(value) {
    if (typeof value === 'function') return '<function>';
    if (Array.isArray(value)) return value.map(descriptorValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(
        ([key, child]) => [key, descriptorValue(child)],
    ));
}

function recordTutorialDescriptor({
    role = PM_HEALER,
    energy = 10,
    eckeys = {},
    percent = [49, 50, 0, 99, 49, 50, 1],
} = {}) {
    const log = [];
    const percentageResults = [...percent];
    const record = (name, ...args) => {
        log.push([name, ...args.map(descriptorValue)]);
    };
    const des = {
        random: {
            rn2(bound) {
                assert.equal(bound, 100);
                const result = percentageResults.shift();
                assert.ok(Number.isInteger(result));
                assert.ok(result >= 0 && result < bound);
                record('random.rn2', bound, result);
                return result;
            },
            rn1(bound, base) {
                const result = base + bound - 1;
                record('random.rn1', bound, base, result);
                return result;
            },
        },
        eckey(command) {
            record('eckey', command);
            return eckeys[command] ?? `@${command}`;
        },
        level_init(specification) { record('level_init', specification); },
        level_flags(...flags) { record('level_flags', ...flags); },
        map(rows) { record('map', rows); },
        region(specification) { record('region', specification); },
        non_diggable() { record('non_diggable'); },
        teleport_region(specification) {
            record('teleport_region', specification);
        },
        parse_config(name, enabled) { record('parse_config', name, enabled); },
        engraving(specification) { record('engraving', specification); },
        door(specification) { record('door', specification); },
        trap(specification) { record('trap', specification); },
        object(specification) {
            const { contents, ...fields } = specification;
            record('object', { ...fields, contents: Boolean(contents) });
            if (contents) {
                record('contents.begin');
                contents();
                record('contents.end');
            }
        },
        monster(specification) { record('monster', specification); },
        stair(specification) { record('stair', specification); },
        shuffle(values) {
            record('shuffle', values);
            values.reverse();
            return values;
        },
    };
    loadTutorialLevel(des, {
        urole: { mnum: role },
        u: { uenmax: energy },
    });
    assert.deepEqual(percentageResults, []);
    return log;
}

function descriptorDigest(log) {
    return createHash('sha256').update(JSON.stringify(log)).digest('hex');
}

test('unset tutorial asks for an explicit yes or no choice', async () => {
    const state = tutorialState('y');
    const boundaries = [];
    state._preNhgetchHook = () => boundaries.push({
        rows: Array.from({ length: 8 }, (_, row) => rowText(state, row)),
        cursor: [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
    });

    assert.equal(await ask_do_tutorial(state), true);
    assert.deepEqual(boundaries, [{
        rows: [
            '                     Do you want a tutorial?',
            '',
            '                     y - Yes, do a tutorial',
            '                     n - No, just start play',
            '',
            '                     Put "OPTIONS=!tutorial" in .nethackrc to skip this query.',
            '                     (end)',
            '',
        ],
        cursor: [27, 6],
    }]);

    assert.equal(await ask_do_tutorial(tutorialState('n')), false);
});

test('pending welcome uses tty More before the tutorial menu', async () => {
    // The 75-column welcome leaves too little room for the eight-column
    // More prompt, so topl.c places the prompt at the start of row two.
    const welcome = 'Hello TutorialNo, welcome to NetHack!  You are a neutral male human Healer.';
    const state = tutorialState('x n', { _pending_message: welcome });
    state.nhDisplay.setCell(0, 1, 'Z', 3, 0);
    const boundaries = [];
    state._preNhgetchHook = () => boundaries.push({
        rows: Array.from({ length: 8 }, (_, row) => rowText(state, row)),
        cursor: [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
    });

    assert.equal(await ask_do_tutorial(state), false);
    assert.equal(boundaries.length, 3);
    assert.equal(boundaries[0].rows[0], welcome);
    assert.equal(boundaries[0].rows[1], '--More--');
    assert.deepEqual(boundaries[0].cursor, [8, 1]);
    assert.deepEqual(boundaries[1], boundaries[0]);
    assert.match(boundaries[2].rows[0], /Do you want a tutorial\?/u);
    assert.equal(boundaries[2].rows[1], 'Z');
    assert.equal(state._pending_message, '');
});

test('Space and Return rebuild the tutorial menu with a diagnostic', async () => {
    for (const repromptKey of [' ', '\n']) {
        const state = tutorialState(`${repromptKey}n`);
        const boundaries = [];
        state._preNhgetchHook = () => boundaries.push({
            rows: Array.from({ length: 8 }, (_, row) => rowText(state, row)),
            cursor: [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
        });

        assert.equal(await ask_do_tutorial(state), false);
        assert.equal(boundaries.length, 2);
        assert.equal(boundaries[0].rows[6].trimStart(), '(end)');
        assert.equal(
            boundaries[1].rows[6].trimStart(),
            "(Please choose 'y' or 'n'.)",
        );
        assert.equal(boundaries[1].rows[7].trimStart(), '(end)');
        assert.deepEqual(boundaries[1].cursor, [27, 7]);
    }
});

test('Escape declines the tutorial without a reprompt', async () => {
    const state = tutorialState('\x1b');
    let boundaries = 0;
    state._preNhgetchHook = () => ++boundaries;

    assert.equal(await ask_do_tutorial(state), false);
    assert.equal(boundaries, 1);
});

test('configured tutorial true and false suppress the query', async () => {
    for (const enabled of [true, false]) {
        const state = tutorialState('', {
            tutorial_set_in_config: true,
            flags: { tutorial: enabled },
        });
        state._preNhgetchHook = () => {
            throw new Error('configured tutorial must not read input');
        };
        assert.equal(await ask_do_tutorial(state), enabled);
    }
});

test('maybe_do_tutorial exposes the transition target without mutating state', async () => {
    const state = tutorialState('', {
        tutorial_set_in_config: true,
        flags: { tutorial: true },
    });
    const before = structuredClone({ u: state.u, iflags: state.iflags });

    assert.deepEqual(await maybe_do_tutorial(state), {
        action: 'enter',
        level: { dnum: 8, dlevel: 1 },
        proto: 'tut-1',
    });
    assert.deepEqual({ u: state.u, iflags: state.iflags }, before);

    state.flags.tutorial = false;
    assert.deepEqual(await maybe_do_tutorial(state), {
        action: 'skip',
        reason: 'declined',
    });

    state.specialLevels = [];
    state.flags.tutorial = true;
    assert.deepEqual(await maybe_do_tutorial(state), {
        action: 'skip',
        reason: 'level-unavailable',
    });
});

test('tutorial menu uses the source config-file fallback text', () => {
    const state = tutorialState();
    state.configFileName = '/dev/null';
    const spec = buildTutorialMenuSpec(state);
    assert.equal(
        spec.items.at(-1).text,
        'Put "OPTIONS=!tutorial" in your configuration file to skip this query.',
    );
});

test('tutorial map preserves the source 75 by 18 descriptor', () => {
    assert.equal(TUTORIAL_MAP.length, 18);
    assert.ok(TUTORIAL_MAP.every((row) => row.length === 75));
});

test('tutorial descriptor retains the complete source call sequence', () => {
    const log = recordTutorialDescriptor();
    assert.deepEqual(log.slice(0, 9), [
        ['level_init', { style: 'solidfill', fg: ' ' }],
        ['level_flags', 'mazelevel', 'noflip', 'nomongen', 'nodeathdrops',
            'noautosearch'],
        ['map', TUTORIAL_MAP],
        ['region', { area: [1, 1, 73, 16], lit: true }],
        ['non_diggable'],
        ['teleport_region', { region: [9, 3, 9, 3] }],
        ['parse_config', 'mention_walls', true],
        ['parse_config', 'mention_decor', true],
        ['parse_config', 'lit_corridor', true],
    ]);
    const counts = Object.fromEntries(
        Object.entries(Object.groupBy(log, ([name]) => name))
            .map(([name, entries]) => [name, entries.length]),
    );
    assert.deepEqual(counts, {
        'contents.begin': 1,
        'contents.end': 1,
        'random.rn1': 5,
        'random.rn2': 7,
        door: 12,
        eckey: 38,
        engraving: 51,
        level_flags: 1,
        level_init: 1,
        map: 1,
        monster: 3,
        non_diggable: 1,
        object: 24,
        parse_config: 3,
        region: 4,
        shuffle: 1,
        stair: 1,
        teleport_region: 1,
        trap: 12,
    });
    assert.equal(
        descriptorDigest(log),
        '26448bab05e618594855dd95aa2c05537f98e59b9a306678f4eadcda90ba9367',
    );
});

test('tutorial descriptor covers role, energy, percentage, and contents branches', () => {
    const base = recordTutorialDescriptor();
    const doors = base.filter(([name]) => name === 'door')
        .map(([, specification]) => specification);
    assert.deepEqual(doors.slice(2, 4), [
        { coord: [10, 9], state: 'locked' },
        { coord: [15, 10], state: 'closed' },
    ]);
    assert.deepEqual(
        base.filter(([name]) => name === 'trap').slice(1, 5)
            .map(([, specification]) => specification.type),
        [SLP_GAS_TRAP, SQKY_BOARD, SLP_GAS_TRAP, SQKY_BOARD],
    );

    const box = base.findIndex(([, specification]) => (
        specification?.id === LARGE_BOX
    ));
    assert.deepEqual(base.slice(box, box + 6), [
        ['object', {
            coord: [41, 6], id: LARGE_BOX, broken: true, trapped: false,
            contents: true,
        }],
        ['contents.begin'],
        ['object', {
            id: WAN_SECRET_DOOR_DETECTION, spe: 30, contents: false,
        }],
        ['contents.end'],
        ['eckey', 'tip'],
        ['engraving', {
            coord: [42, 6], type: ENGRAVE,
            text: "Containers can also be emptied with '@tip'",
            degrade: false,
        }],
    ]);

    const knight = recordTutorialDescriptor({
        role: PM_KNIGHT,
        energy: 4,
        eckeys: { kick: '^D', down: '^J' },
    });
    assert.ok(knight.some(([, specification]) => (
        specification?.text === "Knights can jump with '@jump'"
    )));
    assert.ok(knight.some(([, specification]) => (
        specification?.text === "Unfortunately you don't have enough energy to cast spells."
    )));
    assert.deepEqual(
        knight.filter(([, specification]) => (
            specification?.text?.startsWith('Note: Outside the tutorial')
        )).map(([, specification]) => specification.coord),
        [[6, 8], [64, 4]],
    );

    const monk = recordTutorialDescriptor({ role: PM_MONK });
    const armor = monk.find(([, specification]) => (
        specification?.coord?.[0] === 19
            && specification?.coord?.[1] === 14
    ));
    assert.equal(armor[1].id, LEATHER_GLOVES);
    const healerArmor = base.find(([, specification]) => (
        specification?.coord?.[0] === 19
            && specification?.coord?.[1] === 14
    ));
    assert.equal(healerArmor[1].id, LEATHER_ARMOR);
});

test('tutorial command lookup retains every commands_init alias', () => {
    const {
        commandKeyCode,
        createCommandBindingModel,
        tutorialCommandKey,
    } = _tutorialLevelInternals;
    const lookup = (command, operations, iflags = {}) => tutorialCommandKey(
        command,
        createCommandBindingModel({
            commandOperations: operations,
            iflags: { num_pad: false, num_pad_mode: 0, ...iflags },
            flags: { rest_on_space: false },
        }),
    );
    const unbind = (key) => ({
        type: 'bind',
        key: commandKeyCode(key),
        command: 'nothing',
    });

    assert.equal(lookup('rush', [unbind('g')]), 'M-5');
    assert.equal(lookup('fight', [
        { type: 'number_pad', enabled: true, mode: 0 },
        unbind('F'),
    ], { num_pad: true }), '-');
    assert.equal(lookup('overview', [unbind('^O')]), 'M-O');
    assert.equal(lookup('twoweapon', [unbind('X')]), 'M-2');
    assert.equal(lookup('name', [unbind('M-n'), unbind('N')]), 'M-N');
});

test('numpad mode restoration preserves duplicate meta-digit backups', () => {
    const {
        commandKeyCode,
        createCommandBindingModel,
        tutorialCommandKey,
    } = _tutorialLevelInternals;
    const model = createCommandBindingModel({
        commandOperations: [
            {
                type: 'bind',
                key: commandKeyCode('c'),
                command: 'nothing',
            },
            {
                type: 'bind',
                key: commandKeyCode('M-4'),
                command: 'close',
            },
            { type: 'number_pad', enabled: true, mode: 0 },
            { type: 'number_pad', enabled: false, mode: 0 },
        ],
        iflags: { num_pad: false, num_pad_mode: 0 },
        flags: { rest_on_space: false },
    });
    assert.equal(tutorialCommandKey('close', model), '#close');
});
