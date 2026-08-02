#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    copyFileSync,
    existsSync,
    lstatSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    realpathSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import {
    basename,
    dirname,
    isAbsolute,
    join,
    relative,
    resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), '..');
export const MANIFEST_NAME = 'audit-worktree.json';
export const MANIFEST_VERSION = 1;
export const TEMP_PREFIX = 'teleport-formal-audit-';
export const DEFAULT_CHECKLIST = '.agents/implementation-checklist.json';

export const USAGE = `Usage:
  node scripts/audit-worktree.mjs prepare \\
    --range <base>..<head> \\
    --skill <skill-name> \\
    --skill-path <path/to/SKILL.md> \\
    --prompt <path/to/audit-prompt.md> \\
    [--checklist <repo-relative-path> |
     --no-checklist-reason <reason>] [--readiness]

  node scripts/audit-worktree.mjs check <manifest-path>
  node scripts/audit-worktree.mjs cleanup <manifest-path>

prepare creates an isolated worktree at the exact reviewed commit, initializes
the pinned NetHack source without fetching, checks the current implementation
checklist when one exists, and snapshots the audit prompt.

check verifies that the prepared files have not changed and prints the manual
codex exec command. cleanup removes only a clean worktree that matches the
manifest; it refuses to discard audit changes.`;

function sha256(text) {
    return createHash('sha256').update(text).digest('hex');
}

function readUtf8(path, label) {
    try {
        return readFileSync(path, 'utf8');
    } catch (error) {
        throw new Error(`${label} is not readable: ${error.message}`);
    }
}

function runCommand(command, args, {
    cwd,
    allowFailure = false,
    maxBuffer = 16 * 1024 * 1024,
} = {}) {
    const result = spawnSync(command, args, {
        cwd,
        encoding: 'utf8',
        maxBuffer,
    });
    // Some managed sandboxes report an EPERM bookkeeping error even when the
    // child exited successfully and returned complete output.
    if (result.error && result.status === null) throw result.error;
    if (!allowFailure && result.status !== 0) {
        const detail = (result.stderr || result.stdout || '').trim();
        throw new Error(
            `${command} ${args.join(' ')} failed`
            + (detail ? `: ${detail}` : ''),
        );
    }
    return result;
}

function runGit(repositoryRoot, args, options = {}) {
    return runCommand('git', ['-C', repositoryRoot, ...args], options);
}

function optionValue(args, index, option) {
    if (index + 1 >= args.length) {
        throw new Error(`${option} needs a value`);
    }
    return args[index + 1];
}

function parsePrepareArgs(args) {
    const parsed = {
        checklistPath: DEFAULT_CHECKLIST,
        noChecklistReason: null,
        readiness: false,
    };
    for (let index = 0; index < args.length; ++index) {
        const option = args[index];
        if (option === '--range') {
            parsed.range = optionValue(args, index, option);
        } else if (option === '--skill') {
            parsed.skill = optionValue(args, index, option);
        } else if (option === '--skill-path') {
            parsed.skillPath = optionValue(args, index, option);
        } else if (option === '--prompt') {
            parsed.promptPath = optionValue(args, index, option);
        } else if (option === '--readiness') {
            parsed.readiness = true;
            continue;
        } else if (option === '--checklist') {
            parsed.checklistPath = optionValue(args, index, option);
        } else if (option === '--no-checklist-reason') {
            parsed.noChecklistReason = optionValue(args, index, option);
        } else {
            throw new Error(`unknown prepare option: ${option}`);
        }
        index++;
    }

    for (const key of ['range', 'skill', 'skillPath', 'promptPath']) {
        if (!parsed[key]) throw new Error(`prepare needs --${key
            .replace(/[A-Z]/gu, match => `-${match.toLowerCase()}`)}`);
    }
    if (parsed.noChecklistReason !== null
        && parsed.noChecklistReason.trim().length === 0) {
        throw new Error('--no-checklist-reason must explain the exception');
    }
    return parsed;
}

export function parseAuditArgs(args) {
    if (args.length === 0 || args[0] === '-h' || args[0] === '--help') {
        return { command: 'help' };
    }
    const command = args[0];
    if (command === 'prepare') {
        return { command, ...parsePrepareArgs(args.slice(1)) };
    }
    if (command === 'check' || command === 'cleanup') {
        if (args.length !== 2) {
            throw new Error(`${command} needs exactly one manifest path`);
        }
        return { command, manifestPath: resolve(args[1]) };
    }
    throw new Error(`unknown command: ${command}`);
}

export function parseRange(range) {
    if (typeof range !== 'string' || range.includes('...')
        || range.indexOf('..') <= 0
        || range.indexOf('..') !== range.lastIndexOf('..')
        || range.endsWith('..')) {
        throw new Error('range must be exactly <base>..<head>');
    }
    const [base, head] = range.split('..');
    if (base.startsWith('-') || head.startsWith('-')) {
        throw new Error('range revisions must not begin with a dash');
    }
    return { base, head };
}

function resolveCommit(repositoryRoot, revision, label) {
    const result = runGit(
        repositoryRoot,
        ['rev-parse', '--verify', `${revision}^{commit}`],
    );
    const commit = result.stdout.trim();
    if (!/^[0-9a-f]{40}$/u.test(commit)) {
        throw new Error(`${label} did not resolve to a full commit`);
    }
    return commit;
}

function validateRelativeRepositoryPath(path, label) {
    if (!path || isAbsolute(path) || path.includes('\0')) {
        throw new Error(`${label} must be a repository-relative path`);
    }
    const portablePath = path.replaceAll('\\', '/');
    const syntheticRoot = '/repository-root';
    const normalized = relative(
        syntheticRoot,
        resolve(syntheticRoot, portablePath),
    );
    if (normalized.startsWith('..') || normalized === '') {
        throw new Error(`${label} must stay inside the repository`);
    }
    return portablePath;
}

export const CHECKLIST_STATUSES = Object.freeze([
    'done', 'no-effect-yet', 'later', 'cannot-occur', 'missing', 'undecided',
]);

// The checklist is JSON so this gate reads fields as data. Its predecessor
// regexed hand-written prose, and 29 of the 32 checklist versions committed
// before 2026-08-01 failed its own patterns through wording drift.
export function validateChecklist(text, head) {
    let checklist;
    try {
        checklist = JSON.parse(text);
    } catch (error) {
        throw new Error(
            `implementation checklist is not valid JSON: ${error.message}`,
        );
    }
    const entries = checklist.entries ?? [];
    const unknown = entries.filter(
        (entry) => !CHECKLIST_STATUSES.includes(entry.status),
    );
    if (unknown.length > 0) {
        throw new Error(
            'implementation checklist has entries with unknown status: '
                + unknown.map((entry) => entry.candidate).join(', '),
        );
    }
    const unfinished = new Set(entries
        .map((entry) => entry.status)
        .filter((status) => status === 'missing' || status === 'undecided'));
    if (unfinished.size > 0) {
        throw new Error(
            `implementation checklist still contains: ${
                [...unfinished].join(', ')}`,
        );
    }
    if (checklist.mode !== 'ready-for-audit') {
        throw new Error(
            'implementation checklist mode is not ready-for-audit',
        );
    }
    if (checklist.commitChecked !== head) {
        throw new Error(
            `implementation checklist covers ${checklist.commitChecked}, `
                + `not ${head}`,
        );
    }
}

function validatePrompt(text, {
    base,
    head,
    skill,
}) {
    const skillName = typeof skill === 'string' ? skill : skill.name;
    const missing = [];
    if (!text.includes('AGENTS.md')) missing.push('AGENTS.md instruction');
    const directProhibition = (subject) => new RegExp(
        String.raw`\b(?:do not|don't|never|must not)\s+`
            + String.raw`(?:(?:ever|directly|indirectly)\s+)*`
            + String.raw`(?:access|inspect|read|list|open|search|parse|`
            + String.raw`compare|summarize|copy|display|reveal|pass)\b`
            + String.raw`[^\r\n]*\b${subject}\b`,
        'iu',
    ).test(text);
    const hasLiteralHoldoutProhibition =
        directProhibition(String.raw`sessions\/holdout`);
    const hasSealedHoldoutProhibition =
        directProhibition('sealed holdout directory');
    if (!hasLiteralHoldoutProhibition && !hasSealedHoldoutProhibition) {
        missing.push('sealed-holdout prohibition');
    }
    if (!text.includes(base) || !text.includes(head)) {
        missing.push('exact base and head commits');
    }
    if (!text.includes(skillName)) missing.push(`skill name ${skillName}`);
    if (missing.length > 0) {
        throw new Error(`audit prompt is missing: ${missing.join(', ')}`);
    }
}

function gitlinkCommit(repositoryRoot, head, path) {
    const result = runGit(
        repositoryRoot,
        ['ls-tree', head, '--', path],
        { allowFailure: true },
    );
    if (result.status !== 0 || result.stdout.trim() === '') return null;
    const match = result.stdout.match(/^160000 commit ([0-9a-f]{40})\t/u);
    if (!match) {
        throw new Error(`${path} is not a committed Git submodule`);
    }
    return match[1];
}

function initializeUpstream(worktreePath, expectedCommit) {
    if (expectedCommit === null) return null;
    runGit(worktreePath, [
        'submodule',
        'update',
        '--init',
        '--checkout',
        '--no-fetch',
        '--',
        'nethack-c/upstream',
    ]);
    const upstreamPath = join(worktreePath, 'nethack-c', 'upstream');
    const actualCommit = runGit(
        upstreamPath,
        ['rev-parse', '--verify', 'HEAD^{commit}'],
    ).stdout.trim();
    if (actualCommit !== expectedCommit) {
        throw new Error(
            `NetHack source is at ${actualCommit}, expected ${expectedCommit}`,
        );
    }
    return {
        path: 'nethack-c/upstream',
        commit: actualCommit,
    };
}

function worktreeRecords(repositoryRoot) {
    const text = runGit(
        repositoryRoot,
        ['worktree', 'list', '--porcelain'],
    ).stdout;
    return text.trim().split(/\n\n+/u).filter(Boolean).map(block => {
        const lines = block.split('\n');
        const pathLine = lines.find(line => line.startsWith('worktree '));
        const headLine = lines.find(line => line.startsWith('HEAD '));
        return {
            path: pathLine?.slice('worktree '.length),
            head: headLine?.slice('HEAD '.length),
        };
    });
}

function matchingWorktree(repositoryRoot, worktreePath) {
    const expectedPath = resolve(worktreePath);
    return worktreeRecords(repositoryRoot)
        .find(record => resolve(record.path) === expectedPath);
}

function cleanFailedPreparation(repositoryRoot, workRoot, worktreePath) {
    if (matchingWorktree(repositoryRoot, worktreePath)) {
        runGit(
            worktreePath,
            ['submodule', 'deinit', '--force', '--all'],
            { allowFailure: true },
        );
        runGit(
            repositoryRoot,
            ['worktree', 'remove', '--force', worktreePath],
            { allowFailure: true },
        );
    }
    rmSync(workRoot, { recursive: true, force: true });
}

function loadManifest(manifestPath) {
    const data = JSON.parse(readUtf8(manifestPath, 'audit manifest'));
    if (data.version !== MANIFEST_VERSION) {
        throw new Error(`unsupported audit manifest version: ${data.version}`);
    }
    return data;
}

function validateManifestPaths(manifestPath, manifest, repositoryRoot) {
    const resolvedManifest = resolve(manifestPath);
    const workRoot = dirname(resolvedManifest);
    if (basename(resolvedManifest) !== MANIFEST_NAME
        || !basename(workRoot).startsWith(TEMP_PREFIX)) {
        throw new Error('audit manifest is outside an expected temporary root');
    }
    if (resolve(manifest.workRoot) !== workRoot
        || resolve(manifest.worktreePath) !== join(workRoot, 'worktree')
        || resolve(manifest.prompt.path) !== join(workRoot, 'prompt.md')) {
        throw new Error('audit manifest paths do not match its temporary root');
    }
    if (manifest.checklist.snapshotPath
        && resolve(manifest.checklist.snapshotPath)
            !== join(workRoot, 'implementation-checklist.json')) {
        throw new Error('checklist snapshot is outside its temporary root');
    }
    if (resolve(manifest.repositoryRoot) !== resolve(repositoryRoot)) {
        throw new Error('audit manifest belongs to a different repository');
    }
    // The worktree is absent once an interrupted cleanup has removed it, and a
    // path that does not exist cannot be a symbolic link. lstat it without
    // throwing so that case reaches the caller, which decides what to do about
    // it; a dangling link still reports itself here and is still refused.
    const worktreeStat = lstatSync(manifest.worktreePath, {
        throwIfNoEntry: false,
    });
    if (lstatSync(workRoot).isSymbolicLink() || worktreeStat?.isSymbolicLink()) {
        throw new Error('audit temporary paths must not be symbolic links');
    }
}

function repositoryRootFor(path = PROJECT_ROOT) {
    return realpathSync(
        runGit(path, ['rev-parse', '--show-toplevel']).stdout.trim(),
    );
}

// The machine half of readiness, run at the repository head before a pass is
// prepared. Survivors are findings, so a mutation run that reports them still
// passes; exit 2 there means a red baseline, which refuses like any red
// command. .agents/review.md, "Readiness for a formal review pass", holds the
// three hand-written attestations that remain.
export function readinessCommands(base, head) {
    return [
        { label: 'checkpoint', command: 'npm', args: ['run', 'checkpoint'] },
        { label: 'quality check', command: 'npm',
            args: ['run', 'quality', '--', '--check'] },
        { label: 'range mutation', command: 'npm',
            args: ['run', 'mutate', '--', '--range', `${base}..${head}`,
                '--kind', 'relational,logical,boolean'] },
    ];
}

export function runReadiness({ root, base, head, run = runCommand }) {
    const results = [];
    for (const { label, command, args } of readinessCommands(base, head)) {
        const result = run(command, args, {
            cwd: root,
            allowFailure: true,
            maxBuffer: 64 * 1024 * 1024,
        });
        const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trimEnd();
        results.push({
            label,
            command: `${command} ${args.join(' ')}`,
            passed: result.status === 0,
            tail: output.split('\n').slice(-15).join('\n'),
        });
    }
    const red = results.filter((entry) => !entry.passed);
    if (red.length > 0) {
        throw new Error(
            `readiness commands failed: ${red.map((r) => r.label).join(', ')}\n`
                + red.map((r) => r.tail).join('\n'),
        );
    }
    return results;
}

export function prepareAuditWorktree({
    range,
    skill,
    skillPath,
    promptPath,
    checklistPath = DEFAULT_CHECKLIST,
    noChecklistReason = null,
    readiness = false,
    runReadinessCommands = runReadiness,
    repositoryRoot = PROJECT_ROOT,
    temporaryRoot = tmpdir(),
}) {
    const root = repositoryRootFor(repositoryRoot);
    const revisions = parseRange(range);
    const base = resolveCommit(root, revisions.base, 'base');
    const head = resolveCommit(root, revisions.head, 'head');
    if (base === head) throw new Error('audit range is empty');
    const ancestry = runGit(
        root,
        ['merge-base', '--is-ancestor', base, head],
        { allowFailure: true },
    );
    if (ancestry.status !== 0) {
        throw new Error('audit base is not an ancestor of audit head');
    }

    if (!/^[a-z0-9][a-z0-9:-]*$/u.test(skill)) {
        throw new Error('skill name contains unsupported characters');
    }
    const resolvedSkillPath = realpathSync(resolve(skillPath));
    const skillText = readUtf8(resolvedSkillPath, 'audit skill');
    const promptText = readUtf8(resolve(promptPath), 'audit prompt');
    validatePrompt(promptText, { base, head, skill });

    let checklist;
    const safeChecklistPath = validateRelativeRepositoryPath(
        checklistPath,
        'implementation checklist',
    );
    const checklistSourcePath = join(root, safeChecklistPath);
    const checklistExists = existsSync(checklistSourcePath);
    let promptSnapshotText = promptText.trimEnd();
    if (checklistExists) {
        if (noChecklistReason !== null) {
            throw new Error(
                'cannot bypass the current implementation checklist',
            );
        }
        const text = readUtf8(
            checklistSourcePath,
            'implementation checklist',
        );
        validateChecklist(text, head);
        checklist = {
            sourcePath: checklistSourcePath,
            snapshotPath: null,
            sha256: sha256(text),
        };
        promptSnapshotText += '\n\n'
            + '## Implementation checklist snapshot\n\n'
            + text.trimEnd();
    } else {
        if (noChecklistReason === null) {
            throw new Error(
                `no ${checklistPath} exists in the main worktree; `
                + 'provide --no-checklist-reason for a qualifying small slice',
            );
        }
        const defaultChecklistPath = join(root, DEFAULT_CHECKLIST);
        if (safeChecklistPath !== DEFAULT_CHECKLIST
            && existsSync(defaultChecklistPath)) {
            throw new Error(
                `${DEFAULT_CHECKLIST} exists; use it instead of bypassing it`,
            );
        }
        checklist = {
            sourcePath: null,
            snapshotPath: null,
            reason: noChecklistReason.trim(),
        };
        promptSnapshotText += '\n\n'
            + '## Implementation checklist exception\n\n'
            + `${checklist.reason}`;
    }
    promptSnapshotText += '\n';

    const workRoot = mkdtempSync(join(temporaryRoot, TEMP_PREFIX));
    const worktreePath = join(workRoot, 'worktree');
    const manifestPath = join(workRoot, MANIFEST_NAME);
    const promptSnapshotPath = join(workRoot, 'prompt.md');
    const checklistSnapshotPath = checklistExists
        ? join(workRoot, 'implementation-checklist.json')
        : null;
    try {
        runGit(root, ['worktree', 'add', '--detach', worktreePath, head]);
        const actualHead = runGit(
            worktreePath,
            ['rev-parse', '--verify', 'HEAD^{commit}'],
        ).stdout.trim();
        if (actualHead !== head) {
            throw new Error(
                `prepared worktree is at ${actualHead}, expected ${head}`,
            );
        }
        readUtf8(join(worktreePath, 'AGENTS.md'), 'prepared AGENTS.md');
        runGit(worktreePath, ['diff', '--stat', base, head]);

        const upstream = initializeUpstream(
            worktreePath,
            gitlinkCommit(root, head, 'nethack-c/upstream'),
        );
        writeFileSync(promptSnapshotPath, promptSnapshotText);
        if (checklistSnapshotPath) {
            copyFileSync(checklistSourcePath, checklistSnapshotPath);
            checklist.snapshotPath = checklistSnapshotPath;
        }
        const createdAt = new Date().toISOString();
        let readinessResults = null;
        if (readiness) {
            const repoHead = runGit(root, ['rev-parse', 'HEAD']).stdout.trim();
            if (repoHead !== head) {
                throw new Error(
                    `--readiness runs its commands at the repository head; `
                        + `HEAD is ${repoHead} and the range head ${head}`,
                );
            }
            readinessResults = runReadinessCommands({ root, base, head });
        }
        const manifest = {
            version: MANIFEST_VERSION,
            createdAt,
            repositoryRoot: root,
            workRoot,
            worktreePath,
            base,
            head,
            range: `${base}..${head}`,
            readiness: readinessResults,
            skill: {
                name: skill,
                path: resolvedSkillPath,
                sha256: sha256(skillText),
            },
            prompt: {
                path: promptSnapshotPath,
                sha256: sha256(promptSnapshotText),
            },
            checklist,
            upstream,
        };
        writeFileSync(
            manifestPath,
            `${JSON.stringify(manifest, null, 2)}\n`,
        );
        checkAuditWorktree({ manifestPath, repositoryRoot: root });
        return { manifest, manifestPath };
    } catch (error) {
        cleanFailedPreparation(root, workRoot, worktreePath);
        throw error;
    }
}

export function shellQuote(value) {
    return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

export function auditCommand(manifest) {
    return [
        `cd ${shellQuote(manifest.worktreePath)}`,
        'codex exec --profile audit-high --json - '
            + `< ${shellQuote(manifest.prompt.path)}`,
    ].join('\n');
}

export function checkAuditWorktree({
    manifestPath,
    repositoryRoot = PROJECT_ROOT,
}) {
    const root = repositoryRootFor(repositoryRoot);
    const manifest = loadManifest(manifestPath);
    validateManifestPaths(manifestPath, manifest, root);

    const record = matchingWorktree(root, manifest.worktreePath);
    if (!record) throw new Error('prepared audit worktree is not registered');
    if (record.head !== manifest.head) {
        throw new Error(
            `prepared worktree is at ${record.head}, expected ${manifest.head}`,
        );
    }
    const actualHead = runGit(
        manifest.worktreePath,
        ['rev-parse', '--verify', 'HEAD^{commit}'],
    ).stdout.trim();
    if (actualHead !== manifest.head) {
        throw new Error(
            `prepared worktree HEAD changed to ${actualHead}`,
        );
    }

    readUtf8(join(manifest.worktreePath, 'AGENTS.md'), 'prepared AGENTS.md');
    const skillText = readUtf8(manifest.skill.path, 'audit skill');
    if (sha256(skillText) !== manifest.skill.sha256) {
        throw new Error('audit skill changed after preparation');
    }
    const promptText = readUtf8(manifest.prompt.path, 'audit prompt snapshot');
    if (sha256(promptText) !== manifest.prompt.sha256) {
        throw new Error('audit prompt changed after preparation');
    }
    validatePrompt(promptText, manifest);

    if (manifest.checklist.snapshotPath) {
        const checklistText = readUtf8(
            manifest.checklist.snapshotPath,
            'implementation checklist',
        );
        if (sha256(checklistText) !== manifest.checklist.sha256) {
            throw new Error('implementation checklist snapshot changed');
        }
        validateChecklist(checklistText, manifest.head);
        const sourceText = readUtf8(
            manifest.checklist.sourcePath,
            'implementation checklist source',
        );
        if (sha256(sourceText) !== manifest.checklist.sha256) {
            throw new Error(
                'implementation checklist changed after preparation',
            );
        }
    }
    if (manifest.upstream) {
        const upstreamPath = join(
            manifest.worktreePath,
            manifest.upstream.path,
        );
        const upstreamHead = runGit(
            upstreamPath,
            ['rev-parse', '--verify', 'HEAD^{commit}'],
        ).stdout.trim();
        if (upstreamHead !== manifest.upstream.commit) {
            throw new Error(
                `NetHack source changed to ${upstreamHead}`,
            );
        }
    }
    return {
        manifest,
        command: auditCommand(manifest),
    };
}

// The temporary root holds the worktree beside the manifest, prompt snapshot,
// and checklist snapshot. Anything else is a file someone put there and has not
// preserved, such as an audit report, so removing the root would destroy it.
function requirePreservedRoot(manifest) {
    const allowedRootEntries = new Set([
        MANIFEST_NAME,
        'prompt.md',
        'worktree',
    ]);
    if (manifest.checklist.snapshotPath) {
        allowedRootEntries.add('implementation-checklist.json');
    }
    const unpreserved = readdirSync(manifest.workRoot)
        .filter(entry => !allowedRootEntries.has(entry));
    if (unpreserved.length > 0) {
        throw new Error(
            'audit temporary root has unpreserved files: '
            + unpreserved.join(', '),
        );
    }
}

export function cleanupAuditWorktree({
    manifestPath,
    repositoryRoot = PROJECT_ROOT,
}) {
    const resolvedManifest = resolve(manifestPath);
    if (!existsSync(resolvedManifest)) {
        const workRoot = dirname(resolvedManifest);
        if (basename(resolvedManifest) === MANIFEST_NAME
            && basename(workRoot).startsWith(TEMP_PREFIX)
            && !existsSync(workRoot)) {
            return { alreadyClean: true };
        }
        throw new Error('audit manifest does not exist');
    }

    const root = repositoryRootFor(repositoryRoot);
    const manifest = loadManifest(resolvedManifest);
    validateManifestPaths(resolvedManifest, manifest, root);
    const record = matchingWorktree(root, manifest.worktreePath);
    if (!record) {
        // `git worktree remove` deletes the worktree and its registration but
        // not the root that holds them, which strands the manifest, prompt, and
        // checklist with no way for cleanup to finish. Finish it here, but only
        // once the worktree is gone from disk too: an unregistered directory
        // that still exists may hold audit changes for someone to preserve.
        if (existsSync(manifest.worktreePath)) {
            throw new Error('audit worktree is not registered; refusing cleanup');
        }
        requirePreservedRoot(manifest);
        rmSync(manifest.workRoot, { recursive: true, force: true });
        return { alreadyClean: false, leftoversRemoved: true };
    }
    if (record.head !== manifest.head) {
        throw new Error('audit worktree commit does not match its manifest');
    }
    const status = runGit(
        manifest.worktreePath,
        ['status', '--porcelain', '--untracked-files=all'],
    ).stdout;
    if (status.trim() !== '') {
        throw new Error(
            'audit worktree has changes; preserve or review them before cleanup',
        );
    }
    requirePreservedRoot(manifest);

    if (manifest.upstream) {
        runGit(
            manifest.worktreePath,
            ['submodule', 'deinit', '--force', '--all'],
        );
    }
    // Git requires --force for any worktree that has contained an initialized
    // submodule. The clean-status and manifest checks above prevent this from
    // discarding audit changes or targeting another worktree.
    runGit(root, ['worktree', 'remove', '--force', manifest.worktreePath]);
    rmSync(manifest.workRoot, { recursive: true, force: true });
    return { alreadyClean: false };
}

// TODO: Consider adding a `run` subcommand if audits prepared by this tool
// still show manual launch failures or omit the required session, elapsed time,
// or usage evidence. QUALITY.json already records audits delayed by missing
// source in detached worktrees, which supports automating setup, but it does
// not record a recurring Codex launch failure.
async function main(args) {
    const parsed = parseAuditArgs(args);
    if (parsed.command === 'help') {
        process.stdout.write(`${USAGE}\n`);
        return;
    }
    if (parsed.command === 'prepare') {
        const prepared = prepareAuditWorktree(parsed);
        process.stdout.write(
            `Prepared ${prepared.manifest.range}\n`
            + `Manifest: ${prepared.manifestPath}\n`
            + `${auditCommand(prepared.manifest)}\n`,
        );
        return;
    }
    if (parsed.command === 'check') {
        const checked = checkAuditWorktree(parsed);
        process.stdout.write(
            `Audit worktree is ready at ${checked.manifest.head}\n`
            + `${checked.command}\n`,
        );
        return;
    }
    if (parsed.command === 'cleanup') {
        const result = cleanupAuditWorktree(parsed);
        let message = 'Audit worktree removed.';
        if (result.alreadyClean) message = 'Audit worktree was already removed.';
        else if (result.leftoversRemoved) {
            message = 'Audit worktree was already removed; '
                + 'removed the leftover manifest and snapshots.';
        }
        process.stdout.write(`${message}\n`);
    }

}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).catch(error => {
        process.stderr.write(`audit-worktree: ${error.message}\n`);
        process.exitCode = 1;
    });
}
