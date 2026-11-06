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
// violation to <session file name>.violations.jsonl beside it. It changes no
// game state and no score; any other process it is loaded into is left alone.
import { appendFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const WORKER_FLAG = '--worker-session=';
const sessionArg = process.argv.find((arg) => arg.startsWith(WORKER_FLAG));
const errorDir = process.env.TELEPORT_SEGMENT_ERROR_DIR;

if (sessionArg && errorDir) {
    // frozen/ps_test_runner.mjs imports join(PROJECT_ROOT, 'js/jsmain.js'),
    // with PROJECT_ROOT the parent of the runner's own directory.
    const runnerPath = process.argv[1];
    const jsmain = resolve(dirname(runnerPath), '..', 'js', 'jsmain.js');
    const { setSegmentErrorReporter, setTerminationViolationReporter }
        = await import(pathToFileURL(jsmain).href);
    const session = basename(sessionArg.slice(WORKER_FLAG.length));
    const log = join(errorDir, `${session}.jsonl`);
    setSegmentErrorReporter(({ name, message }) => {
        appendFileSync(log, `${JSON.stringify({ name, message })}\n`);
    });
    const violationLog = join(errorDir, `${session}.violations.jsonl`);
    setTerminationViolationReporter((violations) => {
        appendFileSync(violationLog, violations
            .map(({ kind, detail }) => `${JSON.stringify({ kind, detail })}\n`).join(''));
    });
}
