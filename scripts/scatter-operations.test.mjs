// js/explode.js scatter() lets a caller or a test replace its callees only
// through `rawEnv.scatterOps`, whose keys SCATTER_OPERATIONS lists. The rest of
// the environment belongs to the caller's own callees, and scatter() reads only
// the shared `random`, `message` and `hooks` from it. A monster's wand of
// striking once forwarded mthrowu.c's missile operations
// (js/unported_monster_actions.js monsterMissileEnv()) through muse.c mbhit()
// and dbridge.c destroy_drawbridge() into scatter(), which called their
// stackobj() and dmgval() replacements without the environment they take and
// threw a TypeError. This test fails when scatter() reads any other key of its
// environment, when a caller passes one of the operations at the top level,
// where scatter() would ignore it, or when SCATTER_OPERATIONS and scatter()'s
// reads disagree.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import * as acorn from 'acorn';

import {
    SCATTER_MAY_HITYOU,
    SCATTER_OPERATIONS,
    scatter,
} from '../js/explode.js';

const JS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'js');

// The environment keys every owner in js/ gives the same meaning.
const SHARED_KEYS = ['hooks', 'message', 'random'];

function parse(file) {
    return acorn.parse(readFileSync(file, 'utf8'), {
        ecmaVersion: 'latest',
        sourceType: 'module',
    });
}

function walk(node, visit) {
    if (!node || typeof node.type !== 'string') return;
    visit(node);
    for (const value of Object.values(node)) {
        if (Array.isArray(value)) {
            for (const child of value) walk(child, visit);
        } else if (value && typeof value.type === 'string') {
            walk(value, visit);
        }
    }
}

// The keys read as `<name>.<key>` or `<name>?.<key>` for each object name in
// the given function, and every computed `<name>[...]` read.
function memberReads(fn, names) {
    const reads = Object.fromEntries(names.map((name) => [name, new Set()]));
    const computed = [];
    walk(fn.body, (node) => {
        if (node.type !== 'MemberExpression'
            || node.object.type !== 'Identifier'
            || !names.includes(node.object.name)) return;
        if (node.computed) computed.push(node.object.name);
        else reads[node.object.name].add(node.property.name);
    });
    return { reads, computed };
}

function scatterFunction() {
    let found = null;
    walk(parse(join(JS_DIR, 'explode.js')), (node) => {
        if (node.type === 'FunctionDeclaration' && node.id?.name === 'scatter')
            found = node;
    });
    assert.ok(found, 'js/explode.js defines scatter()');
    return found;
}

// Whether scatter() reads the given keys from its environment; the fixture
// below is the source this rule is pinned on.
function scatterEnvironmentViolations(fn) {
    const { reads, computed } = memberReads(fn, ['env', 'rawEnv', 'ops']);
    const problems = [];
    for (const key of reads.env) {
        if (!SHARED_KEYS.includes(key))
            problems.push(`scatter() reads env.${key}; read it from ops`);
    }
    for (const key of reads.rawEnv)
        problems.push(`scatter() reads rawEnv.${key}`);
    for (const key of reads.ops) {
        if (!SCATTER_OPERATIONS.includes(key))
            problems.push(`scatter() reads ops.${key}, not in SCATTER_OPERATIONS`);
    }
    for (const key of SCATTER_OPERATIONS) {
        if (!reads.ops.has(key))
            problems.push(`SCATTER_OPERATIONS lists ${key}, which scatter() never reads`);
    }
    for (const name of computed)
        problems.push(`scatter() reads ${name}[...] with a computed key`);
    return problems;
}

test('scatter() reads its replacements only from scatterOps', () => {
    assert.deepEqual(scatterEnvironmentViolations(scatterFunction()), []);
});

test('the environment check reports an operation read from env', () => {
    // A scatter() that reads damageValue from the forwarded environment, as
    // the version that crashed on a monster's striking bolt did.
    const fixture = acorn.parse(`
        async function scatter(sx, sy, b, f, obj, state, rawEnv = {}) {
            const { scatterOps: ops = {}, ...forwarded } = rawEnv;
            const env = { ...forwarded, state };
            const random = env.random;
            const damageValue = env.damageValue ?? ops.damageValue;
        }
    `, { ecmaVersion: 'latest' }).body[0];
    const problems = scatterEnvironmentViolations(fixture);
    assert.ok(problems.includes('scatter() reads env.damageValue; read it from ops'));
});

test('no caller passes a scatter() operation outside scatterOps', () => {
    const problems = [];
    for (const name of readdirSync(JS_DIR).filter((f) => f.endsWith('.js'))) {
        walk(parse(join(JS_DIR, name)), (node) => {
            if (node.type !== 'CallExpression'
                || node.callee.type !== 'Identifier'
                || node.callee.name !== 'scatter') return;
            const env = node.arguments[6];
            if (env?.type !== 'ObjectExpression') return;
            for (const property of env.properties) {
                const key = property.key?.name ?? property.key?.value;
                if (property.type === 'Property' && SCATTER_OPERATIONS.includes(key))
                    problems.push(`js/${name}: scatter() call passes ${key} outside scatterOps`);
            }
        });
    }
    assert.deepEqual(problems, []);
});

test('scatter() refuses an operation it does not have', async () => {
    await assert.rejects(
        scatter(1, 1, 1, 0, null, { level: { objects: [] } }, {
            scatterOps: { stackObj: () => {} },
        }),
        { name: 'TypeError', message: 'scatter() has no operation stackObj' },
    );
});

test('scatter() ignores operations a caller forwards for its own callees', async () => {
    // One object one square west of the hero. rn2(8)=4 is xdir[4]=1,
    // ydir[4]=0 (east, onto the hero); rnd(1)=1 is the one step blastforce 1
    // allows, so the chain reaches the SCATTER_MAY_HITYOU arm, then lands.
    const state = {
        u: { ux: 6, uy: 5, uundetected: false },
        youmonst: { data: {} },
        level: {
            objects: Array.from({ length: 80 }, () => Array(22).fill(null)),
            traps: [],
            objlist: null,
            at: () => ({ typ: 100 }),
        },
        gb: { bhitpos: { x: 5, y: 5 } },
        gt: {},
    };
    const object = {
        otyp: 1, oclass: 2, quan: 1, owt: 40, spe: 0, ox: 5, oy: 5, where: 1,
    };
    const calls = [];
    // The forwarded environment carries every operation name in the shape
    // monsterMissileEnv() gives several of them: a function whose last
    // argument is the caller's environment. None may run.
    const foreign = Object.fromEntries(SCATTER_OPERATIONS.map((name) => [
        name,
        (...args) => { throw new Error(`forwarded ${name} ran with ${args.length} arguments`); },
    ]));
    const total = await scatter(5, 5, 1, SCATTER_MAY_HITYOU, object, state, {
        ...foreign,
        random: {
            rn2: (n) => { calls.push(`rn2(${n})`); return 4; },
            rnd: (n) => { calls.push(`rnd(${n})`); return 1; },
        },
        scatterOps: {
            shopOrigin: false,
            extractObject: () => calls.push('extract'),
            nomul: () => calls.push('nomul'),
            damageValue: () => { calls.push('dmgval'); return 2; },
            hitHero: () => { calls.push('thitu'); return false; },
            floorEffects: () => false,
            placeObject: (value, x, y) => calls.push(`place ${x},${y}`),
            stackObject: () => calls.push('stack'),
            terrainAt: () => 100,
            closedDoor: () => false,
            isSink: () => false,
            monsterAt: () => null,
            heroAt: (x, y) => x === 6 && y === 5,
            canSee: () => false,
            newsym: () => {},
            maybeUnhideAt: () => {},
        },
    });
    assert.equal(total, 1);
    assert.deepEqual(calls, [
        'extract', 'rn2(8)', 'rnd(1)', 'nomul', 'dmgval', 'thitu',
        'place 6,5', 'stack',
    ]);
});
