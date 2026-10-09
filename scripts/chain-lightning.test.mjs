// Source-pinned contracts for spell.c's bounded queue and wave propagation.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { propagate_chain_lightning, cast_chain_lightning } from '../js/spell.js';
import { DISP_BEAM, DISP_END, ROOM, DOOR, D_CLOSED, D_LOCKED,
    POOL, MOAT, DRAWBRIDGE_UP, LAVAPOOL, WATER, LAVAWALL, STONE,
    HALLUC, FROMOUTSIDE } from '../js/const.js';
import { AD_ELEC, MONSTER_TEMPLATES, PM_GOBLIN, PM_GRID_BUG } from '../js/monsters.js';
import { tmp_at, zapdir_to_glyph } from '../js/display.js';
import { newMonster, place_monster, remove_monster } from '../js/monst.js';
const c = readFileSync(new URL('../nethack-c/upstream/src/spell.c', import.meta.url), 'utf8');
const js = readFileSync(new URL('../js/spell.js', import.meta.url), 'utf8');

test('source queue limit, terrain exclusions, direction and caller ordering', () => {
    assert.match(c, /#define CHAIN_LIGHTNING_LIMIT 100/);
    assert.match(c, /\(typ\) == MOAT \/\* not WATER \*\//);
    assert.match(c, /\(typ\) == LAVAPOOL\)\s*\/\* not LAVAWALL \*\//);
    assert.match(c, /case SPE_CHAIN_LIGHTNING:\s*cast_chain_lightning\(\);\s*break;/);
    assert.match(js, /case SPE_CHAIN_LIGHTNING:\s*await cast_chain_lightning\(state, env\);\s*break;/);
    assert.match(js, /const CHAIN_LIGHTNING_LIMIT = 100;/);
    assert.match(js, /const zap = \{ \.\.\.sourceZap \};/);
    assert.match(js, /const delay_tail = clq.tail;/);
    assert.match(js, /const zap = \{ \.\.\.clq.q\[clq.head\+\+\] \};/);
    assert.match(js, /mon.mx !== state.gb.bhitpos.x\s*\|\| mon.my !== state.gb.bhitpos.y/);
    assert.match(js, /const \{ damage: dmg \} = await zhitm\(mon, 10 \+ AD_ELEC - 1, 2,/);
    assert.match(js, /state.context.forcefight\+\+;\s*await wakeup\(mon, false, \{ \.\.\.env, state \}\);\s*state.context.forcefight--;/);
    assert.match(js, /if \(zap.strength < 2\) zap.strength = 0;\s*else if \(state.u.uen > 0\) state.u.uen--;/);
    // C's left/right2 macros use eight directions, relative to the prior step.
    assert.match(js, /zap.dir = \(zap.dir \+ N_DIRS - 1\) % N_DIRS;/);
    assert.match(js, /zap.dir = \(zap.dir \+ 2\) % N_DIRS;/);
    assert.match(js, /await nh_delay_output\(state\);\s*}\s*await nh_delay_output\(state\);\s*await nh_delay_output\(state\);\s*await tmp_at\(DISP_END, 0, state\);/);
});
async function start() {
    // Independent startup; no command or combat RNG is mocked.
    await runSegment({ seed: 19234021, datetime: '20411013114221',
        nethackrc: 'OPTIONS=name:QueueContract,role:Wizard,race:human,gender:male,align:neutral,playmode:debug,!legacy,!tutorial,!splash_screen,pettype:none,!debug_mongen,!acoustics\n', moves: '' });
    // A central map square keeps all eight source direction neighbors inbounds.
    game.u.ux = 40; game.u.uy = 10;
    for (let x = 37; x <= 43; x++) for (let y = 7; y <= 13; y++) {
        remove_monster(x, y, game);
        game.level.at(x, y).typ = ROOM;
    }
    await tmp_at(DISP_BEAM, zapdir_to_glyph(0, 1, AD_ELEC - 1, game), game);
}
const zap = () => ({ dir: 4, x: 40, y: 10, strength: 2 }); // East, two empty squares.
const queue = () => ({ q: [], head: 0, tail: 0, displayed_beam: AD_ELEC - 1 });

test('propagation copies value, avoids duplicate and stops at the source queue cap', async () => {
    await start(); const q = queue(); const input = zap();
    await propagate_chain_lightning(q, input, game);
    assert.deepEqual(input, zap());
    assert.deepEqual(q.q, [{ dir: 4, x: 41, y: 10, strength: 2 }]);
    await propagate_chain_lightning(q, input, game); assert.equal(q.tail, 1);
    q.tail = 100; // Source cap, checked before reading queue entries.
    await propagate_chain_lightning(q, { ...input, dir: 0 }, game);
    assert.equal(q.tail, 100);
    await tmp_at(DISP_END, 0, game);
});

test('terrain macro admits open space and liquids but excludes water walls and closed doors', async () => {
    await start();
    for (const typ of [ROOM, POOL, MOAT, DRAWBRIDGE_UP, LAVAPOOL, DOOR]) {
        game.level.at(41, 10).typ = typ; game.level.at(41, 10).flags = 0;
        const q = queue(); await propagate_chain_lightning(q, zap(), game);
        assert.equal(q.tail, 1, `admitted type ${typ}`);
    }
    for (const [typ, mask] of [[STONE,0], [WATER,0], [LAVAWALL,0], [DOOR,D_CLOSED], [DOOR,D_LOCKED]]) {
        game.level.at(41, 10).typ = typ; game.level.at(41, 10).flags = mask;
        const q = queue(); await propagate_chain_lightning(q, zap(), game);
        assert.equal(q.tail, 0, `excluded type ${typ} mask ${mask}`);
    }
    const q = queue();
    await propagate_chain_lightning(q, { dir: 0, x: 1, y: 10, strength: 2 }, game);
    assert.equal(q.tail, 0, 'isok excludes map column zero');
    await tmp_at(DISP_END, 0, game);
});

test('peaceful targets stop, vulnerable targets renew and resistant targets terminate', async () => {
    await start();
    const mon = newMonster({ data: MONSTER_TEMPLATES[PM_GOBLIN], mnum: PM_GOBLIN,
        mhp: 30, mhpmax: 30, mpeaceful: true }); // Healthy goblin isolates propagation, without damage.
    place_monster(mon, 41, 10, game);
    let q = queue(); await propagate_chain_lightning(q, zap(), game); assert.equal(q.tail, 0);
    mon.mpeaceful = false;
    q = queue(); await propagate_chain_lightning(q, { ...zap(), strength: 0 }, game);
    assert.equal(q.q[0].strength, 3, 'source renews before exhausted-square rejection');
    mon.data = MONSTER_TEMPLATES[PM_GRID_BUG]; mon.mnum = PM_GRID_BUG; // Source species has shock resistance.
    q = queue(); await propagate_chain_lightning(q, zap(), game);
    assert.equal(q.q[0].strength, 0);
    remove_monster(41, 10, game);
    q = queue(); await propagate_chain_lightning(q, { ...zap(), strength: 0 }, game);
    assert.equal(q.tail, 0, 'an exhausted empty square never draws');
    await tmp_at(DISP_END, 0, game);
});

test('swallowed source TODO returns before drawing but after hallucination display RNG', async () => {
    await start(); await tmp_at(DISP_END, 0, game);
    game.u.uswallow = true;
    const energy = game.u.uen;
    const displayRng = game.displayCtx.n;
    game.u.uprops[HALLUC].intrinsic = FROMOUTSIDE;
    let frames = 0; game._animationFrameHook = async () => { frames++; };
    await cast_chain_lightning(game);
    assert.equal(frames, 0); assert.equal(game.u.uen, energy);
    assert.notEqual(game.displayCtx.cnt, displayRng, 'display RNG initializer precedes swallow guard');
});

test('empty open area has two queue waves and the two final delays without Pw cost', async () => {
    await start(); await tmp_at(DISP_END, 0, game);
    let frames = 0; game._animationFrameHook = async () => { frames++; };
    // No target renews strength: initial2 -> forward1 -> empty0 rejection.
    const energy = game.u.uen;
    await cast_chain_lightning(game);
    assert.equal(frames, 5, 'initial delay + two source waves + two final delays');
    assert.equal(game.u.uen, energy);
    assert.equal(game.tmp_at_stack.length, 0);
});
