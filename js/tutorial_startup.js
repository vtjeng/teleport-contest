// tutorial_startup.js -- Tutorial query at the new-game command boundary.
// C refs: options.c ask_do_tutorial() and allmain.c maybe_do_tutorial().

import { get_configfile } from './cfgfiles.js';
import { PICK_ONE, UTOTYPE_NONE } from './const.js';
import { assign_level, find_level } from './dungeon.js';
import { nh_basename } from './files.js';
import { docrt } from './display.js';
import { deferred_goto, schedule_goto } from './do.js';
import { game } from './gstate.js';
import { menuTitleStyle } from './tty_menu.js';
import { select_menu } from './windows.js';
import { vision_recalc } from './vision.js';

const REPROMPT = Symbol('tutorial menu needs an explicit choice');

// C ref: options.c ask_do_tutorial()'s buf, which reads the one configuration
// path get_configfile() owns: nh_basename(..., TRUE) for the label and an
// unabbreviated comparison against "/dev/null" for the fallback.
function configFileLabel(state) {
    const configfile = get_configfile(state);
    const rc = nh_basename(configfile, true);
    if (!rc || configfile === '/dev/null') return 'your configuration file';
    return rc;
}

export function buildTutorialMenuSpec(state = game, repeated = false) {
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
                    configFileLabel(state)
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

    let repeated = false;
    for (;;) {
        const answer = await select_menu(
            state,
            buildTutorialMenuSpec(state, repeated),
        );
        if (answer !== REPROMPT) return answer === true;
        repeated = true;
    }
}


// C ref: allmain.c maybe_do_tutorial(). do.c goto_level() makes tut-1,
// runs nhlua.c tutorial(TRUE), and reads the arrival engraving through
// pickup(1); the final docrt()'s cls() resolves that message.
export async function maybe_do_tutorial(state = game) {
    const sp = find_level('tut-1', state);
    if (!sp) return;

    if (await ask_do_tutorial(state)) {
        assign_level(state.u.ucamefrom, state.u.uz);
        state.iflags ??= {};
        state.iflags.nofollowers = true;
        schedule_goto(sp.dlevel, UTOTYPE_NONE, 'Entering the tutorial.',
            null, state);
        await deferred_goto(state);
        vision_recalc(0, { state });
        await docrt();
        state.iflags.nofollowers = false;
    }
}
