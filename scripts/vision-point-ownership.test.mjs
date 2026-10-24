import fs from 'node:fs';
import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import {runJsSession,compareSessionOutputs,formatReport} from './diff-fresh.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {runSegment} from '../js/jsmain.js';
import {game} from '../js/gstate.js';
import {GameMap} from '../js/game.js';
import {ROOM, WATER, HALLUC, BLINDED, COULD_SEE} from '../js/const.js';
import {init_vision_globals, vision_reset, vision_recalc, block_point,
    unblock_point, recalc_block_point, clear_path, transparencyIndexViews} from '../js/vision.js';
import {light_globals_init} from '../js/light.js';
import {admitPlannedVisionChange, preflightElapsedTurnTail,
    preflightSimpleMonsterActions} from '../js/unported_monster_actions.js';

async function setup(hallu, blind) {
    await runSegment({seed:8432148,datetime:'20270324100000',nethackrc:'OPTIONS=name:PointVision,role:Healer,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n',moves:' '});
    game.level=new GameMap();
    for(let x=2;x<18;x++)for(let y=2;y<15;y++) {
        game.level.at(x,y).typ=ROOM;game.level.at(x,y).lit=true;
    }
    game.level.monlist=null;game.u.ux=5;game.u.uy=7;game.u.umovement=0;
    game.u.uprops[HALLUC].intrinsic=hallu?800:0;
    game.u.uprops[BLINDED].intrinsic=blind?800:0;
    light_globals_init(game);init_vision_globals();vision_reset(game);vision_recalc(0);
}
const index=()=>transparencyIndexViews().map(row=>Array.from(row));
for(const hallu of [false,true])for(const blind of [false,true]) {
    test(`explicit vision point lifecycle Hallu=${hallu} Blind=${blind}`,async()=>{
        await setup(hallu,blind);
        // C block/unblock own the index even when terrain says the opposite.
        // A second point must preserve the first override rather than derive it.
        game.level.at(7,7).typ=WATER;
        recalc_block_point(7,7,game);
        assert.equal(clear_path(5,7,10,7),0);
        unblock_point(7,7,game);
        assert.equal(clear_path(5,7,10,7),1);
        block_point(8,7,game);
        assert.equal(clear_path(5,7,10,7),0);
        assert.equal(index()[7][7],1);
        unblock_point(8,7,game);
        vision_recalc(0);
        assert.ok(game.viz_array[7][10]&COULD_SEE);
        // Only recalc consults does_block; reset also intentionally derives it.
        recalc_block_point(7,7,game);
        assert.equal(clear_path(5,7,10,7),0);
        unblock_point(7,7,game);
        vision_reset(game);
        assert.equal(clear_path(5,7,10,7),0);
    });
    for(const tail of [false,true])for(const fail of [false,true]) {
        test(`borrow exact vision index Hallu=${hallu} Blind=${blind} tail=${tail} fail=${fail}`,async()=>{
            await setup(hallu,blind);
            game.level.at(7,7).typ=WATER;
            unblock_point(7,7,game);
            block_point(8,8,game);
            const before={index:index(),core:structuredClone(game.coreCtx),display:structuredClone(game.displayCtx),grid:structuredClone(game.nhDisplay.grid),hp:game.u.uhp,flag:game.vision_full_recalc};
            const sentinel=new Error('planned boundary');
            let calls=0;
            const callback=async planned=>{
                calls++;
                admitPlannedVisionChange(7,7,planned);block_point(7,7,planned);
                admitPlannedVisionChange(8,8,planned);unblock_point(8,8,planned);
                vision_recalc(0,{state:planned,redraw(){}});
                assert.equal(clear_path(5,7,10,7),0);
                if(fail)throw sentinel;
                return true;
            };
            const run=()=>tail?preflightElapsedTurnTail(game,callback):preflightSimpleMonsterActions(game,{consumeHeroRation:false,advanceRound:callback});
            if(fail)await assert.rejects(run,error=>error===sentinel);else await run();
            assert.equal(calls,1);
            assert.deepEqual(index(),before.index);
            assert.deepEqual(game.coreCtx,before.core);assert.deepEqual(game.displayCtx,before.display);
            assert.deepEqual(game.nhDisplay.grid,before.grid);assert.equal(game.u.uhp,before.hp);
            assert.equal(game.vision_full_recalc,before.flag);
            assert.equal(clear_path(5,7,10,7),1);
        });
    }
}
for(const hallu of [false,true])for(const blind of [false,true]) {
    test(`ordinary obstruction refresh control Hallu=${hallu} Blind=${blind}`,async()=>{
        await setup(hallu,blind);
        const core=structuredClone(game.coreCtx),display=structuredClone(game.displayCtx);
        game.level.at(7,7).typ=WATER;recalc_block_point(7,7,game);
        assert.equal(clear_path(5,7,10,7),0);
        game.level.at(7,7).typ=ROOM;recalc_block_point(7,7,game);
        assert.equal(clear_path(5,7,10,7),1);
        assert.deepEqual(game.coreCtx,core);assert.deepEqual(game.displayCtx,display);
    });
}
for(const edge of [0,79])test('explicit point source boundary '+edge,async()=>{
    await setup(false,false);
    const core=structuredClone(game.coreCtx),display=structuredClone(game.displayCtx);
    const neighbor=edge===0?1:78;
    const far=edge===0?2:77;
    unblock_point(edge,7,game);unblock_point(neighbor,7,game);
    let views=index();
    assert.equal(views[7][edge],1);assert.equal(views[7][neighbor],1);
    assert.equal(views[(edge===0?42:21)+7][edge],edge===0?18:far);
    block_point(neighbor,7,game);views=index();
    assert.equal(views[7][neighbor],0);assert.equal(views[7][edge],1);
    assert.equal(views[(edge===0?42:21)+7][edge],neighbor);
    assert.deepEqual(game.coreCtx,core);assert.deepEqual(game.displayCtx,display);
});

for(const name of ['normal','monochrome','before-control'])test('explicit vision point ownership '+name+' matches independent C',async()=>{const root=createScoringWorkspace(process.cwd(),[]);try{const c=JSON.parse(fs.readFileSync(new URL('../recordings/vision.c/point-ownership-'+name+'.session.json',import.meta.url)));const result=compareSessionOutputs(c,await runJsSession(c,root));assert.equal(result.passed,true,formatReport(result));}finally{removeScoringWorkspace(root);}});
