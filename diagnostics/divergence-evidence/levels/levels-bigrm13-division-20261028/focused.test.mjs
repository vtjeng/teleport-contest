import assert from 'node:assert/strict';
import test from 'node:test';
import { BIGRM_LOADERS } from '../../../../js/bigrm.js';
import { initRng, enableRngLog, getRngLog } from '../../../../js/rng.js';

async function pillars(seed) {
    initRng(seed);
    enableRngLog();
    const coords = [];
    const des = Object.fromEntries(['level_init','level_flags','region','wallify',
        'non_diggable','stair','object','trap','monster'].map(name=>[name,()=>{}]));
    des.map = definition => {
        if (definition.coord) coords.push(definition.coord);
    };
    await BIGRM_LOADERS['bigrm-13'](des);
    return {coords, rng:getRngLog()};
}

test('corners and center uses Lua real division and places five pillars', async()=>{
    // Direct loader seed 4 draws rn2(8)=6, selecting source filter 7.
    // Lua (x/3)%2 == y%2 admits x={0,6} at y=0,2 and x=3 at y=1.
    const result=await pillars(4);
    assert.deepEqual(result.rng,['rn2(8)=6']);
    assert.deepEqual(result.coords,[[12,4],[66,4],[39,9],[12,14],[66,14]]);
});

test('slanted control retains explicit Lua floor division', async()=>{
    // Filter 8 uses //, unlike filter 7's /. Seed 24 draws rn2(8)=7.
    const result=await pillars(24);
    assert.deepEqual(result.rng,['rn2(8)=7']);
    assert.deepEqual(result.coords,[[12,4],[21,4],[30,9],[39,9],[48,9],[57,14],[66,14]]);
});
