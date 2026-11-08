import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';

import {
    AIR,
    ALTAR,
    ARROW_TRAP,
    BEAR_TRAP,
    BLINDED,
    COLD_RES,
    BURN,
    CONFLICT,
    COULD_SEE,
    CLOUD,
    CORR,
    D_BROKEN,
    D_CLOSED,
    DRAIN_RES,
    DRAWBRIDGE_DOWN,
    D_ISOPEN,
    D_LOCKED,
    D_NODOOR,
    DUST,
    DOOR,
    FIRE_RES,
    FIRE_TRAP,
    FOUNTAIN,
    GRAVE,
    HALLUC,
    HEADSTONE,
    ICE,
    IRONBARS,
    LANDMINE,
    CQ_CANNED,
    IN_SIGHT,
    LADDER,
    LAVAPOOL,
    LS_OBJECT,
    M_AP_OBJECT,
    M_SEEN_COLD,
    KILLED_BY,
    MMOVE_DONE,
    MMOVE_NOTHING,
    MM_ADJACENTOK,
    MM_NOMSG,
    NO_KILLER_PREFIX,
    NO_MINVENT,
    MAX_NUM_WORMS,
    MON_DETACH,
    MOAT,
    NATTK,
    NEED_HTH_WEAPON,
    NEED_WEAPON,
    NORMAL_SPEED,
    OBJ_INVENT,
    OBJ_MIGRATING,
    OBJ_DELETED,
    OBJ_MINVENT,
    PLNMSG_HIDE_UNDER,
    POISON_RES,
    PIT,
    POOL,
    ROOM,
    ROLLING_BOULDER_TRAP,
    RLOC_MSG,
    SINK,
    STAIRS,
    STONE,
    STRAT_GOAL,
    STRAT_NONE,
    STRAT_PLAYER,
    STRAT_WAITFORU,
    STEALTH,
    THRONE,
    TIMER_OBJECT,
    UNCHANGING,
    W_NONDIGGABLE,
    W_NONPASSWALL,
    W_ARMS,
    W_WEP,
    W_RINGR,
    Upolyd,
} from '../js/const.js';
import { eatfood } from '../js/eat.js';
import { game } from '../js/gstate.js';
import { losehp } from '../js/hack.js';
import { tamedog } from '../js/dog.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';
import { initworm } from '../js/worm.js';
import {
    AD_PHYS,
    AT_GAZE,
    AT_NONE,
    AT_WEAP,
    PM_COBRA,
    PM_DEATH,
    PM_CAVE_SPIDER,
    PM_CHAMELEON,
    PM_EARTH_ELEMENTAL,
    PM_FOG_CLOUD,
    PM_FLOATING_EYE,
    PM_GELATINOUS_CUBE,
    PM_GIANT_EEL,
    PM_GIANT_ANT,
    PM_ALIGNED_CLERIC,
    PM_GIANT_RAT,
    PM_ASMODEUS,
    PM_GNOME,
    PM_HILL_GIANT,
    PM_GREMLIN,
    PM_GRID_BUG,
    PM_HUMAN,
    PM_HEZROU,
    PM_IRON_GOLEM,
    PM_KILLER_BEE,
    PM_LEPRECHAUN,
    PM_LONG_WORM,
    PM_MAIL_DAEMON,
    PM_LITTLE_DOG,
    PM_MASTER_LICH,
    PM_PONY,
    PM_RUST_MONSTER,
    PM_VAMPIRE_BAT,
    PM_VAMPIRE,
    PM_WATER_NYMPH,
    PM_VROCK,
    PM_WATER_MOCCASIN,
    PM_WERERAT,
    PM_WIZARD_OF_YENDOR,
    PM_YELLOW_LIGHT,
    AT_CLAW,
    AT_MAGC,
    AD_COLD,
    M1_TPORT,
    NON_PM,
    S_HUMAN,
    SPECIAL_PM,
} from '../js/monsters.js';
import {
    moveSimpleOrdinary,
    runSimpleMonsterAction,
    UnsupportedSimpleMonsterActionError,
    wieldMonsterItemAgainstMonster,
} from '../js/unported_monster_actions.js';
import {
    cloneu,
    mattacku,
    mdamageu as damageHeroFromMonster,
} from '../js/mhitu.js';
import { newMonster } from '../js/monst.js';
import { newmonhp, set_malign } from '../js/makemon.js';
import { mksobj, newObject } from '../js/obj.js';
import { addinv } from '../js/invent.js';
import { makemon_runtime, creationEnv, mongets } from '../js/makemon_create.js';
import { objectGenerationEnv } from '../js/object_generation.js';
import { setworn } from '../js/worn.js';
import { Ring_on, setwornEnv } from '../js/do_wear.js';
import { healup } from '../js/potion.js';
import { castmu } from '../js/mcastu.js';
import { use_offensive } from '../js/muse.js';
import { capitalizedMonsterName, mon_nam } from '../js/do_name.js';
import { encumber_msg } from '../js/pickup.js';
import { cmdq_add_key } from '../js/cmd.js';
import { ART_STING, ART_STORMBRINGER, ART_SUNSWORD } from '../js/artifacts.js';
import {
    ARROW,
    BOULDER,
    BOW,
    CORPSE,
    DAGGER,
    ELVEN_DAGGER,
    EGG,
    FOOD_RATION,
    LONG_SWORD,
    ROCK,
    RUNESWORD,
    SHIELD_OF_REFLECTION,
    SKELETON_KEY,
    SCR_SCARE_MONSTER,
    SPE_BOOK_OF_THE_DEAD,
    WAX_CANDLE,
    STATUE,
    RIN_COLD_RESISTANCE,
    WAN_COLD,
    WAN_FIRE,
} from '../js/objects.js';
import {
    m_avoid_kicked_loc,
    m_everyturn_effect,
    m_move,
    set_apparxy,
} from '../js/monmove.js';
import {
    hideunder,
    minliquid,
    movemon,
    movemon_singlemon,
    normal_shape,
} from '../js/mon.js';
import { canseemon, newsym } from '../js/display.js';
import { ttyPline } from '../js/tty_message.js';
import { cancel_monst } from '../js/zap.js';
import { clear_bypasses, m_dowear } from '../js/worn.js';
import {
    create_gas_cloud,
    create_region,
    inside_region,
} from '../js/region.js';

import {
    block_point,
    cansee,
    clear_path,
    does_block,
    m_canseeu,
    recalc_block_point,
    unblock_point,
    vision_recalc,
    vision_reset,
} from '../js/vision.js';
import { completeSecondTurnSnapshot } from './second-turn-snapshot.mjs';
import { expectTerminated } from './expect-terminated.mjs';
import { set_ulycn } from '../js/were.js';
import { free_msghistory_snapshot, msghistory_snapshot } from '../js/topl.js';
import { coreRandom, cloneIsaacContext, createCoreRandom, initRng } from '../js/rng.js';

// C permonst.h:48 has NATTK attack slots; AD_PHYS (include/monattk.h) and
// AT_NONE describe an unused slot without shortening that fixed array.
function sourceInertAttacks() {
    return Array.from({ length: NATTK }, () => ({
        aatyp: AT_NONE,
        adtyp: AD_PHYS,
        damn: 0,
        damd: 0,
    }));
}

const DATETIME = '20260725120000';
const REGION_SOURCE = readFileSync(
    new URL('../nethack-c/upstream/src/region.c', import.meta.url),
    'utf8',
);
const DOGMOVE_SOURCE = readFileSync(
    new URL('../nethack-c/upstream/src/dogmove.c', import.meta.url),
    'utf8',
);
const DOGMOVE_JS_SOURCE = readFileSync(
    new URL('../js/dogmove.js', import.meta.url),
    'utf8',
);
const SIMPLE_ACTIONS_JS_SOURCE = readFileSync(
    new URL('../js/unported_monster_actions.js', import.meta.url),
    'utf8',
);
const MONMOVE_SOURCE = readFileSync(
    new URL('../nethack-c/upstream/src/monmove.c', import.meta.url),
    'utf8',
);
const MCASTU_SOURCE = readFileSync(
    new URL('../nethack-c/upstream/src/mcastu.c', import.meta.url),
    'utf8',
);
const MTHROWU_SOURCE = readFileSync(
    new URL('../nethack-c/upstream/src/mthrowu.c', import.meta.url),
    'utf8',
);
const MUSE_SOURCE = readFileSync(
    new URL('../nethack-c/upstream/src/muse.c', import.meta.url),
    'utf8',
);

// were.c set_ulycn():232-237 calls polyself.c set_uasmon(), whose
// status_initialize(REASSESS_ONLY) (polyself.c:123) raises gu.update_all
// (botl.c:1718).
test('set_ulycn raises the full status resend', async () => {
    await prepareSelectedAction();
    // A settled game has no full status resend pending; false is the value
    // bot() leaves behind.
    game.gu.update_all = false;

    set_ulycn(PM_WERERAT, game);

    assert.equal(game.u.ulycn, PM_WERERAT);
    assert.equal(game.gu.update_all, true);
});

function rngSnapshot() {
    return {
        a: game.coreCtx.a,
        b: game.coreCtx.b,
        c: game.coreCtx.c,
        n: game.coreCtx.n,
        m: [...game.coreCtx.m],
        r: [...game.coreCtx.r],
    };
}

// The live TTY message history, oldest first, as topl.c
// msghistory_snapshot() returns it, released again for later writes.
function messageHistory() {
    const history = msghistory_snapshot(false, game);
    free_msghistory_snapshot(false, game);
    return history;
}

function deferred() {
    let resolve;
    const promise = new Promise((accept) => { resolve = accept; });
    return { promise, resolve };
}

function clearCoordinateGrid(grid) {
    for (const column of grid) column.fill(null);
}

function ordinaryMonster(pmidx, x, y, overrides = {}) {
    const species = game.mons[pmidx];
    return newMonster({
        data: species,
        m_id: 9001,
        mnum: pmidx,
        movement: NORMAL_SPEED,
        m_lev: Math.max(1, species.mlevel),
        mx: x,
        my: y,
        mux: game.u.ux,
        muy: game.u.uy,
        mhp: 5,
        mhpmax: 5,
        mcanmove: true,
        mcansee: true,
        ...overrides,
    });
}

// monmove.c:2023 -> m_move_aggress:2097/2111 consumes mattackm's result.
// Even unseen hits and misses need mhitm.c's message operation; visible
// combat also reaches pre_mm_attack's redraw/map_invisible operations.
for (const hit of [true, false]) {
    test(`ordinary monster combat forwards ${hit ? 'hit' : 'miss'} operations`, async () => {
        const target = await prepareSelectedAction({ pmidx: PM_GIANT_RAT });
        target.monster.mconf = true;
        const defender = ordinaryMonster(PM_GIANT_RAT, target.destinationX,
            target.heroY, { m_id: 9002, mhp: 100, mhpmax: 100, movement: 0 });
        target.monster.nmon = defender;
        game.level.monsters[defender.mx][defender.my] = defender;
        game.viz_array[target.heroY][target.monsterX] |= IN_SIGHT;
        game.viz_array[target.heroY][target.destinationX] |= IN_SIGHT;
        const messages = [];
        const draws = [];
        const random = {
            rn2(bound) { draws.push(['rn2', bound]); return 0; },
            rnd(bound) { draws.push(['rnd', bound]); return hit ? 1 : bound; },
            d(n, sides) { draws.push(['d', n, sides]); return n; },
        };
        const result = await moveSimpleOrdinary(target.monster, {
            state: game, random,
            message: async text => { messages.push(text); },
        });
        assert.equal(result, MMOVE_DONE);
        assert.equal(defender.mhp, hit ? 99 : 100);
        assert.match(messages[0], hit ? /bites the giant rat/u : /misses the giant rat/u);
        assert.deepEqual(draws.filter(draw => draw[0] !== 'rn2'),
            hit ? [['rnd', 20], ['d', 1, 3]] : [['rnd', 20]]);
        assert.ok(MONMOVE_SOURCE.includes('return m_move_aggress(mtmp, nix, niy);'));
        assert.ok(MONMOVE_SOURCE.includes('mstatus = mattackm(mtmp, mtmp2);'));
    });
}

function floorObject(x, y, id = 9101, otyp = ROCK) {
    const type = game.objects[otyp];
    return {
        cobj: null,
        nobj: null,
        nexthere: null,
        o_id: id,
        oclass: type.oc_class,
        ox: x,
        oy: y,
        otyp,
        owt: type.oc_weight,
        quan: 1,
        spe: 0,
        where: 1,
    };
}

function monsterObject(otyp, id = 9201) {
    return {
        ...floorObject(0, 0, id, otyp),
        ox: 0,
        oy: 0,
        where: OBJ_MINVENT,
    };
}

function installCurrentSquareEngraving(target, overrides = {}) {
    const text = 'Elbereth';
    game.head_engr = {
        engr_alloc: text.length * 3 + 3,
        engr_szeach: text.length + 1,
        engr_time: game.moves,
        engr_txt: [text, text, text],
        engr_type: DUST,
        engr_x: target.monsterX,
        engr_y: target.heroY,
        eread: false,
        erevealed: false,
        guardobjects: false,
        nowipeout: false,
        nxt_engr: null,
        ...overrides,
    };
}

async function prepareSelectedAction({
    adjacentHero = false,
    pmidx = PM_GIANT_RAT,
} = {}) {
    const replay = await runSegment({
        // This arbitrary seed supplies initialized catalogs, map, vision,
        // display, and input state; each case replaces the selected action.
        seed: 2026072503,
        datetime: DATETIME,
        nethackrc: 'OPTIONS=name:AtomicMonster,role:Healer,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,'
            + '!splash_screen,pettype:none',
        moves: '',
    });
    const heroX = 10;
    const heroY = 10;
    const monsterX = adjacentHero ? heroX - 1 : heroX - 3;
    const destinationX = monsterX + 1;

    game.u.ux = game.u.ux0 = heroX;
    game.u.uy = game.u.uy0 = heroY;
    game.u.uinwater = false;
    game.u.ustuck = null;
    game.u.usteed = null;
    game.u.utotype = 0;
    game.moves = 2;
    game.context.bypasses = false;
    // decl.c's go.occupation, which monmove.c dochugw() reads for every
    // monster the scan moves. Cleared so the scan below is the idle-hero
    // case; the line used to name a bare game.occupation that nothing
    // assigns.
    (game.go ??= {}).occupation = null;
    game.head_engr = null;

    clearCoordinateGrid(game.level.monsters);
    clearCoordinateGrid(game.level.objects);
    game.level.monlist = null;
    game.level.objlist = null;
    game.level.buriedobjlist = null;
    game.level.traps = [];
    game.level.regions = [];
    game.level.flags.has_temple = false;
    game.level.flags.shortsighted = false;

    for (let x = monsterX - 1; x <= monsterX + 1; ++x) {
        for (let y = heroY - 1; y <= heroY + 1; ++y) {
            const location = game.level.at(x, y);
            location.typ = STONE;
            location.flags = 0;
            location.flags = W_NONDIGGABLE | W_NONPASSWALL;
        }
    }
    // The source square and straight route to the remembered hero are clear.
    // Only destinationX is a legal neighboring candidate.
    for (let x = monsterX; x <= heroX; ++x) {
        const location = game.level.at(x, heroY);
        location.typ = ROOM;
        location.flags = 0;
    }

    const monster = ordinaryMonster(pmidx, monsterX, heroY);
    game.level.monlist = monster;
    game.level.monsters[monsterX][heroY] = monster;
    // COULD_SEE makes the aligned ordinary monster keep approach=1 and
    // suppress item search unless a case clears this bit explicitly.
    game.viz_array[heroY][monsterX] |= COULD_SEE;
    return {
        destinationX,
        heroY,
        monster,
        monsterX,
        replay,
    };
}

function observedCoreRandom(state) {
    const core = createCoreRandom(state.coreCtx, state);
    const draws = [];
    const random = Object.fromEntries(
        Object.entries(core).map(([name, operation]) => [name, (...args) => {
            const value = operation(...args);
            draws.push({ name, args, value });
            return value;
        }]),
    );
    return { draws, random };
}

// One live movemon() scan over the level, bound the way js/allmain.js
// moveElapsedTurnMonster() and the live arm of regionEffectEnv() bind it. It
// covers the parts of a monster turn that runSimpleMonsterAction() does not:
// mon.c movemon_singlemon()'s every-turn effect and liquid check, and
// movemon()'s dmonsfree() tail. Restrap, Conflict combat and the deferred
// level change are left out because no fixture here reaches them.
async function runLiveMonsterScan() {
    const regionEnv = {
        blockPoint: (x, y) => block_point(x, y, game),
        unblockPoint: (x, y) => unblock_point(x, y, game),
        doesBlock: (x, y, location) => does_block(x, y, location, game),
        canSee: (x, y) => cansee(x, y, game),
        newsym: (x, y) => newsym(x, y),
        message: (text) => ttyPline(text, game),
    };
    game.context.mon_moving = true;
    try {
        return await movemon({
            state: game,
            moveSingleMonster: (monster, env) => movemon_singlemon(monster, {
                ...env,
                everyTurnEffect: (subject, subjectEnv) => m_everyturn_effect(
                    subject,
                    {
                        ...subjectEnv,
                        createGasCloud: (x, y, size, damage, effectEnv) =>
                            create_gas_cloud(x, y, size, damage, {
                                ...effectEnv,
                                ...regionEnv,
                            }),
                    },
                ),
                visionRecalc: vision_recalc,
                clearBypasses: (subjectEnv) => clear_bypasses(subjectEnv),
                minLiquid: (subject, subjectEnv) => minliquid(subject, {
                    ...subjectEnv,
                    canSee: (x, y) => cansee(x, y, game),
                    message: ttyPline,
                }),
                dowear: (subject, creation, subjectEnv) =>
                    m_dowear(subject, creation, subjectEnv),
                restrap: () => assert.fail('no fixture here is a hider'),
                canSeeMonster: (subject) => canseemon(subject, game),
                hideUnder: (subject, subjectEnv) => hideunder(subject, {
                    ...subjectEnv,
                    redraw: (x, y) => newsym(x, y),
                }),
                canSeeHero: (subject) => m_canseeu(subject, game),
                canSeeSquare: (x, y) => cansee(x, y, game),
                fightMonster: () => assert.fail('no fixture here has Conflict'),
                dochugwAction: (subject, _chug, subjectEnv) =>
                    runSimpleMonsterAction(subject, subjectEnv),
            }),
            clearBypasses: (env) => clear_bypasses(env),
            deferredGoto: () => assert.fail('no fixture here changes level'),
        });
    } finally {
        game.context.mon_moving = false;
    }
}

function directMattackuEnv(state, random, messages) {
    const message = async text => {
        messages.push(text);
    };
    const unsupported = reason => {
        throw new UnsupportedSimpleMonsterActionError(reason);
    };
    const loseSpellHp = async (amount, killer, format) =>
        losehp(amount, killer, format, state, {
            state,
            fromMonster: true,
            message,
        });
    return {
        state,
        random,
        message,
        unsupported,
        useOffensiveItem: use_offensive,
        castMonsterSpell: (subject, attack, thinksFound, found, spellEnv) => {
            const spellState = spellEnv.state ?? state;
            const spellMessage = spellEnv.message ?? message;
            return castmu(subject, attack, thinksFound, found, {
                ...spellEnv,
                state: spellState,
                random: spellEnv.random ?? random,
                losehp: loseSpellHp,
                encumberMessage: encumber_msg,
                monsterName: monster =>
                    capitalizedMonsterName(monster, spellState),
                monnam: monster => mon_nam(monster, spellState, spellEnv),
                message: spellMessage,
                mdamageu: (monster, damage) => damageHeroFromMonster(
                    monster,
                    damage,
                    spellState,
                    spellEnv,
                ),
            });
        },
    };
}

test('initialized adjacent Asmodeus reaches AD_COLD through real mattacku',
    async () => {
        const target = await prepareSelectedAction({ adjacentHero: true });
        // Remove the helper's ordinary placeholder before canonical creation;
        // the map/list/grid are empty at the selected adjacent ROOM square.
        game.level.monlist = null;
        game.level.monsters[target.monsterX][target.heroY] = null;
        assert.equal(game.level.at(target.monsterX, target.heroY).typ, ROOM);
        assert.equal(game.level.monsters[target.monsterX][target.heroY], null);

        const asmodeus = await makemon_runtime(
            game.mons[PM_ASMODEUS],
            target.monsterX,
            target.heroY,
            NO_MINVENT | MM_ADJACENTOK | MM_NOMSG,
            objectGenerationEnv({ state: game }),
        );
        assert.ok(asmodeus);
        assert.equal(game.level.monlist, asmodeus);
        assert.equal(game.level.monsters[target.monsterX][target.heroY], asmodeus);
        assert.equal(asmodeus.m_lev, 49);
        assert.equal(asmodeus.mhp, 198);
        assert.equal(asmodeus.mhpmax, 198);
        assert.equal(asmodeus.cham, NON_PM);
        asmodeus.mtame = 0;
        asmodeus.mpeaceful = false;
        set_malign(asmodeus, game);
        mongets(asmodeus, WAN_COLD, creationEnv({ state: game }));
        mongets(asmodeus, WAN_FIRE, creationEnv({ state: game }));

        const ring = mksobj(
            RIN_COLD_RESISTANCE,
            true,
            false,
            objectGenerationEnv({ state: game }),
        );
        addinv(ring, objectGenerationEnv({ state: game }));
        await setworn(ring, W_RINGR, setwornEnv(game));
        await Ring_on(ring, game);
        const hpBeforeHeal = game.u.uhp;
        const hpmaxBeforeHeal = game.u.uhpmax;
        await healup(400, 8, true, true, game);
        assert.equal(Upolyd(game.u), false);
        assert.equal(game.u.umonnum, game.u.umonster);
        assert.equal(game.u.umonnum, game.urole.mnum);
        assert.equal(game.urace.filecode, 'Hum');
        assert.ok(game.u.uhp > hpBeforeHeal);
        assert.equal(game.u.uhp, game.u.uhpmax);
        assert.ok(game.u.uhpmax >= hpmaxBeforeHeal);
        assert.ok(game.u.uhp > 16);
        assert.ok(game.u.uprops[COLD_RES].extrinsic);
        assert.equal(game.uright, ring);
        assert.ok(asmodeus.data.mattk.some(attack =>
            attack.aatyp === AT_CLAW && attack.adtyp === AD_PHYS));
        assert.ok(asmodeus.data.mattk.some(attack =>
            attack.aatyp === AT_MAGC && attack.adtyp === AD_COLD));
        const alignmentRandom = createCoreRandom(game.coreCtx, game);
        set_apparxy(asmodeus, { state: game, random: alignmentRandom });
        assert.equal(asmodeus.mux, game.u.ux);
        assert.equal(asmodeus.muy, game.u.uy);
        game.viz_array[target.heroY][target.monsterX] |= COULD_SEE | IN_SIGHT;

        const beforeHp = game.u.uhp;
        const randomStateBefore = rngSnapshot();
        const { draws, random } = observedCoreRandom(game);
        const messages = [];
        let actionError;
        let actionResult;
        try {
            actionResult = await mattacku(
                asmodeus,
                directMattackuEnv(game, random, messages),
            );
        } catch (error) {
            actionError = error;
        }
        const receipt = {
            task: 'fix-direct-mattacku-cold-cast-source-parity-20261018',
            base: 'dcacee9ac43c57097f6980ed7a4b6544277f51e1',
            phase: actionError?.message?.includes('castmu() elemental spell type')
                ? 'mattacku reached castmu unsupported AD_COLD'
                : actionError ? 'action threw before confirmed AD_COLD target'
                    : 'action returned',
            error: actionError ? {
                name: actionError.name,
                message: actionError.message,
                stack: actionError.stack,
            } : null,
            result: actionResult ?? null,
            draws,
            messages,
            actor: {
                id: asmodeus.m_id,
                species: asmodeus.data.pmidx,
                x: asmodeus.mx,
                y: asmodeus.my,
                mux: asmodeus.mux,
                muy: asmodeus.muy,
                hp: asmodeus.mhp,
                seen: asmodeus.seen_resistance,
            },
            hero: { hpBefore: beforeHp, hpAfter: game.u.uhp },
            randomStateBefore,
            randomStateAfter: rngSnapshot(),
        };
        writeFileSync(
            '.cache/initialized-direct-mattacku-cold/original-source-attempt.json',
            JSON.stringify(receipt, (_key, value) => typeof value === 'bigint'
                ? { $bigint: value.toString() } : value, 2) + '\n',
        );
        assert.equal(asmodeus.mx, target.monsterX);
        assert.equal(asmodeus.my, target.heroY);
        const summonDraw = draws.find(draw =>
            draw.name === 'rn2' && draw.args[0] === 16);
        assert.ok(summonDraw, 'real summonmu rn2(16) draw was observed');
        assert.notEqual(summonDraw.value, 0,
            'actual seeded RNG must take the non-summon branch');
        assert.ok(messages.some(text => /casts a spell at you/u.test(text)),
            'the ordinary attack loop announced its adjacent magical attack');
        if (actionError) {
            assert.match(actionError.message,
                /castmu\(\) elemental spell type/u,
                'the only accepted red is the omitted AD_COLD arm');
            assert.fail(
                'real mattacku reached the existing AD_COLD refusal; source arm is missing',
            );
        }

        // Final green path continues here after the original-source target red.
        assert.ok(game.u.uhp <= beforeHp);
        assert.ok(messages.some(text => /covered in frost/u.test(text)));
        assert.ok(messages.some(text => /resist the effects/u.test(text)));
        assert.ok(asmodeus.seen_resistance & M_SEEN_COLD);
        assert.equal(game.level.at(game.u.ux, game.u.uy).typ, ROOM);
        const frostIndex = messages.findIndex(text => /covered in frost/u.test(text));
        assert.ok(frostIndex > 0);
        assert.ok(messages.slice(0, frostIndex).some(text =>
            /It hits!/u.test(text)),
        'the real prior claw attack must remain before AD_COLD');
    });

// monmove.c:538/564/499: a non-brave adjacent gremlin fears artifact light.
test('Sunsword flight forwards canonical live operations', async () => {
    const target = await prepareSelectedAction({ adjacentHero: true, pmidx: PM_GREMLIN });
    game.uwep = newObject({ otyp: LONG_SWORD, oartifact: ART_SUNSWORD, lamplit: true });
    game.viz_array[target.heroY][target.monsterX] |= IN_SIGHT;
    const monster = game.level.monlist;
    const messages = [];
    const draws = [];
    const random = {
        // Nonzero rn2(5) is !bravegremlin; rn2(7) selects rnd(10).
        // Nonzero rn2(10) selects the painful-light message over speech.
        rn2(bound) { draws.push(['rn2', bound]); return 1; },
        rnd(bound) { draws.push(['rnd', bound]); return 9; },
        d(number, sides) { draws.push(['d', number, sides]); return number; },
    };
    await runSimpleMonsterAction(monster, {
        state: game, random, message: async text => { messages.push(text); },
    });
    assert.deepEqual(draws.slice(0, 4), [['rn2', 5], ['rn2', 7], ['rnd', 10], ['rn2', 10]]);
    assert.equal(monster.mflee, true);
    assert.equal(monster.mfleetim, 9);
    assert.deepEqual(messages, ['The gremlin flees from the painful light of Sunsword.']);
    assert.ok(MONMOVE_SOURCE.includes('monflee(mtmp, rnd(rn2(7) ? 10 : 100), TRUE, TRUE);'));
});

test('Vrock fear creates its gas cloud through the monster action adapter', async () => {
    const target = await prepareSelectedAction({
        adjacentHero: true,
        pmidx: PM_VROCK,
    });
    // Empty attacks keep the case on monmove.c:distfleeck() and
    // monflee() after the cloud instead of opening combat input.
    target.monster.data = {
        ...target.monster.data,
        mattk: sourceInertAttacks(),
    };
    const heroX = target.monsterX + 1;
    // The C scare predicate sees this scroll under the hero; its object id
    // is arbitrary because only otyp and coordinates select the branch.
    installObject(target, floorObject(
        heroX,
        target.heroY,
        9101,
        SCR_SCARE_MONSTER,
    ));
    game.viz_array[target.heroY][target.monsterX] |= IN_SIGHT;

    const monster = game.level.monlist;
    const draws = [];
    const messages = [];
    const random = {
        // These choices take distfleeck's non-brave, 10-turn flight path;
        // rn2(25) then selects the source Vrock cloud-cooldown value.
        rn2(bound) {
            draws.push(['rn2', bound]);
            return Math.min(1, bound - 1);
        },
        rnd(bound) {
            draws.push(['rnd', bound]);
            return 5;
        },
        d(number) {
            return number;
        },
    };
    await runSimpleMonsterAction(monster, {
        state: game,
        random,
        message: async text => { messages.push(text); },
    });

    assert.deepEqual(draws.slice(0, 5), [
        ['rn2', 5],
        ['rn2', 7],
        ['rnd', 10],
        ['rn2', 25],
        ['rn2', 4],
    ]);
    assert.equal(monster.mspec_used, 76);
    assert.equal(monster.mflee, true);
    const gasCloud = game.level.regions.find(region => region.arg === 8);
    assert.ok(gasCloud, 'the source damage-8 cloud enters the level region list');
    assert.ok(gasCloud.rects.some(rect => (
        heroX >= rect.lx && heroX <= rect.hx
        && target.heroY >= rect.ly && target.heroY <= rect.hy
    )), 'the adjacent hero square is included in the cloud');
    assert.ok(messages.some(text => /turns to flee/u.test(text)));
    assert.ok(messages.some(text => /enveloped in a cloud of noxious gas/u.test(text)));
});

async function prepareStartingPetAction(pmidx) {
    const target = await prepareSelectedAction({ pmidx });
    const { monster } = target;
    monster.data = game.mons[pmidx];
    monster.mnum = pmidx;
    monster.m_lev = Math.max(1, monster.data.mlevel);
    monster.mhp = monster.mhpmax = 8;
    monster.mpeaceful = true;
    monster.mtame = 10;
    monster.mextra = {
        edog: {
            apport: 10,
            dropdist: 10000,
            droptime: 0,
            hungrytime: 1000,
            mhpmax_penalty: 0,
            ogoal: { x: 0, y: 0 },
            whistletime: 0,
        },
    };
    game.context.startingpet_mid = monster.m_id;
    game.context.startingpet_typ = pmidx;
    return target;
}

function installObject(target, object) {
    game.level.objects[object.ox][object.oy] = object;
    game.level.objlist = object;
    target.object = object;
}

test('complete retry snapshot includes every audited scheduler root',
    async () => {
        const target = await prepareSelectedAction();
        const snapshot = completeSecondTurnSnapshot(game, target.replay);

        assert.equal(
            snapshot.command.commandDispatchCount,
            game._commandDispatchCount,
        );
        assert.equal(snapshot.turn.moves, game.moves);
        assert.equal(snapshot.turn.heroSeq, game.hero_seq ?? null);
        assert.equal(
            snapshot.scheduler.somebodyCanMove,
            game.somebody_can_move ?? null,
        );
        assert.equal(
            snapshot.scheduler.visionFullRecalc,
            game.vision_full_recalc ?? null,
        );
        assert.equal(
            snapshot.scheduler.purgeMonsters,
            game.iflags.purge_monsters ?? null,
        );
        assert.deepEqual(snapshot.track, game.track);
        assert.deepEqual(
            snapshot.world.vision,
            game.viz_array.map((row) => [...row]),
        );
    });

test('clear_bypasses clears every non-level object owner', async () => {
    await prepareSelectedAction();
    const migrating = floorObject(4, 4, 9301);
    migrating.where = OBJ_MIGRATING;
    migrating.bypass = true;
    const deleted = floorObject(5, 4, 9302);
    deleted.where = OBJ_DELETED;
    deleted.bypass = true;
    const dog = ordinaryMonster(PM_GNOME, 7, 7, { m_id: 9303 });
    dog.minvent = monsterObject(ROCK, 9304);
    dog.minvent.bypass = true;
    const ball = floorObject(8, 8, 9305);
    ball.bypass = true;
    const chain = floorObject(8, 8, 9306);
    chain.bypass = true;

    game.gm.migrating_objs = migrating;
    game.go.objs_deleted = deleted;
    game.gm.mydogs = dog;
    game.uball = ball;
    game.uchain = chain;
    game.u.uball = ball;
    game.u.uchain = chain;
    game.context.bypasses = true;

    clear_bypasses(game);
    assert.equal(migrating.bypass, false);
    assert.equal(deleted.bypass, false);
    assert.equal(dog.minvent.bypass, false);
    assert.equal(ball.bypass, false);
    assert.equal(chain.bypass, false);
    assert.equal(game.context.bypasses, false);
});

test('complete retry snapshot detects each deferred output owner',
    async () => {
        const cases = [
            {
                name: 'command count',
                mutate: ({ state }) => {
                    state.commandCount = 7;
                },
            },
            {
                name: 'last command count',
                mutate: ({ state }) => {
                    state.lastCommandCount = 9;
                },
            },
            {
                name: 'did nothing output flag',
                mutate: ({ state }) => {
                    state.did_nothing_flag = !state.did_nothing_flag;
                },
            },
            {
                name: 'status display owner',
                mutate: ({ state }) => {
                    state.disp.botl = !state.disp.botl;
                },
            },
            {
                name: 'complete interface flags',
                mutate: ({ state }) => {
                    state.iflags.menu_requested =
                        !state.iflags.menu_requested;
                },
            },
            {
                name: 'program state',
                mutate: ({ state }) => {
                    state.program_state.gameover =
                        !state.program_state.gameover;
                },
            },
            {
                name: 'burden message state',
                mutate: ({ state }) => {
                    state.go.oldcap += 1;
                },
            },
            {
                name: 'capacity cache',
                mutate: ({ state }) => {
                    state.gw.wc += 1;
                },
            },
            // Without the five owners below the snapshot cannot see a monster
            // turn that left a timer, a light source, or a birth count behind.
            {
                name: 'timer queue',
                mutate: ({ state }) => {
                    state.gt.timer_base = {
                        func_index: 0,
                        kind: TIMER_OBJECT,
                        timeout: (state.moves ?? 0) + 50,
                        timer_id: (state.svt?.timer_id ?? 0) + 1,
                        arg: { o_id: 8801 },
                        next: state.gt.timer_base,
                    };
                },
            },
            {
                name: 'next timer identifier',
                mutate: ({ state }) => {
                    state.svt.timer_id += 1;
                },
            },
            {
                name: 'monster vitals',
                mutate: ({ state }) => {
                    state.mvitals[PM_GNOME].born += 1;
                },
            },
            {
                name: 'light source list',
                mutate: ({ state }) => {
                    state.gl.light_base = {
                        x: state.u.ux,
                        y: state.u.uy,
                        range: 2,
                        type: LS_OBJECT,
                        flags: 0,
                        id: { o_id: 8802 },
                        next: state.gl.light_base,
                    };
                },
            },
            {
                name: 'game option flags',
                mutate: ({ state }) => {
                    state.flags.mention_walls = !state.flags.mention_walls;
                },
            },
            {
                name: 'display RNG',
                mutate: ({ state }) => {
                    state.displayCtx.a += 1n;
                },
            },
            {
                name: 'glyph notice queue',
                mutate: ({ state }) => {
                    state._glyphUpdateNotices = [{ message: 'pending' }];
                },
            },
            {
                name: 'glyph frame tracker',
                mutate: ({ state }) => {
                    state._glyphNoticeFrameTracker = {
                        pending: new Map([[17, { gnew: 1 }]]),
                    };
                },
            },
            {
                name: 'glyph notice emission',
                mutate: ({ state }) => {
                    state._emittingGlyphUpdateNotices = true;
                },
            },
            {
                name: 'pending animation frame',
                mutate: ({ replay }) => {
                    replay._pendingAnimFrames.push({
                        cursor: [3, 4, 1],
                        screen: 'pending',
                    });
                },
            },
            {
                name: 'RNG capture index',
                mutate: ({ replay }) => {
                    replay._lastRngIdx += 1;
                },
            },
        ];

        for (const owner of cases) {
            const target = await prepareSelectedAction();
            const before = completeSecondTurnSnapshot(game, target.replay);
            owner.mutate({ replay: target.replay, state: game });
            assert.notDeepEqual(
                completeSecondTurnSnapshot(game, target.replay),
                before,
                owner.name,
            );
        }
    });

test('cancellation routes chameleon redraws through its injected seam',
    async () => {
    const target = await prepareSelectedAction({ pmidx: PM_GNOME });
    target.monster.cham = PM_CHAMELEON;
    const monster = target.monster;
    const redraws = [];
    const random = {
        rn2: (bound) => bound - 1,
        rnd: () => 1,
        d: (number) => number,
        rn1: (_range, base) => base,
        rne: () => 1,
        rnl: () => 1,
        rnz: (value) => value,
    };

    assert.equal(await cancel_monst(
        monster,
        null,
        true,
        false,
        false,
        game,
        {
            random,
            message: async () => {},
            redraw: (x, y) => { redraws.push([x, y]); },
        },
    ), true);

    assert.equal(monster.cham, NON_PM);
    assert.equal(monster.data, game.mons[PM_CHAMELEON]);
    assert.deepEqual(redraws, [
        [monster.mx, monster.my], // newcham() redraws the changed form.
        [monster.mx, monster.my], // normal_shape() redraws after clearing cham.
    ]);
});

test('normal_shape routes mimic redraw through its injected seam',
    async () => {
    const target = await prepareSelectedAction({ pmidx: PM_GNOME });
    target.monster.cham = NON_PM;
    target.monster.m_ap_type = M_AP_OBJECT;
    // A wax candle is a valid object appearance; its identity is immaterial
    // because seemimic() clears the disguise before the redraw.
    target.monster.mappearance = WAX_CANDLE;
    const monster = target.monster;
    const redraws = [];

    await normal_shape(monster, game, {
        redraw: (x, y) => { redraws.push([x, y]); },
    });

    assert.equal(monster.m_ap_type, 0);
    assert.equal(monster.mappearance, 0);
    assert.equal(monster.msleeping, 1);
    assert.deepEqual(redraws, [[monster.mx, monster.my]]);
});

// C ref: uhitm.c mhitm_ad_drst():3149-3165 sends a monster's poisonous bite
// to attrib.c poisoned(); its rn2(30) > 5 arm (attrib.c:384-391) takes
// rn1(10,6) HP through hack.c losehp():4267-4272, which takes it out of u.mh
// for a polymorphed hero and calls rehumanize(). Under Unchanging,
// polyself.c rehumanize():1372-1376 names the killer and calls done(DIED).
test('lethal poison kills a polymorphed Unchanging hero through rehumanize',
    async () => {
        const target = await prepareSelectedAction({ adjacentHero: true });
        game.viz_array[target.heroY][target.monsterX] |= IN_SIGHT;
        const moccasin = game.mons[PM_WATER_MOCCASIN];
        target.monster.data = {
            ...moccasin,
            // A 0d0 bite keeps hitmu() from entering mhitu.c mdamageu(),
            // whose polymorphed-hero arm is outside this fixture; the AD_DRST
            // arm still reaches poisoned().
            mattk: moccasin.mattk.map((attack, index) => index === 0
                ? { ...attack, damn: 0, damd: 0 } : attack),
        };
        target.monster.mnum = PM_WATER_MOCCASIN;
        target.monster.m_lev = 5;
        // A grid bug with 1 HP: any poison damage is lethal to the form.
        game.u.umonnum = PM_GRID_BUG;
        game.u.umonster = PM_HUMAN;
        game.u.mh = 1;
        game.u.mhmax = 1;
        game.youmonst.data = game.mons[PM_GRID_BUG];
        game.u.uprops[UNCHANGING] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
        // No inventory keeps magic negation (uhitm.c:87) at armpro 0, and no
        // Poison_resistance keeps attrib.c:338 from stopping the poison.
        game.invent = null;
        game.u.uprops[POISON_RES] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
        const draws = [];
        const random = {
            rn2: (bound) => {
                draws.push(`rn2(${bound})`);
                // rn2(8)=0 passes uhitm.c:3160 `!rn2(8)`; rn2(10)=9 keeps
                // the MC check at uhitm.c:87 from negating; rn2(30)=6 takes
                // attrib.c:384's `i > 5` HP-damage arm.
                return bound === 8 ? 0 : bound === 10 ? 9
                    : bound === 30 ? 6 : 1;
            },
            // rnd(20)=1 is below the to-hit total at mhitu.c:806.
            rnd: (bound) => { draws.push(`rnd(${bound})`); return 1; },
            d: (n, sides) => { draws.push(`d(${n},${sides})`); return n; },
            // rn1(10,6) answers its base, 6 HP, against u.mh = 1.
            rn1: (_n, base) => { draws.push(`rn1(${base})`); return base; },
            rne: (bound) => { draws.push(`rne(${bound})`); return 1; },
            rnl: (bound) => { draws.push(`rnl(${bound})`); return 1; },
            rnz: (bound) => { draws.push(`rnz(${bound})`); return bound; },
        };

        // Spaces dismiss each --More-- and take the default disclosure
        // answers of end.c done().
        for (let i = 0; i < 16; ++i) game.nhDisplay.pushKey(' '.charCodeAt(0));
        await expectTerminated(
            () => runSimpleMonsterAction(game.level.monlist, {
                state: game,
                random,
            }),
            'the poisoned Unchanging form dies',
        );
        const history = messageHistory();

        assert.deepEqual(draws, [
            'rn2(5)', // monmove.c:538 distfleeck() bravegremlin
            'rnd(20)', // mhitu.c:806 to-hit
            'd(0,0)', // mhitu.c:1187 base damage of the 0d0 bite
            'rn2(10)', // uhitm.c:87 magic-cancellation check
            'rn2(8)', // uhitm.c:3160 poison chance
            'rn2(30)', // attrib.c:366 poisoned() severity, fatal = 30
            'rn1(6)', // attrib.c:388 rn1(10, 6) HP loss
        ]);
        // mhitu.c hitmsg() for AT_BITE, then attrib.c poisoned():333-336
        // for a reason without "poison" in it.
        assert.ok(history.includes('The water moccasin bites!  '
            + "The water moccasin's bite was poisoned!"), history.join('\n'));
        assert.deepEqual(game.killer, {
            format: NO_KILLER_PREFIX,
            name: 'killed while stuck in creature form',
        });
        // end.c done():1071-1076 forces u.uhp and u.mh to zero.
        assert.equal(game.u.mh, 0);
    });

// C ref: artifact.c artifact_hit():1694-1713, the youdefend arm of
// Stormbringer's drain, calls exper.c losexp("life drainage"), which at
// level 1 sets a KILLED_BY killer and calls done(DIED) (exper.c:233-237).
test('a monster Stormbringer hit drains a level-one hero to death',
    async () => {
    const target = await prepareSelectedAction({
        adjacentHero: true,
        pmidx: PM_GNOME,
    });
    const attacks = sourceInertAttacks();
    attacks[0] = { aatyp: AT_WEAP, adtyp: AD_PHYS, damn: 1, damd: 1 };
    target.monster.data = { ...target.monster.data, mattk: attacks };
    target.monster.m_lev = 30;
    const weapon = newObject({
        ...monsterObject(RUNESWORD, 9212),
        oartifact: ART_STORMBRINGER,
        owornmask: W_WEP,
    });
    weapon.ocarry = target.monster;
    target.monster.minvent = weapon;
    target.monster.mw = weapon;
    game.artiexist[ART_STORMBRINGER].exists = 1;
    game.u.ulevel = 1;
    game.u.uexp = 123;
    game.u.uprops[DRAIN_RES] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    const random = {
        // The drain itself rolls nothing (artifact.c:1645); 1 keeps the
        // monster turn's other rn2 gates off their rare branches.
        rn2: () => 1,
        rnd: () => 1,
        d: (number) => number,
        rn1: (_range, base) => base,
        rne: () => 1,
        rnl: () => 1,
        rnz: (value) => value,
    };

    // Spaces dismiss each --More-- and take the default disclosure answers
    // of end.c done().
    for (let i = 0; i < 16; ++i) game.nhDisplay.pushKey(' '.charCodeAt(0));
    await expectTerminated(
        () => runSimpleMonsterAction(game.level.monlist, {
            state: game,
            random,
        }),
        'the level-one drain ends the game',
    );
    const history = messageHistory();

    // artifact.c:1707-1709 for a hero who can see, then exper.c:223-224
    // before done(DIED).
    const goodbye = history.indexOf('Goodbye level 1.');
    assert.ok(goodbye > 0, history.join('\n'));
    assert.ok(history[goodbye - 1].endsWith(
        'The black blade drains your life!'), history[goodbye - 1]);
    assert.deepEqual(game.killer, {
        format: KILLED_BY,
        name: 'life drainage',
    });
});

test('a hallucinated pickup names the monster through the display RNG',
    async () => {
        // mon.c mpickstuff():1893-1901 calls Monnam() only inside the visible,
        // verbose message arm. Under Hallucination, do_name.c x_monnam()
        // replaces the species through rndmonnam(), consuming the display RNG.
        const target = await prepareSelectedAction({ pmidx: PM_GNOME });
        installObject(target, floorObject(
            target.destinationX,
            target.heroY,
            9101,
            FOOD_RATION,
        ));
        game.viz_array[target.heroY][target.destinationX] |=
            COULD_SEE | IN_SIGHT;
        game.u.uprops[HALLUC].intrinsic = 1;

        // The live pass prints the pickup and spends the display draw.
        const messages = [];
        let displayDraws = 0;
        await runSimpleMonsterAction(target.monster, {
            state: game,
            message: async (line) => messages.push(line),
            redraw: () => {},
            // The first draw selects bogusmon(); byte offset 3241 selects
            // the source record "-Barney the dinosaur". do_name.c
            // bogon_is_pname() treats '-' as a personal-name marker, so
            // Monnam() must suppress ARTICLE_THE before capitalizing it.
            displayRandom(bound) {
                const result = displayDraws++ === 0 ? SPECIAL_PM : 3241;
                assert.ok(result >= 0 && result < bound);
                return result;
            },
        });
        assert.equal(messages.length, 1);
        assert.equal(
            messages[0],
            'Barney the dinosaur picks up a food ration.',
        );
        // get_rnd_line() makes ten attempts at the same overlong partial
        // record before falling back to the following complete line.
        assert.equal(displayDraws, 11);
    });

test('a ranged attacker spends its turn wielding a bow',
    async () => {
        const target = await prepareSelectedAction({ pmidx: PM_GNOME });
        const arrow = monsterObject(ARROW);
        // 9202 differs from monsterObject()'s default 9201 arrow identity, as
        // C's inventory chain requires distinct object IDs for distinct items.
        const bow = monsterObject(BOW, 9202);
        arrow.nobj = bow;
        target.monster.minvent = arrow;
        target.monster.mw = null;
        target.monster.weapon_check = NEED_WEAPON;
        game.viz_array[target.heroY][target.monsterX] |= IN_SIGHT;
        game.viz_array[target.heroY][target.destinationX] |= IN_SIGHT;
        // The constructed action starts after the command loop has already
        // dismissed startup output. Clearing that inherited line prevents the
        // wield message from asking this direct caller for an unrelated key.
        game._pending_message = '';
        game.nhDisplay.toplines = '';
        game.nhDisplay.toplin = 0;
        assert.equal(target.monster.mw, null);
        assert.equal(bow.owornmask ?? 0, 0);

        await runSimpleMonsterAction(target.monster, { state: game });
        assert.equal(target.monster.mw, bow);
        assert.equal(bow.owornmask, W_WEP);
        assert.equal(target.monster.weapon_check, NEED_WEAPON);
        assert.match(game.nhDisplay.toplines, /The gnome wields a bow!/u);
    });

// C refs: mthrowu.c thrwmu():1183-1189 and weapon.c
// mon_wield_item():813-816, 848-888. A ranged attacker may already wield a
// different ordinary weapon when NEED_RANGED_WEAPON selects its launcher;
// mon_wield_item() replaces that current weapon, reports the switch, and
// spends the turn before thrwmu() can enter missile flight.
test('a ranged attacker replaces a non-welded current weapon before flight',
    async () => {
        const target = await prepareSelectedAction({ pmidx: PM_GNOME });
        const arrow = monsterObject(ARROW, 9201);
        const bow = monsterObject(BOW, 9202);
        const dagger = monsterObject(DAGGER, 9203);
        arrow.nobj = bow;
        bow.nobj = dagger;
        dagger.owornmask = W_WEP;
        target.monster.minvent = arrow;
        target.monster.mw = dagger;
        target.monster.weapon_check = NEED_WEAPON;
        game.viz_array[target.heroY][target.monsterX] |= IN_SIGHT;
        game.viz_array[target.heroY][target.destinationX] |= IN_SIGHT;
        game._pending_message = '';
        game.nhDisplay.toplines = '';
        game.nhDisplay.toplin = 0;

        assert.equal(target.monster.mw, dagger);
        assert.equal(dagger.owornmask, W_WEP);
        assert.equal(bow.owornmask ?? 0, 0);

        await runSimpleMonsterAction(target.monster, { state: game });
        assert.equal(target.monster.mw, bow);
        assert.equal(dagger.owornmask, 0);
        assert.equal(bow.owornmask, W_WEP);
        assert.equal(target.monster.weapon_check, NEED_WEAPON);
        assert.match(
            game.nhDisplay.toplines,
            /The gnome wields a bow!/u,
        );
    });

test('live fog leaves its vapor behind after one monster scan',
    async () => {
        const target = await prepareSelectedAction({ pmidx: PM_FOG_CLOUD });
        target.monster.movement = NORMAL_SPEED;
        game.u.umovement = 0;
        recalc_block_point(target.monsterX, target.heroY, game);
        assert.equal(clear_path(
            target.monsterX - 1,
            target.heroY,
            target.monsterX + 1,
            target.heroY,
        ), 1);
        // No key is queued: a harmless vapor and an unseen fog print nothing
        // in C, so any --More-- fails the case on the empty input queue.

        // m_everyturn_effect() first creates one harmless vapor square around
        // the fog. m_move() then leaves it through m_in_out_region(), which
        // removes the cached ID before relocation.
        await runLiveMonsterScan();

        const fog = game.level.monlist;
        assert.deepEqual(
            [fog?.mx, fog?.my],
            [target.destinationX, target.heroY],
        );
        assert.equal(game.level.regions.length, 1);
        const vapor = game.level.regions[0];
        assert.deepEqual(vapor.monsters, []);
        assert.deepEqual(vapor.bounding_box, {
            lx: target.monsterX,
            ly: target.heroY,
            hx: target.monsterX,
            hy: target.heroY,
        });
        assert.deepEqual(vapor.rects, [{
            lx: target.monsterX,
            ly: target.heroY,
            hx: target.monsterX,
            hy: target.heroY,
        }]);
        assert.equal(vapor.ttl, 5);
        assert.equal(vapor.visible, true);
        assert.equal(vapor.expire_f, 'expire_gas_cloud');
        assert.equal(vapor.inside_f, 'inside_gas_cloud');
        assert.equal(vapor.arg, 0);
        assert.equal(vapor.attach_2_u, false);
        assert.equal(vapor.attach_2_m, 0);
        assert.equal(vapor.can_enter_f, null);
        assert.equal(vapor.enter_f, null);
        assert.equal(vapor.can_leave_f, null);
        assert.equal(vapor.leave_f, null);
    });

test('fog-region transition callbacks remain fail-closed',
    async () => {
        for (const [field, kind] of [
            ['can_enter_f', 'numeric'],
            ['enter_f', 'function'],
            ['can_leave_f', 'injected'],
            ['leave_f', 'function'],
        ]) {
            const target = await prepareSelectedAction({
                pmidx: PM_FOG_CLOUD,
            });
            target.monster.movement = NORMAL_SPEED;
            const vapor = create_region([{
                lx: target.monsterX,
                ly: target.heroY,
                hx: target.monsterX,
                hy: target.heroY,
            }]);
            let calls = 0;
            const callback = kind === 'numeric'
                ? 0
                : kind === 'function'
                    ? () => { calls += 1; return true; }
                    : 'must_not_run';
            Object.assign(vapor, {
                arg: 0,
                inside_f: 'inside_gas_cloud',
                monsters: [target.monster.m_id],
                visible: true,
                [field]: callback,
            });
            game.level.regions = [vapor];
            const membersBefore = [...vapor.monsters];
            const positionBefore = [target.monster.mx, target.monster.my];
            const messagesBefore = [...game.nhDisplay.messages];

            await assert.rejects(
                runSimpleMonsterAction(target.monster, { state: game }),
                (error) => error instanceof UnsupportedSimpleMonsterActionError
                    && error.reason === 'a region transition',
                field,
            );
            assert.equal(calls, 0, field);
            assert.deepEqual(vapor.monsters, membersBefore, field);
            assert.deepEqual(
                [target.monster.mx, target.monster.my],
                positionBefore,
                field,
            );
            assert.deepEqual(game.nhDisplay.messages, messagesBefore, field);
        }
    });

test('callback-free harmless gas transitions follow region.c for entries and exits',
    async () => {
        const start = REGION_SOURCE.indexOf(
            'm_in_out_region(struct monst *mon, coordxy x, coordxy y)',
        );
        const end = REGION_SOURCE.indexOf(
            '\n}\n\n/*\n * Checks player\'s regions',
            start,
        );
        assert.ok(start >= 0);
        assert.ok(end > start);
        const source = REGION_SOURCE.slice(start, end);
        assert.match(source, /can_enter_f[\s\S]*!= NO_CALLBACK/u);
        assert.match(source, /can_leave_f[\s\S]*!= NO_CALLBACK/u);
        assert.match(source, /remove_mon_from_reg[\s\S]*leave_f/u);
        assert.match(source, /add_mon_to_reg[\s\S]*enter_f/u);

        // PM_VAMPIRE_BAT is the ordinary monster in the development
        // divergence.  The two cases exercise each callback-free membership
        // loop from region.c: m_in_out_region() removes a leaving ID and adds
        // an entering ID before considering its unset callback.
        for (const enters of [true, false]) {
            const target = await prepareSelectedAction({
                pmidx: PM_VAMPIRE_BAT,
            });
            const vapor = create_region([{
                lx: enters ? target.destinationX : target.monsterX,
                ly: target.heroY,
                hx: enters ? target.destinationX : target.monsterX,
                hy: target.heroY,
            }]);
            Object.assign(vapor, {
                // Zero damage is the harmless gas-cloud branch in
                // region.c inside_gas_cloud(). -1 is C's NO_CALLBACK value;
                // the admission guard must treat it as unset alongside null.
                arg: 0,
                inside_f: 'inside_gas_cloud',
                monsters: enters ? [] : [target.monster.m_id],
                visible: true,
                can_enter_f: -1,
                enter_f: -1,
                can_leave_f: -1,
                leave_f: -1,
            });
            game.level.regions = [vapor];

            await runSimpleMonsterAction(target.monster, { state: game });
            assert.deepEqual(
                [target.monster.mx, target.monster.my],
                [target.destinationX, target.heroY],
                enters ? 'entry moves the bat' : 'exit moves the bat',
            );
            assert.deepEqual(
                vapor.monsters,
                enters ? [target.monster.m_id] : [],
                enters ? 'entry caches the bat ID' : 'exit removes the bat ID',
            );
        }
    });

test('Hezrou postmove gas creates a region at its pre-move square', async () => {
    const target = await prepareSelectedAction({ pmidx: PM_HEZROU });
    target.monster.movement = NORMAL_SPEED;
    const vapor = create_region([{
        lx: target.monsterX,
        ly: target.heroY,
        hx: target.monsterX,
        hy: target.heroY,
    }]);
    Object.assign(vapor, {
        arg: 0,
        inside_f: 'inside_gas_cloud',
        monsters: [target.monster.m_id],
        visible: true,
    });
    game.level.regions = [vapor];

    await runSimpleMonsterAction(target.monster, { state: game });
    const stench = game.level.regions.find((region) => region.arg === 8
        && inside_region(region, target.monsterX, target.heroY));
    assert.ok(stench, 'the live Hezrou action creates its C-sized stench');
    assert.equal(
        stench.monsters.includes(target.monster.m_id),
        true,
        'add_region caches the monster present at cloud creation',
    );
});

test('minliquid preserves source ordering for lava survivors', async () => {
    const target = await prepareSelectedAction();
    game.level.at(target.monsterX, target.heroY).typ = LAVAPOOL;
    target.monster.mintrinsics = 1 << (FIRE_RES - 1);
    target.monster.mhp = 2;
    game.context.mon_moving = true;
    const events = [];

    try {
        const result = await minliquid(target.monster, {
            state: game,
            canSee: () => false,
            fireDamageChain: (...args) => events.push(['fire', args]),
            relocateMonster: (monster, flags) => {
                events.push(['relocate', monster, flags]);
                return false;
            },
            dealWithOvercrowding: (monster) => {
                events.push(['overcrowding', monster]);
            },
        });

        assert.equal(result, 0);
        assert.equal(target.monster.mhp, 1);
        assert.deepEqual(events.map(([name]) => name), [
            'fire', 'relocate', 'overcrowding',
        ]);
        assert.equal(events[1][2], RLOC_MSG);
        assert.equal(game.iflags.sad_feeling ?? false, false);
    } finally {
        game.context.mon_moving = false;
    }
});

test('a live lava survivor relocates through rloc() without a caller seam',
    async () => {
        // mon.c minliquid_core() calls teleport.c rloc() directly; dothrow.c
        // mhurtle() is a live caller that supplies no relocation of its own.
        const target = await prepareSelectedAction();
        game.level.at(target.monsterX, target.heroY).typ = LAVAPOOL;
        target.monster.mintrinsics = 1 << (FIRE_RES - 1);
        target.monster.mhp = 2;
        game.context.mon_moving = true;
        try {
            const result = await minliquid(target.monster, {
                state: game,
                canSee: () => false,
                fireDamageChain: () => {},
            });
            assert.equal(result, 0);
            assert.equal(target.monster.mhp, 1);
            assert.notEqual(
                game.level.at(target.monster.mx, target.monster.my).typ,
                LAVAPOOL,
                'rloc() moved the survivor off the lava',
            );
        } finally {
            game.context.mon_moving = false;
        }
    });

test('minliquid orders pool messages before monster death', async () => {
    const target = await prepareSelectedAction();
    game.level.at(target.monsterX, target.heroY).typ = POOL;
    game.context.mon_moving = true;
    const events = [];

    try {
        const result = await minliquid(target.monster, {
            state: game,
            canSee: () => true,
            message: (text) => events.push(['message', text]),
            mondied: (monster) => {
                events.push(['mondied', monster]);
                monster.mhp = 0;
            },
        });

        assert.equal(result, 1);
        assert.deepEqual(events.map(([name]) => name), [
            'message', 'mondied',
        ]);
        assert.match(events[0][1], /drowns\.$/u);
        assert.equal(game.iflags.sad_feeling ?? false, false);
    } finally {
        game.context.mon_moving = false;
    }
});

test('minliquid lets swimmers and teleporters take their source exemptions',
    async () => {
        const swimmer = await prepareSelectedAction({ pmidx: PM_GIANT_EEL });
        game.level.at(swimmer.monsterX, swimmer.heroY).typ = POOL;
        assert.equal(await minliquid(swimmer.monster, { state: game }), 0);

        const teleporter = await prepareSelectedAction();
        game.level.at(teleporter.monsterX, teleporter.heroY).typ = LAVAPOOL;
        teleporter.monster.data = {
            ...teleporter.monster.data,
            mflags1: teleporter.monster.data.mflags1 | M1_TPORT,
        };
        const events = [];
        assert.equal(await minliquid(teleporter.monster, {
            state: game,
            relocateMonster: (monster, flags) => {
                events.push([monster, flags]);
                return true;
            },
        }), 0);
        assert.equal(events.length, 1);
        assert.equal(events[0][1], RLOC_MSG);
    });

// C ref: mon.c hideunder():4726-4801. An ordinary eel conceals itself in an
// ordinary pool when the hero cannot see its square. movemon_singlemon() has
// already spent the rn2(4) gate by the time it calls this, so these cases pin
// hideunder()'s own terrain, visibility, state-change, and newsym() behavior
// rather than the gate above it.
test('hideunder conceals an unseen eel in an ordinary pool', async () => {
    const target = await prepareSelectedAction({ pmidx: PM_GIANT_EEL });
    game.level.at(target.monsterX, target.heroY).typ = POOL;
    game.viz_array[target.heroY][target.monsterX] &= ~IN_SIGHT;
    const redraws = [];
    const env = { state: game, redraw: (x, y) => redraws.push([x, y]) };

    assert.equal(await hideunder(target.monster, env), true);
    assert.equal(target.monster.mundetected, 1);
    assert.deepEqual(redraws, [[target.monsterX, target.heroY]]);

    // C guards newsym() with `undetected != oldundetctd`, so repeating the
    // same call keeps the eel hidden and repaints nothing.
    assert.equal(await hideunder(target.monster, env), true);
    assert.equal(target.monster.mundetected, 1);
    assert.deepEqual(redraws, [[target.monsterX, target.heroY]]);
});

test('hideunder updates hero concealment under a coverable floor object', async () => {
    await prepareSelectedAction();
    const { ux, uy } = game.u;
    game.youmonst.data = game.mons[PM_CAVE_SPIDER];
    game.u.umonnum = PM_CAVE_SPIDER;
    const object = floorObject(ux, uy, 9301, ROCK);
    installObject({}, object);
    const redraws = [];
    const env = { state: game, redraw: (x, y) => redraws.push([x, y]) };

    assert.equal(await hideunder(game.youmonst, env), true);
    assert.equal(game.u.uundetected, 1);
    assert.deepEqual(redraws, [[ux, uy]]);

    assert.equal(await hideunder(game.youmonst, env), true);
    assert.deepEqual(redraws, [[ux, uy]],
        'repeating an unchanged hero concealment does not redraw');

    game.level.objects[ux][uy] = null;
    assert.equal(await hideunder(game.youmonst, env), false);
    assert.equal(game.u.uundetected, 0);
    assert.deepEqual(redraws, [[ux, uy], [ux, uy]]);
});

// Each term of mon.c:4738-4747 that can answer FALSE, plus the two that keep
// answering TRUE. Every case starts from an eel the hero cannot see that is
// already hidden, which is the state maybe_unhide_at() and monmove.c postmov()
// re-test; that also makes each FALSE case assert the newsym() C owes when
// mundetected goes back to 0.
test('hideunder applies each eel water and trap predicate', async () => {
    const cases = [
        {
            name: 'ordinary pool',
            prepare: () => {},
            expected: true,
        },
        {
            // The eel arm needs is_pool(); no object arm can substitute.
            name: 'dry square',
            prepare: (target) => {
                game.level.at(target.monsterX, target.heroY).typ = ROOM;
            },
            expected: false,
        },
        {
            // `!Is_waterlevel(&u.uz)`: the Plane of Water is all water, so an
            // eel gets no cover there.
            name: 'Plane of Water',
            prepare: () => {
                game.u.uz = { ...game.water_level };
            },
            expected: false,
        },
        {
            // `!Underwater || !couldsee(x, y)`: a hero in the water sees the
            // eel's square unless something blocks the line of sight.
            name: 'hero underwater with line of sight',
            prepare: (target) => {
                game.u.uinwater = true;
                game.viz_array[target.heroY][target.monsterX] |= COULD_SEE;
            },
            expected: false,
        },
        {
            name: 'hero underwater behind an obstruction',
            prepare: (target) => {
                game.u.uinwater = true;
                game.viz_array[target.heroY][target.monsterX] &= ~COULD_SEE;
            },
            expected: true,
        },
        {
            // `mtmp == u.ustuck`: an eel holding the hero cannot let go to
            // hide, whatever it is standing in.
            name: 'holding the hero',
            prepare: (target) => {
                game.u.ustuck = target.monster;
            },
            expected: false,
        },
        {
            // The trapped arm is an OR of two terms. mtrapped alone answers
            // it, with no trap on the square at all.
            name: 'trapped with no trap present',
            prepare: (target) => {
                target.monster.mtrapped = 1;
            },
            expected: false,
        },
        {
            name: 'standing on a non-pit trap',
            prepare: (target) => {
                game.level.traps.push({
                    tx: target.monsterX,
                    ty: target.heroY,
                    ttyp: BEAR_TRAP,
                    tseen: false,
                });
            },
            expected: false,
        },
        {
            // is_pit(ttyp) exempts PIT and SPIKED_PIT from that arm.
            name: 'standing on a pit',
            prepare: (target) => {
                game.level.traps.push({
                    tx: target.monsterX,
                    ty: target.heroY,
                    ttyp: PIT,
                    tseen: false,
                });
            },
            expected: true,
        },
    ];

    for (const { name, prepare, expected } of cases) {
        const target = await prepareSelectedAction({ pmidx: PM_GIANT_EEL });
        game.level.at(target.monsterX, target.heroY).typ = POOL;
        game.viz_array[target.heroY][target.monsterX] &= ~IN_SIGHT;
        target.monster.mundetected = 1;
        prepare(target);
        const redraws = [];

        assert.equal(
            await hideunder(target.monster, {
                state: game,
                redraw: (x, y) => redraws.push([x, y]),
            }),
            expected,
            name,
        );
        assert.equal(target.monster.mundetected, expected ? 1 : 0, name);
        assert.deepEqual(
            redraws,
            expected ? [] : [[target.monsterX, target.heroY]],
            name,
        );
    }
});

// mon.c:4784 runs `seenmon = y_monnam(mtmp)` for every visible monster,
// whether or not it ends up hidden, and y_monnam() draws randomness for a
// hallucinating hero. A visible eel that hides under water reports the action;
// a visible eel that cannot hide simply leaves its existing state unchanged.
// Each case starts from mundetected 0 because display.h _mon_visible() ends in
// `&& !mon->mundetected`: an eel already hidden is never one the hero can see,
// whatever the vision array says.
test('hideunder reports concealment the hero can watch', async () => {
    for (const [name, typ, expected, expectedMessage] of [
        ['pool', POOL, true, 'You see the giant eel dive under the water.'],
        ['dry square', ROOM, false, null],
    ]) {
        const target = await prepareSelectedAction({ pmidx: PM_GIANT_EEL });
        game.level.at(target.monsterX, target.heroY).typ = typ;
        game.viz_array[target.heroY][target.monsterX] |= IN_SIGHT;
        target.monster.mundetected = 0;
        const messages = [];

        assert.equal(
            await hideunder(target.monster, {
                state: game,
                message: (line) => { messages.push(line); },
            }),
            expected,
            name,
        );
        assert.equal(target.monster.mundetected, expected ? 1 : 0, name);
        assert.deepEqual(messages, expectedMessage ? [expectedMessage] : [], name);
    }
});

// C ref: mon.c:4758-4772 and 4784-4798. A visible object-concealing monster
// names the object before it filters cockatrice corpses, then names itself,
// emits You_see(), records PLNMSG_HIDE_UNDER/gl.last_hider, and redraws after
// the message. A cobra on a statue exercises all of those operations.
test('hideunder reports a visible monster hiding under an object', async () => {
    const target = await prepareSelectedAction({ pmidx: PM_COBRA });
    const object = floorObject(
        target.monsterX,
        target.heroY,
        9202,
        STATUE,
    );
    installObject(target, object);
    game.viz_array[target.heroY][target.monsterX] |= IN_SIGHT;
    target.monster.mundetected = 0;
    const events = [];
    const messages = [];

    assert.equal(
        await hideunder(target.monster, {
            state: game,
            message: async (line) => {
                events.push('message');
                messages.push(line);
            },
            redraw: () => events.push('redraw'),
        }),
        true,
    );
    assert.deepEqual(messages, ['You see the cobra slither under a statue.']);
    assert.deepEqual(events, ['message', 'redraw']);
    assert.equal(target.monster.mundetected, 1);
    assert.equal(game.iflags.last_msg, PLNMSG_HIDE_UNDER);
    assert.equal(game.gv.last_hider, target.monster.m_id);
    assert.equal(game.msg_xy, null);
});

// C ref: monmove.c:733-734. An awake monster calls wipe_engr_at() before
// movement, so later source branches see the eroded engraving.
test('simple monster action erodes a current-square dust engraving',
    async () => {
        const target = await prepareSelectedAction();
        installCurrentSquareEngraving(target);
        const originalText = game.head_engr.engr_txt[0];

        await runSimpleMonsterAction(target.monster, { state: game });

        assert.notEqual(game.head_engr?.engr_txt[0] ?? null, originalText);
    });

// C ref: mon.c minliquid_core():987-1009. A gremlin in water reaches the
// source-specific liquid arm during the live monster scan.
test('a gremlin in water survives its live liquid check', async () => {
    const target = await prepareSelectedAction({ pmidx: PM_GREMLIN });
    game.level.at(target.monsterX, target.heroY).typ = POOL;
    target.monster.mhp = target.monster.mhpmax = 4;
    // No key is queued: the gremlin is out of sight (COULD_SEE without
    // IN_SIGHT), so mon.c minliquid_core() and split_mon() print nothing,
    // and any --More-- fails the case on the empty input queue.

    await runLiveMonsterScan();

    assert.ok(monsterSnapshots(game).find(
        (monster) => monster.data?.pmidx === PM_GREMLIN,
    ));
});

function monsterSnapshots(state) {
    const result = [];
    for (let monster = state.level.monlist; monster; monster = monster.nmon)
        result.push(monster);
    return result;
}

// C ref: mon.c minliquid_core():987-991. Fountain splitting draws the
// gremlin gate and dryup's source draw; the clone owns half the current and
// maximum hit points, and the fountain is dried only after a clone exists.
test('minliquid splits a gremlin and dries a fountain in source order',
    async () => {
    const target = await prepareSelectedAction({ pmidx: PM_GREMLIN });
    const square = game.level.at(target.monsterX, target.heroY);
    square.typ = FOUNTAIN;
    target.monster.mhp = target.monster.mhpmax = 4;
    game.context.mon_moving = true;
    const calls = [];
    const rndCalls = [];
    try {
        const result = await minliquid(target.monster, {
            state: game,
            random: { ...coreRandom,
            rn2(bound) {
                calls.push(bound);
                // The first rn2(3) admits splitting; dryup's final rn2(3)
                // returns zero so the fountain takes its source dry-up arm.
                return calls.length === 47 ? 0 : 1;
            },
            rnd(bound) {
                rndCalls.push(bound);
                return 1;
            },
            },
            canSee: () => false,
            message: async () => {},
            redraw: () => {},
        });
        assert.equal(result, 0);
        assert.deepEqual(calls, [
            3,
            ...Array.from({ length: 7 }, (_, index) => 8 - index),
            ...Array.from({ length: 15 }, (_, index) => 16 - index),
            ...Array.from({ length: 23 }, (_, index) => 24 - index),
            3,
        ]);
        assert.deepEqual(rndCalls, [2]);
        assert.equal(square.typ, ROOM);
        assert.equal(target.monster.mhp, 2);
        assert.equal(target.monster.mhpmax, 2);
        const clone = monsterSnapshots(game).find(
            (monster) => monster !== target.monster && monster.mcloned,
        );
        assert.ok(clone);
        assert.equal(clone.mhp, 2);
        assert.equal(clone.mhpmax, 2);
    } finally {
        game.context.mon_moving = false;
    }
});

// C ref: mon.c minliquid_core():993-1009. The iron-golem arm spends rn2(5),
// then d(2,6) on a zero result, and lowers both hit-point pools before the
// discarded inventory-chain call.
test('minliquid rusts an iron golem with the source draws', async () => {
    const target = await prepareSelectedAction({ pmidx: PM_IRON_GOLEM });
    game.level.at(target.monsterX, target.heroY).typ = POOL;
    target.monster.mhp = target.monster.mhpmax = 20;
    const rn2Calls = [];
    const dCalls = [];
    const messages = [];
    const result = await minliquid(target.monster, {
        state: game,
        random: {
            rn2(bound) {
                rn2Calls.push(bound);
                return 0;
            },
            d(number, sides) {
                dCalls.push([number, sides]);
                return 5;
            },
        },
        canSee: () => true,
        message: async (text) => messages.push(text),
    });
    assert.equal(result, 0);
    assert.deepEqual(rn2Calls, [5]);
    assert.deepEqual(dCalls, [[2, 6]]);
    assert.equal(target.monster.mhp, 15);
    assert.equal(target.monster.mhpmax, 15);
    assert.match(messages[0], /rusts\.$/u);
});

// C mon.c:1001 calls mondied() for an iron golem without consulting
// mon_moving.  The ordinary liquidDeath() xkilled arm is for the other
// water/lava branches; using it here would lose the source golem cleanup when
// minliquid is called outside a monster turn.
test('minliquid uses mondied for a lethal iron golem outside monster movement',
    async () => {
    const target = await prepareSelectedAction({ pmidx: PM_IRON_GOLEM });
    game.level.at(target.monsterX, target.heroY).typ = POOL;
    target.monster.mhp = target.monster.mhpmax = 1;
    const calls = [];
    game.context.mon_moving = false;
    try {
        const result = await minliquid(target.monster, {
            state: game,
            random: {
                rn2: (bound) => {
                    assert.equal(bound, 5);
                    return 0;
                },
                d: (number, sides) => {
                    assert.deepEqual([number, sides], [2, 6]);
                    return 6;
                },
            },
            canSee: () => false,
            mondied: (monster) => {
                calls.push('mondied');
                monster.mhp = 0;
            },
            xkilled: () => {
                calls.push('xkilled');
                assert.fail('iron-golem rust must use mondied');
            },
        });
        assert.equal(result, 1);
        assert.deepEqual(calls, ['mondied']);
    } finally {
        game.context.mon_moving = false;
    }
});

// C mhitu.c:2616-2640 calls the ordinary makemon() runtime shape even when
// this helper is reached outside level generation, so cloneu() uses
// makemon_runtime's asynchronous continuation.
test('cloneu uses runtime creation outside level generation',
    async () => {
    await prepareSelectedAction();
    assert.equal(game.in_mklev, false);
    game.u.mh = 9;
    game.u.mhmax = 12;
    const calls = [];
    const messages = [];
    const random = {
        d(number, sides) {
            calls.push(['d', number, sides]);
            return 1;
        },
        rn1(number, base) {
            calls.push(['rn1', number, base]);
            return base;
        },
        rn2(bound) {
            calls.push(['rn2', bound]);
            return 0;
        },
        rnd(bound) {
            calls.push(['rnd', bound]);
            return 1;
        },
        rne(value) {
            calls.push(['rne', value]);
            return value;
        },
    };

    const clone = await cloneu(game, {
        state: game,
        random,
        message: async (line) => messages.push(line),
        norepMessage: async (line) => messages.push(line),
    });
    assert.ok(clone);
    assert.equal(clone.mcloned, true);
    assert.equal(clone.mhpmax, 12);
    assert.equal(clone.mhp, 4);
    assert.equal(game.u.mh, 5);
    assert.ok(calls.length > 0, 'runtime creation consumed its injected RNG');
    assert.deepEqual(messages, []);
});

// C ref: mon.c minliquid_core():1111-1119. A stranded eel spends
// rn2(mhp), rn2(8), and refreshes monflee() without a message.
test('minliquid hurts a stranded eel and refreshes fleeing', async () => {
    const target = await prepareSelectedAction({ pmidx: PM_GIANT_EEL });
    game.level.at(target.monsterX, target.heroY).typ = ROOM;
    target.monster.mhp = target.monster.mhpmax = 3;
    const calls = [];
    const result = await minliquid(target.monster, {
        state: game,
        random: {
            rn2(bound) {
                calls.push(bound);
                return bound === 3 ? 2 : 0;
            },
        },
    });
    assert.equal(result, 0);
    assert.deepEqual(calls, [3, 8]);
    assert.equal(target.monster.mhp, 2);
    assert.equal(target.monster.mflee, true);
    assert.equal(target.monster.mfleetim, 2);
});

test('simple monster action leaves engravings that source wipe skips intact',
    async () => {
        const cases = [
            {
                name: 'headstone',
                engraving: { engr_type: HEADSTONE },
            },
            {
                name: 'protected engraving',
                engraving: { nowipeout: true },
            },
            {
                name: 'burned room engraving',
                engraving: { engr_type: BURN },
            },
        ];

        for (const actionCase of cases) {
            const target = await prepareSelectedAction();
            installCurrentSquareEngraving(target, actionCase.engraving);
            const textBefore = [...game.head_engr.engr_txt];

            await runSimpleMonsterAction(target.monster, { state: game });
            assert.deepEqual(
                game.head_engr?.engr_txt,
                textBefore,
                actionCase.name,
            );
        }
    });

// mon.c mfndpos() admits every IS_ROOM(typ) square, where rm.h defines
// IS_ROOM as typ >= ROOM. That includes the seven furniture types plus ICE,
// DRAWBRIDGE_DOWN, AIR and CLOUD; monmove.c postmov() has no terrain arm for
// any of them, so an ordinary monster steps onto each square unchanged.
test('simple movement admits every IS_ROOM square', async () => {
    for (const [label, terrain] of [
        ['stairs', STAIRS],
        ['ladder', LADDER],
        ['fountain', FOUNTAIN],
        ['throne', THRONE],
        ['sink', SINK],
        ['grave', GRAVE],
        ['altar', ALTAR],
        ['ice', ICE],
        ['drawbridge down', DRAWBRIDGE_DOWN],
        ['air', AIR],
        ['cloud', CLOUD],
    ]) {
        const admitted = await prepareSelectedAction();
        const location = game.level.at(
            admitted.destinationX,
            admitted.heroY,
        );
        location.typ = terrain;

        await runSimpleMonsterAction(admitted.monster, { state: game });
        assert.deepEqual(
            [admitted.monster.mx, admitted.monster.my],
            [admitted.destinationX, admitted.heroY],
            label,
        );
    }
});

// C ref: mon.c:mfndpos() filters iron bars through ALLOW_BARS, then
// monmove.c:postmov() lets an eligible rust monster dissolve the selected
// square.
test('simple movement admits a rust monster destination at iron bars', async () => {
    const target = await prepareSelectedAction({ pmidx: PM_RUST_MONSTER });
    const bars = game.level.at(target.destinationX, target.heroY);
    bars.typ = IRONBARS;
    bars.flags = 0;

    await runSimpleMonsterAction(target.monster, { state: game });
    assert.deepEqual(
        [target.monster.mx, target.monster.my],
        [target.destinationX, target.heroY],
    );
    assert.notEqual(bars.typ, IRONBARS, 'postmov dissolves the selected bars');
});

// C ref: monmove.c m_move():1953 and m_avoid_kicked_loc():1295-1308. The
// ordinary movement adapter must pass the kicked-location predicate through
// to candidate filtering, so a peaceful monster does not enter the kicked
// square when it is the only legal destination.
test('ordinary movement avoids the square the hero most recently kicked',
    async () => {
        const target = await prepareSelectedAction();
        target.monster.mpeaceful = true;
        // Keep the selected destination one square from the hero while the
        // monster still remembers a farther target, so mfndpos() offers it as
        // an ordinary movement candidate rather than an ALLOW_U attack.
        game.u.ux = game.u.ux0 = target.destinationX + 1;
        target.monster.mux = target.destinationX + 2;
        target.monster.muy = target.heroY;
        game.gk = {
            kickedloc: {
                x: target.destinationX,
                y: target.heroY,
            },
        };
        assert.equal(
            m_avoid_kicked_loc(
                target.monster,
                target.destinationX,
                target.heroY,
                game,
            ),
            true,
        );

        await runSimpleMonsterAction(target.monster, { state: game });
        assert.deepEqual(
            [target.monster.mx, target.monster.my],
            [target.monsterX, target.heroY],
        );
    });

// C ref: mon.c mfndpos() :2166-2168 and minliquid_core() :967-972. A flyer or
// floater can move over pool and lava tiles. mfndpos() computes poolok from
// m_in_air() (outside Is_waterlevel) and lavaok from m_in_air()||likes_lava().
// PM_FLOATING_EYE is excluded from lava at :2169-2170. A PM_YELLOW_LIGHT
// (S_LIGHT, floater) exercises the pool path; PM_GIANT_RAT (grounded) is the
// negative control.
test('simple movement admits pool and lava destinations for a floater',
    async () => {
        for (const [label, terrain] of [
            ['pool', POOL],
            ['lava', LAVAPOOL],
        ]) {
            // Positive case: PM_YELLOW_LIGHT (floater) can step onto liquid.
            const admitted = await prepareSelectedAction({
                pmidx: PM_YELLOW_LIGHT,
            });
            // Also set the monster's current tile to pool so that
            // assertSimpleScanState exercises the flyer/floater exemption.
            game.level.at(
                admitted.monsterX, admitted.heroY,
            ).typ = terrain;
            game.level.at(
                admitted.destinationX, admitted.heroY,
            ).typ = terrain;

            await runSimpleMonsterAction(admitted.monster, { state: game });
            assert.deepEqual(
                [admitted.monster.mx, admitted.monster.my],
                [admitted.destinationX, admitted.heroY],
                `${label} floater destination`,
            );
        }

    });

// C ref: mon.c mfndpos() :2166-2170. An eel keeps wantpool=true, so a moat
// candidate is selected by `is_pool(nx,ny) == wantpool`; treating liquid as a
// generic destination would incorrectly reject a grounded swimmer here.
test('simple movement admits a swimmer into a moat', async () => {
    const target = await prepareSelectedAction({ pmidx: PM_GIANT_EEL });
    game.level.at(target.monsterX, target.heroY).typ = POOL;
    game.level.at(target.destinationX, target.heroY).typ = MOAT;

    await runSimpleMonsterAction(target.monster, { state: game });
    assert.deepEqual(
        [target.monster.mx, target.monster.my],
        [target.destinationX, target.heroY],
    );
});

// C mon.c mfndpos() tries water first for a stranded eel; only a scan
// with no candidates retries land.
for (const [label, destination] of [['return to water', MOAT], ['land fallback', ROOM]]) {
    test('stranded eel movement admits ' + label, async () => {
        const target = await prepareSelectedAction({ pmidx: PM_GIANT_EEL });
        game.level.at(target.monsterX, target.heroY).typ = ROOM;
        game.level.at(target.destinationX, target.heroY).typ = destination;
        await runSimpleMonsterAction(target.monster, { state: game });
        assert.deepEqual([target.monster.mx, target.monster.my],
            [target.destinationX, target.heroY]);
    });
}

// C ref: mon.c mfndpos() :2160-2163. ALLOW_WALL plus may_passwall() admits
// an obstructed square for a wall-walking monster; movement must pass that
// candidate through to postmov() rather than classify it as terrain.
test('simple movement admits a passwall wall candidate', async () => {
    const target = await prepareSelectedAction({
        pmidx: PM_EARTH_ELEMENTAL,
    });
    const wall = game.level.at(target.destinationX, target.heroY);
    wall.typ = STONE;
    wall.flags = 0;

    await runSimpleMonsterAction(target.monster, { state: game });
    assert.deepEqual(
        [target.monster.mx, target.monster.my],
        [target.destinationX, target.heroY],
    );
});

// C ref: monmove.c postmov()'s door block (1520-1622). A monster that ends its
// move on a doorless, broken or open doorway reaches no arm of that block, so
// the move completes with the doormask, the map and the message window
// untouched.
test('simple movement admits inert doorway masks', async () => {
    for (const representation of ['flags']) {
        for (const mask of [D_NODOOR, D_BROKEN, D_ISOPEN]) {
            const doorway = await prepareSelectedAction();
            const location = game.level.at(
                doorway.destinationX,
                doorway.heroY,
            );
            location.typ = DOOR;
            location.flags = 0;
            location[representation] = mask;
            const label = `${representation} mask ${mask}`;

            await runSimpleMonsterAction(doorway.monster, { state: game });
            assert.deepEqual(
                [doorway.monster.mx, doorway.monster.my],
                [doorway.destinationX, doorway.heroY],
                label,
            );
            assert.equal(location.typ, DOOR, label);
            assert.equal(location[representation], mask, label);
        }
    }
});

// Install a closed door on the square the selected monster will step onto and
// bring js/vision.js's transparency index into step with it, as every other
// writer of a doormask does.
async function prepareClosedDoorArrival() {
    const target = await prepareSelectedAction({ pmidx: PM_GNOME });
    // Initialize the bulk-edited fixture map before source point updates.
    vision_reset(game);
    const location = game.level.at(target.destinationX, target.heroY);
    location.typ = DOOR;
    location.flags = D_CLOSED;
    recalc_block_point(target.destinationX, target.heroY, game);
    return { ...target, location };
}

// clear_path() skips both endpoints, so straddling the door reports whether
// the transparency index still calls that one square opaque.
function doorLetsLightThrough(target) {
    return clear_path(
        target.destinationX - 1,
        target.heroY,
        target.destinationX + 1,
        target.heroY,
    );
}

// C ref: monmove.c postmov():1576-1592 through UnblockDoor at 1526-1536. The
// gnome has hands, so mon_allowflags() gives it OPENDOOR and mfndpos() offers
// it the closed square. The hero stands three squares away with a clear line,
// so this is the arm that names the monster.
test('simple movement opens a closed door and names the opener', async () => {
    const target = await prepareClosedDoorArrival();
    assert.equal(doorLetsLightThrough(target), 0);

    const messages = [];
    await runSimpleMonsterAction(target.monster, {
        state: game,
        message: (text) => { messages.push(text); },
    });
    assert.deepEqual(
        [target.monster.mx, target.monster.my],
        [target.destinationX, target.heroY],
    );
    assert.equal(target.location.flags, D_ISOPEN);
    assert.equal(doorLetsLightThrough(target), 1);
    assert.deepEqual(messages, ['The gnome opens a door.']);
});

for (const mask of [D_CLOSED, D_LOCKED]) {
    test('amorphous passage keeps door mask ' + mask, async () => {
        const target = await prepareSelectedAction({ pmidx: PM_FOG_CLOUD });
        const location = game.level.at(target.destinationX, target.heroY);
        location.typ = DOOR;
        location.flags = mask;
        recalc_block_point(target.destinationX, target.heroY, game);
        await runSimpleMonsterAction(target.monster, { state: game });
        assert.deepEqual([target.monster.mx, target.monster.my],
            [target.destinationX, target.heroY]);
        assert.equal(location.flags, mask);
        assert.equal(doorLetsLightThrough(target), 0);
    });
}

async function prepareUnlockingArrival(pmidx, carriesKey) {
    const target = await prepareSelectedAction({ pmidx });
    // Initialize the bulk-edited fixture map before source point updates.
    vision_reset(game);
    if (carriesKey) {
        target.monster.minvent = monsterObject(SKELETON_KEY);
        target.monster.minvent.ocarry = target.monster;
    }
    const location = game.level.at(target.destinationX, target.heroY);
    location.typ = DOOR;
    location.flags = D_LOCKED;
    recalc_block_point(target.destinationX, target.heroY, game);
    return { ...target, location };
}

for (const [label, pmidx, carriesKey, message] of [
    ['Rider', PM_DEATH, false, 'Death unlocks and opens a door.'],
    ['key-bearing gnome', PM_GNOME, true, 'The gnome unlocks and opens a door.'],
]) {
    test(label + ' unlocks a door', async () => {
        const target = await prepareUnlockingArrival(pmidx, carriesKey);
        const messages = [];
        await runSimpleMonsterAction(target.monster, {
            state: game,
            message: (text) => { messages.push(text); },
        });
        assert.deepEqual([target.monster.mx, target.monster.my],
            [target.destinationX, target.heroY]);
        assert.equal(target.location.flags, D_ISOPEN);
        assert.equal(doorLetsLightThrough(target), 1);
        assert.deepEqual(messages, [message]);
    });
}

async function prepareVampireDoorArrival() {
    const target = await prepareSelectedAction({ pmidx: PM_VAMPIRE });
    target.monster.cham = PM_VAMPIRE;
    const location = game.level.at(target.destinationX, target.heroY);
    location.typ = DOOR;
    location.flags = D_LOCKED;
    recalc_block_point(target.destinationX, target.heroY, game);
    return { ...target, location };
}

test('vampire door passage changes form', async () => {
    const target = await prepareVampireDoorArrival();
    // monmove.c vamp_shift() displays WIN_MESSAGE after the live change.
    game.nhDisplay.pushKey(' '.charCodeAt(0));
    await runSimpleMonsterAction(target.monster, { state: game });
    assert.equal(game.nhDisplay.inputQueueLength, 0);
    assert.deepEqual([target.monster.mx, target.monster.my],
        [target.destinationX, target.heroY]);
    assert.equal(target.monster.data, game.mons[PM_FOG_CLOUD]);
    assert.equal(target.monster.cham, PM_VAMPIRE);
    assert.equal(target.location.flags, D_LOCKED);
    assert.equal(doorLetsLightThrough(target), 0);
});

test('a giant smashes a locked door', async () => {
    const target = await prepareSelectedAction({ pmidx: PM_HILL_GIANT });
    // Initialize the bulk-edited fixture map before source point updates.
    vision_reset(game);
    const location = game.level.at(target.destinationX, target.heroY);
    location.typ = DOOR;
    location.flags = D_LOCKED;
    recalc_block_point(target.destinationX, target.heroY, game);
    const messages = [];
    await runSimpleMonsterAction(target.monster, {
        state: game,
        message: (text) => { messages.push(text); },
    });
    assert.deepEqual([target.monster.mx, target.monster.my],
        [target.destinationX, target.heroY]);
    assert.ok([D_NODOOR, D_BROKEN].includes(location.flags));
    assert.equal(location.flags, location.flags);
    assert.equal(doorLetsLightThrough(target), 1);
    assert.deepEqual(messages, ['The hill giant smashes down a door.']);
});

// The same opening with the hero blind. vision_recalc()'s Blind branch grants
// no IN_SIGHT square, so canseeit stays false and the door is heard instead.
test('simple movement reports a door a blind hero only hears', async () => {
    const target = await prepareClosedDoorArrival();
    game.u.uprops[BLINDED] = { intrinsic: 1, extrinsic: 0, blocked: 0 };

    const messages = [];
    await runSimpleMonsterAction(target.monster, {
        state: game,
        message: (text) => { messages.push(text); },
    });
    assert.equal(target.location.flags, D_ISOPEN);
    assert.deepEqual(messages, ['You hear a door open.']);
});

test('simple wake output completes before sleep state and action progress',
    async () => {
        const target = await prepareSelectedAction();
        target.monster.data = {
            ...target.monster.data,
            // Human-class monsters wake without the ordinary one-in-seven
            // draw, isolating the message boundary from later action RNG.
            mlet: S_HUMAN,
        };
        target.monster.msleeping = true;
        game.viz_array[target.heroY][target.monsterX] |= IN_SIGHT;
        const output = deferred();
        const beforeRng = rngSnapshot();
        let rendered;
        let settled = false;
        const pending = runSimpleMonsterAction(target.monster, {
            state: game,
            message: (text) => {
                rendered = text;
                return output.promise;
            },
        });
        pending.then(() => { settled = true; });

        await Promise.resolve();
        await Promise.resolve();
        assert.equal(rendered, 'The giant rat wakes up!');
        assert.equal(target.monster.msleeping, true);
        assert.deepEqual(
            [target.monster.mx, target.monster.my],
            [target.monsterX, target.heroY],
        );
        assert.deepEqual(rngSnapshot(), beforeRng);
        assert.equal(settled, false);

        output.resolve();
        await pending;
        assert.equal(target.monster.msleeping, false);
        assert.equal(settled, true);
    });

test('simple postmov awaits the live notice before redraw',
    async () => {
        const target = await prepareSelectedAction();
        game.a11y.mon_notices = true;
        game.a11y.mon_notices_blocked = 0;
        game.viz_array[target.heroY][target.destinationX] |= IN_SIGHT;
        target.monster.mspotted = false;

        const output = deferred();
        const events = [];
        const pending = runSimpleMonsterAction(target.monster, {
            state: game,
            message: (text) => {
                events.push(`message:${text}`);
                return output.promise;
            },
            redraw: (x, y) => events.push(`redraw:${x},${y}`),
        });
        // Region admission, itsstuck(), and postmov each cross an async
        // boundary before the notice; sixteen microtasks leave headroom
        // without using a timer.
        for (let turn = 0; turn < 16 && !events.length; ++turn)
            await Promise.resolve();

        assert.deepEqual(events, ['message:You see a giant rat.']);
        assert.equal(target.monster.mspotted, true);
        assert.deepEqual(
            [target.monster.mx, target.monster.my],
            [target.destinationX, target.heroY],
        );

        output.resolve();
        await pending;
        assert.deepEqual(events, [
            'message:You see a giant rat.',
            `redraw:${target.monsterX},${target.heroY}`,
            `redraw:${target.destinationX},${target.heroY}`,
        ]);
    });

test('simple movement output precedes track update and redraw', async () => {
    const target = await prepareSelectedAction();
    game.a11y.mon_movement = true;
    game.viz_array[target.heroY][target.destinationX] |= IN_SIGHT;
    target.monster.mspotted = true;

    const output = deferred();
    const events = [];
    const pending = runSimpleMonsterAction(target.monster, {
        state: game,
        message: (text) => {
            events.push(`message:${text}`);
            assert.deepEqual(target.monster.mtrack[0], { x: 0, y: 0 });
            return output.promise;
        },
        redraw: (x, y) => events.push(`redraw:${x},${y}`),
    });
    for (let turn = 0; turn < 16 && !events.length; ++turn)
        await Promise.resolve();

    assert.deepEqual(events, ['message:The giant rat moves closer.']);
    assert.deepEqual(target.monster.mtrack[0], { x: 0, y: 0 });

    output.resolve();
    await pending;
    assert.deepEqual(target.monster.mtrack[0], {
        x: target.monsterX,
        y: target.heroY,
    });
    assert.deepEqual(events, [
        'message:The giant rat moves closer.',
        `redraw:${target.monsterX},${target.heroY}`,
        `redraw:${target.destinationX},${target.heroY}`,
    ]);
});

test('simple no-move notice completes before the adapter returns', async () => {
    const target = await prepareStartingPetAction(PM_LITTLE_DOG);
    // dogmove.c:dog_move() explicitly returns MMOVE_NOTHING when the pet and
    // hero share a square. That isolates the unchanged-coordinate postmov()
    // branch while retaining the complete runSimpleMonsterAction() adapter.
    game.level.monsters[target.monsterX][target.heroY] = null;
    target.monster.mx = game.u.ux;
    target.monster.my = game.u.uy;
    target.monster.mux = game.u.ux;
    target.monster.muy = game.u.uy;
    game.level.monsters[game.u.ux][game.u.uy] = target.monster;
    game.viz_array[game.u.uy][game.u.ux] |= IN_SIGHT;
    game.a11y.mon_notices = true;
    game.a11y.mon_notices_blocked = 0;
    target.monster.mspotted = false;

    const output = deferred();
    const events = [];
    let settled = false;
    const pending = runSimpleMonsterAction(target.monster, {
        state: game,
        message: (text) => {
            events.push(`message:${text}`);
            return output.promise;
        },
        redraw: (x, y) => events.push(`redraw:${x},${y}`),
    });
    pending.then(() => { settled = true; });
    for (let turn = 0; turn < 8 && !events.length; ++turn)
        await Promise.resolve();

    assert.deepEqual(events, ['message:You see your little dog.']);
    assert.equal(target.monster.mspotted, true);
    assert.equal(settled, false);

    output.resolve();
    await pending;
    assert.deepEqual(events, ['message:You see your little dog.']);
    assert.equal(settled, true);
});

test('monster retaliation completes artifact selection and new welding',
    async () => {
        await prepareSelectedAction();
        const cases = [
            {
                name: 'artifact',
                reason: 'monster artifact weapon selection',
                object: () => {
                    const sting = monsterObject(ELVEN_DAGGER);
                    sting.oartifact = ART_STING;
                    return sting;
                },
            },
            {
                name: 'welded',
                reason: 'monster wield action with a welded weapon',
                object: () => {
                    const dagger = monsterObject(DAGGER);
                    dagger.cursed = true;
                    return dagger;
                },
            },
        ];
        for (const row of cases) {
            // The two fixtures distinguish C's touchable artifact selector
            // from its ordinary cursed-weapon selector.
            const selected = row.object();
            const monster = ordinaryMonster(PM_GNOME, 10, 10, {
                minvent: selected,
                mw: null,
                weapon_check: NEED_HTH_WEAPON,
            });
            selected.ocarry = monster;
            // The C-created fixture marks its Sting as existing before the
            // naming path can discover it.
            if (row.name === 'artifact')
                game.artiexist[ART_STING].exists = 1;
            const result = await wieldMonsterItemAgainstMonster(monster, {
                state: game,
            });
            assert.equal(result, 1, row.name);
            assert.equal(monster.mw, selected, row.name);
            assert.equal(monster.weapon_check, NEED_WEAPON, row.name);
        }
    });

test('pet landmine scatter interrupts the hero', async () => {
    const target = await prepareStartingPetAction(PM_PONY);
    // Keep the hero one square beyond the mine. The real scatter path can
    // then reach the hero with one eastward rock step.
    game.u.ux = game.u.ux0 = target.destinationX + 1;
    target.monster.mux = game.u.ux;
    target.monster.muy = game.u.uy;
    const trap = {
        tx: target.destinationX,
        ty: target.heroY,
        ttyp: LANDMINE,
        tseen: false,
        madeby_u: false,
    };
    game.level.traps.push(trap);
    const rock = floorObject(target.destinationX, target.heroY, 9401, ROCK);
    installObject(target, rock);

    // Preserve an actual unfinished meal and canned command so C's
    // stop_occupation effects are visible.
    const occupation = eatfood;
    game.go.occupation = occupation;
    game.go.occtxt = 'eating';
    const ration = newObject({
        otyp: FOOD_RATION,
        oclass: game.objects[FOOD_RATION].oc_class,
        o_id: 9402,
        quan: 1,
        owt: game.objects[FOOD_RATION].oc_weight,
        oeaten: 400,
        where: OBJ_INVENT,
        nobj: game.invent,
    });
    game.invent = ration;
    game.context.victual = {
        ...game.context.victual,
        piece: ration,
        o_id: ration.o_id,
        usedtime: 0,
        reqtime: 5,
        eating: 1,
    };
    game.command_queue = [[], []];
    cmdq_add_key(CQ_CANNED, 's'.charCodeAt(0), game);
    // Keep the source hit on the real path while avoiding the unrelated
    // post-hit encumbrance message that thitu's current adapter omits.
    game.moves = 0;
    // win/tty/topl.c update_topl():262-275 joins a message to the top line
    // only while both fit with room for --More-- (n0 + strlen + 3 < CO - 8,
    // 72 columns); otherwise more() waits for a key. Three waits: before
    // trap.c:2632's "Kaablamm!  You hear an explosion in the distance!" (the
    // startup welcome fills the line), before "You are hit by a rock."
    // (mthrowu.c thitu(); 22 + 49 + 3 >= 72), which "You stop eating."
    // (allmain.c:688) then joins, and before mon.c:3101's "You have a sad
    // feeling for a moment, then it passes." (52 + 40 + 3 >= 72).
    for (let i = 0; i < 3; ++i) game.nhDisplay.pushKey(' '.charCodeAt(0));
    const hpBefore = game.u.uhp;
    const pony = target.monster;
    const draws = [];
    const random = { ...coreRandom,
        rn2(bound) {
            draws.push(['rn2', bound]);
            if (bound === 1301) return 400; // dog_move's mine trigger.
            if (bound === 8) return 4; // scatter east, toward the hero.
            if (bound === 10) return 1; // retain the ordinary rock.
            return 0;
        },
        rnd(bound) {
            draws.push(['rnd', bound]);
            return bound === 20 ? 1 : bound;
        },
        rn1(bound, base) { draws.push(['rn1', bound, base]); return base; },
        rne(bound) { draws.push(['rne', bound]); return 1; },
        rnl(bound) { draws.push(['rnl', bound]); return 0; },
        d(number) { draws.push(['d', number]); return number; },
    };

    await runSimpleMonsterAction(pony, {
        state: game,
        random,
    });

    assert.ok(game.u.uhp < hpBefore, JSON.stringify({
        message: 'real rock scatter hits the hero',
        hp: game.u.uhp,
        hpBefore,
        pony: { x: pony.mx, y: pony.my, mhp: pony.mhp },
        trap: game.level.traps.map(({ tx, ty, ttyp }) => ({ tx, ty, ttyp })),
        rock: game.level.objects[target.destinationX][target.heroY]?.otyp,
        draws,
    }));
    assert.deepEqual({
        occupation: game.go.occupation ?? null,
        canned: game.command_queue[0],
    }, {
        occupation: null,
        canned: [],
    }, 'scatter interruption stops the occupation and canned command');
    assert.ok(draws.some(([kind, bound]) => kind === 'rn2' && bound === 1301));
    assert.ok(draws.some(([kind, bound]) => kind === 'rn2' && bound === 8));
    assert.equal(game.nhDisplay.inputQueueLength, 0, 'three --More-- waits');
});

test('pony rolling trap hits the hero with a real boulder', async () => {
    const target = await prepareStartingPetAction(PM_PONY);
    const pony = target.monster;
    const oldX = pony.mx, oldY = pony.my;
    game.level.monsters[oldX][oldY] = null;
    pony.mx = 8;
    pony.my = 11;
    game.level.monsters[pony.mx][pony.my] = pony;
    game.u.ux = game.u.ux0 = 7;
    game.u.uy = game.u.uy0 = 10;
    game.u.uhp = game.u.uhpmax = 100;
    game.moves = 2;
    // A source-valid clear CORR line permits a naturally generated straight
    // launch from (2,10) across trap (8,10) to (14,10). The only closer
    // neighbor the pony can occupy is the unseen trap center.
    for (let x = 2; x <= 14; ++x) {
        for (let y = 8; y <= 12; ++y) {
            const cell = game.level.at(x, y);
            cell.typ = STONE;
            cell.flags = 0;
            cell.flags = W_NONDIGGABLE | W_NONPASSWALL;
        }
        const lane = game.level.at(x, 10);
        lane.typ = CORR;
        lane.flags = 0;
    }
    game.level.at(8, 11).typ = ROOM;
    const trap = {
        tx: 8, ty: 10, ttyp: ROLLING_BOULDER_TRAP,
        tseen: false, madeby_u: false,
        launch: { x: 2, y: 10 }, launch2: { x: 14, y: 10 },
    };
    game.level.traps.push(trap);
    const boulder = floorObject(2, 10, 9450, BOULDER);
    installObject(target, boulder);

    // An arbitrary fixed seed makes the core draws below reproducible.
    initRng(3612346);
    const hpBefore = game.u.uhp;
    // One --More-- (win/tty/topl.c update_topl():262-275): trap.c:3328's
    // "You hear rumbling in the distance." cannot join the startup welcome,
    // and "You are hit by a boulder!" then fits beside it (25 + 34 + 3 < 72).
    game.nhDisplay.pushKey(' '.charCodeAt(0));
    const initialCanonicalBhitpos = game.gb?.bhitpos
        ? { ...game.gb.bhitpos } : null;
    let firstLaunchDropSpot = null;
    let launchplace = game.launchplace;
    Object.defineProperty(game, 'launchplace', {
        configurable: true,
        get: () => launchplace,
        set(value) {
            if (!firstLaunchDropSpot && value?.obj)
                firstLaunchDropSpot = { x: value.x, y: value.y };
            launchplace = value;
        },
    });
    const standardRandom = createCoreRandom(game.coreCtx, game);
    const draws = [];
    const random = new Proxy(standardRandom, {
        get(owner, name) {
            const operation = owner[name];
            return typeof operation === 'function'
                ? (...args) => {
                    const value = operation(...args);
                    draws.push([name, ...args, value]);
                    return value;
                }
                : operation;
        },
    });

    let actionError = null;
    try {
        await runSimpleMonsterAction(pony, { state: game, random });
    } catch (error) {
        actionError = error;
    } finally {
        // Restore a plain data property so later cases see an ordinary game.
        delete game.launchplace;
        game.launchplace = launchplace;
    }

    assert.deepEqual({ x: pony.mx, y: pony.my },
        { x: 8, y: 10 }, 'the real pet step selects the unseen trap center');
    assert.ok(game.u.uhp < hpBefore, JSON.stringify({
        message: 'actual rolling boulder hits the hero',
        hp: game.u.uhp,
        hpBefore,
        pony: { x: pony.mx, y: pony.my },
        draws,
    }));
    assert.ok(draws.some(([name, bound]) => name === 'rnd' && bound === 20),
        JSON.stringify(draws));
    assert.equal(actionError, null, JSON.stringify({
        blocker: actionError?.stack ?? null,
        draws,
        hp: game.u.uhp,
        bhitpos: game.bhitpos ?? null,
        gbBhitpos: game.gb?.bhitpos ?? null,
        pony: { x: pony.mx, y: pony.my },
    }));
    assert.ok(draws.some(([name, bound]) => name === 'rn2' && bound === 2),
        JSON.stringify(draws));
    assert.deepEqual(firstLaunchDropSpot, { x: 2, y: 10 },
        'the initial in-flight placement marker uses the launch origin');
    assert.deepEqual(game.gb.bhitpos, { x: 14, y: 10 }, JSON.stringify({
        initialCanonicalBhitpos,
        finalCanonicalBhitpos: game.gb.bhitpos,
        rootBhitpos: game.bhitpos ?? null,
    }));
    assert.equal(Object.hasOwn(game, 'bhitpos'), false,
        'launch position stays on the canonical gb owner');
    const boulderLocations = [];
    for (let object = game.level.objlist; object; object = object.nobj) {
        if (object.otyp === BOULDER)
            boulderLocations.push({ x: object.ox, y: object.oy, where: object.where });
    }
    assert.deepEqual(boulderLocations, [{ x: 14, y: 10, where: 1 }],
        'one launched boulder is placed at the canonical endpoint');
    assert.equal(game.nhDisplay.inputQueueLength, 0, 'one --More-- wait');
});

// dog_hunger's source weak and starvation thresholds are strictly greater
// than hungrytime + 500 / +750.
for (const arm of [
    { name: 'weakness', moves: 1501, maximum: 8, penalty: 0 },
    { name: 'weakness with zero maximum', moves: 1501, maximum: 2, penalty: 0 },
    { name: 'starvation', moves: 1751, maximum: 8, penalty: 5 },
]) {
    test('a pet reaching dog_hunger ' + arm.name, async () => {
        const target = await prepareStartingPetAction(PM_PONY);
        game.moves = arm.moves;
        target.monster.mhp = target.monster.mhpmax = arm.maximum;
        target.monster.mextra.edog.mhpmax_penalty = arm.penalty;
        // The live hunger/starvation message may dismiss the startup line.
        for (let i = 0; i < 8; ++i) game.nhDisplay.pushKey(' '.charCodeAt(0));
        await runSimpleMonsterAction(target.monster, { state: game });
        if (!arm.penalty) {
            assert.equal(target.monster.mhpmax, Math.trunc(arm.maximum / 3));
            assert.equal(target.monster.mconf, true);
        }
        if (arm.penalty || arm.maximum < 3) {
            // mon.c:m_detach keeps the dead pet on fmon until dmonsfree.
            assert.equal(target.monster.mhp, 0);
            assert.equal(game.iflags.purge_monsters, 1);
        }
    });
}

// trap.c:3742-3749 calls seetrap() on any turn a hero comes upon an obviously
// held monster, whatever the rn2(40) escape roll then answers. monmove.c
// m_move()'s mtrapped prologue reaches it through mintrap().
test('a held monster in sight reveals its unmapped trap', async () => {
    const target = await prepareSelectedAction();
    target.monster.mtrapped = true;
    // trap.c:3742 wants cansee() at the monster's square and display.h
    // canseemon() wants it in sight as well as seen, so both bits are set;
    // prepareSelectedAction() leaves only COULD_SEE.
    game.viz_array[target.heroY][target.monsterX] |= COULD_SEE | IN_SIGHT;
    game.level.traps.push({
        // Unmapped, which is the conjunct that opens C:3742.
        tx: target.monsterX,
        ty: target.heroY,
        ttyp: BEAR_TRAP,
        tseen: false,
    });
    await runLiveMonsterScan();

    assert.equal(game.level.traps[0].tseen, true, 'seetrap() mapped it');
    // Nothing waited for a key; see the escape case below for the line an
    // rn2(40) escape prints.
    assert.equal(game.nhDisplay.inputQueueLength, 0);
});

// The escape line is the other half of the same prologue. trap.c:3751 frees a
// held monster on `!rn2(40)`, and :3766-3769 tell a hero who can see it, so
// this drives m_move() itself with that roll answered.
test('a held monster in sight pulls free of its bear trap', async () => {
    const target = await prepareSelectedAction();
    target.monster.mtrapped = true;
    // The prologue's next gate. One turn of meating left ends m_move() at
    // monmove.c:1745-1749 with MMOVE_DONE, before set_apparxy() and mfndpos()
    // draw anything more, so the injected random below answers the escape
    // roll alone.
    target.monster.meating = 1;
    game.viz_array[target.heroY][target.monsterX] |= COULD_SEE | IN_SIGHT;
    game.level.traps.push({
        tx: target.monsterX,
        ty: target.heroY,
        ttyp: BEAR_TRAP,
        // Mapped already, which shuts trap.c:3742's first conjunct: this case
        // is about the line at :3768-3769, not about the reveal above.
        tseen: true,
    });
    // trap.c:3766 writes nothing for a monster the hero cannot watch.
    assert.equal(canseemon(target.monster, game), true);
    const written = [];

    const status = await m_move(target.monster, {
        state: game,
        message: async (line) => { written.push(line); },
        // The held arm draws rn2 alone; 0 is the one answer trap.c:3751 frees
        // the monster on. The other four fail loudly, so a fixture that
        // started drawing them could not pass quietly.
        random: {
            rn2: () => 0,
            rn1: () => assert.fail('the held arm draws rn2 alone'),
            rnd: () => assert.fail('the held arm draws rn2 alone'),
            rne: () => assert.fail('the held arm draws rn2 alone'),
            rnl: () => assert.fail('the held arm draws rn2 alone'),
        },
        finishEating: () => {},
        movePet: () => assert.fail('an ordinary monster is not a pet'),
        resistsTrapEffect: () => false,
        unsupported: (reason) => assert.fail(reason),
    });

    assert.equal(status, MMOVE_DONE, 'monmove.c:1749, still eating');
    assert.equal(target.monster.mtrapped, false, 'trap.c:3775');
    assert.deepEqual(written,
        ['The giant rat pulls free of the bear trap.'], 'trap.c:3768-3769');
});

test('simple monster movement continues through an ignored object',
    async () => {
        const target = await prepareSelectedAction();
        const rock = floorObject(target.destinationX, target.heroY);
        installObject(target, rock);

        const result = await runSimpleMonsterAction(target.monster, {
            state: game,
        });
        // dochug() converts a successful m_move() result to zero so the
        // caller may continue the monster's remaining action dispatch.
        assert.equal(result, MMOVE_NOTHING);
        assert.deepEqual(
            [target.monster.mx, target.monster.my],
            [target.destinationX, target.heroY],
        );
        assert.equal(
            game.level.objects[target.destinationX][target.heroY],
            rock,
        );
    });

test('live fog movement leaves harmless vapor without extra output or RNG',
    async () => {
        const run = async (regionKind) => {
            const target = await prepareSelectedAction({
                pmidx: PM_FOG_CLOUD,
            });
            let region = null;
            if (regionKind) {
                region = create_region([{
                    lx: target.monsterX,
                    ly: target.heroY,
                    hx: regionKind === 'same'
                        ? target.destinationX : target.monsterX,
                    hy: target.heroY,
                }]);
                region.monsters = [target.monster.m_id];
                if (regionKind === 'vapor') {
                    Object.assign(region, {
                        arg: 0,
                        expire_f: 'expire_gas_cloud',
                        inside_f: 'inside_gas_cloud',
                        ttl: 5,
                        visible: true,
                    });
                }
                game.level.regions = [region];
            }
            const messagesBefore = [...game.nhDisplay.messages];
            const regionBefore = region ? structuredClone(region) : null;

            const result = await runSimpleMonsterAction(target.monster, {
                state: game,
            });

            return {
                members: region?.monsters ?? null,
                region: region ? structuredClone(region) : null,
                regionBefore,
                messages: game.nhDisplay.messages.slice(
                    messagesBefore.length,
                ),
                position: [target.monster.mx, target.monster.my],
                result,
                rng: rngSnapshot(),
            };
        };

        const ordinary = await run(null);
        const sameRegion = await run('same');
        const leftVapor = await run('vapor');

        assert.deepEqual(leftVapor.position, sameRegion.position);
        assert.deepEqual(leftVapor.position, ordinary.position);
        assert.deepEqual(leftVapor.position, [8, 10]);
        assert.equal(leftVapor.result, MMOVE_NOTHING);
        assert.deepEqual(leftVapor.members, []);
        assert.deepEqual(sameRegion.members, [9001]);
        assert.deepEqual(
            leftVapor.region,
            { ...leftVapor.regionBefore, monsters: [] },
        );
        assert.deepEqual(sameRegion.region, sameRegion.regionBefore);
        assert.deepEqual(leftVapor.messages, []);
        assert.deepEqual(leftVapor.messages, ordinary.messages);
        assert.deepEqual(leftVapor.rng, ordinary.rng);
        assert.deepEqual(sameRegion.rng, ordinary.rng);
    });

test('dogmove preserves source order before the mounted-steed no-op', () => {
    // C dogmove.c:dog_goal() returns -2 for the current steed before its
    // goal setup, visibility queries, or random draws. dog_move() reaches
    // that return only after hunger, mounted distance, and inventory handling.
    const goalStart = DOGMOVE_SOURCE.indexOf(
        'dog_goal(\n    struct monst *mtmp,',
    );
    const goalEnd = DOGMOVE_SOURCE.indexOf(
        '\nstaticfn struct monst *\nfind_targ',
        goalStart,
    );
    assert.ok(goalStart >= 0 && goalEnd > goalStart);
    const cGoal = DOGMOVE_SOURCE.slice(goalStart, goalEnd);
    const cSteedReturn = cGoal.indexOf(
        'if (mtmp == u.usteed)\n        return -2;',
    );
    assert.ok(cSteedReturn >= 0);
    assert.ok(cSteedReturn < cGoal.indexOf('omx = mtmp->mx;'));
    assert.ok(cSteedReturn < cGoal.indexOf('in_masters_sight = couldsee'));

    const cMoveStart = DOGMOVE_SOURCE.indexOf(
        'dog_move(\n    struct monst *mtmp,',
    );
    assert.ok(cMoveStart >= 0);
    const cOrder = [
        DOGMOVE_SOURCE.indexOf('dog_hunger(mtmp, edog)', cMoveStart),
        DOGMOVE_SOURCE.indexOf('if (mtmp == u.usteed)', cMoveStart),
        DOGMOVE_SOURCE.indexOf('dog_invent(mtmp, edog, udist)', cMoveStart),
        DOGMOVE_SOURCE.indexOf(
            'appr = dog_goal(mtmp, edog, after, udist, whappr);',
            cMoveStart,
        ),
        DOGMOVE_SOURCE.indexOf('if (appr == -2)', cMoveStart),
    ];
    assert.ok(cOrder.every((position) => position > cMoveStart));
    assert.deepEqual(cOrder, [...cOrder].sort((a, b) => a - b));
    assert.match(DOGMOVE_SOURCE.slice(cOrder[4], cOrder[4] + 80),
        /return MMOVE_NOTHING;/);

    // The existing JS port must retain the same setup and short-circuit order.
    const jsGoalStart = DOGMOVE_JS_SOURCE.indexOf('export function dog_goal(');
    const jsSteedReturn = DOGMOVE_JS_SOURCE.indexOf(
        'if (monster === hero?.usteed) return -2;',
        jsGoalStart,
    );
    assert.ok(jsGoalStart >= 0 && jsSteedReturn > jsGoalStart);
    const jsMoveStart = DOGMOVE_JS_SOURCE.indexOf(
        'export async function dog_move(',
    );
    const jsOrder = [
        DOGMOVE_JS_SOURCE.indexOf('dog_hunger(monster, edog, env)', jsMoveStart),
        DOGMOVE_JS_SOURCE.indexOf('if (monster === state.u.usteed)', jsMoveStart),
        DOGMOVE_JS_SOURCE.indexOf('dog_invent(', jsMoveStart),
        DOGMOVE_JS_SOURCE.indexOf('const approach = dog_goal(', jsMoveStart),
        DOGMOVE_JS_SOURCE.indexOf(
            'if (approach === -2) return MMOVE_NOTHING;',
            jsMoveStart,
        ),
    ];
    assert.ok(jsOrder.every((position) => position > jsMoveStart));
    assert.deepEqual(jsOrder, [...jsOrder].sort((a, b) => a - b));
});

test('starting-pet adapter wires dog_move reflection to mon_reflects',
    async () => {
        const target = await prepareStartingPetAction(PM_LITTLE_DOG);
        const { monster } = target;
        // C mon_allowflags() admits hostile monster targets for this pet
        // turn only while Conflict is active; the intrinsic bit is its live
        // source predicate, with no blocked alias.
        game.u.uprops[CONFLICT] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
        const shield = monsterObject(SHIELD_OF_REFLECTION);
        shield.owornmask = W_ARMS;
        monster.minvent = shield;

        // The occupied destination is the one legal move candidate. A worn
        // reflection shield makes muse.c:mon_reflects() return true, so the
        // floating-eye hazard gate must admit the pet's attack attempt.
        const eye = ordinaryMonster(
            PM_FLOATING_EYE,
            target.destinationX,
            target.heroY,
            {
                // This fixture identity is distinct from its starting pet.
                m_id: 9002,
                mpeaceful: false,
                mtame: 0,
                // Keep the eye alive through the pet's target/reflection gate.
                mhp: 12,
                mhpmax: 12,
            },
        );
        monster.nmon = eye;
        game.level.monsters[eye.mx][eye.my] = eye;

        const adapterStart = SIMPLE_ACTIONS_JS_SOURCE.indexOf(
            'async function moveSimplePet(',
        );
        const adapterEnd = SIMPLE_ACTIONS_JS_SOURCE.indexOf(
            '\nasync function ',
            adapterStart + 1,
        );
        const adapter = SIMPLE_ACTIONS_JS_SOURCE.slice(
            adapterStart,
            adapterEnd,
        );
        assert.match(adapter,
            /monsterReflects: \(subject, moveEnv\) => mon_reflects\(\s*subject,\s*null,\s*moveEnv\.state,\s*moveEnv,/u);

        // The source-admitted pet is on x=7 with the eye at x=8. dochug()
        // consumes dog_move()'s completed attack and itself returns zero
        // because the pet did not relocate.
        const result = await runSimpleMonsterAction(monster, { state: game });
        assert.equal(result, MMOVE_NOTHING);
        assert.deepEqual(game.gb.bhitpos, {
            x: target.destinationX,
            y: target.heroY,
        });
});

test('both production castmu adapters preserve source mon_nam', () => {
    const mhitu = readFileSync(new URL('../nethack-c/upstream/src/mhitu.c', import.meta.url), 'utf8');
    const js = readFileSync(new URL('../js/unported_monster_actions.js', import.meta.url), 'utf8');
    const attackStart = js.indexOf('function attackHeroWithMattacku(');
    const attackEnd = js.indexOf('// C ref: dogmove.c pet_ranged_attk()', attackStart);
    const attackAdapter = js.slice(attackStart, attackEnd);
    const dochugStart = MONMOVE_SOURCE.indexOf('dochug(struct monst *mtmp)');
    const dochugEnd = MONMOVE_SOURCE.indexOf('\n/* ', dochugStart);
    const dochug = MONMOVE_SOURCE.slice(dochugStart, dochugEnd);
    const spellStart = js.indexOf('castUndirectedSpell: async (subject, spellEnv) =>');
    const spellEnd = js.indexOf('\n                    for (const a of mdat.mattk)', spellStart);
    const spellAdapter = js.slice(spellStart, spellEnd);
    const fumbleStart = MCASTU_SOURCE.indexOf('if (rn2(ml * 10)');
    const fumbleEnd = MCASTU_SOURCE.indexOf('return M_ATTK_MISS;', fumbleStart);
    const fumble = MCASTU_SOURCE.slice(fumbleStart, fumbleEnd);

    assert.match(mhitu, /castmu\(mtmp, mattk, TRUE, foundyou\)/u);
    assert.match(dochug, /castmu\(mtmp, a, FALSE, FALSE\)/u);
    assert.match(fumble, /canseemon\(mtmp\)[\s\S]*?mon_nam\(mtmp\)/u);
    assert.match(attackAdapter,
        /castMonsterSpell:[\s\S]*?monnam: \(mtmp\) => mon_nam\(mtmp, state, spellEnv\)/u);
    assert.match(spellAdapter,
        /monnam: \(mtmp\) => mon_nam\(mtmp, state, spellEnv\)/u);
    assert.doesNotMatch(spellAdapter, /pmnames\?\./u,
        'the undirected-spell adapter must preserve invisible and other C naming rules');
});

test('monster missile caller adapters preserve hallucinated display RNG', () => {
    const mThrowStart = MTHROWU_SOURCE.indexOf('void\nm_throw(\n');
    const mThrowEnd = MTHROWU_SOURCE.indexOf('\n#undef MT_FLIGHTCHECK', mThrowStart);
    assert.ok(mThrowStart >= 0 && mThrowEnd > mThrowStart);
    const sourceMThrow = MTHROWU_SOURCE.slice(mThrowStart, mThrowEnd);
    assert.match(sourceMThrow,
        /obj_to_glyph\(singleobj,\s*rn2_on_display_rng\)/u);

    const sourceMonshootStart = MTHROWU_SOURCE.indexOf(
        'monshoot(struct monst *mtmp, struct obj *otmp, struct obj *mwep)',
    );
    const sourceMonshootEnd = MTHROWU_SOURCE.indexOf(
        '\n/* an object launched by someone/thing other than player',
        sourceMonshootStart,
    );
    assert.ok(sourceMonshootStart >= 0 && sourceMonshootEnd > sourceMonshootStart);
    const sourceMonshoot = MTHROWU_SOURCE.slice(
        sourceMonshootStart,
        sourceMonshootEnd,
    );
    assert.match(sourceMonshoot, /Monnam\(mtmp\)/u);

    const thrwmmStart = MTHROWU_SOURCE.indexOf('\nthrwmm(struct monst *mtmp,');
    const thrwmmEnd = MTHROWU_SOURCE.indexOf('\nspitmm(struct monst *mtmp,', thrwmmStart);
    const thrwmuStart = MTHROWU_SOURCE.indexOf('\nthrwmu(struct monst *mtmp)');
    const thrwmuEnd = MTHROWU_SOURCE.indexOf('\n/* monster spits substance at you', thrwmuStart);
    assert.ok(thrwmmStart >= 0 && thrwmmEnd > thrwmmStart);
    assert.ok(thrwmuStart >= 0 && thrwmuEnd > thrwmuStart);
    assert.match(MTHROWU_SOURCE.slice(thrwmmStart, thrwmmEnd), /monshoot\(mtmp, otmp, mwep\)/u);
    assert.match(MTHROWU_SOURCE.slice(thrwmuStart, thrwmuEnd), /monshoot\(mtmp, otmp, mwep\)/u);

    const spitmmStart = MTHROWU_SOURCE.indexOf(
        '\nspitmm(struct monst *mtmp, struct attack *mattk, struct monst *mtarg)',
    );
    const spitmmEnd = MTHROWU_SOURCE.indexOf(
        '\nstaticfn const char *\nbreathwep_name',
        spitmmStart,
    );
    assert.ok(spitmmStart >= 0 && spitmmEnd > spitmmStart);
    assert.match(MTHROWU_SOURCE.slice(spitmmStart, spitmmEnd), /m_throw\(/u);

    const useOffensiveStart = MUSE_SOURCE.indexOf(
        '\nuse_offensive(struct monst *mtmp)',
    );
    const useOffensiveEnd = MUSE_SOURCE.indexOf(
        '\nint\nrnd_offensive_item',
        useOffensiveStart,
    );
    assert.ok(useOffensiveStart >= 0 && useOffensiveEnd > useOffensiveStart);
    assert.match(MUSE_SOURCE.slice(useOffensiveStart, useOffensiveEnd), /m_throw\(/u);

    const missileAdapterStart = SIMPLE_ACTIONS_JS_SOURCE.indexOf(
        'function monsterMissileEnv(',
    );
    const missileAdapterEnd = SIMPLE_ACTIONS_JS_SOURCE.indexOf(
        '\n// C ref: muse.c use_offensive()',
        missileAdapterStart,
    );
    assert.ok(missileAdapterStart >= 0 && missileAdapterEnd > missileAdapterStart);
    const missileAdapter = SIMPLE_ACTIONS_JS_SOURCE.slice(
        missileAdapterStart,
        missileAdapterEnd,
    );
    assert.match(missileAdapter,
        /objectToGlyph: \(obj, state\) =>\s*obj_to_glyph\(obj, state, env\.displayRandom\)/u);
    assert.ok(missileAdapter.includes(
        'monsterName: (subject) => capitalizedMonsterName(',
    ));
    assert.ok(missileAdapter.includes(
        'subject,\n            env.state,\n            { displayRandom: env.displayRandom },',
    ));

    const potionAdapterStart = SIMPLE_ACTIONS_JS_SOURCE.indexOf(
        'async function useOffensiveItem(',
    );
    const potionAdapterEnd = SIMPLE_ACTIONS_JS_SOURCE.indexOf(
        '\n// C ref: mhitu.c mattacku()',
        potionAdapterStart,
    );
    assert.ok(potionAdapterStart >= 0 && potionAdapterEnd > potionAdapterStart);
    assert.match(SIMPLE_ACTIONS_JS_SOURCE.slice(potionAdapterStart, potionAdapterEnd),
        /\.\.\.monsterMissileEnv\(monster, env\)/u);

    const petAdapterStart = SIMPLE_ACTIONS_JS_SOURCE.indexOf(
        'export async function runPetRangedAttack(',
    );
    const petAdapterEnd = SIMPLE_ACTIONS_JS_SOURCE.indexOf(
        '\nexport async function wieldMonsterItemAgainstMonster',
        petAdapterStart,
    );
    assert.ok(petAdapterStart >= 0 && petAdapterEnd > petAdapterStart);
    const petAdapter = SIMPLE_ACTIONS_JS_SOURCE.slice(
        petAdapterStart,
        petAdapterEnd,
    );
    assert.match(petAdapter,
        /mattackm: \(attacker, target, attackEnv\) => mattackm\([\s\S]*?\.\.\.monsterMissileEnv\(attacker, attackEnv\)/u);
});

test('a tame hatched species with edog state reaches dog_move',
    async () => {
        // The v20 hatch case produces a tame giant ant. C's m_move() dispatches
        // every tame monster to dog_move(), while dog_move() requires an edog
        // extension rather than membership in the starting-pet species list.
        assert.match(MONMOVE_SOURCE,
            /if \(mtmp->mtame\) \{\s*return postmov\([\s\S]*?dog_move\(mtmp, after\)/u);
        assert.match(DOGMOVE_SOURCE,
            /edog = \(mtmp->mtame && has_edog\(mtmp\)\) \? EDOG\(mtmp\) : 0/u);

        const target = await prepareSelectedAction({ pmidx: PM_GIANT_ANT });
        const { monster } = target;
        // The selected species is the recorded hatchling, which is not one of
        // the three new-game pets. Use C's tamedog initializer to create the
        // required source edog state without inventing its field values.
        assert.equal(await tamedog(monster, null, false, { state: game }), true);
        assert.equal(monster.data.pmidx, PM_GIANT_ANT);
        assert.ok(monster.mextra?.edog);

        await runSimpleMonsterAction(monster, { state: game });
    });

test('a mounted leashed pony passes live action guards', async () => {
    const target = await prepareStartingPetAction(PM_PONY);
    const { monster: steed } = target;
    // C's mounted steed occupies the hero's square; the generic action helper
    // starts its test monster away from the hero for ordinary pet movement.
    game.level.monsters[steed.mx][steed.my] = null;
    steed.mx = game.u.ux;
    steed.my = game.u.uy;
    game.level.monsters[steed.mx][steed.my] = steed;
    game.u.usteed = steed;
    // The selected case attaches this leash to the current steed before its
    // monster turn, which is the exact state this exception must admit.
    steed.mleashed = true;

    const result = await runSimpleMonsterAction(steed, { state: game });
    assert.equal(result, MMOVE_NOTHING);
    assert.deepEqual([steed.mx, steed.my], [game.u.ux, game.u.uy]);
});

test('an ordinary leashed starting pet keeps its leash through dog_move',
    async () => {
        const target = await prepareStartingPetAction(PM_LITTLE_DOG);
        // C dog_goal gives a leashed, unmounted dog the hero's coordinates;
        // its movement uses dog_move's distance limit rather than a refusal.
        target.monster.mleashed = true;
        game.u.usteed = null;
        await runSimpleMonsterAction(target.monster, { state: game });
        assert.equal(target.monster.mleashed, true);
    });

test('simple ordinary monster and starting pet can land in a corridor',
    async () => {
        const cases = [
            {
                name: 'ordinary monster',
                prepare: () => prepareSelectedAction(),
            },
            {
                name: 'starting pet',
                prepare: () => prepareStartingPetAction(PM_LITTLE_DOG),
            },
        ];

        for (const movementCase of cases) {
            const target = await movementCase.prepare();
            game.level.at(target.destinationX, target.heroY).typ = CORR;

            const result = await runSimpleMonsterAction(target.monster, {
                state: game,
            });
            assert.equal(result, MMOVE_NOTHING, movementCase.name);
            assert.deepEqual(
                [target.monster.mx, target.monster.my],
                [target.destinationX, target.heroY],
                movementCase.name,
            );
            assert.equal(
                game.level.at(target.destinationX, target.heroY).typ,
                CORR,
                movementCase.name,
            );
        }
    });

test('a tame minion refuses its unported movement',
    async () => {
        // A tame minion eating dog still throws. Non-tame EMIN roamers now
        // use ordinary m_move(), but guardian-pet movement remains outside
        // this span.
        const target = await prepareStartingPetAction(PM_LITTLE_DOG);
        target.monster.isminion = true;
        target.monster.meating = 1;
        await assert.rejects(
            runSimpleMonsterAction(target.monster, { state: game }),
            (error) => error instanceof UnsupportedSimpleMonsterActionError
                && error.reason === 'tame minion movement',
            'minion eating dog',
        );
    });

test('non-tame EMIN roamers use ordinary movement and avoid known fire traps',
    async () => {
        for (const peaceful of [false, true]) {
            const target = await prepareSelectedAction({
                pmidx: PM_ALIGNED_CLERIC,
            });
            target.monster.isminion = true;
            target.monster.ispriest = false;
            target.monster.mpeaceful = peaceful;
            target.monster.mtame = 0;
            target.monster.mextra = {
                emin: { parentmid: 0, min_align: 0, renegade: !peaceful },
            };
            // C mk_roamer() teaches every trap before the first ordinary
            // m_move(). A known fire trap must therefore be avoided rather
            // than activated while this non-tame EMIN takes its turn.
            target.monster.mtrapseen = -1;
            game.level.traps.push({
                tx: target.destinationX,
                ty: target.heroY,
                ttyp: FIRE_TRAP,
                tseen: true,
            });

            await assert.doesNotReject(
                runSimpleMonsterAction(target.monster, { state: game }),
                `peaceful=${peaceful}`,
            );
            assert.deepEqual(
                [target.monster.mx, target.monster.my],
                [target.monsterX, target.heroY],
                `peaceful=${peaceful}: known fire trap was avoided`,
            );
            assert.notEqual(game.program_state?.gameover, true);
        }
    });

test('a monster pickup merges into a carried stack',
    async () => {
        // mpickstuff() hands the floor stack to mpickobj() -> add_to_minv(),
        // whose merge loop adds the quantity to a matching stack the monster
        // already carries and frees the floor object.
        // A gnome is M2_COLLECT but not M2_GREEDY, so food is a class it
        // takes and gold is not.
        const target = await prepareSelectedAction({ pmidx: PM_GNOME });
        // Both stacks go through newObject(), because mergable() compares
        // every flag it finds: two sparse literals could differ and the
        // merge this test is about would never happen.
        const carried = newObject({
            ...monsterObject(FOOD_RATION, 9201),
            quan: 6, // Any stack the floor pile can merge into.
        });
        carried.ocarry = target.monster;
        target.monster.minvent = carried;
        const pile = newObject({
            ...floorObject(
                target.destinationX,
                target.heroY,
                9101,
                FOOD_RATION,
            ),
            // Distinct from the carried quantity, so a merge shows.
            quan: 4,
        });
        installObject(target, pile);

        target.monster.weapon_check = NEED_HTH_WEAPON;
        await runSimpleMonsterAction(target.monster, {
            state: game,
            message: async () => {},
            redraw: () => {},
        });
        assert.equal(target.monster.minvent, carried);
        assert.equal(carried.quan, 10);
        assert.equal(
            game.level.objects[target.destinationX][target.heroY],
            null,
        );
        assert.equal(game.level.objlist, null);
        // C ref: monmove.c:1680 turns a successful pickup into MMOVE_DONE, and
        // dochug() reaches its post-move ranged attack only on MMOVE_MOVED.
        // That arm would reset an empty-handed gnome to NEED_WEAPON.
        assert.equal(target.monster.weapon_check, NEED_HTH_WEAPON);
    });

test('an in-range gazing monster reaches gazemu', async () => {
    // C ref: monmove.c:965-975 with mhitu.c mattacku(). A monster that only
    // believes it is near the hero still reaches mattacku(), where the range2
    // arms are AT_BREA's breamu(), AT_SPIT's spitmu() and AT_GAZE's gazemu().
    // A gazing monster now reaches whole mhitu.c:gazemu. AD_TYP 255 is an
    // intentionally out-of-domain synthetic value with no switch arm, so the
    // C default calls discarded pline.c:impossible and returns M_ATTK_MISS;
    // this checks the action no longer refuses at the former gazemu stub.
    const target = await prepareSelectedAction();
    // The fixture leaves exactly one legal step. Closing it makes
    // mfndpos() find no candidate, so m_move() returns MMOVE_NOMOVES and
    // dochug() reaches the standard attack gate at range two.
    const step = game.level.at(target.destinationX, target.heroY);
    step.typ = STONE;
    step.flags = 0;
    // NATTK comes from permonst.h:48; fill all six slots because mattacku()
    // calls getmattk() for each slot after the first synthetic gaze.
    const mattk = Array.from({ length: NATTK }, () => (
        { aatyp: AT_NONE, adtyp: 0, damn: 0, damd: 0 }
    ));
    // The synthetic AD_TYP 255 value leaves the source default branch as the
    // target; its one die of two sides is not rolled by that branch.
    mattk[0] = { aatyp: AT_GAZE, adtyp: 255, damn: 1, damd: 2 };
    target.monster.data = { ...target.monster.data, mattk };

    game.unported = new Set();
    await runSimpleMonsterAction(target.monster, { state: game });
    assert.ok(game.unported.has('pline.c impossible'),
        'gazemu records its discarded diagnostic at the source default');
});

// C ref: monmove.c dochug():745-750. Water nymphs have M1_TPORT but no
// species-specific movement arm, so an already fleeing one reaches rloc()
// and spends its turn before m_respond() or ordinary movement. The fixed
// random values choose the only open square next to the starting square and
// pin rloc()'s first destination draw without relying on a recorded session.
test('fleeing water nymph relocates through dochug and rloc', async () => {
    const target = await prepareSelectedAction({ pmidx: PM_WATER_NYMPH });
    target.monster.mflee = true;
    target.monster.mfleetim = 3;
    game.moves = 2;
    const draws = [];
    const random = {
        rn2(bound) {
            draws.push(`rn2(${bound})`);
            if (bound === 40) return 0;
            if (bound === 21) return target.heroY;
            throw new Error(`unexpected rn2(${bound})`);
        },
        rnd(bound) {
            draws.push(`rnd(${bound})`);
            // target.monsterX + 1 is the open route square toward the hero.
            return target.monsterX + 1;
        },
    };

    const before = [target.monster.mx, target.monster.my];
    const result = await runSimpleMonsterAction(target.monster, {
        state: game,
        random,
        newsym: () => {},
        message: async () => {},
    });

    assert.equal(result, 0);
    assert.deepEqual(before, [target.monsterX, target.heroY]);
    assert.deepEqual(
        [target.monster.mx, target.monster.my],
        [target.monsterX + 1, target.heroY],
    );
    assert.deepEqual(draws, ['rn2(40)', 'rnd(79)', 'rn2(21)']);
    assert.equal(target.monster.mflee, true,
        'the successful teleport returns before courage recovery');
});

// C ref: monmove.c dochug():726-731. A sleeping leprechaun outside
// couldsee() returns from disturb() before m_move() reaches leppie_avoidance(),
// so this branch reaches neither the gold movement term nor an attack.
test('sleeping out-of-sight leprechaun takes the disturb no-op', async () => {
    const target = await prepareSelectedAction({ pmidx: PM_LEPRECHAUN });
    target.monster.msleeping = true;
    game.viz_array[target.heroY][target.monsterX] &= ~COULD_SEE;
    const rngBefore = target.replay.getRngLog().length;
    const screensBefore = target.replay.getScreens().length;
    const events = [];

    await movemon_singlemon(target.monster, {
        state: game,
        everyTurnEffect: () => events.push('every-turn'),
        visionRecalc: () => events.push('vision'),
        clearBypasses: () => events.push('bypasses'),
        minLiquid: () => {
            events.push('liquid');
            return false;
        },
        dowear: () => events.push('wear'),
        restrap: () => false,
        canSeeMonster: () => true,
        hideUnder: () => false,
        canSeeHero: () => false,
        canSeeSquare: () => false,
        fightMonster: () => false,
        dochugwAction: (monster, chug, env) => {
            events.push(`dochugw:${chug}`);
            return runSimpleMonsterAction(monster, env);
        },
    });

    assert.deepEqual(events, ['every-turn', 'liquid', 'dochugw:true']);
    assert.equal(target.monster.movement, 0);
    assert.equal(target.monster.msleeping, true);
    assert.equal(target.replay.getRngLog().length, rngBefore);
    assert.equal(target.replay.getScreens().length, screensBefore);
});

// C ref: monmove.c disturb():341-358. This visible, adjacent sleeping
// leprechaun has Stealth active, so C's first wake condition fails before any
// wakeup draw and dochug() returns with the monster asleep before movement.
test('visible sleeping leprechaun reaches the Stealth disturb gate', async () => {
    const target = await prepareSelectedAction({ pmidx: PM_LEPRECHAUN });
    target.monster.msleeping = true;
    // The nonzero intrinsic is C's active Stealth property representation.
    game.u.uprops[STEALTH] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    assert.ok(game.viz_array[target.heroY][target.monsterX] & COULD_SEE);
    const rngBefore = target.replay.getRngLog().length;
    const screensBefore = target.replay.getScreens().length;

    await movemon_singlemon(target.monster, {
        state: game,
        everyTurnEffect: () => {},
        visionRecalc: () => {},
        clearBypasses: () => {},
        minLiquid: () => false,
        dowear: () => {},
        restrap: () => false,
        canSeeMonster: () => true,
        hideUnder: () => false,
        canSeeHero: () => false,
        canSeeSquare: () => false,
        fightMonster: () => false,
        dochugwAction: (monster, _chug, env) =>
            runSimpleMonsterAction(monster, env),
    });

    assert.equal(target.monster.msleeping, true);
    assert.equal(target.monster.movement, 0);
    assert.equal(target.replay.getRngLog().length, rngBefore);
    assert.equal(target.replay.getScreens().length, screensBefore);
});

// This is the production entry point for the same branch, rather than a
// direct helper fixture.  The independently selected D:10 arrival creates a
// beehive; its bees are mobile but asleep and remain beyond mdistu 100 from
// the arrival square.  The closing wait must therefore complete the live
// scan without reaching the bee_eat_jelly special-action boundary.
test('a D:10 beehive wait reaches sleeping-bee disturb through production',
    async () => {
        let boundary = null;
        const moves = '.\u001610\n.';
        const replay = await runSegment({
            seed: 9383012,
            datetime: '20380910111213',
            nethackrc: 'OPTIONS=name:BeeDisturb,role:Wizard,race:human,'
                + 'gender:male,align:neutral\n'
                + 'OPTIONS=!legacy,!tutorial,!splash_screen\n'
                + 'OPTIONS=pettype:none,!acoustics,playmode:debug,!autopickup\n',
            moves,
        }, {
            onBoundary: (error) => { boundary = error; },
        });
        assert.equal(boundary, null);
        assert.equal(replay.getScreens().length, moves.length + 1);

        const bees = [];
        for (let monster = game.level.monlist; monster;
            monster = monster.nmon) {
            if (monster.data?.pmidx !== PM_KILLER_BEE) continue;
            bees.push(monster);
        }
        assert.ok(game.level.flags.has_beehive);
        assert.ok(bees.length > 0, 'D:10 generated sleeping killer bees');
        assert.ok(bees.every((monster) => (
            monster.msleeping
            && monster.mcanmove
            && ((monster.mx - game.u.ux) ** 2
                + (monster.my - game.u.uy) ** 2) > 100
        )));
    });

// C ref: monmove.c dochug() (726-731, 782). A sleeping covetous monster
// outside couldsee() returns from disturb() before tactics(), so the live
// pass must leave its state and the PRNG unchanged. The Wizard of Yendor is used because monsters.h marks it M3_COVETOUS.
test('sleeping out-of-sight covetous monster takes the disturb no-op',
    async () => {
        const target = await prepareSelectedAction({
            pmidx: PM_WIZARD_OF_YENDOR,
        });
        target.monster.msleeping = true;
        game.viz_array[target.heroY][target.monsterX] &= ~COULD_SEE;
        const rngBefore = target.replay.getRngLog().length;
        const screensBefore = target.replay.getScreens().length;
        const events = [];

        await movemon_singlemon(target.monster, {
            state: game,
            everyTurnEffect: () => events.push('every-turn'),
            visionRecalc: () => events.push('vision'),
            clearBypasses: () => events.push('bypasses'),
            minLiquid: () => {
                events.push('liquid');
                return false;
            },
            dowear: () => events.push('wear'),
            restrap: () => false,
            canSeeMonster: () => true,
            hideUnder: () => false,
            canSeeHero: () => false,
            canSeeSquare: () => false,
            fightMonster: () => false,
            dochugwAction: (monster, chug, env) => {
                events.push(`dochugw:${chug}`);
                return runSimpleMonsterAction(monster, env);
            },
        });

        assert.deepEqual(events, ['every-turn', 'liquid', 'dochugw:true']);
        assert.equal(target.monster.movement, 0);
        assert.equal(target.monster.msleeping, true);
        assert.equal(target.replay.getRngLog().length, rngBefore);
        assert.equal(target.replay.getScreens().length, screensBefore);
    });

// C ref: monmove.c dochug():726-731 and m_move():1769. A sleeping long worm
// outside couldsee() returns before the unported wormno movement branch, so
// the live pass must leave its state and PRNG unchanged.
test('sleeping out-of-sight long worm takes the disturb no-op', async () => {
    const target = await prepareSelectedAction({ pmidx: PM_LONG_WORM });
    target.monster.msleeping = true;
    // A positive worm number identifies the long-worm movement state in C.
    target.monster.wormno = 1;
    game.viz_array[target.heroY][target.monsterX] &= ~COULD_SEE;
    const rngBefore = target.replay.getRngLog().length;
    const screensBefore = target.replay.getScreens().length;
    const events = [];

    await movemon_singlemon(target.monster, {
        state: game,
        everyTurnEffect: () => events.push('every-turn'),
        visionRecalc: () => events.push('vision'),
        clearBypasses: () => events.push('bypasses'),
        minLiquid: () => {
            events.push('liquid');
            return false;
        },
        dowear: () => events.push('wear'),
        restrap: () => false,
        canSeeMonster: () => true,
        hideUnder: () => false,
        canSeeHero: () => false,
        canSeeSquare: () => false,
        fightMonster: () => false,
        dochugwAction: (monster, chug, env) => {
            events.push(`dochugw:${chug}`);
            return runSimpleMonsterAction(monster, env);
        },
    });

    assert.deepEqual(events, ['every-turn', 'liquid', 'dochugw:true']);
    assert.equal(target.monster.movement, 0);
    assert.equal(target.monster.msleeping, true);
    assert.equal(target.monster.wormno, 1);
    assert.equal(target.replay.getRngLog().length, rngBefore);
    assert.equal(target.replay.getScreens().length, screensBefore);
});

// C: monmove.c m_move()/postmov() -> trap.c mintrap() ->
// trapeffect_arrow_trap() -> thitm() -> mon.c monkilled(). The first real
// movement places a source-valid tail and establishes the next growtime; the
// fixture then represents an ordinary already-injured (but living) worm at
// HP 1 before the one fresh arrow trap. The selected action uses the normal
// monster-action provider.
test('a long worm dies through a fresh arrow trap and releases its tail', async () => {
    const target = await prepareSelectedAction({ pmidx: PM_LONG_WORM });
    const sourceWorm = target.monster;
    sourceWorm.cham = NON_PM;
    newmonhp(sourceWorm, PM_LONG_WORM, {
        state: game,
        random: createCoreRandom(cloneIsaacContext(game.coreCtx), game),
    });
    const deathsBefore = game.svm.mvitals[PM_LONG_WORM].died;
    const sourceX = target.monsterX - 1;
    game.level.monsters[target.monsterX][target.heroY] = null;
    game.level.at(sourceX, target.heroY).typ = ROOM;
    game.level.at(sourceX, target.heroY).flags = 0;
    game.level.monsters[sourceX][target.heroY] = sourceWorm;
    sourceWorm.mx = sourceX;
    sourceWorm.wormno = 1;
    game.level.worms = Array(MAX_NUM_WORMS).fill(null);
    initworm(sourceWorm, 1, { state: game });
    game.viz_array[target.heroY][sourceX] |= COULD_SEE;

    const worm = sourceWorm;
    const random = createCoreRandom(cloneIsaacContext(game.coreCtx), game);
    assert.equal(worm.data.pmidx, PM_LONG_WORM);
    assert.ok(worm.mhpmax > 1, 'retain the source-derived maximum HP');

    // This first production action is the ordinary prior movement that
    // creates a real visible segment and a future growth deadline.
    await runSimpleMonsterAction(worm, {
        state: game,
        random,
    });
    assert.equal(worm.mx, target.monsterX, 'worm moved through m_move');
    assert.ok(game.level.worms[1].growtime > game.moves,
        'prior worm_move established future growtime');
    const tail = game.level.worms[1].segments[1];
    assert.deepEqual(tail, { x: sourceX, y: target.heroY });

    // The selected route starts from an ordinary injured HP-1 worm, keeps its
    // source-derived max HP, and retains the future growth deadline so the
    // action's worm_move cannot heal it before the arrow trap.
    worm.mhp = 1;
    game.level.at(target.destinationX + 1, target.heroY).typ = STONE;
    game.level.at(target.destinationX + 1, target.heroY).flags =
        W_NONDIGGABLE | W_NONPASSWALL;
    game.level.traps = [{
        tx: target.destinationX,
        ty: target.heroY,
        ttyp: ARROW_TRAP,
        tseen: false,
        once: false,
        madeby_u: false,
        tnote: 0,
        vl: {},
        launch: { x: -1, y: -1 },
        dst: { dnum: -1, dlevel: -1 },
        teledest: { x: 0, y: 0 },
        conjoined: 0,
    }];

    const routeBefore = {
        mx: worm.mx,
        mhp: worm.mhp,
        growtime: game.level.worms[1].growtime,
        tail: game.level.worms[1].segments.map((segment) => ({ ...segment })),
    };
    assert.equal(routeBefore.mhp, 1);
    assert.equal(game.level.traps[0].once, false);
    await runSimpleMonsterAction(worm, {
        state: game,
        random,
    });
    assert.equal(worm.mx, routeBefore.mx + 1,
        'arrow trap was reached through a real closer move');
    assert.equal(worm.mhp, 0, 'real arrow damage completed death');
    assert.equal(worm.wormno, 0, 'death releases the active worm number');
    assert.equal(game.svm.mvitals[PM_LONG_WORM].died, deathsBefore + 1,
        'ordinary makemon form is counted as a long-worm death');
    assert.equal(game.level.worms[1], null,
        'death cleanup releases the segment slot');
    assert.notEqual(worm.mstate & MON_DETACH, 0,
        'death completed the source detach path');
    for (const x of [sourceX, target.monsterX, target.destinationX])
        assert.equal(game.level.monsters[x][target.heroY], null,
            `worm segment at ${x},${target.heroY} was removed`);
    assert.equal(game.level.traps[0].once, true,
        'the real arrow trap fired');
    const corpse = game.level.objects[routeBefore.mx + 1][target.heroY];
    assert.equal(corpse?.otyp, CORPSE, 'real arrow death leaves a corpse');
    assert.equal(corpse.corpsenm, PM_LONG_WORM,
        'corpse preserves the ordinary long-worm species');
    assert.deepEqual(routeBefore.tail.at(-1),
        { x: routeBefore.mx, y: target.heroY }, 'pre-hit head was real');
});

// C ref: monmove.c dochug():717-724. Conflict can clear msleeping during an
// earlier attack in the same scan, but STRAT_WAITFORU still returns before a
// covetous monster reaches tactics(). The waiting bit therefore admits the
// same ordinary no-op as an actually sleeping monster.
test('waiting covetous monster takes the early dochug no-op', async () => {
    const target = await prepareSelectedAction({
        pmidx: PM_WIZARD_OF_YENDOR,
    });
    target.monster.msleeping = false;
    target.monster.mcansee = false;
    target.monster.mstrategy = STRAT_WAITFORU;
    // Keep m_canseeu() false so dochug() preserves STRAT_WAITFORU through its
    // source waitmask check instead of clearing it at monmove.c:710-712.
    game.viz_array[target.heroY][target.monsterX] &= ~COULD_SEE;
    const rngBefore = target.replay.getRngLog().length;
    const screensBefore = target.replay.getScreens().length;
    const events = [];

    await movemon_singlemon(target.monster, {
        state: game,
        everyTurnEffect: () => events.push('every-turn'),
        visionRecalc: () => events.push('vision'),
        clearBypasses: () => events.push('bypasses'),
        minLiquid: () => {
            events.push('liquid');
            return false;
        },
        dowear: () => events.push('wear'),
        restrap: () => false,
        canSeeMonster: () => true,
        hideUnder: () => false,
        canSeeHero: () => false,
        canSeeSquare: () => false,
        fightMonster: () => false,
        dochugwAction: (monster, chug, env) => {
            events.push(`dochugw:${chug}`);
            return runSimpleMonsterAction(monster, env);
        },
    });

    assert.deepEqual(events, ['every-turn', 'liquid', 'dochugw:true']);
    assert.equal(target.monster.movement, 0);
    assert.equal(target.monster.msleeping, false);
    assert.equal(target.monster.mstrategy, STRAT_WAITFORU);
    assert.equal(target.replay.getRngLog().length, rngBefore);
    assert.equal(target.replay.getScreens().length, screensBefore);
});

// C ref: monmove.c dochug():726-731 and :782. The awake/out-of-sight case
// reaches wizard.c tactics(), which recomputes a stale strategy and goal.
test('an awake covetous monster recomputes stale tactics state', async () => {
    const target = await prepareSelectedAction({
        pmidx: PM_WIZARD_OF_YENDOR,
    });
    // Awake removes the early disturb() return; clearing COULD_SEE keeps the
    // monster out of sight.
    target.monster.msleeping = false;
    game.viz_array[target.heroY][target.monsterX] &= ~COULD_SEE;
    // wizard.c tactics() calls strategy(), whose target_on() calls
    // clear stale goal coordinates when this full-health Wizard has
    // no covetous artifact target in the initialized fixture.
    target.monster.mstrategy = STRAT_PLAYER | STRAT_GOAL;
    target.monster.mgoal = {
        x: target.monsterX,
        y: target.heroY,
    };

    await runSimpleMonsterAction(target.monster, { state: game });

    assert.deepEqual(
        {
            mstrategy: target.monster.mstrategy,
            mgoal: { ...target.monster.mgoal },
        },
        { mstrategy: STRAT_NONE, mgoal: { x: 0, y: 0 } },
        'awake out of sight recomputes stale tactics state',
    );
});

// C ref: monmove.c dochug() -> wizard.c tactics() STRAT_GROUND.  This is the
// production adapter for obj_extract_self(): a floor artifact must leave both
// the square pile and the level list before mpickobj() gives it to the
// covetous monster.  A direct tactics() test would miss the external
// extraction hook supplied by dochug().
test('covetous floor-artifact pickup uses the production extraction adapter',
    async () => {
        const target = await prepareSelectedAction({
            pmidx: PM_MASTER_LICH,
        });
        target.monster.mhp = target.monster.mhpmax;
        target.monster.msleeping = false;
        target.monster.mcansee = true;
        // Keep the fixture at wizard.c tactics() after the pickup; the
        // downstream substituted attack family is outside this source span.
        target.monster.data = {
            ...target.monster.data,
            mattk: sourceInertAttacks(),
        };
        game.viz_array[target.heroY][target.monsterX] |= IN_SIGHT;
        const book = floorObject(
            target.monsterX,
            target.heroY,
            9701,
            SPE_BOOK_OF_THE_DEAD,
        );
        installObject(target, book);

        await runSimpleMonsterAction(target.monster, {
            state: game,
            message: async () => {},
            redraw: () => {},
        });
        assert.equal(target.monster.minvent?.otyp, SPE_BOOK_OF_THE_DEAD);
        assert.equal(target.monster.minvent?.where, OBJ_MINVENT);
        assert.equal(
            game.level.objects[target.monsterX][target.heroY],
            null,
        );
        assert.equal(game.level.objlist, null);
    });

// C ref: monmove.c dochug() -> wizard.c tactics() -> mon.c mnexto() with
// RLOC_MSG. This uses the public monster action rather than calling
// rloc_to_flag() directly, so the Wizard's flagged relocation runs through
// dochug().
test('covetous relocation moves the Wizard through dochug',
    async () => {
        const target = await prepareSelectedAction({
            pmidx: PM_WIZARD_OF_YENDOR,
        });
        target.monster.data = {
            ...target.monster.data,
            // Keep the covetous species flags but give it six source-shaped
            // AT_NONE slots so this fixture ends after tactics() and does not
            // enter a later spell boundary unrelated to relocation.
            mattk: sourceInertAttacks(),
        };
        target.monster.mhp = target.monster.mhpmax;
        target.monster.mstrategy = 0;
        target.monster.msleeping = false;
        target.monster.mcansee = true;
        game.u.uprops[HALLUC].intrinsic = 1;
        const startPosition = [target.monster.mx, target.monster.my];
        // The live core stream, except that rn2(5) answers 0. That answer
        // opens wizard.c tactics():412's STRAT_NONE `!rn2(5)` harass arm,
        // which calls mon.c mnexto(); the other rn2(5), monmove.c:538's
        // bravegremlin, matters only to a gremlin.
        const { draws, random: core } = observedCoreRandom(game);
        const random = {
            ...core,
            rn2: (bound) => {
                if (bound !== 5) return core.rn2(bound);
                draws.push({ name: 'rn2', args: [5], value: 0 });
                return 0;
            },
        };

        await runSimpleMonsterAction(target.monster, {
            state: game,
            random,
            message: async () => {},
            redraw: () => {},
        });

        assert.ok(draws.some(({ name, args }) => name === 'rn2' && args[0] === 5));
        assert.notDeepEqual(
            [target.monster.mx, target.monster.my],
            startPosition,
        );
        // mon.c mnexto():3966 places it through enexto() around the hero,
        // whose nearest ring is the adjacent squares.
        assert.equal(Math.max(
            Math.abs(target.monster.mx - game.u.ux),
            Math.abs(target.monster.my - game.u.uy),
        ), 1, `the Wizard is beside the hero at ${target.monster.mx},`
            + `${target.monster.my}`);
    });

// C ref: monmove.c m_move():1829-1837. The mail daemon's verbalize plus
// mongone() path ends its existence, and movemon()'s dmonsfree() tail then
// unlinks it from the level list.
test('a live mail-daemon action leaves through mongone',
    async () => {
        const target = await prepareSelectedAction({
            pmidx: PM_MAIL_DAEMON,
        });
        game.viz_array[target.heroY][target.monsterX] |= IN_SIGHT;
        // monmove.c:1833's verbalize("I'm late!") cannot join the startup
        // welcome on the top line (win/tty/topl.c update_topl():262-275), so
        // one --More-- waits for a key.
        game.nhDisplay.pushKey(' '.charCodeAt(0));

        await runLiveMonsterScan();

        assert.equal(game.level.monlist, null,
            'dmonsfree() unlinked the departed mail daemon');
        assert.equal(game.nhDisplay.inputQueueLength, 0, 'one --More-- wait');
    });

// C ref: monmove.c gelcube_digests():424-434 and dochug():867-879. Empty and
// ineligible inventories continue into ordinary dochug(); an eligible organic
// object is digested and consumes the move.
test('gelatinous cube digestion runs during the monster action',
    async () => {
        for (const testCase of [
            // No inventory makes gelcube_digests return -1 without a draw.
            { label: 'empty inventory', otyp: null },
            // Rock is inorganic, so C skips it and continues the turn scan.
            { label: 'inorganic rock', otyp: ROCK },
            // Food ration is organic, so C consumes a move by digesting it.
            {
                label: 'organic food ration',
                otyp: FOOD_RATION,
            },
            // Killer-bee eggs are ordinary organic eggs without polyfood.
            {
                label: 'ordinary killer-bee egg',
                otyp: EGG,
                corpsenm: PM_KILLER_BEE,
            },
        ]) {
            const target = await prepareSelectedAction({
                pmidx: PM_GELATINOUS_CUBE,
            });
            if (testCase.otyp !== null) {
                // newObject() aliases ocarry over obj.v, which a plain literal
                // lacks. obj_extract_self() follows ocarry when
                // gelcube_digests removes an eligible object from the
                // monster's inventory.
                const object = newObject(monsterObject(testCase.otyp));
                object.ocarry = target.monster;
                if (testCase.corpsenm !== undefined)
                    object.corpsenm = testCase.corpsenm;
                target.monster.minvent = object;
            }

            await runSimpleMonsterAction(target.monster, { state: game });
            if (testCase.otyp === FOOD_RATION || testCase.otyp === EGG) {
                assert.equal(
                    target.monster.minvent,
                    null,
                    `${testCase.label}: C digestion removes the object from the cube`,
                );
            }
        }
    });
