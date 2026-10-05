import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster, place_monster } from '../js/monst.js';
import { preflightSimpleMonsterActions } from '../js/unported_monster_actions.js';
import {
    AD_TLPT,
    AT_TUCH,
    PM_HIGH_CLERIC,
    PM_QUANTUM_MECHANIC,
} from '../js/monsters.js';
import { TELEPAT } from '../js/const.js';
import { canseemon, canspotmon } from '../js/display.js';
import { isok } from '../js/cmd_isok.js';
import { mhitm_ad_tlpt, mhitm_adtyping } from '../js/uhitm.js';

const UHITM_C = readFileSync(
    new URL('../nethack-c/upstream/src/uhitm.c', import.meta.url), 'utf8',
);
const UHITM_JS = readFileSync(
    new URL('../js/uhitm.js', import.meta.url), 'utf8',
);
const DATETIME = '20360412153000'; // Fixed independently to keep this fixture stable.
const RC = [
    'OPTIONS=name:A98TeleportTest,role:Wizard,race:human,gender:male,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none',
    '',
].join('\n');

function bodyFor(source, name) {
    const start = source.indexOf(`${name}(`);
    assert.notEqual(start, -1, `${name} has a source definition`);
    const open = source.indexOf('{', start);
    assert.notEqual(open, -1, `${name} has a source body`);
    let depth = 0;
    for (let index = open; index < source.length; ++index) {
        if (source[index] === '{') ++depth;
        else if (source[index] === '}' && --depth === 0)
            return source.slice(start, index + 1);
    }
    assert.fail(`${name} source body closes`);
}

async function startGame() {
    // A regular initialized game supplies the canonical hero and monster data
    // used by the direct source-derived branch assertion below.
    await runSegment({
        seed: 981247,
        datetime: DATETIME,
        nethackrc: RC,
        moves: '',
    });
    game.program_state.in_moveloop = true;
    return game;
}

function monster(state, id, x, y) {
    const value = newMonster({
        data: state.mons[PM_HIGH_CLERIC],
        mnum: PM_HIGH_CLERIC,
        m_id: id,
        mx: x,
        my: y,
        mhp: 8,
        mhpmax: 8,
        m_lev: 3,
        mcanmove: true,
        mfrozen: 0,
        mcan: false,
        mcansee: true,
    });
    place_monster(value, x, y, state);
    return value;
}

function openAdjacent(state) {
    // The first free adjacent square makes the fixture independent of any
    // startup pet placement while keeping C's contact-source condition valid.
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) {
        const x = state.u.ux + dx;
        const y = state.u.uy + dy;
        if (isok(x, y) && !state.level.monsters[x][y]) return [x, y];
    }
    assert.fail('the initialized level has an open adjacent square');
}

test('mhitm_ad_tlpt retains all C direction and damage-limit branches', () => {
    const source = bodyFor(UHITM_C, 'mhitm_ad_tlpt');
    const heroAttacker = source.indexOf('if (magr == &gy.youmonst)');
    const heroDefender = source.indexOf('else if (mdef == &gy.youmonst)');
    const monsterDuel = source.indexOf('else {\n        /* mhitm */');
    assert.ok(heroAttacker >= 0 && heroAttacker < heroDefender
        && heroDefender < monsterDuel);
    assert.match(source,
        /mhm->damage <= 0[\s\S]*?mhitm_mgc_atk_negated\(magr, mdef, TRUE\)[\s\S]*?Strcpy\(nambuf, Monnam\(mdef\)\)[\s\S]*?u_teleport_mon\(mdef, FALSE\)[\s\S]*?mhm->damage >= mdef->mhp/u);
    assert.match(source,
        /boolean u_saw_mon = \(canseemon\(mdef\) \|\| engulfing_u\(mdef\)\);[\s\S]*?u_teleport_mon\(mdef, FALSE\)[\s\S]*?u_saw_mon\s*&& !\(canseemon\(mdef\) \|\| engulfing_u\(mdef\)\)/u);
    assert.match(source,
        /hitmsg\(magr, mattk\)[\s\S]*?mhitm_mgc_atk_negated\(magr, mdef, FALSE\)[\s\S]*?Teleport_control && !Stunned && !unconscious\(\)[\s\S]*?tele\(\)[\s\S]*?Half_physical_damage[\s\S]*?Upolyd \? u\.mh : u\.uhp/u);
    assert.match(source,
        /magr->mcan \|\| mhm->damage >= mdef->mhp \|\| tele_restrict\(mdef\)[\s\S]*?mhitm_mgc_atk_negated\(magr, mdef, TRUE\)[\s\S]*?mdef->mstrategy &= ~STRAT_WAITFORU[\s\S]*?rloc\(mdef, RLOC_NOMSG\)[\s\S]*?mhm->damage >= mdef->mhp/u);
    assert.match(UHITM_C,
        /case AD_TLPT:\s*mhitm_ad_tlpt\(magr, mattk, mdef, mhm\);\s*break;/u);
    assert.match(UHITM_JS,
        /case AD_TLPT:\s*await mhitm_ad_tlpt\(magr, mattk, mdef, mhm, state, env\);\s*break;/u);

    const implementation = UHITM_JS.slice(
        UHITM_JS.indexOf('export async function mhitm_ad_tlpt('),
        UHITM_JS.indexOf('// C ref: uhitm.c mhitm_adtyping',
            UHITM_JS.indexOf('export async function mhitm_ad_tlpt(')),
    );
    const jsHeroAttacker = implementation.indexOf('if (magr === state.youmonst)');
    const jsHeroDefender = implementation.indexOf('if (mdef === state.youmonst)');
    const jsMonsterDuel = implementation.indexOf('if (magr.mcan ||');
    assert.ok(jsHeroAttacker >= 0 && jsHeroAttacker < jsHeroDefender
        && jsHeroDefender < jsMonsterDuel);
    assert.match(implementation,
        /const sawMonster = canseemon\(mdef, state\)[\s\S]*?u_teleport_mon\(mdef, false,[\s\S]*?sawMonster[\s\S]*?canseemon\(mdef, state\)/u);
});

test('hero AD_TLPT does not report a sensed but unseen target disappearing',
    async () => {
        const state = await startGame();
        const [targetX, targetY] = openAdjacent(state);
        const target = monster(state, 9000, targetX, targetY);
        target.minvis = true;
        state.u.uprops[TELEPAT] = { intrinsic: 0, extrinsic: 1 };
        state.u.unblind_telepat_range = 2;
        assert.equal(canseemon(target, state), false);
        assert.equal(canspotmon(target, state), true);

        const messages = [];
        const random = {
            rn2(bound) {
                if (bound === 10) return 9;
                if (bound === 21) return 10;
                return 0;
            },
            rnd(bound) {
                return Math.min(60, bound);
            },
        };
        await mhitm_ad_tlpt(state.youmonst, {
            aatyp: AT_TUCH,
            adtyp: AD_TLPT,
            damn: 1,
            damd: 1,
        }, target, { damage: 1 }, state, {
            random,
            message: async (line) => messages.push(line),
            redraw: () => {},
            setApparxy: () => {},
            onscary: () => false,
        });

        assert.ok(Math.hypot(target.mx - state.u.ux, target.my - state.u.uy) > 2);
        assert.equal(canseemon(target, state), false);
        assert.ok(messages.every((line) => !/disappears/u.test(line)));
    });

test('hero AD_TLPT floors damage before the antimagic return', async () => {
    const state = await startGame();
    const [targetX, targetY] = openAdjacent(state);
    const target = monster(state, 9001, targetX, targetY);
    state.gv.vis = false;
    const calls = [];
    const mhm = { damage: 0 };

    await mhitm_ad_tlpt(state.youmonst, {
        aatyp: AT_TUCH,
        adtyp: AD_TLPT,
        damn: 1,
        damd: 1,
    }, target, mhm, state, {
        random: {
            rn2(bound) {
                calls.push(bound);
                assert.equal(bound, 10);
                return 0; // With zero magic cancellation, C's comparison negates.
            },
        },
        message: async (line) => calls.push(line),
    });

    assert.equal(mhm.damage, 1);
    assert.deepEqual([target.mx, target.my], [targetX, targetY]);
    assert.equal(calls[0], 10);
    assert.match(calls[1], / is not affected\.$/u);
});

test('AD_TLPT dispatcher reaches the whole handler', async () => {
    const state = await startGame();
    const [targetX, targetY] = openAdjacent(state);
    const target = monster(state, 9002, targetX, targetY);
    state.gv.vis = false;
    const messages = [];

    await mhitm_adtyping(state.youmonst, {
        aatyp: AT_TUCH,
        adtyp: AD_TLPT,
        damn: 1,
        damd: 1,
    }, target, { damage: 0 }, state, {
        random: { rn2: () => 0 },
        message: async (line) => messages.push(line),
        unsupported: (reason) => assert.fail(reason),
    });

    assert.equal(messages.length, 1);
    assert.match(messages[0], / is not affected\.$/u);
});

test('the production monster planner stops before controlled teleport input',
    async () => {
        await runSegment({
            seed: 781026443,
            datetime: '21121210072545',
            nethackrc: [
                'OPTIONS=name:A98TeleportPlan,role:Wizard,race:human,gender:male,align:neutral',
                'OPTIONS=!legacy,!tutorial,!splash_screen,playmode:debug,pettype:none,!autopickup,!acoustics,!safe_wait',
                '',
            ].join('\n'),
            moves: '',
        });
        const state = game;
        for (const column of state.level.monsters) column.fill(null);
        state.level.monlist = null;

        const x = state.u.ux + 1;
        const y = state.u.uy;
        const attacker = newMonster({
            data: state.mons[PM_QUANTUM_MECHANIC],
            mnum: PM_QUANTUM_MECHANIC,
            m_id: 9003,
            mx: x,
            my: y,
            mhp: 30,
            mhpmax: 30,
            m_lev: 40,
            movement: 12,
            mcanmove: true,
            mcansee: true,
            mpeaceful: false,
            mtame: 0,
        });
        place_monster(attacker, x, y, state);
        state.level.monlist = attacker;
        state.u.umovement = 12;
        // Keep a real queued key available. The production preflight must
        // stop before getpos() reads it from the clone's shared display.
        state.nhDisplay.pushKey('.'.charCodeAt(0));
        const screen = state.nhDisplay.serialize();
        const heroPosition = [state.u.ux, state.u.uy];
        const attackerMovement = attacker.movement;

        const plan = await preflightSimpleMonsterActions(state);

        assert.deepEqual(plan.inputBoundary, { operation: 'getpos' });
        assert.equal(state.nhDisplay.inputQueueLength, 1);
        assert.equal(state.nhDisplay.serialize(), screen);
        assert.equal(state.u.umovement, 12);
        assert.equal(attacker.movement, attackerMovement);
        assert.deepEqual([state.u.ux, state.u.uy], heroPosition);
    });
