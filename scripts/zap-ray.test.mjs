// The aimed ray: zap.c weffects()'s ubuzz() arm and everything dobuzz()
// reaches below it, plus the beam glyph display.c paints for it.
//
// scripts/run-ray-zap.mjs records the same behavior against the C reference.
// These tests pin the values that no fresh case can separate, because the
// value only ever takes one number in a real game: dobuzz()'s `nd`, its
// `type`, zap_hit()'s `ac`, and the 10/20/75 bounce selector no horizontal
// bolt can reach.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    AC_VALUE,
    CORR,
    DOOR,
    D_CLOSED,
    ER_DAMAGED,
    ERODE_BURN,
    EF_GREASE,
    FIRE_RES,
    FROMOUTSIDE,
    HALLUC,
    HALLUC_RES,
    OBJ_FLOOR,
    LAVAPOOL,
    LAVAWALL,
    OBJ_INVENT,
    POOL,
    REFLECTING,
    ROOM,
    STONE,
    VWALL,
} from '../js/const.js';
import {
    GLYPH_INVISIBLE,
    map_glyphinfo,
    zapdir_to_glyph,
} from '../js/display.js';
import { GLYPH_ZAP_OFF } from '../js/glyph_offsets.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { relocate_monster } from '../js/monst.js';
import { AD_ACID, AD_COLD, AD_FIRE, AD_PHYS } from '../js/monsters.js';
import {
    ARMOR_CLASS,
    DWARVISH_CLOAK,
    HAWAIIAN_SHIRT,
    LEATHER_ARMOR,
    LOW_BOOTS,
    RAY,
    SPE_DIG,
    SPE_FINGER_OF_DEATH,
    SPE_MAGIC_MISSILE,
    TOWEL,
    WAN_COLD,
    WAN_DEATH,
    WAN_DIGGING,
    WAN_FIRE,
    WAN_LIGHTNING,
    WAN_MAGIC_MISSILE,
    WAN_SLEEP,
} from '../js/objects.js';
import { enableRngLog, getRngLog } from '../js/rng.js';
// Read straight out of the generated defsym.h index rather than through
// js/symbols.js, so the assertion does not rest on the same `S_vbeam + n`
// arithmetic the arm under test performs.
import { SYMBOL_INDEX_BY_NAME } from '../js/symbol_data.js';
import { cmap_symbol } from '../js/symbols.js';
import { burnarmor, erode_obj } from '../js/trap_erode_obj.js';
import { CLR_BRIGHT_BLUE, CLR_ORANGE, CLR_WHITE } from '../js/terminal.js';
import {
    adtyp_to_prop,
    bounce_dir,
    dobuzz,
    flash_str,
    inventory_resistance_check,
    u_adtyp_resistance_obj,
    weffects,
    zap_hit,
    zaptype,
} from '../js/zap.js';
import {
    RAY_CASES,
    loadRayZapRecipe,
    movesFor,
    movesThroughWish,
} from './run-ray-zap.mjs';

// The matrix's own first segment, replayed here so the always-run suite
// exercises the same keys the C recorder does.
function raySegment(index) {
    const entry = RAY_CASES[index];
    return {
        seed: 20260817,
        datetime: '20260817120000',
        nethackrc: 'OPTIONS=name:RayUnit,role:Wizard,race:human,'
            + 'gender:female,align:neutral,playmode:debug\n'
            + 'OPTIONS=!legacy,!tutorial,!splash_screen\n'
            + 'OPTIONS=pettype:none,!acoustics\n'
            + 'OPTIONS=symset:DECgraphics\n',
        moves: movesFor(entry),
        entry,
    };
}

function topLine() {
    return game.nhDisplay.grid[0].map(({ ch }) => ch).join('').trimEnd();
}

// The recorder cell the map square <x, y> was drawn into. C keeps the
// resolved presentation on the location itself, which is the pair
// win/tty/wintty.c tty_print_glyph() writes to the terminal: the byte and
// whether it is a DEC line-drawing byte.
function mapCell(x, y) {
    const loc = game.level.at(x, y);
    return { ch: loc.disp_ch, color: loc.disp_color, dec: loc.disp_decgfx };
}

test('zaptype folds a monster zap onto the hero band it shares', () => {
    // zap.c zaptype() (88-96). A hero's wand zap is already 0..9 and a hero's
    // spell 10..19, so abs() leaves both alone.
    for (const type of [0, 1, 5, 9, 10, 19, 20, 29]) {
        assert.equal(zaptype(type), type, `${type}`);
    }
    // A monster casting is -19..-10 and breathing -29..-20; abs() alone puts
    // each on the matching hero band.
    assert.equal(zaptype(-11), 11);
    assert.equal(zaptype(-21), 21);
    // A monster's wand zap is -39..-30 rather than -9..-0, because -0 would be
    // the hero's magic missile. +30 is what separates them again.
    assert.equal(zaptype(-30), 0);
    assert.equal(zaptype(-39), 9);
    // The two ends of that window and nothing outside it: -40 is a number no
    // BZ_ macro produces, and abs() is all it gets.
    assert.equal(zaptype(-40), 40);
    assert.equal(zaptype(-29), 29);
});

test('flash_str names the row of flash_types the ray type indexes', () => {
    // zap.c flash_types[] (71-85). The six wand rows a ray wand can select,
    // read from the table rather than from a recording.
    assert.deepEqual(
        [0, 1, 2, 3, 4, 5].map((type) => flash_str(type, false, game)),
        [
            'magic missile', 'bolt of fire', 'bolt of cold', 'sleep ray',
            'death ray', 'bolt of lightning',
        ],
    );
    // The spell band starts at 10 and the breath band at 20, which is what
    // makes "fireball" and "blast of fire" different rows from "bolt of fire".
    assert.equal(flash_str(11, false, game), 'fireball');
    assert.equal(flash_str(21, false, game), 'blast of fire');
    // A monster's wand zap reads its hero row, through zaptype().
    assert.equal(flash_str(-31, false, game), 'bolt of fire');
});

test('zapdir_to_glyph packs the beam direction under its type', () => {
    // display.c zapdir_to_glyph() (2460-2470). "The order of the zap symbols
    // [0-3] as defined in defsym.h are: | S_vbeam (0,1) or (0,-1); - S_hbeam
    // (1,0) or (-1,0); \\ S_lslant (1,1) or (-1,-1); / S_rslant (-1,1) or
    // (1,-1)."
    //
    // The number is on the resolved presentation, so the arithmetic and the
    // arm that reads it back are both checked here.
    const cases = [
        [[0, 1], 0], [[0, -1], 0],
        [[1, 0], 1], [[-1, 0], 1],
        [[1, 1], 2], [[-1, -1], 2],
        [[-1, 1], 3], [[1, -1], 3],
    ];
    for (const [[dx, dy], direction] of cases) {
        // Beam type 1 is fire, so the number is (1 << 2) | direction.
        const resolved = zapdir_to_glyph(dx, dy, 1, game);
        assert.equal(
            resolved.glyph, GLYPH_ZAP_OFF + 4 + direction, `${dx},${dy}`,
        );
    }
    // A vertical bolt has dx == dy == 0, which `(dx == dy) ? 2` catches before
    // the `dx && dy` test: it draws the backslash rather than the pipe.
    assert.equal(zapdir_to_glyph(0, 0, 1, game).glyph, GLYPH_ZAP_OFF + 4 + 2);
    // Beam type 0 is magic missile, the first zapcolors[] entry, so the
    // guard has to admit it.
    assert.equal(zapdir_to_glyph(1, 0, 0, game).glyph, GLYPH_ZAP_OFF + 1);
    // NUM_ZAP is 8, so beam type 8 is one past the last zapcolors[] entry.
    assert.throws(() => zapdir_to_glyph(1, 0, 8, game), RangeError);
    assert.throws(() => zapdir_to_glyph(1, 0, -1, game), RangeError);
});

test('the zap glyph arm reads S_vbeam and zapcolors by its two fields',
    async () => {
    await runSegment({
        ...raySegment(0), moves: movesThroughWish(RAY_CASES[0]),
    });
    // display.c reset_glyphmap()'s GLYPH_ZAP_OFF arm (2877-2883):
    // `gmap->sym.symidx = (S_vbeam + (offset & 0x3)) + SYM_OFF_P` and
    // `zap_color((offset >> 2))`.
    for (const [direction, name] of [
        [0, 's_vbeam'], [1, 's_hbeam'], [2, 's_lslant'], [3, 's_rslant'],
    ]) {
        const expected = cmap_symbol(SYMBOL_INDEX_BY_NAME[name], game);
        const resolved = map_glyphinfo(GLYPH_ZAP_OFF + direction, game);
        assert.equal(resolved.ch, expected.ch, `symbol ${name}`);
        assert.equal(resolved.dec, expected.dec, `DEC flag ${name}`);
    }
    // Under symset:DECgraphics the horizontal beam is the line-drawing `q`
    // and the left slant stays a plain backslash, which is the pair the
    // recorded C screens of a horizontal and a vertical zap show.
    const hbeam = map_glyphinfo(GLYPH_ZAP_OFF + 5, game);
    assert.equal(hbeam.ch, 'q');
    assert.equal(hbeam.dec, true);
    const lslant = map_glyphinfo(GLYPH_ZAP_OFF + 6, game);
    assert.equal(lslant.ch, '\\');
    assert.equal(lslant.dec, false);
    // display.c zapcolors[] (2661-2665) over display.h enum zap_colors
    // (279-287). Types 0, 1 and 2 are the three the ray matrix separates:
    // HI_ZAP is CLR_BRIGHT_BLUE (color.h:55), fire is CLR_ORANGE and frost is
    // CLR_WHITE (display.h:280-282).
    assert.equal(map_glyphinfo(GLYPH_ZAP_OFF + 0, game).color,
        CLR_BRIGHT_BLUE);
    assert.equal(map_glyphinfo(GLYPH_ZAP_OFF + 4, game).color, CLR_ORANGE);
    assert.equal(map_glyphinfo(GLYPH_ZAP_OFF + 8, game).color, CLR_WHITE);
});

test('zap_hit rolls once and compares the roll with the armor class', () => {
    // zap.c zap_hit() (4704-4720). The rn2(20) comes first whatever else
    // happens, and a zero roll is the "small chance for naked target to avoid
    // being hit" arm: rnd(10) < ac.
    const drawn = [];
    const scripted = (rolls) => ({
        rn2: (bound) => { drawn.push(`rn2(${bound})`); return rolls.shift(); },
        rnd: (bound) => { drawn.push(`rnd(${bound})`); return rolls.shift(); },
    });
    // chance 0 then rnd(10) = 8, against ac 9: 8 < 9 hits.
    assert.equal(zap_hit(9, 0, scripted([0, 8])), true);
    assert.deepEqual(drawn, ['rn2(20)', 'rnd(10)']);
    // The same arm with rnd(10) = 9 misses, because the test is strict.
    assert.equal(zap_hit(9, 0, scripted([0, 9])), false);
    // A nonzero roll takes `3 - chance < AC_VALUE(ac)`. Roll 2 against ac 9 is
    // 1 < 9, which hits; the witness's own draw was rn2(20) = 2.
    assert.equal(zap_hit(9, 0, scripted([2])), true);
    // An armor class of 9 is hit by every nonzero roll, because 3 - chance
    // never reaches 9 for a chance rn2(20) can give. An armor class of 0 is
    // what the roll can beat: `3 - chance < 0` needs chance above 3.
    assert.equal(zap_hit(0, 0, scripted([4])), true);
    assert.equal(zap_hit(0, 0, scripted([3])), false);
    // hack.h:1538 AC_VALUE re-rolls a negative armor class, so a hero in
    // heavy armor spends a second draw here. This is the same macro
    // mhitu.c mattacku() uses.
    // rn2(20) = 5 with AC_VALUE(-4) re-rolled to -1: 3 - 5 = -2 is below -1,
    // so even an armor class of -4 is hit. A re-roll of 3 gives -3, which
    // -2 does not reach, and the same bolt misses.
    drawn.length = 0;
    assert.equal(zap_hit(-4, 0, scripted([5, 1])), true);
    assert.deepEqual(drawn, ['rn2(20)', 'rnd(4)']);
    assert.equal(zap_hit(-4, 0, scripted([5, 3])), false);
    assert.equal(AC_VALUE(-4, { rnd: () => 3 }), -3);
});

test('bounce_dir reverses a bolt on a row without drawing for it', () => {
    // zap.c bounce_dir() (4663-4701). `!*ddx || !*ddy` short-circuits the
    // bounceback roll, so a bolt travelling east, west, north or south always
    // reverses and never draws. That is why the recorded log of a horizontal
    // zap carries no bounce roll at all.
    const refuse = {
        rn2: () => { throw new Error('bounce_dir drew for an axial bolt'); },
    };
    assert.deepEqual(bounce_dir(1, 1, 1, 0, 75, game, refuse),
        { dx: -1, dy: 0 });
    assert.deepEqual(bounce_dir(1, 1, 0, -1, 75, game, refuse),
        { dx: 0, dy: 1 });
    // A bounceback of 0 disables the roll even for a diagonal bolt, because
    // the guard is `bounceback > 0 && !rn2(bounceback)`.
    assert.deepEqual(bounce_dir(1, 1, 1, 1, 0, game, refuse),
        { dx: -1, dy: -1 });
});

test('bounce_dir picks a side from the two squares beside the obstacle',
    async () => {
    await runSegment({
        ...raySegment(0), moves: movesThroughWish(RAY_CASES[0]),
    });
    // A diagonal bolt that fails the bounceback roll reads the two squares
    // orthogonally back from the obstacle. Build them by hand: <x, y> is the
    // obstacle, and the bolt arrived travelling south-east.
    const at = (x, y) => game.level.at(x, y);
    const setTyp = (x, y, typ) => { at(x, y).typ = typ; };
    const x = 40;
    const y = 10;
    const saved = [];
    for (const [dx, dy] of [[0, 0], [0, -1], [1, -1], [-1, 0], [-1, 1]])
        saved.push([
            x + dx, y + dy,
            at(x + dx, y + dy).typ, at(x + dx, y + dy).doormask,
        ]);
    const restore = () => {
        for (const [sx, sy, typ, doormask] of saved) {
            setTyp(sx, sy, typ);
            at(sx, sy).doormask = doormask;
        }
    };
    // `bounce` stays 0 when neither side is open, and case 0 falls through
    // into case 1, so both deltas are negated: the bolt goes back the way it
    // came.
    setTyp(x, y, VWALL);
    setTyp(x, y - 1, STONE);
    setTyp(x - 1, y, STONE);
    assert.deepEqual(
        bounce_dir(x, y, 1, 1, 75, game, { rn2: () => 1 }),
        { dx: -1, dy: -1 },
    );
    // Case 1: only the square above the obstacle is open, so the bolt keeps
    // its horizontal delta and reverses the vertical one.
    setTyp(x, y - 1, ROOM);
    assert.deepEqual(
        bounce_dir(x, y, 1, 1, 75, game, { rn2: () => 1 }),
        { dx: 1, dy: -1 },
    );
    // Case 2: only the square behind it is open, so the horizontal delta
    // reverses instead.
    setTyp(x, y - 1, STONE);
    setTyp(x - 1, y, ROOM);
    assert.deepEqual(
        bounce_dir(x, y, 1, 1, 75, game, { rn2: () => 1 }),
        { dx: -1, dy: 1 },
    );
    // With both open, `if (!bounce || rn2(2)) bounce = 2` decides between
    // them, and that is the only place the second draw goes.
    setTyp(x, y - 1, ROOM);
    let drawn = [];
    // The bounceback roll comes first and must not fire, so only the second
    // draw of each call answers `second`.
    const scripted = (second) => {
        let calls = 0;
        return {
            rn2: (bound) => {
                drawn.push(bound);
                calls += 1;
                return calls === 1 ? 1 : second;
            },
        };
    };
    assert.deepEqual(
        bounce_dir(x, y, 1, 1, 75, game, scripted(1)), { dx: -1, dy: 1 },
    );
    assert.deepEqual(drawn, [75, 2]);
    drawn = [];
    assert.deepEqual(
        bounce_dir(x, y, 1, 1, 75, game, scripted(0)), { dx: 1, dy: -1 },
    );
    assert.deepEqual(drawn, [75, 2]);
    // A successful bounceback roll skips all of that and reverses both.
    assert.deepEqual(
        bounce_dir(x, y, 1, 1, 75, game, { rn2: () => 0 }),
        { dx: -1, dy: -1 },
    );
    // A closed door on a side square is not an opening, even though its
    // terrain passes ZAP_POS: the `!closed_door()` term is what rejects it.
    setTyp(x, y - 1, DOOR);
    at(x, y - 1).doormask = D_CLOSED;
    setTyp(x - 1, y, STONE);
    assert.deepEqual(
        bounce_dir(x, y, 1, 1, 75, game, { rn2: () => 1 }),
        { dx: -1, dy: -1 },
    );
    at(x, y - 1).doormask = 0;
    // A corridor passes ZAP_POS and fails IS_ROOM, so the side is open only
    // if the square beyond it, in the direction the bolt was travelling, is
    // open too. With stone beyond it, neither side counts.
    setTyp(x, y - 1, CORR);
    setTyp(x + 1, y - 1, STONE);
    assert.deepEqual(
        bounce_dir(x, y, 1, 1, 75, game, { rn2: () => 1 }),
        { dx: -1, dy: -1 },
    );
    // Open that square beyond and the side counts again.
    setTyp(x + 1, y - 1, ROOM);
    assert.deepEqual(
        bounce_dir(x, y, 1, 1, 75, game, { rn2: () => 1 }),
        { dx: 1, dy: -1 },
    );
    // The mirrored pair, for the square the bolt came from horizontally.
    setTyp(x, y - 1, STONE);
    setTyp(x - 1, y, CORR);
    setTyp(x - 1, y + 1, STONE);
    assert.deepEqual(
        bounce_dir(x, y, 1, 1, 75, game, { rn2: () => 1 }),
        { dx: -1, dy: -1 },
    );
    setTyp(x - 1, y + 1, ROOM);
    assert.deepEqual(
        bounce_dir(x, y, 1, 1, 75, game, { rn2: () => 1 }),
        { dx: -1, dy: 1 },
    );
    restore();
});

test('an unprotected pack rolls nothing when fire looks for a resistance',
    async () => {
    await runSegment({
        ...raySegment(0), moves: movesThroughWish(RAY_CASES[0]),
    });
    // zap.c adtyp_to_prop() (5653-5674).
    assert.equal(adtyp_to_prop(AD_FIRE), 1); // FIRE_RES
    assert.equal(adtyp_to_prop(AD_COLD), 2); // COLD_RES
    assert.equal(adtyp_to_prop(AD_ACID), 7); // ACID_RES
    // A damage type no resistance covers answers 0, which is what makes
    // inventory_resistance_check() return without drawing.
    assert.equal(adtyp_to_prop(AD_PHYS), 0);
    // zap.c u_adtyp_resistance_obj() (5675-5698). A starting Wizard wears a
    // cloak of magic resistance and carries nothing that grants extrinsic
    // fire resistance, so the answer is 0.
    assert.equal(u_adtyp_resistance_obj(AD_FIRE, game), 0);
    const refuse = {
        rn2: () => { throw new Error('an unprotected pack rolled'); },
    };
    assert.equal(inventory_resistance_check(AD_FIRE, game, refuse), false);
    // "worn dwarvish cloaks give 90% protection against heat and cold to
    // carried items", and against nothing else.
    const worn = game.uarmc;
    const savedOtyp = worn.otyp;
    worn.otyp = DWARVISH_CLOAK;
    assert.equal(u_adtyp_resistance_obj(AD_FIRE, game), 90);
    assert.equal(u_adtyp_resistance_obj(AD_COLD, game), 90);
    assert.equal(u_adtyp_resistance_obj(AD_ACID, game), 0);
    // The roll is `rn2(100) < prob`, so 89 protects and 90 does not.
    assert.equal(
        inventory_resistance_check(AD_FIRE, game, { rn2: () => 89 }), true,
    );
    assert.equal(
        inventory_resistance_check(AD_FIRE, game, { rn2: () => 90 }), false,
    );
    worn.otyp = savedOtyp;
    // "items that give an extrinsic resistance when worn or wielded or
    // carried give 99% protection". W_ARMC is inside the W_ARMOR mask the
    // 99% arm tests.
    game.u.uprops[1].extrinsic = 0x00000002; // FIRE_RES, W_ARMC
    assert.equal(u_adtyp_resistance_obj(AD_FIRE, game), 99);
    game.u.uprops[1].extrinsic = 0;
});

test('weffects hands the ray six dice, and magic missile two', async () => {
    // zap.c weffects():3463-3465. Nothing a player can see separates those
    // two numbers from any other pair: the only reader of `nd` this port
    // reaches is zhitu()'s `d(nd, 6)`, and only the fire arm of zhitu() is
    // ported, so the 2 has no live consumer at all. Read the call site.
    const zapSource = readFileSync(
        new URL('../nethack-c/upstream/src/zap.c', import.meta.url), 'utf8',
    );
    assert.ok(zapSource.includes(
        'ubuzz(BZ_U_WAND(BZ_OFS_WAN(otyp)),\n'
        + '                  (otyp == WAN_MAGIC_MISSILE) ? 2 : 6);',
    ), 'zap.c still passes 2 for magic missile and 6 for every other ray');
    // The 6 does have a live consumer, and this is it. A downward zap is the
    // shortest route to zhitu(): dobuzz() forces the range to 1 for a bolt
    // with no horizontal delta, so the first square the loop visits is the
    // hero's own and the bolt hits without bouncing first.
    const rolled = [];
    const random = {
        d: (n, x) => { rolled.push([n, x]); return n; },
        rn1: (x, y) => y,
        rn2: () => 1, // never zero: zap_hit() hits and burnarmor() picks the
                      // cloak slot, which is what ends the bolt in zhitu()
        rnd: (x) => x,
        rnl: () => 1,
    };
    await runSegment({
        ...raySegment(0), moves: movesThroughWish(RAY_CASES[0]),
    });
    game.u.dx = 0;
    game.u.dy = 0;
    game.u.dz = 1;
    const wand = {
        otyp: WAN_FIRE, oclass: game.objects[WAN_FIRE].oc_class, quan: 1,
    };
    await assert.rejects(
        () => weffects(wand, game, random),
        /destroy_items\(\) and ignite_items\(\) for the burning hero/u,
    );
    assert.deepEqual(rolled, [[6, 6]]);
});

test('a wand of fire aimed at a wall burns the hero it bounces back onto',
    async () => {
    // The production path end to end, over the same keys
    // scripts/run-ray-zap.mjs records against C: wish, zap, aim west.
    enableRngLog();
    await runSegment(raySegment(0));
    // The turn's three messages. The third does not fit on the top line, so
    // the top line shows the first two behind the --More-- that message
    // raised, exactly as C's recording does.
    assert.equal(
        topLine(),
        'The bolt of fire bounces!  The bolt of fire hits you!--More--',
    );
    // Every draw the ray made, in source order: exercise(A_WIS, TRUE) from
    // weffects(), rn1(7, 7) from dobuzz(), rn2(20) from zap_hit(), d(6, 6)
    // from zhitu()'s ZT_FIRE arm, and burnarmor()'s slot rolls.
    // The zap is the last thing the segment does, so the ray's draws are the
    // tail of the log; everything before them is startup and the wish.
    assert.deepEqual(getRngLog().slice(-6), [
        'rn2(19)=12', 'rn2(7)=2', 'rn2(20)=13', 'd(6,6)=16',
        'rn2(5)=2', 'rn2(5)=1',
    ]);
    // tmp_at(DISP_END) is at zap.c:5025, after the loop, so the beam is still
    // on the map while the game waits at the --More--. The bolt crossed the
    // wall square west of the hero and then the hero's own square, and both
    // now draw S_hbeam in CLR_ORANGE over what was there.
    const beam = cmap_symbol(SYMBOL_INDEX_BY_NAME.s_hbeam, game);
    for (const x of [game.u.ux - 1, game.u.ux]) {
        const cell = mapCell(x, game.u.uy);
        assert.equal(cell.ch, beam.ch, `beam at ${x}`);
        assert.equal(cell.dec, beam.dec, `DEC flag at ${x}`);
        assert.equal(cell.color, CLR_ORANGE, `colour at ${x}`);
    }
    // burnarmor()'s first roll picked a slot the Wizard has nothing in and
    // drew again; the second picked slot 1, the cloak. erode_obj() prints
    // before it increments (trap.c:280-296), and that message is the one
    // holding the --More--, so the cloak is still unburnt at this boundary --
    // in C as well as here. The burnarmor tests below pin the increment.
    assert.equal(game.uarmc.oeroded, 0);
    // zhitu()'s ZT_FIRE arm does not touch hit points before the
    // destroy_items() call this port stops at.
    assert.equal(game.u.uhp, game.u.uhpmax);
});

test('burnarmor rolls again for a slot the hero has nothing in', async () => {
    await runSegment({
        ...raySegment(0), moves: movesThroughWish(RAY_CASES[0]),
    });
    // trap.c burnarmor() (87-160). A starting Wizard wears a cloak and
    // nothing else, so four of the five slots answer ER_NOTHING and send the
    // loop back for another rn2(5).
    const said = [];
    const drawn = [];
    // A slot script the loop reads one entry at a time, so a roll that lands
    // on an empty slot is visible as an extra entry in `drawn`.
    const burn = (...slots) => {
        said.length = 0;
        drawn.length = 0;
        const queue = [...slots];
        return burnarmor(game.youmonst, {
            state: game,
            message: async (text) => { said.push(text); },
            random: {
                rn2: (bound) => { drawn.push(bound); return queue.shift(); },
                rnl: () => 1,
            },
        });
    };
    // Roll 0 is the helmet slot, which is empty: erode_obj() answers
    // ER_NOTHING for a null item and the loop draws again. Roll 1 is the
    // cloak slot, which always answers TRUE.
    assert.equal(await burn(0, 1), true);
    assert.deepEqual(drawn, [5, 5]);
    assert.deepEqual(said, ['Your cloak smoulders!']);
    // trap.c:284-296. The message comes first and the erosion after it, which
    // is why a --More-- inside the message leaves the item unburnt.
    assert.equal(game.uarmc.oeroded, 1);
    // The adverbs of the next two burns: " further" while the erosion is
    // below MAX_ERODE - 1, and " completely" on the last one.
    await burn(1);
    assert.deepEqual(said, ['Your cloak smoulders further!']);
    assert.equal(game.uarmc.oeroded, 2);
    await burn(1);
    assert.deepEqual(said, ['Your cloak smoulders completely!']);
    assert.equal(game.uarmc.oeroded, 3);
    // MAX_ERODE is 3, so a fourth burn has nothing left to damage. EF_VERBOSE
    // is what would print "looks completely burnt", and burnarmor() does not
    // set it, so this one is silent -- and still answers TRUE, because the
    // cloak slot answers TRUE whatever erode_obj() did.
    assert.equal(await burn(1), true);
    assert.deepEqual(said, []);
    assert.equal(game.uarmc.oeroded, 3);
    // The other three empty slots also send the loop back for another roll.
    assert.equal(await burn(2, 3, 4, 1), true);
    assert.deepEqual(drawn, [5, 5, 5, 5]);
});

test('burnarmor stops for a monster victim and for a wet towel', async () => {
    await runSegment({
        ...raySegment(0), moves: movesThroughWish(RAY_CASES[0]),
    });
    const env = {
        state: game,
        message: async () => {},
        random: { rn2: () => 1, rnl: () => 1 },
    };
    // which_armor() picks a monster's five slots; no ported caller hands
    // burnarmor() a monster, so the port stops before the towel scan.
    await assert.rejects(
        () => burnarmor({ mx: 1, my: 1 }, env),
        /burnarmor\(\)'s monster victim/u,
    );
    // trap.c:99-109. A dry towel leaves the scan walking; a wet one reaches
    // apply.c dry_a_towel(), which is unported.
    const towel = { otyp: TOWEL, spe: 0, nobj: game.invent };
    game.invent = towel;
    assert.equal(await burnarmor(game.youmonst, env), true);
    towel.spe = 1;
    await assert.rejects(
        () => burnarmor(game.youmonst, env),
        /dry_a_towel\(\) for a wet towel/u,
    );
    game.invent = towel.nobj;
});

test('the ray matrix keeps replay inputs and one wand per case', () => {
    // Version 5 recipes contain replay inputs and no recorded C answers;
    // loadRayZapRecipe() validates that before it hands the recipe over.
    const recipe = loadRayZapRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, RAY_CASES.length);
    assert.ok(recipe.segments.every(
        (segment) => !Object.hasOwn(segment, 'steps'),
    ));
    // One fixed seed and one fixed clock across the matrix: a varying clock
    // would change the moon phase, which no case here is measuring.
    assert.deepEqual([...new Set(recipe.segments.map(({ seed }) => seed))],
        [20260817]);
    assert.deepEqual(
        [...new Set(recipe.segments.map(({ datetime }) => datetime))],
        ['20260817120000'],
    );
    // pettype:none is what keeps the starting pet off the bolt's line.
    assert.ok(recipe.segments.every(
        ({ nethackrc }) => nethackrc.includes('pettype:none'),
    ));
    // Every case zaps exactly once, and the keys are the wish, the zap, the
    // wand letter and the direction, in that order.
    for (const entry of RAY_CASES) {
        const moves = movesFor(entry);
        assert.ok(moves.startsWith(movesThroughWish(entry)), entry.label);
        assert.equal(moves.slice(movesThroughWish(entry).length).length, 3,
            entry.label);
        assert.equal(moves.split('z').length - 1, 1, entry.label);
    }
    // The three wand names the matrix wishes for, and the three directions.
    // A fourth wand type would reach an unported zhitu() arm; a fourth
    // direction would change which of dobuzz()'s bounce paths runs.
    assert.deepEqual(
        [...new Set(RAY_CASES.map(({ wand }) => wand))],
        ['wand of fire', 'wand of cold', 'wand of magic missile'],
    );
    assert.deepEqual(
        [...new Set(RAY_CASES.map(({ dir }) => dir))], ['h', 'l', 'n'],
    );
});

// A game one wish in, with the hero aiming a wand of fire in the direction
// the caller names. Down is the shortest route to zhitu(): dobuzz() forces the
// range to 1 for a bolt with no horizontal delta, so its first square is the
// hero's own and the bolt hits with no bounce message ahead of it.
async function aimedWand(dx, dy, dz, otyp = WAN_FIRE) {
    await runSegment({
        ...raySegment(0), moves: movesThroughWish(RAY_CASES[0]),
    });
    game.u.dx = dx;
    game.u.dy = dy;
    game.u.dz = dz;
    return { otyp, oclass: game.objects[otyp].oc_class, quan: 1 };
}

// A scripted stream for a direct weffects() call: no bounceback, a hit, and
// the cloak slot, so the bolt reaches zhitu() on its second square.
function straightThrough() {
    return {
        d: (n) => n,
        rn1: (x, y) => y,
        rn2: () => 1,
        rnd: (x) => x,
        rnl: () => 1,
    };
}

test('a ray that runs out of range erases itself and spends the turn',
    async () => {
    // The matrix's second case: east, at the wall seven squares away, which
    // rn1(7, 7) cannot reach and come back from. The loop therefore runs to
    // its end, and everything the first case stops short of runs here.
    let boundary = null;
    await runSegment(raySegment(1), {
        onBoundary: (error) => { boundary = error; },
    });
    assert.equal(boundary, null);
    // tmp_at(DISP_END, 0) at zap.c:5025 erases every square the beam was
    // drawn on, so the hero is visible again and the floor beside her is
    // floor again.
    assert.equal(topLine(), 'The bolt of fire bounces!');
    const hero = mapCell(game.u.ux, game.u.uy);
    assert.equal(hero.ch, '@');
    assert.notEqual(mapCell(game.u.ux + 1, game.u.uy).color, CLR_ORANGE);
    // weffects()'s tail: `disclose = TRUE` selects learnwand(), which puts the
    // wand's type into the discoveries, and the turn the zap cost has passed.
    assert.equal(game.objects[WAN_FIRE].oc_name_known, 1);
    assert.ok(game.moves >= 1);
});

test('dobuzz admits a hero wand zap and nothing else', async () => {
    await runSegment({
        ...raySegment(0), moves: movesThroughWish(RAY_CASES[0]),
    });
    // A bolt with no horizontal delta is forced to range 1 and hits the hero
    // on its own square, so each call below produces one message rather than
    // the three a bounced bolt would. Each admitted type gets its own game,
    // because two messages in a row would fill the top line and stop for a
    // --More-- no keystroke is left to answer.
    const call = async (type) => {
        await runSegment({
            ...raySegment(0), moves: movesThroughWish(RAY_CASES[0]),
        });
        return dobuzz(
            type, 6, game.u.ux, game.u.uy, 0, 0, true, false, false,
            game, straightThrough(),
        );
    };
    const bandRefusal = 'for a spell, breath or monster zap of type';
    // A monster's zap is negative and a spell or breath is 10 or above; all
    // three reach dobuzz() in C, and none is ported.
    for (const type of [-1, -30, 10, 20]) {
        await assert.rejects(() => call(type), (error) => error.message
            .endsWith(
                `dobuzz() for a spell, breath or monster zap of type ${type}`,
            ));
    }
    // The hero's own wand band is 0..9. Types 0 and 5 are magic missile and
    // lightning, the first and last wands objects.h gives the band; each
    // walks the bolt and stops further in, at zhitu()'s damage-type arm.
    for (const type of [0, 5]) {
        await assert.rejects(() => call(type), (error) => error.message
            .endsWith(`zhitu() for damage type ${type}`));
    }
    // 9 is the last slot the band reserves and flash_types[] leaves empty, so
    // the guard has to admit it even though the message it would print has no
    // name to put in. What it must not do is report it as out of band.
    await assert.rejects(() => call(9), (error) =>
        !error.message.includes(bandRefusal));
});

test('a monster in the path stops the bolt before the floor effect wakes it',
    async () => {
    await runSegment({
        ...raySegment(0), moves: movesThroughWish(RAY_CASES[0]),
    });
    // dobuzz() passes ignoremon = TRUE at zap.c:4858, so zap_over_floor()
    // leaves the monster alone and the `if (mon)` arm above it is the one
    // that answers. Moving the level's own monster onto the bolt's first
    // square is what separates the two refusals.
    const monster = game.level.monlist;
    assert.ok(monster, 'the level carries a monster to move');
    relocate_monster(monster, game.u.ux - 1, game.u.uy, game);
    game.u.dx = -1;
    game.u.dy = 0;
    game.u.dz = 0;
    await assert.rejects(
        () => weffects(
            {
                otyp: WAN_FIRE,
                oclass: game.objects[WAN_FIRE].oc_class,
                quan: 1,
            },
            game,
            straightThrough(),
        ),
        /dobuzz\(\)'s monster arm, over zhitm\(\)/u,
    );
});

test('a cold bolt over water or lava stops at what it would freeze',
    async () => {
    // zap.c:5239's guard is `is_pool(x, y) || is_lava(x, y) || lavawall`, and
    // its three terms are not redundant: is_lava() answers TRUE for LAVAPOOL
    // as well as LAVAWALL, so a lava pool reaches the arm through the middle
    // term alone. Over ordinary floor the arm does nothing at all, which is
    // why the matrix's cold case crosses a whole room without a draw.
    for (const typ of [POOL, LAVAPOOL, LAVAWALL]) {
        const wand = await aimedWand(-1, 0, 0, WAN_COLD);
        game.level.at(game.u.ux - 1, game.u.uy).typ = typ;
        await assert.rejects(
            () => weffects(wand, game, straightThrough()),
            /start_melt_ice_timeout\(\) for the water or lava a cold bolt/u,
            `${typ}`,
        );
    }
});

test('a hero the bolt cannot burn stops it before the damage roll',
    async () => {
    // youprop.h:28 Fire_resistance and :381 Reflecting are both the plain
    // "either source" spelling, so an intrinsic alone and an extrinsic alone
    // each select their arm.
    for (const [index, source, pattern] of [
        [FIRE_RES, 'intrinsic', /fire-resistant hero, over ugolemeffects/u],
        [FIRE_RES, 'extrinsic', /fire-resistant hero, over ugolemeffects/u],
        [REFLECTING, 'intrinsic', /ureflects\(\)/u],
        [REFLECTING, 'extrinsic', /ureflects\(\)/u],
    ]) {
        const wand = await aimedWand(0, 0, 1);
        game.u.uprops[index] = { intrinsic: 0, extrinsic: 0 };
        game.u.uprops[index][source] = FROMOUTSIDE;
        await assert.rejects(
            () => weffects(wand, game, straightThrough()), pattern,
        );
    }
});

test('a hallucinating hero stops before the beam takes a colour', async () => {
    // youprop.h:120 Hallucination is `HHallucination && !Halluc_resistance`,
    // and :119 Halluc_resistance is either source. dobuzz():4797 draws rn2(6)
    // for the beam's colour when it holds, which is why the stop is there
    // rather than at the first message.
    let wand = await aimedWand(0, 0, 1);
    game.u.uprops[HALLUC].intrinsic = 5;
    await assert.rejects(
        () => weffects(wand, game, straightThrough()),
        /rnd_hallublast\(\) and the rn2\(6\) beam colour/u,
    );
    // Either source of resistance suppresses it, and the bolt runs on to the
    // arm the resistance-free hero reaches.
    for (const source of ['intrinsic', 'extrinsic']) {
        wand = await aimedWand(0, 0, 1);
        game.u.uprops[HALLUC].intrinsic = 5;
        game.u.uprops[HALLUC_RES] = { intrinsic: 0, extrinsic: 0 };
        game.u.uprops[HALLUC_RES][source] = FROMOUTSIDE;
        await assert.rejects(
            () => weffects(wand, game, straightThrough()),
            /destroy_items\(\) and ignite_items\(\) for the burning hero/u,
        );
    }
});

// A worn armor object shaped the way the hero's own pack members are, so
// carried() answers TRUE for it and erode_obj() takes its hero arm.
function wornArmor(otyp) {
    return {
        blessed: false,
        dknown: true,
        greased: false,
        known: true,
        nobj: null,
        oclass: ARMOR_CLASS,
        oeroded: 0,
        oeroded2: 0,
        oerodeproof: false,
        otyp,
        quan: 1,
        rknown: true,
        spe: 0,
        where: OBJ_INVENT,
    };
}

test('burnarmor falls past the cloak to the suit and then the shirt',
    async () => {
    await runSegment({
        ...raySegment(0), moves: movesThroughWish(RAY_CASES[0]),
    });
    const said = [];
    const env = {
        state: game,
        message: async (text) => { said.push(text); },
        random: { rn2: () => 1, rnl: () => 1 },
    };
    // trap.c:124-138. Slot 1 is the torso, and it answers TRUE whichever of
    // the three layers is present -- or none of them.
    game.uarmc = null;
    game.uarm = wornArmor(LEATHER_ARMOR);
    assert.equal(await burnarmor(game.youmonst, env), true);
    assert.deepEqual(said, ['Your leather armor smoulders!']);
    assert.equal(game.uarm.oeroded, 1);
    said.length = 0;
    game.uarm = null;
    game.uarmu = wornArmor(HAWAIIAN_SHIRT);
    assert.equal(await burnarmor(game.youmonst, env), true);
    assert.deepEqual(said, ['Your shirt smoulders!']);
    said.length = 0;
    game.uarmu = null;
    assert.equal(await burnarmor(game.youmonst, env), true);
    assert.deepEqual(said, []);
});

test('burnarmor answers false for a slot that is not the torso', async () => {
    await runSegment({
        ...raySegment(0), moves: movesThroughWish(RAY_CASES[0]),
    });
    const said = [];
    const env = {
        state: game,
        message: async (text) => { said.push(text); },
        random: { rn2: () => 4, rnl: () => 1 },
    };
    // Slot 4 is the boots. Leather is flammable, so erode_obj() answers
    // ER_DAMAGED, the loop breaks, and burnarmor() reports that the bolt did
    // not hit the torso -- which is what keeps zhitu() from looking for items
    // to destroy.
    game.uarmf = wornArmor(LOW_BOOTS);
    assert.equal(await burnarmor(game.youmonst, env), false);
    assert.deepEqual(said, ['Your boots smoulder!']);
    assert.equal(game.uarmf.oeroded, 1);
    // A victim of null is C's `if (!victim) return 0`.
    assert.equal(await burnarmor(null, env), false);
});

test('erode_obj refuses an object no victim is carrying', async () => {
    await runSegment({
        ...raySegment(0), moves: movesThroughWish(RAY_CASES[0]),
    });
    // trap.c:196-201 answers a floor object through `visobj`, which reads
    // gb.bhitpos. No ported caller passes one, so an object that is neither
    // carried nor mcarried stops here -- including one that still carries a
    // stale ocarry.
    const floorItem = { ...wornArmor(LOW_BOOTS), where: OBJ_FLOOR };
    floorItem.ocarry = game.level.monlist;
    await assert.rejects(
        () => erode_obj(floorItem, 'boots', ERODE_BURN, EF_GREASE, {
            state: game, random: { rn2: () => 1, rnl: () => 1 },
        }),
        /item erosion requires a carried object/u,
    );
    // A hero's own item never asks whether a monster is visible, so the
    // operation that would answer is not reached at all.
    const heroItem = wornArmor(LOW_BOOTS);
    assert.equal(
        await erode_obj(heroItem, 'boots', ERODE_BURN, EF_GREASE, {
            state: game,
            random: { rn2: () => 1, rnl: () => 1 },
            message: async () => {},
            canSeeMonster: () => {
                throw new Error('a hero victim asked canSeeMonster()');
            },
        }),
        ER_DAMAGED,
    );
});

test('weffects turns each ray wand into the dobuzz type its row implies',
    async () => {
    // hack.h:1477 BZ_OFS_WAN(otyp) is `abs(otyp - WAN_MAGIC_MISSILE) % 10`
    // and :1480 BZ_U_WAND(bztyp) is `0 + bztyp`, so objects.h:1488's ordering
    // of the six ray wands is what numbers them. zhitu() names the number
    // back in its refusal, which is how each row is read here.
    const cases = [
        [WAN_MAGIC_MISSILE, 'zhitu() for damage type 0'],
        [WAN_FIRE, 'destroy_items() and ignite_items() for the burning hero'],
        [WAN_COLD, 'zhitu() for damage type 2'],
        [WAN_SLEEP, 'zhitu() for damage type 3'],
        [WAN_DEATH, 'zhitu() for damage type 4'],
        [WAN_LIGHTNING, 'zhitu() for damage type 5'],
    ];
    for (const [otyp, ending] of cases) {
        const wand = await aimedWand(0, 0, 1, otyp);
        assert.equal(game.objects[otyp].oc_dir, RAY, `oc_dir of ${otyp}`);
        await assert.rejects(
            () => weffects(wand, game, straightThrough()),
            (error) => error.message.endsWith(ending),
            `${otyp}`,
        );
    }
});

test('weffects sends digging and a cast ray to their own arms', async () => {
    // zap.c weffects():3459-3462. Digging and the spell band are tested
    // before the wand band, so an object in either one never reaches ubuzz()
    // with a wand type.
    for (const [otyp, ending] of [
        [WAN_DIGGING, 'zap_dig()'],
        [SPE_DIG, 'zap_dig()'],
        [SPE_MAGIC_MISSILE, 'ubuzz() for a spell the hero cast'],
        [SPE_FINGER_OF_DEATH, 'ubuzz() for a spell the hero cast'],
    ]) {
        const wand = await aimedWand(0, 0, 1, otyp);
        // Each of the four is a directional object, which is what puts it in
        // weffects()'s final else rather than in the immediate or
        // directionless arm above it.
        assert.notEqual(game.objects[otyp].oc_dir, 1, `NODIR at ${otyp}`);
        assert.notEqual(game.objects[otyp].oc_dir, 2, `IMMEDIATE at ${otyp}`);
        await assert.rejects(
            () => weffects(wand, game, straightThrough()),
            (error) => error.message.endsWith(ending),
            `${otyp}`,
        );
    }
});

test('weffects offers a downward zap to the steed before the ray', async () => {
    // zap.c weffects():3437-3439. The steed takes the zap only when the hero
    // aimed straight down, which is `!u.dx && !u.dy && u.dz > 0`. A zap with
    // no direction at all reaches this function only from a caller other than
    // dozap(), and it must not be handed to the steed.
    let wand = await aimedWand(0, 0, 1);
    game.u.usteed = game.level.monlist;
    await assert.rejects(
        () => weffects(wand, game, straightThrough()),
        /zap_steed\(\) for a downward zap while riding/u,
    );
    wand = await aimedWand(0, 0, 0);
    game.u.usteed = game.level.monlist;
    await assert.rejects(
        () => weffects(wand, game, straightThrough()),
        /dobuzz\(\)'s steed taking the bolt/u,
    );
});

test('a bounce off stone rolls against a different chance than a wall',
    async () => {
    // zap.c dobuzz():5003-5005 picks `bounceback` from what the bolt met: 10
    // for a square off the map or made of stone, 20 for a wall in the Mines,
    // and 75 for everything else. Only a diagonal bolt reads the number at
    // all, because bounce_dir() short-circuits an axial one.
    enableRngLog();
    let boundary = null;
    await runSegment(raySegment(4), {
        onBoundary: (error) => { boundary = error; },
    });
    assert.equal(boundary, null);
    // The tail of the log: the range, the room wall it bounced off at 75, and
    // the stone it bounced off after that at 10. D:1 is not the Mines, so the
    // 20 never applies.
    const rng = getRngLog();
    const ray = rng.slice(rng.lastIndexOf('rn2(19)=12'));
    assert.deepEqual(ray.slice(0, 4), [
        'rn2(19)=12', 'rn2(7)=2', 'rn2(75)=28', 'rn2(10)=9',
    ]);
});

test('a bolt whose range runs out at the obstacle says nothing', async () => {
    // zap.c dobuzz():5006. `--range` happens whether or not the message is
    // printed, and the message needs what is left to be above zero. A range
    // of 8 aimed at a wall seven squares away leaves exactly zero.
    await runSegment({
        ...raySegment(0), moves: movesThroughWish(RAY_CASES[0]),
    });
    let frames = 0;
    game._animationFrameHook = () => { frames += 1; };
    const before = game._ttyToplines ?? '';
    await dobuzz(
        1, 6, game.u.ux, game.u.uy, 1, 0, true, false, false, game,
        { ...straightThrough(), rn1: () => 8 },
    );
    assert.equal(game._ttyToplines ?? '', before);
    // Seven squares, each drawn and then paused on by nh_delay_output(). An
    // eighth would mean the loop ran once more than its range allowed.
    assert.equal(frames, 7);
});

test('a bolt over an empty square leaves no invisible-monster memory',
    async () => {
    // zap.c dobuzz():4844-4847. map_invisible() is for a monster the hero
    // cannot spot; a square with no monster at all takes unmap_invisible()
    // instead, which erases a memory rather than writing one.
    let boundary = null;
    await runSegment(raySegment(1), {
        onBoundary: (error) => { boundary = error; },
    });
    assert.equal(boundary, null);
    const invisible = map_glyphinfo(GLYPH_INVISIBLE, game).ch;
    for (let step = 1; step <= 6; ++step) {
        assert.notEqual(
            mapCell(game.u.ux + step, game.u.uy).ch, invisible, `${step}`,
        );
    }
});
