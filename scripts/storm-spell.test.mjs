import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import * as spell from '../js/spell.js';
import * as getpos from '../js/getpos.js';
import {COLNO, ROWNO, ROOM, STONE, DOOR, D_CLOSED, D_ISOPEN, IN_SIGHT, HI_ZAP} from '../js/const.js';
import {NO_COLOR} from '../js/terminal.js';

// Source helpers inspect terrain and vision without changing either. The
// hero at (20,10) leaves room for the C distance-ten boundary on both sides.
function stateAt(typ = ROOM, doormask = 0) {
    const cell = {typ, doormask};
    return {u:{ux:20,uy:10},level:{at:()=>cell},
        viz_array:Array.from({length:ROWNO},()=>Array(COLNO).fill(IN_SIGHT))};
}

test('spell_aim_step pins the C zap-passable and open-door predicate', () => {
    assert.equal(typeof spell.spell_aim_step, 'function');
    assert.equal(spell.spell_aim_step(null, 20, 10, stateAt()), true);
    assert.equal(spell.spell_aim_step(null, 20, 10, stateAt(STONE)), false);
    // rm.h ZAP_POS is typ>=POOL, so even a closed door passes this helper.
    assert.equal(spell.spell_aim_step(null, 20, 10, stateAt(DOOR,D_CLOSED)), true);
    assert.equal(spell.spell_aim_step(null, 20, 10, stateAt(DOOR,D_ISOPEN)), true);
    // isok rejects column zero before looking up terrain.
    assert.equal(spell.spell_aim_step(null, 0, 10, stateAt()), false);
});

test('can_center_spell_location pins distance ten, visibility and stone walls', () => {
    assert.equal(typeof spell.can_center_spell_location, 'function');
    const state=stateAt();
    assert.equal(spell.can_center_spell_location(30,10,state),true);
    assert.equal(spell.can_center_spell_location(31,10,state),false);
    assert.equal(spell.can_center_spell_location(30,20,state),true);
    state.viz_array[10][30]=0; // The same valid terrain is outside sight.
    assert.equal(spell.can_center_spell_location(30,10,state),false);
    assert.equal(spell.can_center_spell_location(20,10,stateAt(STONE)),false);
    assert.equal(spell.can_center_spell_location(20,10,stateAt(DOOR,D_CLOSED)),true);
});

test('throwspell and display_spell_target_positions are canonical whole owners', () => {
    assert.equal(typeof spell.throwspell,'function');
    assert.equal(typeof spell.display_spell_target_positions,'function');
    const source=readFileSync(new URL('../nethack-c/upstream/src/spell.c',import.meta.url),'utf8');
    assert.match(source,/walk_path\(&uc, &cc, spell_aim_step/);
    const js=readFileSync(new URL('../js/spell.js',import.meta.url),'utf8');
    assert.match(js,/await throwspell\(state\)/);
    assert.match(js,/await walk_path\(/);
    assert.doesNotMatch(js,/requires throwspell|throwspell\(\)\/explode\(\) for skilled/);
});

test('getpos_sethilite owns persistent callback mode and redraw publication', async () => {
    assert.equal(typeof getpos.getpos_sethilite,'function');
    // Null callbacks need no map and exercise mode reset and map-frame state.
    const state={iflags:{bgcolors:false}};
    await getpos.getpos_sethilite(null,null,state);
    assert.equal(state.getpos_getvalid,null);
    assert.equal(state.getpos_hilitefunc,null);
    assert.equal(state.getpos_hilite_state,0); // HiliteNormalMap in getpos.c.
    assert.equal(state.defaultHiliteState,0);
    assert.equal(state.gw.wsettings.map_frame_color,NO_COLOR);
    const js=readFileSync(new URL('../js/getpos.js',import.meta.url),'utf8');
    assert.match(js,/await getpos_sethilite\(null, null, state\)/);
    assert.doesNotMatch(js,/let hiliteState = state.iflags/);
});

test('setter scans old locations before publication and new locations after it', async () => {
    const state={iflags:{bgcolors:false}};
    const calls=[];
    const old=()=>{calls.push(state.getpos_getvalid===old?'old':'wrong');return false;};
    const next=()=>{calls.push(state.getpos_getvalid===next?'new':'wrong');return false;};
    await getpos.getpos_sethilite(null,old,state);
    calls.length=0;
    await getpos.getpos_sethilite(null,next,state);
    // getpos.c's x=1..COLNO-1, y=0..ROWNO-1 loops evaluate each predicate
    // once before and once after callback publication, including duplicates.
    const cells=(COLNO-1)*ROWNO;
    assert.equal(calls.length,2*cells);
    assert.deepEqual(calls.slice(0,cells),Array(cells).fill('old'));
    assert.deepEqual(calls.slice(cells),Array(cells).fill('new'));
});

test('setter preserves the current mode for an unchanged callback and resets on change', async () => {
    const state={iflags:{bgcolors:true}};
    const valid=()=>false; // No selected cells require a live glyph buffer.
    await getpos.getpos_sethilite(null,valid,state);
    assert.equal(state.getpos_hilite_state,2); // C HiliteBackground default.
    assert.equal(state.defaultHiliteState,2);
    assert.equal(state.gw.wsettings.map_frame_color,HI_ZAP);
    state.getpos_hilite_state=1; // C SHOWVALID's symbol mode.
    await getpos.getpos_sethilite(null,valid,state);
    assert.equal(state.getpos_hilite_state,1);
    assert.equal(state.gw.wsettings.map_frame_color,NO_COLOR);
    state.iflags.bgcolors=false;
    await getpos.getpos_sethilite(null,null,state);
    assert.equal(state.getpos_hilite_state,0);
    assert.equal(state.defaultHiliteState,0);
});
