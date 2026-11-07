// Child process of scripts/planning-leak-check.mjs: replay recordings in an
// instrumented scoring workspace and print one result line per recording.
// Usage: node scripts/planning-leak-replay.mjs <workspace> <recording>...
import fs from 'node:fs';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';
import { LINE_MARKER, startPlanningLeakWatch } from './planning-leak-lib.mjs';

const [root, ...files] = process.argv.slice(2);
const report = await startPlanningLeakWatch(root);
for (const file of files) {
    const recording = JSON.parse(fs.readFileSync(file, 'utf8'));
    const js = await runJsSession(recording, root);
    const { leakEvents, leakOverflow, leaks } = report();
    const line = { file, jsError: js.error ? String(js.error).slice(0, 500) : null, leakEvents, leakOverflow, leaks };
    // PLANNING_LEAK_COMPARE=1 also compares the replay with the recording,
    // without the host-string substitutions the batch tools apply.
    if (process.env.PLANNING_LEAK_COMPARE === '1') {
        const result = compareSessionOutputs(recording, js);
        line.passed = result.passed;
        line.mismatch = ['rngMismatch', 'screenMismatch', 'cursorMismatch', 'animMismatch']
            .filter((kind) => result[kind])
            .map((kind) => ({ kind, location: result[kind].location ?? null }));
    }
    await new Promise((resolve) => process.stdout.write(`${LINE_MARKER}${JSON.stringify(line)}\n`, resolve));
}
process.exit(0);
