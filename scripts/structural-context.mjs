// One effective execution environment and provenance contract for both runners.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { PROJECT_ROOT } from './c-functions.mjs';
import { diagnosticSourceHash, hash } from './structural-signals.mjs';

export function diagnosticEnvironment(input = process.env, root = PROJECT_ROOT) {
    // Do not inherit NETHACKOPTIONS/HACKOPTIONS, WIZKIT, NODE_OPTIONS,
    // LD_PRELOAD, locale, or other game/runtime configuration into either side.
    const env = { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', TZ: 'UTC', TMPDIR: '/tmp',
        NETHACK_BINARY: resolve(root, input.NETHACK_BINARY || 'nethack-c/recorder/install/games/lib/nethackdir/nethack'),
        NETHACK_INSTALL: resolve(root, input.NETHACK_INSTALL || 'nethack-c/recorder/install/games/lib/nethackdir'),
        SESSION_REPLAY_TIMEOUT_MS: String(input.SESSION_REPLAY_TIMEOUT_MS || 45000) };
    if (!Number.isFinite(Number(env.SESSION_REPLAY_TIMEOUT_MS)) || Number(env.SESSION_REPLAY_TIMEOUT_MS) <= 0)
        throw new Error('SESSION_REPLAY_TIMEOUT_MS must be positive');
    return Object.freeze(env);
}

export function artifactManifest(directory) {
    const visit = path => readdirSync(path, { withFileTypes: true }).flatMap(entry => {
        const file = join(path, entry.name);
        const bytes = entry.isDirectory() ? null : readFileSync(file);
        return entry.isDirectory() ? visit(file) : [{ path: relative(directory, file), bytes: bytes.length, sha256: hash(bytes) }];
    });
    return visit(directory).sort((a, b) => a.path.localeCompare(b.path));
}

export function executionContext(root = PROJECT_ROOT, environment = diagnosticEnvironment()) {
    if (resolve(root) !== PROJECT_ROOT) throw new Error('alternate root is unsupported by the shared differential executor');
    const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    return { baseCommit: git(['rev-parse', 'HEAD']), upstream: git(['-C', 'nethack-c/upstream', 'rev-parse', 'HEAD']),
        sourceHash: diagnosticSourceHash(root), recorderSha256: hash(readFileSync(environment.NETHACK_BINARY)),
        recorderInstallSha256: hash(JSON.stringify(artifactManifest(environment.NETHACK_INSTALL))),
        frozenSha256: hash(JSON.stringify(artifactManifest(join(root, 'frozen')))),
        scriptsSha256: hash(JSON.stringify(artifactManifest(join(root, 'scripts')))),
        node: process.version, nodeSha256: hash(readFileSync(process.execPath)), platform: process.platform,
        date: new Date().toISOString().slice(0, 10), environment };
}

export function assertExecutionContext(expected, root = PROJECT_ROOT) {
    if (!isDeepStrictEqual(expected, executionContext(root, expected.environment)))
        throw new Error('source/recorder/environment context changed; consistent-baseline summary withheld');
}
