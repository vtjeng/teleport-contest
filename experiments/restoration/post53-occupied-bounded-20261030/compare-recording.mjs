import {readFileSync,writeFileSync} from 'node:fs';
import {runJsSession,compareSessionOutputs} from '../../scripts/diff-fresh.mjs';
const path=process.argv[2],out=process.argv[3];
const recording=JSON.parse(readFileSync(path));
const jsOutput=await runJsSession(recording,process.cwd());
const result=compareSessionOutputs(recording,jsOutput);
writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));

if(process.argv.includes('--require')&&!result.passed)process.exitCode=1;
