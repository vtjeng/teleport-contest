// C ref: eat.c edibility_prompts() (2627-2730). These checks make no RNG
// draw; the impure part is the ordered danger prompt and its answer.
import assert from 'node:assert/strict';
import test from 'node:test';
import { ACID_RES, POISON_RES, SICK_RES, SLEEP_RES, STONE_RES } from '../js/const.js';
import { edibility_prompts } from '../js/eat.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_ACID_BLOB, PM_COCKATRICE, PM_KOBOLD, PM_MONK } from '../js/monsters.js';
import { APPLE, CORPSE } from '../js/objects.js';
import { getRngLog } from '../js/rng.js';
import { loadEatOneTurnRecipe } from './run-eat-one-turn.mjs';

async function fixture() {
    await runSegment({ ...loadEatOneTurnRecipe().segments[0], moves: '.' });
    let apple = game.invent;
    while (apple?.otyp !== APPLE) apple = apple.nobj;
    assert.ok(apple);
    return { ...apple, quan: 1, cursed: false, blessed: false, orotten: false };
}

async function prompt(object, answer = 'n') {
    const queries = [];
    const draws = getRngLog().length;
    const result = await edibility_prompts(object, game, {
        ynFunction: async (...args) => {
            queries.push(args.slice(0, 4));
            return answer.charCodeAt(0);
        },
    });
    assert.equal(getRngLog().length, draws, 'worst-case age uses no random divisor');
    return { result, queries };
}

test('safe food preserves the smell charge and asks no question', async () => {
    const apple = await fixture();
    game.u.uedibility = 1;
    assert.deepEqual(await prompt(apple), { result: 0, queries: [] });
    assert.equal(game.u.uedibility, 1, 'doeat owns consumption of the charge');
});

test('cursed apple prompts for one item or one of a stack, with C answer codes', async () => {
    const apple = await fixture();
    apple.cursed = true;
    const no = await prompt(apple);
    assert.equal(no.result, 1);
    assert.deepEqual(no.queries, [[
        'The apple smells like it might have been poisoned.  Eat it anyway?',
        'yn', 'n', true,
    ]]);
    apple.quan = 3;
    const yes = await prompt(apple, 'y');
    assert.equal(yes.result, 2);
    assert.match(yes.queries[0][0], /apples smell like they.*Eat one anyway\?/u);
    game.u.uprops[SLEEP_RES].intrinsic = 1;
    assert.equal((await prompt(apple)).result, 0);
});

test('taint precedes petrification, while sickness resistance exposes the danger', async () => {
    const corpse = { ...await fixture(), otyp: CORPSE, corpsenm: PM_COCKATRICE, age: game.moves - 60 };
    assert.match((await prompt(corpse)).queries[0][0], /could be tainted!/u);
    game.u.uprops[SICK_RES].intrinsic = 1;
    assert.match((await prompt(corpse)).queries[0][0], /something very dangerous!/u);
    game.u.uprops[STONE_RES].intrinsic = 1;
    assert.match((await prompt(corpse)).queries[0][0], /could be tainted\./u);
});

test('worst-case corpse age applies blessing and rotten-food priority', async () => {
    const corpse = { ...await fixture(), otyp: CORPSE, corpsenm: PM_KOBOLD, age: game.moves - 40 };
    assert.match((await prompt(corpse)).queries[0][0], /could be rotten!/u);
    corpse.cursed = true;
    assert.match((await prompt(corpse)).queries[0][0], /could be tainted!/u);
    corpse.cursed = false;
    corpse.blessed = true;
    game.u.uprops[POISON_RES].intrinsic = 0;
    assert.match((await prompt(corpse)).queries[0][0], /might be poisonous!/u);
});

test('monk meat conduct and acid resistance select the source prompt', async () => {
    const corpse = { ...await fixture(), otyp: CORPSE, corpsenm: PM_KOBOLD, age: game.moves };
    game.urole.mnum = PM_MONK;
    game.u.uconduct.unvegetarian = 0;
    game.u.uprops[POISON_RES].intrinsic = 1;
    assert.match((await prompt(corpse)).queries[0][0], /unhealthy\./u);
    corpse.corpsenm = PM_ACID_BLOB;
    // Acid blobs are vegetarian, so the Monk's meat check does not apply.
    game.u.uprops[ACID_RES].intrinsic = 0;
    assert.match((await prompt(corpse)).queries[0][0], /rather acidic\./u);
    game.u.uprops[ACID_RES].intrinsic = 1;
    assert.equal((await prompt(corpse)).result, 0);
});
