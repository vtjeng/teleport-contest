// Times each checkpoint check for one commit, reusing the checkpoint's own
// workspace setup and check runner. Usage:
//   node profile-checkpoint.mjs <repo-root> <commit> <out.json> <tests|rest>
// `tests` runs only the full test suite and `rest` runs every other check, so
// each half fits the bounded runner's 15-minute limit.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [root, commit, out, part] = process.argv.slice(2);
if (!['tests', 'rest'].includes(part)) throw new Error('part must be tests or rest');
const { createCheckpointWorkspace } = await import(
    pathToFileURL(join(root, 'scripts/checkpoint.mjs')).href);

// CPU-seconds used by this bounded run's cgroup, and by the whole machine.
const cgroupDir = join('/sys/fs/cgroup', readFileSync('/proc/self/cgroup', 'utf8').trim().split('::')[1]);
const ownCpu = () => Number(/usage_usec (\d+)/u.exec(readFileSync(join(cgroupDir, 'cpu.stat'), 'utf8'))[1]) / 1e6;
const machineCpu = () => {
    // user nice system idle iowait irq softirq steal, in USER_HZ (100 per s)
    const f = readFileSync('/proc/stat', 'utf8').split('\n')[0].trim().split(/\s+/u).slice(1).map(Number);
    return (f[0] + f[1] + f[2] + f[5] + f[6] + f[7]) / 100;
};
const t0 = performance.now();
const { workspace, remove } = createCheckpointWorkspace(root, commit);
const setupMs = performance.now() - t0;
process.chdir(workspace);
const checks = await import(
    pathToFileURL(join(workspace, 'scripts/checkpoint-checks.mjs')).href);

const timings = [];
const timed = (command, args, options) => {
    const start = performance.now();
    const own0 = ownCpu();
    const machine0 = machineCpu();
    const result = spawnSync(command, args, { ...options, cwd: workspace });
    const ownS = ownCpu() - own0;
    timings.push({ command: [command, ...args].join(' '),
        ms: performance.now() - start, status: result.status,
        cpuS: +ownS.toFixed(1), otherCpuS: +(machineCpu() - machine0 - ownS).toFixed(1) });
    return result;
};
const lines = [];
const { allPassed, results } = checks.runCheckpointChecks(
    checks.checkpointCommands().filter(({ label }) =>
        (label === 'full test suite') === (part === 'tests')), { run: timed, output: (line) => lines.push(line) });
const report = {
    commit, part, setupMs, allPassed, totalMs: performance.now() - t0,
    checks: results.map((r, i) => ({ label: r.label, passed: r.passed, ...timings[i] })),
};
writeFileSync(out, JSON.stringify(report, null, 2));
remove();
for (const c of report.checks)
    console.log(`${(c.ms / 1000).toFixed(1).padStart(7)}s  cpu ${String(c.cpuS).padStart(7)}s  others ${String(c.otherCpuS).padStart(7)}s  ${c.passed ? 'PASS' : 'FAIL'}  ${c.label}`);
console.log(`${(setupMs / 1000).toFixed(1).padStart(7)}s  setup; total ${(report.totalMs / 1000).toFixed(1)}s`);
