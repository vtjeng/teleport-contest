import {readFileSync} from 'node:fs';
import {runDifferential} from '../../../../scripts/diff-fresh.mjs';
if(!process.argv[2])throw new Error('Pass a NEW absolute private output directory');
const recipe=JSON.parse(readFileSync(new URL('./wand-route.recipe.json',import.meta.url),'utf8'));
console.log(JSON.stringify(await runDifferential(recipe,process.env,{evidenceDir:process.argv[2]})));
