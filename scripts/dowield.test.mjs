// wield.c dowield(), wield_ok(), finish_splitting(), and the arti_speak()
// early return. Every expected value comes from the C source and is cited at
// the assertion that uses it.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CQ_CANNED,
    ECMD_CANCEL,
    ECMD_FAIL,
    ECMD_OK,
    ECMD_TIME,
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_SUGGEST,
    LAST_PROP,
    HANDS_SYM,
    OBJ_INVENT,
    RIGHT_HANDED,
    W_ARM,
    W_SWAPWEP,
    W_WEP,
} from '../js/const.js';
import {
    cmdq_add_ec,
    cmdq_add_key,
    cmdq_peek,
    extcmdRow,
} from '../js/cmd.js';
import {
    arti_speak,
    init_artifacts,
    SPFX_SPEAK,
} from '../js/artifacts.js';
import {
    PM_SAMURAI,
    PM_YELLOW_LIGHT,
    monst_globals_init,
} from '../js/monsters.js';
import {
    ARROW,
    BOW,
    CLUB,
    DAGGER,
    FOOD_RATION,
    GOLD_PIECE,
    KATANA,
    SILVER_SABER,
    SLING,
    objects_globals_init,
} from '../js/objects.js';
import {
    dowield,
    ready_ok,
} from '../js/wield.js';
import { GameDisplay } from '../js/game_display.js';
import { init_objects } from '../js/o_init.js';
import { newObject } from '../js/obj.js';
import { getobj, hands_obj } from '../js/invent.js';
import { aligns, races, roles } from '../js/roles.js';

// roles.js keeps role.c's order; the Samurai sits at :461.
const ROLE_SAMURAI = 9;

function makeState() {
    const state = {
        invent: null,
        uwep: null,
        uswapwep: null,
        uquiver: null,
        uarms: null,
        uarmg: null,
        flags: { verbose: true, invlet_constant: true, pushweapon: false },
        iflags: { cbreak: true },
        disp: {},
        multi: 0,
        context: {},
        unweapon: false,
        urole: roles[ROLE_SAMURAI],
        u: {
            twoweap: false,
            acurr: { a: [] },
            umonnum: PM_SAMURAI,
            umonster: PM_SAMURAI,
            uprops: Array.from(
                { length: LAST_PROP + 1 },
                () => ({ intrinsic: 0, extrinsic: 0, blocked: 0 }),
            ),
            uroleplay: {},
            uhandedness: RIGHT_HANDED,
        },
    };
    monst_globals_init(state);
    objects_globals_init(state);
    init_objects(state, () => 0);
    state.youmonst = { data: state.mons[PM_SAMURAI] };
    return state;
}

function withDisplay(state, keys = ' '.repeat(8)) {
    const display = new GameDisplay(null);
    let index = 0;
    display.readKey = async () => keys.charCodeAt(index++ % keys.length);
    state.nhDisplay = display;
    state.program_state ??= {};
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

function drain(state) {
    const line = state._pending_message;
    delete state._pending_message;
    return line;
}

// Hook the object prompt to answer a specific inventory letter. dowield()
// calls getobj('wield', ...), which prompts "What do you want to wield?"
// and waits for a key; feeding it an inventory letter selects that item.
function withPromptAnswer(state, letter) {
    const display = state.nhDisplay;
    const original = display.readKey;
    let promptSeen = false;
    display.readKey = async () => {
        if (!promptSeen) {
            promptSeen = true;
            return letter.charCodeAt(0);
        }
        return original();
    };
    return state;
}

// Put an item in inventory so getobj() can find it by invlet.
function addToInventory(state, item) {
    item.nobj = state.invent;
    state.invent = item;
}

// ── wield_ok ──

// wield_ok is not exported (it's a staticfn callback), so test it indirectly
// through dowield()'s getobj prompt. The prompt letters reflect wield_ok's
// answers: suggested items appear in the [brackets], excluded items do not.

test('ready_ok classifies every source family used by the quiver prompt',
    () => {
        const state = makeState();
        const arrow = object(state, ARROW);
        const bow = object(state, BOW);
        const dagger = object(state, DAGGER);

        assert.equal(ready_ok(null, state), GETOBJ_DOWNPLAY,
            'empty hands are downplayed while the quiver is already empty');
        state.uquiver = arrow;
        assert.equal(ready_ok(null, state), GETOBJ_SUGGEST,
            'empty hands are suggested when they would clear the quiver');

        state.uwep = dagger;
        assert.equal(ready_ok(dagger, state), GETOBJ_DOWNPLAY,
            'one wielded dagger is downplayed');
        dagger.quan = 2;
        assert.equal(ready_ok(dagger, state), GETOBJ_SUGGEST,
            'a two-dagger wielded stack can be split');

        const secondary = object(state, DAGGER);
        state.uwep = null;
        state.uswapwep = secondary;
        state.u.twoweap = true;
        assert.equal(ready_ok(secondary, state), GETOBJ_DOWNPLAY,
            'one actively wielded secondary dagger is downplayed');
        secondary.quan = 2;
        assert.equal(ready_ok(secondary, state), GETOBJ_SUGGEST,
            'an active secondary stack can be split');
        secondary.quan = 1;
        state.u.twoweap = false;
        assert.equal(ready_ok(secondary, state), GETOBJ_SUGGEST,
            'an inactive secondary weapon is an ordinary suggested weapon');

        state.uwep = bow;
        state.uswapwep = null;
        assert.equal(ready_ok(arrow, state), GETOBJ_SUGGEST,
            'an arrow matching the wielded bow is suggested');
        state.uwep = dagger;
        assert.equal(ready_ok(arrow, state), GETOBJ_DOWNPLAY,
            'ammunition without a matching launcher is downplayed');
        assert.equal(ready_ok(bow, state), GETOBJ_DOWNPLAY,
            'a launcher is downplayed');
        state.uswapwep = bow;
        assert.equal(ready_ok(arrow, state), GETOBJ_SUGGEST,
            'ammunition matching only the alternate launcher is suggested');
        state.uswapwep = null;
        state.uwep = null;
        assert.equal(ready_ok(dagger, state), GETOBJ_SUGGEST,
            'an unwielded weapon is suggested');
        assert.equal(
            ready_ok(object(state, GOLD_PIECE), state),
            GETOBJ_SUGGEST,
            'coins are suggested',
        );
        assert.equal(
            ready_ok(object(state, FOOD_RATION), state),
            GETOBJ_DOWNPLAY,
            'an ordinary nonweapon is downplayed',
        );
    });

// ── arti_speak ──

// init_artifacts needs role, race, and alignment state so hack_artifacts()
// can reassign quest-artifact ownership.
function makeArtifactState() {
    const state = makeState();
    const neutralIndex = aligns.findIndex((a) => a.name === 'neutral');
    state.flags.initalign = neutralIndex;
    state.urace = { ...races.find((r) => r.noun === 'human') };
    init_artifacts(state);
    return state;
}

test('arti_speak() returns ECMD_OK for a non-speaking artifact', () => {
    // artifact.c:2286 checks SPFX_SPEAK; Grayswandir has SPFX_RESTR |
    // SPFX_HALRES and no SPFX_SPEAK, so the function returns ECMD_OK
    // without printing or spending a turn.
    const state = makeArtifactState();
    // Find Grayswandir's index in the artilist: SPFX_HALRES without
    // SPFX_SPEAK, so arti_speak returns ECMD_OK.
    const grayIndex = state.artilist.findIndex(
        (a) => a && a.name === 'Grayswandir',
    );
    assert.ok(grayIndex > 0, 'Grayswandir should be in the artilist');
    const saber = object(state, SILVER_SABER, { oartifact: grayIndex });
    assert.equal(arti_speak(saber, state), ECMD_OK);
});

test('arti_speak() stops for a speaking artifact', () => {
    // artifact.c:2289-2295: a speaking artifact (Sting/Orcrist, both
    // SPFX_SPEAK) reads getrumor() and verbalize1(), neither of which is
    // ported.
    const state = makeArtifactState();
    // Find an artifact with SPFX_SPEAK.
    const stingIndex = state.artilist.findIndex(
        (a) => a && (a.spfx & SPFX_SPEAK),
    );
    assert.ok(stingIndex > 0, 'there should be a speaking artifact');
    // Create a dummy object with that artifact index.
    const sting = object(state, state.artilist[stingIndex].otyp,
        { oartifact: stingIndex });
    assert.throws(
        () => arti_speak(sting, state),
        /speaking artifact/u,
    );
});

// ── dowield ──

test('queued getobj preserves the hands/self answer', async () => {
    const state = withDisplay(makeState());

    for (const suitability of [GETOBJ_SUGGEST, GETOBJ_DOWNPLAY]) {
        // invent.c:1792-1797 accepts exactly the likely and downplayed
        // classifications for HANDS_SYM and returns &hands_obj.
        cmdq_add_key(CQ_CANNED, HANDS_SYM, state);
        assert.equal(
            await getobj('wield', (selected) => {
                assert.equal(selected, null);
                return suitability;
            }, 0, state),
            hands_obj,
        );
    }

    // GETOBJ_EXCLUDE is one step outside the accepted pair. C clears the
    // remaining canned sequence and returns NULL instead of the sentinel.
    cmdq_add_key(CQ_CANNED, HANDS_SYM, state);
    cmdq_add_ec(CQ_CANNED, extcmdRow('wait'), state);
    assert.equal(await getobj(
        'drop', () => GETOBJ_EXCLUDE, 0, state,
    ), null);
    assert.equal(cmdq_peek(CQ_CANNED, state), null);
});

test('dowield() wields an inventory weapon on the simple path', async () => {
    // wield.c:354-457. The simple path: hero types w, getobj prompts, hero
    // answers with an inventory letter, no welding, no quiver, no split, no
    // worn armor conflict. ready_weapon() sets uwep and answers ECMD_TIME
    // (wield.c:195).
    const state = withDisplay(makeState());
    const katana = object(state, KATANA, { invlet: 'a', spe: 0, known: 1 });
    addToInventory(state, katana);
    withPromptAnswer(state, 'a');
    assert.equal(await dowield(state), ECMD_TIME);
    assert.equal(state.uwep, katana);
    assert.equal(katana.owornmask & W_WEP, W_WEP);
});

test('dowield() returns ECMD_CANCEL when the prompt is escaped', async () => {
    // wield.c:374-376. Escape at the prompt returns ECMD_CANCEL, cost-free.
    const state = withDisplay(makeState());
    const katana = object(state, KATANA, { invlet: 'a' });
    addToInventory(state, katana);
    withPromptAnswer(state, '\x1b'); // ESC
    assert.equal(await dowield(state), ECMD_CANCEL);
    assert.equal(state.uwep, null);
});

test('dowield() unwields the primary weapon from a queued hands answer',
    async () => {
        // wield.c:403-406 converts &hands_obj to NULL after the cancellation
        // check. ready_weapon(NULL) then empties the primary slot and spends
        // one turn because the hero began armed (wield.c:174-180).
        const state = withDisplay(makeState());
        const katana = object(state, KATANA,
            { invlet: 'a', owornmask: W_WEP });
        addToInventory(state, katana);
        state.uwep = katana;
        cmdq_add_key(CQ_CANNED, HANDS_SYM, state);

        assert.equal(await dowield(state), ECMD_TIME);
        assert.equal(state.uwep, null);
        assert.equal(katana.owornmask & W_WEP, 0);
        assert.equal(drain(state), 'You are bare handed.');
    });

test('dowield() refuses with ECMD_FAIL when already wielding that item',
    async () => {
        // wield.c:376-381. "You are already wielding that!" and ECMD_FAIL.
        const state = withDisplay(makeState());
        const katana = object(state, KATANA,
            { invlet: 'a', owornmask: W_WEP });
        addToInventory(state, katana);
        state.uwep = katana;
        withPromptAnswer(state, 'a');
        assert.equal(await dowield(state), ECMD_FAIL);
        assert.equal(drain(state), 'You are already wielding that!');
        assert.equal(state.uwep, katana);
    });

test('dowield() refuses wielding worn armor', async () => {
    // wield.c:443-445. "You cannot wield that!" for armor, accessories and
    // saddles.
    const state = withDisplay(makeState());
    const armor = object(state, KATANA,
        { invlet: 'a', owornmask: W_ARM });
    addToInventory(state, armor);
    withPromptAnswer(state, 'a');
    assert.equal(await dowield(state), ECMD_FAIL);
    assert.equal(drain(state), 'You cannot wield that!');
});

test("dowield() refuses when the hero's form can't wield", async () => {
    // wield.c:363-366. cantwield() is nohands() || verysmall(). A yellow
    // light (M1_NOHANDS) cannot wield.
    const state = withDisplay(makeState());
    state.youmonst = { data: state.mons[PM_YELLOW_LIGHT] };
    assert.equal(await dowield(state), ECMD_FAIL);
    assert.equal(drain(state), "Don't be ridiculous!");
});

test('dowield() zeroes multi', async () => {
    // wield.c:363 assigns gm.multi = 0. The same logic as doswapweapon:
    // assignment rather than nomul() to avoid clearing CQ_CANNED.
    const state = withDisplay(makeState());
    state.multi = 5;
    state.youmonst = { data: state.mons[PM_YELLOW_LIGHT] };
    await dowield(state);
    assert.equal(state.multi, 0);
});

test('dowield() pushes old weapon to swap slot with pushweapon', async () => {
    // wield.c:452-453. When flags.pushweapon is true, the old uwep goes into
    // uswapwep after a successful wield.
    const state = withDisplay(makeState());
    state.flags.pushweapon = true;
    const club = object(state, CLUB,
        { invlet: 'a', spe: 0, known: 1, owornmask: W_WEP });
    const sling = object(state, SLING,
        { invlet: 'b', spe: 0, known: 1 });
    addToInventory(state, sling);
    addToInventory(state, club);
    state.uwep = club;
    withPromptAnswer(state, 'b');
    assert.equal(await dowield(state), ECMD_TIME);
    assert.equal(state.uwep, sling);
    assert.equal(state.uswapwep, club);
});

test('dowield() dispatches to doswapweapon when wep is uswapwep', async () => {
    // wield.c:407-408. Choosing the secondary weapon redirects to
    // doswapweapon(), which swaps both slots.
    const state = withDisplay(makeState());
    const katana = object(state, KATANA,
        { invlet: 'a', spe: 0, known: 1, owornmask: W_WEP });
    const club = object(state, CLUB,
        { invlet: 'b', spe: 0, known: 1, owornmask: W_SWAPWEP });
    addToInventory(state, club);
    addToInventory(state, katana);
    state.uwep = katana;
    state.uswapwep = club;
    withPromptAnswer(state, 'b');
    assert.equal(await dowield(state), ECMD_TIME);
    // doswapweapon() swaps the two slots.
    assert.equal(state.uwep, club);
    assert.equal(state.uswapwep, katana);
});
