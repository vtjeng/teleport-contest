import assert from 'node:assert/strict';
import test from 'node:test';

import { ART_SUNSWORD } from '../js/artifacts.js';
import {
    AGGRAVATE_MONSTER,
    ALLOW_BARS,
    ALLOW_DIG,
    ALLOW_M,
    ALLOW_MDISP,
    ALLOW_ROCK,
    ALLOW_SANCT,
    ALLOW_SSM,
    ALLOW_TRAPS,
    ALLOW_TM,
    ALLOW_U,
    ALLOW_WALL,
    ALTAR,
    A_LAWFUL,
    A_NEUTRAL,
    AM_LAWFUL,
    AM_SHRINE,
    ARROW_TRAP,
    BEAR_TRAP,
    BUSTDOOR,
    COLNO,
    CONFLICT,
    DETECT_MONSTERS,
    COULD_SEE,
    DB_ICE,
    DB_MOAT,
    DEAF,
    DISPLACED,
    DOOR,
    DRAWBRIDGE_UP,
    D_BROKEN,
    D_CLOSED,
    D_ISOPEN,
    D_LOCKED,
    DART_TRAP,
    D_TRAPPED,
    DUST,
    FAINTED,
    G_GENOD,
    HALLUC,
    HALLUC_RES,
    HEADSTONE,
    IN_SIGHT,
    INVIS,
    IRONBARS,
    LAVAPOOL,
    LAVAWALL,
    M_AP_OBJECT,
    MMOVE_DONE,
    MMOVE_MOVED,
    MMOVE_NOMOVES,
    MMOVE_NOTHING,
    NOGARLIC,
    NOTONL,
    OPENDOOR,
    PIT,
    POOL,
    PROT_FROM_SHAPE_CHANGERS,
    ROOM,
    ROOMOFFSET,
    ROWNO,
    RUST_TRAP,
    ANTI_MAGIC,
    FIRE_TRAP,
    SLP_GAS_TRAP,
    STEALTH,
    SQKY_BOARD,
    STRAT_WAITMASK,
    STONE,
    TELEP_TRAP,
    TEMPLE,
    TREE,
    UNLOCKDOOR,
    WATER,
    W_NONDIGGABLE,
    W_NONPASSWALL,
    W_ARM,
    W_ARMC,
    W_RINGL,
} from '../js/const.js';
import { A_CHA } from '../js/const.js';
import {
    canSeeMonster,
    canSpotMonster,
} from '../js/startup_a11y.js';
import { effective_attribute } from '../js/attrib.js';
import { make_engr_at, sengr_at } from '../js/engrave.js';
import { online2 } from '../js/hacklib.js';
import { noteleport_level } from '../js/teleport.js';
import { create_region } from '../js/region.js';
import {
    accessible,
    can_fog,
    can_ooze,
    dochugw,
    distfleeck,
    disturb,
    m_can_break_boulder,
    m_avoid_kicked_loc,
    m_avoid_soko_push_loc,
    m_everyturn_effect,
    m_harmless_trap,
    m_in_air,
    mfndpos,
    mon_track_add,
    monhaskey,
    monflee,
    monnear,
    m_move,
    onscary,
    postmov,
    set_apparxy,
    should_displace,
    undesirable_disp,
} from '../js/monmove.js';
// mon_allowflags() is a mon.c function and lives in js/mon.js. Its cases stay
// here because makeState() and ordinaryMonster() below build the level, hero
// and species records they need, and mfndpos() -- the one caller C wrote it
// for -- is tested from the same fixtures.
import { lined_up } from '../js/mthrowu.js';
import { mon_allowflags } from '../js/mon.js';
import { bad_rock, may_dig, may_passwall } from '../js/hack.js';
import { in_your_sanctuary } from '../js/priest.js';
import {
    M1_CLING,
    M1_NEEDPICK,
    M1_TUNNEL,
    MS_LEADER,
    PM_AMOROUS_DEMON,
    PM_ANGEL,
    PM_DEATH,
    PM_DISPLACER_BEAST,
    PM_FOG_CLOUD,
    PM_FLOATING_EYE,
    PM_CAVE_SPIDER,
    PM_ETTIN,
    PM_GIANT_RAT,
    PM_GIANT_EEL,
    PM_GHOST,
    PM_GREMLIN,
    PM_GRID_BUG,
    PM_HILL_GIANT,
    PM_HUMAN,
    PM_HUMAN_ZOMBIE,
    PM_IRON_GOLEM,
    PM_JABBERWOCK,
    PM_LEPRECHAUN,
    PM_LITTLE_DOG,
    PM_LONG_WORM,
    PM_MINOTAUR,
    PM_PURPLE_WORM,
    PM_SALAMANDER,
    PM_SHRIEKER,
    PM_VAMPIRE_LEADER,
    PM_VROCK,
    PM_WHITE_UNICORN,
    PM_WOOD_NYMPH,
    PM_XORN,
    S_HUMAN,
    S_NYMPH,
    monst_globals_init,
    reset_mvitals,
} from '../js/monsters.js';
import { newMonster } from '../js/monst.js';
import { newObject } from '../js/obj.js';
import { init_objects } from '../js/o_init.js';
import {
    COIN_CLASS,
    AXE,
    BOULDER,
    CLOVE_OF_GARLIC,
    CREDIT_CARD,
    DAGGER,
    DART,
    GOLD_DRAGON_SCALE_MAIL,
    LONG_SWORD,
    LOCK_PICK,
    SACK,
    SCR_SCARE_MONSTER,
    SKELETON_KEY,
    objects_globals_init,
} from '../js/objects.js';
import { S_poisoncloud } from '../js/symbols.js';

test('mon_track_add shifts older positions toward the tail', () => {
    const monster = newMonster();
    // Two distinct prior squares expose the newest-first source shift.
    mon_track_add(monster, 10, 5);
    mon_track_add(monster, 11, 5);
    assert.deepEqual(monster.mtrack, [
        { x: 11, y: 5 },
        { x: 10, y: 5 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
    ]);
});

test('peaceful monsters avoid the hero most recently kicked square', () => {
    const { state } = makeState();
    const monster = ordinaryMonster(state, {
        mcansee: true,
        mpeaceful: true,
    });
    // The kicked square is adjacent to the hero and is the tested candidate.
    state.gk = { kickedloc: { x: 9, y: 10 } };

    assert.equal(m_avoid_kicked_loc(monster, 9, 10, state), true);
    monster.mconf = true;
    assert.equal(m_avoid_kicked_loc(monster, 9, 10, state), false);
    monster.mconf = false;
    state.u.uprops[CONFLICT] = {
        intrinsic: 1,
        extrinsic: 0,
        blocked: 0,
    };
    assert.equal(m_avoid_kicked_loc(monster, 9, 10, state), false);
    // monmove.c:1302's `!Conflict`. youprop.h:218 defines Conflict as
    // (HConflict || EConflict) and declares no BConflict, so a blocked mask
    // must not take the term back off. W_ARMC is the cloak mask worn.c:127
    // writes for the six properties that do have a blocked alias; no C path
    // writes any mask here, which is why this state cannot arise in play and
    // the case exists only to pin the spelling.
    state.u.uprops[CONFLICT].blocked = W_ARMC;
    assert.equal(m_avoid_kicked_loc(monster, 9, 10, state), false);
});

test('peaceful monsters avoid pushing an intervening Sokoban boulder', () => {
    const { state } = makeState();
    const monster = ordinaryMonster(state, { mpeaceful: true });
    state.level.flags.sokoban_rules = true;
    // Candidate (8,10) is two squares away; the boulder occupies (9,10).
    state.level.objects[9][10] = objectFor(state, BOULDER);

    assert.equal(m_avoid_soko_push_loc(monster, 8, 10, state), true);
    state.level.flags.sokoban_rules = false;
    assert.equal(m_avoid_soko_push_loc(monster, 8, 10, state), false);
    // monmove.c:1318's `!Conflict`, over youprop.h:218's second disjunct. A
    // ring of conflict is what sets EConflict, so W_RINGL is the mask
    // worn.c:127 would write; the blocked field carries the cloak mask that no
    // C path can write for CONFLICT, since youprop.h declares no BConflict.
    state.level.flags.sokoban_rules = true;
    state.u.uprops[CONFLICT] = {
        intrinsic: 0,
        extrinsic: W_RINGL,
        blocked: W_ARMC,
    };
    assert.equal(m_avoid_soko_push_loc(monster, 8, 10, state), false);
});

test('undesirable_disp preserves pet and ordinary trap knowledge', () => {
    const { state } = makeState();
    const trap = {
        tx: 5,
        ty: 4,
        tseen: true,
        ttyp: ARROW_TRAP,
    };
    state.level.traps.push(trap);
    const pet = ordinaryMonster(state, {
        isminion: false,
        mtame: 5,
    });

    assert.equal(undesirable_disp(pet, trap.tx, trap.ty, {
        cursedObjectAt: () => assert.fail('seen-trap return is immediate'),
        random: {
            rn2(bound) {
                assert.equal(bound, 40);
                return 1; // The usual seen-trap result rejects the square.
            },
        },
        state,
    }), true);

    assert.equal(undesirable_disp(pet, trap.tx, trap.ty, {
        cursedObjectAt: () => true,
        random: {
            rn2(bound) {
                assert.equal(bound, 40);
                return 0; // The one-in-forty exception reaches curse safety.
            },
        },
        state,
    }), true);

    const ordinary = ordinaryMonster(state, {
        // Arrow trap is type one, so its knowledge bit is the low bit.
        mtrapseen: 1,
    });
    assert.equal(undesirable_disp(ordinary, trap.tx, trap.ty, {
        random: { rn2: () => 1 },
        state,
    }), true);
});

test('should_displace compares the shortest ordinary route', () => {
    const { state } = makeState();
    const monster = ordinaryMonster(state, {
        isminion: false,
        mtame: 5,
    });
    const occupant = ordinaryMonster(state, { mx: 6, my: 5 });
    state.level.monsters[6][5] = occupant;
    const data = {
        cnt: 2,
        info: [
            ALLOW_MDISP,
            0, // The second candidate is an unoccupied ordinary square.
        ],
        poss: [
            { x: 6, y: 5 },
            { x: 5, y: 6 },
        ],
    };
    const env = {
        cursedObjectAt: () => false,
        random: { rn2: () => 0 },
        state,
    };

    // Goal (7,5) is one squared step from displacement and five from ordinary.
    assert.equal(should_displace(monster, data, 7, 5, env), true);
    data.poss[1] = { x: 7, y: 5 };
    assert.equal(should_displace(monster, data, 7, 5, env), false);
});

function makeState() {
    const locations = new Map();
    const floorObjects = Array.from(
        { length: COLNO },
        () => Array(ROWNO).fill(null),
    );
    const floorMonsters = Array.from(
        { length: COLNO },
        () => Array(ROWNO).fill(null),
    );
    const uprops = [];
    uprops[INVIS] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    uprops[DEAF] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    uprops[STEALTH] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    uprops[AGGRAVATE_MONSTER] = {
        intrinsic: 0,
        extrinsic: 0,
        blocked: 0,
    };
    uprops[DISPLACED] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    uprops[HALLUC] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    uprops[HALLUC_RES] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    uprops[PROT_FROM_SHAPE_CHANGERS] = {
        intrinsic: 0,
        extrinsic: 0,
        blocked: 0,
    };
    const state = {
        invent: null,
        moves: 1,
        dungeons: [{ flags: { hellish: false } }],
        astral_level: { dnum: 99, dlevel: 1 },
        // decl.c's `go`. cmd.c set_occupation() writes go.occupation here,
        // and monmove.c dochugw() reads it; the tests below install a
        // callback the same way the running game does.
        go: {},
        level: {
            flags: {
                arboreal: false,
                has_temple: false,
                sokoban_rules: false,
            },
            monlist: null,
            monsters: floorMonsters,
            objects: floorObjects,
            regions: [],
            rooms: [],
            traps: [],
            worms: [],
            at(x, y) {
                return locations.get(`${x},${y}`) ?? { typ: ROOM, flags: 0 };
            },
        },
        track: {
            utcnt: 0,
            utpnt: 0,
            utrack: [],
        },
        u: {
            ux: 10,
            uy: 10,
            uinwater: false,
            uprops,
            ustuck: null,
            ualign: { record: 10, type: A_LAWFUL },
            urooms: [0, 0, 0, 0, 0],
            uz: { dnum: 0, dlevel: 1 },
        },
        youmonst: newMonster(),
    };
    monst_globals_init(state);
    reset_mvitals(state);
    objects_globals_init(state);
    return { locations, state };
}

function ordinaryMonster(state, overrides = {}) {
    return newMonster({
        data: state.mons[PM_GIANT_RAT],
        mnum: PM_GIANT_RAT,
        mx: 4,
        my: 4,
        mux: 0,
        muy: 0,
        mcansee: true,
        ...overrides,
    });
}

function objectFor(state, otyp, overrides = {}) {
    return newObject({
        otyp,
        oclass: state.objects[otyp].oc_class,
        quan: 1,
        ...overrides,
    });
}

function sealNeighborhood(locations, x, y) {
    for (let nx = x - 1; nx <= x + 1; ++nx) {
        for (let ny = y - 1; ny <= y + 1; ++ny) {
            if (nx === x && ny === y) continue;
            locations.set(`${nx},${ny}`, {
                typ: STONE,
                flags: 0,
                wall_info: W_NONDIGGABLE | W_NONPASSWALL,
            });
        }
    }
}

function sequenceRandom(values, calls) {
    return {
        rn2(bound) {
            calls.push(bound);
            assert.ok(values.length, `unexpected rn2(${bound})`);
            const value = values.shift();
            assert.ok(value >= 0 && value < bound);
            return value;
        },
    };
}

function deferred() {
    let resolve;
    const promise = new Promise((accept) => { resolve = accept; });
    return { promise, resolve };
}

// postmov() takes the square the monster stands on from the level, so each
// case below puts the monster on that square first.
// mintrap() proves the whole random set trapeffect_selector() can dispatch to
// before its first write, so a fixture that names only the draws it expects no
// longer reaches the code under test -- it is refused for the absent ones. This
// keeps the "no draw is due" intent by making every unnamed operation fail
// loudly if it is ever called, while still satisfying the presence check.
function trapRandom(overrides = {}) {
    const refuse = (name) => () => assert.fail(`no ${name} draw is due`);
    return {
        rn1: refuse('rn1'),
        rn2: refuse('rn2'),
        rnd: refuse('rnd'),
        rne: refuse('rne'),
        rnl: refuse('rnl'),
        ...overrides,
    };
}

function postmovEnv(state, overrides = {}) {
    const redraws = [];
    const messages = [];
    const visionCalls = [];
    const env = {
        state,
        redraw: (x, y) => { redraws.push([x, y]); },
        message: (line) => { messages.push(line); },
        recalcBlockPoint: (x, y) => { visionCalls.push(['recalc', x, y]); },
        visionRecalc: (control) => { visionCalls.push(['view', control]); },
        unsupported: (reason) => assert.fail(`unexpected refusal: ${reason}`),
        ...overrides,
    };
    return { env, redraws, messages, visionCalls };
}

// C ref: monmove.c postmov()'s door block (1520-1622). Three of its four
// acting arms test D_LOCKED or D_CLOSED and the fourth tests whole-mask
// equality with D_CLOSED; the magic-key disarm above them at monmove.c:1539
// tests D_TRAPPED alone, and these masks carry no D_TRAPPED bit. So a monster
// standing on a doorless, broken or open doorway falls through the block: the
// doormask keeps its value and the block prints nothing.
test('postmov leaves an inert doorway alone', async () => {
    for (const mask of [0 /* D_NODOOR */, D_BROKEN, D_ISOPEN]) {
        const { locations, state } = makeState();
        const monster = ordinaryMonster(state, { mx: 5, my: 4 });
        locations.set('5,4', { typ: DOOR, flags: mask });
        const { env, redraws } = postmovEnv(state);

        assert.equal(
            await postmov(monster, 4, 4, MMOVE_MOVED, false, false, false, env),
            MMOVE_MOVED,
            `mask ${mask}`,
        );
        // C ref: monmove.c:1508 and :1656, the two newsym() calls that bracket
        // the door block.
        assert.deepEqual(redraws, [[4, 4], [5, 4]], `mask ${mask}`);
        assert.equal(state.level.at(5, 4).flags, mask);
        assert.equal(state.level.at(5, 4).typ, DOOR);
    }
});

// Each arm of the block that the port does not own, named by the refusal it
// raises. The fourth case is the doorbuster arm reached from the other side:
// mfndpos() offers a closed door to a monster without can_open only when it
// smashes doors down, so C falls past the D_CLOSED arm into it.
test('postmov refuses every door arm it does not own', async () => {
    const cases = [
        {
            mask: D_ISOPEN | D_TRAPPED,
            canUnlock: false,
            canOpen: true,
            reason: 'a door trap under a monster',
        },
        {
            mask: D_LOCKED,
            canUnlock: true,
            canOpen: true,
            reason: 'a monster unlocking a door',
        },
        {
            mask: D_LOCKED,
            canUnlock: false,
            canOpen: true,
            reason: 'a monster smashing down a door',
        },
        {
            mask: D_CLOSED,
            canUnlock: false,
            canOpen: false,
            reason: 'a monster smashing down a door',
        },
    ];
    for (const { mask, canUnlock, canOpen, reason } of cases) {
        const { locations, state } = makeState();
        const monster = ordinaryMonster(state, { mx: 5, my: 4 });
        locations.set('5,4', { typ: DOOR, flags: mask });
        const { env } = postmovEnv(state, {
            unsupported: (refusal) => { throw new Error(refusal); },
        });

        await assert.rejects(
            postmov(
                monster, 4, 4, MMOVE_MOVED, false, canUnlock, canOpen, env,
            ),
            (error) => error.message === reason,
            `mask ${mask}`,
        );
        // The refusal comes before the arm that would rewrite the mask.
        assert.equal(state.level.at(5, 4).flags, mask, `mask ${mask}`);
    }
});

// C ref: monmove.c:1548-1553. An amorphous monster flows under a locked or
// closed door instead of opening it, and leaves the doormask alone.
test('postmov refuses the amorphous arm ahead of the door it could open',
    async () => {
        const { locations, state } = makeState();
        const fogCloud = ordinaryMonster(state, {
            data: state.mons[PM_FOG_CLOUD],
            mnum: PM_FOG_CLOUD,
            mx: 5,
            my: 4,
        });
        locations.set('5,4', { typ: DOOR, flags: D_CLOSED });
        const { env } = postmovEnv(state, {
            unsupported: (refusal) => { throw new Error(refusal); },
        });

        await assert.rejects(
            postmov(fogCloud, 4, 4, MMOVE_MOVED, false, false, true, env),
            (error) => error.message === 'a monster oozing under a door',
        );
        assert.equal(state.level.at(5, 4).flags, D_CLOSED);
    });

// A hero-visible square for cansee(); the fixture leaves viz_array unset,
// which is what makes every other case here an unseen one.
function seeSquare(state, x, y) {
    state.viz_array ??= Array.from(
        { length: ROWNO },
        () => new Uint8Array(COLNO),
    );
    state.viz_array[y][x] = IN_SIGHT | COULD_SEE;
}

// C ref: monmove.c:1576-1592, the arm this port owns, and the UnblockDoor
// macro at 1526-1536 that it and its three refused siblings share.
test('postmov opens a closed door and reports what the hero heard',
    async () => {
        const { locations, state } = makeState();
        state.flags = { verbose: true, acoustics: true };
        const monster = ordinaryMonster(state, { mx: 5, my: 4 });
        locations.set('5,4', { typ: DOOR, flags: D_CLOSED });
        const { env, redraws, messages, visionCalls } = postmovEnv(state);

        assert.equal(
            await postmov(monster, 4, 4, MMOVE_MOVED, false, false, true, env),
            MMOVE_MOVED,
        );
        // UnblockDoor writes D_ISOPEN, not the D_NODOOR its `!btrapped`
        // ternary picks: whole-mask equality with D_CLOSED excludes D_TRAPPED.
        assert.equal(state.level.at(5, 4).flags, D_ISOPEN);
        assert.equal(state.level.at(5, 4).doormask, D_ISOPEN);
        // The old square, then UnblockDoor's redraw of the door, then
        // monmove.c:1656's redraw of the square the monster reached.
        assert.deepEqual(redraws, [[4, 4], [5, 4], [5, 4]]);
        assert.deepEqual(visionCalls, [['recalc', 5, 4], ['view', 0]]);
        assert.deepEqual(messages, ['You hear a door open.']);
    });

// The two arms below need a hero who can see the door square. The first is
// recorded: two segments of scripts/run-monster-door-open.mjs put the hero in
// sight of the opener, and this test pins the same arm against postmov()
// directly. The second is not, and cannot be on this level: `You see a door
// open.` needs canspotmon() to fail for a monster the hero can see, which
// means an invisible one, and ROADMAP.md records why nothing behind the
// current boundary sets minvis on dungeon level one.
test('postmov names a spotted monster that opens a door in sight',
    async () => {
        const { locations, state } = makeState();
        state.flags = { verbose: true, acoustics: true };
        const monster = ordinaryMonster(state, { mx: 5, my: 4, mhp: 3 });
        locations.set('5,4', { typ: DOOR, flags: D_CLOSED });
        seeSquare(state, 5, 4);
        const { env, messages } = postmovEnv(state);

        await postmov(monster, 4, 4, MMOVE_MOVED, false, false, true, env);
        assert.deepEqual(messages, ['The giant rat opens a door.']);
    });

test('postmov describes a door opened in sight by a monster it cannot spot',
    async () => {
        const { locations, state } = makeState();
        state.flags = { verbose: true, acoustics: true };
        const monster = ordinaryMonster(state, {
            mx: 5,
            my: 4,
            mhp: 3,
            minvis: true,
        });
        locations.set('5,4', { typ: DOOR, flags: D_CLOSED });
        seeSquare(state, 5, 4);
        const { env, messages } = postmovEnv(state);

        await postmov(monster, 4, 4, MMOVE_MOVED, false, false, true, env);
        assert.deepEqual(messages, ['You see a door open.']);
    });

// Three separate gates silence the same opening: flags.verbose around the
// whole switch (monmove.c:1583), the Deaf test on its last arm (1588), and
// You_hear()'s own flags.acoustics return (pline.c:440). The door still opens
// in each case.
test('postmov opens the door silently for verbose, Deaf and acoustics',
    async () => {
        const silencers = [
            { label: 'verbose off', flags: { verbose: false, acoustics: true } },
            { label: 'acoustics off', flags: { verbose: true, acoustics: false } },
            { label: 'deaf', flags: { verbose: true, acoustics: true },
                deaf: true },
            // You_hear() returns early only when Deaf and aware, so a Deaf
            // hero who is also Unaware reaches its "You dream that you hear"
            // prefix. What silences that one is the call site's own !Deaf
            // test, and nothing else in either function.
            { label: 'deaf while unaware',
                flags: { verbose: true, acoustics: true },
                deaf: true, unaware: true },
        ];
        for (const { label, flags, deaf, unaware } of silencers) {
            const { locations, state } = makeState();
            state.flags = flags;
            if (deaf) state.u.uprops[DEAF] = { intrinsic: 1, extrinsic: 0 };
            if (unaware) {
                state.multi = -1;
                state.u.usleep = 1;
            }
            const monster = ordinaryMonster(state, { mx: 5, my: 4 });
            locations.set('5,4', { typ: DOOR, flags: D_CLOSED });
            const { env, messages } = postmovEnv(state);

            await postmov(monster, 4, 4, MMOVE_MOVED, false, false, true, env);
            assert.deepEqual(messages, [], label);
            assert.equal(state.level.at(5, 4).flags, D_ISOPEN, label);
        }
    });

// C ref: monmove.c:1624-1647. Iron bars are the door block's sibling: a rust
// monster or a metallivore eats through them and anything else squeezes past
// with a Norep() message. Neither is ported.
// C ref: monmove.c:1509. mintrap() runs for every MMOVE_MOVED, including a
// monster whose square did not change — dog_move() returns MMOVE_MOVED even
// when the pet stays put, so the call reads the monster's live square rather
// than a destination. ARROW_TRAP stands for every type whose monster arm is
// still unported; trapeffect_selector() is what stops the scan.
test('postmov refuses a move that ends on an unported trap type', async () => {
    const { state } = makeState();
    const monster = ordinaryMonster(state, { mx: 5, my: 4 });
    // ARROW_TRAP. Chosen because floor_trigger() admits it and its monster arm
    // is queued for a later slice, so the refusal has to come from the
    // selector rather than from a destination check.
    state.level.traps = [{ tx: 5, ty: 4, ttyp: ARROW_TRAP, tseen: false }];
    const { env } = postmovEnv(state, {
        random: trapRandom({ rnl: () => 0 }),
        unsupported: (refusal) => { throw new Error(refusal); },
    });

    await assert.rejects(
        postmov(monster, 5, 4, MMOVE_MOVED, false, false, true, env),
        (error) => error.message === 'trap activation',
    );
});

// The eager proof itself, which no test pinned: every other fixture supplies
// all five random operations, so deleting mintrap()'s check restored the
// original defect with the suite green. A short set has to be refused before
// mon_learns_traps() writes mtrapseen on the victim and before the rn2(4) and
// rnl(5) gates can draw.
//
// Only the random half is reachable from here. postmov() supplies message,
// redraw, heroDeaf, mInAir and youHear itself (js/monmove.js:2392-2398), so
// mintrap()'s owner loop answers to a direct caller rather than to this path;
// scripts/monster-dart-trap.test.mjs owns that half.
test('postmov proves a trap\'s random set before the first write or draw',
    async () => {
        const { state } = makeState();
        const monster = ordinaryMonster(state, { mx: 5, my: 4 });
        state.level.monlist = monster;
        state.level.traps = [
            { tx: 5, ty: 4, ttyp: SQKY_BOARD, tnote: 9, tseen: false },
        ];
        // mintrap()'s own two draws, but the dart arm the selector can also
        // dispatch to reaches mksobj() and next_ident(), which need three more.
        const { env } = postmovEnv(state, {
            random: { rn2: () => 0, rnl: () => 0 },
            unsupported: (refusal) => { throw new Error(refusal); },
        });

        await assert.rejects(
            postmov(monster, 4, 4, MMOVE_MOVED, false, false, true, env),
            (error) => error instanceof TypeError,
        );
        // The whole point: nothing was written before the refusal.
        assert.equal(monster.mtrapseen ?? 0, 0);
        assert.equal(state.level.traps[0].tseen, false);
    });

// The sibling: mintrap() must not widen into a blanket refusal, or every
// ordinary move would stop. C returns Trap_Effect_Finished with no draw for a
// monster standing on no trap at all.
test('postmov admits a move that ends on a trapless square', async () => {
    const { state } = makeState();
    const monster = ordinaryMonster(state, { mx: 5, my: 4, mtrapped: 1 });
    state.level.traps = [];
    const { env } = postmovEnv(state, {
        random: trapRandom({ rnl: () => 0 }),
        unsupported: (refusal) => { throw new Error(refusal); },
    });

    await postmov(monster, 4, 4, MMOVE_MOVED, false, false, true, env);
    // trap.c:3740, the `!trap` arm: "perhaps teleported?"
    assert.equal(monster.mtrapped, false);
});

// C ref: trap.c trapeffect_sqky_board() (1457-1473), the arm the hero reads as
// a sound. The monster stands out of sight, so canseemon() is false, and the
// hero is far enough away for the "in the distance" half of the threshold.
test('postmov squeaks a board under a monster the hero cannot see',
    async () => {
        const { state } = makeState();
        // pline.c You_hear() returns without printing when acoustics is off.
        state.flags = { acoustics: true };
        const monster = ordinaryMonster(state, { mx: 5, my: 4 });
        state.level.monlist = monster;
        // tnote 9 is "A note" in trap.c trapnote()'s tnnames[], the note the
        // recorded squeaky-board sessions carry.
        state.level.traps = [
            { tx: 5, ty: 4, ttyp: SQKY_BOARD, tnote: 9, tseen: false },
        ];
        const { env, messages, redraws } = postmovEnv(state, {
            random: trapRandom({ rnl: () => 0 }),
            unsupported: (refusal) => { throw new Error(refusal); },
        });

        await postmov(monster, 4, 4, MMOVE_MOVED, false, false, true, env);
        assert.deepEqual(
            messages,
            ['You hear an A note squeak in the distance.'],
        );
        // seetrap() belongs to the in-sight arm alone, so an unseen squeak
        // leaves the trap unmapped and repaints only the two move squares.
        assert.equal(state.level.traps[0].tseen, false);
        assert.deepEqual(redraws, [[4, 4], [5, 4]]);
        // mondata.c mon_learns_traps(): the victim remembers the type, which
        // is what makes mintrap()'s rn2(4) arm reachable on a later trigger.
        assert.equal(monster.mtrapseen, 1 << (SQKY_BOARD - 1));
    });

// C ref: trap.c:1462-1470. The out-of-sight arm reports `nearby` or `in the
// distance` from mdistu(mtmp) against range squared, where range is BOLT_LIM+1
// when couldsee() holds for the monster's square and BOLT_LIM-3 when it does
// not. No fresh recording reaches `nearby`, because a waiting hero stands in a
// lit room where a monster that close is visible instead;
// scripts/run-monster-squeaky-board.mjs says why and defers to this test.
test('postmov chooses the squeak distance from couldsee and mdistu',
    async () => {
        // The hero stands at <10,10>. BOLT_LIM is 8, so the thresholds are 81
        // with couldsee() and 25 without.
        const cases = [
            // dx 0, dy 4: mdistu 16, inside 25, so near either way.
            { mx: 10, my: 6, seen: false, word: 'nearby' },
            // dx 0, dy 6: mdistu 36, outside 25 and inside 81, so the range
            // term is the only thing that decides.
            { mx: 10, my: 4, seen: false, word: 'in the distance' },
            { mx: 10, my: 4, seen: true, word: 'nearby' },
            // dx 0, dy 9: mdistu 81, exactly the boundary C admits with <=.
            { mx: 10, my: 1, seen: true, word: 'nearby' },
        ];
        for (const { mx, my, seen, word } of cases) {
            const { state } = makeState();
            state.flags = { acoustics: true };
            const monster = ordinaryMonster(state, { mx, my });
            state.level.monlist = monster;
            state.level.traps = [
                { tx: mx, ty: my, ttyp: SQKY_BOARD, tnote: 9, tseen: false },
            ];
            if (seen) {
                // COULD_SEE without IN_SIGHT: couldsee() holds and cansee()
                // does not, which is what an unlit room square looks like and
                // the only way canseemon() can be false this close.
                state.viz_array = Array.from(
                    { length: ROWNO },
                    () => new Uint8Array(COLNO),
                );
                state.viz_array[my][mx] = COULD_SEE;
            }
            const { env, messages } = postmovEnv(state, {
                random: trapRandom({ rnl: () => 0 }),
                unsupported: (refusal) => { throw new Error(refusal); },
            });

            await postmov(monster, mx, my, MMOVE_MOVED, false, false, true, env);
            assert.deepEqual(
                messages,
                [`You hear an A note squeak ${word}.`],
                `<${mx},${my}> couldsee ${seen}`,
            );
        }
    });

// C ref: trap.c:1473, the last statement of trapeffect_sqky_board():
// `wake_nearto(mtmp->mx, mtmp->my, 40)`. Waking the neighbours is the point of
// a squeaky board -- a monster left asleep moves, draws and speaks differently
// for the rest of the game -- and no other case in this file places a sleeping
// monster inside the radius.
//
// The distance term is pinned as well as the call. mon.c wake_nearto() skips a
// monster whose dist2 is >= the bound, so a monster at exactly 40 stays
// asleep. 39 is not a sum of two squares, so no placement separates a bound of
// 40 from one of 39; 41 is separated by the sleeper at dist2 40 below.
test('postmov wakes the sleepers a squeaky board reaches and no others',
    async () => {
        const { state } = makeState();
        state.flags = { acoustics: true };
        const monster = ordinaryMonster(state, { mx: 5, my: 4 });
        // dx 6, dy 0 from the board: dist2 36, inside 40.
        const near = ordinaryMonster(state, {
            mx: 11,
            my: 4,
            mhp: 5,
            msleeping: true,
            mstrategy: STRAT_WAITMASK,
        });
        // dx 6, dy 2: dist2 40 exactly, which C's `>=` excludes.
        const far = ordinaryMonster(state, {
            mx: 11,
            my: 6,
            mhp: 5,
            msleeping: true,
            mstrategy: STRAT_WAITMASK,
        });
        monster.nmon = near;
        near.nmon = far;
        state.level.monlist = monster;
        state.level.traps = [
            { tx: 5, ty: 4, ttyp: SQKY_BOARD, tnote: 9, tseen: false },
        ];
        const { env, messages } = postmovEnv(state, {
            random: trapRandom({ rnl: () => 0 }),
            unsupported: (refusal) => { throw new Error(refusal); },
        });

        await postmov(monster, 4, 4, MMOVE_MOVED, false, false, true, env);

        assert.equal(near.msleeping, false);
        // mon.c:4387 clears the waiting bits for a monster that is not unique.
        assert.equal(near.mstrategy & STRAT_WAITMASK, 0);
        assert.equal(far.msleeping, true);
        assert.equal(far.mstrategy & STRAT_WAITMASK, STRAT_WAITMASK);
        // Neither sleeper is in sight, so wake_msg() prints nothing and the
        // squeak stays the only line.
        assert.deepEqual(
            messages,
            ['You hear an A note squeak in the distance.'],
        );
    });

// C ref: trap.c:3812. A monster that already knows the type escapes on three
// of four draws, before mon_learns_traps(), mons_see_trap() and the effect.
test('postmov lets a monster that knows the board escape on rn2(4)',
    async () => {
        for (const [roll, squeaks] of [[1, false], [0, true]]) {
            const { state } = makeState();
            state.flags = { acoustics: true };
            const monster = ordinaryMonster(state, {
                mx: 5,
                my: 4,
                mtrapseen: 1 << (SQKY_BOARD - 1),
            });
            state.level.monlist = monster;
            state.level.traps = [
                { tx: 5, ty: 4, ttyp: SQKY_BOARD, tnote: 9, tseen: false },
            ];
            const bounds = [];
            const { env, messages } = postmovEnv(state, {
                random: trapRandom({
                    rn2: (bound) => { bounds.push(bound); return roll; },
                    rnl: () => 0,
                }),
                unsupported: (refusal) => { throw new Error(refusal); },
            });

            await postmov(monster, 4, 4, MMOVE_MOVED, false, false, true, env);
            assert.deepEqual(bounds, [4], `roll ${roll}`);
            assert.equal(messages.length, squeaks ? 1 : 0, `roll ${roll}`);
        }
    });

// C ref: trap.c trapeffect_dart_trap() (1294-1318) into thitm() (6709-6773).
// The whole monster arm, from the misfire gate through the missed dart landing
// on the floor. The rolls below select that path from the C source: rnd(20)
// returns 1, which cannot reach the giant rat's find_mac() of 7 plus thitm()'s
// tlev of 7, and every rn2() returns 1, which fails `!rn2(11)`, `!rn2(10)`,
// `!rn2(100)` and `!rn2(80)` in mksobj_init() and `!rn2(6)` in the dart arm, so
// the dart is plain and uneroded. rn1(6, 6) is the multigen quantity
// t_missile() overwrites with 1.
function dartTrapState(overrides = {}) {
    const { locations, state } = makeState();
    // o_init.c init_objects() shuffles descriptions; a zero random keeps the
    // catalog in its source order, which is what the pinned names below read.
    init_objects(state, () => 0);
    state.flags = { acoustics: true, verbose: true };
    // mkobj.c next_ident() reads and advances this counter.
    state.context = { ident: 1 };
    state.level.objlist = null;
    state.level.traps = [{
        tx: 5,
        ty: 4,
        ttyp: DART_TRAP,
        tseen: false,
        once: false,
        madeby_u: false,
        ...overrides,
    }];
    // canseemon() rejects a monster with no hit points, so the in-sight arm
    // needs a live one.
    const monster = ordinaryMonster(state, { mx: 5, my: 4, mhp: 3 });
    state.level.monlist = monster;
    state.level.monsters[5][4] = monster;
    return { locations, state, monster };
}

function plainMissRandom(overrides = {}) {
    return {
        rn1: (_bound, offset) => offset,
        rn2: () => 1,
        rnd: () => 1,
        rne: () => 1,
        rnl: () => 1,
        ...overrides,
    };
}

test('postmov shoots a dart at a monster the hero watches and misses',
    async () => {
        const { state, monster } = dartTrapState();
        seeSquare(state, 5, 4);
        const { env, messages, redraws } = postmovEnv(state, {
            random: plainMissRandom(),
            unsupported: (refusal) => { throw new Error(refusal); },
        });
        const discoBefore = JSON.stringify(state.svd.disco);

        await postmov(monster, 4, 4, MMOVE_MOVED, false, false, true, env);

        assert.deepEqual(
            messages,
            ['The giant rat is almost hit by a dart!'],
        );
        // The port's own comment calls doname()'s discovery side effect
        // load-bearing, and the message text alone does not pin it: a namer
        // that produced the same words without discovering the type would
        // pass. C names the missile through xname() -> observe_object().
        assert.equal(state.objects[DART].oc_encountered, 1);
        assert.equal(state.level.objects[5][4].dknown, true);
        assert.notEqual(JSON.stringify(state.svd.disco), discoBefore);
        // trap.c:1308. The trap remembers that it has fired, which is what
        // arms the misfire gate on the next monster to step on it.
        assert.equal(state.level.traps[0].once, true);
        // seetrap() runs for an in-sight victim and repaints the trap square
        // between the two newsym() calls postmov() brackets the block with.
        assert.equal(state.level.traps[0].tseen, true);
        assert.deepEqual(redraws, [[4, 4], [5, 4], [5, 4]]);
        // trap.c:6766-6768. A missed missile is placed and stacked where the
        // target stands, with the quantity and coordinates t_missile() set.
        const dart = state.level.objects[5][4];
        assert.equal(dart.otyp, DART);
        assert.equal(dart.quan, 1);
        // trap.c:1023 recomputes the weight precisely because the line above
        // it has just overwritten a multigen quantity: mksobj() gave the stack
        // rn1(6, 6) darts, so the fixture's rn1 leaves 6 here, and a dart
        // weighs 1. Without the recomputation the single dart on the floor
        // carries the stack's 6, which then feeds curr_mon_load() and every
        // carrying-capacity branch of whatever picks it up.
        assert.equal(dart.owt, 1);
        assert.equal(dart.ox, 5);
        assert.equal(dart.oy, 4);
        assert.equal(dart.opoisoned, false);
        assert.equal(state.level.objlist, dart);
        // mondata.c mon_learns_traps(): the victim remembers the type.
        assert.equal(monster.mtrapseen, 1 << (DART_TRAP - 1));
    });

// C ref: trap.c:1294-1295 and 6732-6734. The monster arm reads two different
// visibility tests: `in_sight = canseemon(mtmp) || mtmp == u.usteed`, which
// gates seetrap(), and `cansee(mtmp->mx, mtmp->my)`, which gates thitm()'s
// message. Every other fixture here and every firing in the checked-in matrix
// keeps the two in agreement, so conflating them passes. An invisible monster
// on a square the hero can see separates them: the dart's line is written
// because the square is visible, and the trap stays unseen because the monster
// is not. Nothing on dungeon level one sets minvis, so this is unit-only.
//
// The hero also needs to sense the monster, and that is not incidental.
// thitm()'s line names the victim through C's Monnam(), whose x_monnam()
// do_it branch (do_name.c:863, 876-882) returns "It" when canspotmon() is
// false -- and minvis alone makes it false. The port has no do_it branch, so
// it would answer the species name where C answers "It", and an earlier
// version of this case pinned that wrong string as correct. Detection keeps
// canspotmon() true through sensemon(), which separates the two gates this
// case is about without dragging in an unported naming branch. The missing
// do_it branch is recorded under `## Unresolved` in ROADMAP.md.
test('postmov separates the dart line gate from the seetrap gate', async () => {
    const { state, monster } = dartTrapState();
    seeSquare(state, 5, 4);
    monster.minvis = true;
    state.u.uprops[DETECT_MONSTERS] = { intrinsic: 1, extrinsic: 0 };
    const { env, messages } = postmovEnv(state, {
        random: plainMissRandom(),
        unsupported: (refusal) => { throw new Error(refusal); },
    });

    await postmov(monster, 4, 4, MMOVE_MOVED, false, false, true, env);

    // The two gates the case exists to separate, asserted directly rather than
    // inferred from the output: the monster cannot be seen, so seetrap() is
    // skipped, but it can be spotted, so C's Monnam() gives the species name
    // rather than "It".
    assert.equal(canSeeMonster(monster, state), false);
    assert.equal(canSpotMonster(monster, state), true);
    // cansee() of the square is true, so thitm() writes its line.
    assert.deepEqual(
        messages,
        ['The giant rat is almost hit by a dart!'],
    );
    assert.equal(state.level.traps[0].tseen, false);
});

// C ref: trap.c:6732-6734. The line is the only part of the arm that cansee()
// gates; the dart still lands, and seetrap() still does not run, because
// canseemon() is false as well.
test('postmov drops the dart silently for a monster out of sight', async () => {
    const { state, monster } = dartTrapState();
    const { env, messages, redraws } = postmovEnv(state, {
        random: plainMissRandom(),
        unsupported: (refusal) => { throw new Error(refusal); },
    });

    await postmov(monster, 4, 4, MMOVE_MOVED, false, false, true, env);

    assert.deepEqual(messages, []);
    assert.equal(state.level.traps[0].once, true);
    assert.equal(state.level.traps[0].tseen, false);
    assert.deepEqual(redraws, [[4, 4], [5, 4]]);
    assert.equal(state.level.objects[5][4].otyp, DART);
    // The mirror of the in-sight case: C reaches doname() only under
    // cansee(), so an unseen dart discovers nothing.
    assert.equal(state.objects[DART].oc_encountered ?? 0, 0);
    assert.notEqual(state.level.objects[5][4].dknown, true);
});

// C ref: trap.c:1023. t_missile() clears opoisoned after mksobj(), which makes
// the arm's own rn2(6) the sole poison source. Every other case leaves
// mksobj()'s rn2(100) unpoisoned too, so `assert.equal(dart.opoisoned, false)`
// there is satisfied by the default and pins nothing. This case poisons the
// missile at generation and requires the reset to undo it.
test('postmov clears a dart poisoned by its own generation', async () => {
    const { state, monster } = dartTrapState();
    seeSquare(state, 5, 4);
    const bounds = [];
    const { env, messages } = postmovEnv(state, {
        // 0 for bound 100 is mksobj_init()'s poison roll; the arm's own
        // bound-6 roll stays non-zero, so any poison left on the dart came
        // from generation and survived a reset that should have cleared it.
        random: plainMissRandom({
            rn2: (bound) => { bounds.push(bound); return bound === 100 ? 0 : 1; },
        }),
        unsupported: (refusal) => { throw new Error(refusal); },
    });

    await postmov(monster, 4, 4, MMOVE_MOVED, false, false, true, env);

    assert.deepEqual(
        messages,
        ['The giant rat is almost hit by a dart!'],
    );
    // The precondition, asserted rather than assumed: without it this case
    // reverts to the vacuous shape it was written to repair the moment
    // mksobj_init() stops making that draw.
    assert.ok(
        bounds.includes(100),
        `mksobj_init() must roll its poison chance; saw ${bounds}`,
    );
    assert.equal(state.level.objects[5][4].opoisoned, false);
});

// C ref: trap.c:1310. The dart arm's own rn2(6) poisons the missile, which
// doname() reports; mksobj_init()'s rn2(100) is a separate roll and stays
// unpoisoned here.
test('postmov names a poisoned dart when the trap arm rolls zero', async () => {
    const { state, monster } = dartTrapState();
    seeSquare(state, 5, 4);
    const { env, messages } = postmovEnv(state, {
        // Only the bound-6 draw is the dart arm's poison roll; every other
        // rn2() in the sequence keeps the plain path above.
        random: plainMissRandom({ rn2: (bound) => (bound === 6 ? 0 : 1) }),
        unsupported: (refusal) => { throw new Error(refusal); },
    });

    await postmov(monster, 4, 4, MMOVE_MOVED, false, false, true, env);

    assert.deepEqual(
        messages,
        ['The giant rat is almost hit by a poisoned dart!'],
    );
    assert.equal(state.level.objects[5][4].opoisoned, true);
});

// C ref: trap.c:6743-6760. A dart that strikes needs weapon.c dmgval() for its
// damage and doname() for its message; the refusal comes after the to-hit
// roll, which C makes either way, and before the message, the damage and the
// missile's disposal.
test('postmov refuses a dart that hits its target', async () => {
    const { state, monster } = dartTrapState();
    seeSquare(state, 5, 4);
    const { env, messages } = postmovEnv(state, {
        // C: strike = find_mac(mon) + tlev + obj->spe <= rnd(20). A giant
        // rat's find_mac() is 7 and thitm()'s tlev is 7; plainMissRandom()
        // leaves spe at 0, so 14 is the smallest rnd(20) that strikes. The
        // boundary pair below pins that sum at exactly 14; this case only
        // needs a value at or above it.
        random: plainMissRandom({ rnd: (bound) => (bound === 20 ? 14 : 1) }),
        unsupported: (refusal) => { throw new Error(refusal); },
    });

    await assert.rejects(
        postmov(monster, 4, 4, MMOVE_MOVED, false, false, true, env),
        (error) => error.message === 'a monster struck by a trap missile',
    );
    assert.deepEqual(messages, []);
    assert.equal(state.level.objects[5][4], null);
});

// The pair that pins the threshold. Without it the six dart cases roll 1 for a
// miss and something far above 14 for a strike, so an error of up to six points
// in find_mac() or tlev leaves them all green -- and `<=` in thitm() can be
// weakened to `<` with no test noticing.
//
// The enchanted rows are what pin the `+ obj->spe` term itself, and with it
// find_mac()'s contribution: plainMissRandom() fails both enchantment gates in
// mksobj_init(), so the plain pair measures the sum with the term contributing
// nothing. mkobj gives a trap dart a nonzero spe on 2 firings in 11.
test('postmov puts the dart miss and strike either side of fourteen',
    async () => {
        // js/obj.js mksobj_init() takes the `!rn2(11)` arm and sets
        // spe = rne(3); pinning rne at 2 puts the boundary at 7 + 7 + 2 == 16.
        const enchanted = {
            rn2: (bound) => (bound === 11 ? 0 : 1),
            rne: () => 2,
        };
        for (const [roll, expectation, overrides] of [
            [13, 'miss', {}],
            [14, 'strike', {}],
            // 15 strikes without the term and misses with it.
            [15, 'miss', enchanted],
            [16, 'strike', enchanted],
        ]) {
            const { state, monster } = dartTrapState();
            seeSquare(state, 5, 4);
            const { env, messages } = postmovEnv(state, {
                random: plainMissRandom({
                    rnd: (bound) => (bound === 20 ? roll : 1),
                    ...overrides,
                }),
                unsupported: (refusal) => { throw new Error(refusal); },
            });
            const run = postmov(
                monster, 4, 4, MMOVE_MOVED, false, false, true, env,
            );

            if (expectation === 'miss') {
                await run;
                assert.deepEqual(
                    messages,
                    ['The giant rat is almost hit by a dart!'],
                    `rnd(20) of ${roll} must miss`,
                );
                assert.notEqual(state.level.objects[5][4], null);
            } else {
                await assert.rejects(
                    run,
                    (error) => error.message === 'a monster struck by a trap missile',
                    `rnd(20) of ${roll} must strike`,
                );
                assert.deepEqual(messages, []);
            }
        }
    });

// C ref: trap.c:1299-1307. A trap that has already fired under a hero who has
// seen it wears out on one roll in fifteen, which needs deltrap().
test('postmov refuses a dart trap that wears out', async () => {
    const { state, monster } = dartTrapState({ once: true, tseen: true });
    seeSquare(state, 5, 4);
    const bounds = [];
    const { env, messages } = postmovEnv(state, {
        random: plainMissRandom({
            rn2: (bound) => { bounds.push(bound); return 0; },
        }),
        unsupported: (refusal) => { throw new Error(refusal); },
    });

    await assert.rejects(
        postmov(monster, 4, 4, MMOVE_MOVED, false, false, true, env),
        (error) => error.message === 'a dart trap that wears out',
    );
    assert.deepEqual(bounds, [15]);
    assert.deepEqual(messages, []);
});

// The sibling: the same gate on a nonzero roll spends the draw and continues
// into the shot.
test('postmov fires an already-seen dart trap that survives its roll',
    async () => {
        const { state, monster } = dartTrapState({ once: true, tseen: true });
        const bounds = [];
        const { env } = postmovEnv(state, {
            random: plainMissRandom({
                rn2: (bound) => { bounds.push(bound); return 1; },
            }),
            unsupported: (refusal) => { throw new Error(refusal); },
        });

        await postmov(monster, 4, 4, MMOVE_MOVED, false, false, true, env);

        // The bound-15 misfire roll comes first, then mksobj_init()'s
        // enchantment, curse, poison and erosion rolls, then the dart arm's
        // own rn2(6).
        assert.deepEqual(bounds.slice(0, 2), [15, 11]);
        assert.equal(bounds.at(-1), 6);
        assert.equal(state.level.objects[5][4].otyp, DART);
    });

test('postmov refuses a move that ends on iron bars', async () => {
    const { locations, state } = makeState();
    const monster = ordinaryMonster(state, { mx: 5, my: 4 });
    locations.set('5,4', { typ: IRONBARS, flags: 0 });
    const { env } = postmovEnv(state, {
        unsupported: (refusal) => { throw new Error(refusal); },
    });

    await assert.rejects(
        postmov(monster, 4, 4, MMOVE_MOVED, false, false, true, env),
        (error) => error.message === 'monster iron-bar movement',
    );
});

// C ref: monmove.c:1650-1656. An engulfer drags the hero along, but only when
// its move changed its square; a stationary engulfer takes the newsym() arm
// beside it, which the port already owns.
test('postmov refuses an engulfer that moved and admits one that did not',
    async () => {
        const { state } = makeState();
        const monster = ordinaryMonster(state, { mx: 5, my: 4 });
        state.u.uswallow = 1;
        state.u.ustuck = monster;
        const { env } = postmovEnv(state, {
            unsupported: (refusal) => { throw new Error(refusal); },
        });

        await assert.rejects(
            postmov(monster, 4, 4, MMOVE_MOVED, false, false, true, env),
            (error) => error.message === 'an engulfing monster moving',
        );

        const { env: stayEnv, redraws } = postmovEnv(state);
        assert.equal(
            await postmov(monster, 5, 4, MMOVE_MOVED, false, false, true,
                stayEnv),
            MMOVE_MOVED,
        );
        assert.deepEqual(redraws, [[5, 4], [5, 4]]);
    });

// C ref: monmove.c:1520-1522. The block is entered only for a monster that
// neither passes walls nor tunnels; a tunneler is "taken care of below" by the
// mdig_tunnel() call, and a wall-walker needs no door opened at all.
test('postmov skips the door block for a tunneler and a wall-walker',
    async () => {
        const { locations, state } = makeState();
        const monster = ordinaryMonster(state, { mx: 5, my: 4 });
        locations.set('5,4', { typ: DOOR, flags: D_CLOSED });
        const { env } = postmovEnv(state, {
            unsupported: (reason) => { throw new Error(reason); },
        });

        await assert.rejects(
            postmov(monster, 4, 4, MMOVE_MOVED, true, false, false, env),
            (error) => error.message === 'monster tunneling',
        );

        const wallWalker = ordinaryMonster(state, {
            data: state.mons[PM_XORN],
            mnum: PM_XORN,
            mx: 5,
            my: 4,
        });
        const { env: walkerEnv, redraws } = postmovEnv(state);
        assert.equal(
            await postmov(wallWalker, 4, 4, MMOVE_MOVED, false, false, false, walkerEnv),
            MMOVE_MOVED,
        );
        assert.deepEqual(redraws, [[4, 4], [5, 4]]);
    });

// dig.c mdig_tunnel() draws rnd(12) before every one of its early returns, so
// a tunneler that ends its move anywhere may_dig() admits spends a call the
// port cannot yet make. may_dig() rejects only an undiggable wall or tree.
test('postmov refuses the dig arm only where may_dig admits the square',
    async () => {
        const { locations, state } = makeState();
        const monster = ordinaryMonster(state, { mx: 5, my: 4 });
        locations.set('5,4', {
            typ: STONE,
            flags: 0,
            wall_info: W_NONDIGGABLE,
        });
        const { env, redraws } = postmovEnv(state);

        assert.equal(may_dig(5, 4, state), false);
        assert.equal(
            await postmov(monster, 4, 4, MMOVE_MOVED, true, false, false, env),
            MMOVE_MOVED,
        );
        assert.deepEqual(redraws, [[4, 4], [5, 4]]);

        locations.set('5,4', { typ: ROOM, flags: 0 });
        const digging = postmovEnv(state, {
            unsupported: (reason) => { throw new Error(reason); },
        });
        assert.equal(may_dig(5, 4, state), true);
        await assert.rejects(
            postmov(monster, 4, 4, MMOVE_MOVED, true, false, false, digging.env),
            (error) => error.message === 'monster tunneling',
        );
    });

// C ref: monmove.c:1690, maybe_spin_web(). Its rn2(1000) at :1279 is spent
// only for a webmaker that also passes the four narrower guards at
// :1271-1273, so the port refuses every webmaker rather than skip a call.
test('postmov refuses a webmaker after a move and after a completed action',
    async () => {
        for (const mmoved of [MMOVE_MOVED, MMOVE_DONE]) {
            const { state } = makeState();
            const monster = ordinaryMonster(state, {
                data: state.mons[PM_CAVE_SPIDER],
                mnum: PM_CAVE_SPIDER,
                mx: 5,
                my: 4,
            });
            const { env } = postmovEnv(state, {
                unsupported: (reason) => { throw new Error(reason); },
            });

            await assert.rejects(
                postmov(monster, 4, 4, mmoved, false, false, false, env),
                (error) => error.message === 'monster web spinning',
                `mmoved ${mmoved}`,
            );
        }

        // MMOVE_NOTHING skips both blocks, so the same spider passes.
        const { state } = makeState();
        const monster = ordinaryMonster(state, {
            data: state.mons[PM_CAVE_SPIDER],
            mnum: PM_CAVE_SPIDER,
            mx: 5,
            my: 4,
        });
        const { env, redraws } = postmovEnv(state);
        assert.equal(
            await postmov(monster, 4, 4, MMOVE_NOTHING, false, false, false, env),
            MMOVE_NOTHING,
        );
        assert.deepEqual(redraws, []);
    });

// C ref: monmove.c:1764 and :1911-1914. m_move() computes can_tunnel once and
// hands it to postmov(), then clears it again for a hostile pick-axe user that
// is close enough to prefer its weapon.
test('m_move hands postmov the tunneling capability it computed', async () => {
    // set_apparxy() overwrites mux/muy from the hero's real square, so the
    // distance the clearing condition reads is the distance to the hero.
    const runTunneler = async (extraFlags, heroX, heroY) => {
        const { locations, state } = makeState();
        state.u.ux = heroX;
        state.u.uy = heroY;
        const species = state.mons[PM_GIANT_RAT];
        const monster = ordinaryMonster(state, {
            data: { ...species, mflags1: species.mflags1 | extraFlags },
            mconf: true, // approach 0, so the goal square only breaks ties.
            mhp: 5, // A living monster is required by the placement index.
            mx: 4,
            my: 4,
        });
        sealNeighborhood(locations, monster.mx, monster.my);
        locations.set('5,4', { typ: ROOM, flags: 0 });
        state.level.monsters[monster.mx][monster.my] = monster;
        const redraws = [];

        const result = await m_move(monster, {
            state,
            random: { rn2: () => 0 },
                finishEating: () => {},
            movePet: () => assert.fail('hostile monster is not a pet'),
            resistsTrapEffect: () => false,
            itemSearchInLine: () => false,
            redraw: (x, y) => { redraws.push([x, y]); },
            unsupported: (reason) => { throw new Error(reason); },
        });
        return { monster, redraws, result };
    };

    // Without M1_NEEDPICK the condition stops at needspick(), its second
    // conjunct, and never measures a distance at all. can_tunnel survives, so
    // the rat reaches the dig arm on the floor square it stepped onto.
    await assert.rejects(
        runTunneler(M1_TUNNEL, 10, 10),
        (error) => error.message === 'monster tunneling',
    );

    // The same move with a pick-axe user's M1_NEEDPICK and a hostile monster
    // two squares from the hero (dist2 == 2) clears can_tunnel: no dig arm.
    const withPick = await runTunneler(M1_TUNNEL | M1_NEEDPICK, 3, 5);
    assert.deepEqual([withPick.monster.mux, withPick.monster.muy], [3, 5]);
    assert.equal(withPick.result, MMOVE_MOVED);
    assert.deepEqual([withPick.monster.mx, withPick.monster.my], [5, 4]);
    assert.deepEqual(withPick.redraws, [[4, 4], [5, 4]]);

    // M1_NEEDPICK alone does not clear what M1_TUNNEL never set, and the same
    // near hero leaves an ordinary monster's move untouched.
    const plain = await runTunneler(M1_NEEDPICK, 3, 5);
    assert.equal(plain.result, MMOVE_MOVED);

    // The three cases above never disagree with a condition that has lost one
    // of its `&&`: the first two hold every conjunct that C reaches, and the
    // third stops at the first. This case is the one that separates them. A
    // tunneler with no pick-axe need, standing two squares from the hero,
    // fails only the needspick() conjunct, so C leaves can_tunnel set and the
    // dig arm runs. Replacing either `&&` after needspick() with `||` lets the
    // surviving `(!mpeaceful || Conflict) && dist2 <= 8` clear it instead, and
    // the move then ends without the dig arm.
    await assert.rejects(
        runTunneler(M1_TUNNEL, 3, 5),
        (error) => error.message === 'monster tunneling',
    );

    // dist2 == 8 is the largest distance C still calls close enough, since
    // monmove.c:1913 is `<= 8`. A hero two rows and two columns away gives
    // 4 + 4. Clearing here is what separates `<= 8` from `< 8` and from `<= 7`.
    const atLimit = await runTunneler(M1_TUNNEL | M1_NEEDPICK, 6, 6);
    assert.deepEqual([atLimit.monster.mux, atLimit.monster.muy], [6, 6]);
    assert.equal(atLimit.result, MMOVE_MOVED);

    // dist2 == 9 is the smallest distance outside the bound: three columns
    // away and none down. Not clearing here is what separates `<= 8` from
    // `<= 9`, and it is the only case that measures a distance and still
    // reaches the dig arm.
    await assert.rejects(
        runTunneler(M1_TUNNEL | M1_NEEDPICK, 7, 4),
        (error) => error.message === 'monster tunneling',
    );
});

test('m_move owns trapped, eating, and tame prologue order', async () => {
    {
        const { state } = makeState();
        const monster = ordinaryMonster(state, { mtrapped: true });
        // monmove.c:1734 hands the monster to the real mintrap(), so this
        // case needs a real trap under it. The trap is already seen, which
        // shuts trap.c:3742's seetrap() gate on its first conjunct, and
        // rn2(40) answers nonzero, which shuts the escape at 3751. mintrap()
        // then returns Trap_Caught_Mon at 3788 and the prologue stops here.
        state.level.traps.push({
            tx: 4, ty: 4, ttyp: BEAR_TRAP, tseen: true, madeby_u: false,
        });
        const bounds = [];
        const draw = (bound) => {
            bounds.push(bound);
            return 1;
        };
        assert.equal(
            await m_move(monster, {
                state,
                random: {
                    d: draw,
                    rn1: draw,
                    rn2: draw,
                    rnd: draw,
                    rne: draw,
                    rnl: draw,
                },
                finishEating: () => assert.fail('trapped path eating'),
                movePet: () => assert.fail('trapped path pet move'),
                resistsTrapEffect: () => false,
                postMonsterMove: () => assert.fail('trapped path postmov'),
                unsupported: (reason) => assert.fail(reason),
                heroDeaf: () => false,
                mInAir: () => false,
                youHear: () => null,
                message: async () => assert.fail('a held monster writes none'),
                redraw: () => assert.fail('a held monster redraws nothing'),
            }),
            MMOVE_NOTHING,
        );
        assert.deepEqual(bounds, [40], 'the escape roll at trap.c:3751');
        assert.equal(monster.mtrapped, true, 'still held');
    }

    {
        const { state } = makeState();
        const monster = ordinaryMonster(state, { meating: 1 });
        const events = [];
        assert.equal(
            await m_move(monster, {
                state,
                random: { rn2: () => assert.fail('eating path RNG') },
                finishEating: (subject) => {
                    assert.equal(subject, monster);
                    events.push('finish');
                },
                movePet: () => assert.fail('eating path pet move'),
                resistsTrapEffect: () => false,
                postMonsterMove: () => assert.fail('eating path postmov'),
                unsupported: (reason) => assert.fail(reason),
            }),
            MMOVE_DONE,
        );
        assert.equal(monster.meating, 0);
        assert.deepEqual(events, ['finish']);
    }

    {
        const { state } = makeState();
        const monster = ordinaryMonster(state, { meating: 2 });
        const events = [];
        assert.equal(
            await m_move(monster, {
                state,
                random: { rn2: () => assert.fail('eating path RNG') },
                finishEating: () => assert.fail('still eating'),
                movePet: () => assert.fail('eating path pet move'),
                resistsTrapEffect: () => false,
                postMonsterMove: () => assert.fail('eating path postmov'),
                unsupported: (reason) => assert.fail(reason),
            }),
            MMOVE_DONE,
        );
        assert.equal(monster.meating, 1);
        assert.deepEqual(events, []);
    }

    {
        const { state } = makeState();
        const monster = ordinaryMonster(state, {
            mtame: 10,
            mx: 4,
            my: 4,
            mux: 0,
            muy: 0,
        });
        state.level.monsters[4][4] = monster;
        const events = [];
        assert.equal(
            await m_move(monster, {
                state,
                random: { rn2: () => assert.fail('tame dispatch RNG') },
                finishEating: () => assert.fail('tame path eating'),
                movePet(subject, after) {
                    assert.equal(subject, monster);
                    assert.equal(after, false);
                    assert.deepEqual(
                        [subject.mux, subject.muy],
                        [state.u.ux, state.u.uy],
                    );
                    events.push('dog_move');
                    return MMOVE_MOVED;
                },
                resistsTrapEffect: () => false,
                postMonsterMove(subject, oldX, oldY, status) {
                    assert.equal(subject, monster);
                    assert.deepEqual([oldX, oldY], [4, 4]);
                    assert.equal(status, MMOVE_MOVED);
                    events.push('postmov');
                    return status;
                },
                unsupported: (reason) => assert.fail(reason),
            }),
            MMOVE_MOVED,
        );
        assert.deepEqual(events, ['dog_move', 'postmov']);
    }
});

test('m_move pins source candidate order and reservoir tie-breaking',
    async () => {
    const { locations, state } = makeState();
    const monster = ordinaryMonster(state, {
        mconf: true,
        mhp: 5, // A living monster is required by the placement index.
        mx: 4,
        my: 4,
        // The hero is far enough away that this test exercises movement
        // selection rather than an adjacent hero attack.
        mux: 10,
        muy: 10,
    });
    sealNeighborhood(locations, monster.mx, monster.my);
    // mfndpos() visits these three squares in x-major/y-major order.
    for (const [x, y] of [[3, 3], [4, 5], [5, 4]]) {
        locations.set(`${x},${y}`, { typ: ROOM, flags: 0 });
    }
    state.level.monsters[monster.mx][monster.my] = monster;
    const events = [];
    const randomCalls = [];
    const random = sequenceRandom([0, 1, 0], randomCalls);

    const result = await m_move(monster, {
        state,
        random,
        finishEating: () => {},
        movePet: () => { throw new Error('unexpected pet mover'); },
        resistsTrapEffect: () => false,
        itemSearchInLine: () => false,
        unsupported: (reason) => assert.fail(reason),
        postMonsterMove(subject, oldX, oldY, status) {
            events.push(`post:${oldX},${oldY}:${subject.mx},${subject.my}`);
            assert.equal(state.level.monsters[oldX][oldY], null);
            assert.equal(state.level.monsters[subject.mx][subject.my], subject);
            assert.equal(status, MMOVE_MOVED);
            return status;
        },
    });

    assert.equal(result, MMOVE_MOVED);
    assert.deepEqual(randomCalls, [1, 2, 3]);
    assert.deepEqual([monster.mx, monster.my], [5, 4]);
    assert.equal(state.level.monsters[4][4], null);
    assert.equal(state.level.monsters[5][4], monster);
    assert.deepEqual(monster.mtrack, [
        { x: 4, y: 4 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
    ]);
    assert.deepEqual(events, ['post:4,4:5,4']);
});

test('m_move ordinary path reports no moves from a sealed square', async () => {
    const { locations, state } = makeState();
    const monster = ordinaryMonster(state, { mx: 4, my: 4 });
    state.level.monsters[monster.mx][monster.my] = monster;
    sealNeighborhood(locations, monster.mx, monster.my);

    const result = await m_move(monster, {
        state,
        random: { rn2: () => 0 },
        finishEating: () => {},
        movePet: () => { throw new Error('unexpected pet mover'); },
        resistsTrapEffect: () => false,
        unsupported: (reason) => assert.fail(reason),
        postMonsterMove: () => assert.fail('no move cannot reach postmov'),
    });

    assert.equal(result, MMOVE_NOMOVES);
    assert.deepEqual([monster.mx, monster.my], [4, 4]);
});

test('m_move reads unicorn line avoidance from the returned candidate count',
    async () => {
        // C ref: monmove.c:1941-1943,
        // `for (i = 0; i < cnt; i++) if (!(mfp.info[i] & NOTONL)) avoid = TRUE`.
        // A unicorn on a no-teleport level shuns the hero's row, column, and
        // diagonal only while some *other* candidate lies off that line. The
        // loop bound carries that "other": mfndpos() leaves the slots past cnt
        // zeroed, and a zero slot satisfies !(info & NOTONL), so a scan of all
        // nine slots invents an off-line candidate and strands the unicorn.
        for (const [label, offLineSquare, expected] of [
            // Only the on-line square is open, so no candidate is off the line
            // and C leaves avoid FALSE: the unicorn steps onto (3,4).
            ['on-line candidate alone', null, { x: 3, y: 4 }],
            // (4,3) shares no row, column, or diagonal with the remembered
            // hero square, so C sets avoid TRUE, skips (3,4), and moves there.
            ['off-line candidate present', [4, 3], { x: 4, y: 3 }],
        ]) {
            const { locations, state } = makeState();
            // The hero shares row 4 with the unicorn at (4,4). set_apparxy()
            // overwrites mux/muy with the hero's real square for a sighted
            // monster under no displacement, so the hero's position, not any
            // fixture value, decides which candidates mfndpos() marks NOTONL.
            // Column 10 keeps the hero off the unicorn's eight neighbours, so
            // no candidate is an attack on the hero.
            state.u.ux = 10;
            state.u.uy = 4;
            // m_move()'s item-search gate reads Strength for the throw range.
            state.u.acurr = { a: [18, 10, 10, 10, 10, 10] };
            // mon_allowflags() withholds NOTONL from a unicorn only on a
            // no-teleport level, and that withholding is what makes mfndpos()
            // mark an on-line square instead of rejecting it. The same
            // predicate feeds the m_move() branch under test.
            state.level.flags = { ...state.level.flags, noteleport: true };
            const unicorn = ordinaryMonster(state, {
                data: state.mons[PM_WHITE_UNICORN],
                mnum: PM_WHITE_UNICORN,
                mhp: 5, // A living monster is required by the placement index.
                mx: 4,
                my: 4,
            });
            state.level.monsters[4][4] = unicorn;
            sealNeighborhood(locations, unicorn.mx, unicorn.my);
            // (3,4) is orthogonal, which avoids mfndpos()'s tight-squeeze
            // rejection of a diagonal step between two rock squares, and it
            // shares the hero's row, so mfndpos() marks it NOTONL.
            locations.set('3,4', { typ: ROOM, flags: 0, wall_info: 0 });
            if (offLineSquare) {
                locations.set(`${offLineSquare[0]},${offLineSquare[1]}`,
                    { typ: ROOM, flags: 0, wall_info: 0 });
            }
            const posts = [];

            const result = await m_move(unicorn, {
                state,
                random: { rn2: () => 0 },
                        finishEating: () => {},
                movePet: () => { throw new Error('unexpected pet mover'); },
                resistsTrapEffect: () => false,
                noTeleportLevel: (subject) => noteleport_level(subject, state),
                unsupported: (reason) => assert.fail(reason),
                postMonsterMove(subject, oldX, oldY, status) {
                    posts.push({
                        oldX,
                        oldY,
                        status,
                        x: subject.mx,
                        y: subject.my,
                    });
                    return status;
                },
            });

            // Pin the geometry both cases rest on: the square set_apparxy()
            // left in mux/muy puts (3,4) on the hero's line and (4,3) off it.
            assert.ok(online2(3, 4, unicorn.mux, unicorn.muy), label);
            assert.ok(!online2(4, 3, unicorn.mux, unicorn.muy), label);
            assert.equal(result, MMOVE_MOVED, label);
            assert.deepEqual([unicorn.mx, unicorn.my],
                [expected.x, expected.y], label);
            assert.deepEqual(posts, [{
                oldX: 4,
                oldY: 4,
                status: MMOVE_MOVED,
                x: expected.x,
                y: expected.y,
            }], label);
            assert.equal(state.level.monsters[4][4], null, label);
            assert.equal(state.level.monsters[expected.x][expected.y],
                unicorn, label);
        }
    });

test('m_move item search requires the complete approach and line predicate',
    async () => {
        const aligned = makeState().state;
        aligned.u.acurr = { a: [18, 10, 10, 10, 10, 10] };
        const approaching = ordinaryMonster(aligned, {
            mhp: 5,
            mx: 4,
            my: 4,
            mux: aligned.u.ux,
            muy: aligned.u.uy,
        });
        aligned.level.monsters[4][4] = approaching;
        const alignedEvents = [];
        await m_move(approaching, {
            state: aligned,
            random: { rn2: () => 0 },
            finishEating: () => {},
        movePet: () => { throw new Error('unexpected pet mover'); },
            resistsTrapEffect: () => false,
            itemSearchInLine() {
                alignedEvents.push('line');
                return true;
            },
            searchItems: () => assert.fail(
                'aligned approach skips item search',
            ),
            unsupported: (reason) => assert.fail(reason),
            mayCrossRegion: () => false,
            postMonsterMove: () => assert.fail('region denial stops move'),
        });
        assert.deepEqual(alignedEvents, ['line']);

        const offLine = makeState().state;
        offLine.u.acurr = { a: [18, 10, 10, 10, 10, 10] };
        const searching = ordinaryMonster(offLine, {
            mhp: 5,
            mx: 4,
            my: 4,
            mux: offLine.u.ux,
            muy: offLine.u.uy,
        });
        offLine.level.monsters[4][4] = searching;
        const stop = new Error('off-line item search reached');
        await assert.rejects(
            m_move(searching, {
                state: offLine,
                random: { rn2: () => 0 },
                finishEating: () => {},
        movePet: () => { throw new Error('unexpected pet mover'); },
                resistsTrapEffect: () => false,
                itemSearchInLine: () => false,
                searchItems: () => { throw stop; },
                unsupported: (reason) => assert.fail(reason),
                postMonsterMove: () => assert.fail('search stops movement'),
            }),
            (error) => error === stop,
        );

        const confused = makeState().state;
        confused.u.acurr = { a: [18, 10, 10, 10, 10, 10] };
        const nonApproaching = ordinaryMonster(confused, {
            mconf: true,
            mhp: 5,
            mx: 4,
            my: 4,
            mux: confused.u.ux,
            muy: confused.u.uy,
        });
        confused.level.monsters[4][4] = nonApproaching;
        const confusedStop = new Error('non-approach item search reached');
        await assert.rejects(
            m_move(nonApproaching, {
                state: confused,
                random: { rn2: () => 0 },
                finishEating: () => {},
        movePet: () => { throw new Error('unexpected pet mover'); },
                resistsTrapEffect: () => false,
                itemSearchInLine: () => true,
                searchItems: () => { throw confusedStop; },
                unsupported: (reason) => assert.fail(reason),
                postMonsterMove: () => assert.fail('search stops movement'),
            }),
            (error) => error === confusedStop,
        );
    });

test('m_move item-search gate preserves peaceful and rogue-level order',
    async () => {
        const { locations, state } = makeState();
        state.rogue_level = { ...state.u.uz };
        const monster = ordinaryMonster(state, {
            mpeaceful: true,
            mhp: 5,
            mx: 4,
            my: 4,
            mux: 10,
            muy: 10,
        });
        state.level.monsters[monster.mx][monster.my] = monster;
        sealNeighborhood(locations, monster.mx, monster.my);
        const calls = [];
        const result = await m_move(monster, {
            state,
            random: sequenceRandom([0], calls),
            finishEating: () => {},
        movePet: () => { throw new Error('unexpected pet mover'); },
            resistsTrapEffect: () => false,
            itemSearchInLine: () => assert.fail(
                'rogue level skips line evaluation',
            ),
            searchItems: () => assert.fail(
                'rogue level skips item search',
            ),
            unsupported: (reason) => assert.fail(reason),
            postMonsterMove: () => assert.fail('sealed square cannot move'),
        });
        assert.equal(result, MMOVE_NOMOVES);
        assert.deepEqual(calls, [10]);
    });

test('m_move item-search line check preserves visibility and boulder draws',
    () => {
        const { locations, state } = makeState();
        const monster = ordinaryMonster(state, {
            mx: 4,
            my: 4,
            mux: state.u.ux,
            muy: state.u.uy,
        });
        state.viz_array = Array.from(
            { length: ROWNO },
            () => new Uint8Array(COLNO),
        );
        state.viz_array[monster.my][monster.mx] = COULD_SEE;
        const noDraw = {
            rn2: (bound) => assert.fail(`unexpected rn2(${bound})`),
        };
        assert.equal(lined_up(monster, {
            state, random: noDraw,
        }), true);

        state.viz_array[monster.my][monster.mx] = 0;
        // blocking_terrain() wins even when an earlier boulder was counted.
        // In C, neither wall nor closed-door rays reach rn2(2 + boulders).
        state.level.objects[7][7] = objectFor(state, BOULDER);
        for (const blocking of [
            { typ: STONE, flags: 0 },
            { typ: DOOR, flags: D_CLOSED },
        ]) {
            locations.set('8,8', blocking);
            assert.equal(lined_up(monster, {
                state, random: noDraw,
            }), false);
        }
        locations.delete('8,8');

        // A boulder-only ray reaches the conditional linedup(..., 2) draw.
        const calls = [];
        assert.equal(lined_up(monster, {
            state,
            random: sequenceRandom([2], calls),
        }), false);
        assert.deepEqual(calls, [3]);

        state.level.objects[7][7] = null;
        locations.set('6,6', { typ: STONE, flags: 0 });
        assert.equal(lined_up(monster, {
            state, random: noDraw,
        }), false);
    });

test('m_move spends an attack on an empty displacement image', async () => {
    const { locations, state } = makeState();
    state.u.uprops[DISPLACED].extrinsic = 1;
    const monster = ordinaryMonster(state, {
        mhp: 5,
        mx: 8,
        my: 10,
        mux: 0,
        muy: 0,
    });
    state.level.monsters[monster.mx][monster.my] = monster;
    sealNeighborhood(locations, monster.mx, monster.my);
    // set_apparxy() selects this accessible false image one square east.
    locations.set('9,10', { typ: ROOM, flags: 0 });
    const calls = [];

    const result = await m_move(monster, {
        state,
        random: sequenceRandom([1, 1, 2], calls),
        couldSee: () => true,
        itemSearchInLine: () => true,
        finishEating: () => {},
        movePet: () => { throw new Error('unexpected pet mover'); },
        resistsTrapEffect: () => false,
        unsupported: (reason) => assert.fail(reason),
        postMonsterMove: () => assert.fail(
            'an empty-image attack does not run postmov',
        ),
    });

    assert.equal(result, MMOVE_DONE);
    assert.deepEqual(calls, [4, 5, 5]);
    assert.deepEqual([monster.mux, monster.muy], [9, 10]);
    assert.deepEqual([monster.mx, monster.my], [8, 10]);
    assert.equal(state.level.monsters[8][10], monster);
    assert.equal(state.level.monsters[9][10], null);
    assert.deepEqual(monster.mtrack, [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
    ]);
});

test('m_move sends a rejected candidate through postmov as no movement',
    async () => {
        const { locations, state } = makeState();
        const monster = ordinaryMonster(state, {
            mx: 4,
            my: 4,
            mux: 10,
            muy: 10,
        });
        state.level.monsters[monster.mx][monster.my] = monster;
        sealNeighborhood(locations, monster.mx, monster.my);
        // One otherwise legal western candidate makes cnt nonzero; the
        // injected kicked-square owner rejects it after enumeration.
        locations.set('3,4', { typ: ROOM, flags: 0 });
        const postCalls = [];

        const result = await m_move(monster, {
            state,
            random: { rn2: () => 0 },
            finishEating: () => {},
        movePet: () => { throw new Error('unexpected pet mover'); },
            resistsTrapEffect: () => false,
            avoidKicked: () => true,
            unsupported: (reason) => assert.fail(reason),
            postMonsterMove(subject, oldX, oldY, status) {
                postCalls.push({
                    oldX,
                    oldY,
                    status,
                    x: subject.mx,
                    y: subject.my,
                });
                return status;
            },
        });

        assert.equal(result, MMOVE_NOTHING);
        assert.deepEqual(postCalls, [{
            oldX: 4,
            oldY: 4,
            status: MMOVE_NOTHING,
            x: 4,
            y: 4,
        }]);
        assert.equal(state.level.monsters[4][4], monster);
    });

test('m_move delegates the selected region crossing before map mutation',
    async () => {
        const { state } = makeState();
        const monster = ordinaryMonster(state, {
            mpeaceful: true,
            mhp: 5,
            mx: 4,
            my: 4,
            mux: 10,
            muy: 10,
        });
        state.level.monsters[monster.mx][monster.my] = monster;
        const events = [];

        const result = await m_move(monster, {
            state,
            random: { rn2: () => 0 },
            finishEating: () => {},
        movePet: () => { throw new Error('unexpected pet mover'); },
            resistsTrapEffect: () => false,
            unsupported: (reason) => assert.fail(reason),
            mayCrossRegion(subject, x, y) {
                events.push(`region:${x},${y}`);
                assert.equal(subject, monster);
                return false;
            },
            postMonsterMove: () => assert.fail('denied move skips postmov'),
        });

        assert.equal(result, MMOVE_DONE);
        assert.deepEqual([monster.mx, monster.my], [4, 4]);
        assert.equal(state.level.monsters[4][4], monster);
        assert.match(events[0], /^region:/u);
    });

function sanctuaryFixture() {
    const { locations, state } = makeState();
    const roomNumber = ROOMOFFSET;
    state.level.rooms[0] = { rtype: TEMPLE };
    state.u.urooms[0] = roomNumber;
    locations.set('6,6', { typ: ROOM, flags: 0, roomno: roomNumber });
    locations.set('7,7', { typ: ROOM, flags: 0, roomno: roomNumber });
    locations.set('8,8', {
        typ: ALTAR,
        flags: AM_SHRINE | AM_LAWFUL,
        roomno: roomNumber,
    });
    const priest = newMonster({
        data: state.mons[PM_HUMAN],
        ispriest: true,
        mpeaceful: true,
        mhp: 1,
        mx: 7,
        my: 7,
        mextra: {
            epri: {
                shralign: A_LAWFUL,
                shroom: roomNumber,
                shrpos: { x: 8, y: 8 },
                shrlevel: { ...state.u.uz },
            },
        },
    });
    state.level.monlist = priest;
    return {
        locations,
        monster: ordinaryMonster(state, { mx: 6, my: 6 }),
        priest,
        roomNumber,
        state,
    };
}

test('monhaskey distinguishes credit-card unlocking from locking tools', () => {
    const { state } = makeState();
    const monster = ordinaryMonster(state);

    monster.minvent = objectFor(state, CREDIT_CARD);
    assert.equal(monhaskey(monster, true, state), true);
    assert.equal(monhaskey(monster, false, state), false);

    monster.minvent = objectFor(state, SKELETON_KEY);
    assert.equal(monhaskey(monster, false, state), true);
    monster.minvent = objectFor(state, LOCK_PICK);
    assert.equal(monhaskey(monster, false, state), true);
});

test('m_everyturn_effect creates only unobstructed missing fog clouds', async () => {
    const { locations, state } = makeState();
    const ordinary = ordinaryMonster(state);
    await m_everyturn_effect(ordinary, { state });

    const fog = newMonster({
        data: state.mons[PM_FOG_CLOUD],
        mnum: PM_FOG_CLOUD,
        mx: 4,
        my: 4,
    });
    await assert.rejects(
        m_everyturn_effect(fog, { state }),
        /createGasCloud/,
    );

    const calls = [];
    const env = {
        state,
        createGasCloud(x, y, radius, damage) {
            calls.push({ x, y, radius, damage });
        },
    };
    await m_everyturn_effect(fog, env);
    assert.deepEqual(calls, [{ x: 4, y: 4, radius: 1, damage: 0 }]);

    locations.set('4,4', { typ: DOOR, flags: D_CLOSED, wall_info: 0 });
    await m_everyturn_effect(fog, env);
    assert.equal(calls.length, 1);

    locations.set('4,4', { typ: ROOM, flags: 0, wall_info: 0 });
    const existing = create_region([{ lx: 4, ly: 4, hx: 4, hy: 4 }]);
    existing.visible = true;
    state.level.regions = [existing];
    await m_everyturn_effect(fog, env);
    assert.equal(calls.length, 1);

    state.youmonst.data = state.mons[PM_FOG_CLOUD];
    state.youmonst.mnum = PM_FOG_CLOUD;
    await m_everyturn_effect(state.youmonst, env);
    assert.deepEqual(calls.at(-1), {
        x: state.u.ux,
        y: state.u.uy,
        radius: 1,
        damage: 0,
    });
});

test('dochugw delegates movement and leaves an idle hero alone', async () => {
    const { state } = makeState();
    const monster = ordinaryMonster(state);
    const calls = [];

    assert.equal(await dochugw(monster, true, {
        state,
        async dochug(candidate) {
            calls.push(['dochug', candidate.mx, candidate.my]);
            candidate.mx = 5;
            return 2;
        },
        canSpotMonster: () => assert.fail('idle hero skips sensing'),
        couldSee: () => assert.fail('idle hero skips old visibility'),
        stopOccupation: () => assert.fail('idle hero has no occupation'),
    }), 2);
    assert.deepEqual(calls, [['dochug', 4, 4]]);

    assert.equal(await dochugw(monster, false, { state }), 0);
});

test('dochugw stops work for a newly nearby visible threat in source order', async () => {
    const { state } = makeState();
    state.go.occupation = () => {};
    const monster = ordinaryMonster(state, {
        mcanmove: true,
        mx: 1,
        my: 1,
    });
    const calls = [];
    const stop = deferred();

    const result = dochugw(monster, true, {
        state,
        canSpotMonster(candidate) {
            calls.push(['spot', candidate.mx, candidate.my]);
            return true;
        },
        async dochug(candidate) {
            calls.push(['dochug', candidate.mx, candidate.my]);
            candidate.mx = 9;
            candidate.my = 10;
            return 0;
        },
        couldSee(x, y) {
            calls.push(['couldSee', x, y]);
            return true;
        },
        async stopOccupation() {
            calls.push(['stop']);
            await stop.promise;
        },
    });

    await Promise.resolve();
    assert.deepEqual(calls, [
        ['spot', 1, 1],
        ['dochug', 1, 1],
        ['couldSee', 1, 1],
        ['spot', 9, 10],
        ['couldSee', 9, 10],
        ['stop'],
    ]);
    let settled = false;
    result.then(() => { settled = true; });
    await Promise.resolve();
    assert.equal(settled, false);
    stop.resolve();
    assert.equal(await result, 0);
});

test('dochugw hallucination bypasses hostility only without resistance', async () => {
    const { state } = makeState();
    state.go.occupation = () => {};
    state.u.uprops[HALLUC].intrinsic = 5;
    const monster = ordinaryMonster(state, {
        mcanmove: true,
        mpeaceful: true,
        mx: 9,
        my: 10,
    });
    let stops = 0;
    const env = {
        state,
        canSpotMonster: () => true,
        couldSee: () => true,
        stopOccupation() { ++stops; },
    };

    assert.equal(await dochugw(monster, false, env), 0);
    assert.equal(stops, 1);

    state.u.uprops[HALLUC_RES].extrinsic = 1;
    assert.equal(await dochugw(monster, false, env), 0);
    assert.equal(stops, 1);
});

test('dochugw rechecks occupation after the monster action', async () => {
    const { state } = makeState();
    state.go.occupation = () => {};
    const monster = ordinaryMonster(state, {
        mcanmove: true,
        mx: 9,
        my: 10,
    });

    assert.equal(await dochugw(monster, true, {
        state,
        canSpotMonster: () => true,
        couldSee: () => true,
        dochug() {
            state.go.occupation = null;
            return 0;
        },
        stopOccupation: () => assert.fail('action already stopped work'),
    }), 0);
});

test('dochugw retains every threat-interruption rejection gate', async () => {
    const cases = [
        ['action result', ({ env }) => { env.dochug = () => 1; }],
        ['peaceful', ({ context, monster }) => {
            context.chug = false;
            monster.mpeaceful = true;
        }],
        ['attackless', ({ context, monster }) => {
            context.chug = false;
            monster.data = { mattk: [] };
        }],
        ['too far', ({ context, monster }) => {
            context.chug = false;
            monster.mx = monster.my = 1;
        }],
        ['already visible nearby', () => {}],
        ['already visible at the exact prior boundary', ({ env, monster }) => {
            // The hero is at <10,10>; the old square is exactly distance 9.
            // C requires old distu > 81, so equality must not interrupt even
            // after the monster moves adjacent.
            monster.mx = 1;
            monster.my = 10;
            env.dochug = (candidate) => {
                candidate.mx = 9;
                candidate.my = 10;
                return 0;
            };
        }],
        ['not spotted now', ({ env, monster }) => {
            monster.mx = monster.my = 1;
            env.dochug = (candidate) => {
                candidate.mx = 9;
                candidate.my = 10;
                return 0;
            };
            let spots = 0;
            env.canSpotMonster = () => ++spots === 1;
        }],
        ['not visible now', ({ env, monster }) => {
            monster.mx = monster.my = 1;
            env.dochug = (candidate) => {
                candidate.mx = 9;
                candidate.my = 10;
                return 0;
            };
            let visibilityChecks = 0;
            env.couldSee = () => ++visibilityChecks === 1;
        }],
        ['immobile', ({ context, monster }) => {
            context.chug = false;
            monster.mcanmove = false;
        }],
        ['scared', ({ context, state }) => {
            context.chug = false;
            state.level.objects[state.u.ux][state.u.uy] = objectFor(
                state,
                SCR_SCARE_MONSTER,
            );
        }],
    ];

    for (const [name, configure] of cases) {
        const { state } = makeState();
        state.go.occupation = () => {};
        const monster = ordinaryMonster(state, {
            mcanmove: true,
            mx: 9,
            my: 10,
        });
        let stops = 0;
        const context = { chug: true };
        const env = {
            state,
            dochug: () => 0,
            canSpotMonster: () => true,
            couldSee: () => true,
            stopOccupation() { ++stops; },
        };
        configure({ context, env, monster, state });

        assert.equal(
            await dochugw(monster, context.chug, env) >= 0,
            true,
            name,
        );
        assert.equal(stops, 0, name);
    }
});

test('dochugw preflights occupation owners before monster action', async () => {
    const { state } = makeState();
    state.go.occupation = () => {};
    const monster = ordinaryMonster(state);
    let actions = 0;
    const dochug = () => { ++actions; return 0; };

    await assert.rejects(dochugw(monster, true, {
        state,
        dochug,
        stopOccupation() {},
    }), /canSpotMonster/);
    await assert.rejects(dochugw(monster, true, {
        state,
        dochug,
        canSpotMonster: () => true,
    }), /stopOccupation/);
    await assert.rejects(dochugw(monster, true, {
        state,
        dochug,
        canSpotMonster: () => true,
        couldSee: true,
        stopOccupation() {},
    }), /couldSee/);
    assert.equal(actions, 0);

    await assert.rejects(dochugw(monster, true, { state }), /dochug/);
    assert.equal(actions, 0);
});

test('m_can_break_boulder preserves rider and cooldown exceptions', () => {
    const { state } = makeState();
    const rider = newMonster({
        data: state.mons[PM_DEATH],
        mspec_used: 12,
    });
    assert.equal(m_can_break_boulder(rider), true);

    for (const overrides of [
        { isshk: true },
        { ispriest: true },
        { data: { ...state.mons[PM_HUMAN], msound: MS_LEADER } },
    ]) {
        const monster = ordinaryMonster(state, overrides);
        assert.equal(m_can_break_boulder(monster), true);
        monster.mspec_used = 1;
        assert.equal(m_can_break_boulder(monster), false);
    }
});

test('mon_allowflags combines disposition, doors, and species identity', () => {
    const { state } = makeState();
    const human = newMonster({
        data: state.mons[PM_HUMAN],
        mnum: PM_HUMAN,
        minvent: objectFor(state, SKELETON_KEY),
    });
    assert.equal(
        mon_allowflags(human, { state }),
        ALLOW_U | ALLOW_SSM | OPENDOOR | UNLOCKDOOR,
    );

    const tame = ordinaryMonster(state, { mtame: 5 });
    const disposition = ALLOW_U | ALLOW_M | ALLOW_TRAPS
        | ALLOW_SANCT | ALLOW_SSM;
    assert.equal(mon_allowflags(tame, { state }) & disposition,
        ALLOW_M | ALLOW_TRAPS | ALLOW_SANCT | ALLOW_SSM);

    const minotaur = newMonster({ data: state.mons[PM_MINOTAUR] });
    const minotaurFlags = mon_allowflags(minotaur, { state });
    assert.ok(minotaurFlags & ALLOW_SSM);
    const giant = newMonster({ data: state.mons[PM_HILL_GIANT] });
    assert.ok(mon_allowflags(giant, { state }) & BUSTDOOR);
});

test('mon_allowflags preserves tunnel distance and rogue-level rules', () => {
    const { state } = makeState();
    const species = {
        ...state.mons[PM_HUMAN],
        mflags1: state.mons[PM_HUMAN].mflags1 | M1_TUNNEL | M1_NEEDPICK,
    };
    const monster = newMonster({
        data: species,
        mx: 4,
        my: 4,
        mux: 5,
        muy: 5,
    });

    assert.equal(Boolean(mon_allowflags(monster, { state }) & ALLOW_DIG), false);
    monster.mux = 10;
    monster.muy = 10;
    assert.equal(Boolean(mon_allowflags(monster, { state }) & ALLOW_DIG), true);

    // mon.c:2077 is `dist2(...) <= 8`. Two squares on each axis is exactly 8,
    // the last remembered-hero distance at which a needspick tunneller still
    // prefers its weapon; three squares along one axis is 9, the first at
    // which it digs.
    monster.mux = 6;
    monster.muy = 6;
    assert.equal(Boolean(mon_allowflags(monster, { state }) & ALLOW_DIG), false);
    monster.mux = 7;
    monster.muy = 4;
    assert.equal(Boolean(mon_allowflags(monster, { state }) & ALLOW_DIG), true);

    monster.mux = 5;
    monster.muy = 5;
    monster.mpeaceful = true;
    assert.equal(Boolean(mon_allowflags(monster, { state }) & ALLOW_DIG), true);

    state.rogue_level = { ...state.u.uz };
    assert.equal(Boolean(mon_allowflags(monster, { state }) & ALLOW_DIG), false);
});

test('mon_allowflags retains terrain, bars, garlic, and unicorn clauses', () => {
    const { state } = makeState();
    const xorn = newMonster({ data: state.mons[PM_XORN] });
    let flags = mon_allowflags(xorn, { state });
    assert.ok(flags & ALLOW_ROCK);
    assert.ok(flags & ALLOW_WALL);
    assert.ok(flags & ALLOW_BARS);

    state.u.ustuck = xorn;
    state.youmonst.data = state.mons[PM_HUMAN];
    flags = mon_allowflags(xorn, { state });
    assert.equal(Boolean(flags & ALLOW_BARS), false);
    state.youmonst.data = state.mons[PM_FOG_CLOUD];
    flags = mon_allowflags(xorn, { state });
    assert.ok(flags & ALLOW_BARS);

    const zombie = newMonster({ data: state.mons[PM_HUMAN_ZOMBIE] });
    assert.ok(mon_allowflags(zombie, { state }) & NOGARLIC);
    const ghost = newMonster({ data: state.mons[PM_GHOST] });
    assert.equal(Boolean(mon_allowflags(ghost, { state }) & NOGARLIC), false);

    const unicorn = newMonster({ data: state.mons[PM_WHITE_UNICORN] });
    assert.ok(mon_allowflags(unicorn, { state }) & NOTONL);
    state.level.flags = { noteleport: true, stasis_until: 0 };
    assert.equal(Boolean(mon_allowflags(unicorn, { state }) & NOTONL), false);
});

// Four compound conditions whose operands the cases above never separate: a
// monster that satisfies one operand and not the other decides each clause on
// its own, so a wrong connective or a wrong monhaskey() argument changes the
// answer. This is the coverage the ledger entry asked for before mon_allowflags
// moved out of js/monmove.js.
test('mon_allowflags separates each compound unlock, rock, and minion clause',
    () => {
        const { state } = makeState();

        // mon.c:2067-2068. can_open guards monhaskey(), so a monster that
        // cannot work a doorknob cannot unlock the key it carries either. A
        // floating eye is M1_NOLIMBS, which includes M1_NOHANDS.
        const handless = newMonster({
            data: state.mons[PM_FLOATING_EYE],
            minvent: objectFor(state, SKELETON_KEY),
        });
        const handlessFlags = mon_allowflags(handless, { state });
        assert.equal(Boolean(handlessFlags & OPENDOOR), false);
        assert.equal(Boolean(handlessFlags & UNLOCKDOOR), false);

        // monmove.c monhaskey() (95-103). Its second argument is C's
        // for_unlocking, and a credit card counts only when that is TRUE.
        const cardHolder = newMonster({
            data: state.mons[PM_HUMAN],
            minvent: objectFor(state, CREDIT_CARD),
        });
        assert.ok(mon_allowflags(cardHolder, { state }) & UNLOCKDOOR);

        // mon.c:2068's second term. The Wizard carries no key and is no
        // Rider, so iswiz alone has to grant UNLOCKDOOR.
        const wizard = newMonster({ data: state.mons[PM_HUMAN], iswiz: true });
        assert.ok(mon_allowflags(wizard, { state }) & UNLOCKDOOR);

        // mon.c:2094. A hill giant throws rocks and breaks no boulders -- it
        // is no Rider, no shopkeeper, no priest, and its msound is not
        // MS_LEADER -- so the first operand alone has to grant ALLOW_ROCK.
        const giant = newMonster({ data: state.mons[PM_HILL_GIANT] });
        assert.equal(m_can_break_boulder(giant), false);
        assert.ok(mon_allowflags(giant, { state }) & ALLOW_ROCK);

        // mon.c:2114. An Angel is M2_MINION and no Rider. Left hostile it
        // reaches ALLOW_SANCT through no other clause: the disposition arm
        // gives a hostile monster ALLOW_U alone.
        const minion = newMonster({ data: state.mons[PM_ANGEL] });
        const minionFlags = mon_allowflags(minion, { state });
        assert.ok(minionFlags & ALLOW_SANCT);
        assert.ok(minionFlags & ALLOW_U);
    });

test('mon_allowflags draws once for conflict resistance', () => {
    const { state } = makeState();
    state.u.uprops[CONFLICT] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    state.u.acurr = { a: [10, 10, 10, 10, 10, 10] };
    state.u.ulevel = 3;
    const peaceful = newMonster({
        data: state.mons[PM_HUMAN],
        m_lev: 8,
        mpeaceful: true,
    });
    const bounds = [];

    let flags = mon_allowflags(peaceful, {
        state,
        random: {
            rnd(bound) {
                bounds.push(bound);
                return 5;
            },
        },
    });
    assert.ok(flags & ALLOW_U);
    assert.deepEqual(bounds, [20]);

    flags = mon_allowflags(peaceful, {
        state,
        random: { rnd: () => 6 },
    });
    assert.equal(Boolean(flags & ALLOW_U), false);

    const hostile = newMonster({
        data: state.mons[PM_HUMAN],
        m_lev: 8,
        mpeaceful: false,
    });
    bounds.length = 0;
    flags = mon_allowflags(hostile, {
        state,
        random: {
            rnd(bound) {
                bounds.push(bound);
                return 19;
            },
        },
    });
    assert.ok(flags & ALLOW_U);
    assert.deepEqual(bounds, [20]);
});

test('mon_allowflags uses polymorphed Charisma for conflict resistance', () => {
    const { state } = makeState();
    state.u.uprops[CONFLICT] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    // Equal level 5 values cancel, so stored CHA 10 versus the form floor 18
    // alone decides whether a roll of 15 resists Conflict.
    state.u.acurr = { a: [10, 10, 10, 10, 10, 10] };
    state.u.ulevel = 5;
    const peaceful = newMonster({
        data: state.mons[PM_HUMAN],
        m_lev: 5,
        mpeaceful: true,
    });
    const env = { state, random: { rnd: () => 15 } };

    state.youmonst.data = state.mons[PM_HUMAN];
    state.u.umonnum = PM_HUMAN;
    assert.equal(Boolean(mon_allowflags(peaceful, env) & ALLOW_U), false);

    state.youmonst.data = state.mons[PM_WOOD_NYMPH];
    assert.ok(mon_allowflags(peaceful, env) & ALLOW_U);

    state.youmonst.data = state.mons[PM_HUMAN];
    state.u.umonnum = PM_AMOROUS_DEMON;
    assert.ok(mon_allowflags(peaceful, env) & ALLOW_U);

    // The flag above is one bit derived from acurr(A_CHA). attrib.c raises a
    // Charisma below 18 to 18 for a nymph or amorous demon and leaves every
    // other value alone, so the floor needs asserting on the value itself.
    const charisma = (mlet, umonnum, total) => {
        state.youmonst.data = { ...state.mons[PM_HUMAN], mlet };
        state.u.umonnum = umonnum;
        state.u.acurr = { a: [10, 10, 10, 10, 10, 10] };
        state.u.acurr.a[A_CHA] = total;
        state.u.abon = [0, 0, 0, 0, 0, 0];
        state.u.atemp = [0, 0, 0, 0, 0, 0];
        return effective_attribute(state, A_CHA);
    };
    assert.equal(charisma(S_NYMPH, PM_HUMAN, 10), 18, 'nymph form raises 10');
    assert.equal(charisma(S_NYMPH, PM_HUMAN, 22), 22, 'the floor never lowers');
    assert.equal(charisma(S_HUMAN, PM_AMOROUS_DEMON, 10), 18, 'demon raises 10');
    assert.equal(charisma(S_HUMAN, PM_HUMAN, 10), 10, 'no form, no floor');
});

test('movement terrain helpers preserve walls, boulders, and ceilings', () => {
    const { locations, state } = makeState();
    locations.set('3,3', { typ: STONE, flags: 0, wall_info: 0 });
    assert.equal(may_dig(3, 3, state), true);
    assert.equal(may_passwall(3, 3, state), true);
    locations.get('3,3').wall_info = W_NONDIGGABLE | W_NONPASSWALL;
    assert.equal(may_dig(3, 3, state), false);
    assert.equal(may_passwall(3, 3, state), false);

    const human = state.mons[PM_HUMAN];
    assert.equal(bad_rock(human, 3, 3, state), true);
    locations.get('3,3').wall_info = 0;
    assert.equal(bad_rock(state.mons[PM_XORN], 3, 3, state), false);

    locations.set('6,6', { typ: ROOM, flags: 0, wall_info: 0 });
    state.level.flags.sokoban_rules = true;
    state.level.objects[6][6] = objectFor(state, BOULDER);
    assert.equal(bad_rock(human, 6, 6, state), true);

    const floater = newMonster({ data: state.mons[PM_FLOATING_EYE] });
    assert.equal(m_in_air(floater, state), true);
    const clinger = newMonster({
        data: { ...human, mflags1: human.mflags1 | M1_CLING },
        mundetected: true,
    });
    assert.equal(m_in_air(clinger, state), true);
    state.u.uz = { dnum: state.astral_level.dnum, dlevel: 1 };
    state.earth_level = { dnum: state.astral_level.dnum, dlevel: 2 };
    assert.equal(m_in_air(clinger, state), false);
});

test('m_harmless_trap keeps structural cases local to movement legality', () => {
    const { state } = makeState();
    const floater = newMonster({ data: state.mons[PM_FLOATING_EYE] });
    assert.equal(m_harmless_trap(floater, { ttyp: ARROW_TRAP }, { state }), true);

    const rat = ordinaryMonster(state);
    assert.equal(m_harmless_trap(rat, { ttyp: BEAR_TRAP }, { state }), true);
    const human = newMonster({ data: state.mons[PM_HUMAN] });
    assert.equal(m_harmless_trap(human, { ttyp: RUST_TRAP }, { state }), true);
    const ironGolem = newMonster({ data: state.mons[PM_IRON_GOLEM] });
    assert.equal(
        m_harmless_trap(ironGolem, { ttyp: RUST_TRAP }, { state }),
        false,
    );

    assert.throws(
        () => m_harmless_trap(human, { ttyp: SLP_GAS_TRAP }, { state }),
        /resistsTrapEffect/,
    );
    assert.equal(m_harmless_trap(human, { ttyp: SLP_GAS_TRAP }, {
        state,
        resistsTrapEffect: () => true,
    }), true);

    const clinger = newMonster({
        data: {
            ...state.mons[PM_HUMAN],
            mflags1: state.mons[PM_HUMAN].mflags1 | M1_CLING,
        },
    });
    assert.equal(m_harmless_trap(clinger, { ttyp: PIT }, { state }), true);

    state.level.flags.sokoban_rules = true;
    assert.equal(
        m_harmless_trap(floater, { ttyp: ARROW_TRAP }, { state }),
        false,
    );
    assert.equal(m_harmless_trap(clinger, { ttyp: PIT }, { state }), false);
});

test('online2 recognizes source rows, columns, and both diagonals', () => {
    const cases = [
        // Endpoints are separated enough to distinguish the four source lines.
        { from: [2, 4], to: [7, 4], expected: true },
        { from: [4, 2], to: [4, 7], expected: true },
        { from: [2, 2], to: [7, 7], expected: true },
        { from: [2, 7], to: [7, 2], expected: true },
        { from: [2, 2], to: [7, 6], expected: false },
    ];
    for (const { from, to, expected } of cases)
        assert.equal(online2(...from, ...to), expected);
});

test('mfndpos enumerates neighbors in source x-major order', () => {
    const { state } = makeState();
    const monster = ordinaryMonster(state, { mcansee: false });
    const data = {};

    assert.equal(mfndpos(monster, data, 0, {
        state,
        onScary: () => false,
    }), 8);
    assert.deepEqual(data.poss.slice(0, data.cnt), [
        { x: 3, y: 3 }, { x: 3, y: 4 }, { x: 3, y: 5 },
        { x: 4, y: 3 }, { x: 4, y: 5 },
        { x: 5, y: 3 }, { x: 5, y: 4 }, { x: 5, y: 5 },
    ]);

    const gridBug = newMonster({
        data: state.mons[PM_GRID_BUG],
        mnum: PM_GRID_BUG,
        mx: 4,
        my: 4,
        mcansee: false,
    });
    assert.equal(mfndpos(gridBug, data, 0, {
        state,
        onScary: () => false,
    }), 4);
    assert.deepEqual(data.poss.slice(0, data.cnt), [
        { x: 3, y: 4 }, { x: 4, y: 3 },
        { x: 4, y: 5 }, { x: 5, y: 4 },
    ]);
});

test('mfndpos records scary squares and adjacent hero discovery', () => {
    const { state } = makeState();
    state.u.ux = 5;
    state.u.uy = 4;
    const monster = ordinaryMonster(state, {
        mux: 12,
        muy: 12,
        mcansee: true,
    });
    const data = {};
    const onScary = (x, y) => x === 3 && y === 4;

    assert.equal(mfndpos(monster, data, ALLOW_U, { state, onScary }), 7);
    assert.deepEqual([monster.mux, monster.muy], [5, 4]);
    const heroIndex = data.poss.findIndex(
        ({ x, y }) => x === state.u.ux && y === state.u.uy,
    );
    assert.ok(heroIndex >= 0);
    assert.ok(data.info[heroIndex] & ALLOW_U);

    assert.equal(mfndpos(monster, data, ALLOW_U | ALLOW_SSM, {
        state,
        onScary,
    }), 8);
    const scaryIndex = data.poss.findIndex(({ x, y }) => x === 3 && y === 4);
    assert.ok(data.info[scaryIndex] & ALLOW_SSM);
});

test('mfndpos remaps a displaced scary image to the real hero square', () => {
    const { locations, state } = makeState();
    sealNeighborhood(locations, 4, 4);
    locations.set('3,4', { typ: ROOM, flags: 0, wall_info: 0 });
    state.u.uprops[DISPLACED].intrinsic = 1;
    // The remembered image is adjacent at (3,4); the real hero remains at
    // makeState()'s distant (10,10), so the callback coordinate is decisive.
    const monster = ordinaryMonster(state, { mux: 3, muy: 4 });
    const checked = [];

    assert.equal(mfndpos(monster, {}, 0, {
        state,
        onScary(x, y) {
            checked.push([x, y]);
            return false;
        },
    }), 0);
    assert.deepEqual(checked, [[10, 10]]);

    // mon.c gates the remap on monseeu, `mon->mcansee && (!Invis ||
    // perceives(mdat))`. A blind monster fails the first half and a sighted
    // one under an invisible hero fails the second, so both check the
    // remembered image rather than the hero's square.
    for (const [label, overrides, invisible] of [
        ['blind monster', { mcansee: false }, false],
        ['invisible hero', {}, true],
    ]) {
        const unseeing = makeState();
        sealNeighborhood(unseeing.locations, 4, 4);
        unseeing.locations.set('3,4', { typ: ROOM, flags: 0, wall_info: 0 });
        unseeing.state.u.uprops[DISPLACED].intrinsic = 1;
        if (invisible) unseeing.state.u.uprops[INVIS].intrinsic = 1;
        const blindly = [];
        assert.equal(mfndpos(
            ordinaryMonster(unseeing.state, { mux: 3, muy: 4, ...overrides }),
            {},
            0,
            {
                state: unseeing.state,
                onScary(x, y) { blindly.push([x, y]); return false; },
            },
        ), 0);
        assert.deepEqual(blindly, [[3, 4]], label);
    }
});

test('mfndpos reveals an adjacent hero before rejecting the square', () => {
    const { locations, state } = makeState();
    sealNeighborhood(locations, 4, 4);
    locations.set('3,4', { typ: ROOM, flags: 0, wall_info: 0 });
    state.u.ux = 3;
    state.u.uy = 4;
    const monster = ordinaryMonster(state, { mux: 12, muy: 12 });
    const data = {};

    assert.equal(mfndpos(monster, data, 0, {
        state,
        onScary: () => false,
    }), 0);
    assert.deepEqual([monster.mux, monster.muy], [3, 4]);
    assert.equal(data.cnt, 0);
});

test('mfndpos rebuilds the nine output slots on every call', () => {
    // mon.c mfndpos() memsets a caller-declared local, and both callers here
    // pass a fresh `{ cnt: 0, poss: [], info: [] }`, so a caller cannot hold a
    // `data.poss[i]` reference across calls. The values repeat; the objects do
    // not.
    const { state } = makeState();
    const monster = ordinaryMonster(state, { mcansee: false });
    const data = {};
    const env = { state, onScary: () => false };

    assert.equal(mfndpos(monster, data, 0, env), 8);
    const firstPositions = data.poss;
    const firstEntry = data.poss[0];
    const firstResult = data.poss.slice(0, data.cnt).map((position, index) => ({
        ...position,
        info: data.info[index],
    }));

    assert.equal(mfndpos(monster, data, 0, env), 8);
    assert.notEqual(data.poss, firstPositions);
    assert.notEqual(data.poss[0], firstEntry);
    assert.equal(data.poss.length, 9);
    assert.equal(data.info.length, 9);
    assert.deepEqual(
        data.poss.slice(0, data.cnt).map((position, index) => ({
            ...position,
            info: data.info[index],
        })),
        firstResult,
    );
});

test('mfndpos rolls back partial output when trap resistance is unavailable', () => {
    const { locations, state } = makeState();
    sealNeighborhood(locations, 4, 4);
    locations.set('3,3', { typ: ROOM, flags: 0, wall_info: 0 });
    locations.set('5,5', { typ: ROOM, flags: 0, wall_info: 0 });
    // x-major enumeration accepts the adjacent hero at (3,3) before reaching
    // the sleep trap at the last candidate, (5,5).
    state.u.ux = 3;
    state.u.uy = 3;
    state.level.traps = [{ tx: 5, ty: 5, ttyp: SLP_GAS_TRAP }];
    // hasAdjacentResistanceTrap() owns three trap types and trapResistance()
    // is reached through each, so the rollback must hold for all three rather
    // than for whichever one the fixture happens to place.
    for (const ttyp of [SLP_GAS_TRAP, FIRE_TRAP, ANTI_MAGIC]) {
        const each = makeState();
        sealNeighborhood(each.locations, 4, 4);
        each.locations.set('3,3', { typ: ROOM, flags: 0, wall_info: 0 });
        each.locations.set('5,5', { typ: ROOM, flags: 0, wall_info: 0 });
        each.state.u.ux = 3;
        each.state.u.uy = 3;
        each.state.level.traps = [{ tx: 5, ty: 5, ttyp }];
        const eachMonster = ordinaryMonster(each.state, { mux: 12, muy: 12 });
        const eachData = { cnt: 4, poss: [], info: [] };
        assert.throws(
            () => mfndpos(eachMonster, eachData, ALLOW_U, {
                state: each.state,
                onScary: () => false,
            }),
            /resistsTrapEffect/,
            String(ttyp),
        );
        assert.deepEqual([eachMonster.mux, eachMonster.muy], [12, 12], String(ttyp));
        assert.equal(eachData.cnt, 4, String(ttyp));
    }

    const monster = ordinaryMonster(state, { mux: 12, muy: 12 });
    const positions = Array.from({ length: 9 }, (_, index) => ({
        x: 100 + index,
        y: 200 + index,
    }));
    const info = Array.from({ length: 9 }, (_, index) => 300 + index);
    const data = { cnt: 7, poss: positions, info };
    const before = {
        cnt: data.cnt,
        poss: data.poss.map((position) => ({ ...position })),
        info: [...data.info],
    };
    const env = { state, onScary: () => false };

    assert.throws(
        () => mfndpos(monster, data, ALLOW_U, env),
        /resistsTrapEffect/,
    );
    assert.deepEqual([monster.mux, monster.muy], [12, 12]);
    assert.equal(data.poss, positions);
    assert.equal(data.info, info);
    assert.deepEqual(data, before);

    const configured = {
        ...env,
        resistsTrapEffect: () => false,
    };
    const retryCount = mfndpos(monster, data, ALLOW_U, configured);
    const cleanMonster = ordinaryMonster(state, { mux: 12, muy: 12 });
    const cleanData = {};
    const cleanCount = mfndpos(
        cleanMonster,
        cleanData,
        ALLOW_U,
        configured,
    );
    assert.equal(retryCount, cleanCount);
    assert.deepEqual(data.poss.slice(0, data.cnt),
        cleanData.poss.slice(0, cleanData.cnt));
    assert.deepEqual(data.info.slice(0, data.cnt),
        cleanData.info.slice(0, cleanData.cnt));
});

test('mfndpos applies door and digging tools before candidate metadata', () => {
    const { locations, state } = makeState();
    sealNeighborhood(locations, 4, 4);
    const door = { typ: DOOR, flags: D_CLOSED, wall_info: 0 };
    locations.set('3,4', door);
    const human = newMonster({
        data: state.mons[PM_HUMAN],
        mx: 4,
        my: 4,
        mcansee: false,
    });
    const data = {};

    assert.equal(mfndpos(human, data, 0, {
        state,
        onScary: () => false,
    }), 0);
    assert.equal(mfndpos(human, data, OPENDOOR, {
        state,
        onScary: () => false,
    }), 1);
    door.flags = D_LOCKED;
    assert.equal(mfndpos(human, data, OPENDOOR, {
        state,
        onScary: () => false,
    }), 0);
    assert.equal(mfndpos(human, data, UNLOCKDOOR, {
        state,
        onScary: () => false,
    }), 1);

    locations.set('3,4', { typ: TREE, flags: 0, wall_info: 0 });
    const tunneler = newMonster({
        data: {
            ...state.mons[PM_HUMAN],
            mflags1: state.mons[PM_HUMAN].mflags1
                | M1_TUNNEL | M1_NEEDPICK,
        },
        minvent: objectFor(state, AXE),
        mx: 4,
        my: 4,
        mcansee: false,
    });
    assert.equal(mfndpos(tunneler, data, ALLOW_DIG, {
        state,
        onScary: () => false,
    }), 1);
});

test('mfndpos preserves boulder, garlic, and trap information bits', () => {
    const { locations, state } = makeState();
    sealNeighborhood(locations, 4, 4);
    locations.set('3,4', { typ: ROOM, flags: 0, wall_info: 0 });
    const human = newMonster({
        data: state.mons[PM_HUMAN],
        mx: 4,
        my: 4,
        mcansee: false,
    });
    const data = {};
    const env = { state, onScary: () => false };

    state.level.objects[3][4] = objectFor(state, BOULDER);
    assert.equal(mfndpos(human, data, 0, env), 0);
    assert.equal(mfndpos(human, data, ALLOW_ROCK, env), 1);
    assert.ok(data.info[0] & ALLOW_ROCK);

    state.level.objects[3][4] = objectFor(state, CLOVE_OF_GARLIC);
    const zombie = newMonster({
        data: state.mons[PM_HUMAN_ZOMBIE],
        mx: 4,
        my: 4,
        mcansee: false,
    });
    assert.equal(mfndpos(zombie, data, NOGARLIC, env), 0);
    assert.equal(mfndpos(human, data, 0, env), 1);
    assert.ok(data.info[0] & NOGARLIC);

    state.level.objects[3][4] = null;
    state.level.traps = [{ tx: 3, ty: 4, ttyp: ARROW_TRAP }];
    human.mtrapseen = 1 << (ARROW_TRAP - 1);
    assert.equal(mfndpos(human, data, 0, env), 0);
    human.mtrapseen = 0;
    assert.equal(mfndpos(human, data, 0, env), 1);
    assert.ok(data.info[0] & ALLOW_TRAPS);

    const floater = newMonster({
        data: state.mons[PM_FLOATING_EYE],
        mx: 4,
        my: 4,
        mcansee: false,
    });
    assert.equal(mfndpos(floater, data, 0, env), 1);
    assert.equal(Boolean(data.info[0] & ALLOW_TRAPS), false);
});

test('mfndpos applies monster aggression and displacement at occupancy', () => {
    const { locations, state } = makeState();
    sealNeighborhood(locations, 4, 4);
    locations.set('5,4', { typ: ROOM, flags: 0, wall_info: 0 });
    const data = {};
    const env = { state, onScary: () => false };
    const attacker = newMonster({
        data: state.mons[PM_HUMAN],
        mx: 4,
        my: 4,
        mcansee: false,
    });
    const defender = ordinaryMonster(state, {
        mx: 5,
        my: 4,
        m_lev: 1,
    });
    state.level.monsters[5][4] = defender;

    assert.equal(mfndpos(attacker, data, 0, env), 0);
    assert.equal(mfndpos(attacker, data, ALLOW_M, env), 1);
    assert.ok(data.info[0] & ALLOW_M);
    defender.mtame = 5;
    assert.equal(mfndpos(attacker, data, ALLOW_M, env), 0);
    assert.equal(mfndpos(attacker, data, ALLOW_M | ALLOW_TM, env), 1);
    assert.ok(data.info[0] & ALLOW_TM);

    attacker.data = state.mons[PM_PURPLE_WORM];
    attacker.mnum = PM_PURPLE_WORM;
    defender.data = state.mons[PM_SHRIEKER];
    defender.mnum = PM_SHRIEKER;
    defender.mtame = 0;
    assert.equal(mfndpos(attacker, data, 0, env), 1);
    assert.ok(data.info[0] & ALLOW_M);

    attacker.data = state.mons[PM_DISPLACER_BEAST];
    attacker.mnum = PM_DISPLACER_BEAST;
    attacker.m_lev = 10;
    defender.data = state.mons[PM_GIANT_RAT];
    defender.mnum = PM_GIANT_RAT;
    assert.equal(mfndpos(attacker, data, ALLOW_MDISP, env), 1);
    assert.ok(data.info[0] & ALLOW_MDISP);
});

test('mfndpos clears inherited displacement permission across candidates', () => {
    const { locations, state } = makeState();
    sealNeighborhood(locations, 4, 4);
    locations.set('3,3', { typ: ROOM, flags: 0, wall_info: 0 });
    locations.set('3,4', { typ: ROOM, flags: 0, wall_info: 0 });
    const attacker = newMonster({
        data: state.mons[PM_DISPLACER_BEAST],
        mnum: PM_DISPLACER_BEAST,
        mx: 4,
        my: 4,
        m_lev: 10,
        mcansee: false,
    });
    const eligible = ordinaryMonster(state, { mx: 3, my: 3, m_lev: 1 });
    const trapped = ordinaryMonster(state, {
        mx: 3,
        my: 4,
        m_lev: 1,
        mtrapped: true,
    });
    state.level.monsters[3][3] = eligible;
    state.level.monsters[3][4] = trapped;
    const data = {};

    assert.equal(mfndpos(attacker, data, ALLOW_MDISP, {
        state,
        onScary: () => false,
    }), 1);
    assert.deepEqual(data.poss[0], { x: 3, y: 3 });
    assert.ok(data.info[0] & ALLOW_MDISP);
});

test('mfndpos applies zombie aggression and Wizard Tower partitioning', () => {
    const { locations, state } = makeState();
    sealNeighborhood(locations, 4, 4);
    locations.set('5,4', { typ: ROOM, flags: 0, wall_info: 0 });
    const attacker = newMonster({
        data: state.mons[PM_HUMAN_ZOMBIE],
        mnum: PM_HUMAN_ZOMBIE,
        mx: 4,
        my: 4,
        mcansee: false,
    });
    const defender = newMonster({
        data: state.mons[PM_HUMAN],
        mnum: PM_HUMAN,
        mx: 5,
        my: 4,
    });
    state.level.monsters[5][4] = defender;
    const data = {};
    const env = { state, onScary: () => false };

    assert.equal(mfndpos(attacker, data, 0, env), 1);
    assert.ok(data.info[0] & ALLOW_M);

    // mfndpos records ALLOW_TM only for a tame occupant, and only when the
    // aggression result carries it, so the second half of
    // mm_2way_aggression()'s `ALLOW_M | ALLOW_TM` needs a tame defender.
    defender.mtame = 1;
    assert.equal(mfndpos(attacker, data, 0, env), 1);
    assert.ok(data.info[0] & ALLOW_M);
    assert.ok(data.info[0] & ALLOW_TM);
    defender.mtame = 0;

    attacker.mgenmklev = true;
    defender.mgenmklev = true;
    assert.equal(mfndpos(attacker, data, 0, env), 0);

    attacker.mgenmklev = false;
    defender.mgenmklev = false;
    state.wiz1_level = { ...state.u.uz };
    // The hero and defender are outside this one-square tower boundary while
    // the attacker is inside, so cross-partition aggression is suppressed.
    state.dndest = { nlx: 4, nly: 4, nhx: 4, nhy: 4 };
    assert.equal(mfndpos(attacker, data, 0, env), 0);

    // The other arm of C's ternary: with the hero inside the tower, both
    // monsters must be inside too. Only the all-inside case allows the attack,
    // and the previous case covered hero-outside with the attacker inside.
    state.u.ux = 4;
    state.u.uy = 4;
    assert.equal(mfndpos(attacker, data, 0, env), 0, 'defender outside');
    state.dndest = { nlx: 4, nly: 4, nhx: 5, nhy: 4 };
    assert.equal(mfndpos(attacker, data, 0, env), 1, 'all three inside');
    assert.ok(data.info[0] & ALLOW_M);
});

test('mfndpos retries eel movement on land only when no pool is adjacent', () => {
    const { locations, state } = makeState();
    const eel = newMonster({
        data: state.mons[PM_GIANT_EEL],
        mnum: PM_GIANT_EEL,
        mx: 4,
        my: 4,
        mcansee: false,
    });
    const data = {};
    const env = { state, onScary: () => false };

    assert.equal(mfndpos(eel, data, 0, env), 8);
    locations.set('3,4', { typ: POOL, flags: 0, wall_info: 0 });
    assert.equal(mfndpos(eel, data, 0, env), 1);
    assert.deepEqual(data.poss[0], { x: 3, y: 4 });
});

test('mfndpos preserves water, lava-wall, and poison-cloud preferences', () => {
    const { locations, state } = makeState();
    sealNeighborhood(locations, 4, 4);
    const data = {};
    const env = { state, onScary: () => false };
    const human = newMonster({
        data: state.mons[PM_HUMAN],
        mx: 4,
        my: 4,
        mcansee: false,
    });

    locations.set('3,4', { typ: WATER, flags: 0, wall_info: 0 });
    assert.equal(mfndpos(human, data, 0, env), 0);
    const eel = newMonster({
        data: state.mons[PM_GIANT_EEL],
        mx: 4,
        my: 4,
        mcansee: false,
    });
    assert.equal(mfndpos(eel, data, 0, env), 1);

    locations.set('3,4', { typ: LAVAPOOL, flags: 0, wall_info: 0 });
    assert.equal(mfndpos(human, data, 0, env), 0);
    const salamander = newMonster({
        data: state.mons[PM_SALAMANDER],
        mx: 4,
        my: 4,
        mcansee: false,
    });
    assert.equal(mfndpos(salamander, data, 0, env), 1);
    locations.set('3,4', { typ: LAVAWALL, flags: 0, wall_info: 0 });
    assert.equal(mfndpos(salamander, data, 0, env), 0);
    assert.equal(mfndpos(salamander, data, ALLOW_WALL, env), 1);

    locations.set('3,4', { typ: ROOM, flags: 0, wall_info: 0 });
    const cloud = create_region([{ lx: 3, ly: 4, hx: 3, hy: 4 }]);
    cloud.visible = true;
    cloud.glyph = S_poisoncloud;
    state.level.regions = [cloud];
    assert.equal(mfndpos(human, data, 0, env), 0);
    const zombie = newMonster({
        data: state.mons[PM_HUMAN_ZOMBIE],
        mx: 4,
        my: 4,
        mcansee: false,
    });
    assert.equal(mfndpos(zombie, data, 0, env), 1);

    cloud.rects.push({ lx: 4, ly: 4, hx: 4, hy: 4 });
    cloud.bounding_box.hx = 4;
    assert.equal(mfndpos(human, data, 0, env), 1);
});

test('mfndpos blocks source diagonal door and worm crossings', () => {
    const { locations, state } = makeState();
    sealNeighborhood(locations, 4, 4);
    locations.set('3,3', { typ: ROOM, flags: 0, wall_info: 0 });
    locations.set('4,4', { typ: DOOR, flags: D_CLOSED, wall_info: 0 });
    const monster = ordinaryMonster(state, { mcansee: false });
    const data = {};
    const env = { state, onScary: () => false };

    assert.equal(mfndpos(monster, data, 0, env), 0);
    locations.get('4,4').flags = D_BROKEN;
    assert.equal(mfndpos(monster, data, 0, env), 1);

    locations.set('4,4', { typ: ROOM, flags: 0, wall_info: 0 });
    const giant = newMonster({
        data: state.mons[PM_HILL_GIANT],
        mx: 4,
        my: 4,
        mcansee: false,
    });
    assert.equal(mfndpos(giant, data, 0, env), 0);

    const worm = newMonster({
        data: state.mons[PM_LONG_WORM],
        mnum: PM_LONG_WORM,
        wormno: 1,
    });
    state.level.monsters[3][4] = worm;
    state.level.monsters[4][3] = worm;
    state.level.worms[1] = {
        segments: [{ x: 3, y: 4 }, { x: 4, y: 3 }],
    };
    assert.equal(mfndpos(monster, data, 0, env), 0);

    state.level.worms[1].segments.splice(1, 0, { x: 2, y: 4 });
    assert.equal(mfndpos(monster, data, 0, env), 1);
});

test('mfndpos records line, sanctuary, and fixed-teleport constraints', () => {
    const { locations, state } = makeState();
    sealNeighborhood(locations, 4, 4);
    locations.set('5,4', { typ: ROOM, flags: 0, wall_info: 0 });
    const monster = ordinaryMonster(state, {
        mcansee: true,
        mux: 8,
        muy: 4,
    });
    const data = {};
    const env = { state, onScary: () => false };

    assert.equal(mfndpos(monster, data, NOTONL, env), 0);
    assert.equal(mfndpos(monster, data, 0, env), 1);
    assert.ok(data.info[0] & NOTONL);

    monster.mcansee = false;
    const roomNumber = ROOMOFFSET;
    state.level.flags.has_temple = true;
    state.level.rooms[0] = { rtype: TEMPLE };
    locations.set('5,4', {
        typ: ROOM,
        flags: 0,
        wall_info: 0,
        roomno: roomNumber,
    });
    assert.equal(mfndpos(monster, data, 0, {
        ...env,
        inYourSanctuary: () => true,
    }), 0);
    assert.equal(mfndpos(monster, data, ALLOW_SANCT, {
        ...env,
        inYourSanctuary: () => true,
    }), 1);
    assert.ok(data.info[0] & ALLOW_SANCT);

    state.level.flags.has_temple = false;
    state.level.traps = [{
        tx: 5,
        ty: 4,
        ttyp: TELEP_TRAP,
        teledest: { x: 12, y: 12 },
    }];
    state.track.utcnt = 1;
    state.track.utrack = [{ x: 5, y: 4 }];
    assert.equal(mfndpos(monster, data, 0, env), 1);
    assert.ok(data.info[0] & ALLOW_TRAPS);
});

test('set_apparxy keeps exact knowledge for pets and remembered hero squares', () => {
    const { state } = makeState();
    const noDraws = { rn2: () => assert.fail('direct knowledge must not draw') };

    const pet = ordinaryMonster(state, { mtame: 5, mux: 2, muy: 3 });
    set_apparxy(pet, { state, random: noDraws });
    assert.deepEqual([pet.mux, pet.muy], [state.u.ux, state.u.uy]);

    const remembered = ordinaryMonster(state, {
        mux: state.u.ux,
        muy: state.u.uy,
    });
    set_apparxy(remembered, { state, random: noDraws });
    assert.deepEqual(
        [remembered.mux, remembered.muy],
        [state.u.ux, state.u.uy],
    );
});

test('set_apparxy gives a visible ordinary monster the real hero square', () => {
    const { state } = makeState();
    // A blocked invisibility property is inactive under the Invis macro.
    state.u.uprops[INVIS] = { intrinsic: 1, extrinsic: 0, blocked: 1 };
    const monster = ordinaryMonster(state, { mux: 2, muy: 3 });

    set_apparxy(monster, {
        state,
        random: { rn2: () => assert.fail('visible hero must not draw') },
        couldSee: () => assert.fail('visible hero needs no guess'),
    });

    assert.deepEqual([monster.mux, monster.muy], [state.u.ux, state.u.uy]);
});

test('set_apparxy lets a blind xorn smell any carried money', () => {
    const { state } = makeState();
    // A one-coin stack is enough for money_cnt() to make the location exact.
    state.invent = objectFor(state, COIN_CLASS, { quan: 1 });
    const monster = newMonster({
        data: state.mons[PM_XORN],
        mnum: PM_XORN,
        mx: 4,
        my: 4,
        mcansee: false,
    });

    set_apparxy(monster, {
        state,
        random: { rn2: () => assert.fail('xorn smell must not draw') },
        couldSee: () => assert.fail('xorn smell needs no guess'),
    });

    assert.deepEqual([monster.mux, monster.muy], [state.u.ux, state.u.uy]);
});

test('set_apparxy zero rolls immediately recover the real hero square', () => {
    const unseen = makeState().state;
    unseen.u.uprops[INVIS].intrinsic = 1;
    const blindMonster = ordinaryMonster(unseen, { mux: 2, muy: 3 });
    const unseenCalls = [];

    set_apparxy(blindMonster, {
        state: unseen,
        random: sequenceRandom([0], unseenCalls),
        couldSee: () => assert.fail('exact unseen roll skips guessing'),
    });
    assert.deepEqual(unseenCalls, [3]);
    assert.deepEqual(
        [blindMonster.mux, blindMonster.muy],
        [unseen.u.ux, unseen.u.uy],
    );

    const displaced = makeState().state;
    displaced.u.uprops[DISPLACED].extrinsic = 1;
    const displacedMonster = ordinaryMonster(displaced, { mux: 7, muy: 7 });
    const displacedCalls = [];
    const seen = [];
    set_apparxy(displacedMonster, {
        state: displaced,
        random: sequenceRandom([0], displacedCalls),
        couldSee(x, y) {
            seen.push([x, y]);
            return true;
        },
    });
    assert.deepEqual(displacedCalls, [4]);
    assert.deepEqual(seen, [[7, 7]]);
    assert.deepEqual(
        [displacedMonster.mux, displacedMonster.muy],
        [displaced.u.ux, displaced.u.uy],
    );
});

test('set_apparxy uses the source unseen draw and retries its own square', () => {
    const { state } = makeState();
    state.u.uprops[INVIS].intrinsic = 1;
    const monster = ordinaryMonster(state, { mx: 9, my: 9 });
    const calls = [];
    // Miss the 1-in-3 exact-location chance, reject <9,9>, then accept <11,10>.
    const values = [1, 0, 0, 2, 1];

    set_apparxy(monster, {
        state,
        random: sequenceRandom(values, calls),
        couldSee: () => true,
    });

    assert.deepEqual(calls, [3, 3, 3, 3, 3]);
    assert.deepEqual([monster.mux, monster.muy], [11, 10]);
    assert.deepEqual(values, []);
});

test('set_apparxy displacement uses radius two when the old image is visible', () => {
    const { state } = makeState();
    state.u.uprops[DISPLACED].extrinsic = 1;
    const monster = ordinaryMonster(state, {
        mx: 8,
        my: 8,
        mux: 7,
        muy: 7,
    });
    const calls = [];
    const seen = [];
    // Miss the 1-in-4 exact-location chance, then select the monster square.
    const values = [1, 0, 0];

    set_apparxy(monster, {
        state,
        random: sequenceRandom(values, calls),
        couldSee(x, y) {
            seen.push([x, y]);
            return true;
        },
    });

    assert.deepEqual(calls, [4, 5, 5]);
    assert.deepEqual(seen, [[7, 7], [8, 8]]);
    assert.deepEqual([monster.mux, monster.muy], [8, 8]);
});

test('set_apparxy underwater guesses do not add an exact-location draw', () => {
    const { state } = makeState();
    state.u.uinwater = true;
    const monster = ordinaryMonster(state);
    const calls = [];
    // Radius-one offsets choose <9,11>; there is no preceding rn2(3/4).
    const values = [0, 2];

    set_apparxy(monster, {
        state,
        random: sequenceRandom(values, calls),
        couldSee: () => true,
    });

    assert.deepEqual(calls, [3, 3]);
    assert.deepEqual([monster.mux, monster.muy], [9, 11]);
});

test('set_apparxy punts to the hero after 200 rejected guesses', () => {
    const { state } = makeState();
    state.u.uprops[INVIS].intrinsic = 1;
    const monster = ordinaryMonster(state, { mx: 9, my: 9 });
    let draws = 0;
    const random = {
        rn2() {
            // First miss the exact-location chance; every radius-one pair
            // thereafter selects the monster's own square and is rejected.
            return draws++ === 0 ? 1 : 0;
        },
    };

    set_apparxy(monster, {
        state,
        random,
        couldSee: () => assert.fail('own-square rejection comes first'),
    });

    // One exact-location draw plus two coordinate draws for each source try.
    assert.equal(draws, 1 + 2 * 200);
    assert.deepEqual([monster.mux, monster.muy], [state.u.ux, state.u.uy]);
});

test('set_apparxy permits an amorphous monster to guess a closed door', () => {
    const { locations, state } = makeState();
    state.u.uprops[INVIS].intrinsic = 1;
    locations.set('9,10', { typ: DOOR, flags: D_CLOSED });
    const monster = newMonster({
        data: state.mons[PM_FOG_CLOUD],
        mnum: PM_FOG_CLOUD,
        mx: 4,
        my: 4,
        mcansee: true,
    });
    const calls = [];
    // Miss exact knowledge, then choose the closed door immediately west.
    const values = [1, 0, 1];

    set_apparxy(monster, {
        state,
        random: sequenceRandom(values, calls),
        couldSee: () => true,
    });

    assert.deepEqual(calls, [3, 3, 3]);
    assert.deepEqual([monster.mux, monster.muy], [9, 10]);
});

test('accessible uses closed-door and raised-drawbridge surface rules', () => {
    const { locations, state } = makeState();
    locations.set('1,1', { typ: ROOM, flags: 0 });
    locations.set('2,1', { typ: DOOR, flags: D_CLOSED });
    locations.set('3,1', { typ: DRAWBRIDGE_UP, drawbridgemask: DB_ICE });
    locations.set('4,1', { typ: DRAWBRIDGE_UP, drawbridgemask: DB_MOAT });

    assert.equal(accessible(1, 1, state), true);
    assert.equal(accessible(2, 1, state), false);
    assert.equal(accessible(3, 1, state), true);
    assert.equal(accessible(4, 1, state), false);
});

test('can_ooze preserves the source inventory-width whitelist', () => {
    const { state } = makeState();
    const monster = newMonster({ data: state.mons[PM_FOG_CLOUD] });

    assert.equal(can_ooze(monster, state), true);
    assert.equal(can_ooze(ordinaryMonster(state), state), false);

    monster.minvent = objectFor(state, DAGGER);
    assert.equal(can_ooze(monster, state), true);

    monster.minvent = objectFor(state, LONG_SWORD);
    assert.equal(can_ooze(monster, state), false);

    const sack = objectFor(state, SACK);
    sack.cobj = objectFor(state, DAGGER);
    monster.minvent = sack;
    assert.equal(can_ooze(monster, state), false);

    // monmove.c tests the generic coin otyp and rejects quantities above 100.
    monster.minvent = objectFor(state, COIN_CLASS, { quan: 101 });
    assert.equal(can_ooze(monster, state), false);
});

test('can_fog checks vampire form, genocide, protection, and inventory', () => {
    const { state } = makeState();
    const monster = newMonster({
        cham: PM_VAMPIRE_LEADER,
        data: state.mons[PM_VAMPIRE_LEADER],
    });

    assert.equal(can_fog(monster, state), true);

    state.mvitals[PM_FOG_CLOUD].mvflags |= G_GENOD;
    assert.equal(can_fog(monster, state), false);
    state.mvitals[PM_FOG_CLOUD].mvflags &= ~G_GENOD;

    state.u.uprops[PROT_FROM_SHAPE_CHANGERS].intrinsic = 1;
    assert.equal(can_fog(monster, state), false);
    state.u.uprops[PROT_FROM_SHAPE_CHANGERS].intrinsic = 0;

    monster.minvent = objectFor(state, LONG_SWORD);
    assert.equal(can_fog(monster, state), false);

    monster.minvent = null;
    monster.cham = 0;
    assert.equal(can_fog(monster, state), false);
});

test('sengr_at preserves strict, timing, headstone, and case rules', () => {
    const { state } = makeState();
    state.moves = 20;
    const engraving = make_engr_at(
        10,
        10,
        'Elbereth',
        'Elbereth',
        19, // Already complete on the current source turn.
        DUST,
        { state },
    );

    assert.equal(sengr_at('elbereth', 10, 10, true, state), engraving);
    assert.equal(sengr_at('beret', 10, 10, true, state), null);
    assert.equal(sengr_at('beret', 10, 10, false, state), engraving);

    engraving.engr_time = 21; // Completion lies one turn in the future.
    assert.equal(sengr_at('Elbereth', 10, 10, true, state), null);
    engraving.engr_time = 19;
    engraving.engr_type = HEADSTONE;
    assert.equal(sengr_at('Elbereth', 10, 10, true, state), null);
});

test('onscary applies immunity before auditory and map-based scares', () => {
    const { state } = makeState();
    const ordinary = ordinaryMonster(state);
    assert.equal(onscary(0, 0, ordinary, state), true);

    ordinary.iswiz = true;
    assert.equal(onscary(0, 0, ordinary, state), false);

    const angel = newMonster({ data: state.mons[PM_ANGEL] });
    assert.equal(onscary(0, 0, angel, state), false);

    const human = newMonster({ data: state.mons[PM_HUMAN] });
    assert.equal(onscary(10, 10, human, state), false);
});

test('onscary recognizes vampire altars and scare-monster scrolls', () => {
    const { locations, state } = makeState();
    locations.set('6,6', { typ: ALTAR, flags: AM_LAWFUL });
    const vampire = newMonster({
        data: state.mons[PM_VAMPIRE_LEADER],
        cham: PM_VAMPIRE_LEADER,
    });
    assert.equal(onscary(6, 6, vampire, state), true);

    state.level.objects[7][7] = objectFor(state, SCR_SCARE_MONSTER);
    assert.equal(onscary(7, 7, ordinaryMonster(state), state), true);
});

test('onscary requires an active whole Elbereth and an eligible monster', () => {
    const { state } = makeState();
    state.moves = 20;
    make_engr_at(
        state.u.ux,
        state.u.uy,
        'Elbereth',
        'Elbereth',
        19, // The engraving is complete before this movement phase.
        DUST,
        { state },
    );
    const monster = ordinaryMonster(state, { mcansee: true });

    assert.equal(onscary(state.u.ux, state.u.uy, monster, state), true);
    monster.mpeaceful = true;
    assert.equal(onscary(state.u.ux, state.u.uy, monster, state), false);

    monster.mpeaceful = false;
    state.head_engr.engr_txt[0] = 'Elbereth Elbereth';
    assert.equal(onscary(state.u.ux, state.u.uy, monster, state), false);
});

// monmove.c onscary():295-297. Three things can put the hero's protection on
// an Elbereth square, and the test above only covers the first, u_at(). These
// are the other two, each shown granting the protection on its own and each
// shown withholding it when only half of it holds.
test('onscary grants Elbereth to a displaced image or a guarded pile', () => {
    const { state } = makeState();
    state.moves = 20;
    // Two squares east of the hero, so u_at() is false throughout and only
    // the second and third disjuncts can answer.
    const x = state.u.ux + 2;
    const y = state.u.uy;
    make_engr_at(x, y, 'Elbereth', 'Elbereth', 19, DUST, { state });
    const monster = ordinaryMonster(state, { mcansee: true });

    // Neither disjunct holds: no displaced image, and display.h vobj_at()
    // answers an empty floor.
    assert.equal(onscary(x, y, monster, state), false);

    // The hero's displaced image stands there: the second disjunct alone.
    state.u.uprops[DISPLACED].intrinsic = 1;
    monster.mux = x;
    monster.muy = y;
    assert.equal(onscary(x, y, monster, state), true);
    // Displacement without the image on this square grants nothing.
    monster.mux = state.u.ux;
    monster.muy = state.u.uy;
    assert.equal(onscary(x, y, monster, state), false);
    state.u.uprops[DISPLACED].intrinsic = 0;

    // The third disjunct needs both halves. An object on a hero-written
    // Elbereth is not guarded, because engrave.c sets guardobjects only for
    // an Elbereth laid down during level creation.
    state.level.objects[x][y] = objectFor(state, LONG_SWORD);
    assert.equal(state.head_engr.guardobjects, false);
    assert.equal(onscary(x, y, monster, state), false);
    // A guarded engraving with the pile still there scares the monster.
    state.head_engr.guardobjects = true;
    assert.equal(onscary(x, y, monster, state), true);
    // Take the pile away and the same engraving guards nothing.
    state.level.objects[x][y] = null;
    assert.equal(onscary(x, y, monster, state), false);
});

test('in_your_sanctuary validates room, priest, shrine, and alignment', () => {
    const baseline = sanctuaryFixture();
    assert.equal(in_your_sanctuary(
        baseline.monster,
        0,
        0,
        baseline.state,
    ), true);
    assert.equal(in_your_sanctuary(null, 6, 6, baseline.state), true);

    for (const [name, invalidate] of [
        ['alignment record', ({ state }) => { state.u.ualign.record = -4; }],
        ['occupied temple', ({ state }) => { state.u.urooms[0] = 0; }],
        ['target room', ({ locations }) => {
            locations.set('6,6', { typ: ROOM, flags: 0, roomno: 0 });
        }],
        ['priest lookup', ({ state }) => { state.level.monlist = null; }],
        ['shrine', ({ locations, roomNumber }) => {
            locations.set('8,8', {
                typ: ALTAR,
                flags: AM_LAWFUL,
                roomno: roomNumber,
            });
        }],
        ['coalignment', ({ state }) => {
            state.u.ualign.type = A_NEUTRAL;
        }],
        ['peaceful priest', ({ priest }) => { priest.mpeaceful = false; }],
    ]) {
        const fixture = sanctuaryFixture();
        invalidate(fixture);
        assert.equal(in_your_sanctuary(
            fixture.monster,
            0,
            0,
            fixture.state,
        ), false, name);
    }

    for (const [name, pmidx] of [
        ['minion', PM_ANGEL],
        ['rider', PM_DEATH],
    ]) {
        const fixture = sanctuaryFixture();
        const immune = newMonster({
            data: fixture.state.mons[pmidx],
            mnum: pmidx,
            mx: 6,
            my: 6,
        });
        assert.equal(in_your_sanctuary(
            immune,
            0,
            0,
            fixture.state,
        ), false, name);
    }
});

test('monnear excludes only grid-bug diagonal adjacency', () => {
    const { state } = makeState();
    const ordinary = ordinaryMonster(state, { mx: 5, my: 5 });
    const gridBug = newMonster({
        data: state.mons[PM_GRID_BUG],
        mnum: PM_GRID_BUG,
        mx: 5,
        my: 5,
    });

    assert.equal(monnear(ordinary, 6, 6, state), true);
    assert.equal(monnear(gridBug, 6, 6, state), false);
    assert.equal(monnear(gridBug, 6, 5, state), true);
    assert.equal(monnear(ordinary, 7, 5, state), false);
});

test('disturb rejects unseen, distant, and stealth-shielded monsters drawlessly', async () => {
    const { state } = makeState();
    const monster = ordinaryMonster(state, {
        mx: 9,
        my: 10,
        msleeping: true,
    });
    const noDraw = { rn2: () => assert.fail('rejected wake must not draw') };

    assert.equal(await disturb(monster, {
        state,
        random: noDraw,
        couldSee: () => false,
    }), 0);

    monster.mx = 1;
    monster.my = 1;
    assert.equal(await disturb(monster, {
        state,
        random: noDraw,
        couldSee: () => true,
    }), 0);

    monster.mx = 9;
    monster.my = 10;
    state.u.uprops[STEALTH].intrinsic = 1;
    assert.equal(await disturb(monster, {
        state,
        random: noDraw,
        couldSee: () => true,
    }), 0);
    assert.equal(monster.msleeping, true);
});

test('disturb treats blocked Stealth as inactive without an Ettin draw', async () => {
    const { state } = makeState();
    state.u.uprops[STEALTH].intrinsic = 1;
    state.u.uprops[STEALTH].blocked = 1;
    const dog = newMonster({
        data: state.mons[PM_LITTLE_DOG],
        mnum: PM_LITTLE_DOG,
        msleeping: true,
        mx: 9,
        my: 10,
    });
    assert.equal(await disturb(dog, {
        state,
        random: { rn2: () => assert.fail('blocked Stealth is inactive') },
        couldSee: () => true,
        wakeMessage() {},
    }), 1);

    const ettin = newMonster({
        data: state.mons[PM_ETTIN],
        mnum: PM_ETTIN,
        msleeping: true,
        mx: 9,
        my: 10,
    });
    const calls = [];
    assert.equal(await disturb(ettin, {
        state,
        random: sequenceRandom([0], calls),
        couldSee: () => true,
        wakeMessage() {},
    }), 1);
    assert.deepEqual(calls, [7]);
});

test('disturb preserves Ettin and hard-sleeper random order', async () => {
    const { state } = makeState();
    state.u.uprops[STEALTH].intrinsic = 1;
    const ettin = newMonster({
        data: state.mons[PM_ETTIN],
        mnum: PM_ETTIN,
        mx: 9,
        my: 10,
        msleeping: true,
    });
    const ettinCalls = [];

    assert.equal(await disturb(ettin, {
        state,
        random: sequenceRandom([1, 0], ettinCalls),
        couldSee: () => true,
        wakeMessage(candidate, hostile) {
            assert.equal(candidate.msleeping, true);
            assert.equal(hostile, true);
        },
    }), 1);
    assert.deepEqual(ettinCalls, [10, 7]);
    assert.equal(ettin.msleeping, false);

    state.u.uprops[STEALTH].intrinsic = 0;
    for (const pmidx of [PM_WOOD_NYMPH, PM_JABBERWOCK, PM_LEPRECHAUN]) {
        const hardSleeper = newMonster({
            data: state.mons[pmidx],
            mnum: pmidx,
            mx: 9,
            my: 10,
            msleeping: true,
        });
        const calls = [];
        assert.equal(await disturb(hardSleeper, {
            state,
            random: sequenceRandom([1], calls),
            couldSee: () => true,
            wakeMessage: () => assert.fail('failed rare wake stays asleep'),
        }), 0);
        assert.deepEqual(calls, [50]);
        assert.equal(hardSleeper.msleeping, true);
    }

    const nymph = newMonster({
        data: state.mons[PM_WOOD_NYMPH],
        mnum: PM_WOOD_NYMPH,
        mx: 9,
        my: 10,
        msleeping: true,
    });
    const nymphCalls = [];
    assert.equal(await disturb(nymph, {
        state,
        random: sequenceRandom([0, 0], nymphCalls),
        couldSee: () => true,
        wakeMessage() {},
    }), 1);
    assert.deepEqual(nymphCalls, [50, 7]);
});

test('disturb lets dogs and aggravation bypass the final random draw', async () => {
    const { state } = makeState();
    const dog = newMonster({
        data: state.mons[PM_LITTLE_DOG],
        mnum: PM_LITTLE_DOG,
        mpeaceful: true,
        msleeping: true,
        mx: 9,
        my: 10,
    });
    const noDraw = { rn2: () => assert.fail('readily awakened without draw') };
    let dogHostile;

    assert.equal(await disturb(dog, {
        state,
        random: noDraw,
        couldSee: () => true,
        wakeMessage(_candidate, hostile) {
            dogHostile = hostile;
        },
    }), 1);
    assert.equal(dogHostile, false);

    const ordinary = ordinaryMonster(state, {
        mx: 9,
        my: 10,
        msleeping: true,
    });
    state.u.uprops[AGGRAVATE_MONSTER].extrinsic = 1;
    assert.equal(await disturb(ordinary, {
        state,
        random: noDraw,
        couldSee: () => true,
        wakeMessage() {},
    }), 1);
});

test('disturb draws before rejecting a concealed ordinary monster', async () => {
    const { state } = makeState();
    const monster = ordinaryMonster(state, {
        m_ap_type: M_AP_OBJECT,
        msleeping: true,
        mx: 9,
        my: 10,
    });
    const calls = [];

    assert.equal(await disturb(monster, {
        state,
        random: sequenceRandom([0], calls),
        couldSee: () => true,
        wakeMessage: () => assert.fail('concealed monster stays asleep'),
    }), 0);
    assert.deepEqual(calls, [7]);
    assert.equal(monster.msleeping, true);
});

test('disturb preflights wake-message ownership before consuming randomness', async () => {
    const { state } = makeState();
    const monster = ordinaryMonster(state, {
        msleeping: true,
        mx: 9,
        my: 10,
    });

    await assert.rejects(disturb(monster, {
        state,
        random: { rn2: () => assert.fail('missing wake owner preflights') },
        couldSee: () => true,
    }), /wakeMessage/);
    assert.equal(monster.msleeping, true);
});

test('disturb keeps sleep state behind the asynchronous wake owner', async () => {
    const { state } = makeState();
    const monster = newMonster({
        data: state.mons[PM_LITTLE_DOG],
        mnum: PM_LITTLE_DOG,
        msleeping: true,
        mx: 9,
        my: 10,
    });
    const wake = deferred();
    let settled = false;
    const pending = disturb(monster, {
        state,
        random: { rn2: () => assert.fail('dogs wake without a draw') },
        couldSee: () => true,
        wakeMessage: () => wake.promise,
    });
    pending.then(() => { settled = true; });

    assert.equal(monster.msleeping, true);
    await Promise.resolve();
    assert.equal(settled, false);
    wake.resolve();
    assert.equal(await pending, 1);
    assert.equal(monster.msleeping, false);
    assert.equal(settled, true);
});

test('monflee preserves timer extension, untimed fear, and first-call rules', async () => {
    const { state } = makeState();
    const fresh = ordinaryMonster(state, {
        mhp: 5,
        mtrack: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
    });
    await monflee(fresh, 1, true, false, { state });
    assert.equal(fresh.mflee, true);
    assert.equal(fresh.mfleetim, 2);
    assert.deepEqual(fresh.mtrack, [{ x: 0, y: 0 }, { x: 0, y: 0 }]);

    const timed = ordinaryMonster(state, {
        mhp: 5,
        mflee: true,
        mfleetim: 120,
    });
    await monflee(timed, 20, false, false, { state });
    assert.equal(timed.mfleetim, 127);

    const newlyUntimed = ordinaryMonster(state, {
        mhp: 5,
        mflee: true,
        mfleetim: 9,
    });
    await monflee(newlyUntimed, 0, false, false, { state });
    assert.equal(newlyUntimed.mfleetim, 0);

    const untimed = ordinaryMonster(state, {
        mhp: 5,
        mflee: true,
        mfleetim: 0,
    });
    await monflee(untimed, 20, false, false, { state });
    assert.equal(untimed.mfleetim, 0);

    const alreadyFleeing = ordinaryMonster(state, {
        mhp: 5,
        mflee: true,
        mfleetim: 9,
        mtrack: [{ x: 6, y: 7 }, { x: 8, y: 9 }],
    });
    await monflee(alreadyFleeing, 20, true, false, { state });
    assert.equal(alreadyFleeing.mfleetim, 9);
    assert.deepEqual(alreadyFleeing.mtrack, [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
    ]);
});

test('monflee releases the hero before timing and emits before setting mflee', async () => {
    const { state } = makeState();
    const monster = ordinaryMonster(state, {
        mhp: 5,
        mcanmove: true,
        mfleetim: 0,
    });
    state.u.ustuck = monster;
    const events = [];

    await monflee(monster, 1, true, true, {
        state,
        random: {
            rn2: () => assert.fail('ordinary flight message must not draw'),
        },
        couldSee: () => true,
        releaseHero(candidate) {
            events.push(`release:${candidate.mfleetim}`);
            state.u.ustuck = null;
        },
        canSeeMonster(candidate) {
            events.push(`see:${candidate.mfleetim}:${candidate.mflee}`);
            return true;
        },
        fleesLight(candidate) {
            events.push(`light:${candidate.mflee}`);
            return false;
        },
        fleeMessage(candidate, message) {
            events.push(`message:${message.kind}:${candidate.mflee}`);
        },
    });

    assert.deepEqual(events, [
        'release:0',
        'see:2:false',
        'light:false',
        'message:turns-to-flee:false',
    ]);
    assert.equal(monster.mflee, true);
});

test('monflee awaits release, message, and gas owners before later state', async () => {
    const { state } = makeState();
    const monster = newMonster({
        data: state.mons[PM_VROCK],
        mnum: PM_VROCK,
        mhp: 5,
        mcanmove: true,
        mflee: false,
        mfleetim: 0,
        mspec_used: 0,
        mtrack: [{ x: 2, y: 3 }],
        mx: 6,
        my: 7,
    });
    state.u.ustuck = monster;
    const release = deferred();
    const message = deferred();
    const messageStarted = deferred();
    const gas = deferred();
    const gasStarted = deferred();
    const events = [];

    const pending = monflee(monster, 1, true, true, {
        state,
        random: {
            rn2(bound) {
                events.push(`rn2(${bound})`);
                assert.equal(bound, 25);
                return 9;
            },
        },
        couldSee: () => true,
        async releaseHero() {
            events.push('release:start');
            await release.promise;
            state.u.ustuck = null;
            events.push('release:end');
        },
        canSeeMonster: () => true,
        fleesLight: () => false,
        async fleeMessage() {
            events.push('message:start');
            messageStarted.resolve();
            await message.promise;
            events.push('message:end');
        },
        async createGasCloud() {
            events.push('gas:start');
            gasStarted.resolve();
            await gas.promise;
            events.push('gas:end');
        },
    });

    assert.deepEqual(events, ['release:start']);
    assert.equal(monster.mfleetim, 0);
    assert.equal(monster.mflee, false);

    release.resolve();
    await messageStarted.promise;
    assert.equal(monster.mfleetim, 2);
    assert.equal(monster.mflee, false);
    assert.deepEqual(monster.mtrack, [{ x: 2, y: 3 }]);

    message.resolve();
    await gasStarted.promise;
    assert.equal(monster.mspec_used, 84);
    assert.equal(monster.mflee, false);
    assert.deepEqual(monster.mtrack, [{ x: 2, y: 3 }]);

    gas.resolve();
    await pending;
    assert.equal(monster.mflee, true);
    assert.deepEqual(monster.mtrack, [{ x: 0, y: 0 }]);
    assert.deepEqual(events, [
        'release:start',
        'release:end',
        'message:start',
        'message:end',
        'rn2(25)',
        'gas:start',
        'gas:end',
    ]);
});

test('monflee uses the immobile message before testing emitted light', async () => {
    const { state } = makeState();
    const monster = ordinaryMonster(state, {
        mhp: 5,
        mcanmove: false,
    });
    let message;

    await monflee(monster, 0, true, true, {
        state,
        random: { rn2: () => assert.fail('immobile flight does not draw') },
        couldSee: () => assert.fail('immobile flight skips light checks'),
        canSeeMonster: () => true,
        fleesLight: () => assert.fail('immobile branch precedes light'),
        fleeMessage(_candidate, selected) {
            message = selected;
        },
    });

    assert.deepEqual(message, { kind: 'immobile-flinch' });
    assert.equal(monster.mflee, true);
});

test('monflee checks visibility before concealed appearance suppression', async () => {
    const { state } = makeState();
    const monster = ordinaryMonster(state, {
        mhp: 5,
        mcanmove: true,
        m_ap_type: M_AP_OBJECT,
    });
    const events = [];

    await monflee(monster, 0, true, true, {
        state,
        random: { rn2: () => assert.fail('concealed flight does not draw') },
        couldSee: () => assert.fail('concealed flight skips light checks'),
        canSeeMonster() {
            events.push('see');
            return true;
        },
        fleesLight: () => assert.fail('appearance gate precedes light'),
        fleeMessage: () => assert.fail('concealed monster has no message'),
    });

    assert.deepEqual(events, ['see']);
    assert.equal(monster.mflee, true);
});

test('monflee selects every light-flight message in source order', async () => {
    const { state } = makeState();
    const sword = {
        otyp: LONG_SWORD,
        oartifact: ART_SUNSWORD,
        lamplit: true,
        owornmask: 0,
    };
    state.uwep = sword;

    async function lightMessage(overrides = {}, roll = null) {
        const monster = newMonster({
            data: state.mons[PM_GREMLIN],
            mnum: PM_GREMLIN,
            mhp: 5,
            mcanmove: true,
            mcansee: true,
            mx: 4,
            my: 4,
            ...overrides,
        });
        const calls = [];
        let message;
        await monflee(monster, 0, true, true, {
            state,
            random: {
                rn2(bound) {
                    calls.push(bound);
                    if (roll == null) assert.fail('unaware hero must not draw');
                    return roll;
                },
            },
            couldSee: () => true,
            canSeeMonster: () => true,
            fleeMessage(_candidate, selected) {
                message = selected;
            },
        });
        return { calls, message };
    }

    state.multi = -1;
    state.u.usleep = 1;
    assert.deepEqual(await lightMessage(), {
        calls: [],
        message: { kind: 'frightened' },
    });

    state.u.usleep = 0;
    state.u.uhs = FAINTED;
    assert.deepEqual(await lightMessage(), {
        calls: [],
        message: { kind: 'frightened' },
    });

    // youprop.h:399 needs both halves. A fainted hero who is not counting a
    // negative gm.multi down is awake for this, which is what separates the
    // macro from a test on eat.c is_fainted() alone.
    state.multi = 0;
    assert.deepEqual(await lightMessage({}, 0), {
        calls: [10],
        message: { kind: 'bright-light' },
    });

    state.multi = 0;
    state.u.uhs = 0;
    assert.deepEqual(await lightMessage({}, 0), {
        calls: [10],
        message: { kind: 'bright-light' },
    });

    state.u.uprops[DEAF].intrinsic = 1;
    assert.deepEqual(await lightMessage({}, 0), {
        calls: [10],
        message: { kind: 'painful-light', lightSource: sword },
    });

    state.u.uprops[DEAF].intrinsic = 0;
    sword.lamplit = false;
    state.uarm = {
        otyp: GOLD_DRAGON_SCALE_MAIL,
        lamplit: true,
        owornmask: W_ARM,
    };
    const sourceQuirk = await lightMessage({}, 1);
    assert.deepEqual(sourceQuirk.calls, [10]);
    assert.equal(sourceQuirk.message.kind, 'painful-light');
    // Source naming prefers an artifact weapon even when the armor supplied
    // the actual visible light for this branch.
    assert.equal(sourceQuirk.message.lightSource, sword);
});

// monmove.c:450-456 flees_light() is
//   (mon)->data == &mons[PM_GREMLIN]
//   && ((uwep && uwep->lamplit && artifact_light(uwep))
//       || (uarm && uarm->lamplit && artifact_light(uarm)))
//   && mon->mcansee && couldsee(mon->mx, mon->my)
// so the species test and each half of the equipment disjunction must all
// hold. Both cases below leave exactly one of them unmet and expect the
// ordinary flight message, which is the branch monflee() takes when
// flees_light() is false.
test('monflee reads the gremlin light test as a conjunction', async () => {
    async function fleeMessageFor(state, mnum) {
        const monster = newMonster({
            data: state.mons[mnum],
            mnum,
            mhp: 5,
            mcanmove: true,
            mcansee: true,
            mx: 4,
            my: 4,
        });
        let message;
        await monflee(monster, 0, true, true, {
            state,
            random: {
                rn2: () => assert.fail('no light message needs a draw here'),
            },
            couldSee: () => true,
            canSeeMonster: () => true,
            fleeMessage(_candidate, selected) { message = selected; },
        });
        return message;
    }

    // A Sunsword and gold dragon scale mail are artifact.c artifact_light()'s
    // two cases, and neither is kindled here. Each disjunct therefore has its
    // artifact_light() term without its lamplit term.
    const dark = makeState().state;
    dark.uwep = {
        otyp: LONG_SWORD,
        oartifact: ART_SUNSWORD,
        lamplit: false,
        owornmask: 0,
    };
    dark.uarm = {
        otyp: GOLD_DRAGON_SCALE_MAIL,
        lamplit: false,
        owornmask: W_ARM,
    };
    assert.deepEqual(
        await fleeMessageFor(dark, PM_GREMLIN),
        { kind: 'turns-to-flee' },
    );

    // The same equipment lit, carried by a giant rat: the disjunction holds
    // and only the species test fails.
    const lit = makeState().state;
    lit.uwep = {
        otyp: LONG_SWORD,
        oartifact: ART_SUNSWORD,
        lamplit: true,
        owornmask: 0,
    };
    lit.uarm = {
        otyp: GOLD_DRAGON_SCALE_MAIL,
        lamplit: true,
        owornmask: W_ARM,
    };
    assert.deepEqual(
        await fleeMessageFor(lit, PM_GIANT_RAT),
        { kind: 'turns-to-flee' },
    );
});

test('monflee gives a newly fleeing Vrock its gas cooldown before the cloud', async () => {
    const { state } = makeState();
    const monster = newMonster({
        data: state.mons[PM_VROCK],
        mnum: PM_VROCK,
        mhp: 5,
        mx: 6,
        my: 7,
        mtrack: [{ x: 2, y: 3 }],
    });
    const events = [];

    await monflee(monster, 0, true, false, {
        state,
        random: {
            rn2(bound) {
                events.push(`rn2(${bound})`);
                assert.equal(bound, 25);
                return 9;
            },
        },
        createGasCloud(x, y, radius, damage) {
            events.push(`gas:${x},${y},${radius},${damage}`);
            assert.equal(monster.mspec_used, 84);
            assert.equal(monster.mflee, false);
        },
    });

    assert.deepEqual(events, ['rn2(25)', 'gas:6,7,5,8']);
    assert.equal(monster.mspec_used, 84);
    assert.equal(monster.mflee, true);
    assert.deepEqual(monster.mtrack, [{ x: 0, y: 0 }]);
});

test('monflee preflights downstream ownership and ignores dead monsters', async () => {
    const { state } = makeState();
    const dead = ordinaryMonster(state, {
        mhp: 0,
        mtrack: [{ x: 1, y: 2 }],
    });
    await monflee(dead, 5, true, true, {
        get state() {
            assert.fail('dead monsters return before environment access');
        },
    });
    assert.deepEqual(dead.mtrack, [{ x: 1, y: 2 }]);

    const stuck = ordinaryMonster(state, {
        mhp: 5,
        mfleetim: 6,
        mtrack: [{ x: 1, y: 2 }],
    });
    state.u.ustuck = stuck;
    await assert.rejects(
        monflee(stuck, 5, true, false, { state }),
        /releaseHero/,
    );
    assert.equal(stuck.mfleetim, 6);
    assert.deepEqual(stuck.mtrack, [{ x: 1, y: 2 }]);

    state.u.ustuck = null;
    const visible = ordinaryMonster(state, { mhp: 5, mfleetim: 6 });
    await assert.rejects(
        monflee(visible, 5, true, true, { state }),
        /canSeeMonster/,
    );
    assert.equal(visible.mfleetim, 6);

    const vrock = newMonster({
        data: state.mons[PM_VROCK],
        mnum: PM_VROCK,
        mhp: 5,
        mfleetim: 6,
    });
    await assert.rejects(
        monflee(vrock, 5, true, false, {
            state,
            random: { rn2: () => assert.fail('missing gas owner preflights') },
        }),
        /createGasCloud/,
    );
    assert.equal(vrock.mfleetim, 6);
    assert.equal(vrock.mspec_used, 0);
});

test('distfleeck always draws brave-gremlin before checking a far monster', async () => {
    const { state } = makeState();
    const monster = ordinaryMonster(state, {
        mx: 1,
        my: 1,
        mux: 10,
        muy: 10,
    });
    const events = [];

    const result = await distfleeck(monster, {
        state,
        random: {
            rn2(bound) {
                events.push(`rn2(${bound})`);
                return 1;
            },
            rnd: () => assert.fail('a far monster does not flee'),
        },
        onScary() {
            events.push('onscary');
            return false;
        },
        fleesLight: () => assert.fail('nearby gate comes first'),
        inYourSanctuary: () => assert.fail('nearby gate comes first'),
        monFlee: () => assert.fail('a far monster does not flee'),
    });

    assert.deepEqual(events, ['rn2(5)', 'onscary']);
    assert.deepEqual(result, { inrange: false, nearby: false, scared: false });
});

test('distfleeck validates its action owner before consuming randomness', async () => {
    const { state } = makeState();
    const monster = ordinaryMonster(state);

    await assert.rejects(
        distfleeck(monster, {
            state,
            random: {
                rn2: () => assert.fail('missing monFlee must preflight'),
                rnd: () => assert.fail('missing monFlee must preflight'),
            },
        }),
        /requires a monFlee operation/,
    );
});

test('distfleeck preserves scare duration draws and monflee arguments', async () => {
    const { state } = makeState();
    const monster = ordinaryMonster(state, {
        mx: 9,
        my: 10,
        mux: 10,
        muy: 10,
    });
    const events = [];

    const result = await distfleeck(monster, {
        state,
        random: {
            rn2(bound) {
                events.push(`rn2(${bound})`);
                // The rn2(7) result selects the ten-turn rnd bound.
                return bound === 7 ? 1 : 2;
            },
            rnd(bound) {
                events.push(`rnd(${bound})`);
                return 6; // Representative non-edge flee duration.
            },
        },
        onScary() {
            events.push('onscary');
            return true;
        },
        fleesLight: () => assert.fail('a seen scare short-circuits light'),
        inYourSanctuary: () => assert.fail('a seen scare short-circuits temple'),
        async monFlee(candidate, duration, first, message) {
            events.push(`monflee(${duration},${first},${message})`);
            assert.equal(candidate, monster);
        },
    });

    assert.deepEqual(events, [
        'rn2(5)',
        'onscary',
        'rn2(7)',
        'rnd(10)',
        'monflee(6,true,true)',
    ]);
    assert.deepEqual(result, { inrange: true, nearby: true, scared: true });
});

test('distfleeck awaits the asynchronous flee owner before returning', async () => {
    const { state } = makeState();
    const monster = ordinaryMonster(state, {
        mx: 9,
        my: 10,
        mux: 10,
        muy: 10,
    });
    const flee = deferred();
    const fleeStarted = deferred();
    let settled = false;
    const pending = distfleeck(monster, {
        state,
        random: {
            rn2(bound) {
                assert.ok(bound === 5 || bound === 7);
                return 1;
            },
            rnd(bound) {
                assert.equal(bound, 10);
                return 6;
            },
        },
        onScary: () => true,
        fleesLight: () => assert.fail('scary square short-circuits light'),
        inYourSanctuary: () => assert.fail('scary square short-circuits temple'),
        async monFlee() {
            fleeStarted.resolve();
            await flee.promise;
        },
    });
    pending.then(() => { settled = true; });

    await fleeStarted.promise;
    await Promise.resolve();
    assert.equal(settled, false);
    flee.resolve();
    assert.deepEqual(await pending, {
        inrange: true,
        nearby: true,
        scared: true,
    });
    assert.equal(settled, true);
});

test('distfleeck independently recognizes light and sanctuary fear', async () => {
    async function runCause({ brave, light, peaceful, sanctuary }) {
        const { state } = makeState();
        const monster = ordinaryMonster(state, {
            mpeaceful: peaceful,
            mx: 9,
            my: 10,
            mux: 10,
            muy: 10,
        });
        const events = [];
        const result = await distfleeck(monster, {
            state,
            random: {
                rn2(bound) {
                    events.push(`rn2(${bound})`);
                    if (bound === 5) return brave ? 0 : 1;
                    assert.equal(bound, 7);
                    return 1;
                },
                rnd(bound) {
                    events.push(`rnd(${bound})`);
                    return 6;
                },
            },
            onScary() {
                events.push('onscary');
                return false;
            },
            fleesLight() {
                events.push('light');
                return light;
            },
            inYourSanctuary() {
                events.push('sanctuary');
                return sanctuary;
            },
            monFlee(candidate, duration, first, message) {
                events.push(`monflee(${duration},${first},${message})`);
                assert.equal(candidate, monster);
            },
        });
        return { events, result };
    }

    assert.deepEqual(await runCause({
        brave: false,
        light: true,
        peaceful: false,
        sanctuary: false,
    }), {
        events: [
            'rn2(5)',
            'onscary',
            'light',
            'rn2(7)',
            'rnd(10)',
            'monflee(6,true,true)',
        ],
        result: { inrange: true, nearby: true, scared: true },
    });
    assert.deepEqual(await runCause({
        brave: true,
        light: true,
        peaceful: true,
        sanctuary: false,
    }), {
        events: ['rn2(5)', 'onscary', 'light'],
        result: { inrange: true, nearby: true, scared: false },
    });
    assert.deepEqual(await runCause({
        brave: false,
        light: false,
        peaceful: false,
        sanctuary: true,
    }), {
        events: [
            'rn2(5)',
            'onscary',
            'light',
            'sanctuary',
            'rn2(7)',
            'rnd(10)',
            'monflee(6,true,true)',
        ],
        result: { inrange: true, nearby: true, scared: true },
    });
});

test('distfleeck checks an invisible hero at the guessed square', async () => {
    const { state } = makeState();
    state.u.uprops[INVIS].intrinsic = 1;
    const monster = ordinaryMonster(state, {
        mpeaceful: true,
        mx: 8,
        my: 8,
        mux: 9,
        muy: 9,
        mcansee: true,
    });
    const checked = [];

    const result = await distfleeck(monster, {
        state,
        random: { rn2: () => 1, rnd: () => assert.fail('not scared') },
        onScary(x, y) {
            checked.push([x, y]);
            return false;
        },
        fleesLight: () => false,
        monFlee: () => assert.fail('not scared'),
    });

    assert.deepEqual(checked, [[monster.mux, monster.muy]]);
    assert.deepEqual(result, { inrange: true, nearby: true, scared: false });
});
