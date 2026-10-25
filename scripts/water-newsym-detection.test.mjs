import fs from 'node:fs';
import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import {runJsSession,compareSessionOutputs,formatReport} from './diff-fresh.mjs';
import assert from 'node:assert/strict';import test from 'node:test';
import {runSegment} from '../js/jsmain.js';import {game} from '../js/gstate.js';import {GameMap} from '../js/game.js';import {newMonster,place_monster} from '../js/monst.js';import {PM_GOBLIN,NUMMONS} from '../js/monsters.js';
import {BLINDED,HALLUC,DETECT_MONSTERS,SEE_INVIS,TELEPAT,WARN_OF_MON,ROOM} from '../js/const.js';
import {GLYPH_DETECT_MALE_OFF,GLYPH_DETECT_FEM_OFF,GLYPH_MON_MALE_OFF} from '../js/glyph_offsets.js';
import {newsym} from '../js/display.js';import {init_vision_globals,vision_reset,vision_recalc,cansee} from '../js/vision.js';import {light_globals_init} from '../js/light.js';
async function setup(visible,hallu,water,wet){
 await runSegment({seed:8432258,datetime:'20270619100000',nethackrc:'OPTIONS=name:WaterDetection,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n',moves:' '});
 game.level=new GameMap();for(let x=2;x<=20;x++)for(let y=2;y<15;y++){game.level.at(x,y).typ=ROOM;game.level.at(x,y).lit=true;}
 game.level.flags.hero_memory=true;game.u.ux=5;game.u.uy=7;game.u.uinwater=wet;game.water_level=water?{...game.u.uz}:{dnum:99,dlevel:1};
 for(const p of [HALLUC,DETECT_MONSTERS,SEE_INVIS,TELEPAT,WARN_OF_MON])game.u.uprops[p]={intrinsic:0,extrinsic:0,blocked:0};game.u.uprops[BLINDED]={intrinsic:visible?0:800,extrinsic:0,blocked:0};
 const mon=newMonster({data:game.mons[PM_GOBLIN],mnum:PM_GOBLIN,m_id:9911,mhp:8,mhpmax:8,minvis:true,female:false,mcansee:true,mcanmove:true});game.level.monlist=mon;place_monster(mon,9,7,game);
 light_globals_init(game);init_vision_globals();vision_reset(game);vision_recalc(0);newsym(9,7);mon.meverseen=0;game.u.uprops[HALLUC].intrinsic=hallu?800:0;return mon;
}
for(const water of [false,true])for(const wet of [false,true])for(const visible of [false,true])for(const hallu of [false,true])for(const owner of ['intrinsic','extrinsic'])for(const blocked of [0,1])test(`direct newsym detection Water=${water} wet=${wet} visible=${visible} H=${hallu} ${owner} blocked=${blocked}`,async()=>{
 const mon=await setup(visible,hallu,water,wet);game.u.uprops[DETECT_MONSTERS][owner]=800;game.u.uprops[DETECT_MONSTERS].blocked=blocked;
 const cell=game.level.at(9,7),before=structuredClone(cell.disp_glyph),core=structuredClone(game.coreCtx),display=structuredClone(game.displayCtx);const expected=!(wet&&!water);
 if(expected)assert.equal(Boolean(cansee(9,7)),visible);newsym(9,7);
 if(expected){const glyph=cell.disp_glyph.glyph;if(!hallu){assert.equal(glyph,GLYPH_DETECT_MALE_OFF+PM_GOBLIN);assert.equal(mon.meverseen,1);}else assert.ok((glyph>=GLYPH_DETECT_MALE_OFF&&glyph<GLYPH_DETECT_MALE_OFF+NUMMONS)||(glyph>=GLYPH_DETECT_FEM_OFF&&glyph<GLYPH_DETECT_FEM_OFF+NUMMONS));}
 else assert.deepEqual(cell.disp_glyph,before);
 assert.deepEqual(game.coreCtx,core);if(expected&&hallu)assert.notDeepEqual(game.displayCtx,display);else assert.deepEqual(game.displayCtx,display);
});
for(const visible of [false,true])for(const sense of ['telepathy','warning'])test(`direct see_it Water underwater ${sense} visible=${visible}`,async()=>{
 const mon=await setup(visible,false,true,true);
 if(sense==='telepathy'){game.u.uprops[TELEPAT].extrinsic=1;game.u.unblind_telepat_range=100;}
 else{game.u.uprops[WARN_OF_MON].intrinsic=1;game.context.warntype={species:mon.data,obj:0,polyd:0};}
 newsym(9,7);assert.equal(game.level.at(9,7).disp_glyph.glyph,GLYPH_MON_MALE_OFF+PM_GOBLIN);
});
for(const visible of [false,true])test('Water underwater without detection remains hidden visible='+visible,async()=>{const mon=await setup(visible,false,true,true);const before=structuredClone(game.level.at(9,7).disp_glyph);newsym(9,7);assert.deepEqual(game.level.at(9,7).disp_glyph,before);assert.equal(mon.meverseen,0);});

for(const name of ['normal','monochrome','before-control','ordinary-control'])test('Water newsym direct detection '+name+' matches independent C',async()=>{const root=createScoringWorkspace(process.cwd(),[]);try{const c=JSON.parse(fs.readFileSync(new URL('../recordings/display.c/newsym-water-detection-'+name+'.session.json',import.meta.url)));const result=compareSessionOutputs(c,await runJsSession(c,root));assert.equal(result.passed,true,formatReport(result));}finally{removeScoringWorkspace(root);}});
