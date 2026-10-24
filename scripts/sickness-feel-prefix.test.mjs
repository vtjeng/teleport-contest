import fs from 'node:fs';
import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import {runJsSession,compareSessionOutputs,formatReport} from './diff-fresh.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {make_sick} from '../js/potion.js';
import {planningState} from '../js/unported_monster_actions.js';
import {createCoreRandom,cloneIsaacContext} from '../js/rng.js';
import {delayed_killer,find_delayed_killer} from '../js/end.js';
import {A_CON,SICK,SICK_RES,SICK_ALL,SICK_NONVOMITABLE,SICK_VOMITABLE,FAINTED,NOT_HUNGRY,KILLED_BY_AN} from '../js/const.js';
const cases=[
    {name:'new',old:0,kinds:0,time:20,type:SICK_NONVOMITABLE,talk:false,suffix:'deathly sick.',after:20,afterKinds:SICK_NONVOMITABLE},
    {name:'much worse',old:30,kinds:SICK_NONVOMITABLE,time:10,type:SICK_NONVOMITABLE,talk:true,suffix:'much worse.',after:10,afterKinds:SICK_NONVOMITABLE},
    {name:'even worse',old:30,kinds:SICK_NONVOMITABLE,time:29,type:SICK_NONVOMITABLE,talk:true,suffix:'even worse.',after:29,afterKinds:SICK_NONVOMITABLE},
    {name:'partial cure',old:30,kinds:SICK_ALL,time:0,type:SICK_NONVOMITABLE,talk:true,suffix:'somewhat better.',after:60,afterKinds:SICK_VOMITABLE},
    {name:'full cure',old:30,kinds:SICK_NONVOMITABLE,time:0,type:SICK_ALL,talk:true,suffix:'cured.  What a relief!',after:0,afterKinds:0},
    {name:'quiet worsening',old:30,kinds:SICK_NONVOMITABLE,time:10,type:SICK_NONVOMITABLE,talk:false,suffix:null,after:10,afterKinds:SICK_NONVOMITABLE},
    {name:'resistant',old:0,kinds:0,time:20,type:SICK_NONVOMITABLE,talk:false,suffix:null,after:0,afterKinds:0,resistant:true},
];
for(const awareness of ['awake','paralyzed','sleeping','fainted'])for(const c of cases)test(`sickness sensation ${awareness} ${c.name}`,async()=>{
    const outcomes=[];
    for(const planning of [false,true]){
        await runSegment({seed:8432158,datetime:'20270403100000',nethackrc:'OPTIONS=name:SickFeel,role:Healer,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n',moves:' '});
        game.multi=awareness==='awake'?0:-4;game.u.usleep=awareness==='sleeping'?1:0;
        game.u.uhs=awareness==='fainted'?FAINTED:NOT_HUNGRY;game.u.uhunger=awareness==='fainted'?-10:900;
        game.nomovemsg=awareness==='sleeping'?'You wake up.':'You can move again.';
        game.u.uprops[SICK].intrinsic=c.old;game.u.usick_type=c.kinds;
        game.u.uprops[SICK_RES].intrinsic=c.resistant?1:0;game.u.uprops[SICK_RES].extrinsic=0;
        game.u.aexe[A_CON]=0;game.killer={name:'',format:KILLED_BY_AN,next:null};
        if(c.old)delayed_killer(SICK,KILLED_BY_AN,'Pestilence',game);
        const state=planning?planningState(game):game;
        if(planning){game.multi=awareness==='awake'?-4:0;game.u.usleep=awareness==='awake'?1:0;game.u.uhs=NOT_HUNGRY;game.u.uhunger=900;game.nomovemsg=awareness==='awake'?'You wake up.':null;}
        const before={u:structuredClone(game.u),killer:structuredClone(game.killer),context:structuredClone(game.context),core:structuredClone(game.coreCtx),display:structuredClone(game.displayCtx),grid:structuredClone(game.nhDisplay.grid),disp:structuredClone(game.disp),multi:game.multi,nomovemsg:game.nomovemsg};
        const core=planning?cloneIsaacContext(state.coreCtx):state.coreCtx,lines=[],hp=state.u.uhp;
        await make_sick(c.time,'Pestilence',c.talk,c.type,state,{planning,random:createCoreRandom(core,state),message:async line=>{assert.equal(state.u.uprops[SICK].intrinsic,c.old);lines.push(line);},encumberMessage:async()=>{}});
        const dreaming=awareness==='sleeping'||awareness==='fainted';
        assert.deepEqual(lines,c.suffix?[`You ${dreaming?'dream that you feel':'feel'} ${c.suffix}`]:[]);
        assert.equal(state.u.uprops[SICK].intrinsic,c.after);assert.equal(state.u.usick_type,c.afterKinds);assert.equal(state.u.uhp,hp);
        const killer=find_delayed_killer(SICK,state);if(c.after){assert.equal(killer.name,'Pestilence');assert.equal(killer.format,KILLED_BY_AN);}else assert.equal(killer,null);
        outcomes.push({core:structuredClone(core),sick:state.u.uprops[SICK].intrinsic,kinds:state.u.usick_type,constitution:state.u.aexe[A_CON],killer:structuredClone(state.killer),hp:state.u.uhp,disp:structuredClone(state.disp)});
        assert.deepEqual(game.displayCtx,before.display);assert.deepEqual(game.nhDisplay.grid,before.grid);
        if(planning){assert.deepEqual(game.u,before.u);assert.deepEqual(game.killer,before.killer);assert.deepEqual(game.context,before.context);assert.deepEqual(game.coreCtx,before.core);assert.deepEqual(game.disp,before.disp);assert.equal(game.multi,before.multi);assert.equal(game.nomovemsg,before.nomovemsg);}
    }
    assert.deepEqual(outcomes[0],outcomes[1]);
});

for(const name of ['normal','monochrome','before-control'])test('sickness sensation prefix '+name+' matches independent C',async()=>{const root=createScoringWorkspace(process.cwd(),[]);try{const c=JSON.parse(fs.readFileSync(new URL('../recordings/potion.c/sickness-feel-prefix-'+name+'.session.json',import.meta.url)));const result=compareSessionOutputs(c,await runJsSession(c,root));assert.equal(result.passed,true,formatReport(result));}finally{removeScoringWorkspace(root);}});
