#!/usr/bin/env node

// Reject a module specifier in js/ that is not relative. The judge imports js/
// directly in Node and in Chrome with no build step and no install step, so a
// specifier such as 'node:fs', 'lodash', or '/opt/x.js' resolves in neither
// place: Chrome has no bare-specifier resolver without an import map, and a
// scored run has no node_modules. The submission would fail to load rather than
// score badly.
//
// The property holds today -- every specifier under js/ starts with './' -- and
// nothing enforced it. This is the enforcement. `npm test` runs the
// repository-wide assertion in check-relative-imports.test.mjs, and
// `npm run check:relative-imports` runs the same scan standalone.
//
// The scan is textual, over the source with comments and string bodies blanked
// by scripts/check-namespace-members.mjs, so an `import` written inside a
// comment or a string cannot register. It covers the three forms that can pull
// a module in: `import ... from 'x'`, a bare `import 'x'`, and `import('x')`.
// It does not resolve computed dynamic specifiers, and reports one as a problem
// rather than passing it: `import(name)` can reach anywhere, and no static scan
// can say where.

import { readFile } from 'node:fs/promises';
import { isAbsolute, join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    blankCommentsAndStrings,
    sourceFilesIn,
} from './check-namespace-members.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Only js/ ships to the judge. scripts/ runs under Node in this repository
// alone and imports node: builtins freely, so scanning it would be wrong.
const DEFAULT_ROOTS = ['js'];

// `import ... from 'x'` and `export ... from 'x'`. `[^;]` keeps the lazy span
// inside one statement, which is what lets a multi-line brace list match while
// an unrelated later `from` cannot be reached across a `;`.
const FROM_CLAUSE = /\b(?:import|export)\b[^;]*?\bfrom\s*(['"])([^'"\n]*)\1/dgu;

// A bare side-effect import, `import 'x'`. The quote has to follow the keyword
// directly, so `import x from 'y'` and `import.meta` cannot match here.
const BARE_IMPORT = /\bimport\s*(['"])([^'"\n]*)\1/dgu;

// `import(...)`. The specifier group is optional so a computed argument still
// matches the keyword and can be reported.
const DYNAMIC_IMPORT = /\bimport\s*\(\s*(?:(['"])([^'"\n]*)\1\s*\))?/dgu;

function lineOf(source, offset) {
    let line = 1;
    for (let i = 0; i < offset; ++i) if (source[i] === '\n') line += 1;
    return line;
}

/**
 * List every module specifier the source pulls in.
 *
 * Returns `{ specifier, line, computed }` records in source order. `computed`
 * marks an `import()` whose argument is not a string literal; its `specifier`
 * is null.
 */
export function findSpecifiers(source) {
    const code = blankCommentsAndStrings(source);
    const found = [];
    const scan = (pattern, group) => {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(code)) !== null) {
            // The specifier text is blanked in `code`, so read its span back
            // out of the raw source.
            const span = match.indices[group];
            found.push(span
                ? {
                    specifier: source.slice(span[0], span[1]),
                    line: lineOf(code, span[0]),
                    computed: false,
                }
                : {
                    specifier: null,
                    line: lineOf(code, match.index),
                    computed: true,
                });
        }
    };
    scan(FROM_CLAUSE, 2);
    scan(BARE_IMPORT, 2);
    scan(DYNAMIC_IMPORT, 2);
    return found.sort((left, right) => left.line - right.line);
}

export function isRelativeSpecifier(specifier) {
    return specifier.startsWith('./') || specifier.startsWith('../');
}

/**
 * Check every module specifier in `files`.
 *
 * Returns `{ problems, specifiers }`. `problems` fail the check; `specifiers`
 * counts everything the scan looked at, so a scan that silently matched nothing
 * is visible in the summary line.
 */
export async function checkFiles(files) {
    const problems = [];
    let specifiers = 0;

    for (const file of files) {
        const source = await readFile(file, 'utf8');
        const label = displayPath(file);
        for (const { specifier, line, computed } of findSpecifiers(source)) {
            specifiers += 1;
            if (computed) {
                problems.push(`${label}:${line}: import() with a computed `
                    + 'specifier cannot be checked, so it cannot be allowed');
                continue;
            }
            if (!isRelativeSpecifier(specifier)) {
                problems.push(`${label}:${line}: '${specifier}' is not a `
                    + "relative specifier; js/ must import only './' paths");
            }
        }
    }
    return { problems, specifiers };
}

function displayPath(file) {
    const fromRepo = relative(REPO_ROOT, file);
    return fromRepo.startsWith('..') ? file : fromRepo;
}

export function resolveRoots(args) {
    const roots = args.length ? args : DEFAULT_ROOTS;
    return roots.map((root) => isAbsolute(root) ? root : join(REPO_ROOT, root));
}

async function main(args) {
    const files = resolveRoots(args).flatMap(sourceFilesIn);
    const { problems, specifiers } = await checkFiles(files);
    for (const problem of problems) console.error(problem);
    console.log(`checked ${specifiers} module specifier(s) in `
        + `${files.length} file(s); non-relative specifiers: ${problems.length}`);
    if (problems.length) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url))
    await main(process.argv.slice(2));
