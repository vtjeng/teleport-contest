import {readFileSync} from 'node:fs';
import {runDifferential} from '../../../../scripts/diff-fresh.mjs';
if(!process.argv[2])throw Error('Pass a NEW private output directory');
const recipe=JSON.parse(readFileSync(new URL('./recipe.json',import.meta.url)));
const result=await runDifferential(recipe,process.env,{evidenceDir:process.argv[2]});
console.log(JSON.stringify(result));
