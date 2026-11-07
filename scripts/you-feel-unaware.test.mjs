// C's You_feel() (pline.c:388-400) prints "You dream that you feel ..."
// while the hero is Unaware (youprop.h:399: multi < 0 and asleep, knocked
// out or fainted). Each test below reaches one C file's You_feel() call
// from a path that can run while the hero sleeps, and checks that the port
// dreams the feeling. Two other files have recordings instead:
// recordings/mhitu.c/gulpmu-cold-resistant-asleep and
// recordings/do.c/revive-corpse-backpack-asleep.

import assert from 'node:assert/strict';
import test from 'node:test';

import { ART_EXCALIBUR } from '../js/artifacts.js';

import {
    ANTIMAGIC, FIRE_RES, FROMOUTSIDE, G_GENOD, LEVEL_TELEP, MAGIC_TRAP,
    OBJ_FLOOR,
} from '../js/const.js';
import { draft_message } from '../js/dig.js';
import { dog_starve } from '../js/dogmove.js';
import { hurtle } from '../js/dothrow.js';
import { pluslvl } from '../js/exper.js';
import { game } from '../js/gstate.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';
import { demon_talk } from '../js/minion.js';
import { elemental_clog } from '../js/mon.js';
import { mon_poly } from '../js/mhitm.js';
import { PM_HORNED_DEVIL, PM_STONE_GOLEM, PM_WEREWOLF } from '../js/monsters.js';
import { polymon } from '../js/polyself.js';
import { attrcurse } from '../js/sit.js';
import { level_tele_trap } from '../js/teleport.js';
import { trapeffect_selector } from '../js/trap_effects.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import { intervene } from '../js/wizard.js';

// Marks `state` as C's fall_asleep() leaves it: multi negative and usleep
// set, so trap.c unconscious() and youprop.h Unaware are true. Ten turns
// is any sleep length; only the sign of multi matters.
function asleep(state) {
    state.multi = -10;
    state.u.usleep = 1;
    return state;
}

// A started game whose hero has fallen asleep, for functions that read
// more of the game than a test should build by hand. The options are an
// independent debug-mode Valkyrie with no pet.
async function sleepingGame() {
    await runSegment({
        seed: 7340921,
        datetime: '20470315120000',
        nethackrc: 'OPTIONS=name:Dozer,role:Valkyrie,race:human,gender:female,'
            + 'align:neutral,playmode:debug\n'
            + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!autopickup\n',
        moves: '',
    });
    // Retire the welcome line so a new message needs no --More--.
    clearTtyMessageWindow(game);
    return asleep(game);
}

// Thrown by a message callback to stop a function after its first line,
// so a test needs only the state that line reads.
const STOP = new Error('stop after the first message');

function firstLine() {
    const lines = [];
    return {
        lines,
        message: async (line) => {
            lines.push(line);
            throw STOP;
        },
    };
}

test('exper.c pluslvl(FALSE) dreams the experience of a sleeping hero', async () => {
    // mhitu.c:2249 doseduce() calls pluslvl(FALSE) for a hero a foocubus
    // seduces in her sleep; exper.c:315 opens with You_feel().
    const state = asleep({ u: {} });
    const { lines, message } = firstLine();
    await assert.rejects(pluslvl(false, state, { message }), STOP);
    assert.deepEqual(lines, ['You dream that you feel more experienced.']);
});

test('dogmove.c dog_starve() dreams the loss of an unseen pet', async () => {
    // dog_starve() (dogmove.c:348-358) runs on the pet's own move, which
    // goes on while the hero sleeps; an unseen pet's death is You_feel().
    const state = asleep({ u: { uprops: {} } });
    const lines = [];
    await dog_starve({ mleashed: 0, mx: 5, my: 5 }, {
        state,
        message: async (line) => { lines.push(line); },
        canSee: () => false, // The pet starves out of sight.
        mondied: async () => {},
    });
    assert.deepEqual(lines, ['You dream that you feel sad for a moment.']);
});

test('wizard.c intervene() dreams the nervousness of a sleeping hero', async () => {
    // allmain.c:366 calls intervene() when the demigod countdown expires,
    // asleep or not; rn2(6) == 0 takes wizard.c:793's You_feel() arm.
    const state = asleep({ u: { uz: { dnum: 0, dlevel: 3 } } }); // Not Astral.
    const lines = [];
    await intervene(state, {
        random: { rn2: () => 0, rnd: () => 1 },
        message: async (line) => { lines.push(line); },
    });
    assert.deepEqual(lines, ['You dream that you feel vaguely nervous.']);
});

test('dig.c draft_message(FALSE) dreams a draft from a digging monster', async () => {
    // dig.c:1451 mdig_tunnel() calls draft_message(FALSE) when a monster
    // digs through a secret corridor, with no Unaware guard (unlike the
    // TRUE call at dig.c:1443). dig.c:1527 is the You_feel() line.
    const state = asleep({ u: { uprops: {} } }); // Not hallucinating.
    const lines = [];
    await draft_message(false, {
        state,
        message: async (line) => { lines.push(line); },
    });
    assert.deepEqual(lines, ['You dream that you feel a draft.']);
});

test('sit.c attrcurse() dreams a sleeping hero\'s lost intrinsic', async () => {
    // uhitm.c:3057 (a gremlin's AD_CURS hit at night) calls attrcurse() on
    // a hero who may be asleep; rnd(11) == 1 takes sit.c:652's fire arm.
    const state = asleep({
        u: { uprops: { [FIRE_RES]: { intrinsic: FROMOUTSIDE, extrinsic: 0 } } },
    });
    const lines = [];
    await attrcurse(state, {
        random: { rnd: () => 1 },
        message: async (line) => { lines.push(line); },
    });
    assert.deepEqual(lines, ['You dream that you feel warmer.']);
});

test('mon.c elemental_clog() dreams the siege of a sleeping hero', async () => {
    // mon.c deal_with_overcrowding() calls elemental_clog() when a monster
    // arrives on a full endgame level, on any turn; its first call opens
    // with mon.c:3888's You_feel("besieged.").
    const endgame = { dnum: 7, dlevel: 2 }; // Any endgame level but Astral.
    const state = asleep({ u: { uz: endgame }, astral_level: { dnum: 7, dlevel: 1 }, moves: 500 });
    const { lines, message } = firstLine();
    await assert.rejects(elemental_clog({}, state, { message }), STOP);
    assert.deepEqual(lines, ['You dream that you feel besieged.']);
});

test('minion.c demon_talk() dreams the tension of an unseen demon', async () => {
    // monmove.c:823 dochug() lets a bribing demon talk on its own move,
    // asleep hero or not; Excalibur and an unseen demon take minion.c:271.
    const state = await sleepingGame();
    state.uwep = { oartifact: ART_EXCALIBUR };
    // (1, 1) is a corner of the map, out of the hero's sight at the start.
    const demon = { data: state.mons[PM_HORNED_DEVIL], mx: 1, my: 1 };
    const { lines, message } = firstLine();
    await assert.rejects(demon_talk(demon, state, { message }), STOP);
    assert.deepEqual(lines, ['You dream that you feel tension building.']);
});

test('polyself.c polymon() dreams a genocided form for a sleeping hero', async () => {
    // uhitm.c:3928 do_stone_u() tries polymon(PM_STONE_GOLEM) when a
    // cockatrice's AD_STON hit reaches a hero in a form that
    // poly_when_stoned(), asleep or not; with stone golems genocided
    // polyself.c:744 reports the failure with You_feel().
    const state = await sleepingGame();
    state.svm.mvitals[PM_STONE_GOLEM].mvflags |= G_GENOD;
    const { lines, message } = firstLine();
    await assert.rejects(polymon(PM_STONE_GOLEM, state, { message }), STOP);
    assert.deepEqual(lines, ['You dream that you feel rather stone golem-ish.']);
});

test('mhitm.c mon_poly() dreams a lycanthrope\'s urge in a sleeping hero', async () => {
    // A monster's AD_POLY hit reaches mon_poly() with the hero as mdef,
    // asleep or not. A human lycanthrope (u.ulycn set, not in were form)
    // takes mhitm.c:1138's You_feel() arm.
    const state = await sleepingGame();
    state.u.ulycn = PM_WEREWOLF;
    const { lines, message } = firstLine();
    await assert.rejects(mon_poly({}, state.youmonst, 5, state, { message }), STOP);
    assert.deepEqual(lines, ['You dream that you feel an unnatural urge coming on.']);
});

test('dothrow.c hurtle() dreams the ball\'s tug on a sleeping hero', async () => {
    // A monster's knockback (uhitm.c mhitm_knockback()) hurtles the hero
    // whether or not she is awake. Punished() is uball != 0, and a ball
    // left on the floor takes dothrow.c:1091's You_feel() arm.
    const state = await sleepingGame();
    state.uball = { where: OBJ_FLOOR, ox: state.u.ux, oy: state.u.uy };
    // dx = 1, dy = 0 and range 2 are any knockback; the ball stops it first.
    await hurtle(1, 0, 2, false, state);
    assert.equal(state.nhDisplay.topMessage,
        'You dream that you feel a tug from the iron ball.');
});

test('teleport.c level_tele_trap() dreams the wrench of a blocked trap', async () => {
    // A sleeping hero reaches a trap when moved: teleds() and expels()
    // call spoteffects(), which calls dotrap(). With Antimagic an
    // unintended level teleporter stops at teleport.c:1554's You_feel().
    const state = await sleepingGame();
    state.u.uprops[ANTIMAGIC].intrinsic = 1;
    const trap = { ttyp: LEVEL_TELEP, tseen: true, tx: state.u.ux, ty: state.u.uy };
    const lines = [];
    await level_tele_trap(trap, 0, state, {
        message: async (line) => { lines.push(line); },
    });
    assert.equal(lines.at(-1), 'You dream that you feel a wrenching sensation.');
});

test('trap.c domagictrap() dreams a magic trap\'s fatigue', async () => {
    // As for teleporters above, spoteffects() can spring a magic trap on
    // a hero moved in her sleep. rn2(30) != 0 skips the explosion and
    // rnd(20) == 18 (trap.c:4319) takes trap.c:4414's You_feel("tired.").
    const state = await sleepingGame();
    const trap = { ttyp: MAGIC_TRAP, tseen: false, once: false,
        tx: state.u.ux, ty: state.u.uy, tnote: 0, madeby_u: false };
    const lines = [];
    await trapeffect_selector(state.youmonst, trap, 0, {
        state,
        random: {
            rn2: () => 1, // Nonzero: no explosion at trap.c:2300.
            rnd: (n) => (n === 20 ? 18 : 1), // Fate 18 is the tired arm.
        },
        message: async (line) => { lines.push(line); },
        redraw: () => {}, // seetrap() repaints the trap square.
    });
    assert.deepEqual(lines, ['You dream that you feel tired.']);
});
