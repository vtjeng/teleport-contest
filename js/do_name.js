// Monster names and novel-title data.
// C ref: src/do_name.c christen_monst(), rndghostname(), bogusmon(),
// rndmonnam(),
// sir_Terry_novels[], noveltitle(), and lookup_novel().

import {
    ARTICLE_A,
    ARTICLE_NONE,
    ARTICLE_THE,
    ARTICLE_YOUR,
    BLINDED,
    BOGUSMONFILE,
    HALLUC,
    HALLUC_RES,
    MALE,
    MD_PAD_BOGONS,
    M_AP_MONSTER,
    M_AP_TYPMASK,
    NEUTRAL,
    NUM_MGENDERS,
    PL_PSIZ,
    SUPPRESS_HALLUCINATION,
    SUPPRESS_INVISIBLE,
    SUPPRESS_IT,
    SUPPRESS_MAPPEARANCE,
    SUPPRESS_NAME,
    SUPPRESS_SADDLE,
    W_SADDLE,
} from './const.js';
import { fruit_from_name } from './fruit.js';
import { game } from './gstate.js';
import {
    decodeUtf8ByteString,
    encodeUtf8ByteString,
    s_suffix,
} from './hacklib.js';
import { gender, is_mplayer, type_is_pname } from './mondata.js';
import {
    G_NOGEN,
    G_UNIQ,
    LOW_PM,
    M2_PNAME,
    PM_GHOST,
    PM_WIZARD_OF_YENDOR,
    SPECIAL_PM,
} from './monsters.js';
import { just_an } from './objnam.js';
import { get_rnd_text } from './random_text.js';
import { HLIQUIDS } from './random_text_data.js';
import { rn2, rn2_on_display_rng } from './rng.js';

const GHOST_NAMES = Object.freeze([
    'Adri',
    'Andries',
    'Andreas',
    'Bert',
    'David',
    'Dirk',
    'Emile',
    'Frans',
    'Fred',
    'Greg',
    'Hether',
    'Jay',
    'John',
    'Jon',
    'Karnov',
    'Kay',
    'Kenny',
    'Kevin',
    'Maud',
    'Michiel',
    'Mike',
    'Peter',
    'Robert',
    'Ron',
    'Tom',
    'Wilmar',
    'Nick Danger',
    'Phoenix',
    'Jiro',
    'Mizue',
    'Stephan',
    'Lance Braccus',
    'Shadowhawk',
    'Murphy',
]);

export function christen_monst(monster, name, env = {}) {
    if (!monster || typeof monster !== 'object')
        throw new TypeError('christen_monst requires a monster instance');
    const updateInventory = env.updateInventory;
    if (monster.mleashed && typeof updateInventory !== 'function') {
        throw new Error(
            'christen_monst requires update_inventory for a leashed monster',
        );
    }
    const bytes = encodeUtf8ByteString(String(name ?? ''));
    if (!bytes.length) {
        if (monster.mextra) delete monster.mextra.mgivenname;
        if (monster.mleashed) updateInventory(env);
        return monster;
    }
    monster.mextra ??= {};
    monster.mextra.mgivenname = decodeUtf8ByteString(
        bytes.slice(0, PL_PSIZ - 1),
    );
    if (monster.mleashed) updateInventory(env);
    return monster;
}

// A monster name this port cannot format yet.
export class UnsupportedMonsterNameError extends Error {
    constructor(reason) {
        super(`unsupported monster name: ${reason}`);
        this.name = 'UnsupportedMonsterNameError';
        this.reason = reason;
    }
}

function namingPropertyActive(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic)
        && !value?.blocked;
}

// C ref: do_name.c mon_nam() and x_monnam(), early ordinary-monster subset.
// A given name suppresses the article. An unnamed visible monster retains the
// saddle adjective unless blindness or hallucination prevents recognition.
export function monsterCommonName(monster, state = game) {
    const speciesName = monster.data?.pmnames?.[2]
        ?? monster.data?.pmnames?.find(Boolean)
        ?? 'monster';
    const givenName = monster.mextra?.mgivenname
        || monster.mgivenname
        || monster.name;
    if (givenName) return givenName;
    const blind = namingPropertyActive(state, BLINDED)
        || Boolean(state.u?.uroleplay?.blind);
    const hallucinating = namingPropertyActive(state, HALLUC)
        && !namingPropertyActive(state, HALLUC_RES);
    const saddled = !blind && !hallucinating
        && Boolean(monster.misc_worn_check & W_SADDLE);
    return `the ${saddled ? 'saddled ' : ''}${speciesName}`;
}

export function capitalizedMonsterName(monster, state = game) {
    const name = monsterCommonName(monster, state);
    return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

// C ref: do_name.c pmname() (1300-1308).
//
// The two range tests are carried because C indexes pmnames[] directly and
// would read out of bounds without them. In JavaScript they change no answer:
// an out-of-range index reads undefined, which the third disjunct already
// rejects, so mutating either one leaves every result identical.
export function pmname(species, mgender) {
    let index = mgender;
    if (index < MALE || index >= NUM_MGENDERS || !species.pmnames[index])
        index = NEUTRAL;
    return species.pmnames[index];
}

// C ref: do_name.c mon_pmname() (1311-1317).
export function mon_pmname(monster) {
    return pmname(monster.data, gender(monster));
}

// C ref: do_name.c x_monnam() (826-1032), restricted to the one `suppress`
// combination the port asks for: SUPPRESS_IT | SUPPRESS_INVISIBLE |
// SUPPRESS_HALLUCINATION, which steed.c mount_steed() uses to build the killer
// string for a slipped mount ("a saddled pony", or "a saddled pony called
// Dobbin"). Every other combination stops, because those three flags are what
// make the do_it, do_invis and do_hallu branches statically dead here; do_hallu
// in particular draws from the display RNG through rndmonnam(), so admitting it
// without a caller would put an unspent random-number call in the port.
//
// monsterCommonName() and capitalizedMonsterName() above are the port's older
// partial mon_nam() and Monnam(); they answer a different article and are not
// yet expressed in terms of this function.
export function x_monnam(
    monster,
    article,
    adjective,
    suppress,
    called,
    state = game,
) {
    const REQUIRED = SUPPRESS_IT | SUPPRESS_INVISIBLE | SUPPRESS_HALLUCINATION;
    if ((suppress & REQUIRED) !== REQUIRED) {
        throw new UnsupportedMonsterNameError(
            `x_monnam() suppress flags 0x${suppress.toString(16)}`,
        );
    }
    const mdat = monster.data;

    // do_hallu, do_invis and do_it are all FALSE under the flags above, and
    // program_state.gameover has no ported counterpart, so the game-over
    // suppression and the "it"/"someone"/"something" early return cannot run.
    let effectiveArticle = article;
    if (effectiveArticle === ARTICLE_YOUR && !monster.mtame)
        effectiveArticle = ARTICLE_THE;
    if (state.u?.uswallow && monster === state.u.ustuck)
        effectiveArticle = ARTICLE_THE;

    const do_saddle = !(suppress & SUPPRESS_SADDLE);
    const do_mappear = ((monster.m_ap_type ?? 0) & M_AP_TYPMASK)
        === M_AP_MONSTER && !(suppress & SUPPRESS_MAPPEARANCE);
    const do_name = !(suppress & SUPPRESS_NAME) || type_is_pname(mdat);

    if (monster.ispriest || monster.isminion || monster.isshk
        || do_mappear || is_mplayer(mdat)) {
        throw new UnsupportedMonsterNameError(
            'x_monnam() for a priest, minion, shopkeeper, mimic or player'
            + ' monster',
        );
    }

    const pm_name = mon_pmname(monster);
    let buf = '';

    if (adjective) buf += `${adjective} `;
    // do_invis is FALSE, so the "invisible " adjective cannot be added.
    if (do_saddle && (monster.misc_worn_check & W_SADDLE)
        && !namingPropertyActive(state, BLINDED)
        && !(namingPropertyActive(state, HALLUC)
            && !namingPropertyActive(state, HALLUC_RES)))
        buf += 'saddled ';
    const has_adjectives = buf !== '';

    let name_at_start;
    const givenName = monster.mextra?.mgivenname;
    if (do_name && givenName) {
        if (mdat === state.mons?.[PM_GHOST]) {
            throw new UnsupportedMonsterNameError(
                "x_monnam() for a named ghost's s_suffix() form",
            );
        } else if (called) {
            buf += `${pm_name} called ${givenName}`;
            name_at_start = type_is_pname(mdat);
        } else {
            // The is_mplayer() " the " arm above this one is refused already.
            buf += givenName;
            name_at_start = true;
        }
    } else {
        buf += pm_name;
        name_at_start = type_is_pname(mdat);
    }

    if (name_at_start
        && (effectiveArticle === ARTICLE_YOUR || !has_adjectives)) {
        effectiveArticle = mdat === state.mons?.[PM_WIZARD_OF_YENDOR]
            ? ARTICLE_THE : ARTICLE_NONE;
    } else if ((mdat.geno & G_UNIQ) !== 0 && effectiveArticle === ARTICLE_A) {
        effectiveArticle = ARTICLE_THE;
    }

    switch (effectiveArticle) {
    case ARTICLE_YOUR: return `your ${buf}`;
    case ARTICLE_THE: return `the ${buf}`;
    case ARTICLE_A: return `${just_an(buf)}${buf}`;
    case ARTICLE_NONE:
    default: return buf;
    }
}

// C ref: do_name.c noit_Monnam(). ARTICLE_YOUR becomes "your" for an
// unnamed tame monster and "the" otherwise; a given name has no article.
export function alwaysVisibleMonsterName(
    monster,
    state = game,
) {
    let name = monsterCommonName(monster, state);
    if (monster.mtame
        && !monster.mextra?.mgivenname
        && !monster.mgivenname
        && !monster.name
        && name.startsWith('the ')) {
        name = `your ${name.slice(4)}`;
    }
    return name;
}

export function capitalizedAlwaysVisibleMonsterName(
    monster,
    state = game,
) {
    const name = alwaysVisibleMonsterName(monster, state);
    return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

export function monsterPossessive(monster, state = game, capitalized = false) {
    const name = capitalized
        ? capitalizedMonsterName(monster, state)
        : monsterCommonName(monster, state);
    return `${name}${name.endsWith('s') ? "'" : "'s"}`;
}

export function rndghostname(env = {}) {
    const random = env.random ?? { rn2 };
    const state = env.state ?? game;
    if (typeof random.rn2 !== 'function')
        throw new TypeError('rndghostname random injection requires rn2');
    return random.rn2(7)
        ? GHOST_NAMES[random.rn2(GHOST_NAMES.length)]
        : String(state.plname ?? '');
}

function displayRandomFunction(random) {
    if (typeof random === 'function') return random;
    if (random && typeof random.rn2 === 'function')
        return (bound) => random.rn2(bound);
    throw new TypeError('display random injection requires rn2');
}

// C ref: do_name.c bogusmon(). Prefix codes affect capitalization and
// personal-name handling in other callers; glyph-update descriptions only
// need the stripped text, so expose the code alongside it for future users.
export function bogusmon(env = {}) {
    const random = displayRandomFunction(
        env.random ?? rn2_on_display_rng,
    );
    const selected = get_rnd_text(
        BOGUSMONFILE,
        random,
        MD_PAD_BOGONS,
        env,
    );
    if (!selected) return { name: 'bogon', code: '' };
    const code = '-_+|='.includes(selected[0]) ? selected[0] : '';
    return {
        name: code ? selected.slice(1) : selected,
        code,
    };
}

// C ref: do_name.c rndmonnam(). Candidate selection shares the display RNG
// with monster glyph randomization and may retry excluded species. An ordinary
// monster then draws its gender; a bogus name instead uses get_rnd_text()'s
// byte-offset selection, which may retry when it lands in a long record.
export function rndmonnamDetails(env = {}) {
    const state = env.state ?? game;
    const random = displayRandomFunction(
        env.random ?? rn2_on_display_rng,
    );
    let index;
    do {
        index = random(SPECIAL_PM + 100 - LOW_PM) + LOW_PM;
    } while (index < SPECIAL_PM
        && ((state.mons?.[index]?.mflags2 & M2_PNAME)
            || (state.mons?.[index]?.geno & G_NOGEN)));

    if (index >= SPECIAL_PM)
        return bogusmon({ ...env, random });

    const species = state.mons?.[index];
    if (!species)
        throw new Error('rndmonnam requires the complete monster catalog');
    const gender = random(2);
    return {
        name: species.pmnames?.[gender]
            ?? species.pmnames?.[2]
            ?? 'monster',
        code: '',
    };
}

export function rndmonnam(env = {}) {
    return rndmonnamDetails(env).name;
}

// C ref: do_name.c x_monnam(), a_monnam(), and Amonnam().  This is the
// ordinary, already-spotted monster path used by makemon.c's runtime creation
// message.  Priests, shopkeepers, player monsters, and the unseen "it" arm
// retain their separate owners and fail closed here.
export function Amonnam(monster, env = {}) {
    const state = env.state ?? game;
    if (monster.ispriest || monster.isminion || monster.isshk
        || is_mplayer(monster.data)) {
        throw new UnsupportedMonsterNameError(
            'Amonnam() for a priest, minion, shopkeeper, or player monster',
        );
    }

    const hallucinating = namingPropertyActive(state, HALLUC)
        && !namingPropertyActive(state, HALLUC_RES);
    const blind = namingPropertyActive(state, BLINDED)
        || Boolean(state.u?.uroleplay?.blind);
    let text = '';
    if (monster.minvis) text += 'invisible ';
    if ((monster.misc_worn_check & W_SADDLE) && !blind && !hallucinating)
        text += 'saddled ';
    const hasAdjectives = text !== '';

    let nameAtStart = false;
    if (hallucinating) {
        const randomName = rndmonnamDetails({
            state,
            random: env.displayRandom ?? rn2_on_display_rng,
        });
        text += randomName.name;
        nameAtStart = '-+='.includes(randomName.code);
    } else {
        const mdat = monster.data;
        const appearance = (monster.m_ap_type ?? 0) & M_AP_TYPMASK;
        const species = appearance === M_AP_MONSTER
            ? state.mons?.[monster.mappearance]
            : mdat;
        if (!species) {
            throw new UnsupportedMonsterNameError(
                'Amonnam() for an invalid monster appearance',
            );
        }
        const givenName = monster.mextra?.mgivenname;
        if (givenName) {
            // do_name.c changes pm_name for M_AP_MONSTER, but every decision
            // about the monster's own name continues to use real mdat.
            text += mdat === state.mons?.[PM_GHOST]
                ? `${s_suffix(givenName)} ghost` : givenName;
            nameAtStart = true;
        } else {
            text += pmname(species, gender(monster));
            nameAtStart = type_is_pname(mdat);
        }
    }

    let article = ARTICLE_A;
    if (nameAtStart && !hasAdjectives) article = ARTICLE_NONE;
    else if ((monster.data.geno & G_UNIQ) !== 0) article = ARTICLE_THE;
    const named = article === ARTICLE_A ? `${just_an(text)}${text}`
        : article === ARTICLE_THE ? `the ${text}` : text;
    return `${named.charAt(0).toUpperCase()}${named.slice(1)}`;
}

// C ref: do_name.c hliquid().  Hallucinatory terrain descriptions share the
// display RNG with glyph randomization and monster naming.
export function hliquid(liquidpref, env = {}) {
    const state = env.state ?? game;
    const random = displayRandomFunction(
        env.random ?? rn2_on_display_rng,
    );
    const preferred = liquidpref == null ? '' : String(liquidpref);
    const hallucinating = Boolean(
        state.u?.uprops?.[HALLUC]?.intrinsic,
    ) && !Boolean(
        state.u?.uprops?.[HALLUC_RES]?.intrinsic
            || state.u?.uprops?.[HALLUC_RES]?.extrinsic,
    ) && !state.program_state?.gameover;
    if (hallucinating || !preferred) {
        const count = HLIQUIDS.length + (preferred ? 1 : 0);
        const index = random(count);
        if (index < HLIQUIDS.length) return HLIQUIDS[index];
    }
    return preferred;
}

export const SIR_TERRY_NOVELS = Object.freeze([
    'The Colour of Magic',
    'The Light Fantastic',
    'Equal Rites',
    'Mort',
    'Sourcery',
    'Wyrd Sisters',
    'Pyramids',
    'Guards! Guards!',
    'Eric',
    'Moving Pictures',
    'Reaper Man',
    'Witches Abroad',
    'Small Gods',
    'Lords and Ladies',
    'Men at Arms',
    'Soul Music',
    'Interesting Times',
    'Maskerade',
    'Feet of Clay',
    'Hogfather',
    'Jingo',
    'The Last Continent',
    'Carpe Jugulum',
    'The Fifth Elephant',
    'The Truth',
    'Thief of Time',
    'The Last Hero',
    'The Amazing Maurice and His Educated Rodents',
    'Night Watch',
    'The Wee Free Men',
    'Monstrous Regiment',
    'A Hat Full of Sky',
    'Going Postal',
    'Thud!',
    'Wintersmith',
    'Making Money',
    'Unseen Academicals',
    'I Shall Wear Midnight',
    'Snuff',
    'Raising Steam',
    "The Shepherd's Crown",
]);

// The source always consumes its draw before inspecting an existing index.
// Return the potentially updated union value alongside the chosen title so a
// caller cannot accidentally skip that distinction.
export function noveltitle(novelidx = undefined, env = {}) {
    const random = env.random ?? { rn2 };
    if (typeof random.rn2 !== 'function')
        throw new TypeError('noveltitle random injection requires rn2');
    let selected = random.rn2(SIR_TERRY_NOVELS.length);
    let stored = novelidx;
    if (novelidx === -1) {
        stored = selected;
    } else if (Number.isInteger(novelidx)
               && novelidx >= 0
               && novelidx < SIR_TERRY_NOVELS.length) {
        selected = novelidx;
    }
    return { novelidx: stored, title: SIR_TERRY_NOVELS[selected] };
}

function asciiFold(value) {
    return String(value).replace(
        /[A-Z]/gu,
        (character) => String.fromCharCode(character.charCodeAt(0) + 32),
    );
}

function sameTitle(left, right) {
    return asciiFold(left) === asciiFold(right);
}

function startsWithThe(title) {
    return sameTitle(String(title).slice(0, 4), 'the ');
}

function matchingArtifactName(name, state) {
    const candidate = startsWithThe(name) ? String(name).slice(4) : String(name);
    for (let index = 1; state.artilist?.[index]?.otyp; ++index) {
        const artifactName = state.artilist[index].name;
        if (typeof artifactName !== 'string') continue;
        const comparable = startsWithThe(artifactName)
            ? artifactName.slice(4)
            : artifactName;
        if (sameTitle(candidate, comparable)) return artifactName;
    }
    return null;
}

function fruitNameForcesArticle(title, state) {
    if (!state.gf?.ffruit) return false;
    if (!fruit_from_name(title, true, state)) return false;
    const artifactName = matchingArtifactName(title, state);
    return !artifactName || startsWithThe(artifactName);
}

// Lookup-specific port of the objnam.c the()/The() decisions which can affect
// the fixed novel catalog.  Proper title casing normally suppresses “the,”
// while a configured fruit name can force it back unless an artifact with the
// same name deliberately lacks the article.
function withDefiniteArticle(title, state) {
    const text = String(title);
    if (startsWithThe(text)) return `T${text.slice(1)}`;

    let insertThe = !/^[A-Z]/u.test(text)
        || fruitNameForcesArticle(text, state);
    if (!insertThe) {
        const lastSpace = text.lastIndexOf(' ');
        const separator = lastSpace >= 0
            ? lastSpace
            : text.lastIndexOf('-');
        if (separator >= 0 && !/^[A-Z]/u.test(text.slice(separator + 1))) {
            insertThe = !text.includes("'");
        } else if (separator >= 0 && text.indexOf(' ') < separator) {
            const folded = asciiFold(text);
            const ofIndex = folded.indexOf(' of ');
            const namedIndex = folded.indexOf(' named ');
            const calledIndex = folded.indexOf(' called ');
            const namingIndex = namedIndex < 0
                ? calledIndex
                : calledIndex < 0
                    ? namedIndex
                    : Math.min(namedIndex, calledIndex);
            insertThe = ofIndex >= 0
                && (namingIndex < 0 || ofIndex < namingIndex);
        }
    }
    const result = insertThe ? `the ${text}` : text;
    return result ? result[0].toUpperCase() + result.slice(1) : result;
}

// C ref: do_name.c lookup_novel(). Preserve an already valid generated index
// when the supplied title is unknown; sp_lev.c uses only the updated index and
// leaves the explicitly supplied object name intact.
export function lookup_novel(lookname, novelidx = undefined, env = {}) {
    const state = env.state ?? game;
    let sought = String(lookname);
    if (sameTitle(
        withDefiniteArticle(sought, state),
        'The Color of Magic',
    )) {
        sought = SIR_TERRY_NOVELS[0];
    } else if (sameTitle(sought, 'Sorcery')) {
        sought = SIR_TERRY_NOVELS[4];
    } else if (sameTitle(sought, 'Masquerade')) {
        sought = SIR_TERRY_NOVELS[17];
    } else if (sameTitle(
        withDefiniteArticle(sought, state),
        'The Amazing Maurice',
    )) {
        sought = SIR_TERRY_NOVELS[27];
    } else if (sameTitle(sought, 'Thud')) {
        sought = SIR_TERRY_NOVELS[33];
    }

    const matchedIndex = SIR_TERRY_NOVELS.findIndex(
        (title) => sameTitle(sought, title)
            || sameTitle(withDefiniteArticle(sought, state), title),
    );
    if (matchedIndex >= 0) {
        return {
            novelidx: matchedIndex,
            title: SIR_TERRY_NOVELS[matchedIndex],
        };
    }
    if (Number.isInteger(novelidx)
        && novelidx >= 0
        && novelidx < SIR_TERRY_NOVELS.length) {
        return { novelidx, title: SIR_TERRY_NOVELS[novelidx] };
    }
    return { novelidx, title: null };
}
