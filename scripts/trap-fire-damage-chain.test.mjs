import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { BLINDED, OBJ_DELETED, OBJ_FREE } from '../js/const.js';
import { SCR_BLANK_PAPER, SCR_FIRE } from '../js/objects.js';
import { game } from '../js/gstate.js';
import { mksobj, place_object } from '../js/obj.js';
import { runSegment } from '../js/jsmain.js';
import { fire_damage_chain } from '../js/trap.js';
import { couldsee } from '../js/vision.js';

const STARTUP_INPUT = {
    seed: 92173011,
    datetime: '20510423091500',
    nethackrc: [
        'OPTIONS=name:FireChain,role:Wizard,race:human,gender:female,align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen,symset:DECgraphics',
        '',
    ].join('\n'),
    moves: '',
};

test('fire_damage_chain preserves trap.c traversal, count, position and caller sites',
    async () => {
        const source = await readFile(
            new URL('../nethack-c/upstream/src/trap.c', import.meta.url),
            'utf8',
        );
        const start = source.indexOf('fire_damage_chain(\n    struct obj *chain,');
        const end = source.indexOf('\n}\n', start);
        const body = start < 0 || end < 0 ? '' : source.slice(start, end + 3);
        assert.ok(body, 'trap.c:fire_damage_chain must be present');
        assert.match(body, /gb\.bhitpos\.x = x, gb\.bhitpos\.y = y;/u);
        assert.match(body, /nobj = here \? obj->nexthere : obj->nobj;/u);
        assert.match(body, /if \(fire_damage\(obj, force, x, y\)\)\s*\+\+num;/u);
        assert.match(body, /if \(num && \(Blind && !couldsee\(x, y\)\)\)/u);
        assert.match(body, /return num;/u);

        const callers = await Promise.all([
            ['dig.c', /fire_damage_chain\(objchain, TRUE, TRUE, x, y\);/u],
            ['mon.c', /fire_damage_chain\(mtmp->minvent, FALSE, FALSE,/u],
            ['objnam.c', /fire_damage_chain\(svl\.level\.objects\[x\]\[y\], TRUE, TRUE, x, y\);/u],
        ].map(async ([file, pattern]) => {
            const callerSource = await readFile(
                new URL(`../nethack-c/upstream/src/${file}`, import.meta.url),
                'utf8',
            );
            assert.match(callerSource, pattern, `${file} source caller`);
            return file;
        }));
        assert.deepEqual(callers, ['dig.c', 'mon.c', 'objnam.c']);
    });

test('fire_damage_chain saves each floor successor before deleting scrolls', async () => {
    await runSegment(STARTUP_INPUT);
    const state = game;
    const x = state.u.ux;
    const y = state.u.uy;
    const first = mksobj(SCR_BLANK_PAPER, false, false, { state });
    const second = mksobj(SCR_BLANK_PAPER, false, false, { state });
    place_object(first, x, y, { state });
    place_object(second, x, y, { state });

    const messages = [];
    const draws = [];
    const result = await fire_damage_chain(
        state.level.objects[x][y],
        true,
        true,
        x,
        y,
        {
            state,
            random: {
                rn2: (bound) => {
                    draws.push(bound);
                    return 99;
                },
            },
            message: async (line) => messages.push(line),
        },
    );

    assert.equal(result, 2);
    assert.equal(first.where, OBJ_DELETED);
    assert.equal(second.where, OBJ_DELETED);
    assert.equal(state.level.objects[x][y], null);
    assert.deepEqual(state.gb.bhitpos, { x, y });
    assert.deepEqual(draws, [100, 100]);
    assert.equal(messages.length, 2);
    assert.ok(messages.every((line) => line.includes('catches fire and burns')));

    const fireScroll = mksobj(SCR_FIRE, false, false, { state });
    const inventoryScroll = mksobj(SCR_BLANK_PAPER, false, false, { state });
    const wrongFloorLink = mksobj(SCR_BLANK_PAPER, false, false, { state });
    fireScroll.nobj = inventoryScroll;
    fireScroll.nexthere = wrongFloorLink;
    const inventoryDraws = [];
    const inventoryResult = await fire_damage_chain(
        fireScroll,
        true,
        false,
        x,
        y,
        {
            state,
            random: {
                rn2: (bound) => {
                    inventoryDraws.push(bound);
                    return 99;
                },
            },
            message: async () => {},
        },
    );

    assert.equal(inventoryResult, 1);
    assert.equal(fireScroll.where, OBJ_FREE);
    assert.equal(inventoryScroll.where, OBJ_DELETED);
    assert.equal(wrongFloorLink.where, OBJ_FREE);
    assert.deepEqual(inventoryDraws, [100]);

    assert.equal(await fire_damage_chain(null, false, false, x + 1, y, {
        state,
        random: { rn2: () => assert.fail('an empty chain draws no RNG') },
        message: async () => assert.fail('an empty chain emits no smoke'),
    }), 0);
    assert.deepEqual(state.gb.bhitpos, { x: x + 1, y });

    const blindness = state.u.uprops[BLINDED];
    const savedBlindness = { ...blindness };
    blindness.intrinsic = 1;
    const unseenX = 70;
    const unseenY = 10;
    assert.equal(couldsee(unseenX, unseenY, state), false);
    const unseenScroll = mksobj(SCR_BLANK_PAPER, false, false, { state });
    place_object(unseenScroll, unseenX, unseenY, { state });
    const unseenMessages = [];
    await fire_damage_chain(
        state.level.objects[unseenX][unseenY],
        true,
        true,
        unseenX,
        unseenY,
        {
            state,
            random: { rn2: () => 99 },
            message: async (line) => unseenMessages.push(line),
        },
    );
    assert.deepEqual(unseenMessages, ['You smell smoke.']);
    Object.assign(blindness, savedBlindness);
});
