#!/usr/bin/env node

// Lists every place in js/ that deletes separator characters from a string,
// the shape a hand-written stand-in for hacklib.c fuzzymatch() takes.
//
// C compares option values, field names and symbol-set names with
// fuzzymatch(s1, s2, ignore_chars, caseblind), and each call names its own
// ignore set: " -_" in coloratt.c and botl.c's field lookup, "\" -_" in
// botl.c get_hilite(), "\"()" for one spelling in noneoftheabove(). A port
// that strips a set of characters and then compares has to restate that set,
// and has merged two of them (noneoftheabove(), source review round 6) or
// stripped more than C skips (options.js's `.trim()` before stripping, which
// accepted a tab C rejects). Call js/hacklib.js fuzzymatch() with the C call's
// ignore set and case folding instead.
//
// A finding is a call that deletes every match of one character set: a
// `.replace()` or `.replaceAll()` whose replacement is the empty string, or a
// `.split()` followed by `.join('')`, whose pattern is a single character class
// or character (a regex `[...]`, `\s` or one literal character, optionally
// with `+` or `*`, or a one-character string) and includes a separator C
// ignore sets name: space, '-', '_', '"', '(' or ')'. Anchored patterns such
// as `/^ +/u` trim one end and are not findings.
//
// ALLOWED_SITES lists the deletions that are not comparisons, each with its
// reason. scripts/separator-stripping.test.mjs runs the scan over js/ and
// requires every finding to be one of them, and every one of them to be found.
//
// Usage: node scripts/separator-stripping.mjs   (prints the findings)

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'acorn';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), '..');

// Deletions that build text rather than compare names.  The test fails when
// this list and the scan disagree in either direction.
export const ALLOWED_SITES = Object.freeze([
    Object.freeze({
        file: 'js/display.js',
        text: "str.replaceAll(' ', '')",
        reason: 'botl.c status_hilite_linestr_add() copies a rule\'s '
            + 'description with stripchars(tmp->str, " ", str) for the '
            + 'status-highlight menu; it is display text, not a comparison',
    }),
]);

const SEPARATORS = [' ', '-', '_', '"', '(', ')'];

// One regex atom that deletes a character set: a class, `\s`, an escaped
// character or a plain one, optionally repeated.
const SET_PATTERN = /^(?:\[(?:[^\]\\]|\\.)+\]|\\.|[^\\^$.|?*+()[\]{}])[+*]?$/u;

function namesSeparator(pattern) {
    const body = pattern.replace(/[+*]$/u, '');
    if (body === '\\s') return true;
    // Read `\"`, `\-` and `\(` inside a class as the character they escape.
    const characters = body.replace(/\\(.)/gu, '$1');
    return SEPARATORS.some((separator) => characters.includes(separator));
}

function deletesSeparators(node) {
    if (node?.type !== 'Literal') return false;
    if (node.regex) {
        return SET_PATTERN.test(node.regex.pattern)
            && namesSeparator(node.regex.pattern);
    }
    return typeof node.value === 'string' && node.value.length === 1
        && SEPARATORS.includes(node.value);
}

function isEmptyString(node) {
    if (node?.type === 'Literal') return node.value === '';
    return node?.type === 'TemplateLiteral' && node.expressions.length === 0
        && node.quasis.length === 1 && node.quasis[0].value.cooked === '';
}

function methodCall(node, names) {
    return node?.type === 'CallExpression'
        && node.callee.type === 'MemberExpression'
        && !node.callee.computed
        && names.includes(node.callee.property.name);
}

function visit(node, callback) {
    if (!node || typeof node.type !== 'string') return;
    callback(node);
    for (const value of Object.values(node)) {
        if (Array.isArray(value)) {
            for (const child of value) visit(child, callback);
        } else if (value && typeof value.type === 'string') {
            visit(value, callback);
        }
    }
}

// The findings in one module's source, each { line, text }.
export function separatorStrippingFindings(source) {
    const ast = parse(source, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        locations: true,
        allowHashBang: true,
    });
    const findings = [];
    visit(ast, (node) => {
        let call = null;
        if (methodCall(node, ['replace', 'replaceAll'])
            && deletesSeparators(node.arguments[0])
            && isEmptyString(node.arguments[1])) {
            call = node;
        } else if (methodCall(node, ['join'])
            && isEmptyString(node.arguments[0])
            && methodCall(node.callee.object, ['split'])
            && deletesSeparators(node.callee.object.arguments[0])) {
            call = node;
        }
        if (call) {
            findings.push({
                line: call.loc.start.line,
                text: source.slice(call.start, call.end),
            });
        }
    });
    return findings.sort((a, b) => a.line - b.line);
}

// Every finding in js/*.js, each { file, line, text }.
export function scanRepository(root = PROJECT_ROOT) {
    const dir = join(root, 'js');
    const findings = [];
    for (const name of readdirSync(dir).filter((entry) => entry.endsWith('.js')).sort()) {
        const source = readFileSync(join(dir, name), 'utf8');
        for (const { line, text } of separatorStrippingFindings(source))
            findings.push({ file: `js/${name}`, line, text });
    }
    return findings;
}

if (process.argv[1] === SCRIPT_PATH) {
    const findings = scanRepository();
    for (const { file, line, text } of findings) console.log(`${file}:${line}: ${text}`);
    const allowed = (f) => ALLOWED_SITES.some((site) => site.file === f.file && site.text === f.text);
    process.exitCode = findings.every(allowed) ? 0 : 1;
}
