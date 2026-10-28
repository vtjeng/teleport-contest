import {cHealthOracle} from './c-oracle.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {game} from '../../../../js/gstate.js';
import {runSegment} from '../../../../js/jsmain.js';
import {newMonster, place_monster, m_at} from '../../../../js/monst.js';
import {accessible} from '../../../../js/monmove.js';
import {cansee} from '../../../../js/vision.js';
import {gulpmm} from '../../../../js/mhitm.js';
import {NON_PM, PM_PURPLE_WORM, PM_NURSE, PM_STONE_GOLEM} from '../../../../js/monsters.js';
import {map_invisible} from '../../../../js/display.js';
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

// A random source that records the bound of every call and answers from a
// scripted list, so a test can put a specific roll where it wants one.
function scripted(rolls = [], fallback = 1) {
    const bounds = [];
    const queue = [...rolls];
    const take = (label) => {
        bounds.push(label);
        return queue.length ? queue.shift() : fallback;
    };
    return {
        bounds,
        lines: [],
        random: {
            d: (n, x) => take(`d(${n},${x})`),
            rn1: (x, from) => take(`rn1(${x},${from})`) + from,
            rnl: (b) => take(`rnl(${b})`),
            rn2: (b) => Math.min(b-1,take(`rn2(${b})`)),
            rnd: (b) => take(`rnd(${b})`),
            rne: (b) => take(`rne(${b})`),
            rnz: (b) => take(`rnz(${b})`),
        },
    };
}

function attackEnv(rolls = [], fallback = 1) {
    const recorder = scripted(rolls, fallback);
    const redraws = [];
    const marks = [];
    return {
        bounds: recorder.bounds,
        lines: recorder.lines,
        random: recorder.random,
        redraws,
        marks,
        state: game,
        message: async (text) => { recorder.lines.push(text); },
        // The live binding, as js/unported_monster_actions.js supplies it,
        // with the squares recorded so a test can tell a mark from a repaint.
        markInvisible: (x, y) => { marks.push([x, y]); map_invisible(x, y); },
        redraw: (x, y) => { redraws.push([x, y]); },
        unsupported: (reason) => { throw new Error(reason); },
    };
}

test('C digestion heals before growth',()=>{
 const c=readFileSync(new URL('../../../../nethack-c/upstream/src/mhitm.c',import.meta.url),'utf8');
 const at=c.indexOf('pd == &mons[PM_NURSE]');
 assert.ok(at>=0);
 assert.match(c.slice(at,at+550),/healmon\(magr, magr->mhpmax, 0\);[\s\S]*grow_up\(magr, mdef\)/);
});
for(const nurse of [true,false])test(`digestion nurse=${nurse}`,async()=>{
 await hero();const {ax,dx,y}=battlefield();
 const worm=fixture(PM_PURPLE_WORM,ax,y,{mhp:32,mhpmax:120});
 const victim=fixture(nurse?PM_NURSE:PM_STONE_GOLEM,dx,y,{mhp:20,mhpmax:nurse?40:60});
 game.gv.vis=true;
 const env=attackEnv();
 env.random.d=(n,x)=>{env.bounds.push(`d(${n},${x})`);return n;};
 const result=await gulpmm(worm,victim,worm.data.mattk[1],env);
 console.log(JSON.stringify({nurse,result,hp:worm.mhp,max:worm.mhpmax,lines:env.lines,bounds:env.bounds}));
 assert.ok(victim.mhp<1);
 assert.deepEqual([worm.mhp,worm.mhpmax],cHealthOracle(nurse));
 assert.equal(worm.mhp,nurse?120:32);
 assert.equal(worm.mhpmax,121);
 assert.equal(result,2);
 assert.deepEqual(env.bounds,nurse
  ? ['d(1,10)','rn2(2)','rn2(3)','rn2(6)','rn2(1)','rn2(15)','rnd(12)']
  : ['d(1,10)','rn2(3)','rn2(6)','rnd(15)']);
});
