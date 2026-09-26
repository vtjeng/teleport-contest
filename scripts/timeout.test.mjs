import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadHeroTimeoutRecipes, verifyHeroTimeoutSegment } from './run-hero-timeouts.mjs';

import { ART_SUNSWORD } from '../js/artifacts.js';
import {
    ACID_RES,
    BLINDED,
    BURN_OBJECT,
    CONFUSION,
    DEAF,
    DETECT_MONSTERS,
    DISPLACED,
    FIG_TRANSFORM,
    FAST,
    FIRE_RES,
    FLYING,
    FROM_FORM,
    FROMOUTSIDE,
    FUMBLING,
    HATCH_EGG,
    HALLUC,
    ICE,
    INVULNERABLE,
    INVIS,
    LAST_PROP,
    MELT_ICE_AWAY,
    NUM_TIME_FUNCS,
    NUM_TIMER_KINDS,
    NOT_HUNGRY,
    OBJ_DELETED,
    OBJ_FLOOR,
    OBJ_FREE,
    OBJ_INVENT,
    PASSES_WALLS,
    REVIVE_MON,
    RIGHT_SIDE,
    ROT_CORPSE,
    ROT_ORGANIC,
    ROOM,
    SHRINK_GLOB,
    STONED,
    STONE_RES,
    STRANGLED,
    SLEEPY,
    SLEEP_RES,
    TIMEOUT,
    TIMER_NONE,
    TIMER_LEVEL,
    TIMER_OBJECT,
    LEVITATION,
    UNCHANGING,
    WARN_OF_MON,
    WWALKING,
    WOUNDED_LEGS,
    ZOMBIFY_MON,
} from '../js/const.js';
import { wipeoff } from '../js/do.js';
import { eatfood } from '../js/eat.js';
import { initRng } from '../js/rng.js';
import {
    PM_DEATH,
    PM_ACID_BLOB,
    PM_ARCHEOLOGIST,
    PM_FAMINE,
    PM_HEALER,
    PM_COCKATRICE,
    PM_KOBOLD,
    PM_LICHEN,
    PM_LIZARD,
    PM_TROLL,
    M1_HUMANOID,
    monst_globals_init,
    S_HUMAN,
} from '../js/monsters.js';
import { GameMap } from '../js/game.js';
import { newObject, place_object } from '../js/obj.js';
import {
    CORPSE,
    FEDORA,
    LONG_SWORD,
    LUCKSTONE,
    MAGIC_LAMP,
    OIL_LAMP,
    objects_globals_init,
} from '../js/objects.js';
import {
    UnsupportedTimerCleanupError,
    attach_egg_hatch_timeout,
    attach_fig_transform_timeout,
    fall_asleep,
    nh_timeout,
    nh_timeout_requires_live_state,
    obj_has_timer,
    obj_stop_timers,
    peek_timer,
    preflight_end_burn,
    run_timers,
    spot_stop_timers,
    spot_time_expires,
    spot_time_left,
    start_timer,
    start_glob_timeout,
    start_corpse_timeout,
    stop_timer,
    timeout_globals_init,
} from '../js/timeout.js';

const C_TIMEOUT = readFileSync('nethack-c/upstream/src/timeout.c', 'utf8');
const JS_TIMEOUT = readFileSync('js/timeout.js', 'utf8');

function timerState(moves = 10) {
    const state = { moves, gt: { other: true }, svt: { other: true } };
    timeout_globals_init(state);
    return state;
}

function plainFumblingState() {
    const state = timerState(10);
    state.level = new GameMap();
    state.flags = { acoustics: true };
    state.iflags = { defer_decor: false };
    state.context = { run: 0, travel: 0 };
    state.u = {
        ux: 10,
        uy: 10,
        uz: { dnum: 0, dlevel: 1 },
        ulevel: 1,
        umoved: true,
        usteed: null,
        uinwater: false,
        uinvulnerable: false,
        uprops: [],
        acurr: { a: [10, 10, 10, 10, 10, 10] },
        abon: [0, 0, 0, 0, 0, 0],
        atemp: [0, 0, 0, 0, 0, 0],
    };
    state.u.uprops[FUMBLING] = { intrinsic: 1, extrinsic: 1 };
    state.youmonst = {
        data: { mflags1: M1_HUMANOID, mlet: S_HUMAN },
    };
    // Keep inv_weight() above C's -500 noise threshold (capacity is 550 here).
    state.invent = { owt: 100, nobj: null };
    state.multi = 0;
    return state;
}

function monsterTimerState(moves = 1) {
    const state = timerState(moves);
    monst_globals_init(state);
    return state;
}

function propertyTimeoutState() {
    const state = plainFumblingState();
    monst_globals_init(state);
    objects_globals_init(state);
    state.youmonst.data = state.mons[PM_HEALER];
    state.u.umonnum = state.u.umonster = PM_HEALER;
    state.u.uprops = Array.from({ length: LAST_PROP + 1 }, () => ({
        intrinsic: 0, extrinsic: 0, blocked: 0,
    }));
    state.u.umoved = false;
    state.u.uroleplay = {};
    state.u.uhs = NOT_HUNGRY;
    state.invent = null;
    state.disp = {};
    state.context.victual = { piece: null };
    state.context.warntype = { species: null, speciesidx: -1 };
    state.go = {};
    return state;
}

test('timeout planning hands live-only expiries off before touching their state', () => {
    const state = propertyTimeoutState();
    for (const property of [
        BLINDED, HALLUC, INVIS, DETECT_MONSTERS, DISPLACED, LEVITATION,
        FLYING, STONED, STRANGLED,
    ]) {
        state.u.uprops[property].intrinsic = 2;
        assert.equal(nh_timeout_requires_live_state(state), false, `${property}: countdown`);
        state.u.uprops[property].intrinsic = 1;
        assert.equal(nh_timeout_requires_live_state(state), true, `${property}: expiry`);
        state.u.uinvulnerable = true;
        assert.equal(nh_timeout_requires_live_state(state), false, `${property}: invulnerable`);
        state.u.uinvulnerable = false;
        state.u.uprops[property].intrinsic = 0;
    }
    state.u.uprops[CONFUSION].intrinsic = 1;
    assert.equal(nh_timeout_requires_live_state(state), false, 'confusion uses message seam');
    state.u.mtimedone = 1;
    assert.equal(nh_timeout_requires_live_state(state), true, 'form expiry is live');
    state.u.uprops[UNCHANGING].extrinsic = 1;
    assert.equal(nh_timeout_requires_live_state(state), false, 'extension uses supplied RNG');
});

test('timeout.c releases delayed killers when STONED or fatal SICK expires', async () => {
    assert.match(C_TIMEOUT, /case STONED:[\s\S]*?dealloc_killer\(kptr\);/u);
    assert.match(C_TIMEOUT, /case SICK:[\s\S]*?dealloc_killer\(kptr\);/u);
    assert.match(JS_TIMEOUT, /case STONED:[\s\S]*?dealloc_killer\(killer, state\);/u);
    assert.match(JS_TIMEOUT, /case SICK:[\s\S]*?dealloc_killer\(killer, state\);/u);

    const state = propertyTimeoutState();
    state.u.uprops[STONED].intrinsic = 1;
    state.killer = {
        name: '',
        format: 0,
        next: { id: STONED, format: 7, name: 'cockatrice', next: null },
    };
    await nh_timeout(state, { planning: true });
    assert.equal(state.killer.name, 'cockatrice');
    assert.equal(state.killer.format, 7);
    assert.equal(state.killer.next, null);
});

test('confusion expiry tests the intrinsic after clearing and interrupts only then', async () => {
    for (const [intrinsic, stops] of [[1, true], [FROMOUTSIDE | 1, false]]) {
        const state = propertyTimeoutState();
        state.u.uprops[CONFUSION] = { intrinsic, extrinsic: 1, blocked: 0 };
        const occupation = () => 1;
        state.go = { occupation, occtxt: 'waiting' };
        const messages = [];
        await nh_timeout(state, { message: async (text) => messages.push(text) });
        assert.equal(state.u.uprops[CONFUSION].intrinsic, intrinsic & ~TIMEOUT);
        assert.equal(state.go.occupation, stops ? null : occupation);
        assert.deepEqual(messages, ['You feel less confused now.',
            ...(stops ? ['You stop waiting.'] : [])]);
        assert.equal(state.disp.botl, true);
    }
});

test('temporary resistance survives only an active dangerous corpse meal', async () => {
    for (const [resistance, species, recovery] of [
        [ACID_RES, PM_ACID_BLOB, 'You no longer feel safe from acid.'],
        [STONE_RES, PM_COCKATRICE, 'You no longer feel secure from petrification.'],
    ]) {
        const state = propertyTimeoutState();
        const food = { otyp: CORPSE, corpsenm: species, where: OBJ_INVENT };
        state.context.victual.piece = food;
        state.go.occupation = eatfood;
        state.u.uprops[resistance].intrinsic = 1;
        const messages = [];
        await nh_timeout(state, { message: async (text) => messages.push(text) });
        assert.equal(state.u.uprops[resistance].intrinsic, 1);
        assert.deepEqual(messages, []);
        state.go.occupation = null;
        await nh_timeout(state, { message: async (text) => messages.push(text) });
        assert.equal(state.u.uprops[resistance].intrinsic, 0);
        assert.deepEqual(messages, [recovery]);
        state.u.uprops[resistance] = { intrinsic: 1, extrinsic: 1, blocked: 1 };
        messages.length = 0;
        await nh_timeout(state, { message: async (text) => messages.push(text) });
        assert.deepEqual(messages, [], 'the source resistance macro ignores blocked');
    }
});

test('simultaneous levitation and flight expiry clears flight before float_down', async () => {
    const state = propertyTimeoutState();
    state.u.uprops[LEVITATION] = { intrinsic: 1, extrinsic: 1, blocked: 0 };
    state.u.uprops[FLYING].intrinsic = 1;
    const messages = [];
    await nh_timeout(state, { message: async (text) => messages.push(text) });
    assert.equal(state.u.uprops[FLYING].intrinsic, 0);
    assert.equal(state.u.uprops[LEVITATION].intrinsic, 0);
    assert.equal(state.u.uprops[LEVITATION].extrinsic, 1);
    assert.deepEqual(messages, [], 'remaining levitation suppresses landing');
});

test('property expiry preserves source message and warning-pointer order', async () => {
    const state = propertyTimeoutState();
    for (const index of [FIRE_RES, WWALKING, WARN_OF_MON, PASSES_WALLS])
        state.u.uprops[index].intrinsic = 1;
    state.context.warntype = {
        species: state.mons[PM_KOBOLD], speciesidx: PM_KOBOLD,
    };
    // Eight open room squares make stuck_in_wall() false.
    for (let x = state.u.ux - 1; x <= state.u.ux + 1; ++x)
        for (let y = state.u.uy - 1; y <= state.u.uy + 1; ++y)
            state.level.at(x, y).typ = ROOM;
    const messages = [];
    await nh_timeout(state, { message: async (text) => messages.push(text) });
    assert.deepEqual(messages, [
        'Your temporary ability to survive burning has ended.',
        'You are no longer warned about kobolds.',
        'Your temporary ability to walk on liquid has ended.',
        "You're back to your normal self again.",
    ]);
    assert.equal(state.context.warntype.species, null);
    assert.equal(state.context.warntype.speciesidx, -1);
});

test('independent timeout recipes reach expiry with both capacity branches',
    async () => {
        for (const { recipe } of loadHeroTimeoutRecipes()) {
            for (const segment of recipe.segments)
                await verifyHeroTimeoutSegment(segment);
        }
    });

test('nh_timeout orders Unchanging, cream and spell-protection clocks', async () => {
    // timeout.c:641-662 resets mtimedone from the form level, then cream,
    // then protection. The remaining spell protection affects find_ac().
    for (const blind of [false, true]) {
        const state = propertyTimeoutState();
        state.u.mtimedone = 1;
        state.u.uprops[UNCHANGING].intrinsic = FROMOUTSIDE;
        state.u.uprops[BLINDED].intrinsic = blind ? FROMOUTSIDE : 0;
        state.u.ucreamed = 2;
        state.u.usptime = 1;
        state.u.uspmtime = 7;
        state.u.uspellprot = 2;
        const messages = [];
        const draws = [];
        await nh_timeout(state, {
            random: { rnd(bound) {
                draws.push(bound);
                assert.equal(state.u.ucreamed, 2, 'cream follows the draw');
                return 3;
            } },
            norepMessage: async (text) => messages.push(text),
        });
        assert.deepEqual(draws, [100 * state.youmonst.data.mlevel + 1]);
        assert.equal(state.u.mtimedone, 3);
        assert.equal(state.u.ucreamed, 1);
        assert.equal(state.u.usptime, 7);
        assert.equal(state.u.uspellprot, 1);
        assert.equal(state.u.uac, state.youmonst.data.ac - 1);
        assert.deepEqual(messages, blind ? []
            : ['The golden haze around you becomes less dense.']);
    }
});

function queue(state) {
    const result = [];
    for (let timer = state.gt.timer_base; timer; timer = timer.next)
        result.push(timer);
    return result;
}

test('plain on-foot fumbling expiry keeps C ordering and random draws',
    async () => {
        const state = plainFumblingState();
        const messages = [];
        const draws = [];
        const random = {
            rn2(bound) {
                draws.push(['rn2', bound]);
                return 1; // timeout.c slip_or_trip() case 1: trip over feet
            },
            rnd(bound) {
                draws.push(['rnd', bound]);
                return 7; // timeout.c incr_itimeout(&HFumbling, rnd(20))
            },
        };

        await nh_timeout(state, {
            random,
            message: async (text) => messages.push(text),
        });

        assert.deepEqual(messages, [
            'You trip over your own feet.',
            'You make a lot of noise!',
        ]);
        assert.deepEqual(draws, [['rn2', 4], ['rnd', 20]]);
        assert.equal(state.multi, -2);
        assert.equal(state.multi_reason, 'fumbling');
        assert.equal(state.nomovemsg, '');
        assert.equal(state.u.uprops[FUMBLING].intrinsic, 7);
        assert.equal(state.u.uprops[FUMBLING].extrinsic, 1);
    });

test('stationary fumbling expiry clears outside and only draws extension',
    async () => {
        const state = plainFumblingState();
        // A failed walk into a closed door leaves u.umoved false. The C
        // FUMBLING arm still clears FROMOUTSIDE and extends another active
        // source, but timeout.c:905-918 skips slip_or_trip() and movement
        // effects, so this case must make no rn2(4) draw or message.
        state.u.umoved = false;
        state.u.uprops[FUMBLING].intrinsic = FROMOUTSIDE | 1;
        const messages = [];
        const draws = [];
        const random = {
            rn2(bound) {
                draws.push(['rn2', bound]);
                return 1;
            },
            rnd(bound) {
                draws.push(['rnd', bound]);
                return 5; // timeout.c:924 extends the remaining fumble.
            },
        };

        await nh_timeout(state, {
            random,
            message: async (text) => messages.push(text),
        });

        assert.deepEqual(messages, []);
        assert.deepEqual(draws, [['rnd', 20]]);
        assert.equal(state.multi, 0);
        assert.equal(state.u.uprops[FUMBLING].intrinsic, 5);
        assert.equal(state.u.uprops[FUMBLING].extrinsic, 1);
    });

test('fumbling expiry preserves its caller around unported slip branches', async () => {
    const cases = [
        ['while mounted', (state) => { state.u.usteed = {}; }],
        ['while levitating', (state) => {
            state.u.uprops[LEVITATION] = { intrinsic: 0, extrinsic: 1 };
        }],
        ['while flying', (state) => {
            state.u.uprops[FLYING] = { intrinsic: 0, extrinsic: 1 };
        }],
        ['from outside', (state) => {
            state.u.uprops[FUMBLING].intrinsic = FROMOUTSIDE | 1;
        }],
        ['on ice', (state) => {
            state.level.at(state.u.ux, state.u.uy).typ = ICE;
        }],
        ['over an object', (state) => {
            state.level.objects[state.u.ux][state.u.uy] = { nobj: null };
        }],
        ['with deferred decoration', (state) => {
            state.iflags.defer_decor = true;
        }],
    ];

    for (const [label, mutate] of cases) {
        const state = plainFumblingState();
        mutate(state);
        await nh_timeout(state, {
            random: { rn2: () => 0, rnd: () => 5 },
            message: async () => {},
        });
        assert.equal(state.u.uprops[FUMBLING].intrinsic, 5, label);
        assert.equal(state.multi,
            label === 'while levitating' || label === 'while flying' ? 0 : -2,
            label);
    }
});

test('fumbling expiry catches deferred decoration through pickup owner', async () => {
    const state = plainFumblingState();
    state.flags.mention_decor = true;
    state.iflags.defer_decor = true;
    state.u.umoved = false;
    state.level.at(state.u.ux, state.u.uy).typ = ROOM;

    await nh_timeout(state, {
        random: { rn2: () => 0, rnd: () => 5 },
        message: async () => {},
    });

    // timeout.c:929 calls deferred_decor(FALSE) after the fumble clock is
    // updated.  The canonical pickup owner must catch up the silent ROOM
    // transition and clear the one-turn deferral in the same order.
    assert.equal(state.iflags.defer_decor, false);
    assert.equal(state.iflags.prev_decor, ROOM);
});

test('timeout globals reset source-owned fields without replacing owners', () => {
    const state = timerState();
    assert.equal(state.gt.other, true);
    assert.equal(state.svt.other, true);
    assert.equal(state.gt.timer_base, null);
    assert.equal(state.svt.timer_id, 1);
});

test('elapsed-turn timeout upkeep counts scalar and unhandled property clocks',
    async () => {
        const state = timerState(2);
        state.u = {
            uinvulnerable: false,
            mtimedone: 0,
            ucreamed: 0,
            usptime: 0,
            ugallop: 0,
            uprops: [{ intrinsic: 0 }, { intrinsic: 0x01000000 }],
        };
        start_timer(100, TIMER_OBJECT, ROT_CORPSE, { timed: 0 }, state);
        await assert.doesNotReject(nh_timeout(state));

        // C decrements every scalar; absent protection and steed make their
        // expiry arms inert, independently of the cream clock.
        for (const field of ['ucreamed', 'usptime', 'ugallop']) {
            state.u[field] = 1;
            await nh_timeout(state);
            assert.equal(state.u[field], 0, field);
        }
        // mtimedone=1 decrements to 0 and timeout.c:642-643 re-arms it for
        // an Unchanging hero with rnd(100 * mlevel + 1); a form of level 0
        // makes that rnd(1), which is 1, so the timer reads 1 again.
        state.u.mtimedone = 1;
        state.u.uprops[UNCHANGING] = { intrinsic: 0, extrinsic: 1 };
        state.youmonst = { data: { mlevel: 0 } };
        initRng(1); // rnd(1) draws once; any seed answers 1
        await assert.doesNotReject(nh_timeout(state));
        assert.equal(state.u.mtimedone, 1, 'Unchanging re-arms mtimedone');
        delete state.u.uprops[UNCHANGING];
        delete state.youmonst;
        state.u.mtimedone = 0;
        // mtimedone > 1 decrements without error; the countdown runs but
        // does not reach zero.
        state.u.mtimedone = 5;
        await assert.doesNotReject(nh_timeout(state));
        // Verify it actually decremented.
        assert.equal(state.u.mtimedone, 4, 'mtimedone decrements each turn');
        state.u.mtimedone = 0;
        // Invulnerability precedes the mtimedone decrement, so mtimedone=1
        // passes when uinvulnerable is set.
        state.u.mtimedone = 1;
        state.u.uinvulnerable = true;
        await assert.doesNotReject(nh_timeout(state));
        // Invulnerability skips the decrement, so mtimedone stays 1.
        assert.equal(state.u.mtimedone, 1, 'uinvulnerable skips mtimedone');
        state.u.uinvulnerable = false;
        state.u.mtimedone = 0;

        state.u.uprops[0].intrinsic = 3;
        await nh_timeout(state);
        assert.equal(state.u.uprops[0].intrinsic, 2);
        state.u.uprops[0].intrinsic = 0;
        state.gt.timer_base.timeout = 2;
        // The timer above holds a bare `{ timed }` stand-in rather than a
        // floor object, so run_timers() stops on dig.c rot_corpse()'s
        // where test rather than firing. `where=undefined` is that stand-in.
        await assert.rejects(
            nh_timeout(state),
            /a corpse on the floor, but one is rotting at where=undefined/u,
        );
    });

test('elapsed-turn timeout decrements and expires timed deafness while unaware',
    async () => {
        const state = timerState();
        const uprops = [];
        // Three is a duration above expiry, matching the rotten-food timeout
        // branch in eat.c:1830-1847. FROMOUTSIDE proves that the packed
        // property flags survive timeout.c:670-671's decrement.
        uprops[DEAF] = { intrinsic: FROMOUTSIDE | 3, extrinsic: 0 };
        state.u = {
            uinvulnerable: false,
            mtimedone: 0,
            ucreamed: 0,
            usptime: 0,
            ugallop: 0,
            uprops,
        };
        // timeout.c calls make_deaf() while Unaware in the selected witness;
        // this suppresses its talk branch while stop_occupation() still
        // sees the negative multi-turn state.
        state.multi = -3;
        state.nomovemsg = 'You are conscious again.';
        const messages = [];
        const env = { message: async (text) => messages.push(text) };

        await nh_timeout(state, env);
        assert.equal(uprops[DEAF].intrinsic, FROMOUTSIDE | 2);
        await nh_timeout(state, env);
        assert.equal(uprops[DEAF].intrinsic, FROMOUTSIDE | 1);
        await nh_timeout(state, env);

        // timeout.c:752-758 restores one turn before make_deaf(0, TRUE),
        // which clears only the timeout bits and then marks the status line.
        assert.equal(uprops[DEAF].intrinsic, FROMOUTSIDE);
        assert.equal(state.disp.botl, true);
        assert.deepEqual(messages, []);
    });

test('timed deafness expiry talks and stops occupation only when hearing returns',
    async () => {
        const state = timerState();
        const uprops = [];
        // A one-turn DEAF timeout enters timeout.c:752's expiry switch on the
        // next elapsed turn. The ordinary conscious state enables C's
        // make_deaf(0, TRUE) feedback and stop_occupation() arm.
        uprops[DEAF] = { intrinsic: 1, extrinsic: 0 };
        state.u = {
            uinvulnerable: false,
            mtimedone: 0,
            ucreamed: 0,
            usptime: 0,
            ugallop: 0,
            uprops,
        };
        state.context = { run: 0, travel: 0, travel1: 0, mv: 0 };
        state.multi = 2;
        state.go = { occupation: () => {}, occtxt: 'reading' };
        const messages = [];

        await nh_timeout(state, {
            message: async (text) => messages.push(text),
        });

        assert.equal(uprops[DEAF].intrinsic, 0);
        assert.deepEqual(messages, [
            'You can hear again.',
            'You stop reading.',
        ]);
        assert.equal(state.go.occupation, null);
        assert.equal(state.multi, 0);
        assert.equal(state.disp.botl, true);
    });

test('timed deafness expiry keeps occupation while another deafness source remains',
    async () => {
        const state = timerState();
        const uprops = [];
        // The extrinsic source keeps Deaf true after HDeaf expires, so C's
        // timeout.c:756 condition skips stop_occupation() and its feedback
        // remains "You are unable to hear anything.".
        uprops[DEAF] = { intrinsic: 1, extrinsic: 1 };
        state.u = {
            uinvulnerable: false,
            mtimedone: 0,
            ucreamed: 0,
            usptime: 0,
            ugallop: 0,
            uprops,
        };
        state.context = { run: 0, travel: 0, travel1: 0, mv: 0 };
        state.multi = 2;
        const occupation = () => {};
        state.go = { occupation, occtxt: 'reading' };
        const messages = [];

        await nh_timeout(state, {
            message: async (text) => messages.push(text),
        });

        assert.equal(uprops[DEAF].intrinsic, 0);
        assert.deepEqual(messages, ['You are unable to hear anything.']);
        assert.equal(state.go.occupation, occupation);
        assert.equal(state.multi, 2);
    });

test('elapsed-turn timeout upkeep preserves invulnerability short circuit',
    async () => {
        const state = timerState(2);
        const uprops = [];
        // WOUNDED_LEGS is the only property this port gives a timeout, so it
        // is the only index at which timeout.c:670-671's countdown is
        // observable. Five turns is an arbitrary count above the expiry.
        uprops[WOUNDED_LEGS] = { intrinsic: 5, extrinsic: RIGHT_SIDE };
        state.u = { uinvulnerable: true, mtimedone: 5, uprops };

        await assert.doesNotReject(nh_timeout(state));
        // timeout.c:621-622 returns above the countdown, so the count stands.
        assert.equal(uprops[WOUNDED_LEGS].intrinsic, 5);

        // One turn left is the count that would expire and reach heal_legs()
        // on an ordinary turn. Invulnerability keeps this state untouched too,
        // and silently: C reaches neither the loop nor its switch. Without the
        // short circuit heal_legs() would run here, and this synthetic hero
        // has neither the temporary attributes nor the pack it reads.
        uprops[WOUNDED_LEGS].intrinsic = 1;
        await assert.doesNotReject(nh_timeout(state));
        assert.equal(uprops[WOUNDED_LEGS].intrinsic, 1);

        // The same state without invulnerability does count down. Without this
        // the two above would also pass on a port that never counts at all.
        state.u.uinvulnerable = false;
        state.u.mtimedone = 0;
        uprops[WOUNDED_LEGS].intrinsic = 5;
        await nh_timeout(state);
        assert.equal(uprops[WOUNDED_LEGS].intrinsic, 4);
    });

test('timed INVULNERABLE counts down with source-inert expiry', async () => {
    const state = timerState();
    const occupation = () => {};
    const uprops = [];
    // Three turns exercises both nonzero decrements and the zero transition;
    // FROMOUTSIDE verifies that timeout.c's packed intrinsic flags survive.
    uprops[INVULNERABLE] = { intrinsic: FROMOUTSIDE | 3, extrinsic: 0 };
    state.go = { occupation };
    state.u = {
        uinvulnerable: false,
        mtimedone: 0,
        ucreamed: 0,
        usptime: 0,
        ugallop: 0,
        uprops,
    };
    const messages = [];
    const draws = [];
    const random = {
        rn2(bound) {
            draws.push(['rn2', bound]);
            throw new Error('timed INVULNERABLE expiry must not draw');
        },
        rnd(bound) {
            draws.push(['rnd', bound]);
            throw new Error('timed INVULNERABLE expiry must not draw');
        },
    };

    await nh_timeout(state, {
        random,
        message: async (text) => messages.push(text),
    });
    assert.equal(uprops[INVULNERABLE].intrinsic, FROMOUTSIDE | 2);
    assert.equal(Boolean(uprops[INVULNERABLE].intrinsic), true);

    await nh_timeout(state, {
        random,
        message: async (text) => messages.push(text),
    });
    assert.equal(uprops[INVULNERABLE].intrinsic, FROMOUTSIDE | 1);

    await nh_timeout(state, {
        random,
        message: async (text) => messages.push(text),
    });
    // timeout.c:670-673 decrements the timed value, then its switch has no
    // INVULNERABLE row. Expiry therefore leaves the packed permanent bit and
    // active-property consumer state alone without cleanup or feedback.
    assert.equal(uprops[INVULNERABLE].intrinsic, FROMOUTSIDE);
    assert.equal(Boolean(uprops[INVULNERABLE].intrinsic), true);
    assert.equal(state.go.occupation, occupation);
    assert.deepEqual(messages, []);
    assert.deepEqual(draws, []);
});

test('timed FAST expiry keeps source speed and message ordering', async () => {
    const cases = [
        // One timeout turn with no other source makes both Fast and Very_fast
        // false after timeout.c:670-671's decrement.
        ['temporary speed', 1, 0, 0, 'You feel yourself slow down.'],
        // FROMOUTSIDE is an intrinsic source that leaves Fast true but does
        // not satisfy Very_fast, so C appends " a bit" at timeout.c:727-728.
        ['permanent intrinsic speed', FROMOUTSIDE | 1, 0, 0,
            'You feel yourself slow down a bit.'],
        // A nonzero extrinsic source keeps Very_fast true after the timeout,
        // which suppresses timeout.c:726's message entirely.
        ['extrinsic speed', 1, 1, 0, null],
        // FROM_FORM is outside INTRINSIC, so it also keeps Very_fast true
        // after the temporary timeout expires.
        ['form speed', FROM_FORM | 1, 0, 0, null],
        // C's You_feel() uses its dream prefix for an unaware hero, while the
        // timeout countdown and source test remain the same as the first row.
        ['unaware temporary speed', 1, 0, -1,
            'You dream that you feel yourself slow down.'],
    ];

    for (const [label, intrinsic, extrinsic, multi, expected] of cases) {
        const state = timerState();
        const property = { intrinsic, extrinsic };
        const uprops = [];
        uprops[FAST] = property;
        state.u = {
            uinvulnerable: false,
            mtimedone: 0,
            ucreamed: 0,
            usptime: 0,
            ugallop: 0,
            uprops,
            ...(multi < 0 ? { usleep: 1 } : {}),
        };
        state.multi = multi;
        const messages = [];
        const draws = [];
        const random = {
            rn2(bound) {
                draws.push(['rn2', bound]);
                throw new Error(`${label} must not draw rn2`);
            },
            rnd(bound) {
                draws.push(['rnd', bound]);
                throw new Error(`${label} must not draw rnd`);
            },
        };

        await nh_timeout(state, {
            random,
            message: async (text) => messages.push(text),
        });

        assert.equal(property.intrinsic, intrinsic & ~TIMEOUT, label);
        assert.deepEqual(messages, expected === null ? [] : [expected], label);
        assert.deepEqual(draws, [], label);
    }
});

test('elapsed-turn timeout upkeep decrements non-expiring confusion',
    async () => {
        const state = timerState();
        const uprops = [];
        // Twenty-four is the smallest source-produced duration for an
        // uncursed or cursed potion of confusion (potion.c:1025). The
        // FROMOUTSIDE flag proves that decrementing its TIMEOUT field does
        // not disturb the other intrinsic bits in the same C long.
        uprops[CONFUSION] = { intrinsic: FROMOUTSIDE | 24 };
        state.u = {
            uinvulnerable: false,
            mtimedone: 0,
            ucreamed: 0,
            usptime: 0,
            ugallop: 0,
            uprops,
        };

        await nh_timeout(state);

        // timeout.c:670-671 decrements 24 to 23 without entering the expiry
        // switch, so this turn writes no message and needs no expiry seam.
        assert.equal(uprops[CONFUSION].intrinsic, FROMOUTSIDE | 23);

        // The final turn restores one tick for make_confused's old-state
        // test, then clears only TIMEOUT. FROMOUTSIDE keeps Confusion true.
        uprops[CONFUSION].intrinsic = FROMOUTSIDE | 1;
        state.disp = {};
        const messages = [];
        await nh_timeout(state, {
            message: async (text) => messages.push(text),
        });
        assert.equal(uprops[CONFUSION].intrinsic, FROMOUTSIDE);
        assert.deepEqual(messages, ['You feel less confused now.']);
        assert.equal(state.disp.botl, true);
    });

test('elapsed-turn timeout upkeep counts down a worn restful-sleep amulet',
    async () => {
        // do_wear.c:1047-1054 gives a worn amulet of restful sleep only the
        // TIMEOUT portion of HSleepy. timeout.c:639-640 may say "You yawn."
        // at four, then timeout.c:670-671 decrements it. With no FROMOUTSIDE
        // or extrinsic source, timeout.c:784-793 does nothing when it reaches
        // zero, which is the exact source state created by Amulet_on().
        const state = timerState();
        const uprops = [];
        uprops[SLEEPY] = { intrinsic: 4, extrinsic: 0 };
        state.u = {
            uinvulnerable: false,
            mtimedone: 0,
            ucreamed: 0,
            usptime: 0,
            ugallop: 0,
            uprops,
        };
        const messages = [];

        await nh_timeout(state, {
            message: async (text) => messages.push(text),
        });
        assert.deepEqual(messages, ['You yawn.']);
        assert.equal(uprops[SLEEPY].intrinsic, 3);

        await nh_timeout(state, {
            message: async (text) => messages.push(text),
        });
        assert.deepEqual(messages, ['You yawn.']);
        assert.equal(uprops[SLEEPY].intrinsic, 2);

        uprops[SLEEPY].intrinsic = 1;
        await nh_timeout(state, {
            message: async (text) => messages.push(text),
        });
        assert.deepEqual(messages, ['You yawn.']);
        assert.equal(uprops[SLEEPY].intrinsic, 0);
    });

test('source-bearing sleepy expiry sleeps and extends in source draw order', async () => {
    // timeout.c:784-792 can extend or initiate sleep when Sleepy remains true
    // through FROMOUTSIDE or an extrinsic source.
    const state = timerState();
    state.context = { run: 0, travel: 0 };
    state.multi = 0;
    const uprops = [];
    uprops[SLEEPY] = { intrinsic: FROMOUTSIDE | 1, extrinsic: 0 };
    state.u = {
        uinvulnerable: false,
        mtimedone: 0,
        ucreamed: 0,
        usptime: 0,
        ugallop: 0,
        uprops,
    };

    const draws = [];
    const messages = [];
    await nh_timeout(state, {
        random: { rnd: (bound) => { draws.push(bound); return 3; } },
        message: async (text) => messages.push(text),
    });
    assert.deepEqual(draws, [20, 100]);
    assert.deepEqual(messages, ['You fall asleep.']);
    assert.equal(uprops[SLEEPY].intrinsic, FROMOUTSIDE | 6);
    assert.equal(state.multi, -3);
    assert.equal(state.u.usleep, state.moves);
    assert.equal(state.nomovemsg, 'You wake up.');
    state.u.uprops[SLEEP_RES] = { intrinsic: 0, extrinsic: 1 };
    state.u.uprops[SLEEPY].intrinsic = FROMOUTSIDE | 1;
    draws.length = 0;
    messages.length = 0;
    await nh_timeout(state, {
        random: { rnd: (bound) => { draws.push(bound); return 7; } },
        message: async (text) => messages.push(text),
    });
    assert.deepEqual(draws, [100]);
    assert.deepEqual(messages, []);
    assert.equal(state.u.uprops[SLEEPY].intrinsic, FROMOUTSIDE | 7);
});

test('move-600 timeout luck uses basal role and luckstone gates', async () => {
    const state = timerState(600);
    state.flags = { moonphase: 0, friday13: false };
    state.svq = { quest_status: {} };
    state.urole = { mnum: PM_ARCHEOLOGIST };
    state.uarmh = { otyp: FEDORA };
    state.invent = null;
    state.u = {
        uinvulnerable: false,
        mtimedone: 0,
        ucreamed: 0,
        usptime: 0,
        ugallop: 0,
        uprops: [],
        uhave: { amulet: false },
        ugangr: 0,
        uluck: 0,
    };

    await nh_timeout(state);
    assert.equal(state.u.uluck, 1);

    state.moves = 1200;
    state.u.uluck = 3;
    state.invent = {
        otyp: LUCKSTONE,
        quan: 1,
        blessed: true,
        cursed: false,
        nobj: null,
    };
    await nh_timeout(state);
    assert.equal(state.u.uluck, 3, 'blessed luckstone retains good luck');

    state.invent.blessed = false;
    state.invent.cursed = true;
    await nh_timeout(state);
    assert.equal(state.u.uluck, 2, 'cursed luckstone lets good luck time out');
});

test('elapsed-turn timeout upkeep advances the ordinary wipe occupation',
    async () => {
        const state = timerState(2);
        const uprops = [];
        // Three is the selected slice's exact pre-turn cream and BLINDED
        // timeout. timeout.c:649-650 and :669-671 decrement both to two while
        // do.c wipeoff() remains installed for the following occupation turn.
        uprops[BLINDED] = { intrinsic: 3, extrinsic: 0, blocked: 0 };
        state.flags = { moonphase: 0, friday13: false };
        state.svq = { quest_status: {} };
        state.invent = null;
        state.go = { occupation: wipeoff };
        state.u = {
            uinvulnerable: false,
            mtimedone: 0,
            ucreamed: 3,
            usptime: 0,
            ugallop: 0,
            uprops,
            uhave: { amulet: false },
            ugangr: 0,
            uluck: 0,
        };

        await nh_timeout(state);

        assert.equal(state.u.ucreamed, 2);
        assert.equal(uprops[BLINDED].intrinsic & 0x00ffffff, 2);

        // Four is the nearest longer cream timeout. do.c wipeoff() clamps
        // independently, so the elapsed turn admits it and decrements both
        // counters once before the callback runs.
        state.u.ucreamed = 4;
        uprops[BLINDED].intrinsic = 4;
        await nh_timeout(state);
        assert.equal(state.u.ucreamed, 3);
        assert.equal(uprops[BLINDED].intrinsic & 0x00ffffff, 3);
    });

test('fedora basal luck requires both the role and worn helmet', async () => {
    const state = timerState(600);
    state.flags = { moonphase: 0, friday13: false };
    state.svq = { quest_status: {} };
    state.invent = null;
    state.u = {
        uinvulnerable: false,
        mtimedone: 0,
        ucreamed: 0,
        usptime: 0,
        ugallop: 0,
        uprops: [],
        uhave: { amulet: false },
        ugangr: 0,
        uluck: 1,
    };

    state.urole = { mnum: PM_HEALER };
    state.uarmh = { otyp: FEDORA };
    await nh_timeout(state);
    assert.equal(state.u.uluck, 0, 'another role gets no fedora baseline');

    state.urole.mnum = PM_ARCHEOLOGIST;
    state.uarmh = null;
    state.u.uluck = 1;
    await nh_timeout(state);
    assert.equal(state.u.uluck, 0, 'Archeologist must wear the fedora');
});

test('start_timer orders expiries and puts equal expiries newest first', () => {
    const state = timerState(20);
    const later = { timed: 0 };
    const equalOld = { timed: 0 };
    const sooner = { timed: 0 };
    const equalNew = { timed: 0 };

    assert.equal(start_timer(8, TIMER_OBJECT, ROT_CORPSE, later, state), true);
    assert.equal(start_timer(5, TIMER_OBJECT, HATCH_EGG, equalOld, state), true);
    assert.equal(start_timer(2, TIMER_OBJECT, BURN_OBJECT, sooner, state), true);
    assert.equal(start_timer(5, TIMER_OBJECT, ROT_CORPSE, equalNew, state), true);

    assert.deepEqual(
        queue(state).map(({ timeout, tid, arg }) => [timeout, tid, arg]),
        [
            [22, 3, sooner],
            [25, 4, equalNew],
            [25, 2, equalOld],
            [28, 1, later],
        ],
    );
    assert.deepEqual(
        [later.timed, equalOld.timed, sooner.timed, equalNew.timed],
        [1, 1, 1, 1],
    );
});

// run_timers() reaches invent.c obfree() and mkobj.c remove_object(), so the
// bare timerState() above is not enough: the corpses it drains have to sit in
// both floor indexes of a real map.
function rottingState(moves = 254) {
    const state = timerState(moves);
    state.level = new GameMap();
    state.program_state = { gameover: false };
    state.u = { ux: 1, uy: 1, uundetected: false };
    state.youmonst = {};
    objects_globals_init(state);
    monst_globals_init(state);
    return state;
}

let nextTimerObjectId = 2;

function rottingCorpse(state, x, y, when) {
    const corpse = newObject({
        age: 0,
        corpsenm: PM_KOBOLD,
        o_id: nextTimerObjectId++,
        oclass: state.objects[CORPSE].oc_class,
        otyp: CORPSE,
        quan: 1,
    });
    place_object(corpse, x, y, { state });
    start_timer(when, TIMER_OBJECT, ROT_CORPSE, corpse, state);
    return corpse;
}

test('run_timers drains the due prefix head-first and stops at the future',
    async () => {
        const state = rottingState(254);
        // Expiries chosen so one is already past, one lands exactly on the
        // move count -- run_timers()'s condition is `<=` -- and one is still
        // ahead. The witness session's queue has the same shape at move 254.
        const past = rottingCorpse(state, 40, 5, -1);
        const exact = rottingCorpse(state, 41, 5, 0);
        const future = rottingCorpse(state, 42, 5, 1);
        const drawn = [];

        await run_timers(state, { newsym: (x, y) => drawn.push([x, y]) });

        assert.equal(past.where, OBJ_DELETED);
        assert.equal(exact.where, OBJ_DELETED);
        assert.equal(future.where, OBJ_FLOOR);
        // The queue keeps exactly the element that has not come due.
        assert.equal(state.gt.timer_base.arg, future);
        assert.equal(state.gt.timer_base.next, null);
        assert.equal(future.timed, 1);
        // Head-first, so the earlier expiry rots before the exact one.
        assert.deepEqual(drawn, [[40, 5], [41, 5]]);
    });

// timeout.c timeout_funcs[] (1978-1990) is "listed in order of enum
// timeout_types", and the port keeps each row's VERBOSE_TIMER name so a stop
// can say which function it refused. That name is the whole value of an
// unported row: it becomes the refusal reason, which becomes
// UnsupportedTurnBoundaryError.reason and lands in the boundary log that
// decides what is ported next. A row out of order would send the next goal at
// the wrong C function, and the module-load guard beside the table checks only
// the length, which any permutation satisfies.
//
// Every unported row is driven through run_timers() here, indexed by the
// js/const.js constant, so the table is pinned against the enum rather than
// against itself. ROT_CORPSE and SHRINK_GLOB are absent because they are
// ported rows; the drain tests above cover them.
test('every unported timeout row names its own C function', async () => {
    const rows = [
        [ROT_ORGANIC, 'rot_organic'],
        [REVIVE_MON, 'revive_mon'],
        [ZOMBIFY_MON, 'zombify_mon'],
        [BURN_OBJECT, 'burn_object'],
        [HATCH_EGG, 'hatch_egg'],
        [FIG_TRANSFORM, 'fig_transform'],
        [MELT_ICE_AWAY, 'melt_ice_away'],
    ];
    // Two short of the enum: ROT_CORPSE and SHRINK_GLOB are ported.
    assert.equal(rows.length, NUM_TIME_FUNCS - 2);

    for (const [index, name] of rows) {
        const state = rottingState(100);
        start_timer(0, TIMER_OBJECT, index, { where: OBJ_FLOOR, timed: 0 },
                    state);
        await assert.rejects(
            run_timers(state, { newsym: () => {} }),
            (error) => error.reason
                === `a ported timeout function, but ${name}() is due`,
            `row ${index}`,
        );
    }
});

test('run_timers fires equal expiries in the order start_timer built', async () => {
    const state = rottingState(300);
    // Both corpses expire on the same move. insert_timer() puts the newer one
    // first, so the second call to start_timer() is the first to fire.
    const older = rottingCorpse(state, 20, 4, 0);
    const newer = rottingCorpse(state, 21, 4, 0);
    const drawn = [];

    await run_timers(state, { newsym: (x, y) => drawn.push([x, y]) });

    assert.deepEqual(drawn, [[21, 4], [20, 4]]);
    assert.equal(older.where, OBJ_DELETED);
    assert.equal(newer.where, OBJ_DELETED);
    assert.equal(state.gt.timer_base, null);
});

test('run_timers decrements the object timer count before calling its function',
    async () => {
        // The ordering this pins is invisible in the result and fatal if
        // reversed: obfree() runs `if (obj.timed) stopObjectTimers(obj, env)`
        // for a FOOD_CLASS object, a required hook js/timeout.js cannot supply
        // from inside its own drain. Nothing here provides that hook, so the
        // call succeeds only because `timed` is already zero.
        const state = rottingState();
        const corpse = rottingCorpse(state, 33, 11, 0);
        assert.equal(corpse.timed, 1);

        await run_timers(state, { newsym: () => {} });

        assert.equal(corpse.timed, 0);
        assert.equal(corpse.where, OBJ_DELETED);
    });

test('run_timers refuses the whole due prefix before draining any of it', async () => {
    const state = rottingState();
    // The first element is drainable and the second is not, so a per-element
    // check would delete the first corpse and then stop with the queue half
    // drained. C cannot fail partway through run_timers(), so neither may this.
    // The corpse expires a turn earlier than the lamp, so the queue really
    // does hold the drainable element ahead of the refused one; equal expiries
    // would put the newest first and leave the refusal at the head, where even
    // a head-only check would find it.
    const corpse = rottingCorpse(state, 25, 6, -1);
    const lamp = newObject({
        o_id: nextTimerObjectId++,
        oclass: state.objects[OIL_LAMP].oc_class,
        otyp: OIL_LAMP,
        quan: 1,
    });
    start_timer(0, TIMER_OBJECT, BURN_OBJECT, lamp, state);
    assert.equal(state.gt.timer_base.arg, corpse);
    const queueBefore = queue(state).map((timer) => timer.tid);

    await assert.rejects(
        run_timers(state, { newsym: () => {} }),
        /a ported timeout function, but burn_object\(\) is due/u,
    );

    assert.equal(corpse.where, OBJ_FLOOR);
    assert.equal(corpse.timed, 1);
    assert.deepEqual(queue(state).map((timer) => timer.tid), queueBefore);
});

test('run_timers refuses a due corpse that carries a second timer', async () => {
    // remove_object() runs mkobj.c obj_timer_checks() for an object whose
    // `timed` is still nonzero after the drain's decrement, and on ice that
    // stops and restarts a timer -- a change to the very prefix the refusal
    // walk read ahead. Admitting only a corpse holding its own timer alone
    // keeps that walk sound.
    const state = rottingState();
    const corpse = rottingCorpse(state, 26, 6, 0);
    start_timer(50, TIMER_OBJECT, REVIVE_MON, corpse, state);
    assert.equal(corpse.timed, 2);

    await assert.rejects(
        run_timers(state, { newsym: () => {} }),
        /the due object to hold only its own timer/u,
    );
    assert.equal(corpse.where, OBJ_FLOOR);
});

test('run_timers refuses a due timer that is not an object timer', async () => {
    const state = rottingState();
    // timeout.h timer_is_pos(): MELT_ICE_AWAY is the only level timer, and its
    // argument is a packed coordinate rather than an object.
    start_timer(0, TIMER_LEVEL, 8 /* MELT_ICE_AWAY */, 5 * 0x10000 + 5, state);
    await assert.rejects(
        run_timers(state, { newsym: () => {} }),
        new RegExp(`every due timer to be an object timer, but kind `
            + `${TIMER_LEVEL} is due`, 'u'),
    );
});

test('duplicate object timers are rejected without consuming an id', () => {
    const state = timerState();
    const obj = { timed: 0 };
    assert.equal(start_timer(5, TIMER_OBJECT, ROT_CORPSE, obj, state), true);
    assert.equal(start_timer(7, TIMER_OBJECT, ROT_CORPSE, obj, state), false);
    assert.equal(state.svt.timer_id, 2);
    assert.equal(obj.timed, 1);
    assert.equal(peek_timer(ROT_CORPSE, obj, state), 15);
});

test('stop_timer returns remaining time and decrements object count', () => {
    const state = timerState(4);
    const obj = { timed: 0 };
    start_timer(9, TIMER_OBJECT, HATCH_EGG, obj, state);
    state.moves = 7;
    assert.equal(stop_timer(HATCH_EGG, obj, state), 6);
    assert.equal(obj.timed, 0);
    assert.equal(stop_timer(HATCH_EGG, obj, state), 0);
});

test('obj_stop_timers removes all and only the target object timers', () => {
    const state = timerState();
    const target = { timed: 0 };
    const other = { timed: 0 };
    start_timer(5, TIMER_OBJECT, ROT_CORPSE, target, state);
    start_timer(6, TIMER_OBJECT, HATCH_EGG, target, state);
    start_timer(7, TIMER_OBJECT, ROT_CORPSE, other, state);

    obj_stop_timers(target, state);
    assert.equal(target.timed, 0);
    assert.equal(other.timed, 1);
    assert.equal(obj_has_timer(target, ROT_CORPSE, state), false);
    assert.equal(obj_has_timer(target, HATCH_EGG, state), false);
    assert.equal(obj_has_timer(other, ROT_CORPSE, state), true);
});

test('spot_stop_timers removes only the matching packed-coordinate timer', () => {
    const state = timerState();
    const target = 3 * 0x10000 + 4;
    const other = 4 * 0x10000 + 3;
    start_timer(5, TIMER_LEVEL, REVIVE_MON, target, state);
    start_timer(6, TIMER_LEVEL, ROT_CORPSE, target, state);
    start_timer(7, TIMER_LEVEL, REVIVE_MON, other, state);

    spot_stop_timers(3, 4, REVIVE_MON, state);

    assert.deepEqual(
        queue(state).map(({ func_index, arg }) => [func_index, arg]),
        [
            [ROT_CORPSE, target],
            [REVIVE_MON, other],
        ],
    );
});

test('spot timer queries match level kind, coordinate, and current move', () => {
    // timeout.c:2443-2463 scans for the absolute expiration first, then
    // subtracts svm.moves. An object timer with the same index and numeric
    // argument must not satisfy the level-timer query.
    const state = timerState(10);
    const coordinate = 3 * 0x10000 + 4;
    state.gt.timer_base = {
        kind: TIMER_OBJECT,
        func_index: MELT_ICE_AWAY,
        arg: coordinate,
        timeout: 15,
        next: null,
    };
    assert.equal(spot_time_expires(3, 4, MELT_ICE_AWAY, state), 0);
    assert.equal(spot_time_left(3, 4, MELT_ICE_AWAY, state), 0);

    start_timer(9, TIMER_LEVEL, MELT_ICE_AWAY, coordinate, state);
    assert.equal(spot_time_expires(3, 4, MELT_ICE_AWAY, state), 19);
    assert.equal(spot_time_left(3, 4, MELT_ICE_AWAY, state), 9);
    state.moves = 22;
    assert.equal(spot_time_left(3, 4, MELT_ICE_AWAY, state), -3);
    assert.equal(spot_time_expires(4, 3, MELT_ICE_AWAY, state), 0);
});

test('start_timer validates the numeric source enum ranges', () => {
    const state = timerState();
    assert.throws(
        () => start_timer(1, TIMER_NONE, ROT_CORPSE, {}, state),
        /invalid timer kind/,
    );
    assert.throws(
        () => start_timer(1, NUM_TIMER_KINDS, ROT_CORPSE, {}, state),
        /invalid timer kind/,
    );
    assert.throws(
        () => start_timer(1, TIMER_OBJECT, NUM_TIME_FUNCS, {}, state),
        /invalid timer function/,
    );
});

test('queue operations fail closed when early initialization was skipped', () => {
    assert.throws(
        () => start_timer(1, TIMER_OBJECT, ROT_CORPSE, {}, {}),
        /timeout_globals_init/,
    );
});

test('egg hatch timing preserves the per-age rnd bounds', () => {
    const state = timerState(1);
    const egg = { timed: 0 };
    const bounds = [];
    attach_egg_hatch_timeout(egg, 0, {
        state,
        random: {
            rn2: () => assert.fail('egg hatch timing does not use rn2'),
            rnd: (bound) => {
                bounds.push(bound);
                return bound === 153 ? 151 : 150;
            },
        },
    });
    assert.deepEqual(bounds, [151, 152, 153]);
    assert.equal(peek_timer(HATCH_EGG, egg, state), 154);
    assert.equal(egg.timed, 1);
});

test('explicit egg hatch timing replaces the old timer without a draw', () => {
    const state = timerState(5);
    const egg = { timed: 0 };
    start_timer(20, TIMER_OBJECT, HATCH_EGG, egg, state);
    attach_egg_hatch_timeout(egg, 7, {
        state,
        random: {
            rn2: () => assert.fail('explicit hatch delay does not draw'),
            rnd: () => assert.fail('explicit hatch delay does not draw'),
        },
    });
    assert.equal(peek_timer(HATCH_EGG, egg, state), 12);
    assert.equal(egg.timed, 1);
});

test('failed egg hatch search removes the old timer across all 50 bounds', () => {
    const state = timerState(5);
    const egg = { timed: 0 };
    start_timer(20, TIMER_OBJECT, HATCH_EGG, egg, state);
    const bounds = [];
    attach_egg_hatch_timeout(egg, 0, {
        state,
        random: {
            rn2: () => assert.fail('egg hatch timing does not use rn2'),
            rnd: (bound) => {
                bounds.push(bound);
                return 150;
            },
        },
    });
    assert.deepEqual(bounds,
        Array.from({ length: 50 }, (_, index) => 151 + index));
    assert.equal(egg.timed, 0);
    assert.equal(peek_timer(HATCH_EGG, egg, state), 0);
    assert.equal(state.svt.timer_id, 2);
});

test('figurine and glob helpers preserve source delay calculations', () => {
    const state = timerState(3);
    const figurine = { timed: 0 };
    const glob = { globby: true, timed: 0 };
    attach_fig_transform_timeout(figurine, {
        state,
        random: { rn2: () => 0, rnd: (bound) => {
            assert.equal(bound, 9000);
            return 17;
        } },
    });
    start_glob_timeout(glob, 0, {
        state,
        random: { rnd: () => 1, rn2: (bound) => {
            assert.equal(bound, 5);
            return 4;
        } },
    });
    assert.equal(peek_timer(FIG_TRANSFORM, figurine, state), 220);
    assert.equal(peek_timer(SHRINK_GLOB, glob, state), 30);
});

test('ordinary corpse decay uses the source age and rnz adjustment', () => {
    const state = monsterTimerState(1);
    const body = { age: 1, corpsenm: PM_KOBOLD, timed: 0, norevive: false };
    start_corpse_timeout(body, {
        state,
        random: {
            rn1: () => assert.fail('ordinary decay does not use rn1'),
            rn2: () => assert.fail('ordinary decay does not use rn2 directly'),
            rnz: (bound) => {
                assert.equal(bound, 10);
                return 13;
            },
        },
    });
    assert.equal(peek_timer(ROT_CORPSE, body, state), 254);
});

test('level creation uses rnz(25) for corpse decay', () => {
    const state = monsterTimerState(1);
    state.in_mklev = true;
    const body = { age: 1, corpsenm: PM_KOBOLD, timed: 0, norevive: false };
    start_corpse_timeout(body, {
        state,
        random: {
            rn1: () => assert.fail('ordinary decay does not use rn1'),
            rn2: () => assert.fail('ordinary decay does not use rn2 directly'),
            rnz: (bound) => {
                assert.equal(bound, 25);
                return bound;
            },
        },
    });
    assert.equal(peek_timer(ROT_CORPSE, body, state), 251);
});

test('Rider revival consumes ordinary decay randomness before its loop', () => {
    const state = monsterTimerState(1);
    const body = { age: 1, corpsenm: PM_DEATH, timed: 0, norevive: false };
    const calls = [];
    start_corpse_timeout(body, {
        state,
        random: {
            rn1: () => assert.fail('Rider revival does not use rn1'),
            rnz: (bound) => {
                calls.push(['rnz', bound]);
                return bound;
            },
            rn2: (bound) => {
                calls.push(['rn2', bound]);
                return calls.length === 2 ? 1 : 0;
            },
        },
    });
    assert.deepEqual(calls, [['rnz', 10], ['rn2', 3], ['rn2', 3]]);
    assert.equal(peek_timer(REVIVE_MON, body, state), 8);
});

test('troll and zombification overrides select their source timer actions', () => {
    const trollState = monsterTimerState(1);
    const troll = { age: 1, corpsenm: PM_TROLL, timed: 0, norevive: false };
    start_corpse_timeout(troll, {
        state: trollState,
        random: { rnz: (n) => n, rn2: () => 0, rn1: () => 5 },
    });
    assert.equal(peek_timer(REVIVE_MON, troll, trollState), 3);

    const zombieState = monsterTimerState(1);
    zombieState.gz = { zombify: true };
    const victim = { age: 1, corpsenm: PM_KOBOLD, timed: 0, norevive: false };
    start_corpse_timeout(victim, {
        state: zombieState,
        random: {
            rnz: (n) => n,
            rn2: () => assert.fail('zombification does not use rn2 directly'),
            rn1: (range, base) => {
                assert.deepEqual([range, base], [15, 5]);
                return 8;
            },
        },
    });
    assert.equal(peek_timer(ZOMBIFY_MON, victim, zombieState), 9);
});

test('norevive suppresses zombification after the ordinary rnz draw', () => {
    const state = monsterTimerState(1);
    state.gz = { zombify: true };
    const victim = { age: 1, corpsenm: PM_KOBOLD, timed: 0, norevive: true };
    let rnzCalls = 0;
    start_corpse_timeout(victim, {
        state,
        random: {
            rnz: (bound) => {
                ++rnzCalls;
                return bound;
            },
            rn2: () => assert.fail('ordinary corpse does not use rn2 directly'),
            rn1: () => assert.fail('norevive suppresses zombification'),
        },
    });
    assert.equal(rnzCalls, 1);
    assert.equal(peek_timer(ROT_CORPSE, victim, state), 251);
    assert.equal(peek_timer(ZOMBIFY_MON, victim, state), 0);
});

test('lizard and lichen corpses never draw or receive a timer', () => {
    for (const corpsenm of [PM_LIZARD, PM_LICHEN]) {
        const state = monsterTimerState(1);
        const body = { age: 1, corpsenm, timed: 0, norevive: false };
        start_corpse_timeout(body, {
            state,
            random: {
                rnz: () => assert.fail('nonrotting corpse does not draw'),
                rn2: () => assert.fail('nonrotting corpse does not draw'),
                rn1: () => assert.fail('nonrotting corpse does not draw'),
            },
        });
        assert.equal(state.gt.timer_base, null);
    }
});

test('Rider minimums and cap match the source loop endpoints', () => {
    for (const [corpsenm, firstDelay] of [[PM_DEATH, 6], [PM_FAMINE, 12]]) {
        const state = monsterTimerState(1);
        const body = { age: 1, corpsenm, timed: 0, norevive: false };
        start_corpse_timeout(body, {
            state,
            random: { rnz: (n) => n, rn1: () => 5, rn2: () => 0 },
        });
        assert.equal(peek_timer(REVIVE_MON, body, state), firstDelay + 1);
    }

    const cappedState = monsterTimerState(1);
    const capped = {
        age: 1,
        corpsenm: PM_FAMINE,
        timed: 0,
        norevive: false,
    };
    let draws = 0;
    start_corpse_timeout(capped, {
        state: cappedState,
        random: {
            rnz: (n) => n,
            rn1: () => 5,
            rn2: (bound) => {
                assert.equal(bound, 3);
                ++draws;
                return 1;
            },
        },
    });
    assert.equal(draws, 55);
    assert.equal(peek_timer(REVIVE_MON, capped, cappedState), 68);
});

test('timer lookup uses argument identity and intentionally ignores kind', () => {
    const state = timerState(10);
    const first = { timed: 0, value: 1 };
    const equalButDistinct = { timed: 0, value: 1 };
    start_timer(8, TIMER_OBJECT, ROT_CORPSE, first, state);
    start_timer(7, TIMER_OBJECT, ROT_CORPSE, equalButDistinct, state);
    assert.equal(stop_timer(ROT_CORPSE, first, state), 8);
    assert.equal(obj_has_timer(equalButDistinct, ROT_CORPSE, state), true);

    start_timer(3, TIMER_LEVEL, HATCH_EGG, first, state);
    start_timer(6, TIMER_OBJECT, HATCH_EGG, first, state);
    assert.equal(stop_timer(HATCH_EGG, first, state), 3);
    assert.equal(first.timed, 1);
    assert.equal(stop_timer(HATCH_EGG, first, state), 6);
    assert.equal(first.timed, 0);
});

// timeout.c end_burn() reaches its stop_timer() only when
// `timer_attached && obj->otyp != MAGIC_LAMP && !artifact_light(obj)`; every
// other lit object is deleted directly. The first three cases below falsify
// one term each while the other two hold, and the fourth satisfies all three.
test('end_burn takes the timer path only for a timed ordinary light', () => {
    const hooks = { deleteObjectLightSource: () => {} };
    // OBJ_FREE keeps the inventory-refresh seam out of every case.
    const lit = (overrides) => (
        { lamplit: true, timed: 0, where: OBJ_FREE, ...overrides }
    );

    // An oil lamp is neither a magic lamp nor an artifact light, so only the
    // caller's timer_attached=FALSE can divert it. bury.c is that caller.
    const detached = timerState();
    assert.equal(
        preflight_end_burn(lit({ otyp: OIL_LAMP }), false, {
            state: detached,
            hooks,
        }).mode,
        'direct',
    );

    // A magic lamp burns forever and so owns no burn timer to stop.
    const everlasting = timerState();
    assert.equal(
        preflight_end_burn(lit({ otyp: MAGIC_LAMP }), true, {
            state: everlasting,
            hooks,
        }).mode,
        'direct',
    );

    // The Sunsword is artifact.c artifact_light(), which likewise burns no
    // fuel and starts no timer.
    const artifact = timerState();
    assert.equal(
        preflight_end_burn(
            lit({ otyp: LONG_SWORD, oartifact: ART_SUNSWORD }),
            true,
            { state: artifact, hooks },
        ).mode,
        'direct',
    );

    // All three terms hold, so the queued timer is what ends the burn.
    const timed = timerState();
    const lamp = lit({ otyp: OIL_LAMP });
    // Any positive delay queues the timer; its value never reaches the plan.
    start_timer(7, TIMER_OBJECT, BURN_OBJECT, lamp, timed);
    assert.equal(
        preflight_end_burn(lamp, true, { state: timed, hooks }).mode,
        'timer',
    );
});

test('stop_timer performs burning-object cleanup in source order', () => {
    const state = timerState(10);
    state.iflags = { perm_invent: true, suppress_price: 7 };
    state.program_state = { in_moveloop: 1 };
    const lamp = {
        // Age 40 and a seven-turn timer make five unused fuel turns remain
        // when the timer is stopped two moves later.
        age: 40,
        lamplit: true,
        timed: 0,
        where: OBJ_INVENT,
    };
    start_timer(7, TIMER_OBJECT, BURN_OBJECT, lamp, state);
    state.moves = 12;
    const calls = [];

    assert.equal(stop_timer(BURN_OBJECT, lamp, state, {
        hooks: {
            deleteObjectLightSource(obj) {
                calls.push('light');
                assert.equal(obj, lamp);
                assert.equal(obj.timed, 0);
                assert.equal(peek_timer(BURN_OBJECT, obj, state), 0);
            },
            updateInventory(currentState) {
                calls.push('inventory');
                assert.equal(currentState, state);
                assert.equal(currentState.iflags.suppress_price, 0);
                assert.equal(lamp.age, 45);
                assert.equal(lamp.lamplit, false);
            },
        },
    }), 5);

    assert.deepEqual(calls, ['light', 'inventory']);
    assert.equal(lamp.timed, 0);
    assert.equal(lamp.age, 45);
    assert.equal(lamp.lamplit, false);
    assert.equal(state.iflags.suppress_price, 7);
});

test('burn cleanup completes local state before rethrowing hook errors', () => {
    for (const failingHook of ['deleteObjectLightSource', 'updateInventory']) {
        const state = timerState(10);
        state.iflags = { perm_invent: true, suppress_price: 7 };
        state.program_state = { in_moveloop: 1 };
        const lamp = {
            age: 40,
            lamplit: true,
            timed: 0,
            where: OBJ_INVENT,
        };
        start_timer(7, TIMER_OBJECT, BURN_OBJECT, lamp, state);
        state.moves = 12;
        const failure = new Error(failingHook);
        const calls = [];

        assert.throws(
            () => stop_timer(BURN_OBJECT, lamp, state, {
                hooks: {
                    deleteObjectLightSource() {
                        calls.push('light');
                        if (failingHook === 'deleteObjectLightSource')
                            throw failure;
                    },
                    updateInventory() {
                        calls.push('inventory');
                        if (failingHook === 'updateInventory') throw failure;
                    },
                },
            }),
            (error) => error === failure,
        );
        assert.deepEqual(calls, ['light', 'inventory']);
        assert.equal(peek_timer(BURN_OBJECT, lamp, state), 0);
        assert.equal(lamp.timed, 0);
        assert.equal(lamp.age, 45);
        assert.equal(lamp.lamplit, false);
        assert.equal(state.iflags.suppress_price, 7);
    }
});

test('burn cleanup preserves the first thrown value even when it is falsy', () => {
    const state = timerState(10);
    state.iflags = { perm_invent: true, suppress_price: 7 };
    state.program_state = { in_moveloop: 1 };
    const lamp = {
        age: 40,
        lamplit: true,
        timed: 0,
        where: OBJ_INVENT,
    };
    start_timer(7, TIMER_OBJECT, BURN_OBJECT, lamp, state);
    state.moves = 12;
    const calls = [];
    let didThrow = false;
    let thrown;

    try {
        stop_timer(BURN_OBJECT, lamp, state, {
            hooks: {
                deleteObjectLightSource() {
                    calls.push('light');
                    throw false;
                },
                updateInventory() {
                    calls.push('inventory');
                    throw new Error('later inventory failure');
                },
            },
        });
    } catch (error) {
        didThrow = true;
        thrown = error;
    }
    assert.equal(didThrow, true);
    assert.equal(thrown, false);
    assert.deepEqual(calls, ['light', 'inventory']);
    assert.equal(peek_timer(BURN_OBJECT, lamp, state), 0);
    assert.equal(lamp.timed, 0);
    assert.equal(lamp.age, 45);
    assert.equal(lamp.lamplit, false);
    assert.equal(state.iflags.suppress_price, 7);
});

test('burn cleanup preflights every required seam before queue mutation', () => {
    const state = timerState(10);
    state.iflags = { perm_invent: true };
    state.program_state = { in_moveloop: 1 };
    const lamp = {
        age: 40,
        lamplit: true,
        timed: 0,
        where: OBJ_INVENT,
    };
    start_timer(5, TIMER_OBJECT, BURN_OBJECT, lamp, state);

    assert.throws(
        () => stop_timer(BURN_OBJECT, lamp, state),
        (error) => error instanceof UnsupportedTimerCleanupError
            && error.operation === 'deleteObjectLightSource',
    );
    assert.throws(
        () => stop_timer(BURN_OBJECT, lamp, state, {
            hooks: { deleteObjectLightSource() {} },
        }),
        (error) => error instanceof UnsupportedTimerCleanupError
            && error.operation === 'updateInventory',
    );
    assert.equal(lamp.timed, 1);
    assert.equal(peek_timer(BURN_OBJECT, lamp, state), 15);
    assert.equal(lamp.age, 40);
    assert.equal(lamp.lamplit, true);
});

test('burn cleanup uses the optional live inventory seam without perm_invent', () => {
    for (const active of [false, true]) {
        const state = timerState(10);
        if (active) {
            state.iflags = { perm_invent: false };
            state.program_state = { in_moveloop: 1 };
        }
        const lamp = {
            age: 40,
            lamplit: true,
            timed: 0,
            where: OBJ_INVENT,
        };
        start_timer(5, TIMER_OBJECT, BURN_OBJECT, lamp, state);

        let refreshes = 0;
        assert.equal(stop_timer(BURN_OBJECT, lamp, state, {
            hooks: {
                deleteObjectLightSource() {},
                updateInventory() { ++refreshes; },
            },
        }), 5);
        assert.equal(refreshes, active ? 1 : 0);
        assert.equal(lamp.timed, 0);
        assert.equal(lamp.age, 45);
        assert.equal(lamp.lamplit, false);
    }
});

test('obj_stop_timers preflights all cleanup before removing any timer', () => {
    const state = timerState(20);
    const target = {
        age: 30,
        lamplit: true,
        timed: 0,
        where: OBJ_FREE,
    };
    // ROT expires first, before the later BURN timer whose cleanup hook is
    // missing. Global preflight must reject without removing either timer.
    start_timer(4, TIMER_OBJECT, ROT_CORPSE, target, state);
    start_timer(8, TIMER_OBJECT, BURN_OBJECT, target, state);
    const timers = queue(state);

    assert.throws(
        () => obj_stop_timers(target, state),
        (error) => error instanceof UnsupportedTimerCleanupError
            && error.operation === 'deleteObjectLightSource',
    );
    assert.deepEqual(queue(state), timers);
    assert.equal(target.timed, 2);
    assert.equal(target.age, 30);
    assert.equal(target.lamplit, true);
});

test('obj_stop_timers cleans burn state and preserves unrelated queue order', () => {
    const state = timerState(20);
    const target = {
        // A five-turn burn timer stopped immediately restores all five turns.
        age: 30,
        lamplit: true,
        timed: 0,
        where: OBJ_FREE,
    };
    const firstOther = { timed: 0 };
    const secondOther = { timed: 0 };
    // Expiries interleave target and unrelated timers: BURN(target),
    // HATCH(firstOther), ROT(target), ROT(secondOther). Removing both target
    // timers must preserve the two survivors in that order.
    start_timer(8, TIMER_OBJECT, ROT_CORPSE, secondOther, state);
    start_timer(7, TIMER_OBJECT, ROT_CORPSE, target, state);
    start_timer(6, TIMER_OBJECT, HATCH_EGG, firstOther, state);
    start_timer(5, TIMER_OBJECT, BURN_OBJECT, target, state);
    const survivingTimers = queue(state).filter(({ arg }) => arg !== target);
    const calls = [];

    obj_stop_timers(target, state, {
        hooks: {
            deleteObjectLightSource(obj) {
                calls.push(obj);
                assert.equal(obj.timed, 2);
            },
        },
    });

    assert.deepEqual(calls, [target]);
    assert.deepEqual(queue(state), survivingTimers);
    assert.deepEqual(queue(state).map(({ arg }) => arg), [firstOther, secondOther]);
    assert.equal(target.timed, 0);
    assert.equal(target.age, 35);
    assert.equal(target.lamplit, false);
    assert.equal(firstOther.timed, 1);
    assert.equal(secondOther.timed, 1);
});

test('obj_stop_timers finishes its sweep before rethrowing cleanup errors', () => {
    const state = timerState(20);
    const target = {
        age: 30,
        lamplit: true,
        timed: 0,
        where: OBJ_FREE,
    };
    const firstOther = { timed: 0 };
    const secondOther = { timed: 0 };
    start_timer(8, TIMER_OBJECT, ROT_CORPSE, secondOther, state);
    start_timer(7, TIMER_OBJECT, ROT_CORPSE, target, state);
    start_timer(6, TIMER_OBJECT, HATCH_EGG, firstOther, state);
    start_timer(5, TIMER_OBJECT, BURN_OBJECT, target, state);
    const survivingTimers = queue(state).filter(({ arg }) => arg !== target);
    const failure = new Error('light cleanup failed');

    assert.throws(
        () => obj_stop_timers(target, state, {
            hooks: {
                deleteObjectLightSource() { throw failure; },
            },
        }),
        (error) => error === failure,
    );
    assert.deepEqual(queue(state), survivingTimers);
    assert.equal(target.timed, 0);
    assert.equal(target.age, 35);
    assert.equal(target.lamplit, false);
    assert.equal(firstOther.timed, 1);
    assert.equal(secondOther.timed, 1);
});

test('obj_stop_timers rethrows a falsy value after completing its sweep', () => {
    const state = timerState(20);
    const target = {
        age: 30,
        lamplit: true,
        timed: 0,
        where: OBJ_FREE,
    };
    const other = { timed: 0 };
    start_timer(8, TIMER_OBJECT, ROT_CORPSE, target, state);
    start_timer(7, TIMER_OBJECT, ROT_CORPSE, other, state);
    start_timer(5, TIMER_OBJECT, BURN_OBJECT, target, state);
    const survivingTimers = queue(state).filter(({ arg }) => arg !== target);
    let didThrow = false;
    let thrown;

    try {
        obj_stop_timers(target, state, {
            hooks: {
                deleteObjectLightSource() { throw undefined; },
            },
        });
    } catch (error) {
        didThrow = true;
        thrown = error;
    }
    assert.equal(didThrow, true);
    assert.equal(thrown, undefined);
    assert.deepEqual(queue(state), survivingTimers);
    assert.equal(target.timed, 0);
    assert.equal(target.age, 35);
    assert.equal(target.lamplit, false);
    assert.equal(other.timed, 1);
});

// A hero the instant before fall_asleep() runs: awake, free to act, and
// carrying the leftovers of whatever immobilized them last. `multireasonbuf`
// starts non-empty because only nomul(0) clears it, and that call happens
// inside stop_occupation() rather than in fall_asleep() itself.
function sleeperState(moves = 1234) {
    return {
        moves,
        multi: 0,
        multi_reason: 'the previous action',
        multireasonbuf: 'stale',
        nomovemsg: null,
        context: {},
        disp: {},
        go: {},
        u: { uinvulnerable: true, usleep: 0 },
    };
}

test('fall_asleep counts the hero down and leaves a waking message ready',
    async () => {
    // timeout.c fall_asleep() (950-974) with the arguments zap.c:2864 passes:
    // a negative count and a wakeup message.
    const state = sleeperState();
    await fall_asleep(-27, true, state);

    assert.equal(state.multi, -27);
    assert.equal(state.multi_reason, 'sleeping');
    // Cleared by the nomul(0) inside stop_occupation(), which is the only
    // caller that passes 0. Finding the stale value here would mean
    // stop_occupation() never ran, or ran after nomul() had already made its
    // `multi < nval` guard return early.
    assert.equal(state.multireasonbuf, '');
    // Written after nomul(), which zeroes it. trap.c unconscious() reads it,
    // so a zero here reads back as a hero who is merely immobile.
    assert.equal(state.u.usleep, 1234);
    assert.equal(state.u.uinvulnerable, false);
    assert.equal(state.nomovemsg, 'You wake up.');
    assert.equal(state.disp.botl, true);

    // hack.c unmul() prints decl.c's c_You_can_move_again instead when the
    // caller asks for no wakeup message.
    const quiet = sleeperState();
    await fall_asleep(-27, false, quiet);
    assert.equal(quiet.nomovemsg, 'You can move again.');
});

test('fall_asleep interrupts an occupation before it counts the hero down',
    async () => {
    // stop_occupation() is fall_asleep()'s first statement, so a hero put to
    // sleep mid-task drops the task. Its "You stop %s." needs a message
    // operation, which is why fall_asleep() takes one from its caller.
    const state = sleeperState();
    state.go = { occupation: () => 1, occtxt: 'digging' };
    const said = [];
    await fall_asleep(-27, true, state, {
        message: async (line) => { said.push(line); },
    });

    assert.deepEqual(said, ['You stop digging.']);
    assert.equal(state.go.occupation, null);
    assert.equal(state.multi, -27);
    assert.equal(state.u.usleep, 1234);
});

test('fall_asleep never shortens a sleep already under way', async () => {
    // nomul()'s `if (multi < nval) return;` guard, which C's comment calls "a
    // bug fix by ab@unido". A second sleep ray on a hero with 40 turns left
    // cannot cut them to 27, and neither can the nomul(0) stop_occupation()
    // makes on the way in.
    const state = sleeperState();
    state.multi = -40;
    state.u.usleep = 1200;
    await fall_asleep(-27, true, state);

    assert.equal(state.multi, -40);
    // The statements after nomul() run regardless, so the sleep is restamped
    // even though its length did not move.
    assert.equal(state.multi_reason, 'sleeping');
    assert.equal(state.u.usleep, 1234);
});
