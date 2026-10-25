import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createScoringWorkspace,removeScoringWorkspace} from './scoring-workspace.mjs';
import {runJsSession,compareSessionOutputs,formatReport} from './diff-fresh.mjs';

for(const name of ['normal','monochrome','before-control','ordinary-control'])
    test(`pet pickup ${name} matches independent C`,async()=>{
        const root=createScoringWorkspace(process.cwd(),[]);
        try {
            const c=JSON.parse(readFileSync(new URL(`../recordings/dogmove.c/pet-pickup-hallu-display-owner-${name}.session.json`,import.meta.url)));
            const r=compareSessionOutputs(c,await runJsSession(c,root));
            assert.equal(r.passed,true,formatReport(r));
        } finally { removeScoringWorkspace(root); }
    });
