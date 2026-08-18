// Item erosion, and the fire that burns the armor a victim wears.
// C refs: trap.c burnarmor(), erode_obj() and grease_protect().
//
// These are trap.c functions and belong beside js/trap.js's maketrap() group
// by file name; js/trap_effects.js records why that file's display, naming and
// monster edges are split out of js/trap.js instead.
//
// erode_obj() covers its hero-victim and monster-victim arms. Its third
// victim, a floor object, is refused: C decides that one through `visobj`,
// which reads gb.bhitpos, and no ported caller passes an object that is
// neither carried nor mcarried.
//
// burnarmor() covers the hero half. which_armor() picks the same five slots
// for a monster, but trap.c dofiretrap() and explode.c explode() are its
// monster-victim callers and neither is ported, so that half stops at the top
// of the function.

import {
    EF_DESTROY,
    EF_GREASE,
    EF_PAY,
    EF_VERBOSE,
    ERODE_BURN,
    ERODE_CORRODE,
    ERODE_CRACK,
    ERODE_ROT,
    ERODE_RUST,
    ER_DAMAGED,
    ER_GREASED,
    ER_NOTHING,
    MAX_ERODE,
    OBJ_MINVENT,
    materialnm,
} from './const.js';
import { monsterPossessive } from './do_name.js';
import { carrying, update_inventory } from './invent.js';
import { AD_ACID, AD_FIRE } from './monsters.js';
import {
    carried,
    erosionMatters,
    isCorrodeable,
    isCrackable,
    isFlammable,
    isRottable,
    isRustprone,
    objectType,
} from './obj.js';
import { TOWEL } from './objects.js';
import {
    cloak_simple_name,
    helm_simple_name,
    xnameFresh,
} from './objnam.js';
import { canSeeMonster, heroIsBlind } from './startup_a11y.js';
import { ttyPline } from './tty_message.js';
import { inventory_resistance_check } from './zap.js';

// C ref: trap.c erode_obj()'s three static tables (177-182), one row per
// ERODE_* value, together with the `vulnerable` predicate and the `is_primary`
// bit its switch (202-236) sets for that value. `resistanceDamageType` is that
// switch's other output: only ERODE_BURN and ERODE_CORRODE ask whether the
// hero has an equipped item protecting the pack, and it names the damage type
// they ask about.
const EROSION = Object.freeze({
    [ERODE_BURN]: {
        action: 'smoulder',
        affectedBy: 'heat',
        checkGrease: false,
        primary: true,
        resistanceDamageType: AD_FIRE,
        result: 'burnt',
        vulnerable: isFlammable,
    },
    [ERODE_RUST]: {
        action: 'rust',
        affectedBy: 'oxidation',
        checkGrease: true,
        primary: true,
        resistanceDamageType: 0,
        result: 'rusted',
        vulnerable: isRustprone,
    },
    [ERODE_ROT]: {
        action: 'rot',
        affectedBy: 'decay',
        checkGrease: false,
        primary: false,
        resistanceDamageType: 0,
        result: 'rotten',
        vulnerable: isRottable,
    },
    [ERODE_CORRODE]: {
        action: 'corrode',
        affectedBy: 'corrosion',
        checkGrease: true,
        primary: false,
        resistanceDamageType: AD_ACID,
        result: 'corroded',
        vulnerable: isCorrodeable,
    },
    [ERODE_CRACK]: {
        action: 'crack',
        affectedBy: 'impact',
        checkGrease: true,
        primary: true,
        resistanceDamageType: 0,
        result: 'cracked',
        vulnerable: isCrackable,
    },
});

function erosionOperation(env, name, fallback) {
    const operation = env[name] ?? fallback;
    if (typeof operation !== 'function')
        throw new TypeError(`item erosion requires a ${name} operation`);
    return operation;
}

function pluralDescription(description) {
    return /(?:s|teeth)$/u.test(description)
        && !/(?:ss|us)$/u.test(description);
}

function verbFor(description, verb) {
    if (pluralDescription(description)) return verb;
    if (verb === 'are') return 'is';
    return `${verb}s`;
}

function currentErosion(obj, primary) {
    return Math.trunc(primary ? obj.oeroded ?? 0 : obj.oeroded2 ?? 0);
}

function setErosion(obj, primary, amount) {
    if (primary) obj.oeroded = amount;
    else obj.oeroded2 = amount;
}

// A refusal this file raises where trap.c acts. js/cmd.js
// failClosedCommandRefusals() lists it, so a segment ends at the branch
// instead of discarding every frame the command already matched.
export class UnsupportedErosionError extends Error {
    constructor(branch) {
        super(`trap.c item erosion reached ${branch}`);
        this.name = 'UnsupportedErosionError';
        this.branch = branch;
    }
}

// C ref: trap.c erode_obj() (170-353), "Generic erode-item function".
// "ostr", if non-null, is an alternate string to print instead of the object's
// name; "type" is an ERODE_* value; "flags" is an or-ed list of EF_* flags.
// Returns an ER_* value.
//
// Two of C's three victims are here. `visobj`, the third, decides whether a
// floor object's erosion is visible from gb.bhitpos; both ported callers hand
// over an object a victim is carrying, so the entry below refuses the rest
// rather than guessing at that coordinate. With visobj false, C's four
// message subjects collapse to two, which is what `possessive` holds.
//
// EF_PAY (costly_alteration()) and EF_DESTROY (remove_worn_item(), delobj()
// and the whole ER_DESTROYED arm at 301-341) are refused for the same reason:
// no ported caller sets either bit.
export async function erode_obj(obj, description, type, flags, env) {
    if (!obj) return ER_NOTHING;
    if (flags & (EF_PAY | EF_DESTROY)) {
        throw new RangeError(
            'item erosion does not own payment or object destruction',
        );
    }
    // C's `uvictim`; `vismon` follows once the message operations resolve.
    const uvictim = carried(obj);
    if (!uvictim && (obj.where !== OBJ_MINVENT || !obj.ocarry)) {
        throw new RangeError(
            'item erosion requires a carried object; visobj is unported',
        );
    }

    const details = EROSION[type];
    if (!details) throw new RangeError(`invalid erosion type ${type}`);
    const { state } = env;
    const random = env.random;
    const message = erosionOperation(env, 'message', ttyPline);
    const vismon = !uvictim && erosionOperation(
        env,
        'canSeeMonster',
        canSeeMonster,
    )(obj.ocarry, state);
    const visible = uvictim || vismon;

    // trap.c:202-206 and 218-222, inside the switch that also selects the
    // table row above. The roll comes before every other test, so an equipped
    // protection spends its draw whatever the item turns out to be.
    if (details.resistanceDamageType && uvictim
        && inventory_resistance_check(details.resistanceDamageType, state,
                                      random))
        return ER_NOTHING;
    const vulnerable = details.vulnerable(obj, state);
    const erosion = currentErosion(obj, details.primary);

    const name = description || xnameFresh(obj, state);
    // C's two remaining message subjects. The capitalized form opens a
    // sentence; the lower-case one sits after "Somehow,".
    const possessive = uvictim
        ? 'Your' : monsterPossessive(obj.ocarry, state, true);
    const lowerPossessive = uvictim
        ? 'your' : monsterPossessive(obj.ocarry, state);
    const verbose = state.flags?.verbose !== false;
    const print = Boolean(flags & EF_VERBOSE);

    // C ref: trap.c grease_protect() (358-385), inlined at its one reachable
    // call site. Its `ostr == NULL` arm is unreachable, because erode_obj()
    // fills ostr in from cxname() above. erode_obj() answers ER_GREASED
    // whether or not the grease wore off.
    //
    // C's guard at trap.c:246 is `check_grease && otmp->greased`, and
    // check_grease is not the caller's flag alone: the switch above clears it
    // inside `case ERODE_BURN` (208) and `case ERODE_ROT` (217), so grease
    // protects against rust, corrosion and cracking and never against fire or
    // decay. `details.checkGrease` carries that third switch output, beside
    // the vulnerability test and the resistance damage type.
    if (details.checkGrease && (flags & EF_GREASE) && obj.greased) {
        if (visible) {
            await message(
                `${possessive} ${name} ${verbFor(name, 'are')} `
                + 'protected by the layer of grease!',
                state,
            );
        }
        if (!random.rn2(2)) {
            obj.greased = false;
            if (uvictim) {
                await message('The grease dissolves.', state);
                update_inventory({ state });
            }
        }
        return ER_GREASED;
    }
    if (!erosionMatters(obj, state)) return ER_NOTHING;

    if (!vulnerable || (obj.oerodeproof && obj.rknown)) {
        if (verbose && print && visible) {
            await message(
                `${possessive} ${name} ${verbFor(name, 'are')} `
                + `not affected by ${details.affectedBy}.`,
                state,
            );
        }
        return ER_NOTHING;
    }

    if (obj.oerodeproof
        || (obj.blessed && !random.rnl(4))) {
        if (verbose && (print || obj.oerodeproof) && visible) {
            await message(
                `Somehow, ${lowerPossessive} `
                + `${name} ${verbFor(name, 'are')} not affected by the `
                + `${details.affectedBy}.`,
                state,
            );
        }
        if (obj.oerodeproof) {
            obj.rknown = true;
            if (uvictim) update_inventory({ state });
        }
        return ER_NOTHING;
    }

    if (erosion < MAX_ERODE) {
        const next = erosion + 1;
        if (visible) {
            const adverb = next === MAX_ERODE
                ? ' completely'
                : erosion ? ' further' : '';
            await message(
                `${possessive} ${name} `
                + `${verbFor(name, details.action)}${adverb}!`,
                state,
            );
        }
        setErosion(obj, details.primary, next);
        if (uvictim) update_inventory({ state });
        return ER_DAMAGED;
    }

    if (verbose && print) {
        if (uvictim) {
            await message(
                `Your ${name} `
                + `${verbFor(name, heroIsBlind(state) ? 'feel' : 'look')} `
                + `completely ${details.result}.`,
                state,
            );
        } else if (vismon) {
            await message(
                `${possessive} ${name} ${verbFor(name, 'look')} completely `
                + `${details.result}.`,
                state,
            );
        }
    }
    return ER_NOTHING;
}

// C ref: trap.c burn_dmg() (111), the macro burnarmor() wraps every slot in.
function burn_dmg(obj, description, env) {
    return erode_obj(obj, description, ERODE_BURN, EF_GREASE, env);
}

// C ref: trap.c burnarmor() (87-160). "called when you're hit by fire
// (dofiretrap,buzz,zapyourself,explode); returns TRUE if hit on torso".
//
// The rn2(5) picks one of five armor slots. Four of them draw again when that
// slot holds nothing erode_obj() could damage, because erode_obj() answers
// ER_NOTHING for a missing item as well as for an unaffected one. The
// cloak/suit/shirt slot always answers TRUE, which both terminates the loop
// and tells zhitu() to look for items to destroy.
export async function burnarmor(victim, env) {
    if (!victim) return false;
    const { state } = env;
    if (victim !== state.youmonst) {
        throw new UnsupportedErosionError(
            "burnarmor()'s monster victim, over which_armor()",
        );
    }
    const random = env.random;

    /* burning damage may dry wet towel */
    for (let item = carrying(TOWEL, state); item; item = item.nobj) {
        // obj.h:256 is_wet_towel(). apply.c dry_a_towel() is unported and
        // nothing that reaches it is ported either, so a wet towel stops here;
        // a dry one leaves the scan to walk on as C's does.
        if (item.otyp === TOWEL && (item.spe ?? 0) > 0) {
            throw new UnsupportedErosionError('dry_a_towel() for a wet towel');
        }
    }

    for (;;) {
        let item;
        switch (random.rn2(5)) {
        case 0: {
            item = state.uarmh;
            let description = 'helmet';
            if (item) {
                const material = objectType(item, state).oc_material;
                description = `${materialnm[material]} `
                    + `${helm_simple_name(item, state)}`;
            }
            if (!await burn_dmg(item, description, env)) continue;
            break;
        }
        case 1:
            item = state.uarmc;
            if (item) {
                await burn_dmg(item, cloak_simple_name(item, state), env);
                return true;
            }
            item = state.uarm;
            if (item) {
                await burn_dmg(item, xnameFresh(item, state), env);
                return true;
            }
            item = state.uarmu;
            if (item)
                await burn_dmg(item, 'shirt', env);
            return true;
        case 2:
            if (!await burn_dmg(state.uarms, 'wooden shield', env)) continue;
            break;
        case 3:
            if (!await burn_dmg(state.uarmg, 'gloves', env)) continue;
            break;
        case 4:
            if (!await burn_dmg(state.uarmf, 'boots', env)) continue;
            break;
        default:
            throw new RangeError('burnarmor() slot selection out of range');
        }
        break; /* Out of while loop */
    }

    return false;
}
