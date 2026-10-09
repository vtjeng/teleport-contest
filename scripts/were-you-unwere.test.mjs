import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as were from '../js/were.js';
import { runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';
import { set_uasmon } from '../js/polyself.js';
import { newMonster, place_monster } from '../js/monst.js';
import { monster_nearby } from '../js/hack.js';
import { planningState } from '../js/unported_monster_actions.js';
import { PM_GOBLIN, PM_WERERAT } from '../js/monsters.js';
import { NON_PM, POLYMORPH_CONTROL, STUNNED, UNCHANGING } from '../js/const.js';
import { nh_timeout_requires_live_state } from '../js/timeout.js';

const cSource = readFileSync(new URL('../nethack-c/upstream/src/were.c', import.meta.url), 'utf8');
let restoreReadKey;
async function initialized(beast = false) {
    restoreReadKey?.();
    // Independent daylight Wizard start supplies all canonical form/display fields.
    await runSegment({ seed: 81771008, datetime: '20890317113000',
        nethackrc: 'OPTIONS=name:UnwereBranches,role:Wizard,race:human,gender:female,align:neutral,playmode:debug\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!debug_mongen,!autopickup\n', moves: ' ' });
    were.set_ulycn(PM_WERERAT, game); // Valid infected human state.
    if (beast) {
        game.u.umonnum = PM_WERERAT;
        game.u.mh = game.u.mhmax = 12; // Positive beast HP avoids unrelated death.
        set_uasmon(game);
    }
    game.u.mtimedone = 0; // were.c:226 fallback is reached only with no timer.
    const display = game.nhDisplay;
    display.toplin = 0;
    game._pending_message = game._ttyToplines = game._ttyPreviousMessage = '';
    const readKey = display.readKey;
    restoreReadKey = () => { display.readKey = readKey; };
    display.readKey = async () => ' '.charCodeAt(0);
}
const quiet = { message: async () => {}, redraw: () => {} };

test('you_unwere follows the complete C purification and short circuit order', () => {
    const body = cSource.slice(cSource.indexOf('you_unwere(boolean purify)'), cSource.indexOf('/* lycanthropy is being caught'));
    assert.match(body, /Polymorph_control && !\(Stunned \|\| Unaware\)/u);
    assert.match(body, /You_feel\("purified\."\);[\s\S]*set_ulycn\(NON_PM\)[\s\S]*!Unchanging && is_were[\s\S]*!monster_nearby\(\)[\s\S]*!controllable_poly[\s\S]*paranoid_query[\s\S]*rehumanize\(\)/u);
    assert.match(body, /else if \(is_were[\s\S]*!u\.mtimedone\)[\s\S]*rn1\(200, 200\)/u);
    assert.equal(typeof were.you_unwere, 'function');
});

test('purification clears infection after its message without human-form RNG', async () => {
    await initialized();
    const observed = [];
    await were.you_unwere(true, game, { message: async (text) => observed.push([text, game.u.ulycn]), random: { rn1: () => assert.fail('human form drew RNG') } });
    assert.deepEqual(observed, [['You feel purified.', PM_WERERAT]]);
    assert.equal(game.u.ulycn, NON_PM);
});

test('Unchanging cures infection but retains beast and sets its fallback once', async () => {
    await initialized(true);
    game.u.uprops[UNCHANGING].intrinsic = 1; // Source blocks only rehumanize.
    const draws = [];
    const env = { ...quiet, random: { rn1: (range, base) => { draws.push([range, base]); return base; } } };
    await were.you_unwere(true, game, env);
    assert.equal(game.u.ulycn, NON_PM);
    assert.equal(game.u.umonnum, PM_WERERAT);
    assert.equal(game.u.mtimedone, 200); // C rn1(200,200)'s minimum.
    await were.you_unwere(false, game, env);
    assert.deepEqual(draws, [[200, 200]]);
});

test('controlled beast retention uses canonical query; decline or stun rehumanizes', async () => {
    for (const answer of ['y', 'n', 'stunned']) {
        await initialized(true);
        game.u.uprops[POLYMORPH_CONTROL].intrinsic = 1;
        if (answer === 'stunned') game.u.uprops[STUNNED].intrinsic = 1;
        let reads = 0;
        game.nhDisplay.readKey = async () => { reads++; return (answer === 'y' ? 'y' : 'n').charCodeAt(0); };
        await were.you_unwere(false, game, { ...quiet, random: { rn1: (_range, base) => base } });
        assert.equal(game.u.umonnum === PM_WERERAT, answer === 'y');
        assert.equal(reads > 0, answer !== 'stunned');
    }
});

test('only a reached controlled query requests planning input', async () => {
    await initialized(true);
    game.u.uprops[POLYMORPH_CONTROL].intrinsic = 1;
    const env = { ...quiet, planning: true, requestPlanningInput: (name) => { throw new Error(name); } };
    await assert.rejects(were.you_unwere(false, game, env), /you_unwere/u);
    game.u.uprops[UNCHANGING].intrinsic = 1;
    game.u.mtimedone = 200; // Positive timer makes the retained branch draw-free.
    await were.you_unwere(false, game, env);
});

test('were-form expiry hands off to live state before planning the monster tail', async () => {
    await initialized(true);
    game.u.mtimedone = 1; // nh_timeout's decrement reaches you_unwere(false).
    assert.equal(nh_timeout_requires_live_state(game), true);
    game.u.uinvulnerable = true; // C skips the timeout effect while protected.
    assert.equal(nh_timeout_requires_live_state(game), false);
});

// were.c:222 tests nearby hostile monsters before asking a controlled hero.
test('nearby hostile blocks both rehumanize and the controlled query', async () => {
    await initialized(true);
    game.u.uprops[POLYMORPH_CONTROL].intrinsic = 1;
    const goblin = newMonster({ data: game.mons[PM_GOBLIN], mnum: PM_GOBLIN,
        mhp: 5, mhpmax: 5, mcanmove: true, mpeaceful: false });
    // An adjacent visible square exercises hack.c's production scan.
    place_monster(goblin, game.u.ux + 1, game.u.uy, game);
    assert.equal(monster_nearby(game), true);
    game.nhDisplay.readKey = async () => assert.fail('nearby hostile reached query');
    await were.you_unwere(false, game, { ...quiet, random: { rn1: (_range, base) => base } });
    assert.equal(game.u.umonnum, PM_WERERAT);
    assert.equal(game.u.mtimedone, 200); // Source retained-form fallback.
});

test('planned human purification changes only cloned canonical state', async () => {
    await initialized();
    const planned = planningState(game);
    const before = game.nhDisplay.serialize();
    await were.you_unwere(true, planned, { planning: true,
        random: { rn1: () => assert.fail('human purification drew RNG') } });
    assert.equal(planned.u.ulycn, NON_PM);
    assert.equal(game.u.ulycn, PM_WERERAT);
    assert.equal(game.nhDisplay.serialize(), before);
});

test('planned retained-beast fallback uses clone-owned RNG and clock', async () => {
    await initialized(true);
    game.u.uprops[UNCHANGING].intrinsic = 1;
    const planned = planningState(game);
    const draws = [];
    await were.you_unwere(false, planned, { planning: true, random: {
        rn1: (range, base) => { draws.push([range, base]); return base; },
    } });
    assert.deepEqual(draws, [[200, 200]]); // were.c:227's exact fallback.
    assert.equal(planned.u.mtimedone, 200);
    assert.equal(game.u.mtimedone, 0);
});
