// C ref: src/dokick.c. The kick-command functions include dokick() (1257-1470),
// the #kick command; kick_door() (908-970), the door arm of dokick()'s final
// pair; kick_nondoor() (974-1253), the terrain chain dokick() ends on; and
// kick_dumb() (863-878), the one arm of that chain the earlier goal reached,
// plus kickdmg() (34-123), maybe_kick_monster() (126-143), and
// kick_monster() (146-487).
//
// dokick() is a guard chain, a direction prompt, and five ordered tests over
// the target square -- monsters, pools, objects, non-doors, doors. Only the
// last of those five continues into kick_door() or kick_nondoor().
// kick_door() and kick_nondoor() follow every terrain branch in source
// order. Shop billing and town-watch callback calls retain named discarded
// gaps. Floor-object kicks share whole kick_object(), really_kick_object(),
// and ghitm() with gold throwing.
// Object shipping below ports drop_to(), impact_drop(), ship_object(),
// otransit_msg(), and down_gate(), shared by hero drops, throws, and monster
// missile settlement.

import { acurrstr, exercise, acurr, adjalign } from './attrib.js';
import { isok } from './cmd_isok.js';
import { getdir } from './cmd.js';
import {
    A_CHA, HALLUC, HALLUC_RES, LEG, OBJ_MINVENT, OBJ_MIGRATING, STATUE_TRAP, STONE_RES, WEB, ZAP_POS, KICKED_WEAPON, is_pit,
    A_LAWFUL,
    A_WIS,
    CORR,
    D_LOCKED,
    ER_NOTHING,
    FOOT,
    G_GONE,
    MM_ANGRY,
    MM_NOMSG,
    MM_MALE,
    MM_FEMALE,
    S_LPUDDING,
    S_LDWASHER,
    TREE_LOOTED,
    TREE_SWARM,
    A_CON,
    A_DEX,
    A_STR,
    BLINDED,
    D_BROKEN,
    D_ISOPEN,
    D_NODOOR,
    D_TRAPPED,
    DEAF,
    ECMD_CANCEL,
    ECMD_FAIL,
    ECMD_OK,
    ECMD_TIME,
    engulfing_u,
    HALF_PHDAM,
    Has_contents,
    CXN_PFX_THE,
    IRONBARS,
    IS_DRAWBRIDGE,
    IS_OBSTRUCTED,
    IS_ALTAR,
    IS_DOOR,
    IS_FOUNTAIN,
    IS_GRAVE,
    IS_SINK,
    IS_STWALL,
    IS_THRONE,
    IS_TREE,
    Is_airlevel,
    Is_waterlevel,
    KILLED_BY,
    LA_DOWN,
    LADDER,
    LAVAWALL,
    LEVITATION,
    PASSES_WALLS,
    FUMBLING,
    M_ATTK_DEF_DIED,
    M_ATTK_MISS,
    M_AP_TYPE,
    MIGR_NOWHERE,
    MIGR_RANDOM,
    MIGR_STAIRS_UP,
    MIGR_LADDER_UP,
    MIGR_SSTAIRS,
    MIGR_WITH_HERO,
    P_MARTIAL_ARTS,
    PL_NSIZ,
    P_NONE,
    RIGHT_SIDE,
    ROOM,
    SCORR,
    SDOOR,
    SHOPBASE,
    SLT_ENCUMBER,
    STAIRS,
    T_LOOTED,
    Upolyd,
    WOUNDED_LEGS,
    W_ARMF,
    M_AP_MONSTER,
    NO_TRAP_FLAGS,
    Trap_Killed_Mon,
    TRAPDOOR,
    is_hole,
    ismnum,
    something,
} from './const.js';
import { feel_location, feel_newsym, glyph_at, glyph_is_invisible,
    map_invisible, newsym, unmap_invisible } from './display.js';
import {
    flooreffects, legs_in_no_shape,
    set_wounded_legs,
} from './do.js';
import { del_engr_at, disturb_grave, u_wipe_engr } from './engrave.js';
import { Is_botlevel, dunlev, dunlevs_in_dungeon, on_level, surface } from './dungeon.js';
import { breaktest, hero_breaks, impact_disturbs_zombies, thitmonst, hurtle } from './dothrow.js';
import { game } from './gstate.js';
import { sgn, upstart } from './hacklib.js';
import { currency, money_cnt, obj_extract_self, obfree, stackobj, useup, sobj_at } from './invent.js';
import {
    in_town, inv_weight, losehp, near_capacity, overexertion, weight_cap,
} from './hack.js';
import {
    attacktype, bigmonst, can_teleport, haseyes, is_floater, is_flyer, is_giant,
    nohands, nolimbs, slithy, thick_skinned, verysmall,
    likes_gold, is_mercenary, mhis, poly_when_stoned, touch_petrifies,
} from './mondata.js';
import { abuse_dog } from './dog.js';
import {
    closed_door, monflee, set_apparxy, youHear,
} from './monmove.js';
import {
    killed, m_in_air, maybe_mnexto, maybe_unhide_at, seemimic, setmangry,
    angry_guards, wake_nearby, wake_nearto, wakeup,
} from './mon.js';
import { m_at, place_monster, remove_monster } from './monst.js';
import {
    PM_SOLDIER, PM_SERGEANT, PM_LIEUTENANT, PM_CAPTAIN, PM_STONE_GOLEM,
    PM_KILLER_BEE, PM_BLACK_PUDDING, PM_AMOROUS_DEMON,
    PM_ARCHEOLOGIST, PM_SAMURAI,
    AT_KICK, PM_SASQUATCH, PM_SHADE, S_EEL, S_LIZARD,
} from './monsters.js';
import {
    isBox, place_object, splitobj,
    dealloc_obj,
    mksobj,
    rnd_treefruit_at,
    add_to_migration,
    isContainer,
    mkgold,
    mksobj_at,
    objectType,
    rnd_class,
    weight,
} from './obj.js';
import {
    BAG_OF_HOLDING, BAG_OF_TRICKS, BOULDER, COIN_CLASS, CORPSE,
    DILITHIUM_CRYSTAL, EGG, EXPENSIVE_CAMERA, GEM_CLASS, GLASS,
    KICKING_BOOTS, LUCKSTONE, MIRROR, ROCK,
} from './objects.js';
import { An, corpse_xname, is_plural, otense, Tobjnam, xname, The, Doname2, donameFresh, distant_name, killer_xname, singular } from './objnam.js';
import { change_luck } from './moveloop_preamble.js';
import { encumber_msg } from './pickup.js';
import { ok_to_quest } from './quest.js';
import { d, rn1, rn2, rnd, rne, rnl } from './rng.js';
import { in_rooms } from './rooms.js';
import { obj_resists } from './bury.js';
import {
    addtobill, costly_adjacent, costly_gold, contained_gold, find_objowner, subfrombill,
    costly_spot, inside_shop, is_unpaid, picked_container, shop_keeper,
    stolen_value,
} from './shk.js';
import { shkname, Shknam } from './shknam.js';
import { stairway_at } from './stairs.js';
import { remove_worn_item } from './steal.js';
import {
    activate_statue_trap, chest_trap,
    b_trapped,
    fall_through,
    t_at,
} from './trap.js';
import { m_in_out_region } from './region.js';
import { mintrap } from './trap_effects.js';
import {
    displayPendingTtyMessageWindow,
    ttyNorep, ttyPline,
} from './tty_message.js';
import {
    find_drawbridge,
    is_drawbridge_wall,
    is_ice, is_pool,
} from './dbridge.js';

import { note_unported } from './unported.js';
import { cansee, recalc_block_point, unblock_point } from './vision.js';
import { martial_bonus, special_dmgval, use_skill } from './weapon.js';
import {
    attack_checks, check_caitiff, damageum, find_roll_to_hit,
    missum, mon_maybe_unparalyze, passive,
} from './uhitm.js';
import { a_monnam, hcolor, Monnam, mon_nam } from './do_name.js';
import { enexto, noteleport_level, goodpos } from './teleport.js';
import { canseemon, canspotmon } from './display.js';
import { stop_occupation } from './allmain.js';
import { cvt_sdoor_to_door } from './detect.js';
import { objectGenerationEnv } from './object_generation.js';
import { scatter, SCATTER_MAY_HIT, SCATTER_VIS_EFFECTS } from './explode.js';
import { sink_backs_up } from './fountain.js';
import { body_part, poly_gender, polymon } from './polyself.js';
import { makeplural } from './fruit.js';
import { bhit, miss } from './zap.js';
import { verbalize } from './pline.js';
import { mpickobj } from './steal.js';
import { finish_meating } from './dogmove.js';
import { hidden_gold } from './vault.js';
import { snuff_candle } from './apply_splash_lit.js';
import { breakchestlock } from './lock.js';
import { is_art, ART_MJOLLNIR } from './artifacts.js';
import { water_damage } from './trap_water_damage.js';
import { makemon_runtime } from './makemon_create.js';

// C ref: decl.h:507 `coord kickedloc`, the square the hero just kicked. Three
// C files write it directly: dokick.c:1325 sets it, and hack.c domove():2708
// and cmd.c rhack():3823 clear it. Its one reader is monmove.c
// m_avoid_kicked_loc(), which keeps a peaceful or tame neighbour off that
// square while it stands. The write lives here because dokick() is what gives
// the value meaning; the two clearing sites import this rather than spell the
// pair of zeroes out again, so no file can zero one coordinate and not the
// other.
export function clear_kickedloc(state = game) {
    state.gk ??= {};
    state.gk.kickedloc = { x: 0, y: 0 };
}

// A branch of dokick.c this port has not translated. js/cmd.js
// failClosedCommandRefusals() lists it, so the segment keeps every frame the
// command already matched instead of failing hard.
export class UnsupportedKickError extends Error {
    constructor(what) {
        super(`kicking reached an unported branch: ${what}`);
        this.name = 'UnsupportedKickError';
    }
}

// youprop.h:242 Levitation, which subtracts a blocking term. Spelled out here
// rather than imported for the reason js/trap.js states about its own copy:
// the macro reads three fields of one property, and each C file's port owns
// the macros its own functions read.
function Levitation(state) {
    const levitation = state.u.uprops[LEVITATION];
    return Boolean((levitation.intrinsic || levitation.extrinsic)
                   && !levitation.blocked);
}

// youprop.h:103 Blind, which subtracts a blocking term the two wounded-leg
// and wall-passing macros below do not have.
function Blind(state) {
    const blinded = state.u.uprops[BLINDED];
    return Boolean((blinded.intrinsic || blinded.extrinsic)
                   && !blinded.blocked);
}

// youprop.h:138 Wounded_legs, a plain OR with no blocked term: the intrinsic
// holds the recovery timeout and the extrinsic holds the side bits.
function Wounded_legs(state) {
    const wounded = state.u.uprops[WOUNDED_LEGS];
    return Boolean(wounded.intrinsic || wounded.extrinsic);
}

// youprop.h:286 Passes_walls, likewise a plain OR.
function Passes_walls(state) {
    const passes = state.u.uprops[PASSES_WALLS];
    return Boolean(passes.intrinsic || passes.extrinsic);
}

// youprop.h:125 Deaf. HDeaf || EDeaf || u.uroleplay.deaf. The third term is
// the permanent-deafness roleplay option, matching js/sit.js and js/dothrow.js.
function Deaf(state) {
    const value = state.u?.uprops?.[DEAF];
    return Boolean(value?.intrinsic || value?.extrinsic)
        || Boolean(state.u?.uroleplay?.deaf);
}

// C ref: dokick.c:8-10, the martial() macro over is_bigfoot() at :7. A Samurai
// or a Monk answers TRUE from martial_bonus() without either later term being
// read, which is what keeps kick_dumb()'s rn2(3) out of the stream for them.
function martial(state) {
    return martial_bonus(state)
        || state.youmonst?.data?.pmidx === PM_SASQUATCH
        || state.uarmf?.otyp === KICKING_BOOTS;
}

// youprop.h:129 Fumbling. Both intrinsic and extrinsic sources count, with
// no blocked term.
function Fumbling(state) {
    const fumbling = state.u?.uprops?.[FUMBLING];
    return Boolean(fumbling?.intrinsic || fumbling?.extrinsic);
}

function kickEnvironment(state) {
    state.context ??= {};
    const random = { d, rn1, rn2, rnd, rne, rnl };
    return {
        state,
        random,
        message: ttyPline,
        pline: ttyPline,
        unsupported: (what) => {
            throw new UnsupportedKickError(what);
        },
        nearCapacity: near_capacity,
        encumberMessage: encumber_msg,
        redraw: (x, y) => newsym(x, y),
        mInAir: m_in_air,
        heroDeaf: Deaf,
        youHear: (line, targetState) => youHear(line, targetState),
    };
}

// C ref: dokick.c kickdmg() (34-123). Damage for an ordinary, unpolymorphed
// kick, including pet abuse, martial-arts staggering, passive counterattack,
// and the trap-killed guard around killed().
export async function kickdmg(mon, clumsy, state = game) {
    const env = kickEnvironment(state);
    let mdx;
    let mdy;
    let dmg = Math.trunc(
        (acurrstr(state) + acurr(state, A_DEX) + acurr(state, A_CON)) / 15,
    );
    let kickSkill = P_NONE;
    let trapKilled = false;
    const boots = state.uarmf?.otyp === KICKING_BOOTS;
    const martialKick = martial(state);

    if (boots) dmg += 5;
    if (clumsy) dmg = Math.trunc(dmg / 2);
    if (thick_skinned(mon.data) || mon.data === state.mons?.[PM_SHADE])
        dmg = 0;

    const specialDmg = special_dmgval(
        state.youmonst, mon, W_ARMF, null, state, env,
    );
    if (mon.data === state.mons?.[PM_SHADE] && !specialDmg) {
        await ttyPline('The kick passes harmlessly through.', state);
        return;
    }

    if (M_AP_TYPE(mon)) seemimic(mon, state);
    await check_caitiff(mon, state, env);

    if (mon.mtame) {
        await abuse_dog(mon, state, env.random);
        if (mon.mtame)
            await monflee(mon, dmg ? rnd(dmg) : 1, false, false, env);
        else
            mon.mflee = 0;
    }

    if (dmg > 0) {
        dmg = rnd(dmg);
        if (martialKick) {
            if (dmg > 1) kickSkill = P_MARTIAL_ARTS;
            dmg += rn2(Math.trunc(acurr(state, A_DEX) / 2) + 1);
        }
        await exercise(A_DEX, true, state, env.random);
    }
    dmg += specialDmg;
    if (state.uarmf) dmg += state.uarmf.spe ?? 0;
    dmg += state.u?.udaminc ?? 0;
    if (dmg > 0) mon.mhp -= dmg;

    if (mon.mhp >= 1 && martialKick && !bigmonst(mon.data) && !rn2(3)
        && mon.mcanmove && mon !== state.u.ustuck && !mon.mtrapped) {
        mdx = mon.mx + state.u.dx;
        mdy = mon.my + state.u.dy;
        if (goodpos(mdx, mdy, mon, 0, env)) {
            await ttyPline(`${Monnam(mon, state)} reels from the blow.`, state);
            if (await m_in_out_region(mon, mdx, mdy, env)) {
                const oldX = mon.mx;
                const oldY = mon.my;
                remove_monster(oldX, oldY, state);
                newsym(oldX, oldY);
                place_monster(mon, mdx, mdy, state);
                newsym(mdx, mdy);
                set_apparxy(mon, env);
                if (await mintrap(mon, NO_TRAP_FLAGS, env)
                    === Trap_Killed_Mon)
                    trapKilled = true;
            }
        }
    }

    await passive(mon, state.uarmf, true, mon.mhp >= 1, AT_KICK, false,
        state, env);
    if (mon.mhp < 1 && !trapKilled)
        await killed(mon, state, env);
    if (kickSkill !== P_NONE) use_skill(kickSkill, 1, state);
}

// C ref: dokick.c maybe_kick_monster() (126-143). forcefight is scoped to
// attack_checks(), and the target is discarded when discovery, confirmation,
// or overexertion prevents the kick.
export async function maybe_kick_monster(mon, x, y, state = game) {
    if (!mon) return false;
    const env = kickEnvironment(state);
    state.gb ??= {};
    state.gb.bhitpos = { x, y };
    const saveForcefight = state.context?.forcefight;
    if (!mon.mpeaceful || !canspotmon(mon, state)) {
        state.context ??= {};
        state.context.forcefight = true;
    }
    try {
        const stopped = await attack_checks(mon, null, state, env);
        return !(stopped || await overexertion(state));
    } finally {
        state.context ??= {};
        state.context.forcefight = saveForcefight;
    }
}

// C ref: dokick.c kick_monster() (146-294). Resolve a kick against a monster,
// including polymorphed multiple kick attacks and the ordinary kick's weight,
// fumbling, block, evade, and damage branches.
export async function kick_monster(mon, x, y, state = game) {
    const env = kickEnvironment(state);
    const martialKick = martial(state);
    let clumsy = false;

    await setmangry(mon, true, env);

    if (Levitation(state) && !rn2(3) && verysmall(mon.data)
        && !is_flyer(mon.data)) {
        await ttyPline('Floating in the air, you miss wildly!', state);
        await exercise(A_DEX, false, state, env.random);
        await passive(mon, state.uarmf, false, true, AT_KICK, false, state, env);
        return;
    }

    if (mon.mundetected
        || (M_AP_TYPE(mon) && M_AP_TYPE(mon) !== M_AP_MONSTER)) {
        if (M_AP_TYPE(mon)) seemimic(mon, state);
        mon.mundetected = 0;
        if (!canspotmon(mon, state)) map_invisible(x, y, state);
        else newsym(x, y);
        await ttyPline(
            `There is ${canspotmon(mon, state) ? a_monnam(mon, { state })
                : 'something hidden'} here.`,
            state,
        );
    }

    if (Upolyd(state.u) && attacktype(state.youmonst.data, AT_KICK)) {
        const counters = { attknum: 0, role_roll_penalty: 0 };
        // find_roll_to_hit() mutates the pointer-shaped counters object.
        const hitRoll = await find_roll_to_hit(mon, AT_KICK, null, counters,
            state, env);
        mon_maybe_unparalyze(mon, env.random);
        for (const uattk of state.youmonst.data.mattk ?? []) {
            if (state.multi < 0) break;
            if (uattk.aatyp !== AT_KICK) continue;
            const dieroll = rnd(20);
            const specialDmg = special_dmgval(
                state.youmonst, mon, W_ARMF, null, state, env,
            );
            if (mon.data === state.mons?.[PM_SHADE] && !specialDmg) {
                await ttyPline(
                    `Your kick passes harmlessly through ${mon_nam(mon, state)}.`,
                    state,
                );
                break;
            }
            if (hitRoll > dieroll) {
                await ttyPline(`You kick ${mon_nam(mon, state)}.`, state);
                const sum = await damageum(mon, uattk, specialDmg, state, env);
                await passive(mon, state.uarmf, sum !== M_ATTK_MISS,
                    !(sum & M_ATTK_DEF_DIED), AT_KICK, false, state, env);
                if (sum & M_ATTK_DEF_DIED) break;
            } else {
                await missum(mon, uattk,
                    hitRoll + counters.role_roll_penalty > dieroll,
                    state, env);
                await passive(mon, state.uarmf, false, true, AT_KICK, false,
                    state, env);
            }
        }
        return;
    }

    const i = -inv_weight(state);
    const j = weight_cap(state);
    if (i < Math.trunc((j * 3) / 10)) {
        if (!rn2(i < Math.trunc(j / 10) ? 2
            : i < Math.trunc(j / 5) ? 3 : 4)) {
            if (martialKick) {
                clumsy = false;
            } else {
                await ttyPline('Your clumsy kick does no damage.', state);
                await passive(mon, state.uarmf, false, true, AT_KICK, false,
                    state, env);
                return;
            }
        } else if (i < Math.trunc(j / 10)) {
            clumsy = true;
        } else if (!rn2(i < Math.trunc(j / 5) ? 2 : 3)) {
            clumsy = true;
        }
    }

    if (Fumbling(state)) clumsy = true;
    else if (state.uarm && state.objects?.[state.uarm.otyp]?.oc_bulky
             && acurr(state, A_DEX) < rnd(25)) clumsy = true;

    await ttyPline(`You kick ${mon_nam(mon, state)}.`, state);
    if (!rn2(clumsy ? 3 : 4) && (clumsy || !bigmonst(mon.data))
        && mon.mcansee && !mon.mtrapped && !thick_skinned(mon.data)
        && mon.data.mlet !== S_EEL && haseyes(mon.data)
        && mon.mcanmove && !mon.mstun && !mon.mconf && !mon.msleeping
        && mon.data.mmove >= 12) {
        if (!nohands(mon.data) && !rn2(martialKick ? 5 : 3)) {
            await ttyPline(
                `${Monnam(mon, state)} blocks your ${clumsy ? 'clumsy ' : ''}kick.`,
                state,
            );
            await passive(mon, state.uarmf, false, true, AT_KICK, false, state, env);
            return;
        }
        await maybe_mnexto(mon, state, env);
        if (mon.mx !== x || mon.my !== y) {
            unmap_invisible(x, y, state);
            const movement = can_teleport(mon.data) && !noteleport_level(mon, state)
                ? 'teleports'
                : is_floater(mon.data) ? 'floats'
                    : is_flyer(mon.data) ? 'swoops'
                        : (nolimbs(mon.data) || slithy(mon.data)) ? 'slides'
                            : 'jumps';
            await ttyPline(
                `${Monnam(mon, state)} ${movement}, ${clumsy ? 'easily' : 'nimbly'} evading your ${clumsy ? 'clumsy ' : ''}kick.`,
                state,
            );
            await passive(mon, state.uarmf, false, true, AT_KICK, false, state, env);
            return;
        }
    }
    await kickdmg(mon, clumsy, state);
}

// C ref: dokick.c ghitm() (295-407). Gold remains the caller's object until
// mpickobj consumes it. The TRUE result prevents that caller placing it again.
export async function ghitm(monster, gold, state = game, rawEnv = {}) {
    const random = { d, rn1, rn2, rnd, rne, rnl, ...rawEnv.random };
    const message = rawEnv.planning ? async () => {} : (rawEnv.message ?? ttyPline);
    const env = { ...rawEnv, state, random, message };
    let messageGiven = false;
    if (!likes_gold(monster.data) && !monster.isshk && !monster.ispriest
        && !monster.isgd && !is_mercenary(monster.data)) {
        await wakeup(monster, true, env);
    } else if (!monster.mcanmove) {
        if (canseemon(monster, state)) {
            await message(`The ${xname(gold, state)} harmlessly ${otense(gold, 'hit', state)} ${mon_nam(monster, state)}.`, state, env);
            messageGiven = true;
        }
    } else {
        const wasSleeping = monster.msleeping;
        const value = gold.quan * objectType(gold, state).oc_cost;
        monster.msleeping = 0;
        finish_meating(monster, env);
        if (!monster.isgd && !random.rn2(4))
            await setmangry(monster, true, env);
        if (cansee(monster.mx, monster.my, state))
            await message(`${Monnam(monster, state)} ${wasSleeping ? 'awakens and ' : ''}catches the gold.`, state, env);
        mpickobj(monster, gold, env);
        gold = null;
        if (monster.isshk) {
            const eshk = monster.mextra.eshk;
            let robbed = eshk.robbed;
            if (robbed) {
                robbed = Math.max(0, robbed - value);
                await message(`The amount ${!robbed ? '' : 'partially '}covers ${mhis(monster, env)} recent losses.`, state, env);
                eshk.robbed = robbed;
                if (!robbed) note_unported('shk.c make_happy_shk');
            } else if (monster.mpeaceful) {
                eshk.credit += value;
                await message(`You have ${eshk.credit} ${currency(eshk.credit, state)} in credit.`, state, env);
            } else {
                await verbalize('Thanks, scum!', state, env);
            }
        } else if (monster.ispriest) {
            await verbalize(monster.mpeaceful ? 'Thank you for your contribution.' : 'Thanks, scum!', state, env);
        } else if (monster.isgd) {
            const money = money_cnt(state.invent);
            await verbalize(money ? 'Drop the rest and follow me.'
                : hidden_gold(true, state) ? 'You still have hidden gold.  Drop it now.'
                    : monster.mpeaceful ? "I'll take care of that; please move along."
                        : "I'll take that; now get moving.", state, env);
        } else if (is_mercenary(monster.data)) {
            const wasAngry = !monster.mpeaceful;
            let required = monster.data === state.mons[PM_SOLDIER] ? 100
                : monster.data === state.mons[PM_SERGEANT] ? 250
                    : monster.data === state.mons[PM_LIEUTENANT] ? 500
                        : monster.data === state.mons[PM_CAPTAIN] ? 750 : 0;
            if (required && random.rn2(3)) {
                const money = money_cnt(state.invent);
                required += Math.trunc((money + state.u.ulevel * random.rn2(5))
                    / acurr(state, A_CHA));
                if (value > required) monster.mpeaceful = true;
            }
            if (!monster.mpeaceful) {
                await verbalize(required ? "That's not enough, coward!"
                    : "I don't take bribes from scum like you!", state, env);
            } else if (wasAngry) {
                await verbalize('That should do.  Now beat it!', state, env);
            } else {
                await verbalize(`Thanks for the tip, ${state.flags.female ? 'lady' : 'buddy'}.`, state, env);
            }
        }
        // SetVoice is an empty macro in the reference sound build.
        return true;
    }
    if (!messageGiven) await miss(xname(gold, state), monster, state, env);
    return false;
}

// C ref: dokick.c kick_object() (489-503). This slot also lets done() find
// an object whose kick killed the hero; clear it only after normal completion.
export async function kick_object(x, y, kickName, state = game, rawEnv = {}) {
    kickName.value = '';
    state.gk ??= {};
    state.gk.kickedobj = state.level.objects[x][y];
    let result = 0;
    if (state.gk.kickedobj) {
        kickName.value = killer_xname(state.gk.kickedobj, state);
        result = await really_kick_object(x, y, state, rawEnv);
        state.gk.kickedobj = null;
    }
    return result;
}

// C ref: dokick.c really_kick_object() (508-790). Fragile objects break as
// a whole stack before splitobj; the returned Boolean controls dokick's ouch.
export async function really_kick_object(x, y, state = game, rawEnv = {}) {
    const random = { d, rn1, rn2, rnd, rne, rnl, ...rawEnv.random };
    const message = rawEnv.planning ? async () => {} : (rawEnv.message ?? ttyPline);
    const redraw = rawEnv.planning ? () => {}
        : (rawEnv.redraw ?? ((px, py) => newsym(px, py, state)));
    const env = objectGenerationEnv({ ...rawEnv, state, random, message, redraw });
    const u = state.u;
    const object = () => state.gk.kickedobj;
    if (!object() || object().otyp === BOULDER
        || object() === state.uball || object() === state.uchain) return 0;
    const trap = t_at(x, y, state);
    if (trap) {
        if ((is_pit(trap.ttyp) && !Passes_walls(state)) || trap.ttyp === WEB) {
            if (!trap.tseen) note_unported('detect.c find_trap');
            const hallu = u.uprops[HALLUC];
            const halluRes = u.uprops[HALLUC_RES];
            const hallucination = Boolean(hallu.intrinsic)
                && !(halluRes.intrinsic || halluRes.extrinsic);
            await message(`You can't kick something that's in a ${hallucination ? 'tizzy' : trap.ttyp === WEB ? 'web' : 'pit'}!`, state, env);
            return 1;
        }
        if (trap.ttyp === STATUE_TRAP) {
            await activate_statue_trap(trap, x, y, false, env);
            return 1;
        }
    }
    if (Fumbling(state) && !random.rn2(3)) {
        await message('Your clumsy kick missed.', state, env);
        return 1;
    }
    const stone = u.uprops[STONE_RES];
    if (!state.uarmf && object().otyp === CORPSE
        && touch_petrifies(state.mons[object().corpsenm])
        && !(stone.intrinsic || stone.extrinsic)) {
        await message(`You kick ${corpse_xname(object(), null, CXN_PFX_THE, state)} with your bare ${makeplural(body_part(FOOT, state.youmonst))}.`, state, env);
        if (!(poly_when_stoned(state.youmonst.data, state)
            && await polymon(PM_STONE_GOLEM, state, env))) {
            state.killer ??= {};
            state.killer.name = `kicking ${killer_xname(object(), state)} barefoot`;
            note_unported('trap.c instapetrify');
        }
    }
    const isGold = object().oclass === COIN_CLASS;
    let kickWeight = object().owt;
    if (object().quan > 1 && !isGold) {
        const quantity = object().quan;
        object().quan = 1;
        kickWeight = weight(object(), env);
        object().quan = quantity;
    }
    let range = Math.trunc(acurrstr(state) / 2) - Math.trunc(kickWeight / 40);
    if (martial(state)) range += random.rnd(3);
    let slide = false;
    if (is_pool(x, y, state)) {
        range = Math.trunc(range / 3) + 1;
    } else if (Is_airlevel(u.uz) || Is_waterlevel(u.uz)) {
        range += random.rnd(3);
    } else {
        if (is_ice(x, y, state)) { range += random.rnd(3); slide = true; }
        if (object().greased) { range += random.rnd(3); slide = true; }
    }
    if (is_art(object(), ART_MJOLLNIR)) range = 1;
    if (!isok(x + u.dx, y + u.dy)
        || !ZAP_POS(state.level.at(x + u.dx, y + u.dy).typ)
        || closed_door(x + u.dx, y + u.dy, state)) range = 1;
    const keeper = find_objowner(object(), x, y, state);
    let costly = Boolean(keeper && (costly_spot(x, y, state)
        || (costly_adjacent(keeper, x, y, state) && object().unpaid)));
    const kickLine = `You kick ${!isGold ? singular(object(), donameFresh, state) : donameFresh(object(), state)}.`;
    await (rawEnv.planning ? message : (rawEnv.norepMessage ?? rawEnv.message ?? ttyNorep))(kickLine, state, env);
    if (IS_OBSTRUCTED(state.level.at(x, y).typ) || closed_door(x, y, state)) {
        if ((!martial(state) && random.rn2(20) > acurr(state, A_DEX))
            || IS_OBSTRUCTED(state.level.at(u.ux, u.uy).typ)
            || closed_door(u.ux, u.uy, state)) {
            await message(Blind(state) ? "It doesn't come loose."
                : `${The(distant_name(object(), xname, state), state)} ${otense(object(), 'do', state)}n't come loose.`, state, env);
            return !random.rn2(3) || martial(state) ? 1 : 0;
        }
        await message(Blind(state) ? 'It comes loose.'
            : `${The(distant_name(object(), xname, state), state)} ${otense(object(), 'come', state)} loose.`, state, env);
        obj_extract_self(object(), env);
        redraw(x, y);
        if (costly && (!costly_spot(u.ux, u.uy, state)
            || !u.urooms.includes(in_rooms(x, y, SHOPBASE, state)[0]))) {
            if (!object().no_charge) await addtobill(object(), false, false, false, state, env);
            else object().no_charge = 0;
        }
        if (!await flooreffects(object(), u.ux, u.uy, 'fall', env)) {
            place_object(object(), u.ux, u.uy, env);
            impact_disturbs_zombies(object(), true, state);
            stackobj(object(), env);
            redraw(u.ux, u.uy);
        }
        return 1;
    }
    if (isBox(object())) {
        const trapped = object().otrapped;
        if (range < 2) await message('THUD!', state, env);
        await container_impact_dmg(object(), x, y, env);
        if (object().olocked) {
            if (!random.rn2(5) || (martial(state) && !random.rn2(2))) {
                await message('You break open the lock!', state, env);
                await breakchestlock(object(), false, state);
                if (trapped) await chest_trap(object(), LEG, false, state);
                return 1;
            }
        } else if (!random.rn2(3) || (martial(state) && !random.rn2(2))) {
            await message('The lid slams open, then falls shut.', state, env);
            object().lknown = 1;
            if (trapped) await chest_trap(object(), LEG, false, state);
            return 1;
        }
        if (range < 2) return 1;
    }
    if (await hero_breaks(object(), object().ox, object().oy, 0, env)) return 1;
    if (range < 2) {
        if (!isBox(object())) await message('Thump!', state, env);
        return !random.rn2(3) || martial(state) ? 1 : 0;
    }
    if (object().quan > 1) {
        if (!isGold) {
            state.gk.kickedobj = splitobj(object(), 1, env);
        } else {
            if (random.rn2(20)) {
                if (!Deaf(state)) await message('Thwwpingg!', state, env);
                const messages = ['scatter the coins', 'knock coins all over the place', 'send coins flying in all directions'];
                await message(`You ${messages[random.rn2(messages.length)]}!`, state, env);
                await scatter(x, y, random.rnd(3), SCATTER_VIS_EFFECTS | SCATTER_MAY_HIT, object(), state, env);
                redraw(x, y);
                return 1;
            }
            if (object().quan > 300) {
                await message('Thump!', state, env);
                return !random.rn2(3) || martial(state) ? 1 : 0;
            }
        }
    }
    if (slide && !Blind(state))
        await message(`Whee!  ${Doname2(object(), state)} ${otense(object(), 'slide', state)} across the ${surface(x, y, state)}.`, state, env);
    obj_extract_self(object(), env);
    await snuff_candle(object(), env);
    redraw(x, y);
    const ref = { obj: object() };
    const monster = await bhit(u.dx, u.dy, range, KICKED_WEAPON, null, null, ref, state, random, env);
    if (!object()) return 1;
    if (monster) {
        if (monster.isshk && object().where === OBJ_MINVENT && object().ocarry === monster) return 1;
        state.gn.notonhead = monster.mx !== state.gb.bhitpos.x || monster.my !== state.gb.bhitpos.y;
        if (isGold ? await ghitm(monster, object(), state, env)
            : await thitmonst(monster, object(), state, env)) return 1;
    }
    if (object().where === OBJ_MIGRATING) return 1;
    const end = state.gb.bhitpos;
    const room = in_rooms(end.x, end.y, SHOPBASE, state)[0];
    if (costly && (!costly_spot(end.x, end.y, state)
        || in_rooms(x, y, SHOPBASE, state)[0] !== room)) {
        if (isGold) await costly_gold(x, y, object().quan, false, state, env);
        else await stolen_value(object(), x, y, Boolean(keeper.mpeaceful), false, state);
        costly = false;
    }
    if (await flooreffects(object(), end.x, end.y, 'fall', env)) return 1;
    if (costly) {
        if (object().unpaid) subfrombill(object(), keeper, state, env);
        if (Has_contents(object()) && contained_gold(object(), true) > 0)
            note_unported('shk.c donate_gold');
    }
    place_object(object(), end.x, end.y, env);
    impact_disturbs_zombies(object(), true, state);
    stackobj(object(), env);
    redraw(object().ox, object().oy);
    return 1;
}

// C ref: dokick.c kick_dumb() (863-878). Kicking at something that does not
// resist: empty floor, an open doorway, a down staircase, a levitating hero's
// throne, altar, fountain, grave or sink.
async function kick_dumb(x, y, state) {
    const u = state.u;
    // 866. A_DEX never reaches exercise()'s trailing encumber_msg(), which C
    // runs for Strength and Constitution only, so this call owns no message.
    await exercise(A_DEX, false, state, { rn2 });
    // 867. martial() and the Dexterity test are both short circuits: a martial
    // hero, and an ordinary one with 16 or more Dexterity, draw no rn2(3) at
    // all. Getting that wrong changes the stream rather than the message.
    if (martial(state) || acurr(state, A_DEX) >= 16 || rn2(3)) {
        await ttyPline('You kick at empty space.', state);
        if (Blind(state)) feel_location(x, y, state);
    } else {
        await ttyPline('Dumb move!  You strain a muscle.', state);
        await exercise(A_STR, false, state, { rn2 },
                       { encumberMessage: encumber_msg });
        // 874. C evaluates rnd(5) before adding, so the draw precedes the
        // write set_wounded_legs() makes.
        await set_wounded_legs(RIGHT_SIDE, 5 + rnd(5), state);
    }
    // 876-877. C short-circuits the roll off the air level; otherwise one
    // rn2(2) decides whether this empty kick sends the hero backward.
    if ((Is_airlevel(u.uz) || Levitation(state)) && rn2(2))
        await hurtle(-u.dx, -u.dy, 1, true, state);
}

// C ref: hack.h Maybe_Half_Phys(), used by dokick.c kick_ouch() at :903.
// Half physical damage has no blocking term: either intrinsic or extrinsic
// Half_physical_damage halves the odd damage with C integer arithmetic.
function Maybe_Half_Phys(dmg, state) {
    const halfPhysical = state.u?.uprops?.[HALF_PHDAM];
    return (halfPhysical?.intrinsic || halfPhysical?.extrinsic)
        ? Math.trunc((dmg + 1) / 2) : dmg;
}

// C ref: dokick.c kickstr() (794-830). The killer string is selected from the
// object name when one exists; otherwise it describes the square saved by
// dokick(). `maploc === null` is the JavaScript representation of C's
// gn.nowhere square for an off-map kick.
export function kickstr(maploc, kickobjnam, state = game) {
    let what;

    if (kickobjnam) {
        what = kickobjnam;
    } else if (!maploc) {
        what = 'nothing';
    } else if (IS_DOOR(maploc.typ)) {
        what = 'a door';
    } else if (IS_TREE(maploc.typ, state)) {
        what = 'a tree';
    } else if (IS_STWALL(maploc.typ)) {
        what = 'a wall';
    } else if (IS_OBSTRUCTED(maploc.typ)) {
        what = 'a rock';
    } else if (IS_THRONE(maploc.typ)) {
        what = 'a throne';
    } else if (IS_FOUNTAIN(maploc.typ)) {
        what = 'a fountain';
    } else if (IS_GRAVE(maploc.typ)) {
        what = 'a headstone';
    } else if (IS_SINK(maploc.typ)) {
        what = 'a sink';
    } else if (IS_ALTAR(maploc.typ)) {
        what = 'an altar';
    } else if (IS_DRAWBRIDGE(maploc.typ)) {
        what = 'a drawbridge';
    } else if (maploc.typ === STAIRS) {
        what = 'the stairs';
    } else if (maploc.typ === LADDER) {
        what = 'a ladder';
    } else if (maploc.typ === IRONBARS) {
        what = 'an iron bar';
    } else {
        what = 'something weird';
    }
    return `kicking ${what}`;
}

// C ref: dokick.c kick_ouch() (881-906). This helper is shared by the wall
// and upward-stairs arm of kick_nondoor(), plus the levitating-door arm.
async function kick_ouch(x, y, kickobjnam, state) {
    const u = state.u;
    let maploc = isok(x, y) ? state.level.at(x, y) : null;

    await ttyPline('Ouch!  That hurts!', state);
    await exercise(A_DEX, false, state, { rn2 });
    await exercise(A_STR, false, state, { rn2 },
                   { encumberMessage: encumber_msg });
    if (isok(x, y)) {
        if (Blind(state)) feel_location(x, y, state);
        if (is_drawbridge_wall(x, y, state) >= 0) {
            await ttyPline('The drawbridge is unaffected.', state);
            const position = { x, y };
            find_drawbridge(position, state);
            ({ x, y } = position);
            maploc = state.level.at(x, y);
        }
        await wake_nearto(x, y, 5 * 5, { state });
    }
    if (!rn2(3))
        await set_wounded_legs(RIGHT_SIDE, 5 + rnd(5), state);
    const dmg = rnd(acurr(state, A_CON) > 15 ? 3 : 5);
    await losehp(Maybe_Half_Phys(dmg, state), kickstr(maploc, kickobjnam,
        state), KILLED_BY, state);
    if (Is_airlevel(u.uz) || Levitation(state))
        await hurtle(-u.dx, -u.dy, rn1(2, 4), true, state);
}

// C ref: dokick.c kick_door() (910-970). Door changes precede redraw,
// vision recalculation, shop billing and town-watch callbacks.
export async function kick_door(x, y, avrg_attrib, state = game) {
    const maploc = state.level.at(x, y);
    const mask = maploc.flags || maploc.doormask || 0;
    if (mask === D_ISOPEN || mask === D_BROKEN || mask === D_NODOOR) {
        await kick_dumb(x, y, state);
        return;
    }
    if (Levitation(state)) {
        await kick_ouch(x, y, '', state);
        return;
    }
    await exercise(A_DEX, true, state, { rn2 });
    const doorbuster = Upolyd(state.u) && is_giant(state.youmonst?.data);
    if (doorbuster || rnl(35) < avrg_attrib
        + (martial(state) ? acurr(state, A_DEX) : 0)) {
        const shopdoor = in_rooms(x, y, SHOPBASE, state).length > 0;
        if (mask & D_TRAPPED) {
            if (state.flags.verbose) await ttyPline('You kick the door.', state);
            await exercise(A_STR, false, state, { rn2 },
                { encumberMessage: encumber_msg });
            maploc.flags = maploc.doormask = D_NODOOR;
            await b_trapped('door', FOOT, state);
        } else if (acurr(state, A_STR) > 18 && !rn2(5) && !shopdoor) {
            await ttyPline('As you kick the door, it shatters to pieces!', state);
            await exercise(A_STR, true, state, { rn2 },
                { encumberMessage: encumber_msg });
            maploc.flags = maploc.doormask = D_NODOOR;
        } else {
            await ttyPline('As you kick the door, it crashes open!', state);
            await exercise(A_STR, true, state, { rn2 },
                { encumberMessage: encumber_msg });
            maploc.flags = maploc.doormask = D_BROKEN;
        }
        feel_newsym(x, y, state);
        recalc_block_point(x, y, state);
        if (shopdoor) {
            note_unported('shk.c add_damage');
            note_unported('shk.c pay_for_damage');
        }
        if (in_town(x, y, state))
            note_unported('mon.c get_iter_mons watchman_thief_arrest');
    } else {
        if (Blind(state)) feel_location(x, y, state);
        await exercise(A_STR, true, state, { rn2 },
            { encumberMessage: encumber_msg });
        await ttyPline(`${Deaf(state) || !rn2(3) ? 'Thwack' : 'Whammm'}!!`, state);
        if (in_town(x, y, state))
            note_unported('mon.c get_iter_mons_xy watchman_door_damage');
    }
}

// C ref: dokick.c kick_nondoor() (974-1256). Its terrain arms share
// dokick()'s attribute average and always return ECMD_TIME.
export async function kick_nondoor(x, y, avrg_attrib, state = game) {
    const maploc = state.level.at(x, y);
    const random = { d, rn1, rn2, rnd, rne, rnl };
    const objects = objectGenerationEnv({ state, random });
    if (maploc.typ === SDOOR) {
        if (!Levitation(state) && rn2(30) < avrg_attrib) {
            cvt_sdoor_to_door(maploc, state);
            const mask = maploc.flags;
            await ttyPline(`Crash!  ${(mask & (D_LOCKED | D_TRAPPED))
                === D_LOCKED ? 'Your kick uncovers' : 'You kick open'} a secret door!`, state);
            await exercise(A_DEX, true, state, random);
            if (mask & D_TRAPPED) {
                maploc.flags = maploc.doormask = D_NODOOR;
                await b_trapped('door', FOOT, state);
            } else if (mask !== D_NODOOR && !(mask & D_LOCKED)) {
                maploc.flags = maploc.doormask = D_ISOPEN;
            }
            feel_newsym(x, y, state);
            if (maploc.flags === D_ISOPEN || maploc.flags === D_NODOOR)
                unblock_point(x, y, state);
        } else {
            await kick_ouch(x, y, '', state);
        }
        return ECMD_TIME;
    }
    if (maploc.typ === SCORR) {
        if (!Levitation(state) && rn2(30) < avrg_attrib) {
            await ttyPline('Crash!  You kick open a secret passage!', state);
            await exercise(A_DEX, true, state, random);
            maploc.typ = CORR;
            feel_newsym(x, y, state);
            unblock_point(x, y, state);
        } else {
            await kick_ouch(x, y, '', state);
        }
        return ECMD_TIME;
    }
    if (IS_THRONE(maploc.typ)) {
        const luck = (state.u.uluck ?? 0) + (state.u.moreluck ?? 0);
        if (Levitation(state)) {
            await kick_dumb(x, y, state);
            return ECMD_TIME;
        }
        if ((luck < 0 || maploc.flags) && !rn2(3)) {
            maploc.flags = 0;
            maploc.typ = ROOM;
            mkgold(rnd(200), x, y, objects);
            if (Blind(state)) {
                await ttyPline('CRASH!  You destroy it.', state);
            } else {
                await ttyPline('CRASH!  You destroy the throne.', state);
                newsym(x, y, state);
            }
            await exercise(A_DEX, true, state, random);
            return ECMD_TIME;
        }
        if (luck > 0 && !rn2(3) && !maploc.flags) {
            mkgold(rn1(201, 300), x, y, objects);
            const gems = Math.min(luck + 1, 6);
            for (let i = gems; i > 0; --i) {
                const gem = rnd_class(
                    DILITHIUM_CRYSTAL,
                    LUCKSTONE - 1,
                    objects,
                );
                mksobj_at(gem, x, y, false, true, objects);
            }
            await ttyPline(
                Blind(state)
                    ? `You kick ${something} loose!`
                    : 'You kick loose some ornamental coins and gems!',
                state,
            );
            if (!Blind(state)) newsym(x, y, state);
            maploc.flags = T_LOOTED;
            return ECMD_TIME;
        }
        if (!rn2(4)) {
            if (dunlev(state.u.uz) < dunlevs_in_dungeon(state.u.uz, state)) {
                await fall_through(false, 0, state);
                return ECMD_TIME;
            }
            await kick_ouch(x, y, '', state);
            return ECMD_TIME;
        }
        await kick_ouch(x, y, '', state);
        return ECMD_TIME;
    }
    if (IS_ALTAR(maploc.typ)) {
        if (Levitation(state)) {
            await kick_dumb(x, y, state);
            return ECMD_TIME;
        }
        await ttyPline(
            `You kick ${Blind(state) ? something : 'the altar'}.`,
            state,
        );
        const { altar_wrath } = await import('./pray.js');
        await altar_wrath(x, y, state);
        if (!rn2(3)) {
            await kick_ouch(x, y, '', state);
            return ECMD_TIME;
        }
        await exercise(A_DEX, true, state, random);
        return ECMD_TIME;
    }
    if (IS_FOUNTAIN(maploc.typ)) {
        if (Levitation(state)) {
            await kick_dumb(x, y, state);
            return ECMD_TIME;
        }
        await ttyPline(`You kick ${Blind(state) ? something : 'the fountain'}.`, state);
        if (!rn2(3)) {
            await kick_ouch(x, y, '', state);
            return ECMD_TIME;
        }
        if (state.uarmf && rn2(3)
            && await water_damage(state.uarmf, 'metal boots', true, { state, random })
                === ER_NOTHING) {
            await ttyPline('Your boots get wet.', state);
        }
        await exercise(A_DEX, true, state, random);
        return ECMD_TIME;
    }
    if (IS_GRAVE(maploc.typ)) {
        if (Levitation(state)) {
            await kick_dumb(x, y, state);
            return ECMD_TIME;
        }
        if (rn2(4)) {
            await kick_ouch(x, y, '', state);
            return ECMD_TIME;
        }
        if (!maploc.horizontal && !rn2(2)) {
            await disturb_grave(x, y, state);
            return ECMD_TIME;
        }
        await exercise(A_WIS, false, state, random);
        if (state.urole.mnum === PM_ARCHEOLOGIST
            || state.urole.mnum === PM_SAMURAI
            || (state.u.ualign.type === A_LAWFUL && state.u.ualign.record > -10))
            adjalign(-sgn(state.u.ualign.type), state);
        maploc.typ = ROOM;
        maploc.flags = 0; // C emptygrave aliases rm.flags.
        maploc.horizontal = false;
        mksobj_at(ROCK, x, y, true, false, objects);
        del_engr_at(x, y, state);
        if (Blind(state)) {
            await ttyPline('Crack!  Something broke!', state);
        } else {
            await ttyPline('The headstone topples over and breaks!', state);
            newsym(x, y, state);
        }
        return ECMD_TIME;
    }
    if (maploc.typ === IRONBARS) {
        await kick_ouch(x, y, '', state);
        return ECMD_TIME;
    }
    // 1135. An arboreal level makes STONE a tree, and this test precedes the
    // IS_STWALL() one below that would otherwise claim the same square.
    if (IS_TREE(maploc.typ, state)) {
        if (rn2(3)) {
            if (!rn2(6) && !(state.mvitals[PM_KILLER_BEE].mvflags & G_GONE)) {
                const heard = youHear('a low buzzing.', state);
                if (heard) await ttyPline(heard, state);
            }
            await kick_ouch(x, y, '', state);
            return ECMD_TIME;
        }
        let treefruit;
        if (rn2(15) && !(maploc.flags & TREE_LOOTED)
            && (treefruit = rnd_treefruit_at(x, y, objects))) {
            const nfruit = 8 - rnl(7);
            const frtype = treefruit.otyp;
            treefruit.quan = nfruit;
            treefruit.owt = weight(treefruit, objects);
            await ttyPline(is_plural(treefruit, state)
                ? `Some ${xname(treefruit, state)} fall from the tree!`
                : `${An(xname(treefruit, state))} falls from the tree!`, state);
            const nfall = await scatter(x, y, 2, SCATTER_MAY_HIT, treefruit, state, {
                stopOccupation: subject => stop_occupation(subject, { message: ttyPline }),
                exercise: (attribute, increase, subject) => exercise(
                    attribute, increase, subject, random,
                    { encumberMessage: encumber_msg },
                ),
            });
            if (nfall !== nfruit) {
                treefruit = mksobj(frtype, true, false, objects);
                treefruit.quan = nfruit - nfall;
                await ttyPline(`${nfruit - nfall} ${xname(treefruit, state)} got caught in the branches.`, state);
                dealloc_obj(treefruit, objects);
            }
            await exercise(A_DEX, true, state, random);
            await exercise(A_WIS, true, state, random);
            newsym(x, y, state);
            maploc.flags |= TREE_LOOTED;
            return ECMD_TIME;
        } else if (!(maploc.flags & TREE_SWARM)) {
            let cnt = rnl(4) + 2;
            let made = 0;
            let mm = { x, y };
            while (cnt--) {
                const nearby = enexto(mm.x, mm.y, state.mons[PM_KILLER_BEE], { state });
                if (nearby) {
                    mm = nearby;
                    if (await makemon_runtime(state.mons[PM_KILLER_BEE], mm.x, mm.y,
                        MM_ANGRY | MM_NOMSG, { state })) made++;
                }
            }
            await ttyPline(made ? "You've attracted the tree's former occupants!"
                : 'You smell stale honey.', state);
            maploc.flags |= TREE_SWARM;
            return ECMD_TIME;
        }
        await kick_ouch(x, y, '', state);
        return ECMD_TIME;
    }
    if (IS_SINK(maploc.typ)) {
        const gend = poly_gender(state);
        if (Levitation(state)) {
            await kick_dumb(x, y, state);
            return ECMD_TIME;
        }
        if (rn2(5)) {
            await ttyPline(Deaf(state) ? 'Klunk!' : 'Klunk!  The pipes vibrate noisily.', state);
            await exercise(A_DEX, true, state, random);
            return ECMD_TIME;
        } else if (!(maploc.flags & S_LPUDDING) && !rn2(3)
            && !(state.mvitals[PM_BLACK_PUDDING].mvflags & G_GONE)) {
            if (Blind(state)) {
                const heard = youHear('a gushing sound.', state);
                if (heard) await ttyPline(heard, state);
            } else {
                await ttyPline(`A ${hcolor('black', state)} ooze gushes up from the drain!`, state);
            }
            await makemon_runtime(state.mons[PM_BLACK_PUDDING], x, y, MM_NOMSG, { state });
            await exercise(A_DEX, true, state, random);
            newsym(x, y, state);
            maploc.flags |= S_LPUDDING;
            return ECMD_TIME;
        } else if (!(maploc.flags & S_LDWASHER) && !rn2(3)
            && !(state.mvitals[PM_AMOROUS_DEMON].mvflags & G_GONE)) {
            await ttyPline(`${Blind(state) ? 'Something' : 'The dish washer'} returns!`, state);
            const sex = gend === 1 || (gend === 2 && rn2(2)) ? MM_MALE : MM_FEMALE;
            if (await makemon_runtime(state.mons[PM_AMOROUS_DEMON], x, y,
                MM_NOMSG | sex, { state })) newsym(x, y, state);
            maploc.flags |= S_LDWASHER;
            await exercise(A_DEX, true, state, random);
            return ECMD_TIME;
        } else if (!rn2(3)) {
            await sink_backs_up(x, y, state, { encumberMessage: encumber_msg });
            return ECMD_TIME;
        }
        await kick_ouch(x, y, '', state);
        return ECMD_TIME;
    }

    if (maploc.typ === STAIRS || maploc.typ === LADDER
        || IS_STWALL(maploc.typ)) {
        // 1244. mklev.c mkstairs() writes LA_DOWN on a down staircase as well
        // as a down ladder, so kicking at either one is a dumb move; a wall or
        // anything leading up hurts instead.
        if (!IS_STWALL(maploc.typ) && maploc.ladder === LA_DOWN) {
            await kick_dumb(x, y, state);
            return ECMD_TIME;
        }
        await kick_ouch(x, y, '', state);
        return ECMD_TIME;
    }
    await kick_dumb(x, y, state);
    return ECMD_TIME;
}

// C ref: dokick.c dokick() (1257-1470), the #kick command. Its return value is
// rhack()'s: ECMD_CANCEL when the direction prompt answers nothing, ECMD_FAIL
// for a guard refusal, and ECMD_TIME once the kick lands.
export async function dokick(state = game) {
    const u = state.u;
    const species = state.youmonst?.data;

    // 1265-1316. Nine guards, each of which prints its own refusal, sets
    // no_kick and leaves through one shared `display_nhwindow(WIN_MESSAGE,
    // TRUE)` --More-- and ECMD_FAIL. C evaluates them as one else-if chain, so
    // a later condition is read only when every earlier one was false; the
    // remaining unported guards keep the source order through refusals.
    if (nolimbs(species) || slithy(species)) {
        throw new UnsupportedKickError(
            "dokick()'s no-legs guard, which needs its --More-- flush",
        );
    }
    if (verysmall(species)) {
        throw new UnsupportedKickError(
            "dokick()'s too-small guard, which needs its --More-- flush",
        );
    }
    if (u.usteed) {
        throw new UnsupportedKickError(
            "dokick()'s steed prompt, which needs kick_steed()",
        );
    }
    if (Wounded_legs(state)) {
        await legs_in_no_shape('kicking', false, state);
        await displayPendingTtyMessageWindow(state);
        return ECMD_FAIL;
    }
    if (near_capacity(state) > SLT_ENCUMBER) {
        throw new UnsupportedKickError(
            "dokick()'s encumbrance guard, which needs its --More-- flush",
        );
    }
    if (species?.mlet === S_LIZARD) {
        throw new UnsupportedKickError(
            "dokick()'s lizard guard, which needs its --More-- flush",
        );
    }
    // 1288. C's condition is `u.uinwater && !rn2(2)`, so a submerged hero
    // reaches the rest of dokick() half the time; stopping on u.uinwater alone
    // keeps that draw out of the stream.
    if (u.uinwater) {
        throw new UnsupportedKickError(
            "dokick()'s underwater guard, whose rn2(2) this stops before",
        );
    }
    if (u.utrap) {
        throw new UnsupportedKickError(
            "dokick()'s trapped-hero guard, and with it the kick at the side "
            + 'of a pit at 1350-1353, which only a wall-passing hero reaches',
        );
    }
    if (sobj_at(BOULDER, u.ux, u.uy, state) && !Passes_walls(state)) {
        throw new UnsupportedKickError(
            "dokick()'s boulder guard, which needs its --More-- flush",
        );
    }

    // 1318-1321. getdir() prints "In what direction?" and writes u.dx/u.dy.
    // Neither refusal spends a turn.
    if (!await getdir(null, state)) return ECMD_CANCEL;
    if (!u.dx && !u.dy) return ECMD_CANCEL;

    const x = u.ux + u.dx;
    const y = u.uy + u.dy;
    // 1325. Written above everything that follows, the five ordered tests
    // included, so an arm that refuses below has still recorded the square,
    // exactly as C has.
    state.gk ??= {};
    state.gk.kickedloc = { x, y };

    // 1327-1331. KMH -- Kicking boots always succeed; otherwise average the
    // three physical attributes. C's ACURRSTR folds 18/xx Strength down to
    // 19..25; ACURR for Dexterity and Constitution gives the effective value.
    // C's uarmf is a global; worn.js keeps it at state.uarmf.
    let avrg_attrib;
    if (state.uarmf?.otyp === KICKING_BOOTS) {
        avrg_attrib = 99;
    } else {
        avrg_attrib = Math.trunc(
            (acurrstr(state) + acurr(state, A_DEX)
             + acurr(state, A_CON)) / 3,
        );
    }

    if (u.uswallow) {
        throw new UnsupportedKickError(
            "dokick()'s engulfed arm, whose rn2(3) this stops before",
        );
    }
    // 1355-1370. While levitating, C can brace against a wall, door, or an
    // object behind the hero on an air level. Otherwise it returns ECMD_OK.
    if (Levitation(state)) {
        const xx = u.ux - u.dx;
        const yy = u.uy - u.dy;
        const behind = isok(xx, yy) ? state.level.at(xx, yy) : null;
        const objectBehind = state.level?.objects?.[xx]?.[yy] ?? null;
        if (behind && !IS_OBSTRUCTED(behind.typ) && !IS_DOOR(behind.typ)
            && (!Is_airlevel(u.uz) || !objectBehind)) {
            await ttyPline('You have nothing to brace yourself against.', state);
            return ECMD_OK;
        }
    }

    const mtmp = isok(x, y) ? m_at(x, y, state) : null;
    let oldGlyph = -1;
    if (mtmp) {
        oldGlyph = glyph_at(x, y, state);
        if (!await maybe_kick_monster(mtmp, x, y, state))
            return state.context?.move ? ECMD_TIME : ECMD_OK;
    }

    // 1383-1384. Both run before the five target tests, including the monster
    // arm, so they precede kick_monster() as they do in C.
    await wake_nearby({ state });
    u_wipe_engr(2, { state });

    if (!isok(x, y)) {
        throw new UnsupportedKickError(
            "dokick()'s off-the-map arm, which needs kick_ouch()",
        );
    }
    const maploc = state.level.at(x, y);

    if (mtmp) {
        // C saves mdat before kick_monster(), because that call can kill and
        // remove the target before dokick() calculates the recoil distance.
        const mdat = mtmp.data;
        await kick_monster(mtmp, x, y, state);
        const glyph = glyph_at(x, y, state);
        if (mtmp.mhp < 1) { // DEADMONSTER(mtmp)
            if (glyph !== oldGlyph && glyph_is_invisible(glyph)) {
                // display.c:show_glyph is void and has no corresponding
                // source-owned JS screen operation; preserve the exact gap.
                note_unported('display.c show_glyph');
            }
        } else if (!canspotmon(mtmp, state)
                   && mtmp.mx === x && mtmp.my === y
                   && !glyph_is_invisible(glyph)
                   && !engulfing_u(mtmp, state)) {
            map_invisible(x, y, state);
        }

        // dokick.c:1428-1439. C uses integer division for both range steps;
        // mdat remains the pre-kick species if the monster died above.
        if ((Is_airlevel(u.uz) || Levitation(state)) && state.context?.move) {
            let range = state.youmonst.data.cwt
                + weight_cap(state) + inv_weight(state);
            if (range < 1) range = 1;
            range = Math.trunc((3 * mdat.cwt) / range);
            if (range < 1) range = 1;
            await hurtle(-u.dx, -u.dy, range, true, state);
        }
        return ECMD_TIME;
    }

    unmap_invisible(x, y, state);
    // 1444. The XOR is written out because C wrote it: a hero inside water
    // kicking at dry land reaches the same message. u.uinwater is false by the
    // time control arrives here, since the guard above refused it.
    if ((is_pool(x, y, state) || maploc.typ === LAVAWALL)
        !== Boolean(u.uinwater)) {
        throw new UnsupportedKickError(
            "dokick()'s pool and lava arm",
        );
    }

    // 1452-1453. OBJ_AT() read off the per-square pile chain, so that a
    // supplied state rather than the module global answers for it.
    const pile = state.level?.objects?.[x]?.[y] ?? null;
    if (pile && (!Levitation(state) || Is_airlevel(u.uz) || Is_waterlevel(u.uz)
                 || sobj_at(BOULDER, x, y, state))) {
        const kickName = { value: '' };
        if (await kick_object(x, y, kickName, state)) {
            if (Is_airlevel(u.uz))
                await hurtle(-u.dx, -u.dy, 1, true, state);
            return ECMD_TIME;
        }
        await kick_ouch(x, y, kickName.value, state);
        return ECMD_TIME;
    }

    if (IS_DOOR(maploc.typ)) {
        await kick_door(x, y, avrg_attrib, state);
    } else {
        return await kick_nondoor(x, y, avrg_attrib, state);
    }
    return ECMD_TIME;
}

// C ref: dokick.c drop_to() (1473-1506). cc.y == 0 means no destination.
export function drop_to(cc, loc, x, y, state = game) {
    const stway = stairway_at(x, y, state);
    switch (loc) {
    case MIGR_RANDOM:
        if (on_level(state.u.uz, state.stronghold_level)) {
            cc.x = state.valley_level.dnum;
            cc.y = state.valley_level.dlevel;
            break;
        } else if (state.u.uz.dnum === state.astral_level?.dnum
                   || Is_botlevel(state.u.uz, state)) {
            cc.y = cc.x = 0;
            break;
        }
        // FALLTHROUGH: an ordinary hole reaches the next dungeon level.
    case MIGR_STAIRS_UP:
    case MIGR_LADDER_UP:
    case MIGR_SSTAIRS:
        cc.x = stway ? stway.tolev.dnum : state.u.uz.dnum;
        cc.y = stway ? stway.tolev.dlevel : state.u.uz.dlevel + 1;
        break;
    default:
        cc.y = cc.x = 0;
        break;
    }
}

// C ref: dokick.c container_impact_dmg() (412-488). This runs after a
// container lands on a hard surface. Its source coordinates are the square
// before impact; for drops and throws the callers pass the hero's square.
export async function container_impact_dmg(obj, x, y, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2 };
    const message = rawEnv.message ?? ttyPline;
    if (!isContainer(obj) || !Has_contents(obj)
        || obj.otyp === BAG_OF_HOLDING || obj.otyp === BAG_OF_TRICKS) {
        return;
    }

    const impactRooms = in_rooms(x, y, SHOPBASE, state);
    const roomno = impactRooms[0] ?? 0;
    const keeper = shop_keeper(roomno, state);
    const costly = Boolean(keeper) && costly_spot(x, y, state);
    const heroShop = state.u?.ushops?.[0] ?? 0;
    const insider = Boolean(heroShop)
        && Boolean(inside_shop(state.u.ux, state.u.uy, state))
        && roomno === heroShop;
    const fromInventory = obj !== (state.gk?.kickedobj ?? state.kickedobj);
    let loss = 0;
    let weightChanged = false;

    for (let item = obj.cobj; item;) {
        // C saves nobj before destroying or extracting the current child.
        const next = item.nobj;
        let result = null;
        const itemType = objectType(item, state);
        if (itemType.oc_material === GLASS && item.oclass !== GEM_CLASS
            && !obj_resists(item, 33, 100, { state, random })) {
            result = 'shatter';
        } else if (item.otyp === EGG && !random.rn2(3)) {
            result = 'cracking';
        }

        if (result) {
            if (item.otyp === MIRROR) change_luck(-2, state);
            if (item.otyp === EGG && item.spe && ismnum(item.corpsenm))
                change_luck(-1, state);

            // sounds.c:Soundeffect has no terminal-side behavior in this port.
            note_unported('sounds.c Soundeffect');
            const heard = youHear(`a muffled ${result}.`, state);
            if (heard) await message(heard, state, rawEnv);

            if (costly) {
                if (fromInventory && !item.unpaid)
                    item.no_charge = 1;
                loss += await stolen_value(
                    item, x, y, keeper.mpeaceful, true, state,
                );
            }
            if (item.quan > 1) {
                await useup(item, { state });
            } else {
                obj_extract_self(item, { state });
                obfree(item, null, { state });
            }
            obj.cknown = 0;
            weightChanged = true;
        }
        item = next;
    }

    if (weightChanged) obj.owt = weight(obj, { state });
    if (costly && loss) {
        if (!insider) {
            await message(
                `You caused ${loss} ${currency(loss, state)} worth of damage!`,
                state, rawEnv,
            );
            // shk.c:make_angry_shk() is void and remains unported.
            note_unported('shk.c make_angry_shk');
        } else {
            await message(
                `You owe ${shkname(keeper, state)} ${loss} `
                + `${currency(loss, state)} for objects destroyed.`,
                state, rawEnv,
            );
        }
    }
}

// C ref: dokick.c impact_drop() (1511-1622). The missile itself remains at
// its caller's disposal; other floor objects move to the migration chain.
export async function impact_drop(missile, x, y, dlev, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    if (!state.level.objects[x]?.[y]) return;
    const env = objectGenerationEnv({ ...rawEnv, state, hooks: {
        recalcBlockPoint: (bx, by, objectEnv) =>
            recalc_block_point(bx, by, objectEnv.state),
        ...rawEnv.hooks,
    } });
    const random = { rn2, ...(rawEnv.random ?? {}) };
    const message = rawEnv.message ?? ttyPline;
    let toloc = down_gate(x, y, state);
    const cc = {};
    drop_to(cc, toloc, x, y, state);
    if (!cc.y) return;
    if (dlev) {
        toloc = MIGR_WITH_HERO;
        cc.y = dlev;
    }

    const costly = costly_spot(x, y, state);
    let price = 0, debit = 0, robbed = 0;
    let angry = false, keeper = null;
    if (costly) {
        keeper = shop_keeper(in_rooms(x, y, SHOPBASE, state)[0] ?? 0, state);
        if (keeper) {
            debit = keeper.mextra.eshk.debit;
            robbed = keeper.mextra.eshk.robbed;
            angry = !keeper.mpeaceful;
        }
    }

    const isrock = missile && missile.otyp === ROCK;
    let oct = 0, dct = 0;
    for (let obj = state.level.objects[x][y]; obj;) {
        const next = obj.nexthere;
        if (obj !== missile) {
            oct += obj.quan;
            if (obj !== state.uball && obj !== state.uchain
                && !(isrock && obj.otyp === BOULDER)
                && !random.rn2(obj.otyp === BOULDER ? 30 : 3)) {
                obj_extract_self(obj, env);
                if (costly) {
                    price += await stolen_value(obj, x, y,
                        costly_spot(state.u.ux, state.u.uy, state)
                            && state.u.urooms.includes(
                                in_rooms(x, y, SHOPBASE, state)[0] ?? 0,
                            ), true, state);
                    if (Has_contents(obj)) picked_container(obj);
                    if (obj.oclass !== COIN_CLASS) obj.no_charge = 0;
                }
                add_to_migration(obj, state);
                obj.ox = cc.x;
                obj.oy = cc.y;
                obj.owornmask = toloc;
                dct += obj.quan;
            }
        }
        obj = next;
    }

    if (dct && cansee(x, y, state)) {
        const what = dct === 1 ? 'object falls' : 'objects fall';
        if (missile) {
            await message(`From the impact, ${dct === oct ? 'the ' : dct === 1 ? 'an' : ''}other ${what}.`, state, rawEnv);
        } else if (oct === dct) {
            await message(`${dct === 1 ? 'The' : 'All the'} adjacent ${what} ${state.gg.gate_str}.`, state, rawEnv);
        } else {
            await message(`${dct === 1 ? 'One of the' : 'Some of the'} adjacent ${dct === 1 ? 'objects falls' : what} ${state.gg.gate_str}.`, state, rawEnv);
        }
    }

    if (costly && keeper && price) {
        const shop = keeper.mextra.eshk;
        if (shop.robbed > robbed) {
            await message(`You removed ${price} ${currency(price, state)} worth of goods!`, state, rawEnv);
            if (cansee(keeper.mx, keeper.my, state)) {
                if (!shop.customer) shop.customer = state.plname.slice(0, PL_NSIZ);
                if (angry) {
                    await message(`${Shknam(keeper, state, rawEnv)} is infuriated!`, state, rawEnv);
                } else {
                    await message(`"${state.plname}, you are a thief!"`, state, rawEnv);
                }
            } else {
                const heard = youHear('a scream, "Thief!"', state);
                if (heard) await message(heard, state, rawEnv);
            }
            // C discards this void helper; its pursuit state remains unported.
            note_unported('shk.c hot_pursuit');
            await angry_guards(false, env);
            return;
        }
        if (shop.debit > debit) {
            const amount = shop.debit - debit;
            await message(`You owe ${shkname(keeper, state, rawEnv)} ${amount} ${currency(amount, state)} for goods lost.`, state, rawEnv);
        }
    }
}

// C ref: dokick.c ship_object() (1639-1765). The caller holds a free object;
// TRUE means this function consumed it or moved it to the migration chain.
export async function ship_object(obj, x, y, shop_floor_obj, env = {}) {
    const state = env.state ?? game;
    const random = { rn2, ...(env.random ?? {}) };
    const message = env.message ?? ttyPline;
    if (!obj) return false;
    const toloc = down_gate(x, y, state);
    if (toloc === MIGR_NOWHERE) return false;
    const cc = {};
    drop_to(cc, toloc, x, y, state);
    if (!cc.y) return false;

    const nodrop = obj === state.uball || obj === state.uchain
        || (toloc !== MIGR_LADDER_UP && random.rn2(3));
    const container = Has_contents(obj);
    const unpaid = is_unpaid(obj);
    let n = 0;
    let chainthere = false;
    for (let other = state.level.objects[x]?.[y]; other;
        other = other.nexthere) {
        if (other === state.uchain) chainthere = true;
        else if (other !== obj) n += other.quan;
    }
    const impact = n !== 0;
    const trap = t_at(x, y, state);
    if (obj.otyp === BOULDER && trap && is_hole(trap.ttyp)) {
        if (impact) await impact_drop(obj, x, y, 0, env);
        return false;
    }
    if (cansee(x, y, state))
        await otransit_msg(obj, nodrop, chainthere, n, { ...env, state });
    if (nodrop) {
        if (impact) {
            await impact_drop(obj, x, y, 0, env);
            maybe_unhide_at(x, y, state, env);
        }
        return false;
    }
    if (unpaid || shop_floor_obj) {
        note_unported('shk.c stolen_value');
        if (container) picked_container(obj);
        if (obj.oclass !== COIN_CLASS) obj.no_charge = 0;
    }
    if (obj.owornmask) remove_worn_item(obj, true, state);
    if (breaktest(obj, { ...env, state, random })) {
        let result;
        if (objectType(obj, state).oc_material === GLASS
            || obj.otyp === EXPENSIVE_CAMERA) {
            if (obj.otyp === MIRROR) change_luck(-2, state);
            result = 'crash';
        } else {
            if (obj.otyp === EGG && obj.spe && ismnum(obj.corpsenm))
                change_luck(-Math.min(obj.quan, 5), state);
            result = 'splat';
        }
        note_unported('sounds.c Soundeffect');
        const heard = youHear(`a muffled ${result}.`, state);
        if (heard) await message(heard, state, env);
        obj_extract_self(obj, { ...env, state });
        obfree(obj, null, { ...env, state });
        return true;
    }
    add_to_migration(obj, state);
    obj.ox = cc.x;
    obj.oy = cc.y;
    obj.owornmask = toloc;
    if (obj.otyp === BOULDER) obj.otrapped = 0;
    if (impact) {
        await impact_drop(obj, x, y, 0, env);
        if (!env.planning) newsym(x, y);
    }
    return true;
}

// C ref: dokick.c otransit_msg() (1909-1940).
export async function otransit_msg(obj, nodrop, chainthere, num, env = {}) {
    const state = env.state ?? game;
    const message = env.message ?? ttyPline;
    const name = obj.otyp === CORPSE
        ? upstart(corpse_xname(obj, null, CXN_PFX_THE, state))
        : Tobjnam(obj, null, state);
    if (num || chainthere) {
        let suffix = num
            ? ` ${otense(obj, 'hit', state)} ${num === 1 ? 'another' : 'other'}`
                + ` object${num > 1 ? 's' : ''}`
            : ` ${otense(obj, 'rattle', state)} your chain`;
        suffix += nodrop ? '.'
            : ` and ${otense(obj, 'fall', state)} ${state.gg.gate_str}.`;
        await message(name + suffix, state, env);
    } else if (!nodrop) {
        await message(`${name} ${otense(obj, 'fall', state)} ${state.gg.gate_str}.`,
            state, env);
    }
}

// C ref: dokick.c down_gate() (1943-1975). gate_str is C's shared description
// of the selected down gate; every lookup clears it, including failed ones.
export function down_gate(x, y, state = game) {
    const stway = stairway_at(x, y, state);
    state.gg ??= {};
    state.gg.gate_str = null;
    if (on_level(state.u.uz, state.qstart_level) && !ok_to_quest(state))
        return MIGR_NOWHERE;
    if (stway && !stway.up && !stway.isladder) {
        state.gg.gate_str = 'down the stairs';
        return stway.tolev.dnum === state.u.uz.dnum
            ? MIGR_STAIRS_UP : MIGR_SSTAIRS;
    }
    if (stway && !stway.up && stway.isladder) {
        state.gg.gate_str = 'down the ladder';
        return MIGR_LADDER_UP;
    }
    const trap = t_at(x, y, state);
    if (trap && trap.tseen && is_hole(trap.ttyp)) {
        state.gg.gate_str = trap.ttyp === TRAPDOOR
            ? 'through the trap door' : 'through the hole';
        return MIGR_RANDOM;
    }
    return MIGR_NOWHERE;
}
