import fs from 'node:fs';
import {compareSessionOutputs,formatReport,runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {runSegmentStrict as runSegment} from '../js/jsmain.js';
import {game} from '../js/gstate.js';
import {GameMap} from '../js/game.js';
import {AIR, ROOM, POOL, MOAT, WATER, LAVAPOOL, DOOR, D_CLOSED,
    HALLUC, BLINDED, FROMOUTSIDE, MAGICAL_BREATHING,
    TELEDS_TELEPORT} from '../js/const.js';
import {requireSimpleHeroDestination} from '../js/hack.js';
import {teleds} from '../js/teleport.js';
import {newsym} from '../js/display.js';
import {init_vision_globals, vision_reset, vision_recalc,
    transparencyIndexViews, liveVisionBufferViews} from '../js/vision.js';
import {light_globals_init} from '../js/light.js';

async function setup({hallu, blind, water = true, terrain = WATER}) {
    await runSegment({seed:8432212, datetime:'20270527100000',
        nethackrc:'OPTIONS=name:WetTeleNative,role:Healer,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n', moves:' '});
    game.level = new GameMap();
    game.head_engr = null;
    for (let x=2; x<16; ++x) for (let y=2; y<14; ++y) {
        game.level.at(x,y).typ = ROOM;
        game.level.at(x,y).lit = true;
    }
    game.u.ux = 5;
    game.u.uy = 7;
    game.level.at(5,7).typ = AIR;
    game.level.at(6,7).typ = terrain;
    if (terrain === DOOR) game.level.at(6,7).flags = D_CLOSED;
    if (water) game.u.uz = {...game.water_level};
    game.u.uprops[HALLUC].intrinsic = hallu ? FROMOUTSIDE : 0;
    game.u.uprops[BLINDED].intrinsic = blind ? 800 : 0;
    game.u.uprops[MAGICAL_BREATHING].intrinsic = FROMOUTSIDE;
    light_globals_init(game);
    init_vision_globals();
    vision_reset(game);
    vision_recalc(0);
}

function snapshot() {
    return {core:structuredClone(game.coreCtx), display:structuredClone(game.displayCtx),
        grid:structuredClone(game.nhDisplay.grid),
        buffers:liveVisionBufferViews().map(r=>Array.from(r)),
        index:transparencyIndexViews().map(r=>Array.from(r)),
        world:structuredClone(game.level.locations), invent:structuredClone(game.invent),
        floor:structuredClone(game.level.objlist), u:structuredClone(game.u),
        context:structuredClone(game.context), iflags:structuredClone(game.iflags),
        disp:structuredClone(game.disp), pending:game._pending_message,
        toplin:game.nhDisplay.toplin,
        cursor:[game.nhDisplay.cursorCol,game.nhDisplay.cursorRow,game.nhDisplay.cursorVisible]};
}

for (const hallu of [false,true]) for (const blind of [false,true]) {
    for (const terrain of [POOL,MOAT,WATER]) for (const water of [false,true]) {
        test(`liquid teleport destination admitted Hallu=${hallu} blind=${blind} water=${water} terrain=${terrain}`, async()=>{
            await setup({hallu,blind,water,terrain});
            const before = snapshot();
            // teleds() admits a pool, moat or Water square on any level; the
            // off-Water-level arrival is pinned by the independent C recording
            // recordings/teleport.c/dragon-teleports-onto-pool.session.json.
            assert.doesNotThrow(()=>requireSimpleHeroDestination(6,7,game));
            assert.deepEqual(snapshot(),before);
        });
    }
    for (const terrain of [LAVAPOOL,DOOR]) {
        // teleok() decides whether the hero may land here; the seam admits
        // every terrain and changes nothing. recordings/teleport.c/
        // wizard-teleport-onto-lava-levitating pins a lava arrival.
        test(`lava or door teleport destination admitted Hallu=${hallu} blind=${blind} terrain=${terrain}`, async()=>{
            await setup({hallu,blind,terrain});
            const before = snapshot();
            assert.doesNotThrow(()=>requireSimpleHeroDestination(6,7,game));
            assert.deepEqual(snapshot(),before);
        });
    }
    test(`live Water teleds uses canonical arrival Hallu=${hallu} blind=${blind}`, async()=>{
        const outcomes=[];
        for (const delegated of [false,true]) {
            await setup({hallu,blind});
            for (let n=0;n<100;++n) game.nhDisplay.pushKey(32);
            const draws=[];
            await teleds(6,7,TELEDS_TELEPORT,game,delegated ? {
                redraw:(x,y)=>{draws.push([x,y]);newsym(x,y);},
            } : {});
            assert.deepEqual([game.u.ux,game.u.uy],[6,7]);
            assert.equal(Boolean(game.u.uinwater),true);
            if (delegated) assert(draws.length>0);
            outcomes.push(snapshot());
        }
        assert.deepEqual(outcomes[0],outcomes[1]);
    });
}

for (const name of ['normal','monochrome','before-control','ordinary-control']) {
    test(`Water teleport destination ${name} matches independent C`,async()=>{
        const root=createScoringWorkspace(process.cwd(),[]);
        try {
            const c=JSON.parse(fs.readFileSync(new URL(
                `../recordings/teleport.c/water-teleport-destination-${name}.session.json`,import.meta.url)));
            const result=compareSessionOutputs(c,await runJsSession(c,root));
            assert.equal(result.passed,true,formatReport(result));
        } finally { removeScoringWorkspace(root); }
    });
}
