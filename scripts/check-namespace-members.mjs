#!/usr/bin/env node

// Reject `NS.NAME` accesses on a namespace import whose module does not export
// NAME. JavaScript resolves such an access to `undefined` instead of raising,
// so `adtyp === M.AD_STON` silently compares a number against undefined and its
// branch can never fire. Node already rejects a missing *named* import at load
// time, which is why this check covers only namespace imports.
//
// The exported names come from importing the target module and reading its
// namespace object, so re-exports, aliases, and `export * from` are all
// resolved the way the running program resolves them. The accesses come from
// scanning the importing file's text.

import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Both directories hold hand-written ES modules that namespace-import each
// other's exports. Subdirectories are excluded: scripts/fixtures holds recorded
// sessions and this check's own deliberately broken fixtures.
const DEFAULT_ROOTS = ['js', 'scripts'];

const SOURCE_EXTENSIONS = ['.js', '.mjs'];

// Matched against the blanked source so an import spelled out inside a string
// or comment cannot register. The specifier is blank there, so its span is read
// back out of the raw source.
const NAMESPACE_IMPORT =
    /import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s*from\s*(['"])([^'"\n]*)\2/dgu;

// A `const`/`let`/`var`/`function`/`class` declaration that rebinds the
// namespace name. Parameters and destructuring patterns are not covered; see
// the module comment on what this check does not catch.
const shadowDeclaration = (name) =>
    new RegExp(`\\b(?:const|let|var|function|class)\\s+${name}\\b`, 'u');

// `NS.NAME`, rejecting `other.NS.NAME` and `obj?.NS` so only the namespace
// binding itself is read. Optional chaining after the binding (`NS?.NAME`) is
// a real member access and is matched.
const memberAccess = (name) =>
    new RegExp(`(^|[^.\\w$])${name}\\s*\\??\\.\\s*([A-Za-z_$][\\w$]*)`, 'gu');

const computedAccess = (name) =>
    new RegExp(`(^|[^.\\w$])${name}\\s*\\??\\[`, 'gu');

/**
 * Overwrite every comment, string body, template-literal text, and
 * regular-expression body with spaces, keeping the delimiters and the total
 * length. Offsets and line numbers therefore still point at the original file,
 * and the caller can read a blanked-out span back out of the raw source.
 *
 * Blanking is what keeps a sentence such as `// M.AD_STON was dead` from being
 * reported as a member access. Code inside a template substitution stays
 * visible, so `` `${M.AD_STON}` `` is still checked.
 *
 * A `/` starts a regular expression when the previous meaningful token cannot
 * end an expression. The test below uses the usual punctuation-and-keyword
 * heuristic rather than a full grammar.
 */
export function blankCommentsAndStrings(source) {
    const out = source.split('');
    const blank = (from, to) => {
        for (let i = from; i < to; ++i)
            if (out[i] !== '\n') out[i] = ' ';
    };
    // Tokens after which a `/` opens a regular expression rather than dividing.
    const regexPrecursors = new Set([
        'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
        'throw', 'case', 'do', 'else', 'yield', 'await',
    ]);
    // Open template literals and the `${...}` substitutions nested in them.
    // A substitution entry counts the braces opened inside it so the matching
    // `}` returns the scanner to template text.
    const nesting = [];
    let index = 0;
    let lastSignificant = '';

    while (index < source.length) {
        const enclosing = nesting.at(-1);
        const ch = source[index];
        const next = source[index + 1];

        if (enclosing?.kind === 'template') {
            if (ch === '\\') {
                blank(index, index + 2);
                index += 2;
            } else if (ch === '`') {
                nesting.pop();
                lastSignificant = '`';
                index += 1;
            } else if (ch === '$' && next === '{') {
                nesting.push({ kind: 'substitution', braces: 0 });
                lastSignificant = '{';
                index += 2;
            } else {
                blank(index, index + 1);
                index += 1;
            }
            continue;
        }

        if (ch === '/' && next === '/') {
            let end = source.indexOf('\n', index);
            if (end < 0) end = source.length;
            blank(index, end);
            index = end;
            continue;
        }
        if (ch === '/' && next === '*') {
            const close = source.indexOf('*/', index + 2);
            const end = close < 0 ? source.length : close + 2;
            blank(index, end);
            index = end;
            continue;
        }
        if (ch === '\'' || ch === '"') {
            let cursor = index + 1;
            while (cursor < source.length && source[cursor] !== ch) {
                if (source[cursor] === '\\') cursor += 1;
                cursor += 1;
            }
            blank(index + 1, Math.min(cursor, source.length));
            index = Math.min(cursor + 1, source.length);
            lastSignificant = ch;
            continue;
        }
        if (ch === '`') {
            nesting.push({ kind: 'template' });
            index += 1;
            continue;
        }
        if (ch === '/') {
            const opensRegex = lastSignificant === ''
                || /[^\w$)\]'"`]/u.test(lastSignificant)
                || regexPrecursors.has(lastSignificant);
            if (opensRegex) {
                let cursor = index + 1;
                let inClass = false;
                while (cursor < source.length) {
                    const c = source[cursor];
                    if (c === '\\') cursor += 2;
                    else if (c === '[') { inClass = true; cursor += 1; }
                    else if (c === ']') { inClass = false; cursor += 1; }
                    else if (c === '/' && !inClass) break;
                    else if (c === '\n') break;
                    else cursor += 1;
                }
                blank(index + 1, Math.min(cursor, source.length));
                index = Math.min(cursor + 1, source.length);
                lastSignificant = '/';
                continue;
            }
        }
        if (enclosing?.kind === 'substitution') {
            if (ch === '{') enclosing.braces += 1;
            else if (ch === '}') {
                if (enclosing.braces === 0) {
                    nesting.pop();
                    index += 1;
                    lastSignificant = '}';
                    continue;
                }
                enclosing.braces -= 1;
            }
        }
        if (!/\s/u.test(ch)) {
            lastSignificant = /[\w$]/u.test(ch)
                ? readIdentifier(source, index)
                : ch;
        }
        index += 1;
    }
    return out.join('');
}

function readIdentifier(source, index) {
    let end = index;
    while (end < source.length && /[\w$]/u.test(source[end])) end += 1;
    return source.slice(index, end);
}

function lineOf(source, offset) {
    let line = 1;
    for (let i = 0; i < offset; ++i) if (source[i] === '\n') line += 1;
    return line;
}

export function sourceFilesIn(root) {
    return readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isFile()
            && SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext)))
        .map((entry) => join(root, entry.name))
        .sort();
}

const exportCache = new Map();

async function exportedNames(modulePath) {
    if (!exportCache.has(modulePath)) {
        exportCache.set(modulePath, import(pathToFileURL(modulePath).href)
            .then((namespace) => ({ names: new Set(Object.keys(namespace)) }))
            .catch((error) => ({ error })));
    }
    return exportCache.get(modulePath);
}

/**
 * Check every namespace import in `files`.
 *
 * Returns `{ problems, notes, imports, accesses, computed }`. `problems` fail
 * the check. `notes` name the namespace imports the scan refused to verify.
 * `computed` counts `NS[...]` accesses, which no static scan can resolve.
 */
export async function checkFiles(files) {
    const problems = [];
    const notes = [];
    let imports = 0;
    let accesses = 0;
    let computed = 0;

    for (const file of files) {
        const raw = await readFile(file, 'utf8');
        const code = blankCommentsAndStrings(raw);
        const label = displayPath(file);
        NAMESPACE_IMPORT.lastIndex = 0;
        let declaration;
        while ((declaration = NAMESPACE_IMPORT.exec(code)) !== null) {
            const namespace = declaration[1];
            const [specifierStart, specifierEnd] = declaration.indices[3];
            const specifier = raw.slice(specifierStart, specifierEnd);
            imports += 1;
            if (!specifier.startsWith('.')) {
                notes.push(`${label}: skipped ${namespace} from `
                    + `'${specifier}' (not a relative module)`);
                continue;
            }
            if (shadowDeclaration(namespace).test(code)) {
                notes.push(`${label}: skipped ${namespace} from `
                    + `'${specifier}' (the name is also declared in this file, `
                    + 'so member accesses may not be the namespace)');
                continue;
            }
            const target = resolve(dirname(file), specifier);
            const { names, error } = await exportedNames(target);
            if (error) {
                problems.push(`${label}: cannot load '${specifier}' for `
                    + `namespace ${namespace}: ${error.message.split('\n')[0]}`);
                continue;
            }
            const missing = new Map();
            const uses = memberAccess(namespace);
            let use;
            while ((use = uses.exec(code)) !== null) {
                accesses += 1;
                const member = use[2];
                if (names.has(member)) continue;
                const offset = use.index + use[1].length;
                if (!missing.has(member))
                    missing.set(member, lineOf(code, offset));
            }
            const ordered = [...missing]
                .sort(([left], [right]) => left.localeCompare(right));
            for (const [member, line] of ordered) {
                problems.push(`${label}:${line}: ${namespace}.${member} is not `
                    + `exported by '${specifier}'`);
            }
            computed += (code.match(computedAccess(namespace)) ?? []).length;
        }
    }
    return { problems, notes, imports, accesses, computed };
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
    const result = await checkFiles(files);
    const { problems, notes, imports, accesses, computed } = result;
    for (const note of notes) console.log(`note: ${note}`);
    for (const problem of problems) console.error(problem);
    console.log(`checked ${accesses} member access(es) across ${imports} `
        + `namespace import(s) in ${files.length} file(s); `
        + `${computed} computed access(es) unchecked; `
        + `missing namespace members: ${problems.length}`);
    if (problems.length) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url))
    await main(process.argv.slice(2));
