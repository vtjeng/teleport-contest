import assert from 'node:assert/strict';
import test from 'node:test';
import {game} from '../../../../js/gstate.js';
import {runSegment} from '../../../../js/jsmain.js';
import {newMonster,place_monster,m_at} from '../../../../js/monst.js';
import {accessible} from '../../../../js/monmove.js';
import {cansee} from '../../../../js/vision.js';
import {NON_PM,PM_MASTER_MIND_FLAYER,PM_FLESH_GOLEM,PM_HILL_GIANT} from '../../../../js/monsters.js';
import {mattackm} from '../../../../js/mhitm.js';
import {mon_wield_item} from '../../../../js/weapon.js';
const DATETIME = '20260214031500';
const RC = [
    'OPTIONS=name:Lich,role:Valkyrie,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none',
    '',
].join('\n');

async function hero(seed = 7710048) {
    await runSegment({ seed, datetime: DATETIME, nethackrc: RC, moves: '' });
    return game;
}

let nextFixtureId = 500;

// A monster shaped the way makemon() leaves one, placed on a chosen square.
function fixture(pmidx, x, y, overrides = {}) {
    const species = game.mons[pmidx];
    const mon = newMonster({
        cham: NON_PM,
        data: species,
        m_id: ++nextFixtureId,
        m_lev: species.mlevel,
        mcanmove: 1,
        mcansee: 1,
        mhp: 1,
        mhpmax: 1,
        mx: x,
        my: y,
        ...overrides,
    });
    place_monster(mon, x, y, game);
    mon.mhp = overrides.mhp ?? 8;
    mon.mhpmax = overrides.mhpmax ?? mon.mhp;
    mon.nmon = game.level.monlist;
    game.level.monlist = mon;
    return mon;
}

// Two free squares the hero can see, `gap` apart along the row they share.
// mhitm.c mattackm():362-364 makes gv.vis from cansee() and canspotmon(), and
// every message below it is behind that flag, so a fixture on an unlit square
// would be testing noises() instead.
function battlefield(gap = 1) {
    const free = (x, y) => accessible(x, y, game) && !m_at(x, y, game)
        && cansee(x, y, game);
    for (let dy = 0; dy <= 4; ++dy) {
        for (const y of [game.u.uy + dy, game.u.uy - dy]) {
            for (let dx = -10; dx <= 10; ++dx) {
                const ax = game.u.ux + dx;
                if (!free(ax, y) || !free(ax + gap, y)
                    || !free(ax + gap, y + 1)) continue;
                return { ax, dx: ax + gap, y };
            }
        }
    }
    throw new Error('no clear pair of visible squares near the hero');
}




for(const species of [PM_FLESH_GOLEM,PM_HILL_GIANT])test(`native brain attacks target=${species}`,async()=>{
 await hero();const {ax,dx,y}=battlefield();
 const attacker=fixture(PM_MASTER_MIND_FLAYER,ax,y,{mhp:80,mhpmax:80});
 const defender=fixture(species,dx,y,{mhp:species===PM_FLESH_GOLEM?40:64,mhpmax:species===PM_FLESH_GOLEM?40:64});
 const before=defender.mhp,lines=[],bounds=[];
 const random={rn2:n=>{bounds.push(`rn2(${n})`);return Math.min(1,n-1);},rnd:n=>{bounds.push(`rnd(${n})`);return 1;},d:(n,x)=>{bounds.push(`d(${n},${x})`);return n;}};
 const env={state:game,random,message:async s=>lines.push(s),redraw:()=>{},unsupported:s=>{throw Error(s);}};
 env.wieldMonsterItemAgainstMonster=mon=>mon_wield_item(mon,env);
 game.gb.bhitpos={x:dx,y};game.gn.notonhead=false;
 const result=await mattackm(attacker,defender,env);
 console.log(JSON.stringify({species,result,before,after:defender.mhp,skipdrin:game.gs.skipdrin,lines,bounds}));
 assert.equal(before-defender.mhp,species===PM_FLESH_GOLEM?11:16);
 assert.equal(game.gs.skipdrin,false);
 assert.equal(bounds.filter(x=>x==='rnd(10)').length,5);
 assert.equal(lines.filter(x=>x.includes('brain is eaten')).length,5);
 assert.equal(lines.filter(x=>x.includes("doesn't notice")).length,species===PM_FLESH_GOLEM?5:0);
});
