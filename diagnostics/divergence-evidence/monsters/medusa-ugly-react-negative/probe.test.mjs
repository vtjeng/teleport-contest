import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runSegment } from '../../../../js/jsmain.js';
import { game } from '../../../../js/gstate.js';
import { newMonster, place_monster } from '../../../../js/monst.js';
import { PM_MEDUSA, AT_GAZE, AD_STON } from '../../../../js/monsters.js';
import { NON_PM } from '../../../../js/const.js';
import { canseemon } from '../../../../js/display.js';
import { gazemu } from '../../../../js/mhitu.js';

// C source proof, not an executed C gameplay witness. Pin the complete prefix
// through this message: react starts at -1; the only assignment before the
// ternary is followed by break, so !react cannot hold at the ternary.
test('C cancelled Medusa ugly alternative cannot be selected', () => {
 const c=readFileSync(new URL('../../../../nethack-c/upstream/src/mhitu.c', import.meta.url),'utf8');
 const start=c.indexOf('gazemu(struct monst *mtmp');
 const end=c.indexOf('? "doesn\'t look all that ugly"',start);
 const prefix=c.slice(start,end);
 assert.ok(start>=0 && end>start);
 assert.deepEqual([...prefix.matchAll(/\breact\s*=\s*([^;]+);/g)].map(x=>x[1]),['-1','is_medusa ? 4 : 2']);
 assert.match(prefix,/react = is_medusa \? 4 : 2;[^\n]*\n\s*break;/);
 assert.match(prefix,/is_medusa && mtmp->mcan && !react/);
});

for(const mode of ['cancelled','blind']) test(`visible ${mode} Medusa uses ineffectual gaze`,async()=>{
 await runSegment({seed:92841,datetime:'20261020120000',nethackrc:'OPTIONS=name:Probe,role:Valkyrie,race:human,gender:female,align:neutral\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none\n',moves:''});
 for(const col of game.level.monsters) col.fill(null);
 game.level.monlist=null;
 const m=newMonster({data:game.mons[PM_MEDUSA],m_id:6901,mx:game.u.ux+1,my:game.u.uy,mux:game.u.ux,muy:game.u.uy,mhp:40,mhpmax:40,mcanmove:1,mcansee:mode==='blind'?0:1,mcan:mode==='cancelled'?1:0,cham:NON_PM});
 place_monster(m,m.mx,m.my,game);game.level.monlist=m;
 assert.ok(canseemon(m,game),'fixture must be visible');
 const lines=[];const draws=[];
 await gazemu(m,{aatyp:AT_GAZE,adtyp:AD_STON,damn:0,damd:0},{state:game,random:{rn2(n){draws.push(n);throw Error('unexpected draw');}},message:async x=>lines.push(x)});
 assert.deepEqual(lines,['Medusa gazes ineffectually.']);assert.deepEqual(draws,[]);
 console.log(JSON.stringify({mode,lines,draws}));
});
