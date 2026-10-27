import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import test from 'node:test';
import {
    classifyResults,
    compilerProbe,
    createReport,
    excludedLeadScope,
    isBoundedIntegerExpression,
    makeFingerprint,
    numericExports,
    ownershipIndex,
    parseObjectLikeDefines,
    parseProbeOutput,
} from './discover-constants.mjs';

test('macro dump retains simple, expression, alias, and hexadecimal forms', () => {
    const macros = parseObjectLikeDefines([
        '# 21 "include/consts.h"',
        '#define SIMPLE 17',
        '#define HEX_MASK 0x1fU',
        '#define COMBINED (SIMPLE | HEX_MASK)',
        '#define ALIAS COMBINED',
        '#define FUNC(x) ((x) + 1)',
    ].join('\n'));
    assert.deepEqual([...macros.keys()], [
        'SIMPLE', 'HEX_MASK', 'COMBINED', 'ALIAS',
    ]);
    assert.equal(macros.get('ALIAS').expression, 'COMBINED');
    assert.equal(macros.get('HEX_MASK').source, 'include/consts.h');
    assert.equal(isBoundedIntegerExpression(macros.get('COMBINED').expression), true);
    assert.equal(isBoundedIntegerExpression(macros.get('ALIAS').expression), true);
});

test('only preprocessor-emitted conditional branch definitions are observed', () => {
    const activeOutput = [
        '# 1 "include/feature.h"',
        '#define FEATURE_MASK (1U << 5)',
    ].join('\n');
    const macros = parseObjectLikeDefines(activeOutput);
    assert.equal(macros.get('FEATURE_MASK').expression, '(1U << 5)');
    assert.equal(macros.has('FEATURE_MASK_OLD'), false);
    assert.equal(parseObjectLikeDefines([
        '# 1 "include/feature.h"', '#define REMOVED 1', '#undef REMOVED',
    ].join('\n')).has('REMOVED'), false);
});

test('expression eligibility is a token filter, never a value evaluator', () => {
    for (const expression of ['7', '0x1fU', '(BASE + 4)', '1UL << 40',
        '(A | B)']) {
        assert.equal(isBoundedIntegerExpression(expression), true, expression);
    }
    for (const expression of ['"text"', 'NULL + 1;', 'A ## B', '']) {
        assert.equal(isBoundedIntegerExpression(expression), false, expression);
    }
});

test('compiler output parser retains signedness and width for values', () => {
    const values = parseProbeOutput([
        'NEG\t32\tsigned\t-1\t4294967295',
        'WIDE\t64\tunsigned\t4294967295\t4294967295',
    ].join('\n'));
    assert.deepEqual(values.get('NEG'), {
        value: -1, bits: 32, sign: 'signed',
    });
    assert.deepEqual(values.get('WIDE'), {
        value: 4294967295, bits: 64, sign: 'unsigned',
    });
});

test('numeric exports are sorted safe integers only', () => {
    assert.deepEqual([...numericExports({ ZED: 3, ALIAS: 3, TEXT: '3',
        UNSAFE: Number.MAX_SAFE_INTEGER + 1, helper: 1 })], [
        ['ALIAS', 3], ['ZED', 3],
    ]);
});

test('ownership reuses the registered EXACT_NAME repair identity', () => {
    const index = ownershipIndex([{
        id: 'exact-name-mask',
        evidence: { source: [
            'nethack-c/upstream/include/hack.h:EXACT_NAME',
            'js/const.js:EXACT_NAME',
        ] },
    }]);
    assert.equal(index.get('include/hack.h|EXACT_NAME'), 'exact-name-mask');
    assert.equal(index.has('include/hack.h|OTHER'), false);
});

test('EXACT_NAME old and new macro forms remain regression fixtures only', () => {
    const oldForm = parseObjectLikeDefines([
        '# 80 "include/hack.h"', '#define EXACT_NAME 0x27',
    ].join('\n'));
    const newForm = parseObjectLikeDefines([
        '# 80 "include/hack.h"', '#define EXACT_NAME 0x1fU',
    ].join('\n'));
    assert.equal(oldForm.get('EXACT_NAME').expression, '0x27');
    assert.equal(newForm.get('EXACT_NAME').expression, '0x1fU');
    assert.deepEqual([...ownershipIndex([{
        id: 'exact-name-mask', evidence: { source: [
            'nethack-c/upstream/include/hack.h:EXACT_NAME',
            'js/const.js:EXACT_NAME',
        ] },
    }])], [['include/hack.h|EXACT_NAME', 'exact-name-mask']]);
});

test('fingerprints use C path, macro and JS export identities', () => {
    const first = makeFingerprint({ cPath: 'include/hack.h', name: 'EXACT_NAME' });
    const repeat = makeFingerprint({ cPath: 'include/hack.h', name: 'EXACT_NAME' });
    const changed = makeFingerprint({ cPath: 'include/obj.h', name: 'EXACT_NAME' });
    assert.deepEqual(first, repeat);
    assert.notEqual(first.sha256, changed.sha256);
});

test('fresh candidate order is stable regardless of discovery order', () => {
    const alpha = { cPath: 'include/a.h', cSymbol: 'ALPHA',
        fingerprint: makeFingerprint({ cPath: 'include/a.h', name: 'ALPHA' }) };
    const zeta = { cPath: 'include/z.h', cSymbol: 'ZETA',
        fingerprint: makeFingerprint({ cPath: 'include/z.h', name: 'ZETA' }) };
    const first = classifyResults({ candidates: [zeta, alpha] }).candidates;
    const second = classifyResults({ candidates: [alpha, zeta] }).candidates;
    assert.deepEqual(first.map(({ fingerprint }) => fingerprint.key),
        second.map(({ fingerprint }) => fingerprint.key));
});

test('current matches are not candidates and suppressed recurrence is re-reviewed', () => {
    const fingerprint = makeFingerprint({ cPath: 'include/hack.h', name: 'EXACT_NAME' });
    const item = { cPath: 'include/hack.h', cSymbol: 'EXACT_NAME',
        jsExport: 'EXACT_NAME', fingerprint, suppressionId: 'exact-name-mask' };
    const first = classifyResults({ candidates: [item], previous: null });
    assert.equal(first.candidates.length, 0);
    assert.equal(first.suppressed[0].suppression.id, 'exact-name-mask');
    const repeat = classifyResults({ candidates: [item], previous: first });
    assert.equal(repeat.suppressed.length, 0);
    assert.equal(repeat.reReview.length, 1);
    assert.match(repeat.reReview[0].reason, /recurr/u);
});

test('explicitly blocked candidate scopes are suppressed in stable order', () => {
    const blocked = {
        cPath: 'include/timer.h', cSymbol: 'CORPSE_TIMER',
        fingerprint: makeFingerprint({ cPath: 'include/timer.h', name: 'CORPSE_TIMER' }),
        suppressionScope: 'explicitly blocked timer/corpse lead',
    };
    const visible = {
        cPath: 'include/example.h', cSymbol: 'FRESH',
        fingerprint: makeFingerprint({ cPath: 'include/example.h', name: 'FRESH' }),
    };
    const result = classifyResults({ candidates: [blocked, visible], previous: null });
    assert.equal(result.suppressed.length, 1);
    assert.equal(result.suppressed[0].suppression.scope,
        'explicitly blocked timer/corpse lead');
    assert.equal(result.candidates[0].cSymbol, 'FRESH');
});

test('named blocked lead classes stay outside the candidate queue', () => {
    assert.equal(excludedLeadScope('GLOB_SHRINK', 'include/obj.h'),
        'security-blocked unpaid glob');
    assert.equal(excludedLeadScope('FIGURINE_WAIT', 'include/timeout.h'),
        'figurine planning');
    assert.equal(excludedLeadScope('BURIED_ZOMBIE', 'include/monst.h'),
        'buried zombie');
    assert.equal(excludedLeadScope('CORPSE_TIMER', 'include/timeout.h'),
        'explicitly blocked timer/corpse lead');
    assert.equal(excludedLeadScope('SAFE_CONSTANT', 'include/global.h'), null);
});

test('missing pinned compiler fails closed before creating scan shims', () => {
    const result = compilerProbe('teleport-no-such-clang');
    assert.deepEqual(result, { available: false, error: 'ENOENT' });
});

test('report records compiler blocker and creates no temporary headers', async () => {
    const before = readdirSync(tmpdir()).filter((name) =>
        name.startsWith('teleport-constant-scan-')).sort();
    const report = await createReport({ compiler: 'teleport-no-such-clang' });
    const repeat = await createReport({ compiler: 'teleport-no-such-clang' });
    const after = readdirSync(tmpdir()).filter((name) =>
        name.startsWith('teleport-constant-scan-')).sort();
    assert.equal(report.status, 'blocked');
    assert.deepEqual(repeat, report);
    assert.equal(report.blocked[0].kind, 'pinned-compiler-unavailable');
    assert.deepEqual(report.skipped, [{
        scope: 'all numeric js/const.js exports',
        count: report.jsNumericExportCount,
        reason: 'C object-like macro values could not be compiled without pinned clang',
    }]);
    assert.deepEqual(after, before);
});
