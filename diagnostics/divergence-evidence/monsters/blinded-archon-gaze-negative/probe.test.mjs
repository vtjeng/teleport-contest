import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {game} from '../../../../js/gstate.js';
import {runSegment} from '../../../../js/jsmain.js';
import {newMonster,place_monster,m_at} from '../../../../js/monst.js';
import {accessible} from '../../../../js/monmove.js';
import {cansee} from '../../../../js/vision.js';
import {NON_PM,PM_ARCHON,PM_PYROLISK,PM_MINOTAUR} from '../../../../js/monsters.js';
import {mattackm} from '../../../../js/mhitm.js';
import {potionhit} from '../../../../js/potion.js';
import {mksobj} from '../../../../js/obj.js';
import {POT_BLINDNESS} from '../../../../js/objects.js';
import {mon_wield_item} from '../../../../js/weapon.js';
import {POTHIT_HERO_THROW} from '../../../../js/const.js';
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




for (const species of [PM_ARCHON, PM_PYROLISK]) test(`blinded gaze species=${species}`, async()=>{
 await hero(); const {ax,dx,y}=battlefield();
 const attacker=fixture(species,ax,y,{mhp:40,mhpmax:species===PM_ARCHON?80:48});
 const defender=fixture(PM_MINOTAUR,dx,y,{mhp:120,mhpmax:120});
 const bounds=[],lines=[];
 const random={rn2:n=>{bounds.push(`rn2(${n})`);return Math.min(1,n-1);},
 rnd:n=>{bounds.push(`rnd(${n})`);return 1;},
 d:(n,x)=>{bounds.push(`d(${n},${x})`);return n;}};
 const env={state:game,random,message:async s=>lines.push(s),redraw:()=>{},
 unsupported:s=>{throw new Error(s);}};
 env.wieldMonsterItemAgainstMonster=mon=>mon_wield_item(mon,env);
 game.objects[POT_BLINDNESS].oc_name_known=1; // reachable by identifying this potion type
 const potion=mksobj(POT_BLINDNESS,false,false,{state:game});potion.dknown=0;
 await potionhit(attacker,potion,POTHIT_HERO_THROW,env);
 assert.equal(Boolean(attacker.mcansee),false);assert.ok(attacker.mblinded>=64);
 const setup={blind:attacker.mblinded,lines:[...lines],bounds:[...bounds]};lines.length=0;bounds.length=0;
 game.gb.bhitpos={x:defender.mx,y:defender.my};game.gn.notonhead=false;
 const result=await mattackm(attacker,defender,env);
 console.log(JSON.stringify({species,setup,result,blind:defender.mblinded,cansee:defender.mcansee,hp:defender.mhp,lines,bounds}));
 if(species===PM_ARCHON){assert.equal(Boolean(defender.mcansee),false);assert.equal(defender.mblinded,2);assert.equal(defender.mstun,1);assert.ok(lines.some(s=>s.includes('blinded Archon gazes toward')));}
 else{assert.equal(Boolean(defender.mcansee),true);assert.equal(defender.mhp,119);assert.ok(lines.includes('The pyrolisk bites the minotaur.'));assert.ok(!bounds.includes('d(2,6)'));assert.ok(lines.includes('but nothing happens.'));}
});
