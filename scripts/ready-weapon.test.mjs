// wield.c ready_weapon() and doswapweapon(), the #swap command dothrow.c
// dofire() queues when the launcher for the readied ammunition is in the
// secondary slot. Every expected value comes from wield.c and is cited at the
// assertion that uses it.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    KILLED_BY,
    ECMD_FAIL,
    LEFT_HANDED,
    STONE_RES,
    ECMD_OK,
    ECMD_TIME,
    LAST_PROP,
    OBJ_INVENT,
    RIGHT_HANDED,
    STONING,
    W_ARMS,
    W_SWAPWEP,
    W_WEP,
} from '../js/const.js';
import { HeroDeathPlanningError } from '../js/hack.js';
import {
    PM_GRID_BUG,
    PM_COCKATRICE,
    PM_SAMURAI,
    PM_YELLOW_LIGHT,
    monst_globals_init,
} from '../js/monsters.js';
import {
    BOW,
    BATTLE_AXE,
    CLUB,
    CORPSE,
    HALBERD,
    KATANA,
    SMALL_SHIELD,
    SHORT_SWORD,
    SILVER_SABER,
    SLING,
    TWO_HANDED_SWORD,
    objects_globals_init,
} from '../js/objects.js';
import {
    UnsupportedWieldError,
    cantwield,
    cant_wield_corpse,
    empty_handed,
    weldmsg,
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

test('ready_weapon() refuses bimanual weapons under a shield', async () => {
    // wield.c:186-192. C distinguishes swords, battle axes, and other
    // bimanual weapons in the refusal message, then returns ECMD_FAIL before
    // retouch_object() or setuwep().
    for (const { otyp, noun } of [
        { otyp: TWO_HANDED_SWORD, noun: 'sword' },
        { otyp: BATTLE_AXE, noun: 'axe' },
        { otyp: HALBERD, noun: 'weapon' },
    ]) {
        const state = makeState();
        const shield = object(state, SMALL_SHIELD, { owornmask: W_ARMS });
        const primary = object(state, KATANA, { owornmask: W_WEP });
        const selected = object(state, otyp);
        state.uarms = shield;
        state.uwep = primary;

        assert.equal(await ready_weapon(selected, state), ECMD_FAIL);
        assert.equal(
            drain(state),
            `You cannot wield a two-handed ${noun} while wearing a shield.`,
        );
        assert.equal(state.uwep, primary);
        assert.equal(state.uarms, shield);
        // The selected weapon starts unworn and the refusal leaves it so.
        assert.equal(selected.owornmask, 0);
    }
});

test('doswapweapon() restores the secondary after a shield refusal', async () => {
    // wield.c:483-488 calls ready_weapon(oldswap), then restores oldswap when
    // the primary slot did not change after its ECMD_FAIL result.
    const state = makeState();
    const shield = object(state, SMALL_SHIELD, { owornmask: W_ARMS });
    const primary = object(state, KATANA, { owornmask: W_WEP });
    const secondary = object(state, TWO_HANDED_SWORD,
        { owornmask: W_SWAPWEP });
    state.uarms = shield;
    state.uwep = primary;
    state.uswapwep = secondary;

    assert.equal(await doswapweapon(state), ECMD_FAIL);
    assert.equal(
        drain(state),
        'You cannot wield a two-handed sword while wearing a shield.',
    );
    assert.equal(state.uwep, primary);
    assert.equal(state.uswapwep, secondary);
    assert.equal(state.uarms, shield);
});

test('ready_weapon() keeps its other wielding and weld behavior', async () => {
    // The one-handed and no-shield controls pin both sides of wield.c:186's
    // uarms && bimanual(wep) condition.
    // A one-handed katana under the same shield remains wieldable.
    const oneHanded = makeState();
    oneHanded.uarms = object(oneHanded, SMALL_SHIELD,
        { owornmask: W_ARMS });
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
    // artifact.c retouch_object() checks silver + Hate_silver and bane.
    // A hero who does not hate silver wields a silver saber without issue.
    const silver = makeState();
    assert.equal(
        await ready_weapon(object(silver, SILVER_SABER), silver),
        ECMD_TIME,
    );
    drain(silver);
    // wield.c:196-209: the message and curse knowledge precede setuwep.
    const cursed = makeState();
    const katana = object(cursed, KATANA, { cursed: 1 });
    assert.equal(await ready_weapon(katana, cursed), ECMD_TIME);
    assert.equal(drain(cursed), 'The samurai sword welds itself to your dominant right hand!');
    assert.equal(katana.bknown, 1);
    assert.equal(cursed.uwep, katana);
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
        const primary = welded.uwep;
        assert.equal(await doswapweapon(welded), ECMD_FAIL);
        assert.equal(drain(welded), 'Your samurai sword is welded to your hand!');
        assert.equal(welded.uwep, primary);
        assert.equal(primary.owornmask, W_WEP);
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

// wield.c:157-166 is pure: gloves take precedence over body shape.
test('empty_handed follows the three literal source results', () => {
    const state = makeState();
    assert.equal(empty_handed(state), 'bare handed'); // humanoid Samurai
    state.youmonst = { data: state.mons[PM_GRID_BUG] }; // no humanoid hands
    assert.equal(empty_handed(state), 'not wielding anything');
    state.uarmg = {}; // any glove object chooses C's first arm
    assert.equal(empty_handed(state), 'empty handed');
});

test('welding retains left handed, plural, and bimanual source wording', async () => {
    const left = makeState();
    left.u.uhandedness = LEFT_HANDED;
    const stack = object(left, CLUB, { cursed: 1, quan: 2 }); // a plural stack
    assert.equal(await ready_weapon(stack, left), ECMD_TIME);
    assert.equal(drain(left), 'The 2 clubs weld themselves to your dominant left hand!');
    const two = makeState();
    const sword = object(two, TWO_HANDED_SWORD, { cursed: 1 }); // bimanual
    assert.equal(await ready_weapon(sword, two), ECMD_TIME);
    assert.equal(drain(two), 'The two-handed sword welds itself to your hands!');
    await weldmsg(sword, two);
    assert.equal(drain(two), 'Your two-handed sword is welded to your hands!');
    assert.equal(sword.owornmask, W_WEP); // source restores the saved mask
});

test('cant_wield_corpse reads the source stone resistance even when blocked', async () => {
    const state = makeState();
    const corpse = object(state, CORPSE, { corpsenm: PM_COCKATRICE });
    // youprop.h Stone_resistance checks intrinsic/extrinsic without blocked.
    state.u.uprops[STONE_RES].intrinsic = 1;
    state.u.uprops[STONE_RES].blocked = 1;
    assert.equal(await cant_wield_corpse(corpse, state), false);
    assert.equal(state._pending_message, undefined);
    state.u.uprops[STONE_RES].intrinsic = 0;
    state.uarmg = {}; // C's first disjunct prevents unsafe bare-hand handling
    assert.equal(await cant_wield_corpse(corpse, state), false);
    state.uarmg = null;
    const urgentMessages = [];
    await assert.rejects(cant_wield_corpse(corpse, state, {
        planning: true,
        message: async line => urgentMessages.push(line),
    }), error => {
        assert.ok(error instanceof HeroDeathPlanningError);
        assert.equal(error.how, STONING);
        assert.equal(error.killerFormat, KILLED_BY);
        assert.match(error.killerName, /^wielding .* bare-handed$/u);
        return true;
    });
    assert.equal(drain(state), 'You wield the cockatrice corpse in your bare hands.');
    assert.deepEqual(urgentMessages, ['You turn to stone...']);
    assert.equal(state.killer.format, KILLED_BY);
    assert.equal(state.uwep, null); // ready_weapon does not install unsafe corpse
});
