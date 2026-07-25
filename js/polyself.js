// Body-part naming shared by polymorph and monster-facing messages.
// C ref: polyself.c mbodypart().

import {
    ARM,
    EYE,
    FINGER,
    FINGERTIP,
    FOOT,
    HAIR,
    HAND,
    HANDED,
    HEAD,
    LEG,
    NO_PART,
    NOSE,
    STOMACH,
    TOE,
} from './const.js';
import {
    attacktype,
    humanoid,
    slithy,
} from './mondata.js';
import * as M from './monsters.js';

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
