// wield.c ready_weapon() and doswapweapon(), the #swap command dothrow.c
// dofire() queues when the launcher for the readied ammunition is in the
// secondary slot. Every expected value comes from wield.c and is cited at the
// assertion that uses it.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ECMD_FAIL,
    ECMD_OK,
    ECMD_TIME,
    LAST_PROP,
    OBJ_INVENT,
    RIGHT_HANDED,
    W_SWAPWEP,
    W_WEP,
} from '../js/const.js';
import {
    PM_GRID_BUG,
    PM_SAMURAI,
    PM_YELLOW_LIGHT,
    monst_globals_init,
} from '../js/monsters.js';
import {
    BOW,
    CLUB,
    CRYSTAL_PLATE_MAIL,
    KATANA,
    SHORT_SWORD,
    SILVER_SABER,
    SLING,
    TWO_HANDED_SWORD,
    objects_globals_init,
} from '../js/objects.js';
import {
    UnsupportedWieldError,
    cantwield,
    doswapweapon,
    ready_weapon,
} from '../js/wield.js';
import { GameDisplay } from '../js/game_display.js';
import { init_objects } from '../js/o_init.js';
import { newObject } from '../js/obj.js';
import { roles } from '../js/roles.js';

// roles.js keeps role.c's order; the Samurai sits at :461.
const ROLE_SAMURAI = 9;

function makeState() {
    const state = {
        invent: null,
        uwep: null,
        uswapwep: null,
        uarms: null,
        uarmg: null,
        flags: { verbose: true },
        // The --More-- prompts below sit inside the move loop, where
        // tty_init_nhwindows() has already raised iflags.cbreak through
        // setftty(); without it xwaitforspace() would read only Return.
        iflags: { cbreak: true },
        disp: {},
        multi: 0,
        urole: roles[ROLE_SAMURAI],
        u: {
            twoweap: false,
            acurr: { a: [] },
            umonnum: PM_SAMURAI,
            umonster: PM_SAMURAI,
            // worn.c setworn() reads every property slot it clears, so the
            // hero needs the full table rather than a sparse one.
            uprops: Array.from(
                { length: LAST_PROP + 1 },
                () => ({ intrinsic: 0, extrinsic: 0, blocked: 0 }),
            ),
            uroleplay: {},
            // you.h:564 URIGHTY. u_init.c makes every hero right-handed
            // unless the player asked otherwise, and it is what picks
            // "right hand" for the primary slot and "left" for the secondary.
            uhandedness: RIGHT_HANDED,
        },
    };
    monst_globals_init(state);
    objects_globals_init(state);
    init_objects(state, () => 0);
    state.youmonst = { data: state.mons[PM_SAMURAI] };
    // prinv() reads flags.invlet_constant through xprname(); doname() reads
    // the discovery tables init_objects() just built.
    state.flags.invlet_constant = true;
    return state;
}

function object(state, otyp, overrides = {}) {
    return newObject({
        otyp,
        oclass: state.objects[otyp].oc_class,
        quan: 1,
        owornmask: 0,
        dknown: 1,
        invlet: 'a',
        where: OBJ_INVENT,
        ...overrides,
    });
}

// The messages both functions write land in state._pending_message; drain it
// so the next call's line can be read on its own.
function drain(state) {
    const line = state._pending_message;
    delete state._pending_message;
    return line;
}

// doswapweapon() writes two lines in a row and the second forces a --More--
// on the first, so the run needs both a terminal to draw on and a key to
// dismiss it with. `keys` answers every read; a space is what a player
// presses at a --More--.
function withDisplay(state, keys = ' '.repeat(4)) {
    const display = new GameDisplay(null);
    let index = 0;
    display.readKey = async () => keys.charCodeAt(index++ % keys.length);
    state.nhDisplay = display;
    state.program_state ??= {};
    return state;
}

test('ready_weapon() names the weapon it puts in the hand', async () => {
    // wield.c:221-227 sets W_WEP before prinv() so doname() adds "(weapon in
    // hand)", and takes it away again afterwards; setuwep() then puts it back
    // for real. wield.c:195 makes every wielding path answer ECMD_TIME.
    const state = makeState();
    // doname() prints an enchantment only once the hero knows it.
    const sling = object(state, SLING,
        { invlet: 'b', spe: 2, known: 1 });
    assert.equal(await ready_weapon(sling, state), ECMD_TIME);
    assert.equal(drain(state), 'b - a +2 sling (weapon in right hand).');
    assert.equal(state.uwep, sling);
    assert.equal(sling.owornmask & W_WEP, W_WEP);
});

test('ready_weapon() empties the hand when given nothing', async () => {
    // wield.c:175-183. Unwielding costs a turn; asking to unwield an already
    // empty hand answers ECMD_OK and spends none.
    const state = makeState();
    state.uwep = object(state, KATANA, { owornmask: W_WEP });
    assert.equal(await ready_weapon(null, state), ECMD_TIME);
    assert.equal(drain(state), 'You are bare handed.');
    assert.equal(state.uwep, null);
    assert.equal(await ready_weapon(null, state), ECMD_OK);
    assert.equal(drain(state), 'You are already bare handed.');
});

test('ready_weapon() stops for the four objects it cannot handle', async () => {
    // Each stops before setuwep(), so the hand is unchanged and the command
    // can be reported as unported rather than half-performed.
    const shielded = makeState();
    shielded.uarms = object(shielded, CRYSTAL_PLATE_MAIL);
    await assert.rejects(
        () => ready_weapon(object(shielded, TWO_HANDED_SWORD), shielded),
        /two-handed weapon under a shield/u,
    );
    assert.equal(shielded.uwep, null);
    // Both halves of that conjunction are needed: a one-handed weapon under
    // the same shield is fine, and a two-handed one with no shield is too.
    const oneHanded = makeState();
    oneHanded.uarms = object(oneHanded, CRYSTAL_PLATE_MAIL);
    assert.equal(
        await ready_weapon(object(oneHanded, KATANA), oneHanded), ECMD_TIME,
    );
    drain(oneHanded);
    const noShield = makeState();
    assert.equal(
        await ready_weapon(object(noShield, TWO_HANDED_SWORD), noShield),
        ECMD_TIME,
    );
    drain(noShield);
    // artifact.c retouch_object() can blast a hero who handles silver.
    const silver = makeState();
    await assert.rejects(
        () => ready_weapon(object(silver, SILVER_SABER), silver),
        /handling silver/u,
    );
    // wield.c:196-209, a cursed weapon welding itself to the hand.
    const cursed = makeState();
    await assert.rejects(
        () => ready_weapon(object(cursed, KATANA, { cursed: 1 }), cursed),
        /welding itself/u,
    );
    assert.equal(cursed.uwep, null);
    // wield.c:260-268's shopkeeper warning has no case: prinv() runs before
    // it, and objnam.c doname() stops on an unpaid item's price suffix, so the
    // refusal that arrives is js/objnam.js's rather than this one.
});

test('doswapweapon() exchanges the two slots and names both', async () => {
    // wield.c:477-495. The secondary slot is emptied first, ready_weapon()
    // takes what was in it, and whatever was in the hand goes back into the
    // secondary slot with a prinv() of its own. This is the pair of lines
    // seed1150-caveman-explore-move records at its steps 34 and 35.
    const state = withDisplay(makeState());
    const club = object(state, CLUB,
        { invlet: 'a', spe: 1, known: 1, owornmask: W_WEP });
    const sling = object(state, SLING,
        { invlet: 'b', spe: 2, known: 1, owornmask: W_SWAPWEP });
    state.uwep = club;
    state.uswapwep = sling;

    assert.equal(await doswapweapon(state), ECMD_TIME);
    const lastLine = drain(state);
    assert.equal(state.uwep, sling);
    assert.equal(state.uswapwep, club);
    assert.equal(sling.owornmask & W_WEP, W_WEP);
    assert.equal(club.owornmask & W_SWAPWEP, W_SWAPWEP);
    // Only the second line survives in _pending_message; the first was
    // overwritten by it, which is the same order the two --More-- prompts
    // appear in.
    assert.equal(lastLine, 'a - a +1 club (alternate weapon; not wielded).');
});

test('doswapweapon() reports an empty secondary slot in words', async () => {
    // wield.c:489-494. The message needs the wield to have succeeded and the
    // old primary slot to have been empty, which is an empty hand with a
    // secondary weapon in reserve. C's other arm at :486-488 -- uwep
    // unchanged, so the wield failed -- puts the old secondary back silently.
    const state = withDisplay(makeState());
    state.uswapwep = object(state, KATANA, { owornmask: W_SWAPWEP });
    assert.equal(await doswapweapon(state), ECMD_TIME);
    assert.equal(drain(state), 'You have no secondary weapon readied.');
    assert.equal(state.uwep?.otyp, KATANA);
    assert.equal(state.uswapwep, null);

    const bothEmpty = withDisplay(makeState());
    assert.equal(await doswapweapon(bothEmpty), ECMD_OK);
    assert.equal(drain(bothEmpty), 'You are already bare handed.');
    assert.equal(bothEmpty.uwep, null);
    assert.equal(bothEmpty.uswapwep, null);
});

test('doswapweapon() refuses a form that cannot wield, and a welded hand',
    async () => {
        // wield.c:467-475. Both guards answer ECMD_FAIL, which rhack() turns
        // into reset_cmd_vars(TRUE) -- the reset that discards the queued
        // dofire() behind a swap that could not happen.
        const state = makeState();
        // mondata.h:123 cantwield() is nohands() || verysmall(). A human
        // Samurai has neither flag; monst.c's yellow light has M1_NOHANDS
        // and its grid bug has M1_NOTAKE with a tiny size, so the two halves
        // of the disjunction each get a species that answers for it.
        assert.equal(cantwield(state.mons[PM_SAMURAI]), false);
        assert.equal(cantwield(state.mons[PM_YELLOW_LIGHT]), true);
        assert.equal(cantwield(state.mons[PM_GRID_BUG]), true);
        state.youmonst = { data: state.mons[PM_YELLOW_LIGHT] };
        assert.equal(await doswapweapon(state), ECMD_FAIL);
        assert.equal(drain(state), "Don't be ridiculous!");

        const welded = makeState();
        welded.uwep = object(welded, KATANA, { owornmask: W_WEP, cursed: 1 });
        await assert.rejects(() => doswapweapon(welded), /weldmsg/u);
    });

test('doswapweapon() zeroes multi without calling nomul()', async () => {
    // wield.c:467 assigns gm.multi directly. Going through hack.c nomul()
    // would clear CQ_CANNED (hack.c:4172) and throw away the dofire() that
    // dothrow.c queued behind this very command.
    const state = withDisplay(makeState());
    state.multi = 3;
    state.uwep = object(state, BOW, { owornmask: W_WEP });
    state.uswapwep = object(state, SHORT_SWORD, { owornmask: W_SWAPWEP });
    await doswapweapon(state);
    assert.equal(state.multi, 0);
});

test('a wielding refusal is one this port fails closed on', () => {
    // js/cmd.js failClosedCommandRefusals() converts it, so a segment that
    // reaches one keeps every frame it already matched.
    assert.ok(new UnsupportedWieldError('x') instanceof Error);
    assert.equal(new UnsupportedWieldError('x').name, 'UnsupportedWieldError');
});
