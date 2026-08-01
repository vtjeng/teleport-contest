import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ARTICLE_A,
    ARTICLE_NONE,
    ARTICLE_THE,
    ARTICLE_YOUR,
    BLINDED,
    CONFUSION,
    DOOR,
    DO_MOVE,
    D_CLOSED,
    COLD_RES,
    D_ISOPEN,
    FEMALE,
    FIRE_RES,
    FUMBLING,
    GLIB,
    HALLUC,
    HALF_PHDAM,
    INTRINSIC,
    LEVITATION,
    MAXULEV,
    MALE,
    M_AP_FURNITURE,
    M_AP_MONSTER,
    M_AP_OBJECT,
    NEUTRAL,
    NO_KILLER_PREFIX,
    NUM_MGENDERS,
    SHOCK_RES,
    SLEEP_RES,
    SLT_ENCUMBER,
    SUPPRESS_HALLUCINATION,
    SUPPRESS_INVISIBLE,
    SUPPRESS_IT,
    SUPPRESS_SADDLE,
    TEST_MOVE,
    W_SADDLE,
    I_SPECIAL,
} from '../js/const.js';
import {
    UnsupportedMonsterNameError,
    pmname,
    x_monnam,
} from '../js/do_name.js';
import {
    UnsupportedHitPointLossError,
    losehp,
    near_capacity,
    test_move,
    weight_cap,
} from '../js/hack.js';
import { UnsupportedSteedError, can_ride, mount_steed } from '../js/steed.js';
import {
    M1_HUMANOID,
    M1_SLITHY,
    PM_ARCHEOLOGIST,
    PM_KNIGHT,
    PM_ELF,
    PM_LONG_WORM,
    PM_PONY,
    PM_VALKYRIE,
    PM_WIZARD,
} from '../js/monsters.js';
import { is_mplayer } from '../js/mondata.js';
import { game } from '../js/gstate.js';
import { m_at } from '../js/monst.js';
import { put_saddle_on_mon } from '../js/dog.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import { getRngLog } from '../js/rng.js';
import { runSegment } from '../js/jsmain.js';
import { RIDE_COMMAND, loadMountSteedRecipe } from './run-mount-steed.mjs';

function topLine() {
    return game.nhDisplay.grid[0].map(({ ch }) => ch).join('').trimEnd();
}

// gt.toplines, which pline.c writes whether or not the row has been repainted.
// A test that calls mount_steed() outside runSegment() has no repaint after it,
// so the painted grid row is still the one the direction prompt left behind.
function toplines() {
    return game._ttyToplines ?? '';
}

function statusLine() {
    return game.nhDisplay.grid[23].map(({ ch }) => ch).join('').trimEnd();
}

// Locate a matrix segment by the keys it types and the role it plays, so
// reordering the matrix cannot silently point a test at a different case.
function segmentFor(moves, predicate = () => true) {
    const found = loadMountSteedRecipe().segments.find(
        (segment) => segment.moves === `.${moves}` && predicate(segment),
    );
    assert.ok(found, `the matrix contains a segment typing ${moves}`);
    return found;
}

function knightSlipSegment() {
    return segmentFor(`${RIDE_COMMAND}j.`, ({ nethackrc, seed }) => (
        seed === 7720000 && !nethackrc.includes('showdamage')
    ));
}

// Replay a matrix segment's prefix, stopping just before the direction key so
// a test can read the state the ride starts from.
async function rideTo(segment, moves) {
    let boundary = null;
    const replay = await runSegment(
        { ...segment, moves },
        { onBoundary: (error) => { boundary = error; } },
    );
    return { boundary, replay };
}

test('the mount-steed matrix contains only source-selected inputs', () => {
    const recipe = loadMountSteedRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 9);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        // Every segment reaches mount_steed() through the extended-command
        // row, after one wait that puts the hero on a settled level.
        assert.ok(segment.moves.startsWith(`.${RIDE_COMMAND}`));
    }
    // Only a Knight's starting pet wears a saddle, so the roll can only be
    // reached from a Knight segment; the others stop at an earlier guard.
    assert.equal(
        recipe.segments.filter((s) => s.nethackrc.includes('role:Knight'))
            .length,
        7,
    );
});

test('the impairment roll and the damage roll are the only draws the slip '
    + 'makes, in that order', async () => {
    const segment = knightSlipSegment();
    // The prefix stops with the direction prompt open, so every draw after it
    // belongs to mount_steed().
    const before = await rideTo(segment, `.${RIDE_COMMAND}`);
    const spentBefore = before.replay.getRngLog().length;
    const hp = game.u.uhp;
    const uhpmax = game.u.uhpmax;
    const level = game.u.ulevel;
    const pony = m_at(game.u.ux, game.u.uy + 1);
    assert.equal(pony?.data?.pmidx, PM_PONY);

    const after = await rideTo(segment, `.${RIDE_COMMAND}j`);
    assert.equal(after.boundary, null);
    const drawn = after.replay.getRngLog().slice(spentBefore);
    // steed.c:338-356 draws rnd(MAXULEV / 2 + 5) for the impairment test and
    // rn1(5, 10) for the damage, and nothing between them. rn1(x, y) is rn2(x)
    // plus y (rnd.c:99-102), so the log records the damage draw as rn2(5).
    assert.equal(drawn.length, 2);
    assert.match(drawn[0], /^rnd\(20\)=\d+$/u);
    assert.match(drawn[1], /^rn2\(5\)=[0-4]$/u);
    assert.equal(topLine(),
        'You slip while trying to get on the saddled pony.');

    // The roll failed, so u.ulevel + mtmp->mtame was below the rnd() result.
    // A level 1 Knight and a starting pet at dog.c:49's minimum tameness of 10
    // make the left side 11, and rnd(20) can beat it.
    assert.equal(level, 1);
    assert.equal(pony.mtame, 10);
    assert.equal(MAXULEV / 2 + 5, 20);
    // rn1(5, 10) is the drawn rn2(5) plus 10, and Maybe_Half_Phys() leaves it
    // alone for a hero with no Half_physical_damage source. Reading the offset
    // back off the logged draw pins it; a range would let rn1(5, 11) through.
    const lost = hp - game.u.uhp;
    assert.equal(lost, Number(drawn[1].split('=')[1]) + 10);
    assert.equal(game.u.uhpmax, uhpmax);
    assert.equal(statusLine().includes(`HP:${game.u.uhp}(${uhpmax})`), true,
        statusLine());
    // steed.c:308 exempts a Knight from the tameness decrement, and
    // mount_steed() returns FALSE, so u.usteed stays unset.
    assert.equal(pony.mtame, 10);
    assert.equal(game.u.usteed, null);
});

test('a guard that returns before the roll draws nothing', async () => {
    const segment = segmentFor(`${RIDE_COMMAND}k.`);
    const before = await rideTo(segment, `.${RIDE_COMMAND}`);
    const spentBefore = before.replay.getRngLog().length;
    assert.equal(m_at(game.u.ux, game.u.uy - 1), null);
    const hp = game.u.uhp;

    const after = await rideTo(segment, `.${RIDE_COMMAND}k`);
    assert.equal(after.boundary, null);
    // steed.c:249-255 prints and returns before the saddle test, the tameness
    // test and the roll, so the whole command spends no randomness.
    assert.equal(after.replay.getRngLog().length, spentBefore);
    assert.equal(topLine(), 'I see nobody there.');
    assert.equal(game.u.uhp, hp);
});

test('the saddle test precedes the tameness test and drops the article for a '
    + 'named pet', async () => {
    // steed.c:285-289 runs before steed.c:299, so an unsaddled monster is
    // named by "%s is not saddled." whether it is tame or hostile.
    for (const [role, expected] of [
        ['Samurai', 'Hachi is not saddled.'],
        ['Valkyrie', 'The little dog is not saddled.'],
    ]) {
        const segment = segmentFor(
            `${RIDE_COMMAND}h.`,
            ({ nethackrc }) => nethackrc.includes(`role:${role}`),
        );
        const { boundary } = await rideTo(segment, `.${RIDE_COMMAND}h`);
        assert.equal(boundary, null, role);
        assert.equal(topLine(), expected, role);
    }

    // A hostile monster reaches the same guard: dog.c gives the Samurai's pet
    // the name "Hachi", and role.c gives the Valkyrie's none.
    const hostile = segmentFor(`${RIDE_COMMAND}k`);
    const { boundary } = await rideTo(hostile, `.${RIDE_COMMAND}k`);
    assert.equal(boundary, null);
    assert.equal(topLine(), 'The newt is not saddled.');
    assert.equal(m_at(game.u.ux, game.u.uy - 1).mtame, 0);
});

test('showdamage prints the exact loss beside the slip message', async () => {
    const segment = segmentFor(
        `${RIDE_COMMAND}j.`,
        ({ nethackrc }) => nethackrc.includes('showdamage'),
    );
    const before = await rideTo(segment, `.${RIDE_COMMAND}`);
    const hp = game.u.uhp;
    assert.equal(game.iflags.showdamage, true);

    await rideTo(segment, `.${RIDE_COMMAND}j`);
    // hack.c showdamage() prints "[HP %i, %i left]" with the negated damage
    // and the hit points that survive it, and vpline() joins it to the slip
    // message with two spaces.
    assert.equal(
        topLine(),
        'You slip while trying to get on the saddled pony.  '
        + `[HP ${game.u.uhp - hp}, ${game.u.uhp} left]`,
    );
    assert.equal(before.boundary, null);
});

// --- guards a recording cannot reach ---

// Replay a matrix segment to the open direction prompt, mutate the state, then
// call mount_steed() directly on the monster the mutation set up.
async function mountAfter(segment, mutate) {
    await runSegment({ ...segment, moves: `.${RIDE_COMMAND}` });
    const monster = mutate(game);
    try {
        return { result: await mount_steed(monster, false, game), error: null };
    } catch (error) {
        return { result: null, error };
    }
}

// The item weight that pushes near_capacity() to exactly `wanted`.
// hack.c calc_capacity() answers `min(excess * 2 / gw.wc + 1, OVERLOADED)` for
// a positive excess, so one point over the cap is SLT_ENCUMBER and half the
// cap is the next value up.
function burdenWeight(state, wanted) {
    const capacity = weight_cap(state);
    let carried = 0;
    for (let obj = state.invent; obj; obj = obj.nobj) carried += obj.owt ?? 0;
    const excess = wanted === 1 ? 1 : Math.ceil(capacity * (wanted - 1) / 2);
    return capacity - carried + excess;
}

test('every guard prints its own line and answers FALSE', async () => {
    // steed.c:200-337 in source order. Each row sets up the shortest state
    // that reaches one guard from a Knight standing north of his saddled pony,
    // and each asserts the return value as well as the message, because
    // doride() turns a TRUE into ECMD_TIME and charges the hero a turn.
    const segment = knightSlipSegment();
    const rows = [
        // steed.c:201-204. doride() dismounts a mounted hero before it can
        // reach mount_steed(), so this guard needs a caller that mounts twice
        // in one turn; it is set up by hand here.
        ['You are already riding the saddled pony.', (state, pony) => {
            state.u.usteed = pony;
        }],
        // steed.c:207-210. youprop.h:120 reads the intrinsic alone.
        ['Maybe you should find a designated driver.', (state) => {
            state.u.uprops[HALLUC] = { intrinsic: 5, extrinsic: 0 };
        }],
        // steed.c:238-244. The port has no polymorph, so both halves of the
        // condition are set by hand. The four disjuncts are independent, so
        // each gets a form that trips it and nothing else: a pony is not
        // humanoid, and the other three are humanoid forms that are too small,
        // too big, or slithy.
        ["You won't fit on a saddle.", (state, pony) => {
            state.u.umonnum = state.u.umonster + 1;
            state.youmonst = { ...state.youmonst, data: pony.data };
        }],
        ["You won't fit on a saddle.", (state) => {
            state.u.umonnum = state.u.umonster + 1;
            // monst.h MZ_TINY is 0 and MZ_SMALL is 1, so msize 0 is verysmall.
            state.youmonst = {
                ...state.youmonst,
                data: { mflags1: M1_HUMANOID, msize: 0 },
            };
        }],
        ["You won't fit on a saddle.", (state) => {
            state.u.umonnum = state.u.umonster + 1;
            // MZ_LARGE is 3, the threshold bigmonst() tests.
            state.youmonst = {
                ...state.youmonst,
                data: { mflags1: M1_HUMANOID, msize: 3 },
            };
        }],
        ["You won't fit on a saddle.", (state) => {
            state.u.umonnum = state.u.umonster + 1;
            state.youmonst = {
                ...state.youmonst,
                data: { mflags1: M1_HUMANOID | M1_SLITHY, msize: 2 },
            };
        }],
        // steed.c:246-249. capacity_from_excess() answers SLT_ENCUMBER for any
        // excess below half the carrying capacity, and the next value up for
        // half of it, so the guard's strict `>` needs both to be checked.
        ["You can't do that while carrying so much stuff.", (state) => {
            state.invent = { owt: burdenWeight(state, 2), nobj: state.invent };
        }],
        // steed.c:249-255, reached with no monster rather than with a blind
        // hero, because Blind has its own coverage below.
        ['I see nobody there.', () => {}, () => null],
        // steed.c:249-255 again, once per disjunct: the Blind term, where
        // TELEPAT is what C's Blind_telepat reads, then mundetected, then the
        // two mimic appearances.
        ['I see nobody there.', (state) => {
            state.u.uprops[BLINDED] = { intrinsic: 5, extrinsic: 0 };
        }],
        ['I see nobody there.', (state, pony) => { pony.mundetected = 1; }],
        ['I see nobody there.', (state, pony) => {
            pony.m_ap_type = M_AP_FURNITURE;
        }],
        ['I see nobody there.', (state, pony) => {
            pony.m_ap_type = M_AP_OBJECT;
        }],
        // steed.c:265-273. Each of the three held states takes the "stuck"
        // arm on its own; adding the punishing ball takes the other one.
        ['You are stuck here for now.', (state) => { state.u.utrap = 3; }],
        ['You are stuck here for now.', (state) => { state.u.uswallow = 1; }],
        ['You are stuck here for now.', (state, pony) => {
            state.u.ustuck = pony;
        }],
        ['You are unable to swing your leg over.', (state) => {
            state.u.utrap = 3;
            state.uball = { otyp: 0 };
        }],
        // steed.c:285-289.
        ['The pony is not saddled.', (state, pony) => {
            pony.minvent.owornmask = 0;
            pony.misc_worn_check = 0;
        }],
        // steed.c:299-302. The saddle stays on, so this is the guard below
        // the one above rather than the same one twice.
        ['I think the saddled pony would mind.', (state, pony) => {
            pony.mtame = 0;
        }],
        // steed.c:317-321. hliquid() answers "water" for a hero who is not
        // hallucinating, and a pony is no swimmer.
        ["You can't ride that creature while under water.", (state) => {
            state.u.uinwater = true;
        }],
        // steed.c:323-326. A newt fails can_saddle()'s monster-class test.
        ["You can't ride such a creature.", (state, pony) => {
            pony.data = game.mons.find((pm) => pm.pmnames[2] === 'newt');
        }],
        // steed.c:329-334. Ordinary levitation, without the I_SPECIAL bit that
        // youprop.h:242 requires for Lev_at_will.
        ['You cannot reach the saddled pony.', (state) => {
            state.u.uprops[LEVITATION] = { intrinsic: 5, extrinsic: 0 };
        }],
        // steed.c:335-337. A Knight's ring mail is iron, so is_metallic() is
        // already true and the erosion counter is the whole test. oeroded
        // selects "rusty" and oeroded2 alone selects "corroded".
        ['Your rusty armor is too stiff to be able to mount the saddled '
            + 'pony.', (state) => { state.uarm.oeroded = 1; }],
        ['Your corroded armor is too stiff to be able to mount the saddled '
            + 'pony.', (state) => { state.uarm.oeroded2 = 1; }],
    ];
    for (const [expected, mutate, pick = (pony) => pony] of rows) {
        const { result, error } = await mountAfter(segment, (state) => {
            const pony = m_at(state.u.ux, state.u.uy + 1);
            mutate(state, pony);
            return pick(pony);
        });
        assert.equal(error, null, expected);
        assert.equal(result, false, expected);
        assert.equal(toplines(), expected);
        // Not one of these guards may take a hit point or set u.usteed.
        assert.equal(game.u.uhp, game.u.uhpmax, expected);
    }

    // steed.c:246's `near_capacity() > SLT_ENCUMBER` is strict, so a merely
    // burdened hero mounts. He slips here, which is the guard below it.
    const burdened = await mountAfter(segment, (state) => {
        state.invent = { owt: burdenWeight(state, SLT_ENCUMBER), nobj: state.invent };
        assert.equal(near_capacity(state), SLT_ENCUMBER);
        return m_at(state.u.ux, state.u.uy + 1);
    });
    assert.equal(burdened.error, null);
    assert.equal(burdened.result, false);
    assert.equal(toplines(),
        'You slip while trying to get on the saddled pony.');
});

test('a steed the hero cannot step toward fails before the saddle test',
    async () => {
    // steed.c:265-267's last disjunct, `!test_move(..., TEST_MOVE)`. The
    // diagonal segment puts the pony north-west of the hero, so turning the
    // hero's own square into an intact doorway makes hack.c's exit rule
    // decline the step with none of the four held states set.
    const segment = segmentFor(`${RIDE_COMMAND}y.`);
    const { result, error } = await mountAfter(segment, (state) => {
        const here = state.level.at(state.u.ux, state.u.uy);
        here.typ = DOOR;
        here.flags = D_ISOPEN;
        return m_at(state.u.ux - 1, state.u.uy - 1);
    });
    assert.equal(error, null);
    assert.equal(result, false);
    assert.equal(toplines(), 'You are unable to swing your leg over.');
});

test('a long worm is refused only when the target is not its head', async () => {
    // steed.c:257-263 tests both coordinates, so a mismatch in either one is
    // enough to make the square a tail segment.
    const segment = knightSlipSegment();
    const worm = (dx, dy) => async () => mountAfter(segment, (state) => {
        const pony = m_at(state.u.ux, state.u.uy + 1);
        pony.data = state.mons[PM_LONG_WORM];
        // getdir() has not run in this fixture, so the direction the guard
        // compares against is set by hand; the offsets then move the monster
        // off the square it names.
        state.u.dx = 0;
        state.u.dy = 1;
        pony.mx += dx;
        pony.my += dy;
        return pony;
    });
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1]]) {
        const { error } = await worm(dx, dy)();
        assert.ok(error instanceof UnsupportedSteedError, `${dx},${dy}`);
        assert.match(error.message, /long worm tail/u, `${dx},${dy}`);
    }
    // On the head itself the guard falls through, and the guards below it
    // reach can_saddle(), which no S_WORM passes.
    const head = await worm(0, 0)();
    assert.equal(head.error, null, String(head.error));
    assert.equal(head.result, false);
    assert.equal(toplines(), "You can't ride such a creature.");
});

test('the arms of the impairment disjunction ahead of the roll each slip',
    async () => {
    // steed.c:338-341. Every term but the rnd() call reaches the same slip, so
    // each is checked on its own with no draw to hide behind. Wounded_legs is
    // in C's list and cannot be reached: steed.c:212 returns for it first
    // whenever force is FALSE, which it always is outside debug mode.
    const segment = knightSlipSegment();
    const rows = [
        // youprop.h:84 and :112 read the bare intrinsic for these two.
        [(state) => { state.u.uprops[CONFUSION] = { intrinsic: 5 }; }],
        [(state) => { state.u.uprops[GLIB] = { intrinsic: 5 }; }],
        // youprop.h:129 reads either field for Fumbling; the extrinsic is the
        // half no other case here sets.
        [(state) => {
            state.u.uprops[FUMBLING] = { intrinsic: 0, extrinsic: 1 };
        }],
    ];
    for (const [mutate] of rows) {
        const { result, error } = await mountAfter(segment, (state) => {
            const pony = m_at(state.u.ux, state.u.uy + 1);
            // A hero far above the roll's ceiling passes it every time, so the
            // term under test is the only route to the slip below.
            state.u.ulevel = MAXULEV;
            mutate(state, pony);
            return pony;
        });
        assert.equal(error, null);
        assert.equal(result, false);
        assert.equal(toplines(),
            'You slip while trying to get on the saddled pony.');
        assert.ok(game.u.uhp < game.u.uhpmax);
    }

    // With none of them set, the same level mounts, which is what shows each
    // row above owns its outcome.
    const { result } = await mountAfter(segment, (state) => {
        state.u.ulevel = MAXULEV;
        return m_at(state.u.ux, state.u.uy + 1);
    });
    assert.equal(result, true);
    assert.equal(toplines(), 'You mount the saddled pony.');
});

test('the roll fails only when the hero and the steed fall short of it',
    async () => {
    // steed.c:341 is `u.ulevel + mtmp->mtame < rnd(MAXULEV / 2 + 5)`, a strict
    // comparison. This fixture's draw is 16, measured by walking mtame until
    // the outcome flips, so a level 1 hero mounts at exactly 15 points of
    // tameness and slips at 14.
    const segment = knightSlipSegment();
    const slipped = await mountAfter(segment, (state) => {
        const pony = m_at(state.u.ux, state.u.uy + 1);
        pony.mtame = 14;
        return pony;
    });
    assert.equal(slipped.result, false);
    assert.equal(toplines(),
        'You slip while trying to get on the saddled pony.');

    const mounted = await mountAfter(segment, (state) => {
        const pony = m_at(state.u.ux, state.u.uy + 1);
        pony.mtame = 15;
        return pony;
    });
    assert.equal(mounted.result, true);
    assert.equal(toplines(), 'You mount the saddled pony.');
});

test('a slip that kills carries the killer string x_monnam built', async () => {
    // steed.c:349-355. losehp()'s knam is read only on the death branch, so
    // this is the one place the buffer is observable at all. `called` TRUE is
    // what turns a given name into "<species> called <name>".
    const segment = knightSlipSegment();
    const { error } = await mountAfter(segment, (state) => {
        const pony = m_at(state.u.ux, state.u.uy + 1);
        pony.mextra = { ...pony.mextra, mgivenname: 'Dobbin' };
        // rn1(5, 10) is at least 10, so one hit point cannot survive it.
        state.u.uhp = 1;
        return pony;
    });
    assert.ok(error instanceof UnsupportedHitPointLossError);
    assert.match(
        error.message,
        /slipped while mounting a saddled pony called Dobbin/u,
    );
});

test('a non-Knight spends a point of tameness on every attempt', async () => {
    // steed.c:308 is `!force && !Role_if(PM_KNIGHT) && !(--mtmp->mtame)`, so
    // the decrement runs for every role but the Knight and runs whether or not
    // the guard fires. No recording can show it: dog.c:263-268 saddles only a
    // PM_PONY starting pet, role.c:209 makes the Knight the only role with
    // that petnum, and both other routes to a tame saddled monster --
    // apply.c use_saddle() and every taming effect -- need an unported
    // command.
    const segment = knightSlipSegment();
    const started = await mountAfter(segment, (state) => {
        const pony = m_at(state.u.ux, state.u.uy + 1);
        // Pretend the hero is a Samurai standing where the Knight stands.
        state.urole = { ...state.urole, mnum: PM_KNIGHT + 1 };
        pony.mtame = 5;
        // A cursed saddle short-circuits steed.c:338's disjunction ahead of
        // the rnd() call, so the failure is reached with no draw at all.
        pony.minvent.cursed = true;
        return pony;
    });
    assert.equal(started.error, null);
    assert.equal(started.result, false);
    assert.equal(m_at(game.u.ux, game.u.uy + 1).mtame, 4);

    // At one point of tameness the same decrement reaches zero and the guard
    // fires instead, with its own message and no hit point loss.
    const untamed = await mountAfter(segment, (state) => {
        const pony = m_at(state.u.ux, state.u.uy + 1);
        state.urole = { ...state.urole, mnum: PM_KNIGHT + 1 };
        pony.mtame = 1;
        return pony;
    });
    assert.equal(untamed.error, null);
    assert.equal(untamed.result, false);
    const pony = m_at(game.u.ux, game.u.uy + 1);
    assert.equal(pony.mtame, 0);
    assert.equal(game.u.uhp, game.u.uhpmax);

    // And a Knight never pays it: `&&` stops at Role_if(PM_KNIGHT).
    const knight = await mountAfter(segment, (state) => {
        const saddled = m_at(state.u.ux, state.u.uy + 1);
        assert.equal(state.urole.mnum, PM_KNIGHT);
        saddled.mtame = 1;
        saddled.minvent.cursed = true;
        return saddled;
    });
    assert.equal(knight.error, null);
    assert.equal(knight.result, false);
    assert.equal(m_at(game.u.ux, game.u.uy + 1).mtame, 1);
});

test('a levitating hero watches the steed slip away instead of losing hit '
    + 'points', async () => {
    // steed.c:339-342. Reaching it needs Lev_at_will, because the guard at
    // steed.c:329-334 returns for ordinary levitation over a pony that neither
    // floats nor flies. youprop.h:242 makes an I_SPECIAL intrinsic with no
    // other contribution exactly that case.
    const segment = knightSlipSegment();
    const { result, error } = await mountAfter(segment, (state) => {
        const pony = m_at(state.u.ux, state.u.uy + 1);
        state.u.uprops[LEVITATION] = { intrinsic: I_SPECIAL, extrinsic: 0 };
        pony.minvent.cursed = true;
        return pony;
    });
    assert.equal(error, null);
    assert.equal(result, false);
    assert.equal(toplines(), 'The saddled pony slips away from you.');
    // The arm returns before losehp(), so no hit point is lost.
    assert.equal(game.u.uhp, game.u.uhpmax);
});

test('a greased or cursed saddle fails the mount without an impairment roll',
    async () => {
    const segment = knightSlipSegment();
    for (const field of ['cursed', 'greased']) {
        let spentBefore = 0;
        const { result } = await mountAfter(segment, (state) => {
            const pony = m_at(state.u.ux, state.u.uy + 1);
            pony.minvent[field] = true;
            // Above the roll's ceiling, so the saddle is the only thing that
            // can make the mount fail.
            state.u.ulevel = MAXULEV;
            spentBefore = getRngLog().length;
            return pony;
        });
        const drawn = getRngLog().slice(spentBefore);
        assert.equal(result, false, field);
        // steed.c:338's `||` chain reaches otmp->cursed and otmp->greased
        // before the rnd() call, so the slip happens with no impairment draw.
        // What is left is the slip's own rn1(5, 10) damage, which the log
        // records as rn2(5); a roll evaluated eagerly rather than in its place
        // in the chain would put an rnd(20) in front of it.
        assert.equal(drawn.length, 1, `${field}: ${JSON.stringify(drawn)}`);
        assert.match(drawn[0], /^rn2\(5\)=[0-4]$/u);
        assert.equal(toplines(),
            'You slip while trying to get on the saddled pony.', field);
        assert.ok(game.u.uhp < game.u.uhpmax, field);
    }
});

test('mount_steed stops at the arms this port has not reached', async () => {
    const segment = knightSlipSegment();
    const stops = [
        // steed.c:296, the petrifying steed; instapetrify() ends the game.
        [(state) => {
            const pony = m_at(state.u.ux, state.u.uy + 1);
            pony.data = state.mons.find((pm) => pm.pmnames[2] === 'cockatrice');
            return pony;
        }, /petrifier/u],
        // steed.c:301-307, the trapped steed; the message needs mhe() and
        // trapname().
        [(state) => {
            const pony = m_at(state.u.ux, state.u.uy + 1);
            pony.mtrapped = 1;
            return pony;
        }, /trapped steed/u],
    ];
    for (const [mutate, pattern] of stops) {
        const { error } = await mountAfter(segment, mutate);
        assert.ok(error instanceof UnsupportedSteedError, String(pattern));
        assert.match(error.message, pattern);
    }
});

// --- the helpers the slip path calls ---

test('can_ride reads the hero form and the steed tameness', () => {
    // steed.c:168-174. A human hero is humanoid, neither very small nor big,
    // so every term but mtame and Underwater holds for the ordinary case.
    const you = { data: { mflags1: 0, msize: 2 } };
    const state = {
        youmonst: { data: { mflags1: M1_HUMANOID, msize: 2 } },
        u: { uinwater: false },
    };
    // monsters.h M1_HUMANOID; without it can_ride() answers FALSE.
    assert.equal(can_ride({ mtame: 5, data: {} }, state), true);
    assert.equal(can_ride({ mtame: 0, data: {} }, state), false);
    state.youmonst = you;
    assert.equal(can_ride({ mtame: 5, data: {} }, state), false);
});

test('x_monnam builds the killer string and refuses every other flag set',
    async () => {
    await runSegment({
        ...knightSlipSegment(), moves: `.${RIDE_COMMAND}`,
    });
    const pony = m_at(game.u.ux, game.u.uy + 1);
    const KILLER_FLAGS
        = SUPPRESS_IT | SUPPRESS_INVISIBLE | SUPPRESS_HALLUCINATION;

    // do_name.c:1046's own comment: "a saddled mumak" or "a saddled pony
    // called Dobbin".
    assert.equal(
        x_monnam(pony, ARTICLE_A, null, KILLER_FLAGS, true, game),
        'a saddled pony',
    );
    pony.mextra = { ...pony.mextra, mgivenname: 'Dobbin' };
    assert.equal(
        x_monnam(pony, ARTICLE_A, null, KILLER_FLAGS, true, game),
        'a saddled pony called Dobbin',
    );
    // `called` FALSE takes the plain-name arm instead, and a name at the start
    // of the buffer drops the article.
    // With `called` FALSE the name goes in bare, and do_name.c:1006-1010 keeps
    // the article because the "saddled " adjective is already in the buffer.
    assert.equal(
        x_monnam(pony, ARTICLE_A, null, KILLER_FLAGS, false, game),
        'a saddled Dobbin',
    );
    delete pony.mextra.mgivenname;
    // SUPPRESS_SADDLE removes the adjective; the three article arms follow
    // do_name.c:1011-1030.
    assert.equal(
        x_monnam(pony, ARTICLE_THE, null, KILLER_FLAGS | SUPPRESS_SADDLE,
                 true, game),
        'the pony',
    );
    assert.equal(
        x_monnam(pony, ARTICLE_NONE, null, KILLER_FLAGS, true, game),
        'saddled pony',
    );
    // ARTICLE_YOUR survives for a tame monster and becomes "the" otherwise.
    assert.equal(
        x_monnam(pony, ARTICLE_YOUR, null, KILLER_FLAGS, true, game),
        'your saddled pony',
    );
    pony.mtame = 0;
    assert.equal(
        x_monnam(pony, ARTICLE_YOUR, null, KILLER_FLAGS, true, game),
        'the saddled pony',
    );
    pony.mtame = 10;
    // An adjective is written ahead of "saddled ", with a trailing space.
    assert.equal(
        x_monnam(pony, ARTICLE_A, 'angry', KILLER_FLAGS, true, game),
        'an angry saddled pony',
    );

    // Any flag set that leaves do_it, do_invis or do_hallu live stops.
    for (const flags of [0, SUPPRESS_IT, SUPPRESS_IT | SUPPRESS_INVISIBLE]) {
        assert.throws(
            () => x_monnam(pony, ARTICLE_A, null, flags, true, game),
            UnsupportedMonsterNameError,
            String(flags),
        );
    }

    // do_name.c:1006-1010, name_at_start. A bare given name with no adjective
    // in front of it drops the article; with ARTICLE_YOUR it drops even when
    // an adjective is there.
    pony.mextra = { ...pony.mextra, mgivenname: 'Dobbin' };
    assert.equal(
        x_monnam(pony, ARTICLE_A, null, KILLER_FLAGS | SUPPRESS_SADDLE,
                 false, game),
        'Dobbin',
    );
    assert.equal(
        x_monnam(pony, ARTICLE_YOUR, null, KILLER_FLAGS, false, game),
        'saddled Dobbin',
    );
    delete pony.mextra.mgivenname;

    // do_name.c:854-859, the engulfer's ARTICLE_THE. Both terms are needed:
    // being swallowed by something else leaves the article alone.
    game.u.uswallow = 1;
    game.u.ustuck = { data: pony.data };
    try {
        assert.equal(
            x_monnam(pony, ARTICLE_A, null, KILLER_FLAGS, true, game),
            'a saddled pony',
        );
        game.u.ustuck = pony;
        assert.equal(
            x_monnam(pony, ARTICLE_A, null, KILLER_FLAGS, true, game),
            'the saddled pony',
        );
    } finally {
        game.u.uswallow = 0;
        game.u.ustuck = null;
    }

    // do_name.c:886-935. Each of the five classes this port does not format
    // stops on its own.
    for (const mutate of [
        (m) => { m.ispriest = 1; },
        (m) => { m.isminion = 1; },
        (m) => { m.isshk = 1; },
        (m) => { m.m_ap_type = M_AP_MONSTER; },
        // mondata.h:157 is_mplayer() is the PM_ARCHEOLOGIST..PM_WIZARD range.
        (m) => { m.data = game.mons[PM_ARCHEOLOGIST]; },
    ]) {
        await runSegment({
            ...knightSlipSegment(), moves: `.${RIDE_COMMAND}`,
        });
        const target = m_at(game.u.ux, game.u.uy + 1);
        mutate(target);
        assert.throws(
            () => x_monnam(target, ARTICLE_A, null, KILLER_FLAGS, true, game),
            UnsupportedMonsterNameError,
        );
    }
});

test('pmname falls back to the neutral name outside the gender range', () => {
    // do_name.c:1300-1308. NEUTRAL is 2 and NUM_MGENDERS is 3, so the guard
    // rejects -1 and 3 and accepts 0, 1 and 2 -- and also rejects an in-range
    // index whose entry is missing, which is how a species with only a neutral
    // name answers for a male or female monster.
    const both = {
        pmnames: ['gnome lord', 'gnome lady', 'gnome'],
    };
    const neuterOnly = { pmnames: [null, null, 'pony'] };
    assert.equal(pmname(both, MALE), 'gnome lord');
    assert.equal(pmname(both, FEMALE), 'gnome lady');
    assert.equal(pmname(both, NEUTRAL), 'gnome');
    assert.equal(pmname(both, -1), 'gnome');
    assert.equal(pmname(both, NUM_MGENDERS), 'gnome');
    assert.equal(pmname(neuterOnly, MALE), 'pony');
});

test('is_mplayer covers exactly the player-monster range', () => {
    // mondata.h:157-158 compares against &mons[PM_ARCHEOLOGIST] and
    // &mons[PM_WIZARD] inclusively.
    for (const [index, expected] of [
        [PM_ARCHEOLOGIST - 1, false],
        [PM_ARCHEOLOGIST, true],
        [PM_WIZARD, true],
        [PM_WIZARD + 1, false],
    ]) {
        assert.equal(is_mplayer({ pmidx: index }), expected, String(index));
    }
});

test('losehp takes the hit points, redraws the status line and stops at '
    + 'death', async () => {
    await runSegment({
        ...knightSlipSegment(), moves: `.${RIDE_COMMAND}`,
    });
    const started = game.u.uhp;
    game.disp.botl = false;

    await losehp(3, 'a test', NO_KILLER_PREFIX, game);
    assert.equal(game.u.uhp, started - 3);
    assert.equal(game.disp.botl, true);

    // hack.c:4277-4278: a negative loss raises u.uhpmax with u.uhp.
    game.u.uhp = game.u.uhpmax;
    await losehp(-2, 'a test', NO_KILLER_PREFIX, game);
    assert.equal(game.u.uhp, game.u.uhpmax);
    assert.equal(game.u.uhpmax, started + 2 - 3 + 3);

    // hack.c:4280-4287, the branch that calls done(DIED).
    await assert.rejects(
        losehp(game.u.uhp, 'slipped while mounting a saddled pony',
               NO_KILLER_PREFIX, game),
        UnsupportedHitPointLossError,
    );
});

test('losehp stops for a polymorphed hero before it spends a hit point',
     async () => {
    // hack.c:4267-4276 takes the loss out of u.mh for a polymorphed hero and
    // can reach rehumanize(); nothing ported owns u.mh, so the arm stops
    // rather than writing u.uhp for a hero who is not in his own form.
    //
    // const.js Upolyd() takes the hero, not the game. Handing it the game
    // compares two absent fields, answers false, and turns this fail-closed
    // guard into a skip that spends the hit points on the wrong field, which
    // is why the guard needs a test of its own.
    await runSegment({
        ...knightSlipSegment(), moves: `.${RIDE_COMMAND}`,
    });
    const started = game.u.uhp;
    game.u.umonnum = game.u.umonster + 1;

    await assert.rejects(
        losehp(3, 'a test', NO_KILLER_PREFIX, game),
        UnsupportedHitPointLossError,
    );
    // The guard sits above the subtraction, so the hero keeps every point.
    assert.equal(game.u.uhp, started);
});

test('losehp wails only below a tenth of the maximum and only after turn 50',
    async () => {
    // hack.c:4288-4289 calls maybe_wail() when `n > 0 && u.uhp * 10 <
    // u.uhpmax`, and hack.c:4216-4217 makes maybe_wail() return until
    // svm.moves passes gw.wailmsg + 50. gw.wailmsg starts at zero.
    await runSegment({
        ...knightSlipSegment(), moves: `.${RIDE_COMMAND}`,
    });
    game.flags.acoustics = true;
    const wailAfter = async (moves, uhp, uhpmax, loss) => {
        game.moves = moves;
        game.u.uhpmax = uhpmax;
        game.u.uhp = uhp;
        // clear_nhwindow(WIN_MESSAGE) between calls, so a second message does
        // not join the first one and wait on a --More--.
        clearTtyMessageWindow(game);
        game._ttyToplines = '';
        await losehp(loss, 'a test', NO_KILLER_PREFIX, game);
        return toplines();
    };

    // Turn 51 is the first that passes `svm.moves <= gw.wailmsg + 50`.
    assert.equal(await wailAfter(50, 12, 40, 10), '');
    assert.equal(game.wailmsg, undefined);
    // Two hit points of 40 is a twentieth, so the wail fires; a Knight is
    // neither a Wizard, an Elf nor a Valkyrie, so it takes the You_hear() arm
    // and reads the CwnAnnwn line for any survivor above one hit point.
    assert.equal(await wailAfter(51, 12, 40, 10),
        'You hear the howling of the CwnAnnwn...');
    assert.equal(game.wailmsg, 51);
    // gw.wailmsg now suppresses the next 50 turns.
    assert.equal(await wailAfter(101, 12, 40, 10), '');
    assert.equal(await wailAfter(102, 11, 40, 10),
        'You hear the wailing of the Banshee...');

    // A tenth exactly is not below a tenth: 4 of 40 leaves the wail unspoken.
    game.wailmsg = 0;
    assert.equal(await wailAfter(200, 14, 40, 10), '');
    // And a loss of zero cannot wail however low the hero is.
    assert.equal(await wailAfter(300, 1, 40, 0), '');
});

test('the wail names three roles by their own title and everyone else by '
    + 'sound', async () => {
    // hack.c:4220-4234. Role_if(PM_WIZARD), Race_if(PM_ELF) and
    // Role_if(PM_VALKYRIE) each reach the pline arm on their own, and only the
    // first and third read gu.urole.name.m for `who`.
    await runSegment({
        ...knightSlipSegment(), moves: `.${RIDE_COMMAND}`,
    });
    game.flags.acoustics = true;
    const knightRole = game.urole;
    const knightRace = game.urace;
    const wailAs = async (role, race, uhp, powers = []) => {
        game.urole = role;
        game.urace = race;
        game.wailmsg = 0;
        game.moves = 200;
        game.u.uhpmax = 40;
        game.u.uhp = uhp + 10;
        for (const power of powers)
            game.u.uprops[power] = { intrinsic: INTRINSIC, extrinsic: 0 };
        clearTtyMessageWindow(game);
        game._ttyToplines = '';
        await losehp(10, 'a test', NO_KILLER_PREFIX, game);
        for (const power of powers)
            game.u.uprops[power] = { intrinsic: 0, extrinsic: 0 };
        return toplines();
    };
    try {
        const wizard = { ...knightRole, mnum: PM_WIZARD, name: { m: 'Evoker' } };
        const valkyrie = {
            ...knightRole, mnum: PM_VALKYRIE, name: { m: 'Stripling' },
        };
        const elf = { ...knightRace, mnum: PM_ELF };
        // Fewer than four intrinsic powers is the "life force" line.
        assert.equal(await wailAs(wizard, knightRace, 2, [FIRE_RES]),
            'Evoker, your life force is running out.');
        // Four is the threshold hack.c:4238 compares against.
        assert.equal(
            await wailAs(wizard, knightRace, 2,
                         [FIRE_RES, COLD_RES, SLEEP_RES, SHOCK_RES]),
            'Evoker, all your powers will be lost...',
        );
        assert.equal(await wailAs(valkyrie, knightRace, 2, [FIRE_RES]),
            'Stripling, your life force is running out.');
        // An elf of another role reaches the same arm but is named "Elf".
        assert.equal(await wailAs(knightRole, elf, 2, [FIRE_RES]),
            'Elf, your life force is running out.');
        // One hit point takes the shorter line for all three.
        assert.equal(await wailAs(wizard, knightRace, 1),
            'Evoker is about to die.');
    } finally {
        game.urole = knightRole;
        game.urace = knightRace;
    }
});

test('Maybe_Half_Phys halves the damage for a protected hero', async () => {
    await runSegment({
        ...knightSlipSegment(), moves: `.${RIDE_COMMAND}`,
    });
    const pony = m_at(game.u.ux, game.u.uy + 1);
    pony.minvent.cursed = true; /* fail the mount without a roll */
    const full = game.u.uhp;
    game.u.uprops[HALF_PHDAM] = { intrinsic: 1, extrinsic: 0 };
    const spentBefore = getRngLog().length;
    await mount_steed(pony, false, game);
    // The cursed saddle short-circuits the impairment roll, so the slip's
    // rn1(5, 10) is the only draw and the log records it as rn2(5).
    const drawn = getRngLog().slice(spentBefore);
    assert.equal(drawn.length, 1, JSON.stringify(drawn));
    assert.match(drawn[0], /^rn2\(5\)=[0-4]$/u);
    // hack.h:1236 halves with `(dmg + 1) / 2`, rounding up. Reading the draw
    // back pins the formula rather than the range it happens to land in. The
    // rounding itself stays unpinned: this segment draws rn2(5) == 0, so the
    // damage is even and `dmg / 2` would give the same answer.
    const damage = Number(drawn[0].split('=')[1]) + 10;
    assert.equal(full - game.u.uhp, Math.trunc((damage + 1) / 2));
});

test('test_move(TEST_MOVE) answers without printing or opening a door',
    async () => {
    // hack.c:1093-1136 puts the autoopen pull, the bump and every message
    // inside `if (mode == DO_MOVE)`, so mount_steed()'s TEST_MOVE call gets
    // the boolean alone. A wall destination is the shortest case that has a
    // message under DO_MOVE.
    await runSegment({
        ...knightSlipSegment(), moves: `.${RIDE_COMMAND}`,
    });
    game.flags.mention_walls = true;
    const { ux, uy } = game.u;
    const destination = game.level.at(ux + 1, uy);
    const saved = destination.typ;
    destination.typ = 0; /* STONE */
    try {
        assert.equal(
            await test_move(ux, uy, 1, 0, TEST_MOVE, game, {
                message: () => assert.fail('TEST_MOVE printed'),
            }),
            false,
        );
        const messages = [];
        assert.equal(
            await test_move(ux, uy, 1, 0, DO_MOVE, game, {
                message: (text) => messages.push(text),
            }),
            false,
        );
        assert.deepEqual(messages, ["It's solid stone."]);
    } finally {
        destination.typ = saved;
        game.flags.mention_walls = false;
    }
});

test('test_move(TEST_MOVE) leaves a closed door shut and a doorway silent',
    async () => {
    await runSegment({
        ...knightSlipSegment(), moves: `.${RIDE_COMMAND}`,
    });
    const { ux, uy } = game.u;
    const east = game.level.at(ux + 1, uy);
    const saved = { typ: east.typ, flags: east.flags, seenv: east.seenv };
    const fail = { message: () => assert.fail('TEST_MOVE printed') };
    try {
        // hack.c:1093-1136. Under any mode but DO_MOVE the closed-door arm
        // answers FALSE at once: no autoopen pull, no bump, no message.
        east.typ = DOOR;
        east.flags = D_CLOSED;
        assert.equal(
            await test_move(ux, uy, 1, 0, TEST_MOVE, game, fail), false,
        );
        assert.equal(east.flags, D_CLOSED);

        // hack.c:1139-1150, the testdiag arm. An intact open doorway blocks a
        // diagonal entry in every mode, but only DO_MOVE feels for it or
        // says so.
        const southeast = game.level.at(ux + 1, uy + 1);
        const savedSE = {
            typ: southeast.typ,
            flags: southeast.flags,
            seenv: southeast.seenv,
        };
        game.flags.mention_walls = true;
        game.u.uprops[BLINDED] = { intrinsic: 5, extrinsic: 0 };
        try {
            east.typ = saved.typ;
            east.flags = saved.flags;
            southeast.typ = DOOR;
            southeast.flags = D_ISOPEN;
            southeast.seenv = 0;
            assert.equal(
                await test_move(ux, uy, 1, 1, TEST_MOVE, game, fail), false,
            );
            // feel_location() is the only writer of seenv on this path.
            assert.equal(southeast.seenv, 0);

            const messages = [];
            assert.equal(
                await test_move(ux, uy, 1, 1, DO_MOVE, game, {
                    message: (text) => messages.push(text),
                }),
                false,
            );
            assert.deepEqual(
                messages,
                ["You can't move diagonally into an intact doorway."],
            );
            assert.notEqual(southeast.seenv, 0);

            // hack.c:1208-1214, the exit rule, whose message DO_MOVE also
            // gates. The hero's own square carries the intact doorway now.
            southeast.typ = savedSE.typ;
            southeast.flags = savedSE.flags;
            const here = game.level.at(ux, uy);
            const savedHere = { typ: here.typ, flags: here.flags };
            here.typ = DOOR;
            here.flags = D_ISOPEN;
            try {
                assert.equal(
                    await test_move(ux, uy, 1, 1, TEST_MOVE, game, fail),
                    false,
                );
                messages.length = 0;
                assert.equal(
                    await test_move(ux, uy, 1, 1, DO_MOVE, game, {
                        message: (text) => messages.push(text),
                    }),
                    false,
                );
                assert.deepEqual(
                    messages,
                    ["You can't move diagonally out of an intact doorway."],
                );
            } finally {
                here.typ = savedHere.typ;
                here.flags = savedHere.flags;
            }
        } finally {
            southeast.typ = savedSE.typ;
            southeast.flags = savedSE.flags;
            southeast.seenv = savedSE.seenv;
            game.flags.mention_walls = false;
            game.u.uprops[BLINDED] = { intrinsic: 0, extrinsic: 0 };
        }
    } finally {
        east.typ = saved.typ;
        east.flags = saved.flags;
        east.seenv = saved.seenv;
    }
});

test('a slip that kills the hero stops the command rather than the segment',
    async () => {
    // cmd.c failClosedCommand() converts an UnsupportedHitPointLossError into
    // the command boundary, which keeps the segment's matching prefix. A
    // second #ride is what reaches it: rn1(5, 10) is at least 10 and a level 1
    // Knight has 16 hit points, so a second slip always leaves too few. This
    // is the female Knight's segment, whose second roll also fails.
    const segment = segmentFor(`${RIDE_COMMAND}l.`);
    let boundary = null;
    await runSegment(
        { ...segment, moves: `.${RIDE_COMMAND}l${RIDE_COMMAND}l` },
        { onBoundary: (error) => { boundary = error; } },
    );
    assert.equal(boundary?.name, 'UnsupportedHeroCommandBoundaryError');
    assert.match(boundary.message, /death, killer "slipped while mounting/u);
});

test('an unsaddled fixture monster refuses a saddle, which is what keeps the '
    + 'petrify guard dormant', async () => {
    // steed.c:296 is behind steed.c:285's saddle test, and the only writers of
    // W_SADDLE run behind can_saddle(). This is that claim as a test: the
    // cockatrice touch_petrifies() names cannot be given a saddle.
    await runSegment({
        ...knightSlipSegment(), moves: `.${RIDE_COMMAND}`,
    });
    const pony = m_at(game.u.ux, game.u.uy + 1);
    const cockatrice = {
        ...pony,
        minvent: null,
        misc_worn_check: 0,
        data: game.mons.find((pm) => pm.pmnames[2] === 'cockatrice'),
    };
    assert.equal(put_saddle_on_mon(null, cockatrice, { state: game }), null);
    assert.equal(cockatrice.misc_worn_check & W_SADDLE, 0);
    // The pony's own saddle is what the guard above it reads.
    assert.ok(pony.misc_worn_check & W_SADDLE);
});
