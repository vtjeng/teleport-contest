// Records which segments the judge's runSegment() ended on a crash, and the
// termination violations it recorded (js/rng.js, "Segment termination").
//
// scripts/scoring-workspace.mjs runScorer() loads this module with
// `node --import` into frozen/ps_test_runner.mjs and, through NODE_OPTIONS,
// into each per-session worker the runner starts. The judge's runSegment()
// ends a crashed segment without throwing, and the runner reports only
// scores, so without this the crash would vanish from every local score.
// In a worker (`--worker-session=<path>`), it registers a reporter with the
// workspace's js/jsmain.js, the same module instance the runner imports,
// that appends one JSON line per crash to
// $TELEPORT_SEGMENT_ERROR_DIR/<session file name>.jsonl, and one per
// violation to <session file name>.violations.jsonl beside it, and one per
// recorded js/youprop.js argument use (js/gstate.js recordArgumentMisuse()) to
// <session file name>.argument-misuses.jsonl. For every segment it also
// compares the random-number calls of each input step with the session
// file's (scripts/rng-step-compare.mjs) and appends the result to
// <session file name>.rng-steps.jsonl. It changes no
// game state and no score; any other process it is loaded into is left alone.
import { appendFileSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { compareSegmentSteps } from './rng-step-compare.mjs';

const WORKER_FLAG = '--worker-session=';
const sessionArg = process.argv.find((arg) => arg.startsWith(WORKER_FLAG));
const errorDir = process.env.TELEPORT_SEGMENT_ERROR_DIR;

if (sessionArg && errorDir) {
    // frozen/ps_test_runner.mjs imports join(PROJECT_ROOT, 'js/jsmain.js'),
    // with PROJECT_ROOT the parent of the runner's own directory.
    const runnerPath = process.argv[1];
    const jsmain = resolve(dirname(runnerPath), '..', 'js', 'jsmain.js');
    const {
        setArgumentMisuseReporter,
        setRngSlicesReporter,
        setSegmentErrorReporter,
        setTerminationViolationReporter,
    } = await import(pathToFileURL(jsmain).href);
    const sessionPath = sessionArg.slice(WORKER_FLAG.length);
    const session = basename(sessionPath);
    const log = join(errorDir, `${session}.jsonl`);
    setSegmentErrorReporter(({ name, message }) => {
        appendFileSync(log, `${JSON.stringify({ name, message })}\n`);
    });
    const violationLog = join(errorDir, `${session}.violations.jsonl`);
    setTerminationViolationReporter((violations) => {
        appendFileSync(violationLog, violations
            .map(({ kind, detail }) => `${JSON.stringify({ kind, detail })}\n`).join(''));
    });
    const argumentMisuseLog = join(errorDir, `${session}.argument-misuses.jsonl`);
    setArgumentMisuseReporter((uses) => {
        appendFileSync(argumentMisuseLog, uses
            .map(({ kind, detail, count }) => `${JSON.stringify({ kind, detail, count })}\n`).join(''));
    });
    // One line per segment, in order. The judge replays the segments that
    // frozen/session_loader.mjs normalizeSession() gives it, so the recorded
    // steps come from the same call. A session this cannot read gets an
    // `error` line instead of none, so the reader can tell a failed
    // comparison from one that found nothing.
    const stepLog = join(errorDir, `${session}.rng-steps.jsonl`);
    const { normalizeSession } = await import(
        pathToFileURL(resolve(dirname(runnerPath), 'session_loader.mjs')).href);
    let recorded = null;
    let segment = 0;
    setRngSlicesReporter((slices) => {
        const line = { segment: segment++ };
        try {
            recorded ??= normalizeSession(JSON.parse(readFileSync(sessionPath, 'utf8'))).segments;
            Object.assign(line, compareSegmentSteps(recorded[line.segment]?.steps, slices));
        } catch (error) {
            line.error = String(error?.message ?? error);
        }
        appendFileSync(stepLog, `${JSON.stringify(line)}\n`);
    });
}
