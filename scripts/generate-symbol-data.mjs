#!/usr/bin/env node

// Generate the cmap portion of every named symbol set. Object and monster
// symbols stay for their display ports; retaining all cmap entries now keeps
// named startup configurations source-derived and ready for those ports.

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

const CMAP_ALIASES = Object.freeze({
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

function cmapNames(source) {
    const result = [];
    const pattern = /\bPCHAR2?\(\s*([0-9]+)\s*,\s*(?:'(?:\\.|[^'])*'|[^,]+)\s*,\s*(S_[A-Za-z0-9_]+)/gu;
    for (const match of source.matchAll(pattern)) {
        const index = Number(match[1]);
        if (index !== result.length) {
            throw new Error(
                `expected cmap index ${result.length}; found ${index}`,
            );
        }
        result.push(match[2]);
    }
    if (result.length !== 105) {
        throw new Error(`expected 105 cmap symbols; found ${result.length}`);
    }
    return result;
}

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

function unicodeSymbol(rawValue) {
    const value = withoutComment(rawValue);
    const match = value.match(/^U\+([0-9a-f]{1,6})/iu);
    if (!match) throw new Error(`unsupported UTF8 symbol value '${value}'`);
    return String.fromCodePoint(Number.parseInt(match[1], 16));
}

export function extractSymbolSets(defsymSource, symbolsSource) {
    const names = cmapNames(defsymSource);
    const indices = new Map(names.map((name, index) => [name.toLowerCase(), index]));
    for (const [alias, canonical] of Object.entries(CMAP_ALIASES)) {
        indices.set(alias.toLowerCase(), indices.get(canonical.toLowerCase()));
    }

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

        const assignment = text.match(/^(S_[A-Za-z0-9_]+)\s*[:=]\s*(.*?)\s*$/u);
        if (!assignment) continue;
        const index = indices.get(assignment[1].toLowerCase());
        if (index === undefined) continue;
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
        throw new Error('DECgraphics cmap projection is incomplete');
    }
    return definitions;
}

export function renderSymbolData(definitions) {
    const serialized = JSON.stringify(definitions, null, 4)
        .split('\n').map((line) => `    ${line}`).join('\n');
    return `// Generated by scripts/generate-symbol-data.mjs.\n`
        + `// Source: NetHack 5.0 include/defsym.h and dat/symbols at ${PINNED_REVISION}.\n\n`
        + `function freezeDefinition(definition) {\n`
        + `    Object.freeze(definition.restrictions);\n`
        + `    Object.freeze(definition.bytes);\n`
        + `    Object.freeze(definition.utf8);\n`
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
    const output = renderSymbolData(extractSymbolSets(
        readFileSync(DEFSYM_PATH, 'utf8'),
        readFileSync(SYMBOLS_PATH, 'utf8'),
    ));
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
