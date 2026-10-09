import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { strncmpi } from '../js/hacklib.js';

// global.h strcmpi passes -1; C's while(n--) still compares through NUL.
test('the alphabetical spell comparator dependency supports unbounded counts', () => {
    assert.deepEqual([
        strncmpi('Healing', 'healing', -1),
        strncmpi('force bolt', 'healing', -1),
        strncmpi('healing', 'force bolt', -1),
        strncmpi('heal', 'healing', -1),
    ], [0, -1, 1, -1]);
});

// The selected spell.c range contains every function, including the inactive
// endgame helper between dovspell and dospellmenu.
test('the spell menu family has source owners instead of refusal branches', () => {
    const js = readFileSync(new URL('../js/spell.js', import.meta.url), 'utf8');
    for (const name of ['spell_cmp', 'sortspells', 'spellsortmenu', 'show_spells'])
        assert.match(js, new RegExp(`function ${name}\\(`, 'u'));
    assert.doesNotMatch(js, /UnsupportedSpellDisplayError/u);
});

import { A_WIS, ECMD_OK, NO_SPELL, NUM_ATTRS, P_BASIC,
    P_HEALING_SPELL, P_ISRESTRICTED, P_NUM_SKILLS } from '../js/const.js';
import { MAXSPELL, SPE_HEALING, SPE_EXTRA_HEALING, SPE_FORCE_BOLT,
    SPE_STONE_TO_FLESH } from '../js/objects.js';
import { roles } from '../js/roles.js';
import { init_objects } from '../js/o_init.js';
import { dospellmenu, dovspell, show_spells, sortspells, spell_cmp,
    spellsortmenu, spelltypemnemonic, SORTBY_ALPHA, SORTBY_CURRENT,
    SORTBY_LETTER, SORTBY_LVL_LO, SORTBY_LVL_HI, SORTBY_SKL_AL,
    SORTBY_SKL_LO, SORTBY_SKL_HI, SORTRETAINORDER } from '../js/spell.js';

function spellState() {
    // Healer Wisdom15, level1 and basic healing isolate the menu's existing
    // failure/retention helpers. Deliberately nonalphabetical spell order.
    const attributes = new Array(NUM_ATTRS).fill(0); attributes[A_WIS] = 15;
    const state = { urole: roles.find(r => r.filecode === 'Hea'),
        u: { ulevel: 1, acurr: { a: attributes }, weapon_skills:
            Array.from({ length: P_NUM_SKILLS }, () => ({ skill: P_ISRESTRICTED })) },
        svs: { spl_book: Array.from({ length: MAXSPELL + 1 }, () =>
            ({ sp_id: NO_SPELL, sp_lev: 0, sp_know: 0 })) },
        iflags: {}, flags: {}, gs: { spl_sortmode: 0, spl_orderindx: null } };
    state.u.weapon_skills[P_HEALING_SPELL].skill = P_BASIC;
    init_objects(state, () => 0); // Fixed catalog setup, no RNG in comparator.
    [SPE_HEALING, SPE_STONE_TO_FLESH, SPE_EXTRA_HEALING, SPE_FORCE_BOLT]
        .forEach((id, i) => { state.svs.spl_book[i] = {
            sp_id: id, sp_lev: state.objects[id].oc_level, sp_know: 20_000 - i,
        }; });
    return state;
}

// C object levels: healing/force bolt1; extra healing/stone to flesh3.
// Attack precedes healing in skill enums; ties compare case-folded names.
test('spell_cmp pins each source sort mode and pointer-order fallback', () => {
    const state = spellState();
    const pairs = [
        [SORTBY_LETTER, 2, 1, 1], [SORTBY_ALPHA, 2, 0, -1],
        [SORTBY_LVL_LO, 0, 2, -2], [SORTBY_LVL_HI, 0, 2, 2],
        [SORTBY_SKL_AL, 3, 0, state.objects[SPE_FORCE_BOLT].oc_skill
            - state.objects[SPE_HEALING].oc_skill],
        [SORTBY_SKL_LO, 0, 2, -2], [SORTBY_SKL_HI, 0, 2, 2],
    ];
    for (const [mode,a,b,result] of pairs) {
        state.gs.spl_sortmode = mode;
        assert.equal(spell_cmp(a,b,state), result, `mode ${mode}`);
    }
    state.gs.spl_sortmode = SORTBY_CURRENT;
    assert.equal(spell_cmp(3,0,state,0,3), -1);
    assert.equal(spell_cmp(0,3,state,3,0), 1);
    assert.equal(spell_cmp(0,0,state,2,2), 0);
});

test('sortspells separates display order from retained casting letters', () => {
    const state = spellState(); const original = structuredClone(state.svs.spl_book);
    sortspells(state); assert.equal(state.gs.spl_orderindx, null);
    state.gs.spl_sortmode = SORTRETAINORDER;
    sortspells(state); assert.equal(state.gs.spl_orderindx, null);
    state.gs.spl_sortmode = SORTBY_ALPHA; sortspells(state);
    assert.deepEqual(state.gs.spl_orderindx.slice(0,4), [2,3,0,1]);
    assert.equal(state.gs.spl_orderindx.length, MAXSPELL);
    assert.deepEqual(state.svs.spl_book, original);
    const order = state.gs.spl_orderindx.slice();
    state.gs.spl_sortmode = SORTBY_CURRENT; sortspells(state);
    assert.deepEqual(state.gs.spl_orderindx, order);
    state.gs.spl_sortmode = SORTRETAINORDER; sortspells(state);
    assert.deepEqual(state.svs.spl_book.slice(0,4).map(s=>s.sp_id),
        [SPE_EXTRA_HEALING,SPE_FORCE_BOLT,SPE_HEALING,SPE_STONE_TO_FLESH]);
    assert.equal(state.gs.spl_sortmode, SORTBY_LETTER);
    assert.deepEqual(state.gs.spl_orderindx,
        Array.from({length:MAXSPELL},(_,i)=>i));
    assert.deepEqual(state.svs.spl_book.slice(4), original.slice(4));
    assert.notEqual(state.svs.spl_book[0], original[2]);
});

test('sortspells leaves zero/one spell books untouched', () => {
    for (const n of [0,1]) { // C returns when count <2 before allocation.
        const s=spellState(); s.svs.spl_book[n].sp_id=NO_SPELL;
        s.gs.spl_sortmode=SORTBY_ALPHA; sortspells(s);
        assert.equal(s.gs.spl_orderindx,null);
    }
});

test('sort menu preserves nine source choices, default and zero selection', async () => {
    const s=spellState(); let rows;
    assert.equal(await spellsortmenu(s,(items)=>{rows=items;return 2;}),true);
    assert.equal(s.gs.spl_sortmode,SORTBY_ALPHA);
    assert.deepEqual(rows.filter(i=>i.value).map(i=>i.selector),
        ['a','b','c','d','e','f','g','h','z']);
    assert.equal(rows[8].text,''); assert.equal(rows[0].selected,true);
    // Selecting the current letter explicitly deselects it; Enter retains it.
    assert.equal(await spellsortmenu(s,()=>2),false);
    assert.equal(await spellsortmenu(s,(_i,_h,_p,_s,selection)=>selection.preselected),true);
    assert.equal(await spellsortmenu(s,()=>null),false);
    // Source n>1 skips a retained preselection before the new choice.
    assert.equal(await spellsortmenu(s,()=>[{value:2},{value:4}]),true);
    assert.equal(s.gs.spl_sortmode,SORTBY_LVL_HI);
});

test('preselected spell menu consumes retained, deselected and alternate returns', async () => {
    const s=spellState();
    assert.deepEqual(await dospellmenu('swap',0,s,()=>1),{ok:true,spell_no:0});
    assert.deepEqual(await dospellmenu('swap',0,s,()=>null),{ok:true,spell_no:0});
    assert.deepEqual(await dospellmenu('swap',0,s,(_i,_h,_p,_s,o)=>o.preselected),
        {ok:false,spell_no:0});
    assert.deepEqual(await dospellmenu('swap',0,s,()=>[{value:1},{value:3}]),
        {ok:true,spell_no:2});
});

test('dovspell sorts, swaps whole records, and clears temporary state', async () => {
    const s=spellState(); const book=structuredClone(s.svs.spl_book);
    const choices=[MAXSPELL+1,2,1,3,null]; const rows=[];
    assert.equal(await dovspell(s,{menu:(items)=>{rows.push(items);return choices.shift();}}),ECMD_OK);
    assert.deepEqual(rows[2].slice(1,5).map(i=>i.value),[3,4,1,2]);
    assert.deepEqual(s.svs.spl_book[0],book[2]);
    assert.deepEqual(s.svs.spl_book[2],book[0]);
    assert.equal(s.gs.spl_orderindx,null); assert.equal(s.gs.spl_sortmode,0);
});

test('dospellmenu preserves sorted letters and unsorted wizard knowledge index', async () => {
    const s=spellState();s.wizard=true;s.gs.spl_sortmode=SORTBY_ALPHA;sortspells(s);
    await dospellmenu('view',-1,s,(items)=>{
        assert.equal(items[1].selector,'c');
        assert.equal(items[1].label.endsWith(' 20000'),true);
        return null;
    });
});

test('show_spells retains source DUMP layout and no-spells messages', async () => {
    const s=spellState(), messages=[];let heading;
    await show_spells(s,{message:m=>messages.push(m),menu:items=>{heading=items[0].text;return null;}});
    assert.deepEqual(messages,['Spells:']);assert.equal(heading.startsWith('Name'),true);
    s.svs.spl_book[0].sp_id=NO_SPELL;messages.length=0;
    await show_spells(s,{message:m=>messages.push(m)});
    assert.deepEqual(messages,["You didn't know any spells.",'']);
    // Inactive end.c caller still belongs to this selected complete range.
    const config=readFileSync(new URL('../nethack-c/upstream/include/config.h',import.meta.url),'utf8');
    assert.match(config,/\/\* #define DUMPLOG \*\//u);
    assert.equal(spelltypemnemonic(-1),''); // C default discarded impossible then "".
});

test('spell sorting source pins mode names, stable ties and the full retain loop', () => {
    const c=readFileSync(new URL('../nethack-c/upstream/src/spell.c',import.meta.url),'utf8');
    const global=readFileSync(new URL('../nethack-c/upstream/include/global.h',import.meta.url),'utf8');
    const patch=readFileSync(new URL('../nethack-c/patches/002-deterministic-qsort.patch',import.meta.url),'utf8');
    assert.match(c,/SORTBY_LETTER = 0,[\s\S]*SORTRETAINORDER,[\s\S]*NUM_SPELL_SORTBY/u);
    assert.match(c,/return strcmpi\(OBJ_NAME\(objects\[otyp1\]\), OBJ_NAME\(objects\[otyp2\]\)\)/u);
    assert.match(c,/tmp_book\[i\] = svs.spl_book\[gs.spl_orderindx\[i\]\]/u);
    assert.match(c,/if \(gs.spl_sortmode == SORTBY_CURRENT\)\s*return;/u);
    assert.match(global,/#define strcmpi\(a, b\) strncmpi\(\(a\), \(b\), -1\)/u);
    assert.match(patch,/preserving original order[\s\S]*equal-key elements/u);
    const js=readFileSync(new URL('../js/cmd.js',import.meta.url),'utf8');
    assert.match(js,/case 'dovspell':\s*return await runShowspellsCommand\(key, state\);/u);
});
