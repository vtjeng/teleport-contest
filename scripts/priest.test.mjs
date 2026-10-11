import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { A_CHAOTIC, A_LAWFUL, A_NEUTRAL, A_NONE } from '../js/const.js';
import { Monnam } from '../js/do_name.js';
import { game } from '../js/gstate.js';
import {
    angry_priest,
    free_epri,
    ghod_hitsu,
    mon_aligntyp,
} from '../js/priest.js';
import { runSegment } from '../js/jsmain.js';
import {
    MONSTER_TEMPLATES,
    PM_ALIGNED_CLERIC,
    PM_HIGH_CLERIC,
} from '../js/monsters.js';
import { getRngLog } from '../js/rng.js';

const PRIEST_C_SOURCE = readFileSync('nethack-c/upstream/src/priest.c', 'utf8');
const PRIEST_JS_SOURCE = readFileSync('js/priest.js', 'utf8');
const PRAY_C_SOURCE = readFileSync('nethack-c/upstream/src/pray.c', 'utf8');
const PRAY_JS_SOURCE = readFileSync('js/pray.js', 'utf8');
const DIG_C_SOURCE = readFileSync('nethack-c/upstream/src/dig.c', 'utf8');
const DIG_JS_SOURCE = readFileSync('js/dig.js', 'utf8');

test('priest.c intemple uses Monnam after suppressing the priest title', () => {
    const cStart = PRIEST_C_SOURCE.indexOf('intemple(int roomno)');
    const cEnd = PRIEST_C_SOURCE.indexOf('\n}\n', cStart);
    const intempleC = PRIEST_C_SOURCE.slice(cStart, cEnd);
    assert.match(intempleC,
        /canseemon\(priest\).*Monnam\(priest\)/su);

    const start = PRIEST_JS_SOURCE.indexOf('export async function intemple(');
    const end = PRIEST_JS_SOURCE.indexOf(
        '// C ref: priest.c priest_talk()', start,
    );
    const intempleSource = PRIEST_JS_SOURCE.slice(start, end);
    assert.match(intempleSource,
        /canseemon\(priest, state\)\s*\?\s*Monnam\(priest, state\)/u);
    assert.doesNotMatch(intempleSource, /priestname\(priest,/u);

    const namingState = { mons: MONSTER_TEMPLATES, u: {} };
    const priest = {
        data: MONSTER_TEMPLATES[PM_HIGH_CLERIC],
        ispriest: false,
        isminion: false,
        minvis: false,
        female: false,
    };
    assert.equal(Monnam(priest, namingState, { canSpotMonster: () => true }),
        'The high priest');
    assert.equal(Monnam({ ...priest, female: true }, namingState,
        { canSpotMonster: () => true }), 'The high priestess');
});

const RECIPE = JSON.parse(readFileSync(
    new URL('../recordings/priest.c/roamer-sanctum-gnome-wizard.session.json',
        import.meta.url),
));
const ACTION_RECIPE = JSON.parse(readFileSync(
    new URL('../recordings/priest.c/roamer-sanctum-valkyrie-action.session.json',
        import.meta.url),
));

function alignedRoamers() {
    const roamers = [];
    for (let monster = game.level.monlist; monster; monster = monster.nmon) {
        if (monster.data?.pmidx === PM_ALIGNED_CLERIC)
            roamers.push(monster);
    }
    return roamers;
}

test('Sanctum explicit aligned clerics use priest.c mk_roamer', async () => {
    // sp_lev.c create_monster() routes the Sanctum's explicit noalign
    // descriptors through priest.c mk_roamer(), which creates ordinary
    // non-tame EMIN roamers. This inspects the production route reached by
    // the independent gnome Wizard recording rather than a direct helper.
    await runSegment(RECIPE.segments[0]);
    assert.equal(game.urole.name.m, 'Wizard');
    assert.equal(game.urace.adj, 'gnomish');
    assert.equal(game.flags.female, true);
    assert.equal(game.u.ualign.type, A_NEUTRAL);

    const roamers = alignedRoamers();
    assert.equal(roamers.length, 9);
    for (const roamer of roamers) {
        assert.equal(roamer.ispriest, false);
        assert.equal(roamer.isminion, true);
        assert.equal(roamer.mpeaceful, false);
        assert.equal(roamer.msleeping, false);
        assert.deepEqual(roamer.mextra.emin, {
            parentmid: 0,
            min_align: -128,
            renegade: false,
        });
        assert.equal(roamer.mtrapseen, -1);
    }
});

test('Valkyrie Sanctum route reaches an ordinary EMIN action turn', async () => {
    const actionSegment = ACTION_RECIPE.segments[0];
    const beforeAction = {
        ...actionSegment,
        moves: actionSegment.moves.replace(/\.+$/u, ''),
    };
    await runSegment(beforeAction);
    const positionsBefore = new Map();
    for (const roamer of alignedRoamers())
        positionsBefore.set(roamer.m_id, [roamer.mx, roamer.my]);

    await runSegment(actionSegment);
    assert.equal(game.urole.name.m, 'Valkyrie');
    assert.equal(game.urace.adj, 'human');
    assert.equal(game.flags.female, true);
    assert.equal(game.u.ualign.type, A_LAWFUL);
    const roamers = alignedRoamers();
    assert.equal(roamers.length, 9);
    assert.ok(roamers.some(roamer => {
        const before = positionsBefore.get(roamer.m_id);
        return before && (before[0] !== roamer.mx || before[1] !== roamer.my);
    }), 'an aligned EMIN must move during the extended production route');
    assert.ok(getRngLog().length > 0);
});


test('priest.c mon_aligntyp selects the source extension and preserves A_NONE', () => {
    // priest.c:280-290 reads EPRI before EMIN before per-species alignment,
    // returns A_NONE unchanged, and sign-normalizes every other alignment.
    assert.equal(mon_aligntyp({
        data: { maligntyp: -3 }, // Negative nonconstant value normalizes to chaotic.
    }), A_CHAOTIC);
    assert.equal(mon_aligntyp({
        data: { maligntyp: 0 }, // Zero species alignment stays neutral.
    }), A_NEUTRAL);
    assert.equal(mon_aligntyp({
        data: { maligntyp: 7 }, // Positive nonconstant value normalizes to lawful.
    }), A_LAWFUL);
    assert.equal(mon_aligntyp({
        data: { maligntyp: A_CHAOTIC },
        isminion: true,
        mextra: { emin: { min_align: 4 } }, // Positive EMIN alignment normalizes.
    }), A_LAWFUL);
    assert.equal(mon_aligntyp({
        data: { maligntyp: A_CHAOTIC },
        ispriest: true,
        isminion: true,
        mextra: {
            epri: { shralign: -9 }, // EPRI takes priority and normalizes.
            emin: { min_align: 4 }, // Conflicting EMIN value must be ignored.
        },
    }), A_CHAOTIC);
    assert.equal(mon_aligntyp({
        data: { maligntyp: A_LAWFUL },
        ispriest: true,
        mextra: { epri: { shralign: A_NONE } },
    }), A_NONE);
});

test('priest.c angry_priest transfers shrine state to a roaming minion', () => {
    const freeStart = PRIEST_C_SOURCE.indexOf('\nfree_epri(');
    const freeEnd = PRIEST_C_SOURCE.indexOf('\n/*\n * Move for priests', freeStart);
    const angryStart = PRIEST_C_SOURCE.indexOf('\nangry_priest(void)');
    const angryEnd = PRIEST_C_SOURCE.indexOf('\n/*\n * When saving bones', angryStart);
    const freeFunction = PRIEST_C_SOURCE.slice(freeStart, freeEnd);
    const angryFunction = PRIEST_C_SOURCE.slice(angryStart, angryEnd);

    assert.ok(freeStart >= 0 && freeEnd > freeStart);
    assert.match(freeFunction, /EPRI\(mtmp\) = \(struct epri \*\) 0;/u);
    assert.match(freeFunction, /mtmp->ispriest = 0;/u);
    assert.ok(angryStart >= 0 && angryEnd > angryStart);
    assert.ok(angryFunction.indexOf('wakeup(priest, FALSE);')
        < angryFunction.indexOf('setmangry(priest, FALSE);'));
    assert.ok(angryFunction.indexOf('EMIN(priest)->min_align = eprip->shralign;')
        < angryFunction.indexOf('free_epri(priest);'));

    const jsAngry = PRIEST_JS_SOURCE.slice(
        PRIEST_JS_SOURCE.indexOf('export async function angry_priest('),
    );
    assert.equal(typeof angry_priest, 'function');
    assert.equal(typeof free_epri, 'function');
    assert.match(jsAngry, /await wakeup\(priest, false, env\);[\s\S]*await setmangry\(priest, false, env\);/u);
    assert.match(jsAngry, /newemin\(priest\)/u);
    assert.match(jsAngry, /emin\.min_align = epri\.shralign;/u);
    assert.match(jsAngry, /emin\.renegade = false;/u);
    assert.match(jsAngry, /free_epri\(priest\);/u);

    const otherExtra = { value: 9 };
    const priest = {
        ispriest: true,
        isminion: true,
        mextra: { epri: { shralign: A_LAWFUL }, emin: otherExtra },
    };
    free_epri(priest);
    assert.equal(priest.ispriest, false);
    assert.equal(priest.mextra.epri, null);
    assert.equal(priest.mextra.emin, otherExtra);
    const priestWithoutExtra = { ispriest: true };
    free_epri(priestWithoutExtra);
    assert.equal(priestWithoutExtra.ispriest, false);

    const sourceCallerCount = [PRAY_C_SOURCE, DIG_C_SOURCE]
        .join('\n').match(/angry_priest\(\);/gu)?.length ?? 0;
    const jsCallerCount = [PRAY_JS_SOURCE, DIG_JS_SOURCE]
        .join('\n').match(/await angry_priest\(state(?:, rawEnv)?\);/gu)?.length ?? 0;
    assert.equal(sourceCallerCount, 4);
    assert.equal(jsCallerCount, sourceCallerCount);
    assert.doesNotMatch(`${PRAY_JS_SOURCE}\n${DIG_JS_SOURCE}`,
        /note_unported\(['"](?:priest|pray)\.c angry_priest['"]\)/u);
});

test('priest.c ghod_hitsu preserves boundary selection and response order', () => {
    const cStart = PRIEST_C_SOURCE.indexOf('\nghod_hitsu(');
    const cEnd = PRIEST_C_SOURCE.indexOf('\nvoid\nangry_priest', cStart);
    const cFunction = PRIEST_C_SOURCE.slice(cStart, cEnd);

    assert.ok(cStart >= 0 && cEnd > cStart);
    assert.match(cFunction, /temple_occupied\(u\.urooms\)/u);
    assert.match(cFunction, /!has_shrine\(priest\)/u);
    assert.match(cFunction, /switch \(rn2\(4\)\)/u);
    assert.match(cFunction, /if \(!linedup\(u\.ux, u\.uy, x, y, 1\)\)\s*return;/u);
    assert.match(cFunction, /switch \(rn2\(3\)\)/u);
    assert.match(cFunction, /buzz\(BZ_M_SPELL\(BZ_OFS_AD\(AD_ELEC\)\), 6,/u);
    assert.ok(cFunction.indexOf('gb.buzzer = oldbuzzer;')
        < cFunction.indexOf('gc.current_wand = oldcurrwand;'));
    assert.match(cFunction, /exercise\(A_WIS, FALSE\);/u);

    assert.equal(typeof ghod_hitsu, 'function');
    assert.match(PRIEST_JS_SOURCE, /export async function ghod_hitsu\(priest, rawEnv = \{\}\)/u);
    assert.match(PRIEST_JS_SOURCE, /await buzz\([\s\S]*?rawEnv\.random,[\s\S]*?rawEnv,/u);
    assert.match(PRIEST_JS_SOURCE, /await exercise\(A_WIS, false, state, rawEnv\.random\)/u);
});

test('priestini marks only its source sanctum High Cleric creation for makemon', () => {
    const cStart = PRIEST_C_SOURCE.indexOf('\npriestini(');
    const cEnd = PRIEST_C_SOURCE.indexOf('\n/* get a monster\'s alignment', cStart);
    const cFunction = PRIEST_C_SOURCE.slice(cStart, cEnd);
    const jsStart = PRIEST_JS_SOURCE.indexOf('export function priestini(');
    const jsEnd = PRIEST_JS_SOURCE.indexOf('\n}\n', jsStart) + 2;
    const jsFunction = PRIEST_JS_SOURCE.slice(jsStart, jsEnd);

    assert.ok(cStart >= 0 && cEnd > cStart);
    assert.ok(jsStart >= 0 && jsEnd > jsStart);
    assert.match(cFunction, /sanctum \? PM_HIGH_CLERIC\s*: PM_ALIGNED_CLERIC/u);
    assert.match(cFunction, /makemon\(prim, px, py, MM_EPRI\)/u);
    assert.match(jsFunction, /sanctum \? PM_HIGH_CLERIC : PM_ALIGNED_CLERIC/u);
    assert.match(
        jsFunction,
        /const priestEnv = \{ \.\.\.env, _priestiniHighCleric: Boolean\(sanctum\) \};/u,
    );
    assert.match(
        jsFunction,
        /makemon\(prim, px, py, MM_EPRI, priestEnv\)/u,
    );
    assert.equal(PM_HIGH_CLERIC, 276);
});

test('pri_move preserves altar draws then awaits its adjacent hostile attack', async () => {
    const { pri_move } = await import('../js/priest.js');
    const { ROOMOFFSET, TEMPLE } = await import('../js/const.js');
    // priest.c:179-203 first validates its temple, then makes two rn1(3,-1)
    // draws before attacking the cardinally adjacent hero and returning zero.
    const state = {
        u: { ux: 11, uy: 8, uz: { dnum: 0, dlevel: 4 }, uprops: [] },
        level: { rooms: [{ rtype: TEMPLE }],
            at: () => ({ roomno: ROOMOFFSET }) },
    };
    const priest = { mx: 10, my: 8, ispriest: true, mpeaceful: false,
        data: {}, mextra: { epri: { shroom: ROOMOFFSET,
            shrpos: { x: 9, y: 8 }, shrlevel: { dnum: 0, dlevel: 4 } } } };
    const order = [];
    let finishAttack;
    const attackPending = new Promise(resolve => { finishAttack = resolve; });
    const result = pri_move(priest, { state,
        random: { rn1: (range, base) => {
            order.push(`rn1(${range},${base})`);
            return base;
        } },
        attackHero: async (subject, env) => {
            assert.equal(subject, priest);
            assert.equal(env.state, state);
            await attackPending;
            order.push('attack');
            return 1; // C discards the result here and returns zero.
        },
    });
    let settled = false;
    result.then(() => { settled = true; });
    assert.deepEqual(order, ['rn1(3,-1)', 'rn1(3,-1)']);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, false, 'pri_move waits while mattacku is pending');
    finishAttack();
    assert.equal(await result, 0);
    assert.equal(settled, true);
    assert.deepEqual(order, ['rn1(3,-1)', 'rn1(3,-1)', 'attack']);
});

test('move_special checks the hero room after a shopkeeper enters its shop', () => {
    const cStart = PRIEST_C_SOURCE.indexOf('move_special(struct monst *mtmp');
    const cEnd = PRIEST_C_SOURCE.indexOf('\n}\n', cStart);
    const cFunction = PRIEST_C_SOURCE.slice(cStart, cEnd);
    assert.match(cFunction,
        /place_monster\(mtmp, nix, niy\);\s*newsym\(nix, niy\);\s*if \(mtmp->isshk && !in_his_shop && inhishop\(mtmp\)\)\s*check_special_room\(FALSE\);/u);

    const jsStart = PRIEST_JS_SOURCE.indexOf('export async function move_special(');
    const jsEnd = PRIEST_JS_SOURCE.indexOf('// C ref: priest.c pri_move()', jsStart);
    const jsFunction = PRIEST_JS_SOURCE.slice(jsStart, jsEnd);
    assert.match(jsFunction,
        /place_monster\(mtmp, nix, niy, state\);\s*redraw\(nix, niy\);\s*if \(mtmp\.isshk && !inHisShop\)[\s\S]*?await check_special_room\(false, state,/u);
});
