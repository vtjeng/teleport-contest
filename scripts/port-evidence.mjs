// Completion is a source-review attestation with references to callers, tests,
// and recordings. These checks establish that the references exist; they do
// not prove behavioral equivalence, runtime reachability, or a matching replay.

import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PROJECT_ROOT, parseCFunctions } from './c-functions.mjs';
import { blankCommentsAndStrings } from './check-namespace-members.mjs';

function text(value, label) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`${label} must be nonempty text`);
    }
    return value.trim();
}

function identifier(value, label) {
    const name = text(value, label);
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(name)) {
        throw new Error(`${label} must be a JavaScript symbol name`);
    }
    return name;
}

function safePath(value, directory, suffix, label) {
    const path = text(value, `${label} path`);
    const parts = path.split('/');
    if (parts.some((part) => part.toLowerCase() === 'holdout')) {
        throw new Error(`${label} path cannot reference holdout`);
    }
    if (parts[0] !== directory || parts.length < 2
        || parts.some((part) => part === '' || part === '.' || part === '..')
        || /[\\\0]/u.test(path) || !path.endsWith(suffix)) {
        throw new Error(`${label} path must be relative to ${directory}/ and end in ${suffix}`);
    }
    return path;
}

function pathList(value, directory, suffix, label) {
    if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
    return [...new Set(value.map((path) => safePath(path, directory, suffix, label)))];
}

function goalScope(goal) {
    if (!['file-port', 'lua-port'].includes(goal?.kind)
        || !Array.isArray(goal.functions)) {
        throw new Error('port evidence needs a file-port or lua-port goal with a functions array');
    }
    const lua = goal.kind === 'lua-port';
    const file = text(lua ? goal.luaFile : goal.cFile, 'source file');
    if (!/^[A-Za-z0-9_-]+\.(?:c|lua)$/u.test(file)
        || !file.endsWith(lua ? '.lua' : '.c')) {
        throw new Error('source file path must be a C or Lua basename');
    }
    const names = new Set(goal.functions.map((entry) => text(entry?.name, 'goal function name')));
    if (lua && (names.size !== 1 || !names.has(file))) {
        throw new Error('a Lua goal must name its whole source program in functions');
    }
    return { lua, file, names };
}

function functionEvidence(record, scope) {
    const name = text(record?.name, 'function name');
    if (!scope.names.has(name)) throw new Error(`goal does not contain source unit ${name}`);
    const symbol = identifier(record.symbol ?? (scope.lua ? undefined : name), `${name} symbol`);
    const implementation = safePath(record.implementation, 'js', '.js', `${name} implementation`);
    const sourceReview = text(record.sourceReview, `${name} sourceReview`);
    if (typeof record.pure !== 'boolean') throw new Error(`${name} pure must be a boolean`);
    if (!Array.isArray(record.callers)) throw new Error(`${name} callers must be an array`);
    const callers = record.callers.map((caller) => ({
        path: safePath(caller?.path, 'js', '.js', `${name} caller`),
        symbol: identifier(caller.symbol, `${name} caller symbol`),
        source: text(caller.source, `${name} caller source`),
    }));
    const tests = pathList(record.tests ?? [], 'scripts', '.test.mjs', `${name} tests`);
    const recordings = pathList(record.recordings ?? [], 'recordings', '.session.json', `${name} recordings`);
    const result = { name, implementation, symbol, sourceReview, callers,
        pure: record.pure, tests, recordings };
    if (record.inactiveReason !== undefined) {
        result.inactiveReason = text(record.inactiveReason, `${name} inactiveReason`);
    }
    if (callers.length === 0) {
        if (!result.inactiveReason) throw new Error(`${name} needs a caller or an inactiveReason`);
        if (!record.pure) throw new Error(`${name} inactive source must be pure with a source-pinned test`);
    }
    if (record.pure && tests.length === 0) {
        throw new Error(`${name} pure function needs a source-pinned test`);
    }
    if (!record.pure && recordings.length === 0) {
        throw new Error(`${name} impure function needs a matching recording through its caller`);
    }
    return result;
}

function evidenceShape(goal, evidence) {
    const scope = goalScope(goal);
    if (!Array.isArray(evidence?.functions)) throw new Error('port evidence needs a functions array');
    const names = new Set();
    const functions = evidence.functions.map((record) => {
        const result = functionEvidence(record, scope);
        if (names.has(result.name)) throw new Error(`duplicate function evidence for ${result.name}`);
        names.add(result.name);
        return result;
    });
    const result = { functions };
    if (evidence.entryPointReview !== undefined) {
        result.entryPointReview = text(evidence.entryPointReview, 'entryPointReview');
    }
    if (evidence.entryPoints !== undefined) {
        if (!Array.isArray(evidence.entryPoints)) throw new Error('entryPoints must be an array');
        const entryNames = new Set();
        result.entryPoints = evidence.entryPoints.map((entry) => {
            const name = text(entry?.name, 'entry point name');
            if (entryNames.has(name)) throw new Error(`duplicate entry point ${name}`);
            entryNames.add(name);
            if (!Array.isArray(entry.functions) || entry.functions.length === 0) {
                throw new Error(`entry point ${name} needs a nonempty functions array`);
            }
            const units = entry.functions.map((unit) => {
                if (!scope.names.has(unit)) throw new Error(`entry point ${name} has unknown source unit ${unit}`);
                return unit;
            });
            return { name, functions: [...new Set(units)],
                recordings: pathList(entry.recordings, 'recordings', '.session.json', `${name} recordings`) };
        });
    }
    return { scope, evidence: result };
}

// Check every component before opening a reference: a regular file below a
// symlinked directory is still an indirect reference and must be rejected.
function regularFile(path, root) {
    const parts = path.split('/');
    let full = root;
    for (const [index, part] of parts.entries()) {
        full = join(full, part);
        let info;
        try {
            info = lstatSync(full);
        } catch (error) {
            if (error.code === 'ENOENT') throw new Error(`missing regular file ${path}`);
            throw error;
        }
        if (info.isSymbolicLink()) throw new Error(`symlink reference is not allowed: ${path}`);
        if (index === parts.length - 1 ? !info.isFile() : !info.isDirectory()) {
            throw new Error(`reference must be a regular file: ${path}`);
        }
    }
    return full;
}

function sourcePath(scope, root) {
    const directories = scope.lua ? ['dat'] : ['src', 'win/tty'];
    for (const directory of directories) {
        const relative = `nethack-c/upstream/${directory}/${scope.file}`;
        try {
            return regularFile(relative, root);
        } catch (error) {
            if (!error.message.startsWith('missing regular file ')) throw error;
        }
    }
    throw new Error(`source file ${scope.file} is missing under nethack-c/upstream`);
}

function hasSymbol(source, symbol, allowConst) {
    const escaped = symbol.replace(/[$]/gu, '\\$&');
    const declaration = `\\bfunction(?:\\s*\\*\\s*|\\s+)${escaped}\\s*\\(`;
    const constant = allowConst ? `|\\bconst\\s+${escaped}\\s*=` : '';
    return new RegExp(`(?:${declaration}${constant})`, 'u').test(source);
}

/**
 * Validate manual completion evidence and return only its recognized fields.
 * Path/schema validation finishes before any file reads. Recording references
 * are checked with lstat only; this function never reads recording contents.
 * A checkpoint supplies replay results separately when the goal is closed.
 */
export function validatePortEvidence(goal, evidence, { root = PROJECT_ROOT } = {}) {
    const { scope, evidence: result } = evidenceShape(goal, evidence);
    const source = sourcePath(scope, root);
    const symbols = [];
    for (const entry of result.functions) {
        symbols.push({ path: regularFile(entry.implementation, root),
            symbol: entry.symbol, allowConst: scope.lua });
        for (const caller of entry.callers) {
            symbols.push({ path: regularFile(caller.path, root), symbol: caller.symbol, allowConst: true });
        }
        for (const path of [...entry.tests, ...entry.recordings]) regularFile(path, root);
    }
    for (const entry of result.entryPoints ?? []) {
        for (const path of entry.recordings) regularFile(path, root);
    }
    if (!scope.lua) {
        const sourceNames = new Set(parseCFunctions(blankCommentsAndStrings(readFileSync(source, 'utf8')))
            .map((entry) => entry.name));
        for (const entry of result.functions) {
            if (!sourceNames.has(entry.name)) throw new Error(`source ${scope.file} has no definition for ${entry.name}`);
        }
    }
    const sources = new Map();
    for (const { path, symbol, allowConst } of symbols) {
        if (!sources.has(path)) sources.set(path, blankCommentsAndStrings(readFileSync(path, 'utf8')));
        if (!hasSymbol(sources.get(path), symbol, allowConst)) {
            throw new Error(`missing declared symbol ${symbol} in ${path}`);
        }
    }
    return result;
}

/**
 * Names with structurally complete attestations already stored on this goal.
 * This read-only planning helper does not re-run source reviews or validation;
 * a same-named JavaScript declaration or historical `ported` flag is no proof.
 */
export function completedFunctionNames(goal) {
    try {
        return new Set(evidenceShape(goal, goal.evidence).evidence.functions.map((entry) => entry.name));
    } catch {
        return new Set();
    }
}
