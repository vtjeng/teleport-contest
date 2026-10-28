import {readFileSync,writeFileSync} from 'node:fs';
import {runDifferential,formatReport} from '../../../../scripts/diff-fresh.mjs';
const recipe=JSON.parse(readFileSync(new URL(process.argv[3]??'./recipe.session.json',import.meta.url)));
const out=process.argv[2];if(!out)throw Error('pass a new private output directory');
const result=await runDifferential(recipe,process.env,{evidenceDir:out});
writeFileSync(out+'/result.json',JSON.stringify(result,null,2));
console.log(formatReport(result));
