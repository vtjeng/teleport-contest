// Main's explicit source-parity review is an attestation, not gameplay or
// source-completion evidence. Keep its exact scope and original identities.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';

export const SOURCE_PARITY_BASIS = 'source-parity-runtime-pending';
const ensure = (value, reason) => assert.ok(value, `source parity: ${reason}`);
const text = value => typeof value === 'string' && value.trim().length > 0;
const sha = value => /^[a-f0-9]{40}$/u.test(value ?? '');
const strings = value => Array.isArray(value) && value.length > 0
    && value.every(text) && new Set(value).size === value.length;
const jsPath = value => /^js\/[A-Za-z0-9_/-]+\.js$/u.test(value ?? '') && !value.includes('..');
const testPath = value => /^scripts\/[A-Za-z0-9_-]+\.test\.mjs$/u.test(value ?? '');
const unit = value => /^[A-Za-z0-9_-]+\.c:[A-Za-z_][A-Za-z0-9_]*$/u.test(value ?? '');
export const sourceParityDigest = review => createHash('sha256').update(JSON.stringify(review)).digest('hex');

export function validateSourceParity(parity) {
    ensure(parity && parity.version === 1 && text(parity.id) && sha(parity.assignmentBase)
        && parity.evidenceBasis === SOURCE_PARITY_BASIS, 'needs version, identity, base and runtime-pending basis');
    const review = parity.review;
    ensure(review && sha(review.reviewedBase) && text(review.authorization)
        && text(review.expectedBehavior) && text(review.currentBehavior), 'needs explicit authorization and C/JS behavior');
    ensure(strings(review.units) && review.units.every(unit), 'needs exact C source units');
    ensure(strings(review.allowedPaths) && review.allowedPaths.includes('.cache/')
        && review.allowedPaths.every(path => path === '.cache/' || jsPath(path) || testPath(path)), 'invalid frozen write scope');
    ensure(strings(review.regressionTests) && review.regressionTests.every(path => testPath(path)
        && review.allowedPaths.includes(path)), 'needs scoped focused regression tests');
    ensure(Array.isArray(review.callers) && review.callers.length > 0
        && review.callers.every(caller => jsPath(caller?.path)
            && /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(caller.symbol ?? '') && text(caller.source)), 'needs production caller/source traces');
    ensure(Array.isArray(review.pins) && review.pins.length > 0
        && new Set(review.pins.map(pin => pin.path)).size === review.pins.length
        && review.pins.every(pin => sha(pin?.object) && (pin.path === 'nethack-c/upstream'
            || jsPath(pin.path) || testPath(pin.path))), 'needs unique Git C/JS/test pins');
    const pinned = new Set(review.pins.map(pin => pin.path));
    ensure(pinned.has('nethack-c/upstream')
        && review.allowedPaths.filter(path => path !== '.cache/').every(path => pinned.has(path))
        && review.callers.every(caller => pinned.has(caller.path)), 'source, caller and regression identities must be pinned');
    ensure(parity.reviewSha256 === sourceParityDigest(review), 'review digest differs');
    return parity;
}

export function sourceParityScope(parity, paths, reservations) {
    const review = validateSourceParity(parity).review;
    ensure(isDeepStrictEqual([...paths].sort(), [...review.allowedPaths].sort())
        && isDeepStrictEqual([...reservations].sort(), review.units.map(name => `source:${name}`).sort()),
    'scope is frozen; stop and re-review rather than expand');
}

export function validateSourceParityTask(task) {
    const parity = validateSourceParity(task.sourceParity);
    ensure(!task.sourceTrial && task.output === 'implementation' && task.producer === 'Main'
        && task.recipient === 'Main' && task.sessions.length === 0 && task.batch === undefined
        && task.goal === parity.id && (task.type === 'rework' || task.id === parity.id)
        && (task.type === 'rework' ? task.base === task.target : task.base === parity.assignmentBase),
    'needs a separate sessionless Main implementation with its reviewed identity/base');
    sourceParityScope(parity, task.allowedPaths, task.reservations);
    ensure(task.checks.includes('focused') && task.checks.includes('lint'), 'needs focused and lint checks');
}

export function verifySourceParityBase(root, parity) {
    const review = validateSourceParity(parity).review;
    for (const base of new Set([review.reviewedBase, parity.assignmentBase])) {
        for (const pin of review.pins) {
            const result = execFileSync('git', ['-C', root, 'ls-tree', base, '--', pin.path], {encoding: 'utf8'}).trim();
            const expected = `${pin.path === 'nethack-c/upstream' ? '160000 commit' : '100644 blob'} ${pin.object}\t${pin.path}`;
            ensure(result === expected, `reviewed identity changed: ${pin.path}; stop and re-review`);
        }
    }
}

export function validateSourceParityGoal(goal) {
    const parity = validateSourceParity(goal.sourceParity);
    const units = [...(goal.functions ?? []).map(entry => `${goal.cFile}:${entry.name}`),
        ...(goal.requiredFunctions ?? []).map(entry => `${entry.sourceFile}:${entry.name}`)];
    ensure(goal.id === parity.id && goal.kind === 'file-port' && !goal.session && !(goal.sessions ?? []).length
        && isDeepStrictEqual(units.sort(), [...parity.review.units].sort()), 'goal differs from reviewed source units/identity');
}

export function validateSourceParityClaims(goal, evidence) {
    validateSourceParityGoal(goal);
    const {review} = goal.sourceParity;
    ensure(evidence.evidenceBasis === SOURCE_PARITY_BASIS, 'must retain runtime-pending evidence basis');
    const units = evidence.functions.map(entry => `${entry.sourceFile ?? goal.cFile}:${entry.name}`);
    ensure(isDeepStrictEqual(units.sort(), [...review.units].sort()), 'claims must cover exactly the reviewed units');
    ensure(evidence.functions.every(entry => !entry.pure && !entry.inactiveReason
        && review.allowedPaths.includes(entry.implementation)
        && review.regressionTests.every(path => entry.tests?.includes(path))), 'needs impure scoped implementation and regression claims');
    ensure(review.callers.every(caller => evidence.functions.some(entry => entry.callers?.some(found =>
        isDeepStrictEqual(found, caller)))), 'claims must retain reviewed production callers');
    const reached = new Set((evidence.entryPoints ?? []).flatMap(entry => entry.functions)
        .map(value => typeof value === 'string' ? `${goal.cFile}:${value}` : `${value.sourceFile}:${value.name}`));
    ensure(review.units.every(value => reached.has(value)), 'needs production entry-point coverage for reviewed units');
    const before = evidence.regression?.before, after = evidence.regression?.after;
    ensure(before?.base === goal.sourceParity.assignmentBase && Number.isInteger(before.exitCode)
        && before.exitCode > 0 && before.exitCode < 128 && text(before.output)
        && Array.isArray(before.command) && before.command.every(text)
        && review.regressionTests.every(path => before.command.includes(path)), 'needs original-source failing focused regression receipt');
    ensure(after?.exitCode === 0 && text(after.output)
        && isDeepStrictEqual(after.command, before.command), 'needs the same focused regression passing after the fix');
}
