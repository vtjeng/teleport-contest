#!/usr/bin/env node

// Generate the complete symbol table and every named symbol set.  Runtime
// rendering consumes absolute SYM_* indices so cmap, object, monster, warning,
// and miscellaneous symbols all share the ordering used by symbols.c.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const UPSTREAM_ROOT = join(PROJECT_ROOT, 'nethack-c', 'upstream');
const DEFSYM_PATH = join(UPSTREAM_ROOT, 'include', 'defsym.h');
const SYMBOLS_PATH = join(UPSTREAM_ROOT, 'dat', 'symbols');
const OUTPUT_PATH = join(PROJECT_ROOT, 'js', 'symbol_data.js');
const PINNED_REVISION = '16ff59115315917b93185d026aeefea06db9b0f4';

const MAXPCHARS = 105;
const MAXOCLASSES = 18;
const MAXMCLASSES = 61;
const WARNCOUNT = 6;
const MAXOTHER = 6;
const SYM_OFF_O = MAXPCHARS;
const SYM_OFF_M = SYM_OFF_O + MAXOCLASSES;
const SYM_OFF_W = SYM_OFF_M + MAXMCLASSES;
const SYM_OFF_X = SYM_OFF_W + WARNCOUNT;
const SYM_MAX = SYM_OFF_X + MAXOTHER;

const SYMBOL_ALIASES = Object.freeze({
    S_armour: 'S_armor',
    S_explode1: 'S_expl_tl',
    S_explode2: 'S_expl_tc',
    S_explode3: 'S_expl_tr',
    S_explode4: 'S_expl_ml',
    S_explode5: 'S_expl_mc',
    S_explode6: 'S_expl_mr',
    S_explode7: 'S_expl_bl',
    S_explode8: 'S_expl_bc',
    S_explode9: 'S_expl_br',
});

function withoutComment(value) {
    return value.replace(/\s+#.*$/u, '').trim();
}

function dataByte(rawValue) {
    let value = withoutComment(rawValue);
    if (value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1);
    }
    const hexadecimal = value.match(/^\\x([0-9a-f]{1,2})/iu);
    if (hexadecimal) return Number.parseInt(hexadecimal[1], 16);
    const decimal = value.match(/^\\([0-9]{1,3})/u);
    if (decimal) return Number.parseInt(decimal[1], 10) & 0xFF;
    if (value.startsWith('\\')) {
        const escaped = {
            '\\': '\\',
            n: '\n',
            t: '\t',
            b: '\b',
            r: '\r',
        }[value[1]] ?? value[1];
        return escaped?.charCodeAt(0) ?? 0;
    }
    return value.charCodeAt(0) & 0xFF;
}

function assertComplete(values, label) {
    for (let index = 0; index < values.length; ++index) {
        if (values[index] === undefined)
            throw new Error(`missing ${label} symbol index ${index}`);
    }
}

function addSymbol(records, seenNames, name, index, byte) {
    records[index] = byte;
    const folded = name.toLowerCase();
    if (!seenNames.has(folded)) seenNames.set(folded, index);
}

/** Extract symbols.c's absolute table layout from defsym.h. */
export function extractSymbolLayout(source) {
    const defaults = new Array(SYM_MAX);
    const indices = new Map();
    const lines = source.split(/\r?\n/u);

    defaults[SYM_OFF_O] = 0; // random object-class placeholder
    defaults[SYM_OFF_M] = 0; // monster-class placeholder

    for (const line of lines) {
        let match = line.match(
            /^\s*PCHAR2?\(\s*([0-9]+)\s*,\s*('(?:\\.|[^'])+')\s*,\s*(S_[A-Za-z0-9_]+)/u,
        );
        if (match) {
            addSymbol(
                defaults,
                indices,
                match[3],
                Number(match[1]),
                dataByte(match[2]),
            );
            continue;
        }

        match = line.match(
            /^\s*MONSYM\(\s*([0-9]+)\s*,\s*('(?:\\.|[^'])+')\s*,\s*[^,]+,\s*(S_[A-Za-z0-9_]+)/u,
        );
        if (match) {
            addSymbol(
                defaults,
                indices,
                match[3],
                SYM_OFF_M + Number(match[1]),
                dataByte(match[2]),
            );
            continue;
        }

        match = line.match(
            /^\s*OBJCLASS2\(\s*([0-9]+)\s*,\s*('(?:\\.|[^'])+')\s*,\s*[^,]+,\s*[^,]+,\s*(S_[A-Za-z0-9_]+)/u,
        );
        if (!match) {
            match = line.match(
                /^\s*OBJCLASS\(\s*([0-9]+)\s*,\s*('(?:\\.|[^'])+')\s*,\s*[^,]+,\s*(S_[A-Za-z0-9_]+)/u,
            );
        }
        if (match) {
            addSymbol(
                defaults,
                indices,
                match[3],
                SYM_OFF_O + Number(match[1]),
                dataByte(match[2]),
            );
        }
    }

    // drawing.c:def_warnsyms and symbols.c:get_othersym().  The first two
    // miscellaneous symbols intentionally default to spaces; the final two
    // intentionally have no default byte.
    for (let index = 0; index < WARNCOUNT; ++index)
        defaults[SYM_OFF_W + index] = '0'.charCodeAt(0) + index;
    const misc = [
        ['S_nothing', ' '.charCodeAt(0)],
        ['S_unexplored', ' '.charCodeAt(0)],
        ['S_boulder', '`'.charCodeAt(0)],
        ['S_invisible', 'I'.charCodeAt(0)],
        ['S_pet_override', 0],
        ['S_hero_override', 0],
    ];
    for (let index = 0; index < misc.length; ++index) {
        addSymbol(
            defaults,
            indices,
            misc[index][0],
            SYM_OFF_X + index,
            misc[index][1],
        );
    }

    assertComplete(defaults, 'default');
    if (defaults.length !== SYM_MAX)
        throw new Error(`expected ${SYM_MAX} symbols; found ${defaults.length}`);

    for (const [alias, canonical] of Object.entries(SYMBOL_ALIASES)) {
        const index = indices.get(canonical.toLowerCase());
        if (index === undefined)
            throw new Error(`missing canonical symbol ${canonical}`);
        indices.set(alias.toLowerCase(), index);
    }

    const rogueDefaults = [...defaults];
    for (const index of [12, 13, 14]) rogueDefaults[index] = '+'.charCodeAt(0);
    for (const index of [25, 26]) rogueDefaults[index] = '%'.charCodeAt(0);
    // drawing.c:def_r_oc_syms differs for armor, amulet, food, and coin.
    rogueDefaults[SYM_OFF_O + 3] = ']'.charCodeAt(0);
    rogueDefaults[SYM_OFF_O + 5] = ','.charCodeAt(0);
    rogueDefaults[SYM_OFF_O + 7] = ':'.charCodeAt(0);
    rogueDefaults[SYM_OFF_O + 12] = '*'.charCodeAt(0);

    return {
        defaults,
        rogueDefaults,
        indices: Object.fromEntries(indices),
        offsets: {
            p: 0,
            o: SYM_OFF_O,
            m: SYM_OFF_M,
            w: SYM_OFF_W,
            x: SYM_OFF_X,
            max: SYM_MAX,
        },
    };
}

function unicodeSymbol(rawValue) {
    const value = withoutComment(rawValue);
    const match = value.match(/^U\+([0-9a-f]{1,6})/iu);
    if (!match) throw new Error(`unsupported UTF8 symbol value '${value}'`);
    return String.fromCodePoint(Number.parseInt(match[1], 16));
}

export function extractSymbolSets(defsymSource, symbolsSource) {
    const layout = extractSymbolLayout(defsymSource);
    const indices = new Map(Object.entries(layout.indices));

    const definitions = [];
    let current = null;
    const lines = symbolsSource.split(/\r?\n/u);
    for (let lineIndex = 0; lineIndex < lines.length; ++lineIndex) {
        const text = lines[lineIndex].trim();
        if (!text || text.startsWith('#')) continue;

        const start = text.match(/^start\s*:\s*(.+?)\s*$/iu);
        if (start) {
            if (current) throw new Error(`nested symbol set at line ${lineIndex + 1}`);
            current = {
                name: withoutComment(start[1]),
                handling: 'UNKNOWN',
                restrictions: [],
                color: null,
                bytes: {},
                utf8: {},
                glyphs: {},
                sourceLine: lineIndex + 1,
            };
            continue;
        }
        if (/^finish(?:\s|$)/iu.test(text)) {
            if (!current) throw new Error(`orphan finish at line ${lineIndex + 1}`);
            definitions.push(current);
            current = null;
            continue;
        }
        if (!current) continue;

        const control = text.match(/^(handling|restrictions|colou?r)\s*:\s*(.*?)\s*$/iu);
        if (control) {
            const key = control[1].toLowerCase();
            const value = withoutComment(control[2]);
            if (key === 'handling') current.handling = value.toUpperCase();
            else if (key === 'restrictions') {
                current.restrictions.push(value.toLowerCase());
            } else {
                current.color = /^(?:true|yes|on)$/iu.test(value);
            }
            continue;
        }

        const assignment = text.match(/^([SG]_[A-Za-z0-9_]+)\s*[:=]\s*(.*?)\s*$/u);
        if (!assignment) continue;
        if (/^G_/u.test(assignment[1])) {
            current.glyphs[assignment[1]] = withoutComment(assignment[2]);
            continue;
        }
        const index = indices.get(assignment[1].toLowerCase());
        if (index === undefined) {
            throw new Error(
                `unprojected symbol ${assignment[1]} at line ${lineIndex + 1}`,
            );
        }
        if (current.handling === 'UTF8') {
            current.utf8[index] = unicodeSymbol(assignment[2]);
        } else {
            current.bytes[index] = dataByte(assignment[2]);
        }
    }
    if (current) throw new Error(`unterminated symbol set '${current.name}'`);
    if (definitions.length !== 14) {
        throw new Error(`expected 14 symbol sets; found ${definitions.length}`);
    }
    const dec = definitions.find((definition) => (
        definition.name.toLowerCase() === 'decgraphics'
    ));
    if (!dec || Object.keys(dec.bytes).length !== 39) {
        throw new Error('DECgraphics symbol projection is incomplete');
    }
    return definitions;
}

export function renderSymbolData(definitions, layout) {
    const serialized = JSON.stringify(definitions, null, 4)
        .split('\n').map((line) => `    ${line}`).join('\n');
    const defaultSymbols = JSON.stringify(layout.defaults);
    const defaultRogueSymbols = JSON.stringify(layout.rogueDefaults);
    const symbolIndices = JSON.stringify(layout.indices, null, 4)
        .split('\n').map((line) => `    ${line}`).join('\n');
    return `// Generated by scripts/generate-symbol-data.mjs.\n`
        + `// Source: NetHack 5.0 include/defsym.h and dat/symbols at ${PINNED_REVISION}.\n\n`
        + `export const SYM_OFF_P = ${layout.offsets.p};\n`
        + `export const SYM_OFF_O = ${layout.offsets.o};\n`
        + `export const SYM_OFF_M = ${layout.offsets.m};\n`
        + `export const SYM_OFF_W = ${layout.offsets.w};\n`
        + `export const SYM_OFF_X = ${layout.offsets.x};\n`
        + `export const SYM_MAX = ${layout.offsets.max};\n\n`
        + `export const DEFAULT_PRIMARY_SYMBOLS = Object.freeze(${defaultSymbols});\n`
        + `export const DEFAULT_ROGUE_SYMBOLS = Object.freeze(${defaultRogueSymbols});\n`
        + `export const SYMBOL_INDEX_BY_NAME = Object.freeze(\n${symbolIndices},\n);\n\n`
        + `function freezeDefinition(definition) {\n`
        + `    Object.freeze(definition.restrictions);\n`
        + `    Object.freeze(definition.bytes);\n`
        + `    Object.freeze(definition.utf8);\n`
        + `    Object.freeze(definition.glyphs);\n`
        + `    return Object.freeze(definition);\n`
        + `}\n\n`
        + `export const SYMBOL_SET_DEFINITIONS = Object.freeze(\n`
        + `${serialized}.map(freezeDefinition),\n`
        + `);\n`;
}

function assertPinnedSource() {
    const actualRevision = execFileSync(
        'git', ['-C', UPSTREAM_ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' },
    ).trim();
    if (actualRevision !== PINNED_REVISION) {
        throw new Error(
            `expected NetHack source ${PINNED_REVISION}; found ${actualRevision}`,
        );
    }
    const upstreamStatus = execFileSync(
        'git', ['-C', UPSTREAM_ROOT, 'status', '--porcelain=v1', '--untracked-files=no'],
        { encoding: 'utf8' },
    ).trim();
    if (upstreamStatus) {
        throw new Error('Refusing to generate from modified tracked upstream sources');
    }
}

function main() {
    const checkOnly = process.argv.length === 3 && process.argv[2] === '--check';
    if (process.argv.length > (checkOnly ? 3 : 2)) {
        throw new Error('Usage: node scripts/generate-symbol-data.mjs [--check]');
    }
    assertPinnedSource();
    const defsymSource = readFileSync(DEFSYM_PATH, 'utf8');
    const layout = extractSymbolLayout(defsymSource);
    const output = renderSymbolData(
        extractSymbolSets(defsymSource, readFileSync(SYMBOLS_PATH, 'utf8')),
        layout,
    );
    if (checkOnly) {
        let existing = '';
        try {
            existing = readFileSync(OUTPUT_PATH, 'utf8');
        } catch {
            // The comparison below reports the missing generated file.
        }
        if (existing !== output) {
            console.error(
                'js/symbol_data.js is stale; run '
                + 'node scripts/generate-symbol-data.mjs',
            );
            process.exitCode = 1;
        }
    } else {
        writeFileSync(OUTPUT_PATH, output);
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
