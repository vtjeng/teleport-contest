// Deliberately narrow, opt-in completion policy for ONE future C action.
// A matching screen is evidence for a task's reviewed source predicate, not a
// generic declaration that a NetHack input marker means command readiness.
import {createHash} from 'node:crypto';

export const digest = value => createHash('sha256').update(value).digest('hex');
const requirePlan = (ok, message) => { if (!ok) throw new Error(`prompt plan: ${message}`); };
const kinds = new Set(['more', 'scroll-call', 'normal']);
function frame(value) {
    requirePlan(value && typeof value.screen === 'string' && value.screen.length <= 100000,
        'predicate needs an exact serialized screen');
    requirePlan(Array.isArray(value.cursor) && value.cursor.length === 3
        && value.cursor.every(Number.isInteger) && value.cursor[0] >= 0
        && value.cursor[1] >= 0 && value.cursor[2] === 1, 'predicate needs an exact cursor');
}
const matches = (predicate, actual) => predicate.screen === actual.screen
    && predicate.cursor.every((n, i) => n === actual.cursor[i]);

export function validatePromptPlan(input) {
    // Copy once: neither the caller nor an edited policy file can hot reload.
    const plan = structuredClone(input);
    requirePlan(plan?.schemaVersion === 1, 'unsupported schema');
    requirePlan(typeof plan.normalBoundaryProof === 'string' && plan.normalBoundaryProof.trim(),
        'positive source-specific normal-boundary proof required');
    requirePlan(Array.isArray(plan.sources) && plan.sources.length > 0, 'source bindings required');
    for (const source of plan.sources) {
        requirePlan(typeof source.path === 'string'
            && /^nethack-c\/(upstream|patches)\//u.test(source.path)
            && !source.path.split('/').includes('..')
            && /^[a-f0-9]{64}$/u.test(source.sha256)
            && typeof source.reason === 'string' && source.reason.trim(), 'invalid source binding');
    }
    for (const [key, max] of Object.entries({maxKeys: 64, maxFrames: 128, maxMs: 1200000})) {
        requirePlan(Number.isInteger(plan[key]) && plan[key] > 0 && plan[key] <= max,
            `${key} must be 1..${max}`);
    }
    requirePlan(Array.isArray(plan.targets) && plan.targets.length > 0, 'target predicates required');
    requirePlan(Array.isArray(plan.observers) && plan.observers.length > 0, 'observer predicates required');
    for (const predicate of [...plan.targets, ...plan.observers]) frame(predicate);
    requirePlan(Array.isArray(plan.rules) && plan.rules.length > 0 && plan.rules.length <= 64,
        'finite rules required');
    const ids = new Set();
    for (const rule of plan.rules) {
        requirePlan(typeof rule.id === 'string' && rule.id && !ids.has(rule.id), 'unique rule id required');
        ids.add(rule.id);
        requirePlan(kinds.has(rule.kind), 'only More, scroll-call and normal rules allowed');
        requirePlan(typeof rule.proof === 'string' && rule.proof.trim(), 'rule source proof required');
        frame(rule.match);
        if (rule.kind === 'more') requirePlan(rule.match.screen.includes('--More--'), 'More marker required');
        if (rule.kind === 'scroll-call') requirePlan(/^Call a scroll[^\n]*:/u.test(rule.match.screen),
            'exact optional scroll-call screen required');
        if (rule.kind === 'normal') requirePlan(!rule.match.screen.includes('--More--')
            && !/^Call a scroll/u.test(rule.match.screen), 'normal predicate is a known prompt');
    }
    return plan;
}

export function createPromptController(input, startedAt = Date.now()) {
    const plan = validatePromptPlan(input);
    let state = 'completion', targetSeen = false, keys = 0, frames = 0, stopped = null;
    const decisions = [];
    const stop = reason => { stopped = reason; return {stop: reason}; };
    return {
        plan,
        decisions,
        get status() { return stopped || state; },
        decide(actual, now = Date.now()) {
            requirePlan(!stopped, 'controller already stopped');
            const entry = {frameIndex: actual.frameIndex, frame: structuredClone(actual),
                state, targetSeen, matchedRules: [], key: null, sent: false};
            decisions.push(entry);
            const finish = reason => { entry.stop = reason; return stop(reason); };
            if (now - startedAt >= plan.maxMs) return finish('time-cap');
            if (++frames > plan.maxFrames) return finish('frame-cap');
            targetSeen ||= plan.targets.some(p => matches(p, actual));
            entry.targetSeen = targetSeen;
            const rules = plan.rules.filter(r => matches(r.match, actual));
            entry.matchedRules = rules.map(r => r.id);
            const observed = plan.observers.some(p => matches(p, actual));
            if (rules.length > 1 || (observed && rules.length)) return finish('ambiguous-boundary');
            if (observed) return finish(state === 'observer' && targetSeen ? 'success' : 'unexpected-observer');
            if (rules.length !== 1) return finish('unknown-boundary');
            const rule = rules[0];
            if (rule.kind === 'normal' && (state !== 'completion' || !targetSeen))
                return finish('normal-before-target-or-repeated-observer');
            if (state === 'observer' && rule.kind !== 'more') return finish('unexpected-observer-prompt');
            if (keys >= plan.maxKeys) return finish('key-cap');
            const key = rule.kind === 'more' ? ' ' : rule.kind === 'scroll-call' ? '\x1b' : 'i';
            if (rule.kind === 'normal') state = 'observer';
            ++keys;
            entry.key = key;
            return {key, entry};
        },
    };
}
