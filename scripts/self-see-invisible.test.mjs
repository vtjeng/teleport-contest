import fs from 'node:fs';
import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import {runJsSession,compareSessionOutputs,formatReport} from './diff-fresh.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {runSegment} from '../js/jsmain.js';
import {game} from '../js/gstate.js';
import {GameMap} from '../js/game.js';
import {ROOM,INVIS,SEE_INVIS,BLINDED,TELEPAT,DETECT_MONSTERS,HALLUC} from '../js/const.js';
import {newsym,glyph_at} from '../js/display.js';
import {light_globals_init} from '../js/light.js';
import {init_vision_globals,vision_reset,vision_recalc} from '../js/vision.js';
for(const invisible of [false,true])for(const seeInvisible of [false,true])for(const blind of [false,true])test(`hero self glyph invisible=${invisible} seeInvisible=${seeInvisible} blind=${blind}`,async()=>{
 await runSegment({seed:8432324,datetime:'20270825100000',nethackrc:'OPTIONS=name:SelfSightOwner,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n',moves:''});
 game.level=new GameMap();for(let x=2;x<22;x++)for(let y=2;y<16;y++){game.level.at(x,y).typ=ROOM;game.level.at(x,y).lit=true;}
 game.u.ux=5;game.u.uy=7;game.u.uswallow=0;game.u.uundetected=false;
 for(const prop of [INVIS,SEE_INVIS,BLINDED,TELEPAT,DETECT_MONSTERS,HALLUC]){game.u.uprops[prop].intrinsic=0;game.u.uprops[prop].extrinsic=0;game.u.uprops[prop].blocked=0;}
 light_globals_init(game);init_vision_globals();vision_reset(game);vision_recalc(0);newsym(5,7);newsym(6,7);
 const heroGlyph=glyph_at(5,7),floorGlyph=glyph_at(6,7),core=structuredClone(game.coreCtx);assert.notEqual(heroGlyph,floorGlyph);
 game.u.uprops[INVIS].intrinsic=invisible?100:0;game.u.uprops[SEE_INVIS].intrinsic=seeInvisible?100:0;game.u.uprops[BLINDED].intrinsic=blind?100:0;
 vision_recalc(0);newsym(5,7);
 assert.equal(glyph_at(5,7),(!invisible||seeInvisible||blind)?heroGlyph:floorGlyph);
 assert.deepEqual(game.coreCtx,core);
});

// C display.h canseeself uses Invisible, which excludes See_invisible.
for(const name of ['normal','monochrome','hallucinating','before-control','ordinary-control'])test(`self see-invisible ${name} matches independent C`,async()=>{
 const root=createScoringWorkspace(process.cwd(),[]);
 try{const c=JSON.parse(fs.readFileSync(new URL(`../recordings/display.c/self-see-invisible-${name}.session.json`,import.meta.url)));const result=compareSessionOutputs(c,await runJsSession(c,root));assert.equal(result.passed,true,formatReport(result));}finally{removeScoringWorkspace(root);}
});
