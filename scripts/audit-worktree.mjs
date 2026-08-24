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
import {
    basename,
    dirname,
    isAbsolute,
    join,
    relative,
    resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';

import { localTmpdir } from './local-tmpdir.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), '..');
export const MANIFEST_NAME = 'audit-worktree.json';
export const MANIFEST_VERSION = 1;
export const TEMP_PREFIX = 'teleport-formal-audit-';
export const DEFAULT_CHECKLIST = '.agents/implementation-checklist.json';

export const USAGE = `Usage:
  node scripts/audit-worktree.mjs prepare \\
    --range <base>..<head> \\
    [--mutation-range <base>..<head>] \\
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

A checklist that covers the range is used, and --no-checklist-reason is refused
while one does. When none covers it, --no-checklist-reason records the stated
exception with the commit the existing checklist stopped at. Pass the manifest
to npm run quality -- record-review --manifest so the recorded pass keeps that
disposition; the manifest itself goes with cleanup.

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
        } else if (option === '--mutation-range') {
            parsed.mutationRange = optionValue(args, index, option);
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
    if (parsed.mutationRange && !parsed.readiness) {
        throw new Error('--mutation-range requires --readiness');
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

export function assertMutationRangeWithinAudit({
    base,
    head,
    mutationBase,
    mutationHead,
    isAncestorOf,
}) {
    if (mutationBase === mutationHead) {
        throw new Error('mutation range is empty');
    }
    if (mutationHead !== head
        || !isAncestorOf(base, mutationBase)
        || !isAncestorOf(mutationBase, head)) {
        throw new Error('mutation range must be a suffix of the audit range');
    }
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

/**
 * Why a checklist naming `commitChecked` may still cover the range head.
 *
 * A checklist cannot name the commit that contains it, so a committed one
 * always names an ancestor of the head. Measured on 8 August 2026 against a
 * fixture repository: a checklist committed in the head commit is refused with
 * `covers <parent>, not <head>`, and pointing the range head at the commit it
 * does name is refused by `--readiness` with `HEAD is <later> and the range
 * head <earlier>`. The pair leaves no ordering, so a checklist could never
 * ride with the pass reviewing its own slice and the reviewer lost the plan
 * and the explicit refusal list exactly where they help most.
 *
 * The gap is accepted only when it changed nothing a pass would have to read.
 * `ownedPaths` is the union of the QUALITY.json area paths, which is what a
 * review frontier advances over; a commit touching one of them is production
 * work the checklist does not cover, and it still refuses.
 *
 * Returns the reason to record, or null to refuse.
 */
export function ancestorCoverageReason(commitChecked, changed, ownedPaths) {
    const owned = changed.filter((path) => ownedPaths.has(path));
    if (owned.length > 0) return null;
    return `the checklist covers ${commitChecked.slice(0, 8)}, an ancestor of `
        + `the range head; the ${changed.length} path(s) changed between them `
        + 'own no QUALITY.json area';
}

/**
 * Whether a checklist naming `commitChecked` covers `head`, and the gap to
 * record when it covers through an accepted ancestor rather than exactly.
 *
 * The whole coverage rule lives here. validateChecklist() refuses a checklist
 * that does not cover the range, and prepare refuses to bypass one that does;
 * both ask this function, so the two gates cannot disagree about what covering
 * means and open a hole between them.
 */
export function checklistCoverage(commitChecked, head, acceptsAncestor) {
    if (commitChecked === head) return { covers: true, gap: null };
    const reason = acceptsAncestor(commitChecked);
    if (!reason) return { covers: false, gap: null };
    return { covers: true, gap: { commitChecked, reason } };
}

// The checklist is JSON so this gate reads fields as data. Its predecessor
// regexed hand-written prose, and 29 of the 32 checklist versions committed
// before 2026-08-01 failed its own patterns through wording drift.
//
// `acceptsAncestor` decides whether a checklist that names something other
// than `head` may still cover it, and returns the reason to record. The
// default refuses every such checklist, which is what a caller with no
// repository to consult can prove.
export function validateChecklist(text, head, acceptsAncestor = () => null) {
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
    const coverage = checklistCoverage(
        checklist.commitChecked, head, acceptsAncestor,
    );
    if (!coverage.covers) {
        throw new Error(
            `implementation checklist covers ${checklist.commitChecked}, `
                + `not ${head}`,
        );
    }
    return coverage.gap;
}

/** Ancestry within one repository, treating a commit as its own ancestor. */
function isAncestorIn(root) {
    return (ancestor, descendant) => ancestor === descendant
        || runGit(root, ['merge-base', '--is-ancestor', ancestor, descendant],
            { allowFailure: true }).status === 0;
}

// The repository-relative paths a committed range touched, and the paths the
// QUALITY.json areas own. Both are computed here rather than imported from
// scripts/quality-status.mjs, which has its own `changedPathsIn` for the
// area-label computation: that file already imports `parseRange()` from this
// one, and the reverse edge would close a cycle. `reviewFrontier()` above is
// duplicated for the same reason and says so.
function changedPathsIn(root, base, head) {
    const output = runGit(root, ['diff', '--name-only', `${base}..${head}`])
        .stdout.trim();
    return output ? output.split('\n') : [];
}

function areaOwnedPaths(root) {
    const qualityPath = resolve(root, 'QUALITY.json');
    if (!existsSync(qualityPath)) return null;
    const config = JSON.parse(readUtf8(qualityPath, 'quality ledger'));
    return new Set((config.areas ?? []).flatMap((area) => area.paths ?? []));
}

/**
 * Decide whether a checklist naming an ancestor of `head` still covers it.
 *
 * The full-SHA test is what keeps a hand-written `commitChecked` out of a git
 * argument list: a value such as `--upload-pack=...` would otherwise be read
 * as an option rather than a commit.
 */
function ancestorAcceptorFor(root, head) {
    const isAncestorOf = isAncestorIn(root);
    return (commitChecked) => {
        if (typeof commitChecked !== 'string'
            || !/^[0-9a-f]{40}$/u.test(commitChecked)) return null;
        if (!isAncestorOf(commitChecked, head)) return null;
        const ownedPaths = areaOwnedPaths(root);
        // Without the ledger there is no list of the paths a pass has to read,
        // so the gap cannot be shown to hold none of them.
        if (!ownedPaths) return null;
        return ancestorCoverageReason(
            commitChecked,
            changedPathsIn(root, commitChecked, head),
            ownedPaths,
        );
    };
}

/**
 * What the bypass gate needs to know about a checklist standing in its way:
 * whether it covers the range, and the commit it names when it does not.
 *
 * Only the coverage question is asked here. The status, mode, and completeness
 * checks in validateChecklist() decide whether a checklist may be *used*, and a
 * checklist that does not cover the range is not going to be used; refusing a
 * bypass over its mode would rebuild the dead end this route exists to open.
 */
function checklistCoverageOnDisk(path, head, acceptsAncestor) {
    const text = readUtf8(path, 'implementation checklist');
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        throw new Error(
            `implementation checklist is not valid JSON: ${error.message}`,
        );
    }
    // Recorded as written, so an exception names what the checklist claimed
    // even when the claim was a revision expression rather than a commit.
    const commitChecked = typeof parsed.commitChecked === 'string'
        ? parsed.commitChecked
        : null;
    return {
        commitChecked,
        ...checklistCoverage(commitChecked, head, acceptsAncestor),
    };
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
    if (manifest.mutation
        && resolve(manifest.mutation.reportPath)
            !== join(workRoot, 'mutation-report.json')) {
        throw new Error('mutation report is outside its temporary root');
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
//
// The quality check runs under --health, which reads the gate's health half
// alone. The other half is review debt, and a pass is what clears it: a plain
// --check refuses once the gate reaches DUE, so the pass the gate demands
// could not be prepared. Health still refuses, because an unassigned js/ file
// leaves a finding in it with no area to be routed to.
/**
 * The newest recorded head for `kind`, which is the frontier a pass must start
 * at or before. Computed here rather than imported, because
 * `scripts/quality-status.mjs` already imports `parseRange()` from this file
 * and the reverse edge would close a cycle.
 *
 * A pass prepared over a range starting after the frontier would advance the
 * frontier past commits nobody read, turning them into reviewed history.
 * `record-review` refuses that, but only once the pass has already run;
 * refusing here costs a second instead of an hour.
 */
export function reviewFrontier(config, kind, isAncestorOf) {
    let frontier = config.enforcementBase;
    for (const pass of config.passes ?? []) {
        if (pass.kind !== kind) continue;
        if (isAncestorOf(frontier, pass.head)) frontier = pass.head;
    }
    return frontier;
}

export function assertRangeCoversFrontier(base, frontier, isAncestorOf) {
    if (isAncestorOf(base, frontier)) return;
    throw new Error(
        `audit base ${base.slice(0, 8)} sits after the review frontier `
        + `${frontier.slice(0, 8)}. Recording a pass over this range would `
        + 'advance the frontier past commits no pass read. Start the range at '
        + `${frontier.slice(0, 8)}.`,
    );
}

export function readinessCommands(base, head, {
    mutationBase = base,
    mutationHead = head,
    reportPath = null,
} = {}) {
    const mutationArgs = [
        'run', 'mutate', '--', '--range', `${mutationBase}..${mutationHead}`,
        '--kind', 'relational,logical,boolean',
    ];
    if (reportPath) mutationArgs.push('--report', reportPath);
    return [
        { label: 'checkpoint', command: 'npm', args: ['run', 'checkpoint'] },
        { label: 'quality check', command: 'npm',
            args: ['run', 'quality', '--', '--check', '--health'] },
        { label: 'range mutation', command: 'npm',
            args: mutationArgs },
    ];
}

export function runReadiness({
    root,
    base,
    head,
    mutationBase = base,
    mutationHead = head,
    reportPath = null,
    run = runCommand,
}) {
    const results = [];
    for (const { label, command, args } of readinessCommands(base, head, {
        mutationBase, mutationHead, reportPath,
    })) {
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
    mutationRange = null,
    skill,
    skillPath,
    promptPath,
    checklistPath = DEFAULT_CHECKLIST,
    noChecklistReason = null,
    readiness = false,
    runReadinessCommands = runReadiness,
    repositoryRoot = PROJECT_ROOT,
    temporaryRoot = localTmpdir(),
}) {
    if (mutationRange !== null && !readiness) {
        throw new Error('mutationRange requires readiness');
    }
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
    const mutationRevisions = parseRange(mutationRange ?? range);
    const mutationBase = resolveCommit(
        root, mutationRevisions.base, 'mutation base',
    );
    const mutationHead = resolveCommit(
        root, mutationRevisions.head, 'mutation head',
    );
    const isAncestorOf = isAncestorIn(root);
    assertMutationRangeWithinAudit({
        base, head, mutationBase, mutationHead, isAncestorOf,
    });

    // The range must reach back to the frontier, so recording it cannot
    // advance the frontier past commits no pass read.
    const qualityPath = resolve(root, 'QUALITY.json');
    if (existsSync(qualityPath)) {
        const config = JSON.parse(readUtf8(qualityPath, 'quality ledger'));
        assertRangeCoversFrontier(
            base, reviewFrontier(config, 'review', isAncestorOf), isAncestorOf,
        );
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
    const acceptsAncestor = ancestorAcceptorFor(root, head);
    let promptSnapshotText = promptText.trimEnd();
    if (noChecklistReason !== null) {
        // The checklist a bypass has to answer for: the named one when it
        // exists, and otherwise the default one, which --checklist must not
        // route around by naming a path that holds nothing.
        //
        // A checklist that covers the range is a plan for exactly this work, so
        // it is used. One that does not cover it will not be read by the pass
        // either way, and refusing here left no honest move: on 12 August 2026
        // both routes closed over a checklist 38 commits behind, and the pass
        // went ahead behind a checklist written after the work it describes.
        const blockingPath = checklistExists ? safeChecklistPath
            : (existsSync(join(root, DEFAULT_CHECKLIST))
                ? DEFAULT_CHECKLIST
                : null);
        let notCovering = null;
        if (blockingPath) {
            const coverage = checklistCoverageOnDisk(
                join(root, blockingPath), head, acceptsAncestor,
            );
            if (coverage.covers) {
                throw new Error(
                    `${blockingPath} covers the range head; use it instead of `
                    + 'bypassing it',
                );
            }
            notCovering = {
                path: blockingPath,
                commitChecked: coverage.commitChecked,
            };
        }
        checklist = {
            sourcePath: null,
            snapshotPath: null,
            reason: noChecklistReason.trim(),
            // The checklist that exists but stops short of the range, or null
            // when none exists at all. A pass records both, so a later reader
            // can tell a range that never had a plan from one whose plan ran
            // out before it.
            notCovering,
        };
        promptSnapshotText += '\n\n'
            + '## Implementation checklist exception\n\n'
            + `${checklist.reason}`;
        if (notCovering?.commitChecked) {
            promptSnapshotText += `\n\n${notCovering.path} covers `
                + `${notCovering.commitChecked}, which is not this range's `
                + 'head, so it does not describe the work under review.';
        }
    } else if (checklistExists) {
        const text = readUtf8(
            checklistSourcePath,
            'implementation checklist',
        );
        const coverage = validateChecklist(text, head, acceptsAncestor);
        checklist = {
            sourcePath: checklistSourcePath,
            snapshotPath: null,
            sha256: sha256(text),
            // Null when the checklist names the range head exactly. A reason
            // here tells a later reader that the checklist was deliberately
            // behind the range and on what evidence it was accepted.
            coverage,
        };
        promptSnapshotText += '\n\n'
            + '## Implementation checklist snapshot\n\n'
            + text.trimEnd();
    } else {
        throw new Error(
            `no ${checklistPath} exists in the main worktree; `
            + 'provide --no-checklist-reason for a qualifying small slice',
        );
    }
    promptSnapshotText += '\n';

    const workRoot = mkdtempSync(join(temporaryRoot, TEMP_PREFIX));
    const worktreePath = join(workRoot, 'worktree');
    const manifestPath = join(workRoot, MANIFEST_NAME);
    const promptSnapshotPath = join(workRoot, 'prompt.md');
    // Keyed on the checklist the pass will read, not on one merely existing: a
    // bypass leaves a non-covering checklist on disk, and snapshotting it would
    // hand the reviewer a plan for other work and make `check` validate it.
    const checklistSnapshotPath = checklist.sourcePath
        ? join(workRoot, 'implementation-checklist.json')
        : null;
    const mutationReportPath = join(workRoot, 'mutation-report.json');
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
            readinessResults = runReadinessCommands({
                root,
                base,
                head,
                mutationBase,
                mutationHead,
                reportPath: mutationReportPath,
            });
            readUtf8(mutationReportPath, 'mutation report');
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
            mutation: readiness ? {
                range: `${mutationBase}..${mutationHead}`,
                reportPath: mutationReportPath,
            } : null,
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

/**
 * The checklist disposition a finished pass records, read from the manifest
 * `prepare` wrote for it.
 *
 * The manifest sits under a temporary root that `cleanup` deletes, so the copy
 * `npm run quality -- record-review --manifest` writes into QUALITY.json is the
 * only durable one. Nothing in the returned record is hand-written, which is
 * the point: an operator can decline to pass the manifest, but cannot pass one
 * and describe its checklist as something other than what prepare decided.
 *
 * `covers` false means the pass read a range no implementation checklist
 * covered, and `reason` is the exception its operator stated. `path` and
 * `commitChecked` then name the checklist that stopped short, or are null when
 * there was none at all.
 */
export function passChecklistFromManifest(manifestPath, range) {
    const manifest = loadManifest(manifestPath);
    if (manifest.range !== range) {
        throw new Error(
            `audit manifest covers ${manifest.range}, not the recorded range `
            + `${range}`,
        );
    }
    const { checklist } = manifest;
    if (!checklist.sourcePath) {
        return {
            covers: false,
            path: checklist.notCovering?.path ?? null,
            commitChecked: checklist.notCovering?.commitChecked ?? null,
            reason: checklist.reason,
        };
    }
    return {
        covers: true,
        path: relative(manifest.repositoryRoot, checklist.sourcePath),
        // A checklist that covers exactly names the head and records no gap.
        commitChecked: checklist.coverage?.commitChecked ?? manifest.head,
        reason: checklist.coverage?.reason ?? null,
    };
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
        // Recomputed rather than read from the manifest: the history between
        // the checklist's commit and the audited head is fixed, so the same
        // question has the same answer, and a hand-edited manifest cannot
        // widen what check accepts.
        validateChecklist(checklistText, manifest.head,
            ancestorAcceptorFor(root, manifest.head));
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
    if (manifest.mutation) {
        readUtf8(manifest.mutation.reportPath, 'mutation report');
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
    if (manifest.mutation) allowedRootEntries.add('mutation-report.json');
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
            + 'Record the finished pass with npm run quality -- record-review '
            + `--manifest ${prepared.manifestPath}\n`
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
