import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { isok } from '../js/cmd_isok.js';
import {
    COLNO,
    ROOM,
    ROWNO,
    STRAT_APPEARMSG,
} from '../js/const.js';
import { PM_HEALER, PM_NURSE, PM_STONE_GOLEM } from '../js/monsters.js';
import { game } from '../js/gstate.js';
import { newMonster, place_monster } from '../js/monst.js';
import { runSegment } from '../js/jsmain.js';
import { mhitm_adtyping } from '../js/uhitm.js';
import { goodpos } from '../js/teleport.js';

const UHITM_C = readFileSync(
    new URL('../nethack-c/upstream/src/uhitm.c', import.meta.url), 'utf8',
);
const UHITM_JS = readFileSync(
    new URL('../js/uhitm.js', import.meta.url), 'utf8',
);
const MHITU_C = readFileSync(
    new URL('../nethack-c/upstream/src/mhitu.c', import.meta.url), 'utf8',
);
const MHITM_C = readFileSync(
    new URL('../nethack-c/upstream/src/mhitm.c', import.meta.url), 'utf8',
);
const MONSTERS_C = readFileSync(
    new URL('../nethack-c/upstream/include/monsters.h', import.meta.url), 'utf8',
);
const MONDATA_H = readFileSync(
    new URL('../nethack-c/upstream/include/mondata.h', import.meta.url), 'utf8',
);
const POLYSELF_C = readFileSync(
    new URL('../nethack-c/upstream/src/polyself.c', import.meta.url), 'utf8',
);

// The seed and fixed clock match the independent C70 monster-pair recipe.
const SEED = 70423167;
const DATETIME = '20370614172509';

async function startGame(role = 'Wizard') {
    // These debug options provide ordinary game state for direct helper
    // checks; the recorded recipe independently exercises production callers.
    await runSegment({
        seed: SEED,
        datetime: DATETIME,
        nethackrc: [
            'OPTIONS=name:C70HealTest,role:' + role
                + ',race:human,gender:male,align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen,playmode:debug,pettype:none,!acoustics,!safe_wait',
            '',
        ].join('\n'),
        moves: '',
    });
    game.program_state.in_moveloop = true;
    game.iflags.perm_invent = false;
    return game;
}

function addMonster(state, species, id, offset) {
    const [dx, dy] = offset;
    const mx = state.u.ux + dx;
    const my = state.u.uy + dy;
    assert.ok(isok(mx, my));
    assert.equal(state.level.monsters[mx][my], null);
    const monster = newMonster({
        data: state.mons[species],
        mnum: species,
        m_id: id,
        mx,
        my,
        // A full, nonlethal pool leaves attack and Nurse effects observable.
        mhp: 40,
        mhpmax: 40,
        mcanmove: true,
        mfrozen: 0,
        meating: 0,
        mstrategy: 0,
        mcan: false,
        mcansee: true,
        mspec_used: 0,
    });
    place_monster(monster, mx, my, state);
    monster.nmon = state.level.monlist;
    state.level.monlist = monster;
    return monster;
}

function attackEnv(random, events) {
    return {
        random,
        message: async (line) => { events.push(line); },
        unsupported: (reason) => assert.fail(reason),
    };
}

test('mhitm_ad_heal preserves C arm and dispatcher order', () => {
    const helper = UHITM_C.match(
        /void\s+mhitm_ad_heal\([\s\S]*?\n\}\n\nvoid\s+mhitm_ad_stun/u,
    )?.[0];
    assert.ok(helper, 'uhitm.c contains the whole selected helper');
    assert.match(helper,
        /if \(magr == &gy\.youmonst\)[\s\S]*?mhitm_ad_phys\([\s\S]*?if \(mhm->done\)\s*return;/u);
    assert.match(helper,
        /else if \(mdef == &gy\.youmonst\)[\s\S]*?magr->mcan \|\| \(Upolyd && touch_petrifies\(pd\)\)[\s\S]*?hitmsg/u);
    assert.match(helper,
        /uwep->oclass == WEAPON_CLASS \|\| is_weptool\(uwep\)[\s\S]*?!uarmu && !uarm && !uarmc[\s\S]*?!uarms && !uarmg && !uarmf && !uarmh/u);
    assert.match(helper,
        /u\.mh \+= rnd\(7\)[\s\S]*?u\.uhp \+= rnd\(7\)[\s\S]*?rn2\(7\)[\s\S]*?rn2\(13\)[\s\S]*?exercise\(A_STR, TRUE\)[\s\S]*?exercise\(A_CON, TRUE\)[\s\S]*?Sick[\s\S]*?goaway[\s\S]*?rn2\(33\)[\s\S]*?tele_restrict\(magr\)[\s\S]*?rloc\(magr, RLOC_MSG\)[\s\S]*?monflee/u);
    assert.match(helper,
        /mongone\(magr\)[\s\S]*?mhm->done = TRUE/u);
    assert.match(helper,
        /rloc\(magr, RLOC_MSG\)[\s\S]*?monflee\(magr/u);
    assert.match(helper,
        /Role_if\(PM_HEALER\)[\s\S]*?!Deaf && !\(svm\.moves % 5\)[\s\S]*?verbalize[\s\S]*?mhm->damage = 0/u);
    assert.match(helper,
        /else \{\s*\/\* mhitm \*\/[\s\S]*?mhitm_ad_phys\([\s\S]*?if \(mhm->done\)\s*return;/u);
    assert.match(UHITM_C,
        /case AD_HEAL:\s*mhitm_ad_heal\(magr, mattk, mdef, mhm\);\s*break;/u);
    assert.match(UHITM_C,
        /mhitm_adtyping\(&gy\.youmonst, mattk, mdef, &mhm\);/u);
    assert.match(MHITU_C,
        /mhitm_adtyping\(mtmp, mattk, &gy\.youmonst, &mhm\);/u);
    assert.match(MHITM_C,
        /mhitm_adtyping\(magr, mattk, mdef, &mhm\);/u);
    const jsHelper = UHITM_JS.match(
        /export async function mhitm_ad_heal\([\s\S]*?\n\}\n\n\/\/ C ref: uhitm\.c mhitm_adtyping/u,
    )?.[0];
    assert.ok(jsHelper, 'js/uhitm.js contains the complete helper');
    assert.match(jsHelper,
        /await mongone\(magr, \{ \.\.\.env, state \}\);[\s\S]*?mhm\.done = true/u);
    assert.match(jsHelper,
        /await rloc\(magr, RLOC_MSG, \{ \.\.\.env, state, random \}\);[\s\S]*?await monflee/u);
});

test('the Nurse attack is not a legal ordinary hero polymorph target', () => {
    const nurse = MONSTERS_C.match(
        /MON\(NAM\("nurse"\)[\s\S]*?\n\s*13, HI_DOMESTIC, NURSE\)/u,
    )?.[0];
    assert.ok(nurse);
    assert.match(nurse, /ATTK\(AT_CLAW, AD_HEAL, 2, 6\)/u);
    assert.match(nurse, /M2_NOPOLY/u);
    assert.match(MONDATA_H,
        /#define polyok\(ptr\) \(\(\(ptr\)->mflags2 & M2_NOPOLY\) == 0L\)/u);
    assert.match(POLYSELF_C,
        /if \(!polyok\(&mons\[mntmp\]\) \|\| \(!forcecontrol && !rn2\(5\)\)/u);
});

test('a monster Nurse heals an unarmored hero in C draw order', async () => {
    const state = await startGame();
    // This id is unique among the direct-helper fixtures; (1, 0) is adjacent.
    const nurse = addMonster(state, PM_NURSE, 70001, [1, 0]);
    state.uwep = null;
    state.uarmu = null;
    state.uarm = null;
    state.uarmc = null;
    state.uarms = null;
    state.uarmg = null;
    state.uarmf = null;
    state.uarmh = null;
    // Five current HP and a 13-point cap make rnd(7)=4 visible without capping.
    state.u.uhp = 5;
    state.u.uhpmax = 13;
    state.u.uhppeak = 13;
    // These arrays pin C's heal, max-HP, exercise and flee gate bounds/order.
    const bounds = [7, 3, 3, 33];
    const values = [1, 1, 2, 5];
    const draws = [];
    const random = {
        rnd(bound) {
            assert.equal(bound, 7);
            draws.push('rnd(' + bound + ')=4');
            return 4; // rnd(7)=4 raises the hero from 5 to 9 HP.
        },
        rn2(bound) {
            assert.equal(bound, bounds.shift());
            const value = values.shift();
            draws.push('rn2(' + bound + ')=' + value);
            return value;
        },
    };
    const events = [];
    // Start with visible physical damage and clear flags to pin the heal result.
    const mhm = { damage: 6, hitflags: 0, done: false };

    await mhitm_adtyping(
        nurse,
        nurse.data.mattk[0],
        state.youmonst,
        mhm,
        state,
        attackEnv(random, events),
    );

    assert.deepEqual(draws, [
        'rnd(7)=4', 'rn2(7)=1', 'rn2(3)=1', 'rn2(3)=2', 'rn2(33)=5',
    ]);
    assert.match(events[0], /nurse hits!  \(I hope you don't mind\.\)/u);
    assert.equal(state.u.uhp, 9);
    assert.equal(mhm.damage, 0);
    assert.equal(mhm.done, false);
    assert.equal(state.disp.botl, true);
});

test('monster-versus-monster Nurse AD_HEAL delegates its physical damage', async () => {
    const state = await startGame();
    // Unique adjacent actors exercise the C M-to-M damage delegation arm.
    const nurse = addMonster(state, PM_NURSE, 70002, [1, 0]);
    const golem = addMonster(state, PM_STONE_GOLEM, 70003, [0, -1]);
    const events = [];
    const random = {
        rn2(bound) { assert.fail('unexpected rn2(' + bound + ')'); },
        rnd(bound) { assert.fail('unexpected rnd(' + bound + ')'); },
        d(count, sides) {
            assert.fail('unexpected d(' + count + ',' + sides + ')');
        },
    };
    // The sentinel damage must remain untouched when the void helper does no work.
    const mhm = { damage: 4, hitflags: 0, done: false };

    await mhitm_adtyping(
        nurse,
        nurse.data.mattk[0],
        golem,
        mhm,
        state,
        attackEnv(random, events),
    );

    assert.equal(mhm.damage, 4);
    assert.equal(mhm.done, false);
    assert.deepEqual(events, []);
});

test('Nurse relocation finishes before its flee-time draw', async () => {
    const state = await startGame();
    // Unique test id keeps this Nurse separate from the other helper fixtures.
    const nurse = addMonster(state, PM_NURSE, 70005, [1, 0]);
    // A bare Wizard and no weapon take the Nurse's healing path rather than
    // the physical hit fallback used by the retained cloak case.
    state.uwep = null;
    state.uarmu = null;
    state.uarm = null;
    state.uarmc = null;
    state.uarms = null;
    state.uarmg = null;
    state.uarmf = null;
    state.uarmh = null;
    // RLOC_MSG plus this source flag guarantees the relocation path emits its
    // post-placement message, which this test deliberately suspends.
    nurse.mstrategy |= STRAT_APPEARMSG;
    state.moves = 5; // C's moves % 5 permits messages; this fixture also gates stasis.
    state.in_mklev = false;
    state.level.flags.stasis_until = 0;
    state.level.flags.noteleport = false;

    // Pick a valid room square several cells east of the hero. The injected
    // relocation draws below make rloc's first placement trial choose it.
    const destinationX = state.u.ux + 4; // Valid room square for the first rloc trial.
    const destinationY = state.u.uy;
    assert.ok(isok(destinationX, destinationY));
    assert.equal(state.level.monsters[destinationX][destinationY], null);
    state.level.at(destinationX, destinationY).typ = ROOM;
    assert.equal(
        goodpos(destinationX, destinationY, nurse, 0, { state }),
        true,
        'the injected first rloc trial must be an ordinary free square',
    );

    let beginRelocation;
    let finishRelocation;
    // The two promises let the test hold the C RLOC_MSG output before flee RNG.
    const relocationStarted = new Promise((resolve) => {
        beginRelocation = resolve;
    });
    const relocationGate = new Promise((resolve) => {
        finishRelocation = resolve;
    });
    const events = [];
    const order = [];
    const draws = [];
    const random = {
        rnd(bound) {
            if (bound === 7) {
                draws.push('rnd(7)');
                return 4;
            }
            assert.equal(bound, COLNO - 1);
            draws.push('rloc-x');
            return destinationX;
        },
        rn2(bound) {
            if (bound === 7) return 1; // Avoid the HP-maximum sub-branch.
            if (bound === 3) return 1; // Skip both stat exercise branches.
            if (bound === 33) {
                draws.push('rn2(33)=0');
                return 0; // Enter Nurse relocation after healing.
            }
            assert.equal(bound, ROWNO);
            draws.push('rloc-y');
            return destinationY;
        },
        d(count, sides) {
            assert.deepEqual([count, sides], [3, 6]);
            draws.push('flee-time');
            order.push('flee-time');
            return 3; // Any in-range value completes the C d(3,6) call.
        },
    };
    const env = {
        ...attackEnv(random, events),
        message: async (line) => {
            const text = String(line);
            events.push(text);
            if (/appears|vanishes/u.test(text)) {
                events.push('relocation-message-started');
                order.push('relocation-message-started');
                beginRelocation();
                await relocationGate;
                events.push('relocation-message-finished');
                order.push('relocation-message-finished');
            }
        },
        newsym: () => {},
        onscary: () => false,
        setApparxy: () => {},
    };
    // Nonzero starting damage proves the completed relocation takes the Nurse branch.
    const mhm = { damage: 6, hitflags: 0, done: false };
    const pending = mhitm_adtyping(
        nurse,
        nurse.data.mattk[0],
        state.youmonst,
        mhm,
        state,
        env,
    );

    await Promise.race([
        relocationStarted,
        new Promise((_, reject) => setTimeout(
            () => reject(new Error(
                'rloc did not emit its awaited message: '
                    + JSON.stringify({ events, draws, x: nurse.mx, y: nurse.my }),
            )),
            1000,
        )),
    ]);
    assert.equal(draws.includes('flee-time'), false);
    assert.equal(order.includes('flee-time'), false);
    finishRelocation();
    await pending;

    assert.ok(
        order.indexOf('relocation-message-finished')
            < order.indexOf('flee-time'),
    );
    assert.equal(mhm.done, true);
    assert.equal(mhm.hitflags !== 0, true);
});

test('a Healer with armor gets the cooperation line instead of damage', async () => {
    const state = await startGame('Healer');
    // Unique adjacent Nurse; Healer role and a truthy cloak select C's cooperation branch.
    const nurse = addMonster(state, PM_NURSE, 70004, [1, 0]);
    state.uarmc = { otyp: 1 };
    state.moves = 5; // C permits the every-fifth-move cooperation message.
    const events = [];
    const random = {
        rn2(bound) { assert.fail('unexpected rn2(' + bound + ')'); },
        rnd(bound) { assert.fail('unexpected rnd(' + bound + ')'); },
        d(count, sides) {
            assert.fail('unexpected d(' + count + ',' + sides + ')');
        },
    };
    const mhm = { damage: 6, hitflags: 0, done: false };

    await mhitm_adtyping(
        nurse,
        nurse.data.mattk[0],
        state.youmonst,
        mhm,
        state,
        attackEnv(random, events),
    );

    assert.equal(state.urole.mnum, PM_HEALER);
    assert.deepEqual(events, [
        "\"Doc, I can't help you unless you cooperate.\"",
    ]);
    assert.equal(mhm.damage, 0);
});
