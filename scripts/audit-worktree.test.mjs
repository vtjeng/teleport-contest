import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
    MANIFEST_NAME,
    ancestorCoverageReason,
    auditCommand,
    checkAuditWorktree,
    cleanupAuditWorktree,
    parseAuditArgs,
    parseRange,
    passChecklistFromManifest,
    prepareAuditWorktree,
    runReadiness,
    validateChecklist,
    assertMutationRangeWithinAudit,
    assertRangeCoversFrontier,
    readinessCommands,
    reviewFrontier,
} from './audit-worktree.mjs';

function git(repositoryRoot, ...args) {
    const result = spawnSync('git', ['-C', repositoryRoot, ...args], {
        encoding: 'utf8',
    });
    if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout);
    }
    return result.stdout.trim();
}

function commit(repositoryRoot, message) {
    git(repositoryRoot, 'add', '.');
    git(
        repositoryRoot,
        '-c', 'user.name=Audit Worktree Test',
        '-c', 'user.email=audit-worktree@example.invalid',
        'commit', '-m', message,
    );
    return git(repositoryRoot, 'rev-parse', 'HEAD');
}

function readyChecklist(head) {
    return JSON.stringify({
        mode: 'ready-for-audit',
        reason: 'every entry is done with pinned evidence',
        commitChecked: head,
        entries: [
            { candidate: 'ordinary path', status: 'done', evidence: 'pinned' },
        ],
    }, null, 2);
}

function makeFixture(t) {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'audit-worktree-test-'));
    t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));
    const repositoryRoot = join(fixtureRoot, 'repository');
    const temporaryRoot = join(fixtureRoot, 'temporary');
    mkdirSync(repositoryRoot);
    mkdirSync(temporaryRoot);
    git(repositoryRoot, 'init', '--quiet');
    writeFileSync(join(repositoryRoot, 'AGENTS.md'), '# Test instructions\n');
    writeFileSync(join(repositoryRoot, 'game.js'), 'export const turn = 1;\n');
    const base = commit(repositoryRoot, 'base');

    writeFileSync(join(repositoryRoot, 'game.js'), 'export const turn = 2;\n');
    const mutationBase = commit(repositoryRoot, 'first implementation');
    writeFileSync(join(repositoryRoot, 'game.js'), 'export const turn = 3;\n');
    const head = commit(repositoryRoot, 'implementation');
    mkdirSync(join(repositoryRoot, '.agents'));
    writeFileSync(
        join(repositoryRoot, '.agents', 'implementation-checklist.json'),
        readyChecklist(head),
    );

    const skillPath = join(fixtureRoot, 'SKILL.md');
    writeFileSync(skillPath, '# audit-diff-correctness\n');
    const promptPath = join(fixtureRoot, 'prompt.md');
    writeFileSync(
        promptPath,
        `Read AGENTS.md. Run audit-diff-correctness for ${
            base}..${head}. Do not access the sealed holdout directory.\n`,
    );
    return {
        base,
        head,
        mutationBase,
        promptPath,
        repositoryRoot,
        skillPath,
        temporaryRoot,
    };
}

function prepare(fixture) {
    return prepareAuditWorktree({
        range: `${fixture.base}..${fixture.head}`,
        skill: 'audit-diff-correctness',
        skillPath: fixture.skillPath,
        promptPath: fixture.promptPath,
        repositoryRoot: fixture.repositoryRoot,
        temporaryRoot: fixture.temporaryRoot,
    });
}

/**
 * A fixture whose checklist is committed, so it names the implementation
 * commit rather than the head. This is the shape every real checklist has and
 * the shape makeFixture() cannot produce: it leaves the checklist uncommitted
 * so that it can name HEAD.
 *
 * Four options build the cases that must still refuse: `gapTouchesProduction`
 * changes the one area-owned path in the commit after the checklist, `ledger`
 * omits QUALITY.json, `sideBranch` puts the commit the checklist names off the
 * head's history, and `namedRef` writes a hand-written revision expression in
 * place of the SHA that `git rev-parse` produced.
 */
function makeCommittedChecklistFixture(t, {
    gapTouchesProduction = false,
    ledger = true,
    namedRef = null,
    sideBranch = false,
} = {}) {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'audit-worktree-test-'));
    t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));
    const repositoryRoot = join(fixtureRoot, 'repository');
    const temporaryRoot = join(fixtureRoot, 'temporary');
    mkdirSync(repositoryRoot);
    mkdirSync(temporaryRoot);
    git(repositoryRoot, 'init', '--quiet');
    mkdirSync(join(repositoryRoot, 'js'));
    mkdirSync(join(repositoryRoot, '.agents'));
    writeFileSync(join(repositoryRoot, 'AGENTS.md'), '# Test instructions\n');
    const gamePath = join(repositoryRoot, 'js', 'game.js');
    writeFileSync(gamePath, 'export const turn = 1;\n');
    const base = commit(repositoryRoot, 'base');

    // The ledger names the base as its frontier, so the frontier check is not
    // what refuses. QUALITY.json owns no area itself, so it may sit in the gap.
    if (ledger) {
        writeFileSync(join(repositoryRoot, 'QUALITY.json'), `${JSON.stringify({
            enforcementBase: base,
            areas: [
                { id: 'runtime', label: 'Core runtime', paths: ['js/game.js'] },
            ],
            passes: [],
        }, null, 2)}\n`);
        commit(repositoryRoot, 'ledger');
    }

    writeFileSync(gamePath, 'export const turn = 2;\n');
    const implementation = commit(repositoryRoot, 'implementation');

    let named = implementation;
    if (sideBranch) {
        const branch = git(repositoryRoot, 'rev-parse', '--abbrev-ref', 'HEAD');
        git(repositoryRoot, 'checkout', '--quiet', '-b', 'side');
        writeFileSync(join(repositoryRoot, 'SIDE.md'), 'a parallel history\n');
        named = commit(repositoryRoot, 'side');
        git(repositoryRoot, 'checkout', '--quiet', branch);
    }
    writeFileSync(
        join(repositoryRoot, '.agents', 'implementation-checklist.json'),
        readyChecklist(namedRef ?? named),
    );
    if (gapTouchesProduction) {
        writeFileSync(gamePath, 'export const turn = 3;\n');
    }
    const head = commit(repositoryRoot, 'checklist');

    const skillPath = join(fixtureRoot, 'SKILL.md');
    writeFileSync(skillPath, '# audit-diff-correctness\n');
    const promptPath = join(fixtureRoot, 'prompt.md');
    writeFileSync(
        promptPath,
        `Read AGENTS.md. Run audit-diff-correctness for ${
            base}..${head}. Do not access the sealed holdout directory.\n`,
    );
    return {
        base, head, implementation, named, promptPath, repositoryRoot,
        skillPath, temporaryRoot,
    };
}

test('parses lifecycle commands and exact two-dot ranges', () => {
    assert.deepEqual(parseRange('main~1..main'), {
        base: 'main~1',
        head: 'main',
    });
    assert.throws(() => parseRange('main...head'), /exactly/u);
    assert.throws(() => parseRange('--all..head'), /dash/u);
    assert.deepEqual(
        parseAuditArgs(['check', '/tmp/example/audit-worktree.json']),
        {
            command: 'check',
            manifestPath: '/tmp/example/audit-worktree.json',
        },
    );
});

test('audit prompts require an explicit sealed-data prohibition', t => {
    const fixture = makeFixture(t);
    writeFileSync(
        fixture.promptPath,
        `Read AGENTS.md. Run audit-diff-correctness for ${
            fixture.base}..${fixture.head}. Inspect the sealed holdout directory.\n`,
    );
    assert.throws(
        () => prepare(fixture),
        /sealed-holdout prohibition/u,
    );
});

test('audit prompts reject double-negative sealed-data instructions', t => {
    const fixture = makeFixture(t);
    for (const instruction of [
        'Do not forget to inspect the sealed holdout directory.',
        'Never avoid reading the sealed holdout directory.',
    ]) {
        writeFileSync(
            fixture.promptPath,
            `Read AGENTS.md. Run audit-diff-correctness for ${
                fixture.base}..${fixture.head}. ${instruction}\n`,
        );
        assert.throws(
            () => prepare(fixture),
            /sealed-holdout prohibition/u,
            instruction,
        );
    }
});

test('requires a ready checklist tied to the exact head', () => {
    const head = 'a'.repeat(40);
    assert.doesNotThrow(() => validateChecklist(readyChecklist(head), head));
    assert.throws(
        () => validateChecklist(
            readyChecklist(head).replace('"done"', '"missing"'),
            head,
        ),
        /still contains: missing/u,
    );
    assert.throws(
        () => validateChecklist(
            readyChecklist(head).replace('"done"', '"finished"'),
            head,
        ),
        /unknown status/u,
    );
    assert.throws(
        () => validateChecklist(
            readyChecklist(head).replace('"ready-for-audit"', '"implementation"'),
            head,
        ),
        /mode is not ready-for-audit/u,
    );
    assert.throws(
        () => validateChecklist('Current mode: Ready for audit', head),
        /not valid JSON/u,
    );
    assert.throws(
        () => validateChecklist(readyChecklist('b'.repeat(40)), head),
        /not a+/u,
    );
    // Exact coverage is recorded as nothing, because there is no gap to
    // explain to a later reader.
    assert.equal(validateChecklist(readyChecklist(head), head), null);
});

// A checklist cannot name the commit that contains it, so a committed one
// always names an ancestor of the head. Measured on 8 August 2026: a checklist
// committed in the head commit is refused with `covers <parent>, not <head>`,
// and pointing the range head at the commit it does name is refused by
// --readiness with `HEAD is <later> and the range head <earlier>`.
test('a checklist naming an ancestor covers the head over unowned paths only',
    () => {
        const owned = new Set(['js/mon.js', 'js/monmove.js']);
        const ancestor = 'a'.repeat(40);

        // A tracker-only gap changes nothing a review frontier advances over.
        assert.match(
            ancestorCoverageReason(ancestor,
                ['.agents/implementation-checklist.json', 'PHASES.tsv'], owned),
            /covers aaaaaaaa, an ancestor of the range head; the 2 path\(s\) /u,
        );
        // One production path in the gap is work no checklist entry covers,
        // which is what the equality test existed to stop.
        assert.equal(
            ancestorCoverageReason(ancestor,
                ['.agents/implementation-checklist.json', 'js/mon.js'], owned),
            null,
        );

        // The reason, not merely the acceptance, is what validateChecklist
        // hands back for the manifest to record.
        const head = 'b'.repeat(40);
        assert.deepEqual(
            validateChecklist(readyChecklist(ancestor), head,
                (commitChecked) => `accepted ${commitChecked.slice(0, 8)}`),
            { commitChecked: ancestor, reason: 'accepted aaaaaaaa' },
        );
        // An acceptor that declines leaves the original refusal in place.
        assert.throws(
            () => validateChecklist(readyChecklist(ancestor), head, () => null),
            /covers a+, not b+/u,
        );
    });

test('prepares, rechecks, and cleans an exact audit worktree', t => {
    const fixture = makeFixture(t);
    const prepared = prepare(fixture);

    assert.equal(existsSync(prepared.manifestPath), true);
    assert.equal(
        git(prepared.manifest.worktreePath, 'rev-parse', 'HEAD'),
        fixture.head,
    );
    const checked = checkAuditWorktree({
        manifestPath: prepared.manifestPath,
        repositoryRoot: fixture.repositoryRoot,
    });
    assert.match(checked.command, /codex exec --profile audit-high --json/u);
    assert.equal(
        auditCommand(prepared.manifest).includes(prepared.manifest.worktreePath),
        true,
    );

    const manifestPath = prepared.manifestPath;
    const workRoot = prepared.manifest.workRoot;
    assert.deepEqual(
        cleanupAuditWorktree({
            manifestPath,
            repositoryRoot: fixture.repositoryRoot,
        }),
        { alreadyClean: false },
    );
    assert.equal(existsSync(workRoot), false);
    assert.deepEqual(
        cleanupAuditWorktree({
            manifestPath,
            repositoryRoot: fixture.repositoryRoot,
        }),
        { alreadyClean: true },
    );
});

test('recheck detects changed prompt and cleanup preserves audit changes', t => {
    const fixture = makeFixture(t);
    const prepared = prepare(fixture);
    t.after(() => {
        if (!existsSync(prepared.manifestPath)) return;
        rmSync(join(prepared.manifest.worktreePath, 'audit-note.txt'), {
            force: true,
        });
        rmSync(join(prepared.manifest.workRoot, 'audit-output.jsonl'), {
            force: true,
        });
        cleanupAuditWorktree({
            manifestPath: prepared.manifestPath,
            repositoryRoot: fixture.repositoryRoot,
        });
    });

    writeFileSync(
        prepared.manifest.prompt.path,
        `${readFileSync(prepared.manifest.prompt.path, 'utf8')}changed\n`,
    );
    assert.throws(
        () => checkAuditWorktree({
            manifestPath: prepared.manifestPath,
            repositoryRoot: fixture.repositoryRoot,
        }),
        /prompt changed/u,
    );

    writeFileSync(
        prepared.manifest.prompt.path,
        `Read AGENTS.md. Run audit-diff-correctness for ${
            fixture.base}..${fixture.head}. Do not access sessions/holdout.\n`,
    );
    writeFileSync(
        join(prepared.manifest.worktreePath, 'audit-note.txt'),
        'proposed change\n',
    );
    assert.throws(
        () => cleanupAuditWorktree({
            manifestPath: prepared.manifestPath,
            repositoryRoot: fixture.repositoryRoot,
        }),
        /has changes/u,
    );
    rmSync(join(prepared.manifest.worktreePath, 'audit-note.txt'));
    writeFileSync(
        join(prepared.manifest.workRoot, 'audit-output.jsonl'),
        '{"result":"must be preserved"}\n',
    );
    assert.throws(
        () => cleanupAuditWorktree({
            manifestPath: prepared.manifestPath,
            repositoryRoot: fixture.repositoryRoot,
        }),
        /unpreserved files: audit-output\.jsonl/u,
    );
});

test('cleanup finishes after git worktree remove stranded the root', t => {
    const fixture = makeFixture(t);
    const prepared = prepare(fixture);

    // What `git worktree remove` leaves behind: no worktree and no
    // registration, but the manifest and snapshots still in the root.
    git(fixture.repositoryRoot, 'worktree', 'remove', '--force',
        prepared.manifest.worktreePath);
    assert.equal(existsSync(prepared.manifest.worktreePath), false);
    assert.equal(existsSync(prepared.manifestPath), true);

    assert.deepEqual(
        cleanupAuditWorktree({
            manifestPath: prepared.manifestPath,
            repositoryRoot: fixture.repositoryRoot,
        }),
        { alreadyClean: false, leftoversRemoved: true },
    );
    assert.equal(existsSync(prepared.manifest.workRoot), false);
});

test('cleanup still refuses an unregistered worktree that exists', t => {
    const fixture = makeFixture(t);
    const prepared = prepare(fixture);
    t.after(() => rmSync(prepared.manifest.workRoot, {
        recursive: true, force: true,
    }));

    // A directory at the worktree path with no registration may hold audit
    // changes, so cleanup must not treat it as an interrupted removal.
    git(fixture.repositoryRoot, 'worktree', 'remove', '--force',
        prepared.manifest.worktreePath);
    mkdirSync(prepared.manifest.worktreePath);
    writeFileSync(
        join(prepared.manifest.worktreePath, 'audit-note.txt'),
        'proposed change\n',
    );

    assert.throws(
        () => cleanupAuditWorktree({
            manifestPath: prepared.manifestPath,
            repositoryRoot: fixture.repositoryRoot,
        }),
        /is not registered; refusing cleanup/u,
    );
    assert.equal(existsSync(prepared.manifest.workRoot), true);
});

test('cleanup preserves an unpreserved file when finishing a stranded root', t => {
    const fixture = makeFixture(t);
    const prepared = prepare(fixture);
    t.after(() => rmSync(prepared.manifest.workRoot, {
        recursive: true, force: true,
    }));

    git(fixture.repositoryRoot, 'worktree', 'remove', '--force',
        prepared.manifest.worktreePath);
    writeFileSync(
        join(prepared.manifest.workRoot, 'audit-output.jsonl'),
        '{"result":"must be preserved"}\n',
    );

    assert.throws(
        () => cleanupAuditWorktree({
            manifestPath: prepared.manifestPath,
            repositoryRoot: fixture.repositoryRoot,
        }),
        /unpreserved files: audit-output\.jsonl/u,
    );
    assert.equal(existsSync(prepared.manifest.workRoot), true);
});

test('cleanup rejects a manifest moved outside its prepared root', t => {
    const fixture = makeFixture(t);
    const prepared = prepare(fixture);
    t.after(() => cleanupAuditWorktree({
        manifestPath: prepared.manifestPath,
        repositoryRoot: fixture.repositoryRoot,
    }));

    const copiedManifest = join(fixture.temporaryRoot, MANIFEST_NAME);
    writeFileSync(
        copiedManifest,
        readFileSync(prepared.manifestPath, 'utf8'),
    );
    assert.throws(
        () => cleanupAuditWorktree({
            manifestPath: copiedManifest,
            repositoryRoot: fixture.repositoryRoot,
        }),
        /outside an expected temporary root/u,
    );
});

test('readiness records its exact mutation range and report', () => {
    const base = 'b'.repeat(40);
    const mutationBase = 'c'.repeat(40);
    const head = 'a'.repeat(40);
    const reportPath = '/tmp/audit/mutation-report.json';
    const seen = [];
    // A fake runner that passes everything: the entries carry each command,
    // its verdict, and the last lines of its output for the manifest.
    const green = (command, args) => {
        seen.push(`${command} ${args.join(' ')}`);
        return { status: 0, stdout: 'line1\nline2\n', stderr: '' };
    };
    const results = runReadiness({
        root: '/repo', base, head, mutationBase, reportPath, run: green,
    });
    assert.deepEqual(results.map(({ label }) => label),
        ['checkpoint', 'quality check', 'range mutation']);
    // The mutation command names the exact frozen range and the three gating
    // kinds, so a transcribed range cannot drift from the audited one.
    assert.equal(seen[2],
        `npm run mutate -- --range ${mutationBase}..${head} `
            + '--kind relational,logical,boolean '
            + `--report ${reportPath}`);
    assert.equal(results[0].passed, true);
    assert.equal(results[0].tail, 'line1\nline2');

    // One red command refuses the whole preparation and names the failure.
    const redOnQuality = (command, args) => ({
        status: args.includes('quality') ? 1 : 0,
        stdout: 'boom\n',
        stderr: '',
    });
    assert.throws(
        () => runReadiness({ root: '/repo', base, head, run: redOnQuality }),
        /readiness commands failed: quality check/u,
    );
});

test('a committed checklist can ride with the pass that reviews its slice',
    t => {
        const fixture = makeCommittedChecklistFixture(t);
        const prepared = prepareAuditWorktree({
            range: `${fixture.base}..${fixture.head}`,
            skill: 'audit-diff-correctness',
            skillPath: fixture.skillPath,
            promptPath: fixture.promptPath,
            repositoryRoot: fixture.repositoryRoot,
            temporaryRoot: fixture.temporaryRoot,
            // --readiness is half the circularity: it demands the range head be
            // HEAD, so the checklist cannot be behind by pointing the range
            // backwards instead.
            readiness: true,
            runReadinessCommands: input => {
                writeFileSync(input.reportPath, '{"version":1}\n');
                return [];
            },
        });
        t.after(() => cleanupAuditWorktree({
            manifestPath: prepared.manifestPath,
            repositoryRoot: fixture.repositoryRoot,
        }));

        // The manifest carries why the checklist was allowed to be behind, so
        // a later reader does not have to rediscover the gap.
        assert.deepEqual(prepared.manifest.checklist.coverage, {
            commitChecked: fixture.implementation,
            reason: `the checklist covers ${fixture.implementation.slice(0, 8)}`
                + ', an ancestor of the range head; the 1 path(s) changed '
                + 'between them own no QUALITY.json area',
        });
        // The pass record projects the same gap. The manifest goes with
        // cleanup, so QUALITY.json is where a reader finds it later.
        assert.deepEqual(
            passChecklistFromManifest(prepared.manifestPath,
                `${fixture.base}..${fixture.head}`),
            {
                covers: true,
                path: '.agents/implementation-checklist.json',
                commitChecked: fixture.implementation,
                reason: prepared.manifest.checklist.coverage.reason,
            },
        );
        // check re-decides the question rather than trusting that record.
        assert.doesNotThrow(() => checkAuditWorktree({
            manifestPath: prepared.manifestPath,
            repositoryRoot: fixture.repositoryRoot,
        }));
    });

test('a checklist behind an unreviewed production commit is still refused',
    t => {
        const fixture = makeCommittedChecklistFixture(t,
            { gapTouchesProduction: true });

        // js/game.js is the fixture ledger's one area-owned path, so the
        // checklist demonstrably never read the head commit's production work.
        assert.throws(
            () => prepare(fixture),
            /implementation checklist covers .*, not /u,
        );
    });

test('a checklist naming a commit off the head history is still refused', t => {
    // `git diff` answers for two unrelated commits as readily as for a parent
    // and a child, so nothing but the ancestry test stops a checklist that
    // names a commit the range never contained.
    const fixture = makeCommittedChecklistFixture(t, { sideBranch: true });

    assert.notEqual(fixture.named, fixture.implementation);
    assert.throws(
        () => prepare(fixture),
        /implementation checklist covers .*, not /u,
    );
});

test('a checklist naming a revision expression is refused before git reads it',
    t => {
        // `HEAD~1` names the implementation commit here, so both later tests
        // would pass it: it is an ancestor of the head, and the only path in
        // the gap owns no area. The full-SHA test is what refuses it, and it
        // is the same test that keeps an option-shaped value such as
        // `--upload-pack=...` out of `git merge-base --is-ancestor <arg>` and
        // `git diff --name-only <arg>..<head>` below it.
        const fixture = makeCommittedChecklistFixture(t,
            { namedRef: 'HEAD~1' });

        assert.equal(
            git(fixture.repositoryRoot, 'rev-parse', 'HEAD~1'),
            fixture.implementation,
        );
        assert.throws(
            () => prepare(fixture),
            /implementation checklist covers HEAD~1, not /u,
        );
    });

test('a checklist ahead of its head is refused without a ledger to consult',
    t => {
        // The gap can only be shown to be free of the paths a pass must read
        // when something lists them, so an absent QUALITY.json refuses.
        const fixture = makeCommittedChecklistFixture(t, { ledger: false });

        assert.equal(
            existsSync(join(fixture.repositoryRoot, 'QUALITY.json')), false);
        assert.throws(
            () => prepare(fixture),
            /implementation checklist covers .*, not /u,
        );
    });

// The reason a real pass needed on 12 August 2026, when both routes closed at
// once over a checklist 38 commits behind with production work in between.
const EXCEPTION_REASON = 'the eight ported units landed as separate slices, '
    + 'each with its own fresh differential; no checklist guided them';

function prepareWithReason(fixture, extra = {}) {
    return prepareAuditWorktree({
        range: `${fixture.base}..${fixture.head}`,
        skill: 'audit-diff-correctness',
        skillPath: fixture.skillPath,
        promptPath: fixture.promptPath,
        repositoryRoot: fixture.repositoryRoot,
        temporaryRoot: fixture.temporaryRoot,
        noChecklistReason: EXCEPTION_REASON,
        ...extra,
    });
}

// The remedy for the dead end above. Both routes past the gate closed at once,
// so the pass ran behind a checklist written after the work it described, and
// nothing but its author's candour recorded that. A checklist that cannot cover
// the range will not be read by the pass either way; saying so is the honest
// alternative.
test('a checklist that cannot cover the range may be bypassed with a reason',
    t => {
        const fixture = makeCommittedChecklistFixture(t,
            { gapTouchesProduction: true });

        // Using it is still refused, on the unchanged coverage rule: the head
        // commit changed js/game.js, the fixture ledger's one area-owned path.
        assert.throws(
            () => prepare(fixture),
            /implementation checklist covers .*, not /u,
        );

        const prepared = prepareWithReason(fixture);
        t.after(() => cleanupAuditWorktree({
            manifestPath: prepared.manifestPath,
            repositoryRoot: fixture.repositoryRoot,
        }));
        // The exception names the checklist that stopped short, so a reader
        // never has to guess whether one existed at all.
        assert.deepEqual(prepared.manifest.checklist, {
            sourcePath: null,
            snapshotPath: null,
            reason: EXCEPTION_REASON,
            notCovering: {
                path: '.agents/implementation-checklist.json',
                commitChecked: fixture.implementation,
            },
        });
        // Nothing snapshots a checklist the pass will not read: check would
        // otherwise revalidate a plan for other work and refuse the worktree.
        assert.equal(
            existsSync(join(prepared.manifest.workRoot,
                'implementation-checklist.json')),
            false,
        );
        assert.doesNotThrow(() => checkAuditWorktree({
            manifestPath: prepared.manifestPath,
            repositoryRoot: fixture.repositoryRoot,
        }));
    });

// The narrowing must not open the gate. A checklist that covers the range is a
// plan for exactly this work, whether it names the head or an accepted
// ancestor, and pointing --checklist at a path that holds nothing must not
// route around it either.
test('a covering checklist still refuses to be bypassed', t => {
    // Names the head exactly, so it covers by the equality test.
    const exact = makeFixture(t);
    assert.throws(
        () => prepareWithReason(exact),
        /implementation-checklist\.json covers the range head; use it instead/u,
    );
    // Names an ancestor whose gap owns no area, so it covers by
    // ancestorCoverageReason(). Both gates ask the same function.
    const ancestor = makeCommittedChecklistFixture(t);
    assert.throws(
        () => prepareWithReason(ancestor),
        /implementation-checklist\.json covers the range head; use it instead/u,
    );
    // --checklist naming a path that holds nothing still answers to the
    // default checklist, which here covers the range.
    assert.throws(
        () => prepareWithReason(exact,
            { checklistPath: '.agents/other-checklist.json' }),
        /implementation-checklist\.json covers the range head; use it instead/u,
    );
});

test('a range with no checklist at all records an exception naming none', t => {
    const fixture = makeFixture(t);
    rmSync(join(fixture.repositoryRoot, '.agents',
        'implementation-checklist.json'));
    const prepared = prepareWithReason(fixture);
    t.after(() => cleanupAuditWorktree({
        manifestPath: prepared.manifestPath,
        repositoryRoot: fixture.repositoryRoot,
    }));

    assert.equal(prepared.manifest.checklist.notCovering, null);
    assert.deepEqual(
        passChecklistFromManifest(prepared.manifestPath,
            `${fixture.base}..${fixture.head}`),
        {
            covers: false,
            path: null,
            commitChecked: null,
            reason: EXCEPTION_REASON,
        },
    );
});

// The manifest sits under a temporary root that cleanup deletes, so the pass
// record is the only durable copy of what stood behind the range.
test('the pass record carries each checklist disposition out of the manifest',
    t => {
        const exact = makeFixture(t);
        const covering = prepare(exact);
        t.after(() => cleanupAuditWorktree({
            manifestPath: covering.manifestPath,
            repositoryRoot: exact.repositoryRoot,
        }));
        const exactRange = `${exact.base}..${exact.head}`;
        assert.deepEqual(
            passChecklistFromManifest(covering.manifestPath, exactRange),
            {
                covers: true,
                path: '.agents/implementation-checklist.json',
                // A checklist that covers exactly records no gap, so the head
                // it named is the range head.
                commitChecked: exact.head,
                reason: null,
            },
        );
        // A manifest prepared for another range cannot lend its disposition.
        assert.throws(
            () => passChecklistFromManifest(covering.manifestPath,
                `${exact.base}..${exact.base}`),
            /audit manifest covers .*, not the recorded range/u,
        );

        const behind = makeCommittedChecklistFixture(t,
            { gapTouchesProduction: true });
        const exception = prepareWithReason(behind);
        t.after(() => cleanupAuditWorktree({
            manifestPath: exception.manifestPath,
            repositoryRoot: behind.repositoryRoot,
        }));
        assert.deepEqual(
            passChecklistFromManifest(exception.manifestPath,
                `${behind.base}..${behind.head}`),
            {
                covers: false,
                path: '.agents/implementation-checklist.json',
                commitChecked: behind.implementation,
                reason: EXCEPTION_REASON,
            },
        );
    });

test('prepare accepts --readiness as a boolean option', () => {
    const parsed = parseAuditArgs(['prepare', '--range', 'a..b',
        '--mutation-range', 'm..b', '--skill', 's', '--skill-path', 'p',
        '--prompt', 'q', '--readiness']);
    assert.equal(parsed.readiness, true);
    assert.equal(parsed.mutationRange, 'm..b');
    const without = parseAuditArgs(['prepare', '--range', 'a..b',
        '--skill', 's', '--skill-path', 'p', '--prompt', 'q']);
    assert.equal(without.readiness, false);
});

test('prepare embeds a follow-up mutation delta and its report path', t => {
    const fixture = makeFixture(t);
    let readinessInput;
    const prepared = prepareAuditWorktree({
        range: `${fixture.base}..${fixture.head}`,
        mutationRange: `${fixture.mutationBase}..${fixture.head}`,
        skill: 'audit-diff-correctness',
        skillPath: fixture.skillPath,
        promptPath: fixture.promptPath,
        repositoryRoot: fixture.repositoryRoot,
        temporaryRoot: fixture.temporaryRoot,
        readiness: true,
        runReadinessCommands: input => {
            readinessInput = input;
            writeFileSync(input.reportPath, '{"version":1}\n');
            return [];
        },
    });
    t.after(() => cleanupAuditWorktree({
        manifestPath: prepared.manifestPath,
        repositoryRoot: fixture.repositoryRoot,
    }));

    assert.equal(readinessInput.mutationBase, fixture.mutationBase);
    assert.deepEqual(prepared.manifest.mutation, {
        range: `${fixture.mutationBase}..${fixture.head}`,
        reportPath: join(prepared.manifest.workRoot, 'mutation-report.json'),
    });
});

test('a mutation delta must follow the audited history to its head', () => {
    const ancestors = new Set(['audit-base>delta', 'delta>audit-head']);
    const isAncestorOf = (ancestor, descendant) =>
        ancestor === descendant || ancestors.has(`${ancestor}>${descendant}`);

    assertMutationRangeWithinAudit({
        base: 'audit-base', head: 'audit-head',
        mutationBase: 'delta', mutationHead: 'audit-head', isAncestorOf,
    });
    assert.throws(() => assertMutationRangeWithinAudit({
        base: 'audit-base', head: 'audit-head',
        mutationBase: 'side-branch', mutationHead: 'audit-head', isAncestorOf,
    }), /suffix/u);
});

// The gate's two halves mean opposite things to a pass. readinessCommands()
// must ask for the health half alone: a plain --check refuses once the review
// gate reaches DUE, which is exactly when a pass is required, so the pass the
// gate demands could not be prepared.
test('readiness asks the quality gate for its health half alone', () => {
    const quality = readinessCommands('base', 'head')
        .find((entry) => entry.label === 'quality check');
    assert.deepEqual(quality.args, ['run', 'quality', '--', '--check', '--health']);
});

// reviewFrontier() takes the newest recorded review head, and ignores
// simplification passes, which carry their own frontier.
test('the review frontier is the newest recorded review head', () => {
    const isAncestorOf = (a, b) => a === b || Number(a) < Number(b);
    const config = {
        enforcementBase: '10',
        passes: [
            { kind: 'review', head: '20' },
            { kind: 'simplification', head: '90' },
            { kind: 'review', head: '30' },
        ],
    };
    assert.equal(reviewFrontier(config, 'review', isAncestorOf), '30');
    // With no recorded pass the frontier is the enforcement base.
    assert.equal(
        reviewFrontier({ enforcementBase: '10', passes: [] }, 'review',
            isAncestorOf),
        '10',
    );
});

// prepare() checks this before running anything, because record-review refuses
// the same range only after the whole pass has run.
test('a range starting after the frontier is refused', () => {
    const isAncestorOf = (a, b) => a === b || Number(a) < Number(b);
    // At the frontier, and before it, both cover it.
    assertRangeCoversFrontier('30', '30', isAncestorOf);
    assertRangeCoversFrontier('20', '30', isAncestorOf);
    // After it, the commits between would become reviewed history unread.
    assert.throws(
        () => assertRangeCoversFrontier('40', '30', isAncestorOf),
        /sits after the review frontier/u,
    );
});
