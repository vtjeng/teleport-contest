// tutorial_startup.js -- Tutorial query at the new-game command boundary.
// C refs: options.c ask_do_tutorial() and allmain.c maybe_do_tutorial().

import { LR_DOWNTELE, PICK_ONE } from './const.js';
import { find_level } from './dungeon.js';
import { bot, docrt, flush_screen } from './display.js';
import { read_engr_at } from './engrave.js';
import { game } from './gstate.js';
import {
    freeinv,
    INVLET_BASIC,
    update_inventory,
} from './invent.js';
import { mklev, place_lregion } from './mklev.js';
import { objectGenerationHooks } from './object_generation.js';
import { menuTitleStyle, selectTtyMenu } from './tty_menu.js';
import {
    dismissPendingTtyMessage,
    ttyPline,
} from './tty_message.js';
import { loadTutorialLevel } from './tutorial_level.js';
import { vision_recalc, vision_reset } from './vision.js';
import { setnotworn } from './worn.js';

const REPROMPT = Symbol('tutorial menu needs an explicit choice');

function configFileLabel(configFileName) {
    if (!configFileName || configFileName === '/dev/null')
        return 'your configuration file';
    const components = String(configFileName).split(/[\\/]/u);
    return components.at(-1) || 'your configuration file';
}

export function buildTutorialMenuSpec(
    state = game,
    repeated = false,
    configFileName = state.configFileName ?? '.nethackrc',
) {
    return {
        title: 'Do you want a tutorial?',
        ...menuTitleStyle(state),
        items: [
            {
                selector: 'y',
                label: 'Yes, do a tutorial',
                value: true,
            },
            {
                selector: 'n',
                label: 'No, just start play',
                value: false,
            },
            { text: '' },
            {
                text: `Put "OPTIONS=!tutorial" in ${
                    configFileLabel(configFileName)
                } to skip this query.`,
            },
            ...(repeated
                ? [{ text: "(Please choose 'y' or 'n'.)" }]
                : []),
        ],
        how: PICK_ONE,
        // select_menu(PICK_ONE) returns zero for Space or Return when no
        // entry is selected.  ask_do_tutorial() then destroys and rebuilds
        // the menu with its extra diagnostic line.
        preselected: REPROMPT,
        cancelValue: false,
        overlay: state.iflags?.menu_overlay !== false,
    };
}

// C ref: options.c ask_do_tutorial().  A config setting, whether true or
// false, suppresses the query.  The default true value alone does not.
export async function ask_do_tutorial(state = game) {
    if (state.tutorial_set_in_config)
        return Boolean(state.flags?.tutorial);

    await dismissPendingTtyMessage(state);
    let repeated = false;
    for (;;) {
        const answer = await selectTtyMenu(
            state,
            buildTutorialMenuSpec(state, repeated),
        );
        if (answer !== REPROMPT) return answer === true;
        repeated = true;
    }
}

// This is the source boundary immediately before assign_level(&u.ucamefrom,
// &u.uz), schedule_goto(), and deferred_goto().  The transition itself needs
// the complete tutorial special-level loader and is deliberately left to its
// owning subsystem rather than approximated with the ordinary dungeon level.
export async function maybe_do_tutorial(state = game) {
    const specialLevel = find_level('tut-1', state);
    if (!specialLevel) {
        return { action: 'skip', reason: 'level-unavailable' };
    }
    if (!await ask_do_tutorial(state)) {
        return { action: 'skip', reason: 'declined' };
    }
    return {
        action: 'enter',
        level: { ...specialLevel.dlevel },
        proto: specialLevel.proto,
    };
}

function tutorialInventoryHooks() {
    return objectGenerationHooks({
        // New-game inventory cannot have an active doff operation. The old
        // level's monster visibility state is discarded by goto_level().
        cancelDoff() {},
        monsterUnseesProperty() {},
        // Permanent-inventory rendering is a window-port concern. Supplying
        // its live hook preserves update_inventory()'s source boundary while
        // the subsequent full redraw owns the gameplay terminal.
        updateInventory() {},
    });
}

function zeroSpellbook(spellbook) {
    return spellbook.map((spell) => Object.fromEntries(
        Object.keys(spell ?? {}).map((field) => [field, 0]),
    ));
}

// C ref: nhlua.c nhl_gamestate(FALSE), reached from nhlib.lua
// tutorial_enter(). Inventory order and its temporary owornmask marker are
// intentionally preserved for a future source-shaped tutorial exit.
export function save_tutorial_gamestate(state = game) {
    if (state.gmst_stored)
        throw new Error('tutorial game state is already stored');

    const hooks = tutorialInventoryHooks();
    state.gmst_moves = state.moves;
    state.gmst_invent = null;
    while (state.invent) {
        const obj = state.invent;
        const wornmask = obj.owornmask;
        setnotworn(obj, { state, hooks });
        freeinv(obj, { state, hooks });
        obj.owornmask = wornmask;
        obj.nobj = state.gmst_invent;
        state.gmst_invent = obj;
    }
    state.lastinvnr = INVLET_BASIC - 1;
    state.gmst_ubak = structuredClone(state.u);
    state.gmst_disco = structuredClone(state.svd?.disco ?? []);
    state.gmst_mvitals = structuredClone(
        state.svm?.mvitals ?? state.mvitals ?? [],
    );
    const spellbook = state.svs?.spl_book ?? [];
    state.gmst_spl_book = structuredClone(spellbook);
    state.svs ??= {};
    state.svs.spl_book = zeroSpellbook(spellbook);
    state.gmst_stored = true;
    update_inventory({ state, hooks });
    return state;
}

// C refs: allmain.c maybe_do_tutorial(), do.c goto_level(), and
// nhlib.lua tutorial_enter(). This is intentionally limited to the new-game
// transition into tut-1 and stops at the ordinary first-command boundary.
export async function enter_tutorial(target, state = game) {
    if (target?.proto !== 'tut-1')
        throw new Error(`unsupported tutorial level ${target?.proto ?? ''}`);

    const oldLevel = { ...state.u.uz };
    state.u.ucamefrom = { ...oldLevel };
    state.iflags ??= {};
    state.iflags.nofollowers = true;
    try {
        // deferred_goto() emits its pre-message before tutorial(TRUE).
        await ttyPline('Entering the tutorial.', state);
        state.tutorialCallbacks = {
            cmd_before: true,
            end_turn: true,
        };
        save_tutorial_gamestate(state);

        state.u.uz0 = { ...oldLevel };
        state.u.uz = { ...target.level };
        state.u.utolev = { ...target.level };
        state.u.utotype = 0;
        state.updest = {};
        state.dndest = {};
        await mklev({ specialLevelLoader: loadTutorialLevel });

        // goto_level() postpones the new map flush until the pending arrival
        // message has passed through tty More on the old physical screen.
        vision_reset();
        state.vision_full_recalc = 0;
        const destination = state.dndest;
        place_lregion(
            destination.lx,
            destination.ly,
            destination.hx,
            destination.hy,
            destination.nlx,
            destination.nly,
            destination.nhx,
            destination.nhy,
            LR_DOWNTELE,
            null,
        );
        await dismissPendingTtyMessage(state);

        vision_reset();
        vision_recalc(0);
        await docrt();
        state.u.uz0 = { ...state.u.uz };
        await read_engr_at(state.u.ux, state.u.uy, state, {
            pline: ttyPline,
            // A newly created hero entering tut-1 is neither swallowed nor
            // levitating and can reach the engraving underfoot.
            canReachFloor: () => true,
        });

        // maybe_do_tutorial() performs one final redraw after deferred_goto;
        // that redraw first resolves pickup()'s pending engraving text.
        await dismissPendingTtyMessage(state);
        vision_recalc(0);
        await docrt();
        await bot();
        await flush_screen(1);
    } finally {
        state.iflags.nofollowers = false;
    }
    return state;
}
