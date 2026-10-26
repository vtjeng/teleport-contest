#!/usr/bin/env node
// Thin, bounded orchestration: existing inventory -> explicit case recipes ->
// existing C/JS comparator -> signature groups -> oracle-checked reductions.
// Source/branch review and useful setup design remain agent-assisted.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { scan, hash, DEFAULT_FILES } from './structural-signals.mjs';
import { evaluateCase, validateSpec, orderedObservations } from './structural-cases.mjs';
import { diagnosticEnvironment, executionContext, assertExecutionContext, artifactManifest } from './structural-context.mjs';
import { parseCaller } from './mismatch-queue.mjs';
import { PROJECT_ROOT } from './c-functions.mjs';
import { auditIdentity } from './source-audit.mjs';

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const clone = value => structuredClone(value);
const recipeHash = recipe => hash(JSON.stringify(recipe));

export function mutateRecipe(original, changes = []) {
    const recipe = clone(original);
    for (const change of changes) {
        if (!['moves', 'nethackrc'].includes(change.field)) throw new Error('mutation field must be moves or nethackrc');
        const segment = recipe.segments[0];
        if (typeof change.set === 'string') segment[change.field] = change.set;
        else if (typeof change.append === 'string') segment[change.field] += change.append;
        else if (typeof change.from === 'string' && change.from.length && typeof change.to === 'string') {
            if (!segment[change.field].includes(change.from)) throw new Error(`mutation source missing: ${change.from}`);
            segment[change.field] = change.all
                ? segment[change.field].split(change.from).join(change.to)
                : segment[change.field].replace(change.from, change.to);
        } else throw new Error('mutation needs set, append, or nonempty from/to');
    }
    validateSpec({ version: 1, cases: [{ id: 'validate', recipe, expectC: [] }] });
    return recipe;
}

export function firstStep(result) {
    const steps = ['rngMismatch', 'screenMismatch', 'cursorMismatch', 'animMismatch']
        .map(key => result?.[key]?.location?.stepIndex).filter(Number.isInteger);
    return steps.length ? Math.min(...steps) : null;
}

// Same signature is a grouping aid, not an automatic root-cause proof. Include
// family identity to avoid merging unrelated branches just because a cell or
// RNG opcode happens to differ in the same way. Ignore input offsets and draw
// values so shorter witnesses and option variations can share the signature.
export function divergenceSignature(family, evidence) {
    if (evidence.status !== 'divergence' || evidence.result?.error || !evidence.observations?.length) return null;
    const result = evidence.result, step = firstStep(result);
    if (step === null || !orderedObservations(evidence.observations, step)) return null;
    const caller = parseCaller(result.rngMismatch?.cCaller);
    const opcode = entry => entry?.split('=')[0] ?? null;
    const observable = mismatch => {
        if (!mismatch) return null;
        const { index: _index, location, ...payload } = mismatch;
        return { ...payload, relativeStep: Number.isInteger(location?.stepIndex) ? location.stepIndex - step : null };
    };
    return JSON.stringify({ family,
        rng: result.rngMismatch ? { c: opcode(result.rngMismatch.cEntry), js: opcode(result.rngMismatch.jsEntry),
            cSource: caller ? `${caller.sourceFile}:${caller.function}:${caller.line}` : null,
            relativeStep: Number.isInteger(result.rngMismatch.location?.stepIndex) ? result.rngMismatch.location.stepIndex - step : null } : null,
        screen: observable(result.screenMismatch), cursor: observable(result.cursorMismatch), animation: observable(result.animMismatch) });
}

// Cross-family grouping requires the same canonical source-signal set as well
// as the strict observable fingerprint. Each member keeps its own reachability
// and control evidence; matching signatures never establish shared root cause.
export function observationGroup(signals, evidence) {
    const signature = divergenceSignature('', evidence);
    return signature && JSON.stringify({ signals: [...new Set(signals)].sort(), observation: JSON.parse(signature) });
}

export function reductionAccepted(family, fingerprint, evidence) {
    return fingerprint !== null && divergenceSignature(family, evidence) === fingerprint;
}

export function sourceRecipe(config, root) {
    if (config.recipe && config.recipePath) throw new Error('choose recipe or recipePath');
    if (config.recipe) return clone(config.recipe);
    if (typeof config.recipePath !== 'string') throw new Error('recipe or recipePath required');
    const path = resolve(root, config.recipePath);
    if (!path.startsWith(`${root}/recipes/`)) throw new Error('recipePath must be a repository recipes/ input');
    return readJson(path);
}

export function validatePlan(plan) {
    if (plan.version !== 1 || !Array.isArray(plan.families) || !plan.families.length || plan.families.length > 8)
        throw new Error('plan requires 1..8 explicit families and version 1');
    if (!Number.isInteger(plan.maxRuns) || plan.maxRuns < 1 || plan.maxRuns > 32)
        throw new Error('maxRuns must be 1..32');
    if (plan.maxPromotions !== undefined && (!Number.isInteger(plan.maxPromotions) || plan.maxPromotions < 1 || plan.maxPromotions > 8))
        throw new Error('maxPromotions must be 1..8');
    const ids = new Set();
    for (const family of plan.families) {
        if (!/^[a-z0-9][a-z0-9-]*$/u.test(family.id) || ids.has(family.id)) throw new Error('invalid/duplicate family id');
        ids.add(family.id);
        if (!Array.isArray(family.signals) || !family.signals.length || !Array.isArray(family.expectC) || !family.expectC.length)
            throw new Error('each family needs signal IDs and C target observations');
        if (family.signals.some(s => typeof s !== 'string' || !s.length)
            || family.expectC.some(s => typeof s !== 'string' || !s.length)) throw new Error('signal IDs and observations must be nonempty strings');
        if ((family.reductions?.length ?? 0) > 12 || (family.variants?.length ?? 0) > 8 || (family.controls?.length ?? 0) > 4)
            throw new Error('family exceeds bounded variants, reductions or controls');
        for (const group of ['variants', 'reductions', 'controls']) {
            const seen = new Set();
            for (const entry of family[group] ?? []) {
                if (!/^[a-z0-9][a-z0-9-]*$/u.test(entry.id) || seen.has(entry.id)) throw new Error(`invalid/duplicate ${group} id`);
                seen.add(entry.id);
                if (entry.expectC && (!Array.isArray(entry.expectC) || entry.expectC.some(s => typeof s !== 'string' || !s.length)))
                    throw new Error('control observations must be strings');
                if (group === 'variants' && entry.expectC && !entry.expectC.length)
                    throw new Error('variant target observations must be nonempty');
            }
        }
    }
    return plan;
}

export function negativeCacheKey(identity, family, recipe, fingerprint, observations) {
    return hash(JSON.stringify([identity, family, recipeHash(recipe), fingerprint, observations]));
}

function archivedFiles(output, id) {
    return ['recipe.json', 'session.json', 'result.json'].flatMap(suffix => {
        const path = join(output, `${id}.${suffix}`);
        if (!existsSync(path)) return [];
        const content = readFileSync(path, 'utf8');
        return [{ suffix, sha256: hash(content), content }];
    });
}

function restoreNegative(cacheEntry, output, id, recipe, context) {
    if (cacheEntry.evidence.id !== id) return null;
    const suffixes = cacheEntry.files.map(file => file.suffix).sort();
    if (!isDeepStrictEqual(suffixes, ['recipe.json', 'result.json', 'session.json']))
        throw new Error('negative cache requires complete distinct receipts');
    for (const file of cacheEntry.files) {
        if (!['recipe.json', 'session.json', 'result.json'].includes(file.suffix) || hash(file.content) !== file.sha256)
            throw new Error('negative cache evidence is corrupt');
    }
    const parsed = suffix => JSON.parse(cacheEntry.files.find(file => file.suffix === suffix).content);
    if (!isDeepStrictEqual(parsed('recipe.json'), recipe) || !isDeepStrictEqual(parsed('result.json'), cacheEntry.evidence)
        || cacheEntry.evidence.status === 'runner-error'
        || reductionAccepted(context.family, context.fingerprint, cacheEntry.evidence))
        throw new Error('negative cache evidence disagrees with its receipts or is not a rejected reduction');
    for (const file of cacheEntry.files) writeFileSync(join(output, `${id}.${file.suffix}`), file.content, { flag: 'wx' });
    return { ...cacheEntry.evidence, cacheHit: true };
}

// Injectable evaluator keeps orchestration tests deterministic without games.
export async function runFamilies(plan, { root = PROJECT_ROOT, output, identity, negativeCache = {}, evaluate = evaluateCase,
    availableSignals = null, log = console.log } = {}) {
    validatePlan(plan);
    const oracles = [], families = [], entries = {}, groups = new Map(), membership = new Map();
    let runs = 0, cacheHits = 0;
    async function oracle(entry, cacheContext = null) {
        if (availableSignals && !availableSignals.has(entry.signal)) throw new Error(`signal no longer present: ${entry.signal}`);
        const key = cacheContext && negativeCacheKey(identity, cacheContext.family, entry.recipe, cacheContext.fingerprint, entry.expectC);
        if (key && negativeCache.entries?.[key]) {
            const restored = restoreNegative(negativeCache.entries[key], output, entry.id, entry.recipe, cacheContext);
            if (restored) {
                cacheHits++; entries[key] = negativeCache.entries[key]; oracles.push(restored); membership.set(restored.id, entry.familyId);
                log(`${entry.id}: cached rejected reduction (${restored.status})`);
                return restored;
            }
        }
        if (runs >= plan.maxRuns) return null;
        runs++;
        const result = await evaluate(entry, output);
        oracles.push(result); membership.set(result.id, entry.familyId);
        log(`${entry.id}: ${result.status}`);
        if (key && result.status !== 'runner-error'
            && !reductionAccepted(cacheContext.family, cacheContext.fingerprint, result)) {
            const files = archivedFiles(output, result.id);
            if (files.length === 3) entries[key] = { evidence: result, files };
        }
        return result;
    }
    // Probe every declared family/variant before spending the shared budget on
    // reductions. A passing base never suppresses a divergent variant.
    const pending = [];
    for (const family of plan.families) {
        if (availableSignals && family.signals.some(id => !availableSignals.has(id)))
            throw new Error(`requested family has stale/missing signals: ${family.id}`);
        const recipe = mutateRecipe(sourceRecipe(family, root), family.changes);
        const makeEntry = (id, input, expectC = family.expectC) => ({ id: `${family.id}-${id}`, familyId: family.id, recipe: input, expectC,
            signal: family.signals[0], source: family.source });
        const base = await oracle(makeEntry('base', recipe));
        if (!base) { pending.push({ family: family.id, reason: 'probe-budget-exhausted' }); continue; }
        const fingerprint = divergenceSignature(family.id, base);
        const familyResult = { id: family.id, signals: family.signals, knownAtBaseline: Boolean(family.knownAtBaseline),
            base: base.id, reductions: [], controls: [], variants: [], candidates: [], signature: fingerprint,
            automaticClaim: 'observed difference; source interpretation remains reviewed evidence' };
        const candidates = new Map();
        if (fingerprint) candidates.set(fingerprint, { origin: 'base', recipe, evidence: base, expectC: family.expectC });
        for (const variant of family.variants ?? []) {
            const input = variant.recipe || variant.recipePath ? sourceRecipe(variant, root) : recipe;
            const changed = mutateRecipe(input, variant.changes), expectC = variant.expectC ?? family.expectC;
            const result = await oracle(makeEntry(`variant-${variant.id}`, changed, expectC));
            if (!result) { pending.push({ family: family.id, variant: variant.id, reason: 'probe-budget-exhausted' }); continue; }
            const signature = divergenceSignature(family.id, result);
            familyResult.variants.push({ id: result.id, status: result.status, signature,
                sameSignature: fingerprint !== null && signature === fingerprint });
            if (signature && !candidates.has(signature))
                candidates.set(signature, { origin: `variant-${variant.id}`, recipe: changed, evidence: result, expectC });
        }
        familyResult._work = { family, makeEntry, recipe, base, candidates };
        families.push(familyResult);
    }
    let promoted = 0;
    for (const familyResult of families) {
        const { family, makeEntry, recipe, base, candidates } = familyResult._work;
        delete familyResult._work;
        // A parity/invalid base retains its own controls and witness, but cannot
        // certify any divergent variant. Each promoted variant gets fresh controls.
        const work = candidates.size ? [...candidates] : [[null, { origin: 'base', recipe, evidence: base, expectC: family.expectC }]];
        for (const [fingerprint, candidate] of work) {
            if (fingerprint && promoted >= (plan.maxPromotions ?? 8)) {
                pending.push({ family: family.id, origin: candidate.origin, signature: fingerprint, reason: 'promotion-cap' }); continue;
            }
            if (fingerprint) promoted++;
            let best = candidate.recipe, bestEvidence = candidate.evidence;
            const result = { origin: candidate.origin, signature: fingerprint, expectC: candidate.expectC,
                reductions: [], controls: [], pending: [], sourceEvidenceId: candidate.evidence.id };
            const prefix = candidate.origin === 'base' ? '' : `${candidate.origin}-`;
            // Share follow-up capacity among remaining candidate observations;
            // reserve at least one declared control before attempting reductions.
            const remainingCandidates = families.reduce((n, f) => n + (f._work?.candidates.size ?? 0), 0)
                + work.length - work.findIndex(([s]) => s === fingerprint) - 1;
            const capacity = Math.max(0, Math.floor((plan.maxRuns - runs) / (remainingCandidates + 1)));
            const stopAt = runs + capacity;
            if (fingerprint) {
                for (const reduction of [{ id: 'prefix-at-first-divergence', firstDivergencePrefix: true }, ...(family.reductions ?? [])]) {
                    if (runs >= stopAt - Math.min(family.controls?.length ?? 0, 1)) {
                        result.pending.push({ kind: 'reductions', reason: 'follow-up-budget', from: reduction.id }); break;
                    }
                    let proposal;
                    try {
                        if (reduction.firstDivergencePrefix) {
                            const step = firstStep(bestEvidence.result);
                            if (step === null || step >= best.segments[0].moves.length) continue;
                            proposal = clone(best); proposal.segments[0].moves = proposal.segments[0].moves.slice(0, step);
                        } else proposal = mutateRecipe(best, reduction.changes);
                        if (proposal.segments[0].moves.length >= best.segments[0].moves.length)
                            throw new Error('reductions must shorten input');
                    } catch (error) {
                        result.reductions.push({ id: `${prefix}reduce-${reduction.id}`, accepted: false, status: 'inapplicable', reason: error.message });
                        continue;
                    }
                    const observed = await oracle(makeEntry(`${prefix}reduce-${reduction.id}`, proposal, candidate.expectC),
                        { family: family.id, fingerprint });
                    if (!observed) break;
                    const accepted = reductionAccepted(family.id, fingerprint, observed);
                    result.reductions.push({ id: observed.id, accepted, status: observed.status, cacheHit: Boolean(observed.cacheHit),
                        beforeKeys: best.segments[0].moves.length, proposedKeys: proposal.segments[0].moves.length });
                    if (accepted) { best = proposal; bestEvidence = observed; }
                }
            }
            for (const control of family.controls ?? []) {
                if (runs >= stopAt) { result.pending.push({ kind: 'controls', reason: 'follow-up-budget', from: control.id }); break; }
                let controlled;
                try {
                    const input = control.fromMinimized ? clone(best) : sourceRecipe(control, root);
                    controlled = mutateRecipe(input, control.changes);
                    if (control.dropLastKeys) controlled.segments[0].moves = controlled.segments[0].moves.slice(0, -control.dropLastKeys);
                } catch (error) {
                    result.controls.push({ id: `${family.id}-${prefix}control-${control.id}`, passed: false,
                        status: 'inapplicable', reason: error.message }); continue;
                }
                const observed = await oracle(makeEntry(`${prefix}control-${control.id}`, controlled, control.expectC ?? []));
                if (!observed) break;
                result.controls.push({ id: observed.id, passed: observed.status === 'parity' });
            }
            result.minimized = { evidenceId: bestEvidence.id, confirmedDivergence: fingerprint !== null,
                keys: best.segments[0].moves.length, recipeSha256: recipeHash(best),
                limit: 'one bounded pass over declared reductions; not globally minimal' };
            result.hasPassingControl = result.controls.some(c => c.passed);
            result.evaluation = result.pending.length ? 'partial' : fingerprint && !result.controls.some(c => c.status !== 'inapplicable') ? 'control-not-evaluated' : 'evaluated';
            pending.push(...result.pending.map(p => ({ family: family.id, origin: candidate.origin, ...p })));
            save(join(output, `${family.id}-${prefix}witness.recipe.json`), best);
            familyResult.candidates.push(result);
            if (candidate.origin === 'base' || !familyResult.minimized) {
                familyResult.minimized = result.minimized;
                familyResult.reductions = result.reductions; familyResult.controls = result.controls;
                familyResult.hasPassingControl = result.hasPassingControl;
            }
            if (fingerprint) {
                const groupKey = observationGroup(family.signals, bestEvidence);
                const group = groups.get(groupKey) ?? { signature: groupKey, members: [], observations: [],
                    automaticClaim: 'candidate shared observation; not proof of one root cause' };
                group.members.push({ family: family.id, origin: candidate.origin, evidenceId: bestEvidence.id,
                    hasPassingControl: result.hasPassingControl, targetObservations: candidate.expectC });
                group.observations.push(...oracles.filter(e => membership.get(e.id) === family.id
                    && divergenceSignature(family.id, e) === fingerprint).map(e => e.id));
                group.observations = [...new Set(group.observations)];
                group.hasPassingControl = group.members.every(m => m.hasPassingControl);
                groups.set(groupKey, group);
            }
        }
        if (!familyResult.minimized) familyResult.minimized = { evidenceId: base.id, confirmedDivergence: false,
            keys: recipe.segments[0].moves.length, recipeSha256: recipeHash(recipe), limit: 'promotion not evaluated' };
    }
    return { families, groups: [...groups.values()], oracles, runs, cacheHits, pending, promoted, budget: plan.maxRuns,
        negativeCache: { version: 1, identity, entries } };
}

export function reproducibility(previous, current) {
    const shape = report => ({ families: report.families.map(f => ({ id: f.id, signature: f.signature,
        minimized: f.minimized, controls: f.controls, variants: f.variants,
        candidates: f.candidates?.map(c => ({ ...c, reductions: c.reductions.map(({ cacheHit: _cacheHit, ...r }) => r) })),
        reductions: f.reductions.map(({ cacheHit: _cacheHit, ...decision }) => decision) })),
        oracles: report.oracles.map(o => ({ id: o.id, status: o.status, error: o.error ?? o.result?.error ?? null,
            observations: o.observations, result: o.result })) });
    return { comparable: previous.identity === current.identity,
        same: previous.identity === current.identity && isDeepStrictEqual(shape(previous), shape(current)),
        compared: 'source/oracle identity, all oracle outcomes/observations/comparisons, variants, reductions, witnesses and controls; excludes timings/cache metadata' };
}

export async function runPipeline(plan, output, { root = PROJECT_ROOT, cachePath = null, comparePath = null } = {}) {
    validatePlan(plan);
    if (resolve(root) !== PROJECT_ROOT) throw new Error('alternate root is unsupported by the shared differential executor');
    if (existsSync(output) || existsSync(`${output}.tar.gz`)) throw new Error('output/archive exists; choose a new destination');
    mkdirSync(output, { recursive: true });
    const start = performance.now(), startedAt = new Date().toISOString();
    save(join(output, 'plan.json'), plan);
    const leads = scan({ root, files: plan.files ?? DEFAULT_FILES,
        cache: plan.reviewCache ? readJson(join(root, plan.reviewCache)) : {},
        queue: plan.queue ? readJson(join(root, plan.queue)) : null });
    save(join(output, 'leads.json'), leads);
    let availableSignals = new Set(leads.signals.filter(s => s.review?.verdict !== 'false-positive').map(s => s.id));
    if (plan.audit) {
        const backlog = readJson(resolve(root, plan.audit.backlog));
        const mappings = plan.audit.mappings ? readJson(resolve(root, plan.audit.mappings)) : {};
        if (backlog.sourceHash !== auditIdentity({ root, mappings })) throw new Error('stale source-audit backlog');
        const selected = backlog.entries.filter(e => e.observed && !['alternate-implementation', 'unreachable', 'already-fixed'].includes(e.classification));
        availableSignals = new Set([...availableSignals, ...selected.map(e => e.id)]);
        save(join(output, 'audit-selection.json'), { sourceHash: backlog.sourceHash,
            backlogSha256: hash(readFileSync(resolve(root, plan.audit.backlog))),
            entries: selected.filter(e => plan.families.some(f => f.signals.includes(e.id))) });
    }
    const environment = diagnosticEnvironment();
    const provenance = executionContext(root, environment);
    if (provenance.sourceHash !== leads.sourceHash || provenance.baseCommit !== leads.commit)
        throw new Error('source changed during scan; refusing inconsistent context');
    const identity = hash(JSON.stringify(provenance));
    save(join(output, 'provenance.json'), provenance);
    const negativeCache = cachePath ? readJson(cachePath) : {};
    const result = await runFamilies(plan, { root, output, identity, negativeCache,
        evaluate: (entry, directory) => evaluateCase(entry, directory, undefined, environment),
        availableSignals });
    assertExecutionContext(provenance, root);
    save(join(output, 'negative-cache.json'), result.negativeCache);
    const { negativeCache: _cache, ...run } = result;
    const summary = { version: 1, identity, startedAt, ...run, wallMs: performance.now() - start,
        freshStatusCounts: run.oracles.filter(e => !e.cacheHit).reduce((counts, e) => ({ ...counts, [e.status]: (counts[e.status] ?? 0) + 1 }), {}),
        automationBoundary: { automated: ['inventory/ranking', 'declared input mutations', 'C/JS validation and setup gates',
            'conservative first-divergence grouping', 'bounded oracle-checked reductions', 'source-keyed negative cache', 'artifact manifest/archive'],
        assisted: ['source/guard/rename review', 'choosing a useful supported-input prefix', 'declaring target observations and safe reductions',
            'root-cause attribution', 'live assignment/repair clearance'] } };
    if (comparePath) summary.reproducibility = reproducibility(readJson(comparePath), summary);
    save(join(output, 'summary.json'), summary);
    save(join(output, 'artifacts.json'), artifactManifest(output));
    execFileSync('tar', ['-czf', `${output}.tar.gz`, '-C', dirname(output), basename(output)]);
    console.log(JSON.stringify({ output, archive: `${output}.tar.gz`, runs: summary.runs, cacheHits: summary.cacheHits,
        distinctSignatures: summary.groups.length, promoted: summary.promoted, pending: summary.pending.length,
        minimized: summary.families.map(f => ({ id: f.id, keys: f.minimized.keys })),
        wallMs: summary.wallMs, reproducibility: summary.reproducibility }));
    return summary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [planPath, output, ...rest] = process.argv.slice(2);
    if (planPath === '--help') console.log('node scripts/run-structural-pipeline.mjs <plan.json> <new-output-directory> [--cache previous/negative-cache.json] [--compare previous/summary.json]');
    else {
        const options = {};
        if (!planPath || !output || rest.length % 2) throw new Error('use --help');
        for (let i = 0; i < rest.length; i += 2) {
            if (!['--cache', '--compare'].includes(rest[i])) throw new Error('unknown option');
            options[rest[i] === '--cache' ? 'cachePath' : 'comparePath'] = resolve(rest[i + 1]);
        }
        runPipeline(readJson(resolve(planPath)), resolve(output), options).catch(error => {
            console.error(error.stack); process.exitCode = 2;
        });
    }
}
