import assert from 'node:assert/strict';
import test from 'node:test';

import {
    A_DEX,
    COULD_SEE,
    D_CLOSED,
    DOOR,
    LAVAWALL,
    MOAT,
    M_AP_MONSTER,
    M_AP_NOTHING,
    M_AP_OBJECT,
    NO_WEAPON_WANTED,
    OBJ_FLOOR,
    ROOM,
    STONE,
    NEED_WEAPON,
    W_WEP,
} from '../js/const.js';
import { effective_attribute, exercise } from '../js/attrib.js';
import { flooreffects } from '../js/do.js';
import { should_mulch_missile } from '../js/dothrow.js';
import { game } from '../js/gstate.js';
import { losehp } from '../js/hack.js';
import { add_to_minv, obj_extract_self, stackobj } from '../js/invent.js';
import { runSegment } from '../js/jsmain.js';
import { PM_GIANT_RAT, PM_STONE_GIANT } from '../js/monsters.js';
import { newMonster } from '../js/monst.js';
import { clear_dknown, mksobj, mksobj_at, place_object, remove_object }
    from '../js/obj.js';
import { observe_object } from '../js/o_init.js';
import { killer_xname, mshot_xname } from '../js/objnam.js';
import {
    ARROW,
    BOULDER,
    BOW,
    ORCISH_DAGGER,
    POT_SLEEPING,
    WAN_STRIKING,
} from '../js/objects.js';
import { blocking_terrain, lined_up, linedup, m_lined_up, m_throw, thitu, thrwmu }
    from '../js/mthrowu.js';
import { potionhit } from '../js/potion.js';
import { passive_obj } from '../js/uhitm.js';
import { block_point, vision_reset } from '../js/vision.js';
import { dmgval, setmnotwielded } from '../js/weapon.js';

// The same Valkyrie several other suites replay: a lit starting room on
// dungeon level one, with the hero standing in it.
const DATETIME = '20260214031500';
const RC = [
    'OPTIONS=name:Lich,role:Valkyrie,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none,!acoustics,time',
    '',
].join('\n');

async function hero() {
    await runSegment({
        seed: 7710044, datetime: DATETIME, nethackrc: RC, moves: '',
    });
    return game;
}

// A monster whose square and believed hero position the caller sets. Only the
// fields linedup() and m_lined_up() read are filled in.
function attacker(state, mx, my, mux, muy, data = state.mons[PM_GIANT_RAT]) {
    return newMonster({ data, mx, my, mux, muy, m_id: 5100 });
}

// A source that fails the test rather than answering, for the paths where C
// reaches no rn2().
function noDraw() {
    return { rn2: (bound) => assert.fail(`unexpected rn2(${bound})`) };
}

// Straight open floor along one row, and unlit so that no vision rebuild is
// needed to keep cansee() out of the answer.
function clearRow(state, fromX, toX, y) {
    for (let x = Math.min(fromX, toX); x <= Math.max(fromX, toX); ++x) {
        const location = state.level.at(x, y);
        location.typ = ROOM;
        location.flags = 0;
        location.doormask = 0;
        location.wall_info = 0;
    }
}

// Sets the bit linedup() reads when the ray starts on the hero's own square,
// where it takes its `u_at(ax, ay) ? couldsee(bx, by)` arm and the state's
// viz_array decides. vision.c clear_path(), the other arm, answers from the
// module-level transparency index that vision_reset() builds rather than from
// the map this test edits, so a case that wants that arm calls vision_reset()
// after carving the row; scripts/light-vision.test.mjs pins clear_path()
// itself.
function setCouldSee(state, x, y, visible) {
    if (visible) state.viz_array[y][x] |= COULD_SEE;
    else state.viz_array[y][x] &= ~COULD_SEE;
}

test('thrwmu spends an empty-handed launcher wield turn', async () => {
    const state = await hero();
    const y = state.u.uy;
    const subject = attacker(state, state.u.ux + 5, y, state.u.ux, y);
    subject.weapon_check = NEED_WEAPON;
    subject.mw = null;
    const arrow = mksobj(ARROW, false, false, { state });
    const bow = mksobj(BOW, false, false, { state });
    arrow.nobj = bow;
    bow.nobj = null;
    subject.minvent = arrow;
    const messages = [];

    assert.equal(await thrwmu(subject, {
        state,
        canSeeMonster: () => true,
        wieldMessage: (_monster, obj, detail) => {
            messages.push([obj.otyp, detail.exclaim]);
        },
        continueRangedAttack: () => assert.fail('wield turn continued'),
    }), 1);
    assert.equal(subject.mw, bow);
    assert.equal(subject.weapon_check, NEED_WEAPON);
    assert.equal(bow.owornmask, W_WEP);
    assert.deepEqual(messages, [[BOW, true]]);
});

test('thrwmu announces one visible ordinary throw before missile flight',
    async () => {
        const state = await hero();
        const y = state.u.uy;
        // Five squares is inside mthrowu.c's strict BOLT_LIM limit of eight,
        // and the equal y coordinates select its horizontal line-of-fire arm.
        const subject = attacker(state, state.u.ux + 5, y, state.u.ux, y);
        const dagger = mksobj(ORCISH_DAGGER, false, false, { state });
        // The witness has not identified ORCISH_DAGGER, so objnam.c selects
        // objects.c's "crude dagger" description for the announcement.
        state.objects[ORCISH_DAGGER].oc_name_known = 0;
        // Quantity one keeps monmulti() on its source-leading no-draw path.
        dagger.quan = 1;
        dagger.owornmask = W_WEP;
        dagger.nobj = null;
        subject.minvent = dagger;
        subject.mw = dagger;
        subject.weapon_check = NO_WEAPON_WANTED;
        clearRow(state, state.u.ux, subject.mx, y);
        setCouldSee(state, subject.mx, y, true);
        state.u.ux0 = state.u.ux;
        state.u.uy0 = state.u.uy;
        const messages = [];
        const flight = new Error('expected m_throw boundary');

        await assert.rejects(thrwmu(subject, {
            state,
            random: noDraw(),
            canSeeMonster: () => true,
            monsterName: () => 'The giant rat',
            message: (text) => { messages.push(text); },
            endMulti: () => {},
            throwMissile: (monster, x, originY, dx, dy, range, obj) => {
                assert.equal(monster, subject);
                assert.deepEqual(
                    [x, originY, dx, dy, range, obj],
                    // The hero is five squares west on the same row.
                    [subject.mx, y, -1, 0, 5, dagger],
                );
                assert.deepEqual(state.m_shot, {
                    // An orcish dagger is thrown rather than shot.
                    s: false,
                    o: ORCISH_DAGGER,
                    n: 1,
                    i: 1,
                });
                throw flight;
            },
        }), flight);
        assert.deepEqual(messages, [
            // objects.c identifies an unknown orcish dagger as "crude dagger".
            'The giant rat throws a crude dagger!',
        ]);
    });

test('thrwmu carries an ordinary dagger hit through floor settlement',
    async () => {
        const state = await hero();
        const y = state.u.uy;
        // Four squares produces three rn2(5) flight checks before the fourth
        // step reaches the hero. It is also inside mthrowu.c's BOLT_LIM.
        const subject = attacker(state, state.u.ux + 4, y, state.u.ux, y);
        const dagger = mksobj(ORCISH_DAGGER, false, false, { state });
        // The witness uses one unidentified, ordinary orcish dagger. Quantity
        // one selects monmulti()'s no-draw arm and extraction of the whole item.
        state.objects[ORCISH_DAGGER].oc_name_known = 0;
        dagger.quan = 1;
        add_to_minv(subject, dagger, { state });
        dagger.owornmask = W_WEP;
        subject.mw = dagger;
        subject.weapon_check = NO_WEAPON_WANTED;
        clearRow(state, state.u.ux, subject.mx, y);
        setCouldSee(state, subject.mx, y, true);
        state.u.ux0 = state.u.ux;
        state.u.uy0 = state.u.uy;
        state.gt ??= {};
        const hpBefore = state.u.uhp;
        const messages = [];
        const draws = [];
        const temporaryDisplay = [];
        let stoppedOccupation = 0;
        let endedMulti = 0;
        const catchBound = 100 - effective_attribute(state, A_DEX);
        const random = {
            rn2: (bound) => {
                draws.push(['rn2', bound]);
                // A nonzero catch roll makes the hero fail to catch the dagger;
                // the flight and exercise values do not change this chosen arm.
                return bound === catchBound ? 1 : 0;
            },
            rnd: (bound) => {
                draws.push(['rnd', bound]);
                // ORCISH_DAGGER rolls d3 damage; 2 pins the witnessed damage.
                // rnd(20)=1 then makes u.uac + hitv exceed the attack roll.
                return bound === 3 ? 2 : 1;
            },
            d: () => assert.fail('ordinary dagger damage does not roll d()'),
        };

        await thrwmu(subject, {
            state,
            random,
            canSeeMonster: () => true,
            canSeeSquare: () => true,
            // This constructed ray contains no intervening monster; m_at() is
            // covered on live level grids by the end-to-end differential.
            monsterAt: () => null,
            monsterName: () => 'The giant rat',
            message: (text) => { messages.push(text); },
            objectToGlyph: () => 777,
            temporaryDisplay: async (x, atY) => {
                temporaryDisplay.push([x, atY]);
            },
            throwMissile: m_throw,
            delayOutput: async () => {},
            clearObjectKnowledge: (obj) => clear_dknown(obj, state),
            observeObject: (obj) => observe_object(obj, state),
            extractObject: (obj) => obj_extract_self(obj, { state }),
            setMonsterNotWielded: (monster, obj) =>
                setmnotwielded(monster, obj, { state }),
            damageValue: (obj, target) =>
                dmgval(obj, target, state, { random }),
            hitHero: (hitv, damage, obj) => thitu(
                hitv,
                damage,
                obj,
                null,
                state,
                {
                    random,
                    message: (text) => { messages.push(text); },
                    losehp,
                    exercise: (index, increase, exerciseState) => exercise(
                        index,
                        increase,
                        exerciseState,
                        random,
                        { encumberMessage: async () => {} },
                    ),
                    unsupported: (reason) => assert.fail(reason),
                    requireHit: true,
                },
            ),
            stopOccupation: async () => { stoppedOccupation++; },
            shouldMulch: (obj) => should_mulch_missile(obj, state, {
                unsupported: (reason) => assert.fail(reason),
            }),
            shipsAway: () => false,
            floorEffects: (obj, x, atY, verb) => flooreffects(
                obj,
                x,
                atY,
                verb,
                { state, unsupported: (reason) => assert.fail(reason) },
            ),
            placeObject: (obj, x, atY) => place_object(obj, x, atY, { state }),
            passiveObject: (monster, obj, attack) => passive_obj(
                monster,
                obj,
                attack,
                state,
                { unsupported: (reason) => assert.fail(reason) },
            ),
            stackObject: (obj) => stackobj(obj, {
                state,
                hooks: { extractExternalObject: remove_object },
            }),
            endMulti: () => { endedMulti++; },
            unsupported: (reason) => assert.fail(reason),
        });

        assert.deepEqual(messages, [
            'The giant rat throws a crude dagger!',
            'You are hit by a crude dagger.',
        ]);
        assert.equal(state.u.uhp, hpBefore - 2);
        assert.equal(subject.mw, null);
        assert.equal(subject.minvent, null);
        assert.equal(dagger.where, OBJ_FLOOR);
        assert.equal(dagger.ocarry, null);
        assert.equal(state.level.objects[state.u.ux][y], dagger);
        assert.equal(state.gt.thrownobj, null);
        assert.equal(stoppedOccupation, 1);
        assert.equal(endedMulti, 1);
        assert.deepEqual(state.m_shot, { s: false, o: 0, n: 0, i: 0 });
        assert.deepEqual(draws, [
            // Three unobstructed intermediate squares each spend forcehit.
            ['rn2', 5], ['rn2', 5], ['rn2', 5],
            // The eligible Valkyrie fails the one-in-catchBound catch roll.
            ['rn2', catchBound],
            // Damage, hit, then exercise(A_STR, FALSE), in source order.
            ['rnd', 3], ['rnd', 20], ['rn2', 2],
        ]);
        assert.equal(temporaryDisplay.at(-1)?.[0], -7);
    });

// C ref: mthrowu.c m_throw()'s POTION_CLASS arm (698-701), which hands the
// missile to potion.c potionhit() and never reaches drop_throw(). The whole
// chain is one witness: bottlename()'s rn2(7), potionhit()'s rnd(2), and the
// vapors' rnd(5) plus the two exercise draws, in that order.
test('m_throw hands a hurled potion to potionhit and settles nothing else',
    async () => {
        const state = await hero();
        const y = state.u.uy;
        // Three squares out: two intermediate flight checks, then the hero.
        const subject = attacker(state, state.u.ux + 3, y, state.u.ux, y);
        const potion = mksobj(POT_SLEEPING, false, false, { state });
        potion.quan = 1;
        potion.dknown = true;
        add_to_minv(subject, potion, { state });
        clearRow(state, state.u.ux, subject.mx, y);
        state.gt ??= {};
        const hpBefore = state.u.uhp;
        const dexBefore = state.u.aexe[A_DEX];
        const messages = [];
        const draws = [];
        const catchBound = 100 - effective_attribute(state, A_DEX);
        const random = {
            rn2: (bound) => {
                draws.push(['rn2', bound]);
                // A nonzero catch roll makes the hero fail to catch the
                // potion. bottlename() draws rn2(7); 1 picks "phial", the
                // second of potion.c's seven names.
                return bound === catchBound ? 1 : 1;
            },
            rnd: (bound) => {
                draws.push(['rnd', bound]);
                // rnd(2) is the crash damage and rnd(5) the sleep; 1 keeps
                // the hero alive and pins both.
                return 1;
            },
            d: (n, x) => assert.fail(`unexpected d(${n},${x})`),
        };

        await m_throw(subject, subject.mx, subject.my, -1, 0, 3, potion, {
            state,
            random,
            canSeeMonster: () => true,
            canSeeSquare: () => true,
            monsterAt: () => null,
            message: (text) => { messages.push(text); },
            objectToGlyph: () => 777,
            temporaryDisplay: async () => {},
            delayOutput: async () => {},
            clearObjectKnowledge: (obj) => clear_dknown(obj, state),
            observeObject: (obj) => observe_object(obj, state),
            extractObject: (obj) => obj_extract_self(obj, { state }),
            setMonsterNotWielded: (monster, obj) =>
                setmnotwielded(monster, obj, { state }),
            damageValue: () => assert.fail('a potion rolls no weapon damage'),
            hitHero: () => assert.fail('a potion does not reach thitu()'),
            stopOccupation: async () => {},
            shouldMulch: () => assert.fail('a potion never mulches'),
            shipsAway: () => false,
            floorEffects: () => assert.fail('a potion never lands'),
            placeObject: () => assert.fail('a potion is used up, not placed'),
            passiveObject: () => assert.fail('a potion never lands'),
            stackObject: () => assert.fail('a potion is used up, not stacked'),
            endMulti: () => {},
            potionHit: (target, obj, how, actionEnv) => potionhit(
                target,
                obj,
                how,
                { ...actionEnv, encumberMessage: async () => {} },
            ),
            unsupported: (reason) => assert.fail(reason),
        });

        assert.deepEqual(messages, [
            'The phial crashes on your head and breaks into shards.',
            'The dark potion evaporates.',
            'You feel rather tired.',
        ]);
        // rnd(2) crash damage of 1, and nothing from the sleeping arm.
        assert.equal(state.u.uhp, hpBefore - 1);
        // potionbreathe()'s nomul(-rnd(5)) and exercise(A_DEX, FALSE).
        assert.equal(state.multi, -1);
        assert.equal(state.u.aexe[A_DEX], dexBefore - 1);
        // obfree() used the potion up: it is gone from the pack and off the
        // floor, and m_throw() cleared the global it flew as.
        assert.equal(subject.minvent, null);
        assert.equal(state.level.objects[state.u.ux][y], null);
        assert.equal(state.gt.thrownobj, null);
        assert.deepEqual(draws, [
            // Two unobstructed intermediate squares each spend forcehit.
            ['rn2', 5], ['rn2', 5],
            ['rn2', catchBound],
            ['rn2', 7], /* bottlename() */
            ['rnd', 2], /* potionhit()'s crash damage */
            ['rnd', 5], /* potionbreathe()'s nomul() */
            ['rn2', 2], /* exercise(A_DEX, FALSE) */
            ['rn2', 19], /* makeknown() -> exercise(A_WIS, TRUE) */
        ]);
        // kn was set, so the tail identified the type rather than prompting.
        assert.equal(state.objects[POT_SLEEPING].oc_name_known, 1);
    });

test('ordinary dagger naming and settlement helpers take their no-effect arms',
    async () => {
        const state = await hero();
        const dagger = mksobj(ORCISH_DAGGER, false, false, { state });
        // Unknown type knowledge produces the visible description, while a
        // killer name temporarily identifies the same type and adds an article.
        state.objects[ORCISH_DAGGER].oc_name_known = 0;
        assert.equal(mshot_xname(dagger, state), 'crude dagger');
        assert.equal(killer_xname(dagger, state), 'an orcish dagger');
        assert.equal(state.objects[ORCISH_DAGGER].oc_name_known, 0);
        assert.equal(should_mulch_missile(dagger, state, {
            unsupported: (reason) => assert.fail(reason),
        }), false);
        assert.equal(passive_obj(state.youmonst, dagger, null, state, {
            unsupported: (reason) => assert.fail(reason),
        }), undefined);
    });

test('blocking_terrain answers for each terrain mthrowu.c names', async () => {
    const state = await hero();
    const y = state.u.uy;
    const x = state.u.ux + 4;
    clearRow(state, x, x, y);
    assert.equal(blocking_terrain(x, y, state), false);

    // mthrowu.c:1284, in the order C tests them.
    state.level.at(x, y).typ = STONE;
    assert.equal(blocking_terrain(x, y, state), true);
    state.level.at(x, y).typ = DOOR;
    state.level.at(x, y).doormask = D_CLOSED;
    assert.equal(blocking_terrain(x, y, state), true);
    state.level.at(x, y).doormask = 0;
    state.level.at(x, y).typ = MOAT;
    // A moat is water but not a waterwall, so it does not block; lava wall
    // is the terrain C names separately and does.
    assert.equal(blocking_terrain(x, y, state), false);
    state.level.at(x, y).typ = LAVAWALL;
    assert.equal(blocking_terrain(x, y, state), true);

    // C's leading !isok(x, y). cmd.c isok():4329 is
    // x >= 1 && x <= COLNO - 1 && y >= 0 && y <= ROWNO - 1, so column zero is
    // off the map for C exactly as a negative column is. Carving floor there
    // first takes the later disjuncts out of the answer: mklev leaves column
    // zero as rock, where IS_OBSTRUCTED(STONE) would block whether or not
    // isok() ran.
    assert.equal(blocking_terrain(-1, y, state), true);
    clearRow(state, 0, 0, y);
    assert.equal(blocking_terrain(0, y, state), true);
});

test('linedup rejects a ray that is neither straight nor diagonal',
    async () => {
        const state = await hero();
        const y = state.u.uy;
        // mthrowu.c:1341-1345. Zero displacement first: a monster that thinks
        // the hero stands on its own square never fires.
        assert.equal(
            linedup(4, y, 4, y, 2, { state, random: noDraw() }),
            false,
        );
        // A knight's move is neither orthogonal nor diagonal.
        assert.equal(
            linedup(6, y + 1, 4, y, 2, { state, random: noDraw() }),
            false,
        );
        // mthrowu.c:1348, distmin(...) < BOLT_LIM with BOLT_LIM 8. Seven
        // squares away is in line and eight is not, and the hero's square
        // carries COULD_SEE so the in-line answer is TRUE.
        clearRow(state, state.u.ux, state.u.ux + 8, y);
        setCouldSee(state, state.u.ux + 7, y, true);
        setCouldSee(state, state.u.ux + 8, y, true);
        assert.equal(
            linedup(state.u.ux, y, state.u.ux + 7, y, 2,
                { state, random: noDraw() }),
            true,
        );
        assert.equal(
            linedup(state.u.ux, y, state.u.ux + 8, y, 2,
                { state, random: noDraw() }),
            false,
        );
        // The same boundary up the column. distmin() takes the larger of the
        // two displacements, so a horizontal pair alone leaves its second
        // argument free: only a ray whose y displacement is the larger one
        // says that the origin it measures from is <0,0>.
        setCouldSee(state, state.u.ux, y - 7, true);
        setCouldSee(state, state.u.ux, y - 8, true);
        assert.equal(
            linedup(state.u.ux, y, state.u.ux, y - 7, 2,
                { state, random: noDraw() }),
            true,
        );
        assert.equal(
            linedup(state.u.ux, y, state.u.ux, y - 8, 2,
                { state, random: noDraw() }),
            false,
        );
    });

test('linedup reads couldsee() for a ray aimed at the hero', async () => {
    const state = await hero();
    const y = state.u.uy;
    const monsterX = state.u.ux + 3;
    clearRow(state, state.u.ux, monsterX, y);
    // mthrowu.c:1349-1351. couldsee() answers for the attacker's own square,
    // not the target's, and it is the whole test in boulderhandling mode 0.
    setCouldSee(state, monsterX, y, true);
    assert.equal(
        linedup(state.u.ux, y, monsterX, y, 0, { state, random: noDraw() }),
        true,
    );
    setCouldSee(state, monsterX, y, false);
    assert.equal(
        linedup(state.u.ux, y, monsterX, y, 0, { state, random: noDraw() }),
        false,
    );
});

// mthrowu.c:1349-1351, `(u_at(ax, ay) ? couldsee(bx, by)
// : clear_path(ax, ay, bx, by))`. The two answers are not interchangeable, and
// the clear_path() half is the branch this file's extraction from
// js/monmove.js changed: the terrain walk it replaced answered from the map,
// while clear_path() answers from the transparency index vision_reset() built.
// Only a ray that does not start on the hero's square reaches it, which is
// every monster-versus-monster call.
test('linedup reads clear_path() for a ray that misses the hero square',
    async () => {
        const state = await hero();
        const y = state.u.uy;
        // Two squares east of the hero, so the ray is three long and well
        // inside BOLT_LIM.
        const targetX = state.u.ux + 3;
        clearRow(state, state.u.ux, targetX, y);
        // clear_path() answers from the transparency index vision_reset()
        // builds, not from the map this test edits, so the carved row has to
        // be published to that index before either answer below means
        // anything.
        vision_reset(state);
        setCouldSee(state, targetX, y, true);

        // From the hero's own square the couldsee() arm answers TRUE for the
        // bit just set.
        assert.equal(
            linedup(state.u.ux, y, targetX, y, 0,
                { state, random: noDraw() }),
            true,
        );
        // One square east the other arm decides, and over a transparent row it
        // answers TRUE as well. This is the case every monster-versus-monster
        // shot takes, and an implementation that answered a constant FALSE
        // here would stop all of them.
        assert.equal(
            linedup(state.u.ux + 1, y, targetX, y, 0,
                { state, random: noDraw() }),
            true,
        );

        // Rock in the middle of the same row, published to the same index,
        // flips that arm and only that arm. Two opposite answers on one arm
        // are what separate reading clear_path() from never reaching it, and
        // the unchanged hero-square answer is what keeps the pair a test of
        // the condition rather than of the terrain.
        state.level.at(state.u.ux + 2, y).typ = STONE;
        vision_reset(state);
        assert.equal(
            linedup(state.u.ux + 1, y, targetX, y, 0,
                { state, random: noDraw() }),
            false,
        );
        assert.equal(
            linedup(state.u.ux, y, targetX, y, 0,
                { state, random: noDraw() }),
            true,
        );
    });

test('linedup handles boulders per its three boulderhandling modes',
    async () => {
        const state = await hero();
        const y = state.u.uy;
        const monsterX = state.u.ux + 3;
        clearRow(state, state.u.ux, monsterX, y);
        setCouldSee(state, monsterX, y, false);
        mksobj_at(BOULDER, state.u.ux + 1, y, false, false,
        // mkobj.c place_object() blocks the square's line of sight for a
        // boulder; couldsee() is exactly what these cases read back.
        { state, hooks: { blockPoint: (bx, by, env) => block_point(bx, by, env.state) } });

        // mthrowu.c:1355. Mode 0 stops at the lost line of sight and never
        // counts a boulder.
        assert.equal(
            linedup(state.u.ux, y, monsterX, y, 0,
                { state, random: noDraw() }),
            false,
        );
        // Mode 1 ignores boulders outright, so it also spends no draw.
        assert.equal(
            linedup(state.u.ux, y, monsterX, y, 1,
                { state, random: noDraw() }),
            true,
        );
        // Mode 2 reaches `rn2(2 + boulderspots) < 2` with one boulder
        // counted, so the bound is 3 and two of its three answers line the
        // attacker up.
        for (const [roll, expected] of [[0, true], [1, true], [2, false]]) {
            const bounds = [];
            assert.equal(
                linedup(state.u.ux, y, monsterX, y, 2, {
                    state,
                    random: {
                        rn2: (bound) => { bounds.push(bound); return roll; },
                    },
                }),
                expected,
            );
            assert.deepEqual(bounds, [3]);
        }

        // A second boulder widens the bound, which is what makes a heavily
        // blocked ray less likely to count as lined up.
        mksobj_at(BOULDER, state.u.ux + 2, y, false, false,
            { state, hooks: { blockPoint: (bx, by, env) => block_point(bx, by, env.state) } });
        const twoBoulders = [];
        linedup(state.u.ux, y, monsterX, y, 2, {
            state,
            random: {
                rn2: (bound) => { twoBoulders.push(bound); return 0; },
            },
        });
        assert.deepEqual(twoBoulders, [4]);

        // mthrowu.c:1365. Blocking terrain returns before the draw, so a
        // walled ray never rolls however many boulders precede the wall.
        state.level.at(state.u.ux + 2, y).typ = STONE;
        assert.equal(
            linedup(state.u.ux, y, monsterX, y, 2,
                { state, random: noDraw() }),
            false,
        );
    });

test('lined_up picks boulderhandling from the attacker itself', async () => {
    const state = await hero();
    const y = state.u.uy;
    const monsterX = state.u.ux + 3;
    clearRow(state, state.u.ux, monsterX, y);
    setCouldSee(state, monsterX, y, false);
    mksobj_at(BOULDER, state.u.ux + 1, y, false, false,
        // mkobj.c place_object() blocks the square's line of sight for a
        // boulder; couldsee() is exactly what these cases read back.
        { state, hooks: { blockPoint: (bx, by, env) => block_point(bx, by, env.state) } });
    const rat = attacker(state, monsterX, y, state.u.ux, y);

    // mthrowu.c:1382-1383. An ordinary monster gets mode 2 and rolls; one
    // that throws rocks -- M2_ROCKTHROW, which giants carry and trolls do
    // not -- gets mode 1 and does not.
    const bounds = [];
    assert.equal(
        lined_up(rat, {
            state,
            random: { rn2: (bound) => { bounds.push(bound); return 0; } },
        }),
        true,
    );
    assert.deepEqual(bounds, [3]);

    const giant = attacker(state, monsterX, y, state.u.ux, y,
        state.mons[PM_STONE_GIANT]);
    assert.equal(lined_up(giant, { state, random: noDraw() }), true);

    // The other half of that disjunction: a carried wand of striking buys
    // mode 1 for a species that throws no rocks.
    const wand = mksobj(WAN_STRIKING, false, false, { state });
    wand.nobj = null;
    rat.minvent = wand;
    assert.equal(lined_up(rat, { state, random: noDraw() }), true);
});

// mthrowu.c m_lined_up():1384-1387, the gate this port writes out at
// js/mthrowu.js:115-119. No running game reaches it -- Upolyd is false for
// every hero the port produces -- so the rn2(25) beside it is spent by nothing
// and the whole gate is scored by no session. It is written out rather than
// dropped because a skipped draw would shift every later call in the turn once
// polymorph lands, and that is exactly the kind of line a test has to pin,
// since nothing else can.
//
// Each case names the answer it separates. The three terms are `rn2(25)`, then
// `u.uundetected`, then the appearance test, and the last two are a
// disjunction inside the conjunction, so the rows below walk both.
test('m_lined_up lets a polymorphed hero conceal herself', async () => {
    const state = await hero();
    const y = state.u.uy;
    const monsterX = state.u.ux + 3;
    clearRow(state, state.u.ux, monsterX, y);
    // With the attacker's own square seen, linedup() answers TRUE and spends
    // no draw, so every rn2() below is the gate's own.
    setCouldSee(state, monsterX, y, true);
    const rat = attacker(state, monsterX, y, state.u.ux, y);

    // you.h Upolyd() is `u.umonnum != u.umonster`, and it is the conjunct
    // ahead of the draw: an ordinary hero never rolls at all.
    assert.equal(state.u.umonnum, state.u.umonster, 'the hero starts herself');
    assert.equal(lined_up(rat, { state, random: noDraw() }), true);

    state.u.uundetected = false;
    state.youmonst.m_ap_type = M_AP_NOTHING;
    // Any species but the hero's own turns Upolyd() TRUE; the giant rat is
    // the one this file already loads.
    state.u.umonnum = PM_GIANT_RAT;
    assert.notEqual(state.u.umonnum, state.u.umonster);

    for (const [label, roll, uundetected, apType, expected] of [
        // A roll of 0 shuts the gate whatever follows it, and the hidden hero
        // beside it is what separates C's `&&` from an `||`: with an `||` the
        // concealment alone would close the gate on a turn C leaves open.
        ['roll 0 with the hero hidden', 0, true, M_AP_NOTHING, true],
        // 1 is the smallest roll that opens the gate; 24 is the largest the
        // bound produces, and both must behave alike.
        ['roll 1 and hidden', 1, true, M_AP_NOTHING, false],
        ['roll 24 and hidden', 24, true, M_AP_NOTHING, false],
        // Not hidden and wearing no appearance: the disjunction's second half
        // is what an `&&` in its place would demand, and there is none here.
        ['visible and undisguised', 1, false, M_AP_NOTHING, true],
        // C excuses M_AP_MONSTER by name -- a hero who looks like a monster is
        // still a target -- so this is the row that separates
        // `!= M_AP_MONSTER` from `== M_AP_MONSTER`, and the appearance
        // conjunction from a disjunction.
        ['visible and disguised as a monster', 1, false, M_AP_MONSTER, true],
        // An object appearance is neither excused value, so the gate closes.
        ['visible and disguised as an object', 1, false, M_AP_OBJECT, false],
    ]) {
        state.u.uundetected = uundetected;
        state.youmonst.m_ap_type = apType;
        const bounds = [];
        assert.equal(
            lined_up(rat, {
                state,
                random: {
                    rn2: (bound) => { bounds.push(bound); return roll; },
                },
            }),
            expected,
            label,
        );
        assert.deepEqual(bounds, [25], label);
    }

    // Left as the fixture found it, since every case below shares this game.
    state.u.umonnum = state.u.umonster;
    state.u.uundetected = false;
    state.youmonst.m_ap_type = M_AP_NOTHING;
});

// mthrowu.c:1392-1393, `utarget ? (ignore_boulders ? 1 : 2) : 0`. Every
// ported caller arrives through lined_up(), so the hero is always the target
// and the trailing 0 is chosen by nothing. It is what a monster shooting at
// another monster would get, and C is strict there: no boulder is ever
// shot around.
test('m_lined_up gives a monster target no boulder allowance', async () => {
    const state = await hero();
    const y = state.u.uy;
    const shooterX = state.u.ux + 3;
    const targetX = state.u.ux + 1;
    clearRow(state, state.u.ux, shooterX, y);
    const shooter = attacker(state, shooterX, y, state.u.ux, y);
    const target = attacker(state, targetX, y, state.u.ux, y);

    // Neither end is the hero's square, so linedup() asks clear_path(), which
    // reads the index vision_reset() built and not this cleared row: the sight
    // test fails and boulderhandling is what decides the rest. Mode 0 returns
    // there and spends nothing; mode 1 would walk the unobstructed row and
    // answer TRUE, and any other mode would reach `rn2(2 + boulderspots)`,
    // which noDraw() would report.
    assert.equal(
        m_lined_up(target, shooter, { state, random: noDraw() }),
        false,
    );
});

test('thrwmu retreat rn2 uses monster-to-target distance, not hero-to-monster',
    async () => {
        // C mthrowu.c:1258: rn2(BOLT_LIM - distmin(x, y, mtmp->mux, mtmp->muy))
        // where x,y = monster position and mux,muy = monster's tracked hero
        // position.  When the monster's target diverges from the hero's real
        // position, the two distances differ.
        const state = await hero();
        const y = state.u.uy;
        const monsterX = state.u.ux + 5;
        clearRow(state, state.u.ux, monsterX, y);
        setCouldSee(state, monsterX, y, true);
        // Hero moved away: ux0 is closer to the monster than ux.
        state.u.ux0 = state.u.ux + 1;
        // Monster believes the hero is at ux + 2, not the real ux.
        // distmin(monster, target) = distmin(ux+5, y, ux+2, y) = 3
        // distmin(hero, monster)   = distmin(ux,   y, ux+5, y) = 5
        // BOLT_LIM = 8, so C uses rn2(8-3)=rn2(5), not rn2(8-5)=rn2(3).
        const believedHeroX = state.u.ux + 2;
        const subject = attacker(
            state, monsterX, y, believedHeroX, y,
        );
        const dagger = mksobj(ORCISH_DAGGER, false, false, { state });
        dagger.quan = 1;
        add_to_minv(subject, dagger, { state });
        subject.weapon_check = NO_WEAPON_WANTED;

        let rn2Bound;
        await thrwmu(subject, {
            state,
            canSeeMonster: () => false,
            wieldMessage: () => {},
            continueRangedAttack: async () => {
                await assert.rejects(
                    Promise.reject(new Error('stop after rn2')),
                );
            },
            random: {
                rn2(bound) {
                    rn2Bound = bound;
                    // Return nonzero so thrwmu returns 0 (retreat).
                    return 1;
                },
            },
        });
        // 8 - distmin(ux+5, y, ux+2, y) = 8 - 3 = 5
        assert.equal(rn2Bound, 5, 'rn2 argument is BOLT_LIM minus monster-to-target distance');
    });

test('lined_up aims at the believed hero square, not the real one',
    async () => {
        const state = await hero();
        const y = state.u.uy;
        const monsterX = state.u.ux + 3;
        clearRow(state, state.u.ux, monsterX, y);
        setCouldSee(state, monsterX, y, true);
        // mthrowu.c:1378-1379 reads mux and muy, so an attacker that believes
        // the hero is where the hero is fires along that row.
        const aimed = attacker(state, monsterX, y, state.u.ux, y);
        assert.equal(lined_up(aimed, { state, random: noDraw() }), true);
        // Displaced onto its own square, m_lined_up() hands linedup() a zero
        // displacement and it declines before any terrain is read.
        const confused = attacker(state, monsterX, y, monsterX, y);
        assert.equal(lined_up(confused, { state, random: noDraw() }), false);
    });
