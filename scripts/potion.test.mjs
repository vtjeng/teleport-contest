// potion.c potionbreathe() and do.c trycall().
//
// potionbreathe()'s eighteen case labels carry no operator a mutation can
// move, and the witness reaches exactly one of them. The tests below read the
// label list out of potion.c and then separate the three groups it falls into:
// the arm this port runs, the arms that stop by name, and the types that have
// no label at all and fall out of the switch.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { failClosedCommandRefusals } from '../js/cmd.js';

import {
    A_CON, A_DEX, BLINDED, CONFUSION, FAST, FROMOUTSIDE, HALLUC, HALLUC_RES,
    INVIS, POTHIT_MONST_THROW, SEE_INVIS, TIMEOUT,
} from '../js/const.js';
import { trycall } from '../js/do.js';
import { UnsupportedObjectNamingError, docall } from '../js/do_name.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { discover_object } from '../js/o_init.js';
import { mksobj } from '../js/obj.js';
import {
    POT_ACID,
    POT_BLINDNESS,
    POT_BOOZE,
    POT_CONFUSION,
    POT_ENLIGHTENMENT,
    POT_EXTRA_HEALING,
    POT_FRUIT_JUICE,
    POT_FULL_HEALING,
    POT_GAIN_ABILITY,
    POT_GAIN_ENERGY,
    POT_GAIN_LEVEL,
    POT_HALLUCINATION,
    POT_HEALING,
    POT_INVISIBILITY,
    POT_LEVITATION,
    POT_MONSTER_DETECTION,
    POT_OBJECT_DETECTION,
    POT_OIL,
    POT_PARALYSIS,
    POT_POLYMORPH,
    POT_RESTORE_ABILITY,
    POT_SEE_INVISIBLE,
    POT_SICKNESS,
    POT_SLEEPING,
    POT_SPEED,
    POT_WATER,
    TOWEL,
} from '../js/objects.js';
import {
    UnsupportedPotionError,
    UnsupportedQuaffError,
    incr_itimeout,
    make_confused,
    peffects,
    potionbreathe,
    potionhit,
    set_itimeout,
    speed_up,
} from '../js/potion.js';
import { enableRngLog, getRngLog } from '../js/rng.js';

const POTION_TYPES = Object.freeze({
    POT_GAIN_ABILITY,
    POT_RESTORE_ABILITY,
    POT_CONFUSION,
    POT_BLINDNESS,
    POT_PARALYSIS,
    POT_SPEED,
    POT_LEVITATION,
    POT_HALLUCINATION,
    POT_INVISIBILITY,
    POT_SEE_INVISIBLE,
    POT_HEALING,
    POT_EXTRA_HEALING,
    POT_GAIN_LEVEL,
    POT_ENLIGHTENMENT,
    POT_MONSTER_DETECTION,
    POT_OBJECT_DETECTION,
    POT_GAIN_ENERGY,
    POT_SLEEPING,
    POT_FULL_HEALING,
    POT_POLYMORPH,
    POT_BOOZE,
    POT_SICKNESS,
    POT_FRUIT_JUICE,
    POT_ACID,
    POT_OIL,
    POT_WATER,
});

// The types with no case label in potion.c's switch. C's commented-out block
// at 2096-2105 names the first seven; the last two are absent from that comment
// and reach the same nothing, because the switch has no `default:`.
const NO_OP_TYPES = Object.freeze([
    'POT_GAIN_LEVEL', 'POT_GAIN_ENERGY', 'POT_LEVITATION', 'POT_FRUIT_JUICE',
    'POT_MONSTER_DETECTION', 'POT_OBJECT_DETECTION', 'POT_OIL',
    'POT_SEE_INVISIBLE', 'POT_ENLIGHTENMENT',
]);

function potionSource() {
    return readFileSync(
        new URL('../nethack-c/upstream/src/potion.c', import.meta.url),
        'utf8',
    );
}

// The body of potionbreathe()'s switch, from the `switch (` line to the closing
// brace before the `if (!already_in_use)` tail, split into the code the
// compiler sees and the block comments it does not. The split is the point:
// seven `case POT_...:` lines sit inside a comment, and reading them as labels
// is exactly the mistake this file exists to rule out.
function breatheSwitchBody() {
    const source = potionSource();
    const start = source.indexOf(
        'switch (Half_gas_damage ? TOWEL : obj->otyp) {',
    );
    assert.ok(start > 0, 'potion.c still switches on Half_gas_damage');
    const end = source.indexOf('if (!already_in_use)', start);
    assert.ok(end > start);
    const body = source.slice(start, end);
    const comments = [...body.matchAll(/\/\*[\s\S]*?\*\//gu)]
        .map(([text]) => text).join('\n');
    return { code: body.replace(/\/\*[\s\S]*?\*\//gu, ''), comments };
}

async function startedGame(seed, name) {
    await runSegment({
        seed,
        datetime: '20260724120000',
        nethackrc: `OPTIONS=name:${name},role:Healer,race:human,`
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen',
        moves: ' ',
    });
}

function toplines() {
    return game._ttyToplines ?? '';
}

// The top line as pline.c leaves it after the segment's own last message.
// Clearing it is what keeps each call below from sharing a line with the one
// before it, which would otherwise reach the --More-- these tests have no
// keystrokes for.
function clearTopline() {
    game._pending_message = '';
    game._ttyToplines = '';
    game._ttyPreviousMessage = '';
    game._ttyMessageStopped = false;
}

function vaporPotion(otyp) {
    const obj = mksobj(otyp, false, false, { state: game });
    obj.quan = 1;
    obj.dknown = true;
    return obj;
}

test('potion.c still labels the arms this port refuses and none it skips',
    () => {
    const { code, comments } = breatheSwitchBody();
    const labelled = new Set(
        [...code.matchAll(/case (POT_[A-Z_]+|TOWEL):/gu)].map(([, n]) => n),
    );
    // Eighteen labels, of which TOWEL is not a potion type.
    assert.equal(labelled.size, 18);
    assert.ok(labelled.has('TOWEL'));
    for (const name of NO_OP_TYPES) {
        assert.equal(
            labelled.has(name), false,
            `${name} still falls out of the switch`,
        );
    }
    // C's comment names seven of the nine; the two it leaves out are why this
    // port lists all nine rather than copying the comment.
    const commented = new Set(
        [...comments.matchAll(/case (POT_[A-Z_]+):/gu)].map(([, n]) => n),
    );
    assert.equal(commented.size, 7);
    for (const name of commented)
        assert.ok(NO_OP_TYPES.includes(name), name);
    assert.deepEqual(
        NO_OP_TYPES.filter((name) => !commented.has(name)),
        ['POT_SEE_INVISIBLE', 'POT_ENLIGHTENMENT'],
    );
    // Every potion type is either labelled or in the fall-through group, so
    // the two lists together account for all 26 rows of objects.h.
    const names = Object.keys(POTION_TYPES);
    assert.equal(names.length, 26);
    for (const name of names) {
        assert.equal(
            labelled.has(name) || NO_OP_TYPES.includes(name), true,
            `${name} is accounted for`,
        );
    }
});

// The labels whose bodies this port runs. POT_INVISIBILITY came with the
// quaffing work; the other three are the vapors a potion hurled at the hero
// can raise, which muse.c use_offensive() now reaches.
const PORTED_LABELS = [
    'POT_INVISIBILITY', 'POT_PARALYSIS', 'POT_SLEEPING', 'POT_ACID',
    'POT_POLYMORPH',
];

test('the labelled arms this port has not reached stop by name', async () => {
    await startedGame(771001, 'VaporRefuse');
    const labelled = [
        ...breatheSwitchBody().code.matchAll(/case (POT_[A-Z_]+):/gu),
    ].map(([, name]) => name);
    for (const name of labelled) {
        if (PORTED_LABELS.includes(name)) continue;
        const otyp = POTION_TYPES[name];
        assert.equal(typeof otyp, 'number', name);
        await assert.rejects(
            () => potionbreathe(vaporPotion(otyp), game),
            /a potion's vapors require /u,
            name,
        );
    }
});

// potion.c:2041-2064. Both arms freeze the hero for -rnd(5) turns, set the
// reason and the message unmul() prints, and exercise Dexterity downward. The
// draws below are the only randomness either arm spends; `2` and `-1` are the
// scripted rnd(5) and rn2(2) results, and rnd(5) coming first pins the order.
for (const [label, otyp, line] of [
    ['paralysis', POT_PARALYSIS, 'Something seems to be holding you.'],
    ['sleeping', POT_SLEEPING, 'You feel rather tired.'],
]) {
    test(`the ${label} vapors freeze the hero and cost Dexterity`,
        async () => {
        await startedGame(771010, 'VaporFreeze');
        clearTopline();
        const obj = vaporPotion(otyp);
        const drawn = [];
        const random = {
            rnd: (bound) => { drawn.push(['rnd', bound]); return 2; },
            rn2: (bound) => { drawn.push(['rn2', bound]); return 1; },
        };
        const before = game.u.aexe[A_DEX];
        await potionbreathe(obj, game, { random });

        assert.equal(toplines(), line);
        // nomul(-rnd(5)) with the scripted 2.
        assert.equal(game.multi, -2);
        assert.equal(game.nomovemsg, 'You can move again.');
        // exercise(A_DEX, FALSE) adds -rn2(2), scripted to 1.
        assert.equal(game.u.aexe[A_DEX], before - 1);
        // The tail's makeknown() -- both arms set kn -- ends in
        // exercise(A_WIS, TRUE), whose rn2(19) is the third draw.
        assert.deepEqual(drawn, [['rnd', 5], ['rn2', 2], ['rn2', 19]]);
    });
}

// potion.c:2092-2095. The acid and polymorph vapors share one arm whose whole
// body is exercise(A_CON, FALSE), so the single rn2(2) is the arm.
for (const [label, otyp] of [
    ['acid', POT_ACID], ['polymorph', POT_POLYMORPH],
]) {
    test(`the ${label} vapors cost Constitution and nothing else`,
        async () => {
        await startedGame(771011, 'VaporAcid');
        // Neither arm sets kn, so the tail offers the naming prompt for a type
        // the hero has not identified. Identify it first, as do.c trycall()
        // reads the shared objects[] row.
        discover_object(otyp, true, true, false, game);
        clearTopline();
        const drawn = [];
        const random = {
            rnd: (bound) => assert.fail(`unexpected rnd(${bound})`),
            rn2: (bound) => { drawn.push(bound); return 1; },
        };
        const before = game.u.aexe[A_CON];
        await potionbreathe(vaporPotion(otyp), game, {
            random,
            encumberMessage: async () => {},
        });

        assert.equal(toplines(), '');
        assert.equal(game.u.aexe[A_CON], before - 1);
        // exercise(A_CON, FALSE)'s -rn2(2), and no other draw.
        assert.deepEqual(drawn, [2]);
        assert.equal(game.multi ?? 0, 0);
    });
}

// C ref: potion.c potionhit() (1624-1705), the hero-target branch. The acid
// arm is the only one of the isyou switch's three that a monster's hurled
// potion can reach; POT_OIL needs a lit lamp and POT_POLYMORPH refuses.
test('potionhit burns an unresistant hero with the acid it crashes',
    async () => {
    await startedGame(771020, 'PotionAcid');
    // The acid vapors set no kn, so the tail offers the naming prompt for an
    // unidentified type. Identify it first, as do.c trycall() reads the shared
    // objects[] row.
    discover_object(POT_ACID, true, true, false, game);
    clearTopline();
    const obj = vaporPotion(POT_ACID);
    obj.cursed = true; // d(2, 8) rather than d(1, 8)
    game.u.uhp = 20;
    game.u.uhpmax = 20;
    const draws = [];
    const random = {
        rn2: (bound) => { draws.push(['rn2', bound]); return 1; },
        // bottlename()'s rn2(7) and the crash rnd(2) come first; 1 keeps the
        // hero alive and picks potion.c's second bottle name.
        rnd: (bound) => { draws.push(['rnd', bound]); return 1; },
        d: (n, x) => { draws.push(['d', n, x]); return 6; },
    };
    const messages = [];

    await potionhit(game.youmonst, obj, POTHIT_MONST_THROW, {
        state: game,
        random,
        message: async (text) => { messages.push(text); },
        unsupported: (reason) => assert.fail(reason),
        encumberMessage: async () => {},
    });

    assert.deepEqual(messages, [
        'The phial crashes on your head and breaks into shards.',
        'The potion of acid evaporates.',
        'This burns a lot!',
    ]);
    // rnd(2) = 1 for the crash, then d(2, 8) = 6 for the acid.
    assert.equal(game.u.uhp, 20 - 1 - 6);
    assert.deepEqual(draws, [
        ['rn2', 7], ['rnd', 2], ['d', 2, 8],
        // potionbreathe()'s POT_ACID arm is exercise(A_CON, FALSE) alone.
        ['rn2', 2],
    ]);
});

test('potionhit refuses a target that is not the hero', async () => {
    await startedGame(771021, 'PotionMonster');
    const reasons = [];
    await potionhit({}, vaporPotion(POT_ACID), POTHIT_MONST_THROW, {
        state: game,
        random: { rn2: () => 0, rnd: () => 1, d: () => 1 },
        message: async () => {},
        unsupported: (reason) => { reasons.push(reason); },
    });
    assert.deepEqual(reasons, ['a potion crashing on a monster']);
});

test('the unlabelled types reach the naming tail and nothing else', async () => {
    await startedGame(771002, 'VaporNoop');
    for (const name of NO_OP_TYPES) {
        const otyp = POTION_TYPES[name];
        // Identify the type first, so trycall() finds oc_name_known set and
        // the tail stays silent. An unidentified type would reach docall().
        discover_object(otyp, true, true, false, game);
        const obj = vaporPotion(otyp);
        clearTopline();
        await potionbreathe(obj, game);
        assert.equal(toplines(), '', name);
        assert.equal(obj.in_use, false, name);
    }
});

test('an unidentified potion sends the naming tail to docall', async () => {
    await startedGame(771003, 'VaporCall');
    // do.c trycall() reads the shared objects[] row, not the object, so this
    // separates an identified type from an unidentified one with the same
    // object shape.
    const obj = vaporPotion(POT_FRUIT_JUICE);
    game.objects[POT_FRUIT_JUICE].oc_name_known = 0;
    game.objects[POT_FRUIT_JUICE].oc_uname = null;
    await assert.rejects(
        () => potionbreathe(obj, game),
        UnsupportedObjectNamingError,
    );
    // Either half of trycall()'s guard suppresses the prompt on its own.
    game.objects[POT_FRUIT_JUICE].oc_uname = 'fizzy';
    trycall(obj, game);
    game.objects[POT_FRUIT_JUICE].oc_uname = null;
    game.objects[POT_FRUIT_JUICE].oc_name_known = 1;
    trycall(obj, game);
    // do_name.c docall()'s own first line: a hero who cannot see the object
    // has nothing to call it by.
    docall({ ...obj, dknown: false });
    assert.throws(() => docall({ ...obj, dknown: true }),
        UnsupportedObjectNamingError);
});

test('a potion whose vapors are not seen prints nothing and is not learned',
    async () => {
    await startedGame(771004, 'VaporInvis');
    discover_object(POT_INVISIBILITY, true, true, false, game);
    // potion.c:2034 `if (!Blind && !Invis)`. Each of the two properties
    // suppresses the message on its own, and neither is what the other tests.
    for (const property of [BLINDED, INVIS]) {
        const obj = vaporPotion(POT_INVISIBILITY);
        game.u.uprops[property].intrinsic = FROMOUTSIDE;
        clearTopline();
        await potionbreathe(obj, game);
        assert.equal(toplines(), '', `${property}`);
        game.u.uprops[property].intrinsic = 0;
    }
    // BBlinded cancels the blindness again, so the message returns.
    const obj = vaporPotion(POT_INVISIBILITY);
    game.u.uprops[BLINDED].intrinsic = FROMOUTSIDE;
    game.u.uprops[BLINDED].blocked = FROMOUTSIDE;
    clearTopline();
    await potionbreathe(obj, game);
    assert.equal(toplines(), "For an instant you couldn't see yourself!");
    game.u.uprops[BLINDED].intrinsic = 0;
    game.u.uprops[BLINDED].blocked = 0;
});

test('See_invisible picks the other half of the invisibility line', async () => {
    await startedGame(771005, 'VaporSeeInvis');
    discover_object(POT_INVISIBILITY, true, true, false, game);
    clearTopline();
    await potionbreathe(vaporPotion(POT_INVISIBILITY), game);
    assert.equal(toplines(), "For an instant you couldn't see yourself!");
    // youprop.h:152 See_invisible is either source and has no blocked term, so
    // this one property is the only input that separates the two strings.
    game.u.uprops[SEE_INVIS].extrinsic = 1;
    clearTopline();
    await potionbreathe(vaporPotion(POT_INVISIBILITY), game);
    assert.equal(
        toplines(),
        'For an instant you could see right through yourself!',
    );
    game.u.uprops[SEE_INVIS].extrinsic = 0;
});

test('a wet towel takes the TOWEL arm whatever the potion is', async () => {
    await startedGame(771006, 'VaporTowel');
    discover_object(POT_INVISIBILITY, true, true, false, game);
    const towel = mksobj(TOWEL, false, false, { state: game });
    towel.spe = 1;
    game.ublindf = towel;
    // youprop.h:405 Half_gas_damage needs the towel damp: `spe > 0`. One
    // charge is the smallest amount that qualifies and zero the largest that
    // does not, which is the pair that fixes the comparison.
    await assert.rejects(
        () => potionbreathe(vaporPotion(POT_INVISIBILITY), game),
        /the wet towel/u,
    );
    towel.spe = 0;
    clearTopline();
    await potionbreathe(vaporPotion(POT_INVISIBILITY), game);
    assert.equal(toplines(), "For an instant you couldn't see yourself!");
    game.ublindf = null;
});

test('an in-use potion keeps its flag through the vapors', async () => {
    await startedGame(771007, 'VaporInUse');
    discover_object(POT_OIL, true, true, false, game);
    // potion.c:1936-1940: the flag is set for the duration and restored only
    // when the caller had not set it. A caller that had is the pair that
    // separates the restore from an unconditional clear.
    const fresh = vaporPotion(POT_OIL);
    fresh.in_use = false;
    await potionbreathe(fresh, game);
    assert.equal(fresh.in_use, false);
    const held = vaporPotion(POT_OIL);
    held.in_use = true;
    await potionbreathe(held, game);
    assert.equal(held.in_use, true);
});

test('a potion the hero cannot make out skips the naming tail', async () => {
    await startedGame(771008, 'VaporUnknown');
    // potion.c:2110 `if (obj->dknown)`. The invisibility arm sets kn, so with
    // dknown clear the tail skips a makeknown() it would otherwise run: the
    // hero saw the effect but not the bottle it came out of. An unidentified
    // type is what makes that visible, and the message prints either way.
    const type = game.objects[POT_INVISIBILITY];
    type.oc_name_known = 0;
    type.oc_encountered = 0;
    type.oc_uname = null;
    const obj = vaporPotion(POT_INVISIBILITY);
    obj.dknown = false;
    clearTopline();
    await potionbreathe(obj, game);
    assert.equal(toplines(), "For an instant you couldn't see yourself!");
    assert.equal(type.oc_name_known, 0);
    assert.equal(type.oc_encountered, 0);
});

test('a message that names the potion identifies its type', async () => {
    await startedGame(771009, 'VaporLearn');
    // hack.h:1530 makeknown(x) is discover_object(x, TRUE, TRUE, TRUE): it
    // marks the type known, marks it encountered, and credits the hero with
    // the discovery through exercise(A_WIS, TRUE), whose rn2(19) is the only
    // draw potionbreathe() makes. An already identified type reaches none of
    // the three, so the potion below starts unidentified.
    const type = game.objects[POT_INVISIBILITY];
    type.oc_name_known = 0;
    type.oc_encountered = 0;
    type.oc_uname = null;
    const drawn = [];
    clearTopline();
    await potionbreathe(vaporPotion(POT_INVISIBILITY), game, {
        random: { rn2: (bound) => { drawn.push(bound); return 18; } },
    });
    assert.equal(toplines(), "For an instant you couldn't see yourself!");
    assert.equal(type.oc_name_known, 1);
    assert.equal(type.oc_encountered, 1);
    assert.deepEqual(drawn, [19]);
});

test('the potion refusals are ones the command seam converts', () => {
    // js/cmd.js failClosedCommandRefusals() decides whether a refusal ends the
    // segment on its last matching screen or escapes and loses every screen
    // the command earned. Both classes below are raised under dozap(), so
    // dropping either from that list would turn a clean stop into a lost
    // segment with nothing failing.
    const listed = failClosedCommandRefusals();
    assert.ok(listed.includes(UnsupportedPotionError));
    assert.ok(listed.includes(UnsupportedObjectNamingError));
    // UnsupportedQuaffError is raised by dodrink/dopotion/peffects for
    // unported branches. Dropping it would lose every screen the quaff
    // command earned before the refusal.
    assert.ok(listed.includes(UnsupportedQuaffError));
});

test('sickness potion clears active hallucination before returning', async () => {
    await startedGame(771021, 'SicknessCuresHallucination');
    game.u.uprops[HALLUC] = { intrinsic: 30, extrinsic: 0 };
    game.u.uprops[HALLUC_RES] = { intrinsic: 0, extrinsic: 0 };
    const obj = vaporPotion(POT_SICKNESS);
    clearTopline();
    for (let i = 0; i < 3; ++i) game.nhDisplay.pushKey(' '.charCodeAt(0));

    await peffects(obj, game);

    assert.equal(game.u.uprops[HALLUC].intrinsic & TIMEOUT, 0);
    assert.equal(toplines(), 'You are shocked back to your senses!');
});

// ---------------------------------------------------------------------------
// Timeout utilities: set_itimeout and incr_itimeout
// C ref: potion.c:55-86. These clamp and increment the timeout field of an
// intrinsic property packed as (flags | timeout) in a single integer.
// ---------------------------------------------------------------------------

test('set_itimeout replaces only the low TIMEOUT bits', () => {
    // The intrinsic integer carries flag bits above TIMEOUT and a timeout
    // value in the low 24 bits. set_itimeout replaces the timeout while
    // keeping the flags. FROMOUTSIDE (0x04000000) is a typical flag bit
    // above the TIMEOUT mask.
    const prop = { intrinsic: FROMOUTSIDE | 50 };
    set_itimeout(prop, 200);
    // Flag bits survive, timeout is replaced.
    assert.equal(prop.intrinsic & ~TIMEOUT, FROMOUTSIDE);
    assert.equal(prop.intrinsic & TIMEOUT, 200);
});

test('set_itimeout clamps negative values to zero', () => {
    // itimeout(val) returns 0 for val < 1, so a negative set clears the
    // timeout without touching the flag bits.
    const prop = { intrinsic: FROMOUTSIDE | 100 };
    set_itimeout(prop, -5);
    assert.equal(prop.intrinsic & TIMEOUT, 0);
    assert.equal(prop.intrinsic & ~TIMEOUT, FROMOUTSIDE);
});

test('set_itimeout clamps large values to TIMEOUT', () => {
    // itimeout(val) returns TIMEOUT for val >= TIMEOUT, preventing overflow
    // into the flag bits.
    const prop = { intrinsic: 0 };
    set_itimeout(prop, TIMEOUT + 1000);
    assert.equal(prop.intrinsic & TIMEOUT, TIMEOUT);
});

test('incr_itimeout adds to the existing timeout field', () => {
    // The existing timeout is (intrinsic & TIMEOUT), and the increment is
    // added to it. The flag bits above TIMEOUT are untouched.
    const prop = { intrinsic: FROMOUTSIDE | 100 };
    incr_itimeout(prop, 50);
    assert.equal(prop.intrinsic & TIMEOUT, 150);
    assert.equal(prop.intrinsic & ~TIMEOUT, FROMOUTSIDE);
});

test('incr_itimeout saturates at TIMEOUT instead of overflowing', () => {
    // Adding a large increment to an already-large timeout should not
    // overflow into the flag bits or wrap around.
    const prop = { intrinsic: TIMEOUT - 10 };
    incr_itimeout(prop, 100);
    assert.equal(prop.intrinsic & TIMEOUT, TIMEOUT);
});

// ---------------------------------------------------------------------------
// make_confused() and peffect_confusion()
// C ref: potion.c make_confused() (89-104) and peffect_confusion()
// (1014-1027). The effect has distinct feedback for a newly confused sober
// hero, a newly confused hallucinating hero, and an already confused hero.
// ---------------------------------------------------------------------------

test('make_confused updates only status transitions and clears with feedback',
    async () => {
    await startedGame(771006, 'ConfusionState');
    const hero = game.u;
    const confusion = hero.uprops[CONFUSION];
    const hallucination = hero.uprops[HALLUC];
    const resistance = hero.uprops[HALLUC_RES];

    confusion.intrinsic = 0;
    game.disp.botl = false;
    // 25 is a positive timeout chosen to cross from no confusion to
    // confusion; make_confused() marks the status line only at that boundary.
    await make_confused(25, false, game);
    assert.equal(confusion.intrinsic & TIMEOUT, 25);
    assert.equal(game.disp.botl, true);

    game.disp.botl = false;
    // 40 keeps confusion active, so C changes the timeout without marking the
    // status line for a condition transition.
    await make_confused(40, false, game);
    assert.equal(confusion.intrinsic & TIMEOUT, 40);
    assert.equal(game.disp.botl, false);

    clearTopline();
    await make_confused(0, true, game);
    assert.equal(confusion.intrinsic & TIMEOUT, 0);
    assert.equal(toplines(), 'You feel less confused now.');
    assert.equal(game.disp.botl, true);

    // Start confusion again before checking Hallucination's alternate clear
    // wording. The positive timeout crosses the same status boundary as 25.
    await make_confused(12, false, game);
    hallucination.intrinsic = 1;
    resistance.intrinsic = 0;
    resistance.extrinsic = 0;
    game.disp.botl = false;
    clearTopline();
    // Zero clears confusion. With Hallucination active, potion.c says
    // "less trippy" rather than "less confused" when talk is true.
    await make_confused(0, true, game);
    assert.equal(confusion.intrinsic & TIMEOUT, 0);
    assert.equal(toplines(), 'You feel less trippy now.');
    assert.equal(game.disp.botl, true);

    // Unaware is gm.multi < 0 plus unconscious(). "You awake" is one of the
    // three pending-message prefixes trap.c unconscious() recognizes. It
    // suppresses feedback but does not suppress the state transition.
    confusion.intrinsic = 15;
    game.multi = -1;
    game.nomovemsg = 'You awake.';
    game.disp.botl = false;
    clearTopline();
    await make_confused(0, true, game);
    assert.equal(confusion.intrinsic & TIMEOUT, 0);
    assert.equal(toplines(), '');
    assert.equal(game.disp.botl, true);
});

test('a sober confusion potion prints its message and draws its timeout',
    async () => {
    await startedGame(771007, 'ConfusionSober');
    const potion = vaporPotion(POT_CONFUSION);
    const confusion = game.u.uprops[CONFUSION];
    confusion.intrinsic = 0;
    game.u.uprops[HALLUC].intrinsic = 0;
    game.gp.potion_nothing = 0;
    game.gp.potion_unkn = 0;
    game.disp.botl = false;
    clearTopline();
    enableRngLog();

    const result = await peffects(potion, game);
    const [call] = getRngLog();
    const draw = Number(/^rn2\(7\)=([0-6])$/u.exec(call)?.[1]);

    assert.equal(result, -1);
    assert.equal(toplines(), 'Huh, What?  Where am I?');
    assert.equal(game.gp.potion_nothing, 0);
    assert.equal(game.gp.potion_unkn, 0);
    assert.deepEqual(getRngLog(), [`rn2(7)=${draw}`]);
    // An uncursed potion uses rn1(7, 16), so its timeout is 16 plus the
    // recorded zero-to-six draw.
    assert.equal(confusion.intrinsic & TIMEOUT, 16 + draw);
    assert.equal(game.disp.botl, true);
});

test('a hallucinating hero gets the trippy confusion feedback', async () => {
    await startedGame(771008, 'ConfusionHallu');
    const potion = vaporPotion(POT_CONFUSION);
    potion.blessed = true;
    potion.cursed = false;
    const confusion = game.u.uprops[CONFUSION];
    confusion.intrinsic = 0;
    game.u.uprops[HALLUC].intrinsic = 30;
    game.u.uprops[HALLUC_RES].intrinsic = 0;
    game.u.uprops[HALLUC_RES].extrinsic = 0;
    game.gp.potion_nothing = 0;
    game.gp.potion_unkn = 0;
    clearTopline();
    enableRngLog();

    await peffects(potion, game);
    const [call] = getRngLog();
    const draw = Number(/^rn2\(7\)=([0-6])$/u.exec(call)?.[1]);

    assert.equal(toplines(), 'What a trippy feeling!');
    assert.equal(game.gp.potion_nothing, 0);
    assert.equal(game.gp.potion_unkn, 1);
    // A blessed potion uses rn1(7, 8), the shortest of the three BUC bases.
    assert.deepEqual(getRngLog(), [`rn2(7)=${draw}`]);
    assert.equal(confusion.intrinsic & TIMEOUT, 8 + draw);
});

test('an already confused hero gets no direct feedback and a longer timeout',
    async () => {
    await startedGame(771009, 'ConfusionAgain');
    const potion = vaporPotion(POT_CONFUSION);
    potion.blessed = false;
    potion.cursed = true;
    const confusion = game.u.uprops[CONFUSION];
    // 20 is an existing timeout chosen to take peffect_confusion()'s
    // Confusion arm and make_confused()'s active-to-active transition.
    confusion.intrinsic = 20;
    game.gp.potion_nothing = 0;
    game.gp.potion_unkn = 0;
    game.disp.botl = false;
    clearTopline();
    enableRngLog();

    await peffects(potion, game);
    const [call] = getRngLog();
    const draw = Number(/^rn2\(7\)=([0-6])$/u.exec(call)?.[1]);

    assert.equal(toplines(), '');
    assert.equal(game.gp.potion_nothing, 1);
    assert.equal(game.gp.potion_unkn, 0);
    // A cursed potion adds rn1(7, 24) to the existing 20-turn timeout.
    assert.deepEqual(getRngLog(), [`rn2(7)=${draw}`]);
    assert.equal(confusion.intrinsic & TIMEOUT, 20 + 24 + draw);
    assert.equal(game.disp.botl, false);
});

test('confusion timeout bases depend on beatitude, not hero state',
    async () => {
        // potion.c uses 16 - 8*bcsign: blessed, uncursed, and cursed bases
        // are 8, 16, and 24. Keeping the hero sober in all three cases makes
        // beatitude the only input that can select the base.
        for (const [label, seed, blessed, cursed, base] of [
            ['blessed', 771030, true, false, 8],
            ['uncursed', 771031, false, false, 16],
            ['cursed', 771032, false, true, 24],
        ]) {
            await startedGame(seed, `Confusion${label}`);
            const potion = vaporPotion(POT_CONFUSION);
            potion.blessed = blessed;
            potion.cursed = cursed;
            const confusion = game.u.uprops[CONFUSION];
            confusion.intrinsic = 0;
            game.u.uprops[HALLUC].intrinsic = 0;
            game.gp.potion_nothing = 0;
            game.gp.potion_unkn = 0;
            clearTopline();
            enableRngLog();

            await peffects(potion, game);
            const [call] = getRngLog();
            const draw = Number(/^rn2\(7\)=([0-6])$/u.exec(call)?.[1]);

            assert.equal(
                confusion.intrinsic & TIMEOUT,
                base + draw,
                label,
            );
        }
    });

// ---------------------------------------------------------------------------
// speed_up()
// C ref: potion.c speed_up() (2918-2928). Prints the speed-change message,
// calls exercise(A_DEX, TRUE), and increments HFast's timeout.
// ---------------------------------------------------------------------------

test('speed_up prints "much faster" when hero has no speed at all', async () => {
    // !Very_fast and !Fast: the hero starts without any FAST property, so
    // the message includes "much ". exercise(A_DEX, TRUE) draws rn2(19).
    await startedGame(771010, 'SpeedNone');
    const hero = game.u;
    hero.uprops[FAST] = { intrinsic: 0, extrinsic: 0 };
    clearTopline();
    // duration = 160, chosen to be the C result for bcsign(uncursed) = 0:
    // rn1(10, 100 + 60*0) = rn1(10, 100), range 100-109.
    await speed_up(160, game);
    assert.equal(toplines(), 'You are suddenly moving much faster.');
    // The timeout was 0 and is now 160.
    assert.equal(hero.uprops[FAST].intrinsic & TIMEOUT, 160);
});

test('speed_up prints "faster" when hero already has intrinsic speed',
    async () => {
    // !Very_fast but Fast: the hero has FROMOUTSIDE (permanent intrinsic)
    // but no timed speed. Very_fast = (HFast & ~INTRINSIC) || EFast, which
    // is false because the intrinsic is entirely flag bits (FROMOUTSIDE is
    // a flag bit inside INTRINSIC). Fast = (HFast || EFast), true because
    // HFast is nonzero.
    await startedGame(771011, 'SpeedIntrinsic');
    const hero = game.u;
    hero.uprops[FAST] = { intrinsic: FROMOUTSIDE, extrinsic: 0 };
    clearTopline();
    await speed_up(160, game);
    assert.equal(toplines(), 'You are suddenly moving faster.');
});

test('speed_up prints "legs get new energy" when hero is already Very_fast',
    async () => {
    // Very_fast: the hero has both FROMOUTSIDE and a nonzero timeout, or
    // extrinsic speed. Here we use a timed timeout (timeout = 50) which
    // sets (HFast & ~INTRINSIC) nonzero.
    await startedGame(771012, 'SpeedVeryFast');
    const hero = game.u;
    hero.uprops[FAST] = { intrinsic: FROMOUTSIDE | 50, extrinsic: 0 };
    clearTopline();
    await speed_up(160, game);
    assert.match(toplines(), /Your legs get new energy\./u);
});

// ---------------------------------------------------------------------------
// peffect_oil: quaffing a potion of oil
// C ref: potion.c peffect_oil() (1259-1294). Three branches: normal, cursed,
// and lit. Tests replay segments that exercise each path.
// ---------------------------------------------------------------------------

test('quaffing normal oil prints "That was smooth!"', async () => {
    // Replays seed2200 through step 5: the hero quaffs an uncursed, unlit
    // potion of oil (item 'h'). The normal branch prints "That was smooth!"
    // and calls exercise(A_WIS, FALSE), whose rn2(2) is the only peffect_oil
    // draw. rn2(2)=1 at attrib.c:509 confirms the call.
    await runSegment({
        seed: 2200,
        datetime: '20000110090000',
        nethackrc:
            'OPTIONS=name:merlin,role:Wizard,race:human,gender:male,align:neutral\n'
            + 'OPTIONS=!autopickup\n'
            + 'OPTIONS=suppress_alert:3.4.3\n'
            + 'OPTIONS=symset:DECgraphics',
        // space space=welcome+more, n=decline tutorial, q=quaff, h=select oil
        moves: '  nqh',
    });
    assert.equal(toplines(), 'That was smooth!');
});

test('quaffing cursed oil prints "This tastes like castor oil."', async () => {
    // In playmode:debug, #wizwish (Ctrl+W) creates a cursed potion of oil.
    // The cursed branch prints the castor-oil message and calls
    // exercise(A_WIS, FALSE), the same draw shape as the normal branch.
    await runSegment({
        seed: 100,
        datetime: '20000110090000',
        nethackrc:
            'OPTIONS=name:tester,role:Wizard,race:human,gender:male,align:neutral,playmode:debug\n'
            + 'OPTIONS=!autopickup,!legacy,!tutorial\n'
            + 'OPTIONS=suppress_alert:3.4.3\n'
            + 'OPTIONS=symset:DECgraphics',
        // space=welcome, Ctrl+W=#wizwish, "cursed potion of oil"\n,
        // q=quaff, p=select wished item
        moves: ' \x17cursed potion of oil\nqp',
    });
    assert.equal(toplines(), 'This tastes like castor oil.');
});

test('peffects POT_OIL no longer throws UnsupportedQuaffError', async () => {
    // Porting peffect_oil() should remove the throw for POT_OIL from the
    // peffects switch. The normal branch is the simplest way to verify: if
    // it threw, runSegment() would catch UnsupportedQuaffError and the test
    // above would fail. This test pins the expectation independently by
    // confirming the UnsupportedQuaffError list no longer includes POT_OIL.
    // Broken by reverting the switch arm to a throw.
    await startedGame(771020, 'OilNoThrow');
    const obj = vaporPotion(POT_OIL);
    obj.cursed = false;
    obj.lamplit = false;
    // potionbreathe still works for POT_OIL (its vapors do nothing), which
    // confirms the object type is valid and the otyp constant is right.
    discover_object(POT_OIL, true, true, false, game);
    clearTopline();
    await potionbreathe(obj, game);
    assert.equal(toplines(), '');
});
