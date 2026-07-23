import assert from 'node:assert/strict';
import test from 'node:test';

import {
    SPFX_SEARCH,
} from '../js/artifacts.js';
import {
    ANTI_MAGIC,
    BLINDED,
    CORR,
    DOOR,
    D_CLOSED,
    D_LOCKED,
    D_TRAPPED,
    HALLUC,
    ROOM,
    SCORR,
    SDOOR,
    STATUE_TRAP,
    SV2,
} from '../js/const.js';
import {
    _detectInternals,
    cvt_sdoor_to_door,
    dosearch0,
} from '../js/detect.js';
import {
    terrain_glyph,
    trap_glyph_info,
} from '../js/display.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { LENSES } from '../js/objects.js';

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

async function blindGlobalSearchState() {
    await runSegment({
        seed: 2026072301,
        datetime: '20260723120000',
        nethackrc: 'OPTIONS=name:TactileSearch,role:Ranger,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,'
            + '!splash_screen,blind\n',
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
    return target;
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

test('blind global search maps a secret corridor through tactile defaults', async () => {
    const target = await blindGlobalSearchState();
    const location = game.level.at(target.x, target.y);
    location.typ = SCORR;
    const random = tactileSearchRandom(7);

    await dosearch0(1, { state: game, random });

    const expected = terrain_glyph(location, target.x, target.y, game);
    assert.equal(location.typ, CORR);
    assert.equal(location.seenv & SV2, SV2);
    assert.deepEqual(random.calls, ['rnl(7)', 'rn2(19)']);
    assert.equal(location.disp_ch, expected.ch);
    assert.equal(location.remembered_glyph.ch, expected.ch);
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

test('blind global search maps an ordinary trap through tactile defaults', async () => {
    const target = await blindGlobalSearchState();
    const trap = {
        tx: target.x,
        ty: target.y,
        ttyp: ANTI_MAGIC,
        tseen: false,
    };
    game.level.traps.push(trap);
    const random = tactileSearchRandom(8);

    await dosearch0(1, { state: game, random });

    const expected = trap_glyph_info(trap, game);
    const location = game.level.at(target.x, target.y);
    assert.equal(trap.tseen, true);
    assert.equal(location.seenv & SV2, SV2);
    assert.deepEqual(random.calls, ['rnl(8)', 'rn2(19)']);
    assert.equal(location.disp_ch, expected.ch);
    assert.equal(location.remembered_glyph.ch, expected.ch);
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
