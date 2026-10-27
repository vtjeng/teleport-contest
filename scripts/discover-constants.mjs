#!/usr/bin/env node

// Local, report-only comparison of numeric const.js exports with C header
// object-like macros. C expressions are evaluated by the pinned recorder
// compiler; this script never evaluates C expressions in JavaScript.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync,
    rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// The report is scoped to the exact checkout being examined. Hub runs retain
// the resolved full SHA, so reviews cannot silently move with HEAD.
export const BASE_SHA = 'HEAD';
const UPSTREAM = join(PROJECT_ROOT, 'nethack-c', 'upstream');
const INCLUDE = join(UPSTREAM, 'include');
const UNIX = join(UPSTREAM, 'sys', 'unix');
const OWNERSHIP = join(PROJECT_ROOT, 'trial-monitor', 'repairs.json');
const DEFAULT_REPORT = join(PROJECT_ROOT, 'reports', 'constant-scan.json');
const PINNED_COMPILER = 'clang';
const RECORDER_INCLUDE = process.env.TELEPORT_RECORDER_INCLUDE || null;
const PROFILE_FILES = [
    'nethack-c/upstream/include/config.h',
    'nethack-c/upstream/include/config1.h',
    'nethack-c/upstream/include/unixconf.h',
    'nethack-c/upstream/sys/unix/hints/linux-minimal',
    'nethack-c/build-recorder.sh',
];
const TOOL_FILES = [
    'scripts/discover-constants.mjs',
    'scripts/check-constants.mjs',
    'scripts/generate-options.mjs',
    'scripts/discover-constants.test.mjs',
];

const EXCLUDED_LEADS = Object.freeze([
    'security-blocked unpaid glob',
    'figurine planning',
    'buried zombie',
    'timer/corpse leads explicitly blocked by the parent task',
]);

const hash = (value) => createHash('sha256').update(value).digest('hex');
const fileHash = (path) => existsSync(path)
    ? hash(readFileSync(path)) : null;
const sorted = (values) => [...values].sort((a, b) => a.localeCompare(b));

export function parseObjectLikeDefines(preprocessed) {
    const definitions = new Map();
    let source = null;
    let sourceLine = null;
    for (const line of preprocessed.split(/\r?\n/u)) {
        const marker = /^#\s+(\d+)\s+"([^"]+)"/u.exec(line);
        if (marker) {
            source = marker[2];
            sourceLine = Number(marker[1]);
            continue;
        }
        const define = /^#define\s+([A-Za-z_]\w*)(.*)$/u.exec(line);
        if (define && !define[2].startsWith('(')) {
            definitions.set(define[1], {
                expression: define[2].trim(),
                source,
                line: sourceLine,
            });
        }
        const undef = /^#undef\s+([A-Za-z_]\w*)/u.exec(line);
        if (undef) definitions.delete(undef[1]);
        if (sourceLine !== null) sourceLine++;
    }
    return definitions;
}

// This whitelist only chooses which preprocessor expressions to ask clang to
// compile. It never calculates a value. The compiler remains authoritative.
export function isBoundedIntegerExpression(expression) {
    if (!expression) return false;
    const token = /(?:0[xX][\da-fA-F]+|0[bB][01]+|\d+)[uUlL]*|[A-Za-z_]\w*|<<|>>|<=|>=|==|!=|&&|\|\||[()+\-*/%&|^~!?:<>]/gyu;
    let offset = 0;
    while (offset < expression.length) {
        if (/\s/u.test(expression[offset])) {
            offset++;
            continue;
        }
        token.lastIndex = offset;
        const match = token.exec(expression);
        if (!match) return false;
        offset = token.lastIndex;
    }
    return true;
}

export function numericExports(namespace) {
    return new Map(Object.entries(namespace)
        .filter(([name, value]) => /^[A-Z_][A-Z0-9_]*$/u.test(name)
            && typeof value === 'number' && Number.isSafeInteger(value))
        .sort(([a], [b]) => a.localeCompare(b)));
}

export function parseProbeOutput(output) {
    const values = new Map();
    for (const line of output.trim().split(/\r?\n/u)) {
        if (!line) continue;
        const [name, bitsText, sign, signedText, unsignedText] = line.split('\t');
        if (!/^[A-Z_][A-Z0-9_]*$/u.test(name)
            || !/^\d+$/u.test(bitsText)
            || !['signed', 'unsigned'].includes(sign)
            || !/^-?\d+$/u.test(signedText)
            || !/^\d+$/u.test(unsignedText)) {
            throw new Error(`invalid C macro probe row: ${line}`);
        }
        const value = sign === 'signed'
            ? Number(signedText) : Number(unsignedText);
        if (!Number.isSafeInteger(value)) {
            values.set(name, { value: null, bits: Number(bitsText), sign,
                reason: 'outside JavaScript safe integer range' });
        } else {
            values.set(name, { value, bits: Number(bitsText), sign });
        }
    }
    return values;
}

export function makeFingerprint({ cPath, name, jsPath = 'js/const.js' }) {
    const key = `header-macro-mismatch\0${cPath}\0${name}\0${jsPath}\0${name}`;
    return { key: key.replaceAll('\0', '|'), sha256: hash(key) };
}

export function ownershipIndex(repairs) {
    const byFingerprint = new Map();
    for (const repair of repairs) {
        const source = repair.evidence?.source ?? [];
        const cEntries = source.flatMap((entry) => {
            const match = /^nethack-c\/upstream\/(.+):([A-Z_][A-Z0-9_]*)$/u
                .exec(entry);
            return match ? [{ path: match[1], name: match[2] }] : [];
        });
        const jsNames = new Set(source.flatMap((entry) => {
            const match = /^js\/const\.js:([A-Z_][A-Z0-9_]*)$/u.exec(entry);
            return match ? [match[1]] : [];
        }));
        for (const c of cEntries) {
            if (!jsNames.has(c.name)) continue;
            byFingerprint.set(`${c.path}|${c.name}`, repair.id);
        }
    }
    return byFingerprint;
}

export function classifyResults({ candidates, previous, blockedIds = new Set() }) {
    const prior = new Map();
    for (const item of [...(previous?.suppressed ?? []), ...(previous?.reReview ?? [])]) {
        prior.set(item.fingerprint.sha256,
            item.suppression?.id ?? item.suppression?.scope
                ?? item.recurrenceOf ?? null);
    }
    const report = { candidates: [], suppressed: [], reReview: [] };
    for (const candidate of candidates) {
        const id = candidate.suppressionId ?? null;
        const scope = candidate.suppressionScope ?? null;
        if (!id && !scope) {
            report.candidates.push(candidate);
        } else if (prior.has(candidate.fingerprint.sha256)) {
            report.reReview.push({
                ...candidate,
                recurrenceOf: prior.get(candidate.fingerprint.sha256) ?? id ?? scope,
                reason: 'the same suppressed fingerprint recurred; re-review ownership',
            });
        } else {
            report.suppressed.push({
                ...candidate,
                suppression: {
                    ...(id ? { id } : {}),
                    ...(scope ? { scope } : {}),
                    reason: scope || blockedIds.has(id)
                        ? 'explicitly excluded lead scope' : 'existing repair ownership',
                },
            });
        }
    }
    for (const values of Object.values(report))
        values.sort((a, b) => a.fingerprint.key.localeCompare(b.fingerprint.key));
    return report;
}

export function compilerProbe(command) {
    const result = spawnSync(command, ['--version'], { encoding: 'utf8' });
    if (result.error) {
        return { available: false, error: result.error.code ?? result.error.message };
    }
    if (result.status !== 0) {
        return { available: false, error: `version exited ${result.status}` };
    }
    return { available: true, version: result.stdout.split(/\r?\n/u)[0] };
}

function baseCommit() {
    return execFileSync('git', ['-C', PROJECT_ROOT, 'rev-parse', BASE_SHA],
        { encoding: 'utf8' }).trim();
}

function cGitlink() {
    const line = execFileSync('git', ['-C', PROJECT_ROOT, 'ls-tree', BASE_SHA,
        'nethack-c/upstream'], { encoding: 'utf8' }).trim();
    const match = /^160000 commit ([0-9a-f]+)\tnethack-c\/upstream$/u.exec(line);
    if (!match) throw new Error('accepted base has no pinned C gitlink');
    return match[1];
}

function profileHashes() {
    return Object.fromEntries(PROFILE_FILES.map((path) => [path,
        fileHash(join(PROJECT_ROOT, path))]));
}

function toolHashes() {
    return Object.fromEntries(TOOL_FILES.map((path) => [path,
        fileHash(join(PROJECT_ROOT, path))]));
}

function macroDumpSource(headerFiles, outputPath) {
    const includes = ['hack.h', ...headerFiles]
        .filter((name, index, list) => list.indexOf(name) === index)
        .map((name) => `#include "${name}"`).join('\n');
    writeFileSync(outputPath, `${includes}\n`);
}

function evaluatorSource(names, headerFiles, outputPath) {
    const includes = ['hack.h', ...headerFiles]
        .filter((name, index, list) => list.indexOf(name) === index)
        .map((name) => `#include "${name}"`).join('\n');
    const rows = names.map((name) => `#ifdef ${name}\n`
        + `printf("${name}\\t%zu\\t%s\\t%" PRIdMAX "\\t%" PRIuMAX "\\n", `
        + `sizeof(${name}) * CHAR_BIT, (${name}) < 0 ? "signed" : "unsigned", `
        + `(intmax_t) (${name}), (uintmax_t) (${name}));\n#endif`).join('\n');
    writeFileSync(outputPath, `${includes}\n#include <inttypes.h>\n`
        + '#include <limits.h>\n'
        + '#include <stdint.h>\n#include <stdio.h>\nint main(void) {\n'
        + `${rows}\nreturn 0;\n}\n`);
}

function runCompiler(command, args) {
    const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(`compiler exited ${result.status}: ${result.stderr.trim()}`);
    }
    return result.stdout;
}

function compilerScan(command, jsValues) {
    const work = mkdtempSync(join(tmpdir(), 'teleport-constant-scan-'));
    try {
        // A compiled probe needs the recorder's generated Lua type declarations;
        // empty preprocessing stand-ins cannot compile hack.h's externs.
        if (!RECORDER_INCLUDE || !existsSync(join(RECORDER_INCLUDE, 'nhlua.h'))
            || !existsSync(join(RECORDER_INCLUDE, 'date.h')))
            throw new Error('recorder generated headers unavailable; set TELEPORT_RECORDER_INCLUDE');
        // The recorder builds game sources through hack.h. Including every
        // header would also activate unrelated platform and generator-only
        // headers (for example windconf.h and defsym.h).
        const headers = [];
        const wrapper = join(work, 'macro-dump.c');
        macroDumpSource(headers, wrapper);
        const preprocessed = runCompiler(command, ['-E', '-dD', '-I', work,
            '-I', INCLUDE, '-I', UNIX, '-I', RECORDER_INCLUDE, wrapper]);
        const definitions = parseObjectLikeDefines(preprocessed);
        const skipped = [];
        for (const name of jsValues.keys()) {
            const definition = definitions.get(name);
            if (!definition) {
                skipped.push({ name, reason: 'no active object-like C macro' });
            } else if (!isBoundedIntegerExpression(definition.expression)) {
                skipped.push({ name, reason: 'expression outside bounded integer grammar' });
            }
        }
        const macros = [...jsValues.keys()].filter((name) => {
            const define = definitions.get(name);
            return define && isBoundedIntegerExpression(define.expression);
        }).sort();
        const source = join(work, 'values.c');
        const binary = join(work, 'values');
        evaluatorSource(macros, headers, source);
        runCompiler(command, ['-I', work, '-I', INCLUDE, '-I', UNIX,
            '-I', RECORDER_INCLUDE,
            source, '-o', binary]);
        const result = spawnSync(binary, [], { encoding: 'utf8' });
        if (result.error) throw result.error;
        if (result.status !== 0) throw new Error(`C probe exited ${result.status}`);
        return { definitions, values: parseProbeOutput(result.stdout),
            macroNames: macros, skipped: skipped.sort((a, b) => a.name.localeCompare(b.name)) };
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
}

export function excludedLeadScope(name, cPath) {
    const identity = `${cPath}/${name}`.toLowerCase();
    if (/unpaid|(?:^|[^a-z])glob(?:[^a-z]|$)/u.test(identity))
        return 'security-blocked unpaid glob';
    if (/figurine/u.test(identity)) return 'figurine planning';
    if (/buried.?zombie/u.test(identity)) return 'buried zombie';
    if (/timer|corpse/u.test(identity)) return 'explicitly blocked timer/corpse lead';
    return null;
}

async function loadJsValues() {
    const module = await import(pathToFileURL(join(PROJECT_ROOT, 'js', 'const.js')).href);
    return numericExports(module);
}

function loadOwnership() {
    if (!existsSync(OWNERSHIP)) return { repairs: [], hash: null };
    const bytes = readFileSync(OWNERSHIP);
    const json = JSON.parse(bytes.toString('utf8'));
    const repairs = json.repairs ?? [];
    const constRepairs = repairs.filter((repair) =>
        (repair.evidence?.source ?? []).some((entry) =>
            /^js\/const\.js:[A-Z_][A-Z0-9_]*$/u.test(entry)));
    return { repairs, constRepairs, hash: hash(bytes), asOf: json.asOf ?? null };
}

function makeCandidate({ name, cPath, expression, cValue, jsValue,
    cFileHash, jsFileHash, profileHash }) {
    const fingerprint = makeFingerprint({ cPath, name });
    const evidenceHash = hash(JSON.stringify({
        cPath, name, expression, cValue, jsValue, cFileHash, jsFileHash,
        profileHash,
    }));
    return {
        kind: 'header-macro-mismatch',
        cPath,
        cSymbol: name,
        cExpression: expression,
        cValue: cValue.value,
        cBits: cValue.bits,
        cSignedness: cValue.sign,
        jsPath: 'js/const.js',
        jsExport: name,
        jsValue,
        fingerprint,
        evidenceSha256: evidenceHash,
    };
}

export async function createReport({
    compiler = PINNED_COMPILER,
    previous = null,
    blockedIds = new Set(),
} = {}) {
    const jsValues = await loadJsValues();
    const owner = loadOwnership();
    const tool = compilerProbe(compiler);
    const report = {
        schemaVersion: 1,
        mode: 'local-report-only',
        baseSha: baseCommit(),
        cGitlink: cGitlink(),
        cCheckout: existsSync(join(UPSTREAM, '.git'))
            ? execFileSync('git', ['-C', UPSTREAM, 'rev-parse', 'HEAD'],
                { encoding: 'utf8' }).trim() : null,
        profile: {
            files: profileHashes(),
            recorderGeneratedHeaders: RECORDER_INCLUDE ? {
                nhlua: fileHash(join(RECORDER_INCLUDE, 'nhlua.h')),
                date: fileHash(join(RECORDER_INCLUDE, 'date.h')),
            } : null,
            compiler: {
                name: PINNED_COMPILER,
                available: tool.available,
                version: tool.version ?? null,
                error: tool.error ?? null,
            },
        },
        toolHashes: toolHashes(),
        ownership: {
            source: relative(PROJECT_ROOT, OWNERSHIP),
            sha256: owner.hash,
            asOf: owner.asOf,
            repairIds: sorted(owner.constRepairs.map(({ id }) => id).filter(Boolean)),
            blockedLeadExclusions: EXCLUDED_LEADS,
        },
        runtime: { node: process.version },
        jsNumericExportCount: jsValues.size,
        status: 'blocked',
        currentMatches: [],
        candidates: [],
        suppressed: [],
        reReview: [],
        firstTenReview: {
            limit: 10,
            candidatesPresented: 0,
            witnessYield: null,
            reason: 'No candidate values are reviewable until the pinned compiler scan completes.',
        },
        skipped: [],
        blocked: [],
    };
    if (!tool.available) {
        report.blocked.push({
            kind: 'pinned-compiler-unavailable',
            compiler: PINNED_COMPILER,
            error: tool.error,
            detail: 'Recorder-profile preprocessing and compiled C evaluation were not run; no header shims, install, or source edits were created.',
        });
        report.skipped.push({
            scope: 'all numeric js/const.js exports',
            count: jsValues.size,
            reason: 'C object-like macro values could not be compiled without pinned clang',
        });
        return report;
    }

    if (report.cCheckout !== report.cGitlink) {
        report.blocked.push({
            kind: 'c-source-revision-mismatch',
            expected: report.cGitlink,
            found: report.cCheckout,
        });
        return report;
    }
    const cStatus = execFileSync('git', ['-C', UPSTREAM, 'status',
        '--porcelain=v1', '--untracked-files=no'], { encoding: 'utf8' }).trim();
    if (cStatus) {
        report.blocked.push({ kind: 'c-source-modified', detail: cStatus });
        return report;
    }

    let scanned;
    try {
        scanned = compilerScan(compiler, jsValues);
    } catch (error) {
        report.blocked.push({
            kind: 'compiler-scan-failed',
            compiler: PINNED_COMPILER,
            error: error?.message ?? String(error),
            detail: 'The scan stopped without modifying upstream headers or installing generated files.',
        });
        report.skipped.push({
            scope: 'all numeric js/const.js exports',
            count: jsValues.size,
            reason: 'C object-like macro scan did not complete',
        });
        return report;
    }
    const assigned = ownershipIndex(owner.repairs);
    const candidates = [];
    for (const name of scanned.macroNames) {
        const cValue = scanned.values.get(name);
        const definition = scanned.definitions.get(name);
        const cPath = definition?.source && isAbsolute(definition.source)
            ? relative(UPSTREAM, definition.source).replaceAll('\\', '/')
            : definition?.source?.replaceAll('\\', '/') ?? 'unknown';
        const jsValue = jsValues.get(name);
        if (!cValue || cValue.value === null) {
            report.blocked.push({
                kind: 'c-value-outside-js-safe-range', name, cPath,
                reason: cValue?.reason ?? 'compiler produced no value row',
            });
            continue;
        }
        if (cValue.value === jsValue) {
            report.currentMatches.push({ name, cPath, cValue: cValue.value,
                jsValue, fingerprint: makeFingerprint({ cPath, name }) });
            continue;
        }
        const candidate = makeCandidate({
            name, cPath, expression: definition.expression, cValue, jsValue,
            cFileHash: fileHash(join(UPSTREAM, cPath)),
            jsFileHash: fileHash(join(PROJECT_ROOT, 'js', 'const.js')),
            profileHash: hash(JSON.stringify(profileHashes())),
        });
        candidate.suppressionId = assigned.get(`${cPath}|${name}`) ?? null;
        candidate.suppressionScope = excludedLeadScope(name, cPath);
        candidates.push(candidate);
    }
    const classified = classifyResults({ candidates, previous, blockedIds });
    report.status = 'complete';
    report.skipped = scanned.skipped;
    report.currentMatches.sort((a, b) => a.name.localeCompare(b.name));
    report.candidates = classified.candidates;
    report.suppressed = classified.suppressed;
    report.reReview = classified.reReview;
    report.firstTenReview = {
        limit: 10,
        candidatesPresented: Math.min(10, report.candidates.length),
        witnessYield: null,
        reason: report.candidates.length
            ? 'Independent discoverer review and live C witness/control results pending.'
            : 'No fresh unsuppressed candidates were found.',
    };
    return report;
}

function parseArgs(args) {
    const options = { report: DEFAULT_REPORT, previous: null };
    for (let index = 0; index < args.length; index++) {
        if (args[index] === '--report') options.report = resolve(args[++index]);
        else if (args[index] === '--previous') options.previous = resolve(args[++index]);
        else throw new Error('Usage: node scripts/discover-constants.mjs [--report path] [--previous path]');
    }
    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const previousPath = options.previous ?? options.report;
    const previous = existsSync(previousPath)
        ? JSON.parse(readFileSync(previousPath, 'utf8')) : null;
    const report = await createReport({ previous });
    mkdirSync(dirname(options.report), { recursive: true });
    writeFileSync(options.report, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`constant scan: ${report.status}; `
        + `${report.candidates.length} candidates, `
        + `${report.suppressed.length} suppressed, `
        + `${report.reReview.length} re-review; ${options.report}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    });
}
