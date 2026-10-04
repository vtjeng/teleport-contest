import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    A_CHAOTIC,
    A_LAWFUL,
    A_NEUTRAL,
    A_WIS,
    ALTAR,
    Align2amask,
    CQ_CANNED,
    ECMD_TIME,
    OBJ_INVENT,
    ROOMOFFSET,
    TEMPLE,
} from '../js/const.js';
import { ALIGNLIM } from '../js/attrib.js';
import { cmdq_add_key } from '../js/cmd.js';
import { game } from '../js/gstate.js';
import { PM_ORC } from '../js/monsters.js';
import {
    enableRngLog,
    getRngLog,
    initRng,
} from '../js/rng.js';
import { runSegment } from '../js/jsmain.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import { CORPSE, FOOD_CLASS } from '../js/objects.js';
import {
    findpriest,
    histemple_at,
    p_coaligned,
    temple_occupied,
} from '../js/priest.js';
import { dosacrifice } from '../js/pray.js';

const PRIEST_C = readFileSync(
    new URL('../nethack-c/upstream/src/priest.c', import.meta.url),
    'utf8',
);
const PRAY_C = readFileSync(
    new URL('../nethack-c/upstream/src/pray.c', import.meta.url), 'utf8',
);
const PRAY_JS = readFileSync(
    new URL('../js/pray.js', import.meta.url), 'utf8',
);

function templeFixture() {
    const cells = new Map();
    const level = {
        rooms: [
            { roomnoidx: 0, rtype: 1 },
            { roomnoidx: 1, rtype: TEMPLE },
        ],
        at(x, y) {
            const key = `${x},${y}`;
            if (!cells.has(key)) cells.set(key, { roomno: 0 });
            return cells.get(key);
        },
        monlist: null,
    };
    const state = {
        u: {
            ualign: { type: A_LAWFUL },
            uz: { dnum: 0, dlevel: 1 },
        },
        level,
    };
    const roomno = ROOMOFFSET + 1;
    level.at(7, 7).roomno = roomno;
    const priest = {
        ispriest: true,
        mhp: 12,
        mx: 7,
        my: 7,
        mextra: {
            epri: {
                shroom: roomno,
                shrlevel: { ...state.u.uz },
                shralign: A_LAWFUL,
            },
        },
        nmon: null,
    };
    return { roomno, priest, state };
}

test('C priest query source anchors match the four returned helper values', () => {
    assert.match(PRIEST_C,
        /svr\.rooms\[\*ptr - ROOMOFFSET\]\.rtype == TEMPLE/u);
    assert.match(PRIEST_C,
        /EPRI\(priest\)->shroom == \*in_rooms\(x, y, TEMPLE\)/u);
    assert.match(PRIEST_C,
        /mtmp->ispriest && \(EPRI\(mtmp\)->shroom == roomno\)/u);
    assert.match(PRIEST_C,
        /u\.ualign\.type == mon_aligntyp\(priest\)/u);
});

test('temple_occupied returns the first temple room and stops at NUL', () => {
    const { roomno, state } = templeFixture();
    const laterRoomno = ROOMOFFSET;
    const rooms = state.level.rooms;
    rooms[0].rtype = TEMPLE;
    assert.equal(
        temple_occupied([laterRoomno, roomno, 0, roomno, 0], state),
        laterRoomno,
    );
    rooms[0].rtype = 1;
    assert.equal(
        temple_occupied([laterRoomno, roomno, 0, roomno, 0], state),
        roomno,
    );
});

test('histemple_at requires a priest in its recorded temple on this level', () => {
    const { roomno, priest, state } = templeFixture();
    assert.equal(histemple_at(priest, 7, 7, state), true);
    assert.equal(histemple_at({ ...priest, ispriest: false }, 7, 7, state), false);
    assert.equal(histemple_at(priest, 8, 7, state), false);
    assert.equal(histemple_at({
        ...priest,
        mextra: { epri: { ...priest.mextra.epri, shroom: roomno + 1 } },
    }, 7, 7, state), false);
    assert.equal(histemple_at({
        ...priest,
        mextra: {
            epri: {
                ...priest.mextra.epri,
                shrlevel: { dnum: 0, dlevel: 2 },
            },
        },
    }, 7, 7, state), false);
});

test('findpriest skips dead or misplaced entries and returns the first live match', () => {
    const { roomno, priest, state } = templeFixture();
    const deadPriest = { ...priest, mhp: 0, nmon: null };
    const wrongRoomPriest = {
        ...priest,
        mextra: { epri: { ...priest.mextra.epri, shroom: roomno + 1 } },
        nmon: null,
    };
    const laterPriest = { ...priest, nmon: null };
    deadPriest.nmon = wrongRoomPriest;
    wrongRoomPriest.nmon = priest;
    priest.nmon = laterPriest;
    state.level.monlist = deadPriest;

    assert.equal(findpriest(roomno, state), priest);
    assert.equal(findpriest(roomno + 1, state), null);
});

test('p_coaligned compares hero alignment to the priest source alignment', () => {
    const { priest, state } = templeFixture();
    assert.equal(p_coaligned(priest, state), true);

    priest.mextra.epri.shralign = A_NEUTRAL;
    assert.equal(p_coaligned(priest, state), false);

    priest.mextra.epri.shralign = A_CHAOTIC;
    state.u.ualign.type = A_CHAOTIC;
    assert.equal(p_coaligned(priest, state), true);
});

async function runHighLevelOffering(seed) {
    // This independent fresh game uses a cross-aligned altar and maximum
    // starting alignment record so both source summon thresholds are in play.
    // A lawful human on a neutral altar reaches the ordinary conversion path;
    // Valkyrie-specific behavior is not part of this helper.
    const nethackrc = [
        'OPTIONS=name:Gatekeeper,role:Valkyrie,race:human,gender:female,align:lawful',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics',
        '',
    ].join('\n');
    await runSegment({
        seed,
        // A fixed ordinary date makes startup reproducible; the test resets
        // Luck and reseeds before the altar action, so lunar Luck is excluded.
        datetime: '20260314081500',
        nethackrc,
        moves: '',
    });
    clearTtyMessageWindow(game);

    const altar = game.level.at(game.u.ux, game.u.uy);
    altar.typ = ALTAR;
    altar.flags = Align2amask(A_NEUTRAL);
    // Level 30 makes both rnl gates eligible; record 10 is ALIGNLIM at moves 0.
    game.u.ulevel = 30;
    game.u.ualign.record = 10;
    // Zero Luck fixes rnl's source adjustment, and zero AEXE guarantees the
    // Wisdom exercises consume the expected C draws in the asserted sequence.
    game.u.uluck = 0;
    game.u.moreluck = 0;
    game.u.aexe[A_WIS] = 0;

    // A fresh, nonhuman orc corpse has positive value on the cross-aligned
    // altar and therefore reaches offer_different_alignment_altar.
    const corpse = {
        invlet: 'a',
        otyp: CORPSE,
        oclass: FOOD_CLASS,
        corpsenm: PM_ORC,
        age: game.moves,
        quan: 1,
        where: OBJ_INVENT,
        nobj: null,
        nexthere: null,
    };
    game.invent = corpse;
    // Type enough spaces to answer every offering message pager.
    game.nhDisplay.terminal._inputQueue.push(...Array(16).fill(32));
    cmdq_add_key(CQ_CANNED, 'a', game);
    initRng(seed);
    enableRngLog();
    const command = await dosacrifice(game);
    return { altar, command, corpse, state: game, rng: [...getRngLog()] };
}

test('cross-aligned altar success keeps the late minion gates and draw order',
    async () => {
    // pray.c:1680: seed 1 makes conflict succeed, rnl(30)>6, and rnd(10)>7
    // after the two Wisdom exercises and the +1 Luck adjustment.
    const { altar, command, state, rng } = await runHighLevelOffering(1);
    assert.match(PRAY_C,
        /rnl\(u\.ulevel\) > 6 && u\.ualign\.record > 0\s*&& rnd\(u\.ualign\.record\) > \(3 \* ALIGNLIM\) \/ 4/u);
    assert.match(PRAY_JS,
        /rnd\(u\.ualign\.record\) > Math\.trunc\(3 \* ALIGNLIM\(state\) \/ 4\)/u);
    // The no-move fixture leaves ALIGNLIM at its source base of 10.
    assert.equal(ALIGNLIM(state), 10);
    assert.equal(command, ECMD_TIME);
    assert.deepEqual(rng, [
        'rn2(19)=4',
        'rn2(38)=30',
        'rn2(19)=15',
        'rn2(38)=35',
        'rnl(30)=18',
        'rnd(10)=10',
    ]);
    assert.ok(state.unported.has('minion.c summon_minion'));
    assert.equal(altar.flags, Align2amask(A_LAWFUL));
    assert.match(state._ttyToplines, /feel the power of .* increase/u);
});

test('cross-aligned altar failure uses its stricter late minion threshold',
    async () => {
    // pray.c:1691: seed 32 makes conflict fail, then rnl(30)>6 and rnd(10)>8
    // after the failure's -1 Luck adjustment and Wisdom exercise.
    const { altar, command, state, rng } = await runHighLevelOffering(32);
    assert.match(PRAY_C,
        /rnl\(u\.ulevel\) > 6 && u\.ualign\.record > 0\s*&& rnd\(u\.ualign\.record\) > \(7 \* ALIGNLIM\) \/ 8/u);
    assert.match(PRAY_JS,
        /rnd\(u\.ualign\.record\) > Math\.trunc\(7 \* ALIGNLIM\(state\) \/ 8\)/u);
    assert.equal(ALIGNLIM(state), 10);
    assert.equal(command, ECMD_TIME);
    assert.deepEqual(rng, [
        'rn2(19)=6',
        'rn2(38)=4',
        'rn2(2)=0',
        'rn2(38)=7',
        'rnl(30)=19',
        'rnd(10)=10',
    ]);
    assert.ok(state.unported.has('minion.c summon_minion'));
    assert.equal(altar.flags, Align2amask(A_NEUTRAL));
    assert.match(state._ttyToplines, /feel the power of .* decrease/u);
});
