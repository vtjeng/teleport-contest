import assert from 'node:assert/strict';
import test from 'node:test';
import { cUnits, jsUnits } from './structural-signals.mjs';
import { extractMessages, inactiveLiteralIfZeroLines, missingMessageCandidates, longestFixed, decodeCString, messageMatch, resolveC, mergeBacklog, applyDecisions } from './source-audit.mjs';

test('literal threshold applies to full string, longest fragment may be shorter than fourteen', () => {
    const source = 'void\nf(void) { You("brief %s fragment"); }';
    const result = extractMessages(source, 'a.c', cUnits(source, 'a.c'));
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].fragment, 'fragment');
});
test('multiline, concatenated, conditional and format-argument literals are enumerated by print site', () => {
    const source = 'void\nf(void) {\npline_mon(mon, "a sufficiently "\n"long message %s", name);\npline(flag ? "conditional message one" : "conditional message two");\npline("%s", "a fixed literal argument");\npline(buffer);\n}';
    const result = extractMessages(source, 'a.c', cUnits(source, 'a.c'));
    assert.equal(result.messages.length, 4);
    assert.equal(result.messages[0].literal, 'a sufficiently long message %s');
    assert.equal(result.messages[0].callLine, 3);
    assert.equal(result.calls.at(-1).status, 'variable-or-centralized-format');
});
test('fixed fragment handles percent literal, positional fields and width/precision', () => {
    assert.equal(longestFixed('Progress 100%% stable %2$*3$.*4$f tail'), 'Progress 100% stable');
    assert.equal(decodeCString('"hex\\x41 octal\\101 newline\\n"'), 'hexA octalA newline\n');
});
test('literal #if 0 filters only its dead arm and keeps live alternatives', () => {
    const source = [
        'void f(void) {',
        '#if 0',
        'pline("dead message with enough text");',
        '#else',
        'pline("live message with enough text");',
        '#endif',
        'pline("ordinary message with enough text");',
        '}',
    ].join('\n');
    const messages = extractMessages(source, 'a.c', cUnits(source, 'a.c')).messages;
    assert.equal(messages.length, 3, 'raw observations remain available');
    const inactive = inactiveLiteralIfZeroLines(source);
    assert.deepEqual(messages.map(m => inactive.has(m.callLine)),
        [true, false, false]);
    assert.deepEqual(missingMessageCandidates(messages.map(m => ({ ...m,
        status: 'absent', sourceFilter: inactive.has(m.callLine) ? 'literal-if-zero' : null }))).map(m => m.literal), [
        'live message with enough text',
        'ordinary message with enough text',
    ]);
});
test('nested alternatives, comments, continuations and malformed guards are conservative', () => {
    const source = [
        'void f(void) {',
        '#if 0',
        '#if FEATURE',
        'pline("dead nested message long enough");',
        '#else',
        'pline("dead nested alternative message");',
        '#endif',
        '#elif FEATURE',
        'pline("live elif message long enough");',
        '#else',
        'pline("live else message long enough");',
        '#endif',
        '/*',
        '#if 0',
        '*/',
        'pline("live after commented directive");',
        '#ifdef UNKNOWN_PROFILE',
        'pline("unknown profile message long enough");',
        '#endif',
        '}',
    ].join('\n');
    const messages = extractMessages(source, 'a.c', cUnits(source, 'a.c')).messages;
    const inactive = inactiveLiteralIfZeroLines(source);
    assert.deepEqual(messages.map(m => inactive.has(m.callLine)),
        [true, true, false, false, false, false]);
    assert.equal(inactiveLiteralIfZeroLines('void f(void) {\n#if 0 \\\npline("not proven inactive");\n#endif\n}').size, 0);
    assert.equal(inactiveLiteralIfZeroLines('void f(void) {\n#if 0\npline("unclosed guard");\n}').size, 0);
    assert.equal(inactiveLiteralIfZeroLines('void f(void) {\n#if (0)\npline("unsupported spelling");\n#endif\n}').size, 0);
    assert.equal(inactiveLiteralIfZeroLines('void f(void) {\n#if 0 /* comment */\npline("unsupported tail");\n#endif\n}').size, 0);
    assert.equal(inactiveLiteralIfZeroLines('void f(void) {\n#endif\n#if 0\npline("malformed nesting");\n#endif\n}').size, 0);
    assert.equal(inactiveLiteralIfZeroLines('void f(void) {\n#if 0\npline("bad end");\n#endif garbage\n}').size, 0);
    assert.equal(inactiveLiteralIfZeroLines('void f(void) {\n#if 0\npline("dead with documented end");\n#endif /* guard */\n}').has(3), true);
});
test('raw source comment hits do not erase absent executable literals', () => {
    const source = '// the missing gameplay message\nexport function f() { return "something else"; }';
    const parsed = jsUnits(source, '/js/a.js');
    assert.deepEqual(messageMatch({ fragment: 'the missing gameplay message' }, source, parsed.strings),
        { status: 'raw-only-hit', raw: true, decoded: false });
    const concat = jsUnits('const msg = "the missing " + "gameplay message";', '/js/b.js');
    assert.equal(messageMatch({ fragment: 'the missing gameplay message' }, '', concat.strings).status, 'decoded-literal-hit');
});
test('named arrow helpers are indexed and preserve lexical calls', () => {
    const parsed = jsUnits('export const helper = async (x) => { await actual(x); };', '/js/a.js');
    assert.equal(parsed.units[0].name, 'helper');
    assert.equal(parsed.units[0].calls[0].name, 'actual');
});
test('C static function identities resolve locally and preserve ambiguity', () => {
    const a = { name: 'helper', path: '/src/a.c' }, b = { name: 'helper', path: '/src/b.c' };
    const index = new Map([['helper', [a, b]]]);
    assert.equal(resolveC({ path: a.path }, 'helper', index), a);
    assert.equal(resolveC({ path: '/src/c.c' }, 'helper', index), null);
});
test('excluded symbol messages are not emitted, even though ownership is known', () => {
    const source = 'void\nnewsym(void) { pline("excluded diagnostic example"); }';
    assert.equal(extractMessages(source, 'a.c', cUnits(source, 'a.c')).messages.length, 0);
});
test('backlog preserves stale reviews and never calls a disappeared warning fixed', () => {
    const items = [{ id: 'edge:a', sites: [{ line: 2 }], details: {} }];
    const first = mergeBacklog(items, 'source1');
    const reviewed = applyDecisions(first, [{ id: 'edge:a', evidenceKey: first.entries[0].evidenceKey,
        classification: 'alternate-implementation', rationale: 'inline equivalent reviewed', sourceRefs: ['js/a.js:2'] }]);
    assert.equal(mergeBacklog(items, 'source1', reviewed).entries[0].classification, 'alternate-implementation');
    const changed = mergeBacklog(items, 'source2', reviewed).entries[0];
    assert.equal(changed.classification, 'needs-investigation');
    assert.equal(changed.reviewState, 'stale-source-or-tool-change');
    const gone = mergeBacklog([], 'source1', reviewed).entries[0];
    assert.equal(gone.observed, false);
    assert.equal(gone.classification, 'needs-investigation');
});
test('semantic source confirmation is separate from replay verification and requires both source sides', () => {
    const backlog = mergeBacklog([{ id: 'gap', sites: [], details: {} }], 'source');
    const decision = { id: 'gap', evidenceKey: backlog.entries[0].evidenceKey, classification: 'confirmed-missing-behavior',
        rationale: 'C mutation is explicitly omitted at JS stub', sourceRefs: ['nethack-c/upstream/src/a.c:4', 'js/a.js:8'] };
    assert.equal(applyDecisions(backlog, [decision]).entries[0].replayStatus, 'unverified');
    assert.throws(() => applyDecisions(backlog, [{ ...decision, evidenceKey: 'stale' }]), /stale/u);
    assert.throws(() => applyDecisions(backlog, [{ ...decision, replay: { status: 'verified' } }]), /recipe/u);
});

test('nested helpers and parameter shadows do not invent module-global edges', async () => {
    const { resolveCall } = await import('./structural-signals.mjs');
    const path = '/js/a.js';
    const parsed = jsUnits('function outer(){const hidden=()=>target(); hidden();} function caller(target){hidden();target();} function target(){}', path);
    const modules = new Map([[path, parsed]]);
    const outer = parsed.units.find(u => u.name === 'outer'), caller = parsed.units.find(u => u.name === 'caller');
    const resolve = (u, name) => resolveCall(path, name, modules, new Set(), u.imports, u, u.calls.find(c => c.name === name).offset);
    assert.equal(resolve(outer, 'hidden').name, 'hidden');
    assert.equal(resolve(caller, 'hidden'), null);
    assert.equal(resolve(caller, 'target'), null);
    assert.equal(resolveCall(path, 'hidden', modules), null);
});

test('aligned edges preserve file identity and explicit callee mappings', async () => {
    const { alignedHits } = await import('./source-audit.mjs');
    const expected = { path: '/js/a.js', name: 'helper', startOffset: 1 };
    const wrong = { path: '/js/b.js', name: 'helper', startOffset: 1 };
    assert.equal(alignedHits({}, { found: [{ target: wrong }] }, () => expected).length, 0);
    const renamed = { path: '/js/b.js', name: 'renamed', startOffset: 20 };
    assert.equal(alignedHits({}, { found: [{ target: renamed }] }, () => renamed).length, 1);
});

test('whitespace padding cannot hide the longest meaningful fragment', () => {
    assert.equal(longestFixed('                              %s actual meaningful text'), 'actual meaningful text');
});

test('explicit aliases and function mappings cannot bypass exclusions', async () => {
    const { validateMappings } = await import('./source-audit.mjs');
    assert.throws(() => validateMappings({ functions: { 'src/test.c:ok': 'js/example.js:blocked' } }, new Set(['blocked'])), /excluded/u);
    assert.throws(() => validateMappings({ renames: { safe: 'blocked' } }, new Set(['blocked'])), /excluded/u);
});
