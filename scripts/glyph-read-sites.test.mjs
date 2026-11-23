// Checks that each function in js/ touches the same one of a map square's two
// glyphs as its C function does.
//
// C keeps levl[x][y].glyph, what the hero remembers, apart from the glyph
// display.c last drew, which glyph_at() returns. They differ whenever a
// square is drawn without being remembered: a monster, the hero, a warning,
// a detection overlay, the blank squares under_water() draws beside a
// submerged hero. The port keeps them as `remembered_glyph` and `disp_glyph`.
// Reading the wrong one has cost screens three times: a second 'I' drawn for
// a blind submerged hero (uhitm.c do_attack()), an 'I' left behind by a
// pushed boulder and by a wand of probing (hack.c dopush(), zap.c bhit()),
// and a missing "Push the boulder" menu entry (cmd.c
// there_cmd_menu_next2u()).
//
// scripts/glyph-read-sites.mjs lists every function that touches either
// glyph, in C and in js/, however the access is spelled. SITES below pairs
// each JS function with its C functions, and the tests fail when
//
//   - a JS function touches a glyph and is not listed, or is listed and no
//     longer does, or does so a different number of times;
//   - a listed C function does not touch that kind of glyph;
//   - a C function touches a glyph and no entry or UNPORTED row names it.
//
// To change a count or add an entry, read the C function and confirm that
// each access in the JS function reads the kind C reads at that line. The
// count catches a swap inside a function that uses both kinds; it cannot
// tell which line swapped, so compare them all.

import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { cGlyphSites, jsGlyphSites } from './glyph-read-sites.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const C_SITES = cGlyphSites(join(ROOT, 'nethack-c', 'upstream', 'src'));
const JS_SITES = jsGlyphSites(join(ROOT, 'js'));

const OTHER = { remembered: 'drawn', drawn: 'remembered' };

// One row per JS function and kind: [file, function, kind, count, C sites,
// note]. A C site is 'file.c function' and has the row's kind. The count is
// the number of matches scripts/glyph-read-sites.mjs finds in the function,
// reads and writes alike, as the file stood when the row was last compared
// with C. A row with no C site needs a note saying why.
const SITES = [
    ['apply.js', 'get_valid_polearm_position', 'drawn', 1,
        ['apply.c get_valid_polearm_position']],
    ['apply.js', 'find_poleable_mon', 'drawn', 1, ['apply.c find_poleable_mon']],
    // apply.c:3138; the port splits use_whip()'s whipattack label out.
    ['apply.js', 'whipattack', 'remembered', 1, ['apply.c use_whip']],
    ['apply.js', 'use_pole', 'drawn', 1, ['apply.c use_pole']],
    ['apply.js', 'use_leash_core', 'remembered', 1, ['apply.c use_leash_core']],
    ['apply.js', 'its_dead', 'drawn', 1, ['apply.c its_dead']],
    ['artifacts.js', 'count_surround_traps', 'drawn', 1,
        ['artifact.c count_surround_traps']],
    // Every read of levl[x][y].glyph into u.bglyph or u.cglyph.
    ['ball.js', 'memoryGlyph', 'remembered', 1,
        ['ball.c placebc_core', 'ball.c set_bc', 'ball.c move_bc',
            'ball.c drop_ball']],
    ['ball.js', 'unplacebc_core', 'remembered', 2, ['ball.c unplacebc_core']],
    ['ball.js', 'move_bc', 'remembered', 6, ['ball.c move_bc']],
    ['ball.js', 'drop_ball', 'remembered', 1, ['ball.c drop_ball']],
    ['bones.js', 'savebones', 'remembered', 1, ['bones.c savebones']],
    ['cmd.js', 'selectionBoundsSeen', 'drawn', 2,
        ['cmd.c u_have_seen_bounds_selection']],
    ['cmd.js', 'u_have_seen_whole_selection', 'drawn', 1,
        ['cmd.c u_have_seen_whole_selection']],
    // cmd.c:4576, the remembered boulder, and 4612, the drawn 'I'.
    ['cmd.js', 'there_cmd_menu_next2u', 'remembered', 1,
        ['cmd.c there_cmd_menu_next2u']],
    ['cmd.js', 'there_cmd_menu_next2u', 'drawn', 1,
        ['cmd.c there_cmd_menu_next2u']],
    ['cmd.js', 'there_cmd_menu_common', 'drawn', 1,
        ['cmd.c there_cmd_menu_common']],
    ['detect.js', 'reveal_terrain_getglyph_steps', 'remembered', 1,
        ['detect.c reveal_terrain_getglyph']],
    ['detect.js', 'reveal_terrain_getglyph_steps', 'drawn', 1,
        ['detect.c reveal_terrain_getglyph']],
    ['detect.js', 'check_map_spot', 'drawn', 1, ['detect.c check_map_spot']],
    ['detect.js', 'object_detect', 'drawn', 1, ['detect.c object_detect']],
    ['detect.js', 'display_trap_map', 'drawn', 1, ['detect.c display_trap_map']],
    ['detect.js', 'furniture_detect', 'drawn', 2, ['detect.c furniture_detect']],
    ['detect.js', 'show_map_spot_steps', 'drawn', 1, ['detect.c show_map_spot']],
    ['detect.js', 'show_map_spot_steps', 'remembered', 1,
        ['detect.c show_map_spot']],
    ['detect.js', 'do_vicinity_map', 'drawn', 5, ['detect.c do_vicinity_map']],
    // detect.c:1947, find_trap()'s test after feel_newsym().
    ['detect.js', 'defaultFoundTrapDisplay', 'remembered', 1,
        ['detect.c find_trap']],
    ['detect.js', 'mfind0', 'remembered', 1, ['detect.c mfind0']],
    ['detect.js', 'trapped_chest_at', 'drawn', 1, ['detect.c trapped_chest_at']],
    ['detect.js', 'trapped_door_at', 'drawn', 1, ['detect.c trapped_door_at']],
    ['detect.js', 'findone', 'remembered', 1, ['detect.c findone']],
    ['display.js', 'display_monster', 'remembered', 2,
        ['display.c display_monster', 'display.c map_object']],
    ['display.js', 'show_mon_or_warn', 'remembered', 1,
        ['display.c show_mon_or_warn']],
    ['display.js', 'show_glyph_cell', 'drawn', 3, ['display.c show_glyph']],
    ['display.js', 'flash_glyph_at', 'remembered', 1,
        ['display.c flash_glyph_at']],
    ['display.js', 'glyph_at', 'drawn', 2, ['display.c glyph_at']],
    ['display.js', 'feel_location_steps', 'remembered', 6,
        ['display.c feel_location']],
    // `show_glyph(x, y, lev->glyph = cmap_to_glyph(idx))`.
    ['display.js', 'showRememberedCmap', 'remembered', 1,
        ['display.c feel_location', 'display.c newsym']],
    // _map_location()'s engraving arm.
    ['display.js', 'map_location_steps', 'remembered', 1,
        ['display.c map_engraving']],
    ['display.js', 'map_object', 'remembered', 1, ['display.c map_object']],
    ['display.js', 'mapInvisibleMemory', 'remembered', 1,
        ['display.c map_invisible']],
    ['display.js', 'unmap_invisible', 'remembered', 1,
        ['display.c unmap_invisible']],
    ['display.js', 'map_trap', 'remembered', 1, ['display.c map_trap']],
    ['display.js', 'map_background_steps', 'remembered', 1,
        ['display.c map_background']],
    ['display.js', 'magic_map_background_steps', 'remembered', 2,
        ['display.c magic_map_background']],
    ['display.js', 'map_engraving', 'remembered', 1, ['display.c map_engraving']],
    ['display.js', 'unmap_object', 'remembered', 3, ['display.c unmap_object']],
    ['display.js', 'see_nearby_objects', 'remembered', 1,
        ['display.c see_nearby_objects']],
    // newsym() with the _map_location() writes it reaches inlined.
    ['display.js', 'newsym_steps', 'remembered', 7,
        ['display.c newsym', 'display.c mon_overrides_region',
            'display.c map_object', 'display.c map_trap',
            'display.c map_background']],
    ['display.js', 'see_traps', 'drawn', 1, ['display.c see_traps']],
    ['display.js', 'redraw_map', 'drawn', 1, ['display.c redraw_map']],
    ['display.js', 'docrt', 'remembered', 1, ['display.c docrt_flags']],
    ['display.js', 'reglyph_darkroom', 'remembered', 6,
        ['display.c reglyph_darkroom']],
    // wintty.c docorner() redraws through row_refresh().
    ['display.js', 'docorner', 'drawn', 3, ['display.c row_refresh']],
    ['display.js', '<top>', 'drawn', 1, [],
        'SCREEN_BUFFER_FIELDS, the list of fields that make up a gbuf entry'],
    ['display.js', 'commitFlushedGlyph', 'drawn', 1, ['display.c flush_screen']],
    ['display.js', '_buildScreenOutput', 'drawn', 2, ['display.c flush_screen']],
    ['display.js', 'cls', 'drawn', 1, [],
        'display.c clear_glyph_buffer() assigns whole gbuf entries, which the '
        + 'C scan does not match'],
    ['do.js', 'dodown', 'remembered', 1, ['do.c dodown']],
    ['do_name.js', 'do_mgivenname', 'drawn', 1, ['do_name.c do_mgivenname']],
    ['do_name.js', 'namefloorobj', 'drawn', 1, ['do_name.c namefloorobj']],
    ['dogmove.js', 'quickmimic', 'drawn', 2, ['dogmove.c quickmimic']],
    ['dogmove.js', 'dog_move', 'remembered', 1, ['dogmove.c dog_move']],
    ['dokick.js', 'dokick', 'drawn', 2, ['dokick.c dokick']],
    ['dothrow.js', 'hurtle_step', 'drawn', 1, ['dothrow.c hurtle_step']],
    // One read; the second match is the fallback for an injected reader.
    ['fountain.js', 'dryup', 'drawn', 2, ['fountain.c dryup']],
    ['game.js', 'makeLocation', 'remembered', 1, [],
        'the initial value of a location, undefined for GLYPH_UNEXPLORED; C '
        + 'copies a zeroed struct rm in mklev.c clear_level_structures()'],
    ['getpos.js', 'gather_locs_interesting', 'drawn', 1,
        ['getpos.c gather_locs_interesting']],
    // The IS_UNEXPLORED_LOC() macro, defined above the function.
    ['getpos.js', 'gather_locs_interesting', 'remembered', 1, ['getpos.c <top>']],
    // getpos.c:1075 and 1085, getpos()'s search for a map symbol.
    ['getpos.js', 'findTerrainFeature_steps', 'drawn', 1, ['getpos.c getpos']],
    ['getpos.js', 'findTerrainFeature_steps', 'remembered', 1,
        ['getpos.c getpos']],
    ['getpos.js', 'getpos', 'drawn', 3, ['getpos.c getpos']],
    ['hack.js', 'dopush', 'remembered', 1, ['hack.c dopush']],
    ['hack.js', 'moverock_core', 'drawn', 3, ['hack.c moverock_core']],
    ['hack.js', 'is_valid_travelpt', 'drawn', 1, ['hack.c is_valid_travelpt']],
    ['hack.js', 'domove_fight_empty', 'drawn', 2, ['hack.c domove_fight_empty']],
    ['hack.js', 'domove_core', 'drawn', 1, ['hack.c domove_core']],
    ['lock.js', 'pick_lock', 'remembered', 2, ['lock.c pick_lock']],
    ['lock.js', 'doopen_indir', 'remembered', 2, ['lock.c doopen_indir']],
    ['lock.js', 'doclose', 'remembered', 2, ['lock.c doclose']],
    ['mkmaze.js', 'resetAirLocation', 'remembered', 1, [],
        'mkmaze.c assigns a whole struct rm (water_pos, air_pos at '
        + '1541-1545), which the C scan does not match'],
    ['mkmaze.js', 'setup_waterlevel', 'remembered', 1,
        ['mkmaze.c setup_waterlevel']],
    ['mon.js', 'mondead', 'remembered', 1, ['mon.c mondead']],
    ['mon.js', 'monstone', 'remembered', 1, ['mon.c monstone']],
    ['pager.js', 'mhidden_description', 'remembered', 1,
        ['pager.c mhidden_description']],
    ['pager.js', 'mhidden_description', 'drawn', 1,
        ['pager.c mhidden_description']],
    ['pager.js', 'look_all', 'drawn', 1, ['pager.c look_all']],
    ['pager.js', 'look_traps', 'drawn', 1, ['pager.c look_traps']],
    ['pager.js', 'look_engrs', 'drawn', 1, ['pager.c look_engrs']],
    ['pager.js', 'lookat', 'drawn', 1, ['pager.c lookat']],
    ['pager.js', 'do_screen_description', 'drawn', 1,
        ['pager.c do_screen_description']],
    // The glyph do_screen_description() looked at, read again for putmixed().
    ['pager.js', 'do_look', 'drawn', 1, ['pager.c do_screen_description']],
    ['pager.js', 'doidtrap', 'drawn', 1, ['pager.c doidtrap']],
    ['potion.js', 'mongrantswish', 'drawn', 1, ['potion.c mongrantswish']],
    ['potion.js', 'peffect_monster_detection', 'remembered', 1,
        ['potion.c peffect_monster_detection']],
    ['sounds.js', 'mon_is_gecko', 'drawn', 1, ['sounds.c mon_is_gecko']],
    // One read; the second match is the fallback for an injected reader.
    ['sounds.js', 'tiphat', 'drawn', 2, ['sounds.c tiphat']],
    ['sp_lev.js', 'flip_visuals', 'remembered', 2, ['sp_lev.c flip_visuals']],
    ['startup_a11y.js', '<top>', 'drawn', 1, [],
        'the list of gbuf fields the glyph-update notices snapshot'],
    ['startup_a11y.js', 'captureBufferedLocation', 'drawn', 2, [],
        'snapshots a gbuf entry for the glyph-update notices'],
    ['startup_a11y.js', 'sameBufferedPresentation', 'drawn', 3, [],
        'compares two gbuf snapshots'],
    ['startup_a11y.js', 'restoreGlyphBuffer', 'drawn', 1, [],
        'restores a gbuf snapshot'],
    ['startup_a11y.js', 'applyGlyphFrameChanges', 'drawn', 1, [],
        'restores a gbuf snapshot'],
    ['startup_a11y.js', 'bufferedGlyphSubjectAt', 'remembered', 1,
        ['pager.c mhidden_description']],
    ['startup_a11y.js', 'bufferedGlyphSubjectAt', 'drawn', 1,
        ['pager.c mhidden_description']],
    ['startup_a11y.js', 'visibleSubjectAt', 'drawn', 1, ['cmd.c dolookaround']],
    ['startup_a11y.js', 'collectLookaroundMessages', 'drawn', 1,
        ['cmd.c dolookaround']],
    ['uhitm.js', 'flash_hits_mon', 'drawn', 2, ['uhitm.c flash_hits_mon']],
    ['uhitm.js', 'that_is_a_mimic', 'drawn', 1, ['uhitm.c that_is_a_mimic']],
    ['uhitm.js', 'stumble_onto_mimic', 'remembered', 1,
        ['uhitm.c stumble_onto_mimic']],
    ['uhitm.js', 'attack_checks', 'drawn', 1, ['uhitm.c attack_checks']],
    ['uhitm.js', 'do_attack', 'remembered', 1, ['uhitm.c do_attack']],
    ['uhitm.js', 'hitum_cleave', 'remembered', 1, ['uhitm.c hitum_cleave']],
    ['wizcmds.js', 'wiz_smell', 'drawn', 1, ['wizcmds.c wiz_smell']],
    ['zap.js', 'zap_map', 'drawn', 2, ['zap.c zap_map']],
    ['zap.js', 'bhit', 'drawn', 1, ['zap.c bhit']],
    // zap.c:4040, the wand of probing arm, and 4083.
    ['zap.js', 'bhit', 'remembered', 2, ['zap.c bhit']],
];

// JS functions that touch the other glyph than their C function does: the
// same row shape, but each C site has the opposite kind. Remove the row here
// and add one to SITES when the function is fixed or deleted.
const DIFFERENT = [
];

// C functions that touch a glyph and have no JS site, with the reason.
const UNPORTED = new Map([
    ['allmain.c do_positionbar remembered',
        'compiled only with POSITIONBAR, which the recorder does not define'],
    ['nhlua.c nhl_getmap remembered', 'nhl_getmap() is not ported'],
    ['display.c <top> drawn',
        'the _glyph_at() and Glyphinfo_at() macro definitions'],
    ['display.c get_bkglyph_and_framecolor drawn',
        'the background-glyph half runs only with iflags.use_background_glyph, '
        + 'which tty never sets; js/display.js map_framecolor() ports the rest'],
]);

const siteKey = ([file, name, kind]) => `${file} ${name} ${kind}`;

test('SITES and DIFFERENT list every glyph access in js/ with its count', () => {
    const listed = new Map(
        [...SITES, ...DIFFERENT].map((row) => [siteKey(row), row[3]]),
    );
    assert.equal(listed.size, SITES.length + DIFFERENT.length, 'duplicate row');
    assert.deepEqual(
        [...JS_SITES].sort(([a], [b]) => a.localeCompare(b)),
        [...listed].sort(([a], [b]) => a.localeCompare(b)),
        'a function in js/ touches remembered_glyph, disp_glyph or glyph_at '
        + 'differently from its row in SITES; compare it with its C function '
        + 'as the comment at the top of this file says, then update the row',
    );
});

test('each listed C function touches the glyph its row says', () => {
    for (const row of SITES) {
        const [, , kind, , cSites, note] = row;
        if (cSites.length === 0) {
            assert.ok(note, `${siteKey(row)}: a row with no C site needs a note`);
            continue;
        }
        for (const cSite of cSites) {
            assert.ok(C_SITES.has(`${cSite} ${kind}`),
                `${siteKey(row)}: ${cSite} has no ${kind} glyph access`);
        }
    }
    for (const row of DIFFERENT) {
        const [, , kind, , cSites] = row;
        assert.ok(cSites.length > 0, `${siteKey(row)}: needs its C site`);
        for (const cSite of cSites) {
            assert.ok(C_SITES.has(`${cSite} ${OTHER[kind]}`),
                `${siteKey(row)}: ${cSite} has no ${OTHER[kind]} glyph access`);
            assert.ok(!C_SITES.has(`${cSite} ${kind}`),
                `${siteKey(row)}: ${cSite} also has a ${kind} access; `
                + 'compare by hand and move the row to SITES if they agree');
        }
    }
});

test('every C function that touches a glyph has a JS site or a reason', () => {
    const covered = new Set(UNPORTED.keys());
    for (const [, , kind, , cSites] of SITES)
        for (const cSite of cSites) covered.add(`${cSite} ${kind}`);
    for (const [, , kind, , cSites] of DIFFERENT)
        for (const cSite of cSites) covered.add(`${cSite} ${OTHER[kind]}`);
    const missing = [...C_SITES.keys()].filter((key) => !covered.has(key));
    assert.deepEqual(missing, []);
    for (const key of UNPORTED.keys())
        assert.ok(C_SITES.has(key), `UNPORTED names ${key}, which C lacks`);
});

test('the exception counts are the ones last reviewed', () => {
    // 0 since js/startup_a11y.js's unreachable copies of
    // selectionBoundsSeen() and describeKnownRoom() were deleted. A new row
    // needs the same review a new SITES row does.
    assert.equal(DIFFERENT.length, 0);
    // 4: POSITIONBAR, nhl_getmap(), display.c's macros, and the background
    // glyph. A new row needs its reason.
    assert.equal(UNPORTED.size, 4);
    // 9: SCREEN_BUFFER_FIELDS, cls(), makeLocation(), resetAirLocation() and
    // five glyph-buffer snapshot helpers in js/startup_a11y.js.
    assert.equal(SITES.filter((row) => row[4].length === 0).length, 9);
});

test('the scan finds the access however it is spelled', () => {
    // The spellings the scan must count, one site each. For the drawn glyph:
    // a glyph_at() call, a glyph_at reference kept as a fallback, and a
    // direct disp_glyph read. For the remembered one: a read and a write.
    assert.ok(JS_SITES.has('dothrow.js hurtle_step drawn'));
    assert.ok(JS_SITES.has('sounds.js tiphat drawn'));
    assert.ok(JS_SITES.has('potion.js mongrantswish drawn'));
    assert.ok(JS_SITES.has('do.js dodown remembered'));
    assert.ok(JS_SITES.has('bones.js savebones remembered'));
    // The C spellings: levl[x][y].glyph, lev->glyph, door->glyph, glyph_at()
    // and display.c's _glyph_at().
    assert.ok(C_SITES.has('hack.c dopush remembered'));
    assert.ok(C_SITES.has('detect.c findone remembered'));
    assert.ok(C_SITES.has('lock.c pick_lock remembered'));
    assert.ok(C_SITES.has('cmd.c there_cmd_menu_next2u drawn'));
    assert.ok(C_SITES.has('display.c see_traps drawn'));
});
