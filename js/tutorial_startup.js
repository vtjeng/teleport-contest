// tutorial_startup.js -- Tutorial query at the new-game command boundary.
// C refs: options.c ask_do_tutorial() and allmain.c maybe_do_tutorial().

import { PICK_ONE } from './const.js';
import { find_level } from './dungeon.js';
import { game } from './gstate.js';
import { menuTitleStyle, selectTtyMenu } from './tty_menu.js';
import { dismissPendingTtyMessage } from './tty_message.js';

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

export class TutorialTransitionNotImplementedError extends Error {
    constructor(target) {
        super(
            'tutorial selected; the tut-1 special-level transition is not implemented',
        );
        this.name = 'TutorialTransitionNotImplementedError';
        this.target = target;
    }
}
