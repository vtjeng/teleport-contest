// Startup attribute-and-inventory reroll menu.
// C refs: invent.c reroll_menu(), objnam.c xname()/doname(), and
// win/tty/topl.c tty_yn_function().

import {
    A_CHA,
    A_CON,
    A_DEX,
    A_INT,
    A_STR,
    A_WIS,
    HALLUC,
    HALLUC_RES,
    NON_PM,
    PICK_ONE,
    TOPLINE_NON_EMPTY,
    TOPLINE_SPECIAL_PROMPT,
} from './const.js';
import {
    docrt,
    flush_screen,
    get_strength_str as strengthText,
    monster_glyph_info,
    object_glyph_info,
} from './display.js';
import {
    TIN_VARIETIES,
    nonrotting_corpse,
    vegetarian,
} from './eat.js';
import { fruit_from_indx, makesingular } from './fruit.js';
import { game } from './gstate.js';
import { nhgetch } from './input.js';
import * as M from './monsters.js';
import { JAPANESE_ITEM_NAMES } from './objnam_data.js';
import { isContainer, isWeptool, objectType } from './obj.js';
import * as O from './objects.js';
import { rn2_on_display_rng } from './rng.js';
import { NO_COLOR } from './terminal.js';
import {
    menuTitleStyle,
    selectTtyMenu,
    ttyMenuLayout,
} from './tty_menu.js';

const REPROMPT = Symbol('reroll menu needs an explicit choice');
const REROLL_QUERY = 'Reroll this character?';
function propertyActive(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic);
}

function hallucinating(state) {
    return propertyActive(state, HALLUC)
        && !propertyActive(state, HALLUC_RES);
}

function displayDraw(random, bound) {
    const result = random(bound);
    if (!Number.isInteger(result) || result < 0 || result >= bound) {
        throw new RangeError(
            `display RNG returned ${result} outside 0..${bound - 1}`,
        );
    }
    return result;
}

// C ref: display.h obj_to_glyph(). The TTY does not print these glyphs for
// reroll rows (their identifiers are zero), but it still computes them and
// therefore consumes the display RNG while hallucinating.
function rerollObjectGlyphInfo(
    obj,
    state,
    displayRandom = rn2_on_display_rng,
) {
    if (typeof displayRandom !== 'function')
        throw new TypeError('reroll displayRandom must be a function');

    if (obj.otyp === O.STATUE && hallucinating(state)) {
        const monster = displayDraw(displayRandom, M.NUMMONS);
        displayDraw(displayRandom, 2); // statue_to_glyph() chooses a gender.
        return monster_glyph_info({ data: state.mons[monster] }, state);
    }
    if (!hallucinating(state)) return object_glyph_info(obj, state);

    const randomType = O.FIRST_OBJECT + displayDraw(
        displayRandom,
        O.NUM_OBJECTS - O.FIRST_OBJECT,
    );
    const randomObject = {
        otyp: randomType,
        oclass: state.objects[randomType].oc_class,
        dknown: true,
        corpsenm: NON_PM,
    };
    if (randomType === O.CORPSE) {
        randomObject.corpsenm = displayDraw(displayRandom, M.NUMMONS);
    }
    return object_glyph_info(randomObject, state);
}

function objectActualName(obj, state) {
    const type = objectType(obj, state);
    if (state.urole?.mnum === M.PM_SAMURAI
        && JAPANESE_ITEM_NAMES.has(obj.otyp)) {
        return JAPANESE_ITEM_NAMES.get(obj.otyp);
    }
    return O.OBJ_NAME(type, state) ?? 'object?';
}

function monsterName(mnum, state) {
    return state.mons?.[mnum]?.pmnames?.[2] ?? 'monster';
}

function tinBaseName(obj, state) {
    if (obj.spe === 1) return 'tin of spinach';
    if (obj.corpsenm === NON_PM) return 'empty tin';

    let variety = obj.cursed ? 0 : (obj.spe < 0 ? -obj.spe - 1 : null);
    if (variety === 0 && nonrotting_corpse(obj.corpsenm, state)) {
        variety = 1;
    }
    const preparation = Number.isInteger(variety)
        ? TIN_VARIETIES[variety]?.name : null;
    const species = monsterName(obj.corpsenm, state);
    const filling = vegetarian(state.mons?.[obj.corpsenm])
        ? species : `${species} meat`;
    if (variety === 0 || variety === 1)
        return `${preparation} tin of ${filling}`;
    return `tin of ${preparation ? `${preparation} ` : ''}${filling}`;
}

function foodBaseName(obj, state) {
    if (obj.otyp === O.SLIME_MOLD) {
        const fruit = fruit_from_indx(obj.spe, state);
        return fruit?.fname ?? 'fruit';
    }
    if (obj.otyp === O.TIN) return tinBaseName(obj, state);
    if (obj.otyp === O.CORPSE && obj.corpsenm !== NON_PM)
        return `${monsterName(obj.corpsenm, state)} corpse`;
    return objectActualName(obj, state);
}

function matchingArtifactFruit(name, state) {
    const candidate = String(name).replace(/^the /iu, '').toLowerCase();
    for (let index = 1; state.artilist?.[index]?.otyp; ++index) {
        const artifactName = state.artilist[index].name;
        if (typeof artifactName !== 'string') continue;
        const comparable = artifactName.replace(/^the /iu, '').toLowerCase();
        if (candidate === comparable) {
            return {
                forceThe: /^the /iu.test(artifactName),
                name: artifactName,
            };
        }
    }
    return null;
}

function gemBaseName(obj, state) {
    const type = objectType(obj, state);
    let name = objectActualName(obj, state);
    const isGemStone = obj.otyp === O.FLINT
        || (type.oc_material === O.GEMSTONE
            && ![
                O.DILITHIUM_CRYSTAL,
                O.RUBY,
                O.DIAMOND,
                O.SAPPHIRE,
                O.BLACK_OPAL,
                O.EMERALD,
                O.OPAL,
            ].includes(obj.otyp));
    if (isGemStone) name += ' stone';
    return name;
}

function baseObjectName(obj, state) {
    const actual = objectActualName(obj, state);
    const type = objectType(obj, state);
    switch (obj.oclass) {
    case O.AMULET_CLASS:
    case O.WEAPON_CLASS:
    case O.TOOL_CLASS:
    case O.COIN_CLASS:
    case O.CHAIN_CLASS:
    case O.ROCK_CLASS:
        return actual;
    case O.ARMOR_CLASS:
        if (obj.otyp >= O.GRAY_DRAGON_SCALES
            && obj.otyp <= O.YELLOW_DRAGON_SCALES) {
            return `set of ${actual}`;
        }
        if (type.oc_armcat === O.ARM_BOOTS
            || type.oc_armcat === O.ARM_GLOVES) {
            return `pair of ${actual}`;
        }
        return actual;
    case O.FOOD_CLASS:
        return foodBaseName(obj, state);
    case O.POTION_CLASS:
        if (obj.otyp === O.POT_WATER && (obj.blessed || obj.cursed)) {
            return `potion of ${obj.blessed ? 'holy' : 'unholy'} water`;
        }
        return `potion of ${actual}`;
    case O.SCROLL_CLASS:
        return `scroll of ${actual}`;
    case O.SPBOOK_CLASS:
        return obj.otyp === O.SPE_NOVEL
            || obj.otyp === O.SPE_BOOK_OF_THE_DEAD
            ? actual : `spellbook of ${actual}`;
    case O.WAND_CLASS:
        return `wand of ${actual}`;
    case O.RING_CLASS:
        return `ring of ${actual}`;
    case O.GEM_CLASS:
        return gemBaseName(obj, state);
    case O.BALL_CLASS:
        return obj.owt > type.oc_weight
            ? 'very heavy iron ball' : 'heavy iron ball';
    default:
        return actual;
    }
}

function pluralWord(word) {
    const lower = word.toLowerCase();
    if (['ya', 'shuriken', 'matzot'].includes(lower)) return word;
    const irregular = new Map([
        ['child', 'children'],
        ['foot', 'feet'],
        ['goose', 'geese'],
        ['knife', 'knives'],
        ['leaf', 'leaves'],
        ['mouse', 'mice'],
        ['staff', 'staves'],
        ['tooth', 'teeth'],
    ]);
    if (irregular.has(lower)) {
        const plural = irregular.get(lower);
        return /^[A-Z]/u.test(word)
            ? plural[0].toUpperCase() + plural.slice(1) : plural;
    }
    if (lower.endsWith('man')
        && !/(?:human|shaman|talisman)$/u.test(lower)) {
        return `${word.slice(0, -2)}en`;
    }
    if (/(?:[sxz]|ch|sh)$/u.test(lower)) return `${word}es`;
    if (/[^aeiou]y$/u.test(lower)) return `${word.slice(0, -1)}ies`;
    if (/(?:[aeioulr])f$/u.test(lower))
        return `${word.slice(0, -1)}ves`;
    return `${word}s`;
}

function pluralizeBaseName(name) {
    if (/^pair of /iu.test(name)) return name;
    const compound = name.indexOf(' of ');
    const head = compound >= 0 ? name.slice(0, compound) : name;
    const tail = compound >= 0 ? name.slice(compound) : '';
    const match = /^(.*?)([^\s]+)$/u.exec(head);
    if (!match) return `${name}s`;
    return `${match[1]}${pluralWord(match[2])}${tail}`;
}

function indefiniteArticle(text) {
    // NetHack's an() has a larger exception table. Startup objects which lack
    // a BUC or enchantment prefix only need the ordinary leading-vowel rule.
    return /^[aeiou]/iu.test(text) ? 'an' : 'a';
}

function isLampOrCandle(obj) {
    return obj.otyp === O.OIL_LAMP
        || obj.otyp === O.MAGIC_LAMP
        || obj.otyp === O.BRASS_LANTERN
        || obj.otyp === O.TALLOW_CANDLE
        || obj.otyp === O.WAX_CANDLE;
}

function identifiedStartingObjectName(obj, state) {
    const type = objectType(obj, state);
    const quantity = Math.trunc(obj.quan ?? 1);
    let base = baseObjectName(obj, state);
    const artifactFruit = obj.otyp === O.SLIME_MOLD
        ? matchingArtifactFruit(base, state) : null;
    if (quantity !== 1) {
        if (obj.otyp === O.SLIME_MOLD) {
            // xname() first singularizes user fruit names to avoid adding a
            // second plural suffix, then pluralizes the result.
            base = pluralizeBaseName(makesingular(base));
        } else {
            base = pluralizeBaseName(base);
        }
    }

    const prefixes = [];
    const empty = (isContainer(obj) || obj.otyp === O.STATUE) && !obj.cobj;
    if (empty) prefixes.push('empty');

    const identifiedHolyWater = obj.otyp === O.POT_WATER
        && (obj.blessed || obj.cursed)
        && Boolean(state.objects[O.POT_WATER].oc_name_known);
    if (obj.oclass !== O.COIN_CLASS && !identifiedHolyWater) {
        if (obj.cursed) prefixes.push('cursed');
        else if (obj.blessed) prefixes.push('blessed');
        else {
            const implicitUncursed = state.flags?.implicit_uncursed !== false;
            const cleric = state.urole?.mnum === M.PM_CLERIC;
            const omit = implicitUncursed
                && type.oc_charged
                && obj.oclass !== O.ARMOR_CLASS
                && obj.oclass !== O.RING_CLASS;
            if (!implicitUncursed || (!cleric && !omit))
                prefixes.push('uncursed');
        }
    }

    if (obj.opoisoned
        && (obj.oclass === O.WEAPON_CLASS || isWeptool(obj, state))) {
        prefixes.push('poisoned');
    }
    if (obj.oclass === O.WEAPON_CLASS
        || obj.oclass === O.ARMOR_CLASS
        || isWeptool(obj, state)) {
        prefixes.push(`${obj.spe >= 0 ? '+' : ''}${Math.trunc(obj.spe)}`);
    } else if (obj.oclass === O.RING_CLASS && type.oc_charged) {
        prefixes.push(`${obj.spe >= 0 ? '+' : ''}${Math.trunc(obj.spe)}`);
    }

    if (obj.otyp === O.EGG && obj.corpsenm !== NON_PM)
        prefixes.push(monsterName(obj.corpsenm, state));

    if ((obj.oclass === O.WAND_CLASS
        || (obj.oclass === O.TOOL_CLASS && type.oc_charged))
        && !isLampOrCandle(obj)) {
        base += ` (${Math.trunc(obj.recharged ?? 0)}:${Math.trunc(obj.spe)})`;
    }

    const description = [...prefixes, base].join(' ');
    if (quantity !== 1) return `${quantity} ${description}`;
    if (artifactFruit?.forceThe) {
        return `the ${[...prefixes, base.replace(/^the /iu, '')].join(' ')}`;
    }
    if (artifactFruit) return description;
    return `${indefiniteArticle(description)} ${description}`;
}

function attributeArray(value) {
    return Array.isArray(value) ? value : value?.a;
}

function effectiveAttribute(state, attribute) {
    const u = state.u;
    const total = Math.trunc(u.acurr?.a?.[attribute] ?? 0)
        + Math.trunc(attributeArray(u.abon)?.[attribute] ?? 0)
        + Math.trunc(attributeArray(u.atemp)?.[attribute] ?? 0);
    if (attribute === A_STR) return Math.max(3, Math.min(total, 125));
    return Math.max(3, Math.min(total, 25));
}

function rerollAttributeLine(state) {
    return `St:${strengthText(effectiveAttribute(state, A_STR))}`
        + ` Dx:${effectiveAttribute(state, A_DEX)}`
        + ` Co:${effectiveAttribute(state, A_CON)}`
        + ` In:${effectiveAttribute(state, A_INT)}`
        + ` Wi:${effectiveAttribute(state, A_WIS)}`
        + ` Ch:${effectiveAttribute(state, A_CHA)}`;
}

export function buildRerollMenuSpec(
    state = game,
    { displayRandom = rn2_on_display_rng } = {},
) {
    const lootabc = Boolean(state.flags?.lootabc);
    const items = [
        {
            selector: lootabc ? 'a' : 'p',
            label: 'start the game with this character',
            value: 'n',
        },
        {
            selector: lootabc ? 'b' : 'r',
            label: 'reroll another character',
            value: 'y',
        },
        { text: '' },
    ];
    for (let obj = state.invent; obj; obj = obj.nobj) {
        // invent.c:reroll_menu() computes the glyph before doname(). Keep the
        // order explicit even though ordinary startup glyphs are pure today.
        const glyphInfo = rerollObjectGlyphInfo(obj, state, displayRandom);
        const text = identifiedStartingObjectName(obj, state);
        items.push({
            text,
            glyphInfo,
        });
    }
    items.push({ text: '' }, { text: rerollAttributeLine(state) });

    return {
        title: REROLL_QUERY,
        ...menuTitleStyle(state),
        items,
        how: PICK_ONE,
        cancelValue: REPROMPT,
        emptyValue: REPROMPT,
        overlay: state.iflags?.menu_overlay !== false,
    };
}

function renderRerollPrompt(state) {
    const display = state.nhDisplay;
    if (!display) throw new Error('reroll prompt requires a tty display');
    const prompt = `${REROLL_QUERY} [yn] (n) `;
    display.clearRow(0);
    display.putstr(0, 0, prompt, NO_COLOR, 0);
    display.setCursor(prompt.length, 0);
    state._ttyToplines = prompt.trimEnd();
    display.topMessage = state._ttyToplines;
    display.toplines = state._ttyToplines;
    display.toplin = TOPLINE_SPECIAL_PROMPT;
    return prompt;
}

async function fallbackRerollChoice(state) {
    const prompt = renderRerollPrompt(state);
    let response;
    for (;;) {
        const code = await nhgetch();
        if (code === 0 || code === 10 || code === 13
            || code === 27 || code === 32) {
            response = 'n';
            break;
        }
        const key = String.fromCharCode(code & 0xFF).toLowerCase();
        if (key === 'y' || key === 'n') {
            response = key;
            break;
        }
    }
    // tty_yn_function() keeps the physical prompt un-echoed but appends the
    // accepted key to its logical topline for message history and the next
    // pline() boundary.
    state._ttyToplines = `${prompt}${response}`;
    state.nhDisplay.topMessage = state._ttyToplines;
    state.nhDisplay.toplines = state._ttyToplines;
    state.nhDisplay.toplin = TOPLINE_NON_EMPTY;
    return response;
}

// Returns true and increments numrerolls only when the player explicitly
// chooses to reroll, matching invent.c:reroll_menu().
export async function reroll_menu(state = game, options = {}) {
    const spec = buildRerollMenuSpec(state, options);
    const fullScreen = ttyMenuLayout(state.nhDisplay, spec).fullScreen;
    let choice = await selectTtyMenu(
        state,
        spec,
    );
    // tty_dismiss_nhwindow() repairs a full-screen gameplay menu with
    // docrt()+flush_screen(). Corner menus restore their saved rectangle in
    // dismissTtyMenu() and must not perform this extra redraw.
    if (fullScreen) {
        await docrt();
        await flush_screen(1);
    }
    if (choice === REPROMPT) choice = await fallbackRerollChoice(state);
    if (choice !== 'y') return false;

    const roleplay = state.u?.uroleplay;
    if (!roleplay)
        throw new Error('reroll_menu requires initialized u.uroleplay');
    roleplay.numrerolls = Math.trunc(roleplay.numrerolls ?? 0) + 1;
    return true;
}

export const _startupRerollInternals = Object.freeze({
    effectiveAttribute,
    fallbackRerollChoice,
    identifiedStartingObjectName,
    pluralizeBaseName,
    rerollAttributeLine,
    rerollObjectGlyphInfo,
    strengthText,
});
