#!/usr/bin/env node

// Record and replay the #twoweapon command against the patched C reference.
// Every segment contains replay inputs only; runFreshMatrix() records new
// reference output in an isolated temporary workspace.
//
// Six groups of cases:
//
// - TIME_COST_CASES settle wield.c dotwoweapon()'s single draw. It ends
//   `(rnd(20) > ACURR(A_DEX)) ? ECMD_TIME : ECMD_OK`, so one draw decides
//   whether turning two-weapon combat on costs the hero a move. The four
//   seeds were chosen by recording Samurai starts until each side of that
//   comparison appeared, including the equal case that separates `>` from
//   `>=`.
// - SWITCH_CASES issue the command twice, so the toggle-off arm at
//   wield.c:847-853 runs after the success path that armed it.
// - REFUSAL_CASES reach one arm of wield.c can_twoweapon() each. Which arm a
//   role reaches is fixed by its u_init.c starting inventory and by
//   mondata.h could_twoweap() over its monst.c role monster, so a role
//   selects an arm the way a keystroke selects a command.
// - WEAPONSTATUS_CASES turn on the one option that puts the outcome on the
//   status line, which every other group leaves off.
// - NAMING_CASES take a worn piece off while two-weapon combat is on, so
//   objnam.c doname_base()'s owornmask suffixes are formatted with u.twoweap
//   set. It reads the flag only for W_WEP (:1562) and W_SWAPWEP (:1614), so
//   every other worn mask has to name itself unchanged.
// - INVENTORY_CASES open the inventory menu, where invent.c ddoinv() names
//   both wielded slots side by side. Each case selects one arm of the two
//   word choices at objnam.c:1591-1595 and :1613-1621.
// - SKILL_CASES press `^X` while two-weapon combat is on, so insight.c
//   weapon_insight() takes its two-weapon branch (1334-1463) instead of the
//   single-weapon one above it.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    A_DEX,
    BASICENLIGHTENMENT,
    ENL_GAMEINPROGRESS,
    P_TWO_WEAPON_COMBAT,
} from '../js/const.js';
import { effective_attribute } from '../js/attrib.js';
import { weapon_status } from '../js/display.js';
import { game } from '../js/gstate.js';
import { enlightenment } from '../js/insight.js';
import { runSegment } from '../js/jsmain.js';
import { could_twoweap } from '../js/mondata.js';
import { FEDORA, KATANA, SHORT_SWORD } from '../js/objects.js';
import { P_SKILL, weapon_type } from '../js/startup_skills.js';
import { LEFT_HANDED, RIGHT_HANDED } from '../js/u_init.js';
import { bimanual } from '../js/worn.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
// A fixed clock with no calendar event, so nothing competes for the top line.
const DATETIME = '20310203040506';
const WAIT = '.';
// cmd.c extcmdlist[] binds '#' to doextcmd(); "twoweapon" names row 0x58.
const TWOWEAPON = '#twoweapon\n';
// 'i' opens the inventory menu through invent.c ddoinv(); escape closes it.
const INVENTORY = 'i\x1b';
// cmd.c extcmdlist[] row 0x18 is "attributes", which calls insight.c
// doattributes(). Its window runs to two pages, so the space turns to the
// second one -- the page the skill lines fall on -- and the escape dismisses
// it from there.
const ATTRIBUTES_KEY = '\x18';
const ATTRIBUTES = `${ATTRIBUTES_KEY} \x1b`;

// Recorded C results for each seed: the rnd(20) the C log attributes to
// dotwoweapon(wield.c:861), and the Dexterity its status line shows. `costs`
// restates wield.c:861 rather than an observation, so a seed whose draw
// changed would fail the verifier rather than silently agree with it.
export const TIME_COST_CASES = [
    // Draw above Dexterity: the command costs a move. The C step logs the
    // whole following turn (18 calls) instead of the draw alone.
    { seed: 7710001, draw: 20, dexterity: 13 },
    // Draw equal to Dexterity: `>` is false, so the command is free. This is
    // the only case that distinguishes wield.c:861 from `>=`.
    { seed: 7710002, draw: 15, dexterity: 15 },
    // Draw below Dexterity: the ordinary free switch.
    { seed: 7710003, draw: 11, dexterity: 14 },
    // A second costing case, at a different Dexterity from the first.
    { seed: 7710004, draw: 20, dexterity: 16 },
];

// role.c fixes which race, gender and alignment each role admits, and
// u_init.c fixes the loadout that follows. Only roles whose loadout can be
// reached from a fresh start appear here; wield.c:791 (an artifact in the
// secondary slot) and wield.c:797 (slippery fingers or a cursed secondary)
// have no such role, because u_init.c:1310 asks mksobj() for no artifact and
// u_init.c:1223 clears cursed on every starting object.
const ROLES = {
    // u_init.c:143-144 wields a katana over a short sword: can_twoweapon()'s
    // success path.
    samurai: { role: 'Samurai', race: 'human', gender: 'male',
               align: 'lawful' },
    // u_init.c:44,48 wield a bullwhip over a pick-axe, so TWOWEAPOK()'s
    // is_weptool() arm decides the secondary slot.
    archeologist: { role: 'Archeologist', race: 'human', gender: 'male',
                    align: 'lawful' },
    // u_init.c:134-135 wield a short sword over a stack of daggers, the only
    // start whose secondary slot holds more than one object.
    rogue: { role: 'Rogue', race: 'human', gender: 'male', align: 'chaotic' },
    // monsters.h:3454 gives the wizard role monster one AT_WEAP attack, so
    // could_twoweap() is false however the hands are filled.
    wizard: { role: 'Wizard', race: 'human', gender: 'male',
              align: 'neutral' },
    // monsters.h:3363 likewise. role.c:113 names both forms, and wield.c:770
    // reads the female one only when flags.female is set, so the same arm
    // prints "Cavemen" for one gender and "Cavewomen" for the other.
    caveman: { role: 'Caveman', race: 'human', gender: 'male',
               align: 'neutral' },
    cavewoman: { role: 'Caveman', race: 'human', gender: 'female',
                 align: 'neutral' },
    // u_init.c:151 quivers the Tourist's darts and wields nothing.
    tourist: { role: 'Tourist', race: 'human', gender: 'male',
               align: 'neutral' },
    // u_init.c:55 or :62 wields a two-handed sword or a battle-axe; both are
    // oc_bimanual.
    barbarian: { role: 'Barbarian', race: 'human', gender: 'male',
                 align: 'neutral' },
    // u_init.c:163 wears a small shield over the spear and dagger.
    valkyrie: { role: 'Valkyrie', race: 'human', gender: 'female',
                align: 'lawful' },
};

// One seed for every case that is not measuring the draw: which arm of
// can_twoweapon() a role reaches does not depend on the seed, so a second
// seed would only vary the level around the hero.
//
// It does have to be a seed whose first turn the port can already replay.
// 7710101 and 7710102 both put a monster next to the hero, and the port stops
// on the leading wait at monmove.c distfleeck(), before the command is even
// typed. 7710103 is the first seed after them that no role stops on.
const REFUSAL_SEED = 7710103;

const SWITCH_CASES = [
    { who: 'samurai', seed: REFUSAL_SEED },
    { who: 'archeologist', seed: REFUSAL_SEED },
    { who: 'rogue', seed: REFUSAL_SEED },
];

// wield.c set_twoweap() marks the status line dirty only when
// flags.weaponstatus is on, and botl.c:492-499 is what it dirties the line
// for. With the option off -- every other group here, and every recorded
// session -- the field is absent, so no recorded screen shows what a
// successful #twoweapon does to it. This case turns it on over the Samurai
// start whose success path the switch group already replays.
export const WEAPONSTATUS_CASES = [
    { who: 'samurai', seed: REFUSAL_SEED },
];

// u_init.c:44-52 wears a fedora over a leather jacket, so the Archeologist is
// the one can_twoweapon() success path whose Take-off prompt has more than one
// candidate and whose helmet slot is filled. objects.h gives FEDORA an
// oc_delay of 0, which is what do_wear.c armoroff() admits today.
export const NAMING_CASES = [
    { who: 'archeologist', seed: REFUSAL_SEED, takeOff: 'c', otyp: FEDORA },
];

// objnam.c:1571-1595 and :1613-1621 are two word choices over the same hero,
// and the inventory menu shows both at once. `twoweapon` picks the arm;
// `lefty` states which way URIGHTY reads, since :1586 and :1616 take opposite
// sides of it.
//
// 7710205 is the first seed at or above 7710200 whose Samurai u_init.c:395
// draw comes up LEFT_HANDED and whose start the port already replays. That
// draw is character creation's own rn2(10), so a scan of starts is the only
// way to find one; every other case reuses REFUSAL_SEED.
export const INVENTORY_CASES = [
    // Flag clear: ":1594 weapon in right hand" over ":1619 alternate weapon;
    // not wielded". The control that shows what the flag changes.
    { who: 'samurai', seed: REFUSAL_SEED, twoweapon: false, lefty: false },
    // Flag set over the same start: ":1593 wielded in right hand" over
    // ":1615 wielded in left hand".
    { who: 'samurai', seed: REFUSAL_SEED, twoweapon: true, lefty: false },
    // The same pair for a left-handed hero, where both phrases swap hands.
    { who: 'samurai', seed: 7710205, twoweapon: true, lefty: true },
    // The Rogue's stack of daggers in the secondary slot, which is the only
    // starting loadout that has one. Flag clear, so :1619's plur(obj->quan)
    // reads "alternate weapons".
    { who: 'rogue', seed: REFUSAL_SEED, twoweapon: false, lefty: false },
    // The same stack with the flag set: :1615 names a hand and no count.
    { who: 'rogue', seed: REFUSAL_SEED, twoweapon: true, lefty: false },
];

// insight.c weapon_insight():1334-1463, the arm that reports weapon skill
// while u.twoweap is set. All three roles whose starting loadout
// can_twoweapon() accepts land on the same pair of comparisons, and no valid
// input can move them: u_init.c skill_init() sets every carried weapon's
// skill to P_BASIC and leaves P_TWO_WEAPON_COMBAT at P_UNSKILLED for every
// role that lists it, so `twoskl < sklvl` at :1362 and `twoskl < sklvl2` at
// :1395 are the only arms a fresh C start reaches. QUALITY.json carries the
// deferral for the rest of the branch.
//
// What the three cases do separate is the skill names the two arms
// interpolate, and with them the length of the stored menu line: only the
// Samurai's secondary line is long enough for wintty.c:2728-2733 to cut.
export const SKILL_CASES = [
    // katana over short sword. "Your skill in short sword is also limited by
    // being unskilled with two weapons." stores 79 characters, two more than
    // tty_end_menu() leaves room for, so C's screen drops its final period.
    { who: 'samurai', seed: REFUSAL_SEED, clipped: true },
    // bullwhip over pick-axe, the weapon-tool secondary. Its longest line is
    // 76 characters, so nothing is cut and the period stays.
    { who: 'archeologist', seed: REFUSAL_SEED, clipped: false },
    // short sword over a stack of daggers. weapon_type() reads the stack's
    // type, so the count never reaches the skill name.
    { who: 'rogue', seed: REFUSAL_SEED, clipped: false },
];

// Each case names the can_twoweapon() arm its role reaches and the state that
// selects it. Every `arm` cites the `if` or `} else if` that opens the arm it
// names, which scripts/twoweapon-matrix.test.mjs re-reads out of wield.c.
// verifyRefusal() checks the state against the port before the differential
// compares C's message with the port's.
//
// Three roles reach wield.c:765, and two of them differ inside it: :770-771
// takes urole.name.f over urole.name.m only when flags.female is set.
//
// wield.c:780-785, the unsuitable-weapon arm, has no case here, and no role
// could give it one. Replaying every role's start at REFUSAL_SEED shows that
// the only two whose u_init.c loadout puts a launcher in a hand -- the
// Caveman's sling and the Ranger's bow -- are also roles whose monst.c role
// monster has a single AT_WEAP attack, so wield.c:765 refuses first; every
// role that clears :765 holds only objects TWOWEAPOK() admits.
// scripts/twoweapon.test.mjs pins that arm from constructed states instead.
export const REFUSAL_CASES = [
    { who: 'wizard', seed: REFUSAL_SEED, arm: 'wield.c:765 !could_twoweap()',
      reaches: () => !could_twoweap(game.youmonst.data) },
    { who: 'caveman', seed: REFUSAL_SEED,
      arm: 'wield.c:765 !could_twoweap() with a male role name',
      reaches: () => !could_twoweap(game.youmonst.data) && !game.flags.female },
    { who: 'cavewoman', seed: REFUSAL_SEED,
      arm: 'wield.c:765 !could_twoweap() with a female role name',
      reaches: () => !could_twoweap(game.youmonst.data) && game.flags.female },
    { who: 'tourist', seed: REFUSAL_SEED, arm: 'wield.c:772 !uwep||!uswapwep',
      reaches: () => !game.uwep && !game.uswapwep },
    { who: 'barbarian', seed: REFUSAL_SEED, arm: 'wield.c:786 bimanual()',
      reaches: () => bimanual(game.uwep) },
    { who: 'valkyrie', seed: REFUSAL_SEED, arm: 'wield.c:789 uarms',
      reaches: () => Boolean(game.uarms) },
];

// One short name for every segment. u_init.c's welcome line names the hero,
// the role, the race, the gender and the alignment, and a longer name wraps it
// past 80 columns into a --More-- that would swallow the leading wait.
//
// `weaponstatus` is off in every group but WEAPONSTATUS_CASES, so the recorded
// status line carries no weapon field and nothing on it moves with the hands.
function nethackrc(who = 'samurai', { weaponstatus = false } = {}) {
    const { role, race, gender, align } = ROLES[who];
    return [
        `OPTIONS=name:Twoweap,role:${role},race:${race},gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics',
        ...(weaponstatus ? ['OPTIONS=weaponstatus'] : []),
        '',
    ].join('\n');
}

// Each segment waits, issues the command, then waits twice more, so a move
// wrongly spent or wrongly saved moves every later turn into a screen the
// differential compares.
function segment({ seed, who = 'samurai', repeat = 1, weaponstatus = false }) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc(who, { weaponstatus }),
        moves: `${WAIT}${TWOWEAPON.repeat(repeat)}${WAIT}${WAIT}`,
    };
}

export function loadTwoWeaponCommandRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: TIME_COST_CASES.map((entry) => segment(entry)),
    });
}

export function loadTwoWeaponSwitchRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: SWITCH_CASES.map((entry) => segment({ ...entry, repeat: 2 })),
    });
}

export function loadTwoWeaponRefusalRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: REFUSAL_CASES.map((entry) => segment(entry)),
    });
}

// The command, then Take-off and the letter that answers its prompt. No
// trailing wait: armoroff()'s message is the result this case is here for, and
// a later turn would only add screens that the other groups already compare.
function namingSegment({ seed, who, takeOff }) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc(who),
        moves: `${WAIT}${TWOWEAPON}T${takeOff}`,
    };
}

export function loadTwoWeaponNamingRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: NAMING_CASES.map((entry) => namingSegment(entry)),
    });
}

// The command when the case wants it, then the inventory menu and the escape
// that closes it. No trailing wait: ddoinv() costs no time, so a later turn
// would only repeat screens the other groups already compare.
function inventorySegment({ seed, who, twoweapon }) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc(who),
        moves: `${WAIT}${twoweapon ? TWOWEAPON : ''}${INVENTORY}`,
    };
}

export function loadTwoWeaponInventoryRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: INVENTORY_CASES.map((entry) => inventorySegment(entry)),
    });
}

// The command, then the attributes window, then a wait. ^X spends no time, so
// the trailing wait is what shows that: a move wrongly spent there would move
// every screen after it.
function skillSegment({ seed, who }) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc(who),
        moves: `${WAIT}${TWOWEAPON}${ATTRIBUTES}${WAIT}`,
    };
}

export function loadTwoWeaponSkillRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: SKILL_CASES.map((entry) => skillSegment(entry)),
    });
}

export function loadTwoWeaponStatusRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: WEAPONSTATUS_CASES.map(
            (entry) => segment({ ...entry, weaponstatus: true }),
        ),
    });
}

// The recipes carry replay inputs only, so a segment is matched back to its
// case by the nethackrc that selects the role, which is unique per case.
function caseFor(entries, recipeSegment) {
    const found = entries.find(
        (entry) => nethackrc(entry.who) === recipeSegment.nethackrc,
    );
    if (!found)
        throw new Error(`no recorded case for ${recipeSegment.nethackrc}`);
    return found;
}

async function verifyTimeCost(recipeSegment) {
    const found = TIME_COST_CASES.find(
        (entry) => entry.seed === recipeSegment.seed,
    );
    if (!found) throw new Error(`no case for seed ${recipeSegment.seed}`);
    const { draw, dexterity } = found;
    // wield.c:861. Restated here so the expectation is the C comparison, not
    // a remembered outcome.
    const costsAMove = draw > dexterity;

    // Stop one keystroke before the Enter that submits the command. The
    // Samurai's u_init.c:142-148 loadout is can_twoweapon()'s success path,
    // and every condition it turns on is checked here rather than assumed.
    await runSegment({ ...recipeSegment, moves: `${WAIT}#twoweapon` });
    if (game.u.twoweap)
        throw new Error('two-weapon combat was already on before the command');
    if (game.uwep?.otyp !== KATANA || game.uswapwep?.otyp !== SHORT_SWORD)
        throw new Error('setup did not leave a katana and a short sword');
    if (game.uarms)
        throw new Error('setup wore a shield, which can_twoweapon() refuses');
    if (effective_attribute(game, A_DEX) !== dexterity)
        throw new Error(`setup Dexterity is not ${dexterity}`);
    const movesBefore = game.moves;

    // Submit it. The trailing waits are omitted so that game.moves reports
    // this command's own time cost and nothing else's.
    await runSegment({ ...recipeSegment, moves: `${WAIT}${TWOWEAPON}` });
    if (!game.u.twoweap)
        throw new Error('the command did not turn two-weapon combat on');
    const elapsed = game.moves > movesBefore;
    if (elapsed !== costsAMove) {
        throw new Error(
            `rnd(20)=${draw} against Dx:${dexterity} should `
            + `${costsAMove ? 'spend' : 'save'} the move`,
        );
    }
    // flags.weaponstatus is off by default, so set_twoweap() marks no status
    // line dirty and the recorded status line carries no weapon field.
    if (game.flags.weaponstatus)
        throw new Error('the case turned the weapon status field on');
}

async function verifySwitch(recipeSegment) {
    const { who } = caseFor(SWITCH_CASES, recipeSegment);

    // The first command has to succeed, or the second one would take
    // can_twoweapon() rather than the toggle-off arm above it.
    await runSegment({ ...recipeSegment, moves: `${WAIT}${TWOWEAPON}` });
    if (!game.u.twoweap)
        throw new Error(`${who} did not enter two-weapon combat`);

    // wield.c:850 sets u.twoweap back to FALSE, and :852 returns ECMD_OK, so
    // the second command always ends the turn where the first one left it.
    const movesBefore = game.moves;
    await runSegment({
        ...recipeSegment, moves: `${WAIT}${TWOWEAPON}${TWOWEAPON}`,
    });
    if (game.u.twoweap)
        throw new Error(`${who} did not leave two-weapon combat`);
    if (game.moves !== movesBefore)
        throw new Error('the toggle-off arm spent a move');
}

async function verifyRefusal(recipeSegment) {
    const { who, arm, reaches } = caseFor(REFUSAL_CASES, recipeSegment);

    // Stop one keystroke before the Enter, and check that the start really
    // does select the arm this case is here for.
    await runSegment({ ...recipeSegment, moves: `${WAIT}#twoweapon` });
    if (!reaches())
        throw new Error(`the ${who} start does not reach ${arm}`);
    const movesBefore = game.moves;

    // wield.c:863 returns ECMD_OK for every refusal, so the command is free
    // and two-weapon combat stays off.
    await runSegment({ ...recipeSegment, moves: `${WAIT}${TWOWEAPON}` });
    if (game.u.twoweap)
        throw new Error(`${arm} let two-weapon combat start`);
    if (game.moves !== movesBefore)
        throw new Error(`${arm} spent a move`);
}

async function verifyNaming(recipeSegment) {
    const { who, otyp } = caseFor(NAMING_CASES, recipeSegment);

    // Stop after the command, before the Take-off. The piece has to be worn
    // and two-weapon combat on, or the case would name nothing under the flag.
    await runSegment({ ...recipeSegment, moves: `${WAIT}${TWOWEAPON}` });
    if (!game.u.twoweap)
        throw new Error(`${who} did not enter two-weapon combat`);
    const worn = [...(function* pack(obj) {
        for (let o = obj; o; o = o.nobj) yield o;
    }(game.invent))].filter((obj) => obj.owornmask);
    if (!worn.some((obj) => obj.otyp === otyp))
        throw new Error(`${who} is not wearing otyp ${otyp}`);
    // More than one worn piece is what makes C prompt for a letter rather
    // than choosing the only candidate itself.
    if (worn.filter((obj) => obj.oclass === game.objects[otyp].oc_class)
        .length < 2)
        throw new Error(`${who} wears too few pieces to reach the prompt`);

    // Take it off. Its slot is clear afterwards, and every other worn mask
    // named along the way was formatted with u.twoweap still set.
    await runSegment(recipeSegment);
    if (!game.u.twoweap)
        throw new Error('the take-off left two-weapon combat');
    for (let obj = game.invent; obj; obj = obj.nobj) {
        if (obj.otyp === otyp && obj.owornmask)
            throw new Error(`otyp ${otyp} is still worn`);
    }
}

async function verifyInventory(recipeSegment) {
    // Two Samurai cases share a nethackrc and differ only in whether the
    // command runs, so this group is matched on the whole segment.
    const found = INVENTORY_CASES.find((entry) => {
        const built = inventorySegment(entry);
        return built.seed === recipeSegment.seed
            && built.moves === recipeSegment.moves
            && built.nethackrc === recipeSegment.nethackrc;
    });
    if (!found) throw new Error(`no inventory case for ${recipeSegment.seed}`);
    const { who, twoweapon, lefty } = found;

    // Stop with the menu still unopened, and check that the hero really is in
    // the state whose arm this case was chosen for.
    await runSegment({
        ...recipeSegment,
        moves: `${WAIT}${twoweapon ? TWOWEAPON : ''}`,
    });
    if (Boolean(game.u.twoweap) !== twoweapon) {
        throw new Error(
            `${who} reached the menu with two-weapon combat `
            + `${game.u.twoweap ? 'on' : 'off'}`,
        );
    }
    // objnam.c:1586 and :1616 read URIGHTY, so a case that lost its
    // handedness would compare the wrong pair of hands.
    const handedness = lefty ? LEFT_HANDED : RIGHT_HANDED;
    if (game.u.uhandedness !== handedness) {
        throw new Error(
            `the ${who} at seed ${recipeSegment.seed} is not `
            + `${lefty ? 'left' : 'right'}-handed`,
        );
    }
    if (!game.uwep || !game.uswapwep)
        throw new Error(`${who} does not hold two weapons`);
    // objnam.c:1571 splits on quan, and :1619 pluralizes on it. The Rogue is
    // here for the stacked secondary; the Samurai for the singular one.
    const stacked = game.uswapwep.quan > 1;
    if (stacked !== (who === 'rogue')) {
        throw new Error(
            `${who}'s secondary holds ${game.uswapwep.quan}, the wrong count `
            + 'for the arm this case selects',
        );
    }

    // Open and close the menu. ddoinv() costs no time, so the turn counter
    // has to sit where the command before it left it.
    const movesBefore = game.moves;
    await runSegment(recipeSegment);
    if (game.moves !== movesBefore)
        throw new Error('the inventory menu spent a move');
}

async function verifySkill(recipeSegment) {
    const { who, clipped } = caseFor(SKILL_CASES, recipeSegment);

    // Stop with the command issued and the window still unopened.
    await runSegment({ ...recipeSegment, moves: `${WAIT}${TWOWEAPON}` });
    if (!game.u.twoweap)
        throw new Error(`${who} did not enter two-weapon combat`);

    // insight.c:1390 skips the secondary comparison when both hands train the
    // same skill, which no starting loadout does.
    const wtype = weapon_type(game.uwep, game);
    const wtype2 = weapon_type(game.uswapwep, game);
    if (wtype === wtype2)
        throw new Error(`${who} trains one skill with both hands`);
    // :1362 and :1395, the two comparisons this group is recorded for.
    const twoskl = P_SKILL(P_TWO_WEAPON_COMBAT, game);
    if (twoskl >= P_SKILL(wtype, game) || twoskl >= P_SKILL(wtype2, game))
        throw new Error(`${who} does not reach insight.c:1362 and :1395`);
    // :1440. Every fresh hero has 0 practice and 0 weapon slots, so the
    // summary block stays silent and the recorded window shows two lines.
    if (game.u.weapon_slots !== 0)
        throw new Error(`${who} starts with ${game.u.weapon_slots} slots`);

    // wintty.c:2728-2733 cuts a stored line whose length plus its two padding
    // cells exceeds the terminal width.
    const lines = await enlightenment(
        BASICENLIGHTENMENT, ENL_GAMEINPROGRESS, game,
    );
    const longest = Math.max(...lines.map((line) => line.length));
    if ((longest + 2 > game.nhDisplay.cols) !== clipped) {
        throw new Error(
            `${who}'s longest attributes line is ${longest} characters, `
            + `which tty_end_menu() ${clipped ? 'does not cut' : 'cuts'}`,
        );
    }

    // doattributes() returns ECMD_OK, so the window costs no time.
    const movesBefore = game.moves;
    await runSegment({
        ...recipeSegment, moves: `${WAIT}${TWOWEAPON}${ATTRIBUTES}`,
    });
    if (game.moves !== movesBefore)
        throw new Error('the attributes window spent a move');
}

async function verifyWeaponStatus(recipeSegment) {
    // Stop one keystroke before the Enter. The option has to be on, or the
    // field would be missing from the screen rather than merely wrong.
    await runSegment({ ...recipeSegment, moves: `${WAIT}#twoweapon` });
    if (!game.flags.weaponstatus)
        throw new Error('the case did not turn the weapon status field on');
    // botl.c:516-519 names a katana by its skill class while two-weapon
    // combat is off, so the field holds a value the command has to replace.
    if (weapon_status(game) !== 'Sword')
        throw new Error(`the field starts at ${weapon_status(game)}`);

    // botl.c:492-499. Only a lance held on a steed reads "Dual+joust", and
    // the Samurai has neither.
    await runSegment({ ...recipeSegment, moves: `${WAIT}${TWOWEAPON}` });
    if (!game.u.twoweap)
        throw new Error('the command did not turn two-weapon combat on');
    if (weapon_status(game) !== 'Dual-weps')
        throw new Error(`the field reads ${weapon_status(game)}`);
}

// Routes a segment to the group it belongs to. The time-cost group is the one
// with its own seeds; the naming, inventory and skill groups are the ones
// whose moves carry a command key after the extended command; the rest share
// REFUSAL_SEED and are told apart by the nethackrc, which names a different
// role or sets a different option for every case.
export async function verifyTwoWeaponCommandSegment(recipeSegment) {
    if (TIME_COST_CASES.some((e) => e.seed === recipeSegment.seed))
        await verifyTimeCost(recipeSegment);
    else if (recipeSegment.moves.endsWith(INVENTORY))
        await verifyInventory(recipeSegment);
    else if (recipeSegment.moves.includes(ATTRIBUTES_KEY))
        await verifySkill(recipeSegment);
    else if (recipeSegment.moves.includes('T'))
        await verifyNaming(recipeSegment);
    else if (WEAPONSTATUS_CASES.some(
        (e) => nethackrc(e.who, { weaponstatus: true })
            === recipeSegment.nethackrc,
    ))
        await verifyWeaponStatus(recipeSegment);
    else if (SWITCH_CASES.some(
        (e) => nethackrc(e.who) === recipeSegment.nethackrc,
    ))
        await verifySwitch(recipeSegment);
    else
        await verifyRefusal(recipeSegment);
}

export async function runTwoWeaponCommandMatrix() {
    return runFreshMatrix({
        entries: [
            { label: 'twoweapon time cost',
              recipe: loadTwoWeaponCommandRecipe() },
            { label: 'twoweapon switch off',
              recipe: loadTwoWeaponSwitchRecipe() },
            { label: 'twoweapon refusals',
              recipe: loadTwoWeaponRefusalRecipe() },
            { label: 'twoweapon weapon status',
              recipe: loadTwoWeaponStatusRecipe() },
            { label: 'twoweapon worn naming',
              recipe: loadTwoWeaponNamingRecipe() },
            { label: 'twoweapon inventory naming',
              recipe: loadTwoWeaponInventoryRecipe() },
            { label: 'twoweapon skill report',
              recipe: loadTwoWeaponSkillRecipe() },
        ],
        summaryLabel: 'TWOWEAPON COMMAND',
        verifySegment: verifyTwoWeaponCommandSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runTwoWeaponCommandMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((exitCode) => {
        process.exitCode = exitCode;
    }).catch((error) => {
        process.stderr.write(`twoweapon command: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
