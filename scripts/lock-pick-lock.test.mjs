import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { acurr } from '../js/attrib.js';
import { A_DEX, AUTOUNLOCK_APPLY_KEY, AUTOUNLOCK_UNTRAP, DOOR, D_LOCKED, M_AP_FURNITURE } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { pick_lock, reset_pick } from '../js/lock.js';
import { newMonster } from '../js/monst.js';
import { M1_NOHANDS, PM_SMALL_MIMIC } from '../js/monsters.js';
import { newObject, place_object } from '../js/obj.js';
import { objectGenerationEnv } from '../js/object_generation.js';
import { CHEST, CREDIT_CARD, LOCK_PICK, SKELETON_KEY, TOOL_CLASS } from '../js/objects.js';
import { S_hcdoor, S_vcdoor } from '../js/symbols.js';

async function setup() {
    // Independent container recipe startup; no recorded answers are supplied.
    const recipe = JSON.parse(fs.readFileSync(new URL('../recipes/lock.c/pick-lock-container-auto-b134.session.json', import.meta.url)));
    await runSegment({ ...recipe.segments[0], moves: '' });
    reset_pick(game);
    game.flags.autounlock = AUTOUNLOCK_APPLY_KEY;
    const messages = [];
    const prompts = [];
    const env = {
        message: async text => { messages.push(text); },
        ynq: async query => { prompts.push(query); return 'y'.charCodeAt(0); },
    };
    return { messages, prompts, env };
}

test('pick_lock pins both chance tables and cursed integer division to lock.c', async () => {
    // lock.c:512-526 and 630-642 distinguish container and door multipliers.
    // Every tool is ordinary; the Rogue adds its source role bonus. An odd
    // skeleton-key chance demonstrates truncation for a cursed container.
    for (const [otyp, boxMultiplier, boxBonus, doorMultiplier, doorBonus] of [
        [CREDIT_CARD, 1, 20, 2, 20],
        [LOCK_PICK, 4, 25, 3, 30],
        [SKELETON_KEY, 1, 75, 1, 70],
    ]) {
        for (const cursed of [false, true]) {
            const { env } = await setup();
            const pick = newObject({ otyp, oclass: TOOL_CLASS, quan: 1 });
            const box = newObject({ otyp: CHEST, quan: 1, olocked: 1, cursed });
            place_object(box, game.u.ux, game.u.uy, objectGenerationEnv({ state: game }));
            const dex = acurr(game, A_DEX);
            assert.equal(await pick_lock(pick, game.u.ux, game.u.uy, box, game, env), 1);
            assert.equal(game.xlock.chance, Math.trunc((boxMultiplier * dex + boxBonus) / (cursed ? 2 : 1)));
            assert.equal(game.xlock.box, box);
            assert.equal(game.xlock.door, null);
            assert.equal(game.context.move, 0);
            assert.equal(game.xlock.usedtime, 0);
            assert.equal(typeof game.go.occupation, 'function');
        }
        const { env } = await setup();
        const x = game.u.ux + 1; // Adjacent east square is constructed as a door.
        const y = game.u.uy;
        game.level.monsters[x][y] = null;
        const door = game.level.at(x, y);
        door.typ = DOOR;
        door.doormask = door.flags = D_LOCKED;
        const dex = acurr(game, A_DEX);
        assert.equal(await pick_lock(newObject({ otyp, oclass: TOOL_CLASS, quan: 1 }), x, y, null, game, env), 1);
        assert.equal(game.xlock.chance, doorMultiplier * dex + doorBonus);
        assert.equal(game.xlock.door, door);
        assert.equal(game.xlock.box, null);
    }
});

test('pick_lock resumes without resetting time and clears a no-hands attempt', async () => {
    const { env, messages } = await setup();
    // lock.c:380-402: nonzero usedtime and matching picktyp resume the same
    // occupation before direction, tool validity or floor selection.
    const pick = newObject({ otyp: LOCK_PICK });
    game.xlock.usedtime = 7; // Interrupted after seven occupation turns.
    game.xlock.picktyp = LOCK_PICK;
    assert.equal(await pick_lock(pick, 0, 0, null, game, env), 1);
    assert.equal(game.xlock.usedtime, 7);
    assert.equal(messages.pop(), 'You resume your attempt at picking the lock.');
    game.youmonst.data = { ...game.youmonst.data, mflags1: M1_NOHANDS };
    assert.equal(await pick_lock(pick, 0, 0, null, game, env), -1);
    assert.equal(messages.pop(), 'Unfortunately, you can no longer hold the pick.');
    assert.equal(game.xlock.usedtime, 0);
    assert.equal(game.xlock.box, null);
    assert.equal(game.xlock.door, null);
});

test('pick_lock dummy tool stops before an apply-key prompt when trap is known absent', async () => {
    const { env, prompts } = await setup();
    // lock.c:470-491: known untrapped boxes skip the untrap question; the
    // zero-object dummy cannot enter the apply-key prompt or occupation.
    game.flags.autounlock |= AUTOUNLOCK_UNTRAP;
    const box = newObject({ otyp: CHEST, quan: 1, olocked: 1, tknown: 1 });
    place_object(box, game.u.ux, game.u.uy, objectGenerationEnv({ state: game }));
    assert.equal(await pick_lock(null, game.u.ux, game.u.uy, box, game, env), 0);
    assert.deepEqual(prompts, []);
    assert.equal(game.xlock.box, null);
});

test('pick_lock recognizes the current monst.h closed-door mimic symbols', async () => {
    // monst.h is_door_mappear tests current defsym.h constants, not the
    // old 36/37 table positions. Construct the furniture disguise because
    // wizard-created room mimics normally choose object appearances.
    for (const appearance of [S_hcdoor, S_vcdoor]) {
        const { env, messages } = await setup();
        const x = game.u.ux + 1; // Adjacent east mimic; both axes share the predicate.
        const y = game.u.uy;
        const mimic = newMonster({ mx: x, my: y, mhp: 10,
            data: game.mons[PM_SMALL_MIMIC], m_ap_type: M_AP_FURNITURE,
            mappearance: appearance });
        game.level.monsters[x][y] = mimic;
        assert.equal(await pick_lock(newObject({ otyp: LOCK_PICK }), x, y, null, game, env), -1);
        assert.ok(messages.some(text => text.includes('small mimic')), messages.join('\n'));
        assert.equal(mimic.m_ap_type, 0, 'canonical stumble_onto_mimic reveals the monster');
        assert.ok(game.unported.has('steal.c maybe_absorb_item'), 'only the discarded void absorption callee remains a gap');
    }
});
