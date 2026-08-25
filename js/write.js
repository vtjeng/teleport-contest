// write.js -- applying a magic marker to write scrolls and spellbooks.
// C ref: src/write.c cost(), write_ok(), dowrite(), new_book_description().

import {
    A_WIS,
    ECMD_CANCEL,
    ECMD_OK,
    ECMD_TIME,
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_NOFLAGS,
    GETOBJ_SUGGEST,
    HALLUC,
    HALLUC_RES,
    MAXULEV,
} from './const.js';
import { exercise } from './attrib.js';
import { wipeout_text } from './engrave.js';
import { game } from './gstate.js';
import { mungspaces, strstri, upstart } from './hacklib.js';
import { getobj, hold_another_object, obfree, useup } from './invent.js';
import { update_inventory } from './invent.js';
import { nohands } from './mondata.js';
import { PM_WIZARD } from './monsters.js';
import { bcsign, mksobj, objectType } from './obj.js';
import { aobjnam, The, yname } from './objnam.js';
import { discover_object, observe_object } from './o_init.js';
import {
    OBJ_DESCR,
    OBJ_NAME,
    SCR_AMNESIA,
    SCR_BLANK_PAPER,
    SCR_CHARGING,
    SCR_CONFUSE_MONSTER,
    SCR_CREATE_MONSTER,
    SCR_DESTROY_ARMOR,
    SCR_EARTH,
    SCR_ENCHANT_ARMOR,
    SCR_ENCHANT_WEAPON,
    SCR_FIRE,
    SCR_FOOD_DETECTION,
    SCR_GENOCIDE,
    SCR_GOLD_DETECTION,
    SCR_IDENTIFY,
    SCR_LIGHT,
    SCR_MAGIC_MAPPING,
    SCR_MAIL,
    SCR_PUNISHMENT,
    SCR_REMOVE_CURSE,
    SCR_SCARE_MONSTER,
    SCR_STINKING_CLOUD,
    SCR_TAMING,
    SCR_TELEPORTATION,
    SCROLL_CLASS,
    SPBOOK_CLASS,
    SPE_BLANK_PAPER,
    SPE_BOOK_OF_THE_DEAD,
    SPE_NOVEL,
} from './objects.js';
import { encumber_msg } from './pickup.js';
import { rn1, rn2, rnl } from './rng.js';
import { check_unpaid } from './shk.js';
import {
    known_spell,
    spe_Fresh,
    spe_GoingStale,
    spe_Unknown,
} from './spell.js';
import { heroIsBlind } from './startup_a11y.js';
import { ttyPline } from './tty_message.js';
import { getlin } from './windows.js';
import { Glib } from './wield.js';

// Thrown where write.c reaches a branch this port has not ported.
export class UnsupportedWriteError extends Error {
    constructor(branch) {
        super(`dowrite requires ${branch}`);
        this.name = 'UnsupportedWriteError';
        this.branch = branch;
    }
}

// C ref: write.c cost() (12-57). Returns the base ink cost for a scroll or
// spellbook type. The table values are copied verbatim from the C source.
export function cost(otmp, state) {
    if (otmp.oclass === SPBOOK_CLASS)
        return 10 * objectType(otmp.otyp, state).oc_level;

    switch (otmp.otyp) {
    case SCR_MAIL:
        return 2;
    case SCR_LIGHT:
    case SCR_GOLD_DETECTION:
    case SCR_FOOD_DETECTION:
    case SCR_MAGIC_MAPPING:
    case SCR_AMNESIA:
    case SCR_FIRE:
    case SCR_EARTH:
        return 8;
    case SCR_DESTROY_ARMOR:
    case SCR_CREATE_MONSTER:
    case SCR_PUNISHMENT:
        return 10;
    case SCR_CONFUSE_MONSTER:
        return 12;
    case SCR_IDENTIFY:
        return 14;
    case SCR_ENCHANT_ARMOR:
    case SCR_REMOVE_CURSE:
    case SCR_ENCHANT_WEAPON:
    case SCR_CHARGING:
        return 16;
    case SCR_SCARE_MONSTER:
    case SCR_STINKING_CLOUD:
    case SCR_TAMING:
    case SCR_TELEPORTATION:
        return 20;
    case SCR_GENOCIDE:
        return 30;
    case SCR_BLANK_PAPER:
    default:
        // C: impossible("You can't write such a weird scroll!");
        throw new Error("impossible: You can't write such a weird scroll!");
    }
    // C returns 1000 after the impossible(); unreachable in this port because
    // the impossible throws.
}

// C ref: write.c write_ok() (60-70). getobj callback for the object to write
// on. Suggests blank paper; downplays non-blank scrolls and spellbooks;
// excludes everything else.
export function write_ok(obj) {
    if (!obj || (obj.oclass !== SCROLL_CLASS && obj.oclass !== SPBOOK_CLASS))
        return GETOBJ_EXCLUDE;

    if (obj.otyp === SCR_BLANK_PAPER || obj.otyp === SPE_BLANK_PAPER)
        return GETOBJ_SUGGEST;

    return GETOBJ_DOWNPLAY;
}

// C ref: write.c dowrite() (74-385). Applying a magic marker to write on a
// scroll or spellbook. The `pen` argument is the magic marker object.
export async function dowrite(pen, state = game) {
    if (nohands(state.youmonst.data)) {
        await ttyPline('You need hands to be able to write!', state);
        return ECMD_OK;
    } else if (Glib(state)) {
        // C: Tobjnam(pen, "slip"), fingers_or_gloves(FALSE), dropx(pen).
        // dropx() needs newsym, encumberMessage, and extractExternalObject
        // hooks that this file does not wire. The Glib branch requires the
        // hero to have greasy hands, which no session exercises through
        // dowrite.
        throw new UnsupportedWriteError('dropx() for a Glib pen');
    }

    /* get paper to write on */
    const paper = await getobj('write on', write_ok, GETOBJ_NOFLAGS, state);
    if (!paper)
        return ECMD_CANCEL;
    // C ref: write.c:103-105. "book" for a novel, "spellbook" for other
    // spellbooks, "scroll" for scrolls.
    const typeword = (paper.otyp === SPE_NOVEL) ? 'book'
        : (paper.oclass === SPBOOK_CLASS) ? 'spellbook'
            : 'scroll';
    if (heroIsBlind(state)) {
        if (!paper.dknown) {
            await ttyPline(
                `You don't know whether that ${typeword} is blank or not.`,
                state,
            );
            return ECMD_OK;
        } else if (paper.oclass === SPBOOK_CLASS) {
            /* can't write a magic book while blind */
            // C: upstart(ysimple_name(pen)). yname() produces equivalent
            // output for a simple tool like a magic marker: both return
            // "your magic marker" for a non-shop-owned tool.
            await ttyPline(
                `${upstart(yname(pen, state))} can't create braille text.`,
                state,
            );
            return ECMD_OK;
        }
    }
    observe_object(paper, state);
    if (paper.otyp !== SCR_BLANK_PAPER && paper.otyp !== SPE_BLANK_PAPER) {
        await ttyPline(`That ${typeword} is not blank!`, state);
        await exercise(A_WIS, false, state, { rn2 },
                       { encumberMessage: encumber_msg });
        return ECMD_TIME;
    }
    // C: makeknown(SCR_BLANK_PAPER) expands to
    // discover_object(SCR_BLANK_PAPER, TRUE, TRUE, TRUE).
    discover_object(SCR_BLANK_PAPER, true, true, true, state, {
        random: { rn2 },
        hooks: {},
    });

    /* what to write */
    const namebuf = await getlin(
        `What type of ${typeword} do you want to write?`, state,
    );
    let nm = mungspaces(namebuf); /* remove any excess whitespace */
    if (nm[0] === '\x1b' || !nm)
        return ECMD_TIME;
    if (nm.toLowerCase().startsWith('scroll '))
        nm = nm.slice(7);
    else if (nm.toLowerCase().startsWith('spellbook '))
        nm = nm.slice(10);
    if (nm.toLowerCase().startsWith('of '))
        nm = nm.slice(3);

    // C ref: write.c:139-142. Normalize British "armour" to "armor".
    const armourPos = strstri(nm, ' armour');
    if (armourPos >= 0) {
        nm = nm.slice(0, armourPos) + ' armor' + nm.slice(armourPos + 7);
        nm = mungspaces(nm);
    }

    let deferred = 0; /* not any scroll or book */
    let real = 0;
    let deferralchance = 0; /* incremented for each oc_uname match */
    const first = state.svb.bases[paper.oclass];
    const last = state.svb.bases[paper.oclass + 1] - 1;
    let by_descr = false;
    let i;

    // C ref: write.c:149-171. First loop: look for match with
    // name/description.
    let found = false;
    for (i = first; i <= last; i++) {
        const type = objectType(i, state);
        /* extra shufflable descr not representing a real object */
        if (!OBJ_NAME(type, state))
            continue;

        if (OBJ_NAME(type, state).toLowerCase() === nm.toLowerCase()) {
            if (type.oc_name_known
                /* spellbooks can only be written by_name, so no need to
                   hold out for a 'better' by_descr match */
                || paper.oclass === SPBOOK_CLASS) {
                found = true;
                break;
            } else {
                /* save item in case there are no better by_descr matches */
                real = deferred = i;
                break;
            }
        }

        const descr = OBJ_DESCR(type, state);
        if (descr && descr.toLowerCase() === nm.toLowerCase()) {
            by_descr = true;
            found = true;
            break;
        }
    }

    if (!found) {
        // C ref: write.c:175-200. Second loop: look for match with
        // user-assigned name.
        for (i = first; i <= last; i++) {
            const type = objectType(i, state);
            /* player might assign same name multiple times and if so,
               we choose one of those matches randomly */
            if (type.oc_uname
                && type.oc_uname.toLowerCase() === nm.toLowerCase()
                /* prefer attempting to write the real scroll type if
                   the typename clobbers a real scroll and is known to
                   be incorrect */
                && !(real && type.oc_name_known)
                /*
                 * First match: chance incremented to 1,
                 *   !rn2(1) is 1, we remember i;
                 * second match: chance incremented to 2,
                 *   !rn2(2) has 1/2 chance to replace i;
                 * third match: chance incremented to 3,
                 *   !rn2(3) has 1/3 chance to replace i
                 *   and 2/3 chance to keep previous 50:50
                 *   choice; so on for higher match counts.
                 */
                && !rn2(++deferralchance)) {
                deferred = i;
                /* writing by user-assigned name is same as by description:
                   fails for books, works for scrolls (having an assigned
                   type name guarantees presence on discoveries list) */
                by_descr = true;
            }
        }

        if (deferred) {
            i = deferred;
            found = true;
        }
    }

    if (!found) {
        await ttyPline(`There is no such ${typeword}!`, state);
        return ECMD_TIME;
    }
    // C label: found

    if (i === SCR_BLANK_PAPER || i === SPE_BLANK_PAPER) {
        await ttyPline("You can't write that!", state);
        await ttyPline("It's obscene!", state);
        return ECMD_TIME;
    } else if (i === SPE_NOVEL) {
        const fanfic = !rn2(3);
        const tearup = !rn2(3);

        const halluc = heroHallucinating(state);
        if (!fanfic) {
            await ttyPline(
                `You ${!tearup ? 'prepare' : 'try'}`
                + ' to write the Great Yendorian Novel, but '
                + `${!halluc ? 'lack' : 'have too much'} inspiration.`,
                state,
            );
        } else {
            await ttyPline(
                `You ${!tearup ? 'start to ' : ''}produce really `
                + `${!halluc ? 'lame' : 'awesome'} fan-fiction.`,
                state,
            );
        }
        if (!tearup) {
            await ttyPline('You give up on the idea.', state);
        } else {
            await ttyPline('You tear it up.', state);
            useup(paper, writeEnv(state));
        }
        return ECMD_TIME;
    } else if (i === SPE_BOOK_OF_THE_DEAD) {
        await ttyPline('No mere dungeon adventurer could write that.', state);
        return ECMD_TIME;
    } else if (by_descr && paper.oclass === SPBOOK_CLASS
               && !objectType(i, state).oc_name_known) {
        /* can't write unknown spellbooks by description */
        await ttyPline(
            "Unfortunately you don't have enough information to go on.",
            state,
        );
        return ECMD_TIME;
    }

    /* KMH, conduct */
    state.u.uconduct ??= {};
    if (!state.u.uconduct.literate++) {
        // C: livelog_printf(LL_CONDUCT, "became literate by writing %s",
        //                   an(typeword));
        // The livelog is not ported; the conduct counter is incremented above.
    }

    // C: mksobj(i, FALSE, FALSE). init=false skips property initialization;
    // artif=false skips artifact creation. The env needs state for object
    // identity numbering (next_ident uses rnd).
    const new_obj = mksobj(i, false, false, { state });
    new_obj.bknown = (paper.bknown && pen.bknown);

    /* shk imposes a flat rate per use, not based on actual charges used */
    check_unpaid(pen, state);

    /* see if there's enough ink */
    const basecost = cost(new_obj, state);
    if (pen.spe < Math.trunc(basecost / 2)) {
        await ttyPline('Your marker is too dry to write that!', state);
        obfree(new_obj, null, writeEnv(state));
        return ECMD_TIME;
    }

    /* we're really going to write now, so calculate cost */
    const actualcost = rn1(Math.trunc(basecost / 2), Math.trunc(basecost / 2));
    const curseval = bcsign(pen) + bcsign(paper);
    await exercise(A_WIS, true, state, { rn2 },
                   { encumberMessage: encumber_msg });
    /* dry out marker */
    if (pen.spe < actualcost) {
        pen.spe = 0;
        await ttyPline('Your marker dries out!', state);
        /* scrolls disappear, spellbooks don't */
        if (paper.oclass === SPBOOK_CLASS) {
            await ttyPline(
                'The spellbook is left unfinished and your writing fades.',
                state,
            );
            update_inventory(writeEnv(state));
        } else {
            await ttyPline(
                'The scroll is now useless and disappears!', state,
            );
            useup(paper, writeEnv(state));
        }
        obfree(new_obj, null, writeEnv(state));
        return ECMD_TIME;
    }
    pen.spe -= actualcost;

    /* Writing by name requires that the hero knows the scroll or book type. */
    let spell_knowledge;
    if (paper.oclass === SPBOOK_CLASS) {
        spell_knowledge = known_spell(new_obj.otyp, state);
    } else {
        spell_knowledge = spe_Unknown;
    }
    /* if known, then either by-name or by-descr works */
    if (!objectType(new_obj.otyp, state).oc_name_known
        /* else if named, then only by-descr works */
        && !(by_descr && objectType(new_obj.otyp, state).oc_encountered)
        /* else fresh knowledge of the spell works */
        && spell_knowledge !== spe_Fresh
        /* and Luck might override after previous checks have failed */
        && rnl(((state.urole?.mnum === PM_WIZARD
                 && paper.oclass !== SPBOOK_CLASS)
                || spell_knowledge === spe_GoingStale)
               ? 5 : 15)) {
        await ttyPline(
            `You ${by_descr ? 'fail' : "don't know how"} to write that.`,
            state,
        );
        /* scrolls disappear, spellbooks don't */
        if (paper.oclass === SPBOOK_CLASS) {
            await ttyPline(
                'You write in your best handwriting:  "My Diary",'
                + ' but it quickly fades.',
                state,
            );
            update_inventory(writeEnv(state)); /* pen charges */
        } else {
            let writtenText;
            if (by_descr) {
                writtenText = OBJ_DESCR(
                    objectType(new_obj.otyp, state), state,
                ) ?? '';
                writtenText = wipeout_text(
                    writtenText,
                    Math.trunc((6 + MAXULEV - (state.u.ulevel ?? 0)) / 6),
                    0,
                );
            } else {
                writtenText = `${state.plname ?? ''} was here!`;
            }
            await ttyPline(
                `You write "${writtenText}" and the scroll disappears.`,
                state,
            );
            useup(paper, writeEnv(state));
        }
        obfree(new_obj, null, writeEnv(state));
        return ECMD_TIME;
    }
    /* can write scrolls when blind, but requires luck too;
       attempts to write books when blind are caught above */
    if (heroIsBlind(state) && rnl(3)) {
        /* writing while blind usually fails regardless of whether the
           target scroll is known */
        await ttyPline(
            'You fail to write the scroll correctly and it disappears.',
            state,
        );
        useup(paper, writeEnv(state));
        obfree(new_obj, null, writeEnv(state));
        return ECMD_TIME;
    }

    /* use up old scroll / spellbook */
    useup(paper, writeEnv(state));

    /* success */
    if (new_obj.oclass === SPBOOK_CLASS) {
        /* acknowledge the change in the object's description... */
        await ttyPline(
            'The spellbook warps strangely, then turns '
            + `${new_book_description(new_obj.otyp, state)}.`,
            state,
        );
    }
    new_obj.blessed = (curseval > 0);
    new_obj.cursed = (curseval < 0);
    if (new_obj.otyp === SCR_MAIL) {
        /* 0: delivered in-game via external event (or randomly for fake
           mail); 1: from bones or wishing; 2: written with marker */
        new_obj.spe = 2;
    }
    /* unlike alchemy, for example, a successful result yields the
       specifically chosen item so hero recognizes it even if blind;
       the exception is for being lucky writing an undiscovered scroll,
       where the label associated with the type-name isn't known yet;
       but if writing by description, the description is always known */
    new_obj.dknown = false;
    if (objectType(new_obj.otyp, state).oc_name_known || by_descr)
        observe_object(new_obj, state);

    const held = await hold_another_object(
        new_obj,
        'Oops!  %s out of your grasp!',
        The(aobjnam(new_obj, 'slip', state)),
        null,
        writeEnv(state),
    );
    // C: nhUse(new_obj) to avoid compiler warning about dead assignment.
    // Not needed in JavaScript.
    return ECMD_TIME;
}

// C ref: write.c new_book_description() (394-418). Returns the description of
// a newly written spellbook, prepending "into " for composition materials
// (parchment, vellum, cloth) where "turns red" reads naturally but "turns
// vellum" does not.
export function new_book_description(booktype, state) {
    const compositions = ['parchment', 'vellum', 'cloth'];

    const descr = OBJ_DESCR(objectType(booktype, state), state);
    const isComposition = compositions.some(
        (c) => c.toLowerCase() === descr.toLowerCase(),
    );
    return `${isComposition ? 'into ' : ''}${descr}`;
}

// Build a write-command environment suitable for obfree, useup, etc.
// The freshly-mksobj'd new_obj is OBJ_FREE with no timers, leash, light,
// or shop bill, so obfree needs no lifecycle hooks. useup's paper is ordinary
// blank paper -- not worn, not timed, not an artifact, not a leash.
function writeEnv(state) {
    return { state, hooks: {} };
}

// C ref: apply.js heroHallucinating(), duplicated here to match the youprop.h
// pattern each file replicates. Hallucination is the intrinsic timeout alone
// minus resistance from either source.
function heroHallucinating(state) {
    const hallucination = state.u?.uprops?.[HALLUC];
    const resistance = state.u?.uprops?.[HALLUC_RES];
    if (!hallucination || !resistance)
        throw new Error('Hallucination requires initialized u.uprops');
    return Boolean(hallucination.intrinsic
        && !(resistance.intrinsic || resistance.extrinsic));
}

/*write.js*/
