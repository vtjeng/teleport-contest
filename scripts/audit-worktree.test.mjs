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
    auditCommand,
    checkAuditWorktree,
    cleanupAuditWorktree,
    parseAuditArgs,
    parseRange,
    prepareAuditWorktree,
    runReadiness,
    validateChecklist,
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

test('readiness runs the three commands and refuses any red one', () => {
    const base = 'b'.repeat(40);
    const head = 'a'.repeat(40);
    const seen = [];
    // A fake runner that passes everything: the entries carry each command,
    // its verdict, and the last lines of its output for the manifest.
    const green = (command, args) => {
        seen.push(`${command} ${args.join(' ')}`);
        return { status: 0, stdout: 'line1\nline2\n', stderr: '' };
    };
    const results = runReadiness({ root: '/repo', base, head, run: green });
    assert.deepEqual(results.map(({ label }) => label),
        ['checkpoint', 'quality check', 'range mutation']);
    // The mutation command names the exact frozen range and the three gating
    // kinds, so a transcribed range cannot drift from the audited one.
    assert.equal(seen[2],
        `npm run mutate -- --range ${base}..${head} `
            + '--kind relational,logical,boolean');
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

test('prepare accepts --readiness as a boolean option', () => {
    const parsed = parseAuditArgs(['prepare', '--range', 'a..b',
        '--skill', 's', '--skill-path', 'p', '--prompt', 'q', '--readiness']);
    assert.equal(parsed.readiness, true);
    const without = parseAuditArgs(['prepare', '--range', 'a..b',
        '--skill', 's', '--skill-path', 'p', '--prompt', 'q']);
    assert.equal(without.readiness, false);
});
