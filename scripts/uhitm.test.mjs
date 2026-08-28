import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { moveloop_core } from '../js/allmain.js';
import {
    ALTAR,
    FOUNTAIN,
    GRAVE,
    ICE,
    LADDER,
    DOOR,
    OBJ_INVENT,
    ROOM,
    SINK,
    STAIRS,
    STRAT_WAITMASK,
    THRONE,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { UnsupportedHeroMoveBoundaryError } from '../js/hack.js';
import { runSegment } from '../js/jsmain.js';
import { m_at, place_monster, remove_monster } from '../js/monst.js';
import { monflee } from '../js/monmove.js';
import {
    PM_KITTEN,
    PM_LITTLE_DOG,
    PM_PONY,
    PM_SEWER_RAT,
    PM_SHADE,
} from '../js/monsters.js';
import { mksobj, mksobj_at } from '../js/obj.js';
import { objectGenerationEnv } from '../js/object_generation.js';
import {
    ORCISH_DAGGER,
    SCR_ENCHANT_ARMOR,
    SCR_SCARE_MONSTER,
    SILVER_DAGGER,
} from '../js/objects.js';
import { dmgval } from '../js/weapon.js';
import { enableRngLog, getRngLog, initRng } from '../js/rng.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import { do_attack, shade_miss } from '../js/uhitm.js';
import {
    PET_SWAP_ARRIVAL_MOVES,
    loadPetSwapArrivalRecipe,
} from './run-pet-swap-arrival-autopickup.mjs';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

const DATETIME = '20300102030405';
function petRc({
    role = 'Tourist',
    gender = 'male',
    align = 'neutral',
    pettype,
    safePet = true,
} = {}) {
    return `OPTIONS=name:PetGate,role:${role},race:human,gender:${gender},`
        + `align:${align},!legacy,!tutorial,!splash_screen,`
        + `mention_walls,${safePet ? '' : '!'}safe_pet,!acoustics`
        + `${pettype ? `,pettype:${pettype}` : ''}`;
}
const RC = petRc();

function topLine() {
    return game.nhDisplay.grid[0]
        .map(({ ch }) => ch).join('').trimEnd();
}

function deferred() {
    let resolve;
    const promise = new Promise((accept) => { resolve = accept; });
    return { promise, resolve };
}

async function startingPet({
    seed = 31006,
    expectedPm = PM_KITTEN,
    ...configuration
} = {}) {
    await runSegment({
        seed,
        datetime: DATETIME,
        nethackrc: petRc(configuration),
        moves: '',
    });
    let pet = game.level.monlist;
    while (pet && pet.m_id !== game.context.startingpet_mid)
        pet = pet.nmon;
    assert.ok(pet, 'startingpet_mid identifies a live starting pet');
    assert.equal(pet.data.pmidx, expectedPm);
    return pet;
}

// Move the pet onto the square east of the hero and give that square `terrain`,
// clearing everything the pet-swap admission seam refuses for a reason other
// than terrain: a floor object, a trap on either square, a region and an
// engraving. The hero's own square is left as the level generated it, which is
// the ROOM or CORR that hack.c domove_swap_with_pet():2154 needs
// goodpos(u.ux0, u.uy0, mtmp, 0) to accept.
function standPetEastOf(pet, terrain) {
    const oldHero = [game.u.ux, game.u.uy];
    const destination = [game.u.ux + 1, game.u.uy];
    const occupant = m_at(destination[0], destination[1], game);
    assert.ok(!occupant || occupant === pet);
    remove_monster(pet.mx, pet.my, game);
    const square = game.level.at(...destination);
    square.typ = terrain;
    square.flags = 0;
    square.doormask = 0;
    game.level.objects[destination[0]][destination[1]] = null;
    game.level.traps = [];
    game.level.regions = [];
    game.head_engr = null;
    place_monster(pet, ...destination, game);
    return { destination, oldHero };
}

test('the pet-swap arrival recipe contains replay inputs only', () => {
    const recipe = loadPetSwapArrivalRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 1);
    const segment = recipe.segments[0];
    assert.equal(Object.hasOwn(segment, 'steps'), false);
    assert.equal(segment.moves, PET_SWAP_ARRIVAL_MOVES);
    assert.match(segment.moves, /nuK@,uu $/u);
    assert.match(segment.nethackrc, /runmode:walk/u);
});

test('the natural pet-swap arrival replay pins the TTY handoff',
    () => withSerializedGrids(async () => {
        let boundary = null;
        const replay = await runSegment(
            loadPetSwapArrivalRecipe().segments[0],
            { onBoundary: (error) => { boundary = error; } },
        );
        const digest = (values) => createHash('sha256')
            .update(JSON.stringify(values)).digest('hex');

        assert.equal(boundary, null);
        assert.equal(game.moves, 7);
        assert.equal(replay.getRngLog().length, 3113);
        assert.equal(replay.getScreens().length, 26);
        assert.equal(replay.getCursors().length, 26);
        assert.equal(
            digest(replay.getScreens()),
            '09fd58f0c661ff1028b4fa4202d349d956c36dcfed27dcba5ffbbc0a12006ad4',
        );
        assert.equal(
            digest(replay.getCursors()),
            '573a9a1d095c819403be4888c228fdd1dc799485f53282d1f4de846887c3907d',
        );
        assert.equal(game.nhDisplay.inputQueueLength, 0);
        assert.equal(
            game._pending_message,
            'f - a scroll labeled STRC PRST SKRZ KRK.',
        );
    }));

test('live movement swaps every starting-pet species through safe-pet attack',
    async () => {
        const cases = [
            {
                expectedMessage: 'You swap places with your kitten.',
                expectedPm: PM_KITTEN,
                pettype: 'cat',
            },
            {
                expectedMessage: 'You swap places with your little dog.',
                expectedPm: PM_LITTLE_DOG,
                pettype: 'dog',
            },
            {
                seed: 2026072257,
                expectedMessage: 'You swap places with your saddled pony.',
                expectedPm: PM_PONY,
                role: 'Knight',
                align: 'lawful',
            },
        ];

        for (const configuration of cases) {
            const pet = await startingPet(configuration);
            const { destination, oldHero } = standPetEastOf(pet, ROOM);
            initRng(1); // first rn2(7) is 5, the successful swap branch
            game.nhDisplay.pushKey('l'.charCodeAt(0));

            await moveloop_core();

            assert.deepEqual([game.u.ux, game.u.uy], destination);
            assert.deepEqual([pet.mx, pet.my], oldHero);
            assert.equal(m_at(...oldHero, game), pet);
            assert.equal(m_at(...destination, game), null);
            assert.equal(
                game._pending_message,
                configuration.expectedMessage,
            );
            assert.equal(pet.mflee, false);
            let listCount = 0;
            for (let monster = game.level.monlist;
                monster;
                monster = monster.nmon) {
                if (monster === pet) ++listCount;
            }
            assert.equal(listCount, 1);
        }
    });

// hack.c domove_swap_with_pet() leaves a non-boulder destination object in
// place. domove_core() then commits the hero's position and spoteffects(TRUE)
// reaches pickup(1), so automatic pickup must consume the floor object after
// the swap message. The separate fresh recipe uses a longer shuffled scroll
// label to pin the TTY --More-- prompt between those two messages.
test('a pet swap performs automatic pickup on the arrival square', async () => {
    const pet = await startingPet({
        role: 'Wizard',
        // Wizard's role pet is a kitten; pettype only selects for roles whose
        // u_init.c role entry has no fixed pet species.
        expectedPm: PM_KITTEN,
    });
    const { destination, oldHero } = standPetEastOf(pet, ROOM);
    const scroll = mksobj_at(
        // A Wizard starts with magic-mapping scrolls, so enchant armor
        // exercises a new inventory slot rather than addinv()'s merge arm.
        SCR_ENCHANT_ARMOR,
        destination[0],
        destination[1],
        false,
        false,
        objectGenerationEnv({ state: game }),
    );
    game.flags.pickup = true;
    clearTtyMessageWindow(game);
    initRng(1); // The first rn2(7) is 5, so do_attack() permits the swap.
    game.nhDisplay.pushKey('l'.charCodeAt(0));
    // This fixed constructed case fits both messages on the top line, so it
    // must not hide a layout change behind spare dismissal input. The natural
    // replay above pins the distinct --More-- layout.

    await moveloop_core();

    assert.deepEqual([game.u.ux, game.u.uy], destination);
    assert.deepEqual([pet.mx, pet.my], oldHero);
    assert.equal(game.level.objects[destination[0]][destination[1]], null);
    assert.equal(scroll.where, OBJ_INVENT);
    assert.ok(
        [...function* inventory() {
            for (let obj = game.invent; obj; obj = obj.nobj) yield obj;
        }()].includes(scroll),
        'the picked-up scroll is linked into inventory',
    );
    assert.match(
        game._pending_message,
        /^You swap places with your kitten\.  [a-z] - a scroll labeled /u,
    );
});

// pickup.c pickup_object() gives a scroll of scare monster a special floor
// transaction. The existing pickup port refuses that branch, so pet-swap
// admission must reject it before do_attack() consumes rn2(7) and before the
// tentative hero and pet placements begin.
test('pet-swap pickup refusal leaves movement and RNG state atomic', async () => {
    const pet = await startingPet({ pettype: 'cat' });
    const { destination, oldHero } = standPetEastOf(pet, ROOM);
    const scroll = mksobj_at(
        SCR_SCARE_MONSTER,
        destination[0],
        destination[1],
        false,
        false,
        objectGenerationEnv({ state: game }),
    );
    game.flags.pickup = true;
    initRng(1); // The first rn2(7) would be 5 if admission reached do_attack().
    enableRngLog();
    const before = {
        core: structuredClone(game.coreCtx),
        floor: game.level.objects[destination[0]][destination[1]],
        inventory: game.invent,
        object: structuredClone({
            where: scroll.where,
            nobj: scroll.nobj,
            nexthere: scroll.nexthere,
        }),
    };
    game.nhDisplay.pushKey('l'.charCodeAt(0));

    await assert.rejects(
        moveloop_core(),
        (error) => (
            error instanceof UnsupportedHeroMoveBoundaryError
            && error.reason === 'pickup() of a scroll of scare monster'
        ),
    );

    assert.deepEqual([game.u.ux, game.u.uy], oldHero);
    assert.deepEqual([pet.mx, pet.my], destination);
    assert.equal(game.level.objects[destination[0]][destination[1]],
        before.floor);
    assert.equal(game.invent, before.inventory);
    assert.deepEqual({
        where: scroll.where,
        nobj: scroll.nobj,
        nexthere: scroll.nexthere,
    }, before.object);
    assert.deepEqual(game.coreCtx, before.core);
    assert.deepEqual(getRngLog(), []);
});

// hack.c domove_swap_with_pet() (2098-2180) never reads the square the hero
// moves onto. Its six refusal arms test the pet's pit-and-boulder pin, NODIAG
// on a diagonal, a boulder on the hero's square, bad_rock() through an
// opening, a trapped peaceful, and goodpos(u.ux0, u.uy0, mtmp, 0) -- every one
// of them about the pet or the square the pet moves into. So each of rm.h:138
// IS_FURNITURE()'s seven types swaps exactly as ROOM does. ICE, rm.h:88's next
// type after ALTAR, is the case just outside that range and stays refused.
test('live movement swaps with a pet standing on every furniture square',
    async () => {
        for (const [label, terrain] of [
            ['stairs', STAIRS],
            ['ladder', LADDER],
            ['fountain', FOUNTAIN],
            ['throne', THRONE],
            ['sink', SINK],
            ['grave', GRAVE],
            ['altar', ALTAR],
        ]) {
            const pet = await startingPet({ pettype: 'cat' });
            const { destination, oldHero } = standPetEastOf(pet, terrain);
            initRng(1); // first rn2(7) is 5, the successful swap branch
            game.nhDisplay.pushKey('l'.charCodeAt(0));

            await moveloop_core();

            assert.deepEqual([game.u.ux, game.u.uy], destination, label);
            assert.equal(game.level.at(...destination).typ, terrain, label);
            assert.deepEqual([pet.mx, pet.my], oldHero, label);
            assert.equal(m_at(...oldHero, game), pet, label);
            assert.equal(m_at(...destination, game), null, label);
            assert.equal(
                game._pending_message,
                'You swap places with your kitten.',
                label,
            );
        }

        const pet = await startingPet({ pettype: 'cat' });
        const { destination, oldHero } = standPetEastOf(pet, ICE);
        initRng(1);
        game.nhDisplay.pushKey('l'.charCodeAt(0));

        await assert.rejects(
            moveloop_core(),
            (error) => (
                error instanceof UnsupportedHeroMoveBoundaryError
                && error.reason === 'door or special terrain movement'
            ),
        );
        assert.deepEqual([game.u.ux, game.u.uy], oldHero);
        assert.deepEqual([pet.mx, pet.my], destination);
    });

// C reaches describe_decor() (pickup.c:376-425) after the swap, through
// spoteffects()'s pickup(1) and its object-free arm at pickup.c:702-707. On a
// furniture square that call always speaks, because pickup.c:392's silencing
// test carries `&& !IS_FURNITURE(ltyp)`, so it never fires there whatever
// iflags.prev_decor holds. Neither describe_decor() nor prev_decor is ported,
// and js/hack.js spoteffects() calls check_here() rather than pickup(), so
// nothing downstream would refuse: the seam has to, and it has to before the
// swap so that no line is written first.
//
// A bare ROOM square stays admitted after startup has remembered STAIRS, as it
// is at the walking seam. There dfeature_at() finds nothing and the silent
// transition stores ROOM. The complete furniture table and the doorway pin
// the refusal predicate's bounds.
test('a pet swap onto furniture or a doorway refuses mention_decor before it moves',
    async () => {
        for (const [label, terrain] of [
            ['stairs', STAIRS],
            ['ladder', LADDER],
            ['fountain', FOUNTAIN],
            ['throne', THRONE],
            ['sink', SINK],
            ['grave', GRAVE],
            ['altar', ALTAR],
            ['doorway', DOOR],
        ]) {
            const pet = await startingPet({ pettype: 'cat' });
            const { destination, oldHero } = standPetEastOf(pet, terrain);
            game.flags.mention_decor = true;
            game.iflags.prev_decor = STAIRS;
            initRng(1);
            game.nhDisplay.pushKey('l'.charCodeAt(0));

            await assert.rejects(
                moveloop_core(),
                (error) => (
                    error instanceof UnsupportedHeroMoveBoundaryError
                    && error.reason === 'decor description'
                ),
                label,
            );
            assert.deepEqual([game.u.ux, game.u.uy], oldHero, label);
            assert.deepEqual([pet.mx, pet.my], destination, label);
            // Empty, not absent: runSegment() leaves the pending top line
            // cleared, and the refusal writes nothing over it.
            assert.equal(game._pending_message, '', label);
        }

        const roomPet = await startingPet({ pettype: 'cat' });
        const room = standPetEastOf(roomPet, ROOM);
        game.flags.mention_decor = true;
        game.iflags.prev_decor = STAIRS;
        initRng(1);
        game.nhDisplay.pushKey('l'.charCodeAt(0));

        await moveloop_core();

        assert.deepEqual([game.u.ux, game.u.uy], room.destination);
        assert.equal(
            game._pending_message,
            'You swap places with your kitten.',
        );
    });

// A pet fails is_safemon() when `safe_pet` is off, so do_attack() takes its
// hostile arm at uhitm.c:511. attack_checks() then stops on the confirm test
// at 300-320 -- C would ask "Really attack your kitten?" through
// paranoid_query() -- and that happens before any draw, before the pet's flee
// state is touched, and after the one write C makes at 195.
test('do_attack sends a false safe-monster predicate to combat unchanged',
    async () => {
        const pet = await startingPet({
            pettype: 'cat',
            safePet: false,
        });
        pet.mstrategy = STRAT_WAITMASK;
        const before = structuredClone({
            mflee: pet.mflee,
            mfleetim: pet.mfleetim,
            mtrack: pet.mtrack,
        });
        let unsupportedCalls = 0;

        await assert.rejects(
            do_attack(pet, game, {
                random: {
                    rn2: () => assert.fail('unsafe collision must not draw'),
                    rnd: () => assert.fail('unsafe collision must not draw'),
                },
                unsupported(reason) {
                    ++unsupportedCalls;
                    assert.equal(
                        reason,
                        'confirming an attack on a peaceful monster',
                    );
                    throw new Error('combat boundary');
                },
            }),
            /combat boundary/u,
        );
        assert.equal(unsupportedCalls, 1);
        assert.equal(pet.mstrategy, 0);
        assert.deepEqual({
            mflee: pet.mflee,
            mfleetim: pet.mfleetim,
            mtrack: pet.mtrack,
        }, before);
    });

test('do_attack preserves refusal draw, flee, message, and stop order',
    async () => {
        const kitten = await startingPet();
        const events = [];
        const random = {
            rn2(bound) {
                events.push(`rn2(${bound})`);
                // Zero is do_attack()'s one-in-seven refusal outcome.
                return 0;
            },
            rnd(bound) {
                events.push(`rnd(${bound})`);
                // Three is the exact flee duration from the independent
                // PetRefuse C reproduction.
                return 3;
            },
        };

        assert.equal(
            await do_attack(kitten, game, {
                random,
                monFlee: async (...args) => {
                    events.push('monflee');
                    await monflee(...args);
                },
                message: (message) => events.push(`message:${message}`),
                endRunning: () => events.push('end_running'),
                unsupported: (reason) => assert.fail(reason),
            }),
            true,
        );

        assert.deepEqual(events, [
            'rn2(7)',
            'rnd(6)',
            'monflee',
            'message:You stop.  Your kitten is in the way!',
            'end_running',
        ]);
        assert.equal(kitten.mflee, true);
        assert.equal(kitten.mfleetim, 3);
        assert.ok(
            kitten.mtrack.every(({ x, y }) => x === 0 && y === 0),
            'monflee clears all remembered hero-track coordinates',
        );
    });

test('do_attack awaits flee and message before stopping the hero', async () => {
    const kitten = await startingPet();
    const fleeGate = deferred();
    const messageGate = deferred();
    const events = [];
    const pending = do_attack(kitten, game, {
        random: { rn2: () => 0, rnd: () => 3 },
        monFlee() {
            events.push('monflee');
            return fleeGate.promise;
        },
        message() {
            events.push('message');
            return messageGate.promise;
        },
        endRunning() {
            events.push('end_running');
        },
        unsupported: (reason) => assert.fail(reason),
    });

    assert.deepEqual(events, ['monflee']);
    fleeGate.resolve();
    await Promise.resolve();
    assert.deepEqual(events, ['monflee', 'message']);
    messageGate.resolve();
    assert.equal(await pending, true);
    assert.deepEqual(events, ['monflee', 'message', 'end_running']);
});

test('safe-pet refusal continues through the timed fleeing pet turns',
    async () => {
        await runSegment({
            // Independent C reproduction: the southwest bump refuses on
            // rn2(7)==0, assigns rnd(6)==3, then four waits exercise the
            // movemon_singlemon() timeout and dochug() flee paths.
            seed: 31009,
            datetime: DATETIME,
            nethackrc: RC,
            moves: 'y....',
        });

        assert.equal(game._commandDispatchCount, 5);
        let pet = game.level.monlist;
        while (pet && pet.m_id !== game.context.startingpet_mid)
            pet = pet.nmon;
        assert.ok(pet, 'starting pet remains live after fleeing continuation');
        assert.equal(pet.mflee, false);
        assert.equal(pet.mfleetim, 0);
    });

// uhitm.c shade_miss() (2013-2050). mhitm.c hitmm():660 asks it before every
// monster-versus-monster blow, and the answer for a defender that is not a
// shade is FALSE without reaching dmgval(), because C's `||` short-circuits on
// the species test.
test('shade_miss answers only for a shade and stops there', async () => {
    await runSegment({
        seed: 7710051, datetime: DATETIME, nethackrc: RC, moves: '',
    });
    const ordinary = { data: game.mons[PM_SEWER_RAT], msleeping: 1 };
    const shade = { data: game.mons[PM_SHADE], msleeping: 1, mx: 1, my: 1 };
    const attacker = { data: game.mons[PM_KITTEN], mx: 1, my: 2 };
    const env = {
        unsupported: (reason) => { throw new Error(reason); },
    };

    assert.equal(
        shade_miss(attacker, ordinary, null, false, true, game, env),
        false,
    );
    // The head decides before dmgval() runs; passing an object that would
    // answer nonzero leaves the answer alone for a defender that is not a
    // shade, and the msleeping clear at :2056 never happens either.
    const dagger = mksobj(ORCISH_DAGGER, false, false, { state: game });
    assert.equal(
        shade_miss(attacker, ordinary, dagger, false, true, game, env),
        false,
    );
    assert.equal(ordinary.msleeping, 1);

    // A shade and a weapon that harms one -- dmgval() answers nonzero for a
    // silver dagger against a shade -- is also FALSE, and by the second
    // disjunct rather than the first.
    const silver = mksobj(SILVER_DAGGER, false, false, { state: game });
    assert.ok(dmgval(silver, shade, game) > 0);
    assert.equal(
        shade_miss(attacker, shade, silver, false, true, game, env),
        false,
    );

    // A shade the attack passes through is where the port stops.
    assert.throws(
        () => shade_miss(attacker, shade, null, false, true, game, env),
        /an attack passing through a shade/u,
    );
    assert.throws(
        () => shade_miss(attacker, shade, dagger, false, true, game, env),
        /an attack passing through a shade/u,
    );
});
