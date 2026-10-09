// questpgr.js -- quest text and quest-artifact bookkeeping.
// C ref: questpgr.c com_pager_core(), com_pager(), qt_pager(),
// convert_line(), convert_arg(), qtext_pronoun(), ldrname(), neminame(),
// guardname(), homebase(), intermed(), and is_quest_artifact().

import {
    A_CHAOTIC,
    A_LAWFUL,
    A_ORIGINAL,
    BLINDED,
    MIN_QUEST_LEVEL,
    NEUTRAL,
} from './const.js';
import { game } from './gstate.js';
import { MS_LEADER, MS_NEMESIS, MS_GUARDIAN } from './monsters.js';
import { note_unported } from './unported.js';
import { s_suffix } from './hacklib.js';
import { align_str } from './insight.js';
import { type_is_pname } from './mondata.js';
import { makeplural, makesingular } from './fruit.js';
import { an, the } from './objnam.js';
import { align_gname } from './pray.js';
import { QUEST_TEXT_DATA } from './quest_text_data.js';
import { rn2 } from './rng.js';
import { rankOf } from './roles.js';
import { ttyPline } from './tty_message.js';
import { displayTtyTextWindow } from './tty_menu.js';

// C ref: questpgr.c quest_info(). Role quest identities remain fixed even
// when a quest monster changes shape.
export function quest_info(typ, state = game) {
    switch (typ) {
    case 0: return state.urole.questarti;
    case MS_LEADER: return state.urole.ldrnum;
    case MS_NEMESIS: return state.urole.neminum;
    case MS_GUARDIAN: return state.urole.guardnum;
    default: note_unported('pline.c impossible');
    }
    return 0;
}

// C refs: questpgr.c com_pager_core(), nhlua.c nhl_init(), dat/nhlib.lua.
// Every pager owns a fresh Lua state; loading nhlib shuffles its private
// three-entry alignment table even when the selected quest text is fixed.
export function initializeQuestPagerLua(random = rn2) {
    const align = ['law', 'neutral', 'chaos'];
    for (let index = align.length; index > 1; --index) {
        const selected = random(index);
        [align[index - 1], align[selected]] = [
            align[selected], align[index - 1],
        ];
    }
    return align;
}

// C ref: questpgr.c skip_pager(boolean common UNUSED). The wizard-kit setup
// flag suppresses the whole pager before nhl_init() loads nhlib.lua, so this
// check must run before initializeQuestPagerLua() consumes its shuffle draws.
export function skip_pager(state = game) {
    return Boolean(state.program_state?.wizkit_wishing);
}

// C ref: questpgr.c ldrname().  Returns the leader's name, prefixed with
// "the " when it is not a proper name.
export function ldrname(state) {
    const leader = state.mons?.[state.urole?.ldrnum];
    const name = leader?.pmnames?.[NEUTRAL];
    if (!name) return 'your leader';
    return type_is_pname(leader) ? name : `the ${name}`;
}

// C ref: questpgr.c neminame().  Returns the nemesis's name, prefixed with
// "the " when it is not a proper name.
function neminame(state) {
    const nemesis = state.mons?.[state.urole?.neminum];
    const name = nemesis?.pmnames?.[NEUTRAL];
    if (!name) return 'your nemesis';
    return type_is_pname(nemesis) ? name : `the ${name}`;
}

// C ref: questpgr.c guardname().  Returns the guardian monster name without
// any article.
function guardname(state) {
    const guard = state.mons?.[state.urole?.guardnum];
    return guard?.pmnames?.[NEUTRAL] ?? 'guard';
}

// C ref: questpgr.c intermed().
function intermed(state) {
    return state.urole?.intermed ?? 'the intermediate level';
}

// C ref: questpgr.c homebase().
function homebase(state) {
    return state.urole?.homebase ?? 'your home base';
}

// C ref: pray.c align_gtitle().  Returns "god" or "goddess" based on
// whether the deity name starts with underscore (the C convention for
// female deities).
function align_gtitle(alignment, state) {
    let gnam;
    switch (alignment) {
    case A_LAWFUL:  gnam = state.urole?.lgod; break;
    case NEUTRAL:   gnam = state.urole?.ngod; break;
    case A_CHAOTIC: gnam = state.urole?.cgod; break;
    default:        gnam = null; break;
    }
    return (gnam && gnam.startsWith('_')) ? 'goddess' : 'god';
}

// C ref: artifacts.c artiname().
function artiname(state) {
    // Import avoided to prevent circular dependency; use the artifact
    // list directly if available.
    const arti = state.artilist?.[state.urole?.questarti];
    return arti?.name ?? 'the quest artifact';
}

// C ref: questpgr.c qtext_pronoun().  Pronoun selection based on the
// gender of the quest figure named by `who` ('d' deity, 'l' leader,
// 'n' nemesis, 'o' artifact).
const GENDERS = [
    // indexed by gend: 0=male, 1=female, 2=neuter
    { he: 'he',  him: 'him',  his: 'his'  },
    { he: 'she', him: 'her',  his: 'her'  },
    { he: 'it',  him: 'it',   his: 'its'  },
];

// C ref: questpgr.c:qtext_pronoun() (200-236). The caller supplies C's
// cvt_buf name; return its replacement instead of sharing a mutable buffer.
export function qtext_pronoun(who, which, state, name = '') {
    const lwhich = which.toLowerCase();
    let pnoun;
    if (who === 'o' && (name.toLowerCase().includes('eyes ')
        || name.toLowerCase() !== makesingular(name).toLowerCase())) {
        pnoun = lwhich === 'h' ? 'they' : lwhich === 'i' ? 'them'
            : lwhich === 'j' ? 'their' : '?';
    } else {
        const status = state.svq?.quest_status;
        const gend = who === 'd' ? status?.godgend ?? 2
            : who === 'l' ? status?.ldrgend ?? 2
                : who === 'n' ? status?.nemgend ?? 2 : 2;
        const entry = GENDERS[gend];
        pnoun = lwhich === 'h' ? entry.he : lwhich === 'i' ? entry.him
            : lwhich === 'j' ? entry.his : '?';
    }
    if (which !== lwhich) pnoun = pnoun[0].toUpperCase() + pnoun.slice(1);
    return pnoun;
}

// C ref: questpgr.c convert_arg().  Returns the raw substitution value
// for a single %-code character.
function convertArg(c, state) {
    switch (c) {
    case 'p': return state.plname ?? 'player';
    case 'c': {
        const role = state.urole;
        return (state.flags?.female && role?.name?.f)
            ? role.name.f : (role?.name?.m ?? 'adventurer');
    }
    // C ref: questpgr.c convert_arg() 248-253, rank_of(lev, Role_switch,
    // flags.female). js/roles.js rankOf() is this port's rank_of(); the status
    // line and insight.c's rank title already read the hero's rank through it.
    case 'r': return rankOf(
        state.urole, state.u?.ulevel ?? 1, state.flags?.female,
    ) ?? 'adventurer';
    case 'R': return rankOf(
        state.urole, MIN_QUEST_LEVEL, state.flags?.female,
    ) ?? 'adventurer';
    case 's': return state.flags?.female ? 'sister' : 'brother';
    case 'S': return state.flags?.female ? 'daughter' : 'son';
    case 'l': return ldrname(state);
    case 'i': return intermed(state);
    case 'O': case 'o': {
        const name = the(artiname(state), state);
        if (c === 'O') {
            const idx = name.toLowerCase().indexOf(' of ');
            return idx >= 0 ? name.slice(0, idx) : name;
        }
        return name;
    }
    case 'n': return neminame(state);
    case 'g': return guardname(state);
    case 'G': return align_gtitle(
        state.u?.ualignbase?.[A_ORIGINAL] ?? 0, state);
    case 'H': return homebase(state);
    case 'a': return align_str(state.u?.ualignbase?.[A_ORIGINAL] ?? 0);
    case 'A': return align_str(state.u?.ualign?.type ?? 0);
    case 'd': return align_gname(
        state.u?.ualignbase?.[A_ORIGINAL] ?? 0, state);
    case 'D': return align_gname(A_LAWFUL, state);
    case 'C': return 'chaotic';
    case 'N': return 'neutral';
    case 'L': return 'lawful';
    case 'x': {
        const blinded = state.u?.uprops?.[BLINDED];
        const blind = Boolean(
            (blinded?.intrinsic || blinded?.extrinsic)
            && !state.u?.uroleplay?.blind);
        return blind ? 'sense' : 'see';
    }
    case 'Z': return state.svd?.dungeons?.[0]?.dname
        ?? 'The Dungeons of Doom';
    case '%': return '%';
    default: return '';
    }
}

// C ref: questpgr.c convert_line().  Processes one line of quest text,
// replacing %-code sequences with their values.  The format is:
//   %<arg>[<modifier>]
// where <arg> is one of the letters handled by convertArg, and
// <modifier> is an optional suffix: A/a (article), C (capitalize),
// h/H/i/I/j/J (pronoun), P/p (plural), S/s (possessive), t (strip "the").
export function convertLine(line, state) {
    let out = '';
    let i = 0;
    while (i < line.length) {
        if (line[i] === '%' && i + 1 < line.length) {
            i++; // skip %
            const argChar = line[i];
            i++;
            let cvtBuf = convertArg(argChar, state);

            // Check for modifier
            if (i < line.length) {
                const mod = line[i];
                switch (mod) {
                case 'A': {
                    // An prefix
                    const first = cvtBuf[0]?.toUpperCase() ?? '';
                    out += 'aeiouAEIOU'.includes(first)
                        ? `An ${cvtBuf}` : `A ${cvtBuf}`;
                    i++;
                    continue;
                }
                case 'a': {
                    out += an(cvtBuf);
                    i++;
                    continue;
                }
                case 'C':
                    cvtBuf = cvtBuf[0]?.toUpperCase()
                        + cvtBuf.slice(1);
                    i++;
                    break;
                case 'h': case 'H':
                case 'i': case 'I':
                case 'j': case 'J':
                    if ('dlno'.includes(argChar.toLowerCase())) {
                        cvtBuf = qtext_pronoun(argChar, mod, state, cvtBuf);
                        i++;
                    }
                    // else fall through to default (mod not consumed)
                    break;
                case 'P':
                    cvtBuf = cvtBuf[0]?.toUpperCase()
                        + cvtBuf.slice(1);
                    cvtBuf = makeplural(cvtBuf);
                    i++;
                    break;
                case 'p':
                    cvtBuf = makeplural(cvtBuf);
                    i++;
                    break;
                case 'S':
                    cvtBuf = cvtBuf[0]?.toUpperCase()
                        + cvtBuf.slice(1);
                    cvtBuf = s_suffix(cvtBuf);
                    i++;
                    break;
                case 's':
                    cvtBuf = s_suffix(cvtBuf);
                    i++;
                    break;
                case 't':
                    if (cvtBuf.toLowerCase().startsWith('the ')) {
                        cvtBuf = cvtBuf.slice(4);
                    }
                    i++;
                    break;
                default:
                    // No modifier; don't consume the character.
                    break;
                }
            }
            out += cvtBuf;
        } else {
            out += line[i];
            i++;
        }
    }
    return out;
}

// The two window-port entry points questpgr.c uses. A caller that must stay
// silent -- the monster-movement dry run in js/unported_monster_actions.js
// replaces both, so the shuffle and the %-code conversion still run while
// nothing reaches the terminal and nothing waits for a key.
export const QUEST_PAGER_OUTPUT = Object.freeze({
    pline: ttyPline,
    window: displayTtyTextWindow,
});

// C ref: questpgr.c deliver_by_pline().  Splits multi-line text at
// newlines and delivers each line via pline.
async function deliverByPline(text, state, output) {
    const lines = text.split('\n');
    for (const line of lines) {
        const converted = convertLine(line, state);
        await output.pline(converted, state);
    }
}

// C ref: questpgr.c deliver_by_window().  Splits multi-line text at
// newlines, converts each line, and shows them in a text window.
async function deliverByWindow(text, state, output) {
    const lines = text.split('\n');
    const converted = lines.map((line) => ({
        text: convertLine(line, state),
    }));
    await output.window(state, converted);
}

// BUFSZ - 1 from the C source.
const BUFSZ = 256;

// C ref: questpgr.c com_pager_core().  Looks up a quest message by
// section (role filecode) and message ID, produces the nhlib shuffle,
// reads the text and output mode, and delivers the message.
async function comPagerCore(
    section, msgid, showerror, state, random, output,
) {
    if (skip_pager(state)) return false;
    initializeQuestPagerLua(random);

    const sectionData = QUEST_TEXT_DATA[section];
    if (!sectionData) {
        if (showerror)
            throw new Error(`com_pager: section ${section} not found`);
        return false;
    }

    let fallbackMsgid = null;
    let entry = sectionData[msgid];
    if (!entry) {
        // Try msg_fallbacks.
        fallbackMsgid = QUEST_TEXT_DATA.msg_fallbacks?.[msgid] ?? null;
        if (fallbackMsgid) entry = sectionData[fallbackMsgid];
    }
    if (!entry) {
        if (showerror)
            throw new Error(
                `com_pager: ${section}.${msgid} not found`);
        return false;
    }

    let text = null;
    let outputMode = 'default';
    let synopsis = null;
    if (Array.isArray(entry)) {
        // Raw Lua array: com_pager_core() chooses one 1-based array element.
        const nelems = entry.length;
        if (nelems < 2) {
            if (showerror)
                throw new Error(
                    `com_pager: ${section}.${msgid} array too short`);
            return false;
        }
        text = entry[random(nelems)];
    } else if (entry && typeof entry === 'object') {
        text = entry.text ?? null;
        outputMode = entry.output ?? 'default';
        synopsis = entry.synopsis ?? null;
    }
    if (typeof text !== 'string') {
        if (showerror)
            throw new Error(
                `com_pager: ${section}.${msgid} has no text`);
        return false;
    }

    // Determine output mode.  C maps: pline=1, window=2, text=2, menu=3,
    // default=0.  Mode 0 upgrades to 2 when the text contains newlines or
    // exceeds BUFSZ.
    const OUTPUT_MAP = {
        pline: 1, window: 2, text: 2, menu: 3, default: 0,
    };
    let mode = OUTPUT_MAP[outputMode] ?? 0;
    if (mode === 0
        && (text.includes('\n') || text.length >= BUFSZ - 1)) {
        mode = 2;
    }

    if (mode === 0 || mode === 1) {
        await deliverByPline(text, state, output);
    } else {
        await deliverByWindow(text, state, output);
    }

    // C ref: questpgr.c com_pager_core() 597-609.  Synopsis goes into
    // message history via putmsghistory().  The port uses ttyPline for the
    // synopsis so it appears in the message window and --More-- recall.
    if (synopsis) {
        const converted = convertLine(synopsis, state);
        // putmsghistory equivalent: add to message history without
        // displaying.  The port doesn't have a separate message history
        // yet, so this is a no-op for now.
        // TODO: implement putmsghistory
    }

    return true;
}

// C ref: questpgr.c qt_pager().  Tries the role-specific section first,
// then falls back to the common section.
export async function qt_pager(
    msgid, state = game, random = rn2, output = QUEST_PAGER_OUTPUT,
) {
    if (!await comPagerCore(
        state.urole?.filecode, msgid, false, state, random, output)) {
        await comPagerCore('common', msgid, true, state, random, output);
    }
}

// C ref: questpgr.c com_pager(). The wrapper selects the common section;
// comPagerCore owns the single Lua initialization and message delivery.
export async function com_pager(
    messageId,
    state = game,
    { message = ttyPline, random = rn2 } = {},
) {
    return await comPagerCore(
        'common', messageId, true, state, random,
        { pline: message, window: displayTtyTextWindow },
    );
}

// C ref: questpgr.c is_quest_artifact() (66-70).  gu.urole.questarti is the
// artifact number of the role's quest artifact and is nonzero for every role,
// so an object carrying no artifact is never one.
export function is_quest_artifact(otmp, state = game) {
    return otmp.oartifact === state.urole.questarti;
}
