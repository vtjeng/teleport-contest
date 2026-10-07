#!/usr/bin/env node
// Seeds and date were fixed before C recording without a scan. The second
// role removes the organic stack while preserving the debug command entry.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { OBJ_BURIED, ROT_ORGANIC } from '../js/const.js';
import { APPLE, BOULDER, FOOD_RATION, LEASH, WEAPON_CLASS } from '../js/objects.js';
import { peek_timer } from '../js/timeout.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const cases = [
    'burial-wizbury-organic',
    'burial-wizbury-weapon',
    'burial-required-unleash-eaten-leash',
    'burial-boulder-hole-earth',
].map(name => ({ name, recipe: JSON.parse(readFileSync(new URL(
    '../recipes/dig.c/' + name + '.session.json', import.meta.url))) }));

async function verifyBurial(segment) {
    await runSegment(segment);
    if (segment.nethackrc.includes('name:LeashUnlink')) {
        for (let obj = game.invent; obj; obj = obj.nobj)
            assert.notEqual(obj.otyp, LEASH, 'eatspecial consumes the attached leash');
        let pet;
        for (let monster = game.level.monlist; monster; monster = monster.nmon) {
            if (monster.mtame) pet = monster;
            assert.ok(!monster.mleashed, 'o_unleash clears the monster attachment');
        }
        assert.ok(pet, 'the independently attached starting dog remains alive and tame');
        return;
    }
    const pile = game.level.objects[game.u.ux][game.u.uy];
    assert.equal(pile, null, 'wizbury removes the entire ordinary floor pile');
    const buried = [];
    for (let obj = game.level.buriedobjlist; obj; obj = obj.nobj) buried.push(obj);
    if (segment.nethackrc.includes('name:BoulderBurial')) {
        const apples = buried.find(obj => obj.otyp === APPLE);
        assert.ok(apples, 'the earth boulder buries the apples dropped over the hole');
        assert.equal(apples.quan, 11); // u_init.c Knight kit: eleven apples.
        assert.ok(!buried.some(obj => obj.otyp === BOULDER),
            'do.c:flooreffects consumes the boulder that fills the hole');
        assert.equal(game.level.traps?.some(trap => trap.tx === game.u.ux
            && trap.ty === game.u.uy) ?? false, false, 'the filled hole is removed');
        assert.ok(peek_timer(ROT_ORGANIC, apples, game) > game.moves,
            'dig.c:bury_an_obj schedules organic rot for the buried apples');
    } else if (segment.nethackrc.includes('role:Archeologist')) {
        const food = buried.find(obj => obj.otyp === FOOD_RATION);
        assert.ok(food, 'the dropped starting food stack is buried');
        assert.equal(food.where, OBJ_BURIED);
        assert.equal(food.quan, 3); // u_init.c Archeologist kit: three food rations.
        const deadline = peek_timer(ROT_ORGANIC, food, game);
        assert.ok(deadline > game.moves + 250 && deadline <= game.moves + 500,
            'dig.c:2038 starts organic rot at 250 + rnd(250)');
    } else {
        const weapon = buried.find(obj => obj.oclass === WEAPON_CLASS && obj.invlet === 'a');
        assert.ok(weapon, 'the starting weapon joins the buried chain');
        assert.equal(weapon.quan, 1); // u_init.c Barbarian kit: one starting weapon in a.
        assert.equal(peek_timer(ROT_ORGANIC, weapon, game), 0,
            'the Barbarian starting weapon is metal, so it has no organic timer');
    }
}

export async function runBurialMatrix() {
    return runFreshMatrix({
        entries: cases.map(c => ({ label: c.name, recipe: c.recipe })),
        summaryLabel: 'OBJECT BURIAL',
        verifySegment: verifyBurial,
        chunkLimit: 1, // Debug termination saves; each case requires a fresh game.
    });
}
runMatrixCli(import.meta.url, runBurialMatrix, 'object burial');
