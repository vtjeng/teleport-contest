#!/usr/bin/env node

// Generate js/lua_load_errors_data.js: the Lua syntax error that nhlua.c
// nhl_loadlua() reports for each non-Lua text file in the playground.
//
// #wizloadlua runs nhl_loadlua() on any name that contains a dot, such as
// "./license". For a playground file that is not Lua, luaL_loadbuffer()
// fails and C prints
//   impossible("luaL_loadbuffer: Error loading %s: %s", altfname, error)
// where error is "<chunkid>:<line>: <message>". The chunk id depends only on
// the name the player typed, which js/nhlua.js luaO_chunkid() formats; the
// line and message depend only on the file's contents. This script compiles
// a small program against the recorder's Lua library, loads each file the
// way nhl_loadlua() buffers it, and records the line and message.
//
// The files come from the recorder's install directory, so this script needs
// a built recorder (nethack-c/build-recorder.sh) and a C compiler. Set
// NETHACK_RECORDER to use a recorder tree other than nethack-c/recorder.
// Hosted CI builds no recorder, so `npm run check:lua-load-errors` is a local
// check and scripts/checkpoint-checks.mjs does not run it; run it after
// rebuilding the recorder.
//
// Usage: node scripts/generate-lua-load-errors.mjs [--check]

import { execFileSync } from 'node:child_process';
import {
    existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUTPUT_PATH = join(PROJECT_ROOT, 'js', 'lua_load_errors_data.js');
const LUA_VERSION = '5.4.8';

// The install's non-Lua files whose contents the install fixes. Excluded:
// the game-written files (livelog, logfile, perm, record, xlogfile), whose
// contents depend on earlier games, and the nethack and recover programs,
// whose first bytes depend on the host's executable format.
export const STATIC_TEXT_FILES = [
    'bogusmon', 'cmdhelp', 'data', 'engrave', 'epitaph', 'help', 'hh',
    'history', 'keyhelp', 'license', 'opthelp', 'options', 'optmenu',
    'oracles', 'rumors', 'symbols', 'sysconf', 'tribute', 'usagehlp',
    'wizhelp',
];

// nhl_loadlua() reads 8K chunks and assembles whole lines, dropping a '\r'
// that follows a '\n', stopping at a NUL, and appending a '\n' to an
// unterminated last line. For a file with no NUL or '\r' and no line of
// 8K or more, the buffer is the file plus that final '\n'. The harness
// refuses any other file rather than model the chunk arithmetic.
const HARNESS = String.raw`
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "lua.h"
#include "lauxlib.h"

int main(int argc, char **argv) {
    for (int i = 1; i < argc; i++) {
        FILE *fp = fopen(argv[i], "rb");
        if (!fp) { fprintf(stderr, "cannot open %s\n", argv[i]); return 2; }
        fseek(fp, 0L, SEEK_END);
        long len = ftell(fp);
        fseek(fp, 0L, SEEK_SET);
        char *buf = malloc((size_t) len + 2);
        if (fread(buf, 1, (size_t) len, fp) != (size_t) len) return 2;
        fclose(fp);
        long linelen = 0;
        for (long j = 0; j < len; j++) {
            if (buf[j] == '\0' || buf[j] == '\r') {
                fprintf(stderr, "%s: NUL or CR at byte %ld\n", argv[i], j);
                return 2;
            }
            linelen = buf[j] == '\n' ? 0 : linelen + 1;
            if (linelen >= 8192) {
                fprintf(stderr, "%s: line of 8K or more\n", argv[i]);
                return 2;
            }
        }
        if (len == 0 || buf[len - 1] != '\n') buf[len++] = '\n';
        buf[len] = '\0';
        lua_State *L = luaL_newstate();
        if (luaL_loadbuffer(L, buf, strlen(buf), "(x)") == LUA_OK) {
            fprintf(stderr, "%s: loads as Lua\n", argv[i]);
            return 2;
        }
        printf("%s\n", lua_tostring(L, -1));
        lua_close(L);
        free(buf);
    }
    return 0;
}
`;

// The chunk id luaO_chunkid() makes for the chunk name "(x)".
const CHUNK_PREFIX = '[string "(x)"]:';

function recorderPaths() {
    const recorder = process.env.NETHACK_RECORDER
        ?? join(PROJECT_ROOT, 'nethack-c', 'recorder');
    const paths = {
        install: join(recorder, 'install', 'games', 'lib', 'nethackdir'),
        include: join(recorder, 'lib', `lua-${LUA_VERSION}`, 'src'),
        library: join(recorder, 'lib', 'lua', `liblua-${LUA_VERSION}.a`),
    };
    for (const path of Object.values(paths)) {
        if (!existsSync(path)) {
            throw new Error(`${path} is missing; build the recorder with `
                + 'nethack-c/build-recorder.sh or set NETHACK_RECORDER');
        }
    }
    return paths;
}

export function loadErrors() {
    const { install, include, library } = recorderPaths();
    const work = mkdtempSync(join(tmpdir(), 'lua-load-errors-'));
    try {
        const source = join(work, 'harness.c');
        const program = join(work, 'harness');
        writeFileSync(source, HARNESS);
        execFileSync('cc', ['-O0', '-I', include, '-o', program, source,
            library, '-lm'], { stdio: 'inherit' });
        const lines = execFileSync(program,
            STATIC_TEXT_FILES.map((file) => join(install, file)),
            { encoding: 'latin1' }).split('\n');
        lines.pop();
        if (lines.length !== STATIC_TEXT_FILES.length)
            throw new Error(`expected ${STATIC_TEXT_FILES.length} errors, got ${lines.length}`);
        return STATIC_TEXT_FILES.map((file, i) => {
            const text = lines[i];
            if (!text.startsWith(CHUNK_PREFIX))
                throw new Error(`${file}: unexpected error ${JSON.stringify(text)}`);
            const match = /^(\d+): (.*)$/su.exec(text.slice(CHUNK_PREFIX.length));
            if (!match) throw new Error(`${file}: no line number in ${JSON.stringify(text)}`);
            return [file, Number(match[1]), match[2]];
        });
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
}

export function renderLoadErrors(rows) {
    const body = rows.map(([file, line, message]) =>
        `    ${JSON.stringify(file)}: [${line}, ${JSON.stringify(message)}],`)
        .join('\n');
    return `// Generated by scripts/generate-lua-load-errors.mjs; do not edit.
// For each non-Lua text file in the playground, the line and message of the
// Lua syntax error that nhlua.c nhl_loadlua() gets from luaL_loadbuffer().
export const LUA_LOAD_ERRORS = Object.freeze({
${body}
});
`;
}

function main() {
    const checkOnly = process.argv.length === 3 && process.argv[2] === '--check';
    if (process.argv.length > (checkOnly ? 3 : 2))
        throw new Error('Usage: node scripts/generate-lua-load-errors.mjs [--check]');
    const output = renderLoadErrors(loadErrors());
    if (checkOnly) {
        let existing = '';
        try {
            existing = readFileSync(OUTPUT_PATH, 'utf8');
        } catch {
            // The comparison below reports a missing generated file.
        }
        if (existing !== output) {
            console.error('js/lua_load_errors_data.js is stale; run '
                + 'node scripts/generate-lua-load-errors.mjs');
            process.exitCode = 1;
        }
    } else {
        writeFileSync(OUTPUT_PATH, output);
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
