#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { accessSync, constants, cpSync, existsSync, lstatSync, mkdirSync,
    mkdtempSync, readdirSync, realpathSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runRecorderSmoke } from './smoke-recorder.mjs';
import { boundedMain } from './run-bounded.mjs';

export const USAGE = `Usage (run from the new worktree's root):
  node scripts/worker-worktree.mjs prepare --branch <assigned-branch> \\
    [--source-install <absolute-path-to-recorder/install>]
  node scripts/worker-worktree.mjs check --branch <assigned-branch>

prepare initializes pinned C from the existing local Git repository, without
fetching. When the recorder installation is missing, --source-install copies
an existing build into this worktree; it never shares or overwrites an install.
Omit --source-install if this worktree already has its own recorder build.
Build a recorder with bash nethack-c/build-recorder.sh if no source is available.

check requires setup to be complete. Both commands verify the actual cwd,
branch, C revision and source file, private binary/data/configuration, and
run a fresh-game smoke check in a temporary copy. They print observed paths,
SHAs, time and smoke results as JSON only on success. They do not assign
workers, start a pilot, change branches, or alter existing recorder state.
Run setup before workers use the checkout. Failed probes produce no saved
readiness receipt; fix the reported problem and run the command again.
For a replacement worker, use check on its already prepared worktree; do not
rebuild or copy the recorder again. CLI setup/check runs in the focused bounded
profile. Run outside the Codex sandbox: both Git metadata and the systemd user
manager need host access. Focused tests use run-bounded.mjs focused as well.
In a new checkout without these scripts, invoke the script by absolute path
from a checkout that contains it, keeping cwd at the new worktree root.`;

function check(condition, message) {
    if (!condition) throw new Error(message);
}

function git(root, ...args) {
    const result = spawnSync('git', ['-C', root, ...args], {
        encoding: 'utf8', env: { ...process.env, GIT_ALLOW_PROTOCOL: 'file' },
    });
    check(result.status === 0, result.error?.message || result.stderr || `git ${args.join(' ')} failed`);
    return result.stdout.trim();
}

function privateTree(path) {
    check(realpathSync(path) === resolve(path), `recorder must be private, not symlinked: ${path}`);
    const inspect = (file) => {
        const stat = lstatSync(file);
        check(!stat.isSymbolicLink(), `recorder symlink is not private: ${file}`);
        if (stat.isDirectory()) {
            for (const name of readdirSync(file)) inspect(join(file, name));
        } else {
            check(stat.isFile() && stat.nlink === 1, `recorder must contain private regular files: ${file}`);
        }
    };
    inspect(path);
}

function checkInstall(install) {
    privateTree(install);
    const data = join(install, 'games/lib/nethackdir');
    for (const file of ['nethack', 'sysconf']) {
        check(existsSync(join(data, file)) && lstatSync(join(data, file)).isFile(), `missing recorder ${file}: ${data}`);
    }
    accessSync(join(data, 'nethack'), constants.X_OK);
    // Builds may pack game data in nhdat or install individual Lua files.
    check(existsSync(join(data, 'nhdat')) || existsSync(join(data, 'nhcore.lua')), `missing recorder game data: ${data}`);
    return data;
}

export function prepareWorkerWorktree({ cwd = process.cwd(), branch, sourceInstall,
    prepare = true, smoke = runRecorderSmoke } = {}) {
    const observedCwd = realpathSync(cwd);
    const root = realpathSync(git(observedCwd, 'rev-parse', '--show-toplevel'));
    check(observedCwd === root, `run from the worktree root: ${root}`);
    const actualBranch = git(root, 'branch', '--show-current');
    check(typeof branch === 'string' && branch.length > 0 && actualBranch === branch,
        `assigned branch ${branch || '(missing)'} does not match checkout branch ${actualBranch || '(detached)'}`);
    const head = git(root, 'rev-parse', 'HEAD');
    const entry = git(root, 'ls-tree', 'HEAD', '--', 'nethack-c/upstream');
    const match = /^160000 commit ([a-f0-9]{40})\tnethack-c\/upstream$/u.exec(entry);
    check(match, 'HEAD does not pin a C source submodule');
    const cRoot = join(root, 'nethack-c/upstream');
    // Never let submodule setup run through a symlink into another checkout.
    if (existsSync(cRoot)) check(realpathSync(cRoot) === cRoot, 'C source must be a private checkout, not a symlink');
    if (existsSync(join(cRoot, '.git'))) {
        check(git(cRoot, 'status', '--porcelain') === '', 'C source checkout has changes; preserve them before setup');
    }
    if (prepare) {
        // Match checkpoint's local-only checkout: --no-fetch alone still lets
        // submodule initialization clone the remote URL from .gitmodules.
        const common = git(root, 'rev-parse', '--path-format=absolute', '--git-common-dir');
        const localC = join(common, 'modules/nethack-c/upstream');
        check(existsSync(localC), 'initialize the local C source repository before preparing worktrees');
        git(root, '--git-dir', localC, 'cat-file', '-e', `${match[1]}^{commit}`);
        git(root, '-c', `submodule.nethack-c/upstream.url=${localC}`,
            '-c', 'protocol.file.allow=always', 'submodule', 'update',
            '--init', '--checkout', '--no-fetch', '--', 'nethack-c/upstream');
    }
    check(existsSync(join(cRoot, '.git')) && existsSync(join(cRoot, 'src/monst.c')), 'C source is missing; run prepare first');
    check(git(cRoot, 'rev-parse', 'HEAD') === match[1], 'C source revision differs from the pinned gitlink');
    check(git(root, 'diff', '--name-only', '--', 'nethack-c/upstream') === '', 'C source gitlink is modified');

    const install = join(root, 'nethack-c/recorder/install');
    if (existsSync(install)) {
        check(!sourceInstall || resolve(sourceInstall) === install,
            'recorder install already exists; omit --source-install (existing files are never overwritten)');
    } else {
        check(prepare && sourceInstall, 'recorder missing: use prepare --source-install <recorder/install> or build-recorder.sh');
        check(resolve(sourceInstall) === sourceInstall, '--source-install must be absolute');
        checkInstall(sourceInstall);
        mkdirSync(dirname(install), { recursive: true });
        check(realpathSync(dirname(install)) === dirname(install), 'recorder parent must be private, not a symlink');
        const staging = mkdtempSync(join(dirname(install), '.install-'));
        try {
            const stagedInstall = join(staging, 'install');
            cpSync(sourceInstall, stagedInstall, { recursive: true, errorOnExist: true, force: false });
            // Rename publishes the complete copy; never expose a half-copied install.
            check(!existsSync(install), 'recorder install appeared during setup; refusing to overwrite');
            renameSync(stagedInstall, install);
        } finally { rmSync(staging, { recursive: true, force: true }); }
    }
    const installDir = checkInstall(install);
    const result = smoke({ installDir, binary: join(installDir, 'nethack') });
    check(result && Number.isInteger(result.rngCalls) && result.rngCalls >= 199,
        'recorder smoke did not confirm fresh-game initialization');
    check(git(root, 'rev-parse', 'HEAD') === head && git(root, 'branch', '--show-current') === branch,
        'checkout changed during readiness check; run it again at a stable boundary');
    return { ready: true, checkedAt: new Date().toISOString(), worktree: root,
        branch, head, cCommit: match[1], installDir, smoke: result };
}

function main(argv) {
    if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) return console.log(USAGE);
    const [command, ...args] = argv;
    check(['prepare', 'check'].includes(command), USAGE);
    const options = {};
    for (let i = 0; i < args.length; i += 2) {
        check(['--branch', '--source-install'].includes(args[i]) && !Object.hasOwn(options, args[i]) && args[i + 1] && !args[i + 1].startsWith('--'), USAGE);
        options[args[i]] = args[i + 1];
    }
    check(options['--branch'] && (command === 'prepare' || !options['--source-install']), USAGE);
    console.log(JSON.stringify(prepareWorkerWorktree({ branch: options['--branch'],
        sourceInstall: options['--source-install'], prepare: command === 'prepare' }), null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const argv = process.argv.slice(2);
        if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) main(argv);
        else process.exitCode = await boundedMain('focused', () => { main(argv); return 0; });
    }
    catch (error) { console.error(error.message); process.exitCode = 1; }
}
