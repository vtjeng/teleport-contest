#!/usr/bin/env node

// Fresh production matrix for wizcmds.c wiz_where() and dungeon.c
// print_dungeon(FALSE). Each independently chosen debug-wizard segment first
// dismisses startup with a space, types the extended command, then sends LF
// to the NHW_MENU informational window's xwaitforspace() boundary.

import { readFileSync } from 'node:fs';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const RECIPE_PATH = new URL(
    '../recipes/dungeon.c/wizwhere-informational-independent.session.json',
    import.meta.url,
);

export function loadDungeonPrintRecipe() {
    return validateCleanRecipe(
        JSON.parse(readFileSync(RECIPE_PATH, 'utf8')),
        'wizwhere informational recipe',
    );
}

export async function runDungeonPrintMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'wizwhere informational dungeon report',
            recipe: loadDungeonPrintRecipe(),
        }],
        summaryLabel: 'WIZWHERE INFORMATIONAL',
        // The recorder keeps one process per chunk; each segment ends after
        // the informational window, so a fresh process avoids carrying that
        // closed NHW_MENU state into the next independently chosen case.
        chunkLimit: 1,
    });
}

runMatrixCli(import.meta.url, runDungeonPrintMatrix, 'wizwhere informational');
