import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { compareSessionOutputs, formatReport } from './diff-fresh.mjs';
import { zero_victual } from '../js/eat.js';
import { OBJ_CONTAINED, OBJ_INVENT, OBJ_MINVENT, OBJ_BURIED, PIT, ROOM, ROT_CORPSE, REVIVE_MON,
    TIMER_OBJECT } from '../js/const.js';
import { revive_corpse, revive_mon } from '../js/do.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_DEATH, PM_TROLL, PM_WATER_NYMPH, PM_KOBOLD, PM_PESTILENCE, PM_FAMINE } from '../js/monsters.js';
import { m_at, newMonster, place_monster } from '../js/monst.js';
import { t_at } from '../js/trap.js';
import { cansee } from '../js/vision.js';
import { is_displacer, is_reviver, is_rider } from '../js/mondata.js';
import { newObject } from '../js/obj.js';
import { CORPSE, LARGE_BOX } from '../js/objects.js';
import { nh_timeout_requires_live_state, peek_timer, start_timer,
    run_timers } from '../js/timeout.js';

async function lockedCorpse(species = PM_TROLL) {
    // An ordinary Wizard setup supplies canonical object, monster, and map
    // state. A locked large box reaches zap.c:revive's failed-container return
    // before creation, so the following tests pin do.c's scheduling alone.
    await runSegment({ seed: 12310633, datetime: '20910317101200',
        nethackrc: 'OPTIONS=name:RevivalSchedule,role:Wizard,race:human,'
            + 'gender:female,align:neutral,playmode:debug\n'
            + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,'
            + '!autopickup,!acoustics,!debug_mongen\n', moves: '' });
    game.gt.timer_base = null;
    game.moves = 40; // C subtracts this age delta from d(5,50).
    const container = newObject({ otyp: LARGE_BOX, where: OBJ_INVENT,
        olocked: true, quan: 1 });
    const body = newObject({ otyp: CORPSE,
        oclass: game.objects[CORPSE].oc_class, where: OBJ_CONTAINED,
        ocontainer: container, corpsenm: species, age: 10, quan: 1 });
    container.cobj = body;
    return body;
}

function scriptedRandom(expected) {
    const draws = [...expected];
    const random = Object.fromEntries(['d', 'rn1', 'rn2', 'rnd', 'rnz']
        .map(name => [name, (...args) => {
            const next = draws.shift();
            assert.deepEqual({ name, args }, { name: next?.name, args: next?.args });
            return next.value;
        }]));
    return { random, done() { assert.deepEqual(draws, []); } };
}

test('failed non-Rider revival draws d(5,50), subtracts age, and schedules rot',
    async () => {
        const body = await lockedCorpse();
        const draws = scriptedRandom([{ name: 'd', args: [5, 50], value: 100 }]);
        const lines = [];
        await revive_mon(body, game.moves, { state: game, random: draws.random,
            message: line => lines.push(line) });
        assert.deepEqual(lines, ['You feel less hassled.']);
        assert.equal(peek_timer(ROT_CORPSE, body, game), 110); // 40+100-(40-10)
        assert.equal(body.timed, 1);
        assert.equal(body.where, OBJ_CONTAINED);
        draws.done();
    });

test('failed Rider revival retries from three turns in source draw order',
    async () => {
        const body = await lockedCorpse(PM_DEATH);
        const draws = scriptedRandom([
            { name: 'rn2', args: [99], value: 1 }, // choose Rider retry
            { name: 'rn2', args: [3], value: 1 }, // continue from minimum 3
            { name: 'rn2', args: [3], value: 0 }, // stop at 4 turns
        ]);
        const lines = [];
        await revive_mon(body, 0, { state: game, random: draws.random,
            message: line => lines.push(line) });
        assert.deepEqual(lines, []);
        assert.equal(peek_timer(REVIVE_MON, body, game), 44);
        draws.done();
    });

test('the one-in-99 Rider rot branch clamps an expired corpse to one turn',
    async () => {
        const body = await lockedCorpse(PM_DEATH);
        const draws = scriptedRandom([
            { name: 'rn2', args: [99], value: 0 }, // abandon Rider retry
            { name: 'd', args: [5, 50], value: 5 }, // less than its age delta
        ]);
        const lines = [];
        await revive_mon(body, 0, { state: game, random: draws.random,
            message: line => lines.push(line) });
        assert.deepEqual(lines, ['You feel much less hassled.']);
        assert.equal(peek_timer(ROT_CORPSE, body, game), 41);
        draws.done();
    });

test('an existing rot timer suppresses the message and duplicate, but not d()',
    async () => {
        const body = await lockedCorpse();
        start_timer(80, TIMER_OBJECT, ROT_CORPSE, body, game);
        const draws = scriptedRandom([{ name: 'd', args: [5, 50], value: 100 }]);
        await revive_mon(body, 0, { state: game, random: draws.random,
            message: () => assert.fail('existing ROT_CORPSE suppresses You_feel') });
        assert.equal(peek_timer(ROT_CORPSE, body, game), 120);
        assert.equal(body.timed, 1);
        draws.done();
    });

test('REVIVE_MON dispatch decrements ownership before a failed callback reschedules',
    async () => {
        const body = await lockedCorpse();
        start_timer(0, TIMER_OBJECT, REVIVE_MON, body, game);
        const draws = scriptedRandom([{ name: 'd', args: [5, 50], value: 100 }]);
        await run_timers(game, { random: draws.random, message: () => {} });
        assert.equal(body.timed, 1);
        assert.equal(game.gt.timer_base.func_index, ROT_CORPSE);
        assert.equal(peek_timer(ROT_CORPSE, body, game), 110);
        draws.done();
    });

test('only a due revival timer requests the established live timeout handoff',
    async () => {
        const body = await lockedCorpse();
        start_timer(1, TIMER_OBJECT, REVIVE_MON, body, game);
        assert.equal(nh_timeout_requires_live_state(game), false);
        ++game.moves; // make this object callback due
        assert.equal(nh_timeout_requires_live_state(game), true);
        game.u.uinvulnerable = true; // C nh_timeout exits before run_timers
        assert.equal(nh_timeout_requires_live_state(game), false);
    });

// C recordings establish production dispatch; these state assertions also pin
// the caller's whole victual replacement and wielded-object cleanup.
for (const [name, expectedLine] of [
    ['b123-troll-inventory-timeout', 'You feel squirming in your backpack!'],
    ['b123-troll-wielded-timeout', 'The troll corpse writhes out of your grasp!'],
    ['b123-troll-floor-timeout', 'The troll rises from the dead!'],
    ['b123-troll-sack-timeout', 'A troll writhes out of a bag in your pack!'],
    ['b123-troll-floor-sack-timeout', 'A troll escapes from a bag!'],
    ['b123-troll-holding-failure', 'You feel less hassled.'],
    ['b123-rider-tinning-floor', 'Yes...  But War does not preserve its enemies...'],
    // C makemon leaves cham=NON_PM under protection, so the substitution
    // remains a doppelganger rather than changing back into the corpse's Rider.
    ['b123-rider-eating-protected', 'The bite-covered doppelganger rises from the dead!'],
]) {
    test(`${name} matches its independent production C recording`, async () => {
        const recording = JSON.parse(readFileSync(new URL(
            `../recordings/do.c/${name}.session.json`, import.meta.url), 'utf8'));
        let boundary;
        const replay = await runSegment(recording.segments[0], {
            onBoundary(error) { boundary = error; },
        });
        assert.equal(boundary, undefined, boundary?.message);
        const result = compareSessionOutputs(recording, {
            rng: replay.getRngLog(), screens: replay.getScreens(),
            cursors: replay.getCursors(),
            animFrames: replay.getAnimationFramesByStep(),
        });
        assert.equal(result.passed, true, formatReport(result));
        assert.ok(recording.segments[0].steps.some(step =>
            step.screen.split('\n')[0].includes(expectedLine)));
        if (name === 'b123-troll-wielded-timeout')
            assert.equal(game.uwep, null);
        if (name === 'b123-rider-eating-protected') {
            assert.deepEqual(game.context.victual, zero_victual());
            assert.equal(game.u.umortality, 1);
            assert.equal(Boolean(game.program_state.gameover), false);
            assert.equal(Boolean(game.go.occupation), false);
        }
        if (name === 'b123-troll-holding-failure') {
            const timer = game.gt.timer_base;
            assert.equal(timer.func_index, ROT_CORPSE);
            assert.equal(timer.arg.corpsenm, PM_TROLL);
            assert.equal(timer.arg.where, OBJ_CONTAINED);
        }
    });
}


function visibleFloor() {
    // Choose from the initialized map, rather than encoding this seed's map
    // coordinates. All fixture locations must be valid, visible ROOM cells.
    for (let x = game.u.ux - 1; x <= game.u.ux + 1; ++x)
        for (let y = game.u.uy - 1; y <= game.u.uy + 1; ++y) {
            if ((x === game.u.ux && y === game.u.uy) || m_at(x, y, game)
                || t_at(x, y, game)) continue;
            if (game.level.at(x, y).typ === ROOM && cansee(x, y, game))
                return { x, y };
        }
    assert.fail('fixture needs an adjacent visible ordinary floor cell');
}

function carrierAt(coordinate) {
    const carrier = newMonster({ data: game.mons[PM_WATER_NYMPH],
        m_id: 123000, mcansee: true, mhp: 20, mhpmax: 20 });
    // Separate fixed identity/HP distinguish this source fixture from the
    // monster revive() allocates; they do not select a gameplay branch.
    carrier.nmon = game.level.monlist;
    game.level.monlist = carrier;
    place_monster(carrier, coordinate.x, coordinate.y, game);
    return carrier;
}

test('monster-held corpse reports its saved carrier after m_useup removes it',
    async () => {
        const body = await lockedCorpse();
        const carrier = carrierAt(visibleFloor());
        body.where = OBJ_MINVENT;
        // obj.ocarry and obj.ocontainer alias C's union; assign only the
        // owner appropriate to the new where value.
        body.ocarry = carrier;
        carrier.minvent = body;
        const lines = [];
        assert.equal(await revive_corpse(body, game, {
            message: line => lines.push(line),
        }), true);
        assert.equal(carrier.minvent, null);
        assert.match(lines[0], /Startled, the water nymph drops a troll corpse as it revives!/u);
    });

test('contained corpse resolves the outer monster carrier before extraction',
    async () => {
        const body = await lockedCorpse();
        const container = body.ocontainer;
        const carrier = carrierAt(visibleFloor());
        container.olocked = false;
        container.where = OBJ_MINVENT;
        container.ocarry = carrier;
        carrier.minvent = container;
        const lines = [];
        assert.equal(await revive_corpse(body, game, {
            message: line => lines.push(line),
        }), true);
        assert.equal(container.cobj, null);
        assert.equal(carrier.minvent, container);
        assert.match(lines[0], /^A troll writhes out of /u);
    });

test('buried auto-reviver creates and reveals its pit before the redraw tail',
    async () => {
        const body = await lockedCorpse();
        const coordinate = visibleFloor();
        body.where = OBJ_BURIED;
        body.ocontainer = null;
        body.ox = coordinate.x;
        body.oy = coordinate.y;
        const previousBuried = game.level.buriedobjlist ?? null;
        body.nobj = previousBuried;
        game.level.buriedobjlist = body;
        const effects = [];
        assert.equal(await revive_corpse(body, game, {
            message: line => effects.push(line),
            newsym(x, y) {
                const trap = t_at(x, y, game);
                effects.push({ x, y, pit: trap?.ttyp, seen: trap?.tseen });
            },
        }), true);
        assert.equal(game.level.buriedobjlist, previousBuried);
        assert.deepEqual(effects, ['A troll claws itself out of the ground!',
            { ...coordinate, pit: PIT, seen: true }]);
    });


test('revival classification pins mondata.h macros and Rider source flags',
    async () => {
        await lockedCorpse();
        const header = readFileSync(new URL(
            '../nethack-c/upstream/include/mondata.h', import.meta.url), 'utf8');
        assert.match(header, /#define is_displacer\(ptr\).*M3_DISPLACES/u);
        assert.match(header, /#define is_reviver\(ptr\).*is_rider\(ptr\).*S_TROLL/u);
        // mondata.h lists exactly these three Rider identities; monsters.h
        // gives each M3_DISPLACES. Troll class separately makes a reviver.
        for (const index of [PM_DEATH, PM_PESTILENCE, PM_FAMINE]) {
            assert.equal(is_rider(game.mons[index]), true);
            assert.equal(is_displacer(game.mons[index]), true);
            assert.equal(is_reviver(game.mons[index]), true);
        }
        assert.equal(is_rider(game.mons[PM_TROLL]), false);
        assert.equal(is_reviver(game.mons[PM_TROLL]), true);
        assert.equal(is_reviver(game.mons[PM_KOBOLD]), false);
        assert.equal(is_displacer(game.mons[PM_KOBOLD]), false);
    });
