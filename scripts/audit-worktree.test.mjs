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
    return `# Implementation checklist

## Implementation table

| Path | Status |
| --- | --- |
| ordinary path | \`done\` |

## Validation

- Commit checked: ${head}

## Readiness

Current mode: Ready for audit
`;
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
        join(repositoryRoot, '.agents', 'implementation-checklist.md'),
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

test('requires a ready checklist tied to the exact head', () => {
    const head = 'a'.repeat(40);
    assert.doesNotThrow(() => validateChecklist(readyChecklist(head), head));
    assert.throws(
        () => validateChecklist(
            readyChecklist(head).replace('`done`', '`missing`'),
            head,
        ),
        /still contains: missing/u,
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
