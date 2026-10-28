import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runDifferential} from '../../../../scripts/diff-fresh.mjs';
const [which,out]=process.argv.slice(2);
if(!['target','control'].includes(which)||!out)throw new Error('Usage: node record.mjs target|control NEW_PRIVATE_OUTPUT_DIRECTORY');
const recipe=JSON.parse(readFileSync(new URL(`./${which}.recipe.session.json`,import.meta.url)));
console.log(JSON.stringify(await runDifferential(recipe,process.env,{evidenceDir:resolve(out)})));
