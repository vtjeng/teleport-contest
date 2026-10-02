import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { moveloop_core } from '../js/allmain.js';
import {
    A_DEX,
    ALTAR,
    BLINDED,
    DETECT_MONSTERS,
    DRAIN_RES,
    FIRE_RES,
    FREE_ACTION,
    FROMFORM,
    FOUNTAIN,
    GRAVE,
    ICE,
    INTRINSIC,
    LADDER,
    DOOR,
    OBJ_INVENT,
    POISON_RES,
    PROT_FROM_SHAPE_CHANGERS,
    ROOM,
    SINK,
    STAIRS,
    STRAT_WAITMASK,
    STRAT_WAITFORU,
    M_ATTK_HIT,
    THRONE,
    STONE_RES,
    STONED,
    TIMEOUT,
    W_ARM,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import {
    UnsupportedHeroMoveBoundaryError,
    You_can_move_again,
} from '../js/hack.js';
import { poisoned as applyPoison } from '../js/attrib.js';
import { runSegment } from '../js/jsmain.js';
import { m_at, place_monster, remove_monster } from '../js/monst.js';
import { monflee } from '../js/monmove.js';
import {
    AD_CURS,
    AD_PLYS,
    AD_STON,
    AD_DRST,
    AD_WERE,
    AT_BITE,
    AT_CLAW,
    AT_WEAP,
    PM_GELATINOUS_CUBE,
    PM_GHOUL,
    PM_GREMLIN,
    PM_COCKATRICE,
    PM_DWARF_LEADER,
    PM_HUMAN,
    PM_IRON_GOLEM,
    PM_STONE_GOLEM,
    PM_TOURIST,
    PM_KITTEN,
    PM_LITTLE_DOG,
    PM_PONY,
    PM_RAVEN,
    PM_SEWER_RAT,
    PM_SHADE,
    PM_WATER_MOCCASIN,
    PM_WEREJACKAL,
    NON_PM,
} from '../js/monsters.js';
import { mksobj, mksobj_at } from '../js/obj.js';
import { objectGenerationEnv } from '../js/object_generation.js';
import {
    MIRROR,
    CORPSE,
    ORCISH_DAGGER,
    SCR_ENCHANT_ARMOR,
    SCR_SCARE_MONSTER,
    SILVER_DAGGER,
    LEATHER_ARMOR,
} from '../js/objects.js';
import { dmgval } from '../js/weapon.js';
import { set_ulycn } from '../js/were.js';
import { enableRngLog, getRngLog, initRng } from '../js/rng.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import {
    do_attack,
    mhitm_ad_phys,
    mhitm_ad_drst,
    mhitm_ad_ston,
    mhitm_adtyping,
    mhitm_mgc_atk_negated,
    mhitm_really_poison,
    shade_miss,
} from '../js/uhitm.js';
import {
    PET_SWAP_ARRIVAL_MOVES,
    loadPetSwapArrivalRecipe,
} from './run-pet-swap-arrival-autopickup.mjs';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

const DATETIME = '20300102030405';
const UHITM_C = readFileSync(
    new URL('../nethack-c/upstream/src/uhitm.c', import.meta.url), 'utf8',
);
const WERE_C = readFileSync(
    new URL('../nethack-c/upstream/src/were.c', import.meta.url), 'utf8',
);
const MHITU_C = readFileSync(
    new URL('../nethack-c/upstream/src/mhitu.c', import.meta.url), 'utf8',
);
const MHITM_C = readFileSync(
    new URL('../nethack-c/upstream/src/mhitm.c', import.meta.url), 'utf8',
);
const YOU_PROP_C = readFileSync(
    new URL('../nethack-c/upstream/include/youprop.h', import.meta.url), 'utf8',
);
const POTION_C = readFileSync(
    new URL('../nethack-c/upstream/src/potion.c', import.meta.url), 'utf8',
);
const EAT_C = readFileSync(
    new URL('../nethack-c/upstream/src/eat.c', import.meta.url), 'utf8',
);
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

// pickup.c pickup_object() sets spe on an unused uncursed scare scroll before
// lift_object() and pick_obj() unlink it from the floor. Clearing startup TTY
// output leaves the swap and pickup messages to exercise that ordering.
test('pet swap picks up an unused scare scroll after the successful swap', async () => {
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
    const movesBefore = game.moves;
    game.flags.pickup = true;
    clearTtyMessageWindow(game);
    // Seed 1 makes do_attack()'s first rn2(7) equal 5, allowing the swap.
    initRng(1);
    enableRngLog();
    game.nhDisplay.pushKey('l'.charCodeAt(0));
    // The two source messages overflow the top line together; dismiss More,
    // then stop at the next command boundary instead of inventing a turn.
    game.nhDisplay.pushKey(' '.charCodeAt(0));

    await moveloop_core();

    assert.deepEqual([game.u.ux, game.u.uy], destination);
    assert.deepEqual([pet.mx, pet.my], oldHero);
    assert.equal(scroll.spe, 1);
    assert.equal(game.level.objects[destination[0]][destination[1]], null);
    assert.equal(scroll.where, OBJ_INVENT);
    assert.ok(
        [...function* inventory() {
            for (let obj = game.invent; obj; obj = obj.nobj) yield obj;
        }()].includes(scroll),
        'the picked-up scare scroll is linked into inventory',
    );
    // allmain.c commits the elapsed-turn counter at the next input boundary;
    // context.move records that this completed command spent a move.
    assert.equal(game.context.move, 1);
    assert.equal(game.moves, movesBefore);
    assert.match(getRngLog()[0], /^rn2\(7\)=5$/u);
    assert.equal(getRngLog().length, 1,
        'safe-pet combat consumes only the source rn2(7) draw here');
    // After More acknowledges the combined swap/pickup output, the inventory
    // format line is the one retained in gt.toplines.
    assert.match(game._ttyToplines, /^[a-z] - a scroll labeled /u);
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
                && error.reason === 'domove_swap_with_pet() door or special terrain movement'
            ),
        );
        assert.deepEqual([game.u.ux, game.u.uy], oldHero);
        assert.deepEqual([pet.mx, pet.my], destination);
    });

// C reaches describe_decor() (pickup.c:376-425) after the swap, through
// spoteffects()'s pickup(1) and its object-free arm at pickup.c:702-707. On a
// furniture square that call always speaks, because pickup.c:392's silencing
// test carries `&& !IS_FURNITURE(ltyp)`, while open-door and doorway text is
// suppressed and prev_decor still records the destination terrain.
test('a pet swap onto furniture or a doorway describes after it moves',
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
            game.nhDisplay.pushKey(' '.charCodeAt(0));

            await moveloop_core().catch((error) => {
                assert.match(String(error?.message ?? ''),
                    /Input queue empty/u, label);
            });
            assert.deepEqual([game.u.ux, game.u.uy], destination, label);
            assert.deepEqual([pet.mx, pet.my], oldHero, label);
            assert.equal(game.iflags.prev_decor, terrain, label);
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
test('do_attack uses peaceful confirmation when safe-pet protection is off',
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
        const prompts = [];
        assert.equal(await do_attack(pet, game, {
            random: {
                rn2: () => assert.fail('confirmation refusal must not draw'),
                rnd: () => assert.fail('confirmation refusal must not draw'),
            },
            paranoidQuery: async (...args) => {
                prompts.push(args);
                return false;
            },
        }), true);
        assert.equal(prompts.length, 1);
        assert.equal(prompts[0][1], 'Really attack the kitten?');
        assert.equal(prompts[0][2], game);
        assert.equal(game.context.move, 0);
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
    const shade = {
        data: game.mons[PM_SHADE],
        msleeping: 1,
        mx: game.u.ux + 1,
        my: game.u.uy,
    };
    // Use the canonical hero object so m_next2u() supplies the C
    // monster-adjacent visibility term without depending on a particular
    // post-initialization vision map.
    const attacker = game.youmonst;
    const lines = [];
    const env = {
        unsupported: (reason) => { throw new Error(reason); },
        message: (line) => { lines.push(line); },
    };

    assert.equal(
        await shade_miss(attacker, ordinary, null, false, true, game, env),
        false,
    );
    // The head decides before dmgval() runs; passing an object that would
    // answer nonzero leaves the answer alone for a defender that is not a
    // shade, and the msleeping clear at :2056 never happens either.
    const dagger = mksobj(ORCISH_DAGGER, false, false, { state: game });
    assert.equal(
        await shade_miss(attacker, ordinary, dagger, false, true, game, env),
        false,
    );
    assert.equal(ordinary.msleeping, 1);

    // A shade and a weapon that harms one -- dmgval() answers nonzero for a
    // silver dagger against a shade -- is also FALSE, and by the second
    // disjunct rather than the first.
    const silver = mksobj(SILVER_DAGGER, false, false, { state: game });
    assert.ok(dmgval(silver, shade, game) > 0);
    assert.equal(
        await shade_miss(attacker, shade, silver, false, true, game, env),
        false,
    );

    // A shade the attack passes through returns TRUE after the source
    // harmless-feedback message and clears its sleep state.
    assert.equal(
        await shade_miss(attacker, shade, null, false, true, game, env),
        true,
    );
    assert.equal(shade.msleeping, 0);
    assert.ok(lines.some((line) => line.includes('harmlessly through')));
    assert.equal(
        await shade_miss(attacker, shade, dagger, false, true, game, env),
        true,
    );

    // uhitm.c:2035 shade_aware() treats reflective surfaces as an attack,
    // even though artifact.c shade_glare() is reserved for damage. The
    // message must therefore keep the source's generic noun.
    const mirror = mksobj(MIRROR, false, false, { state: game });
    const mirrorLines = [];
    assert.equal(
        await shade_miss(attacker, shade, mirror, false, true, game, {
            message: (line) => { mirrorLines.push(line); },
        }),
        true,
    );
    assert.ok(mirrorLines.some((line) => line.startsWith('Your attack ')));
});

test('shade_miss waits for deferred feedback before cleanup', async () => {
    await runSegment({
        seed: 7710052, datetime: DATETIME, nethackrc: RC, moves: '',
    });
    const shade = {
        data: game.mons[PM_SHADE],
        msleeping: 1,
        mx: game.u.ux + 1,
        my: game.u.uy,
    };
    const events = [];
    let release;
    const pendingMessage = new Promise((resolve) => {
        release = () => {
            events.push('message-resolved');
            resolve();
        };
    });
    const pending = shade_miss(game.youmonst, shade, null, false, true,
        game, {
            message: () => {
                events.push('message-start');
                return pendingMessage;
            },
        });
    await Promise.resolve();
    assert.deepEqual(events, ['message-start']);
    assert.equal(shade.msleeping, 1,
        'cleanup waits for the deferred message');
    release();
    assert.equal(await pending, true);
    assert.equal(shade.msleeping, 0);
    assert.deepEqual(events, ['message-start', 'message-resolved']);
});

test('set_ulycn stores one value and refreshes form drain resistance', async () => {
    // were.c:232-237 assigns u.ulycn before set_uasmon(); polyself.c then
    // derives DRAIN_RES/FROMFORM from that same canonical hero state.
    assert.match(WERE_C, /set_ulycn\(int which\)\s*\{\s*u\.ulycn = which;[\s\S]*?set_uasmon\(\);\s*\}/u);
    assert.match(UHITM_C, /case AD_WERE:\s*mhitm_ad_were\(magr, mattk, mdef, mhm\); break;/u);
    assert.match(POTION_C, /set_ulycn\(NON_PM\); \/\* cure lycanthropy \*\//u);
    assert.match(EAT_C, /if\s*\(ismnum\(catch_lycanthropy\)\)\s*\{\s*set_ulycn\(catch_lycanthropy\);/u);
    const potionJs = readFileSync(new URL('../js/potion.js', import.meta.url), 'utf8');
    const eatJs = readFileSync(new URL('../js/eat.js', import.meta.url), 'utf8');
    assert.match(potionJs, /set_ulycn\(NON_PM, state\);/u);
    assert.match(eatJs, /set_ulycn\(catch_lycanthropy, state\);\s*note_unported\('artifact\.c retouch_equipment'\);/u);

    await runSegment({
        // Seed 8806410 initializes a human hero so this test isolates the
        // setter's lycanthropy bit rather than a polymorph-form effect.
        seed: 8806410, datetime: DATETIME, nethackrc: RC, moves: '',
    });
    assert.equal(game.u.ulycn, NON_PM);
    assert.equal(game.u.uprops[DRAIN_RES].intrinsic & FROMFORM, 0);

    // were.c's species index is installed before set_uasmon re-reads it.
    set_ulycn(PM_WEREJACKAL, game);
    assert.equal(game.u.ulycn, PM_WEREJACKAL);
    assert.equal(game.u.uprops[DRAIN_RES].intrinsic & FROMFORM, FROMFORM);

    // NON_PM removes only the lycanthropy contribution from the same bit.
    set_ulycn(NON_PM, game);
    assert.equal(game.u.ulycn, NON_PM);
    assert.equal(game.u.uprops[DRAIN_RES].intrinsic & FROMFORM, 0);
});

test('mhitm_ad_were preserves all three source direction arms and infection order', async () => {
    // uhitm.c:4265-4293 calls physical damage for hero and monster pairs;
    // only a monster hitting the hero enters the hitmsg/gate/infection chain.
    assert.match(UHITM_C, /struct permonst \*pa = magr->data;[\s\S]*?if\s*\(magr == &gy\.youmonst\)[\s\S]*?mhitm_ad_phys\(magr, mattk, mdef, mhm\);\s*if\s*\(mhm->done\)\s*return;[\s\S]*?else if\s*\(mdef == &gy\.youmonst\)[\s\S]*?hitmsg\(magr, mattk\);[\s\S]*?!rn2\(4\)[\s\S]*?u\.ulycn == NON_PM[\s\S]*?!Protection_from_shape_changers[\s\S]*?!defends\(AD_WERE, uwep\)[\s\S]*?!mhitm_mgc_atk_negated\(magr, mdef, TRUE\)[\s\S]*?urgent_pline\("You feel feverish\."\)[\s\S]*?exercise\(A_CON, FALSE\)[\s\S]*?set_ulycn\(monsndx\(pa\)\)[\s\S]*?retouch_equipment\(2\);[\s\S]*?else\s*\{\s*\/\* mhitm \*\/[\s\S]*?mhitm_ad_phys\(magr, mattk, mdef, mhm\);/u);
    assert.match(MHITU_C, /mhitm_adtyping\(mtmp, mattk, &gy\.youmonst, &mhm\);/u);
    assert.match(UHITM_C, /mhitm_adtyping\(&gy\.youmonst, mattk, mdef, &mhm\);/u);
    assert.match(MHITM_C, /mhitm_adtyping\(magr, mattk, mdef, &mhm\);/u);

    const attackEnv = (random, events = []) => ({
        random,
        message: async (line) => { events.push(`message:${line}`); },
        urgentMessage: async (line) => { events.push(`urgent:${line}`); },
        encumberMessage: async () => { events.push('encumber'); },
        unsupported: (reason) => assert.fail(reason),
    });

    await runSegment({
        // Seed 8806411 starts a regular human hero; the adjacent rat fixtures
        // exercise the hero-to-monster physical delegation without setup RNG.
        seed: 8806411, datetime: DATETIME, nethackrc: RC, moves: '',
    });
    const rat = {
        // Synthetic m_id 93011 is distinct from every fixture and only
        // identifies this adjacent source-test defender.
        data: game.mons[PM_SEWER_RAT], m_id: 93011,
        mx: game.u.ux + 1, my: game.u.uy,
    };
    // The sentinel damage value makes the delegated physical arm observable.
    const heroBlow = { damage: 3, specialdmg: 0, done: false, hitflags: 0 };
    await mhitm_adtyping(
        game.youmonst,
        { aatyp: AT_BITE, adtyp: AD_WERE },
        rat,
        heroBlow,
        game,
        attackEnv({ rn2: () => assert.fail('hero arm draws no RNG') }),
    );
    assert.equal(heroBlow.damage, 3);
    assert.equal(heroBlow.done, false);

    await runSegment({
        // Seed 8806412 initializes the monster-pair test with no live map
        // combat; source direction dispatch is the behavior under test.
        seed: 8806412, datetime: DATETIME, nethackrc: RC, moves: '',
    });
    const werejackal = {
        // These synthetic IDs keep the monster-pair fixture identities apart.
        data: game.mons[PM_WEREJACKAL], m_id: 93012,
        mx: game.u.ux + 1, my: game.u.uy, mcan: false,
    };
    const otherRat = {
        data: game.mons[PM_SEWER_RAT], m_id: 93013,
        mx: game.u.ux - 1, my: game.u.uy, mcan: false,
    };
    game.gv.vis = false;
    const monsterBlow = { damage: 4, specialdmg: 0, done: false, hitflags: 0 };
    await mhitm_adtyping(
        werejackal,
        { aatyp: AT_BITE, adtyp: AD_WERE },
        otherRat,
        monsterBlow,
        game,
        attackEnv({ rn2: () => assert.fail('ordinary physical pair draws no RNG') }),
    );
    assert.equal(monsterBlow.damage, 4);
    assert.equal(monsterBlow.done, false);

    await runSegment({
        // Seed 8806413 starts the infection test at human form. Three fixed
        // draws pass rn2(4), avoid MC, and exercise Constitution downward.
        seed: 8806413, datetime: DATETIME, nethackrc: RC, moves: '',
    });
    game.u.ulycn = NON_PM;
    game.u.uprops[PROT_FROM_SHAPE_CHANGERS].intrinsic = 0;
    game.u.uprops[PROT_FROM_SHAPE_CHANGERS].extrinsic = 0;
    game.moves = 10; // Positive moves require exercise()'s encumber callback.
    const draws = [];
    const events = [];
    const infectionAttacker = {
        // C snapshots this werejackal form before hitmsg. The awaited test
        // callback swaps data afterward to pin that source value lifetime.
        data: game.mons[PM_WEREJACKAL], m_id: 93014,
        mx: game.u.ux + 1, my: game.u.uy, mcan: false,
    };
    const bite = { aatyp: AT_BITE, adtyp: AD_WERE };
    const infectionEnv = attackEnv({ rn2: (bound) => {
        draws.push(bound);
        if (bound === 4) return 0;
        if (bound === 10) return 9;
        if (bound === 2) return 1;
        assert.fail(`unexpected rn2(${bound})`);
    } }, events);
    infectionEnv.message = async (line) => {
        events.push(`message:${line}`);
        infectionAttacker.data = game.mons[PM_SEWER_RAT];
    };
    await mhitm_adtyping(
        infectionAttacker, bite, game.youmonst,
        { damage: 1, specialdmg: 0, done: false, hitflags: 0 },
        game,
        infectionEnv,
    );
    assert.deepEqual(draws, [4, 10, 2]);
    assert.match(events[0], /^message:.*bites!/u);
    assert.equal(events[1], 'urgent:You feel feverish.');
    assert.equal(events[2], 'encumber');
    assert.equal(infectionAttacker.data, game.mons[PM_SEWER_RAT]);
    assert.equal(game.u.ulycn, PM_WEREJACKAL);
    assert.equal(game.u.uprops[DRAIN_RES].intrinsic & FROMFORM, FROMFORM);
    assert.ok(game.unported.has('artifact.c retouch_equipment'));
});

function plysTestEnv(plan, events) {
    const draw = (method, bound) => {
        const next = plan.shift();
        assert.ok(next, 'the source made no unplanned random call');
        assert.equal(next.method, method);
        assert.equal(next.bound, bound);
        events.push(method + '(' + bound + ')');
        return next.value;
    };
    return {
        random: {
            rn2: (bound) => draw('rn2', bound),
            rnd: (bound) => draw('rnd', bound),
        },
        message: async (line) => { events.push('message:' + line); },
        unsupported: (reason) => assert.fail(reason),
    };
}

test('mhitm_ad_plys preserves the complete C branch and caller order', () => {
    const definition = UHITM_C.match(
        /void\s+mhitm_ad_plys\([\s\S]*?\n\}\n/u,
    )?.[0];
    assert.ok(definition, 'uhitm.c defines the selected whole helper');
    assert.match(definition,
        /magr == &gy\.youmonst[\s\S]*?!rn2\(3\)[\s\S]*?mhm->damage < mdef->mhp[\s\S]*?!mhitm_mgc_atk_negated/u);
    assert.match(definition,
        /else if \(mdef == &gy\.youmonst\)[\s\S]*?hitmsg\(magr, mattk\)[\s\S]*?gm\.multi >= 0 && !rn2\(3\)[\s\S]*?!mhitm_mgc_atk_negated/u);
    const heroDefender = definition.slice(
        definition.indexOf('else if (mdef == &gy.youmonst)'),
        definition.lastIndexOf('} else {'),
    );
    const sourceOrder = [
        'hitmsg(magr, mattk)',
        'gm.multi >= 0 && !rn2(3)',
        'mhitm_mgc_atk_negated',
        'Free_action',
        'gn.nomovemsg = You_can_move_again',
        'nomul(-rnd(10))',
        'dynamic_multi_reason',
        'exercise(A_DEX, FALSE)',
    ];
    let previous = -1;
    for (const token of sourceOrder) {
        const position = heroDefender.indexOf(token);
        assert.ok(position > previous, token + ' remains in the source order');
        previous = position;
    }
    assert.match(definition,
        /mdef->mcanmove && !rn2\(3\)\s*&& !mhitm_mgc_atk_negated/u);
    assert.match(definition, /gv\.vis && canspotmon\(mdef\)/u);
    assert.match(UHITM_C,
        /case AD_PLYS:\s*mhitm_ad_plys\(magr, mattk, mdef, mhm\); break;/u);
    assert.match(UHITM_C,
        /mhitm_adtyping\(&gy\.youmonst, mattk, mdef, &mhm\);/u);
    assert.match(MHITU_C,
        /mhitm_adtyping\(mtmp, mattk, &gy\.youmonst, &mhm\);/u);
    assert.match(MHITM_C,
        /mhitm_adtyping\(magr, mattk, mdef, &mhm\);/u);
    assert.match(MHITM_C,
        /paralyze_monst\(struct monst \*mon, int amt\)[\s\S]*?mon->mcanmove = 0;[\s\S]*?mon->mfrozen = amt;[\s\S]*?mon->meating = 0;[\s\S]*?mon->mstrategy &= ~STRAT_WAITFORU;/u);
    assert.match(YOU_PROP_C,
        /^#define Free_action u\.uprops\[FREE_ACTION\]\.extrinsic/mu);
});

test('mhitm_ad_plys dispatches the hero and monster-pair paralysis arms', async () => {
    // This seed starts a clean human Wizard; all attack and paralysis rolls
    // below are scripted from the C calls, not selected from the seed.
    await runSegment({
        seed: 8806521, datetime: DATETIME,
        nethackrc: petRc({ role: 'Wizard', pettype: 'none' }), moves: '',
    });
    // PM_GELATINOUS_CUBE has the source AT_TUCH/AD_PLYS hero attack; the
    // temporary form selects the real hero-attacker orientation of damageum.
    game.u.umonnum = PM_GELATINOUS_CUBE;
    game.youmonst.data = game.mons[PM_GELATINOUS_CUBE];
    const cubeAttack = game.youmonst.data.mattk[0];
    assert.equal(cubeAttack.adtyp, AD_PLYS);
    // ID 94101 separates the synthetic sewer-rat defender from game monsters.
    const heroTarget = {
        data: game.mons[PM_SEWER_RAT], m_id: 94101,
        mx: game.u.ux + 1, my: game.u.uy,
        mhp: 20, mcanmove: true, mfrozen: 0, meating: 5,
        mstrategy: STRAT_WAITFORU,
    };
    const heroEvents = [];
    const heroPlan = [
        { method: 'rn2', bound: 3, value: 0 }, // C's 1-in-3 paralysis gate admits the effect.
        { method: 'rn2', bound: 10, value: 9 }, // An unarmored rat has zero magic negation.
        { method: 'rnd', bound: 10, value: 4 }, // C stores this paralysis duration.
    ];
    const heroBlow = { damage: 3, specialdmg: 0, hitflags: 0, done: false };
    await mhitm_adtyping(
        game.youmonst, cubeAttack, heroTarget, heroBlow, game,
        plysTestEnv(heroPlan, heroEvents),
    );
    assert.deepEqual(heroPlan, []);
    assert.deepEqual(heroEvents.slice(0, 2), ['rn2(3)', 'rn2(10)']);
    assert.match(heroEvents[2], /^message:.*is frozen by you!$/u);
    assert.equal(heroEvents[3], 'rnd(10)');
    assert.equal(heroTarget.mcanmove, false);
    assert.equal(heroTarget.mfrozen, 4);
    assert.equal(heroTarget.meating, 0);
    assert.equal(heroTarget.mstrategy & STRAT_WAITFORU, 0);

    // A fresh state and distinct synthetic IDs exercise the C monster-pair
    // branch. Visibility is false, so its conditional message is suppressed.
    await runSegment({
        seed: 8806522, datetime: DATETIME,
        nethackrc: petRc({ role: 'Wizard', pettype: 'none' }), moves: '',
    });
    game.gv.vis = false;
    const pairAttacker = {
        data: game.mons[PM_GHOUL], m_id: 94102,
        mx: game.u.ux - 1, my: game.u.uy,
        mcan: false,
    };
    const pairDefender = {
        data: game.mons[PM_SEWER_RAT], m_id: 94103,
        mx: game.u.ux + 1, my: game.u.uy,
        mcan: false, mcanmove: true, mfrozen: 0, meating: 6,
        mstrategy: STRAT_WAITFORU,
    };
    const pairEvents = [];
    const pairPlan = [
        { method: 'rn2', bound: 3, value: 0 }, // Movable defender passes C's 1-in-3 gate.
        { method: 'rn2', bound: 10, value: 9 }, // The rat has no magic-cancellation gear.
        { method: 'rnd', bound: 10, value: 2 }, // C assigns the rolled frozen duration.
    ];
    await mhitm_adtyping(
        pairAttacker, pairAttacker.data.mattk[0], pairDefender,
        { damage: 1, specialdmg: 0, hitflags: 0, done: false }, game,
        plysTestEnv(pairPlan, pairEvents),
    );
    assert.deepEqual(pairPlan, []);
    assert.deepEqual(pairEvents, ['rn2(3)', 'rn2(10)', 'rnd(10)']);
    assert.equal(pairDefender.mcanmove, false);
    assert.equal(pairDefender.mfrozen, 2);
    assert.equal(pairDefender.meating, 0);
    assert.equal(pairDefender.mstrategy & STRAT_WAITFORU, 0);
});

test('mhitm_ad_plys keeps hit-before-gate, Free_action, Blind and hero timeout order',
    async () => {
        // This independent fixture seed initializes a normal human Wizard;
        // the C ghoul attack and each random answer are selected below.
        await runSegment({
            seed: 8806523, datetime: DATETIME,
            nethackrc: petRc({ role: 'Wizard', pettype: 'none' }), moves: '',
        });
        const ghoul = {
            data: game.mons[PM_GHOUL], m_id: 94104,
            mx: game.u.ux + 1, my: game.u.uy, mcan: false,
        };
        const attack = ghoul.data.mattk[0];
        assert.equal(attack.adtyp, AD_PLYS);
        game.multi = 0;
        const events = [];
        const plan = [
            { method: 'rn2', bound: 3, value: 0 }, // C admits this one-in-three chance.
            { method: 'rn2', bound: 10, value: 9 }, // No hero armor means magic negation 0.
            { method: 'rnd', bound: 10, value: 4 }, // C uses the result in nomul(-rnd(10)).
            { method: 'rn2', bound: 2, value: 1 }, // exercise(A_DEX,FALSE) applies one point.
        ];
        await mhitm_adtyping(
            ghoul, attack, game.youmonst,
            { damage: 1, specialdmg: 0, hitflags: 0, done: false }, game,
            plysTestEnv(plan, events),
        );
        assert.deepEqual(plan, []);
        assert.match(events[0], /^message:.*ghoul hits!/u);
        assert.equal(events[1], 'rn2(3)');
        assert.equal(events[2], 'rn2(10)');
        assert.match(events[3], /^message:You are frozen by the ghoul!$/u);
        assert.equal(events[4], 'rnd(10)');
        assert.equal(events[5], 'rn2(2)');
        assert.equal(game.multi, -4);
        assert.equal(game.nomovemsg, You_can_move_again);
        assert.equal(game.u.aexe[A_DEX], -1);
        assert.ok(game.unported.has('uhitm.c dynamic_multi_reason'));

        // The source Free_action macro reads only the worn extrinsic field.
        // This property value suppresses paralysis after the same two gates.
        await runSegment({
            seed: 8806524, datetime: DATETIME,
            nethackrc: petRc({ role: 'Wizard', pettype: 'none' }), moves: '',
        });
        const freeActionGhoul = {
            data: game.mons[PM_GHOUL], m_id: 94105,
            mx: game.u.ux + 1, my: game.u.uy, mcan: false,
        };
        game.u.uprops[FREE_ACTION] = { intrinsic: 0, extrinsic: 1 };
        game.multi = 0;
        const freeEvents = [];
        const freePlan = [
            { method: 'rn2', bound: 3, value: 0 }, // C reaches the status attack.
            { method: 'rn2', bound: 10, value: 9 }, // C's magic-cancellation roll succeeds.
        ];
        await mhitm_adtyping(
            freeActionGhoul, freeActionGhoul.data.mattk[0], game.youmonst,
            { damage: 1, specialdmg: 0, hitflags: 0, done: false }, game,
            plysTestEnv(freePlan, freeEvents),
        );
        assert.deepEqual(freePlan, []);
        assert.match(freeEvents[0], /^message:.*ghoul hits!/u);
        assert.deepEqual(freeEvents.slice(1), [
            'rn2(3)', 'rn2(10)', 'message:You momentarily stiffen.',
        ]);
        assert.equal(game.multi, 0);
        assert.equal(game.nomovemsg ?? null, null);
        assert.equal(game.unported.has('uhitm.c dynamic_multi_reason'), false);

        // Blind suppresses the attacker name in C's second message but leaves
        // both random gates, nomul, dynamic reason, and Dexterity exercise in order.
        await runSegment({
            seed: 8806525, datetime: DATETIME,
            nethackrc: petRc({ role: 'Wizard', pettype: 'none' }), moves: '',
        });
        const blindGhoul = {
            data: game.mons[PM_GHOUL], m_id: 94106,
            mx: game.u.ux + 1, my: game.u.uy, mcan: false,
        };
        game.u.uprops[BLINDED] = { intrinsic: TIMEOUT, extrinsic: 0 };
        game.multi = 0;
        const blindEvents = [];
        const blindPlan = [
            { method: 'rn2', bound: 3, value: 0 }, // C's paralysis chance succeeds.
            { method: 'rn2', bound: 10, value: 9 }, // The unarmored hero is not cancelled.
            { method: 'rnd', bound: 10, value: 3 }, // Duration stored by nomul.
            { method: 'rn2', bound: 2, value: 0 }, // Dexterity exercise remains source ordered.
        ];
        await mhitm_adtyping(
            blindGhoul, blindGhoul.data.mattk[0], game.youmonst,
            { damage: 1, specialdmg: 0, hitflags: 0, done: false }, game,
            plysTestEnv(blindPlan, blindEvents),
        );
        assert.deepEqual(blindPlan, []);
        assert.match(blindEvents[0], /^message:.*ghoul hits!/u);
        assert.equal(blindEvents[3], 'message:You are frozen!');
        assert.equal(blindEvents[4], 'rnd(10)');
        assert.equal(blindEvents[5], 'rn2(2)');
        assert.equal(game.multi, -3);
        assert.equal(game.nomovemsg, You_can_move_again);
    });

test('mhitm_ad_curs follows all three uhitm.c direction arms', async () => {
    assert.match(UHITM_C, /magr == &gy\.youmonst\)\s*\{\s*\/\* uhitm \*\//u);
    assert.match(UHITM_C, /mdef == &gy\.youmonst\)\s*\{\s*\/\* mhitu \*\//u);
    assert.match(UHITM_C, /\/\* mhitm \*\/\s*if\s*\(!night\(\)/u);
    assert.match(UHITM_C, /case AD_CURS: mhitm_ad_curs\(magr, mattk, mdef, mhm\); break;/u);

    await runSegment({
        seed: 8806401, datetime: DATETIME, nethackrc: RC, moves: '',
    });
    // This is the polymorphed-hero caller identity from uhitm.c. The direct
    // AD_CURS argument represents the gremlin claw's fourth attack slot.
    game.u.umonnum = PM_GREMLIN;
    game.youmonst.data = game.mons[PM_GREMLIN];
    const defender = {
        data: game.mons[PM_RAVEN],
        mcan: false,
        m_id: 93001,
        mx: game.u.ux + 1,
        my: game.u.uy,
    };
    const heroDraws = [];
    const heroMessages = [];
    const heroHit = { damage: 7, hitflags: 0, done: false };
    await mhitm_adtyping(
        game.youmonst,
        { aatyp: AT_CLAW, adtyp: AD_CURS },
        defender,
        heroHit,
        game,
        {
            random: { rn2: (bound) => {
                heroDraws.push(`rn2(${bound})`);
                return 0;
            } },
            message: async (line) => { heroMessages.push(line); },
            unsupported: (reason) => assert.fail(reason),
        },
    );
    assert.deepEqual(heroDraws, ['rn2(10)']);
    assert.equal(defender.mcan, 1);
    assert.equal(heroHit.damage, 0);
    assert.deepEqual(heroMessages, ['You chuckle.']);

    await runSegment({
        seed: 8806402, datetime: DATETIME, nethackrc: RC, moves: '',
    });
    game.u.uprops[BLINDED] = { intrinsic: TIMEOUT, extrinsic: 0 };
    game.u.uprops[FIRE_RES] = { intrinsic: INTRINSIC, extrinsic: 0 };
    const gremlin = {
        data: game.mons[PM_GREMLIN],
        female: false,
        m_id: 93002,
        mcan: false,
        mx: game.u.ux + 1,
        my: game.u.uy,
    };
    const curseAttack = gremlin.data.mattk.find(({ adtyp }) => adtyp === AD_CURS);
    assert.ok(curseAttack, 'the gremlin has the source AD_CURS attack');
    const monsterDraws = [];
    const monsterMessages = [];
    const heroHitByGremlin = { damage: 3, hitflags: 0, done: false };
    await mhitm_adtyping(
        gremlin,
        curseAttack,
        game.youmonst,
        heroHitByGremlin,
        game,
        {
            random: {
                rn2: (bound) => {
                    monsterDraws.push(`rn2(${bound})`);
                    return 0;
                },
                rnd: (bound) => {
                    monsterDraws.push(`rnd(${bound})`);
                    return 1;
                },
            },
            message: async (line) => { monsterMessages.push(line); },
            unsupported: (reason) => assert.fail(reason),
        },
    );
    assert.deepEqual(monsterDraws, ['rn2(10)', 'rnd(11)']);
    assert.equal(game.u.uprops[FIRE_RES].intrinsic, 0);
    assert.ok(gremlin.mintrinsics, 'attrcurse transfers the property to attacker');
    assert.ok(monsterMessages.some((line) => line.includes('gremlin hits')));
    assert.ok(monsterMessages.includes('You hear laughter.'));

    await runSegment({
        seed: 8806403, datetime: DATETIME, nethackrc: RC, moves: '',
    });
    game.gv.vis = false;
    const attacker = {
        data: game.mons[PM_GREMLIN],
        m_id: 93003,
        mcan: false,
        mx: game.u.ux + 1,
        my: game.u.uy,
    };
    const otherDefender = {
        data: game.mons[PM_RAVEN],
        m_id: 93004,
        mcan: false,
        mstrategy: STRAT_WAITMASK,
        mx: game.u.ux - 1,
        my: game.u.uy,
    };
    const otherDraws = [];
    const otherMessages = [];
    const monsterHit = { damage: 5, hitflags: 0, done: false };
    await mhitm_adtyping(
        attacker,
        attacker.data.mattk.find(({ adtyp }) => adtyp === AD_CURS),
        otherDefender,
        monsterHit,
        game,
        {
            random: { rn2: (bound) => {
                otherDraws.push(`rn2(${bound})`);
                return 0;
            } },
            message: async (line) => { otherMessages.push(line); },
            unsupported: (reason) => assert.fail(reason),
        },
    );
    assert.deepEqual(otherDraws, ['rn2(10)']);
    assert.equal(otherDefender.mcan, 1);
    assert.equal(otherDefender.mstrategy & STRAT_WAITFORU, 0);
    assert.ok(otherMessages.includes('You hear laughter.'));
});

test('mhitm_ad_drst preserves the poison guard and resistance arm',
    async () => {
        // uhitm.c:3126-3158. This fixture follows the mhitu arm: the shared
        // cancellation roll precedes the poison roll, and a nonzero rn2(8)
        // leaves already-rolled damage unchanged. The moccasin's AT_BITE is
        // AD_DRST, so hitmsg() supplies the same visible verb as the session.
        await runSegment({
            seed: 7710051, datetime: DATETIME, nethackrc: RC, moves: '',
        });
        // Removing inventory forces armpro 0 for this direct fixture;
        // production computes magic cancellation from real worn inventory.
        game.invent = null;
        game.gh = { hitmsg_mid: 0, hitmsg_prev: null };
        const monster = {
            data: game.mons[PM_WATER_MOCCASIN],
            m_id: 91001,
            mcan: false,
            mx: game.u.ux + 1,
            my: game.u.uy,
        };
        const attack = monster.data.mattk[0];

        const run = async (rolls) => {
            const bounds = [];
            const lines = [];
            const next = [...rolls];
            const mhm = { damage: 5 };
            await mhitm_ad_drst(
                monster, attack, game.youmonst, mhm, game,
                {
                    random: {
                        rn2: (bound) => {
                            bounds.push(`rn2(${bound})`);
                            return next.shift();
                        },
                    },
                    message: async (text) => { lines.push(text); },
                    poisoned: (reason, typ, pkiller, fatal, thrownWeapon,
                        actionEnv) => applyPoison(
                        reason,
                        typ,
                        pkiller,
                        fatal,
                        thrownWeapon,
                        game,
                        {
                            random: actionEnv.random,
                            message: async (text) => { lines.push(text); },
                            losehp: async () => {},
                            done: async () => {},
                            encumberMessage: async () => {},
                        },
                    ),
                    unsupported: (reason) => { throw new Error(reason); },
                },
            );
            return { bounds, lines, mhm };
        };

        const unaffected = await run([9, 7]);
        assert.deepEqual(unaffected.bounds, ['rn2(10)', 'rn2(8)']);
        assert.deepEqual(unaffected.lines, ['The water moccasin bites!']);
        assert.equal(unaffected.mhm.damage, 5);

        game.gh = { hitmsg_mid: 0, hitmsg_prev: null };
        game.u.uprops[POISON_RES] = { intrinsic: 1, extrinsic: 0 };
        const resisted = await run([9, 0]);
        assert.deepEqual(resisted.bounds, ['rn2(10)', 'rn2(8)']);
        assert.deepEqual(resisted.lines, [
            'The water moccasin bites!',
            "The water moccasin's bite was poisoned!",
            "The poison doesn't seem to affect you.",
        ]);
        assert.equal(resisted.mhm.damage, 5);
    });

test('mhitm_really_poison applies the monster-to-monster source arm',
    async () => {
        // uhitm.c:3098-3119. This helper is reached after mhitm_ad_drst has
        // already spent its cancellation and 1/8 gates, so this fixture pins
        // only the source helper's visible message, resistance decision, and
        // rn1(10, 6) damage addition.
        await runSegment({
            seed: 7710053, datetime: DATETIME, nethackrc: RC, moves: '',
        });
        game.invent = null;
        game.gv = { ...(game.gv ?? {}), vis: true };
        const attacker = {
            data: game.mons[PM_WATER_MOCCASIN],
            m_id: 92001,
            mx: game.u.ux + 1,
            my: game.u.uy,
            minvis: false,
            mundetected: false,
        };
        const defender = {
            data: game.mons[PM_RAVEN],
            m_id: 92002,
            mx: game.u.ux - 1,
            my: game.u.uy,
            mhp: 20,
            minvis: false,
            mundetected: false,
        };
        const attack = attacker.data.mattk.find(({ adtyp }) => adtyp === 7);
        const lines = [];
        const bounds = [];
        const mhm = { damage: 2 };
        await mhitm_really_poison(
            attacker,
            attack,
            defender,
            mhm,
            game,
            {
                random: {
                    rn1: (n, base) => {
                        bounds.push(`rn1(${n},${base})`);
                        return 6;
                    },
                },
                message: async (text) => { lines.push(text); },
            },
        );
        assert.deepEqual(bounds, ['rn1(10,6)']);
        assert.deepEqual(lines, [
            "The water moccasin's bite was poisoned!",
        ]);
        assert.equal(mhm.damage, 8);
    });

test('mhitm_ad_drst applies the hero-to-monster poison arm', async () => {
    // uhitm.c:3127-3139. This direction has its own 1/8 gate, then the
    // source's deadly rn2(10) gate and rn1(10, 6) nondeadly damage arm.
    await runSegment({
        seed: 7710054, datetime: DATETIME, nethackrc: RC, moves: '',
    });
    game.invent = null;
    game.u.uprops = {};
    const defender = {
        data: game.mons[PM_RAVEN],
        m_id: 92003,
        mx: game.u.ux + 1,
        my: game.u.uy,
        mhp: 20,
        minvis: false,
        mundetected: false,
    };
    const lines = [];
    const bounds = [];
    const mhm = { damage: 2 };
    await mhitm_ad_drst(
        game.youmonst,
        { aatyp: AT_WEAP, adtyp: AD_DRST },
        defender,
        mhm,
        game,
        {
            random: {
                rn2: (bound) => {
                    bounds.push(`rn2(${bound})`);
                    return bound === 10 && bounds.length === 1 ? 9
                        : bound === 8 ? 0 : 9;
                },
                rn1: (n, base) => {
                    bounds.push(`rn1(${n},${base})`);
                    return 6;
                },
            },
            message: async (text) => { lines.push(text); },
        },
    );
    assert.deepEqual(bounds, ['rn2(10)', 'rn2(8)', 'rn2(10)', 'rn1(10,6)']);
    assert.deepEqual(lines, ['Your attack was poisoned!']);
    assert.equal(mhm.damage, 8);
});

test('mhitm_ad_ston preserves each source direction and gate draws',
    async () => {
    // uhitm.c:4203-4263. The monster-to-hero arm spends the 1/3 gate and
    // then the 1/10 petrification gate; starting petrification marks the
    // blow handled without changing its already-computed damage.
    await runSegment({
        seed: 7710057, datetime: DATETIME, nethackrc: RC, moves: '',
    });
    game.invent = null;
    game.gh = { hitmsg_mid: 0, hitmsg_prev: null };
    const attacker = {
        data: game.mons[PM_COCKATRICE],
        female: false,
        m_id: 92005,
        mcan: false,
        mx: game.u.ux + 1,
        my: game.u.uy,
    };
    const attack = attacker.data.mattk.find(({ adtyp }) => adtyp === AD_STON);
    const bounds = [];
    const lines = [];
    const mhm = { damage: 4, hitflags: 0, done: false };
    await mhitm_ad_ston(
        attacker,
        attack,
        game.youmonst,
        mhm,
        game,
        {
            random: {
                rn2: (bound) => {
                    bounds.push(`rn2(${bound})`);
                    return 0;
                },
            },
            message: async (text) => { lines.push(text); },
        },
    );
    assert.deepEqual(bounds, ['rn2(3)', 'rn2(10)']);
    assert.deepEqual(lines, ['The cockatrice touches you!']);
    assert.equal(mhm.damage, 4);
    assert.equal(mhm.hitflags, M_ATTK_HIT);
    assert.equal(mhm.done, true);
    assert.ok(game.unported.has('potion.c make_stoned'));

    // In the hero-to-monster direction C always clears damage after the
    // source munstone() result, even when the discarded minstapetrify() arm
    // remains unported. This path consumes no attack RNG.
    await runSegment({
        seed: 7710058, datetime: DATETIME, nethackrc: RC, moves: '',
    });
    const defender = {
        data: game.mons[PM_RAVEN],
        m_id: 92006,
        mcan: false,
        mx: game.u.ux + 1,
        my: game.u.uy,
        mhp: 20,
        mhpmax: 20,
        minvent: null,
        mstrategy: 0,
    };
    const reverse = { damage: 7, hitflags: 0, done: false };
    await mhitm_ad_ston(
        game.youmonst,
        { aatyp: AT_WEAP, adtyp: AD_STON, damn: 0, damd: 0 },
        defender,
        reverse,
        game,
        { message: async () => {} },
    );
    assert.equal(reverse.damage, 0);
    assert.equal(reverse.done, false);
    assert.ok(game.unported.has('trap.c minstapetrify'));
});

test('mhitm_ad_phys handles a petrifying corpse weapon before ordinary damage',
    async () => {
    // uhitm.c:4047-4059. The corpse arm establishes one point of damage,
    // reports the attack, then lets do_stone_u() consume the blow through the
    // mhm.done/hitflags result. This source path must not be rejected as an
    // ordinary non-weapon or artifact continuation.
    await runSegment({
        seed: 7710059, datetime: DATETIME, nethackrc: RC, moves: '',
    });
    game.invent = null;
    game.u.uprops[STONE_RES] = { intrinsic: 0, extrinsic: 0 };
    game.u.uprops[STONED] = { intrinsic: 0, extrinsic: 0 };
    const attacker = {
        data: game.mons[PM_COCKATRICE],
        female: false,
        m_id: 92007,
        mcan: false,
        mx: game.u.ux + 1,
        my: game.u.uy,
        mw: {
            otyp: CORPSE,
            corpsenm: PM_COCKATRICE,
            oclass: 0,
        },
    };
    const lines = [];
    const mhm = { damage: 0, hitflags: 0, done: false };
    await mhitm_ad_phys(
        attacker,
        { aatyp: AT_WEAP },
        game.youmonst,
        mhm,
        game,
        {
            message: async (line) => { lines.push(line); },
            unsupported: (reason) => { throw new Error(reason); },
        },
    );
    assert.equal(mhm.damage, 1);
    assert.equal(mhm.hitflags, M_ATTK_HIT);
    assert.equal(mhm.done, true);
    assert.deepEqual(lines, [
        'The cockatrice hits you with the cockatrice corpse.',
    ]);
    assert.ok(game.unported.has('potion.c make_stoned'));
});

test('mhitm_ad_phys continues a petrifying corpse after do_stone_u declines',
    async () => {
    // C uhitm.c:4047-4061 does not return when do_stone_u() returns false:
    // resistance, an existing Stoned timeout, and successful conversion to a
    // stone golem all continue through dmgval() and hitmsg().  The corpse is
    // FOOD_CLASS, so this also pins the exception to the generic non-weapon
    // guard rather than admitting unrelated food objects.
    async function corpseAttack(configure) {
        await runSegment({
            seed: 7710060, datetime: DATETIME, nethackrc: RC, moves: '',
        });
        game.invent = null;
        for (const slot of ['uarm', 'uarmc', 'uarmh', 'uarms',
            'uarmg', 'uarmf', 'uarmu', 'uwep', 'uswapwep'])
            game[slot] = null;
        game.u.uprops[STONE_RES] = { intrinsic: 0, extrinsic: 0 };
        game.u.uprops[STONED] = { intrinsic: 0, extrinsic: 0 };
        const attacker = {
            data: game.mons[PM_COCKATRICE],
            female: false,
            m_id: 92008,
            mcan: false,
            mx: game.u.ux + 1,
            my: game.u.uy,
            mw: mksobj(CORPSE, false, false, { state: game }),
        };
        attacker.mw.corpsenm = PM_COCKATRICE;
        configure?.(game, attacker);
        const lines = [];
        const draws = [];
        const mhm = { damage: 0, hitflags: 0, done: false };
        await mhitm_ad_phys(
            attacker,
            { aatyp: AT_WEAP },
            game.youmonst,
            mhm,
            game,
            {
                random: {
                    rn2: (bound) => {
                        draws.push(`rn2(${bound})`);
                        return 1;
                    },
                    rn1: (range, base) => {
                        draws.push(`rn1(${range},${base})`);
                        return base;
                    },
                    rnd: (bound) => {
                        draws.push(`rnd(${bound})`);
                        return 1;
                    },
                    d: (number, sides) => {
                        draws.push(`d(${number},${sides})`);
                        return number;
                    },
                },
                message: async (line) => { lines.push(line); },
                unsupported: (reason) => { throw new Error(reason); },
            },
        );
        return { mhm, lines, draws, form: game.youmonst.data.pmidx };
    }

    const resistant = await corpseAttack((state) => {
        state.u.uprops[STONE_RES].intrinsic = 1;
    });
    assert.deepEqual(resistant, {
        mhm: { damage: 1, hitflags: M_ATTK_HIT, done: false },
        lines: [
            'The cockatrice hits you with the cockatrice corpse.',
            'The cockatrice hits!',
        ],
        draws: [],
        form: PM_TOURIST,
    });

    const alreadyStoned = await corpseAttack((state) => {
        state.u.uprops[STONED].intrinsic = TIMEOUT;
    });
    assert.deepEqual(alreadyStoned, {
        mhm: { damage: 1, hitflags: M_ATTK_HIT, done: false },
        lines: [
            'The cockatrice hits you with the cockatrice corpse.',
            'The cockatrice hits!',
        ],
        draws: [],
        form: PM_TOURIST,
    });

    const golem = await corpseAttack((state) => {
        // poly_when_stoned() sees the current golem form and polymon() owns
        // the successful PM_STONE_GOLEM transition.
        state.youmonst.data = state.mons[PM_IRON_GOLEM];
    });
    assert.deepEqual(golem, {
        mhm: { damage: 1, hitflags: M_ATTK_HIT, done: false },
        lines: [
            'The cockatrice hits you with the cockatrice corpse.',
            'You turn into a stone golem!',
            'The cockatrice hits!',
        ],
        draws: ['rn2(2)', 'rn2(19)', 'rn1(500,500)'],
        form: PM_STONE_GOLEM,
    });
});

test('mhitm_ad_drst uses the monster female bit for the poison killer name',
    async () => {
    // uhitm.c:3159-3161 and monst.h Mgender(). This is a monster-to-hero
    // poison call, so Mgender reads the attacker instance's female bit rather
    // than the species record or the hero's gender.
    await runSegment({
        seed: 7710055, datetime: DATETIME, nethackrc: RC, moves: '',
    });
    const attacker = {
        data: game.mons[PM_DWARF_LEADER],
        female: true,
        m_id: 92004,
        mcan: false,
        mx: game.u.ux + 1,
        my: game.u.uy,
    };
    const killerNames = [];
    const bounds = [];
    await mhitm_ad_drst(
        attacker,
        { aatyp: AT_WEAP, adtyp: AD_DRST },
        game.youmonst,
        { damage: 1 },
        game,
        {
            random: {
                rn2: (bound) => {
                    bounds.push(`rn2(${bound})`);
                    return bound === 10 ? 9 : 0;
                },
            },
            message: async () => {},
            poisoned: (_reason, _attribute, pkiller) => {
                killerNames.push(pkiller);
            },
        },
    );
    assert.deepEqual(bounds, ['rn2(10)', 'rn2(8)']);
    assert.deepEqual(killerNames, ['dwarf lady']);
});

test('mhitm_mgc_atk_negated does not message a merely sensed defender',
    async () => {
    // uhitm.c:93 uses canseemon(), while canspotmon() also accepts detection
    // and telepathy. A hidden defender with Detect_monsters is sensed but not
    // physically seen, so the negation message must remain absent.
    await runSegment({
        seed: 7710056, datetime: DATETIME, nethackrc: RC, moves: '',
    });
    game.gv = { ...(game.gv ?? {}), vis: true };
    game.u.uprops[DETECT_MONSTERS] = { intrinsic: 1, extrinsic: 0 };
    const defender = {
        data: game.mons[PM_HUMAN],
        minvent: { otyp: LEATHER_ARMOR, owornmask: W_ARM, nobj: null },
        minvis: true,
        mundetected: false,
        mx: game.u.ux + 1,
        my: game.u.uy,
    };
    const lines = [];
    const bounds = [];
    const negated = await mhitm_mgc_atk_negated(
        { mcan: false },
        defender,
        true,
        game,
        {
            random: {
                rn2: (bound) => {
                    bounds.push(`rn2(${bound})`);
                    return 0;
                },
            },
            message: async (line) => { lines.push(line); },
        },
    );
    assert.deepEqual(bounds, ['rn2(10)']);
    assert.equal(negated, true);
    assert.deepEqual(lines, []);
});
