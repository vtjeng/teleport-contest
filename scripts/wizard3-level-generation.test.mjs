import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { GameMap } from '../js/game.js';
import { HWALL } from '../js/const.js';
import { initRng, enableRngLog, getRngLog } from '../js/rng.js';
import { ThemeroomSelection } from '../js/themerooms.js';
import { WIZARD3_LEVEL_LOADERS, wizard3 } from '../js/wizard3_levels.js';

const SOURCE = readFileSync('nethack-c/upstream/dat/wizard3.lua', 'utf8');

function descriptorHarness(doorDraw) {
    // Seed6's four rn2(100) values69,65,29,41 skip all hell_tweaks gates.
    initRng(6);
    enableRngLog();
    const calls = [];
    const level = new GameMap();
    // mazegrid's '-' background spans the playable 79 columns and 21 rows.
    for (let x = 1; x < 80; ++x)
        for (let y = 0; y < 21; ++y) level.at(x, y).typ = HWALL;
    const state = { level, u: { uz: { dnum: 1, dlevel: 41 } },
        dungeons: [{ depth_start: 1 }, { depth_start: 1 }] };
    const des = {
        frame: { xstart: 1, ystart: 0 },
        random: { rn2(bound) {
            calls.push({ property: 'rn2', args: [bound] });
            return doorDraw; // The arrival room's single percent(50) draw.
        } },
    };
    for (const property of ['level_init', 'level_flags', 'levregion',
        'teleport_region', 'mazewalk', 'region', 'door', 'ladder',
        'non_diggable', 'non_passwall', 'monster', 'trap', 'object', 'terrain']) {
        des[property] = async (...args) => {
            calls.push({ property, args });
            if (typeof args[0]?.contents === 'function') await args[0].contents();
        };
    }
    des.map = async specification => {
        calls.push({ property: 'map', args: [specification] });
        await specification.contents();
        const selection = new ThemeroomSelection(null, true);
        // The 29x13 centered map starts at (25,5); source trailing 'x' cells
        // are transparent and absent from C lspo_map's returned selection.
        for (const [y, row] of specification.map.split('\n').entries())
            for (let x = 0; x < row.length; ++x)
                if (row[x] !== 'x') selection.set(25 + x, 5 + y);
        let reads = 0;
        const get = selection.get.bind(selection);
        selection.get = (x, y) => { ++reads; return get(x, y); };
        des.selectionReads = () => reads;
        des.selection = selection;
        return { xstart: 25, ystart: 5, xsize: 29, ysize: 13, selection };
    };
    return { des, state, calls };
}

test('Wizard3 preserves the complete source map and canonical return selection', async () => {
    const { des, state, calls } = descriptorHarness(49); // percent(50)'s last true draw.
    await wizard3(des, state);
    assert.equal(WIZARD3_LEVEL_LOADERS.wizard3, wizard3);
    const sourceMap = SOURCE.match(/map\s*=\s*\[\[([\s\S]*?)\]\]/u)[1]
        .split('\n').slice(1, -1).join('\n');
    const map = calls.find(c => c.property === 'map').args[0];
    assert.equal(map.map, sourceMap);
    assert.equal(map.halign, 'center');
    assert.equal(map.valign, 'center');
    assert.equal(des.selection.numpoints(), 364); // 28 written columns × 13 source rows.
    assert.equal(des.selection.get(53, 5), false); // The transparent final column.
    assert.ok(des.selectionReads() > 1, 'protection must consume the returned selection');
    const registry = readFileSync('js/mklev.js', 'utf8');
    assert.match(registry, /import\('\.\/wizard3_levels\.js'\)/u);
    assert.match(registry, /\.\.\.WIZARD3_LEVEL_LOADERS/u);
});

for (const [draw, wall] of [[49, 'west'], [50, 'north']]) {
    // nhlib.lua percent(50) uses rn2(100) < 50, including this exact boundary.
    test(`Wizard3 percent boundary ${draw} selects ${wall} in source order`, async () => {
        const { des, state, calls } = descriptorHarness(draw);
        await wizard3(des, state);
        assert.deepEqual(calls.filter(c => c.property === 'rn2').map(c => c.args),
            [[100]]); // One arrival-door percent(50) draw.
        assert.deepEqual(getRngLog(), [
            'rn2(100)=69', 'rn2(100)=65', 'rn2(100)=29', 'rn2(100)=41',
        ]); // The four source hell_tweaks gates follow the completed map callback.
        assert.deepEqual(calls.filter(c => c.property === 'door').map(c => c.args), [
            [{ state: 'secret', wall }], ['closed', 18, 5], // wizard3.lua42 and45.
        ]);
        assert.deepEqual(calls.filter(c => c.property !== 'rn2').map(c => c.property), [
            'level_init', 'level_flags', 'map',
            ...Array(3).fill('levregion'), 'teleport_region', 'levregion',
            'mazewalk', 'region', 'region', 'region', 'door', 'door', 'ladder',
            ...Array(4).fill('non_diggable'), ...Array(4).fill('non_passwall'),
            ...Array(12).fill('monster'), ...Array(4).fill('trap'),
            ...Array(6).fill('object'), // Exact top-level callback descriptor counts.
        ]);
        const regions = calls.filter(c => c.property === 'region').map(c => c.args[0]);
        assert.deepEqual(regions, [
            { region: [7, 3, 15, 11], lit: 0, type: 'morgue', filled: 2 },
            { region: [17, 6, 18, 11], lit: 0, type: 'beehive', filled: 1 },
            { region: [20, 6, 26, 11], lit: 0, type: 'ordinary', arrival_room: true,
                contents: regions[2].contents }, // Source38–44 makes a real arrival room.
        ]);
        assert.deepEqual(calls.filter(c => c.property === 'levregion').at(-1).args,
            [{ region: [25, 11, 25, 11], type: 'portal', name: 'fakewiz1' }]);
        assert.deepEqual(calls.find(c => c.property === 'ladder').args, ['up', 11, 7]);
        assert.deepEqual(calls.find(c => c.property === 'mazewalk').args, [28, 9, 'east']);
        assert.deepEqual(calls.find(c => c.property === 'teleport_region').args, [{
            region: [1, 0, 79, 20], region_islev: 1, exclude: [0, 0, 27, 12],
        }]); // Source29–32 excludes tower cells from ordinary arrival.
        for (const property of ['non_diggable', 'non_passwall']) {
            assert.deepEqual(calls.filter(c => c.property === property)
                .map(c => c.args[0].bounds()), [
                { lx: 0, ly: 0, hx: 6, hy: 12 },
                { lx: 6, ly: 0, hx: 27, hy: 2 },
                { lx: 16, ly: 2, hx: 27, hy: 12 },
                { lx: 6, ly: 12, hx: 16, hy: 12 },
            ]); // Source49–57 protects identical four wall areas with both properties.
        }
        assert.deepEqual(calls.filter(c => c.property === 'monster').map(c => c.args), [
            ['L', 10, 7], ['vampire lord', 12, 7], ['kraken', 8, 5],
            ['giant eel', 8, 8], ['kraken', 14, 5], ['giant eel', 14, 8],
            ['L'], ['D'], ['D', 26, 9], ['&'], ['&'], ['&'], // Source59–72.
        ]);
        assert.deepEqual(calls.filter(c => c.property === 'object').map(c => c.args),
            [[')'], ['!'], ['?'], ['?'], ['('], ['"', 11, 7]]); // Source79–85.
    });
}
