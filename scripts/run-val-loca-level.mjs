#!/usr/bin/env node
// Independent natural, sighted direct and blind direct Val-loca generation.
// C refs: dat/Val-loca.lua and required fixed-stair/ice descriptor semantics.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {ICE, ICED_POOL, ROOM, FIRE_TRAP} from '../js/const.js';
import {PM_FIRE_ANT, PM_FIRE_GIANT} from '../js/monsters.js';
import {runFreshMatrix, runMatrixCli} from './fresh-matrix.mjs';
import {validateCleanRecipe} from './diff-fresh.mjs';

export async function verifyValLocaSegment(segment) {
    let boundary;
    await runSegment(segment, {onBoundary:error=>boundary=error});
    assert.equal(boundary, undefined);
    assert.equal(game.level.flags.is_maze_lev, true);
    assert.equal(game.level.flags.hardfloor, true); // Lua8.
    let ice = 0;
    for (let x=1; x<80; ++x) for (let y=0; y<21; ++y) { // Source whole grid.
        const location=game.level.at(x,y);
        if (location.typ===ICE) {
            ++ice;
            assert.equal(location.icedpool, ICED_POOL); // Lua icedpools -> mkmap.c finish_map.
        }
    }
    assert.ok(ice>0); // Lua10 uses ice as the lit mines background.
    const monsters=[];
    for (let m=game.level.monlist; m; m=m.nmon) monsters.push(m);
    assert.equal(monsters.length,27); // Lua58–84: 18 ants and nine giants.
    assert.ok(monsters.filter(m=>m.mnum===PM_FIRE_ANT).length>=17);
    assert.ok(monsters.filter(m=>m.mnum===PM_FIRE_GIANT).length>=7); // Class draws may add more.
    assert.ok(game.level.traps.filter(t=>t.ttyp===FIRE_TRAP).length>=4); // Lua51–54; random traps may also be fire.
    const stairs=[];
    for (let s=game.stairs; s; s=s.next) stairs.push(s);
    // Lua noflip preserves centered origin(21,5) for the 40x13 fragment.
    assert.ok(stairs.some(s=>!s.up&&s.sx===41&&s.sy===11)); // Lua31: relative(20,6).
    if (segment.seed===19636113) {
        assert.ok(stairs.some(s=>s.up&&s.sx===69&&s.sy===19)); // Lua30: relative(48,14), outside fragment.
    } else {
        // Direct loading at dungeon level1 refuses the up stair, after
        // mkstairs(force=true) converts its fixed coordinate to ROOM.
        assert.equal(game.level.at(69,19).typ, ROOM);
    }
}

export function runValLocaMatrix() {
    const entries=['locate-human-arrival','locate-dwarf-des','locate-dwarf-sighted-des'].map(label=>{
        const url=new URL(`../recipes/Val-loca.lua/${label}.session.json`,import.meta.url);
        return {label,recipe:validateCleanRecipe(JSON.parse(readFileSync(url,'utf8')),url.pathname)};
    });
    return runFreshMatrix({entries,chunkLimit:1,summaryLabel:'VAL-LOCA LEVEL GENERATION',
        verifySegment:verifyValLocaSegment});
}
runMatrixCli(import.meta.url,runValLocaMatrix,'Val-loca level generation');
