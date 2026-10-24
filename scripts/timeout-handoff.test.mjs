import assert from 'node:assert/strict';
import test from 'node:test';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { finishElapsedTurn } from '../js/allmain.js';
import { BLINDED, HALLUC, TIMEOUT } from '../js/const.js';
import { getRngLog, rn1, rn2, rnd } from '../js/rng.js';
import fs from 'node:fs';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';
import { clearTtyMessageWindow } from '../js/tty_message.js';

for (const [property, duration] of [[BLINDED, 3], [BLINDED, 1], [HALLUC, 0], [HALLUC, 1]]) {
    test(`honor a requested timeout handoff property=${property} duration=${duration}`, async () => {
        const outcomes=[];
        for (const timeoutHandoff of [false, true]) {
            await runSegment({seed:8432061,datetime:'20270117100000',nethackrc:'OPTIONS=name:TimeoutOwner,role:Healer,race:human,gender:female,align:neutral,pettype:none,!debug_mongen,!acoustics,!legacy,!tutorial,!splash_screen,!tips\n',moves:''});
            for(const column of game.level.monsters)column.fill(null);
            game.level.monlist=null;game.level.regions=[];game.head_engr=null;
            game.u.uprops[BLINDED].intrinsic=0;game.u.uprops[BLINDED].extrinsic=0;
            game.u.uprops[HALLUC].intrinsic=0;game.u.uprops[HALLUC].extrinsic=0;
            game.u.uprops[property].intrinsic=duration;
            game.context.seer_turn=100000;game.context.next_attrib_check=100000;
            game.u.uhunger=900;game.u.ublesscnt=9;
            clearTtyMessageWindow(game);
            for(let i=0;i<12;i++)game.nhDisplay.pushKey(10);
            const start=getRngLog().length;
            const result=await finishElapsedTurn(game,{rn1,rn2,rnd},{timeoutHandoff});
            assert.equal(game.u.uprops[property].intrinsic & TIMEOUT,Math.max(0,duration-1));
            if(timeoutHandoff)assert.equal(result?.afterTimeout,true,'the requested live handoff replans its tail even when no timeout expires');
            outcomes.push({rng:getRngLog().slice(start),core:structuredClone(game.coreCtx),display:structuredClone(game.displayCtx),moves:game.moves,hp:game.u.uhp,pw:game.u.uen,hunger:game.u.uhunger,bless:game.u.ublesscnt,movement:game.u.umovement,heroSequence:game.hero_seq,props:structuredClone(game.u.uprops)});
        }
        assert.deepEqual(outcomes[1],outcomes[0],'handoff preserves actual timeout and tail effects without fabricating expiry or draws');
    });
}

for (const name of ['normal', 'monochrome', 'before-control']) {
    test('timeout handoff ' + name + ' matches independent C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const c = JSON.parse(fs.readFileSync(new URL('../recordings/allmain.c/timeout-handoff-' + name + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally { removeScoringWorkspace(root); }
    });
}
