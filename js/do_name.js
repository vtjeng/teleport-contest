// Monster names and novel-title data.
// C ref: src/do_name.c christen_monst(), rndghostname(), bogusmon(),
// rndmonnam(),
// sir_Terry_novels[], noveltitle(), and lookup_novel().

import {
    BOGUSMONFILE,
    MD_PAD_BOGONS,
    PL_PSIZ,
} from './const.js';
import { fruit_from_name } from './fruit.js';
import { game } from './gstate.js';
import { decodeUtf8ByteString, encodeUtf8ByteString } from './hacklib.js';
import {
    G_NOGEN,
    LOW_PM,
    M2_PNAME,
    SPECIAL_PM,
} from './monsters.js';
import { get_rnd_text } from './random_text.js';
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
    throw new TypeError('rndmonnam random injection requires rn2');
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

// C ref: do_name.c rndmonnam(). The first draw shares the display RNG with
// monster glyph randomization. Actual monster names consume a second gender
// draw; bogus names consume get_rnd_text()'s byte-offset draw instead.
export function rndmonnam(env = {}) {
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
        return bogusmon({ ...env, random }).name;

    const species = state.mons?.[index];
    if (!species)
        throw new Error('rndmonnam requires the complete monster catalog');
    const gender = random(2);
    return species.pmnames?.[gender]
        ?? species.pmnames?.[2]
        ?? 'monster';
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
