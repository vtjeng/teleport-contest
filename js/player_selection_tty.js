// player_selection_tty.js -- TTY adapter for role.c:genl_player_setup().
// C refs: src/role.c plsel_startmenu(), setup_*menu(), role_menu_extra(),
// maybe_skip_seps(), and the confirmation loop; win/tty/topl.c yn_function().

import { game } from './gstate.js';
import { truncateByteString, ucase, lcase } from './hacklib.js';
import { ttyPline } from './tty_message.js';
import {
    answer_initial_player_selection,
    answer_player_selection_confirmation,
    continue_player_selection,
    prepare_player_selection,
    resume_player_selection_after_rename,
    RS_ALIGNMENT,
    RS_GENDER,
    RS_RACE,
    RS_ROLE,
} from './player_selection.js';
import {
    ok_align,
    ok_gend,
    ok_race,
    ok_role,
    plnamesuffix,
    rigid_role_checks,
} from './role_init.js';
import {
    MH_HUMAN,
    ROLE_ALIGNS,
    ROLE_ALIGNMASK,
    ROLE_FEMALE,
    ROLE_GENDERS,
    ROLE_GENDMASK,
    ROLE_MALE,
    ROLE_NONE,
    ROLE_RACEMASK,
    aligns,
    genders,
    races,
    roles,
} from './roles.js';
import {
    menuTitleStyle,
    resetRoleFilteringTty,
} from './tty_menu.js';
import { tty_yn_function } from './topl.js';
import { select_menu } from './windows.js';

const ASPECT_TITLE = Object.freeze({
    [RS_ROLE]: 'Pick a role or profession',
    [RS_RACE]: 'Pick a race or species',
    [RS_GENDER]: 'Pick a gender or sex',
    [RS_ALIGNMENT]: 'Pick an alignment or creed',
});

const ASPECT_SELECTOR = Object.freeze({
    [RS_ROLE]: '?',
    [RS_RACE]: '/',
    [RS_GENDER]: '"',
    [RS_ALIGNMENT]: '[',
});

function selectionFilter(state) {
    return state.roleFilter ?? state.rfilter ?? {};
}

// C ref: role.c gotrolefilter(); js/tty_menu.js holds a second copy.
function gotRoleFilter(state) {
    const filter = selectionFilter(state);
    return Boolean(filter.mask || filter.roles?.some(Boolean));
}

// role.c plsel_startmenu() builds both header forms with "%.20s", whose
// precision counts bytes.  Four of the five fields come from the compiled-in
// role, race, gender and alignment tables and are ASCII, but options.c
// nmcpy() lets svp.plname reach 31 bytes, so a name of 21 bytes or more is
// cut here even when it holds 20 characters or fewer.
function clipComponent(value) {
    return truncateByteString(String(value), 20);
}

function selectionHeader(state) {
    const { flags } = state;
    const rolename = flags.initrole < 0 ? '<role>'
        : flags.initgend === 1 && roles[flags.initrole].name.f
            ? roles[flags.initrole].name.f : roles[flags.initrole].name.m;
    if (!state.plname || flags.initrole < 0 || flags.initrace < 0
        || flags.initgend < 0 || flags.initalign < 0) {
        return [
            rolename,
            flags.initrace < 0 ? '<race>' : races[flags.initrace].noun,
            flags.initgend < 0 ? '<gender>' : genders[flags.initgend].adj,
            flags.initalign < 0
                ? '<alignment>' : aligns[flags.initalign].adj,
        ].map(clipComponent).join(' ');
    }
    return `${clipComponent(state.plname)} the ${[
        aligns[flags.initalign].adj,
        genders[flags.initgend].adj,
        races[flags.initrace].adj,
        rolename,
    ].map(clipComponent).join(' ')}`;
}

function indefiniteArticle(text) {
    return /^[aeiouAEIOU]/u.test(text) ? `an ${text}` : `a ${text}`;
}

// C ref: role.c setup_rolemenu(), its filtering arm; js/tty_menu.js
// roleFilterItems() holds the other arm.
function roleCandidates(state) {
    const { flags } = state;
    const filter = selectionFilter(state);
    const candidates = [];
    let lastSelector = '';
    for (let index = 0; index < roles.length; index++) {
        if (!(ok_role(index, flags.initrace, flags.initgend,
            flags.initalign, filter)
            && ok_race(index, flags.initrace, flags.initgend,
                flags.initalign, filter)
            && ok_gend(index, flags.initrace, flags.initgend,
                flags.initalign, filter)
            && ok_align(index, flags.initrace, flags.initgend,
                flags.initalign, filter))) continue;

        let selector = lcase(roles[index].name.m[0]);
        if (selector === lastSelector) selector = ucase(selector);
        let name = roles[index].name.m;
        if (roles[index].name.f) {
            if (flags.initgend === 1) name = roles[index].name.f;
            else if (flags.initgend < 0)
                name = `${name}/${roles[index].name.f}`;
        }
        candidates.push({
            selector,
            label: indefiniteArticle(name),
            value: index,
        });
        lastSelector = selector;
    }
    return candidates;
}

// C ref: role.c setup_racemenu(), its filtering arm; js/tty_menu.js
// raceFilterItems() holds the other arm.
function raceCandidates(state) {
    const { flags } = state;
    const filter = selectionFilter(state);
    const candidates = [];
    for (let index = 0; index < races.length; index++) {
        if (ok_race(flags.initrole, index, flags.initgend,
            flags.initalign, filter)
            && ok_role(flags.initrole, index, flags.initgend,
                flags.initalign, filter)
            && ok_align(flags.initrole, index, flags.initgend,
                flags.initalign, filter)) {
            candidates.push({
                selector: races[index].noun[0],
                groupSelector: ucase(races[index].noun[0]),
                label: races[index].noun,
                value: index,
            });
        }
    }
    return candidates;
}

// C ref: role.c setup_gendmenu(), its filtering arm; js/tty_menu.js
// genderFilterItems() holds the other arm.
function genderCandidates(state) {
    const { flags } = state;
    const filter = selectionFilter(state);
    const candidates = [];
    for (let index = 0; index < ROLE_GENDERS; index++) {
        if (ok_gend(flags.initrole, flags.initrace, index,
            flags.initalign, filter)
            && ok_role(flags.initrole, flags.initrace, index,
                flags.initalign, filter)
            && ok_race(flags.initrole, flags.initrace, index,
                flags.initalign, filter)) {
            candidates.push({
                selector: genders[index].adj[0],
                groupSelector: ucase(genders[index].adj[0]),
                label: genders[index].adj,
                value: index,
            });
        }
    }
    return candidates;
}

// C ref: role.c setup_algnmenu(), its filtering arm; js/tty_menu.js
// alignmentFilterItems() holds the other arm.
function alignmentCandidates(state) {
    const { flags } = state;
    const filter = selectionFilter(state);
    const candidates = [];
    for (let index = 0; index < ROLE_ALIGNS; index++) {
        if (ok_align(flags.initrole, flags.initrace, flags.initgend,
            index, filter)
            && ok_role(flags.initrole, flags.initrace, flags.initgend,
                index, filter)
            && ok_race(flags.initrole, flags.initrace, flags.initgend,
                index, filter)) {
            candidates.push({
                selector: aligns[index].adj[0],
                groupSelector: ucase(aligns[index].adj[0]),
                label: aligns[index].adj,
                value: index,
            });
        }
    }
    return candidates;
}

function candidatesForAspect(state, aspect) {
    if (aspect === RS_ROLE) return roleCandidates(state);
    if (aspect === RS_RACE) return raceCandidates(state);
    if (aspect === RS_GENDER) return genderCandidates(state);
    if (aspect === RS_ALIGNMENT) return alignmentCandidates(state);
    throw new RangeError(`unknown player-selection aspect '${aspect}'`);
}

function onlyMaskChoice(mask, table) {
    for (let index = 0; index < table.length; index++) {
        if (mask === table[index].allow) return index;
    }
    return ROLE_NONE;
}

// C ref: role.c role_menu_extra().  A forced alternate facet is shown as
// padded, nonselectable text rather than as a menu choice.
function aspectExtra(state, aspect) {
    const { flags } = state;
    const filter = selectionFilter(state);
    let current;
    let constrainer = '';
    let forcedValue = '';

    if (aspect === RS_ROLE) {
        current = flags.initrole;
        const onlyRole = roles.every((_, index) => (
            index === current || filter.roles?.[index]
        ));
        if (onlyRole) {
            constrainer = 'filter';
            forcedValue = 'role';
        }
    } else if (aspect === RS_RACE) {
        current = flags.initrace;
        if (flags.initrole >= 0) {
            const allowMask = roles[flags.initrole].allow & ROLE_RACEMASK;
            if (allowMask === MH_HUMAN) {
                constrainer = 'role';
                forcedValue = races[0].noun;
            } else if (current >= 0
                && (allowMask & ~(filter.mask ?? 0))
                    === races[current].selfmask) {
                constrainer = 'filter';
                forcedValue = 'race';
            }
        }
    } else if (aspect === RS_GENDER) {
        current = flags.initgend;
        if (flags.initrole >= 0) {
            const allowMask = roles[flags.initrole].allow & ROLE_GENDMASK;
            let forced = ROLE_NONE;
            if (allowMask === ROLE_MALE) forced = 0;
            else if (allowMask === ROLE_FEMALE) forced = 1;
            if (forced >= 0) {
                constrainer = 'role';
                forcedValue = genders[forced].adj;
            } else if (current >= 0
                && (allowMask & ~(filter.mask ?? 0))
                    === genders[current].allow) {
                constrainer = 'filter';
                forcedValue = 'gender';
            }
        }
    } else if (aspect === RS_ALIGNMENT) {
        current = flags.initalign;
        let forced = ROLE_NONE;
        if (flags.initrole >= 0) {
            forced = onlyMaskChoice(
                roles[flags.initrole].allow & ROLE_ALIGNMASK,
                aligns,
            );
            if (forced >= 0) constrainer = 'role';
        }
        if (!constrainer && flags.initrace >= 0) {
            forced = onlyMaskChoice(
                races[flags.initrace].allow & ROLE_ALIGNMASK,
                aligns,
            );
            if (forced >= 0) constrainer = 'race';
        }
        if (!constrainer && current >= 0
            && (ROLE_ALIGNMASK & ~(filter.mask ?? 0))
                === aligns[current].allow) {
            constrainer = 'filter';
            forcedValue = 'alignment';
        }
        if (forced >= 0) forcedValue = aligns[forced].adj;
    } else {
        throw new RangeError(`unknown player-selection aspect '${aspect}'`);
    }

    if (constrainer) {
        return { line: `    ${constrainer} forces ${forcedValue}` };
    }
    const what = aspect === RS_ALIGNMENT ? 'alignment' : aspect;
    return {
        selector: ASPECT_SELECTOR[aspect],
        label: `Pick${current >= 0 ? ' another' : ''} ${what} first`,
        choice: { kind: 'jump', aspect },
    };
}

function addChoice(lines, choices, selector, label, choice, selected = false,
                   groupSelector = '') {
    lines.push(`${selector} ${selected ? '*' : '-'} ${label}`);
    choices.set(selector, choice);
    if (groupSelector) choices.set(groupSelector, choice);
}

function addAspectExtra(lines, choices, extra) {
    if (extra.line) lines.push(extra.line);
    else addChoice(
        lines, choices, extra.selector, extra.label, extra.choice,
    );
}

function roleMenuExcess(state, rows) {
    let lineCount = 4; // title+separator and header+separator
    lineCount += roleCandidates(state).length;
    lineCount += 2; // Random and separator
    lineCount += 5; // three facet jumps, filtering, and Quit
    lineCount += 1; // footer
    return rows > 0 && lineCount > rows ? lineCount - rows : 0;
}

function facetMenuSpec(state, context, random) {
    const aspect = context.aspect;
    const displayRows = state.nhDisplay?.rows ?? 24;
    // In the role case this count intentionally precedes plsel_startmenu()'s
    // rigid checks, matching maybe_skip_seps() in genl_player_setup().
    const excess = aspect === RS_ROLE
        ? roleMenuExcess(state, displayRows) : 0;
    rigid_role_checks(state, random);

    const lines = [selectionHeader(state)];
    if (excess !== 2) lines.push('');
    const choices = new Map();
    for (const candidate of candidatesForAspect(state, aspect)) {
        addChoice(
            lines,
            choices,
            candidate.selector,
            candidate.label,
            { kind: 'value', value: candidate.value },
            false,
            candidate.groupSelector,
        );
    }

    const randomChoice = { kind: 'random' };
    addChoice(lines, choices, '*', 'Random', randomChoice, true);
    if (aspect !== RS_ROLE || excess < 1 || excess > 2) lines.push('');

    for (const alternate of [
        RS_ROLE, RS_RACE, RS_GENDER, RS_ALIGNMENT,
    ]) {
        if (alternate !== aspect) {
            addAspectExtra(lines, choices, aspectExtra(state, alternate));
        }
    }
    addChoice(
        lines,
        choices,
        '~',
        `${gotRoleFilter(state) ? 'Reset' : 'Set'} role/race/&c filtering`,
        { kind: 'filter' },
    );
    const quitChoice = { kind: 'quit' };
    addChoice(lines, choices, 'q', 'Quit', quitChoice);

    return {
        title: ASPECT_TITLE[aspect],
        ...menuTitleStyle(state),
        lines,
        choices,
        preselected: randomChoice,
        // role.c: n == 0 (Random toggled off) is ROLE_RANDOM; ESC is
        // ROLE_NONE, quit.
        emptyValue: randomChoice,
        cancelValue: quitChoice,
    };
}

function confirmationMenuSpec(state) {
    const renameAllowed = Boolean(state.iflags?.renameallowed);
    const lines = [selectionHeader(state), ''];
    const choices = new Map();
    addChoice(lines, choices, 'y', 'Yes; start game', 'y', true);
    addChoice(lines, choices, 'n', 'No; choose role again', 'n');
    if (renameAllowed) {
        addChoice(
            lines,
            choices,
            'a',
            'Not yet; choose another name',
            'a',
        );
    }
    addChoice(lines, choices, 'q', 'Quit', 'q');
    return {
        title: `Is this ok? [yn${renameAllowed ? 'a' : ''}q]`,
        ...menuTitleStyle(state),
        lines,
        choices,
        preselected: 'y',
        // role.c: n == 0 (Yes toggled off) is choice 1, start the game;
        // ESC is -1, quit.
        emptyValue: 'y',
        cancelValue: 'q',
    };
}

export function buildPlayerSelectionMenuSpec(
    state,
    context,
    random,
) {
    if (context.status === 'menu')
        return facetMenuSpec(state, context, random);
    if (context.status === 'confirmation') {
        rigid_role_checks(state, random);
        return confirmationMenuSpec(state);
    }
    throw new Error(`selection status '${context.status}' has no tty menu`);
}

// role.c genl_player_setup() reports a pre-selected race, gender or
// alignment that no role (or other facet) satisfies with
// pline("Incompatible role!") and its three siblings (role.c:2302, 2383,
// 2471, 2559), at the moment the random pick fails.  The message window
// exists by then, so each goes through tty_putstr(WIN_MESSAGE) and
// update_topl(): the answered "Shall I pick ..." prompt enters the message
// history, consecutive diagnostics share the top line, and the line is left
// at TOPLINE_NEED_MORE for whatever follows -- the next menu's
// tty_display_nhwindow() runs more(), and a later pline() remembers it.
async function flushSelectionMessages(state, context, firstUnshown) {
    for (const message of context.messages.slice(firstUnshown))
        await ttyPline(message, state);
    return context.messages.length;
}

async function renamePlayer(state, context) {
    const saved = [
        state.flags.initrole,
        state.flags.initrace,
        state.flags.initgend,
        state.flags.initalign,
    ];
    state.iflags.renameinprogress = true; /* affects main() in unixmain.c */
    /* plnamesuffix() can change any or all of ROLE, RACE,
       GEND, ALGN; we'll override that and honor only the name */
    state.plname = '';
    await plnamesuffix(state); /* calls askname() when svp.plname[] is empty */
    [
        state.flags.initrole,
        state.flags.initrace,
        state.flags.initgend,
        state.flags.initalign,
    ] = saved;
    return resume_player_selection_after_rename(context);
}

/** C ref: win/tty/wintty.c tty_player_selection(). */
export async function ttyPlayerSelectionImpl(state = game, random) {
    state.program_state ??= {};
    state.program_state.in_role_selection =
        (state.program_state.in_role_selection ?? 0) + 1;
    let context = prepare_player_selection(state, random);
    let shownMessages = 0;
    try {
        for (;;) {
            if (context.status === 'prompt') {
                // role.c genl_player_setup() trims the prompt's trailing
                // space and asks with yn_function(prompt, NULL, '\0'), which
                // accepts any key; tty_yn_function() appends the space again
                // and writes the prompt through the message window, so a
                // prompt reaching the last column wraps as topl_putsym() does.
                const response = await tty_yn_function(
                    context.prompt.trim(), null, '\0', state,
                );
                context = answer_initial_player_selection(
                    state, context, response, random,
                );
            } else if (context.status === 'menu') {
                const spec = buildPlayerSelectionMenuSpec(
                    state, context, random,
                );
                shownMessages = await flushSelectionMessages(
                    state, context, shownMessages,
                );
                const choice = await select_menu(state, spec);
                if (choice?.kind === 'filter') {
                    const selected = await resetRoleFilteringTty(state);
                    context = continue_player_selection(
                        state,
                        context,
                        { kind: 'filter', selected },
                        random,
                    );
                } else {
                    context = continue_player_selection(
                        state, context, choice, random,
                    );
                }
            } else if (context.status === 'confirmation') {
                const spec = buildPlayerSelectionMenuSpec(
                    state, context, random,
                );
                shownMessages = await flushSelectionMessages(
                    state, context, shownMessages,
                );
                const response = await select_menu(state, spec);
                context = answer_player_selection_confirmation(
                    state, context, response, random,
                );
            } else if (context.status === 'rename') {
                context = await renamePlayer(state, context);
                // tty_askname() may have bailed out of the program.
                if (state.program_state?.gameover) return false;
            } else if (context.status === 'complete') {
                // Every facet was picked without a further menu
                // (answer 'a', or nothing left to confirm).
                await flushSelectionMessages(state, context, shownMessages);
                return true;
            } else if (context.status === 'quit') {
                return false;
            } else {
                throw new Error(
                    `unknown player-selection status '${context.status}'`,
                );
            }
        }
    } finally {
        state.program_state.in_role_selection--;
    }
}

// Compatibility re-export for callers that used the pre-port camel-case
// name. wintty.js owns the source-shaped entry point and calls the
// implementation directly.
export { tty_player_selection as ttyPlayerSelection } from './wintty.js';
