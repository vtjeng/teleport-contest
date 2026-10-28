import {readFileSync} from 'node:fs';
import {runDifferential} from '../../../../scripts/diff-fresh.mjs';
if(!process.argv[2])throw Error('Pass a new private output directory');
const recipe=JSON.parse(readFileSync(new URL('./recipe.json',import.meta.url)));
if(process.env.CONTROL)recipe.segments[0].nethackrc=recipe.segments[0].nethackrc.replace('OPTIONS=accessiblemsg','OPTIONS=!accessiblemsg');
console.log(JSON.stringify(await runDifferential(recipe,process.env,{evidenceDir:process.argv[2]})));
