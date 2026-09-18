// The Wizard of Yendor's harassment, and the Amulet test the rest of the game
// shares with it.
// C ref: wizard.c mon_has_amulet(), mon_has_special().

import {
    BOLT_LIM,
    DEAF,
    G_GENOD,
    GP_AVOID_MONPOS,
    GP_CHECKSCARY,
    Is_rogue_level,
    NO_MM_FLAGS,
    RLOC_MSG,
    STRAT_APPEARMSG,
    STRAT_GOAL,
    STRAT_GROUND,
    STRAT_HEAL,
    STRAT_MONSTR,
    STRAT_NONE,
    STRAT_PLAYER,
    STRAT_STRATMASK,
    STRAT_WAITMASK,
    STRAT_WAITFORU,
    MM_NOMSG,
    isok,
    u_at,
    helpless,
} from './const.js';
import { Amonnam, Monnam } from './do_name.js';
import { In_W_tower, In_hell, builds_up } from './dungeon.js';
import { game } from './gstate.js';
import { set_malign, unmakemon } from './makemon.js';
import {
    attacktype,
    big_to_little,
    is_covetous,
} from './mondata.js';
import {
    AT_MAGC,
    G_HELL,
    G_NOHELL,
    PM_ARCH_LICH,
    PM_ARCHON,
    PM_WIZARD_OF_YENDOR,
    S_ANGEL,
    S_DEMON,
    monsterClassSymbol,
} from './monsters.js';
import { NASTIES } from './nasties_data.js';
import { ART_ORB_OF_DETECTION } from './artifacts.js';
import {
    AMULET_OF_YENDOR, BELL_OF_OPENING, CANDELABRUM_OF_INVOCATION,
    SPE_BOOK_OF_THE_DEAD,
} from './objects.js';
import { is_quest_artifact } from './questpgr.js';
import { stairway_find_type_dir } from './stairs.js';
import { enexto, enexto_core } from './teleport.js';
import { monster_census, msummon } from './minion.js';
import { makemon_runtime } from './makemon_create.js';
import { cansee } from './vision.js';
import { distant_name, donameFresh } from './objnam.js';
import { messageAt, canSpotMonster } from './startup_a11y.js';
import { ttyNorep, ttyPline } from './tty_message.js';
import { vtense } from './objnam.js';
import { note_unported } from './unported.js';
import { d, rn1, rn2, rnd, rne, rnz } from './rng.js';

// monflag.h M3_WANTS* values. They are kept here with wizard.c's consumers
// so the strategy bits cannot silently drift from the source masks.
const M3_WANTSAMUL = 0x0001;
const M3_WANTSBELL = 0x0002;
const M3_WANTSBOOK = 0x0004;
const M3_WANTSCAND = 0x0008;
const M3_WANTSARTI = 0x0010;

function heroIsDeaf(state) {
    const deafness = state.u?.uprops?.[DEAF];
    return Boolean(
        deafness?.intrinsic
        || deafness?.extrinsic
        || state.u?.uroleplay?.deaf,
    );
}

// C In_endgame() compares the current dungeon number with astral_level.  The
// shared const.js helper reads the live game object; this local spelling keeps
// nasty()'s substitute cap clone-local during planning and source-pinned tests.
function inEndgameState(state) {
    const level = state.u?.uz;
    const astral = state.astral_level;
    return Boolean(level && astral && level.dnum === astral.dnum);
}

// C ref: wizard.c has_aggravatables() (472-491). "are there any monsters mon
// could aggravate?" A pure scan of fmon: no draws, no output, no state change.
// mcastu.c spell_would_be_useless() reads it for MCAST_AGGRAVATION.
export function has_aggravatables(mon, state = game) {
    const in_w_tower = In_W_tower(mon.mx, mon.my, state.u.uz, state);

    if (in_w_tower !== In_W_tower(state.u.ux, state.u.uy, state.u.uz, state))
        return false;

    for (let mtmp = state.level?.monlist; mtmp; mtmp = mtmp.nmon) {
        if (mtmp.mhp < 1) continue; /* DEADMONSTER() */
        if (in_w_tower !== In_W_tower(mtmp.mx, mtmp.my, state.u.uz, state))
            continue;
        if ((mtmp.mstrategy & STRAT_WAITFORU) !== 0 || helpless(mtmp))
            return true;
    }
    return false;
}

function creationEnv(state, rawEnv) {
    const env = { state };
    if (rawEnv.random) env.random = rawEnv.random;
    if (rawEnv.displayRandom) env.displayRandom = rawEnv.displayRandom;
    return env;
}

function wizardAppearanceMessage(monster, state, displayRandom) {
    if (!canSpotMonster(monster, state)) return null;
    const name = Amonnam(monster, { state, displayRandom });
    const distance = (monster.mx - state.u.ux) ** 2
        + (monster.my - state.u.uy) ** 2;
    const suffix = distance <= 2 ? ' next to you'
        : distance <= BOLT_LIM * BOLT_LIM ? ' close by' : '';
    return messageAt(
        `${name} suddenly ${vtense(name, 'appear')}${suffix}!`,
        monster.mx,
        monster.my,
        state,
    );
}

// C ref: wizard.c resurrect() (715-780), new-Wizard arm only. The generic
// runtime constructor currently admits only its verified call shapes and does
// not admit MM_NOWAIT or the Wizard species. Reuse its complete constructor by
// selecting the source coordinate first, then temporarily using its mklev
// lifecycle so the constructor can finish synchronously. No mklev-only Wizard
// branch is live; the flag only bypasses that constructor's runtime admission.
export async function resurrect(state = game, rawEnv = {}) {
    const createMonster = rawEnv.makemon;
    if (typeof createMonster !== 'function')
        throw new TypeError('resurrect requires a makemon operation');

    state.context ??= {};
    const wizardCount = state.context.no_of_wizards ?? 0;
    if (wizardCount) return null;

    const species = state.mons?.[PM_WIZARD_OF_YENDOR];
    if (!species)
        throw new Error('resurrect requires the Wizard monster record');

    const env = creationEnv(state, rawEnv);
    let coordinate = enexto_core(
        state.u.ux,
        state.u.uy,
        species,
        GP_CHECKSCARY | GP_AVOID_MONPOS,
        env,
    );
    if (!coordinate) {
        coordinate = enexto_core(
            state.u.ux,
            state.u.uy,
            species,
            GP_AVOID_MONPOS,
            env,
        );
    }
    if (!coordinate) return null;

    const wasInMklev = Boolean(state.in_mklev);
    let monster;
    try {
        state.in_mklev = true;
        // MM_NOWAIT's only makemon() effect here is suppressing the species'
        // WAITMASK strategy. The constructor's ordinary flags otherwise make
        // the same inventory and hit-point calls in the same order.
        monster = createMonster(
            species,
            coordinate.x,
            coordinate.y,
            NO_MM_FLAGS,
            env,
        );
    } finally {
        state.in_mklev = wasInMklev;
    }
    if (!monster) return null;

    // wizard.c:724-728 and makemon.c:1369-1373. These assignments are after
    // construction only because the shared constructor's admitted lifecycle
    // has no Wizard branch; none is read between the corresponding C points.
    state.context.no_of_wizards = wizardCount + 1;
    monster.iswiz = true;
    monster.mrevived = true;
    monster.mtame = 0;
    monster.mpeaceful = false;
    monster.mstrategy = 0; // MM_NOWAIT suppresses STRAT_WAITMASK setup.
    monster.mgenmklev = false;
    monster.mux = state.u.ux;
    monster.muy = state.u.uy;
    set_malign(monster, state);

    const redraw = rawEnv.redraw;
    if (typeof redraw === 'function')
        redraw(monster.mx, monster.my, state);

    const appearance = wizardAppearanceMessage(
        monster,
        state,
        rawEnv.displayRandom,
    );
    if (appearance) {
        const norepMessage = rawEnv.norepMessage ?? ttyNorep;
        await norepMessage(appearance, state, rawEnv);
    }

    // wizard.c:774-778. SetVoice() has no screen/state consumer in the port;
    // verbalize() is the ordinary quoted pline immediately after the voice.
    if (!heroIsDeaf(state)) {
        const message = rawEnv.message ?? ttyPline;
        await message('A voice booms out...', state, rawEnv);
        await message(
            '"So thou thought thou couldst kill me, fool."',
            state,
            rawEnv,
        );
    }
    return monster;
}

// C ref: wizard.c:536-581, pick_nasty().
// Rolls a random entry from the nasties[] table, filtering for genocided,
// difficulty-capped, and hell/nohell mismatches, with juvenile exclusion on
// the big_to_little substitute.
export function pick_nasty(difcap, normalized) {
    const { random, state } = normalized;
    const mons = state.mons;

    // ROLL_FROM(nasties): nasties[rn2(SIZE(nasties))]
    let res = NASTIES[random.rn2(NASTIES.length)];

    // On the rogue level, prefer monsters with uppercase display symbols.
    // C: Is_rogue_level(&u.uz) && !('A' <= monsym(&mons[res]) && <= 'Z')
    if (Is_rogue_level(state.u?.uz)) {
        const sym = monsterClassSymbol(mons[res].mlet);
        if (!(sym >= 'A' && sym <= 'Z')) {
            res = NASTIES[random.rn2(NASTIES.length)];
        }
    }

    // If genocided, too difficult, or out of place (hell/nohell), try a
    // substitute via big_to_little.
    let alt = res;
    if ((state.mvitals[res].mvflags & G_GENOD) !== 0
        || (difcap > 0 && mons[res].difficulty >= difcap)
        || (mons[res].geno
            & (In_hell(state.u?.uz, state) ? G_NOHELL : G_HELL)) !== 0) {
        alt = big_to_little(res);
    }

    if (alt !== res && (state.mvitals[alt].mvflags & G_GENOD) === 0) {
        // Only non-juveniles can become the alternate choice.
        // C checks pmnames[NEUTRAL] for "baby " prefix or
        // " hatchling" / " pup" / " cub" suffix.
        const NEUTRAL = 2;
        const mnam = mons[alt].pmnames[NEUTRAL] ?? '';
        const lastSpace = mnam.lastIndexOf(' ');
        if (!mnam.startsWith('baby ')
            && (lastSpace < 0
                || (!mnam.endsWith(' hatchling')
                    && !mnam.endsWith(' pup')
                    && !mnam.endsWith(' cub')))) {
            res = alt;
        }
    }

    return res;
}

// C ref: wizard.c nasty() (591-727).  The summon spell and late-game
// harassment both use this source owner.  Creation is an async operation in
// JavaScript because makemon_runtime() owns the runtime continuation; the
// source's selection, retry, census, and post-creation order remain here.
export async function nasty(summoner, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? {
        d, rn1, rn2, rnd, rne, rnz,
    };
    const normalized = { ...rawEnv, state, random };
    const createMonster = rawEnv.makemon ?? makemon_runtime;
    const summonMinion = rawEnv.msummon ?? msummon;
    const removeMonster = rawEnv.unmakemon
        ?? ((monster, flags) => unmakemon(monster, flags, state));
    const countMonsters = rawEnv.monsterCensus
        ?? ((spotted, censusEnv) => monster_census(spotted, censusEnv));
    const applyMalign = rawEnv.setMalign
        ?? ((monster) => set_malign(monster, state));
    const censusBefore = countMonsters(false, { state });
    const mmflags = summoner ? MM_NOMSG : NO_MM_FLAGS;

    if (!random || typeof random.rn2 !== 'function'
        || typeof random.rnd !== 'function') {
        throw new TypeError('nasty requires rn2 and rnd operations');
    }

    // wizard.c deliberately calls the return-valued minion owner here.  The
    // injected operation remains useful for source-pinned tests, while live
    // callers use minion.c's canonical msummon implementation.
    if (!random.rn2(10) && In_hell(state.u?.uz, state)) {
        const summoned = await summonMinion(null, normalized);
        return summoned
            ? countMonsters(false, { state }) - censusBefore
            : summoned;
    }

    let count = 0;
    const summonerClass = summoner ? summoner.data?.mlet : 0;
    let difcap = summoner ? summoner.data?.difficulty ?? 0 : 0;
    const castalign = summoner
        ? Math.sign(summoner.data?.maligntyp ?? 0)
        : 0;
    let outerLimit = (state.u?.ulevel ?? 0) > 3
        ? Math.trunc((state.u.ulevel ?? 0) / 3) : 1;
    const bypos = {
        x: state.u?.ux ?? 0,
        y: state.u?.uy ?? 0,
    };
    const mons = state.mons ?? [];

    for (let i = random.rnd(outerLimit);
        i > 0 && count < 10;
        --i) {
        for (let j = 0; j < 20; ++j) {
            let makeindex;
            let monsterClass;
            let trylimit = 11;
            do {
                if (!--trylimit) break;
                makeindex = pick_nasty(difcap, normalized);
                const candidate = mons[makeindex];
                monsterClass = candidate?.mlet;
            } while (trylimit > 0
                && ((difcap > 0
                    && (mons[makeindex]?.difficulty ?? 0) >= difcap
                    && attacktype(mons[makeindex], AT_MAGC))
                    || (summonerClass === S_DEMON
                        && monsterClass === S_ANGEL)
                    || (summonerClass === S_ANGEL
                        && monsterClass === S_DEMON)));
            if (!trylimit) continue;

            const species = mons[makeindex];
            if (!species) continue;
            if (summoner) {
                const coordinate = enexto(
                    summoner.mux,
                    summoner.muy,
                    species,
                    normalized,
                );
                if (!coordinate) continue;
                bypos.x = coordinate.x;
                bypos.y = coordinate.y;
            }

            const creationEnv = {
                ...normalized,
                // wizard.c nasty() is a distinct runtime makemon caller. The
                // marker lets makemon_create.js admit its exact MM_NOMSG or
                // NO_MM_FLAGS shape without widening ordinary runtime calls.
                _nasty: true,
                // MM_NOMSG creation still requires both runtime message
                // operations.  Planning callers own a silent clone-local
                // operation; live callers retain makemon_runtime defaults.
                ...(rawEnv.planning && !rawEnv.message
                    ? { message: async () => {} } : {}),
                ...(rawEnv.planning && !rawEnv.norepMessage
                    ? { norepMessage: async () => {} } : {}),
            };
            let monster = await createMonster(
                species,
                bypos.x,
                bypos.y,
                mmflags,
                creationEnv,
            );
            if (monster) {
                monster.msleeping = false;
                monster.mpeaceful = false;
                monster.mtame = 0;
                applyMalign(monster, state);
            } else {
                // C's substitute path intentionally asks makemon() for a
                // random species after a failed selected creation.
                monster = await createMonster(
                    null,
                    bypos.x,
                    bypos.y,
                    mmflags,
                    creationEnv,
                );
                if (monster) {
                    monsterClass = monster.data?.mlet;
                    if ((difcap > 0
                        && (monster.data?.difficulty ?? 0) >= difcap
                        && random.rn2(inEndgameState(state) ? 3 : 7)
                        && attacktype(monster.data, AT_MAGC))
                        || (summonerClass === S_DEMON
                            && monsterClass === S_ANGEL)
                        || (summonerClass === S_ANGEL
                            && monsterClass === S_DEMON)) {
                        monster = removeMonster(monster, NO_MM_FLAGS);
                    }
                }
            }

            if (monster) {
                if (monster.data === mons[PM_ARCH_LICH]
                    || monster.data === mons[PM_ARCHON]) {
                    outerLimit = Math.min(
                        mons[PM_ARCHON]?.difficulty ?? 0,
                        mons[PM_ARCH_LICH]?.difficulty ?? 0,
                    );
                    if (!difcap || difcap > outerLimit) difcap = outerLimit;
                }
                monster.mspec_used = random.rnd(4);
                ++count;
                if (count >= 10
                    || (monster.data?.maligntyp ?? 0) === 0
                    || Math.sign(monster.data?.maligntyp ?? 0) === castalign)
                    break;
            }
        }
    }

    return count ? countMonsters(false, { state }) - censusBefore : count;
}

// C ref: wizard.c mon_has_amulet() (105-114). Pure; do.c goto_level() reaches
// it three times on the descent path, through apply.c next_to_u(), mondata.c
// levl_follower() and dog.c keepdogs().
//
// It walks the linked monster inventory and therefore also handles the
// Wizard's Amulet check once the resurrection path is active.
export function mon_has_amulet(monster) {
    for (let otmp = monster.minvent; otmp; otmp = otmp.nobj)
        if (otmp.otyp === AMULET_OF_YENDOR) return true;
    return false;
}

// C ref: wizard.c mon_has_special() (117-128). Pure inventory scan: true when
// the monster carries the Amulet of Yendor, any quest artifact, or one of the
// three invocation items (Bell, Candelabrum, Book of the Dead).
export function mon_has_special(monster) {
    for (let otmp = monster.minvent; otmp; otmp = otmp.nobj) {
        if (otmp.otyp === AMULET_OF_YENDOR
            || otmp.oartifact >= ART_ORB_OF_DETECTION
            || otmp.otyp === BELL_OF_OPENING
            || otmp.otyp === CANDELABRUM_OF_INVOCATION
            || otmp.otyp === SPE_BOOK_OF_THE_DEAD)
            return true;
    }
    return false;
}

// C ref: wizard.c which_arti(), mon_has_arti(), other_mon_has_arti(),
// on_ground(), and you_have() (141-233).  These small scans are deliberately
// kept beside strategy() rather than folded into its callers: target_on()
// relies on the same linked-list order and on the distinction between a
// quest artifact (otyp 0) and the four invocation objects.
export function which_arti(mask) {
    switch (mask) {
    case M3_WANTSAMUL: return AMULET_OF_YENDOR;
    case M3_WANTSBELL: return BELL_OF_OPENING;
    case M3_WANTSCAND: return CANDELABRUM_OF_INVOCATION;
    case M3_WANTSBOOK: return SPE_BOOK_OF_THE_DEAD;
    default: return 0;
    }
}

export function mon_has_arti(monster, otyp, state = game) {
    for (let obj = monster?.minvent ?? null; obj; obj = obj.nobj) {
        if (otyp) {
            if (obj.otyp === otyp) return true;
        } else if (obj.oartifact >= ART_ORB_OF_DETECTION
            || is_quest_artifact(obj, state)) {
            return true;
        }
    }
    return false;
}

export function other_mon_has_arti(monster, otyp, state = game) {
    for (let other = state.level?.monlist ?? null;
        other;
        other = other.nmon) {
        if (other !== monster && mon_has_arti(other, otyp, state))
            return other;
    }
    return null;
}

export function on_ground(otyp, state = game) {
    for (let obj = state.level?.objlist ?? null; obj; obj = obj.nobj) {
        if (otyp) {
            if (obj.otyp === otyp) return obj;
        } else if (obj.oartifact >= ART_ORB_OF_DETECTION
            || is_quest_artifact(obj, state)) {
            return obj;
        }
    }
    return null;
}

export function you_have(mask, state = game) {
    const have = state.u?.uhave ?? {};
    switch (mask) {
    case M3_WANTSAMUL: return Boolean(have.amulet);
    case M3_WANTSBELL: return Boolean(have.bell);
    case M3_WANTSCAND: return Boolean(have.menorah);
    case M3_WANTSBOOK: return Boolean(have.book);
    case M3_WANTSARTI: return Boolean(have.questart);
    default: return false;
    }
}

// C ref: wizard.c target_on() (235-267).  The optional predicates are
// supplied by monmove.js to avoid making wizard.js depend on the shopkeeper or
// priest movement modules (both of which depend on the monster runtime).
export function target_on(mask, monster, state = game, rawEnv = {}) {
    if (!(monster?.data?.mflags3 & mask)) return STRAT_NONE;
    const otyp = which_arti(mask);
    if (!mon_has_arti(monster, otyp, state)) {
        if (you_have(mask, state)) {
            monster.mgoal.x = state.u.ux;
            monster.mgoal.y = state.u.uy;
            return STRAT_PLAYER | mask;
        }
        const floorObject = on_ground(otyp, state);
        if (floorObject) {
            monster.mgoal.x = floorObject.ox;
            monster.mgoal.y = floorObject.oy;
            return STRAT_GROUND | mask;
        }
        const other = other_mon_has_arti(monster, otyp, state);
        const inTemple = rawEnv.inhistemple
            ?? (() => false);
        if (other && (otyp !== AMULET_OF_YENDOR
            || (!other.iswiz && !inTemple(other, state)))) {
            monster.mgoal.x = other.mx;
            monster.mgoal.y = other.my;
            return STRAT_MONSTR | mask;
        }
    }
    monster.mgoal.x = 0;
    monster.mgoal.y = 0;
    return STRAT_NONE;
}

// C ref: wizard.c strategy() (269-327).  `rawEnv` contains only predicates
// and state seams; the strategy itself is pure apart from the source-mandated
// mgoal writes in target_on().
export function strategy(monster, state = game, rawEnv = {}) {
    const inShop = rawEnv.inhishop ?? (() => false);
    const inTemple = rawEnv.inhistemple ?? (() => false);
    if (!is_covetous(monster?.data)
        || (monster.isshk && inShop(monster, state))
        || (monster.ispriest && inTemple(monster, state))) {
        return STRAT_NONE;
    }

    const ratio = Math.trunc((monster.mhp * 3) / monster.mhpmax);
    let defensive;
    switch (ratio) {
    default:
    case 0:
        return STRAT_HEAL;
    case 1:
        if (monster.data?.pmidx !== PM_WIZARD_OF_YENDOR)
            return STRAT_HEAL;
        // C falls through for the Wizard.
        defensive = STRAT_HEAL;
        break;
    case 2:
        defensive = STRAT_HEAL;
        break;
    case 3:
        defensive = STRAT_NONE;
        break;
    }

    if (state.context?.made_amulet) {
        const result = target_on(M3_WANTSAMUL, monster, state, rawEnv);
        if (result !== STRAT_NONE) return result;
    }
    const invoked = Boolean(state.u?.uevent?.invoked);
    const priorities = invoked
        ? [M3_WANTSARTI, M3_WANTSBOOK, M3_WANTSBELL, M3_WANTSCAND]
        : [M3_WANTSBOOK, M3_WANTSBELL, M3_WANTSCAND, M3_WANTSARTI];
    for (const mask of priorities) {
        const result = target_on(mask, monster, state, rawEnv);
        if (result !== STRAT_NONE) return result;
    }
    return defensive;
}

// C ref: wizard.c choose_stairs() (329-364).  C leaves its output pair
// unchanged when no stairway exists; returning the pair makes that behavior
// explicit and avoids mutating a caller's temporary coordinate object.
export function choose_stairs(dir, state = game) {
    const result = { x: 0, y: 0 };
    const stdir = builds_up(state.u?.uz, state) ? Boolean(dir) : !dir;
    let stair = stairway_find_type_dir(false, stdir, state);
    if (!stair) stair = stairway_find_type_dir(true, stdir, state);
    if (!stair) {
        for (let current = state.stairs; current; current = current.next) {
            if (current.tolev?.dnum !== state.u?.uz?.dnum) {
                stair = current;
                break;
            }
        }
        if (!stair) stair = stairway_find_type_dir(false, !stdir, state);
        if (!stair) stair = stairway_find_type_dir(true, !stdir, state);
    }
    if (stair) {
        result.x = stair.sx;
        result.y = stair.sy;
    }
    return result;
}

function wizardOperation(rawEnv, name, fallback = null) {
    return typeof rawEnv[name] === 'function' ? rawEnv[name] : fallback;
}

// C ref: wizard.c tactics() (368-468).  Relocation, object transfer, and
// output are operation seams because the same function runs on the live
// monster and on the planning clone.  The only discarded unavailable callee
// is the swallowed expels(TRUE) arm; its return is not used by C.
export async function tactics(monster, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2, rnd };
    const noTeleport = wizardOperation(rawEnv, 'noteleportLevel',
        () => false);
    const mnearto = wizardOperation(rawEnv, 'mnearto');
    const rlocTo = wizardOperation(rawEnv, 'rlocTo');
    const rloc = wizardOperation(rawEnv, 'rloc');
    const mnexto = wizardOperation(rawEnv, 'mnexto');
    const healmon = wizardOperation(rawEnv, 'healmon');
    const message = rawEnv.message ?? ttyPline;
    const mstrategy = strategy(monster, state, rawEnv);
    monster.mstrategy = (monster.mstrategy
        & (STRAT_WAITMASK | STRAT_APPEARMSG)) | mstrategy;
    let sx = 0;
    let sy = 0;
    let mx;
    let my;

    switch (mstrategy) {
    case STRAT_HEAL:
        mx = monster.mx;
        my = monster.my;
        if (state.u?.uswallow && state.u.ustuck === monster)
            note_unported('mhitu.c expels');
        ({ x: sx, y: sy } = choose_stairs(
            (monster.m_id ?? 0) % 2,
            state,
        ));
        monster.mavenge = true;
        if (In_W_tower(mx, my, state.u.uz, state)
            || (monster.iswiz && !sx && !mon_has_amulet(monster))) {
            if (!noTeleport(monster, state)
                && !random.rn2(3 + Math.trunc(monster.mhp / 10))) {
                if (!rloc) note_unported('teleport.c rloc');
                else await rloc(monster, RLOC_MSG, {
                    ...rawEnv,
                    state,
                    random,
                });
            }
        } else if (sx && (mx !== sx || my !== sy)) {
            if (!noTeleport(monster, state)) {
                if (!mnearto || !rlocTo)
                    note_unported('mon.c mnearto/teleport.c rloc_to');
                else if (!await mnearto(monster, sx, sy, true, RLOC_MSG, {
                    ...rawEnv,
                    state,
                    random,
                })) {
                    await rlocTo(monster, mx, my, {
                        ...rawEnv,
                        state,
                        random,
                    });
                    return 0;
                }
            }
            mx = monster.mx;
            my = monster.my;
        }
        if ((mx - state.u.ux) ** 2
            + (my - state.u.uy) ** 2 > BOLT_LIM * BOLT_LIM
            && monster.mhp <= monster.mhpmax - 8) {
            if (!healmon) note_unported('mon.c healmon');
            else await healmon(monster, random.rnd(8), 0, {
                ...rawEnv,
                state,
                random,
            });
            return 1;
        }
        // C falls through from STRAT_HEAL to STRAT_NONE.
    case STRAT_NONE:
        if (!noTeleport(monster, state)
            && !random.rn2(monster.mflee ? 33 : 5)) {
            if (!mnexto) note_unported('mon.c mnexto');
            else await mnexto(monster, RLOC_MSG, {
                ...rawEnv,
                state,
                random,
            });
        }
        return 0;
    default: {
        const where = mstrategy & STRAT_STRATMASK;
        const tx = monster.mgoal?.x ?? 0;
        const ty = monster.mgoal?.y ?? 0;
        const target = mstrategy & STRAT_GOAL;
        if (!target || !Number.isInteger(tx) || !Number.isInteger(ty)
            || !isok(tx, ty))
            return 0;
        if (noTeleport(monster, state)
            && !rawEnv.monnear?.(monster, tx, ty, state)) return 0;
        if (u_at(tx, ty, state) || where === STRAT_PLAYER) {
            mx = monster.mx;
            my = monster.my;
            if (noTeleport(monster, state) || !mnearto
                || !await mnearto(monster, tx, ty, false, RLOC_MSG, {
                    ...rawEnv,
                    state,
                    random,
                })) {
                if (rlocTo) await rlocTo(monster, mx, my, {
                    ...rawEnv,
                    state,
                    random,
                });
            }
            return 0;
        }
        if (where === STRAT_GROUND) {
            const occupant = rawEnv.m_at?.(tx, ty, state);
            if (!occupant || (monster.mx === tx && monster.my === ty)) {
                if (rlocTo) await rlocTo(monster, tx, ty, {
                    ...rawEnv,
                    state,
                    random,
                });
                const objectAtTarget = on_ground(which_arti(target), state);
                if (!objectAtTarget) return 0;
                if (cansee(monster.mx, monster.my, state)) {
                    await message(
                        `${Monnam(monster, state, rawEnv)} picks up `
                        + `${distant_name(objectAtTarget, donameFresh, state)}.`,
                        state,
                        rawEnv,
                    );
                }
                if (rawEnv.objExtractSelf)
                    rawEnv.objExtractSelf(objectAtTarget, {
                        ...rawEnv,
                        state,
                    });
                if (rawEnv.mpickobj)
                    await rawEnv.mpickobj(monster, objectAtTarget, {
                        ...rawEnv,
                        state,
                    });
                else note_unported('steal.c mpickobj');
                return 1;
            }
            if (!random.rn2(5) && !noTeleport(monster, state)
                && mnexto) {
                await mnexto(monster, RLOC_MSG, {
                    ...rawEnv,
                    state,
                    random,
                });
            }
            return 0;
        }
        mx = monster.mx;
        my = monster.my;
        if (!noTeleport(monster, state) && mnearto
            && !await mnearto(monster, tx, ty, false, RLOC_MSG, {
                ...rawEnv,
                state,
                random,
            }) && rlocTo) {
            await rlocTo(monster, mx, my, {
                ...rawEnv,
                state,
                random,
            });
        }
        return 0;
    }
    }
}
