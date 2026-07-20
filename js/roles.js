// roles.js -- character role, race, gender, and alignment tables.
// C ref: src/role.c roles[], races[], genders[], aligns[].

export const ROLE_NONE = -1;
export const ROLE_RANDOM = -2;
export const PICK_RANDOM = 0;
export const PICK_RIGID = 1;

export const ROLE_RACEMASK = 0x0ff8;
export const ROLE_GENDMASK = 0xf000;
export const ROLE_MALE = 0x1000;
export const ROLE_FEMALE = 0x2000;
export const ROLE_NEUTER = 0x4000;
export const ROLE_LAWFUL = 0x0004;
export const ROLE_NEUTRAL = 0x0002;
export const ROLE_CHAOTIC = 0x0001;
export const ROLE_ALIGNMASK = 0x0007;
export const ROLE_GENDERS = 2;
export const ROLE_ALIGNS = 3;

export const MH_HUMAN = 0x0008;
export const MH_ELF = 0x0010;
export const MH_DWARF = 0x0020;
export const MH_GNOME = 0x0040;
export const MH_ORC = 0x0080;

export const A_NONE = -128;
export const A_CHAOTIC = -1;
export const A_NEUTRAL = 0;
export const A_LAWFUL = 1;

function name(m, f = null) {
    return { m, f };
}

function advance(infix, inrnd, lofix, lornd, hifix, hirnd) {
    return { infix, inrnd, lofix, lornd, hifix, hirnd };
}

function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const child of Object.values(value)) deepFreeze(child);
    }
    return value;
}

// Monster, artifact, symbol, and spell indices are the values emitted by the
// pinned NetHack 5.0 tables. Keeping them on the role records preserves the C
// struct layout needed by quest, attribute, and spell initialization ports.
export const roles = deepFreeze([
    {
        name: name('Archeologist'),
        rank: [
            name('Digger'), name('Field Worker'), name('Investigator'),
            name('Exhumer'), name('Excavator'), name('Spelunker'),
            name('Speleologist'), name('Collector'), name('Curator'),
        ],
        lgod: 'Quetzalcoatl', ngod: 'Camaxtli', cgod: 'Huhetotl',
        filecode: 'Arc', homebase: 'the College of Archeology',
        intermed: 'the Tomb of the Toltec Kings',
        mnum: 331, petnum: -1, ldrnum: 344, guardnum: 369, neminum: 357,
        enemy1num: -1, enemy2num: 192, enemy1sym: 45, enemy2sym: 39,
        questarti: 21,
        allow: MH_HUMAN | MH_DWARF | MH_GNOME | ROLE_MALE | ROLE_FEMALE
            | ROLE_LAWFUL | ROLE_NEUTRAL,
        attrbase: [7, 10, 10, 7, 7, 7],
        attrdist: [20, 20, 20, 10, 20, 10],
        hpadv: advance(11, 0, 0, 8, 1, 0),
        enadv: advance(1, 0, 0, 1, 0, 1),
        xlev: 14, initrecord: 10,
        spelbase: 5, spelheal: 0, spelshld: 2, spelarmr: 10,
        spelstat: 1, spelspec: 396, spelsbon: -4,
    },
    {
        name: name('Barbarian'),
        rank: [
            name('Plunderer', 'Plunderess'), name('Pillager'), name('Bandit'),
            name('Brigand'), name('Raider'), name('Reaver'), name('Slayer'),
            name('Chieftain', 'Chieftainess'),
            name('Conqueror', 'Conqueress'),
        ],
        lgod: 'Mitra', ngod: 'Crom', cgod: 'Set',
        filecode: 'Bar', homebase: 'the Camp of the Duali Tribe',
        intermed: 'the Duali Oasis',
        mnum: 332, petnum: -1, ldrnum: 345, guardnum: 370, neminum: 358,
        enemy1num: 203, enemy2num: 220, enemy1sym: 41, enemy2sym: 46,
        questarti: 22,
        allow: MH_HUMAN | MH_ORC | ROLE_MALE | ROLE_FEMALE
            | ROLE_NEUTRAL | ROLE_CHAOTIC,
        attrbase: [16, 7, 7, 15, 16, 6],
        attrdist: [30, 6, 7, 20, 30, 7],
        hpadv: advance(14, 0, 0, 10, 2, 0),
        enadv: advance(1, 0, 0, 1, 0, 1),
        xlev: 10, initrecord: 10,
        spelbase: 14, spelheal: 0, spelshld: 0, spelarmr: 8,
        spelstat: 1, spelspec: 388, spelsbon: -4,
    },
    {
        name: name('Caveman', 'Cavewoman'),
        rank: [
            name('Troglodyte'), name('Aborigine'), name('Wanderer'),
            name('Vagrant'), name('Wayfarer'), name('Roamer'), name('Nomad'),
            name('Rover'), name('Pioneer'),
        ],
        lgod: 'Anu', ngod: '_Ishtar', cgod: 'Anshar',
        filecode: 'Cav', homebase: 'the Caves of the Ancestors',
        intermed: "the Dragon's Lair",
        mnum: 333, petnum: 16, ldrnum: 346, guardnum: 371, neminum: 359,
        enemy1num: 45, enemy2num: 171, enemy1sym: 8, enemy2sym: 34,
        questarti: 23,
        allow: MH_HUMAN | MH_DWARF | MH_GNOME | ROLE_MALE | ROLE_FEMALE
            | ROLE_LAWFUL | ROLE_NEUTRAL,
        attrbase: [10, 7, 7, 7, 8, 6],
        attrdist: [30, 6, 7, 20, 30, 7],
        hpadv: advance(14, 0, 0, 8, 2, 0),
        enadv: advance(1, 0, 0, 1, 0, 1),
        xlev: 10, initrecord: 0,
        spelbase: 12, spelheal: 0, spelshld: 1, spelarmr: 8,
        spelstat: 1, spelspec: 366, spelsbon: -4,
    },
    {
        name: name('Healer'),
        rank: [
            name('Rhizotomist'), name('Empiric'), name('Embalmer'),
            name('Dresser'), name('Medicus ossium', 'Medica ossium'),
            name('Herbalist'), name('Magister', 'Magistra'),
            name('Physician'), name('Chirurgeon'),
        ],
        lgod: '_Athena', ngod: 'Hermes', cgod: 'Poseidon',
        filecode: 'Hea', homebase: 'the Temple of Epidaurus',
        intermed: 'the Temple of Coeus',
        mnum: 334, petnum: -1, ldrnum: 347, guardnum: 372, neminum: 360,
        enemy1num: 89, enemy2num: 215, enemy1sym: 18, enemy2sym: 51,
        questarti: 24,
        allow: MH_HUMAN | MH_GNOME | ROLE_MALE | ROLE_FEMALE | ROLE_NEUTRAL,
        attrbase: [7, 7, 13, 7, 11, 16],
        attrdist: [15, 20, 20, 15, 25, 5],
        hpadv: advance(11, 0, 0, 8, 1, 0),
        enadv: advance(1, 4, 0, 1, 0, 2),
        xlev: 20, initrecord: 10,
        spelbase: 3, spelheal: -3, spelshld: 2, spelarmr: 10,
        spelstat: 2, spelspec: 386, spelsbon: -4,
    },
    {
        name: name('Knight'),
        rank: [
            name('Gallant'), name('Esquire'), name('Bachelor'),
            name('Sergeant'), name('Knight'), name('Banneret'),
            name('Chevalier', 'Chevaliere'), name('Seignieur', 'Dame'),
            name('Paladin'),
        ],
        lgod: 'Lugh', ngod: '_Brigit', cgod: 'Manannan Mac Lir',
        filecode: 'Kni', homebase: 'Camelot Castle',
        intermed: 'the Isle of Glass',
        mnum: 335, petnum: 100, ldrnum: 348, guardnum: 373, neminum: 361,
        enemy1num: 54, enemy2num: 58, enemy1sym: 9, enemy2sym: 10,
        questarti: 25,
        allow: MH_HUMAN | ROLE_MALE | ROLE_FEMALE | ROLE_LAWFUL,
        attrbase: [13, 7, 14, 8, 10, 17],
        attrdist: [30, 15, 15, 10, 20, 10],
        hpadv: advance(14, 0, 0, 8, 2, 0),
        enadv: advance(1, 4, 0, 1, 0, 2),
        xlev: 10, initrecord: 10,
        spelbase: 8, spelheal: -2, spelshld: 0, spelarmr: 9,
        spelstat: 2, spelspec: 398, spelsbon: -4,
    },
    {
        name: name('Monk'),
        rank: [
            name('Candidate'), name('Novice'), name('Initiate'),
            name('Student of Stones'), name('Student of Waters'),
            name('Student of Metals'), name('Student of Winds'),
            name('Student of Fire'), name('Master'),
        ],
        lgod: 'Shan Lai Ching', ngod: 'Chih Sung-tzu', cgod: 'Huan Ti',
        filecode: 'Mon', homebase: 'the Monastery of Chan-Sune',
        intermed: 'the Monastery of the Earth-Lord',
        mnum: 336, petnum: -1, ldrnum: 349, guardnum: 374, neminum: 362,
        enemy1num: 156, enemy2num: 232, enemy1sym: 31, enemy2sym: 50,
        questarti: 26,
        allow: MH_HUMAN | ROLE_MALE | ROLE_FEMALE | ROLE_LAWFUL
            | ROLE_NEUTRAL | ROLE_CHAOTIC,
        attrbase: [10, 7, 8, 8, 7, 7],
        attrdist: [25, 10, 20, 20, 15, 10],
        hpadv: advance(12, 0, 0, 8, 1, 0),
        enadv: advance(2, 2, 0, 2, 0, 2),
        xlev: 10, initrecord: 10,
        spelbase: 8, spelheal: -2, spelshld: 2, spelarmr: 20,
        spelstat: 2, spelspec: 392, spelsbon: -4,
    },
    {
        name: name('Priest', 'Priestess'),
        rank: [
            name('Aspirant'), name('Acolyte'), name('Adept'),
            name('Priest', 'Priestess'), name('Curate'),
            name('Canon', 'Canoness'), name('Lama'),
            name('Patriarch', 'Matriarch'),
            name('High Priest', 'High Priestess'),
        ],
        lgod: null, ngod: null, cgod: null,
        filecode: 'Pri', homebase: 'the Great Temple',
        intermed: 'the Temple of Nalzok',
        mnum: 337, petnum: -1, ldrnum: 350, guardnum: 375, neminum: 363,
        enemy1num: 244, enemy2num: 230, enemy1sym: 52, enemy2sym: 49,
        questarti: 27,
        allow: MH_HUMAN | MH_ELF | ROLE_MALE | ROLE_FEMALE | ROLE_LAWFUL
            | ROLE_NEUTRAL | ROLE_CHAOTIC,
        attrbase: [7, 7, 10, 7, 7, 7],
        attrdist: [15, 10, 30, 15, 20, 10],
        hpadv: advance(12, 0, 0, 8, 1, 0),
        enadv: advance(4, 3, 0, 2, 0, 2),
        xlev: 10, initrecord: 0,
        spelbase: 3, spelheal: -2, spelshld: 2, spelarmr: 10,
        spelstat: 2, spelspec: 395, spelsbon: -4,
    },
    // Rogue precedes Ranger so the one-letter role "R" remains Rogue.
    {
        name: name('Rogue'),
        rank: [
            name('Footpad'), name('Cutpurse'), name('Rogue'),
            name('Pilferer'), name('Robber'), name('Burglar'), name('Filcher'),
            name('Magsman', 'Magswoman'), name('Thief'),
        ],
        lgod: 'Issek', ngod: 'Mog', cgod: 'Kos',
        filecode: 'Rog', homebase: "the Thieves' Guild Hall",
        intermed: "the Assassins' Guild Hall",
        mnum: 339, petnum: -1, ldrnum: 352, guardnum: 377, neminum: 365,
        enemy1num: 63, enemy2num: 202, enemy1sym: 14, enemy2sym: 40,
        questarti: 29,
        allow: MH_HUMAN | MH_ORC | ROLE_MALE | ROLE_FEMALE | ROLE_CHAOTIC,
        attrbase: [7, 7, 7, 10, 7, 6],
        attrdist: [20, 10, 10, 30, 20, 10],
        hpadv: advance(10, 0, 0, 8, 1, 0),
        enadv: advance(1, 0, 0, 1, 0, 1),
        xlev: 11, initrecord: 10,
        spelbase: 8, spelheal: 0, spelshld: 1, spelarmr: 9,
        spelstat: 1, spelspec: 394, spelsbon: -4,
    },
    {
        name: name('Ranger'),
        rank: [
            name('Tenderfoot'), name('Lookout'), name('Trailblazer'),
            name('Reconnoiterer', 'Reconnoiteress'), name('Scout'),
            name('Arbalester'), name('Archer'), name('Sharpshooter'),
            name('Marksman', 'Markswoman'),
        ],
        lgod: 'Mercury', ngod: '_Venus', cgod: 'Mars',
        filecode: 'Ran', homebase: "Orion's camp",
        intermed: 'the cave of the wumpus',
        mnum: 338, petnum: 16, ldrnum: 351, guardnum: 376, neminum: 364,
        enemy1num: 131, enemy2num: 97, enemy1sym: 29, enemy2sym: 19,
        questarti: 28,
        allow: MH_HUMAN | MH_ELF | MH_GNOME | MH_ORC | ROLE_MALE
            | ROLE_FEMALE | ROLE_NEUTRAL | ROLE_CHAOTIC,
        attrbase: [13, 13, 13, 9, 13, 7],
        attrdist: [30, 10, 10, 20, 20, 10],
        hpadv: advance(13, 0, 0, 6, 1, 0),
        enadv: advance(1, 0, 0, 1, 0, 1),
        xlev: 12, initrecord: 10,
        spelbase: 9, spelheal: 2, spelshld: 1, spelarmr: 10,
        spelstat: 1, spelspec: 393, spelsbon: -4,
    },
    {
        name: name('Samurai'),
        rank: [
            name('Hatamoto'), name('Ronin'), name('Ninja', 'Kunoichi'),
            name('Joshu'), name('Ryoshu'), name('Kokushu'), name('Daimyo'),
            name('Kuge'), name('Shogun'),
        ],
        lgod: '_Amaterasu Omikami', ngod: 'Raijin', cgod: 'Susanowo',
        filecode: 'Sam', homebase: 'the Castle of the Taro Clan',
        intermed: "the Shogun's Castle",
        mnum: 340, petnum: 16, ldrnum: 353, guardnum: 379, neminum: 366,
        enemy1num: 20, enemy2num: 153, enemy1sym: 4, enemy2sym: 31,
        questarti: 30,
        allow: MH_HUMAN | ROLE_MALE | ROLE_FEMALE | ROLE_LAWFUL,
        attrbase: [10, 8, 7, 10, 17, 6],
        attrdist: [30, 10, 8, 30, 14, 8],
        hpadv: advance(13, 0, 0, 8, 1, 0),
        enadv: advance(1, 0, 0, 1, 0, 1),
        xlev: 11, initrecord: 10,
        spelbase: 10, spelheal: 0, spelshld: 0, spelarmr: 8,
        spelstat: 1, spelspec: 385, spelsbon: -4,
    },
    {
        name: name('Tourist'),
        rank: [
            name('Rambler'), name('Sightseer'), name('Excursionist'),
            name('Peregrinator', 'Peregrinatrix'), name('Traveler'),
            name('Journeyer'), name('Voyager'), name('Explorer'),
            name('Adventurer'),
        ],
        lgod: 'Blind Io', ngod: '_The Lady', cgod: 'Offler',
        filecode: 'Tou', homebase: 'Ankh-Morpork',
        intermed: "the Thieves' Guild Hall",
        mnum: 341, petnum: -1, ldrnum: 354, guardnum: 380, neminum: 352,
        enemy1num: 96, enemy2num: 131, enemy1sym: 19, enemy2sym: 29,
        questarti: 31,
        allow: MH_HUMAN | ROLE_MALE | ROLE_FEMALE | ROLE_NEUTRAL,
        attrbase: [7, 10, 6, 7, 7, 10],
        attrdist: [15, 10, 10, 15, 30, 20],
        hpadv: advance(8, 0, 0, 8, 0, 0),
        enadv: advance(1, 0, 0, 1, 0, 1),
        xlev: 14, initrecord: 0,
        spelbase: 5, spelheal: 1, spelshld: 2, spelarmr: 10,
        spelstat: 1, spelspec: 387, spelsbon: -4,
    },
    {
        name: name('Valkyrie'),
        rank: [
            name('Stripling'), name('Skirmisher'), name('Fighter'),
            name('Man-at-arms', 'Woman-at-arms'), name('Warrior'),
            name('Swashbuckler'), name('Hero', 'Heroine'), name('Champion'),
            name('Lord', 'Lady'),
        ],
        lgod: 'Tyr', ngod: 'Odin', cgod: 'Loki',
        filecode: 'Val', homebase: 'the Shrine of Destiny',
        intermed: 'the cave of Surtur',
        mnum: 342, petnum: -1, ldrnum: 355, guardnum: 381, neminum: 367,
        enemy1num: 3, enemy2num: 172, enemy1sym: 1, enemy2sym: 34,
        questarti: 32,
        allow: MH_HUMAN | MH_DWARF | ROLE_FEMALE | ROLE_LAWFUL
            | ROLE_NEUTRAL,
        attrbase: [10, 7, 7, 7, 10, 7],
        attrdist: [30, 6, 7, 20, 30, 7],
        hpadv: advance(14, 0, 0, 8, 2, 0),
        enadv: advance(1, 0, 0, 1, 0, 1),
        xlev: 10, initrecord: 0,
        spelbase: 10, spelheal: -2, spelshld: 0, spelarmr: 9,
        spelstat: 2, spelspec: 369, spelsbon: -4,
    },
    {
        name: name('Wizard'),
        rank: [
            name('Evoker'), name('Conjurer'), name('Thaumaturge'),
            name('Magician'), name('Enchanter', 'Enchantress'),
            name('Sorcerer', 'Sorceress'), name('Necromancer'),
            name('Wizard'), name('Mage'),
        ],
        lgod: 'Ptah', ngod: 'Thoth', cgod: 'Anhur',
        filecode: 'Wiz', homebase: 'the Lonely Tower',
        intermed: 'the Tower of Darkness',
        mnum: 343, petnum: 32, ldrnum: 356, guardnum: 382, neminum: 368,
        enemy1num: 129, enemy2num: 232, enemy1sym: 28, enemy2sym: 49,
        questarti: 33,
        allow: MH_HUMAN | MH_ELF | MH_GNOME | MH_ORC | ROLE_MALE
            | ROLE_FEMALE | ROLE_NEUTRAL | ROLE_CHAOTIC,
        attrbase: [7, 10, 7, 7, 7, 7],
        attrdist: [10, 30, 10, 20, 20, 10],
        hpadv: advance(10, 0, 0, 8, 1, 0),
        enadv: advance(4, 3, 0, 2, 0, 3),
        xlev: 12, initrecord: 0,
        spelbase: 1, spelheal: 0, spelshld: 3, spelarmr: 10,
        spelstat: 1, spelspec: 367, spelsbon: -4,
    },
]);

export const races = deepFreeze([
    {
        noun: 'human', name: 'human', adj: 'human', coll: 'humanity',
        filecode: 'Hum', individual: name('man', 'woman'),
        mnum: 260, mummynum: 192, zombienum: 244,
        allow: MH_HUMAN | ROLE_MALE | ROLE_FEMALE | ROLE_LAWFUL
            | ROLE_NEUTRAL | ROLE_CHAOTIC,
        selfmask: MH_HUMAN, lovemask: 0, hatemask: MH_GNOME | MH_ORC,
        attrmin: [3, 3, 3, 3, 3, 3],
        attrmax: [118, 18, 18, 18, 18, 18],
        hpadv: advance(2, 0, 0, 2, 1, 0),
        enadv: advance(1, 0, 2, 0, 2, 0),
    },
    {
        noun: 'elf', name: 'elf', adj: 'elven', coll: 'elvenkind',
        filecode: 'Elf', individual: name(null),
        mnum: 264, mummynum: 191, zombienum: 243,
        allow: MH_ELF | ROLE_MALE | ROLE_FEMALE | ROLE_CHAOTIC,
        selfmask: MH_ELF, lovemask: MH_ELF, hatemask: MH_ORC,
        attrmin: [3, 3, 3, 3, 3, 3],
        attrmax: [18, 20, 20, 18, 16, 18],
        hpadv: advance(1, 0, 0, 1, 1, 0),
        enadv: advance(2, 0, 3, 0, 3, 0),
    },
    {
        noun: 'dwarf', name: 'dwarf', adj: 'dwarven', coll: 'dwarvenkind',
        filecode: 'Dwa', individual: name(null),
        mnum: 44, mummynum: 190, zombienum: 242,
        allow: MH_DWARF | ROLE_MALE | ROLE_FEMALE | ROLE_LAWFUL,
        selfmask: MH_DWARF, lovemask: MH_DWARF | MH_GNOME, hatemask: MH_ORC,
        attrmin: [3, 3, 3, 3, 3, 3],
        attrmax: [118, 16, 16, 20, 20, 16],
        hpadv: advance(4, 0, 0, 3, 2, 0),
        enadv: advance(0, 0, 0, 0, 0, 0),
    },
    {
        noun: 'gnome', name: 'gnome', adj: 'gnomish', coll: 'gnomehood',
        filecode: 'Gno', individual: name(null),
        mnum: 165, mummynum: 188, zombienum: 240,
        allow: MH_GNOME | ROLE_MALE | ROLE_FEMALE | ROLE_NEUTRAL,
        selfmask: MH_GNOME, lovemask: MH_DWARF | MH_GNOME, hatemask: MH_HUMAN,
        attrmin: [3, 3, 3, 3, 3, 3],
        attrmax: [68, 19, 18, 18, 18, 18],
        hpadv: advance(1, 0, 0, 1, 0, 0),
        enadv: advance(2, 0, 2, 0, 2, 0),
    },
    {
        noun: 'orc', name: 'orc', adj: 'orcish', coll: 'orcdom',
        filecode: 'Orc', individual: name(null),
        mnum: 72, mummynum: 189, zombienum: 241,
        allow: MH_ORC | ROLE_MALE | ROLE_FEMALE | ROLE_CHAOTIC,
        selfmask: MH_ORC, lovemask: 0,
        hatemask: MH_HUMAN | MH_ELF | MH_DWARF,
        attrmin: [3, 3, 3, 3, 3, 3],
        attrmax: [68, 16, 16, 18, 18, 16],
        hpadv: advance(1, 0, 0, 1, 0, 0),
        enadv: advance(1, 0, 1, 0, 1, 0),
    },
]);

export const genders = deepFreeze([
    { name: 'male', adj: 'male', he: 'he', him: 'him', his: 'his', filecode: 'Mal', allow: ROLE_MALE, value: 0 },
    { name: 'female', adj: 'female', he: 'she', him: 'her', his: 'her', filecode: 'Fem', allow: ROLE_FEMALE, value: 1 },
    { name: 'neuter', adj: 'neuter', he: 'it', him: 'it', his: 'its', filecode: 'Ntr', allow: ROLE_NEUTER, value: 2 },
    { name: 'group', adj: 'group', he: 'they', him: 'them', his: 'their', filecode: 'Grp', allow: 0, value: 3 },
]);

export const aligns = deepFreeze([
    { name: 'lawful', noun: 'law', adj: 'lawful', filecode: 'Law', allow: ROLE_LAWFUL, value: A_LAWFUL },
    { name: 'neutral', noun: 'balance', adj: 'neutral', filecode: 'Neu', allow: ROLE_NEUTRAL, value: A_NEUTRAL },
    { name: 'chaotic', noun: 'chaos', adj: 'chaotic', filecode: 'Cha', allow: ROLE_CHAOTIC, value: A_CHAOTIC },
    { name: 'unaligned', noun: 'evil', adj: 'unaligned', filecode: 'Una', allow: 0, value: A_NONE },
]);

function text(value) {
    return typeof value === 'string' ? value.toLowerCase() : '';
}

function prefixMatch(input, candidate) {
    return candidate != null && candidate.toLowerCase().startsWith(input);
}

function randomToken(input) {
    return (input.length === 1 && (input === '*' || input === '@'))
        || 'random'.startsWith(input);
}

export function validrole(rolenum) {
    return Number.isInteger(rolenum) && rolenum >= 0 && rolenum < roles.length;
}

export function str2role(value) {
    const input = text(value);
    if (!input) return ROLE_NONE;
    for (let i = 0; i < roles.length; ++i) {
        const role = roles[i];
        if (prefixMatch(input, role.name.m)
            || prefixMatch(input, role.name.f)
            || role.filecode.toLowerCase() === input) return i;
    }
    return randomToken(input) ? ROLE_RANDOM : ROLE_NONE;
}

export function validrace(rolenum, racenum) {
    return validrole(rolenum) && Number.isInteger(racenum)
        && racenum >= 0 && racenum < races.length
        && Boolean(roles[rolenum].allow & races[racenum].allow & ROLE_RACEMASK);
}

export function str2race(value) {
    const input = text(value);
    if (!input) return ROLE_NONE;
    for (let i = 0; i < races.length; ++i) {
        const race = races[i];
        if (prefixMatch(input, race.noun) || prefixMatch(input, race.adj)
            || race.filecode.toLowerCase() === input) return i;
    }
    return randomToken(input) ? ROLE_RANDOM : ROLE_NONE;
}

export function validgend(rolenum, racenum, gendnum) {
    return validrole(rolenum) && validrace(rolenum, racenum)
        && Number.isInteger(gendnum) && gendnum >= 0 && gendnum < ROLE_GENDERS
        && Boolean(roles[rolenum].allow & races[racenum].allow
            & genders[gendnum].allow & ROLE_GENDMASK);
}

export function str2gend(value) {
    const input = text(value);
    if (!input) return ROLE_NONE;
    for (let i = 0; i < ROLE_GENDERS; ++i) {
        if (prefixMatch(input, genders[i].adj)
            || genders[i].filecode.toLowerCase() === input) return i;
    }
    return randomToken(input) ? ROLE_RANDOM : ROLE_NONE;
}

export function validalign(rolenum, racenum, alignnum) {
    return validrole(rolenum) && validrace(rolenum, racenum)
        && Number.isInteger(alignnum) && alignnum >= 0 && alignnum < ROLE_ALIGNS
        && Boolean(roles[rolenum].allow & races[racenum].allow
            & aligns[alignnum].allow & ROLE_ALIGNMASK);
}

export function str2align(value) {
    const input = text(value);
    if (!input) return ROLE_NONE;
    for (let i = 0; i < ROLE_ALIGNS; ++i) {
        if (prefixMatch(input, aligns[i].adj)
            || aligns[i].filecode.toLowerCase() === input) return i;
    }
    return randomToken(input) ? ROLE_RANDOM : ROLE_NONE;
}

export function findRole(value) {
    const index = str2role(value);
    return validrole(index) ? roles[index] : null;
}

export function findRace(value) {
    const index = str2race(value);
    return index >= 0 ? races[index] : null;
}

export function roleIndex(role) {
    if (Number.isInteger(role)) {
        if (validrole(role)) return role;
        return roles.findIndex((candidate) => candidate.mnum === role);
    }
    if (role && Number.isInteger(role.mnum))
        return roles.findIndex((candidate) => candidate.mnum === role.mnum);
    return str2role(role?.name?.m ?? role);
}

export function raceIndex(race) {
    if (Number.isInteger(race)) {
        if (race >= 0 && race < races.length) return race;
        return races.findIndex((candidate) => candidate.mnum === race);
    }
    if (race && Number.isInteger(race.mnum))
        return races.findIndex((candidate) => candidate.mnum === race.mnum);
    return str2race(race?.noun ?? race?.name ?? race);
}

export function roleName(role, female = false) {
    const index = roleIndex(role);
    if (!validrole(index)) return null;
    return female && roles[index].name.f
        ? roles[index].name.f : roles[index].name.m;
}

export function rankOf(role, level, female = false) {
    const index = roleIndex(role);
    if (!validrole(index)) return null;
    const rankIndex = level <= 2
        ? 0 : level <= 30 ? Math.trunc((level + 2) / 4) : 8;
    const rank = roles[index].rank[rankIndex];
    return female && rank.f ? rank.f : rank.m;
}
