#!/usr/bin/env node

// Development-only exporter for NetHack's macro-defined object catalog.
// The generated js/objects.js is plain JavaScript and has no native runtime
// dependency. Keep this script in sync with include/objclass.h when that
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
const OUTPUT_PATH = join(PROJECT_ROOT, 'js', 'objects.js');
const PINNED_REVISION = '16ff59115315917b93185d026aeefea06db9b0f4';
const checkOnly = process.argv.length === 3 && process.argv[2] === '--check';
if (process.argv.length > (checkOnly ? 3 : 2))
    throw new Error('Usage: node scripts/generate-objects.mjs [--check]');

const exporterSource = String.raw`
#include "config.h"
#include "weight.h"
#include "obj.h"
#include "prop.h"
#include "skills.h"
#include "color.h"
#include "objclass.h"

#include <stdio.h>

extern void objects_globals_init(void);

struct enum_dump {
    int val;
    const char *name;
};

#define DUMP_ENUMS
static struct enum_dump object_enums[] = {
#include "objects.h"
};
#undef DUMP_ENUMS

#define DUMP_ENUMS_OBJCLASS_CLASSES
static struct enum_dump class_enums[] = {
#include "defsym.h"
    { MAXOCLASSES, "MAXOCLASSES" },
};
#undef DUMP_ENUMS_OBJCLASS_CLASSES

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
print_enum(const char *name, int value, int *needs_comma)
{
    if (*needs_comma)
        putchar(',');
    json_string(name);
    printf(":%d", value);
    *needs_comma = 1;
}

int
main(void)
{
    int i, needs_comma = 0;

    objects_globals_init();
    printf("{\"numObjects\":%d,\"enums\":{", NUM_OBJECTS);
    print_enum("RANDOM_CLASS", RANDOM_CLASS, &needs_comma);
    for (i = 0; i < (int) SIZE(class_enums); ++i)
        print_enum(class_enums[i].name, class_enums[i].val, &needs_comma);

#define PRINT_ENUM(name) print_enum(#name, name, &needs_comma)
    PRINT_ENUM(LAST_GENERIC);
    PRINT_ENUM(OBJCLASS_HACK);
    PRINT_ENUM(FIRST_OBJECT);
    PRINT_ENUM(FIRST_AMULET);
    PRINT_ENUM(LAST_AMULET);
    PRINT_ENUM(FIRST_SPELL);
    PRINT_ENUM(LAST_SPELL);
    PRINT_ENUM(MAXSPELL);
    PRINT_ENUM(FIRST_REAL_GEM);
    PRINT_ENUM(LAST_REAL_GEM);
    PRINT_ENUM(FIRST_GLASS_GEM);
    PRINT_ENUM(LAST_GLASS_GEM);
    PRINT_ENUM(NUM_REAL_GEMS);
    PRINT_ENUM(NUM_GLASS_GEMS);
    PRINT_ENUM(NO_MATERIAL);
    PRINT_ENUM(LIQUID);
    PRINT_ENUM(WAX);
    PRINT_ENUM(VEGGY);
    PRINT_ENUM(FLESH);
    PRINT_ENUM(PAPER);
    PRINT_ENUM(CLOTH);
    PRINT_ENUM(LEATHER);
    PRINT_ENUM(WOOD);
    PRINT_ENUM(BONE);
    PRINT_ENUM(DRAGON_HIDE);
    PRINT_ENUM(IRON);
    PRINT_ENUM(METAL);
    PRINT_ENUM(COPPER);
    PRINT_ENUM(SILVER);
    PRINT_ENUM(GOLD);
    PRINT_ENUM(PLATINUM);
    PRINT_ENUM(MITHRIL);
    PRINT_ENUM(PLASTIC);
    PRINT_ENUM(GLASS);
    PRINT_ENUM(GEMSTONE);
    PRINT_ENUM(MINERAL);
    PRINT_ENUM(NODIR);
    PRINT_ENUM(IMMEDIATE);
    PRINT_ENUM(RAY);
    PRINT_ENUM(PIERCE);
    PRINT_ENUM(SLASH);
    PRINT_ENUM(WHACK);
    PRINT_ENUM(ARM_SUIT);
    PRINT_ENUM(ARM_SHIELD);
    PRINT_ENUM(ARM_HELM);
    PRINT_ENUM(ARM_GLOVES);
    PRINT_ENUM(ARM_BOOTS);
    PRINT_ENUM(ARM_CLOAK);
    PRINT_ENUM(ARM_SHIRT);
#undef PRINT_ENUM

    for (i = 0; i < (int) SIZE(object_enums); ++i)
        print_enum(object_enums[i].name, object_enums[i].val, &needs_comma);
    print_enum("NUM_OBJECTS", NUM_OBJECTS, &needs_comma);

    fputs("},\"descriptions\":[", stdout);
    for (i = 0; i <= NUM_OBJECTS; ++i) {
        if (i)
            putchar(',');
        fputs("{\"oc_name\":", stdout);
        json_string(obj_descr[i].oc_name);
        fputs(",\"oc_descr\":", stdout);
        json_string(obj_descr[i].oc_descr);
        putchar('}');
    }

    fputs("],\"objects\":[", stdout);
    for (i = 0; i <= NUM_OBJECTS; ++i) {
        const struct objclass *object = &objects[i];

        if (i)
            putchar(',');
        printf("{\"oc_name_idx\":%d,\"oc_descr_idx\":%d,"
               "\"oc_name_known\":%u,\"oc_merge\":%u,"
               "\"oc_uses_known\":%u,\"oc_encountered\":%u,"
               "\"oc_magic\":%u,\"oc_charged\":%u,"
               "\"oc_unique\":%u,\"oc_nowish\":%u,"
               "\"oc_big\":%u,\"oc_tough\":%u,\"oc_spare1\":%u,"
               "\"oc_dir\":%u,\"oc_material\":%u,"
               "\"oc_subtyp\":%d,\"oc_oprop\":%u,"
               "\"oc_class\":%d,\"oc_delay\":%d,"
               "\"oc_color\":%u,\"oc_prob\":%d,"
               "\"oc_weight\":%u,\"oc_cost\":%d,"
               "\"oc_wsdam\":%d,\"oc_wldam\":%d,"
               "\"oc_oc1\":%d,\"oc_oc2\":%d,"
               "\"oc_nutrition\":%u}",
               object->oc_name_idx, object->oc_descr_idx,
               object->oc_name_known, object->oc_merge,
               object->oc_uses_known, object->oc_encountered,
               object->oc_magic, object->oc_charged,
               object->oc_unique, object->oc_nowish,
               object->oc_big, object->oc_tough, object->oc_spare1,
               object->oc_dir, object->oc_material,
               object->oc_subtyp, object->oc_oprop,
               (int) object->oc_class, object->oc_delay,
               object->oc_color, object->oc_prob,
               object->oc_weight, object->oc_cost,
               object->oc_wsdam, object->oc_wldam,
               object->oc_oc1, object->oc_oc2,
               object->oc_nutrition);
    }
    fputs("]}\n", stdout);
    return 0;
}
`;

function formatModule(catalog) {
    const enumLines = Object.entries(catalog.enums)
        .map(([name, value]) => `export const ${name} = ${value};`)
        .join('\n');
    const descriptions = catalog.descriptions
        .map((description) => `    Object.freeze(${JSON.stringify(description)}),`)
        .join('\n');
    const objects = catalog.objects
        .map((object) => `    Object.freeze(${JSON.stringify(object)}),`)
        .join('\n');

    return `// Generated by scripts/generate-objects.mjs from NetHack 5.0.
// Source: include/objects.h, include/objclass.h, and src/objects.c at
// ${PINNED_REVISION}. Do not edit this file by hand.

import { game } from './gstate.js';

${enumLines}

export const OBJECT_DESCRIPTIONS = Object.freeze([
${descriptions}
]);

export const OBJECT_TEMPLATES = Object.freeze([
${objects}
]);

// C uses ULONG_MAX for the two uninitialized minimum-price fields. NetHack's
// legal prices are safe JavaScript integers, so MAX_SAFE_INTEGER preserves
// the sentinel's ordering while keeping later shop arithmetic numeric and
// serializable.
const UNSEEN_OBJECT_PRICE = Number.MAX_SAFE_INTEGER;

function defineObjclassAliases(object) {
    const aliases = {
        oc_bimanual: 'oc_big',
        oc_bulky: 'oc_big',
        oc_skill: 'oc_subtyp',
        oc_armcat: 'oc_subtyp',
        oc_hitbon: 'oc_oc1',
        a_ac: 'oc_oc1',
        a_can: 'oc_oc2',
        oc_level: 'oc_oc2',
    };
    for (const [alias, source] of Object.entries(aliases)) {
        Object.defineProperty(object, alias, {
            configurable: true,
            enumerable: false,
            get() { return this[source]; },
            set(value) { this[source] = value; },
        });
    }
    return object;
}

function cloneObject(template) {
    return defineObjclassAliases({
        ...template,
        oc_uname: null,
        oc_sell_minseen: UNSEEN_OBJECT_PRICE,
        oc_sell_maxseen: 0,
        oc_buy_minseen: UNSEEN_OBJECT_PRICE,
        oc_buy_maxseen: 0,
    });
}

function cloneDescription(template) {
    return { ...template };
}

// C ref: src/objects.c objects_globals_init.
export function objects_globals_init(state = game) {
    state.objects = OBJECT_TEMPLATES.map(cloneObject);
    state.obj_descr = OBJECT_DESCRIPTIONS.map(cloneDescription);
    return state.objects;
}

export function getObjects(state = game) {
    return state.objects;
}

export function getObjectDescriptions(state = game) {
    return state.obj_descr;
}

export function OBJ_NAME(object, state = game) {
    return state.obj_descr[object.oc_name_idx].oc_name;
}

export function OBJ_DESCR(object, state = game) {
    return state.obj_descr[object.oc_descr_idx].oc_descr;
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

const workDir = mkdtempSync(join(tmpdir(), 'teleport-object-export-'));
try {
    const exporterPath = join(workDir, 'export-objects.c');
    const objectsPath = join(workDir, 'objects.o');
    const binaryPath = join(workDir, 'export-objects');
    writeFileSync(exporterPath, exporterSource);
    execFileSync(
        'clang',
        [
            '-std=c99',
            '-I', UPSTREAM_INCLUDE,
            '-I', UPSTREAM_UNIX,
            '-c', join(UPSTREAM_ROOT, 'src', 'objects.c'),
            '-o', objectsPath,
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
            objectsPath,
            '-o', binaryPath,
        ],
        { stdio: 'inherit' },
    );

    const catalog = JSON.parse(execFileSync(binaryPath, { encoding: 'utf8' }));
    if (catalog.objects.length !== catalog.numObjects + 1
        || catalog.descriptions.length !== catalog.numObjects + 1) {
        throw new Error('C exporter produced an incomplete object catalog');
    }
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
