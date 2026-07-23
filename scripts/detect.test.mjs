import assert from 'node:assert/strict';
import test from 'node:test';

import {
    SPFX_SEARCH,
} from '../js/artifacts.js';
import {
    ANTI_MAGIC,
    BLINDED,
    CORR,
    DETECT_MONSTERS,
    DOOR,
    D_CLOSED,
    D_LOCKED,
    D_TRAPPED,
    DUST,
    ENGRAVE,
    HALLUC,
    IN_SIGHT,
    M_AP_OBJECT,
    OBJ_FLOOR,
    ROOM,
    SCORR,
    SDOOR,
    STATUE_TRAP,
    TELEPAT,
    SV0,
    SV1,
    SV2,
    SV3,
    SV4,
    SV5,
    SV6,
    SV7,
} from '../js/const.js';
import {
    _detectInternals,
    cvt_sdoor_to_door,
    dosearch0,
} from '../js/detect.js';
import {
    monster_glyph_info,
    object_glyph_info,
    remembered_glyph_from_presentation,
    terrain_glyph,
    trap_glyph_info,
} from '../js/display.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    CHEST,
    CORPSE,
    FOOD_CLASS,
    LENSES,
} from '../js/objects.js';
import { S_FELINE } from '../js/monsters.js';
import { create_region } from '../js/region.js';
import { ATR_INVERSE, CLR_WHITE } from '../js/terminal.js';
import {
    enableBrowserGlyphProjection,
} from './browser-projection-test-support.mjs';

function searchState() {
    const locations = new Map();
    const key = (x, y) => `${x},${y}`;
    return {
        moves: 2,
        multi: 4,
        context: {
            run: 1,
            travel: 1,
            travel1: 1,
            mv: 1,
        },
        disp: {},
        iflags: {},
        a11y: { accessiblemsg: false },
        u: {
            ux: 10,
            uy: 10,
            uswallow: false,
            uinvulnerable: true,
            usleep: 3,
            uz: { dnum: 0, dlevel: 1 },
            uprops: [],
            acurr: { a: [10, 10, 10, 10, 10, 10] },
            abon: [0, 0, 0, 0, 0, 0],
            atemp: [0, 0, 0, 0, 0, 0],
            aexe: [0, 0, 0, 0, 0, 0],
        },
        level: {
            traps: [],
            at(x, y) {
                const coordinate = key(x, y);
                if (!locations.has(coordinate)) {
                    locations.set(coordinate, {
                        typ: ROOM,
                        flags: 0,
                        doormask: 0,
                        candig: false,
                    });
                }
                return locations.get(coordinate);
            },
        },
    };
}

function scriptedRandom(events, rnlResults, rn2Results = []) {
    const rnlQueue = [...rnlResults];
    const rn2Queue = [...rn2Results];
    return {
        rnl(bound) {
            events.push(`rnl(${bound})`);
            assert.ok(rnlQueue.length, `unexpected rnl(${bound})`);
            return rnlQueue.shift();
        },
        rn2(bound) {
            events.push(`rn2(${bound})`);
            assert.ok(rn2Queue.length, `unexpected rn2(${bound})`);
            return rn2Queue.shift();
        },
        done() {
            assert.deepEqual(rnlQueue, []);
            assert.deepEqual(rn2Queue, []);
        },
    };
}

function recordingOperations(state, events) {
    return {
        recalcBlockPoint(x, y) {
            const location = state.level.at(x, y);
            events.push(
                `recalc(${x},${y},${location.typ},${location.flags})`,
            );
        },
        unblockPoint(x, y) {
            events.push(
                `unblock(${x},${y},${state.level.at(x, y).typ})`,
            );
        },
        feelLocation(x, y) {
            events.push(`feelLocation(${x},${y})`);
        },
        feelNewSym(x, y) {
            events.push(`feelNewSym(${x},${y})`);
        },
        displayFoundTrap(trap, x, y) {
            assert.equal(trap.tseen, true);
            events.push(`displayTrap(${x},${y})`);
            return true;
        },
        revealFoundTrap() {},
        waitFoundTrap() {},
        nomulZero(env) {
            events.push('nomul(0)');
            _detectInternals.defaultNomulZero(env);
        },
        message(text, x, y) {
            events.push(`message(${x},${y},${text})`);
        },
    };
}

async function blindGlobalSearchState(extraRc = '') {
    const replay = await runSegment({
        seed: 2026072301,
        datetime: '20260723120000',
        nethackrc: 'OPTIONS=name:TactileSearch,role:Ranger,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,'
            + `!splash_screen,blind\n${extraRc}`,
        moves: ' ',
    });
    const target = { x: game.u.ux - 1, y: game.u.uy - 1 };
    for (let x = game.u.ux - 1; x <= game.u.ux + 1; ++x) {
        for (let y = game.u.uy - 1; y <= game.u.uy + 1; ++y) {
            if (x === game.u.ux && y === game.u.uy) continue;
            const location = game.level.at(x, y);
            location.typ = ROOM;
            location.flags = location.doormask = 0;
            location.remembered_glyph = undefined;
            location.seenv = 0;
            game.level.objects[x][y] = null;
            game.level.monsters[x][y] = null;
        }
    }
    game.level.traps = [];
    return { ...target, replay };
}

function installUnseenAntiMagicTrap(target) {
    // ANTI_MAGIC follows the ordinary, non-statue find_trap() branch.
    const trap = {
        tx: target.x,
        ty: target.y,
        ttyp: ANTI_MAGIC,
        tseen: false,
    };
    game.level.traps.push(trap);
    return trap;
}

function installVisibleGasOverlay(target) {
    const region = create_region([{
        lx: target.x,
        ly: target.y,
        hx: target.x,
        hy: target.y,
    }]);
    region.visible = true;
    game.level.regions.push(region);
    return region;
}

function tactileSearchRandom(expectedBound) {
    const calls = [];
    return {
        calls,
        rnl(bound) {
            calls.push(`rnl(${bound})`);
            assert.equal(bound, expectedBound);
            return 0;
        },
        rn2(bound) {
            calls.push(`rn2(${bound})`);
            assert.equal(bound, 19);
            return 18;
        },
    };
}

function rememberedGlyphContract(glyph, trapType = null) {
    const remembered = {
        ch: glyph.ch,
        color: glyph.color,
        decgfx: glyph.dec,
        displayCh: glyph.displayCh ?? null,
    };
    if (trapType !== null) remembered.trapType = trapType;
    if (glyph.attr) remembered.attr = glyph.attr;
    if (glyph.displayColor)
        remembered.displayColor = glyph.displayColor;
    if (glyph.rgb) remembered.rgb = [...glyph.rgb];
    return remembered;
}

function assertCompleteMappedGlyph(
    location,
    glyph,
    label = '',
    trapType = null,
) {
    assert.deepEqual({
        ch: location.disp_ch,
        color: location.disp_color,
        dec: Boolean(location.disp_decgfx),
        attr: location.disp_attr ?? 0,
        displayCh: location.disp_browser_ch ?? null,
        displayColor: location.disp_browser_color ?? null,
        displayAttr: location.disp_browser_attr ?? null,
    }, {
        ch: glyph.ch,
        color: glyph.color,
        dec: Boolean(glyph.dec),
        attr: glyph.attr ?? 0,
        displayCh: glyph.displayCh ?? null,
        displayColor: glyph.displayColor
            ?? (glyph.displayCh ? glyph.color : null),
        displayAttr: glyph.displayCh ? glyph.attr ?? 0 : null,
    }, label);
    assert.deepEqual(
        location.remembered_glyph,
        rememberedGlyphContract(glyph, trapType),
        label,
    );
}

function captureInputBoundaries() {
    const captures = [];
    const original = game._preNhgetchHook;
    game._preNhgetchHook = async () => {
        captures.push({
            grid: game.nhDisplay.grid.map(
                (row) => row.map((cell) => ({ ...cell })),
            ),
            cursor: [
                game.nhDisplay.cursorCol,
                game.nhDisplay.cursorRow,
                1,
            ],
        });
        if (original) await original();
    };
    return captures;
}

function screenRow(grid, row) {
    return grid[row].map(({ ch }) => ch).join('');
}

function assertTemporaryTrapScreen(capture, trap, hero) {
    const { grid, cursor } = capture;
    assert.equal(
        screenRow(grid, 0).trimEnd(),
        'You find an anti-magic field.--More--',
    );
    const mapCells = [];
    for (let row = 1; row < 22; ++row) {
        for (let column = 0; column < 80; ++column) {
            if (grid[row][column].ch !== ' ')
                mapCells.push([column, row, grid[row][column].ch]);
        }
    }
    assert.deepEqual(mapCells, [
        [trap.x - 1, trap.y + 1, '^'],
        [hero.x - 1, hero.y + 1, '@'],
    ].sort((left, right) => left[1] - right[1] || left[0] - right[0]));
    // The 29-byte message plus the eight-byte tty prompt leaves C's cursor
    // immediately after --More--.
    assert.deepEqual(cursor, [37, 0, 1]);
}

test('automatic search reveals a secret door in source operation order', async () => {
    const state = searchState();
    const location = state.level.at(9, 9);
    location.typ = SDOOR;
    location.flags = D_LOCKED | D_TRAPPED | 0x03;
    location.doormask = location.flags;
    location.candig = true;
    const events = [];
    const random = scriptedRandom(events, [0], [18]);

    await dosearch0(1, {
        state,
        random,
        ...recordingOperations(state, events),
    });

    assert.deepEqual(events, [
        'rnl(7)',
        `recalc(9,9,${DOOR},${D_LOCKED | D_TRAPPED})`,
        'rn2(19)',
        'nomul(0)',
        'feelLocation(9,9)',
        'message(9,9,You find a hidden door.)',
    ]);
    assert.equal(location.typ, DOOR);
    assert.equal(location.flags, D_LOCKED | D_TRAPPED);
    assert.equal(location.doormask, D_LOCKED | D_TRAPPED);
    assert.equal(location.candig, false);
    assert.equal(state.u.aexe[2], 1);
    assert.equal(state.multi, 0);
    assert.equal(state.context.run, 0);
    assert.equal(state.context.travel, 0);
    assert.equal(state.context.travel1, 0);
    assert.equal(state.context.mv, 0);
    assert.equal(state.disp.botl, true);
    assert.equal(state.u.uinvulnerable, false);
    assert.equal(state.u.usleep, 0);
    random.done();
});

test('secret-door conversion closes unlocked doors and opens rogue doors', () => {
    const ordinary = searchState();
    const ordinaryDoor = ordinary.level.at(9, 9);
    ordinaryDoor.typ = SDOOR;
    ordinaryDoor.flags = D_TRAPPED | 0x02;
    ordinaryDoor.candig = true;
    cvt_sdoor_to_door(ordinaryDoor, ordinary);
    assert.equal(ordinaryDoor.typ, DOOR);
    assert.equal(ordinaryDoor.flags, D_TRAPPED | D_CLOSED);
    assert.equal(ordinaryDoor.doormask, D_TRAPPED | D_CLOSED);
    assert.equal(ordinaryDoor.candig, false);

    const rogue = searchState();
    rogue.rogue_level = { ...rogue.u.uz };
    const rogueDoor = rogue.level.at(9, 9);
    rogueDoor.typ = SDOOR;
    rogueDoor.flags = D_LOCKED | D_TRAPPED | 0x03;
    cvt_sdoor_to_door(rogueDoor, rogue);
    assert.equal(rogueDoor.typ, DOOR);
    assert.equal(rogueDoor.flags, 0);
    assert.equal(rogueDoor.doormask, 0);
});

test('automatic search reveals a secret corridor before exercise and display', async () => {
    const state = searchState();
    state.level.at(9, 9).typ = SCORR;
    const events = [];
    const random = scriptedRandom(events, [0], [18]);

    await dosearch0(true, {
        state,
        random,
        ...recordingOperations(state, events),
    });

    assert.deepEqual(events, [
        'rnl(7)',
        `unblock(9,9,${CORR})`,
        'rn2(19)',
        'nomul(0)',
        'feelNewSym(9,9)',
        'message(9,9,You find a hidden passage.)',
    ]);
    assert.equal(state.level.at(9, 9).typ, CORR);
    assert.equal(state.u.aexe[2], 1);
    random.done();
});

test('blind tactile search records all eight source viewing vectors', async () => {
    const origin = await blindGlobalSearchState(
        String.raw`SYMBOLS=S_corr:\m#` + '\n',
    );
    // display.c set_seenv() indexes by sign(hero.y - target.y), so the upper
    // row uses SV4..SV6 and the lower row uses SV2..SV0.
    const directions = [
        [-1, -1, SV4], [0, -1, SV5], [1, -1, SV6],
        [-1, 0, SV3],                    [1, 0, SV7],
        [-1, 1, SV2],  [0, 1, SV1],   [1, 1, SV0],
    ];

    for (const [dx, dy, seenv] of directions) {
        const x = game.u.ux + dx;
        const y = game.u.uy + dy;
        const location = game.level.at(x, y);
        location.typ = SCORR;
        const random = tactileSearchRandom(7);

        await dosearch0(1, {
            state: game,
            random,
            message: async () => {},
        });

        const expected = terrain_glyph(location, x, y, game);
        assert.equal(location.typ, CORR);
        assert.equal(location.seenv, seenv, `${dx},${dy}`);
        assert.deepEqual(random.calls, ['rnl(7)', 'rn2(19)']);
        assertCompleteMappedGlyph(location, expected, `${dx},${dy}`);
    }
});

test('presentation-to-memory conversion retains logical and browser metadata', () => {
    const trap = { ttyp: ANTI_MAGIC };
    // Distinct non-default sentinels expose dropped or cross-wired color,
    // attribute, browser, and RGB fields; ANTI_MAGIC is the meaningful logical
    // trap identity.
    const glyph = {
        ch: null,
        color: 12,
        dec: false,
        attr: 4,
        displayCh: '⌁',
        displayColor: 'rgb(7, 11, 13)',
        rgb: [7, 11, 13],
    };

    assert.deepEqual(
        remembered_glyph_from_presentation(glyph, trap),
        {
            ch: null,
            color: 12,
            decgfx: false,
            displayCh: '⌁',
            displayColor: 'rgb(7, 11, 13)',
            rgb: [7, 11, 13],
            attr: 4,
            trapType: ANTI_MAGIC,
        },
    );
    assert.throws(
        () => remembered_glyph_from_presentation({
            ch: '^',
            color: 12,
            decgfx: false,
        }),
        /requires a presentation record/u,
    );
});

test('ordinary trap discovery marks seen before exercise and display', async () => {
    const state = searchState();
    const trap = {
        tx: 9,
        ty: 9,
        ttyp: ANTI_MAGIC,
        tseen: false,
    };
    state.level.traps.push(trap);
    const events = [];
    const random = scriptedRandom(events, [0], [18]);
    const operations = recordingOperations(state, events);
    const originalRn2 = random.rn2;
    random.rn2 = (bound) => {
        assert.equal(trap.tseen, true);
        return originalRn2(bound);
    };

    await dosearch0(1, {
        state,
        random,
        ...operations,
    });

    assert.deepEqual(events, [
        'rnl(8)',
        'nomul(0)',
        'rn2(19)',
        'displayTrap(9,9)',
        'message(9,9,You find an anti-magic field.)',
    ]);
    assert.equal(trap.tseen, true);
    assert.equal(state.u.aexe[2], 1);
    random.done();
});

test('injected trap display must return semantic visibility', async () => {
    const state = searchState();
    const trap = {
        tx: 9,
        ty: 9,
        ttyp: ANTI_MAGIC,
        tseen: false,
    };
    state.level.traps.push(trap);
    const events = [];
    const random = scriptedRandom(events, [0], [18]);

    await assert.rejects(
        dosearch0(1, {
            state,
            random,
            ...recordingOperations(state, events),
            displayFoundTrap() {
                events.push('displayTrapWithoutIdentity');
            },
        }),
        /displayFoundTrap must return a Boolean/u,
    );
    assert.deepEqual(events, [
        'rnl(8)',
        'nomul(0)',
        'rn2(19)',
        'displayTrapWithoutIdentity',
    ]);
    random.done();
});

test('blind global search maps an ordinary trap through tactile defaults', async () => {
    const target = await blindGlobalSearchState();
    const trap = installUnseenAntiMagicTrap(target);
    const random = tactileSearchRandom(8);

    await dosearch0(1, { state: game, random });

    const expected = trap_glyph_info(trap, game);
    const location = game.level.at(target.x, target.y);
    assert.equal(trap.tseen, true);
    assert.equal(location.seenv, SV4);
    assert.deepEqual(random.calls, ['rnl(8)', 'rn2(19)']);
    assertCompleteMappedGlyph(location, expected, '', ANTI_MAGIC);
});

test('default trap comparison preserves injected mapping contracts', async () => {
    for (const mode of ['logical descriptor', 'presentation fallback']) {
        const target = await blindGlobalSearchState();
        const trap = installUnseenAntiMagicTrap(target);
        const location = game.level.at(target.x, target.y);
        const expected = trap_glyph_info(trap, game);
        const beforeWait = target.replay.getScreens().length;
        const random = tactileSearchRandom(8);

        await dosearch0(1, {
            state: game,
            random,
            feelNewSym() {
                if (mode === 'logical descriptor')
                    return { kind: 'trap', owner: trap };
                location.disp_ch = expected.ch;
                location.disp_color = expected.color;
                location.disp_decgfx = expected.dec;
                return undefined;
            },
        });

        assert.equal(trap.tseen, true, mode);
        assert.equal(
            target.replay.getScreens().length,
            beforeWait,
            mode,
        );
        assert.deepEqual(random.calls, ['rnl(8)', 'rn2(19)'], mode);
    }
});

test('blind tactile mapping reveals only feelable engravings below a trap', async () => {
    // engrave.c engr_can_be_felt() accepts carved text but rejects dust.
    for (const [engrType, expectedRevealed] of [
        [ENGRAVE, 1],
        [DUST, 0],
    ]) {
        const target = await blindGlobalSearchState();
        const engraving = {
            engr_x: target.x,
            engr_y: target.y,
            engr_type: engrType,
            erevealed: 0,
            nxt_engr: null,
        };
        game.head_engr = engraving;
        installUnseenAntiMagicTrap(target);

        await dosearch0(1, {
            state: game,
            random: tactileSearchRandom(8),
            message: async () => {},
            waitFoundTrap: async () => {},
        });

        assert.equal(engraving.erevealed, expectedRevealed);
    }
});

test('trap clutter uses logical layers when custom symbols collide', async () => {
    const target = await blindGlobalSearchState(
        'OPTIONS=!color\nSYMBOLS=S_food:^\n',
    );
    const location = game.level.at(target.x, target.y);
    const trap = installUnseenAntiMagicTrap(target);
    const corpse = {
        otyp: CORPSE,
        oclass: FOOD_CLASS,
        corpsenm: 0,
        dknown: true,
        where: OBJ_FLOOR,
        ox: target.x,
        oy: target.y,
        nexthere: null,
    };
    game.level.objects[target.x][target.y] = corpse;
    const engraving = {
        engr_x: target.x,
        engr_y: target.y,
        engr_type: ENGRAVE,
        erevealed: 0,
        nxt_engr: null,
    };
    game.head_engr = engraving;

    const objectGlyph = object_glyph_info(corpse, game);
    const trapGlyph = trap_glyph_info(trap, game);
    assert.deepEqual({
        ch: objectGlyph.ch,
        color: objectGlyph.color,
        dec: objectGlyph.dec,
    }, {
        ch: trapGlyph.ch,
        color: trapGlyph.color,
        dec: trapGlyph.dec,
    }, 'the valid custom configuration creates a presentation collision');

    const beforeWait = target.replay.getScreens().length;
    enableBrowserGlyphProjection(game.nhDisplay);
    const staleBrowserCell = game.level.at(target.x + 2, target.y);
    // Seed stale browser-only presentation so cls() must clear every pending
    // projection field before the temporary trap frame is flushed.
    staleBrowserCell.disp_browser_ch = '✦';
    staleBrowserCell.disp_browser_color = 'rgb(1, 2, 3)';
    staleBrowserCell.disp_browser_attr = 4;
    const captures = captureInputBoundaries();
    game.nhDisplay.pushKey(' '.charCodeAt(0));
    const random = tactileSearchRandom(8);
    await dosearch0(1, { state: game, random });

    assert.equal(trap.tseen, true);
    assert.equal(engraving.erevealed, 1);
    assert.equal(location.seenv, SV4);
    assert.equal(target.replay.getScreens().length, beforeWait + 1);
    assert.equal(game.nhDisplay.inputQueueLength, 0);
    assert.deepEqual(random.calls, ['rnl(8)', 'rn2(19)']);
    assertCompleteMappedGlyph(location, objectGlyph);
    assertTemporaryTrapScreen(
        captures.at(-1),
        target,
        { x: game.u.ux, y: game.u.uy },
    );
});

test('sighted trap discovery records trap identity without a map wait', async () => {
    const target = await blindGlobalSearchState('OPTIONS=!blind\n');
    assert.ok(game.viz_array[target.y][target.x] & IN_SIGHT);
    const trap = installUnseenAntiMagicTrap(target);
    const beforeWait = target.replay.getScreens().length;
    const random = tactileSearchRandom(8);

    await dosearch0(1, { state: game, random });

    const location = game.level.at(target.x, target.y);
    assert.equal(target.replay.getScreens().length, beforeWait);
    assert.deepEqual(random.calls, ['rnl(8)', 'rn2(19)']);
    assertCompleteMappedGlyph(
        location,
        trap_glyph_info(trap, game),
        '',
        ANTI_MAGIC,
    );
});

test('sighted trap discovery compares memory retained under a gas region', async () => {
    const target = await blindGlobalSearchState('OPTIONS=!blind\n');
    assert.ok(game.viz_array[target.y][target.x] & IN_SIGHT);
    const location = game.level.at(target.x, target.y);
    const priorMemory = location.remembered_glyph;
    const trap = installUnseenAntiMagicTrap(target);
    installVisibleGasOverlay(target);
    const captures = captureInputBoundaries();
    game.nhDisplay.pushKey(' '.charCodeAt(0));

    const beforeWait = target.replay.getScreens().length;
    await dosearch0(1, {
        state: game,
        random: tactileSearchRandom(8),
    });

    assert.equal(trap.tseen, true);
    assert.deepEqual(
        location.remembered_glyph,
        priorMemory,
        'newsym leaves levl glyph memory unchanged below the gas overlay',
    );
    assert.equal(target.replay.getScreens().length, beforeWait + 1);
    assertTemporaryTrapScreen(
        captures.at(-1),
        target,
        { x: game.u.ux, y: game.u.uy },
    );
});

test('a telepathically sensed visible mimic shows real form and remembers disguise', async () => {
    const target = await blindGlobalSearchState('OPTIONS=!blind\n');
    assert.ok(game.viz_array[target.y][target.x] & IN_SIGHT);
    const location = game.level.at(target.x, target.y);
    const trap = installUnseenAntiMagicTrap(target);
    installVisibleGasOverlay(target);
    const monster = {
        data: {
            mlet: S_FELINE,
            mcolor: CLR_WHITE,
            mflags1: 0,
            mflags2: 0,
        },
        mhp: 10,
        mtame: 0,
        minvis: false,
        mundetected: false,
        m_ap_type: M_AP_OBJECT,
        mappearance: CHEST,
        mx: target.x,
        my: target.y,
    };
    game.level.monsters[target.x][target.y] = monster;
    game.u.uprops ??= [];
    // The diagonal target has squared distance two, is IN_SIGHT, and is a
    // non-invisible mimic. Range three telepathy therefore adds a
    // non-detection sense to physical visibility, selecting PHYSICALLY_SEEN.
    game.u.uprops[TELEPAT] = {
        intrinsic: 0,
        extrinsic: 1,
        blocked: 0,
    };
    game.u.unblind_telepat_range = 3;
    const captures = captureInputBoundaries();
    game.nhDisplay.pushKey(' '.charCodeAt(0));
    const beforeWait = target.replay.getScreens().length;
    const random = tactileSearchRandom(8);

    await dosearch0(1, { state: game, random });

    const shown = monster_glyph_info({
        ...monster,
        m_ap_type: 0,
    }, game);
    const disguise = monster_glyph_info(monster, game);
    assert.deepEqual({
        ch: location.disp_ch,
        color: location.disp_color,
        dec: Boolean(location.disp_decgfx),
        attr: location.disp_attr ?? 0,
    }, {
        ch: shown.ch,
        color: shown.color,
        dec: Boolean(shown.dec),
        attr: shown.attr ?? 0,
    });
    assert.deepEqual(
        location.remembered_glyph,
        rememberedGlyphContract(disguise),
    );
    assert.equal(target.replay.getScreens().length, beforeWait + 1);
    assert.equal(game.nhDisplay.inputQueueLength, 0);
    assertTemporaryTrapScreen(
        captures.at(-1),
        target,
        { x: game.u.ux, y: game.u.uy },
    );
    assert.deepEqual(random.calls, ['rnl(8)', 'rn2(19)']);
});

test('detect-only mimic presentation retains the underlying trap memory', async () => {
    for (const inverse of [true, false]) {
        const target = await blindGlobalSearchState('OPTIONS=!blind\n');
        const location = game.level.at(target.x, target.y);
        const trap = installUnseenAntiMagicTrap(target);
        installVisibleGasOverlay(target);
        const monster = {
            data: {
                mlet: S_FELINE,
                mcolor: CLR_WHITE,
                mflags1: 0,
                mflags2: 0,
            },
            mhp: 10,
            mtame: 0,
            minvis: true,
            mundetected: false,
            m_ap_type: M_AP_OBJECT,
            mappearance: CHEST,
            mx: target.x,
            my: target.y,
        };
        game.level.monsters[target.x][target.y] = monster;
        game.u.uprops ??= [];
        game.u.uprops[DETECT_MONSTERS] = {
            intrinsic: 1,
            extrinsic: 0,
            blocked: 0,
        };
        game.iflags.wc_inverse = inverse;
        const beforeWait = target.replay.getScreens().length;
        const random = tactileSearchRandom(8);

        await dosearch0(1, { state: game, random });

        const shown = monster_glyph_info({
            ...monster,
            m_ap_type: 0,
        }, game);
        assert.deepEqual({
            ch: location.disp_ch,
            color: location.disp_color,
            dec: Boolean(location.disp_decgfx),
            attr: location.disp_attr ?? 0,
        }, {
            ch: shown.ch,
            color: shown.color,
            dec: Boolean(shown.dec),
            attr: inverse ? ATR_INVERSE : 0,
        }, `wc_inverse=${inverse}`);
        assert.deepEqual(
            location.remembered_glyph,
            rememberedGlyphContract(
                trap_glyph_info(trap, game),
                ANTI_MAGIC,
            ),
        );
        assert.equal(target.replay.getScreens().length, beforeWait);
        assert.deepEqual(random.calls, ['rnl(8)', 'rn2(19)']);
    }
});

test('disabled hero memory retains prior visible and tactile memory', async () => {
    for (const [label, extraRc] of [
        ['visible', 'OPTIONS=!blind\n'],
        ['tactile', ''],
    ]) {
        const target = await blindGlobalSearchState(extraRc);
        game.level.flags.hero_memory = false;
        const location = game.level.at(target.x, target.y);
        const retained = {
            ch: '?',
            color: 7,
            decgfx: false,
            displayCh: null,
        };
        location.remembered_glyph = retained;
        installUnseenAntiMagicTrap(target);
        const beforeWait = target.replay.getScreens().length;
        game.nhDisplay.pushKey(' '.charCodeAt(0));

        await dosearch0(1, {
            state: game,
            random: tactileSearchRandom(8),
        });

        assert.equal(location.remembered_glyph, retained, label);
        assert.equal(
            target.replay.getScreens().length,
            beforeWait + 1,
            label,
        );
        assert.equal(game.nhDisplay.inputQueueLength, 0, label);
    }
});

test('WIN_STOP suppresses trap input waiting but still redraws', async () => {
    const target = await blindGlobalSearchState('OPTIONS=!blind\n');
    const location = game.level.at(target.x, target.y);
    const trap = installUnseenAntiMagicTrap(target);
    installVisibleGasOverlay(target);
    game._ttyMessageStopped = true;
    // This rejection key must remain queued, proving that WIN_STOP skipped the
    // --More-- input boundary even though docrt() still restored the map.
    game.nhDisplay.pushKey('x'.charCodeAt(0));
    const beforeWait = target.replay.getScreens().length;
    const random = tactileSearchRandom(8);

    await dosearch0(1, { state: game, random });

    assert.equal(trap.tseen, true);
    assert.equal(location.disp_ch, '#');
    assert.equal(game._pending_message, '');
    assert.equal(game._ttyMessageStopped, true);
    assert.equal(game.nhDisplay.inputQueueLength, 1);
    assert.equal(target.replay.getScreens().length, beforeWait);
    assert.deepEqual(random.calls, ['rnl(8)', 'rn2(19)']);
});

test('injected trap messaging requires paired wait ownership', async () => {
    const target = await blindGlobalSearchState();
    const trap = installUnseenAntiMagicTrap(target);
    const random = tactileSearchRandom(8);

    await assert.rejects(
        dosearch0(1, {
            state: game,
            random,
            message: async () => {},
        }),
        /injected waitFoundTrap when trap messaging is injected/u,
    );
    assert.equal(trap.tseen, false);
    assert.deepEqual(random.calls, ['rnl(8)']);
});

test('statue discovery activates, conditionally exercises, and returns early', async () => {
    for (const animated of [null, { m_id: 17 }]) {
        const state = searchState();
        const trap = {
            tx: 9,
            ty: 9,
            ttyp: STATUE_TRAP,
            tseen: false,
        };
        state.level.traps.push(trap);
        // A later source-order candidate must not be visited after the
        // unconditional return from the STATUE_TRAP branch.
        state.level.at(11, 11).typ = SDOOR;
        const events = [];
        const random = scriptedRandom(
            events,
            [0],
            animated ? [18] : [],
        );

        await dosearch0(1, {
            state,
            random,
            ...recordingOperations(state, events),
            activateStatueTrap(found, x, y, shatter) {
                assert.equal(found, trap);
                assert.equal(shatter, false);
                events.push(`activate(${x},${y})`);
                return animated;
            },
        });

        assert.deepEqual(events, animated ? [
            'rnl(8)',
            'nomul(0)',
            'activate(9,9)',
            'rn2(19)',
        ] : [
            'rnl(8)',
            'nomul(0)',
            'activate(9,9)',
        ]);
        assert.equal(state.u.aexe[2], animated ? 1 : 0);
        random.done();
    }
});

test('cluttered and hallucinatory trap finds reveal, wait, then redraw', async () => {
    for (const hallucinating of [false, true]) {
        const state = searchState();
        const trap = {
            tx: 9,
            ty: 9,
            ttyp: ANTI_MAGIC,
            tseen: false,
        };
        state.level.traps.push(trap);
        if (hallucinating) {
            state.u.uprops[HALLUC] = {
                intrinsic: 1,
                extrinsic: 0,
                blocked: 0,
            };
        }
        const events = [];
        const random = scriptedRandom(events, [0], [18]);
        await dosearch0(1, {
            state,
            random,
            ...recordingOperations(state, events),
            displayFoundTrap() {
                events.push('displayTrap');
                return hallucinating ? true : false;
            },
            revealFoundTrap() {
                events.push('revealTrap');
            },
            waitFoundTrap() {
                events.push('waitAndRedraw');
            },
            trapName() {
                return 'anti-magic field';
            },
        });

        assert.deepEqual(events, [
            'rnl(8)',
            'nomul(0)',
            'rn2(19)',
            'displayTrap',
            'revealTrap',
            'message(9,9,You find an anti-magic field.)',
            'waitAndRedraw',
        ]);
        random.done();
    }
});

test('automatic search computes artifact and lenses fund before rnl', async () => {
    const state = searchState();
    state.level.at(9, 9).typ = SDOOR;
    state.artilist = [{}, { spfx: SPFX_SEARCH }];
    state.uwep = { oartifact: 1, spe: 4 };
    state.ublindf = { otyp: LENSES };
    let events = [];
    let random = scriptedRandom(events, [1]);

    await dosearch0(1, {
        state,
        random,
        ...recordingOperations(state, events),
    });
    assert.deepEqual(events, ['rnl(2)']);
    random.done();

    const blind = searchState();
    blind.level.at(9, 9).typ = SDOOR;
    blind.artilist = [{}, { spfx: SPFX_SEARCH }];
    blind.uwep = { oartifact: 1, spe: 4 };
    blind.ublindf = { otyp: LENSES };
    blind.u.uprops[BLINDED] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    events = [];
    random = scriptedRandom(events, [1]);
    await dosearch0(1, {
        state: blind,
        random,
        ...recordingOperations(blind, events),
    });
    assert.deepEqual(events, ['rnl(3)']);
    random.done();
});

test('automatic search scans x-major and only draws for source candidates', async () => {
    const state = searchState();
    state.level.at(9, 9).typ = SDOOR;
    state.level.traps.push({
        tx: 9, ty: 10, ttyp: ANTI_MAGIC, tseen: false,
    });
    state.level.at(9, 11).typ = SCORR;
    state.level.traps.push({
        tx: 10, ty: 9, ttyp: ANTI_MAGIC, tseen: true,
    });
    state.level.at(10, 10).typ = SDOOR; // u_at(), so never examined.
    const events = [];
    const random = scriptedRandom(events, [1, 1, 1]);

    await dosearch0(1, {
        state,
        random,
        ...recordingOperations(state, events),
    });

    assert.deepEqual(events, ['rnl(7)', 'rnl(8)', 'rnl(7)']);
    random.done();
});

test('a missed statue search draws before requiring its hit operation', async () => {
    const state = searchState();
    const trap = {
        tx: 9,
        ty: 9,
        ttyp: STATUE_TRAP,
        tseen: false,
    };
    state.level.traps.push(trap);
    const events = [];
    let random = scriptedRandom(events, [1]);
    await dosearch0(1, {
        state,
        random,
        ...recordingOperations(state, events),
    });
    assert.deepEqual(events, ['rnl(8)']);
    assert.equal(trap.tseen, false);
    assert.equal(state.multi, 4);
    random.done();

    events.length = 0;
    random = scriptedRandom(events, [0]);
    await assert.rejects(
        dosearch0(1, {
            state,
            random,
            ...recordingOperations(state, events),
        }),
        /requires activateStatueTrap for a statue trap/,
    );
    assert.deepEqual(events, ['rnl(8)']);
    assert.equal(trap.tseen, false);
    assert.equal(state.multi, 4);
    random.done();
});

test('a blind miss draws before tactile display preflight', async () => {
    const state = searchState();
    state.level.at(9, 9).typ = SDOOR;
    state.u.uprops[BLINDED] = {
        intrinsic: 1,
        extrinsic: 0,
        blocked: 0,
    };
    const events = [];
    const random = scriptedRandom(events, [1]);

    await dosearch0(1, { state, random });

    assert.deepEqual(events, ['rnl(7)']);
    assert.equal(state.level.at(9, 9).typ, SDOOR);
    random.done();
});

test('swallowed automatic search is inert and explicit search is out of scope', async () => {
    const state = searchState();
    state.u.uswallow = true;
    assert.equal(await dosearch0(1, { state }), 1);

    await assert.rejects(
        dosearch0(0, { state }),
        /implements intrinsic automatic search only/,
    );
});
