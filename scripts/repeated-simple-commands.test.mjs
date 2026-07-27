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

test('repeated-simple-command matrix contains only source-selected inputs',
    () => {
        const recipe = loadRepeatedSimpleCommandsRecipe();
        assert.equal(recipe.version, 5);
        assert.equal(recipe.segments.length, 6);
        assert.deepEqual(
            recipe.segments.map(({ moves }) => moves.length),
            [250, 12, 4, 1, 5, 1],
        );
        assert.deepEqual(
            recipe.segments.map(({ moves }) => new Set(moves)),
            [
                new Set(['.']),
                new Set(['h']),
                new Set(['h']),
                new Set(['l']),
                new Set(['y', '.']),
                new Set(['h']),
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
        const wallWithMessage = await runSegment(segments[1]);
        assert.equal(topLine(), "It's a wall.");
        assert.ok(
            wallWithMessage.getRngSlices().slice(1)
                .every((slice) => slice.length === 0),
        );

        const silentWall = await runSegment(segments[2]);
        assert.equal(topLine(), '');
        assert.ok(
            silentWall.getRngSlices().slice(1)
                .every((slice) => slice.length === 0),
        );

        const petSwap = await runSegment(segments[3]);
        const swappedPet = startingPet();
        assert.ok(swappedPet);
        assert.equal(topLine(), 'You swap places with your kitten.');
        assert.equal(petSwap.getRngSlices()[1][0], 'rn2(7)=6');
        assert.deepEqual(
            [swappedPet.mx, swappedPet.my],
            [game.u.ux - 1, game.u.uy],
        );
        const assertSinglePetIdentity = () => {
            assert.equal(m_at(swappedPet.mx, swappedPet.my, game), swappedPet);
            assert.equal(m_at(game.u.ux, game.u.uy, game), null);
            assert.equal(
                game.level.monsters.flat()
                    .filter((monster) => monster === swappedPet).length,
                1,
            );
            let listCount = 0;
            for (let monster = game.level.monlist;
                monster;
                monster = monster.nmon) {
                if (monster === swappedPet) ++listCount;
            }
            assert.equal(listCount, 1);
        };
        assertSinglePetIdentity();
        game.nhDisplay.pushKey('.'.charCodeAt(0));
        await moveloop_core();
        assertSinglePetIdentity();

        const petRefusal = await runSegment(segments[4]);
        const refusedPet = startingPet();
        assert.ok(refusedPet);
        assert.deepEqual(
            petRefusal.getRngSlices()[1].slice(0, 2),
            ['rn2(7)=0', 'rnd(6)=3'],
        );
        assert.equal(petRefusal.getRngSlices()[2][0], 'rn2(40)=5');
        assert.equal(refusedPet.mflee, false);
        assert.equal(refusedPet.mfleetim, 0);

        await runSegment(segments[5]);
        assert.equal(topLine(), 'You see here 5 gold pieces.');
        const object = game.level.objects[game.u.ux][game.u.uy];
        assert.ok(object);
        assert.equal(object.quan, 5);
    });
