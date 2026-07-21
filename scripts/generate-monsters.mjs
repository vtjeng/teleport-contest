#!/usr/bin/env node

// Development-only exporter for NetHack's macro-defined monster catalog.
// The generated js/monsters.js is plain JavaScript and has no native runtime
// dependency. Keep this script in sync with include/permonst.h when that
// structure changes.

import { execFileSync } from 'node:child_process';
import {
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, '..');
const UPSTREAM_ROOT = join(PROJECT_ROOT, 'nethack-c', 'upstream');
const UPSTREAM_INCLUDE = join(UPSTREAM_ROOT, 'include');
const UPSTREAM_UNIX = join(UPSTREAM_ROOT, 'sys', 'unix');
const OUTPUT_PATH = join(PROJECT_ROOT, 'js', 'monsters.js');
const PINNED_REVISION = '16ff59115315917b93185d026aeefea06db9b0f4';
const checkOnly = process.argv.length === 3 && process.argv[2] === '--check';
if (process.argv.length > (checkOnly ? 3 : 2))
    throw new Error('Usage: node scripts/generate-monsters.mjs [--check]');

const exporterSource = String.raw`
#include "config.h"
#include "weight.h"
#include "permonst.h"
#include "wintype.h"
#include "sym.h"
#include "color.h"

#include <stdio.h>

extern void monst_globals_init(void);

struct enum_dump {
    int val;
    const char *name;
};

#define DUMP_ENUMS
static struct enum_dump monster_enums[] = {
#include "monsters.h"
};
#undef DUMP_ENUMS

#define DUMP_ENUMS_MONSYMS
static struct enum_dump class_enums[] = {
#include "defsym.h"
};
#undef DUMP_ENUMS_MONSYMS

#define DUMP_ENUMS_MONSYMS_DEFCHAR
static struct enum_dump class_char_enums[] = {
#include "defsym.h"
};
#undef DUMP_ENUMS_MONSYMS_DEFCHAR

static void
json_string(const char *value)
{
    const unsigned char *cursor;

    if (!value) {
        fputs("null", stdout);
        return;
    }
    putchar('"');
    for (cursor = (const unsigned char *) value; *cursor; ++cursor) {
        switch (*cursor) {
        case '"': fputs("\\\"", stdout); break;
        case '\\': fputs("\\\\", stdout); break;
        case '\b': fputs("\\b", stdout); break;
        case '\f': fputs("\\f", stdout); break;
        case '\n': fputs("\\n", stdout); break;
        case '\r': fputs("\\r", stdout); break;
        case '\t': fputs("\\t", stdout); break;
        default:
            if (*cursor < 0x20)
                printf("\\u%04x", (unsigned int) *cursor);
            else
                putchar(*cursor);
            break;
        }
    }
    putchar('"');
}

static void
print_enum(const char *name, long value, int *needs_comma)
{
    if (*needs_comma)
        putchar(',');
    json_string(name);
    printf(":%ld", value);
    *needs_comma = 1;
}

int
main(void)
{
    int i, j, needs_comma = 0;

    monst_globals_init();
    printf("{\"numMonsters\":%d,\"enums\":{", NUMMONS);
    print_enum("NUMMONS", NUMMONS, &needs_comma);
    print_enum("NON_PM", NON_PM, &needs_comma);
    print_enum("LOW_PM", LOW_PM, &needs_comma);
    print_enum("HIGH_PM", HIGH_PM, &needs_comma);
    print_enum("SPECIAL_PM", SPECIAL_PM, &needs_comma);
#define PRINT_ENUM(name) print_enum(#name, name, &needs_comma)
    PRINT_ENUM(G_UNIQ);
    PRINT_ENUM(G_NOHELL);
    PRINT_ENUM(G_HELL);
    PRINT_ENUM(G_NOGEN);
    PRINT_ENUM(G_NOCORPSE);
    PRINT_ENUM(G_FREQ);
    PRINT_ENUM(G_IGNORE);
    PRINT_ENUM(M1_OVIPAROUS);
    PRINT_ENUM(M2_UNDEAD);
    PRINT_ENUM(M2_HUMAN);
    PRINT_ENUM(M2_ELF);
    PRINT_ENUM(M2_DWARF);
    PRINT_ENUM(M2_GNOME);
    PRINT_ENUM(M2_ORC);
    PRINT_ENUM(M2_MALE);
    PRINT_ENUM(M2_FEMALE);
    PRINT_ENUM(M2_NEUTER);
    PRINT_ENUM(MR_FIRE);
    PRINT_ENUM(MR_COLD);
#undef PRINT_ENUM

    for (i = 0; i < (int) SIZE(class_enums); ++i)
        print_enum(class_enums[i].name, class_enums[i].val, &needs_comma);
    for (i = 0; i < (int) SIZE(monster_enums); ++i) {
        char name[128];
        snprintf(name, sizeof name, "PM_%s", monster_enums[i].name);
        print_enum(name, monster_enums[i].val, &needs_comma);
    }

    fputs("},\"classes\":[", stdout);
    for (i = 0; i < (int) SIZE(class_enums); ++i) {
        char symbol[2];
        if (i)
            putchar(',');
        symbol[0] = (char) class_char_enums[i].val;
        symbol[1] = '\0';
        printf("{\"index\":%d,\"name\":", class_enums[i].val);
        json_string(class_enums[i].name);
        fputs(",\"symbol\":", stdout);
        json_string(symbol);
        putchar('}');
    }

    fputs("],\"monsters\":[", stdout);
    for (i = 0; i <= NUMMONS; ++i) {
        const struct permonst *monster = &mons[i];

        if (i)
            putchar(',');
        fputs("{\"pmnames\":[", stdout);
        for (j = 0; j < NUM_MGENDERS; ++j) {
            if (j)
                putchar(',');
            json_string(monster->pmnames[j]);
        }
        printf("],\"pmidx\":%d,\"mlet\":%d,\"mlevel\":%d,"
               "\"mmove\":%d,\"ac\":%d,\"mr\":%d,"
               "\"maligntyp\":%d,\"geno\":%u,\"mattk\":[",
               monster->pmidx, (int) monster->mlet,
               (int) monster->mlevel, (int) monster->mmove,
               (int) monster->ac, (int) monster->mr,
               (int) monster->maligntyp, (unsigned) monster->geno);
        for (j = 0; j < NATTK; ++j) {
            const struct attack *attack = &monster->mattk[j];
            if (j)
                putchar(',');
            printf("{\"aatyp\":%u,\"adtyp\":%u,\"damn\":%u,\"damd\":%u}",
                   (unsigned) attack->aatyp, (unsigned) attack->adtyp,
                   (unsigned) attack->damn, (unsigned) attack->damd);
        }
        printf("],\"cwt\":%u,\"cnutrit\":%u,\"msound\":%u,"
               "\"msize\":%u,\"mresists\":%u,\"mconveys\":%u,"
               "\"mflags1\":%lu,\"mflags2\":%lu,\"mflags3\":%u,"
               "\"difficulty\":%u,\"mcolor\":%u}",
               monster->cwt, (unsigned) monster->cnutrit,
               (unsigned) monster->msound, (unsigned) monster->msize,
               (unsigned) monster->mresists, (unsigned) monster->mconveys,
               monster->mflags1, monster->mflags2,
               (unsigned) monster->mflags3,
               (unsigned) monster->difficulty, (unsigned) monster->mcolor);
    }
    fputs("]}\n", stdout);
    return 0;
}
`;

function formatModule(catalog) {
    const enumLines = Object.entries(catalog.enums)
        .map(([name, value]) => `export const ${name} = ${value};`)
        .join('\n');
    const classes = catalog.classes
        .map((entry) => `    Object.freeze(${JSON.stringify(entry)}),`)
        .join('\n');
    const monsters = catalog.monsters
        .map((monster) => {
            const attacks = monster.mattk
                .map((attack) => `Object.freeze(${JSON.stringify(attack)})`)
                .join(',');
            return `    Object.freeze({${Object.entries(monster)
                .filter(([key]) => key !== 'pmnames' && key !== 'mattk')
                .map(([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value)}`)
                .join(',')},"pmnames":Object.freeze(${JSON.stringify(monster.pmnames)}),"mattk":Object.freeze([${attacks}])}),`;
        })
        .join('\n');

    return `// Generated by scripts/generate-monsters.mjs from NetHack 5.0.
// Source: include/monsters.h, include/permonst.h, and src/monst.c at
// ${PINNED_REVISION}. Do not edit this file by hand.

import { game } from './gstate.js';

${enumLines}

export const MONSTER_CLASSES = Object.freeze([
${classes}
]);

export const MONSTER_TEMPLATES = Object.freeze([
${monsters}
]);

function cloneMonster(template) {
    return {
        ...template,
        pmnames: [...template.pmnames],
        mattk: template.mattk.map((attack) => ({ ...attack })),
    };
}

// C ref: src/monst.c monst_globals_init(). This is an early-init copy of the
// mutable catalog. Do not call it again after role_init() mutates quest mons.
export function monst_globals_init(state = game) {
    state.mons = MONSTER_TEMPLATES.map(cloneMonster);
    return state.mons;
}

// C ref: allmain.c newgame(). Only mvflags is reset at this boundary; born
// and died belong to the longer-lived mvitals storage.
export function reset_mvitals(state = game) {
    if (!Array.isArray(state.mons) || state.mons.length !== NUMMONS + 1)
        throw new Error('reset_mvitals requires monst_globals_init()');
    const mvitals = Array.isArray(state.mvitals)
        && state.mvitals.length === NUMMONS
        ? state.mvitals
        : Array.from({ length: NUMMONS }, () => ({}));
    for (let index = 0; index < NUMMONS; ++index) {
        const vital = mvitals[index] ??= {};
        vital.born ??= 0;
        vital.died ??= 0;
        vital.seen_close ??= 0;
        vital.photographed ??= 0;
        vital.mvflags = state.mons[index].geno & G_NOCORPSE;
    }
    state.mvitals = mvitals;
    state.svm ??= {};
    state.svm.mvitals = mvitals;
    return mvitals;
}

export function monsterClassSymbol(mlet) {
    return MONSTER_CLASSES[mlet - 1]?.symbol ?? '';
}
`;
}

const actualRevision = execFileSync(
    'git',
    ['-C', UPSTREAM_ROOT, 'rev-parse', 'HEAD'],
    { encoding: 'utf8' },
).trim();
if (actualRevision !== PINNED_REVISION) {
    throw new Error(
        `Expected NetHack source ${PINNED_REVISION}; found ${actualRevision}`,
    );
}
const trackedChanges = execFileSync(
    'git',
    ['-C', UPSTREAM_ROOT, 'status', '--porcelain=v1', '--untracked-files=no'],
    { encoding: 'utf8' },
).trim();
if (trackedChanges) {
    throw new Error('Refusing to generate from modified tracked upstream sources');
}

const workDir = mkdtempSync(join(tmpdir(), 'teleport-monster-export-'));
try {
    const exporterPath = join(workDir, 'export-monsters.c');
    const monstersPath = join(workDir, 'monst.o');
    const binaryPath = join(workDir, 'export-monsters');
    writeFileSync(exporterPath, exporterSource);
    execFileSync(
        'clang',
        [
            '-std=c99',
            '-I', UPSTREAM_INCLUDE,
            '-I', UPSTREAM_UNIX,
            '-c', join(UPSTREAM_ROOT, 'src', 'monst.c'),
            '-o', monstersPath,
        ],
        { stdio: 'inherit' },
    );
    execFileSync(
        'clang',
        [
            '-std=c99',
            '-I', UPSTREAM_INCLUDE,
            '-I', UPSTREAM_UNIX,
            exporterPath,
            monstersPath,
            '-o', binaryPath,
        ],
        { stdio: 'inherit' },
    );

    const catalog = JSON.parse(execFileSync(binaryPath, { encoding: 'utf8' }));
    if (catalog.monsters.length !== catalog.numMonsters + 1
        || catalog.enums.NUMMONS !== catalog.numMonsters) {
        throw new Error('C exporter produced an incomplete monster catalog');
    }
    if (catalog.classes.some((entry, index) => entry.index !== index + 1))
        throw new Error('C exporter produced a noncontiguous monster class table');
    const generatedModule = formatModule(catalog);
    if (checkOnly) {
        if (readFileSync(OUTPUT_PATH, 'utf8') !== generatedModule)
            throw new Error(`${OUTPUT_PATH} is stale; regenerate it`);
        process.stdout.write(`Verified ${OUTPUT_PATH}\n`);
    } else {
        writeFileSync(OUTPUT_PATH, generatedModule);
        process.stdout.write(`Generated ${OUTPUT_PATH}\n`);
    }
} finally {
    rmSync(workDir, { recursive: true, force: true });
}
