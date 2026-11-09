// Enforces the rule scripts/front-pushed-lists.mjs describes: every port of a
// C function that pushes a record onto the front of a list builds the list
// the same way, by linking onto the front of a chain or through
// js/hacklib.js push_front(), and js/ adds to the front of an array nowhere
// else. The first tests scan the repository; the others pin what the scan
// finds on hand-written and altered sources.

import assert from 'node:assert/strict';
import test from 'node:test';

import { assertExceptionCount } from './exception-count.mjs';
import {
    FRONT_PUSH_EXCEPTIONS,
    PORT_NAMES,
    buildsFrontPushed,
    cFrontPushSites,
    frontPushFindings,
    portSources,
    unshiftFindings,
} from './front-pushed-lists.mjs';
import { push_front } from '../js/hacklib.js';

const sites = cFrontPushSites();
const cFunctions = [...new Set(sites.map(({ func }) => func))];
const sources = portSources();

// Replaces the one occurrence of `from` in js/`file`, failing if there is not
// exactly one, so an edit to the real source cannot leave a test vacuous.
function altered(file, from, to) {
    const parts = sources[file].split(from);
    assert.equal(parts.length, 2, `${file} holds ${parts.length - 1} copies of ${from}`);
    return { ...sources, [file]: parts.join(to) };
}

test('the C scan finds every front push the pinned source has', () => {
    // 78 sites in 66 functions in the pinned nethack-c/upstream (8 November
    // 2026). A different count means the scan or the C source changed, and
    // the list of functions it checks has to be looked at again.
    assert.equal(sites.length, 78);
    assert.equal(cFunctions.length, 66);
    // Sites this rule was written for: read.c set_lit()'s gremlins, getlev()'s
    // trap loop, mkobj.c place_object()'s floor chains and makemon().
    for (const func of ['set_lit', 'getlev', 'place_object', 'makemon'])
        assert.ok(cFunctions.includes(func), func);
});

test('the scan fails, not skips, without the C source', () => {
    assert.throws(() => cFrontPushSites('/nonexistent'), /no C source/u);
});

test('every port of a C front push pushes onto the front of its list', () => {
    assert.deepEqual(frontPushFindings(cFunctions, sources), []);
});

test('js/ adds to the front of an array only through push_front()', () => {
    assert.deepEqual(unshiftFindings(sources), []);
});

test('the exceptions are pinned and each names a function the scan finds', () => {
    for (const name of [...Object.keys(FRONT_PUSH_EXCEPTIONS), ...Object.keys(PORT_NAMES)])
        assert.ok(cFunctions.includes(name), `${name} is not a C front push`);
    for (const exception of Object.values(FRONT_PUSH_EXCEPTIONS))
        assert.ok(exception.reason || Object.values(exception.ports ?? {}).every(Boolean));
    // 17 C functions: 8 with no port, 7 whose port keeps C's order some
    // other way, and relmon() and find_lev_obj(), each excepted in one of its
    // two port files only. Each has its reason in
    // scripts/front-pushed-lists.mjs.
    assertExceptionCount(Object.keys(FRONT_PUSH_EXCEPTIONS).length, 17, {
        what: 'excepted C functions',
        pin: 'the count in scripts/front-pushed-lists.test.mjs',
    });
});

test('push_front() makes the new item the head', () => {
    // Three pushes, as set_lit() lights three gremlins: the walk meets the
    // last one first.
    const list = [];
    for (const item of ['first', 'second', 'third']) push_front(list, item);
    assert.deepEqual(list, ['third', 'second', 'first']);
});

test('buildsFrontPushed() recognizes each way the port links onto a front', () => {
    // One accepted form per line: a field link, a literal assigned to its own
    // head, a literal later made the head, a head setter, a nullish head, and
    // the array helper.
    for (const body of [
        '{ obj.nobj = state.level.objlist ?? null; state.level.objlist = obj; }',
        '{ result.gp.plinemsg_types = { msgtype, next: result.gp.plinemsg_types }; }',
        '{ const ep = { a: { x, y }, nxt_engr: state.head_engr ?? null }; state.head_engr = ep; }',
        '{ gold.nobj = inventoryHead(state); setInventoryHead(state, gold); }',
        '{ monster.nmon = state.gm?.mydogs ?? null; state.gm.mydogs = monster; }',
        '{ push_front(gremlins, monster); }',
    ]) assert.ok(buildsFrontPushed(body), body);
    // Rejected: an append through a tail pointer, an array append, an unlink
    // that sets the same field, and a record linked but never made a head.
    for (const body of [
        '{ let tail = head; while (tail.nmon) tail = tail.nmon; tail.nmon = monster; }',
        '{ gremlins.push(monster); }',
        '{ if (previous) previous.nmon = mon.nmon; else state.level.monlist = mon.nmon; mon.nmon = null; }',
        '{ obj.nobj = state.level.objlist; }',
    ]) assert.ok(!buildsFrontPushed(body), body);
});

test('the scan finds a port that appends where C pushes onto the front', () => {
    // set_lit() appending its gremlins, as it did before 9e145511.
    assert.deepEqual(frontPushFindings(['set_lit'],
        altered('read.js', 'push_front(gremlins, monster);', 'gremlins.push(monster);')),
    ['read.js set_lit: does not push onto the front of its list as C set_lit() does']);
    // makemon() linking the new monster onto the end of fmon.
    assert.deepEqual(frontPushFindings(['makemon'], altered('makemon_create.js',
        '    monster.nmon = state.level.monlist;\n    state.level.monlist = monster;',
        '    let tail = state.level.monlist;\n    while (tail?.nmon) tail = tail.nmon;\n'
        + '    if (tail) tail.nmon = monster; else state.level.monlist = monster;')),
    ['makemon_create.js makemon: does not push onto the front of its list as C makemon() does']);
    // make_engr_at() leaving the new engraving off the chain.
    assert.deepEqual(frontPushFindings(['make_engr_at'], altered('engrave.js',
        'nxt_engr: state.head_engr ?? null,', 'nxt_engr: null,')),
    ['engrave.js make_engr_at: does not push onto the front of its list as C make_engr_at() does']);
});

test('the scan finds a bare unshift() and a stale exception', () => {
    // The finding names the line; the test drops its number, which moves
    // with every edit above it.
    assert.deepEqual(unshiftFindings(altered('read.js',
        'push_front(gremlins, monster);', 'gremlins.unshift(monster);'))
        .map((finding) => finding.replace(/:\d+:/u, ':')),
    ['read.js: gremlins.unshift(monster);']);
    // A port of an excepted, unported function has to be examined.
    assert.deepEqual(frontPushFindings(['reorder_fruit'],
        { ...sources, 'objnam.js': `${sources['objnam.js']}\nfunction reorder_fruit(forward) {}\n` }),
    ['reorder_fruit: now ported in objnam.js; check its order and remove its exception']);
    // mon.js relmon() pushing onto a list after all.
    assert.deepEqual(frontPushFindings(['relmon'], altered('mon.js',
        '    mon.nmon = null;\n}', '    mon.nmon = state.gm.mydogs;\n    state.gm.mydogs = mon;\n}')),
    ['mon.js relmon: builds its list by pushing onto the front; remove its exception']);
});
