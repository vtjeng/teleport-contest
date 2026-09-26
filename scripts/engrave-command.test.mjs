import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ADMITTED_COMMANDS,
    UnsupportedHeroCommandBoundaryError,
} from '../js/cmd.js';
import {
    AIR,
    CLOUD,
    DUST,
    ECMD_FAIL,
    FOUNTAIN,
    LAVAPOOL,
    LEVITATION,
    POOL,
    ROOM,
    STAIRS,
    STONE,
} from '../js/const.js';
import {
    doengrave,
    engr_at,
    make_engr_at,
    read_engr_at,
    u_can_engrave,
} from '../js/engrave.js';
import { GameMap } from '../js/game.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { M1_ANIMAL, S_VORTEX } from '../js/monsters.js';
import {
    ENGRAVE_SETUP,
    ENGRAVE_KEY,
    ENGRAVE_WAIT,
    ENTER_KEY,
    FINGERTIP_KEY,
    loadEngraveFingertipDustRecipe,
} from './run-engrave-fingertip-dust.mjs';

function engravingGateState(typ, { swallowed = false, holder = null } = {}) {
    const level = new GameMap();
    level.at(10, 10).typ = typ;
    return {
        level,
        u: {
            ux: 10,
            uy: 10,
            uz: { dnum: 0, dlevel: 1 },
            uswallow: swallowed,
            ustuck: holder ? { data: holder } : null,
            uprops: [],
        },
        youmonst: { data: { mflags1: 0, mlet: 0, pmidx: 0 } },
    };
}

function engravingGateEnv(state, {
    cantWield = () => false,
    checkCapacity = async () => false,
    message = async () => {},
} = {}) {
    return { cantWield, checkCapacity, message, state };
}

test('u_can_engrave follows C terrain, engulfing, and return checks', async () => {
    for (const [typ, expected] of [
        [STONE, "You can't write here."],
        [LAVAPOOL, "You can't write on the lava!"],
        [POOL, "You can't write on the water!"],
        [FOUNTAIN, "You can't write on the fountain!"],
        [CLOUD, "You can't write in cloud vapor!"],
    ]) {
        const state = engravingGateState(typ);
        const messages = [];
        assert.equal(await u_can_engrave(state, engravingGateEnv(state, {
            message: async (text) => messages.push(text),
        })), false, String(typ));
        assert.deepEqual(messages, [expected], String(typ));
    }

    const air = engravingGateState(AIR);
    const airMessages = [];
    assert.equal(await u_can_engrave(air, engravingGateEnv(air, {
        message: async (text) => airMessages.push(text),
    })), false);
    assert.deepEqual(airMessages, ["You can't write in thin air!"]);

    const animal = engravingGateState(ROOM, {
        swallowed: true,
        holder: { mflags1: M1_ANIMAL, mlet: 0, pmidx: 0 },
    });
    const animalMessages = [];
    assert.equal(await u_can_engrave(animal, engravingGateEnv(animal, {
        message: async (text) => animalMessages.push(text),
    })), false);
    assert.deepEqual(animalMessages, ['What would you write?  "Jonah was here"?']);

    const whirly = engravingGateState(ROOM, {
        swallowed: true,
        holder: { mflags1: 0, mlet: S_VORTEX, pmidx: 0 },
    });
    const whirlyMessages = [];
    assert.equal(await u_can_engrave(whirly, engravingGateEnv(whirly, {
        message: async (text) => whirlyMessages.push(text),
    })), false);
    assert.deepEqual(whirlyMessages, ["You can't reach the floor."]);

    // C skips terrain checks for an amorphous engulfer, then reaches the
    // wieldability and carrying-capacity checks.
    const amorphous = engravingGateState(STONE, {
        swallowed: true,
        holder: { mflags1: 0, mlet: 0, pmidx: 0 },
    });
    assert.equal(await u_can_engrave(amorphous,
        engravingGateEnv(amorphous)), true);

    // STAIRS is ACCESSIBLE even though it is outside the former ROOM/CORR
    // shortcut. Levitation also proves this predicate no longer reads the
    // later can_reach_floor() rule.
    const accessible = engravingGateState(STAIRS);
    accessible.u.uprops[LEVITATION] = { intrinsic: 1 };
    const order = [];
    assert.equal(await u_can_engrave(accessible, engravingGateEnv(accessible, {
        cantWield: (species) => {
            assert.equal(species, accessible.youmonst.data);
            order.push('cantwield');
            return false;
        },
        checkCapacity: async (str, checkedState) => {
            assert.equal(str, null);
            assert.equal(checkedState, accessible);
            order.push('check_capacity');
            return false;
        },
    })), true);
    assert.deepEqual(order, ['cantwield', 'check_capacity']);

    const noHands = engravingGateState(STAIRS);
    const noHandsMessages = [];
    let capacityChecked = false;
    assert.equal(await u_can_engrave(noHands, engravingGateEnv(noHands, {
        cantWield: () => true,
        checkCapacity: async () => { capacityChecked = true; return false; },
        message: async (text) => noHandsMessages.push(text),
    })), false);
    assert.equal(capacityChecked, false);
    assert.deepEqual(noHandsMessages, ["You can't even hold anything!"]);

    const tooHeavy = engravingGateState(STAIRS);
    assert.equal(await u_can_engrave(tooHeavy, engravingGateEnv(tooHeavy, {
        checkCapacity: async () => true,
    })), false);
});

test('doengrave returns C ECMD_FAIL when its entry predicate refuses', async () => {
    const state = engravingGateState(CLOUD);
    const messages = [];
    let prompted = false;
    const result = await doengrave(state, {
        cantWield: () => false,
        checkCapacity: async () => false,
        message: async (text) => messages.push(text),
        getObject: async () => { prompted = true; },
    });
    assert.equal(result, ECMD_FAIL);
    assert.deepEqual(messages, ["You can't write in cloud vapor!"]);
    assert.equal(prompted, false);
});

test('bare fingertips write a rate-10 dust engraving in one action',
    async () => {
        assert.ok(ADMITTED_COMMANDS.includes('engrave'));
        const recipe = loadEngraveFingertipDustRecipe();
        const baseline = {
            ...recipe.segments[0],
            moves: ENGRAVE_SETUP,
        };
        await runSegment(baseline);
        const baselineMoves = game.moves;
        const baselineLiteracy = game.u.uconduct.literate;

        const replay = await runSegment(recipe.segments[0]);
        const engraving = engr_at(game.u.ux, game.u.uy, game);

        // The complete recipe spends the opening wait, one engraving action,
        // and the final wait. The baseline spends only the opening wait.
        assert.equal(game.moves, baselineMoves + 2);
        assert.equal(game.u.uconduct.literate, baselineLiteracy + 1);
        assert.equal(engraving?.engr_type, DUST);
        assert.equal(engraving?.engr_txt?.[0], 'Elbereth');
        assert.equal(engraving?.eread, true);
        assert.equal(engraving?.erevealed, true);
        assert.equal(game.context.engraving.text, '');
        assert.equal(game.context.engraving.nextc, null);
        assert.equal(game.context.engraving.stylus, null);
        assert.equal(game.go.occupation, null);
        // The fresh C run at seed 42043 records eight source-ordered rn2(25)
        // corruption calls and then make_engr_at()'s rn2(19) Wisdom draw.
        // The six entries after this suffix belong to the ordinary turn tail.
        assert.deepEqual(replay.getRngLog().slice(-15, -6), [
            'rn2(25)=10',
            'rn2(25)=12',
            'rn2(25)=17',
            'rn2(25)=11',
            'rn2(25)=24',
            'rn2(25)=11',
            'rn2(25)=7',
            'rn2(25)=23',
            'rn2(19)=10',
        ]);
    });

test('a one-x signature preserves illiterate conduct', async () => {
    const segment = loadEngraveFingertipDustRecipe().segments[0];
    for (const [text, expectedLiteracy] of [
        // engrave.c exempts either case only when x is the sole nonspace.
        ['x', 0],
        ['X', 0],
        // Two letters are the nearest non-exempt control.
        ['xx', 1],
    ]) {
        await runSegment({
            ...segment,
            moves: `${ENGRAVE_SETUP}${ENGRAVE_KEY}${FINGERTIP_KEY}`
                + ` ${text}${ENTER_KEY}${ENGRAVE_WAIT}`,
        });
        assert.equal(game.u.uconduct.literate, expectedLiteracy, text);
    }
});

test('a refused engraving line restores status redraw ownership', async () => {
    const segment = loadEngraveFingertipDustRecipe().segments[0];
    let boundary;
    await runSegment({
        ...segment,
        // Ctrl-P is getline.c's first unsupported editing key. It throws
        // while windows.c getlin() owns gb.bot_disabled.
        moves: `${ENGRAVE_SETUP}${ENGRAVE_KEY}${FINGERTIP_KEY} \u0010`,
    }, { onBoundary: (error) => { boundary = error; } });

    assert.equal(
        boundary instanceof UnsupportedHeroCommandBoundaryError,
        true,
    );
    // cmdq stores command keys as character codes; 69 is uppercase E.
    assert.equal(
        game.context.pendingCommand?.key,
        ENGRAVE_KEY.charCodeAt(0),
    );
    assert.equal(game.gb.bot_disabled, false);
});

test('reading an engraving interrupts a running command after the text',
    async () => {
    // engrave.c read_engr_at():396-402. The run is still active while both
    // messages and the remembered text are written; nomul(0) follows them.
    const state = {
        u: { uprops: [] },
        level: { at: () => ({ typ: ROOM }) },
        context: { run: 1, travel: 1, travel1: 1, mv: 1 },
        multi: 3,
        disp: { botl: false },
        flags: {},
        iflags: {},
        command_queue: [[{ typ: 'canned' }], []],
    };
    const engraving = make_engr_at(
        3,
        4,
        'keep moving',
        null,
        0,
        DUST,
        { state, random: { rn2: () => 0, rnd: () => 1 } },
    );
    const messages = [];
    assert.equal(await read_engr_at(3, 4, state, {
        pline: async (message) => messages.push(message),
    }), true);
    assert.deepEqual(messages, [
        'Something is written here in the dust.',
        'You read: "keep moving".',
    ]);
    assert.equal(engraving.engr_txt[1], 'keep moving');
    assert.equal(state.context.run, 0);
    assert.equal(state.context.travel, 0);
    assert.equal(state.context.travel1, 0);
    assert.equal(state.context.mv, 0);
    assert.equal(state.multi, 0);
    assert.equal(state.u.uinvulnerable, false);
    assert.equal(state.u.usleep, 0);
    assert.equal(state.disp.botl, true);
    assert.deepEqual(state.command_queue, [[], []]);
});
