// Monster-player generation from mplayer.c.

import {
    A_NONE,
    has_mgivenname,
    In_endgame,
    MGIVENNAME,
    MM_NOMSG,
    NO_MM_FLAGS,
    RLOC_ERR,
    RLOC_NOMSG,
    COLNO,
    ROWNO,
} from './const.js';
import * as O from './objects.js';
import { mk_artifact, is_art } from './artifacts.js';
import { christen_monst } from './do_name.js';
import { rank_of } from './display.js';
import { game } from './gstate.js';
import { makemon, mkmonmoney, makemon_runtime, mongets, rnd_defensive_item, rnd_misc_item, rnd_offensive_item } from './makemon_create.js';
import { is_female, is_mplayer, monsndx, set_mon_data } from './mondata.js';
import { mkobj, mksobj, rnd_class, is_spear, weight } from './obj.js';
import { curse, bless } from './obj.js';
import { PM_ARCHEOLOGIST, PM_BARBARIAN, PM_CAVE_DWELLER, PM_CLERIC, PM_HEALER, PM_KNIGHT, PM_MONK, PM_RANGER, PM_ROGUE, PM_SAMURAI, PM_TOURIST, PM_VALKYRIE, PM_WIZARD } from './monsters.js';
import { d, rn1, rn2, rnd, rne } from './rng.js';
import { mpickobj } from './steal.js';
import { set_malign } from './makemon.js';
import { m_dowear } from './worn.js';
import { monmightthrowwep } from './weapon.js';
import { m_at } from './monst.js';
import { goodpos, rloc } from './teleport.js';

const developers = Object.freeze([
    'Alex', 'Dave', 'Dean', 'Derek', 'Eric', 'Izchak', 'Janet', 'Jessie', 'Ken', 'Kevin', 'Michael', 'Mike', 'Pasi', 'Pat', 'Patric', 'Paul', 'Sean', 'Steve', 'Timo', 'Warwick',
    'Bill', 'Eric', 'Keizo', 'Ken', 'Kevin', 'Michael', 'Mike', 'Paul', 'Stephen', 'Steve', 'Timo', 'Yitzhak',
    'Andy', 'Gregg', 'Janne', 'Keni', 'Mike', 'Olaf', 'Richard',
    'Andy', 'Chris', 'Dean', 'Jon', 'Jonathan', 'Kevin', 'Wang',
    'Eric', 'Marvin', 'Warwick',
    'Alex', 'Dion', 'Michael',
    'Helge', 'Ron', 'Timo',
    'Joshua', 'Pat', '',
]);

// C: mplayer.c dev_name(). It avoids reusing a live monster-player's given
// name prefix, then returns null after the source's 100-attempt safeguard.
export function dev_name(state = game, random = state.random) {
    let index = 0;
    let attempts = 0;
    let match;
    do {
        match = false;
        index = random.rn2(developers.length);
        for (let monster = state.level?.monlist ?? state.fmon;
            monster; monster = monster.nmon) {
            if (!is_mplayer(monster.data)) continue;
            const givenName = has_mgivenname(monster) ? MGIVENNAME(monster) : '';
            if (givenName.startsWith(developers[index])) {
                match = true;
                break;
            }
        }
        attempts++;
    } while (match && attempts < 100);
    return match ? null : developers[index];
}

// C: mplayer.c get_mplname().
export function get_mplname(monster, state = game, random = state.random) {
    const femaleKind = is_female(monster.data);
    const developer = dev_name(state, random);
    let name;
    if (developer === null) name = femaleKind ? 'Eve' : 'Adam';
    else if (femaleKind && developer !== 'Janet')
        name = random.rn2(2) ? 'Maud' : 'Eve';
    else name = developer;

    monster.female = Number(femaleKind || name === 'Janet');
    return `${name} the ${rank_of(monster.m_lev, monsndx(monster.data), Boolean(monster.female), state)}`;
}

// C: mplayer.c mk_mplayer_armor().
export function mk_mplayer_armor(monster, type, env = {}) {
    const { state = game, random = state.random } = env;
    if (type === O.STRANGE_OBJECT) return;
    const object = mksobj(type, false, false, { ...env, state, random });
    object.oeroded = 0;
    object.oeroded2 = 0;
    if (!random.rn2(3)) object.oerodeproof = 1;
    if (!random.rn2(3)) curse(object, { ...env, state, random });
    if (!random.rn2(3)) bless(object, { ...env, state, random });
    object.spe = random.rn2(10)
        ? (random.rn2(3) ? random.rn2(5) : random.rn1(4, 4))
        : -random.rnd(3);
    mpickobj(monster, object, { ...env, state, random });
}

// C: mplayer.c mk_mplayer(). The complete source path is retained because
// special-level player species enter this function through sp_lev.c.
export async function mk_mplayer(species, x, y, special = false, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? state.random ?? { d, rn1, rn2, rnd, rne };
    const env = { ...rawEnv, state, random };
    if (!is_mplayer(species)) return null;

    const blocker = m_at(x, y, state);
    if (blocker) {
        const relocateMonster = rawEnv.relocateMonster ?? rloc;
        await relocateMonster(blocker, RLOC_ERR | RLOC_NOMSG, env);
    }

    if (!In_endgame(state.u?.uz)) special = false;
    const monster = state.in_mklev || env._specialRoomFill
        ? await makemon(
            species, x, y, special ? MM_NOMSG : NO_MM_FLAGS, env,
        )
        : await makemon_runtime(
            species, x, y, special ? MM_NOMSG : NO_MM_FLAGS, env,
        );
    if (!monster) return null;

    monster.m_lev = special ? random.rn1(16, 15) : random.rnd(16);
    monster.mhp = monster.mhpmax = random.d(monster.m_lev, 10) + (special ? 30 + random.rnd(30) : 30);
    if (special) {
        christen_monst(monster, get_mplname(monster, state, random), env);
        mongets(monster, O.FAKE_AMULET_OF_YENDOR, env);
    }
    monster.mpeaceful = false;
    set_malign(monster, state);

    let weapon = !random.rn2(2) ? O.LONG_SWORD : rnd_class(O.SPEAR, O.BULLWHIP, env);
    let armor = rnd_class(O.GRAY_DRAGON_SCALE_MAIL, O.YELLOW_DRAGON_SCALE_MAIL, env);
    let cloak = !random.rn2(8) ? O.STRANGE_OBJECT : rnd_class(O.OILSKIN_CLOAK, O.CLOAK_OF_DISPLACEMENT, env);
    let helm = !random.rn2(8) ? O.STRANGE_OBJECT : rnd_class(O.ELVEN_LEATHER_HELM, O.HELM_OF_TELEPATHY, env);
    let shield = !random.rn2(8) ? O.STRANGE_OBJECT : rnd_class(O.ELVEN_SHIELD, O.SHIELD_OF_REFLECTION, env);

    switch (monsndx(species)) {
    case PM_ARCHEOLOGIST:
        if (random.rn2(2)) weapon = O.BULLWHIP;
        break;
    case PM_BARBARIAN:
        if (random.rn2(2)) { weapon = random.rn2(2) ? O.TWO_HANDED_SWORD : O.BATTLE_AXE; shield = O.STRANGE_OBJECT; }
        if (random.rn2(2)) armor = rnd_class(O.PLATE_MAIL, O.CHAIN_MAIL, env);
        if (helm === O.HELM_OF_BRILLIANCE) helm = O.STRANGE_OBJECT;
        break;
    case PM_CAVE_DWELLER:
        if (random.rn2(4)) weapon = O.MACE;
        else if (random.rn2(2)) weapon = O.CLUB;
        if (helm === O.HELM_OF_BRILLIANCE) helm = O.STRANGE_OBJECT;
        break;
    case PM_HEALER:
        if (random.rn2(4)) weapon = O.QUARTERSTAFF;
        else if (random.rn2(2)) weapon = random.rn2(2) ? O.UNICORN_HORN : O.SCALPEL;
        if (random.rn2(4)) helm = random.rn2(2) ? O.HELM_OF_BRILLIANCE : O.HELM_OF_TELEPATHY;
        if (random.rn2(2)) shield = O.STRANGE_OBJECT;
        break;
    case PM_KNIGHT:
        if (random.rn2(4)) weapon = O.LONG_SWORD;
        if (random.rn2(2)) armor = rnd_class(O.PLATE_MAIL, O.CHAIN_MAIL, env);
        break;
    case PM_MONK:
        weapon = !random.rn2(3) ? O.SHURIKEN : O.STRANGE_OBJECT;
        armor = O.STRANGE_OBJECT;
        cloak = O.ROBE;
        if (random.rn2(2)) shield = O.STRANGE_OBJECT;
        break;
    case PM_CLERIC:
        if (random.rn2(2)) weapon = O.MACE;
        if (random.rn2(2)) armor = rnd_class(O.PLATE_MAIL, O.CHAIN_MAIL, env);
        if (random.rn2(4)) cloak = O.ROBE;
        if (random.rn2(4)) helm = random.rn2(2) ? O.HELM_OF_BRILLIANCE : O.HELM_OF_TELEPATHY;
        if (random.rn2(2)) shield = O.STRANGE_OBJECT;
        break;
    case PM_RANGER:
        if (random.rn2(2)) weapon = O.ELVEN_DAGGER;
        break;
    case PM_ROGUE:
        if (random.rn2(2)) weapon = random.rn2(2) ? O.SHORT_SWORD : O.ORCISH_DAGGER;
        break;
    case PM_SAMURAI:
        if (random.rn2(2)) weapon = O.KATANA;
        break;
    case PM_TOURIST:
        break;
    case PM_VALKYRIE:
        if (random.rn2(2)) weapon = O.WAR_HAMMER;
        if (random.rn2(2)) armor = rnd_class(O.PLATE_MAIL, O.CHAIN_MAIL, env);
        break;
    case PM_WIZARD:
        if (random.rn2(4)) weapon = random.rn2(2) ? O.QUARTERSTAFF : O.ATHAME;
        if (random.rn2(2)) { armor = random.rn2(2) ? O.BLACK_DRAGON_SCALE_MAIL : O.SILVER_DRAGON_SCALE_MAIL; cloak = O.CLOAK_OF_MAGIC_RESISTANCE; }
        if (random.rn2(4)) helm = O.HELM_OF_BRILLIANCE;
        shield = O.STRANGE_OBJECT;
        break;
    default:
        throw new Error('mk_mplayer received a non-player species');
    }

    if (weapon !== O.STRANGE_OBJECT) {
        let object = mksobj(weapon, true, false, env);
        object.oeroded = 0;
        object.oeroded2 = 0;
        object.spe = special ? random.rn1(5, 4) : random.rn2(4);
        if (!random.rn2(3)) object.oerodeproof = 1;
        else if (!random.rn2(2)) object.greased = 1;
        if (special && random.rn2(2)) object = mk_artifact(object, A_NONE, 99, false, env);
        if (state.objects[object.otyp].oc_merge && !object.oartifact
            && monmightthrowwep(object))
            object.quan += random.rn2(is_spear(object, state) ? 4 : 8);
        object.owt = weight(object, env);
        if (is_art(object, O.ART_MAGICBANE)) object.spe = random.rnd(4);
        mpickobj(monster, object, env);
    }

    if (special) {
        if (!random.rn2(10)) mongets(monster, random.rn2(3) ? O.LUCKSTONE : O.LOADSTONE, env);
        mk_mplayer_armor(monster, armor, env);
        mk_mplayer_armor(monster, cloak, env);
        mk_mplayer_armor(monster, helm, env);
        mk_mplayer_armor(monster, shield, env);
        if (weapon === O.WAR_HAMMER) mk_mplayer_armor(monster, O.GAUNTLETS_OF_POWER, env);
        else if (random.rn2(8)) mk_mplayer_armor(monster, rnd_class(O.LEATHER_GLOVES, O.GAUNTLETS_OF_DEXTERITY, env), env);
        if (random.rn2(8)) mk_mplayer_armor(monster, rnd_class(O.LOW_BOOTS, O.LEVITATION_BOOTS, env), env);
        m_dowear(monster, true, env);
        let quantity = random.rn2(3) ? random.rn2(3) : random.rn2(16);
        while (quantity--) mongets(monster, rnd_class(O.DILITHIUM_CRYSTAL, O.JADE, env), env);
        mkmonmoney(monster, random.rn2(1000), env);
        quantity = random.rn2(10);
        while (quantity--) mpickobj(monster, mkobj(O.RANDOM_CLASS, false, env), env);
    }
    let quantity = random.rnd(3);
    while (quantity--) mongets(monster, rnd_offensive_item(monster, env), env);
    quantity = random.rnd(3);
    while (quantity--) mongets(monster, rnd_defensive_item(monster, env), env);
    quantity = random.rnd(3);
    while (quantity--) mongets(monster, rnd_misc_item(monster, env), env);
    return monster;
}

// C: mplayer.c create_mplayers().
export async function create_mplayers(count, special, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? state.random ?? { d, rn1, rn2, rnd, rne };
    const env = { ...rawEnv, state, random };
    const fakeMonster = {};
    while (count) {
        let tryCount = 0;
        const speciesId = random.rn1(
            PM_WIZARD - PM_ARCHEOLOGIST + 1,
            PM_ARCHEOLOGIST,
        );
        const species = state.mons[speciesId];
        set_mon_data(fakeMonster, species, state);
        let x;
        let y;
        do {
            x = random.rn1(COLNO - 4, 2);
            y = random.rnd(ROWNO - 2);
        } while (!goodpos(x, y, fakeMonster, 0, env) && tryCount++ <= 50);
        if (tryCount > 50) return;
        await mk_mplayer(species, x, y, special, env);
        count--;
    }
}
