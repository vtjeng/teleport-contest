// GENERATED FILE - do not edit.
// Regenerate with: node scripts/generate-shtypes.mjs
// Source: nethack-c/upstream/src/shknam.c at 16ff59115315917b93185d026aeefea06db9b0f4.
//
// shknam.c shtypes[], one entry per shop type in source order, so the index
// into this table is the rtype offset from SHOPBASE that mkroom.c mkshop()
// stores. The trailing sentinel row is dropped: it terminates C's iteration
// and carries no shop. Every {0, 0} filler in an iprobs[] array is dropped
// too, because get_shop_item() stops once the accumulated probability reaches
// 100 and never reads past the last real pair.
//
// symb identifies the shop type, prob is its percentage share of mkshop()'s
// single rnd(100), and an iprobs[] itype is an object class when it is
// non-negative and a specific object when it is negative.

import {
    AMULET_CLASS,
    ARMOR_CLASS,
    BRASS_LANTERN,
    ELVEN_CLOAK,
    FOOD_CLASS,
    GEM_CLASS,
    ICE_BOX,
    LEATHER_GLOVES,
    LUMP_OF_ROYAL_JELLY,
    MAGIC_LAMP,
    MAXOCLASSES,
    OIL_LAMP,
    POTION_CLASS,
    POT_BOOZE,
    POT_FRUIT_JUICE,
    POT_FULL_HEALING,
    POT_HEALING,
    POT_OIL,
    POT_WATER,
    RANDOM_CLASS,
    RING_CLASS,
    SCROLL_CLASS,
    SCR_FOOD_DETECTION,
    SCR_LIGHT,
    SPBOOK_CLASS,
    SPE_LIGHT,
    TALLOW_CANDLE,
    TOOL_CLASS,
    WAND_CLASS,
    WAN_LIGHT,
    WAX_CANDLE,
    WEAPON_CLASS,
} from './objects.js';
import {
    D_SHOP,
} from './const.js';

export const shkgeneral = Object.freeze([
    "Hebiwerie", "Possogroenoe", "Asidonhopo", "Manlobbi", "Adjama",
    "Pakka Pakka", "Kabalebo", "Wonotobo", "Akalapi", "Sipaliwini", "Annootok",
    "Upernavik", "Angmagssalik", "Aklavik", "Inuvik", "Tuktoyaktuk",
    "Chicoutimi", "Ouiatchouane", "Chibougamau", "Matagami", "Kipawa",
    "Kinojevis", "Abitibi", "Maganasipi", "Akureyri", "Kopasker", "Budereyri",
    "Akranes", "Bordeyri", "Holmavik",
]);

export const shkarmors = Object.freeze([
    "Demirci", "Kalecik", "Boyabai", "Yildizeli", "Gaziantep", "Siirt",
    "Akhalataki", "Tirebolu", "Aksaray", "Ermenak", "Iskenderun", "Kadirli",
    "Siverek", "Pervari", "Malasgirt", "Bayburt", "Ayancik", "Zonguldak",
    "Balya", "Tefenni", "Artvin", "Kars", "Makharadze", "Malazgirt", "Midyat",
    "Birecik", "Kirikkale", "Alaca", "Polatli", "Nallihan",
]);

export const shkbooks = Object.freeze([
    "Skibbereen", "Kanturk", "Rath Luirc", "Ennistymon", "Lahinch", "Kinnegad",
    "Lugnaquillia", "Enniscorthy", "Gweebarra", "Kittamagh", "Nenagh", "Sneem",
    "Ballingeary", "Kilgarvan", "Cahersiveen", "Glenbeigh", "Kilmihil",
    "Kiltamagh", "Droichead Atha", "Inniscrone", "Clonegal", "Lisnaskea",
    "Culdaff", "Dunfanaghy", "Inishbofin", "Kesh",
]);

export const shkliquors = Object.freeze([
    "Njezjin", "Tsjernigof", "Ossipewsk", "Gorlowka", "Gomel", "Konosja",
    "Weliki Oestjoeg", "Syktywkar", "Sablja", "Narodnaja", "Kyzyl",
    "Walbrzych", "Swidnica", "Klodzko", "Raciborz", "Gliwice", "Brzeg",
    "Krnov", "Hradec Kralove", "Leuk", "Brig", "Brienz", "Thun", "Sarnen",
    "Burglen", "Elm", "Flims", "Vals", "Schuls", "Zum Loch",
]);

export const shkweapons = Object.freeze([
    "Voulgezac", "Rouffiac", "Lerignac", "Touverac", "Guizengeard", "Melac",
    "Neuvicq", "Vanzac", "Picq", "Urignac", "Corignac", "Fleac", "Lonzac",
    "Vergt", "Queyssac", "Liorac", "Echourgnac", "Cazelon", "Eypau",
    "Carignan", "Monbazillac", "Jonzac", "Pons", "Jumilhac", "Fenouilledes",
    "Laguiolet", "Saujon", "Eymoutiers", "Eygurande", "Eauze", "Labouheyre",
]);

export const shkfoods = Object.freeze([
    "Djasinga", "Tjibarusa", "Tjiwidej", "Pengalengan", "Bandjar",
    "Parbalingga", "Bojolali", "Sarangan", "Ngebel", "Djombang",
    "Ardjawinangun", "Berbek", "Papar", "Baliga", "Tjisolok", "Siboga",
    "Banjoewangi", "Trenggalek", "Karangkobar", "Njalindoeng", "Pasawahan",
    "Pameunpeuk", "Patjitan", "Kediri", "Pemboeang", "Tringanoe", "Makin",
    "Tipor", "Semai", "Berhala", "Tegal", "Samoe",
]);

export const shkrings = Object.freeze([
    "Feyfer", "Flugi", "Gheel", "Havic", "Haynin", "Hoboken", "Imbyze", "Juyn",
    "Kinsky", "Massis", "Matray", "Moy", "Olycan", "Sadelin", "Svaving",
    "Tapper", "Terwen", "Wirix", "Ypey", "Rastegaisa", "Varjag Njarga",
    "Kautekeino", "Abisko", "Enontekis", "Rovaniemi", "Avasaksa", "Haparanda",
    "Lulea", "Gellivare", "Oeloe", "Kajaani", "Fauske",
]);

export const shkwands = Object.freeze([
    "Yr Wyddgrug", "Trallwng", "Mallwyd", "Pontarfynach", "Rhaeader",
    "Llandrindod", "Llanfair-ym-muallt", "Y-Fenni", "Maesteg", "Rhydaman",
    "Beddgelert", "Curig", "Llanrwst", "Llanerchymedd", "Caergybi", "Nairn",
    "Turriff", "Inverurie", "Braemar", "Lochnagar", "Kerloch", "Beinn a Ghlo",
    "Drumnadrochit", "Morven", "Uist", "Storr", "Sgurr na Ciche", "Cannich",
    "Gairloch", "Kyleakin", "Dunvegan",
]);

export const shktools = Object.freeze([
    "Ymla", "Eed-morra", "Elan Lapinski", "Cubask", "Nieb", "Bnowr Falr",
    "Sperc", "Noskcirdneh", "Yawolloh", "Hyeghu", "Niskal", "Trahnil",
    "Htargcm", "Enrobwem", "Kachzi Rellim", "Regien", "Donmyar", "Yelpur",
    "Nosnehpets", "Stewe", "Renrut", "Senna Hut", "-Zlaw", "Nosalnef",
    "Rewuorb", "Rellenk", "Yad", "Cire Htims", "Y-crad", "Nenilukah", "Corsh",
    "Aned", "Dark Eery", "Niknar", "Lapu", "Lechaim", "Rebrol-nek",
    "AlliWar Wickson", "Oguhmk", "Telloc Cyaj",
]);

export const shkhealthfoods = Object.freeze([
    "Ga'er", "Zhangmu", "Rikaze", "Jiangji", "Changdu", "Linzhi", "Shigatse",
    "Gyantse", "Ganden", "Tsurphu", "Lhasa", "Tsedong", "Drepung", "=Azura",
    "=Blaze", "=Breanna", "=Breezy", "=Dharma", "=Feather", "=Jasmine",
    "=Luna", "=Melody", "=Moonjava", "=Petal", "=Rhiannon", "=Starla",
    "=Tranquilla", "=Windsong", "=Zennia", "=Zoe", "=Zora",
]);

export const shklight = Object.freeze([
    "Zarnesti", "Slanic", "Nehoiasu", "Ludus", "Sighisoara", "Nisipitu",
    "Razboieni", "Bicaz", "Dorohoi", "Vaslui", "Fetesti", "Tirgu Neamt",
    "Babadag", "Zimnicea", "Zlatna", "Jiu", "Eforie", "Mamaia", "Silistra",
    "Tulovo", "Panagyuritshte", "Smolyan", "Kirklareli", "Pernik", "Lom",
    "Haskovo", "Dobrinishte", "Varvara", "Oryahovo", "Troyan", "Lovech",
    "Sliven",
]);

export const SHTYPES = Object.freeze([
    {
        name: "general store",
        annotation: null,
        symb: RANDOM_CLASS,
        prob: 42,
        shdist: D_SHOP,
        iprobs: [
            { iprob: 100, itype: RANDOM_CLASS },
        ],
        shknms: shkgeneral,
    },
    {
        name: "used armor dealership",
        annotation: "armor shop",
        symb: ARMOR_CLASS,
        prob: 14,
        shdist: D_SHOP,
        iprobs: [
            { iprob: 90, itype: ARMOR_CLASS },
            { iprob: 10, itype: WEAPON_CLASS },
        ],
        shknms: shkarmors,
    },
    {
        name: "second-hand bookstore",
        annotation: "scroll shop",
        symb: SCROLL_CLASS,
        prob: 10,
        shdist: D_SHOP,
        iprobs: [
            { iprob: 90, itype: SCROLL_CLASS },
            { iprob: 10, itype: SPBOOK_CLASS },
        ],
        shknms: shkbooks,
    },
    {
        name: "liquor emporium",
        annotation: "potion shop",
        symb: POTION_CLASS,
        prob: 10,
        shdist: D_SHOP,
        iprobs: [
            { iprob: 100, itype: POTION_CLASS },
        ],
        shknms: shkliquors,
    },
    {
        name: "antique weapons outlet",
        annotation: "weapon shop",
        symb: WEAPON_CLASS,
        prob: 5,
        shdist: D_SHOP,
        iprobs: [
            { iprob: 90, itype: WEAPON_CLASS },
            { iprob: 10, itype: ARMOR_CLASS },
        ],
        shknms: shkweapons,
    },
    {
        name: "delicatessen",
        annotation: "food shop",
        symb: FOOD_CLASS,
        prob: 5,
        shdist: D_SHOP,
        iprobs: [
            { iprob: 83, itype: FOOD_CLASS },
            { iprob: 5, itype: -POT_FRUIT_JUICE },
            { iprob: 4, itype: -POT_BOOZE },
            { iprob: 5, itype: -POT_WATER },
            { iprob: 3, itype: -ICE_BOX },
        ],
        shknms: shkfoods,
    },
    {
        name: "jewelers",
        annotation: "ring shop",
        symb: RING_CLASS,
        prob: 3,
        shdist: D_SHOP,
        iprobs: [
            { iprob: 85, itype: RING_CLASS },
            { iprob: 10, itype: GEM_CLASS },
            { iprob: 5, itype: AMULET_CLASS },
        ],
        shknms: shkrings,
    },
    {
        name: "quality apparel and accessories",
        annotation: "wand shop",
        symb: WAND_CLASS,
        prob: 3,
        shdist: D_SHOP,
        iprobs: [
            { iprob: 90, itype: WAND_CLASS },
            { iprob: 5, itype: -LEATHER_GLOVES },
            { iprob: 5, itype: -ELVEN_CLOAK },
        ],
        shknms: shkwands,
    },
    {
        name: "hardware store",
        annotation: "tool shop",
        symb: TOOL_CLASS,
        prob: 3,
        shdist: D_SHOP,
        iprobs: [
            { iprob: 100, itype: TOOL_CLASS },
        ],
        shknms: shktools,
    },
    {
        name: "rare books",
        annotation: "bookstore",
        symb: SPBOOK_CLASS,
        prob: 3,
        shdist: D_SHOP,
        iprobs: [
            { iprob: 90, itype: SPBOOK_CLASS },
            { iprob: 10, itype: SCROLL_CLASS },
        ],
        shknms: shkbooks,
    },
    {
        name: "health food store",
        annotation: "vegetarian food shop",
        symb: FOOD_CLASS,
        prob: 2,
        shdist: D_SHOP,
        iprobs: [
            { iprob: 70, itype: (MAXOCLASSES + 1) },
            { iprob: 20, itype: -POT_FRUIT_JUICE },
            { iprob: 4, itype: -POT_HEALING },
            { iprob: 3, itype: -POT_FULL_HEALING },
            { iprob: 2, itype: -SCR_FOOD_DETECTION },
            { iprob: 1, itype: -LUMP_OF_ROYAL_JELLY },
        ],
        shknms: shkhealthfoods,
    },
    {
        name: "lighting store",
        annotation: "lighting shop",
        symb: TOOL_CLASS,
        prob: 0,
        shdist: D_SHOP,
        iprobs: [
            { iprob: 30, itype: -WAX_CANDLE },
            { iprob: 44, itype: -TALLOW_CANDLE },
            { iprob: 5, itype: -BRASS_LANTERN },
            { iprob: 9, itype: -OIL_LAMP },
            { iprob: 3, itype: -MAGIC_LAMP },
            { iprob: 5, itype: -POT_OIL },
            { iprob: 2, itype: -WAN_LIGHT },
            { iprob: 1, itype: -SCR_LIGHT },
            { iprob: 1, itype: -SPE_LIGHT },
        ],
        shknms: shklight,
    },
].map((shop) => Object.freeze({
    ...shop,
    iprobs: Object.freeze(shop.iprobs.map(Object.freeze)),
})));
