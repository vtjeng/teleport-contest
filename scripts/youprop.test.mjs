// Source-pinned tests for js/youprop.js, the port of include/youprop.h.
//
// The header is parsed so that every macro it defines must have a port, and
// every macro of the three plain shapes (a field of one u.uprops[] slot, a
// `(HXxx || EXxx)` pair, or an alias of another macro) is checked against
// the slot and fields the header names. The remaining macros have
// hand-written cases, each giving the header line it pins.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import * as C from '../js/const.js';
import { M1_AMPHIBIOUS, M1_BREATHLESS, M1_FLY, M1_SWIM } from '../js/monsters.js';
import { TOWEL } from '../js/objects.js';
import * as Y from '../js/youprop.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HEADER = join(ROOT, 'nethack-c', 'upstream', 'include', 'youprop.h');

// Every #define in youprop.h as name -> body, comments and continuation
// lines folded in.
function macros() {
    const text = readFileSync(HEADER, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//gu, ' ')
        .replace(/\\\n/gu, ' ');
    const found = new Map();
    for (const line of text.split('\n')) {
        const m = /^#define\s+(\w+)(\([^)]*\))?\s*(.*)$/u.exec(line);
        if (m) found.set(m[1], m[3].replace(/\s+/gu, ' ').trim());
    }
    return found;
}

// A hero with every property slot zeroed, as u_init.js zeroProperties()
// builds it.
function hero(fields = {}) {
    const uprops = Array.from({ length: C.LAST_PROP + 1 },
        () => ({ intrinsic: 0, extrinsic: 0, blocked: 0 }));
    return { uprops, uroleplay: { deaf: false }, ...fields };
}

// A hero with one field of one slot set to `value`.
function heroWith(index, field, value) {
    const u = hero();
    u.uprops[index][field] = value;
    return u;
}

const FIELD = { intrinsic: 'intrinsic', extrinsic: 'extrinsic', blocked: 'blocked' };

// Macros that are not property tests or need the game state; each has its
// own case below. YOUPROP_H is the include guard; maybe_polyd() picks
// between two expressions and is not a property, so the port writes
// Upolyd() (js/const.js) at each use instead.
const NOT_PORTED = new Set(['YOUPROP_H', 'maybe_polyd']);

test('every youprop.h macro has a port', () => {
    const missing = [...macros().keys()]
        .filter((name) => !NOT_PORTED.has(name) && typeof Y[name] !== 'function');
    assert.deepEqual(missing, []);
});

test('each field accessor reads the slot and field youprop.h names', () => {
    // 0x1234 is an arbitrary nonzero mask with no flag meaning; the accessor
    // must return it whole. Setting every other field of every slot to it
    // too proves the accessor reads only its own.
    const VALUE = 0x1234;
    let checked = 0;
    for (const [name, body] of macros()) {
        const m = /^u\.uprops\[(\w+)\]\.(intrinsic|extrinsic|blocked)$/u.exec(body);
        if (!m) continue;
        const index = C[m[1]];
        assert.equal(typeof index, 'number', `${name}: ${m[1]} is a property index`);
        assert.equal(Y[name](heroWith(index, FIELD[m[2]], VALUE)), VALUE, name);
        const others = hero();
        for (const [i, slot] of others.uprops.entries())
            for (const field of Object.keys(slot))
                if (i !== index || field !== m[2]) slot[field] = VALUE;
        assert.equal(Y[name](others), 0, `${name} reads only ${m[1]}.${m[2]}`);
        checked++;
    }
    // youprop.h defines 127 single-field accessors (HXxx, EXxx, BXxx and the
    // bare names that are one field, such as Sick); two of them continue
    // onto a second line (HProtection_from_shape_changers and its E twin).
    assert.equal(checked, 127);
});

test('each (HXxx || EXxx) macro is true when either field is set', () => {
    let checked = 0;
    for (const [name, body] of macros()) {
        const m = /^\((H\w+) \|\| (E\w+)\)$/u.exec(body);
        if (!m) continue;
        const slotOf = (accessor) => /^u\.uprops\[(\w+)\]/u.exec(macros().get(accessor))[1];
        const index = C[slotOf(m[1])];
        assert.equal(Y[name](hero()), false, `${name} with nothing set`);
        assert.equal(Y[name](heroWith(index, 'intrinsic', C.FROMOUTSIDE)), true, `${name} intrinsic`);
        assert.equal(Y[name](heroWith(index, 'extrinsic', C.W_ARMOR)), true, `${name} extrinsic`);
        // A blocked bit alone does not count: these macros have no B term.
        assert.equal(Y[name](heroWith(index, 'blocked', C.W_ARMOR)), false, `${name} blocked`);
        checked++;
    }
    // 42 macros of youprop.h have this exact shape, from Fire_resistance to
    // Reflecting.
    assert.equal(checked, 42);
});

test('each alias macro answers as the macro it names', () => {
    // Stunned HStun, Confusion HConfusion, Blindfolded EBlinded,
    // Undead_warning (HUndead_warning), Unblind_telepat (ETelepat).
    const aliases = [...macros()].filter(([, body]) => /^\(?[A-Z]\w*\)?$/u.test(body));
    assert.deepEqual(aliases.map(([name]) => name).sort(),
        ['Blindfolded', 'Confusion', 'Stunned', 'Unblind_telepat', 'Undead_warning']);
    for (const [name, body] of aliases) {
        const target = body.replace(/[()]/gu, '');
        const index = C[/^u\.uprops\[(\w+)\]/u.exec(macros().get(target))[1]];
        // TIMEOUT-range value 7, as a timed effect leaves it.
        const field = target.startsWith('E') ? 'extrinsic' : 'intrinsic';
        assert.equal(Y[name](heroWith(index, field, 7)), 7, name);
    }
});

test('Blind needs a blindness source and no blocking lenses (youprop.h:103)', () => {
    // EBlinded is a worn blindfold (W_TOOL); BBlinded is the Eyes of the
    // Overworld (W_TOOL in blocked), which overrides both sources.
    assert.equal(Y.Blind(hero()), false);
    assert.equal(Y.Blind(heroWith(C.BLINDED, 'intrinsic', 5)), true); // timed
    assert.equal(Y.Blind(heroWith(C.BLINDED, 'extrinsic', C.W_TOOL)), true); // blindfold
    const lenses = heroWith(C.BLINDED, 'intrinsic', 5);
    lenses.uprops[C.BLINDED].blocked = C.W_TOOL;
    assert.equal(Y.Blind(lenses), false);
    // Blindness resistance (BLND_RES) is a different slot and does not
    // enter Blind.
    const resist = heroWith(C.BLINDED, 'intrinsic', 5);
    resist.uprops[C.BLND_RES].extrinsic = C.W_WEP;
    assert.equal(Y.Blind(resist), true);
});

test('Blinded and Blindfolded_only split the sources (youprop.h:92, 97)', () => {
    const blindfold = heroWith(C.BLINDED, 'extrinsic', C.W_TOOL);
    assert.equal(Y.Blinded(blindfold), false);
    assert.equal(Y.Blindfolded_only(blindfold), true);
    const both = heroWith(C.BLINDED, 'extrinsic', C.W_TOOL);
    both.uprops[C.BLINDED].intrinsic = 5;
    assert.equal(Y.Blinded(both), true);
    assert.equal(Y.Blindfolded_only(both), false);
    const lenses = heroWith(C.BLINDED, 'intrinsic', 5);
    lenses.uprops[C.BLINDED].blocked = C.W_TOOL;
    assert.equal(Y.Blinded(lenses), false);
});

test('BlindedTimeout and PermaBlind read the two parts of HBlinded (youprop.h:93-94)', () => {
    const u = heroWith(C.BLINDED, 'intrinsic', C.FROMOUTSIDE | 12);
    assert.equal(Y.BlindedTimeout(u), 12);
    assert.equal(Y.PermaBlind(u), true);
    assert.equal(Y.PermaBlind(heroWith(C.BLINDED, 'intrinsic', 12)), false);
});

test('Hallucination is the timeout without resistance (youprop.h:120)', () => {
    assert.equal(Y.Hallucination(heroWith(C.HALLUC, 'intrinsic', 9)), true);
    const resisted = heroWith(C.HALLUC, 'intrinsic', 9);
    resisted.uprops[C.HALLUC_RES].extrinsic = C.W_ARTI; // Grayswandir
    assert.equal(Y.Hallucination(resisted), false);
    // HALLUC has no extrinsic source in youprop.h; that field is ignored.
    assert.equal(Y.Hallucination(heroWith(C.HALLUC, 'extrinsic', C.W_ARMOR)), false);
});

test('Deaf counts the roleplay option (youprop.h:125)', () => {
    assert.equal(Y.Deaf(hero()), false);
    assert.equal(Y.Deaf(hero({ uroleplay: { deaf: true } })), true);
    assert.equal(Y.Deaf(heroWith(C.DEAF, 'extrinsic', C.W_ARMH)), true);
});

test('blocked macros need a source and no block (youprop.h:182, 198, 210, 240, 253)', () => {
    for (const [name, index] of [['Clairvoyant', C.CLAIRVOYANT], ['Invis', C.INVIS],
        ['Stealth', C.STEALTH], ['Levitation', C.LEVITATION], ['Flying', C.FLYING]]) {
        assert.equal(Y[name](hero()), false, name);
        assert.equal(Y[name](heroWith(index, 'intrinsic', C.FROMOUTSIDE)), true, name);
        assert.equal(Y[name](heroWith(index, 'extrinsic', C.W_ARMOR)), true, name);
        const u = heroWith(index, 'extrinsic', C.W_ARMOR);
        u.uprops[index].blocked = C.FROMOUTSIDE;
        assert.equal(Y[name](u), false, `${name} blocked`);
    }
});

test('Invisible is Invis without See_invisible (youprop.h:199)', () => {
    const u = heroWith(C.INVIS, 'intrinsic', C.FROMOUTSIDE);
    assert.equal(Y.Invisible(u), true);
    u.uprops[C.SEE_INVIS].extrinsic = C.W_RINGL;
    assert.equal(Y.Invisible(u), false);
});

test('Lev_at_will is only a blessed potion or an artifact (youprop.h:242-245)', () => {
    // I_SPECIAL with a timeout: blessed potion of levitation.
    assert.equal(Y.Lev_at_will(heroWith(C.LEVITATION, 'intrinsic', C.I_SPECIAL | 30)), true);
    // W_ARTI alone: an invoked artifact.
    assert.equal(Y.Lev_at_will(heroWith(C.LEVITATION, 'extrinsic', C.W_ARTI)), true);
    // A plain timeout has no I_SPECIAL.
    assert.equal(Y.Lev_at_will(heroWith(C.LEVITATION, 'intrinsic', 30)), false);
    // Worn boots as well: the extrinsic has a non-artifact bit.
    const boots = heroWith(C.LEVITATION, 'intrinsic', C.I_SPECIAL | 30);
    boots.uprops[C.LEVITATION].extrinsic = C.W_ARMF;
    assert.equal(Y.Lev_at_will(boots), false);
    // FROMOUTSIDE as well: an intrinsic bit outside I_SPECIAL and TIMEOUT.
    assert.equal(Y.Lev_at_will(heroWith(C.LEVITATION, 'intrinsic',
        C.I_SPECIAL | C.FROMOUTSIDE)), false);
});

test('a steed lends Flying and Swimming (youprop.h:253-255, 266-267)', () => {
    const flyer = hero({ usteed: { data: { mflags1: M1_FLY } } });
    assert.equal(Y.Flying(flyer), true);
    flyer.uprops[C.FLYING].blocked = C.I_SPECIAL; // levitating
    assert.equal(Y.Flying(flyer), false);
    assert.equal(Y.Flying(hero({ usteed: { data: { mflags1: 0 } } })), false);
    assert.equal(Y.Swimming(hero({ usteed: { data: { mflags1: M1_SWIM } } })), true);
    assert.equal(Y.Swimming(hero({ usteed: { data: { mflags1: 0 } } })), false);
});

test('Very_fast ignores plain intrinsic speed (youprop.h:377)', () => {
    assert.equal(Y.Fast(heroWith(C.FAST, 'intrinsic', C.FROMEXPER)), true);
    assert.equal(Y.Very_fast(heroWith(C.FAST, 'intrinsic', C.FROMEXPER)), false);
    assert.equal(Y.Very_fast(heroWith(C.FAST, 'intrinsic', 20)), true); // timed potion
    assert.equal(Y.Very_fast(heroWith(C.FAST, 'extrinsic', C.W_ARMF)), true); // boots
});

test('Wwalking does not work on the Plane of Water (youprop.h:260)', () => {
    const u = heroWith(C.WWALKING, 'extrinsic', C.W_ARMF);
    u.uz = { dnum: 7, dlevel: 2 };
    assert.equal(Y.Wwalking({ u, water_level: { dnum: 7, dlevel: 1 } }), true);
    assert.equal(Y.Wwalking({ u, water_level: { dnum: 7, dlevel: 2 } }), false);
});

test('Amphibious and Breathless add the form (youprop.h:272-277)', () => {
    const plain = { u: hero(), youmonst: { data: { mflags1: 0 } } };
    assert.equal(Y.Amphibious(plain), false);
    assert.equal(Y.Breathless(plain), false);
    assert.equal(Y.Amphibious({ ...plain, youmonst: { data: { mflags1: M1_AMPHIBIOUS } } }), true);
    assert.equal(Y.Breathless({ ...plain, youmonst: { data: { mflags1: M1_BREATHLESS } } }), true);
    const amulet = { ...plain, u: heroWith(C.MAGICAL_BREATHING, 'extrinsic', C.W_AMUL) };
    assert.equal(Y.Amphibious(amulet), true);
    assert.equal(Y.Breathless(amulet), true);
});

test('Underwater is u.uinwater (youprop.h:279)', () => {
    assert.equal(Y.Underwater(hero({ uinwater: 1 })), true);
    assert.equal(Y.Underwater(hero({ uinwater: 0 })), false);
});

test('Unaware needs negative multi and an insensible hero (youprop.h:399)', () => {
    // Asleep (u.usleep) with multi < 0 is unconscious().
    assert.equal(Y.Unaware({ u: hero({ usleep: 1 }), multi: -3 }), true);
    // Asleep but multi not negative: the macro's first test fails.
    assert.equal(Y.Unaware({ u: hero({ usleep: 1 }), multi: 0 }), false);
    // Fainted (u.uhs == FAINTED) with multi < 0 is is_fainted().
    assert.equal(Y.Unaware({ u: hero({ uhs: C.FAINTED }), multi: -1 }), true);
    // Paralysed but awake: multi < 0 with nothing insensible.
    assert.equal(Y.Unaware({ u: hero(), multi: -5 }), false);
});

test('Hate_silver is a lycanthrope or a silver-hating form (youprop.h:401)', () => {
    // NON_PM (-1) is no lycanthropy; LOW_PM (0) and above is one.
    assert.equal(Y.Hate_silver({ u: hero({ ulycn: -1 }), youmonst: { data: {} } }), false);
    assert.equal(Y.Hate_silver({ u: hero({ ulycn: 0 }), youmonst: { data: {} } }), true);
});

test('Half_gas_damage is a wet towel over the eyes (youprop.h:405-406)', () => {
    assert.equal(Y.Half_gas_damage({ u: hero(), ublindf: { otyp: TOWEL, spe: 1 } }), true);
    assert.equal(Y.Half_gas_damage({ u: hero(), ublindf: { otyp: TOWEL, spe: 0 } }), false);
    assert.equal(Y.Half_gas_damage({ u: hero(), ublindf: null }), false);
});

test('Punished is a ball and chain (youprop.h:77)', () => {
    assert.equal(Y.Punished({ u: hero(), uball: { otyp: 1 } }), true);
    assert.equal(Y.Punished({ u: hero(), uball: null }), false);
});

test('Sick_resistance counts its slot (youprop.h:69-70)', () => {
    // The defended(&youmonst, AD_DISE) term needs an inventory; with no
    // wielded weapon and no armor it adds nothing.
    const state = { u: heroWith(C.SICK_RES, 'extrinsic', C.W_ARMC), youmonst: {} };
    assert.equal(Y.Sick_resistance(state), true);
});

test('Maybe_Half_Phys halves rounding up (hack.h:1236-1237)', () => {
    // 7 is odd, so (7 + 1) / 2 = 4 shows the rounding.
    assert.equal(Y.Maybe_Half_Phys(7, heroWith(C.HALF_PHDAM, 'extrinsic', C.W_ARTI)), 4);
    assert.equal(Y.Maybe_Half_Phys(7, hero()), 7);
});

test('a hero macro given the game state, or a state macro given the hero, throws', () => {
    const u = hero();
    assert.throws(() => Y.Blind({ u }), TypeError);
    assert.throws(() => Y.Unaware(u), TypeError);
    assert.throws(() => Y.Unaware(undefined), TypeError);
    // A state with no hero reads as a hero with no properties, as the
    // `state.u?.uprops?.[...]` copies did; unit tests build such states.
    assert.equal(Y.Blind(undefined), false);
    assert.equal(Y.HBlinded(undefined), 0);
});
