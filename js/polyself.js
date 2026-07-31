// Body-part naming shared by polymorph and monster-facing messages, plus the
// two property-blocking updates that riding and levitation share.
// C ref: polyself.c mbodypart(), float_vs_flight() (131-154) and
// steed_vs_stealth() (158-164).

import {
    ARM,
    EYE,
    FINGER,
    FINGERTIP,
    FOOT,
    FLYING,
    FROMOUTSIDE,
    HAIR,
    HAND,
    HANDED,
    HEAD,
    I_SPECIAL,
    LEG,
    LEVITATION,
    NO_PART,
    NOSE,
    STEALTH,
    STOMACH,
    TOE,
    TT_PIT,
} from './const.js';
import { game } from './gstate.js';
import {
    attacktype,
    humanoid,
    is_flyer,
    slithy,
} from './mondata.js';
import * as M from './monsters.js';

function uprop(state, index) {
    const property = state.u?.uprops?.[index];
    if (!property)
        throw new Error(`hero property ${index} is not initialized`);
    return property;
}

// youprop.h:253 Flying. A flying steed carries the hero through the air, so
// the steed term belongs inside the macro rather than at its call sites.
function Flying(state) {
    const flying = uprop(state, FLYING);
    return Boolean((flying.intrinsic || flying.extrinsic
                    || (state.u.usteed && is_flyer(state.u.usteed.data)))
                   && !flying.blocked);
}

// youprop.h:242 Levitation.
function Levitation(state) {
    const levitation = uprop(state, LEVITATION);
    return Boolean((levitation.intrinsic || levitation.extrinsic)
                   && !levitation.blocked);
}

// C ref: polyself.c float_vs_flight() (131-154). Floating overrides flight and
// being stuck in the floor overrides floating; both are expressed as the
// I_SPECIAL bit of the corresponding blocked mask.
export function float_vs_flight(state = game) {
    const u = state.u;
    const flying = uprop(state, FLYING);
    const levitation = uprop(state, LEVITATION);
    const stuck_in_floor = Boolean(u.utrap && u.utraptype !== TT_PIT);

    if ((levitation.intrinsic || levitation.extrinsic)
        || ((flying.intrinsic || flying.extrinsic) && stuck_in_floor))
        flying.blocked |= I_SPECIAL;
    else
        flying.blocked &= ~I_SPECIAL;
    if ((levitation.intrinsic || levitation.extrinsic) && stuck_in_floor)
        levitation.blocked |= I_SPECIAL;
    else
        levitation.blocked &= ~I_SPECIAL;

    steed_vs_stealth(state);

    state.disp ??= {};
    state.disp.botl = true;
}

// C ref: polyself.c steed_vs_stealth() (158-164). Riding blocks stealth unless
// hero and steed fly. This is the only writer of uprops[STEALTH].blocked, the
// BStealth term of youprop.h:210's Stealth macro.
export function steed_vs_stealth(state = game) {
    const stealth = uprop(state, STEALTH);
    if (state.u.usteed && !Flying(state) && !Levitation(state))
        stealth.blocked |= FROMOUTSIDE;
    else
        stealth.blocked &= ~FROMOUTSIDE;
}

const HUMANOID_PARTS = Object.freeze([
    'arm', 'eye', 'face', 'finger', 'fingertip', 'foot', 'hand',
    'handed', 'head', 'leg', 'light headed', 'neck', 'spine', 'toe',
    'hair', 'blood', 'lung', 'nose', 'stomach',
]);
const JELLY_PARTS = Object.freeze([
    'pseudopod', 'dark spot', 'front', 'pseudopod extension',
    'pseudopod extremity', 'pseudopod root', 'grasp', 'grasped',
    'cerebral area', 'lower pseudopod', 'viscous', 'middle', 'surface',
    'pseudopod extremity', 'ripples', 'juices', 'surface', 'sensor',
    'stomach',
]);
const ANIMAL_PARTS = Object.freeze([
    'forelimb', 'eye', 'face', 'foreclaw', 'claw tip', 'rear claw',
    'foreclaw', 'clawed', 'head', 'rear limb', 'light headed', 'neck',
    'spine', 'rear claw tip', 'fur', 'blood', 'lung', 'nose', 'stomach',
]);
const BIRD_PARTS = Object.freeze([
    'wing', 'eye', 'face', 'wing', 'wing tip', 'foot', 'wing', 'winged',
    'head', 'leg', 'light headed', 'neck', 'spine', 'toe', 'feathers',
    'blood', 'lung', 'bill', 'stomach',
]);
const HORSE_PARTS = Object.freeze([
    'foreleg', 'eye', 'face', 'forehoof', 'hoof tip', 'rear hoof',
    'forehoof', 'hooved', 'head', 'rear leg', 'light headed', 'neck',
    'backbone', 'rear hoof tip', 'mane', 'blood', 'lung', 'nose',
    'stomach',
]);
const SPHERE_PARTS = Object.freeze([
    'appendage', 'optic nerve', 'body', 'tentacle', 'tentacle tip',
    'lower appendage', 'tentacle', 'tentacled', 'body', 'lower tentacle',
    'rotational', 'equator', 'body', 'lower tentacle tip', 'cilia',
    'life force', 'retina', 'olfactory nerve', 'interior',
]);
const FUNGUS_PARTS = Object.freeze([
    'mycelium', 'visual area', 'front', 'hypha', 'hypha', 'root',
    'strand', 'stranded', 'cap area', 'rhizome', 'sporulated', 'stalk',
    'root', 'rhizome tip', 'spores', 'juices', 'gill', 'gill', 'interior',
]);
const VORTEX_PARTS = Object.freeze([
    'region', 'eye', 'front', 'minor current', 'minor current',
    'lower current', 'swirl', 'swirled', 'central core', 'lower current',
    'addled', 'center', 'currents', 'edge', 'currents', 'life force',
    'center', 'leading edge', 'interior',
]);
const SNAKE_PARTS = Object.freeze([
    'vestigial limb', 'eye', 'face', 'large scale', 'large scale tip',
    'rear region', 'scale gap', 'scale gapped', 'head', 'rear region',
    'light headed', 'neck', 'length', 'rear scale', 'scales', 'blood',
    'lung', 'forked tongue', 'stomach',
]);
const WORM_PARTS = Object.freeze([
    'anterior segment', 'light sensitive cell', 'clitellum', 'setae',
    'setae', 'posterior segment', 'segment', 'segmented',
    'anterior segment', 'posterior', 'over stretched', 'clitellum',
    'length', 'posterior setae', 'setae', 'blood', 'skin', 'prostomium',
    'stomach',
]);
const SPIDER_PARTS = Object.freeze([
    'pedipalp', 'eye', 'face', 'pedipalp', 'tarsus', 'claw', 'pedipalp',
    'palped', 'cephalothorax', 'leg', 'spun out', 'cephalothorax',
    'abdomen', 'claw', 'hair', 'hemolymph', 'book lung', 'labrum',
    'digestive tract',
]);
const FISH_PARTS = Object.freeze([
    'fin', 'eye', 'premaxillary', 'pelvic axillary', 'pelvic fin',
    'anal fin', 'pectoral fin', 'finned', 'head', 'peduncle', 'played out',
    'gills', 'dorsal fin', 'caudal fin', 'scales', 'blood', 'gill',
    'nostril', 'stomach',
]);

const NOT_CLAWS = new Set([
    M.S_HUMAN,
    M.S_MUMMY,
    M.S_ZOMBIE,
    M.S_ANGEL,
    M.S_NYMPH,
    M.S_LEPRECHAUN,
    M.S_QUANTMECH,
    M.S_VAMPIRE,
    M.S_ORC,
    M.S_GIANT,
]);

function isSpecies(species, pmidx) {
    return species?.pmidx === pmidx;
}

// C ref: polyself.c body_part(). The hero's own anatomy, which is
// mbodypart() applied to youmonst. The caller passes youmonst explicitly so
// that a test can ask about any form without installing it on a game state.
export function body_part(part, youmonst) {
    return mbodypart(youmonst, part);
}

export function mbodypart(monster, part) {
    if (part <= NO_PART || part > STOMACH) return 'mystery part';
    const species = monster?.data;
    if (!species) throw new TypeError('mbodypart requires monster data');

    if (species.mlet === M.S_DOG
        || species.mlet === M.S_FELINE
        || species.mlet === M.S_RODENT
        || isSpecies(species, M.PM_OWLBEAR)) {
        switch (part) {
        case HAND: return 'paw';
        case HANDED: return 'pawed';
        case FOOT: return 'rear paw';
        case ARM:
        case LEG:
            return HORSE_PARTS[part];
        default:
            break;
        }
    } else if (species.mlet === M.S_YETI) {
        return HUMANOID_PARTS[part];
    }

    if ((part === HAND || part === HANDED)
        && humanoid(species)
        && attacktype(species, M.AT_CLAW)
        && !NOT_CLAWS.has(species.mlet)
        && !isSpecies(species, M.PM_STONE_GOLEM)
        && !isSpecies(species, M.PM_AMOROUS_DEMON)) {
        return part === HAND ? 'claw' : 'clawed';
    }
    if ((isSpecies(species, M.PM_MUMAK)
            || isSpecies(species, M.PM_MASTODON))
        && part === NOSE) {
        return 'trunk';
    }
    if (isSpecies(species, M.PM_SHARK) && part === HAIR)
        return 'skin';
    if ((isSpecies(species, M.PM_JELLYFISH)
            || isSpecies(species, M.PM_KRAKEN))
        && (part === ARM || part === FINGER || part === HAND
            || part === FOOT || part === TOE)) {
        return 'tentacle';
    }
    if (isSpecies(species, M.PM_FLOATING_EYE) && part === EYE)
        return 'cornea';
    if (humanoid(species)
        && (part === ARM || part === FINGER || part === FINGERTIP
            || part === HAND || part === HANDED)) {
        return HUMANOID_PARTS[part];
    }
    if (species.mlet === M.S_COCKATRICE)
        return part === HAIR ? SNAKE_PARTS[part] : BIRD_PARTS[part];
    if (isSpecies(species, M.PM_RAVEN)) return BIRD_PARTS[part];
    if (species.mlet === M.S_CENTAUR
        || species.mlet === M.S_UNICORN
        || isSpecies(species, M.PM_KI_RIN)
        || (isSpecies(species, M.PM_ROTHE) && part !== HAIR)) {
        return HORSE_PARTS[part];
    }
    if (species.mlet === M.S_LIGHT) {
        if (part === HANDED) return 'rayed';
        if (part === ARM || part === FINGER || part === FINGERTIP
            || part === HAND) {
            return 'ray';
        }
        return 'beam';
    }
    if (isSpecies(species, M.PM_STALKER) && part === HEAD) return 'head';
    if (species.mlet === M.S_EEL
        && !isSpecies(species, M.PM_JELLYFISH)) {
        return FISH_PARTS[part];
    }
    if (species.mlet === M.S_WORM) return WORM_PARTS[part];
    if (species.mlet === M.S_SPIDER) return SPIDER_PARTS[part];
    if (slithy(species)
        || (species.mlet === M.S_DRAGON && part === HAIR)) {
        return SNAKE_PARTS[part];
    }
    if (species.mlet === M.S_EYE) return SPHERE_PARTS[part];
    if (species.mlet === M.S_JELLY
        || species.mlet === M.S_PUDDING
        || species.mlet === M.S_BLOB
        || isSpecies(species, M.PM_JELLYFISH)) {
        return JELLY_PARTS[part];
    }
    if (species.mlet === M.S_VORTEX
        || species.mlet === M.S_ELEMENTAL) {
        return VORTEX_PARTS[part];
    }
    if (species.mlet === M.S_FUNGUS) return FUNGUS_PARTS[part];
    if (humanoid(species)) return HUMANOID_PARTS[part];
    return ANIMAL_PARTS[part];
}
