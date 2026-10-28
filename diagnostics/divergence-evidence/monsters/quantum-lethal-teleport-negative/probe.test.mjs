import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {game} from '../../../../js/gstate.js';
import {runSegment} from '../../../../js/jsmain.js';
import {newMonster,place_monster,m_at} from '../../../../js/monst.js';
import {accessible} from '../../../../js/monmove.js';
import {cansee} from '../../../../js/vision.js';
import {NON_PM,PM_QUANTUM_MECHANIC,PM_LARGE_DOG} from '../../../../js/monsters.js';
import {mhitm_ad_tlpt} from '../../../../js/uhitm.js';
import {rn2,rnd,rn1,d} from '../../../../js/rng.js';
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


test('C lethal-hit gate precedes negation and relocation',()=>{
 const c=readFileSync(new URL('../../../../nethack-c/upstream/src/uhitm.c',import.meta.url),'utf8');
 const body=c.slice(c.indexOf('mhitm_ad_tlpt('),c.indexOf('mhitm_ad_blnd('));
 assert.match(body,/if \(magr->mcan \|\| mhm->damage >= mdef->mhp \|\| tele_restrict\(mdef\)\) \{[\s\S]*?else if \(mhitm_mgc_atk_negated/);
 assert.ok(body.includes('rloc(mdef, RLOC_NOMSG)'));
});
for(const lethal of [false,true])test(`quantum teleport lethal=${lethal}`,async()=>{
 await hero();const {ax,dx,y}=battlefield();
 const qm=fixture(PM_QUANTUM_MECHANIC,ax,y,{mhp:28,mhpmax:56});
 const target=fixture(PM_LARGE_DOG,dx,y,{mhp:lethal?1:4,mhpmax:48});
 game.gv.vis=true;
 const old=[target.mx,target.my],bounds=[],lines=[];
 const env={state:game,message:async s=>lines.push(s),random:{rn2:n=>{bounds.push(`rn2(${n})`);return rn2(n);},rnd:n=>{bounds.push(`rnd(${n})`);return rnd(n);},rn1:(n,b)=>{bounds.push(`rn1(${n},${b})`);return rn1(n,b);},d:(n,x)=>{bounds.push(`d(${n},${x})`);return d(n,x);}}};
 const mhm={damage:1};
 await mhitm_ad_tlpt(qm,qm.data.mattk[0],target,mhm,game,env);
 console.log(JSON.stringify({lethal,old,after:[target.mx,target.my],hp:target.mhp,damage:mhm.damage,bounds,lines}));
 if(lethal){assert.deepEqual([target.mx,target.my],old);assert.deepEqual(bounds,[]);}
 else {assert.notDeepEqual([target.mx,target.my],old);assert.equal(bounds[0],'rn2(10)');assert.deepEqual(lines,['The large dog suddenly disappears!']);}
 assert.equal(mhm.damage,1);assert.equal(target.mhp,lethal?1:4);
});
