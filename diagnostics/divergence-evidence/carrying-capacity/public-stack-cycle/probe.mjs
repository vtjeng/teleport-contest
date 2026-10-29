import {readFileSync,writeFileSync} from 'node:fs';
import {runDifferential,formatReport} from '../../../../scripts/diff-fresh.mjs';
const recipe=JSON.parse(readFileSync(process.argv[2],'utf8'));
const output=process.argv[3];
if(!output) throw new Error('usage: node probe.mjs recipe.session.json fresh-output-directory');
try {
 const result=await runDifferential(recipe,process.env,{evidenceDir:output});
 writeFileSync(`${output}/comparison.json`,JSON.stringify(result,null,2)+'\n');
 console.log(formatReport(result));
 process.exitCode=result.passed?0:1;
} catch(error) { console.error(error.message); process.exitCode=2; }
