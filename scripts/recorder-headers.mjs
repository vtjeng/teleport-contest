// Prepare the C headers the recorder build compiles against, for scripts that
// run the real C compiler over NetHack's source.
//
// nethack-c/build-recorder.sh compiles with CFLAGS=-I../include and no other
// game defines, after applying nethack-c/patches/*.patch and, on Linux,
// nethack-c/host-profiles/linux-macos-output.patch. This module copies
// nethack-c/upstream/include into a temporary directory and applies the
// include/ hunks of the same patches in the same order, so a configuration
// macro that a patch changes (for example REPRODUCIBLE_BUILD in config.h) has
// the recorder's value.
//
// The top-level Makefile generates include/nhlua.h, which includes Lua's own
// headers from lib/lua-*/; the submodule ships neither. The stub written here
// declares only the Lua types that NetHack's headers name. It is enough for the
// preprocessor and for constant expressions, which never depend on Lua; code
// that calls the Lua API does not compile against it.

import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const UPSTREAM_ROOT = join(PROJECT_ROOT, 'nethack-c', 'upstream');

const PATCH_DIR = join(PROJECT_ROOT, 'nethack-c', 'patches');
const HOST_PROFILE = join(PROJECT_ROOT, 'nethack-c', 'host-profiles', 'linux-macos-output.patch');

const NHLUA_STUB = `/* nhlua.h - stub written by scripts/recorder-headers.mjs; the real file
   includes Lua's headers, which the submodule does not ship. */
typedef struct lua_State lua_State;
typedef long long lua_Integer;
typedef double lua_Number;
typedef struct luaL_Reg luaL_Reg;
typedef int (*lua_CFunction)(lua_State *);
`;

// The recorder is built with clang (build-recorder.sh requires it for its
// argument-evaluation order). Prefer it; any C11 compiler handles the
// preprocessing and _Static_assert these scripts need.
export function findCompiler() {
    for (const name of ['clang', 'cc', 'gcc']) {
        const probe = spawnSync(name, ['--version'], { encoding: 'utf8' });
        if (probe.status === 0) return name;
    }
    return null;
}

// For a check that needs a C compiler: returns the compiler's name, or throws.
// A check never skips itself (AGENTS.md, "Fix a repeated defect at its
// source"), and building the C recorder needs a compiler anyway.
export function requireCompiler(why) {
    const compiler = findCompiler();
    if (!compiler) throw new Error(`no C compiler (clang, cc, or gcc) on PATH; ${why}`);
    return compiler;
}

function git(cwd, args) {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    if (result.status !== 0)
        throw new Error(`git ${args.join(' ')} failed in ${cwd}:\n${result.stderr}`);
}

// Returns { dir, includeDir, cleanup }. includeDir holds the patched headers
// and the nhlua.h stub.
export function prepareRecorderIncludes() {
    const dir = mkdtempSync(join(tmpdir(), 'recorder-headers-'));
    const includeDir = join(dir, 'include');
    cpSync(join(UPSTREAM_ROOT, 'include'), includeDir, { recursive: true });
    // build-recorder.sh commits a baseline before `git apply --recount`;
    // without an index, git apply can skip a hunk whose counts are off.
    git(dir, ['init', '-q']);
    git(dir, ['-c', 'gc.auto=0', 'add', '-A']);
    git(dir, ['-c', 'user.email=build@local', '-c', 'user.name=build',
        'commit', '-q', '-m', 'baseline']);
    const patches = readdirSync(PATCH_DIR)
        .filter((name) => name.endsWith('.patch'))
        .sort()
        .map((name) => join(PATCH_DIR, name));
    patches.push(HOST_PROFILE);
    for (const patch of patches)
        git(dir, ['apply', '--recount', '--include=include/*', patch]);
    writeFileSync(join(includeDir, 'nhlua.h'), NHLUA_STUB);
    return {
        dir,
        includeDir,
        cleanup: () => rmSync(dir, { recursive: true, force: true }),
    };
}
