// read.js -- the scroll-reading file's monster-creation helpers.
// C refs: src/read.c cant_revive(), create_particular_parse(),
// create_particular_creation() and create_particular(), so far the only four
// rows of that file this port needs. Nothing of doread() or its scroll effects
// is here; wizcmds.c wiz_genesis() is the one caller.

import {
    COLNO,
    FEMALE,
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
import { getlin } from './windows.js';
import {
    is_female,
    is_male,
    name_to_monplus,
    unique_corpstat,
} from './mondata.js';
import { makemon_runtime } from './makemon_create.js';
import { MAXMCLASSES } from './symbols.js';

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

// C ref: read.c cant_revive() (3107-3133).
//
// C answers through an `int *mtype` the caller owns; JavaScript has no such
// pointer, so the substituted species comes back beside the boolean as
// `{ changed, mtype }`. Both of C's callers read both halves.
//
// `from_obj` is the corpse or statue a revival came from, and only the
// unique-species arm looks at it. read.c create_particular_creation() passes
// NULL, which short-circuits that look, so mkobj.c has_omonst() has no owner
// here and an object argument is refused rather than answered wrongly.
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

// read.c:3159-3160. The most the command will make is one monster per map
// cell: (0..ROWNO-1) x (1..COLNO-1).
const QUAN_LIMIT = ROWNO * (COLNO - 1);

// The six words read.c:3167-3193 searches the whole answer for, in source
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

// C ref: read.c create_particular_parse() (3136-3246).
//
// Covers the plain-monster-name arm and nothing else: the answer reaches
// name_to_mon() at 3211 and returns at 3231 with `which` set. Every arm that
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
    // read.c:3161-3162 replaces an out-of-range quantity with however many
    // monsters the map can still hold, which needs monster_census(). With the
    // digit arm above refused, gm.multi is the only thing left that can move
    // the quantity, and it can only raise it, so C's `d->quan < 1` half has
    // nothing that reaches it here.
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
    // `gender_name_var` starts at NEUTRAL rather than at the -1 js/mondata.js
    // defaults to, which is what stops a name whose only match is the neuter
    // pmname from reporting NEUTRAL as a discovery.
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

// C ref: read.c create_particular_creation() (3251-3356).
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

// C ref: read.c create_particular() (3372-3406).
//
// Covers the first pass of C's `do { ... } while (--tryct > 0)` loop and the
// `return create_particular_creation(&d)` it leaves by. The retry arms at
// 3396-3405 -- "I've never heard of such monsters.", "Try again (type * for
// random, ESC to cancel).", the " [type name or symbol]" prompt extension and
// thats_enough_tries -- have no owner, because create_particular_parse()
// refuses an answer it cannot use rather than answering FALSE, so no second
// pass can start.
export async function create_particular(state = game) {
    const buf = await getlin('Create what kind of monster?', state);
    const bufp = mungspaces(buf);
    if (bufp[0] === '\x1B')
        return false;

    const d = create_particular_parse(bufp, state);
    return create_particular_creation(d, state);
}
