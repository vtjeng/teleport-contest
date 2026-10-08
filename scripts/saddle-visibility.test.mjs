import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { BLINDED, IN_SIGHT, OBJ_MINVENT, SEE_INVIS, W_SADDLE } from '../js/const.js';
import { game } from '../js/gstate.js';
import { fully_identify_obj } from '../js/invent.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster } from '../js/monst.js';
import { PM_PONY } from '../js/monsters.js';
import { newObject } from '../js/obj.js';
import { SADDLE, TOOL_CLASS } from '../js/objects.js';
import { getRngLog } from '../js/rng.js';
import { put_saddle_on_mon } from '../js/steed.js';

const recipe = JSON.parse(readFileSync(new URL(
    '../recipes/steed.c/saddle-startup-visibility.session.json', import.meta.url), 'utf8'));

const cases = [
    // Startup resets sight before makedog; adjacency does not restore it.
    { name: 'adjacent but unseen', sight: false, expectedKnown: false },
    { name: 'visible', sight: true, expectedKnown: true },
    // display.h mon_visible includes invisibility and see-invisible.
    { name: 'invisible', sight: true, invisible: true, expectedKnown: false },
    { name: 'see invisible', sight: true, invisible: true, seeInvisible: true, expectedKnown: true },
    // steal.c mpickobj excludes pets and the held monster from forgetting.
    { name: 'tame and unseen', sight: false, tame: true, expectedKnown: true },
    { name: 'held and unseen', sight: false, held: true, expectedKnown: true },
    // C blind vision_recalc clears IN_SIGHT; keep that source-valid state.
    { name: 'blind', sight: false, blind: true, expectedKnown: false },
];
for (const scenario of cases) test(`saddle transfer uses canonical visibility: ${scenario.name}`, async () => {
    await runSegment({ ...recipe.segments[0], moves: '.' });
    const monster = newMonster({ data: game.mons[PM_PONY],
        // Use an adjacent square so the old adjacency shortcut is exercised.
        mx: game.u.ux, my: game.u.uy + 1, m_id: 9901, // Unique fixture carrier id.
        mtame: scenario.tame ? 1 : 0, minvis: Boolean(scenario.invisible) });
    game.viz_array[monster.my][monster.mx] = scenario.sight ? IN_SIGHT : 0;
    if (scenario.blind) game.u.uprops[BLINDED].intrinsic = 1; // Active one-turn blindness.
    if (scenario.seeInvisible) game.u.uprops[SEE_INVIS].intrinsic = 1;
    if (scenario.held) game.u.ustuck = monster;
    // A preexisting identified saddle avoids creation RNG, isolating mpickobj.
    const saddle = newObject({ o_id: 9902, // Distinct supplied-object id.
        otyp: SADDLE, oclass: TOOL_CLASS, quan: 1 });
    fully_identify_obj(saddle, game);
    const rngBefore = getRngLog().length;
    put_saddle_on_mon(saddle, monster, { state: game });
    assert.equal(Boolean(saddle.dknown), scenario.expectedKnown);
    assert.equal(Boolean(saddle.bknown), scenario.expectedKnown);
    assert.equal(Boolean(saddle.rknown), scenario.expectedKnown);
    assert.equal(saddle.where, OBJ_MINVENT);
    assert.equal(saddle.owornmask, W_SADDLE);
    assert.equal(saddle.leashmon, monster.m_id);
    assert.equal(monster.minvent, saddle);
    assert.equal(getRngLog().length, rngBefore, 'visibility and supplied saddle transfer make no RNG draw');
});

test('source clears saddle identity before taming and first vision redraw', () => {
    const read = name => readFileSync(new URL(`../nethack-c/upstream/${name}`, import.meta.url), 'utf8');
    assert.match(read('src/allmain.c'), /vision_reset\(\);[\s\S]*?\(void\) makedog\(\);[\s\S]*?docrt\(\);/u);
    assert.match(read('src/dog.c'), /put_saddle_on_mon\(\(struct obj \*\) 0, mtmp\);[\s\S]*?initedog\(mtmp, TRUE\);/u);
    assert.match(read('src/steal.c'), /if \(!mtmp->mtame\)[\s\S]*?!canseemon\(mtmp\) && mtmp != u\.ustuck[\s\S]*?unknow_object\(otmp\);/u);
    assert.match(read('include/display.h'), /cansee\(mon->mx, mon->my\) \|\| see_with_infrared\(mon\)/u);
});
