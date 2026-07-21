// player_selection.js -- Source-shaped character-selection core.
// C ref: src/role.c root_plselection_prompt(),
// build_plselection_prompt(), and the non-menu portions of
// genl_player_setup(). TTY menu construction and rendering are separate.

import { rn2 } from './rng.js';
import {
    PICK_RANDOM,
    ROLE_ALIGNS,
    ROLE_CHAOTIC,
    ROLE_FEMALE,
    ROLE_GENDERS,
    ROLE_LAWFUL,
    ROLE_MALE,
    ROLE_NEUTER,
    ROLE_NEUTRAL,
    ROLE_NONE,
    ROLE_RANDOM,
    aligns,
    genders,
    races,
    roles,
    validalign,
    validgend,
    validrace,
    validrole,
} from './roles.js';
import {
    normalizeCharacterFlags,
    ok_align,
    ok_gend,
    ok_race,
    pick_align,
    pick_gend,
    pick_race,
    pick_role,
    randalign,
    randgend,
    randrace,
    randrole,
    rigid_role_checks,
} from './role_init.js';

const BP_ALIGN = 'alignment';
const BP_GEND = 'gender';
const BP_RACE = 'race';
const BP_ROLE = 'role';

// String-valued counterparts of role.c's RS_* constants.  Keeping these
// explicit lets the tty adapter preserve genl_player_setup()'s nextpick
// transitions without coupling the selection core to menu rendering.
export const RS_ROLE = BP_ROLE;
export const RS_RACE = BP_RACE;
export const RS_GENDER = BP_GEND;
export const RS_ALIGNMENT = BP_ALIGN;

function selectionFilter(state) {
    return state.roleFilter ?? state.rfilter ?? {};
}

function roleGenderCount(rolenum) {
    if (!validrole(rolenum)) return 0;
    const allow = roles[rolenum].allow;
    return Number(Boolean(allow & ROLE_MALE))
        + Number(Boolean(allow & ROLE_FEMALE))
        + Number(Boolean(allow & ROLE_NEUTER));
}

function raceAlignmentCount(racenum) {
    if (!Number.isInteger(racenum) || racenum < 0
        || racenum >= races.length) return 0;
    const allow = races[racenum].allow;
    return Number(Boolean(allow & ROLE_CHAOTIC))
        + Number(Boolean(allow & ROLE_LAWFUL))
        + Number(Boolean(allow & ROLE_NEUTRAL));
}

function rootPromptParts(rolenum, racenum, gendnum, alignnum, filter) {
    const post = new Set();
    const words = [];
    const aligncount = raceAlignmentCount(racenum);
    let selectedAlign = alignnum;

    if (selectedAlign !== ROLE_NONE && selectedAlign !== ROLE_RANDOM
        && ok_align(rolenum, racenum, gendnum, selectedAlign, filter)) {
        words.push(aligns[selectedAlign].adj);
    } else {
        if (selectedAlign !== ROLE_RANDOM) selectedAlign = ROLE_NONE;
        if ((racenum !== ROLE_NONE && racenum !== ROLE_RANDOM
             && ok_race(rolenum, racenum, gendnum, selectedAlign, filter)
             && aligncount > 1)
            || racenum === ROLE_NONE || racenum === ROLE_RANDOM) {
            post.add(BP_ALIGN);
        }
    }

    const gendercount = roleGenderCount(rolenum);
    if (gendnum !== ROLE_NONE && gendnum !== ROLE_RANDOM) {
        if (validrole(rolenum)) {
            if (gendercount > 1 && !roles[rolenum].name.f)
                words.push(genders[gendnum].adj);
        } else {
            words.push(genders[gendnum].adj);
        }
    } else if ((validrole(rolenum) && gendercount > 1)
               || !validrole(rolenum)) {
        post.add(BP_GEND);
    }

    if (racenum !== ROLE_NONE && racenum !== ROLE_RANDOM) {
        if (validrole(rolenum)
            && ok_race(rolenum, racenum, gendnum, selectedAlign, filter)) {
            words.push(races[racenum].adj);
        } else if (!validrole(rolenum)) {
            words.push(races[racenum].noun);
        } else {
            post.add(BP_RACE);
        }
    } else {
        post.add(BP_RACE);
    }

    if (validrole(rolenum)) {
        const role = roles[rolenum];
        if (gendnum !== ROLE_NONE) {
            words.push(gendnum === 1 && role.name.f
                ? role.name.f : role.name.m);
        } else if (role.name.f) {
            words.push(`${role.name.m}/${role.name.f}`);
        } else {
            words.push(role.name.m);
        }
    } else if (rolenum === ROLE_NONE) {
        post.add(BP_ROLE);
    }

    if ((racenum === ROLE_NONE || racenum === ROLE_RANDOM)
        && !validrole(rolenum)) words.push('character');

    return { root: words.join(' '), post };
}

// C ref: hacklib.c s_suffix().
function possessive(text) {
    if (text.toLowerCase() === 'it') return `${text}s`;
    if (text.toLowerCase() === 'you') return `${text}r`;
    return text.endsWith('s') ? `${text}'` : `${text}'s`;
}

function appendPostAttributes(prompt, post) {
    const ordered = [BP_RACE, BP_ROLE, BP_GEND, BP_ALIGN]
        .filter((attribute) => post.has(attribute));
    if (!ordered.length) return prompt;
    if (ordered.length === 1) return `${prompt} ${ordered[0]}`;
    if (ordered.length === 2)
        return `${prompt} ${ordered[0]} and ${ordered[1]}`;
    return `${prompt} ${ordered.slice(0, -1).join(', ')} and ${ordered.at(-1)}`;
}

/**
 * Build role.c's root character description and omit the trailing facets.
 *
 * The C function also stores which facets must follow in process-global
 * scratch state. JavaScript callers receive only the source text; the paired
 * build_plselection_prompt() call recomputes its local scratch state.
 */
export function root_plselection_prompt(
    rolenum,
    racenum,
    gendnum,
    alignnum,
    filter = {},
) {
    return rootPromptParts(rolenum, racenum, gendnum, alignnum, filter).root;
}

/** C ref: src/role.c build_plselection_prompt(). */
export function build_plselection_prompt(
    rolenum,
    racenum,
    gendnum,
    alignnum,
    filter = {},
) {
    const { root, post } = rootPromptParts(
        rolenum, racenum, gendnum, alignnum, filter,
    );
    let prompt = `Shall I pick ${racenum !== ROLE_NONE || validrole(rolenum)
        ? 'your ' : 'a '}${root}`;
    prompt = prompt.replace('pick a character', 'pick character');
    prompt = possessive(prompt);

    // The source repairs this one awkward possessive after s_suffix().
    if (/priest\/priestess'$/iu.test(prompt)) prompt += 's';

    if (!post.size) {
        if (rolenum === ROLE_NONE) post.add(BP_ROLE);
        if (racenum === ROLE_NONE) post.add(BP_RACE);
        if (alignnum === ROLE_NONE) post.add(BP_ALIGN);
        if (gendnum === ROLE_NONE) post.add(BP_GEND);
    }
    prompt = appendPostAttributes(prompt, post);
    return `${prompt} for you? [ynaq] `;
}

function menuOutcome(context, aspect) {
    return { ...context, status: 'menu', aspect };
}

function finalOutcome(state, context) {
    const confirmation = context.picksomething
        && context.pick4u !== 'a'
        && !state.flags.randomall;
    return {
        ...context,
        status: confirmation ? 'confirmation' : 'complete',
    };
}

function manualCandidates(count, predicate) {
    const candidates = [];
    for (let i = 0; i < count; ++i)
        if (predicate(i)) candidates.push(i);
    return candidates;
}

function nextAspect(aspect, flags) {
    if (aspect === BP_ROLE) return BP_RACE;
    if (aspect === BP_RACE)
        return flags.initrole < 0 ? BP_ROLE : BP_GEND;
    if (aspect === BP_GEND) {
        return flags.initrole < 0 ? BP_ROLE
            : flags.initrace < 0 ? BP_RACE : BP_ALIGN;
    }
    return flags.initrole < 0 ? BP_ROLE
        : flags.initrace < 0 ? BP_RACE : BP_GEND;
}

function aspectField(aspect) {
    if (aspect === BP_ROLE) return 'initrole';
    if (aspect === BP_RACE) return 'initrace';
    if (aspect === BP_GEND) return 'initgend';
    if (aspect === BP_ALIGN) return 'initalign';
    throw new RangeError(`unknown player-selection aspect '${aspect}'`);
}

function advanceWithoutMenus(state, context, random) {
    const flags = state.flags;
    const filter = selectionFilter(state);
    const automatic = context.pick4u === 'y' || context.pick4u === 'a';
    let nextpick = context.nextpick ?? BP_ROLE;

    // C uses a nextpick-driven do/while so that role/race/gender/alignment-
    // first menu entries can jump across the ordinary role-to-alignment
    // order.  Stop only at an input boundary or after all four facets exist.
    for (;;) {
        const aspect = nextpick;
        nextpick = nextAspect(aspect, flags);

        if (aspect === BP_ROLE && flags.initrole < 0) {
            if (automatic || flags.initrole === ROLE_RANDOM) {
                let selected = pick_role(
                    flags.initrace, flags.initgend, flags.initalign,
                    PICK_RANDOM, random, filter,
                );
                if (selected < 0) {
                    context.messages.push('Incompatible role!');
                    selected = randrole(false, random);
                }
                flags.initrole = selected;
            } else {
                return menuOutcome({ ...context, nextpick }, BP_ROLE);
            }
        } else if (aspect === BP_RACE
                   && (flags.initrace < 0
                       || !validrace(flags.initrole, flags.initrace))) {
            if (automatic || flags.initrace === ROLE_RANDOM) {
                let selected = pick_race(
                    flags.initrole, flags.initgend, flags.initalign,
                    PICK_RANDOM, random, filter,
                );
                if (selected < 0) {
                    context.messages.push('Incompatible race!');
                    selected = randrace(flags.initrole, random);
                }
                flags.initrace = selected;
            } else {
                let candidates = manualCandidates(
                    races.length,
                    (racenum) => ok_race(
                        flags.initrole, racenum,
                        flags.initgend, flags.initalign, filter,
                    ),
                );
                if (!candidates.length) {
                    candidates = manualCandidates(
                        races.length,
                        (racenum) => validrace(flags.initrole, racenum),
                    );
                }
                if (candidates.length > 1) {
                    return menuOutcome({ ...context, nextpick }, BP_RACE);
                }
                flags.initrace = candidates[0] ?? 0;
            }
        } else if (aspect === BP_GEND
                   && (flags.initgend < 0
                       || !validgend(
                           flags.initrole, flags.initrace, flags.initgend,
                       ))) {
            if (automatic || flags.initgend === ROLE_RANDOM) {
                let selected = pick_gend(
                    flags.initrole, flags.initrace, flags.initalign,
                    PICK_RANDOM, random, filter,
                );
                if (selected < 0) {
                    context.messages.push('Incompatible gender!');
                    selected = randgend(
                        flags.initrole, flags.initrace, random,
                    );
                }
                flags.initgend = selected;
            } else {
                let candidates = manualCandidates(
                    ROLE_GENDERS,
                    (gendnum) => ok_gend(
                        flags.initrole, flags.initrace,
                        gendnum, flags.initalign, filter,
                    ),
                );
                if (!candidates.length) {
                    candidates = manualCandidates(
                        ROLE_GENDERS,
                        (gendnum) => validgend(
                            flags.initrole, flags.initrace, gendnum,
                        ),
                    );
                }
                if (candidates.length > 1) {
                    return menuOutcome({ ...context, nextpick }, BP_GEND);
                }
                flags.initgend = candidates[0] ?? 0;
            }
        } else if (aspect === BP_ALIGN
                   && (flags.initalign < 0
                       || !validalign(
                           flags.initrole, flags.initrace, flags.initalign,
                       ))) {
            if (automatic || flags.initalign === ROLE_RANDOM) {
                let selected = pick_align(
                    flags.initrole, flags.initrace, flags.initgend,
                    PICK_RANDOM, random, filter,
                );
                if (selected < 0) {
                    context.messages.push('Incompatible alignment!');
                    selected = randalign(
                        flags.initrole, flags.initrace, random,
                    );
                }
                flags.initalign = selected;
            } else {
                let candidates = manualCandidates(
                    ROLE_ALIGNS,
                    (alignnum) => ok_align(
                        flags.initrole, flags.initrace,
                        flags.initgend, alignnum, filter,
                    ),
                );
                if (!candidates.length) {
                    candidates = manualCandidates(
                        ROLE_ALIGNS,
                        (alignnum) => validalign(
                            flags.initrole, flags.initrace, alignnum,
                        ),
                    );
                }
                if (candidates.length > 1) {
                    return menuOutcome({ ...context, nextpick }, BP_ALIGN);
                }
                flags.initalign = candidates[0] ?? 0;
            }
        }

        // One C do/while pass always reaches the alignment block before it
        // tests whether every facet is filled.  This matters for repairing
        // incompatible, fully specified configuration tuples.
        if (aspect === BP_ALIGN
            && flags.initrole >= 0 && flags.initrace >= 0
            && flags.initgend >= 0 && flags.initalign >= 0) {
            return finalOutcome(state, { ...context, nextpick });
        }
    }
}

function manualRandomChoice(state, aspect, random) {
    const flags = state.flags;
    const filter = selectionFilter(state);
    if (aspect === BP_ROLE) {
        const selected = pick_role(
            flags.initrace, flags.initgend, flags.initalign,
            PICK_RANDOM, random, filter,
        );
        return selected < 0 ? randrole(false, random) : selected;
    }
    if (aspect === BP_RACE) {
        const selected = pick_race(
            flags.initrole, flags.initgend, flags.initalign,
            PICK_RANDOM, random, filter,
        );
        return selected < 0
            ? randrace(flags.initrole, random) : selected;
    }
    if (aspect === BP_GEND) {
        const selected = pick_gend(
            flags.initrole, flags.initrace, flags.initalign,
            PICK_RANDOM, random, filter,
        );
        return selected < 0
            ? randgend(flags.initrole, flags.initrace, random) : selected;
    }
    const selected = pick_align(
        flags.initrole, flags.initrace, flags.initgend,
        PICK_RANDOM, random, filter,
    );
    return selected < 0
        ? randalign(flags.initrole, flags.initrace, random) : selected;
}

function initialResponse(response) {
    let ch = typeof response === 'number'
        ? String.fromCharCode(response & 0xFF)
        : String(response ?? '').slice(0, 1);
    if (ch === '\0' || ch === '\x1b' || ch.toLowerCase() === 'q')
        return 'q';
    ch = ch.toLowerCase();
    if (ch === ' ' || ch === '\n' || ch === '\r') return 'y';
    if (ch === '@' || ch === '*') return 'a';
    return ch === 'y' || ch === 'n' || ch === 'a' ? ch : null;
}

/**
 * Enter role.c:genl_player_setup() and run until the first input boundary:
 * either the initial y/n/a/q prompt or a PICK_ONE facet menu.
 *
 * The returned context preserves `picksomething`, which C snapshots before
 * rigid_role_checks(). If status is `prompt`, pass the same context to
 * answer_initial_player_selection(); do not call this initializer twice.
 */
export function prepare_player_selection(state, random = rn2) {
    const flags = normalizeCharacterFlags(state);
    const picksomething = [
        flags.initrole, flags.initrace, flags.initgend, flags.initalign,
    ].includes(ROLE_NONE);
    if (flags.randomall && picksomething) {
        if (flags.initrole === ROLE_NONE) flags.initrole = ROLE_RANDOM;
        if (flags.initrace === ROLE_NONE) flags.initrace = ROLE_RANDOM;
        if (flags.initgend === ROLE_NONE) flags.initgend = ROLE_RANDOM;
        if (flags.initalign === ROLE_NONE) flags.initalign = ROLE_RANDOM;
    }

    rigid_role_checks(state, random);
    const context = {
        picksomething,
        pick4u: 'n',
        messages: [],
        nextpick: BP_ROLE,
    };
    if ([
        flags.initrole, flags.initrace, flags.initgend, flags.initalign,
    ].includes(ROLE_NONE)) {
        return {
            ...context,
            status: 'prompt',
            prompt: build_plselection_prompt(
                flags.initrole, flags.initrace,
                flags.initgend, flags.initalign,
                selectionFilter(state),
            ),
        };
    }
    return advanceWithoutMenus(state, context, random);
}

/** Continue the y/n/a/q question at genl_player_setup()'s first boundary. */
export function answer_initial_player_selection(
    state,
    context,
    response,
    random = rn2,
) {
    if (context.status !== 'prompt')
        throw new Error('initial player-selection response needs prompt state');
    const pick4u = initialResponse(response);
    if (pick4u === null) return context;
    if (pick4u === 'q') return { ...context, status: 'quit', pick4u };
    const next = {
        picksomething: context.picksomething,
        pick4u,
        messages: [...context.messages],
        nextpick: BP_ROLE,
    };
    return advanceWithoutMenus(state, next, random);
}

/**
 * Apply one PICK_ONE result and continue role.c's nextpick loop.
 *
 * `choice` is one of `{ kind: 'value', value }`, `{ kind: 'random' }`,
 * `{ kind: 'jump', aspect }`, `{ kind: 'filter', selected }`, or
 * `{ kind: 'quit' }`.  For a filter result, `selected` is reset_role_filtering
 * ()'s `n > 0` result; the tty adapter has already applied the committed
 * filter state.  Menu construction is responsible for offering only
 * source-valid values and jump targets.
 */
export function continue_player_selection(
    state,
    context,
    choice,
    random = rn2,
) {
    if (context.status !== 'menu')
        throw new Error('player-selection choice needs menu state');

    const flags = normalizeCharacterFlags(state);
    const aspect = context.aspect;
    const currentField = aspectField(aspect);
    const kind = choice?.kind;
    if (kind === 'quit') return { ...context, status: 'quit' };

    let nextpick = context.nextpick ?? nextAspect(aspect, flags);
    if (kind === 'jump') {
        aspectField(choice.aspect); // validate before mutating state
        flags[currentField] = ROLE_NONE;
        flags[aspectField(choice.aspect)] = ROLE_NONE;
        nextpick = choice.aspect;
    } else if (kind === 'filter' && typeof choice.selected === 'boolean') {
        // role.c clears the facet whose menu launched reset_role_filtering().
        // A nonempty filter commit restarts at role; cancel and an empty
        // commit rebuild the current facet (the latter has reset all four).
        flags[currentField] = ROLE_NONE;
        nextpick = aspect === BP_ROLE || choice.selected ? BP_ROLE : aspect;
    } else if (kind === 'random') {
        flags[currentField] = manualRandomChoice(state, aspect, random);
    } else if (kind === 'value' && Number.isInteger(choice.value)) {
        flags[currentField] = choice.value;
    } else {
        throw new TypeError('invalid player-selection menu choice');
    }

    return advanceWithoutMenus(
        state,
        {
            picksomething: context.picksomething,
            pick4u: context.pick4u,
            messages: [...context.messages],
            nextpick,
        },
        random,
    );
}

/** Continue the confirmation menu's source y/n/a/q outcomes. */
export function answer_player_selection_confirmation(
    state,
    context,
    response,
    random = rn2,
) {
    if (context.status !== 'confirmation')
        throw new Error('player-selection confirmation needs confirmation state');
    let ch = typeof response === 'number'
        ? String.fromCharCode(response & 0xFF)
        : String(response ?? '').slice(0, 1);
    if (ch === ' ' || ch === '\n' || ch === '\r') ch = 'y';
    if (ch === 'y') return { ...context, status: 'complete' };
    if (ch === 'a' && state.iflags?.renameallowed)
        return { ...context, status: 'rename' };
    if (ch === 'n') {
        state.flags.initrole = ROLE_NONE;
        state.flags.initrace = ROLE_NONE;
        state.flags.initgend = ROLE_NONE;
        state.flags.initalign = ROLE_NONE;
        return advanceWithoutMenus(
            state,
            {
                picksomething: context.picksomething,
                pick4u: 'n',
                messages: [...context.messages],
                nextpick: BP_ROLE,
            },
            random,
        );
    }
    if (ch === 'q' || ch === '\x1b' || ch === '\0')
        return { ...context, status: 'quit' };
    return context;
}

/** Return to the unchanged confirmation after tty_askname() finishes. */
export function resume_player_selection_after_rename(context) {
    if (context.status !== 'rename')
        throw new Error('player-selection rename resume needs rename state');
    return { ...context, status: 'confirmation' };
}
