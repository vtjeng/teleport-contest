#!/usr/bin/env node
// Independent C-first human arrival/orc des loading cover Rog-loca.lua.
// A new Rog-strt direct load checks the separately accepted program boundary.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {W_NONDIGGABLE} from '../js/const.js';
import {SCR_TELEPORTATION} from '../js/objects.js';
import {PM_CHAMELEON,PM_GUARDIAN_NAGA,PM_LEPRECHAUN} from '../js/monsters.js';
import {runFreshMatrix,runMatrixCli} from './fresh-matrix.mjs';
import {validateCleanRecipe} from './diff-fresh.mjs';
import {verifyRogStrtSegment} from './run-rog-strt-level.mjs';

function linkedItems(head,next) {
    const items=[];
    for(let item=head;item;item=item[next]) items.push(item);
    return items;
}
export async function verifyRogLocaSegment(segment) {
    if(segment.moves.includes('Rog-strt.lua')) return verifyRogStrtSegment(segment);
    let boundary;
    await runSegment(segment,{onBoundary(error){boundary=error;}});
    assert.equal(boundary,undefined);
    assert.equal(game.level.flags.is_maze_lev,true); // Lua7.
    assert.equal(game.level.nroom,0); // Solidfill/map and lighting selection create no rooms.
    let protectedCells=0;
    for(let x=1;x<80;++x) for(let y=0;y<21;++y) // Whole playable grid.
        if(game.level.at(x,y).wall_info&W_NONDIGGABLE) ++protectedCells;
    assert.ok(protectedCells>0); // Lua42 protects map walls, preserved across flips.
    const stairs=linkedItems(game.stairs,'next');
    assert.equal(stairs.filter(s=>!s.up).length,1); // Lua40 always creates a down stair.
    assert.equal(stairs.filter(s=>s.up).length,1);
    // Lua39 creates the arrival stair. At dungeon level1, mkstairs refuses it,
    // but fixup_special adds the branch stair during direct-load finalization.
    const objects=linkedItems(game.level.objlist,'nobj');
    const scroll=objects.find(o=>o.otyp===SCR_TELEPORTATION&&o.cursed&&o.spe===0);
    assert.ok(scroll); // Lua44 cursed teleportation scroll precedes fourteen random objects.
    assert.equal(game.level.at(scroll.ox,scroll.oy).lit,true); // Lua35 lighting selection.
    assert.equal(game.level.traps.length,6); // Lua60–65 creates six random traps.
    const monsters=linkedItems(game.level.monlist,'nmon');
    assert.equal(monsters.length,33); // Lua67–99 includes fixed species and class draws.
    assert.ok(monsters.filter(m=>m.mnum===PM_LEPRECHAUN).length>=17); // Class l and shapes can add more.
    assert.ok(monsters.filter(m=>m.mnum===PM_GUARDIAN_NAGA).length>=7); // Class N and shapes can add more.
    assert.equal(monsters.filter(m=>m.cham===PM_CHAMELEON).length,5); // Lua95–99 retain natural form identity.
    assert.ok(monsters.every(m=>!m.mpeaceful)); // All tables explicitly peaceful=0.
}
export function runRogLocaMatrix() {
    const entries=['locate-human-arrival','locate-orc-des','start-outside-program'].map(label=>{
        const path=new URL(`../recipes/Rog-loca.lua/${label}.session.json`,import.meta.url);
        return {label,recipe:validateCleanRecipe(JSON.parse(readFileSync(path,'utf8')),path.pathname)};
    });
    return runFreshMatrix({entries,chunkLimit:1,summaryLabel:'ROG-LOCA LEVEL GENERATION',
        verifySegment:verifyRogLocaSegment});
}
runMatrixCli(import.meta.url,runRogLocaMatrix,'Rog-loca level generation');
