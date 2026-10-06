import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DEAF, M_ATTK_MISS, M_ATTK_AGR_DIED } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { corpse_chance } from '../js/mon.js';
import { newMonster, place_monster } from '../js/monst.js';
import { accessible } from '../js/monmove.js';
import { m_at } from '../js/monst.js';
import { newedog } from '../js/dog.js';
import { mhitm_adtyping } from '../js/uhitm.js';
import {
    AD_DGST, AT_ENGL, NON_PM, PM_GAS_SPORE, PM_LICH,
    PM_LIZARD, PM_PURPLE_WORM, PM_DEATH,
} from '../js/monsters.js';

const source = (file) => readFileSync(
    new URL(`../nethack-c/upstream/src/${file}`, import.meta.url), 'utf8',
);
const monC = source('mon.c');
const uhitmC = source('uhitm.c');
const monJS = readFileSync(new URL('../js/mon.js', import.meta.url), 'utf8');
async function start() {
    // Independent daytime Wizard initialization avoids hunger and occupation.
    await runSegment({ seed: 61106119, datetime: '20420217133000', moves: '',
        nethackrc: 'OPTIONS=name:DigestTest,role:Wizard,race:human,gender:female,align:neutral\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics\n' });
    game.gv.vis = false;
    return game;
}
function monster(pm, extra = {}) {
    // Living fixtures have twenty HP so a contained ten-point explosion
    // survives; linked death fixtures override that HP below.
    return newMonster({ data: game.mons[pm], mnum: pm, cham: NON_PM,
        mhp: 20, mhpmax: 20, m_lev: game.mons[pm].mlevel,
        mx: game.u.ux + 1, my: game.u.uy, mcanmove: true, ...extra });
}
function place(mon) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = game.u.ux + dx, y = game.u.uy + dy;
        if (accessible(x, y, game) && !m_at(x, y, game)) {
            place_monster(mon, x, y, game);
            mon.nmon = game.level.monlist;
            game.level.monlist = mon;
            return mon;
        }
    }
    assert.fail('fixture requires an adjacent floor square');
}
const attack = { aatyp: AT_ENGL, adtyp: AD_DGST };
const effect = () => {
    const lines = [];
    return { lines, env: { message: async (line) => lines.push(line),
        unsupported: assert.fail } };
};

test('whole corpse and digestion ordering is pinned to C', () => {
    assert.match(monC, /if \(!magr && gm\.mswallower && attacktype\(gm\.mswallower->data, AT_ENGL\)\)/u);
    assert.match(monC, /if \(cansee\(mon->mx, mon->my\) && !was_swallowed\)/u);
    assert.match(monC, /mondied\(magr\);\s*if \(DEADMONSTER\(magr\)\) \{ \/\* maybe lifesaved \*\//u);
    // A source check preserves the second death test while the actual
    // lifesaved_monster production callee still refuses that separate path.
    assert.match(monJS, /if \(magr\.mhp < 1\) await mondied\(magr, state, env\);\s*if \(magr\.mhp < 1\)/u);
    assert.match(uhitmC, /case AD_DGST:\s*mhitm_ad_dgst\(magr, mattk, mdef, mhm\);/u);
    assert.match(uhitmC, /wake_nearto\(magr->mx, magr->my, 2 \* 2\);/u);
    assert.match(uhitmC, /if \(!corpse_chance\(mdef, magr, TRUE\) \|\| DEADMONSTER\(magr\)\)/u);
    assert.match(uhitmC, /magr->meating = \(magr->meating \+ 3\) \/ 4;/u);
    assert.match(uhitmC, /if \(nutrit > 1\)\s*nutrit \/= 2;/u);
});

test('AD_DGST hero arms leave the dedicated engulf handler in charge', async () => {
    await start();
    for (const [magr, mdef] of [[game.youmonst, monster(PM_LIZARD)],
        [monster(PM_PURPLE_WORM), game.youmonst]]) {
        const mhm = { damage: 7, hitflags: M_ATTK_MISS, done: false };
        const e = effect();
        await mhitm_adtyping(magr, attack, mdef, mhm, game, e.env);
        assert.deepEqual(mhm, { damage: 0, hitflags: M_ATTK_MISS, done: false });
        assert.deepEqual(e.lines, []);
    }
});

test('swallowed lich has no dust output or corpse draw', async () => {
    await start(); const e = effect();
    e.env.random = { rn2: assert.fail, d: assert.fail };
    assert.equal(await corpse_chance(monster(PM_LICH), game.youmonst,
        true, game, e.env), false);
    assert.deepEqual(e.lines, []);
    const visible = place(monster(PM_LICH));
    assert.equal(await corpse_chance(visible, null, false, game, e.env), false);
    assert.deepEqual(e.lines, ["The lich's body crumbles into dust."]);
});

test('contained gas-spore explosion obeys hearing gates and first AT_BOOM roll', async () => {
    for (const mode of ['silent', 'hearing', 'deaf', 'underwater']) {
        await start();
        game.flags.acoustics = mode !== 'silent';
        game.u.uprops[DEAF].intrinsic = mode === 'deaf' ? 1 : 0;
        game.u.uinwater = mode === 'underwater';
        const e = effect(), draws = [];
        e.env.random = { d: (n, sides) => {
            draws.push([n, sides]); return 10;
        }, rn2: assert.fail };
        const engulfer = place(monster(PM_PURPLE_WORM));
        game.gm.mswallower = engulfer;
        assert.equal(await corpse_chance(monster(PM_GAS_SPORE), null,
            false, game, e.env), false);
        assert.equal(engulfer.mhp, 10);
        assert.deepEqual(draws, [[4, 6]], 'C gas spore has one contained 4d6 roll');
        const heard = mode === 'hearing' ? ['You hear an explosion.']
            : mode === 'underwater' ? ['You barely hear an explosion.'] : [];
        assert.deepEqual(e.lines, [...heard, 'The purple worm seems to have indigestion.']);
    }
});

test('monster digestion wakes nearby sleepers and gives pets half nutrition', async () => {
    await start(); game.flags.verbose = false;
    const magr = place(monster(PM_PURPLE_WORM, { mtame: 10 }));
    newedog(magr); magr.mextra.edog.hungrytime = 100;
    const mdef = monster(PM_LIZARD, { msleeping: true });
    // C wake_nearto uses a squared radius of four; put the defender on the
    // aggressor square solely to exercise that distance gate and waking.
    mdef.mx = magr.mx; mdef.my = magr.my;
    mdef.nmon = game.level.monlist; game.level.monlist = mdef;
    const mhm = { damage: 7, hitflags: 0, done: false };
    await mhitm_adtyping(magr, attack, mdef, mhm, game, effect().env);
    assert.equal(mhm.damage, 20, 'C copies defender HP before corpse eligibility');
    assert.equal(mdef.msleeping, false);
    // Lizard: weight 10 -> meating 3, nutrition 40. Gigantic worm multiplies
    // nutrition by two, then digestion halves it; meating (3+3)/4 truncates.
    assert.equal(magr.meating, 1);
    assert.equal(magr.mextra.edog.hungrytime, 140);
});

test('a monster digesting a Rider dies and finishes the attack', async () => {
    await start(); game.flags.verbose = false;
    const magr = place(monster(PM_PURPLE_WORM));
    const mhm = { damage: 7, hitflags: 0, done: false };
    await mhitm_adtyping(magr, attack, monster(PM_DEATH), mhm, game, effect().env);
    assert.equal(magr.mhp, 0);
    assert.equal(mhm.hitflags, M_ATTK_AGR_DIED);
    assert.equal(mhm.done, true);
});

test('a contained explosion kills its monster engulfer before death feedback', async () => {
    await start(); game.flags.acoustics = true;
    const magr = place(monster(PM_PURPLE_WORM, { mhp: 2 }));
    const e = effect();
    // Ten points exceed two HP; other corpse/timer draws use the source RNG.
    e.env.random = { d: () => 10 };
    assert.equal(await corpse_chance(monster(PM_GAS_SPORE), magr, true,
        game, e.env), false);
    assert.equal(magr.mhp, 0);
    assert.ok(e.lines.includes('You hear an explosion.'));
    assert.ok(e.lines.includes('The purple worm rips open!'));
    assert.ok(!e.lines.some((line) => String(line).includes('indigestion')));
});
