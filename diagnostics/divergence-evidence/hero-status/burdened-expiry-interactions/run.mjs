import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { runDifferential } from '../../../../scripts/diff-fresh.mjs';
import { loadHeroTimeoutRecipes, verifyHeroTimeoutSegment } from '../../../../scripts/run-hero-timeouts.mjs';
import { runSegment } from '../../../../js/jsmain.js';
import { game } from '../../../../js/gstate.js';
import { near_capacity } from '../../../../js/hack.js';
import { CONFUSION, BLINDED, DEAF, DISPLACED, TIMEOUT, NORMAL_SPEED } from '../../../../js/const.js';
const mode = process.argv[2];
const out = process.argv[3];
assert.ok(['target', 'control'].includes(mode) && out, 'run.mjs target|control OUTPUT_DIRECTORY (new directory)');
mkdirSync(out);
const props = [['confusion', CONFUSION, 'g'], ['blindness', BLINDED, 'i'], ['deafness', DEAF, 'j'], ['displacement', DISPLACED, '>e']];
const base = JSON.parse(readFileSync('recipes/timeout.c/displacement-expiry.session.json'));
const entries = mode === 'control' ? loadHeroTimeoutRecipes() : [];
// Fixed finite matrix, no seed scan: reuse the documented region-free public-input seed.
if (mode === 'target') for (const burdened of [true]) for (let a=0;a<4;a++) for (let b=a+1;b<4;b++) for (const times of [[1,1],[1,2],[2,1]]) {
  const setup = (burdened ? '\x17uncursed plate mail\n \x17uncursed plate mail\n  ' : '') + '.'
    + [a,b].map((p,i) => '#wizintrinsic\n' + (p===3?'>':'') + times[i] + (p===3?'e':props[p][2]) + '\n ').join('');
  const recipe = structuredClone(base);
  recipe.comment = 'Finite public-input paired ordinary status expiry audit; no injected state.';
  recipe.segments[0].moves = setup + '. . ';
  entries.push({label:`${burdened?'burdened':'normal'}-${props[a][0]}-${props[b][0]}-${times.join('-')}`,recipe,setup, selected:[a,b],times,burdened});
}
const results=[];
for (const entry of entries) {
 const snapshots=[];
 if (mode==='control') await verifyHeroTimeoutSegment(entry.recipe.segments[0]);
 else for (let elapsed=0;elapsed<=2;elapsed++) {
   let boundary;
   await runSegment({...entry.recipe.segments[0], moves:entry.setup + '. '.repeat(elapsed)}, {onBoundary:e=>boundary=e});
   assert.equal(boundary,undefined);
   const values=entry.selected.map(p=>game.u.uprops[props[p][1]].intrinsic & TIMEOUT);
   assert.deepEqual(values,entry.times.map(t=>Math.max(0,t-elapsed)),`${entry.label} elapsed ${elapsed}`);
   assert.equal(near_capacity(game)>0,entry.burdened);
   assert.ok(game.u.umovement>=NORMAL_SPEED);
   snapshots.push({elapsed,values,movement:game.u.umovement,capacity:near_capacity(game),message:game._ttyToplines});
 }
 const dir=join(out,entry.label);
 const result=await runDifferential(entry.recipe,process.env,{evidenceDir:dir});
 // Retain exact raw oracle and JS boundary evidence as compressed bytes.
 for (const name of readdirSync(dir)) { const path=join(dir,name); writeFileSync(path+'.gz',gzipSync(readFileSync(path))); rmSync(path); }
 const row={label:entry.label,result,snapshots}; results.push(row);
 writeFileSync(join(out,'results.json'),JSON.stringify(results,null,2)+'\n');
 console.log(entry.label, result.passed?'PASS':'MISMATCH', JSON.stringify(result.lengths));
 if(!result.passed) process.exitCode=1;
}
console.log(`${mode}: ${results.filter(r=>r.result.passed).length}/${results.length} comparisons matched`);
