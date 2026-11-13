#!/usr/bin/env node

// Lists every place in js/ that changes or compares letter case with
// JavaScript's Unicode-aware functions instead of the port's ASCII-only ones.
//
// C never calls setlocale(), so hacklib.c lowc(), highc(), lcase(), ucase(),
// upstart(), strcmpi() and strncmpi(), and <ctype.h> isupper(), islower(),
// tolower() and toupper(), change only 'A'-'Z' and 'a'-'z'. Typed and
// configured text reaches the port as bytes, and a byte sequence such as
// 0xC3 0x89 decodes to 'É'. String.prototype.toLowerCase() and toUpperCase()
// change that letter ('ß' even becomes "SS"), localeCompare() and
// Intl.Collator order by locale, and a regular expression with the i flag
// folds case by Unicode rules. js/hacklib.js holds the ASCII-only helpers;
// scripts/ascii-case.test.mjs runs this scan and allows only the sites in
// ALLOWED below.
//
// The scan is syntactic: it finds the property names, regular-expression
// literals, RegExp() and Intl.Collator calls in each file's syntax tree, so
// comments and strings that mention them do not count.
//
// Usage: node scripts/ascii-case.mjs   (prints the findings, one a line)

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'acorn';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), '..');

// Methods whose result depends on Unicode case mapping or the locale.
export const CASE_METHODS = Object.freeze([
    'toLowerCase', 'toUpperCase', 'toLocaleLowerCase', 'toLocaleUpperCase',
    'localeCompare',
]);

// The sites the scan accepts, each with the reason C's ASCII-only rule does
// not apply. `code` is the source text of the finding; `count` is how many
// times it occurs in `file`.
export const ALLOWED = Object.freeze([
    {
        file: 'js/terminal.js',
        code: 'e.key.toLowerCase',
        count: 2,
        reason: 'the browser keydown handler names keys by KeyboardEvent.key, '
            + 'which is not game text, and the scorer replaces this file with '
            + 'its own copy (AGENTS.md, "Keep the game compatible with the '
            + 'scoring system")',
    },
]);

function isNode(value) {
    return value && typeof value.type === 'string';
}

function walk(node, visit) {
    visit(node);
    for (const key of Object.keys(node)) {
        if (key === 'loc' || key === 'start' || key === 'end') continue;
        const value = node[key];
        if (Array.isArray(value)) {
            for (const child of value) if (isNode(child)) walk(child, visit);
        } else if (isNode(value)) {
            walk(value, visit);
        }
    }
}

function propertyName(member) {
    if (!member.computed) return member.property.name;
    return member.property.type === 'Literal' ? member.property.value : null;
}

// A RegExp() flags argument that may hold 'i': a literal containing it, or
// anything that is not a literal.
function regExpFlagsFoldCase(args) {
    const flags = args[1];
    if (!flags) return false;
    if (flags.type === 'Literal') return String(flags.value).includes('i');
    if (flags.type === 'TemplateLiteral' && flags.expressions.length === 0)
        return flags.quasis[0].value.cooked.includes('i');
    return true;
}

/** Findings in one module's source: `{ line, code, kind }`. */
export function asciiCaseFindings(source) {
    const ast = parse(source, {
        ecmaVersion: 'latest', sourceType: 'module', locations: true,
    });
    const findings = [];
    const add = (node, kind) => findings.push({
        line: node.loc.start.line,
        code: source.slice(node.start, node.end),
        kind,
    });
    walk(ast, (node) => {
        if (node.type === 'MemberExpression'
            && CASE_METHODS.includes(propertyName(node))) {
            add(node, propertyName(node));
        } else if (node.type === 'Literal' && node.regex
            && node.regex.flags.includes('i')) {
            add(node, 'regular expression with the i flag');
        } else if ((node.type === 'NewExpression' || node.type === 'CallExpression')
            && node.callee.type === 'Identifier' && node.callee.name === 'RegExp'
            && regExpFlagsFoldCase(node.arguments)) {
            add(node, 'RegExp() whose flags may include i');
        } else if (node.type === 'MemberExpression'
            && node.object.type === 'Identifier' && node.object.name === 'Intl'
            && propertyName(node) === 'Collator') {
            add(node, 'Intl.Collator');
        }
    });
    return findings;
}

function moduleFiles(directory) {
    const found = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) found.push(...moduleFiles(path));
        else if (/\.m?js$/u.test(entry.name)) found.push(path);
    }
    return found;
}

/** Every finding under js/, with its repository-relative file. */
export function scanRepository(root = PROJECT_ROOT) {
    const findings = [];
    for (const path of moduleFiles(join(root, 'js')).sort()) {
        const file = relative(root, path);
        for (const finding of asciiCaseFindings(readFileSync(path, 'utf8')))
            findings.push({ file, ...finding });
    }
    return findings;
}

/** Findings outside ALLOWED, and ALLOWED entries whose count is wrong. */
export function unexpectedFindings(findings, allowed = ALLOWED) {
    const problems = [];
    const seen = new Map();
    for (const finding of findings) {
        const entry = allowed.find((candidate) => candidate.file === finding.file
            && candidate.code === finding.code);
        if (!entry) {
            problems.push(`${finding.file}:${finding.line} ${finding.kind}: ${finding.code}`
                + ' (use lowc/highc/lcase/ucase/upstart/strcmpi/strncmpi/isupper/islower'
                + ' from js/hacklib.js)');
            continue;
        }
        seen.set(entry, (seen.get(entry) ?? 0) + 1);
    }
    for (const entry of allowed) {
        const count = seen.get(entry) ?? 0;
        if (count !== entry.count)
            problems.push(`${entry.file}: ${entry.code} occurs ${count} times; ALLOWED says ${entry.count}`);
    }
    return problems;
}

if (process.argv[1] === SCRIPT_PATH) {
    for (const finding of scanRepository())
        console.log(`${finding.file}:${finding.line} ${finding.kind}: ${finding.code}`);
}
