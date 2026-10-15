#!/usr/bin/env node
// Evaluate only newly admitted batches. No fixed replay or full test suite.
import {execFileSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {admissionPlan} from './admission-proof.mjs';
import {verifyPreparedRecordings} from './admit-challenge-batch.mjs';
import {combine, groupCases, runGroup} from './synthetic-ci.mjs';
import {PROJECT_ROOT} from './scoring-workspace.mjs';

const OUTPUT = '.cache/admission-ci';
export function main(args) {
    process.chdir(PROJECT_ROOT);
    const base = process.env.ADMISSION_BASE || execFileSync('git', ['log', '-1',
        '--format=%(trailers:key=Admission-base,valueonly)'], {encoding: 'utf8'}).trim();
    const plan = admissionPlan(PROJECT_ROOT, base);
    if (args.length === 1 && args[0] === 'plan') {
        for (const batch of plan.batches) verifyPreparedRecordings(PROJECT_ROOT, batch, batch.batch);
        console.log(JSON.stringify({include: groupCases(plan.batches).map(({group, cases}) =>
            ({group, cases: cases.length}))}));
    } else if (args.length === 2 && args[0] === 'run' && /^[1-9]\d*$/u.test(args[1])) {
        runGroup(Number(args[1]), plan.batches, OUTPUT);
    } else if (args.length === 1 && args[0] === 'combine') {
        const evaluations = combine(plan.batches, OUTPUT, `admission-${plan.commit}`);
        mkdirSync(OUTPUT, {recursive: true});
        writeFileSync(`${OUTPUT}/summary.json`, JSON.stringify({version: 1, kind: 'admission',
            base: plan.base, commit: plan.commit, batches: plan.batches.map(batch => batch.batch),
            evaluations}, null, 2) + '\n');
    } else throw new Error('Usage: admission-ci.mjs plan | run <group> | combine; commit needs Admission-base trailer');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        main(process.argv.slice(2));
    } catch (error) { console.error(`admission-ci: ${error.message}`); process.exitCode = 1; }
}
