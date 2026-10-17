// Completion is a source-review attestation with references to callers, tests,
// recordings, and synthetic replay ranges. Structural checks here do not prove
// runtime reachability or parity; goal closure verifies cited synthetic ranges.

import {validateSourceParityGoal, validateSourceParityClaims} from './source-parity.mjs';
import { lstatSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { PROJECT_ROOT, parseCFunctions } from './c-functions.mjs';
import { blankCommentsAndStrings } from './check-namespace-members.mjs';

// One frozen experiment, not a general source-first task selector. The review
// is a trusted Main attestation; neither its digest nor these guards proves
// gameplay parity. assignmentBase is the current accepted execution base.
export const SOURCE_TRIAL = Object.freeze({
    id: 'explicit-search-hallu-capability-20261017',
    reviewedBase: '0915ed8f939110d89cb36c27465a1e9a51c143de',
    reviewSha256: 'c03aba059bc7dc3e7a8a3faa49decfd72ef8b401885417db59ba1b22f2234d87',
    evidenceBasis: 'constructed-state-runtime-pending',
});
export const SOURCE_TRIAL_UNITS = Object.freeze(['detect.c:find_trap', 'detect.c:dosearch0', 'detect.c:dosearch']);
export const SOURCE_TRIAL_PATHS = Object.freeze(['js/detect.js', 'scripts/detect.test.mjs', '.cache/']);
const SOURCE_TRIAL_PINS = {
    'js/attrib.js': '454a6f872a9ddf29cf2f9c48f5ac893399a08308',
    'js/cmd.js': '74600753d452ebee099f2764f6c54ac38de36e3f',
    'js/const.js': '548fd4c012c2a6c3f9563e491feb6bce5a46dda8',
    'js/detect.js': '67d45ef6e8378c3e4b391dc01a246384ef6d6793',
    'js/display.js': '4802f48a1a53a5c4d39ba165c8bd95e4a33fdad8',
    'js/hack.js': 'ac58c7df369256394d08c9137482b90117c3ed62',
    'js/mon.js': '8ecb6be8f48a8c71e9c72bce27f78173568af1ac',
    'js/objnam.js': 'cff691875b79c9f0328e954337567988ddb94d16',
    'js/rng.js': '76efef3acbed3922b6a7d235a5420c43080538b0',
    'js/trap.js': '12234b3a2a1b30a13aa35e9c091c53d0803d7820',
    'js/trap_names_data.js': '6c3b26befa1c1ee914d07e6a534bea69c5970312',
    'js/tty_menu.js': '3401c8c4dab5707080f03600bd02c588742c4aaf',
    'js/tty_message.js': '5b0185c0e571b2fc73dffe15c504b1e919e583ec',
    'js/vision.js': 'f8d278fc3103d2cb430afe356935d3b1f98f11d7',
    'scripts/detect.test.mjs': '47dae0ec4a9eccf3389317387cc81ef1963739b4',
    'nethack-c/upstream': '16ff59115315917b93185d026aeefea06db9b0f4',
};

export function validateSourceTrial(trial) {
    if (!trial || !/^[a-f0-9]{40}$/u.test(trial.assignmentBase ?? '')
        || !isDeepStrictEqual(trial, {...SOURCE_TRIAL, assignmentBase: trial.assignmentBase}))
        throw new Error('source trial must bind the one reviewed ID/base/digest and constructed-state evidence basis');
    return trial;
}

export function verifySourceTrialBase(root, trial) {
    validateSourceTrial(trial);
    for (const [path, expected] of Object.entries(SOURCE_TRIAL_PINS)) {
        const entry = execFileSync('git', ['-C', root, 'ls-tree', trial.assignmentBase, '--', path],
            {encoding: 'utf8'}).trim();
        const [metadata, actualPath] = entry.split('\t');
        const [mode, type, object] = metadata.split(' ');
        if (actualPath !== path || object !== expected
            || mode !== (path === 'nethack-c/upstream' ? '160000' : '100644')
            || type !== (path === 'nethack-c/upstream' ? 'commit' : 'blob'))
            throw new Error(`source trial reviewed identity changed: ${path}; stop and re-review`);
    }
}

export function validateSourceTrialGoal(goal) {
    validateSourceTrial(goal.sourceTrial);
    const units = sourceUnits(goal).map(entry => sourceUnitKey(goal, entry)).sort();
    if (goal.id !== SOURCE_TRIAL.id || goal.kind !== 'file-port' || goal.cFile !== 'detect.c'
        || goal.session || (goal.sessions ?? []).length
        || !isDeepStrictEqual(units, [...SOURCE_TRIAL_UNITS].sort()))
        throw new Error('source trial goal differs from its reviewed source units or sessionless scope');
}

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
        throw new Error(`${label} path must name an evidence file, not a fixed-workload corpus directory`);
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

function syntheticRanges(value, label) {
    if (!Array.isArray(value)) throw new Error(`${label} synthetic must be an array`);
    return value.map((range) => {
        if (!/^v[1-9][0-9]*$/u.test(range?.batch)
            || !/^[a-z0-9][a-z0-9-]*$/u.test(range?.caseId))
            throw new Error(`${label} synthetic needs an admitted batch and case ID`);
        const { segment, fromStep, throughStep } = range;
        if (![segment, fromStep, throughStep].every(Number.isSafeInteger)
            || segment < 0 || fromStep < 0 || throughStep < fromStep)
            throw new Error(`${label} synthetic needs a valid zero-based step range`);
        return { batch: range.batch, caseId: range.caseId, segment, fromStep,
            throughStep, source: text(range.source, `${label} synthetic source trace`) };
    });
}

/** Whole source units include required callees outside the primary range. */
export function sourceUnits(goal = {}) {
    const sourceFile = goal.luaFile ?? goal.cFile;
    return [
        ...(goal.functions ?? []).map(entry => ({ ...entry, sourceFile })),
        ...(goal.requiredFunctions ?? []),
    ];
}

export function sourceUnitKey(goal, entry) {
    return `${entry.sourceFile ?? goal.luaFile ?? goal.cFile}:${entry.name}`;
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
    for (const entry of goal.requiredFunctions ?? []) {
        if (!/^[A-Za-z0-9_-]+\.c$/u.test(entry.sourceFile ?? '')) {
            throw new Error('required source file must be a C basename');
        }
    }
    const units = new Set();
    for (const entry of sourceUnits(goal)) {
        text(entry.name, 'goal function name');
        if (!/^[A-Za-z0-9_-]+\.(?:c|lua)$/u.test(entry.sourceFile)
            || (entry.sourceFile !== file && !entry.sourceFile.endsWith('.c'))) {
            throw new Error('required source file must be a C basename');
        }
        const key = sourceUnitKey(goal, entry);
        if (units.has(key)) throw new Error(`duplicate planned source unit ${key}`);
        units.add(key);
    }
    return { lua, file, names, units };
}

function functionEvidence(record, scope, constructedTrial = false) {
    const name = text(record?.name, 'function name');
    const sourceFile = record.sourceFile ?? scope.file;
    if (!scope.units.has(`${sourceFile}:${name}`)) throw new Error(`goal does not contain source unit ${sourceFile}:${name}`);
    const symbol = identifier(record.symbol ?? (sourceFile.endsWith('.c') ? name : undefined), `${name} symbol`);
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
    const synthetic = syntheticRanges(record.synthetic ?? [], name);
    const result = { name, implementation, symbol, sourceReview, callers,
        pure: record.pure, tests, recordings };
    if (constructedTrial && (!tests.length || !callers.length || record.inactiveReason || record.pure))
        throw new Error(`${name} source trial needs impure source-pinned tests and production callers, not pure/inactive evidence`);
    if (record.sourceFile !== undefined) result.sourceFile = sourceFile;
    if (record.synthetic !== undefined) result.synthetic = synthetic;
    if (record.inactiveReason !== undefined) {
        result.inactiveReason = text(record.inactiveReason, `${name} inactiveReason`);
    }
    if (callers.length === 0) {
        if (!result.inactiveReason) throw new Error(`${name} needs a caller or an inactiveReason`);
        if (tests.length === 0) {
            throw new Error(`${name} inactive source needs a source-pinned test`);
        }
    }
    if (record.pure && tests.length === 0) {
        throw new Error(`${name} pure function needs a source-pinned test`);
    }
    if (!constructedTrial && !record.pure && recordings.length === 0 && synthetic.length === 0 && !result.inactiveReason) {
        throw new Error(`${name} impure function needs a matching recording or synthetic range through its caller`);
    }
    return result;
}

function evidenceShape(goal, evidence, constructedTrial = false) {
    const scope = goalScope(goal);
    if (!Array.isArray(evidence?.functions)) throw new Error('port evidence needs a functions array');
    const names = new Set();
    const functions = evidence.functions.map((record) => {
        const result = functionEvidence(record, scope, constructedTrial);
        const key = `${result.sourceFile ?? scope.file}:${result.name}`;
        if (names.has(key)) throw new Error(`duplicate function evidence for ${key}`);
        names.add(key);
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
                const sourceFile = typeof unit === 'string' ? scope.file : unit?.sourceFile;
                const unitName = typeof unit === 'string' ? unit : unit?.name;
                if (!scope.units.has(`${sourceFile}:${unitName}`)) throw new Error(`entry point ${name} has unknown source unit ${sourceFile}:${unitName}`);
                return typeof unit === 'string' ? unit : { sourceFile, name: unitName };
            });
            const unique = new Map(units.map(unit => [typeof unit === 'string'
                ? `${scope.file}:${unit}` : `${unit.sourceFile}:${unit.name}`, unit]));
            const result = { name, functions: [...unique.values()],
                recordings: pathList(entry.recordings ?? [], 'recordings', '.session.json', `${name} recordings`) };
            if (entry.synthetic !== undefined)
                result.synthetic = syntheticRanges(entry.synthetic, name);
            return result;
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
export function validatePortEvidence(goal, evidence, { root = PROJECT_ROOT, commit, deliveryClaims = false } = {}) {
    if (goal.sourceTrial) validateSourceTrialGoal(goal);
    if (goal.sourceParity) validateSourceParityGoal(goal);
    const constructedTrial = Boolean(deliveryClaims && (goal.sourceTrial || goal.sourceParity));
    const { scope, evidence: result } = evidenceShape(goal, evidence, constructedTrial);
    if (deliveryClaims && goal.sourceParity) validateSourceParityClaims(goal, evidence);
    if (deliveryClaims && goal.sourceTrial) {
        if (result.functions.some(entry => entry.implementation !== 'js/detect.js'
            || entry.symbol !== entry.name || !entry.tests.includes('scripts/detect.test.mjs')))
            throw new Error('source trial claims must use the reviewed detect implementation symbols and focused test');
        const reached = new Set((result.entryPoints ?? []).flatMap(entry => entry.functions)
            .map(unit => sourceUnitKey(goal, typeof unit === 'string' ? {name: unit} : unit)));
        if (!SOURCE_TRIAL_UNITS.every(unit => reached.has(unit)))
            throw new Error('source trial needs production entry-point claims for all three reviewed units');
    }
    // A queued delivery remains reviewable after its worker changes HEAD or
    // starts editing again. Read its references from Git, not that moving tree.
    const git = (directory, args) => execFileSync('git', ['-C', directory, ...args],
        { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    const committedFile = (path) => {
        const entry = git(root, ['ls-tree', commit, '--', path]).trim();
        if (!/^100(?:644|755) blob [0-9a-f]{40}\t/u.test(entry))
            throw new Error(`missing regular file at ${commit}: ${path}`);
        return path;
    };
    const file = commit ? committedFile : path => regularFile(path, root);
    const read = commit ? path => git(root, ['show', `${commit}:${path}`]) : path => readFileSync(path, 'utf8');
    const sourceTexts = new Map();
    const readSource = (sourceFile) => {
        if (sourceTexts.has(sourceFile)) return sourceTexts.get(sourceFile);
        let sourceText;
        if (commit) {
            const cRoot = join(root, 'nethack-c/upstream');
            const cCommit = git(root, ['rev-parse', `${commit}:nethack-c/upstream`]).trim();
            const directories = scope.lua ? ['dat'] : ['src', 'win/tty'];
            for (const directory of directories) {
                const path = `${directory}/${sourceFile}`;
                if (git(cRoot, ['ls-tree', cCommit, '--', path]).trim()) {
                    sourceText = git(cRoot, ['show', `${cCommit}:${path}`]);
                    break;
                }
            }
            if (sourceText === undefined) throw new Error(`source file ${sourceFile} is missing at pinned C commit`);
        } else sourceText = readFileSync(sourcePath({ ...scope, file: sourceFile }, root), 'utf8');
        sourceTexts.set(sourceFile, sourceText);
        return sourceText;
    };
    readSource(scope.file);
    const symbols = [];
    for (const entry of result.functions) {
        symbols.push({ path: file(entry.implementation),
            symbol: entry.symbol, allowConst: scope.lua });
        for (const caller of entry.callers) {
            symbols.push({ path: file(caller.path), symbol: caller.symbol, allowConst: true });
        }
        for (const path of [...entry.tests, ...entry.recordings]) file(path);
    }
    for (const entry of result.entryPoints ?? []) {
        for (const path of entry.recordings) file(path);
    }
    if (!scope.lua) {
        const sourceNamesByFile = new Map();
        for (const entry of result.functions) {
            const sourceFile = entry.sourceFile ?? scope.file;
            if (!sourceNamesByFile.has(sourceFile)) {
                sourceNamesByFile.set(sourceFile, new Set(parseCFunctions(blankCommentsAndStrings(readSource(sourceFile)))
                    .map((definition) => definition.name)));
            }
            const sourceNames = sourceNamesByFile.get(sourceFile);
            if (!sourceNames.has(entry.name)) throw new Error(`source ${sourceFile} has no definition for ${entry.name}`);
        }
    }
    const sources = new Map();
    for (const { path, symbol, allowConst } of symbols) {
        if (!sources.has(path)) sources.set(path, blankCommentsAndStrings(read(path)));
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
    const primary = goal.luaFile ?? goal.cFile;
    return new Set(completedSourceUnits(goal).filter(entry => entry.sourceFile === primary)
        .map(entry => entry.name));
}

export function completedSourceUnits(goal) {
    // Even accepted constructed-state claims do not certify source coverage.
    if (goal.sourceTrial || goal.sourceParity) return [];
    try {
        const invalidated = new Set((goal.invalidatedFunctions ?? [])
            .map(entry => sourceUnitKey(goal, entry)));
        return evidenceShape(goal, goal.evidence).evidence.functions
            .filter(entry => !invalidated.has(sourceUnitKey(goal, entry)))
            .map(entry => ({ sourceFile: entry.sourceFile ?? goal.luaFile ?? goal.cFile, name: entry.name }));
    } catch {
        return [];
    }
}
