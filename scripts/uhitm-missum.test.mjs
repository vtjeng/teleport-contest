// uhitm.c:5198–5215: polymorphed seduction feedback precedes ordinary misses.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { missum } from '../js/uhitm.js';
import { could_seduce } from '../js/mhitu.js';
import { newMonster } from '../js/monst.js';
import { AD_SEDU, AD_SITM, AD_PHYS, AT_CLAW, PM_WOOD_NYMPH, PM_GOBLIN, NON_PM } from '../js/monsters.js';
import { INVIS, STRAT_WAITFORU } from '../js/const.js';

async function fixture() {
    // Independently chosen female Healer has no seduction attack at startup.
    await runSegment({ seed: 16271001, datetime: '20560512131417',
        nethackrc: 'OPTIONS=name:Ada,role:Healer,race:human,gender:female,align:neutral,playmode:debug,!legacy,!tutorial,!splash_screen,pettype:none,!debug_mongen,!acoustics\n', moves: '' });
    const mon = newMonster({ data: game.mons[PM_GOBLIN], mnum: PM_GOBLIN,
        cham: NON_PM, mx: game.u.ux + 1, my: game.u.uy, mhp: 10, mhpmax: 10,
        mcanmove: 1, mstrategy: STRAT_WAITFORU });
    const lines = [];
    return { mon, lines, env: { message: async text => { lines.push(text); } } };
}
function nymph() {
    // Canonical hero identity and form agree; poly_gender reads the female form.
    game.u.umonnum = PM_WOOD_NYMPH;
    game.youmonst.data = game.mons[PM_WOOD_NYMPH];
}
const attack = adtyp => ({ aatyp: AT_CLAW, adtyp, damn: 0, damd: 0 });

test('both nonzero nymph compatibility results select friendly feedback even with verbose off', async () => {
    for (const female of [false, true]) {
        const { mon, lines, env } = await fixture(); nymph();
        mon.female = female;
        game.flags.verbose = false;
        const mattk = attack(AD_SITM);
        // mhitu.c:1981 returns one for opposite sex and two for same-sex nymphs.
        assert.equal(could_seduce(game.youmonst, mon, mattk, { state: game }), female ? 2 : 1);
        await missum(mon, mattk, false, game, env);
        assert.deepEqual(lines, ['You pretend to be friendly to the goblin.']);
        assert.equal(mon.mstrategy, 0, 'source wakeup follows feedback');
    }
});

test('unseen target still takes friendly branch and mon_nam supplies it', async () => {
    const { mon, lines, env } = await fixture(); nymph();
    // Outside the visible map deliberately defeats canspotmon.
    mon.mx = 0; mon.my = 0;
    await missum(mon, attack(AD_SEDU), true, game, env);
    assert.deepEqual(lines, ['Your armor is rather cumbersome...', 'You pretend to be friendly to it.']);
});

test('invisible nymph fails AD_SEDU compatibility but AD_SITM remains eligible', async () => {
    const { mon, lines, env } = await fixture(); nymph();
    // Goblins cannot perceive invisibility; only AD_SEDU has this C exclusion.
    game.u.uprops[INVIS].intrinsic = 1;
    await missum(mon, attack(AD_SEDU), false, game, env);
    assert.deepEqual(lines, ['You miss the goblin.']);
    lines.length = 0;
    await missum(mon, attack(AD_SITM), false, game, env);
    assert.deepEqual(lines, ['You pretend to be friendly to the goblin.']);
});

test('ordinary physical miss retains generic feedback and helpless state', async () => {
    const { mon, lines, env } = await fixture();
    game.flags.verbose = false;
    // C helpless macro excludes sleeping targets from wakeup on a miss.
    mon.msleeping = 1;
    await missum(mon, attack(AD_PHYS), false, game, env);
    assert.deepEqual(lines, ['You miss it.']);
    assert.equal(mon.mstrategy, STRAT_WAITFORU);
    assert.equal(mon.msleeping, 1);
});

test('pending friendly feedback settles before wakeup mutates target strategy', async () => {
    const { mon } = await fixture(); nymph();
    let release;
    let text;
    const pending = new Promise(resolve => { release = resolve; });
    let settled = false;
    const call = missum(mon, attack(AD_SITM), false, game, {
        message: line => { text = line; return pending; },
    }).then(() => { settled = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(text, 'You pretend to be friendly to the goblin.');
    assert.equal(settled, false);
    assert.equal(mon.mstrategy, STRAT_WAITFORU);
    release(); await call;
    assert.equal(mon.mstrategy, 0);
});

test('source pins seduction before visible verbose miss and non-helpless wakeup', () => {
    const c = readFileSync(new URL('../nethack-c/upstream/src/uhitm.c', import.meta.url), 'utf8');
    assert.match(c, /if \(could_seduce\(&gy\.youmonst, mdef, mattk\)\)\s+You\("pretend to be friendly to %s\.", mon_nam\(mdef\)\);\s+else if \(canspotmon\(mdef\) && flags\.verbose\)/u);
    assert.match(c, /if \(!helpless\(mdef\)\)\s+wakeup\(mdef, TRUE\);/u);
});
