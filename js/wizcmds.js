// wizcmds.js -- the wizard-mode extended commands.
// C refs: src/wizcmds.c wiz_map(), wiz_genesis(), wiz_level_change(),
// wiz_level_tele(), wiz_wish(), wiz_identify(), wiz_polyself(),
// wiz_intrinsic(), wiz_kill(), and wiz_makemap(), among the rows cmd.c dispatches here.

import { engr_stats } from './engrave.js';
import { light_stats } from './light.js';
import { timer_stats } from './timeout.js';
import { region_stats } from './region.js';
import { size_wseg } from './worm.js';
import { FIRST_OBJECT, NUM_OBJECTS, MAXOCLASSES, OBJ_NAME } from './objects.js';
import { MAX_GLYPH } from './glyph_offsets.js';
import { NUMMONS } from './monsters.js';
import { MAXPCHARS, S_vbeam, S_rslant } from './symbols.js';
import { mstrength } from './mondata.js';
import { memoryLayout } from './wizcmds_data.js';
import {
    ACID_RES,
    ARTICLE_A, ARTICLE_THE, ARTICLE_YOUR,
    ARM,
    ADORNED,
    AGGRAVATE_MONSTER,
    ANTIMAGIC,
    BLINDED,
    BLND_RES,
    CLAIRVOYANT,
    COLD_RES,
    COLNO, ROWNO, COULD_SEE, IN_SIGHT, TEMP_LIT, BUFSZ, NEUTRAL,
    CORR, SDOOR, WM_MASK, IS_WALL, IS_ROOM, IS_DOOR,
    CONFUSION,
    CONFLICT,
    DEAF,
    DETECT_MONSTERS,
    DIED,
    DISINT_RES,
    DISPLACED,
    DRAIN_RES,
    ECMD_OK,
    ECMD_CANCEL,
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
    KILLED_BY,
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
    SICK_NONVOMITABLE,
    SICK_VOMITABLE,
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
    SUPPRESS_IT, SUPPRESS_HALLUCINATION, SUPPRESS_SADDLE,
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
    XKILL_NOMSG,
    has_mgivenname,
    u_at,
} from './const.js';
import { losexp, pluslvl } from './exper.js';
import { rumor_check } from './rumors.js';
import { body_part, float_vs_flight, polyself } from './polyself.js';
import { create_particular } from './read.js';
import { getlin, select_menu } from './windows.js';
import { game } from './gstate.js';
import { done } from './end.js';
import { mon_nam, x_monnam } from './do_name.js';
import { dmonsfree } from './makemon_create.js';
import { AD_PHYS, PM_GRID_BUG, PM_SAMURAI } from './monsters.js';
import { note_unported } from './unported.js';
import { d, rn1, rn2, rnd, rne, rnl, rnz } from './rng.js';
import { cmd_from_func, makemap_prepost, paranoid_query, yn_function } from './cmd.js';
import { display_inventory } from './invent.js';
import {
    notice_mon_off, notice_mon_on, pooleffects,
} from './hack.js';
import { monkilled, rescham, usmellmon, xkilled } from './mon.js';
import { dist2, mungspaces, upstart, truncateByteString } from './hacklib.js';
import { encumber_msg } from './pickup.js';
import { level_tele } from './teleport.js';
import { ttyPline } from './tty_message.js';
import { displayTtyTextWindow } from './tty_menu.js';
import { makewish } from './zap.js';
import { canspotmon, docrt, glyph_at, glyph_is_invisible, glyph_is_monster,
    glyph_is_cmap, glyph_is_cmap_zap, glyph_to_cmap, glyph_to_mon, glyph_is_object, glyph_to_obj, NO_GLYPH,
    map_engraving, map_invisible, map_trap, unmap_invisible } from './display.js';
import { do_mapping, findit } from './detect.js';
import { overview_stats, In_W_tower, on_level, print_dungeon } from './dungeon.js';
import { mklev } from './mklev.js';
import {
    incr_itimeout, make_blinded, make_deaf, make_glib, make_hallucinated,
    make_sick, make_slimed, make_stunned,
    make_stoned, make_vomiting,
} from './potion.js';
import { flip_level, flip_level_rnd } from './sp_lev.js';
import { vision_recalc } from './vision.js';
import { getpos } from './getpos.js';
import { m_at } from './monst.js';
import { nonliving, olfaction } from './mondata.js';

// C ref: wizcmds.c wiz_show_wmodes() (657-689). The canonical interface
// in options.js is tty, matching the recorder's active WINDOWPORT(tty).
// The existing text window owns create/putstr/display(TRUE)/destroy.
export async function wiz_show_wmodes(state = game, env = {}) {
    const lines = [{ text: '' }]; // Source tty-only blank top line.
    for (let y = 0; y < ROWNO; y++) {
        let row = '';
        for (let x = 0; x < COLNO; x++) {
            const location = state.level.at(x, y);
            if (u_at(x, y, state)) row += '@';
            else if (IS_WALL(location.typ) || location.typ === SDOOR)
                row += String(location.wall_info & WM_MASK);
            else if (location.typ === CORR) row += '#';
            else if (IS_ROOM(location.typ) || IS_DOOR(location.typ)) row += '.';
            else row += 'x';
        }
        lines.push({ text: row.slice(1) }); // Column zero is off screen; never trim rows.
    }
    await (env.window ?? displayTtyTextWindow)(state, lines);
    return ECMD_OK;
}

// C ref: wizcmds.c wiz_show_seenv() (576-617). Each map cell occupies two
// columns; C narrows a full-width crop by one cell to avoid an 80-byte row.
export async function wiz_show_seenv(state = game, env = {}) {
    let startx = Math.max(1, state.u.ux - Math.trunc(COLNO / 4));
    const stopx = Math.min(startx + Math.trunc(COLNO / 2), COLNO);
    if (stopx - startx === Math.trunc(COLNO / 2)) startx++;
    const lines = [];
    for (let y = 0; y < ROWNO; y++) {
        let row = '';
        for (let x = startx; x < stopx; x++) {
            if (u_at(x, y, state)) {
                row += '@@';
            } else {
                const v = state.level.at(x, y).seenv & 0xff;
                row += v === 0 ? '  ' : v.toString(16).padStart(2, '0');
            }
        }
        lines.push({ text: row.replace(/ +$/u, '') });
    }
    await (env.window ?? displayTtyTextWindow)(state, lines);
    return ECMD_OK;
}

// C ref: wizcmds.c wiz_show_vision() (621-653). The text-window wrapper
// owns create/putstr/display/destroy; read the current vision bits directly
// and await its blocking dismissal before returning the command result.
export async function wiz_show_vision(state = game, env = {}) {
    const lines = [
        { text: `Flags: 0x${COULD_SEE.toString(16)} could see, 0x${IN_SIGHT.toString(16)} in sight, 0x${TEMP_LIT.toString(16)} temp lit` },
        { text: '' },
    ];
    for (let y = 0; y < ROWNO; y++) {
        let row = '';
        for (let x = 1; x < COLNO; x++) {
            if (u_at(x, y, state)) {
                row += '@';
            } else {
                const v = state.viz_array[y][x];
                row += v === 0 ? ' ' : String.fromCharCode('0'.charCodeAt(0) + v);
            }
        }
        lines.push({ text: row.replace(/ +$/u, '') });
    }
    await (env.window ?? displayTtyTextWindow)(state, lines);
    return ECMD_OK;
}

// C ref: wizcmds.c wiz_makemap() (156-173). Keep the original tower flag
// across teardown, generation and arrival; goto_level's entry effects do not
// belong to replacement levels. The existing pre/post owner records its gaps.
export async function wiz_makemap(state = game) {
    if (state.wizard) {
        const was_in_W_tower = In_W_tower(state.u.ux, state.u.uy, state.u.uz, state);
        await makemap_prepost(true, was_in_W_tower, state);
        await mklev();
        await makemap_prepost(false, was_in_W_tower, state);
    } else {
        await ttyPline("Unavailable command 'wizmakemap'.", state);
    }
    return ECMD_OK;
}

// C ref: wizcmds.c wiz_map() (176-198), the #wizmap command and its C('f')
// binding. The temporary clearing of HConfusion and HHallucination keeps
// detect.c do_mapping() in its ordinary, unconfused branch. The source walks
// traps before engravings, then maps the level, and restores both properties
// after notice_mon_on().
export async function wiz_map(state = game) {
    if (state.wizard) {
        const confusion = state.u.uprops[CONFUSION];
        const hallucination = state.u.uprops[HALLUC];
        const save_Hconf = confusion.intrinsic;
        const save_Hhallu = hallucination.intrinsic;

        notice_mon_off(state);
        confusion.intrinsic = 0;
        hallucination.intrinsic = 0;
        for (const trap of state.level.traps) {
            trap.tseen = 1;
            map_trap(trap, true, state);
        }
        for (let engraving = state.head_engr;
            engraving;
            engraving = engraving.nxt_engr) {
            map_engraving(engraving, true, state);
        }
        await do_mapping(state);
        notice_mon_on(state);
        confusion.intrinsic = save_Hconf;
        hallucination.intrinsic = save_Hhallu;
    } else {
        await ttyPline("Unavailable command 'wizmap'.", state);
    }
    return ECMD_OK;
}

// C ref: wizcmds.c wiz_detect() (229-236), the #wizdetect extended command.
// Like doapply's uncursed Bell branch, this discards findit's integer result.
export async function wiz_detect(state = game, env = {}) {
    if (state.wizard) {
        await findit(state, env);
    } else {
        await ttyPline("Unavailable command 'wizdetect'.", state);
    }
    return ECMD_OK;
}

// C ref: wizcmds.c wiz_where() (218-225), the #wizwhere command. The
// informational print_dungeon() call deliberately passes bymenu=false; it
// owns the NHW_MENU text window and its acknowledgement before returning.
export async function wiz_where(state = game) {
    if (state.wizard) {
        await print_dungeon(state, { bymenu: false });
    } else {
        await ttyPline("Unavailable command 'wizwhere'.", state);
    }
    return ECMD_OK;
}

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

// C ref: wizcmds.c wiz_identify() (50-72), the #wizidentify command and its
// Ctrl-I binding. The temporary override makes inventory naming show the
// true object names while display_inventory() builds the wizard menu; it is
// cleared by the inventory selector before identify() mutates selected items,
// and by this command after every display-only or cancelled return.
export async function wiz_identify(state = game) {
    if (state.wizard) {
        state.iflags ??= {};
        state.iflags.override_ID = cmd_from_func('wiz_identify', state)
            || 0x09; // C('I') fallback when the command has no binding.
        try {
            await display_inventory(null, false, state);
        } finally {
            state.iflags.override_ID = 0;
        }
    } else {
        await ttyPline("Unavailable command 'wizidentify'.", state);
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

// C ref: wizcmds.c wiz_intrinsic() (949-1098). The property menu keeps
// property_by_index() order, and each selected value follows its source arm;
// potion.c make_stoned() owns the delayed-killer state for STONED.
export async function wiz_intrinsic(state = game, rawEnv = {}) {
    const random = rawEnv.random ?? { rn2 };
    const message = rawEnv.message ?? ttyPline;
    const encumberMessage = rawEnv.encumberMessage
        ?? ((subject) => encumber_msg(subject, { message }));
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
        let newTimeout = oldTimeout + amount;

        if ([SICK, SLIMED, STONED].includes(property)
            && oldTimeout > 0 && newTimeout > oldTimeout) {
            newTimeout = oldTimeout;
        }

        if (property === BLINDED) {
            // wizcmds.c:1020-1022 delegates this property to make_blinded()
            // rather than the generic timeout/message arm.  In particular,
            // extending an existing blindness timer is silent.
            await make_blinded(newTimeout, true, state);
        } else if (property === HALLUC) {
            await make_hallucinated(newTimeout, true, 0, state);
        } else if (property === DEAF) {
            // wizcmds.c:1030 uses make_deaf() so its transition feedback is
            // distinct from the generic timeout message used by simple
            // intrinsic fields.
            await make_deaf(newTimeout, true, state);
        } else if (property === GLIB) {
            make_glib(newTimeout, state);
            state.disp.botl = true;
            await ttyPline(
                `Timeout for ${name} ${oldTimeout ? 'increased by' : 'set to'} `
                + `${amount}.`,
                state,
            );
        } else if (property === SICK) {
            const sicknessType = random.rn2(2)
                ? SICK_NONVOMITABLE : SICK_VOMITABLE;
            await make_sick(
                newTimeout, '#wizintrinsic', true, sicknessType, state,
                { ...rawEnv, random, message, encumberMessage },
            );
        } else if (property === SLIMED) {
            const message = `You are${oldTimeout ? ' still' : ''} `
                + 'turning into slime.';
            await make_slimed(newTimeout, message, state, {
                ...rawEnv, random, message: rawEnv.message ?? ttyPline,
            });
        } else if (property === STONED) {
            const message = `You are${oldTimeout ? ' still' : ''} `
                + 'turning into stone.';
            await make_stoned(
                newTimeout, message, KILLED_BY, '#wizintrinsic', state,
            );
        } else if (property === STUNNED) {
            await make_stunned(
                newTimeout, true, state, { ...rawEnv, random, message },
            );
        } else if (property === VOMITING) {
            const message = `You are${oldTimeout ? ' still' : ''} vomiting.`;
            await make_vomiting(newTimeout, false, state);
            await ttyPline(message, state);
        } else if (property === WARN_OF_MON) {
            if (!(prop.intrinsic || prop.extrinsic)) {
                state.context ??= {};
                state.context.warntype ??= {};
                state.context.warntype.speciesidx = PM_GRID_BUG;
                state.context.warntype.species = state.mons[PM_GRID_BUG];
            }
            incr_itimeout(prop, amount);
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

        // wizcmds.c performs these after every selected property, and after
        // incr_itimeout() so the helpers observe the new intrinsic value.
        if (property === LEVITATION || property === FLYING) {
            float_vs_flight(state);
        } else if (property === PROT_FROM_SHAPE_CHANGERS) {
            await rescham(state);
        }
        if ((property === WWALKING || property === LEVITATION
            || property === FLYING) && state.u.uinwater) {
            await pooleffects(false, state);
        }
    }
    // wizcmds.c:1092 calls docrt(), whose docrt_flags owner shuts vision
    // down before painting memory, then restores it before see_monsters().
    // The JS redraw exposes that bracket to callers. It must run again here
    // after the menu's repair so visible hallucinated objects are remapped.
    await docrt({
        suspendVision: () => vision_recalc(2),
        restoreVision: () => vision_recalc(0),
    });
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

// C ref: wizcmds.c wiz_flip_level() (412-442). The live flip finishes
// before docrt; ECMD_OK means the query and transposition consume no turn.
export async function wiz_flip_level(state = game, env = {}) {
    if (state.wizard) {
        const query = env.query ?? (async (...args) => {
            const { yn_function } = await import('./cmd.js');
            return yn_function(...args, state);
        });
        const choices = '0123';
        const c = await query(
            'Flip 0=randomly, 1=vertically, 2=horizontally, 3=both:',
            choices, 0, true);
        if (c && choices.includes(String.fromCharCode(c))) {
            const mask = c - '0'.charCodeAt(0);
            if (!mask) await flip_level_rnd(3, true, state, env);
            else await flip_level(mask, true, state);
            if (env.redraw) await env.redraw(state);
            else await docrt();
        } else {
            await (env.message ?? ttyPline)('Never mind.', state);
        }
    }
    return ECMD_OK;
}

// C ref: wizcmds.c wiz_level_change(), the #levelchange command.
//
// The lowering arm calls losexp() once per level. Its level-one early return
// still lowers nothing, and the `newlevel < 1` clamp belongs to the loop just
// as it does in C.
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
        if (newlevel < 1) newlevel = 1;
        while (u.ulevel > newlevel)
            await losexp('#levelchange', state, { message: ttyPline });
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

// C ref: wizcmds.c wiz_smell() (885-939). The same coordinate survives each
// getpos call; selecting a square may repair its remembered invisible marker.
export async function wiz_smell(state = game, env = {}) {
    const message = env.message ?? ttyPline;
    const cc = { x: state.u.ux, y: state.u.uy };
    if (!olfaction(state.youmonst.data)) {
        await message('You are incapable of detecting odors in your present form.', state, env);
        return ECMD_OK;
    }
    await message('You can move the cursor to a monster that you want to smell.', state, env);
    while (true) {
        await message('Pick a monster to smell.', state, env);
        const ans = await getpos(cc, true, 'a monster', state);
        if (ans < 0 || cc.x < 0) return ECMD_CANCEL;
        let isYou = false;
        let species;
        if (u_at(cc.x, cc.y, state)) {
            if (state.u.usteed) species = state.u.usteed.data;
            else {
                species = state.youmonst.data;
                isYou = true;
            }
        } else {
            species = m_at(cc.x, cc.y, state)?.data ?? null;
        }
        const glyph = glyph_at(cc.x, cc.y, state);
        if (species) {
            if (isYou)
                await message(`You surreptitiously sniff under your ${body_part(ARM, state.youmonst)}.`, state, env);
            if (!await usmellmon(species, { ...env, state, message }))
                await message(`${isYou ? 'You seem' : 'That monster seems'} to not give off any smell.`, state, env);
            if (!glyph_is_monster(glyph)) map_invisible(cc.x, cc.y, state);
        } else {
            await message("You don't smell any monster there.", state, env);
            if (glyph_is_invisible(glyph)) unmap_invisible(cc.x, cc.y, state);
        }
    }
}

// C ref: wizcmds.c wiz_kill() (243–352). The command targets repeatedly,
// credits either the hero or monsters, and purges dead nodes without a turn.
export async function wiz_kill(state = game, env = {}) {
    const message = env.message ?? ttyPline;
    // Canonical death owners pass this family into object creation and timers.
    // In particular, rnz must retain its own recorder-visible wrapper entry.
    const killEnv = { ...env, state, message,
        random: { d, rn1, rn2, rnd, rne, rnl, rnz, ...(env.random ?? {}) },
        unsupported: env.unsupported
            ?? (reason => note_unported(reason === "the death of the hero's steed"
                ? 'steed.c dismount_steed' : `mon.c ${reason}`)),
    };
    const save_verbose = state.flags.verbose;
    const save_autodescribe = state.iflags.autodescribe;
    const uarehere = { ...state.u.uz };
    const cc = { x: state.u.ux, y: state.u.uy };
    let prompt = 'Pick first monster to slay';
    for (;;) {
        await message(`${prompt}:`, state, env);
        prompt = 'Next monster';
        state.flags.verbose = false;
        state.iflags.autodescribe = true;
        const ans = await getpos(cc, true, 'a monster', state);
        state.flags.verbose = save_verbose;
        state.iflags.autodescribe = save_autodescribe;
        if (ans < 0 || cc.x < 1) break;

        let mtmp = null;
        if (u_at(cc.x, cc.y, state)) {
            if (state.u.usteed) {
                const qbuf = `Kill ${mon_nam(state.u.usteed, state, env).slice(0, 110)}?`;
                // hack.h ynq() defaults to 'q' and adds the answer to cmdq.
                const c = await yn_function(qbuf, 'ynq', 'q', true, state);
                if (c === 'q'.charCodeAt(0)) break;
                if (c === 'y'.charCodeAt(0)) mtmp = state.u.usteed;
            }
            if (!mtmp) {
                const qbuf = state.urole.mnum === PM_SAMURAI
                    ? 'Perform seppuku?' : 'Commit suicide?';
                if (await paranoid_query(true, qbuf, state)) {
                    // you.h uhis() uses the original flags.female gender.
                    state.killer ??= { name: '', format: KILLED_BY };
                    state.killer.name = `${state.flags.female ? 'her' : 'his'} own player`;
                    state.killer.format = KILLED_BY;
                    await done(DIED, state);
                    // end.c done() reaches the NORETURN really_done() path
                    // after an accepted death. The JavaScript finalizer
                    // returns only so the recorder can capture its final
                    // screen, so do not resume dmonsfree() or command-result
                    // handling after it.
                    if (state.program_state?.gameover) return;
                }
                break;
            }
        } else if (state.u.uswallow) {
            // you.h next2u() is distu(x,y) <= 2, including diagonals.
            mtmp = dist2(cc.x, cc.y, state.u.ux, state.u.uy) <= 2
                ? state.u.ustuck : null;
        } else {
            mtmp = m_at(cc.x, cc.y, state);
        }
        unmap_invisible(cc.x, cc.y, state);

        if (mtmp) {
            const tame = Boolean(mtmp.mtame);
            const seen = canspotmon(mtmp, state)
                || (state.u.uswallow && mtmp === state.u.ustuck);
            const flgs = SUPPRESS_IT | SUPPRESS_HALLUCINATION
                | ((tame && has_mgivenname(mtmp)) ? SUPPRESS_SADDLE : 0);
            const articl = tame ? ARTICLE_YOUR : seen ? ARTICLE_THE : ARTICLE_A;
            const adjs = tame ? (seen ? 'poor' : 'poor, unseen')
                : (seen ? null : 'unseen');
            const Mn = x_monnam(mtmp, articl, adjs, flgs, false, state, env);
            if (!state.iflags.menu_requested) {
                await message(`You ${nonliving(mtmp.data) ? 'destroy' : 'kill'} ${Mn}!`, state, env);
                await xkilled(mtmp, XKILL_NOMSG, state, killEnv);
                if (state.program_state?.gameover) return;
            } else {
                state.context.mon_moving = true;
                await message(`${upstart(Mn)} is ${nonliving(mtmp.data) ? 'destroyed' : 'killed'}.`, state, env);
                await monkilled(mtmp, null, AD_PHYS, state, killEnv);
                if (state.program_state?.gameover) return;
                state.context.mon_moving = false;
            }
            if (state.u.utotype || !on_level(state.u.uz, uarehere)) break;
        } else {
            await message('There is no monster there.', state, env);
            break;
        }
    }
    dmonsfree(state);
    return ECMD_OK;
}

// C ref: wizcmds.c wiz_rumor_check() (1102-1106). cmd.c gates wizard mode.
export async function wiz_rumor_check(state = game, env = {}) {
    await rumor_check(state, env);
    return ECMD_OK;
}

// C refs: wizcmds.c statistics family (1117-1399, 1616-1697).
// The row array replaces the source NHW_TEXT winid; mutable totals hold C's
// count/size output parameters. Counts describe C allocations, not JS memory.
export function memory_stats_line(label, count, size) {
    return label.padEnd(27) + '  ' + String(count).padStart(4)
        + '  ' + String(size).padStart(6);
}
function stringAllocation(text) {
    return new TextEncoder().encode(text).length + 1;
}
export function size_obj(obj, state = game) {
    let size = memoryLayout.obj;
    if (obj.oextra) {
        const extra = obj.oextra;
        size += memoryLayout.oextra;
        if (extra.oname != null) size += stringAllocation(extra.oname);
        if (extra.omonst) size += size_monst(extra.omonst, false, state);
        if (extra.omailcmd != null) size += stringAllocation(extra.omailcmd);
    }
    return size;
}
export function count_obj(chain, totals, top, recurse, state = game) {
    let count = 0, size = 0;
    for (let obj = chain; obj; obj = obj.nobj) {
        if (top) { count++; size += size_obj(obj, state); }
        if (recurse && obj.cobj) count_obj(obj.cobj, totals, true, true, state);
    }
    totals.count += count; totals.size += size;
}
function statsRow(rows, label, subtotal, totals, force = false) {
    if (subtotal.count || subtotal.size || force) {
        totals.count += subtotal.count; totals.size += subtotal.size;
        rows.push({ text: memory_stats_line(label, subtotal.count, subtotal.size) });
    }
}
export function obj_chain(rows, label, chain, force, totals, state = game) {
    const subtotal = { count: 0, size: 0 };
    count_obj(chain, subtotal, true, false, state);
    statsRow(rows, label, subtotal, totals, force);
}
export function mon_invent_chain(rows, label, chain, totals, state = game) {
    const subtotal = { count: 0, size: 0 };
    for (let mon = chain; mon; mon = mon.nmon)
        count_obj(mon.minvent, subtotal, true, false, state);
    statsRow(rows, label, subtotal, totals);
}
export function contained_stats(rows, label, totals, state = game) {
    const subtotal = { count: 0, size: 0 };
    for (const chain of [state.invent, state.level?.objlist,
        state.level?.buriedobjlist, state.gm?.migrating_objs])
        count_obj(chain, subtotal, false, true, state);
    for (const chain of [state.level?.monlist, state.gm?.migrating_mons])
        for (let mon = chain; mon; mon = mon.nmon)
            count_obj(mon.minvent, subtotal, false, true, state);
    statsRow(rows, label, subtotal, totals);
}
export function size_monst(monster, incl_wsegs, state = game) {
    let size = memoryLayout.monst;
    if (monster.wormno && incl_wsegs) size += size_wseg(monster, state);
    if (monster.mextra) {
        const extra = monster.mextra;
        size += memoryLayout.mextra;
        if (extra.mgivenname != null) size += stringAllocation(extra.mgivenname);
        for (const field of ['egd', 'epri', 'eshk', 'emin', 'edog', 'ebones'])
            if (extra[field]) size += memoryLayout[field];
    }
    return size;
}
export function mon_chain(rows, label, chain, force, totals, state = game) {
    const subtotal = { count: 0, size: 0 };
    const incl_wsegs = label.toLowerCase() === 'fmon';
    for (let mon = chain; mon; mon = mon.nmon) {
        subtotal.count++; subtotal.size += size_monst(mon, incl_wsegs, state);
    }
    statsRow(rows, label, subtotal, totals, force);
}
export function misc_stats(rows, totals, state = game) {
    const traps = state.level?.traps ?? [];
    statsRow(rows, `traps, size ${memoryLayout.trap}`,
        { count: traps.length, size: traps.length * memoryLayout.trap }, totals, true);
    const engr = engr_stats('engravings, size %ld+text', state);
    statsRow(rows, engr.header, engr, totals, true);
    const lights = light_stats('light sources, size %ld', state);
    statsRow(rows, lights.header, lights, totals);
    const timers = timer_stats('timers, size %ld', state);
    statsRow(rows, timers.header, timers, totals);
    let count = 0, size = 0;
    for (let record = state.level?.damagelist; record; record = record.next) {
        count++; size += memoryLayout.damage;
    }
    statsRow(rows, `shop damage, size ${memoryLayout.damage}`, { count, size }, totals);
    const regions = region_stats('regions, size %ld+%ld*rect+N', state);
    statsRow(rows, regions.header, regions, totals);
    count = size = 0;
    for (let killer = state.killer?.next; killer; killer = killer.next) {
        count++; size += memoryLayout.kinfo;
    }
    statsRow(rows, `delayed killer${count === 1 ? '' : 's'}, size ${memoryLayout.kinfo}`, { count, size }, totals);
    count = size = 0;
    const bones = state.level?.bonesinfo;
    if (Array.isArray(bones)) {
        count = bones.length; size = count * memoryLayout.cemetery;
    } else for (let record = bones; record; record = record.next) {
        count++; size += memoryLayout.cemetery;
    }
    statsRow(rows, `bones history, size ${memoryLayout.cemetery}`, { count, size }, totals);
    count = size = 0;
    for (const obj of state.objects ?? []) if (obj?.oc_uname != null) {
        count++; size += stringAllocation(obj.oc_uname);
    }
    statsRow(rows, 'object type names, text', { count, size }, totals);
}
export async function wiz_show_stats(state = game, env = {}) {
    const rows = [{ text: 'Current memory statistics:' },
        { text: '                             count  bytes' },
        { text: `  Objects, base size ${memoryLayout.obj}` }];
    const objects = { count: 0, size: 0 };
    obj_chain(rows, 'invent', state.invent, true, objects, state);
    obj_chain(rows, 'fobj', state.level?.objlist, true, objects, state);
    obj_chain(rows, 'buried', state.level?.buriedobjlist, false, objects, state);
    obj_chain(rows, 'migrating obj', state.gm?.migrating_objs, false, objects, state);
    obj_chain(rows, 'billobjs', state.gb?.billobjs, false, objects, state);
    mon_invent_chain(rows, 'minvent', state.level?.monlist, objects, state);
    mon_invent_chain(rows, 'migrating minvent', state.gm?.migrating_mons, objects, state);
    contained_stats(rows, 'contained', objects, state);
    const separator = '---------------------------  ----- -------';
    rows.push({ text: separator }, { text: memory_stats_line('  Obj total', objects.count, objects.size) },
        { text: '' }, { text: `  Monsters, base size ${memoryLayout.monst}` });
    const monsters = { count: 0, size: 0 };
    mon_chain(rows, 'fmon', state.level?.monlist, true, monsters, state);
    mon_chain(rows, 'migrating', state.gm?.migrating_mons, false, monsters, state);
    if (state.gm?.mydogs) mon_chain(rows, 'mydogs', state.gm.mydogs, false, monsters, state);
    rows.push({ text: separator }, { text: memory_stats_line('  Mon total', monsters.count, monsters.size) },
        { text: '' }, { text: '  Overview' });
    const overview = { count: 0, size: 0 };
    overview_stats(rows, memory_stats_line, overview, state);
    rows.push({ text: separator }, { text: memory_stats_line('  Over total', overview.count, overview.size) },
        { text: '' }, { text: '  Miscellaneous' });
    const misc = { count: 0, size: 0 };
    misc_stats(rows, misc, state);
    rows.push({ text: separator }, { text: memory_stats_line('  Misc total', misc.count, misc.size) },
        { text: '' }, { text: separator },
        { text: memory_stats_line('  Grand total', objects.count + monsters.count + overview.count + misc.count,
            objects.size + monsters.size + overview.size + misc.size) });
    // show_borlandc_stats is excluded by the Linux recorder's build guard.
    await (env.window ?? displayTtyTextWindow)(state, rows);
    return ECMD_OK;
}

// C ref: wizcmds.c wiz_display_macros() (1705-1774). Fixed macro ranges
// are checked in source order; report each issue after a single header.
export async function wiz_display_macros(state = game, env = {}) {
    const rows = [];
    let trouble = 0;
    function issue(text) {
        if (!trouble++) rows.push({ text: 'Display macro issues:' });
        rows.push({ text });
    }
    for (let glyph = 0; glyph < MAX_GLYPH; glyph++) {
        if (glyph_is_cmap(glyph)) {
            const value = glyph_to_cmap(glyph);
            if (value === NO_GLYPH)
                issue(`glyph_is_cmap() / glyph_to_cmap(glyph=${glyph}) sync failure, returned NO_GLYPH (${value})`);
            if (glyph_is_cmap_zap(glyph) && !(value >= S_vbeam && value <= S_rslant))
                issue(`glyph_is_cmap_zap(glyph=${glyph}) returned non-zap cmap ${value}`);
            if (!(value >= 0 && value < MAXPCHARS + 1))
                issue(`glyph_to_cmap(glyph=${glyph}) returns ${value} exceeds defsyms[${MAXPCHARS + 1}] bounds (MAX_GLYPH = ${MAX_GLYPH})`);
        }
        if (glyph_is_monster(glyph)) {
            const value = glyph_to_mon(glyph);
            if (value < 0 || value >= NUMMONS)
                issue(`glyph_to_mon(glyph=${glyph}) returns ${value} exceeds mons[${NUMMONS}] bounds`);
        }
        if (glyph_is_object(glyph)) {
            const value = glyph_to_obj(glyph);
            if (value < 0 || value > NUM_OBJECTS)
                issue(`glyph_to_obj(glyph=${glyph}) returns ${value} exceeds objects[${NUM_OBJECTS}] bounds`);
        }
    }
    if (!trouble) rows.push({ text: 'No display macro issues detected.' });
    await (env.window ?? displayTtyTextWindow)(state, rows);
    return ECMD_OK;
}

// C ref: wizcmds.c wiz_mon_diff() (1790-1828). Compare the live
// catalog's stored difficulty with the source formula, in table order.
export async function wiz_mon_diff(state = game, env = {}) {
    const rows = [];
    let trouble = 0;
    for (let count = 0; state.mons[count].mlet; count++) {
        const species = state.mons[count];
        const calculated = mstrength(species), hardcoded = species.difficulty;
        const difference = hardcoded - calculated;
        if (difference) {
            if (!trouble++) rows.push({ text: 'Review of monster difficulty ratings [index:level]:' });
            const level = species.mlevel > 50 ? 50 : species.mlevel;
            const text = species.pmnames[NEUTRAL].padEnd(18) + ' ['
                + String(count).padStart(3) + ':' + String(level).padStart(2)
                + ']: calculated: ' + String(calculated).padStart(2)
                + ', hardcoded: ' + String(hardcoded).padStart(2)
                + ' (' + (difference >= 0 ? '+' : '') + difference + ')';
            rows.push({ text: truncateByteString(text, BUFSZ - 1) });
        }
    }
    if (!trouble) rows.push({ text: 'No monster difficulty discrepancies were detected.' });
    await (env.window ?? displayTtyTextWindow)(state, rows);
    return ECMD_OK;
}

// C ref: wizcmds.c wiz_objprobs() (1858-1862), float operands passed to
// printf's %6.2f. Each source arithmetic operation rounds to float32 first;
// printf then rounds the exact promoted value to nearest, ties to even.
export function wiz_objprobs_percentage(probability, sum) {
    const percentage = Math.fround(Math.fround(Math.fround(probability) * 100)
        / Math.fround(sum));
    if (Number.isNaN(percentage)) return '  -nan'; // Recorder's runtime 0.f/0.f sign.
    if (!Number.isFinite(percentage)) return (percentage < 0 ? '-inf' : 'inf').padStart(6);
    const scaled = Math.abs(percentage) * 100;
    let hundredths = Math.floor(scaled);
    const fraction = scaled - hundredths;
    if (fraction > 0.5 || (fraction === 0.5 && hundredths % 2)) hundredths++;
    const sign = percentage < 0 || Object.is(percentage, -0) ? '-' : '';
    return (sign + Math.trunc(hundredths / 100) + '.'
        + String(hundredths % 100).padStart(2, '0')).padStart(6);
}

// C ref: wizcmds.c wiz_objprobs() (1832-1868). Use initialized per-game
// probabilities/names; unnamed catalog entries still contribute to sums.
export async function wiz_objprobs(state = game, env = {}) {
    const sums = Array(MAXOCLASSES).fill(0);
    let oclass = state.objects[FIRST_OBJECT].oc_class;
    for (let type = FIRST_OBJECT; type < NUM_OBJECTS; type++)
        sums[state.objects[type].oc_class] += state.objects[type].oc_prob;
    const rows = [];
    for (let type = FIRST_OBJECT; type < NUM_OBJECTS; type++) {
        const object = state.objects[type], name = OBJ_NAME(object, state);
        if (name == null) continue;
        if (object.oc_class !== oclass) rows.push({ text: '' });
        oclass = object.oc_class;
        const row = String(object.oc_prob).padStart(4) + ' / '
            + String(sums[oclass]).padStart(4) + ' ('
            + wiz_objprobs_percentage(object.oc_prob, sums[oclass]) + '%): ' + name;
        rows.push({ text: truncateByteString(row, BUFSZ - 1) });
    }
    await (env.window ?? displayTtyTextWindow)(state, rows);
    return ECMD_OK;
}
