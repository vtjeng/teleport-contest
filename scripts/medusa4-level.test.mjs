import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { MEDUSA_LEVEL_LOADERS } from '../js/medusa_levels.js';
import { extractMedusa4Map, regenerateMedusa4Map } from './generate-medusa-levels.mjs';
import { STATUE, SHIELD_OF_REFLECTION, LEVITATION_BOOTS, SCIMITAR, EGG } from '../js/objects.js';
import { PM_KNIGHT, PM_YELLOW_DRAGON } from '../js/monsters.js';
import { initRng, getRngLog, enableRngLog } from '../js/rng.js';

const source = readFileSync('nethack-c/upstream/dat/medusa-4.lua', 'utf8');
function capture() {
    const calls = [];
    const des = new Proxy({}, { get(target, property) {
        return async (...args) => {
            calls.push({ property, args });
            if (typeof args[0]?.contents === 'function') await args[0].contents();
        };
    } });
    return { des, calls };
}

test('Medusa-4 map preserves all 21 source rows and generated output', async () => {
    initRng(19710031); // Independent chosen stream; generation must not affect the map bytes.
    const { des, calls } = capture();
    await MEDUSA_LEVEL_LOADERS['medusa-4'](des);
    const rows = calls.find(call => call.property === 'map').args[0];
    assert.deepEqual(rows, extractMedusa4Map(source));
    assert.equal(rows.length, 21); // Lua13-33: full ROWNO height triggers ystart=0.
    assert.ok(rows.every(row => row.length === 76)); // Every authoritative source row.
    assert.equal(rows.at(-1), '}'.repeat(76)); // Lua33, omitted by the old translation.
    const owner = readFileSync('js/medusa_levels.js', 'utf8');
    assert.equal(regenerateMedusa4Map(owner, source), owner);
});

test('Medusa-4 preserves source selection results and every descriptor in order', async () => {
    for (const seed of [19710031, 19710037]) {
        // Independently chosen primary/role-variation streams also vary all percent gates.
        initRng(seed);
        enableRngLog();
        const { des, calls } = capture();
        await MEDUSA_LEVEL_LOADERS['medusa-4'](des);
        const rng = getRngLog().filter(entry => entry.startsWith('rn2('));
        assert.deepEqual(rng.map(entry => Number(entry.match(/rn2\((\d+)\)/u)[1])),
            [4, 3, ...Array(8).fill(100)]); // Lua46/51 choose distinct rooms, then eight percent() calls.
        const rolls = rng.map(entry => Number(entry.split('=')[1]));
        const candidates = [[4, 8], [10, 4], [10, 8], [10, 12]]; // Lua41–44 in C x-major order.
        const medloc = candidates.splice(rolls[0], 1)[0];
        const altloc = candidates[rolls[1]];
        const content = ['shield', 'boots', 'scimitar', 'sack']
            .filter((_, i) => rolls[2 + i] < [75, 25, 50, 50][i]); // Lua87–97 thresholds/order.
        const babies = Number(rolls[6] < 50) + Number(rolls[7] < 25); // Lua127–132.
        const eggs = 1 + Number(rolls[8] < 50) + Number(rolls[9] < 25); // Lua133–139.
        assert.deepEqual(calls.map(c => c.property), [
            'level_init', 'level_flags', 'map', 'region', 'region',
            'teleport_region', 'teleport_region', 'levregion', 'stair',
            ...Array(7).fill('door'), 'levregion', 'non_diggable',
            'object', 'object', ...Array(content.length).fill('object'),
            ...Array(15).fill('object'), ...Array(7).fill('trap'),
            ...Array(3 + babies).fill('monster'), ...Array(eggs).fill('object'),
            ...Array(26).fill('monster'),
        ]); // Lua59–149: contents finish before seven empty statues/eight objects; eggs before aquatic/snakes/nagas.
        assert.deepEqual(calls[0].args, [{ style: 'solidfill', fg: ' ' }]);
        assert.deepEqual(calls[1].args, ['noteleport', 'mazelevel']); // Lua6–7.
        const regions = calls.filter(c => c.property === 'region');
        assert.deepEqual(regions[0].args[0].bounds(), { lx: 0, ly: 0, hx: 74, hy: 19 });
        assert.equal(regions[0].args[1], 'lit'); // Lua54 deliberately leaves row20 outside this selection.
        assert.deepEqual(regions[1].args, [{ region: [13, 3, 18, 13], lit: 1,
            type: 'ordinary', irregular: 1 }]); // Lua58 first room receives fixup statues.
        assert.deepEqual(calls.filter(c => c.property === 'teleport_region').map(c => c.args), [
            [{ region: [64, 1, 74, 17], dir: 'down' }],
            [{ region: [2, 2, 18, 13], dir: 'up' }],
        ]); // Lua60–61 preserves the two arrival exclusions/directions.
        assert.deepEqual(calls.filter(c => c.property === 'levregion').map(c => c.args), [
            [{ region: [67, 1, 74, 20], type: 'stair-up' }],
            [{ region: [27, 0, 79, 20], type: 'branch' }],
        ]); // Lua63/76 use the full level bottom row.
        assert.deepEqual(calls.find(c => c.property === 'stair').args,
            ['down', { x: medloc[0], y: medloc[1] }]); // Lua66 consumes first removed coordinate.
        assert.deepEqual(calls.filter(c => c.property === 'door').map(c => c.args),
            [[4, 6], [4, 10], [8, 4], [8, 12], [10, 6], [10, 10], [12, 8]]
                .map(coord => ['locked', ...coord])); // Lua68–74, all seven locked doors.
        assert.deepEqual(calls.find(c => c.property === 'non_diggable').args[0].bounds(),
            { lx: 1, ly: 1, hx: 22, hy: 14 }); // Lua78 palace rectangle only.
        const objects = calls.filter(c => c.property === 'object');
        assert.deepEqual(objects[0].args, ['crystal ball', 7, 8]); // Lua80 positional object.
        const perseus = objects[1].args[0];
        assert.deepEqual(perseus.coord, medloc);
        assert.equal(perseus.id, STATUE);
        assert.equal(perseus.montype, PM_KNIGHT); // Lua84 resolves knight for the statue species.
        assert.equal(perseus.name, 'Perseus');
        assert.equal(perseus.buc, 'uncursed');
        assert.equal(perseus.historic, 1);
        assert.equal(perseus.male, 1); // Lua83–85 resolved knight species with statue flags.
        assert.deepEqual(objects.slice(2, 2 + content.length).map(c => c.args), [
            [{ id: SHIELD_OF_REFLECTION, buc: 'cursed', spe: 0 }],
            [{ id: LEVITATION_BOOTS, spe: 0 }],
            [{ id: SCIMITAR, buc: 'blessed', spe: 2 }], ['sack'],
        ].filter((_, i) => rolls[2 + i] < [75, 25, 50, 50][i])); // Lua87–97 exact contents and order.
        assert.deepEqual(objects.slice(-eggs).map(c => c.args), Array(eggs).fill(
            [{ id: EGG, x: 5, y: 4, montype: PM_YELLOW_DRAGON }])); // Lua133–139 source nesting site/species.
        const decoy = objects[2 + content.length].args[0];
        assert.deepEqual(decoy.coord, altloc); // Lua103, distinct second removed room coordinate.
        assert.notDeepEqual(medloc, altloc);
        assert.equal(typeof decoy.contents, 'function'); // Lua contents=0 uses an empty callback in the canonical owner.
        const monsters = calls.filter(c => c.property === 'monster');
        assert.deepEqual(monsters[0].args, [{ id: 'Medusa', coord: medloc, asleep: 1 }]);
        assert.deepEqual(monsters[1].args, ['kraken', 7, 7]);
        assert.deepEqual(monsters[2].args, [{ id: 'yellow dragon', x: 5, y: 4, asleep: 1 }]); // Lua123–126.
        assert.deepEqual(monsters.slice(-26).map(c => c.args), [
            ['giant eel'], ['giant eel'], ['jellyfish'], ['jellyfish'],
            ...Array(14).fill(['S']),
            ...Array.from({ length: 4 }, () => [['black naga hatchling'], ['black naga']]).flat(),
        ]); // Lua141–149 keeps positional/default gender and interleaved naga calls.
        assert.ok(calls.filter(c => c.property === 'trap').every(c => c.args.length === 0)); // Lua117–119 seven random traps.
    }
});
