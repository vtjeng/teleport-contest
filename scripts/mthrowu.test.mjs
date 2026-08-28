import assert from 'node:assert/strict';
import test from 'node:test';

import {
    COULD_SEE,
    D_CLOSED,
    DOOR,
    LAVAWALL,
    MOAT,
    M_AP_MONSTER,
    M_AP_NOTHING,
    M_AP_OBJECT,
    ROOM,
    STONE,
    NEED_WEAPON,
    W_WEP,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_GIANT_RAT, PM_STONE_GIANT } from '../js/monsters.js';
import { newMonster } from '../js/monst.js';
import { mksobj, mksobj_at } from '../js/obj.js';
import { ARROW, BOULDER, BOW, WAN_STRIKING } from '../js/objects.js';
import { blocking_terrain, lined_up, linedup, m_lined_up, thrwmu }
    from '../js/mthrowu.js';
import { block_point, vision_reset } from '../js/vision.js';

// The same Valkyrie several other suites replay: a lit starting room on
// dungeon level one, with the hero standing in it.
const DATETIME = '20260214031500';
const RC = [
    'OPTIONS=name:Lich,role:Valkyrie,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none,!acoustics,time',
    '',
].join('\n');

async function hero() {
    await runSegment({
        seed: 7710044, datetime: DATETIME, nethackrc: RC, moves: '',
    });
    return game;
}

// A monster whose square and believed hero position the caller sets. Only the
// fields linedup() and m_lined_up() read are filled in.
function attacker(state, mx, my, mux, muy, data = state.mons[PM_GIANT_RAT]) {
    return newMonster({ data, mx, my, mux, muy, m_id: 5100 });
}

// A source that fails the test rather than answering, for the paths where C
// reaches no rn2().
function noDraw() {
    return { rn2: (bound) => assert.fail(`unexpected rn2(${bound})`) };
}

// Straight open floor along one row, and unlit so that no vision rebuild is
// needed to keep cansee() out of the answer.
function clearRow(state, fromX, toX, y) {
    for (let x = Math.min(fromX, toX); x <= Math.max(fromX, toX); ++x) {
        const location = state.level.at(x, y);
        location.typ = ROOM;
        location.flags = 0;
        location.doormask = 0;
        location.wall_info = 0;
    }
}

// Sets the bit linedup() reads when the ray starts on the hero's own square,
// where it takes its `u_at(ax, ay) ? couldsee(bx, by)` arm and the state's
// viz_array decides. vision.c clear_path(), the other arm, answers from the
// module-level transparency index that vision_reset() builds rather than from
// the map this test edits, so a case that wants that arm calls vision_reset()
// after carving the row; scripts/light-vision.test.mjs pins clear_path()
// itself.
function setCouldSee(state, x, y, visible) {
    if (visible) state.viz_array[y][x] |= COULD_SEE;
    else state.viz_array[y][x] &= ~COULD_SEE;
}

test('thrwmu spends an empty-handed launcher wield turn', async () => {
    const state = await hero();
    const y = state.u.uy;
    const subject = attacker(state, state.u.ux + 5, y, state.u.ux, y);
    subject.weapon_check = NEED_WEAPON;
    subject.mw = null;
    const arrow = mksobj(ARROW, false, false, { state });
    const bow = mksobj(BOW, false, false, { state });
    arrow.nobj = bow;
    bow.nobj = null;
    subject.minvent = arrow;
    const messages = [];

    assert.equal(await thrwmu(subject, {
        state,
        canSeeMonster: () => true,
        wieldMessage: (_monster, obj, detail) => {
            messages.push([obj.otyp, detail.exclaim]);
        },
        continueRangedAttack: () => assert.fail('wield turn continued'),
    }), 1);
    assert.equal(subject.mw, bow);
    assert.equal(subject.weapon_check, NEED_WEAPON);
    assert.equal(bow.owornmask, W_WEP);
    assert.deepEqual(messages, [[BOW, true]]);
});

test('blocking_terrain answers for each terrain mthrowu.c names', async () => {
    const state = await hero();
    const y = state.u.uy;
    const x = state.u.ux + 4;
    clearRow(state, x, x, y);
    assert.equal(blocking_terrain(x, y, state), false);

    // mthrowu.c:1284, in the order C tests them.
    state.level.at(x, y).typ = STONE;
    assert.equal(blocking_terrain(x, y, state), true);
    state.level.at(x, y).typ = DOOR;
    state.level.at(x, y).doormask = D_CLOSED;
    assert.equal(blocking_terrain(x, y, state), true);
    state.level.at(x, y).doormask = 0;
    state.level.at(x, y).typ = MOAT;
    // A moat is water but not a waterwall, so it does not block; lava wall
    // is the terrain C names separately and does.
    assert.equal(blocking_terrain(x, y, state), false);
    state.level.at(x, y).typ = LAVAWALL;
    assert.equal(blocking_terrain(x, y, state), true);

    // C's leading !isok(x, y). cmd.c isok():4329 is
    // x >= 1 && x <= COLNO - 1 && y >= 0 && y <= ROWNO - 1, so column zero is
    // off the map for C exactly as a negative column is. Carving floor there
    // first takes the later disjuncts out of the answer: mklev leaves column
    // zero as rock, where IS_OBSTRUCTED(STONE) would block whether or not
    // isok() ran.
    assert.equal(blocking_terrain(-1, y, state), true);
    clearRow(state, 0, 0, y);
    assert.equal(blocking_terrain(0, y, state), true);
});

test('linedup rejects a ray that is neither straight nor diagonal',
    async () => {
        const state = await hero();
        const y = state.u.uy;
        // mthrowu.c:1341-1345. Zero displacement first: a monster that thinks
        // the hero stands on its own square never fires.
        assert.equal(
            linedup(4, y, 4, y, 2, { state, random: noDraw() }),
            false,
        );
        // A knight's move is neither orthogonal nor diagonal.
        assert.equal(
            linedup(6, y + 1, 4, y, 2, { state, random: noDraw() }),
            false,
        );
        // mthrowu.c:1348, distmin(...) < BOLT_LIM with BOLT_LIM 8. Seven
        // squares away is in line and eight is not, and the hero's square
        // carries COULD_SEE so the in-line answer is TRUE.
        clearRow(state, state.u.ux, state.u.ux + 8, y);
        setCouldSee(state, state.u.ux + 7, y, true);
        setCouldSee(state, state.u.ux + 8, y, true);
        assert.equal(
            linedup(state.u.ux, y, state.u.ux + 7, y, 2,
                { state, random: noDraw() }),
            true,
        );
        assert.equal(
            linedup(state.u.ux, y, state.u.ux + 8, y, 2,
                { state, random: noDraw() }),
            false,
        );
        // The same boundary up the column. distmin() takes the larger of the
        // two displacements, so a horizontal pair alone leaves its second
        // argument free: only a ray whose y displacement is the larger one
        // says that the origin it measures from is <0,0>.
        setCouldSee(state, state.u.ux, y - 7, true);
        setCouldSee(state, state.u.ux, y - 8, true);
        assert.equal(
            linedup(state.u.ux, y, state.u.ux, y - 7, 2,
                { state, random: noDraw() }),
            true,
        );
        assert.equal(
            linedup(state.u.ux, y, state.u.ux, y - 8, 2,
                { state, random: noDraw() }),
            false,
        );
    });

test('linedup reads couldsee() for a ray aimed at the hero', async () => {
    const state = await hero();
    const y = state.u.uy;
    const monsterX = state.u.ux + 3;
    clearRow(state, state.u.ux, monsterX, y);
    // mthrowu.c:1349-1351. couldsee() answers for the attacker's own square,
    // not the target's, and it is the whole test in boulderhandling mode 0.
    setCouldSee(state, monsterX, y, true);
    assert.equal(
        linedup(state.u.ux, y, monsterX, y, 0, { state, random: noDraw() }),
        true,
    );
    setCouldSee(state, monsterX, y, false);
    assert.equal(
        linedup(state.u.ux, y, monsterX, y, 0, { state, random: noDraw() }),
        false,
    );
});

// mthrowu.c:1349-1351, `(u_at(ax, ay) ? couldsee(bx, by)
// : clear_path(ax, ay, bx, by))`. The two answers are not interchangeable, and
// the clear_path() half is the branch this file's extraction from
// js/monmove.js changed: the terrain walk it replaced answered from the map,
// while clear_path() answers from the transparency index vision_reset() built.
// Only a ray that does not start on the hero's square reaches it, which is
// every monster-versus-monster call.
test('linedup reads clear_path() for a ray that misses the hero square',
    async () => {
        const state = await hero();
        const y = state.u.uy;
        // Two squares east of the hero, so the ray is three long and well
        // inside BOLT_LIM.
        const targetX = state.u.ux + 3;
        clearRow(state, state.u.ux, targetX, y);
        // clear_path() answers from the transparency index vision_reset()
        // builds, not from the map this test edits, so the carved row has to
        // be published to that index before either answer below means
        // anything.
        vision_reset(state);
        setCouldSee(state, targetX, y, true);

        // From the hero's own square the couldsee() arm answers TRUE for the
        // bit just set.
        assert.equal(
            linedup(state.u.ux, y, targetX, y, 0,
                { state, random: noDraw() }),
            true,
        );
        // One square east the other arm decides, and over a transparent row it
        // answers TRUE as well. This is the case every monster-versus-monster
        // shot takes, and an implementation that answered a constant FALSE
        // here would stop all of them.
        assert.equal(
            linedup(state.u.ux + 1, y, targetX, y, 0,
                { state, random: noDraw() }),
            true,
        );

        // Rock in the middle of the same row, published to the same index,
        // flips that arm and only that arm. Two opposite answers on one arm
        // are what separate reading clear_path() from never reaching it, and
        // the unchanged hero-square answer is what keeps the pair a test of
        // the condition rather than of the terrain.
        state.level.at(state.u.ux + 2, y).typ = STONE;
        vision_reset(state);
        assert.equal(
            linedup(state.u.ux + 1, y, targetX, y, 0,
                { state, random: noDraw() }),
            false,
        );
        assert.equal(
            linedup(state.u.ux, y, targetX, y, 0,
                { state, random: noDraw() }),
            true,
        );
    });

test('linedup handles boulders per its three boulderhandling modes',
    async () => {
        const state = await hero();
        const y = state.u.uy;
        const monsterX = state.u.ux + 3;
        clearRow(state, state.u.ux, monsterX, y);
        setCouldSee(state, monsterX, y, false);
        mksobj_at(BOULDER, state.u.ux + 1, y, false, false,
        // mkobj.c place_object() blocks the square's line of sight for a
        // boulder; couldsee() is exactly what these cases read back.
        { state, hooks: { blockPoint: (bx, by, env) => block_point(bx, by, env.state) } });

        // mthrowu.c:1355. Mode 0 stops at the lost line of sight and never
        // counts a boulder.
        assert.equal(
            linedup(state.u.ux, y, monsterX, y, 0,
                { state, random: noDraw() }),
            false,
        );
        // Mode 1 ignores boulders outright, so it also spends no draw.
        assert.equal(
            linedup(state.u.ux, y, monsterX, y, 1,
                { state, random: noDraw() }),
            true,
        );
        // Mode 2 reaches `rn2(2 + boulderspots) < 2` with one boulder
        // counted, so the bound is 3 and two of its three answers line the
        // attacker up.
        for (const [roll, expected] of [[0, true], [1, true], [2, false]]) {
            const bounds = [];
            assert.equal(
                linedup(state.u.ux, y, monsterX, y, 2, {
                    state,
                    random: {
                        rn2: (bound) => { bounds.push(bound); return roll; },
                    },
                }),
                expected,
            );
            assert.deepEqual(bounds, [3]);
        }

        // A second boulder widens the bound, which is what makes a heavily
        // blocked ray less likely to count as lined up.
        mksobj_at(BOULDER, state.u.ux + 2, y, false, false,
            { state, hooks: { blockPoint: (bx, by, env) => block_point(bx, by, env.state) } });
        const twoBoulders = [];
        linedup(state.u.ux, y, monsterX, y, 2, {
            state,
            random: {
                rn2: (bound) => { twoBoulders.push(bound); return 0; },
            },
        });
        assert.deepEqual(twoBoulders, [4]);

        // mthrowu.c:1365. Blocking terrain returns before the draw, so a
        // walled ray never rolls however many boulders precede the wall.
        state.level.at(state.u.ux + 2, y).typ = STONE;
        assert.equal(
            linedup(state.u.ux, y, monsterX, y, 2,
                { state, random: noDraw() }),
            false,
        );
    });

test('lined_up picks boulderhandling from the attacker itself', async () => {
    const state = await hero();
    const y = state.u.uy;
    const monsterX = state.u.ux + 3;
    clearRow(state, state.u.ux, monsterX, y);
    setCouldSee(state, monsterX, y, false);
    mksobj_at(BOULDER, state.u.ux + 1, y, false, false,
        // mkobj.c place_object() blocks the square's line of sight for a
        // boulder; couldsee() is exactly what these cases read back.
        { state, hooks: { blockPoint: (bx, by, env) => block_point(bx, by, env.state) } });
    const rat = attacker(state, monsterX, y, state.u.ux, y);

    // mthrowu.c:1382-1383. An ordinary monster gets mode 2 and rolls; one
    // that throws rocks -- M2_ROCKTHROW, which giants carry and trolls do
    // not -- gets mode 1 and does not.
    const bounds = [];
    assert.equal(
        lined_up(rat, {
            state,
            random: { rn2: (bound) => { bounds.push(bound); return 0; } },
        }),
        true,
    );
    assert.deepEqual(bounds, [3]);

    const giant = attacker(state, monsterX, y, state.u.ux, y,
        state.mons[PM_STONE_GIANT]);
    assert.equal(lined_up(giant, { state, random: noDraw() }), true);

    // The other half of that disjunction: a carried wand of striking buys
    // mode 1 for a species that throws no rocks.
    const wand = mksobj(WAN_STRIKING, false, false, { state });
    wand.nobj = null;
    rat.minvent = wand;
    assert.equal(lined_up(rat, { state, random: noDraw() }), true);
});

// mthrowu.c m_lined_up():1384-1387, the gate this port writes out at
// js/mthrowu.js:115-119. No running game reaches it -- Upolyd is false for
// every hero the port produces -- so the rn2(25) beside it is spent by nothing
// and the whole gate is scored by no session. It is written out rather than
// dropped because a skipped draw would shift every later call in the turn once
// polymorph lands, and that is exactly the kind of line a test has to pin,
// since nothing else can.
//
// Each case names the answer it separates. The three terms are `rn2(25)`, then
// `u.uundetected`, then the appearance test, and the last two are a
// disjunction inside the conjunction, so the rows below walk both.
test('m_lined_up lets a polymorphed hero conceal herself', async () => {
    const state = await hero();
    const y = state.u.uy;
    const monsterX = state.u.ux + 3;
    clearRow(state, state.u.ux, monsterX, y);
    // With the attacker's own square seen, linedup() answers TRUE and spends
    // no draw, so every rn2() below is the gate's own.
    setCouldSee(state, monsterX, y, true);
    const rat = attacker(state, monsterX, y, state.u.ux, y);

    // you.h Upolyd() is `u.umonnum != u.umonster`, and it is the conjunct
    // ahead of the draw: an ordinary hero never rolls at all.
    assert.equal(state.u.umonnum, state.u.umonster, 'the hero starts herself');
    assert.equal(lined_up(rat, { state, random: noDraw() }), true);

    state.u.uundetected = false;
    state.youmonst.m_ap_type = M_AP_NOTHING;
    // Any species but the hero's own turns Upolyd() TRUE; the giant rat is
    // the one this file already loads.
    state.u.umonnum = PM_GIANT_RAT;
    assert.notEqual(state.u.umonnum, state.u.umonster);

    for (const [label, roll, uundetected, apType, expected] of [
        // A roll of 0 shuts the gate whatever follows it, and the hidden hero
        // beside it is what separates C's `&&` from an `||`: with an `||` the
        // concealment alone would close the gate on a turn C leaves open.
        ['roll 0 with the hero hidden', 0, true, M_AP_NOTHING, true],
        // 1 is the smallest roll that opens the gate; 24 is the largest the
        // bound produces, and both must behave alike.
        ['roll 1 and hidden', 1, true, M_AP_NOTHING, false],
        ['roll 24 and hidden', 24, true, M_AP_NOTHING, false],
        // Not hidden and wearing no appearance: the disjunction's second half
        // is what an `&&` in its place would demand, and there is none here.
        ['visible and undisguised', 1, false, M_AP_NOTHING, true],
        // C excuses M_AP_MONSTER by name -- a hero who looks like a monster is
        // still a target -- so this is the row that separates
        // `!= M_AP_MONSTER` from `== M_AP_MONSTER`, and the appearance
        // conjunction from a disjunction.
        ['visible and disguised as a monster', 1, false, M_AP_MONSTER, true],
        // An object appearance is neither excused value, so the gate closes.
        ['visible and disguised as an object', 1, false, M_AP_OBJECT, false],
    ]) {
        state.u.uundetected = uundetected;
        state.youmonst.m_ap_type = apType;
        const bounds = [];
        assert.equal(
            lined_up(rat, {
                state,
                random: {
                    rn2: (bound) => { bounds.push(bound); return roll; },
                },
            }),
            expected,
            label,
        );
        assert.deepEqual(bounds, [25], label);
    }

    // Left as the fixture found it, since every case below shares this game.
    state.u.umonnum = state.u.umonster;
    state.u.uundetected = false;
    state.youmonst.m_ap_type = M_AP_NOTHING;
});

// mthrowu.c:1392-1393, `utarget ? (ignore_boulders ? 1 : 2) : 0`. Every
// ported caller arrives through lined_up(), so the hero is always the target
// and the trailing 0 is chosen by nothing. It is what a monster shooting at
// another monster would get, and C is strict there: no boulder is ever
// shot around.
test('m_lined_up gives a monster target no boulder allowance', async () => {
    const state = await hero();
    const y = state.u.uy;
    const shooterX = state.u.ux + 3;
    const targetX = state.u.ux + 1;
    clearRow(state, state.u.ux, shooterX, y);
    const shooter = attacker(state, shooterX, y, state.u.ux, y);
    const target = attacker(state, targetX, y, state.u.ux, y);

    // Neither end is the hero's square, so linedup() asks clear_path(), which
    // reads the index vision_reset() built and not this cleared row: the sight
    // test fails and boulderhandling is what decides the rest. Mode 0 returns
    // there and spends nothing; mode 1 would walk the unobstructed row and
    // answer TRUE, and any other mode would reach `rn2(2 + boulderspots)`,
    // which noDraw() would report.
    assert.equal(
        m_lined_up(target, shooter, { state, random: noDraw() }),
        false,
    );
});

test('lined_up aims at the believed hero square, not the real one',
    async () => {
        const state = await hero();
        const y = state.u.uy;
        const monsterX = state.u.ux + 3;
        clearRow(state, state.u.ux, monsterX, y);
        setCouldSee(state, monsterX, y, true);
        // mthrowu.c:1378-1379 reads mux and muy, so an attacker that believes
        // the hero is where the hero is fires along that row.
        const aimed = attacker(state, monsterX, y, state.u.ux, y);
        assert.equal(lined_up(aimed, { state, random: noDraw() }), true);
        // Displaced onto its own square, m_lined_up() hands linedup() a zero
        // displacement and it declines before any terrain is read.
        const confused = attacker(state, monsterX, y, monsterX, y);
        assert.equal(lined_up(confused, { state, random: noDraw() }), false);
    });
