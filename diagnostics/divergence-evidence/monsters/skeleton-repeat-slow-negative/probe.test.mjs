import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {game} from '../../../../js/gstate.js';
import {runSegment} from '../../../../js/jsmain.js';
import {newMonster,place_monster,m_at} from '../../../../js/monst.js';
import {accessible} from '../../../../js/monmove.js';
import {cansee} from '../../../../js/vision.js';
import {NON_PM,PM_SKELETON,PM_LARGE_DOG} from '../../../../js/monsters.js';
import {mhitm_ad_slow} from '../../../../js/uhitm.js';
import {MSLOW} from '../../../../js/const.js';
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



test('C slow attack retains callee and caller messages and checks negation first',()=>{
 const c=readFileSync(new URL('../../../../nethack-c/upstream/src/uhitm.c',import.meta.url),'utf8');
 const slow=c.slice(c.indexOf('mhitm_ad_slow('),c.indexOf('mhitm_ad_conf('));
 assert.ok(slow.indexOf('mhitm_mgc_atk_negated')<slow.indexOf('mdef->mspeed != MSLOW'));
 assert.match(slow,/mon_adjust_speed\(mdef, -1, \(struct obj \*\) 0\)/);
 assert.ok(slow.includes('"%s slows down."'));
 const worn=readFileSync(new URL('../../../../nethack-c/upstream/src/worn.c',import.meta.url),'utf8');
 assert.ok(worn.includes('"%s seems to be moving %sslower."'));
});
for(const already of [false,true])test(`skeleton slow already=${already}`,async()=>{
 await hero();const {ax,dx,y}=battlefield();
 const skeleton=fixture(PM_SKELETON,ax,y,{mhp:36,mhpmax:72});
 const target=fixture(PM_LARGE_DOG,dx,y,{mhp:24,mhpmax:48,mspeed:already?MSLOW:0,permspeed:already?MSLOW:0});
 game.gv.vis=true;const bounds=[],lines=[];
 const env={state:game,message:async s=>lines.push(s),random:{rn2:n=>{bounds.push(n);assert.equal(n,10);return 9;}}};
 const mhm={damage:1};
 await mhitm_ad_slow(skeleton,skeleton.data.mattk[1],target,mhm,game,env);
 console.log(JSON.stringify({already,mspeed:target.mspeed,permspeed:target.permspeed,damage:mhm.damage,bounds,lines}));
 assert.equal(target.mspeed,MSLOW);assert.equal(target.permspeed,MSLOW);
 assert.deepEqual(bounds,[10]);assert.equal(mhm.damage,1);
 assert.deepEqual(lines,already?[]:['The large dog seems to be moving slower.','The large dog slows down.']);
});
