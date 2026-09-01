// wizcmds.js -- the wizard-mode extended commands.
// C refs: src/wizcmds.c wiz_genesis(), wiz_level_change(), wiz_level_tele(),
// wiz_wish() and wiz_polyself(), so far the five rows of that file cmd.c
// dispatches here.

import {
    ACID_RES,
    ADORNED,
    AGGRAVATE_MONSTER,
    ANTIMAGIC,
    BLINDED,
    BLND_RES,
    CLAIRVOYANT,
    COLD_RES,
    CONFUSION,
    CONFLICT,
    DEAF,
    DETECT_MONSTERS,
    DISINT_RES,
    DISPLACED,
    DRAIN_RES,
    ECMD_OK,
    ENERGY_REGENERATION,
    FAST,
    FIRE_RES,
    FIXED_ABIL,
    FLYING,
    FREE_ACTION,
    FUMBLING,
    GLIB,
    HALLUC,
    HALLUC_RES,
    HALF_PHDAM,
    HALF_SPDAM,
    HUNGER,
    INFRAVISION,
    INVIS,
    INVULNERABLE,
    JUMPING,
    LEVITATION,
    LIFESAVED,
    MAGICAL_BREATHING,
    MAXULEV,
    PASSES_WALLS,
    PICK_ANY,
    POLY_CONTROLLED,
    POLYMORPH,
    POLYMORPH_CONTROL,
    POISON_RES,
    PROTECTION,
    PROT_FROM_SHAPE_CHANGERS,
    REGENERATION,
    REFLECTING,
    SEARCHING,
    SEE_INVIS,
    SICK,
    SICK_RES,
    SHOCK_RES,
    SLEEP_RES,
    SLEEPY,
    SLIMED,
    SLOW_DIGESTION,
    STONED,
    STONE_RES,
    STEALTH,
    STRANGLED,
    STUNNED,
    SWIMMING,
    TELEPAT,
    TELEPORT,
    TELEPORT_CONTROL,
    TIMEOUT,
    UNCHANGING,
    VOMITING,
    WARN_OF_MON,
    WARN_UNDEAD,
    WARNING,
    WOUNDED_LEGS,
    WWALKING,
} from './const.js';
import { pluslvl, UnsupportedExperienceChangeError } from './exper.js';
import { polyself } from './polyself.js';
import { create_particular } from './read.js';
import { getlin, select_menu } from './windows.js';
import { game } from './gstate.js';
import { mungspaces } from './hacklib.js';
import { encumber_msg } from './pickup.js';
import { level_tele } from './teleport.js';
import { ttyPline } from './tty_message.js';
import { makewish } from './zap.js';
import { docrt } from './display.js';
import { incr_itimeout, make_glib, make_hallucinated } from './potion.js';

// C ref: wizcmds.c wiz_wish() (31-44), the #wizwish command.
//
// The saved flags.verbose is what keeps "You may wish for an object." off the
// screen: zap.c:6326 prints it for every other caller of makewish(), and this
// one alone suppresses it. Restoring the flag rather than skipping the line
// matters because potion.c:2809, sit.c:110, sit.c:251 and zap.c:2583 reach
// makewish() with the flag as the player set it.
export async function wiz_wish(state = game) {
    if (state.wizard) {
        const save_verbose = state.flags.verbose;

        state.flags.verbose = false;
        await makewish(state);
        state.flags.verbose = save_verbose;
        await encumber_msg(state);
    } else {
        // Dead behind cmd.c can_do_extcmd(), which prints this same message
        // for a WIZMODECMD row and refuses before either dispatch route
        // reaches this function: rhack() calls it at cmd.c:3689 and
        // doextcmd() at cmd.c:505. The arm is written out because
        // wizcmds.c:42 has it, not because a game can run it. C spells the
        // name as ecname_from_fn(wiz_wish), which walks extcmdlist[] for the
        // row whose ef_funct is wiz_wish -- the "wizwish" row at cmd.c:2000.
        await ttyPline("Unavailable command 'wizwish'.", state);
    }
    return ECMD_OK;
}

// C ref: wizcmds.c wiz_level_tele() (397-406), the #wizlevelport command.
//
// Its else arm is dead for the same reason wiz_wish()'s is, and is written out
// for the same reason: cmd.c can_do_extcmd() refuses the WIZMODECMD row with
// this exact line before either dispatch route arrives, and doextcmd() never
// even sees the row because extcmds_match() drops it first. C spells the name
// as ecname_from_fn(wiz_level_tele), which finds the "wizlevelport" row.
export async function wiz_level_tele(state = game) {
    if (state.wizard) {
        await level_tele(state);
    } else {
        await ttyPline("Unavailable command 'wizlevelport'.", state);
    }
    return ECMD_OK;
}

// C ref: wizcmds.c wiz_genesis() (202-214), the #wizgenesis command.
//
// Its else arm is dead for the same reason wiz_wish()'s is, and is written out
// for the same reason: cmd.c can_do_extcmd() refuses the WIZMODECMD row with
// this exact line before either dispatch route arrives, and doextcmd() never
// sees the row at all because extcmds_match() drops it first. C spells the
// name as ecname_from_fn(wiz_genesis), which finds the "wizgenesis" row.
//
// The saved iflags.debug_mongen is what lets the command work in a game that
// turned random monster generation off: makemon.c:1168 returns without
// creating anything while the flag is up, and this is the one caller that
// takes it down. js/options.js seeds the field from optlist.h's initval, so
// the restore puts a boolean back rather than an undefined.
export async function wiz_genesis(state = game) {
    if (state.wizard) {
        const mongen_saved = state.iflags.debug_mongen;

        state.iflags.debug_mongen = false;
        await create_particular(state);
        state.iflags.debug_mongen = mongen_saved;
    } else {
        await ttyPline("Unavailable command 'wizgenesis'.", state);
    }
    return ECMD_OK;
}

// timeout.c propertynames[] (30-114), kept in source order because the TTY
// menu assigns selectors by position and wizcmds.c uses the same index to
// recover the property after selection.
const WIZ_INTRINSIC_PROPERTIES = Object.freeze([
    [INVULNERABLE, 'invulnerable'],
    [STONED, 'petrifying'],
    [SLIMED, 'becoming slime'],
    [STRANGLED, 'strangling'],
    [SICK, 'fatally sick'],
    [STUNNED, 'stunned'],
    [CONFUSION, 'confused'],
    [HALLUC, 'hallucinating'],
    [BLINDED, 'blinded'],
    [DEAF, 'deafness'],
    [VOMITING, 'vomiting'],
    [GLIB, 'slippery fingers'],
    [WOUNDED_LEGS, 'wounded legs'],
    [SLEEPY, 'sleepy'],
    [TELEPORT, 'teleporting'],
    [POLYMORPH, 'polymorphing'],
    [LEVITATION, 'levitating'],
    [FAST, 'very fast'],
    [CLAIRVOYANT, 'clairvoyant'],
    [DETECT_MONSTERS, 'monster detection'],
    [SEE_INVIS, 'see invisible'],
    [INVIS, 'invisible'],
    [ACID_RES, 'acid resistance'],
    [STONE_RES, 'stoning resistance'],
    [DISPLACED, 'displaced'],
    [PASSES_WALLS, 'pass thru walls'],
    [MAGICAL_BREATHING, 'magical breathing'],
    [WWALKING, 'water walking'],
    [FIRE_RES, 'fire resistance'],
    [COLD_RES, 'cold resistance'],
    [SLEEP_RES, 'sleep resistance'],
    [DISINT_RES, 'disintegration resistance'],
    [SHOCK_RES, 'shock resistance'],
    [POISON_RES, 'poison resistance'],
    [DRAIN_RES, 'drain resistance'],
    [SICK_RES, 'sickness resistance'],
    [ANTIMAGIC, 'magic resistance'],
    [HALLUC_RES, 'hallucination resistance'],
    [BLND_RES, 'light-induced blindness resistance'],
    [FUMBLING, 'fumbling'],
    [HUNGER, 'voracious hunger'],
    [TELEPAT, 'telepathic'],
    [WARNING, 'warning'],
    [WARN_OF_MON, 'warn: monster type or class'],
    [WARN_UNDEAD, 'warn: undead'],
    [SEARCHING, 'searching'],
    [INFRAVISION, 'infravision'],
    [ADORNED, 'adorned (+/- Cha)'],
    [STEALTH, 'stealthy'],
    [AGGRAVATE_MONSTER, 'monster aggravation'],
    [CONFLICT, 'conflict'],
    [JUMPING, 'jumping'],
    [TELEPORT_CONTROL, 'teleport control'],
    [FLYING, 'flying'],
    [SWIMMING, 'swimming'],
    [SLOW_DIGESTION, 'slow digestion'],
    [HALF_SPDAM, 'half spell damage'],
    [HALF_PHDAM, 'half physical damage'],
    [REGENERATION, 'HP regeneration'],
    [ENERGY_REGENERATION, 'energy regeneration'],
    [PROTECTION, 'extra protection'],
    [PROT_FROM_SHAPE_CHANGERS, 'protection from shape changers'],
    [POLYMORPH_CONTROL, 'polymorph control'],
    [UNCHANGING, 'unchanging'],
    [REFLECTING, 'reflecting'],
    [FREE_ACTION, 'free action'],
    [FIXED_ABIL, 'fixed abilities'],
    [LIFESAVED, 'life will be saved'],
]);

function wizardIntrinsicMenuSpec(state) {
    const items = [];
    if (state.iflags?.cmdassist) {
        items.push({
            text: '[Precede any selection with a count to increment by other '
                + 'than 30.]',
        });
    }
    for (const [index, [property, name]]
        of WIZ_INTRINSIC_PROPERTIES.entries()) {
        if (property === HALLUC_RES) continue;
        if (property === FIRE_RES) items.push({ text: '--' });
        const prop = state.u.uprops[property] ??= {
            intrinsic: 0,
            extrinsic: 0,
        };
        const timeout = prop.intrinsic & TIMEOUT;
        items.push({
            // wizcmds.c stores i + 1 so that a zero menu value remains
            // reserved for a non-selection.
            value: index + 1,
            label: timeout ? `${name.padEnd(27)} [${timeout}]` : name,
        });
    }
    return {
        title: 'Which intrinsics?',
        items,
        how: PICK_ANY,
        cancelValue: null,
    };
}

// C ref: wizcmds.c wiz_intrinsic() (949-1098), covering the menu, ordinary
// timeout increments, and the hallucination transition used by the current
// wizard session boundary.
export async function wiz_intrinsic(state = game) {
    if (!state.wizard) {
        await ttyPline("Unavailable command 'wizintrinsic'.", state);
        return ECMD_OK;
    }

    const selected = await select_menu(state, wizardIntrinsicMenuSpec(state));
    for (const entry of selected ?? []) {
        const propertyEntry = WIZ_INTRINSIC_PROPERTIES[entry.value - 1];
        if (!propertyEntry) continue;
        const [property, name] = propertyEntry;
        const prop = state.u.uprops[property] ??= {
            intrinsic: 0,
            extrinsic: 0,
        };
        const oldTimeout = prop.intrinsic & TIMEOUT;
        const amount = entry.count === -1 ? 30 : entry.count;
        if (amount <= 0) continue;
        const newTimeout = oldTimeout + amount;

        if (property === HALLUC) {
            await make_hallucinated(newTimeout, true, 0, state);
        } else if (property === GLIB) {
            make_glib(newTimeout, state);
            state.disp.botl = true;
            await ttyPline(
                `Timeout for ${name} ${oldTimeout ? 'increased by' : 'set to'} `
                + `${amount}.`,
                state,
            );
        } else {
            // wizcmds.c's default arm: simple properties are timed directly
            // and announce through the status-line refresh.
            incr_itimeout(prop, amount);
            state.disp.botl = true;
            await ttyPline(
                `Timeout for ${name} ${oldTimeout ? 'increased by' : 'set to'} `
                + `${amount}.`,
                state,
            );
        }
    }
    await docrt();
    return ECMD_OK;
}

// The range a C `long` holds, which strtol() saturates to. `scanLevelArgument()`
// explains why `%d` needs it.
const LONG_MAX = (1n << 63n) - 1n;
const LONG_MIN = -(1n << 63n);

// C ref: the `sscanf(buf, "%d%c", &newlevel, &dummy)` in wiz_level_change().
// `%d` skips leading whitespace, then takes an optional sign and at least one
// decimal digit; `%c` takes exactly one further byte without skipping
// whitespace. The count decides the command: only a buffer that is entirely
// one integer converts exactly one field, so "12x" converts two and "abc"
// converts none, and both answer "Never mind.".
export function scanLevelArgument(buf) {
    const match = /^[ \t\n\v\f\r]*([+-]?[0-9]+)/.exec(buf);
    if (!match) return { count: 0, value: 0 };
    // `%d` converts in two stages, and both are observable here because
    // `newlevel` is an `int`. The digits first become a `long`, saturating at
    // LONG_MAX or LONG_MIN when they overrun it, and the store into `int` then
    // keeps the low 32 bits. So "2147483648" arrives as -2147483648 and
    // "4294967296" as 0. Past the `long` the two directions differ rather than
    // sharing a threshold: digits above LONG_MAX saturate to it and its low 32
    // bits are all ones, giving -1, while digits below LONG_MIN saturate to it
    // and its low 32 bits are zero, giving 0.
    let wide = BigInt(match[1]);
    if (wide > LONG_MAX) wide = LONG_MAX;
    else if (wide < LONG_MIN) wide = LONG_MIN;
    return {
        count: buf.length > match[0].length ? 2 : 1,
        value: Number(BigInt.asIntN(32, wide)),
    };
}

// C ref: wizcmds.c wiz_level_change(), the #levelchange command.
//
// The lowering arm calls losexp() once per level, which this port does not
// have; its `u.ulevel == 1` early return comes along because it lowers
// nothing, and C's `if (newlevel < 1) newlevel = 1` clamp belongs to the loop
// that refusal replaces.
export async function wiz_level_change(state = game) {
    const buf = mungspaces(await getlin(
        'To what experience level do you want to be set?',
        state,
    ));
    let newlevel = 0;
    let ret;
    // C tests for an Escape or an empty buffer before calling sscanf(), which
    // would answer 0 and EOF for those two anyway. The test is kept because it
    // is what fixes ret at 0, but neither operand changes the outcome.
    if (buf[0] === '\x1B' || buf === '') {
        ret = 0;
    } else {
        const scanned = scanLevelArgument(buf);
        ret = scanned.count;
        newlevel = scanned.value;
    }

    if (ret !== 1) {
        await ttyPline('Never mind.', state);
        return ECMD_OK;
    }
    const u = state.u;
    if (newlevel === u.ulevel) {
        await ttyPline('You are already that experienced.', state);
    } else if (newlevel < u.ulevel) {
        if (u.ulevel === 1) {
            await ttyPline(
                'You are already as inexperienced as you can get.',
                state,
            );
            return ECMD_OK;
        }
        throw new UnsupportedExperienceChangeError('losexp("#levelchange")');
    } else {
        if (u.ulevel >= MAXULEV) {
            await ttyPline(
                'You are already as experienced as you can get.',
                state,
            );
            return ECMD_OK;
        }
        if (newlevel > MAXULEV) newlevel = MAXULEV;
        while (u.ulevel < newlevel)
            await pluslvl(false, state, { message: ttyPline });
    }
    /* blessed full healing or restore ability won't fix any lost levels */
    u.ulevelmax = u.ulevel;
    return ECMD_OK;
}

// C ref: wizcmds.c wiz_polyself() (566-572), the #polyself command.
// Unconditionally calls polyself(POLY_CONTROLLED) and returns ECMD_OK.
export async function wiz_polyself(state = game) {
    await polyself(POLY_CONTROLLED, state);
    return ECMD_OK;
}
