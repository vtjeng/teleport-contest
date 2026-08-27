// read.js -- reading scrolls and spellbooks, plus monster-creation helpers.
// C refs: src/read.c read_ok(), doread(), cant_revive(),
// create_particular_parse(), create_particular_creation() and
// create_particular(). doread() completes a known ordinary magic-mapping
// scroll; other selected readable objects stop before pickup_prev changes.
// wizcmds.c wiz_genesis() calls the monster-creation helpers.

import {
    A_WIS,
    BLINDED,
    COLNO,
    CONFUSION,
    ECMD_CANCEL,
    ECMD_OK,
    ECMD_TIME,
    FEMALE,
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_PROMPT,
    GETOBJ_SUGGEST,
    MALE,
    MM_FEMALE,
    MM_MALE,
    MM_NOEXCLAM,
    NEUTRAL,
    NO_MM_FLAGS,
    ROWNO,
    ismnum,
} from './const.js';
import {
    PM_ALIGNED_CLERIC,
    PM_ANGEL,
    PM_DOPPELGANGER,
    PM_GUARD,
    PM_HIGH_CLERIC,
    PM_HUMAN_ZOMBIE,
    PM_LONG_WORM,
    PM_LONG_WORM_TAIL,
    PM_SHOPKEEPER,
} from './monsters.js';
import { digit, mungspaces, strstri } from './hacklib.js';
import { game } from './gstate.js';
import { check_capacity, notice_mon_off, notice_mon_on } from './hack.js';
import { getobj, useup } from './invent.js';
import { getlin } from './windows.js';
import {
    is_female,
    is_male,
    can_chant,
    name_to_monplus,
    unique_corpstat,
} from './mondata.js';
import { makemon_runtime } from './makemon_create.js';
import { MAXMCLASSES } from './symbols.js';
import { SCROLL_CLASS, SCR_MAGIC_MAPPING, SPBOOK_CLASS } from './objects.js';
import { objectType } from './obj.js';
import { exercise } from './attrib.js';
import { do_mapping } from './detect.js';
import { discover_object } from './o_init.js';
import { rn2 } from './rng.js';
import { ttyPline } from './tty_message.js';

// A selected scroll or spellbook enters doread()'s effect arms. The known,
// uncursed magic-mapping scroll is supported; raising before pickup_prev
// changes keeps every other object and the turn retryable while preserving
// the prompt screens already produced.
export class UnsupportedReadError extends Error {
    constructor(branch) {
        super(`reading requires ${branch}`);
        this.name = 'UnsupportedReadError';
        this.branch = branch;
    }
}

// C ref: read.c read_ok() (313-322). Scrolls and spellbooks appear as likely
// choices. Other carried objects remain selectable but are omitted from the
// suggested-letter set, and the hands/self sentinel is excluded.
export function read_ok(obj) {
    if (!obj) return GETOBJ_EXCLUDE;
    if (obj.oclass === SCROLL_CLASS || obj.oclass === SPBOOK_CLASS)
        return GETOBJ_SUGGEST;
    return GETOBJ_DOWNPLAY;
}

// C ref: read.c doread() (347-432), restricted after getobj() to the known,
// uncursed magic-mapping scroll. Every other selected object stops before C's
// scroll->pickup_prev write because its effects belong to later slices.
export async function doread(state = game) {
    state.gk ??= {};
    state.gk.known = false;
    if (await check_capacity(null, state)) return ECMD_OK;

    const scroll = await getobj('read', read_ok, GETOBJ_PROMPT, state);
    if (!scroll) return ECMD_CANCEL;
    const active = (property) => {
        const value = state.u?.uprops?.[property];
        return Boolean(value?.intrinsic || value?.extrinsic) && !value?.blocked;
    };
    if (scroll.otyp !== SCR_MAGIC_MAPPING
        || scroll.oclass !== SCROLL_CLASS
        || scroll.blessed || scroll.cursed
        || !scroll.dknown
        || !objectType(scroll, state).oc_name_known
        || active(BLINDED) || active(CONFUSION)
        || !can_chant(state.youmonst, state)
        || state.level?.flags?.nommap
        || !state.level?.flags?.hero_memory
        || state.u?.uinwater || state.u?.uburied || state.u?.uswallow) {
        throw new UnsupportedReadError('the selected readable object branch');
    }

    scroll.pickup_prev = false;
    state.u.uconduct ??= {};
    state.u.uconduct.literate
        = Math.trunc(state.u.uconduct.literate ?? 0) + 1;
    scroll.in_use = true;
    await ttyPline('As you read the scroll, it disappears.', state);
    await seffects(scroll, state);
    if (state.gk.known && !objectType(scroll, state).oc_name_known) {
        discover_object(scroll.otyp, true, true, true, state, {
            random: { rn2 }, hooks: {},
        });
    }
    scroll.in_use = false;
    useup(scroll, { state, hooks: {} });
    return ECMD_TIME;
}

// C ref: read.c seffect_magic_mapping() (2102-2153), restricted to an
// ordinary uncursed scroll on a mappable level.
export async function seffect_magic_mapping(scroll, state = game) {
    if (scroll.otyp !== SCR_MAGIC_MAPPING || scroll.blessed || scroll.cursed
        || state.level?.flags?.nommap) {
        throw new UnsupportedReadError('the selected magic-mapping branch');
    }
    state.gk.known = true;
    await ttyPline('A map coalesces in your mind!', state);
    notice_mon_off(state);
    try {
        await do_mapping(state);
    } finally {
        notice_mon_on(state);
    }
}

// C ref: read.c seffects() (2194-2290), restricted to SCR_MAGIC_MAPPING.
export async function seffects(scroll, state = game) {
    if (scroll.otyp !== SCR_MAGIC_MAPPING) {
        throw new UnsupportedReadError('the selected scroll effect');
    }
    if (objectType(scroll, state).oc_magic)
        await exercise(A_WIS, true, state, { rn2 });
    await seffect_magic_mapping(scroll, state);
    return 0;
}

// A request the player typed that read.c understands and this port does not.
// Every raiser is a branch of one of the four functions below, named in the
// message. js/cmd.js failClosedCommandRefusals() lists the class, because the
// prompt has already echoed the whole typed line by the time one is raised.
export class UnsupportedMonsterRequestError extends Error {
    constructor(operation) {
        super(`unsupported monster request: ${operation}`);
        this.name = 'UnsupportedMonsterRequestError';
        this.operation = operation;
    }
}

// C ref: read.c cant_revive() (3111-3134).
//
// C answers through an `int *mtype` the caller owns; JavaScript has no such
// pointer, so the substituted species comes back beside the boolean as
// `{ changed, mtype }`. All four of C's callers read both halves:
// bones.c:156, trap.c:746, read.c:3262 and zap.c:982.
//
// `from_obj` is the corpse or statue a revival came from, and only the
// unique-species arm looks at it. read.c create_particular_creation() passes
// NULL, which short-circuits that look, so mkobj.c has_omonst() has no owner
// here and an object argument is refused rather than answered wrongly. The two
// callers that pass a real from_obj, trap.c:746 and zap.c:982, are what that
// refusal defers.
export function cant_revive(mtype, revival, from_obj, state = game) {
    if (from_obj) {
        throw new UnsupportedMonsterRequestError(
            'cant_revive() from a corpse or statue',
        );
    }
    /* SHOPKEEPERS can be revived now */
    if (mtype === PM_GUARD || (mtype === PM_SHOPKEEPER && !revival)
        || mtype === PM_HIGH_CLERIC || mtype === PM_ALIGNED_CLERIC
        || mtype === PM_ANGEL) {
        return { changed: true, mtype: PM_HUMAN_ZOMBIE };
    } else if (mtype === PM_LONG_WORM_TAIL) { /* for create_particular() */
        return { changed: true, mtype: PM_LONG_WORM };
    } else if (unique_corpstat(state.mons?.[mtype])) {
        /* unique corpses (from bones or wizard mode wish) or
           statues (bones or any wish) end up as shapechangers */
        return { changed: true, mtype: PM_DOPPELGANGER };
    }
    return { changed: false, mtype };
}

// read.c:3162, whose comment at 3163-3164 gives the reason: the most the
// command will make is one monster per map cell, (0..ROWNO-1) x (1..COLNO-1).
const QUAN_LIMIT = ROWNO * (COLNO - 1);

// The six words read.c:3169-3193 searches the whole answer for, in source
// order. Each sets a request field that decides how the monster arrives, and
// the arm that finds one blanks the word out of the buffer before the species
// lookup sees it. "female" is searched for before "male" so that the second
// search cannot hit the tail of the first.
const GEAR_AND_STATE_WORDS = Object.freeze([
    'saddled ', 'sleeping ', 'invisible ', 'hidden ', 'female ', 'male ',
]);

// The three disposition prefixes at read.c:3197-3206, each of which decides
// how the created monster feels about the hero.
const DISPOSITION_PREFIXES = Object.freeze(['tame ', 'peaceful ', 'hostile ']);

// C ref: read.c create_particular_parse() (3136-3249).
//
// Covers the plain-monster-name arm and nothing else: the answer reaches
// name_to_mon() at 3212 and returns at 3230 with `which` set. Every arm that
// would qualify the request first -- a leading count, the six gear, state and
// gender words, the three disposition prefixes and the wizard-only "*" -- is
// refused above it, and so is name_to_monclass() below it, which
// js/mondata.js:1181 records as unported.
//
// C fills a caller-owned struct and answers whether it found a monster. This
// returns the filled request instead, because the only other answer it can
// give is the refusal above.
export function create_particular_parse(str, state = game) {
    let bufp = str;
    const d = {
        quan: 1 + ((state.multi > 0) ? state.multi : 0),
        monclass: MAXMCLASSES,
        which: state.urole.mnum, /* an arbitrary index into mons[] */
        fem: -1,            /* gender not specified */
        genderconf: -1,     /* no confusion on which gender to assign */
        randmonst: false,
        maketame: false,
        makepeaceful: false,
        makehostile: false,
        sleeping: false,
        saddled: false,
        invisible: false,
        hidden: false,
    };

    /* quantity */
    if (digit(bufp[0])) {
        throw new UnsupportedMonsterRequestError(
            'create_particular_parse() count prefix',
        );
    }
    // read.c:3165-3166 replaces an out-of-range quantity with however many
    // monsters the map can still hold, which needs monster_census(). With the
    // digit arm above refused, gm.multi is the only thing left that can move
    // the quantity, and it can only raise it, so C's `d->quan < 1` half has
    // nothing that reaches it here.
    //
    // gm.multi cannot reach this line either. js/cmd.js:2128 refuses a
    // positive count with COUNTED_BOUNDARY before the extended command
    // dispatches, so `3^G` ends the segment without opening the prompt, and
    // d.quan is 1 on every call the running game makes. The refusal below,
    // the creation loop's second and later iterations and its break are all
    // fail-closed guards mirroring C rather than live branches.
    if (d.quan > QUAN_LIMIT) {
        throw new UnsupportedMonsterRequestError('monster_census()');
    }
    for (const word of GEAR_AND_STATE_WORDS) {
        if (strstri(bufp, word) >= 0) {
            throw new UnsupportedMonsterRequestError(
                `create_particular_parse() "${word}"`,
            );
        }
    }
    bufp = mungspaces(bufp); /* after potential memset(' ') */
    /* allow the initial disposition to be specified */
    for (const prefix of DISPOSITION_PREFIXES) {
        // C's `!strncmpi(bufp, prefix, strlen(prefix))`: a case-insensitive
        // search finds the word at offset 0 exactly when it is a prefix.
        if (strstri(bufp, prefix) === 0) {
            throw new UnsupportedMonsterRequestError(
                `create_particular_parse() "${prefix}"`,
            );
        }
    }
    /* decide whether a valid monster was chosen */
    if (state.wizard && (bufp === '*' || bufp === 'random')) {
        throw new UnsupportedMonsterRequestError(
            'create_particular_parse() random monster',
        );
    }
    // C's `d->which = name_to_mon(bufp, &gender_name_var)`. name_to_mon()
    // discards name_to_monplus()'s remainder and passes the gender pointer
    // through, so the port calls name_to_monplus() directly: the gender the
    // matched name carries is the second half of this line's result, and
    // js/mondata.js name_to_mon() has no way to hand it back.
    //
    // `gender_name_var` starts at NEUTRAL, as read.c:3141 does, rather than at
    // the -1 js/mondata.js defaults to. The seed is not what makes a neuter
    // pmname answer NEUTRAL: mondata.c:1078-1082 writes the matched gender
    // through the pointer whenever a pmname matched at all, and js/mondata.js
    // mirrors it, so "gas spore" answers NEUTRAL under either seed. The seed
    // is observable only where no pmname matched and there is no gender to
    // write -- the title_to_mon() fallback at mondata.c:1074, whose own FIXME
    // at 1073 says titles carry no gender, and the no-match case. There C
    // leaves d->fem at the NEUTRAL it started at and an unseeded call would
    // leave it at -1.
    const named = name_to_monplus(bufp, { state, gender: NEUTRAL });
    d.which = named.mnum;
    /*
     * With the introduction of male and female monster names
     * in 5.0, preserve that detail.
     *
     * C tests `d->fem == MALE || d->fem == FEMALE` here, which is how an
     * explicit "male " or "female " word overrides the gender the name
     * carries and how d->genderconf is raised. Both words are refused above,
     * so d->fem is still -1 and only C's else arm has an owner.
     */
    d.fem = named.gender;
    if (ismnum(d.which))
        return d; /* got one */
    throw new UnsupportedMonsterRequestError('mondata.c name_to_monclass()');
}

// C ref: read.c create_particular_creation() (3251-3357).
//
// Covers the named-species arm: cant_revive() answering FALSE, one loop
// iteration whose mmflags is MM_NOEXCLAM plus whatever gender the typed name
// carried, and makemon() on the hero's own square. Everything the loop does
// with the monster afterwards -- tamedog(), set_malign(), put_saddle_on_mon(),
// the mundetected and msleeping assignments and flash_mon() -- is guarded by a
// request field create_particular_parse() refuses, so none of it has an owner.
async function create_particular_creation(d, state = game) {
    let madeany = false;

    /* d.randmonst is always FALSE: the arm that raises it is refused in parse,
       so C's `if (!d->randmonst)` guard is always taken. */
    const firstchoice = d.which;
    const revived = cant_revive(d.which, false, null, state);
    if (revived.changed && firstchoice !== PM_LONG_WORM_TAIL) {
        /* wizard mode can override handling of special monsters */
        throw new UnsupportedMonsterRequestError(
            'create_particular_creation() force-the-species prompt',
        );
    }
    d.which = revived.mtype;
    const whichpm = state.mons[d.which];

    for (let i = 0; i < d.quan; i++) {
        let mmflags = NO_MM_FLAGS;

        /* d.monclass is always MAXMCLASSES and d.randmonst always FALSE, so
           mkclass() and rndmonst() never reselect whichpm, and whichpm is
           never the null C's gender test below guards against. */
        /* d.genderconf is always -1: the conflict it records needs an explicit
           gender word, and parse refuses those. */
        if (d.fem !== -1 && !is_male(whichpm) && !is_female(whichpm)) {
            mmflags |= (d.fem === FEMALE) ? MM_FEMALE
                : (d.fem === MALE) ? MM_MALE : 0;
        }
        /* no surprise; "<mon> appears." rather than "<mon> appears!" */
        mmflags |= MM_NOEXCLAM;

        const mtmp = await makemon_runtime(
            whichpm, state.u.ux, state.u.uy, mmflags, { state },
        );
        if (!mtmp) {
            /* quit trying if creation failed and is going to repeat. C tests
               `d->monclass == MAXMCLASSES && !d->randmonst` before breaking
               and retries otherwise, to give mkclass() or rndmonst() another
               draw; both terms are constant here, because parse refuses every
               arm that could move either, so the retry has no owner. */
            break;
        }
        madeany = true;
        /* C's newcham() tail turns a doppelganger cant_revive() substituted
           back into the species the player asked for. It has no owner here:
           the one substitution parse and the guard above let through is
           PM_LONG_WORM_TAIL becoming PM_LONG_WORM, and a long worm's
           mtmp->cham is NON_PM. */
    }
    return madeany;
}

// C ref: read.c create_particular() (3371-3408).
//
// Covers the first pass of C's `do { ... } while (--tryct > 0)` loop and the
// `return create_particular_creation(&d)` at 3405 that it leaves by. The retry
// arms at 3390-3403 -- "I've never heard of such monsters." at 3392, "Try
// again (type * for random, ESC to cancel)." at 3394, the
// " [type name or symbol]" prompt extension at 3398-3399 and
// thats_enough_tries at 3403 -- have no owner, because
// create_particular_parse() refuses an answer it cannot use rather than
// answering FALSE, so no second pass can start.
export async function create_particular(state = game) {
    const buf = await getlin('Create what kind of monster?', state);
    const bufp = mungspaces(buf);
    if (bufp[0] === '\x1B')
        return false;

    const d = create_particular_parse(bufp, state);
    return create_particular_creation(d, state);
}
