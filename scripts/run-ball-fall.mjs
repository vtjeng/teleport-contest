#!/usr/bin/env node
// Independent C-first shaft/pit inputs and relevant helmet/carry variations.
// Seeds1432801..1432805 were fixed before C observation or JavaScript results;
// retained comments describe C-only startup/trap/prompt setup corrections.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateCleanRecipe} from './diff-fresh.mjs';
import {runFreshMatrix,runMatrixCli} from './fresh-matrix.mjs';
import {runSegment} from '../js/jsmain.js';
import {game} from '../js/gstate.js';
import {HEAVY_IRON_BALL} from '../js/objects.js';
import {HELMET,FEDORA} from '../js/objects.js';
import {OBJ_INVENT,OBJ_FLOOR,TT_PIT} from '../js/const.js';

const names=['ballfall-shaft','ballfall-shaft-hard-helmet','ballfall-pit','ballfall-pit-soft-helmet','ballfall-shaft-carried'];
export async function runBallFallMatrix(){
    const entries=names.map(name=>({label:name,recipe:validateCleanRecipe(JSON.parse(readFileSync(new URL('../recipes/ball.c/'+name+'.session.json',import.meta.url),'utf8')))}));
    return runFreshMatrix({entries,summaryLabel:'ball falls',chunkLimit:1,
        verifySegment:async input=>{
            if(input.moves.includes(',a\n')){
                const pickupEnd=input.moves.indexOf(',')+1;
                await runSegment({...input,moves:input.moves.slice(0,pickupEnd)});
                assert.equal(game.uball?.otyp,HEAVY_IRON_BALL);
                assert.equal(game.uball?.where,OBJ_INVENT,'the source release branch starts with an actually carried ball');
            }
            await runSegment(input);
            assert.equal(game.uball?.otyp,HEAVY_IRON_BALL);
            assert.equal(game.uball?.where,OBJ_FLOOR,'placebc leaves the released ball on the floor');
            if(input.moves.includes('pit trap')){
                assert.equal(game.u.uz.dlevel,1);
                assert.equal(game.u.utraptype,TT_PIT,'the recipe enters a pit through the production trap path');
                assert.ok(game.u.utrap>0);
            }else{
                assert.equal(game.u.uz.dlevel,2,'shaft variation reaches goto_level');
            }
            if(input.moves.includes('uncursed helmet'))assert.equal(game.uarmh?.otyp,HELMET);
            if(input.moves.includes('uncursed fedora'))assert.equal(game.uarmh?.otyp,FEDORA);
            const gaps=game.unported??new Set();
            assert.equal(gaps.has('ball.c ballfall'),false);
            assert.equal(gaps.has('ball.c ballfall after pit'),false);
        },
    });
}
runMatrixCli(import.meta.url,runBallFallMatrix,'ball falls');
