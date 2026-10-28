import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {game} from '../../../../js/gstate.js';
import {runSegment} from '../../../../js/jsmain.js';
import {newMonster, place_monster, m_at} from '../../../../js/monst.js';
import {accessible} from '../../../../js/monmove.js';
import {cansee} from '../../../../js/vision.js';
import {gulpmm,failed_grab} from '../../../../js/mhitm.js';
import {NON_PM,PM_PURPLE_WORM,PM_WRAITH,PM_NURSE,PM_GREEN_SLIME,PM_LICHEN,AD_DGST,AT_ENGL} from '../../../../js/monsters.js';
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
            d: (n, x) => Math.max(n,take(`d(${n},${x})`)),
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


test('current native digestion catalog and wraith guard explain the missing engulf',async()=>{
 const c=readFileSync(new URL('../../../../nethack-c/upstream/include/monsters.h',import.meta.url),'utf8');
 const attacks=[...c.matchAll(/ATTK\(\s*(\w+)\s*,\s*AD_DGST\s*,[^)]*\)/g)].map(x=>x[0]);
 assert.deepEqual(attacks,['ATTK(AT_ENGL, AD_DGST, 1, 10)']);
 const wraith=c.slice(c.indexOf('MON(NAM("wraith")'),c.indexOf('MON(NAM("Nazgul")'));
 assert.match(wraith,/M1_UNSOLID/);
 const mhitm=readFileSync(new URL('../../../../nethack-c/upstream/src/mhitm.c',import.meta.url),'utf8');
 const engulf=mhitm.slice(mhitm.indexOf('case AT_ENGL:'),mhitm.indexOf('case AT_BREA:',mhitm.indexOf('case AT_ENGL:')));
 assert.match(engulf,/if \(failed_grab\(magr, mdef, mattk\)\)[\s\S]*strike = 0;[\s\S]*else\s*res\[i\] = gulpmm/);
 const grab=mhitm.slice(mhitm.indexOf('boolean\nfailed_grab('),mhitm.indexOf('/* return True if',mhitm.indexOf('boolean\nfailed_grab(')));
 assert.match(grab,/unsolid\(mdef->data\)[\s\S]*mattk->adtyp == AD_DGST/);
 const mhitu=readFileSync(new URL('../../../../nethack-c/upstream/src/mhitu.c',import.meta.url),'utf8');
 const replacement=mhitu.slice(mhitu.indexOf('getmattk('),mhitu.indexOf('/* calc some variables needed'));
 assert.ok(!replacement.includes('AD_DGST'),'attack substitutions must not introduce digestion');
 const noSeduction=c.slice(c.indexOf('#define SEDUCTION_ATTACKS_NO'),c.indexOf('MON(',c.indexOf('#define SEDUCTION_ATTACKS_NO')));
 assert.ok(!noSeduction.includes('AD_DGST'));
 await hero();
 const native=[];for(let i=0;i<game.mons.length;i++)for(const a of game.mons[i].mattk??[])if(a.adtyp===AD_DGST)native.push([i,a.aatyp]);
 assert.deepEqual(native,[[PM_PURPLE_WORM,AT_ENGL]]);
 const {ax,dx,y}=battlefield();
 const worm=fixture(PM_PURPLE_WORM,ax,y,{mhp:32,mhpmax:120});
 const victim=fixture(PM_WRAITH,dx,y,{mhp:20,mhpmax:48});
 game.gv.vis=true;game.gn.notonhead=false;
 const e=attackEnv();assert.equal(await failed_grab(worm,victim,worm.data.mattk[1],e),true);
 assert.deepEqual(e.lines,["The purple worm's gulp attempt passes right through the wraith!"]);
 assert.deepEqual(e.bounds,[]);
 // A native solid nurse clears the same gate. The witness in PR37 and its
 // source-pinned tests separately establish normal digestion reachability.
 const solid=fixture(PM_NURSE,dx,y+1,{mhp:20,mhpmax:48});e.lines.length=0;
 assert.equal(await failed_grab(worm,solid,worm.data.mattk[1],e),false);
 assert.deepEqual(e.lines,[]);
 console.log(JSON.stringify({nativeDigestion:native,wraithRejected:true,solidNurseRejected:false}));
});
