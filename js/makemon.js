// Monster selection, birth limits, hit points, attitude, and special summons.
// C refs: makemon.c clone_mon(), monhp_per_lvl(), init_mextra(), newmextra(),
// unmakemon(), create_critters(), align_shift(), temperature_shift(),
// rndmonst_adj(), mkclass(), mkclass_aligned(), mkclass_poly(),
// newmcorpsenm(), freemcorpsenm(), bagotricks(), summon_furies(),
// wrong_elem_type();
// mkobj.c rndmonnum_adj(); questpgr.c qt_montype().

import {
    A_NONE,
    A_NEUTRAL,
    ALIGNWEIGHT,
    AM_CHAOTIC,
    AM_LAWFUL,
    AM_NEUTRAL,
    EDOG,
    EMIN,
    G_EXTINCT,
    G_GENOD,
    G_GONE,
    has_edog,
    has_emin,
    has_mcorpsenm,
    has_mgivenname,
    isok,
    LS_MONSTER,
    M_AP_MONSTER,
    M_AP_NOTHING,
    M_AP_TYPE,
    MAXMONNO,
    MGIVENNAME,
    MM_ADJACENTOK,
    MM_NOCOUNTBIRTH,
    MM_NOWAIT,
    NO_MM_FLAGS,
    nothing_happens,
    nothing_seems_to_happen,
} from './const.js';
import { newsym } from './display.js';
import { christen_monst } from './do_name.js';
import { tamedog } from './dog.js';
import { level_difficulty, Is_special, on_level } from './dungeon.js';
import { sgn } from './hacklib.js';
import { game } from './gstate.js';
import { new_light_source } from './light.js';
import { discard_minvent, makemon, mongone } from './makemon_create.js';
import { newemin } from './minion.js';
import {
    always_hostile,
    always_peaceful,
    emits_light,
    is_golem,
    is_mplayer,
    is_placeholder,
    little_to_big,
    monsndx,
    pm_resistance,
} from './mondata.js';
import { newMonster, mon_track_clear, place_monster } from './monst.js';
import { next_ident } from './obj.js';
import { discover_object } from './o_init.js';
import { BAG_OF_TRICKS } from './objects.js';
import { create_particular } from './read.js';
import { d, rn1, rn2, rnd } from './rng.js';
import {
    G_FREQ,
    G_HELL,
    G_NOGEN,
    G_NOHELL,
    G_UNIQ,
    G_IGNORE,
    LOW_PM,
    M1_AMORPHOUS,
    M1_FLY,
    M1_SWIM,
    M2_MINION,
    MR_COLD,
    MR_FIRE,
    MS_GUARDIAN,
    MS_LEADER,
    MS_NEMESIS,
    NON_PM,
    NUMMONS,
    PM_AIR_ELEMENTAL,
    PM_CLAY_GOLEM,
    PM_DEATH,
    PM_EARTH_ELEMENTAL,
    PM_ERINYS,
    PM_FAMINE,
    PM_FLESH_GOLEM,
    PM_FIRE_ELEMENTAL,
    PM_GIANT_EEL,
    PM_GLASS_GOLEM,
    PM_GOLD_GOLEM,
    PM_GRAY_DRAGON,
    PM_HIGH_CLERIC,
    PM_IRON_GOLEM,
    PM_KILLER_BEE,
    PM_LEATHER_GOLEM,
    PM_MAIL_DAEMON,
    PM_NAZGUL,
    PM_PAPER_GOLEM,
    PM_PESTILENCE,
    PM_QUEEN_BEE,
    PM_ROPE_GOLEM,
    PM_STONE_GOLEM,
    PM_STRAW_GOLEM,
    PM_WATER_ELEMENTAL,
    PM_WOOD_GOLEM,
    PM_WIZARD_OF_YENDOR,
    S_DRAGON,
    S_ELEMENTAL,
    S_EYE,
    S_GHOST,
    S_GOLEM,
    S_LICH,
    S_LIGHT,
    S_MIMIC_DEF,
    S_TRAPPER,
    S_VORTEX,
    SPECIAL_PM,
    monst_globals_init,
    monsterClassSymbol,
} from './monsters.js';
import { sensesMonster } from './startup_a11y.js';
import { MAXMCLASSES } from './symbols.js';
import { enexto } from './teleport.js';
import { ttyPline } from './tty_message.js';
import { note_unported } from './unported.js';
import { update_inventory } from './invent.js';
import { canseemon } from './vision.js';

function generationState(env = {}) {
    const state = env.state ?? game;
    if (!Array.isArray(state.mons) || state.mons.length <= SPECIAL_PM)
        throw new Error('monster generation requires monst_globals_init()');
    if (!Array.isArray(state.mvitals) || state.mvitals.length < SPECIAL_PM)
        throw new Error('monster generation requires initialized mvitals');
    return state;
}

function generationEnv(env = {}) {
    const state = generationState(env);
    const random = env.random ?? { d, rn1, rn2, rnd };
    // Every selection path needs rn2. rndmonnum's fallback can synthesize rn1
    // from it; a missing rnd is tolerated unless a path reaches mkclass(),
    // which requires it (including a rejected fixed Quest enemy's fallback).
    if (typeof random.rn2 !== 'function')
        throw new TypeError('monster random injection requires rn2');
    const randomOneBased = typeof random.rnd === 'function' ? random.rnd : null;
    const sourceRandom = {
        rn2: random.rn2,
        rn1: typeof random.rn1 === 'function'
            ? random.rn1
            : (range, base) => random.rn2(range) + base,
        rnd: randomOneBased,
        d: typeof random.d === 'function'
            ? random.d
            : randomOneBased && ((number, sides) => {
                let total = 0;
                for (let die = 0; die < number; ++die)
                    total += randomOneBased(sides);
                return total;
            }),
    };
    return { ...env, state, random: sourceRandom };
}

function hitPointEnv(env = {}) {
    const state = generationState(env);
    const random = env.random ?? { d, rnd };
    const randomOneBased = typeof random.rnd === 'function'
        ? random.rnd
        : null;
    return {
        ...env,
        state,
        random: {
            rnd: randomOneBased,
            d: typeof random.d === 'function'
                ? random.d
                : randomOneBased && ((number, sides) => {
                    let total = 0;
                    for (let die = 0; die < number; ++die)
                        total += randomOneBased(sides);
                    return total;
                }),
        },
    };
}

function currentSpecialLevel(state) {
    return state.specialLevels?.find(
        (candidate) => on_level(candidate.dlevel, state.u?.uz),
    ) ?? null;
}

function inHell(state) {
    const dnum = state.u?.uz?.dnum;
    return Number.isInteger(dnum)
        && Boolean(state.dungeons?.[dnum]?.flags?.hellish);
}

function inEndgame(state) {
    const astral = state.astral_level;
    return Number.isInteger(astral?.dlevel)
        && astral.dlevel > 0
        && state.u?.uz?.dnum === astral.dnum;
}

function isAstralLevel(state) {
    return on_level(state.u?.uz, state.astral_level);
}

function isRogueLevel(state) {
    return on_level(state.u?.uz, state.rogue_level);
}

function uncommon(index, state) {
    const monster = state.mons[index];
    if (monster.geno & (G_NOGEN | G_UNIQ)) return true;
    if (state.mvitals[index].mvflags & G_GONE) return true;
    if (inHell(state)) return monster.maligntyp > 0;
    return Boolean(monster.geno & G_HELL);
}

// C ref: makemon.c align_shift(). Returns a weight bonus for monsters whose
// alignment matches the current level's alignment. C caches the Is_special()
// lookup across calls within the same turn; the JS port recomputes it.
export function align_shift(monster, state) {
    const special = currentSpecialLevel(state);
    const alignment = special?.flags?.align
        ?? state.dungeons[state.u.uz.dnum].flags.align;
    switch (alignment) {
    case AM_LAWFUL:
        return Math.trunc((monster.maligntyp + 20) / (2 * ALIGNWEIGHT));
    case AM_NEUTRAL:
        return Math.trunc((20 - Math.abs(monster.maligntyp)) / ALIGNWEIGHT);
    case AM_CHAOTIC:
        return Math.trunc((20 - monster.maligntyp) / (2 * ALIGNWEIGHT));
    default:
        return 0;
    }
}

// C ref: makemon.c temperature_shift(). Returns a weight bonus for monsters
// that resist the level's temperature.
export function temperature_shift(monster, state) {
    const temperature = Math.trunc(state.level?.flags?.temperature ?? 0);
    if (!temperature) return 0;
    return pm_resistance(monster, temperature > 0 ? MR_FIRE : MR_COLD) ? 3 : 0;
}

// C ref: makemon.c is_home_elemental().
export function is_home_elemental(monster, state = game) {
    if (monster?.mlet !== S_ELEMENTAL) return false;
    switch (monster.pmidx) {
    case PM_AIR_ELEMENTAL:
        return on_level(state.u?.uz, state.air_level);
    case PM_FIRE_ELEMENTAL:
        return on_level(state.u?.uz, state.fire_level);
    case PM_EARTH_ELEMENTAL:
        return on_level(state.u?.uz, state.earth_level);
    case PM_WATER_ELEMENTAL:
        return on_level(state.u?.uz, state.water_level);
    default:
        return false;
    }
}

// C ref: makemon.c wrong_elem_type(). Returns true when the given monster
// species does not belong on the current elemental level. C declares this
// staticfn; exported here for direct testing.
export function wrong_elem_type(monster, state) {
    if (monster.mlet === S_ELEMENTAL)
        return !is_home_elemental(monster, state);
    if (on_level(state.u?.uz, state.earth_level)) return false;
    if (on_level(state.u?.uz, state.water_level))
        return !(monster.mflags1 & M1_SWIM);
    if (on_level(state.u?.uz, state.fire_level))
        return !(monster.mresists & MR_FIRE);
    if (on_level(state.u?.uz, state.air_level)) {
        const flyer = Boolean(monster.mflags1 & M1_FLY)
            && monster.mlet !== S_TRAPPER;
        const floater = monster.mlet === S_EYE || monster.mlet === S_LIGHT;
        const amorphous = Boolean(monster.mflags1 & M1_AMORPHOUS);
        const noncorporeal = monster.mlet === S_GHOST;
        const whirly = monster.mlet === S_VORTEX
            || monster.pmidx === PM_AIR_ELEMENTAL;
        return !(flyer || floater || amorphous || noncorporeal || whirly);
    }
    return false;
}

// C ref: makemon.c adj_lev().
export function adj_lev(monster, state = game) {
    if (monster.pmidx === PM_WIZARD_OF_YENDOR) {
        return Math.min(
            monster.mlevel + Math.trunc(state.mvitals[monster.pmidx].died ?? 0),
            49,
        );
    }
    let adjusted = Math.trunc(monster.mlevel);
    if (adjusted > 49) return 50;

    let difference = level_difficulty(state) - adjusted;
    if (difference < 0) --adjusted;
    else adjusted += Math.trunc(difference / 5);

    difference = Math.trunc(state.u.ulevel) - monster.mlevel;
    if (difference > 0) adjusted += Math.trunc(difference / 4);

    const upperLimit = Math.min(Math.trunc(3 * monster.mlevel / 2), 49);
    return Math.min(Math.max(adjusted, 0), upperLimit);
}

// C ref: makemon.c grow_up() (2049-2179). "monster earned experience and will
// gain some hit points; it might also grow into a bigger monster (baby to
// adult, soldier to officer, etc)".
//
// Partial: the `victim` arm, including the level gain at 2120 and the closing
// sanity limits. A monster whose raised maximum still fits inside its current
// level's hit-point ceiling returns at 2111, which is where an ordinary
// starting pet killing a level-0 monster lands; rnd() calls RND() even for
// x == 1 (rnd.c:163), so such a kill still spends a draw and records rnd(1)=1.
//
// C raises mhpmax before it tests the threshold, and its own comment at
// 2078-2081 calls the resulting level gain without a hit-point gain a possible
// bug. The write therefore sits above the threshold test, not below it.
//
// Two arms refuse:
//
//   2099-2106  the `!victim` arm, reached from a gain-level potion, a wraith
//              corpse and mdamagem()'s AD_DGST wraith case. It sets
//              hp_threshold to 0, so it always continues into the level gain
//              below; the refusal sits ahead of its own rnd(8).
//   2121-2163  the form change, entered only when the raised level reaches the
//              bigger species: set_mon_data(), the "grows up into" line, the
//              G_GENOD arm's mondied(), newsym() and the leashed-inventory
//              refresh. The level itself is already raised when this refuses,
//              because C increments inside the condition at 2120.
export function grow_up(mtmp, victim, env = {}) {
    const state = env.state ?? game;
    const random = env.random ?? { rn2, rnd };
    const unsupported = env.unsupported;
    if (typeof unsupported !== 'function')
        throw new TypeError('grow_up requires an unsupported operation');
    const ptr = mtmp.data;

    /* monster died after killing enemy but before calling this function */
    /* currently possible if killing a gas spore */
    if (mtmp.mhp < 1) return null; /* DEADMONSTER() */

    /* note:  none of the monsters with special hit point calculations
       have both little and big forms (killer bee can't grow into queen
       bee by just killing things, so isn't in the little_to_big list) */
    const oldtype = monsndx(ptr);
    const newtype = (oldtype === PM_KILLER_BEE && !victim)
        ? PM_QUEEN_BEE
        : little_to_big(oldtype);

    /* growth limits differ depending on method of advancement */
    if (!victim) unsupported('a monster gaining a level from no victim');

    /*
     * The HP threshold is the maximum number of hit points for the
     * current level; once exceeded, a level will be gained.
     */
    let hp_threshold = mtmp.m_lev * 8; /* normal limit */
    if (!mtmp.m_lev) hp_threshold = 4;
    else if (is_golem(ptr)) /* strange creatures */
        hp_threshold = (Math.trunc(mtmp.mhpmax / 10) + 1) * 10 - 1;
    else if (is_home_elemental(ptr, state)) hp_threshold *= 3;
    /* C truncates the product, not the halved level, so an odd species level
       keeps the extra half-step: 3 * 3 / 2 is 4 and not 3. */
    let lev_limit = Math.trunc(3 * ptr.mlevel / 2); /* same as adj_lev() */
    /* If they can grow up, be sure the level is high enough for that */
    if (oldtype !== newtype && state.mons[newtype].mlevel > lev_limit)
        lev_limit = state.mons[newtype].mlevel;
    /* number of hit points to gain; unlike for the player, we put
       the limit at the bottom of the next level rather than the top */
    let max_increase = random.rnd(victim.m_lev + 1);
    if (mtmp.mhpmax + max_increase > hp_threshold + 1)
        max_increase = Math.max((hp_threshold + 1) - mtmp.mhpmax, 0);
    const cur_increase = (max_increase > 1) ? random.rn2(max_increase) : 0;

    mtmp.mhpmax += max_increase;
    mtmp.mhp += cur_increase;
    if (mtmp.mhpmax <= hp_threshold)
        return ptr; /* doesn't gain a level */

    if (is_mplayer(ptr)) lev_limit = 30; /* same as player */
    else if (lev_limit < 5) lev_limit = 5; /* arbitrary */
    else if (lev_limit > 49) lev_limit = (ptr.mlevel > 49 ? 50 : 49);

    /* C evaluates the increment first, so every grower's level rises here,
       including one whose species has no bigger form. */
    if (++mtmp.m_lev >= state.mons[newtype].mlevel && newtype !== oldtype)
        unsupported('a monster growing into a bigger form');

    /* sanity checks */
    if (mtmp.m_lev > lev_limit) {
        mtmp.m_lev--; /* undo increment */
        /* HP might have been allowed to grow when it shouldn't */
        if (mtmp.mhpmax === hp_threshold + 1) mtmp.mhpmax--;
    }
    if (mtmp.mhpmax > 50 * 8) mtmp.mhpmax = 50 * 8; /* absolute limit */
    if (mtmp.mhp > mtmp.mhpmax) mtmp.mhp = mtmp.mhpmax;

    return ptr;
}

// C ref: makemon.c clone_mon(). Clones a monster, used for pudding splitting
// and similar effects. The clone gets half the parent's current HP; the parent
// keeps the extra point when HP is odd. Returns the clone or null on failure.
// Async because the tamedog path (for cloning a tame monster) is async.
export async function clone_mon(mon, x, y, state = game) {
    const mndx = monsndx(mon.data);

    /* may be too weak or have been extinguished for population control */
    if (mon.mhp <= 1
        || (state.mvitals[mndx].mvflags & G_EXTINCT) !== 0)
        return null;

    let mmx, mmy;
    if (x === 0) {
        mmx = mon.mx;
        mmy = mon.my;
    } else {
        mmx = x;
        mmy = y;
    }
    if (!isok(mmx, mmy)) { /* paranoia */
        note_unported('pline.c impossible');
        return null;
    }
    /* C: MON_AT(mm.x, mm.y) checks level.monsters[x][y] */
    if (state.level.monsters[mmx]?.[mmy]) {
        const coord = enexto(mmx, mmy, mon.data, { state });
        if (!coord || state.level.monsters[coord.x]?.[coord.y])
            return null;
        mmx = coord.x;
        mmy = coord.y;
    }

    /* C: m2 = newmonst(); *m2 = *mon; -- shallow copy of the monster */
    const m2 = { ...mon };
    /* mtrack is an array of objects; each clone needs its own copy */
    m2.mtrack = mon.mtrack
        ? mon.mtrack.map((t) => ({ ...t }))
        : Array.from({ length: 4 }, () => ({ x: 0, y: 0 }));
    m2.mgoal = { ...(mon.mgoal ?? { x: 0, y: 0 }) };
    m2.mextra = null;
    m2.nmon = state.level.monlist;
    state.level.monlist = m2;
    m2.m_id = next_ident({ state });
    m2.mx = mmx;
    m2.my = mmy;

    m2.mundetected = false;
    m2.mtrapped = false;
    m2.mcloned = true;
    m2.minvent = null; /* objects don't clone */
    m2.mw = null;
    m2.mleashed = false;
    /* Max HP the same, but current HP halved for both.  The caller
     * might want to override this by halving the max HP also.
     * When current HP is odd, the original keeps the extra point.
     * We know original has more than 1 HP, so both end up with at least 1.
     */
    m2.mhpmax = mon.mhpmax;
    m2.mhp = Math.trunc(mon.mhp / 2);
    mon.mhp -= m2.mhp;

    /* clone doesn't have mextra so mustn't retain special monster flags */
    m2.isshk = false;
    m2.isgd = false;
    m2.ispriest = false;
    /* ms->isminion handled below */

    /* clone shouldn't be reluctant to move on spots 'parent' just moved on */
    mon_track_clear(m2);

    place_monster(m2, m2.mx, m2.my, state);
    if (emits_light(m2.data)) {
        new_light_source(
            m2.mx, m2.my, emits_light(m2.data), LS_MONSTER, m2, state,
        );
    }
    /* if 'parent' is named, give the clone the same name */
    if (has_mgivenname(mon)) {
        christen_monst(m2, MGIVENNAME(mon));
    } else if (mon.isshk) {
        /* shkname() is from shknam.c and not ported; skip naming the clone */
        note_unported('shknam.c shkname');
    }

    /* not all clones caused by player are tame or peaceful */
    if (!state.context?.mon_moving && mon.mpeaceful) {
        if (mon.mtame)
            m2.mtame = rn2(Math.max(2 + state.u.uluck, 2)) ? mon.mtame : 0;
        else if (mon.mpeaceful)
            m2.mpeaceful = rn2(Math.max(2 + state.u.uluck, 2)) ? true : false;
    }
    /* if guardian angel could be cloned (maybe after polymorph?),
       m2 could be both isminion and mtame; isminion takes precedence */
    if (m2.isminion) {
        newemin(m2);
        if (has_emin(m2) && has_emin(mon)) {
            const src = EMIN(mon);
            const dst = EMIN(m2);
            dst.min_align = src.min_align;
            dst.renegade = src.renegade;
        }
        /* renegade when same alignment as hero but not peaceful or
           when peaceful while being different alignment from hero */
        const atyp = EMIN(m2).min_align;
        EMIN(m2).renegade = (atyp !== state.u.ualign.type) !== !m2.mpeaceful;
    } else if (m2.mtame) {
        /* Because m2 is a copy of mon it is tame but not init'ed.
           However, tamedog() will not re-tame a tame dog, so m2
           must be made non-tame to get initialized properly. */
        m2.mtame = 0;
        if (await tamedog(m2, null, false, { state })) {
            if (has_edog(m2) && has_edog(mon)) {
                const src = EDOG(mon);
                const dst = EDOG(m2);
                Object.assign(dst, src);
            }
        }
    }
    set_malign(m2, state);
    newsym(m2.mx, m2.my); /* display the new monster */

    return m2;
}

// C ref: makemon.c unmakemon(). Caller rejects makemon()'s result: decrement
// the birth count if appropriate, clear the unique-extinct flag for unique
// monsters, discard inventory and remove the monster from the game. Always
// returns null.
export function unmakemon(mon, mmflags, state = game) {
    const countbirth = (mmflags & MM_NOCOUNTBIRTH) === 0;
    const mndx = monsndx(mon.data);

    /* if count has reached the limit of 255, we don't know whether
       that just happened when creating this monster or the threshold
       had already been reached and further increments were suppressed;
       assume the latter */
    if (countbirth && state.mvitals[mndx].born > 0
        && state.mvitals[mndx].born < 255)
        state.mvitals[mndx].born -= 1;
    if ((mon.data.geno & G_UNIQ) !== 0)
        state.mvitals[mndx].mvflags &= ~G_EXTINCT;

    mon.mhp = 0; /* let discard_minvent() know that mon isn't being kept */
    /* uncreate any artifact that the monster was provided with; unlike
       mongone(), this doesn't protect special items like the Amulet
       by dropping them so caller should handle them when applicable */
    discard_minvent(mon, true, { state });

    mongone(mon, { state });
    return null;
}

// C ref: makemon.c mbirth_limit().
export function mbirth_limit(mndx) {
    if (mndx === PM_NAZGUL) return 9;
    if (mndx === PM_ERINYS) return 3;
    return MAXMONNO;
}

// C ref: makemon.c create_critters(). Creates cnt monsters around the hero's
// position; used by wand/scroll/spell of create monster. Returns true when the
// hero saw at least one monster appear. Async because the wizard-mode
// create_particular() path is async.
export async function create_critters(cnt, mptr, neverask, state = game) {
    let known = false;
    let ask = state.wizard && !neverask;

    while (cnt-- > 0) {
        if (ask) {
            if (await create_particular(state)) {
                known = true;
                continue;
            } else {
                ask = false; /* ESC will shut off prompting */
            }
        }
        let x = state.u.ux;
        let y = state.u.uy;
        /* if in water, try to encourage an aquatic monster
           by finding and then specifying another wet location */
        if (!mptr && state.u.uinwater) {
            const c = enexto(x, y, state.mons[PM_GIANT_EEL], { state });
            if (c) { x = c.x; y = c.y; }
        }

        const mon = makemon(mptr, x, y, NO_MM_FLAGS, { state });
        if (!mon) continue; /* try again */

        if ((canseemon(mon, state)
                && (M_AP_TYPE(mon) === M_AP_NOTHING
                    || M_AP_TYPE(mon) === M_AP_MONSTER))
            || sensesMonster(mon, state))
            known = true;
    }
    return known;
}

// C ref: makemon.c propagate(). Births can still be tallied after a species
// is gone; ghostly restoration alone suppresses a tally which cannot live.
export function propagate(mndx, tally, ghostly, env = {}) {
    const state = generationState(env);
    if (!Number.isInteger(mndx) || mndx < LOW_PM || mndx >= NUMMONS)
        throw new RangeError(`propagate: invalid monster index ${mndx}`);

    const monster = state.mons[mndx];
    const vital = state.mvitals[mndx];
    const limit = mbirth_limit(mndx);
    const gone = Boolean(vital.mvflags & G_GONE);
    const result = vital.born < limit && !gone;

    if ((monster.geno & G_UNIQ) && mndx !== PM_HIGH_CLERIC)
        vital.mvflags |= G_EXTINCT;
    if (vital.born < 255 && tally && (!ghostly || result)) ++vital.born;
    if (vital.born >= limit
        && !(monster.geno & G_NOGEN)
        && !(vital.mvflags & G_EXTINCT)) {
        vital.mvflags |= G_EXTINCT;
    }
    return result;
}

// C ref: makemon.c golemhp().
export function golemhp(mndx) {
    switch (mndx) {
    case PM_STRAW_GOLEM:
    case PM_PAPER_GOLEM:
        return 20;
    case PM_ROPE_GOLEM:
        return 30;
    case PM_LEATHER_GOLEM:
        return 40;
    case PM_GOLD_GOLEM:
        return 60;
    case PM_WOOD_GOLEM:
        return 50;
    case PM_FLESH_GOLEM:
        return 40;
    case PM_CLAY_GOLEM:
        return 70;
    case PM_STONE_GOLEM:
        return 100;
    case PM_GLASS_GOLEM:
        return 80;
    case PM_IRON_GOLEM:
        return 120;
    default:
        return 0;
    }
}

// C ref: makemon.c monhp_per_lvl(). HP gained per level for a drained or
// level-gaining monster. Similar to newmonhp but ignores home elementals and
// riders; riders use the normal d8.
export function monhp_per_lvl(mon, env = {}) {
    const state = env.state ?? game;
    const random = env.random ?? { rnd, rn2 };
    const ptr = mon.data;
    let hp = random.rnd(8); /* default is d8 */

    /* like newmonhp, but home elementals are ignored, riders use normal d8 */
    if (is_golem(ptr)) {
        /* draining usually won't be applicable for these critters */
        hp = Math.trunc(golemhp(monsndx(ptr)) / ptr.mlevel);
    } else if (ptr.mlevel > 49) {
        /* arbitrary; such monsters won't be involved in draining anyway */
        hp = 4 + random.rnd(4); /* 5..8 */
    } else if (ptr.mlet === S_DRAGON && monsndx(ptr) >= PM_GRAY_DRAGON) {
        /* adult dragons; newmonhp() uses In_endgame(&u.uz) ? 8 : 4 + rnd(4) */
        hp = 4 + random.rn2(5); /* 4..8 */
    } else if (!mon.m_lev) {
        /* level 0 monsters use 1d4 instead of Nd8 */
        hp = random.rnd(4);
    }
    return hp;
}

function isRider(mndx) {
    return mndx === PM_DEATH || mndx === PM_PESTILENCE || mndx === PM_FAMINE;
}

// C ref: makemon.c newmonhp().
export function newmonhp(mon, mndx, env = {}) {
    const { random, state } = hitPointEnv(env);
    if (!mon || typeof mon !== 'object')
        throw new TypeError('newmonhp requires a monster instance');
    if (!Number.isInteger(mndx) || mndx < LOW_PM || mndx >= NUMMONS)
        throw new RangeError(`newmonhp: invalid monster index ${mndx}`);

    const ptr = state.mons[mndx];
    let basehp = 0;
    mon.m_lev = adj_lev(ptr, state);
    if (ptr.mlet === S_GOLEM) {
        mon.mhpmax = mon.mhp = golemhp(mndx);
    } else if (isRider(mndx)) {
        basehp = 10;
        if (typeof random.d !== 'function')
            throw new TypeError('newmonhp requires d for Rider hit points');
        mon.mhpmax = mon.mhp = random.d(basehp, 8);
    } else if (ptr.mlevel > 49) {
        mon.mhpmax = mon.mhp = 2 * (ptr.mlevel - 6);
        mon.m_lev = Math.trunc(mon.mhp / 4);
    } else if (ptr.mlet === S_DRAGON && mndx >= PM_GRAY_DRAGON) {
        basehp = mon.m_lev;
        if (inEndgame(state)) {
            mon.mhpmax = mon.mhp = 8 * basehp;
        } else {
            if (typeof random.d !== 'function')
                throw new TypeError('newmonhp requires d for dragon hit points');
            mon.mhpmax = mon.mhp = 4 * basehp + random.d(basehp, 4);
        }
    } else if (!mon.m_lev) {
        basehp = 1;
        if (typeof random.rnd !== 'function')
            throw new TypeError('newmonhp requires rnd for level-zero hit points');
        mon.mhpmax = mon.mhp = random.rnd(4);
    } else {
        basehp = mon.m_lev;
        if (typeof random.d !== 'function')
            throw new TypeError('newmonhp requires d for ordinary hit points');
        mon.mhpmax = mon.mhp = random.d(basehp, 8);
        if (is_home_elemental(ptr, state))
            mon.mhpmax = (mon.mhp *= 3);
    }

    // If the roll equals basehp (all d8s rolled 1, or level-zero rnd(4)
    // rolled 1), raise both HP fields so levels zero and one start at 2.
    if (mon.mhpmax === basehp)
        mon.mhp = ++mon.mhpmax;
    return mon;
}

// C ref: makemon.c init_mextra(). Initializes an mextra record to zero values
// with mcorpsenm set to NON_PM. In JS the zero values come from the object
// literal; mcorpsenm is the only field that needs a non-zero default.
export function init_mextra(mex) {
    mex.mcorpsenm = NON_PM;
}

// C ref: makemon.c newmextra(). Allocates and initializes a new mextra record.
export function newmextra() {
    const mextra = {};
    init_mextra(mextra);
    return mextra;
}

// C ref: makemon.c peace_minded().
export function peace_minded(monster, env = {}) {
    const { random, state } = generationEnv(env);
    const mal = monster.maligntyp;
    const heroAlignment = state.u.ualign.type;

    if (always_peaceful(monster)) return true;
    if (always_hostile(monster)) return false;
    if (monster.msound === MS_LEADER || monster.msound === MS_GUARDIAN)
        return true;
    if (monster.msound === MS_NEMESIS) return false;
    if (monster.pmidx === PM_ERINYS) return !state.u.ualign.abuse;
    if (monster.mflags2 & (state.urace?.lovemask ?? 0)) return true;
    if (monster.mflags2 & (state.urace?.hatemask ?? 0)) return false;
    if (Math.sign(mal) !== Math.sign(heroAlignment)) return false;
    if (mal < A_NEUTRAL && state.u.uhave.amulet) return false;
    if (monster.mflags2 & M2_MINION)
        return state.u.ualign.record >= 0;

    const record = state.u.ualign.record;
    // Co-aligned monsters are more likely to be hostile when the hero has
    // strayed or the monster is weakly aligned.
    const alignmentRecordBound = 16 + (record < -15 ? -15 : record);
    return Boolean(random.rn2(alignmentRecordBound)
        && random.rn2(2 + Math.abs(mal)));
}

// C ref: makemon.c set_malign().
export function set_malign(mon, state = game) {
    if (!mon?.data)
        throw new TypeError('set_malign requires initialized monster data');
    // mon.malign is the base hero-alignment adjustment when this monster is
    // killed: positive is favorable and negative unfavorable. Kill handling
    // applies its other adjustments separately.
    let mal = mon.data.maligntyp;
    if (mon.ispriest || mon.isminion) {
        if (mon.ispriest && mon.mextra?.epri)
            mal = mon.mextra.epri.shralign;
        else if (mon.isminion && mon.mextra?.emin)
            mal = mon.mextra.emin.min_align;
        if (mal !== A_NONE) mal *= 5;
    }

    const coaligned = Math.sign(mal) === Math.sign(state.u.ualign.type);
    const absolute = Math.abs(mal);
    if (mon.data.msound === MS_LEADER) {
        mon.malign = -20;
    } else if (mal === A_NONE) {
        mon.malign = mon.mpeaceful ? 0 : 20;
    } else if (always_peaceful(mon.data)) {
        mon.malign = (mon.mpeaceful ? -3 : 3) * Math.max(5, absolute);
    } else if (always_hostile(mon.data)) {
        mon.malign = coaligned ? 0 : Math.max(5, absolute);
    } else if (coaligned) {
        mon.malign = mon.mpeaceful
            ? -3 * Math.max(3, absolute)
            : Math.max(3, absolute);
    } else {
        mon.malign = absolute;
    }
    return mon.malign;
}

// C ref: makemon.c mk_gen_ok(). Decides whether it's ok to generate a
// candidate monster by mkclass(). C declares this staticfn; exported here
// for direct testing and for mkclass_poly/summon_furies (same file).
export function mk_gen_ok(mndx, mvflagsmask, genomask, state) {
    const ptr = state.mons[mndx];
    if (state.mvitals[mndx].mvflags & mvflagsmask) return false;
    if (ptr.geno & genomask) return false;
    if (is_placeholder(ptr)) return false;
    // MAIL_STRUCTURES: reject mail daemon from random generation
    if (mndx === PM_MAIL_DAEMON) return false;
    return true;
}

// C ref: makemon.c cmp_init_mongen_order(). Comparison callback for sorting
// mongen_order by monster class (mlet) and difficulty.
function cmp_init_mongen_order(i1, i2, mons) {
    // offset1/offset2 are 0 in the released build (#if 0 block)
    const difficulty1 = mons[i1].difficulty | (mons[i1].mlet << 8);
    const difficulty2 = mons[i2].difficulty | (mons[i2].mlet << 8);
    return difficulty1 - difficulty2;
}

// C ref: makemon.c check_mongen_order(). Debug validation of sorted order,
// compiled only when NH_DEVEL_STATUS != NH_STATUS_RELEASED. The released
// build (NH_DEVEL_STATUS == NH_STATUS_RELEASED) omits this function entirely.
function check_mongen_order() {
    // No-op in the released build.
}

// C ref: makemon.c init_mongen_order(). Initializes the monster generation
// order table, sorting by class (mlet) and difficulty for mkclass().
// C stores mongen_order[], mclass_maxf[], and mongen_order_init as file-scoped
// statics; the JS port caches them on the game state object. Exported for
// direct testing.
export function init_mongen_order(state) {
    if (state._mongen_order) return;

    const mongen_order = new Array(NUMMONS);
    const mclass_maxf = new Array(MAXMCLASSES).fill(0);

    for (let i = LOW_PM; i < NUMMONS; i++) {
        mongen_order[i] = i;
        const mlet = state.mons[i].mlet;
        const freq = state.mons[i].geno & G_FREQ;
        if (freq > mclass_maxf[mlet]) mclass_maxf[mlet] = freq;
    }

    check_mongen_order();
    // Sort the first SPECIAL_PM entries by class and difficulty.
    // C uses qsort over mongen_order[0..SPECIAL_PM-1]; the patched build
    // applies a stable sort, matching JS Array.sort's guaranteed stability.
    const sortSlice = mongen_order.slice(0, SPECIAL_PM);
    sortSlice.sort((a, b) => cmp_init_mongen_order(a, b, state.mons));
    for (let i = 0; i < SPECIAL_PM; i++) mongen_order[i] = sortSlice[i];
    check_mongen_order();

    state._mongen_order = mongen_order;
    state._mclass_maxf = mclass_maxf;
}

// C ref: makemon.c dump_mongen(). Debug dump of the monster generation order
// table to stdout via raw_printf/raw_print. Called from earlyarg.c for the
// --mongen-dump command-line option.
function dump_mongen(state = game) {
    monst_globals_init(state);
    init_mongen_order(state);
    // The body formats and prints the sorted mongen_order table via
    // raw_printf/raw_print and references def_monsyms[] and monsdump[],
    // none of which are ported.
    note_unported('pline.c raw_printf');
    note_unported('alloc.c freedynamicdata');
}

// C ref: makemon.c mkclass(). Wrapper for mkclass_aligned with A_NONE.
export function mkclass(classSymbol, special = 0, env = {}) {
    return mkclass_aligned(classSymbol, special, A_NONE, env);
}

// C ref: makemon.c mkclass_aligned(). `special` contains mons[].geno bits
// exempted from normal rejection. G_IGNORE is a pseudo-flag: it disables the
// G_GONE mvitals check, then is removed before the geno mask is applied.
// `atyp` restricts selection to monsters whose alignment sign matches.
export function mkclass_aligned(classSymbol, special = 0, atyp = A_NONE,
    env = {}) {
    const normalized = generationEnv(env);
    const { random, state } = normalized;
    if (typeof random.rnd !== 'function')
        throw new TypeError('mkclass random injection requires rnd');
    if (!Number.isInteger(classSymbol)
        || classSymbol < 1 || classSymbol >= MAXMCLASSES) {
        return null;
    }

    init_mongen_order(state);
    const mongen_order = state._mongen_order;
    const zeroFrequencyForEntireClass = state._mclass_maxf[classSymbol] === 0;
    const nums = new Array(SPECIAL_PM + 1).fill(0);
    const maxLevel = Math.trunc(level_difficulty(state) / 2);
    const gehennom = inHell(state);

    // Find first entry in mongen_order where the class matches.
    let first;
    for (first = LOW_PM; first < SPECIAL_PM; first++) {
        if (state.mons[mongen_order[first]].mlet === classSymbol) break;
    }
    if (first === SPECIAL_PM) return null;

    let mvflagsMask = G_GONE;
    let specialMask = Math.trunc(special);
    if (specialMask & G_IGNORE) {
        mvflagsMask = 0;
        specialMask &= ~G_IGNORE;
    }

    let num = 0;
    let last;
    for (last = first;
        last < SPECIAL_PM && state.mons[mongen_order[last]].mlet === classSymbol;
        last++) {
        if (atyp !== A_NONE
            && sgn(state.mons[mongen_order[last]].maligntyp) !== sgn(atyp))
            continue;
        let genoMask = G_NOGEN | G_UNIQ;
        // rn2(9) is evaluated even for liches because it is the left operand.
        if (random.rn2(9) || classSymbol === S_LICH)
            genoMask |= gehennom ? G_NOHELL : G_HELL;
        genoMask &= ~specialMask;

        if (mk_gen_ok(mongen_order[last], mvflagsMask, genoMask, state)) {
            // C compares with the immediately preceding difficulty-sorted class
            // record, even when that record failed the generation filters above.
            if (num && state.mons[mongen_order[last]].difficulty > maxLevel
                && state.mons[mongen_order[last]].difficulty
                    > state.mons[mongen_order[last - 1]].difficulty
                && random.rn2(2)) {
                break;
            }
            let k = state.mons[mongen_order[last]].geno & G_FREQ;
            if (!k) k = zeroFrequencyForEntireClass ? 1 : 0;
            if (k > 0) {
                nums[mongen_order[last]] = k + 1 - Number(
                    adj_lev(state.mons[mongen_order[last]], state)
                        > state.u.ulevel * 2,
                );
                num += nums[mongen_order[last]];
            }
        }
    }
    if (!num) return null;

    let choice = random.rnd(num);
    for (let pos = first; pos < last; pos++) {
        choice -= nums[mongen_order[pos]];
        if (choice <= 0) {
            return nums[mongen_order[pos]]
                ? state.mons[mongen_order[pos]] : null;
        }
    }
    return null;
}

// C ref: makemon.c mkclass_poly(). Like mkclass(), but excludes difficulty
// considerations; used when a player with polycontrol picks a class instead
// of a specific type. Genocided types are avoided but extinct ones are
// acceptable. Iterates raw mons[] order (not mongen_order). Returns a
// monster index, not a permonst pointer.
export function mkclass_poly(classSymbol, env = {}) {
    const normalized = generationEnv(env);
    const { random, state } = normalized;

    let first;
    for (first = LOW_PM; first < SPECIAL_PM; first++)
        if (state.mons[first].mlet === classSymbol)
            break;
    if (first === SPECIAL_PM)
        return NON_PM;

    let gmask = G_NOGEN | G_UNIQ;
    // mkclass() does this on a per monster type basis, but doing that here
    // would make the two loops inconsistent with each other for non L.
    if (random.rn2(9) || classSymbol === S_LICH)
        gmask |= inHell(state) ? G_NOHELL : G_HELL;

    let num = 0;
    let last;
    for (last = first;
        last < SPECIAL_PM && state.mons[last].mlet === classSymbol;
        last++)
        if (mk_gen_ok(last, G_GENOD, gmask, state))
            num += state.mons[last].geno & G_FREQ;
    if (!num)
        return NON_PM;

    for (num = random.rnd(num); num > 0; first++)
        if (mk_gen_ok(first, G_GENOD, gmask, state))
            num -= state.mons[first].geno & G_FREQ;
    first--; // correct an off-by-one error

    return first;
}

// C ref: questpgr.c qt_montype().
export function qt_montype(env = {}) {
    const normalized = generationEnv(env);
    const { random, state } = normalized;
    const role = state.urole;
    if (!role) throw new Error('qt_montype requires role_init()');

    const useFirst = Boolean(random.rn2(5));
    const qpm = useFirst ? role.enemy1num : role.enemy2num;
    const monsterClass = useFirst ? role.enemy1sym : role.enemy2sym;
    if (qpm !== NON_PM && random.rn2(5)
        && !(state.mvitals[qpm].mvflags & G_GENOD)) {
        return state.mons[qpm];
    }
    return mkclass(monsterClass, 0, normalized);
}

// Weighted reservoir sampling is intentional. It consumes one rn2 call for
// every viable positive-weight candidate, in mons[] order; replacing it with
// a final weighted draw would select the same distribution but the wrong RNG.
export function rndmonst_adj(minadj = 0, maxadj = 0, env = {}) {
    const normalized = generationEnv(env);
    const { random, state } = normalized;
    if (state.u.uz.dnum === state.quest_dnum && random.rn2(7)) {
        const quest = qt_montype(normalized);
        if (quest) return quest;
    }

    const zlevel = level_difficulty(state);
    const minmlev = Math.trunc(zlevel / 6) + Math.trunc(minadj);
    const maxmlev = Math.trunc((zlevel + state.u.ulevel) / 2)
        + Math.trunc(maxadj);
    const uppercaseOnly = isRogueLevel(state);
    const elementalLevel = inEndgame(state) && !isAstralLevel(state);
    let totalWeight = 0;
    let selected = NON_PM;

    for (let index = LOW_PM; index < SPECIAL_PM; ++index) {
        const monster = state.mons[index];
        if (monster.difficulty < minmlev || monster.difficulty > maxmlev)
            continue;
        if (uppercaseOnly
            && !/^[A-Z]$/u.test(monsterClassSymbol(monster.mlet))) {
            continue;
        }
        if (elementalLevel && wrong_elem_type(monster, state)) continue;
        if (uncommon(index, state)) continue;
        if (inHell(state) && (monster.geno & G_NOHELL)) continue;

        let weight = (monster.geno & G_FREQ) + align_shift(monster, state);
        weight += temperature_shift(monster, state);
        if (weight < 0 || weight > 127) weight = 0;
        if (weight > 0) {
            totalWeight += weight;
            if (random.rn2(totalWeight) < weight) selected = index;
        }
    }
    if (selected === NON_PM || uncommon(selected, state)) return null;
    return state.mons[selected];
}

export function rndmonst(env = {}) {
    return rndmonst_adj(0, 0, env);
}

export function rndmonnum_adj(minadj = 0, maxadj = 0, env = {}) {
    const normalized = generationEnv(env);
    const selected = rndmonst_adj(minadj, maxadj, normalized);
    if (selected) return selected.pmidx;

    const excluded = G_UNIQ | G_NOGEN
        | (inHell(normalized.state) ? G_NOHELL : G_HELL);
    let index;
    do {
        index = normalized.random.rn1(SPECIAL_PM - LOW_PM, LOW_PM);
    } while (normalized.state.mons[index].geno & excluded);
    return index;
}

export function rndmonnum(env = {}) {
    return rndmonnum_adj(0, 0, env);
}

// C ref: makemon.c newmcorpsenm() (2370-2376). Allocates the mextra record
// if absent and initializes mcorpsenm to NON_PM. In the C source every call
// site immediately overwrites the field, so the NON_PM value is transient.
export function newmcorpsenm(mtmp) {
    if (!mtmp.mextra)
        mtmp.mextra = {};
    mtmp.mextra.mcorpsenm = NON_PM;
}

// C ref: makemon.c freemcorpsenm() (2377-2383), which C's own comment calls
// "basically a no-op": mextra.h keeps mcorpsenm inline rather than behind a
// pointer, so releasing the record means writing NON_PM back into it.
//
// mon.c seemimic() is the one caller here. It guards the call with
// has_mcorpsenm() exactly as this function does, so the guard is doubled the
// way C doubles it.
export function freemcorpsenm(mtmp) {
    if (has_mcorpsenm(mtmp))
        mtmp.mextra.mcorpsenm = NON_PM;
}

// C ref: makemon.c bagotricks() (2554-2601). Creates a monster when applying
// a bag of tricks (the `a` command) or tipping one (#tip). Consumes a charge
// and creates 1-8 monsters; returns { moncount, seecount } where moncount is
// the number of monsters created and seecount is the number the hero saw.
export async function bagotricks(bag, tipping, state = game) {
    let moncount = 0;
    let seecount_out = 0;

    if (!bag || bag.otyp !== BAG_OF_TRICKS) {
        // C: impossible("bad bag o' tricks") -- pline.c debug output
        note_unported('pline.c impossible');
    } else if (bag.spe < 1) {
        // C: pline1() is pline("%s", cstr)
        await ttyPline(
            (tipping && bag.cknown) ? "It's empty." : nothing_happens,
            state,
        );
        // Now known to be empty if sufficiently discovered
        if (bag.dknown && state.objects[bag.otyp].oc_name_known) {
            bag.cknown = 1;
            update_inventory({ state }); // for perm_invent
        }
    } else {
        let creatcnt = 1;
        let seecount = 0;

        // C: consume_obj_charge(bag, !tipping) -- invent.c, not ported.
        // Decrements bag->spe and optionally bills the hero.
        note_unported('invent.c consume_obj_charge');

        if (!rn2(23))
            creatcnt += rnd(7);
        do {
            const mtmp = makemon(null, state.u.ux, state.u.uy,
                NO_MM_FLAGS, { state });
            if (mtmp) {
                ++moncount;
                if ((canseemon(mtmp, state)
                        && (M_AP_TYPE(mtmp) === M_AP_NOTHING
                            || M_AP_TYPE(mtmp) === M_AP_MONSTER))
                    || sensesMonster(mtmp, state))
                    ++seecount;
            }
        } while (--creatcnt > 0);
        if (seecount) {
            seecount_out = seecount;
            if (bag.dknown) {
                // C: makeknown(BAG_OF_TRICKS) expands to
                // discover_object(BAG_OF_TRICKS, TRUE, TRUE, TRUE)
                discover_object(BAG_OF_TRICKS, true, true, true, state);
                update_inventory({ state }); // for perm_invent
            }
        } else if (!tipping) {
            await ttyPline(
                !moncount ? nothing_happens : nothing_seems_to_happen,
                state,
            );
        }
    }
    return { moncount, seecount: seecount_out };
}

// C ref: makemon.c summon_furies() (2605-2615). Creates some or all remaining
// Erinyes around the player. Called when the player angers the gods (e.g. via
// a helm of opposite alignment). Pass limit=0 to create until the species is
// extinct; pass limit=N to create at most N.
export function summon_furies(limit, state = game) {
    let i = 0;
    while (mk_gen_ok(PM_ERINYS, G_GONE, 0, state)
        && (i < limit || !limit)) {
        makemon(state.mons[PM_ERINYS], state.u.ux, state.u.uy,
            MM_ADJACENTOK | MM_NOWAIT, { state });
        i++;
    }
}
