import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrsort_cmp, list_migrating_mons, wiz_migrate_mons } from '../js/wizcmds.js';
import { COLNO, ROWNO, ECMD_OK, MM_NOMSG, MIGR_RANDOM, MIGR_EXACT_XY } from '../js/const.js';
import { MONSTER_TEMPLATES, PM_NEWT } from '../js/monsters.js';

const source = readFileSync(new URL('../nethack-c/upstream/src/wizcmds.c', import.meta.url), 'utf8');
function state() {
    return {
        u: { uz: { dnum: 0, dlevel: 1 } },
        dungeons: [{ depth_start: 1, num_dunlevs: 10, ledger_start: 0 }],
        iflags: { debug_mongen: true }, gm: { migrating_mons: null },
        level: { monlist: null },
    };
}
function mon(id, dnum = 0, dlevel = 2) {
    return { m_id: id, mux: dnum, muy: dlevel, mx: 0, my: 0,
        data: MONSTER_TEMPLATES[PM_NEWT], mnum: PM_NEWT,
        mtrack: [{ x: 0, y: 0 }, { x: 4, y: 5 }], nmon: null };
}
function chain(monsters) {
    monsters.forEach((monster, i) => monster.nmon = monsters[i + 1] ?? null);
    return monsters[0] ?? null;
}
function io(input = '', choice = 'q') {
    const calls = [];
    return {
        calls, message: async text => calls.push(['message', text]),
        getlin: async () => input,
        yn: async (...args) => {
            calls.push(['yn', ...args.slice(0, 4)]);
            return choice.charCodeAt(0); // Canonical yn_function returns a byte.
        },
        window: async (_state, rows) => calls.push(['window', rows.map(row => row.text)]),
    };
}

test('C comparator sorts destination then unsigned monster ID', () => {
    assert.match(source, /m1->m_id < m2->m_id/u);
    assert.equal(migrsort_cmp(mon(0xffffffff, 1, 1), mon(1, 2, 0)), -1);
    assert.equal(migrsort_cmp(mon(0xffffffff, 0, 2), mon(1, 0, 1)), 1);
    assert.equal(migrsort_cmp(mon(0xffffffff), mon(1)), 1);
    assert.equal(migrsort_cmp(mon(1), mon(0xffffffff)), -1);
    assert.equal(migrsort_cmp(mon(7), mon(7)), 0);
});
test('pending list categories, named exact destinations, and stable ID order', async () => {
    const s = state(), a = mon(9), b = mon(1), c = mon(4, 0, 1), d = mon(2, 1, 3);
    a.mextra = { mgivenname: 'Late' };
    b.mextra = { mgivenname: 'Early' };
    d.mtrack[0].x = MIGR_EXACT_XY;
    d.mextra = { mgivenname: 'Pebble' };
    s.gm.migrating_mons = chain([a, b, c, d]);
    const env = io('', 'a');
    await list_migrating_mons({ dnum: 0, dlevel: 2 }, s, env);
    assert.equal(env.calls[0][1], '1 mon pending for current level, 2 for next level, 1 for others.');
    assert.deepEqual(env.calls[1], ['yn', 'List which?', 'cnoa q', 'q', true]);
    assert.deepEqual(env.calls[2][1], ['All migrating monsters:', '',
        '  newt to 0:1', '  newt named Early to 0:2', '  newt named Late to 0:2',
        '  newt named Pebble to 1:3 at <4,5>']);
});
test('current category takes precedence, unavailable choices stay hidden after ESC', async () => {
    const s = state();
    s.gm.migrating_mons = mon(1, 0, 1);
    const env = io('', 'n');
    await list_migrating_mons(s.u.uz, s, env);
    assert.equal(env.calls[1][2], 'ca q\x1bno');
    assert.deepEqual(env.calls.at(-1), ['message', 'None.']);
    const quit = io('', 'q');
    await list_migrating_mons(s.u.uz, s, quit);
    assert.equal(quit.calls.length, 2);
});
test('empty list, count cancellation and bottom destination do not toggle generation', async () => {
    for (const input of ['', '\x1b', 'nothing']) {
        const s = state(), env = io(input);
        assert.equal(await wiz_migrate_mons(s, env), ECMD_OK);
        assert.equal(s.iflags.debug_mongen, true);
        assert.equal(env.calls[0][1], 'No monsters currently migrating.');
    }
    const s = state(), env = io();
    s.u.uz.dlevel = 10;
    await wiz_migrate_mons(s, env);
    assert.deepEqual(env.calls.map(call => call[1]),
        ['No monsters currently migrating.', "Can't get there from here."]);
});
test('positive decimal prefix preserves rndmonst, awaited makemon and migration order', async () => {
    const s = state(), env = io(' +2trailing'), events = [];
    let pendingResolve;
    env.rndmonst = () => {
        assert.equal(s.iflags.debug_mongen, false);
        events.push('rndmonst');
        return null;
    };
    env.makemon = async (ptr, x, y, flags) => {
        assert.equal(ptr, null);
        assert.deepEqual([x, y, flags], [0, 0, MM_NOMSG]);
        events.push('makemon');
        if (events.length === 2) await new Promise(resolve => pendingResolve = resolve);
        return mon(events.length);
    };
    env.migrate = (_monster, ledger, code, coord) => {
        events.push('migrate');
        assert.deepEqual([ledger, code, coord], [2, MIGR_RANDOM, null]);
    };
    const command = wiz_migrate_mons(s, env);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(events, ['rndmonst', 'makemon']);
    pendingResolve();
    assert.equal(await command, ECMD_OK);
    assert.deepEqual(events, ['rndmonst', 'makemon', 'migrate', 'rndmonst', 'makemon', 'migrate']);
    assert.equal(s.iflags.debug_mongen, true);
});
test('negative count rereads canonical level.monlist, including an empty remainder', async () => {
    const s = state(), a = mon(1), b = mon(2), env = io('-3'), moved = [];
    s.level.monlist = chain([a, b]);
    env.rndmonst = () => assert.fail('negative count must not randomize');
    env.makemon = () => assert.fail('negative count must not create');
    env.migrate = monster => {
        moved.push(monster.m_id);
        s.level.monlist = monster.nmon;
    };
    await wiz_migrate_mons(s, env);
    assert.deepEqual(moved, [1, 2]);
    assert.equal(s.iflags.debug_mongen, true);
});
test('source upper limit clamps creation, and stronghold selects the valley', async () => {
    assert.match(source, /\(COLNO - 1\) \* ROWNO/u);
    const s = state(), env = io(String((COLNO - 1) * ROWNO + 1));
    let count = 0;
    env.rndmonst = () => null;
    env.makemon = async () => { count++; return null; };
    await wiz_migrate_mons(s, env);
    assert.equal(count, (COLNO - 1) * ROWNO);
    s.stronghold_level = { ...s.u.uz };
    s.valley_level = { dnum: 0, dlevel: 7 };
    s.level.monlist = mon(1);
    const valley = io('-1');
    valley.migrate = (_monster, dest) => assert.equal(dest, 7);
    await wiz_migrate_mons(s, valley);
});
test('reference atoi narrowing and INT_MIN negation do not invent iterations', async () => {
    for (const [input, expected] of [['4294967297', 1], ['-2147483648', 0], ['99999999999999999999999999', 0]]) {
        const s = state(), env = io(input);
        let count = 0;
        env.rndmonst = () => null;
        env.makemon = async () => { count++; return null; };
        await wiz_migrate_mons(s, env);
        assert.equal(count, expected, input);
    }
});
test('list window dismissal precedes count prompt and temporary generation change', async () => {
    const s = state(), env = io('', 'n');
    s.gm.migrating_mons = mon(1);
    let close, settled = false;
    env.window = () => new Promise(resolve => close = resolve);
    env.getlin = async () => {
        assert.equal(s.iflags.debug_mongen, true);
        settled = true;
        return '';
    };
    const command = wiz_migrate_mons(s, env);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, false);
    assert.equal(s.iflags.debug_mongen, true);
    close();
    await command;
    assert.equal(settled, true);
});
test('each populated category has source title and filters before sorting', async () => {
    for (const [choice, title] of [['c', 'current level'], ['n', 'next level'], ['o', "'other' levels"]]) {
        const s = state(), env = io('', choice);
        s.gm.migrating_mons = chain([mon(1, 0, 1), mon(2, 0, 2), mon(3, 0, 3)]);
        await list_migrating_mons({ dnum: 0, dlevel: 2 }, s, env);
        const rows = env.calls.at(-1)[1];
        assert.deepEqual(rows, [`Monster migrating to ${title}:`, '',
            choice === 'o' ? '  newt to 0:3' : '  newt']);
    }
});
