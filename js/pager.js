// pager.c -- What-is and farlook descriptions.
// C refs: pager.c lookat(), self_lookat(), look_at_monster(),
// object_from_map(), look_at_object(), checkfile(), do_screen_description(),
// do_look(), and dowhatis(). The canonical glyph lookup keeps the source
// description, sensing side channel, and optional permonst together for every
// hero, swallowed, monster, object, trap, warning, invisible, and cmap arm.

import {
    BLINDED,
    BOLT_LIM,
    COLNO,
    MAXTCHARS,
    AM_MASK,
    AM_SANCTUM,
    Amask2align,
    def_warnsyms,
    D_BROKEN,
    D_CLOSED,
    D_LOCKED,
    D_TRAPPED,
    DB_ICE,
    DB_UNDER,
    DOOR,
    DRAWBRIDGE_UP,
    ECMD_OK,
    GRAVE,
    GPCOORDS_MAP,
    GPCOORDS_NONE,
    HALLUC,
    HALLUC_RES,
    I_SPECIAL,
    INFRAVISION,
    INVIS,
    SEE_INVIS,
    TELEPAT,
    DETECT_MONSTERS,
    MONSEEN_NORMAL,
    MONSEEN_SEEINVIS,
    MONSEEN_INFRAVIS,
    MONSEEN_TELEPAT,
    MONSEEN_XRAYVIS,
    MONSEEN_DETECT,
    MONSEEN_WARNMON,
    M_AP_F_DKNOWN,
    M_AP_FURNITURE,
    M_AP_MONSTER,
    M_AP_OBJECT,
    M_AP_TYPMASK,
    ICE,
    Is_airlevel,
    Is_astralevel,
    Is_waterlevel,
    LAVAPOOL,
    LAVAWALL,
    MELT_ICE_AWAY,
    MOAT,
    POOL,
    WATER,
    NEUTRAL,
    OBJ_FLOOR,
    OBJ_BURIED,
    OBJ_FREE,
    PICK_ONE,
    ROWNO,
    SYM_BOULDER,
    TER_OBJ,
    TER_MON,
    IS_TREE,
    IS_WALL,
    SCORR,
    SDOOR,
    STONE,
    STRAT_WAITMASK,
    SYM_INVISIBLE,
    SYM_NOTHING,
    SYM_UNEXPLORED,
    WARNCOUNT,
    Upolyd,
    Ugender,
    has_mcorpsenm,
    MCORPSENM,
    u_at,
    isok,
} from './const.js';
import {
    Mgender,
    hliquid,
    mon_nam,
    pmname,
    rndmonnam,
    y_monnam,
} from './do_name.js';
import { on_level, surface_typ } from './dungeon.js';
import { is_drawbridge_wall } from './dbridge.js';
import { altarmask_at } from './pray.js';
import { align_str, trap_predicament } from './insight.js';
import { trapped_chest_at, trapped_door_at } from './detect.js';
import {
    GLYPH_NOTHING_OFF,
    GLYPH_WARNING_OFF,
    GLYPH_BODY_OFF,
    GLYPH_BODY_PILETOP_OFF,
    GLYPH_MON_FEM_OFF,
    GLYPH_MON_MALE_OFF,
    GLYPH_STATUE_FEM_OFF,
    GLYPH_STATUE_FEM_PILETOP_OFF,
    GLYPH_STATUE_MALE_OFF,
    GLYPH_STATUE_MALE_PILETOP_OFF,
    GLYPH_UNEXPLORED_OFF,
} from './glyph_offsets.js';
import {
    SCORER_DEC_MAP,
    cmap_to_glyph,
    glyph_at,
    glyph_is_cmap,
    glyph_is_warning,
    glyph_is_invisible,
    glyph_is_swallow,
    glyph_is_body,
    glyph_is_monster,
    glyph_is_object,
    glyph_is_statue,
    glyph_is_trap,
    glyph_to_cmap,
    glyph_to_obj,
    glyph_to_trap,
    engraving_to_glyph,
    map_glyphinfo,
    monster_glyph_info,
    trap_to_glyph,
} from './display.js';
import { DATA_BASE_ENTRIES } from './data_base_data.js';
import { engr_at } from './engrave.js';
import { fruit_from_name, makeplural, makesingular } from './fruit.js';
import { LOOK_TRADITIONAL, getpos } from './getpos.js';
import { game } from './gstate.js';
import { visible_region_at } from './region.js';
import { dist2, mungspaces } from './hacklib.js';
import { HELP_TEXT_FILES } from './help_data.js';
import { currency, display_inventory } from './invent.js';
import { tty_yn_function } from './getline.js';
import { m_at } from './monst.js';
import {
    M2_DEMON, M2_ELF, M2_HUMAN, M2_ORC,
    NUMMONS, PM_ELF, PM_GNOME, PM_HUMAN, PM_SAMURAI, PM_WIZARD,
    S_EEL, S_HUMAN, S_MIMIC, S_invisible,
} from './monsters.js';
import { ok_to_quest } from './quest.js';
import {
    an,
    ansimpleoname,
    distant_name,
    doname_with_price,
    doname_vague_quan,
    simpleonames,
    singular,
    xnameFresh,
} from './objnam.js';
import {
    CHEST,
    COIN_CLASS,
    CORPSE,
    LARGE_BOX,
    LEASH,
    OBJ_NAME,
    SLIME_MOLD,
    STATUE,
    STRANGE_OBJECT,
} from './objects.js';
import {
    CMAP_EXPLANATIONS,
    MONSTER_CLASS_EXPLANATIONS,
    OBJCLASS_EXPLANATIONS,
} from './symbol_data.js';
import {
    MAXMCLASSES,
    MAXOCLASSES,
    MAXPCHARS,
    SYM_OFF_X,
    S_cloud,
    S_engrcorr,
    S_engroom,
    S_grave,
    S_ice,
    S_altar,
    S_arrow_trap,
    S_lava,
    S_lavawall,
    S_hcdbridge,
    S_ndoor,
    S_pool,
    S_poisoncloud,
    S_stone,
    S_vodbridge,
    S_water,
    S_sw_tl,
    S_sw_br,
    cmap_symbol_byte,
    misc_symbol,
    monster_class_symbol,
    object_class_symbol,
} from './symbols.js';
import { dealloc_obj, is_treefruit, mkobj, mksobj, sobj_at } from './obj.js';
import { objectGenerationEnv } from './object_generation.js';
import { obj_stop_timers } from './timeout.js';
import { observe_object } from './o_init.js';
import { costly_spot } from './shk.js';
import {
    ROCK_CLASS,
    VENOM_CLASS,
} from './objects.js';
import { NO_COLOR } from './terminal.js';
import { rn2, rn2_on_display_rng } from './rng.js';
import {
    describeMonster,
    furnitureDescription,
    heroIsBlind,
    monsterSurfaceDescription,
} from './startup_a11y.js';
import {
    hides_under,
    is_clinger,
    is_flyer,
    is_hider,
    sticks,
} from './mondata.js';
import { digests } from './dothrow.js';
import {
    displayTtyMenuTextWindow,
    displayTtyTextWindow,
    menuTitleStyle,
    ttyMenuLayout,
} from './tty_menu.js';
import { ttyPline, ttyPutmixed } from './tty_message.js';
import { doextversion } from './version.js';
import { is_lava, is_pool, t_at, trapname, Levitation } from './trap.js';
import { cansee, couldsee, howmonseen } from './vision.js';
import { spot_time_left } from './timeout.js';
import { getlin, select_menu } from './windows.js';
import { key2extcmddesc, key2txt, yn_function } from './cmd.js';

export const WHAT_IS_A_LOCATION = 'a monster, object or location';

export class UnsupportedWhatisError extends Error {
    constructor(reason) {
        super(`unsupported whatis: ${reason}`);
        this.name = 'UnsupportedWhatisError';
        this.reason = reason;
    }
}

export class UnsupportedHelpError extends Error {
    constructor(reason) {
        super(`unsupported help: ${reason}`);
        this.name = 'UnsupportedHelpError';
        this.reason = reason;
    }
}

function propertyActive(state, index) {
    const property = state.u?.uprops?.[index];
    return Boolean(property?.intrinsic || property?.extrinsic)
        && !property?.blocked;
}

function heroHallucinating(state) {
    return propertyActive(state, HALLUC)
        && !propertyActive(state, HALLUC_RES);
}

function heroBlind(state) {
    return propertyActive(state, BLINDED)
        || Boolean(state.u?.uroleplay?.blind);
}

// pager.c keeps two explanations for the remembered invisible-monster glyph.
// Active clairvoyance and blindness use the short form, matching the generic
// symbol pass in do_screen_description(); lookat() itself always returns the
// longer source string.
function invisibleGlyphDescription(state) {
    const detect = state.u?.uprops?.[DETECT_MONSTERS] ?? {};
    const special = (Number(detect.intrinsic) & I_SPECIAL)
        || (Number(detect.extrinsic) & I_SPECIAL);
    return (special || heroBlind(state))
        ? 'unseen creature' : 'remembered, unseen, creature';
}

// C ref: display.h mon_to_glyph() (554-556).  The saved-swallow comparison
// uses this macro's display RNG, including its Hallucination draw; a resolved
// monster presentation is not interchangeable because it would skip that
// source draw.
function mon_to_glyph(monster, state) {
    const mnum = heroHallucinating(state)
        ? rn2_on_display_rng(NUMMONS)
        : monster?.data?.pmidx;
    if (!Number.isInteger(mnum)) return null;
    return mnum + (monster?.female ? GLYPH_MON_FEM_OFF : GLYPH_MON_MALE_OFF);
}

function assertOrdinaryWhatisState(state) {
    // pager.c do_look() admits blind heroes; blindness is handled by its
    // lookat()/description branches after the cursor has been selected.
    if (state.flags?.lootabc)
        throw new UnsupportedWhatisError('the lootabc menu');
    if (state.u?.uswallow)
        throw new UnsupportedWhatisError('a swallowed hero');
    if (heroHallucinating(state))
        throw new UnsupportedWhatisError('a hallucinating hero');
}

export function whatisMenuItems(state = game) {
    assertOrdinaryWhatisState(state);
    return [
        { value: '/', selector: '/', label: 'something on the map' },
        { value: 'i', selector: 'i', label: "something you're carrying" },
        { value: '?', selector: '?', label: 'something else (by symbol or name)' },
        { value: 'm', selector: 'm', label: 'nearby monsters' },
        { value: 'M', selector: 'M', label: 'all monsters shown on map' },
        { value: 'o', selector: 'o', label: 'nearby objects' },
        { value: 'O', selector: 'O', label: 'all objects shown on map' },
        { value: 't', selector: 't', label: 'nearby traps' },
        { value: 'T', selector: 'T', label: 'all seen or remembered traps' },
        { value: 'e', selector: 'e', label: 'nearby engravings' },
        { value: 'E', selector: 'E', label: 'all seen or remembered engravings' },
    ];
}

function menuLines(state) {
    const items = whatisMenuItems(state);
    return [...items.slice(0, 3), { text: '' }, ...items.slice(3)];
}

// C ref: pager.c mhidden_description() (186-281).  This helper belongs to
// pager.c even though monster status-line code also consumes it.  `isYou`
// preserves the source's special treatment of &gy.youmonst: its coordinates,
// hidden flag, appearance type, and current glyph all come from u rather than
// from the synthetic monster record used by some callers.
export function mhidden_description(
    monster,
    state,
    {
        includePrefix = true,
        includeArticle = true,
        showAlternateMonster = false,
        forceRegion = false,
        isYou = monster === state?.youmonst,
    } = {},
) {
    const u = state?.u ?? {};
    const x = isYou ? u.ux : monster.mx;
    const y = isYou ? u.uy : monster.my;
    const appearance = (isYou
        ? (u.ap_type ?? monster.m_ap_type ?? 0)
        : (monster.m_ap_type ?? 0)) & M_AP_TYPMASK;
    const hidden = isYou ? Boolean(u.uundetected) : Boolean(monster.mundetected);
    const sourceMonster = isYou
        ? {
            ...monster,
            mx: x,
            my: y,
            mundetected: hidden,
            m_ap_type: appearance,
        }
        : monster;
    // pager.c selects levl[x][y].glyph for a remembered monster and glyph_at
    // only when hero memory is disabled (or for the hero itself).  The glyph
    // is the source of truth for an object-shaped disguise; a sidecar or the
    // current floor pile can describe a different object than the remembered
    // map square.
    const currentGlyph = !isYou && state.level?.flags?.hero_memory
        ? state.level?.at(x, y)?.remembered_glyph?.glyph
            ?? GLYPH_UNEXPLORED_OFF
        : glyph_at(x, y, state);
    const objectWhat = () => {
        if (!glyph_is_object(currentGlyph)) return null;
        const resolved = object_from_map(currentGlyph, x, y, state);
        if (!resolved?.object) return null;
        try {
            const raw = resolved.object.otyp === STRANGE_OBJECT
                ? state.objects?.[STRANGE_OBJECT]?.oc_name
                    ?? 'strange object'
                : simpleonames(resolved.object, state);
            return includeArticle
                && (resolved.object.quan ?? 1) === 1
                ? an(raw) : raw;
        } finally {
            if (resolved.fakeobj) {
                resolved.object.where = OBJ_FREE;
                dealloc_obj(resolved.object, { state });
            }
        }
    };
    let suffix = '';
    if (appearance === M_AP_FURNITURE) {
        const what = furnitureDescription(monster.mappearance) ?? 'something';
        // C's an() returns the complete article-plus-name phrase.  Keep the
        // source's single append; concatenating `what` again doubles the
        // furniture noun ("a fountainfountain").
        suffix = `${includePrefix ? ', mimicking ' : ''}`
            + (includeArticle ? an(what) : what);
    } else if (appearance === M_AP_OBJECT) {
        let what = objectWhat();
        if (!what) what = 'something';
        suffix = `${includePrefix ? ', mimicking ' : ''}${what}`;
    } else if (appearance === M_AP_MONSTER) {
        const alternate = state.mons?.[monster.mappearance];
        if (showAlternateMonster && alternate) {
            const what = pmname(
                alternate,
                Mgender(monster, state),
            );
            // pager.c gates an() on MHID_PREFIX, independently of
            // MHID_ARTICLE.  This oddity is observable for callers asking
            // for a bare alternate-monster name, so preserve it exactly.
            suffix = `${includePrefix ? ', masquerading as ' : ''}`
                + (includePrefix ? an(what) : what);
        }
    } else if (hidden) {
        suffix = ', hiding';
        if (hides_under(sourceMonster.data)) {
            const what = objectWhat();
            suffix += what ? ` under ${what}` : ' under something';
        } else if (is_hider(sourceMonster.data)) {
            const ceiling = (is_clinger(sourceMonster.data)
                    && sourceMonster.data?.mlet !== S_MIMIC)
                || is_flyer(sourceMonster.data);
            suffix += ceiling
                ? ' on the ceiling'
                : ` on the ${monsterSurfaceDescription(sourceMonster, state)}`;
        } else if (sourceMonster.data?.mlet === S_EEL
            && is_pool(x, y, state)) {
            suffix += ' in murky water';
        }
    }

    const region = visible_region_at(x, y, state);
    const range = Math.max(Math.trunc(state.u?.xray_range ?? 0), 1);
    const regionNear = dist2(x, y, u.ux, u.uy) <= range * (range + 1);
    if (region && (forceRegion || regionNear)) {
        suffix += `, in a cloud of ${
            region.glyph_cmap === S_poisoncloud ? 'poison gas' : 'vapor'
        }`;
    }
    return suffix;
}

// C ref: pager.c look_at_monster() warning wording (510-538). The sensing
// mask is owned by vision.c, but the player-facing warning name belongs to
// this pager source owner.
function warningDescription(monster, state) {
    const warning = state.context?.warntype ?? {};
    const flags = warning.obj | warning.polyd;
    const monsterFlags = monster?.data?.mflags2 ?? 0;
    if (flags & M2_HUMAN & monsterFlags) return 'human';
    if (flags & M2_ELF & monsterFlags) return 'elf';
    if (flags & M2_ORC & monsterFlags) return 'orc';
    if (flags & M2_DEMON & monsterFlags) return 'demon';
    return monster?.data
        ? pmname(monster.data, Mgender(monster, state)) : 'monster';
}

function warningMonsterName(monster, state = game) {
    return makeplural(warningDescription(monster, state));
}

// C ref: pager.c self_lookat() (108-133). Keep all state-sensitive suffixes
// in this source owner; the same text is used by lookat() and look_all().
export function self_lookat(state = game) {
    const u = state.u ?? {};
    const species = state.mons?.[u.umonnum] ?? state.youmonst?.data;
    if (!species?.pmnames)
        throw new UnsupportedWhatisError('a hero form without monster names');
    const telepathyProperty = state.u?.uprops?.[TELEPAT] ?? {};
    const unblindTelepathy = Boolean(telepathyProperty.extrinsic)
        && !telepathyProperty.blocked;
    const invisible = propertyActive(state, INVIS)
        && (unblindTelepathy
            || propertyActive(state, DETECT_MONSTERS)
            || !heroBlind(state));
    const race = !Upolyd(u) ? (state.urace?.adj ?? '') + ' ' : '';
    let description = (invisible ? 'invisible ' : '') + race
        + pmname(species, Ugender(state)) + ' called ' + state.plname;
    if (u.usteed)
        description += ', mounted on ' + y_monnam(u.usteed, state);
    const heroMonster = state.youmonst ?? {
        mx: u.ux, my: u.uy, data: species, m_ap_type: 0,
        mundetected: u.uundetected,
    };
    const heroAppearance = Upolyd(u)
        ? (u.ap_type ?? heroMonster.m_ap_type ?? 0) : 0;
    if (u.uundetected
        || (heroAppearance & M_AP_TYPMASK)
        || visible_region_at(u.ux, u.uy, state)) {
        description += mhidden_description(heroMonster, state, {
            isYou: true,
            forceRegion: true,
        });
    }
    const ball = state.uball || u.uball;
    if (ball)
        description += ', chained to ' + ansimpleoname(ball, state);
    else if (state.uball || u.uball)
        description += ', chained to nothing?';
    if (u.utrap)
        description += ', ' + trap_predicament(state, false, false);
    return description;
}

// C ref: pager.c look_at_monster() (422-552). The optional output receives
// the C monbuf/howmonseen side channel; lookat() returns the permonst pointer
// separately, as its caller does.
function look_at_monster(monster, x, y, state, output = null) {
    const hallucinating = heroHallucinating(state);
    const name = describeMonster(monster, {
        state,
        hallucinating,
        pagerBase: true,
    });
    const tail = monster.mx !== x || monster.my !== y;
    const prefix = tail
        ? ((monster.isshk && !hallucinating) ? 'tail of ' : 'tail of a ')
        : '';
    const disposition = !hallucinating && monster.mtame
        ? 'tame ' : !hallucinating && monster.mpeaceful ? 'peaceful ' : '';
    let detail = prefix + disposition + name;
    if (state.u?.ustuck === monster) {
        if (state.u.uswallow || state.iflags?.save_uswallow) {
            detail += digests(monster.data)
                ? ', swallowing you' : ', engulfing you';
        } else {
            const heroSpecies = state.youmonst?.data
                ?? state.mons?.[state.u.umonnum];
            detail += Upolyd(state.u) && sticks(heroSpecies)
                ? ', being held' : ', holding you';
        }
    }
    if (monster.mfrozen)
        detail += ", can't move (paralyzed or sleeping or busy)";
    else if (monster.msleeping)
        detail += ', asleep';
    else if (monster.mstrategy & STRAT_WAITMASK)
        detail += ', meditating';
    if (monster.mleashed) detail += ', leashed to you';
    if (monster.mtrapped && cansee(monster.mx, monster.my, state)) {
        const trap = t_at(monster.mx, monster.my, state);
        const description = TRAP_DESCRIPTIONS[trap?.ttyp];
        if (description
            && ['bear trap', 'pit', 'spiked pit', 'web'].includes(
                description,
            )) {
            detail += `, trapped in ${an(description)}`;
            trap.tseen = true;
        }
    }
    if (monster.mundetected
        || (monster.m_ap_type & M_AP_TYPMASK)
        || visible_region_at(x, y, state)) {
        detail += mhidden_description(monster, state, { forceRegion: true });
    }
    if (output) {
        output.monbuf = '';
        const seen = howmonseen(monster, state);
        if (seen !== 0 && seen !== MONSEEN_NORMAL) {
            const labels = [];
            if (seen & MONSEEN_NORMAL) labels.push('normal vision');
            if (seen & MONSEEN_SEEINVIS) labels.push('see invisible');
            if (seen & MONSEEN_INFRAVIS) labels.push('infravision');
            if (seen & MONSEEN_TELEPAT) labels.push('telepathy');
            if (seen & MONSEEN_XRAYVIS) labels.push('astral vision');
            if (seen & MONSEEN_DETECT) labels.push('monster detection');
            if (seen & MONSEEN_WARNMON) {
                labels.push(heroHallucinating(state)
                    ? 'paranoid delusion'
                    : 'warned of ' + warningMonsterName(monster, state));
            }
            output.monbuf = labels.join(', ');
        }
    }
    return detail;
}

// C ref: pager.c object_from_map() (284-380). The C function writes its object
// through an out parameter and returns whether that object is synthetic; the
// JavaScript result keeps those two values together for namefloorobj() and the
// existing look_at_object() caller.
export function object_from_map(glyph, x, y, state) {
    let fakeobj = false;
    let mimicObj = false;
    const glyphotyp = glyph_is_object(glyph)
        ? glyph_to_obj(glyph)
        : glyph_is_cmap(glyph)
            ? (sobj_at(CHEST, x, y, state) ? CHEST : LARGE_BOX)
            : STRANGE_OBJECT;

    let object = sobj_at(glyphotyp, x, y, state);
    if (!object) {
        for (let buried = state.level?.buriedobjlist
                ?? state.buriedobjlist ?? null;
            buried;
            buried = buried.nobj) {
            if (buried.ox === x && buried.oy === y
                && buried.otyp === glyphotyp) {
                object = buried;
                break;
            }
        }
    }

    let monster = m_at(x, y, state);
    if (monster
        && ((monster.m_ap_type ?? 0) & M_AP_TYPMASK) === M_AP_OBJECT
        && monster.mappearance === glyphotyp) {
        object = null;
        mimicObj = true;
    }
    // C clears the temporary monster pointer unless it is the object-shaped
    // mimic that supplied this glyph.  Its mcorpsenm must never influence an
    // unrelated fake corpse/statue reconstructed from the map.
    if (!mimicObj) monster = null;

    if (!object || object.otyp !== glyphotyp) {
        const type = state.objects?.[glyphotyp];
        const env = objectGenerationEnv({ state });
        // OBJ_NAME() distinguishes a regular map object from a shuffled-out
        // extra type; the latter is represented by a random object of its
        // class, exactly as mkobj.c does for look-at descriptions.
        if (type && OBJ_NAME(type, state))
            object = mksobj(glyphotyp, false, false, env);
        else if (type)
            object = mkobj(type.oc_class, false, env);
        else
            object = mksobj(STRANGE_OBJECT, false, false, env);
        if (object?.timed) obj_stop_timers(object, state, env);
        fakeobj = true;
        if (object?.oclass === COIN_CLASS)
            object.quan = 2;
        else if (object?.otyp === SLIME_MOLD)
            object.spe = state.context?.current_fruit ?? 0;

        const corpsenm = monster && has_mcorpsenm(monster)
            ? MCORPSENM(monster) : null;
        if (corpsenm != null && corpsenm >= 0) {
            if (object.otyp === SLIME_MOLD) object.spe = corpsenm;
            else object.corpsenm = corpsenm;
        } else if (object.otyp === CORPSE && glyph_is_body(glyph)) {
            object.corpsenm = glyph >= GLYPH_BODY_PILETOP_OFF
                ? glyph - GLYPH_BODY_PILETOP_OFF
                : glyph - GLYPH_BODY_OFF;
        } else if (object.otyp === STATUE && glyph_is_statue(glyph)) {
            if (glyph >= GLYPH_STATUE_FEM_PILETOP_OFF)
                object.corpsenm = glyph - GLYPH_STATUE_FEM_PILETOP_OFF;
            else if (glyph >= GLYPH_STATUE_MALE_PILETOP_OFF)
                object.corpsenm = glyph - GLYPH_STATUE_MALE_PILETOP_OFF;
            else if (glyph >= GLYPH_STATUE_FEM_OFF)
                object.corpsenm = glyph - GLYPH_STATUE_FEM_OFF;
            else
                object.corpsenm = glyph - GLYPH_STATUE_MALE_OFF;
        }
        if (object.otyp === LEASH) object.leashmon = 0;
        object.where = OBJ_FLOOR;
        object.ox = x;
        object.oy = y;
        object.no_charge = object.otyp === STRANGE_OBJECT
            && costly_spot(x, y, state);
    }

    const hero = state.u;
    const dx = x - (hero?.ux ?? 0);
    const dy = y - (hero?.uy ?? 0);
    if (object && dx * dx + dy * dy <= 2
        && !heroIsBlind(state)
        && !heroHallucinating(state)
        && (fakeobj || object.where === OBJ_FLOOR)
        && !state.iflags?.terrainmode)
        observe_object(object, state);

    if (fakeobj && monster && mimicObj
        && (object.dknown || (monster.m_ap_type & M_AP_F_DKNOWN))) {
        monster.m_ap_type |= M_AP_F_DKNOWN;
        observe_object(object, state);
    }
    return { object, fakeobj };
}

function donameWithPrice(object, state) {
    return doname_with_price(object, state, { currencyName: currency });
}

// C ref: pager.c look_at_object() (382-419), through ordinary floor and
// buried objects. The terrain suffix is part of this source function, after
// the name callback and before the synthetic object is released.
function look_at_object(glyph, x, y, state) {
    let { object, fakeobj } = object_from_map(glyph, x, y, state);
    if (!object) return 'something';
    const location = state.level?.at(x, y);
    // C selects by dknown alone (pager.c:390-392); doname_with_price() owns
    // the no-live-price fallback when the known object is outside a shop.
    const objectName = object.dknown
        ? donameWithPrice : doname_vague_quan;
    let result;
    try {
        result = object.otyp === STRANGE_OBJECT
            ? state.objects?.[STRANGE_OBJECT]?.oc_name ?? 'strange object'
            : distant_name(object, objectName, state);
    } finally {
        if (fakeobj) {
            object.where = OBJ_FREE;
            dealloc_obj(object, { state });
            object = null;
        }
    }
    if (object && object.where === OBJ_BURIED) {
        result += ' (buried)';
    } else if (IS_TREE(location?.typ, state)) {
        result += ' ' + (object && is_treefruit(object)
            ? 'dangling in a tree' : 'stuck in a tree');
    } else if ((location?.typ === STONE || location?.typ === SCORR)
        && !IS_TREE(location?.typ, state)) {
        result += ' embedded in stone';
    } else if (IS_WALL(location?.typ)
        || location?.typ === SDOOR) {
        result += ' embedded in a wall';
    } else if (location?.typ === DOOR
        && Boolean((location.doormask ?? location.flags ?? 0)
            & (D_CLOSED | D_LOCKED))) {
        result += ' embedded in a door';
    } else if (is_pool(x, y, state)) {
        result += ' in water';
    } else if (is_lava(x, y, state)) {
        result += ' in molten lava';
    }
    return result;
}

// C ref: pager.c do_screen_description()'s monster/object symbol passes. A
// statue uses the monster symbol for its species, so both classes are kept in
// the generic list before look_at_object() supplies the instance description.
function describe_object_glyph(cc, glyph, state) {
    const glyphinfo = map_glyphinfo(glyph, state);
    const symbolByte = glyphinfo.ttychar;
    const prefix = `${visibleGlyphCharacter(glyphinfo)}        `;
    let found = 0;
    let firstmatch = 'unknown';
    let out = prefix;
    let needToLook = false;
    let skippedVenom = false;

    if (!state.iflags?.terrainmode
        || (state.iflags.terrainmode & TER_MON) !== 0) {
        for (let index = 1; index < MAXMCLASSES; ++index) {
            // S_invisible has no useful generic explanation here and is
            // deliberately excluded by pager.c.
            if (index === S_invisible) continue;
            const explanation = MONSTER_CLASS_EXPLANATIONS[index];
            if (!explanation
                || monster_class_symbol(index, state).ttychar !== symbolByte)
                continue;
            needToLook = true;
            const described = an(explanation);
            if (!found) {
                out += described;
                firstmatch = explanation;
                found = 1;
            } else {
                const appended = appendDescription(out, described);
                if (appended !== out) {
                    out = appended;
                    ++found;
                }
            }
        }
    }

    if (!state.iflags?.terrainmode
        || (state.iflags.terrainmode & TER_OBJ) !== 0) {
        const boulderSymbol = state.gs?.showsyms?.[
            SYM_OFF_X + SYM_BOULDER
        ] || object_class_symbol(ROCK_CLASS, state).ttychar;
        for (let index = 1; index < MAXOCLASSES; ++index) {
            const matches = index === ROCK_CLASS
                ? (glyph_is_statue(glyph) || symbolByte === boulderSymbol)
                : object_class_symbol(index, state).ttychar === symbolByte;
            if (!matches) continue;
            let explanation = OBJCLASS_EXPLANATIONS[index];
            if (!explanation) continue;
            if (index === ROCK_CLASS
                && explanation === 'boulder or statue') {
                if (symbolByte === boulderSymbol) explanation = 'boulder';
                else if (glyph_is_statue(glyph)) explanation = 'statue';
                else continue;
            }
            needToLook = true;
            if (index === VENOM_CLASS) {
                skippedVenom = true;
                continue;
            }
            const described = an(explanation);
            if (!found) {
                out += described;
                firstmatch = explanation;
                found = 1;
            } else {
                const appended = appendDescription(out, described);
                if (appended !== out) {
                    out = appended;
                    ++found;
                }
            }
        }
    }

    if (skippedVenom && found < 2) {
        const explanation = OBJCLASS_EXPLANATIONS[VENOM_CLASS];
        const described = an(explanation);
        if (!found) {
            out += described;
            firstmatch = explanation;
            found = 1;
        } else {
            const appended = appendDescription(out, described);
            if (appended !== out) {
                out = appended;
                ++found;
            }
        }
    }

    if (found > 4) out = `${prefix}can be many things`;
    if (found > 1 || needToLook) {
        const detail = lookat(cc.x, cc.y, state).buf;
        firstmatch = detail;
        out += ' (' + detail + ')';
        found = 1;
    }
    return { found, out, firstmatch };
}

// C ref: pager.c look_region_nearby(). The x=0 column is not playable, while
// y=0 is, so the two lower bounds deliberately differ.
export function look_region_nearby(nearby, state = game) {
    return {
        loY: nearby ? Math.max(state.u.uy - BOLT_LIM, 0) : 0,
        loX: nearby ? Math.max(state.u.ux - BOLT_LIM, 1) : 1,
        hiY: nearby ? Math.min(state.u.uy + BOLT_LIM, ROWNO - 1) : ROWNO - 1,
        hiX: nearby ? Math.min(state.u.ux + BOLT_LIM, COLNO - 1) : COLNO - 1,
    };
}

function mapCoordinate(x, y) {
    const coordinate = `<${x},${y}>${y < 10 ? ' ' : ''}`;
    return coordinate.padStart(8);
}

function trapOrEngravingMapCoordinate(x, y) {
    // Unlike look_all(), pager.c look_traps() and look_engrs() do not append
    // the single-digit-y alignment space before applying the width-eight pad.
    return `<${x},${y}>`.padStart(8);
}

// C ref: pager.c look_all(), for live monster and floor-object glyphs under
// the default map-coordinate mode. The scan is y-major, then x-minor.
export async function look_all(nearby, doMons, state = game) {
    const coordinateMode = state.iflags?.getpos_coords ?? GPCOORDS_NONE;
    if (coordinateMode !== GPCOORDS_NONE
        && coordinateMode !== GPCOORDS_MAP) {
        throw new UnsupportedWhatisError('alternate list coordinates');
    }
    const { loX, loY, hiX, hiY } = look_region_nearby(nearby, state);
    const lines = [];
    for (let y = loY; y <= hiY; ++y) {
        for (let x = loX; x <= hiX; ++x) {
            const glyph = glyph_at(x, y, state);
            let description = '';
            if (doMons && glyph_is_monster(glyph)) {
                if (u_at(x, y, state)) {
                    description = self_lookat(state);
                } else {
                    const monster = m_at(x, y, state);
                    if (monster)
                        description = look_at_monster(monster, x, y, state);
                }
            } else if (!doMons && glyph_is_object(glyph)) {
                description = look_at_object(glyph, x, y, state);
            }
            if (!description) continue;

            if (!lines.length) {
                const which = doMons ? 'monsters' : 'objects';
                lines.push({
                    text: nearby
                        ? `${which[0].toUpperCase()}${which.slice(1)} currently shown near <${state.u.ux},${state.u.uy}>:`
                        : `All ${which} currently shown on the map:`,
                });
                lines.push({ text: '    ' });
            }
            const location = state.level?.at(x, y);
            const symbol = location?.disp_ch
                ?? visibleGlyphCharacter(map_glyphinfo(glyph, state));
            lines.push({
                text: `${mapCoordinate(x, y)}  ${symbol}  ${description}`,
            });
        }
    }

    if (lines.length) {
        await displayTtyTextWindow(state, lines);
    } else {
        await ttyPline(
            `No ${doMons ? 'monsters' : 'objects'} are currently shown ${
                nearby ? 'nearby' : 'on the map'
            }.`,
            state,
        );
    }
}

// C ref: pager.c trap_description().
export function trap_description(ttyp, x, y, state = game) {
    if (trapped_chest_at(ttyp, x, y, state)) return 'trapped chest';
    if (trapped_door_at(ttyp, x, y, state)) return 'trapped door';
    return trapname(ttyp);
}

// C ref: pager.c add_quoted_engraving(). JavaScript returns the extended
// string because strings are immutable; an ineligible engraving returns the
// original string, matching C's untouched buffer.
export function add_quoted_engraving(x, y, buffer, force, state = game) {
    const engraving = engr_at(x, y, state);
    const floorEngraving = buffer === ' (engraving';
    const headstone = buffer === ' (grave';
    if (!engraving || (!floorEngraving && !headstone && !force)) return buffer;
    if (engraving.eread) {
        const label = headstone ? 'headstone reading' : 'remembered text';
        const text = engraving.engr_txt?.[1] ?? '';
        return `${buffer} with ${label}: "${text}"`;
    }
    const unread = headstone ? 'whose headstone' : 'that';
    return `${buffer} ${unread} you haven't read`;
}

function assertDefaultListCoordinates(state) {
    const coordinateMode = state.iflags?.getpos_coords ?? GPCOORDS_NONE;
    if (coordinateMode !== GPCOORDS_NONE
        && coordinateMode !== GPCOORDS_MAP) {
        throw new UnsupportedWhatisError('alternate list coordinates');
    }
}

function encodedGlyphCharacter(glyph, state) {
    return visibleGlyphCharacter(map_glyphinfo(glyph, state));
}

function displayedGlyphCharacter(glyph, x, y, state) {
    const location = state.level?.at(x, y);
    if (location?.disp_browser_ch) return location.disp_browser_ch;
    if (location?.disp_decgfx) {
        return SCORER_DEC_MAP[location.disp_ch] ?? location.disp_ch;
    }
    return location?.disp_ch ?? encodedGlyphCharacter(glyph, state);
}

// C ref: pager.c look_traps(). The scan is y-major, then x-minor.
export async function look_traps(nearby, state = game) {
    assertDefaultListCoordinates(state);
    const { loX, loY, hiX, hiY } = look_region_nearby(nearby, state);
    const lines = [];
    for (let y = loY; y <= hiY; ++y) {
        for (let x = loX; x <= hiX; ++x) {
            let glyph = glyph_at(x, y, state);
            let description = '';
            let obscuring = '';
            if (glyph_is_trap(glyph)) {
                description = trap_description(
                    glyph_to_trap(glyph), x, y, state,
                );
            } else {
                const trap = t_at(x, y, state);
                if (trap?.tseen
                    && ((!Is_waterlevel(state.u?.uz)
                        && !Is_airlevel(state.u?.uz))
                        || couldsee(x, y, state))) {
                    obscuring = displayedGlyphCharacter(
                        glyph, x, y, state,
                    );
                    description = `${trapname(trap.ttyp)}, obscured by `
                        + obscuring;
                    glyph = trap_to_glyph(trap, state);
                }
            }
            if (!description) continue;
            if (!lines.length) {
                lines.push({
                    text: nearby
                        ? 'Nearby seen or remembered traps:'
                        : 'Seen or remembered traps on this level:',
                });
                lines.push({ text: '    ' });
            }
            const symbol = encodedGlyphCharacter(glyph, state);
            const prefix = trapOrEngravingMapCoordinate(x, y);
            const text = `${prefix}  ${symbol}  ${description}`;
            const glyphCells = [{ column: 10, ch: symbol }];
            if (obscuring) {
                glyphCells.push({
                    column: text.length - obscuring.length,
                    ch: obscuring,
                });
            }
            lines.push({ text, glyphCells });
        }
    }
    if (lines.length) {
        await displayTtyTextWindow(state, lines);
    } else {
        await ttyPline(
            `No traps seen or remembered${nearby ? ' nearby' : ''}.`, state,
        );
    }
}

function isCmapEngraving(index) {
    return index === S_engroom || index === S_engrcorr;
}

// C ref: pager.c look_engrs(). The scan is y-major, then x-minor.
export async function look_engrs(nearby, state = game) {
    assertDefaultListCoordinates(state);
    const { loX, loY, hiX, hiY } = look_region_nearby(nearby, state);
    const lines = [];
    for (let y = loY; y <= hiY; ++y) {
        for (let x = loX; x <= hiX; ++x) {
            const location = state.level?.at(x, y);
            if (!location?.seenv) continue;
            const engraving = engr_at(x, y, state);
            if (!engraving) continue;
            const lastSeenType = state.level?.lastseentyp?.[x]?.[y]
                ?? location.typ;
            const headstone = lastSeenType === GRAVE;
            let description = add_quoted_engraving(
                x, y, ` (${headstone ? 'grave' : 'engraving'}`, true, state,
            );
            if (headstone) {
                description = description
                    .replace('(grave with ', '')
                    .replace('(grave whose ', '');
            } else {
                description = description
                    .replace('(engraving with ', '')
                    .replace('(engraving ', 'engraving ');
            }

            let glyph = glyph_at(x, y, state);
            const symbol = glyph_is_cmap(glyph)
                ? glyph_to_cmap(glyph) : null;
            let obscuring = '';
            if (!isCmapEngraving(symbol) && symbol !== S_grave) {
                obscuring = displayedGlyphCharacter(
                    glyph, x, y, state,
                );
                description += `, obscured by ${obscuring}`;
                glyph = headstone
                    ? cmap_to_glyph(S_grave, state)
                    : engraving_to_glyph(engraving, state);
            }
            if (!lines.length) {
                lines.push({
                    text: nearby
                        ? 'Nearby seen or remembered engravings:'
                        : 'Seen or remembered engravings on this level:',
                });
                lines.push({ text: '    ' });
            }
            const renderedSymbol = encodedGlyphCharacter(glyph, state);
            const prefix = trapOrEngravingMapCoordinate(x, y);
            const text = `${prefix}  ${renderedSymbol} ${description}`;
            const glyphCells = [{ column: 10, ch: renderedSymbol }];
            if (obscuring) {
                glyphCells.push({
                    column: text.length - obscuring.length,
                    ch: obscuring,
                });
            }
            lines.push({ text, glyphCells });
        }
    }
    if (lines.length) {
        await displayTtyTextWindow(state, lines);
    } else {
        await ttyPline(
            `No engravings seen or remembered${nearby ? ' nearby' : ''}.`,
            state,
        );
    }
}

function appendDescription(out, description) {
    // pager.c append_str() treats a case-insensitive substring as an existing
    // match. That collapses the eleven wall indices to one "wall" entry.
    if (out.toLowerCase().includes(description.toLowerCase())) return out;
    return `${out} or ${description}`;
}

function cmapDescriptionWithArticle(index, explanation) {
    if (index === S_stone || explanation === 'air'
        || explanation === 'land' || explanation === 'ice') {
        return explanation;
    }
    if (explanation.includes(' of a room')) return `the ${explanation}`;
    return an(explanation);
}

function visibleGlyphCharacter(glyphinfo) {
    if (glyphinfo.displayCh) return glyphinfo.displayCh;
    if (glyphinfo.dec)
        return SCORER_DEC_MAP[glyphinfo.ch] ?? glyphinfo.ch;
    return glyphinfo.ch;
}

// C ref: pager.c waterbody_name() (560-612). `SURFACE_AT()` is the shared
// dungeon owner, so a raised drawbridge is named for what lies beneath it.
// The optional environment carries the display RNG used by hliquid(); this
// keeps hallucinated descriptions in planning clones off the live stream.
export function waterbody_name(x, y, state = game, env = {}) {
    if (!isok(x, y)) return 'drink';
    const loc = state.level?.at?.(x, y);
    const typ = surface_typ(loc);
    const liquid = (preferred) => hliquid(preferred, {
        state,
        displayRandom: env.displayRandom,
    });
    const hallucinating = Boolean(state.u?.uprops?.[HALLUC]?.intrinsic)
        && !Boolean(
            state.u?.uprops?.[HALLUC_RES]?.intrinsic
            || state.u?.uprops?.[HALLUC_RES]?.extrinsic,
        )
        && !state.program_state?.gameover;
    if (typ === LAVAPOOL) return `molten ${liquid('lava')}`;
    if (typ === ICE)
        return hallucinating ? `frozen ${liquid('water')}` : 'ice';
    if (typ === POOL) return `pool of ${liquid('water')}`;
    if (typ === MOAT) {
        if (hallucinating) return `deep ${liquid('water')}`;
        const level = state.u?.uz;
        if (on_level(level, state.medusa_level)) return 'shallow sea';
        if (on_level(level, state.juiblex_level)) return 'swamp';
        if (state.urole?.mnum === PM_SAMURAI
            && on_level(level, state.qstart_level)) return 'pond';
        return 'moat';
    }
    if (typ === WATER) {
        return on_level(state.u?.uz, state.water_level)
            ? 'limitless water' : `wall of ${liquid('water')}`;
    }
    if (typ === LAVAWALL) return `wall of ${liquid('lava')}`;
    return 'water';
}

// C ref: pager.c ice_descr() (614-649).  The description also stores
// iflags.ice_rating for the caller, so it remains beside waterbody_name() in
// the pager owner rather than in the inventory consumer.
export function ice_descr(x, y, state = game) {
    const icetyp = ['solid', 'sturdy', 'steady', 'unsteady', 'thin', 'slushy'];
    state.iflags ??= {};
    state.iflags.ice_rating = -1;
    const location = state.level?.at(x, y);
    const surfaceIsIce = location?.typ === ICE
        || (location?.typ === DRAWBRIDGE_UP
            && ((location.flags ?? 0) & DB_UNDER) === DB_ICE);
    if (!surfaceIsIce) return `[ice:${location?.typ ?? 0}?]`;

    const range = Math.max(Math.trunc(state.u?.xray_range ?? 0), 2);
    const nearDistance = range * range * 2 - range;
    const distant = dist2(x, y, state.u.ux, state.u.uy) > nearDistance;
    const unseen = !cansee(x, y, state)
        && (!u_at(x, y, state) || Levitation(state));
    if ((distant || unseen) && !state.gd?.decor_levitate_override)
        return waterbody_name(x, y, state);

    let timeLeft = 0;
    if (state.gt && state.svt)
        timeLeft = spot_time_left(x, y, MELT_ICE_AWAY, state);
    const rating = !timeLeft ? 0
        : timeLeft > 1000 ? 1
            : timeLeft > 100 ? 2
                : timeLeft > 50 ? 3
                    : timeLeft > 14 ? 4 : 5;
    state.iflags.ice_rating = rating;
    return `${icetyp[rating]} ${waterbody_name(x, y, state)}`;
}

// C ref: pager.c lookat() (657-801), the cmap switch arm. The surrounding
// canonical function owns the other glyph families and this helper only keeps
// the context-sensitive terrain descriptions in the pager source owner.
function lookatOrdinaryTerrain(x, y, glyph, state) {
    if (glyph_is_trap(glyph)) {
        return trap_description(glyph_to_trap(glyph), x, y, state);
    }
    const index = glyph_to_cmap(glyph);
    if (!Number.isInteger(index) || index < 0 || index >= MAXPCHARS)
        throw new UnsupportedWhatisError(`terrain ${index}`);
    // C ref: pager.c lookat() (738-793). Every ordinary cmap index has a
    // source explanation; only the context-sensitive cases below need more
    // than the generated defsym text. Keeping the generated fallback here
    // admits sink/fountain and the remaining ordinary furniture/wall forms
    // without inventing a caller-specific description.
    if (index === S_altar) {
        const mask = altarmask_at(x, y, state);
        const alignment = Amask2align(mask & AM_MASK);
        const high = Is_astralevel(state.u?.uz)
            && dist2(x, y, state.u?.ux, state.u?.uy) > 2
            && Boolean(mask & AM_SANCTUM);
        return `${high ? 'aligned' : align_str(alignment)} `
            + `${mask & AM_SANCTUM ? 'high ' : ''}altar`;
    }
    if (index === S_ndoor) {
        if (is_drawbridge_wall(x, y, state) >= 0)
            return 'open drawbridge portcullis';
        const location = state.level?.at(x, y);
        const mask = location?.flags || location?.doormask || 0;
        return (mask & ~D_TRAPPED) === D_BROKEN ? 'broken door' : 'doorway';
    }
    if (index === S_cloud)
        return Is_airlevel(state.u?.uz) ? 'cloudy area' : 'fog/vapor cloud';
    if (index === S_pool || index === S_water
        || index === S_lava || index === S_lavawall || index === S_ice)
        return waterbody_name(x, y, state);
    if (index === S_engroom || index === S_engrcorr)
        return 'engraving';
    if (index === S_stone) {
        const location = state.level?.at(x, y);
        if (!location?.seenv) return 'unexplored';
        if (state.u?.uinwater && !Is_waterlevel(state.u?.uz)) {
            return dist2(x, y, state.u?.ux, state.u?.uy) <= 2
                ? 'land' : 'unknown';
        }
    }
    return CMAP_EXPLANATIONS[index];
}

// C ref: pager.c lookat() (657-801). This is the canonical source result:
// buf is the description, monbuf explains the sensing method, and pm is the
// returned permonst used by checkfile(). The whatis renderer consumes all
// three values; the ordinary cmap helper above is only one switch arm.
export function lookat(x, y, state = game) {
    const u = state.u ?? {};
    const glyph = glyph_at(x, y, state);
    let buf = '';
    let monbuf = '';
    let pm = null;
    const invisible = propertyActive(state, INVIS)
        && !propertyActive(state, SEE_INVIS);
    const telepathyProperty = state.u?.uprops?.[TELEPAT] ?? {};
    const telepathy = Boolean(telepathyProperty.extrinsic)
        && !telepathyProperty.blocked;
    const detection = propertyActive(state, DETECT_MONSTERS);
    const canSpotSelf = heroBlind(state)
        || u.uswallow
        || (!invisible && !u.uundetected)
        || telepathy || detection;
    const selfTerrainAllowed = !state.iflags?.terrainmode
        || (state.iflags.terrainmode & TER_MON) !== 0;
    if (u_at(x, y, state) && canSpotSelf
        && (!state.iflags?.save_uswallow
            || glyph !== mon_to_glyph(u.ustuck, state))
        && selfTerrainAllowed) {
        buf = self_lookat(state);
        if ((invisible || u.uundetected) && !heroBlind(state)
            && !u.uswallow && !state.iflags?.save_uswallow) {
            const seen = [];
            if (propertyActive(state, INFRAVISION)) seen.push('infravision');
            if (telepathy) seen.push('telepathy');
            if (detection) seen.push('monster detection');
            if (seen.length) buf += ' [seen: ' + seen.join(', ') + ']';
        }
        if (state.urole?.mnum === PM_WIZARD
            && state.urace?.mnum === PM_GNOME && !Upolyd(u)) {
            pm = state.mons?.[PM_WIZARD] ?? null;
        }
    } else if (u.uswallow) {
        buf = 'interior of ' + mon_nam(u.ustuck, state);
        pm = u.ustuck?.data ?? null;
    } else if (glyph_is_monster(glyph)) {
        const monster = m_at(x, y, state);
        if (monster) {
            const side = {};
            buf = look_at_monster(monster, x, y, state, side);
            monbuf = side.monbuf ?? '';
            pm = monster.data ?? null;
        } else if (heroHallucinating(state)) {
            buf = rndmonnam({ state });
        }
    } else if (glyph_is_object(glyph)) {
        buf = look_at_object(glyph, x, y, state);
    } else if (glyph_is_trap(glyph)) {
        buf = trap_description(glyph_to_trap(glyph), x, y, state);
    } else if (glyph_is_warning(glyph)) {
        const warning = glyph - GLYPH_WARNING_OFF;
        buf = def_warnsyms[warning]?.desc ?? '';
    } else if (glyph_is_invisible(glyph)) {
        buf = 'remembered, unseen, creature';
    } else if (glyph === GLYPH_NOTHING_OFF) {
        buf = 'dark part of a room';
    } else if (glyph === GLYPH_UNEXPLORED_OFF) {
        buf = state.u?.uinwater && !Is_waterlevel(state.u?.uz)
            ? (dist2(x, y, state.u?.ux, state.u?.uy) <= 2
                ? 'land' : 'unknown')
            : 'unexplored area';
    } else if (glyph_is_cmap(glyph)) {
        buf = lookatOrdinaryTerrain(x, y, glyph, state);
    } else {
        buf = 'unexplored area';
    }
    return {
        buf,
        monbuf,
        pm: pm && !heroHallucinating(state) ? pm : null,
    };
}

// C ref: pager.c do_screen_description() and lookat(). The generic list is
// built in defsym.h order before lookat() refines an ambiguous map symbol.
export function do_screen_description(cc, looked, sym, state = game) {
    if (!looked || sym)
        throw new UnsupportedWhatisError('a typed symbol');
    if (cc.x === state.u.ux && cc.y === state.u.uy) {
        const location = state.level?.at(cc.x, cc.y);
        const displayCharacter = location?.disp_ch ?? '@';
        const info = lookat(cc.x, cc.y, state);
        const result = {
            found: 1,
            out: displayCharacter + '        a human or elf ('
                + info.buf + ')',
            firstmatch: info.buf,
        };
        if (info.pm) result.supplement = info.pm;
        return result;
    }

    const glyph = glyph_at(cc.x, cc.y, state);
    // Object glyphs have their own generic class pass.  Let that path call
    // lookat() exactly once; object_from_map() may create a synthetic object
    // and observing or naming it twice would duplicate source side effects.
    if (glyph_is_object(glyph))
        return describe_object_glyph(cc, glyph, state);

    const info = lookat(cc.x, cc.y, state);
    // C ref: pager.c do_screen_description()'s non-cmap results are refined
    // by lookat() and preserve its exact buf/monbuf/permonst result contract.
    if (glyph === GLYPH_NOTHING_OFF) {
        return {
            found: 1,
            out: '         the dark part of a room',
            firstmatch: info.buf,
        };
    }
    if (glyph === GLYPH_UNEXPLORED_OFF) {
        return {
            found: 1,
            out: '         unexplored',
            firstmatch: info.buf,
        };
    }
    if (glyph_is_warning(glyph)) {
        return {
            found: 1,
            out: '         ' + info.buf,
            firstmatch: info.buf,
        };
    }
    if (glyph_is_invisible(glyph)) {
        const detail = invisibleGlyphDescription(state);
        return {
            found: 1,
            out: '         ' + detail,
            firstmatch: detail,
        };
    }
    if (glyph_is_swallow(glyph)) {
        const result = {
            found: 1,
            out: '         ' + info.buf,
            firstmatch: info.buf,
        };
        if (info.pm) result.supplement = info.pm;
        return result;
    }
    if (glyph_is_monster(glyph)) {
        if (state.iflags?.terrainmode
            && !(state.iflags.terrainmode & TER_MON)) {
            return { found: 0, out: '', firstmatch: 'unknown' };
        }
        const monster = m_at(cc.x, cc.y, state);
        const location = state.level?.at(cc.x, cc.y);
        const displayCharacter = location?.disp_ch
            ?? (monster ? monster_glyph_info(monster, state).ch : 'M');
        const result = {
            found: 1,
            out: displayCharacter + '        ' + info.buf
                + (info.monbuf ? ' [seen: ' + info.monbuf + ']' : ''),
            firstmatch: info.buf,
        };
        if (info.pm) result.supplement = info.pm;
        return result;
    }
    if (!glyph_is_cmap(glyph)) {
        return {
            found: info.buf ? 1 : 0,
            out: info.buf ? '         ' + info.buf : '',
            firstmatch: info.buf || 'unknown',
        };
    }
    const glyphinfo = map_glyphinfo(glyph, state);
    const symbolByte = glyphinfo.ttychar;
    let found = 0;
    let needToLook = false;
    let skippedVenom = false;
    let firstmatch = 'unknown';
    let out = visibleGlyphCharacter(glyphinfo) + '        ';

    // pager.c appends every matching symbol class before it asks lookat() for
    // the location-specific refinement.  In particular, the blank stone
    // glyph also matches the ghost class and the two default misc symbols;
    // omitting those passes leaves "stone or air" where C has enough matches
    // to use its "can be many things" summary.
    const appendGeneric = (
        description,
        article = true,
        firstMatch = description,
    ) => {
        const described = article ? an(description) : description;
        if (!found) {
            out += described;
            firstmatch = firstMatch;
            found = 1;
            return;
        }
        const appended = appendDescription(out, described);
        if (appended !== out) {
            out = appended;
            ++found;
        }
    };

    if (!state.iflags?.terrainmode
        || (state.iflags.terrainmode & TER_MON) !== 0) {
        for (let index = 1; index < MAXMCLASSES; ++index) {
            if (index === S_invisible) continue;
            const explanation = MONSTER_CLASS_EXPLANATIONS[index];
            if (!explanation
                || monster_class_symbol(index, state).ttychar !== symbolByte)
                continue;
            needToLook = true;
            appendGeneric(explanation);
        }
        if (symbolByte === monster_class_symbol(S_HUMAN, state).ttychar
            && u_at(cc.x, cc.y, state)
            && !(state.urace?.mnum === PM_HUMAN
                || state.urace?.mnum === PM_ELF)
            && !Upolyd(state.u)) {
            // C's special human/elf self arm appends the literal "you" after
            // the class loop; it is only reachable for a non-human/elf race.
            appendGeneric('you', false);
        }
    }

    if (!state.iflags?.terrainmode
        || (state.iflags.terrainmode & TER_OBJ) !== 0) {
        const boulderSymbol = state.go?.ov_primary_syms?.[
            SYM_OFF_X + SYM_BOULDER
        ] || object_class_symbol(ROCK_CLASS, state).ttychar;
        for (let index = 1; index < MAXOCLASSES; ++index) {
            const matches = index === ROCK_CLASS
                ? (glyph_is_statue(glyph) || symbolByte === boulderSymbol)
                : object_class_symbol(index, state).ttychar === symbolByte;
            if (!matches) continue;
            let explanation = OBJCLASS_EXPLANATIONS[index];
            if (!explanation) continue;
            if (index === ROCK_CLASS
                && explanation === 'boulder or statue') {
                if (symbolByte === boulderSymbol) explanation = 'boulder';
                else if (glyph_is_statue(glyph)) explanation = 'statue';
                else continue;
            }
            needToLook = true;
            if (index === VENOM_CLASS) {
                skippedVenom = true;
                continue;
            }
            appendGeneric(explanation);
        }
    }

    // These checks use the displayed byte as C does, so a cmap glyph can also
    // be reported as the default NOTHING/UNEXPLORED symbol.  They must run
    // before the cmap loop and before lookat() refinement.
    if (symbolByte === misc_symbol(SYM_INVISIBLE, state).ttychar) {
        appendGeneric(invisibleGlyphDescription(state));
    }
    if (symbolByte === misc_symbol(SYM_NOTHING, state).ttychar) {
        appendGeneric('the dark part of a room', false);
    }
    if (symbolByte === misc_symbol(SYM_UNEXPLORED, state).ttychar) {
        appendGeneric(
            state.u?.uinwater && !Is_waterlevel(state.u?.uz)
                ? 'land' : 'unexplored',
            false,
        );
    }

    // C ref: pager.c is_swallow_sym(). A DEC graphics wall can share its
    // active display byte with a swallow boundary; retain that generic
    // possibility before let lookat() refine it.
    for (let index = S_sw_tl; index <= S_sw_br; ++index) {
        if (cmap_symbol_byte(index, state) !== symbolByte) continue;
        out += 'the interior of a monster';
        firstmatch = 'the interior of a monster';
        found = 1;
        break;
    }
    for (let index = 0; index < MAXPCHARS; ++index) {
        const altIndex = index === S_lava ? S_water
            : index === S_lavawall ? S_lava
                : index === S_water ? S_lavawall : index;
        const explanation = CMAP_EXPLANATIONS[altIndex];
        if (!explanation
            || cmap_symbol_byte(altIndex, state) !== symbolByte)
            continue;
        if (found >= 3
            && altIndex >= S_vodbridge && altIndex <= S_hcdbridge)
            continue;
        const described = cmapDescriptionWithArticle(altIndex, explanation);
        appendGeneric(described, false, explanation);
        const liquid = altIndex === S_water || altIndex === S_lava
            || altIndex === S_lavawall || altIndex === S_ice;
        if (altIndex === S_pool || altIndex === S_altar || altIndex === S_engroom
            || altIndex === S_engrcorr || altIndex === S_grave
            || (altIndex >= S_arrow_trap
                && altIndex < S_arrow_trap + MAXTCHARS)
            || (heroHallucinating(state) && liquid)) {
            needToLook = true;
        }
    }

    // Warning symbols are a separate source table, and are checked after the
    // cmap pass.  A warning may share a displayed byte with a boulder, but
    // its text is still appended before the final refinement.
    for (let index = 1; index < (state.gw?.warnsyms?.length ?? WARNCOUNT); ++index) {
        const warningSymbol = state.gw?.warnsyms?.[index]
            ?? def_warnsyms[index]?.ch?.charCodeAt(0);
        if (warningSymbol !== symbolByte) continue;
        appendGeneric(def_warnsyms[index]?.desc ?? 'unknown creature', false);
        break;
    }

    if (skippedVenom && found < 2)
        appendGeneric(OBJCLASS_EXPLANATIONS[VENOM_CLASS]);
    if (found > 4)
        out = visibleGlyphCharacter(glyphinfo) + '        can be many things';

    if (found > 1 || needToLook) {
        let detail = info.buf;
        if (detail === 'ice') detail = ice_descr(cc.x, cc.y, state);
        if (detail === 'staircase down'
            && on_level(state.u?.uz, state.qstart_level)
            && !ok_to_quest(state)) {
            detail = 'blocked staircase down';
        }
        firstmatch = detail;
        out += ' (' + detail + ')';
        if (info.monbuf) out += ' [seen: ' + info.monbuf + ']';
        found = 1;
    }
    const result = { found, out, firstmatch };
    if (info.pm) result.supplement = info.pm;
    return result;
}

export const CHKFIL_USR_TYPED = 1;
export const CHKFIL_DONT_ASK = 2;
export const CHKFIL_IA_CHECK = 4;

function stripPrefix(value, prefix) {
    return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

// C ref: pager.c checkfile() (830-964), through the two lookup strings used by
// its ordered data.base passes. The returned `alt` is searched before `base`.
export function normalizeDataBaseLookup(input, state = game) {
    if (typeof input !== 'string' || input.length > 255)
        throw new TypeError('checkfile input must be a BUFSZ-sized string');

    let base = input.toLowerCase();
    base = stripPrefix(base, 'interior of ');
    if (base.startsWith('a ')) base = base.slice(2);
    else if (base.startsWith('an ')) base = base.slice(3);
    else if (base.startsWith('the ')) base = base.slice(4);
    else if (base.startsWith('some ')) base = base.slice(5);
    else if (/^[0-9]/u.test(base)) {
        base = base.replace(/^[0-9]+ ?/u, '');
    }
    base = stripPrefix(base, 'pair of ');
    if (base.startsWith('tame ')) base = base.slice(5);
    else if (base.startsWith('peaceful ')) base = base.slice(9);
    base = stripPrefix(base, 'invisible ');
    base = stripPrefix(base, 'saddled ');
    if (base.startsWith('blessed ')) base = base.slice(8);
    else if (base.startsWith('uncursed ')) base = base.slice(9);
    else if (base.startsWith('cursed ')) base = base.slice(7);
    base = stripPrefix(base, 'empty ');
    if (base.startsWith('partly used ')) base = base.slice(12);
    else if (base.startsWith('partly eaten ')) base = base.slice(13);
    if (base.startsWith('statue of ')) base = 'statue';
    else if (base.startsWith('figurine of ')) base = 'figurine';
    if (/^[+-][0-9]/u.test(base))
        base = base.replace(/^[+-][0-9]+ ?/u, '');
    if (base.startsWith('moist towel')) base = `wet${base.slice(5)}`;

    let alt = null;
    const named = base.indexOf(' named ');
    const called = base.indexOf(' called ');
    if (named >= 0) {
        alt = base.slice(named + 7);
        const cut = called >= 0 && called < named ? called : named;
        base = base.slice(0, cut);
    } else if (called >= 0) {
        alt = base.slice(called + 8);
        base = base.slice(0, called);
    } else {
        const comma = base.indexOf(', ');
        if (comma > 0) base = base.slice(0, comma);
    }
    if (alt) {
        if (alt.startsWith('a ')) alt = alt.slice(2);
        else if (alt.startsWith('an ')) alt = alt.slice(3);
        else if (alt.startsWith('the ')) alt = alt.slice(4);
    }
    const baseDetails = base.indexOf(' (');
    if (baseDetails > 0) base = base.slice(0, baseDetails);
    if (alt) {
        const altDetails = alt.indexOf(' (');
        if (altDetails > 0) alt = alt.slice(0, altDetails);
    }
    if (!alt && fruit_from_name(base, true, state)) {
        alt = state.obj_descr?.[SLIME_MOLD]?.oc_name ?? 'slime mold';
    } else if (!alt) {
        alt = makesingular(base);
    }
    return { base, alt };
}

// C ref: strutil.c pmatch(). checkfile() lowercases the lookup term but keeps
// data.base keys unchanged, so matching itself remains case-sensitive.
function wildcardMatch(pattern, value) {
    let previous = new Array(value.length + 1).fill(false);
    previous[0] = true;
    for (const character of pattern) {
        const current = new Array(value.length + 1).fill(false);
        if (character === '*') current[0] = previous[0];
        for (let index = 1; index <= value.length; ++index) {
            if (character === '*') {
                current[index] = previous[index] || current[index - 1];
            } else if (character === '?' || character === value[index - 1]) {
                current[index] = previous[index - 1];
            }
        }
        previous = current;
    }
    return previous[value.length];
}

// Preserve key order within each entry: a matching '~' key suppresses every
// positive key after it, exactly like checkfile()'s skipping_entry flag.
export function dataBaseEntry(term) {
    for (const entry of DATA_BASE_ENTRIES) {
        for (const key of entry.keys) {
            const excluded = key.startsWith('~');
            if (!wildcardMatch(excluded ? key.slice(1) : key, term)) continue;
            if (excluded) break;
            return entry;
        }
    }
    return null;
}

// C ref: pager.c checkfile() (830-1129). This port covers every generated
// key and text entry, the user-typed and no-question flags used by do_look(),
// and the ordinary question used by map lookup.
export async function checkfile(input, pm = null, chkflags = 0, state = game) {
    const userTyped = (chkflags & CHKFIL_USR_TYPED) !== 0;
    const dontAsk = (chkflags & CHKFIL_DONT_ASK) !== 0;
    const iaChecking = (chkflags & CHKFIL_IA_CHECK) !== 0;
    const source = pm && !userTyped
        ? pm.pmnames?.[NEUTRAL] ?? input
        : input;
    const { base, alt } = normalizeDataBaseLookup(source, state);
    if (!base) return false;

    const terms = alt === base ? [base] : [alt, base];
    let firstEntry = null;
    let passOneFound = false;
    let result = false;
    for (let pass = 0; pass < terms.length; ++pass) {
        const entry = dataBaseEntry(terms[pass]);
        if (!entry) continue;
        if (pass === 0 && terms.length === 2) {
            firstEntry = entry;
            passOneFound = true;
        } else if (entry === firstEntry) {
            return result;
        }

        let show = userTyped || dontAsk;
        if (!show) {
            const answer = await tty_yn_function(
                `More info about "${terms[pass]}"?`, 'yn', 'n', state,
            );
            show = answer === 'y'.charCodeAt(0);
        }
        if (show) {
            result = true;
            if (iaChecking) return true;
            await displayTtyMenuTextWindow(
                state, entry.lines.map((text) => ({ text })),
            );
        }
    }
    if (userTyped && !result && !passOneFound) {
        await ttyPline(
            "You don't have any information on those things.", state,
        );
    }
    return result;
}

export async function do_look(mode, clickCc = null, state = game) {
    const quick = mode === 1;
    if ((mode !== 0 && !quick) || clickCc)
        throw new UnsupportedWhatisError('click or queued look mode');
    assertOrdinaryWhatisState(state);

    // C ref: pager.c do_look() sets i='y' for quick mode, bypassing the
    // #whatis selection menu and entering the screen-coordinate path.
    const choice = quick ? '/' : await select_menu(state, {
        how: PICK_ONE,
        title: 'What do you want to look at:',
        ...menuTitleStyle(state),
        items: menuLines(state),
        overlay: state.iflags?.menu_overlay !== false,
    });
    if (choice === null) return ECMD_OK;
    if (choice === 'i') {
        let inventoryRepairLayout = null;
        const invlet = await display_inventory(null, true, state, {
            // invent.c display_pickinv() uses the same PICK_ONE menu and
            // heading style as the ordinary inventory command.
            menu: (items) => {
                const spec = {
                    items: items.map((item) => (item.heading
                        ? {
                            ...item,
                            attr: menuTitleStyle(state).titleAttr,
                            color: menuTitleStyle(state).titleColor,
                        }
                        : item)),
                    how: PICK_ONE,
                    cancelValue: null,
                    overlay: state.iflags?.menu_overlay !== false,
                };
                inventoryRepairLayout = ttyMenuLayout(state.nhDisplay, spec);
                return select_menu(state, spec);
            },
        });
        // wintty.c tty_dismiss_nhwindow() repairs the inventory menu with
        // docorner(offx, maxrow + 1, 0). Clear exactly the suffixes where that
        // vertical rectangle intersects the configured status window; a
        // shorter overlay never reaches status, while a three-line status can
        // intersect two rows. Full-screen menus own their complete redraw.
        if (inventoryRepairLayout && !inventoryRepairLayout.fullScreen) {
            const statusLines = state.iflags?.wc2_statuslines === 3 ? 3 : 2;
            const firstStatusRow = state.nhDisplay.rows - statusLines;
            const lastRepairRow = Math.min(
                state.nhDisplay.rows - 1,
                inventoryRepairLayout.maxrow,
            );
            for (let row = firstStatusRow; row <= lastRepairRow; ++row) {
                for (let column = inventoryRepairLayout.repairColumn;
                    column < state.nhDisplay.cols; ++column) {
                    state.nhDisplay.setCell(column, row, ' ', NO_COLOR, 0);
                }
            }
        }
        if (!invlet || invlet === '\x1b') return ECMD_OK;
        for (let invobj = state.invent; invobj; invobj = invobj.nobj) {
            if (invobj.invlet !== invlet) continue;
            const name = singular(invobj, xnameFresh, state);
            await checkfile(
                name, null, CHKFIL_USR_TYPED | CHKFIL_DONT_ASK, state,
            );
            break;
        }
        return ECMD_OK;
    }
    if (choice === '?') {
        let answer = await getlin('Specify what? (type the word)', state);
        if (answer !== ' ') answer = mungspaces(answer);
        if (!answer || answer.startsWith('\x1b')) return ECMD_OK;
        if (answer.length === 1)
            throw new UnsupportedWhatisError('a typed symbol');
        await checkfile(
            answer, null, CHKFIL_USR_TYPED | CHKFIL_DONT_ASK, state,
        );
        return ECMD_OK;
    }
    if (choice === 'm' || choice === 'M'
        || choice === 'o' || choice === 'O') {
        await look_all(choice === choice.toLowerCase(),
            choice.toLowerCase() === 'm', state);
        return ECMD_OK;
    }
    if (choice === 't' || choice === 'T') {
        await look_traps(choice === 't', state);
        return ECMD_OK;
    }
    if (choice === 'e' || choice === 'E') {
        await look_engrs(choice === 'e', state);
        return ECMD_OK;
    }
    if (choice !== '/')
        throw new UnsupportedWhatisError(`menu choice ${JSON.stringify(choice)}`);

    const savedVerbose = state.flags.verbose;
    state.flags.verbose = Boolean(savedVerbose && !quick);
    const cc = { x: state.u.ux, y: state.u.uy };
    try {
        for (;;) {
            await ttyPline(
                `${state.flags.verbose ? 'Please move the cursor to' : 'Pick'} ${WHAT_IS_A_LOCATION}.`,
                state,
            );
            const answer = await getpos(
                cc, quick, WHAT_IS_A_LOCATION, state,
            );
            if (answer < 0 || cc.x < 0) break;
            state.flags.verbose = false;

            const description = do_screen_description(cc, true, 0, state);
            const location = state.level?.at(cc.x, cc.y);
            if (location?.disp_decgfx) {
                await ttyPutmixed(
                    `${location.disp_ch}${description.out.slice(1)}`,
                    description.out[0], state,
                );
            } else {
                await ttyPline(description.out, state);
            }
            if (description.found === 1
                && answer === LOOK_TRADITIONAL
                && state.flags.help) {
                await checkfile(description.firstmatch, description.supplement ?? null, 0, state);
            }
            if (quick) break;
        }
    } finally {
        state.flags.verbose = savedVerbose;
    }
    return ECMD_OK;
}

export async function dowhatis(state = game) {
    return do_look(0, null, state);
}

// C ref: pager.c doquickwhatis(). The semicolon binding calls the same
// do_look() implementation with quick mode and therefore skips #whatis's
// choice menu.
export async function doquickwhatis(state = game) {
    return do_look(1, null, state);
}

// C ref: pager.c setopt_cmd() (2902-2957). The current help boundary has the
// recorder's compiled-in bindings: #optionsfull has no key, reqmenu is `m`,
// and the simple options command is `O`. Later binding work must replace this
// bounded result with cmd_from_func()/cmdname_from_func() lookups.
export function setopt_cmd() {
    return "'#optionsfull' or 'm O'";
}

// C refs: pager.c dispfile_*(), hmenu_dohistory(), and dohistory(), plus
// win/tty/wintty.c tty_display_file() (2424-2516). The generator has already
// removed newlines and applied hacklib.c tabexpand(), so the runtime builds
// the NHW_TEXT lines without filesystem access.
async function display_file(filename, state) {
    const text = HELP_TEXT_FILES[filename];
    if (!text)
        throw new UnsupportedHelpError(`missing static file ${filename}`);
    await displayTtyTextWindow(state, text.map((line) => ({ text: line })));
}

async function dispfile_help(state) {
    await display_file('help', state);
}

async function dispfile_shelp(state) {
    await display_file('hh', state);
}

async function dispfile_optionfile(state) {
    await display_file('opthelp', state);
}

async function dispfile_optmenu(state) {
    await display_file('optmenu', state);
}

async function dispfile_license(state) {
    await display_file('license', state);
}

async function dispfile_usagehelp(state) {
    await display_file('usagehlp', state);
}

export async function dohistory(state = game) {
    await display_file('history', state);
    return ECMD_OK;
}

// C ref: pager.c dowhatdoes_core() (2577-2654). The live slice reaches a
// command-table description, which is the complete compiled branch above the
// source's disabled legacy data-file implementation.
export function dowhatdoes_core(q, state = game) {
    const description = key2extcmddesc(q, state);
    if (description === null) return null;
    return `${key2txt(q).padEnd(8)}${description}.`;
}

// C ref: pager.c dowhatdoes() (2657-2719), through the ordinary one-line `i`
// query exercised by the help menu. The alternate-meta, help expansion,
// unknown-command, and embedded-newline output arms remain fail-closed.
export async function dowhatdoes(state = game) {
    if (!state._dowhatdoesAsked) {
        await ttyPline("Ask about '&' or '?' to get more info.", state);
        state._dowhatdoesAsked = true;
    }
    // introff()/intron() only change the native terminal's signal handling.
    // The browser and replay input sources do not install that handler.
    const q = await yn_function('What command?', null, '\0', true, state);
    if (q !== 0x69) {
        throw new UnsupportedHelpError(
            `whatdoes query ${key2txt(q)} outside ordinary inventory lookup`,
        );
    }
    const result = dowhatdoes_core(q, state);
    await ttyPline(result, state);
    return ECMD_OK;
}

async function hmenu_dowhatdoes(state) {
    await dowhatdoes(state);
}

async function hmenu_dohistory(state) {
    await dohistory(state);
}

// C ref: pager.c domenucontrols() (2820-2827). displayTtyTextWindow() owns the
// NHW_TEXT create, display, dismissal, destruction, and map repair sequence.
export async function domenucontrols(state = game) {
    // cmd.js imports both pager.js and options.js, so delay this source-owner
    // edge until the help target dispatches.
    const { show_menu_controls } = await import('./options.js');
    const lines = [];
    show_menu_controls(lines, false, state);
    await displayTtyTextWindow(state, lines);
}

const DEVTEAM_EMAIL = 'devteam@nethack.org';
const DEVTEAM_URL = 'https://www.nethack.org/';

// C ref: pager.c docontact() (2721-2745), through the recorder's branch with
// no sysopt.support value and a formatted default WIZARDS list. An explicit
// SUPPORT value remains outside the current goal.
export function contactLines(state = game) {
    if (state.sysopt?.support)
        throw new UnsupportedHelpError('configured SUPPORT text');
    const lines = [];
    if (state.sysopt?.fmtd_wizard_list) {
        lines.push(
            `To contact local support, contact ${state.sysopt.fmtd_wizard_list}.`,
            '',
        );
    }
    lines.push(
        'To contact the NetHack development team directly,',
        `see the 'Contact' form on our website or email <${DEVTEAM_EMAIL}>.`,
        '',
        'For more information on NetHack, or to report a bug,',
        `visit our website "${DEVTEAM_URL}".`,
    );
    return lines;
}

export async function docontact(state = game) {
    const lines = contactLines(state).map((text) => ({ text }));
    await displayTtyTextWindow(state, lines);
}

// C ref: pager.c help_menu_items[] (2829-2858). This build has no PORT_HELP
// row, normal play omits dispfile_debughelp(), and hideusage is off. Keep the
// numeric value from the source-table index so filtering a future row cannot
// silently dispatch the wrong handler.
export function helpMenuItems() {
    return [
        { value: 1, selector: 'a', label: 'About NetHack (version information).' },
        { value: 2, selector: 'b', label: 'Long description of the game and commands.' },
        { value: 3, selector: 'c', label: 'List of game commands.' },
        { value: 4, selector: 'd', label: 'Concise history of NetHack.' },
        { value: 5, selector: 'e', label: 'Info on a character in the game display.' },
        { value: 6, selector: 'f', label: 'Info on what a given key does.' },
        { value: 7, selector: 'g', label: 'List of game options.' },
        { value: 8, selector: 'h', label: 'Longer explanation of game options.' },
        {
            value: 9,
            selector: 'i',
            label: `Using the ${setopt_cmd()} command to set options.`,
        },
        { value: 10, selector: 'j', label: 'Full list of keyboard commands.' },
        { value: 11, selector: 'k', label: 'List of extended commands.' },
        { value: 12, selector: 'l', label: 'List menu control keys.' },
        { value: 13, selector: 'm', label: "Description of NetHack's command line." },
        { value: 14, selector: 'n', label: 'The NetHack license.' },
        { value: 15, selector: 'o', label: 'Support information.' },
    ];
}

// C ref: pager.c hmenu_dowhatis() and dohelp() (2802-2805, 2860-2898).
// Every ordinary help_menu_items[] row dispatches here. The wizard-only row
// and a menu with sysopt.hideusage set remain excluded before menu creation.
export async function dohelp(state = game) {
    if (state.wizard)
        throw new UnsupportedHelpError('the wizard-mode help row');
    if (state.sysopt?.hideusage)
        throw new UnsupportedHelpError('a help menu with usage hidden');

    const choice = await select_menu(state, {
        how: PICK_ONE,
        title: 'Select one item:',
        ...menuTitleStyle(state),
        items: helpMenuItems(),
        overlay: state.iflags?.menu_overlay !== false,
        cancelValue: null,
    });
    if (choice === null) return ECMD_OK;
    if (choice === 1) {
        await doextversion(state, {
            displayTextWindow: displayTtyTextWindow,
            random: rn2,
        });
        return ECMD_OK;
    }
    if (choice === 2) {
        await dispfile_help(state);
        return ECMD_OK;
    }
    if (choice === 3) {
        await dispfile_shelp(state);
        return ECMD_OK;
    }
    if (choice === 4) {
        await hmenu_dohistory(state);
        return ECMD_OK;
    }
    if (choice === 5) {
        await dowhatis(state);
        return ECMD_OK;
    }
    if (choice === 6) {
        await hmenu_dowhatdoes(state);
        return ECMD_OK;
    }
    if (choice === 7) {
        // cmd.js already imports options.js for the live options command,
        // while pager.js imports cmd.js for help-key descriptions. Delay this
        // edge until dispatch so the source-file owners do not create a
        // module-initialization cycle.
        const { option_help } = await import('./options.js');
        await option_help(state);
        return ECMD_OK;
    }
    if (choice === 8) {
        await dispfile_optionfile(state);
        return ECMD_OK;
    }
    if (choice === 9) {
        await dispfile_optmenu(state);
        return ECMD_OK;
    }
    if (choice === 10) {
        // pager.js already imports cmd.js for key descriptions, so delay the
        // reverse edge until this help target dispatches.
        const { dokeylist } = await import('./cmd.js');
        await dokeylist(state);
        return ECMD_OK;
    }
    if (choice === 11) {
        // cmd.js imports pager.js for the live help command, so delay the
        // source-owner edge until this help target dispatches.
        const { doextlist } = await import('./cmd.js');
        await doextlist(state);
        return ECMD_OK;
    }
    if (choice === 12) {
        await domenucontrols(state);
        return ECMD_OK;
    }
    if (choice === 13) {
        await dispfile_usagehelp(state);
        return ECMD_OK;
    }
    if (choice === 14) {
        await dispfile_license(state);
        return ECMD_OK;
    }
    if (choice === 15) {
        await docontact(state);
        return ECMD_OK;
    }
    throw new UnsupportedHelpError(`menu target ${choice}`);
}
