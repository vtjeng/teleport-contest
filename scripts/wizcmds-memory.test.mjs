import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as wiz from '../js/wizcmds.js';
import * as region from '../js/region.js';
import * as dungeon from '../js/dungeon.js';
import * as engrave from '../js/engrave.js';
import * as light from '../js/light.js';
import * as timeout from '../js/timeout.js';
import * as worm from '../js/worm.js';
import { memoryLayout as sz } from '../js/wizcmds_data.js';
import { ECMD_OK } from '../js/const.js';
const c = readFileSync(new URL('../nethack-c/upstream/src/wizcmds.c', import.meta.url), 'utf8');
const total = () => ({ count: 0, size: 0 });
test('generated LP64 sizes reproduce the pinned source headers', () => {
    execFileSync(process.execPath, ['scripts/generate-wizcmds-memory-layout.mjs', '--check']);
    assert.equal(sz.obj, 112); // Recorder LP64 struct obj, compiled from obj.h.
    assert.equal(sz.monst, 192); // Recorder LP64 struct monst, compiled from monst.h.
});
test('size_obj and size_monst count allocation presence and source byte strings', () => {
    assert.match(c, /if \(otmp->oextra\)/u);
    const saved = { mextra: { mgivenname: 'orc', edog: {} }, wormno: 1 };
    const state = { level: { worms: { 1: { segments: [{}, {}, {}] } } } }; // Two visible segments plus hidden head.
    assert.equal(worm.size_wseg(saved, state), 2 * sz.wseg);
    assert.equal(wiz.size_monst(saved, false, state), sz.monst + sz.mextra + 4 + sz.edog); // Name includes terminating NUL.
    assert.equal(wiz.size_monst(saved, true, state), sz.monst + sz.mextra + 4 + sz.edog + 2 * sz.wseg);
    const obj = { quan: 999, oextra: { oname: '', omailcmd: 'é', omonst: saved } }; // Quantity is irrelevant; UTF-8 mail text occupies two bytes.
    assert.equal(wiz.size_obj(obj, state), sz.obj + sz.oextra + 1 + 3 + wiz.size_monst(saved, false, state));
    assert.equal(wiz.size_obj({}), sz.obj); // No separately allocated oextra.
    for (const key of ['egd', 'epri', 'eshk', 'emin', 'edog', 'ebones'])
        assert.equal(wiz.size_monst({ mextra: { [key]: {} } }, false), sz.monst + sz.mextra + sz[key]);
});
test('object traversal keeps top and recursion independent and aggregates all owned contents', () => {
    assert.match(c, /if \(recurse && obj->cobj\)/u);
    const child = { cobj: {} }; // Two nested contained allocations.
    const chain = { cobj: child, nobj: { quan: 20 } }; // Two top nodes irrespective of quantity.
    const a = total(); wiz.count_obj(chain, a, true, false); assert.deepEqual(a, { count: 2, size: 2 * sz.obj });
    const b = total(); wiz.count_obj(chain, b, false, true); assert.deepEqual(b, { count: 2, size: 2 * sz.obj });
    const d = total(); wiz.count_obj(chain, d, true, true); assert.deepEqual(d, { count: 4, size: 4 * sz.obj });
    const rows = [], sum = total();
    wiz.obj_chain(rows, 'empty', null, true, sum);
    assert.match(rows[0].text, /^empty\s+0\s+0$/u); // Forced empty rows are printed.
    wiz.mon_invent_chain(rows, 'minvent', { minvent: chain }, sum);
    wiz.contained_stats(rows, 'contained', sum, { invent: chain, level: {}, gm: {} });
    assert.deepEqual(sum, { count: 4, size: 4 * sz.obj });
    const ms = total(); wiz.mon_chain(rows, 'migrating', { mhp: 0, wormno: 1 }, true, ms, { level: { worms: { 1: { segments: [{}, {}] } } } });
    assert.equal(ms.size, sz.monst); // C includes dead list nodes but omits segments for migrating/mydogs.
});
test('consumed allocation helpers preserve zero, linked records and source totals', () => {
    const state = { head_engr: { engr_alloc: 9, nxt_engr: { engr_alloc: 3 } }, gl: { light_base: { next: {} } }, gt: { timer_base: {} }, level: {} }; // Two engravings/lights, one timer.
    assert.deepEqual(engrave.engr_stats('engravings, size %ld+text', state), { header: `engravings, size ${sz.engr}+text`, count: 2, size: 2 * sz.engr + 12 });
    assert.equal(light.light_stats('light sources, size %ld', state).size, 2 * sz.light_source);
    assert.equal(timeout.timer_stats('timers, size %ld', state).size, sz.timer_element);
    const rows = [], sum = total();
    state.svm = { mapseenchn: [{ custom_lth: 3, final_resting_place: [{}] }, {}] }; // Two overview nodes, one cemetery and one four-byte allocated annotation.
    dungeon.overview_stats(rows, wiz.memory_stats_line, sum, state);
    assert.deepEqual(sum, { count: 4, size: 2 * sz.mapseen + sz.cemetery + 4 });
    assert.equal(rows.length, 3); // General, cemetery, annotations in C order.
});
test('region allocation capacity grows in source chunks and survives removal', () => {
    const state = { u: { ux: 1, uy: 1 }, level: { regions: [], max_regions: 0 } };
    const r = region.create_region([]); // Empty bounding box avoids visual and monster callbacks.
    assert.equal(r.max_monst, 0);
    for (let id = 1; id <= 6; id++) region.add_mon_to_reg(r, { m_id: id }); // Sixth member grows from five to ten slots.
    assert.equal(r.max_monst, 10);
    region.remove_mon_from_reg(r, { m_id: 1 }); assert.equal(r.max_monst, 10);
    region.add_region(r, state);
    assert.equal(state.level.max_regions, 10); // First region allocates ten slots.
    r.rects.push({}); r.enter_msg = ''; r.leave_msg = 'gas'; // Even an empty nonnull message includes its NUL.
    assert.deepEqual(region.region_stats('regions, size %ld+%ld*rect+N', state), { header: `regions, size ${sz.NhRegion}+${sz.NhRect}*rect+N`, count: 1, size: 10 * sz.NhRegion + sz.NhRect + 1 + 4 + 10 * sz.unsigned });
    region.remove_region(r, state);
    assert.equal(region.region_stats('', state).size, 10 * sz.NhRegion); // Source retains capacity after last removal.
    region.rest_region_capacity(state.level);
    assert.equal(state.level.max_regions, 0); // Restored capacity shrinks to serialized count.
});
test('stats report orders every group and awaits the existing text window', async () => {
    const state = { level: { regions: [], max_regions: 0, traps: [] }, svm: { mapseenchn: [] } };
    let rows; let release; const gate = new Promise(resolve => { release = resolve; }); let done = false;
    const pending = wiz.wiz_show_stats(state, { window: async (s, lines) => { assert.equal(s, state); rows = lines; await gate; } }).then(value => { done = true; return value; });
    await Promise.resolve(); assert.equal(done, false);
    assert.equal(rows[0].text, 'Current memory statistics:');
    assert.ok(rows.findIndex(r => r.text.includes('Objects, base')) < rows.findIndex(r => r.text.includes('Monsters, base')));
    assert.equal(rows.at(-1).text, wiz.memory_stats_line('  Grand total', 0, 0));
    release(); assert.equal(await pending, ECMD_OK);
    const js = readFileSync(new URL('../js/cmd.js', import.meta.url), 'utf8');
    assert.match(js, /case 'wiz_show_stats':\s+return await wiz_show_stats\(state\);/u);
});
test('allocation helper formulas and production callers are pinned to whole C source', () => {
    const source = file => readFileSync(new URL('../nethack-c/upstream/src/' + file + '.c', import.meta.url), 'utf8');
    assert.match(source('engrave'), /sizeof \*ep \+ \(long\) ep->engr_alloc/u);
    assert.match(source('light'), /for \(ls = gl\.light_base; ls; ls = ls->next\)/u);
    assert.match(source('timeout'), /for \(te = gt\.timer_base; te; te = te->next\)/u);
    assert.match(source('worm'), /count_wsegs\(worm\) \* sizeof \(struct wseg\)/u);
    assert.match(source('region'), /gm\.max_regions \* \(long\) sizeof \(NhRegion\)/u);
    assert.match(source('region'), /reg->max_monst \+= MONST_INC/u);
    assert.match(source('region'), /gm\.max_regions \+= 10/u);
    assert.match(source('region'), /r->max_monst = r->n_monst/u);
    assert.match(source('dungeon'), /asize \+= \(long\) \(mptr->custom_lth \+ 1\)/u);
    assert.match(source('cmd'), /wiz_show_stats, IFBURIED \| AUTOCOMPLETE \| WIZMODECMD/u);
    assert.match(c, /static const char template\[\] = "%-27s  %4ld  %6ld"/u);
    // Widths are C minimum widths: a longer label and larger count are never truncated.
    assert.equal(wiz.memory_stats_line('x'.repeat(28), 12345, 7654321), 'x'.repeat(28) + '  12345  7654321');
});
test('misc_stats includes every conditional chain and allocated empty names', () => {
    const rows = [], totals = total();
    const state = { level: { traps: [{}, {}], damagelist: { next: {} }, bonesinfo: [{}, {}], regions: [], max_regions: 0 }, killer: { next: { next: {} } }, objects: [{ oc_uname: '' }, { oc_uname: 'é' }, {}] }; // Two records per conditional list, plus two allocated names including empty text.
    wiz.misc_stats(rows, totals, state);
    assert.deepEqual(totals, { count: 10, size: 2 * sz.trap + 2 * sz.damage + 2 * sz.kinfo + 2 * sz.cemetery + 4 });
    assert.deepEqual(rows.map(r => r.text.slice(0, 27).trim()), [
        `traps, size ${sz.trap}`, `engravings, size ${sz.engr}+text`,
        `shop damage, size ${sz.damage}`, `delayed killers, size ${sz.kinfo}`,
        `bones history, size ${sz.cemetery}`, 'object type names, text',
    ]); // C order; zero engravings forced, zero lights/timers/regions omitted.
});
test('restored region capacity shrinks both allocation levels before future growth', () => {
    const level = { max_regions: 20, regions: [{ monsters: [1, 2], max_monst: 10 }] }; // Two saved members, one saved region.
    region.rest_region_capacity(level);
    assert.equal(level.max_regions, 1);
    assert.equal(level.regions[0].max_monst, 2);
    region.add_mon_to_reg(level.regions[0], { m_id: 3 });
    assert.equal(level.regions[0].max_monst, 7); // C adds five to restored capacity, without rounding to a multiple.
    for (const file of ['restore', 'bones']) {
        const js = readFileSync(new URL('../js/' + file + '.js', import.meta.url), 'utf8');
        assert.match(js, /rest_region_capacity\((?:state\.level|level)\)/u);
    }
});
