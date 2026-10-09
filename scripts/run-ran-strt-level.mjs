#!/usr/bin/env node
// Independent C-first Ranger quest arrival and direct des loading cover
// dat/Ran-strt.lua. A separately accepted Ran-loca load pins the program boundary.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {ARROW_TRAP, BEAR_TRAP, PIT, SPIKED_PIT, TREE} from '../js/const.js';
import {CHEST, LEATHER_ARMOR, YA, YUMI} from '../js/objects.js';
import {PM_FOREST_CENTAUR, PM_HUNTER, PM_MINOTAUR, PM_ORION,
    PM_PLAINS_CENTAUR, PM_SCORPION} from '../js/monsters.js';
import {runFreshMatrix, runMatrixCli} from './fresh-matrix.mjs';
import {validateCleanRecipe} from './diff-fresh.mjs';
import {verifyRanLocaSegment} from './run-ran-loca-level.mjs';

function linkedItems(head, next) {
    const items=[];
    for(let item=head;item;item=item[next]) items.push(item);
    return items;
}

export async function verifyRanStrtSegment(segment) {
    if (segment.moves.includes('Ran-loca.lua')) return verifyRanLocaSegment(segment);
    let boundary;
    await runSegment(segment,{onBoundary(error){boundary=error;}});
    assert.equal(boundary,undefined);
    const flags=game.level.flags;
    assert.equal(flags.is_maze_lev,true);
    assert.equal(flags.noteleport,true);
    assert.equal(flags.hardfloor,true);
    assert.equal(flags.arboreal,true); // Lua15.
    let trees=0;
    for(let x=1;x<80;++x) for(let y=0;y<21;++y) // C playable grid.
        if(game.level.at(x,y).typ===TREE) ++trees;
    assert.ok(trees>0); // Lua18 replaces five percent of pre-map floor.
    const monsters=linkedItems(game.level.monlist,'nmon');
    assert.equal(monsters.length,36); // Lua49,57–64,75–101.
    const leader=monsters.filter(m=>m.mnum===PM_ORION);
    assert.equal(leader.length,1); // Lua49 creates Orion once.
    const inventory=linkedItems(leader[0].minvent,'nobj');
    assert.equal(inventory.length,3); // Lua50–52 replaces default inventory.
    assert.deepEqual(inventory.map(o=>[o.otyp,o.spe,o.quan]).sort((a,b)=>a[0]-b[0]),
        [[LEATHER_ARMOR,4,1],[YUMI,4,1],[YA,4,50]].sort((a,b)=>a[0]-b[0]));
    assert.ok(linkedItems(game.level.objlist,'nobj').some(o=>o.otyp===CHEST
        &&o.ox===leader[0].mx&&o.oy===leader[0].my)); // Lua55 floor chest, not leader inventory.
    for(const [type,count] of [[PM_HUNTER,8],[PM_MINOTAUR,1],
        [PM_FOREST_CENTAUR,18],[PM_PLAINS_CENTAUR,6],[PM_SCORPION,2]])
        assert.equal(monsters.filter(m=>m.mnum===type).length,count); // All fixed source species.
    const siege=monsters.filter(m=>m.mnum!==PM_ORION&&m.mnum!==PM_HUNTER);
    assert.ok(siege.every(m=>!m.mpeaceful)); // Lua75–101 explicit hostile tables.
    assert.equal(monsters.find(m=>m.mnum===PM_MINOTAUR).msleeping,true); // Lua75.
    for(const [type,count] of [[ARROW_TRAP,2],[PIT,1],[SPIKED_PIT,1],[BEAR_TRAP,2]])
        assert.equal(game.level.traps.filter(t=>t.ttyp===type).length,count); // Lua68–73.
    assert.equal(linkedItems(game.stairs,'next').filter(s=>!s.up).length,1); // Lua45.
}

export function runRanStrtMatrix() {
    const entries=['start-human-arrival','start-elf-des','locate-outside-program'].map(label=>{
        const url=new URL(`../recipes/Ran-strt.lua/${label}.session.json`,import.meta.url);
        return {label,recipe:validateCleanRecipe(JSON.parse(readFileSync(url,'utf8')),url.pathname)};
    });
    return runFreshMatrix({entries,chunkLimit:1,summaryLabel:'RAN-STRT LEVEL GENERATION',
        verifySegment:verifyRanStrtSegment});
}
runMatrixCli(import.meta.url,runRanStrtMatrix,'Ran-strt level generation');
