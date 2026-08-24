#!/usr/bin/env node

// Generate the test oracle for glyphs.c parse_id() by asking the patched C
// executable to run its own --dumpglyphids early argument.  The dump is the
// authoritative callback output, including numeric holes and duplicate IDs;
// it is independent of js/glyph_ids.js and its generated inputs.

import { execFileSync } from 'node:child_process';
import {
    existsSync,
    readFileSync,
    writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DEFAULT_NETHACK = join(
    PROJECT_ROOT, 'nethack-c', 'recorder', 'install', 'games', 'nethack',
);
const OUTPUT_PATH = join(PROJECT_ROOT, 'scripts', 'glyph-id-reference.txt.gz');
// nethack-c/upstream's gitlink pins 16ff59115315917b93185d026aeefea06db9b0f4.
// The recorder binary is built from that checkout by the repository's normal
// recorder workflow; unlike the generated JS tables, it is not committed.

const checkOnly = process.argv.includes('--check');
const executableArgument = process.argv.find((argument) => (
    argument !== '--check' && argument !== process.argv[0]
    && argument !== process.argv[1]
));
if (process.argv.length > 2 + Number(checkOnly) + Number(Boolean(executableArgument))) {
    throw new Error(
        'usage: generate-glyph-id-reference.mjs [--check] [nethack-command]',
    );
}
const executable = executableArgument ?? DEFAULT_NETHACK;
if (!existsSync(executable)) {
    throw new Error(
        `${executable} is missing; build the patched recorder before regenerating`,
    );
}
const dump = execFileSync(executable, ['--dumpglyphids']);
const output = gzipSync(dump, { level: 9, mtime: 0 });
if (checkOnly) {
    const existing = readFileSync(OUTPUT_PATH);
    if (!existing.equals(output)) {
        throw new Error(
            'scripts/glyph-id-reference.txt.gz is stale; regenerate it',
        );
    }
} else {
    writeFileSync(OUTPUT_PATH, output);
}
