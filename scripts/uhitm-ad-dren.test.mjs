import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster, place_monster } from '../js/monst.js';
import { mhitm_adtyping, mhitm_ad_dren } from '../js/uhitm.js';
import { xdrainenergym } from '../js/mhitm.js';
import {
    AD_DREN,
    AT_BITE,
    AT_ENGL,
    NON_PM,
    PM_ENERGY_VORTEX,
    PM_GIANT_ANT,
    PM_KOBOLD_SHAMAN,
} from '../js/monsters.js';

const MHITM_C = readFileSync(
    new URL('../nethack-c/upstream/src/mhitm.c', import.meta.url), 'utf8',
);
const UHITM_C = readFileSync(
    new URL('../nethack-c/upstream/src/uhitm.c', import.meta.url), 'utf8',
);

async function freshState(seed = 47001057) {
    await runSegment({
        seed,
        datetime: '20570615161718',
        moves: '',
        nethackrc: [
            'OPTIONS=name:DrainTest,role:Wizard,race:human,gender:female,align:neutral,playmode:debug',
            'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!autopickup,!acoustics',
            '',
        ].join('\n'),
    });
    for (const column of game.level.monsters) column.fill(null);
    game.level.monlist = null;
    game.gv.vis = true;
    return game;
}

function monster(state, species, id, dx = 1, dy = 0, extra = {}) {
    const data = state.mons[species];
    const result = newMonster({
        data,
        mnum: species,
        m_id: id,
        cham: NON_PM,
        m_lev: data.mlevel,
        mx: state.u.ux + dx,
        my: state.u.uy + dy,
        mcanmove: true,
        mcansee: true,
        mhp: 20,
        mhpmax: 20,
        ...extra,
    });
    place_monster(result, result.mx, result.my, state);
    result.nmon = state.level.monlist;
    state.level.monlist = result;
    return result;
}

function effect(rolls = []) {
    const events = [];
    const queue = [...rolls];
    return {
        events,
        env: {
            unsupported: (reason) => assert.fail(reason),
            message: async (line) => { events.push(`message:${line}`); },
            random: {
                rn2: (bound) => {
                    events.push(`rn2:${bound}`);
                    return queue.length ? queue.shift() : 0;
                },
                d: (count, sides) => {
                    events.push(`d:${count}d${sides}`);
                    return count * sides;
                },
                rnd: (bound) => {
                    events.push(`rnd:${bound}`);
                    return 1;
                },
            },
        },
    };
}

test('energy-drain helper follows the C threshold, eligibility, roll, and message',
    async () => {
        assert.match(MHITM_C,
            /void\s+xdrainenergym\(struct monst \*mon, boolean givemsg\)[\s\S]*?if \(mon->mspec_used < 20[\s\S]*?attacktype\(mon->data, AT_MAGC\)[\s\S]*?attacktype\(mon->data, AT_BREA\)[\s\S]*?mon->mspec_used \+= d\(2, 2\);[\s\S]*?if \(givemsg\)[\s\S]*?pline_mon\(mon, "%s seems lethargic\."/u);

        await freshState();
        const target = monster(game, PM_KOBOLD_SHAMAN, 4701);
        target.mspec_used = 18;
        const e = effect();
        await xdrainenergym(target, true, game, e.env);
        assert.equal(target.mspec_used, 22);
        assert.deepEqual(e.events, [
            'd:2d2',
            `message:${game.a11y?.accessiblemsg ? `${target.mx},${target.my}: ` : ''}The kobold shaman seems lethargic.`,
        ]);

        target.mspec_used = 20;
        e.events.length = 0;
        await xdrainenergym(target, true, game, e.env);
        assert.equal(target.mspec_used, 20);
        assert.deepEqual(e.events, []);

        const ineligible = monster(game, PM_GIANT_ANT, 4702, 2);
        ineligible.mspec_used = 0;
        await xdrainenergym(ineligible, true, game, e.env);
        assert.equal(ineligible.mspec_used, 0);
        assert.deepEqual(e.events, []);
    });

test('AD_DREN caller preserves branch order, negation, and damage reset', async () => {
    const drenStart = UHITM_C.indexOf('\nmhitm_ad_dren(');
    const drenEnd = UHITM_C.indexOf('\nvoid\nmhitm_ad_drli', drenStart);
    const drenSource = UHITM_C.slice(drenStart, drenEnd);
    assert.notEqual(drenStart, -1);
    assert.match(drenSource,
        /boolean negated = mhitm_mgc_atk_negated\(magr, mdef, FALSE\);[\s\S]*?if \(magr == &gy\.youmonst\)[\s\S]*?xdrainenergym\(mdef, TRUE\);[\s\S]*?\} else if \(mdef == &gy\.youmonst\)[\s\S]*?hitmsg\(magr, mattk\);[\s\S]*?drain_en\(mhm->damage, FALSE\);[\s\S]*?\} else \{[\s\S]*?xdrainenergym\(mdef,[\s\S]*?canspotmon\(mdef\)[\s\S]*?mattk->aatyp != AT_ENGL[\s\S]*?mhm->damage = 0;/u);
    assert.match(UHITM_C,
        /case AD_DREN:\s*mhitm_ad_dren\(magr, mattk, mdef, mhm\); break;/u);

    await freshState();
    const attack = { aatyp: AT_ENGL, adtyp: AD_DREN };
    const vortex = monster(game, PM_ENERGY_VORTEX, 4703, -1);
    const target = monster(game, PM_KOBOLD_SHAMAN, 4704, 1);
    const e = effect([0, 0]); // uncancelled, then the one-in-four success
    const mhm = { damage: 7, hitflags: 0, done: false };
    await mhitm_adtyping(vortex, attack, target, mhm, game, e.env);
    assert.equal(target.mspec_used, 4);
    assert.equal(mhm.damage, 0);
    assert.deepEqual(e.events, ['rn2:10', 'rn2:4', 'd:2d2']);

    // The source's hero-defender arm is shared by the dispatcher even though
    // current monster data reaches the energy-vortex drain through engulfing.
    const heroAttack = { aatyp: AT_BITE, adtyp: AD_DREN };
    game.u.uen = 10;
    game.u.uenmax = 10;
    const attacke = monster(game, PM_ENERGY_VORTEX, 4705, -2);
    const heroEvents = effect([9, 0]);
    const heroMhm = { damage: 6 };
    await mhitm_ad_dren(attacke, heroAttack, game.youmonst, heroMhm,
        game, heroEvents.env);
    assert.equal(game.u.uen, 4);
    assert.equal(heroMhm.damage, 0);
    assert.deepEqual(heroEvents.events, [
        'rn2:10',
        'message:It bites!',
        'rn2:4',
        'message:You feel your magical energy drain away.',
    ]);
});
