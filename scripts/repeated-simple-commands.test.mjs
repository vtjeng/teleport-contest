import assert from 'node:assert/strict';
import test from 'node:test';

import { moveloop_core } from '../js/allmain.js';
import { DOOR } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { m_at } from '../js/monst.js';
import {
    loadRepeatedSimpleCommandsRecipe,
} from './run-repeated-simple-commands.mjs';

function topLine() {
    return game.nhDisplay.grid[0]
        .map(({ ch }) => ch).join('').trimEnd();
}

function startingPet() {
    let pet = game.level.monlist;
    while (pet && pet.m_id !== game.context.startingpet_mid)
        pet = pet.nmon;
    return pet;
}

function assertSinglePetIdentity(pet) {
    assert.equal(m_at(pet.mx, pet.my, game), pet);
    assert.equal(m_at(game.u.ux, game.u.uy, game), null);
    assert.equal(
        game.level.monsters.flat()
            .filter((monster) => monster === pet).length,
        1,
    );
    let listCount = 0;
    for (let monster = game.level.monlist;
        monster;
        monster = monster.nmon) {
        if (monster === pet) ++listCount;
    }
    assert.equal(listCount, 1);
}

test('repeated-simple-command matrix contains only source-selected inputs',
    () => {
        const recipe = loadRepeatedSimpleCommandsRecipe();
        assert.equal(recipe.version, 5);
        assert.equal(recipe.segments.length, 17);
        assert.deepEqual(
            recipe.segments.map(({ moves }) => moves.length),
            [250, 600, 600, 851, 12, 4, 12, 1, 5, 1, 1, 2, 2, 2, 2, 1, 4],
        );
        assert.deepEqual(
            recipe.segments.map(({ moves }) => new Set(moves)),
            [
                new Set(['.']),
                new Set(['.']),
                new Set(['.']),
                new Set(['.']),
                new Set(['h']),
                new Set(['h']),
                new Set(['h', 'j', 'k', 'l']),
                new Set(['l']),
                new Set(['y', '.']),
                new Set(['h']),
                new Set(['h']),
                new Set(['l', ' ']),
                // Three stair cases: step off the upstairs and back onto it.
                new Set(['l', 'h']),
                new Set(['l', 'h']),
                new Set(['l', 'h']),
                // Doorless and open doorway cases.
                new Set(['h']),
                new Set(['l', 'j']),
            ],
        );
        for (const segment of recipe.segments) {
            assert.equal(Object.hasOwn(segment, 'steps'), false);
            assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        }
    });

test('repeated-simple-command cases retain their source branch markers',
    async () => {
        const { segments } = loadRepeatedSimpleCommandsRecipe();

        await runSegment({
            ...segments[0],
            // The 141st elapsed wait is the source-selected doorway move
            // inside the longer checked-in segment.
            moves: '.'.repeat(141),
        });
        const doorwayMonster = game.level.monlist;
        assert.ok(doorwayMonster && !doorwayMonster.nmon);
        const doorway = game.level.at(
            doorwayMonster.mx,
            doorwayMonster.my,
        );
        assert.equal(doorway.typ, DOOR);
        assert.equal(doorway.doormask || doorway.flags, 0);

        const runtime = await runSegment(segments[0]);
        const runtimeSlices = runtime.getRngSlices();
        assert.equal(game._commandDispatchCount, 250);
        assert.equal(game.moves, 171);
        assert.equal(runtimeSlices[74][0], 'rn2(70)=0');
        assert.ok(
            runtimeSlices.slice(171).every((slice) => slice.length === 0),
            'the final 80 safe waits consume no PRNG',
        );

        const move600 = await runSegment(segments[1]);
        assert.equal(game._commandDispatchCount, 600);
        assert.equal(game.moves, 601);
        assert.ok(game.context.next_attrib_check > 600);
        assert.equal(move600.getRngSlices().length, 601);

        await runSegment(segments[2]);
        assert.equal(game.moves, 601);
        assert.equal(game.u.uluck, 1);

        await runSegment(segments[3]);
        assert.equal(game.u.uhunger, 49);
        assert.equal(game.u.uhs, 3);
        assert.equal(game.u.atemp[0], -1);
        assert.equal(
            game.nhDisplay.toplines,
            'You are beginning to feel weak.',
        );

        const wallWithMessage = await runSegment(segments[4]);
        assert.equal(topLine(), "It's a wall.");
        assert.ok(
            wallWithMessage.getRngSlices().slice(1)
                .every((slice) => slice.length === 0),
        );

        const silentWall = await runSegment(segments[5]);
        assert.equal(topLine(), '');
        assert.ok(
            silentWall.getRngSlices().slice(1)
                .every((slice) => slice.length === 0),
        );

        await runSegment({ ...segments[6], moves: '' });
        const walkStart = [game.u.ux, game.u.uy];
        const repeatedWalk = await runSegment(segments[6]);
        assert.equal(game._commandDispatchCount, 12);
        assert.deepEqual(
            [game.u.ux, game.u.uy],
            [walkStart[0] - 1, walkStart[1] + 1],
        );
        assert.equal(repeatedWalk.getRngSlices().length, 13);

        const petSwap = await runSegment(segments[7]);
        const swappedPet = startingPet();
        assert.ok(swappedPet);
        assert.equal(topLine(), 'You swap places with your kitten.');
        assert.equal(petSwap.getRngSlices()[1][0], 'rn2(7)=6');
        assert.deepEqual(
            [swappedPet.mx, swappedPet.my],
            [game.u.ux - 1, game.u.uy],
        );
        assertSinglePetIdentity(swappedPet);
        game.nhDisplay.pushKey('.'.charCodeAt(0));
        await moveloop_core();
        assertSinglePetIdentity(swappedPet);

        await runSegment({ ...segments[8], moves: '' });
        const immediatePet = startingPet();
        assert.ok(immediatePet);
        const collisionStart = [game.u.ux, game.u.uy];
        const petStart = [immediatePet.mx, immediatePet.my];
        game.nhDisplay.pushKey('y'.charCodeAt(0));
        await moveloop_core();
        assert.equal(
            game._pending_message,
            'You stop.  Your kitten is in the way!',
        );
        assert.deepEqual([game.u.ux, game.u.uy], collisionStart);
        assert.deepEqual([immediatePet.mx, immediatePet.my], petStart);
        assert.equal(game.context.move, 1);
        assert.equal(immediatePet.mflee, true);
        assert.equal(immediatePet.mfleetim, 3);
        assertSinglePetIdentity(immediatePet);

        game.nhDisplay.pushKey('y'.charCodeAt(0));
        await moveloop_core();
        assert.equal(
            game._pending_message,
            'You swap places with your kitten.',
        );
        assert.deepEqual(
            [game.u.ux, game.u.uy],
            [collisionStart[0] - 1, collisionStart[1] - 1],
        );
        assert.deepEqual(
            [immediatePet.mx, immediatePet.my],
            collisionStart,
        );
        assert.equal(m_at(immediatePet.mx, immediatePet.my, game), immediatePet);
        assert.equal(m_at(game.u.ux, game.u.uy, game), null);
        assert.equal(game.context.move, 1);
        assert.equal(immediatePet.mflee, true);
        assert.equal(immediatePet.mfleetim, 2);
        assertSinglePetIdentity(immediatePet);

        const petRefusal = await runSegment(segments[8]);
        const refusedPet = startingPet();
        assert.ok(refusedPet);
        assert.deepEqual(
            petRefusal.getRngSlices()[1].slice(0, 2),
            ['rn2(7)=0', 'rnd(6)=3'],
        );
        assert.equal(petRefusal.getRngSlices()[2][0], 'rn2(7)=1');
        assert.equal(refusedPet.mflee, false);
        assert.equal(refusedPet.mfleetim, 0);

        await runSegment(segments[9]);
        assert.equal(topLine(), 'You see here 5 gold pieces.');
        const object = game.level.objects[game.u.ux][game.u.uy];
        assert.ok(object);
        assert.equal(object.quan, 5);

        await runSegment(segments[10]);
        assert.equal(topLine(), "(west): It's a wall.");
        const feltWall = game.level.at(game.u.ux - 1, game.u.uy);
        assert.notEqual(feltWall.seenv, 0);
        assert.ok(feltWall.remembered_glyph);

        await runSegment(segments[11]);
        assert.equal(topLine(), 'You feel here 2 gold pieces.');
        const feltObject = game.level.objects[game.u.ux][game.u.uy];
        assert.ok(feltObject);
        assert.equal(feltObject.quan, 2);
    });
