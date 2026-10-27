#!/usr/bin/env node
// Standalone discovery adapter. No ledger writes or gameplay mutations.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listLuaFiles, luaFilePath } from './lua-sources.mjs';
import { runDifferential, validateCleanRecipe } from './diff-fresh.mjs';
import { chunkRecipe } from './fresh-matrix.mjs';

export const METHOD = 'lua-level-generation/v1';
export const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

export function makeRecipe(program, seed) {
    if (!Number.isSafeInteger(seed) || seed < 0) throw new Error('seed must be a nonnegative safe integer');
    return validateCleanRecipe({ version: 5, segments: [{ seed, datetime: '20440617173022',
        nethackrc: 'OPTIONS=name:LuaProbe,role:Valkyrie,race:human,gender:female,align:neutral,playmode:debug,!legacy,!tutorial,!splash_screen,pettype:none,!autopickup,!debug_mongen,!acoustics\n',
        moves: `.#wizloaddes\n${program}\n            #wizmap\n        `,
    }] });
}

// Literal percent gates only: a coverage inventory, never a Lua interpreter.
export function percentSites(source) {
    return source.split('\n').flatMap((text, index) => {
        const match = text.match(/^\s*if percent\((\d+)\) then/u);
        return match ? [{ line: index + 1, threshold: Number(match[1]) }] : [];
    });
}

export function inspectWitness(program, source, recipe, recording, result) {
    const segment = recipe.segments[0];
    const directCommand = `#wizloaddes\n${program}\n`;
    const directStart = segment.moves.indexOf(directCommand);
    const natural = /#levelchange\n[^\n]+\n/u.exec(segment.moves);
    const submitStep = directStart >= 0 ? directStart + directCommand.length
        : natural ? natural.index + natural[0].length : -1;
    const gates = new Map(percentSites(source).map(site => [site.line, site]));
    const draws = recording.segments.flatMap(s => s.steps.flatMap(step => step.rng || []))
        .filter(entry => /^(?:rn2|rnd|rn1|rnl|rne|rnz|d)\(/u.test(entry));
    const witnesses = [];
    const beforeSubmit = recording.segments[0].steps.slice(0, Math.max(0, submitStep))
        .flatMap(step => step.rng || []).filter(e => /^(?:rn2|rnd|rn1|rnl|rne|rnz|d)\(/u.test(e)).length;
    const submitLength = (recording.segments[0].steps[submitStep]?.rng || [])
        .filter(e => /^(?:rn2|rnd|rn1|rnl|rne|rnz|d)\(/u.test(e)).length;
    for (const [index, entry] of draws.entries()) {
        if (index < beforeSubmit || index >= beforeSubmit + submitLength) continue;
        const site = entry.indexOf(`(${program}:`);
        if (site < 0) continue;
        const line = Number(entry.slice(site + program.length + 2).match(/^\d+/u)?.[0]);
        const draw = entry.match(/^rn2\(100\)=(\d+)/u);
        const gate = gates.get(line);
        witnesses.push({ index, line, entry,
            ...(gate && draw ? { threshold: gate.threshold, taken: Number(draw[1]) < gate.threshold } : {}),
            jsPrefixAgrees: !result.error && (!result.rngMismatch || result.rngMismatch.index > index),
        });
    }
    // The recorder's two-frame Lua context stops at nhlib.percent(), so
    // bigrm-12 has no filename in those entries. Decode only this source-pinned
    // pilot's nine gates, in the exact #wizloaddes filename-submit boundary.
    // This is a trace recognizer, not execution or a general Lua evaluator.
    if (program === 'bigrm-12.lua' && segment.moves.includes(`#wizloaddes\n${program}\n`)) {
        const sites = percentSites(source);
        const expected = [20, 50, 50, 25, 75, 25, 75, 20, 50];
        if (digest(source) === 'bba29f1cc3460bce2d7e3e08d5cc2b135f85b170e8f98e1f68c95c6c88319051'
            && JSON.stringify(sites.map(g => g.threshold)) === JSON.stringify(expected)) {
            const submit = segment.moves.indexOf(`#wizloaddes\n${program}\n`) + `#wizloaddes\n${program}\n`.length;
            const steps = recording.segments[0].steps;
            const step = steps[submit];
            const percentDraws = (step?.rng || []).filter(e => /^rn2\(100\)=\d+ @ .*parent=percent\(nhlib.lua:/u.test(e));
            let cursor = 0;
            const decoded = [];
            const take = siteIndex => {
                const entry = percentDraws[cursor++];
                if (!entry) throw new Error('incomplete gate trace');
                const gate = sites[siteIndex];
                const value = Number(entry.match(/^rn2\(100\)=(\d+)/u)[1]);
                const offset = steps.slice(0, submit).flatMap(s => s.rng || []).filter(e => /^(?:rn2|rnd|rn1|rnl|rne|rnz|d)\(/u.test(e)).length;
                const index = draws.indexOf(entry, decoded.at(-1)?.index + 1 || offset);
                const taken = value < gate.threshold;
                decoded.push({ ...gate, index, entry, taken, attribution: 'source-pinned-command-boundary',
                    jsPrefixAgrees: !result.error && (!result.rngMismatch || result.rngMismatch.index > index) });
                return taken;
            };
            try {
                if (take(0)) { take(1); take(2); }
                if (take(3)) take(4);
                if (take(5)) take(6);
                if (take(7)) take(8);
                if (cursor === percentDraws.length) witnesses.push(...decoded);
            } catch { /* Missing or changed trace remains unresolved. */ }
        }
    }
    const direct = segment.moves.includes(`#wizloaddes\n${program}\n`);
    return { route: direct ? 'wizard-des' : 'recipe',
        routeInputVerified: direct || /#levelchange\n/u.test(segment.moves),
        otherProgramObserved: draws.slice(beforeSubmit, beforeSubmit + submitLength).some(e => /\((?:bigrm|medusa)-\d+\.lua:/u.test(e) && !e.includes(`(${program}:`)),
        cProgramObserved: witnesses.length > 0, witnesses,
        // Agreement is an ordered-stream witness, not private-state equality.
        jsProgramEvidence: witnesses.some(w => w.jsPrefixAgrees) ? 'source-route-and-rng-prefix' : 'unresolved',
        cUncoveredPercentSites: [...gates.values()].filter(g => !witnesses.some(w => w.line === g.line)),
        uncoveredPercentSites: [...gates.values()].filter(g => !witnesses.some(w => w.line === g.line && w.jsPrefixAgrees)),
    };
}

export function classify(result, witness) {
    if (!result || result.error) return 'infrastructure-failed';
    if (!result.lengths?.screens?.c || !result.lengths?.screens?.js) return 'unresolved';
    if (!witness.cProgramObserved) return witness.otherProgramObserved ? 'unreachable' : 'unresolved';
    if (!witness.routeInputVerified || witness.jsProgramEvidence === 'unresolved') return 'unresolved';
    return result.passed ? 'matching' : 'mismatch';
}

// A repeat can invalidate a first pass. Preserve the whole outcome distribution
// even when a single ledger status cannot express disagreement plus failure.
export function summarizeAttempts(attempts) {
    const counts = {};
    for (const attempt of attempts) counts[attempt.status] = (counts[attempt.status] || 0) + 1;
    const statuses = Object.keys(counts).sort();
    const disagreement = statuses.length > 1;
    const status = counts['infrastructure-failed'] ? 'infrastructure-failed'
        : disagreement ? 'unresolved' : statuses[0] || 'uncovered';
    return { status, counts, disagreement };
}

export function ledgerRow(row, commit, output) {
    const aggregate = summarizeAttempts(row.attempts);
    const outcomes = Object.entries(aggregate.counts).map(([status, count]) => `${status}=${count}`).join(', ');
    return { id: row.id, title: `${row.program} level generation`,
        methods: [METHOD], source_locations: [`nethack-c/upstream/dat/${row.program}`],
        status: aggregate.status, priority: row.reproducibleMismatch ? 'high' : 'low',
        expected_behavior: 'C and JS agree within the same supported entry route',
        observed_difference: aggregate.status === 'matching' ? 'none observed across all attempts'
            : `${aggregate.disagreement ? 'repeat disagreement; ' : ''}${outcomes || 'no attempts'}`,
        evidence_summary: `${row.attempts.length} attempts; ${outcomes}; reproducible mismatch=${row.reproducibleMismatch}`,
        next_experiment: 'Inspect first mismatch and uncovered gate outcomes; do not infer hidden-state equality',
        last_checked_sha: commit, details_path: join(output, 'summary.json') };
}

export function summarizeGateOutcomes(cases) {
    const gateOutcomes = {}, cGateOutcomes = {}, cOnlyGateOutcomes = {};
    const add = (map, key, taken) => {
        map[key] ||= [];
        if (!map[key].includes(taken)) map[key].push(taken);
    };
    for (const row of cases) for (const attempt of row.attempts) {
        for (const w of attempt.witness?.witnesses || []) if (typeof w.taken === 'boolean') {
            const key = `${row.program}:${w.line}`;
            add(cGateOutcomes, key, w.taken);
            const comparable = w.jsPrefixAgrees === true && attempt.witness.routeInputVerified === true
                && !attempt.error && !attempt.result?.error && attempt.status !== 'infrastructure-failed';
            add(comparable ? gateOutcomes : cOnlyGateOutcomes, key, w.taken);
        }
    }
    return { gateOutcomes, cGateOutcomes, cOnlyGateOutcomes };
}

export async function discover(config) {
    const started = Date.now();
    if (!Array.isArray(config.cases) || !config.cases.length) throw new Error('cases required');
    if (!Number.isInteger(config.maxCases) || config.maxCases < 1 || config.maxCases > 100) throw new Error('maxCases must be 1..100');
    if (!Number.isInteger(config.repeats) || config.repeats < 1 || config.repeats > 3) throw new Error('repeats must be 1..3');
    if (!Number.isFinite(config.budgetSeconds) || config.budgetSeconds <= 0) throw new Error('budgetSeconds must be positive');
    const output = resolve(config.output);
    mkdirSync(output); // Existing runs are immutable.
    save(join(output, 'config.json'), config);
    const commit = git('rev-parse', 'HEAD');
    const files = git('ls-files', 'js', 'frozen', 'scripts', 'nethack-c/patches', 'nethack-c/build-recorder.sh').split('\n');
    const hashes = Object.fromEntries(files.map(path => [path, digest(readFileSync(path))]));
    const install = process.env.NETHACK_INSTALL || 'nethack-c/recorder/install/games/lib/nethackdir';
    const binary = process.env.NETHACK_BINARY || join(install, 'nethack');
    const provenance = { method: METHOD, commit, dirty: git('status', '--porcelain'), node: process.version,
        platform: process.platform, arch: process.arch, upstreamCommit: git('-C', 'nethack-c/upstream', 'rev-parse', 'HEAD'), inventoryCount: listLuaFiles().length,
        configSha256: digest(config), files: hashes,
        adapterSha256: digest(readFileSync(fileURLToPath(import.meta.url))),
        recorder: { binary, sha256: digest(readFileSync(binary)), install,
            files: Object.fromEntries(readdirSync(install, { withFileTypes: true }).filter(e => e.isFile()).map(e => [e.name, digest(readFileSync(join(install, e.name)))])) },
        environment: { RERECORD_TZ: process.env.RERECORD_TZ || 'America/New_York',
            SESSION_REPLAY_TIMEOUT_MS: process.env.SESSION_REPLAY_TIMEOUT_MS || '45000',
            NETHACK_LUA_RNGLOG_CTX: process.env.NETHACK_LUA_RNGLOG_CTX ?? 'default' },
    };
    save(join(output, 'provenance.json'), provenance);
    const cases = [];
    for (const [index, spec] of config.cases.entries()) {
        const sourcePath = luaFilePath(spec.program);
        const source = readFileSync(sourcePath, 'utf8');
        const recipe = spec.recipe ? validateCleanRecipe(read(spec.recipe), spec.recipe) : makeRecipe(spec.program, spec.seed);
        if (chunkRecipe(recipe, 1).length !== 1) throw new Error('one segment per discovery case required');
        const id = digest({ method: METHOD, program: spec.program, recipe });
        const row = { id, program: spec.program, sourceSha256: digest(source), recipeSha256: digest(recipe), attempts: [] };
        cases.push(row);
        writeFileSync(join(output, `${index}-source.lua`), source);
        for (let repeat = 0; repeat < config.repeats; repeat++) {
            if (index >= config.maxCases || Date.now() - started >= config.budgetSeconds * 1000) {
                row.attempts.push({ status: 'uncovered', reason: 'case/start budget exhausted' });
                break;
            }
            const evidenceDir = join(output, `${index}-${repeat}`);
            const attemptStart = Date.now();
            let result, witness, error;
            try {
                result = await runDifferential(recipe, process.env, { evidenceDir });
                witness = inspectWitness(spec.program, source, recipe, read(join(evidenceDir, 'recorded.session.json')), result);
            } catch (failure) { error = failure.message; }
            const rawHashes = {};
            for (const file of ['recipe.session.json', 'recorded.session.json', 'js-output.json']) {
                try { rawHashes[file] = digest(readFileSync(join(evidenceDir, file))); } catch { /* Failed capture stays absent. */ }
            }
            const status = error ? 'infrastructure-failed' : classify(result, witness);
            const fingerprint = result && digest({ program: spec.program, route: witness.route,
                rng: result.rngMismatch, screen: result.screenMismatch, cursor: result.cursorMismatch,
                animation: result.animMismatch, error: result.error });
            row.attempts.push({ status, elapsedMs: Date.now() - attemptStart, result, witness, error, fingerprint,
                evidenceDir, rawHashes, reproduce: `node scripts/lua-discovery.mjs ${join(output, 'config.json')} <new-output-directory>` });
            save(join(output, `${index}-${repeat}.json`), row.attempts.at(-1));
            process.stdout.write(`${index} ${spec.program} repeat=${repeat} ${status}\n`);
        }
        row.outcome = summarizeAttempts(row.attempts);
        row.repeatable = row.attempts.length >= 2 && row.attempts.every(a => a.rawHashes?.['js-output.json']
            && JSON.stringify(a.rawHashes) === JSON.stringify(row.attempts[0].rawHashes));
        row.reproducibleMismatch = row.attempts.length >= 2 && row.attempts.every(a => a.status === 'mismatch' && a.fingerprint === row.attempts[0].fingerprint);
    }
    const counts = {};
    for (const row of cases) for (const attempt of row.attempts) counts[attempt.status] = (counts[attempt.status] || 0) + 1;
    const coverage = summarizeGateOutcomes(cases);
    const summary = { ...coverage, method: METHOD, commit, elapsedMs: Date.now() - started, candidates: cases.length, counts,
        distinctReproducibleMismatches: new Set(cases.filter(c => c.reproducibleMismatch).map(c => c.attempts[0].fingerprint)).size,
        passingControls: cases.filter(c => c.attempts.every(a => a.status === 'matching')).map(c => c.id), cases };
    save(join(output, 'summary.json'), summary);
    // Exactly the hub's twelve columns; rich method/version/run data stays in details.
    save(join(output, 'ledger.json'), cases.map(row => ledgerRow(row, commit, output)));
    return summary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [configPath, output] = process.argv.slice(2);
    if (!configPath || !output) {
        console.error('Usage: node scripts/lua-discovery.mjs config.json NEW_OUTPUT_DIRECTORY');
        process.exitCode = 2;
    } else discover({ ...read(configPath), output }).then(summary => {
        console.log(JSON.stringify({ candidates: summary.candidates, counts: summary.counts,
            distinctReproducibleMismatches: summary.distinctReproducibleMismatches, elapsedMs: summary.elapsedMs }));
    }).catch(error => { console.error(error); process.exitCode = 2; });
}
