// Room-topology projections.
// C ref: mkroom.c cmap_to_type().

import {
    AIR,
    ALTAR,
    BLCORNER,
    BRCORNER,
    CLOUD,
    CORR,
    CROSSWALL,
    DBWALL,
    DOOR,
    DRAWBRIDGE_DOWN,
    FOUNTAIN,
    GRAVE,
    HWALL,
    ICE,
    IRONBARS,
    LADDER,
    LAVAPOOL,
    LAVAWALL,
    POOL,
    ROOM,
    SINK,
    STAIRS,
    STONE,
    TDWALL,
    THRONE,
    TLCORNER,
    TLWALL,
    TREE,
    TRCORNER,
    TRWALL,
    TUWALL,
    VWALL,
    WATER,
} from './const.js';
import {
    S_air,
    S_altar,
    S_bars,
    S_blcorn,
    S_brcorn,
    S_cloud,
    S_corr,
    S_crwall,
    S_darkroom,
    S_dnladder,
    S_dnstair,
    S_fountain,
    S_grave,
    S_hcdoor,
    S_hcdbridge,
    S_hodbridge,
    S_hodoor,
    S_hwall,
    S_ice,
    S_lava,
    S_lavawall,
    S_litcorr,
    S_ndoor,
    S_pool,
    S_room,
    S_sink,
    S_stone,
    S_tdwall,
    S_throne,
    S_tlcorn,
    S_tlwall,
    S_tree,
    S_trcorn,
    S_trwall,
    S_tuwall,
    S_upladder,
    S_upstair,
    S_vcdoor,
    S_vcdbridge,
    S_vodbridge,
    S_vodoor,
    S_vwall,
    S_water,
} from './symbols.js';

export function cmap_to_type(symbol) {
    switch (symbol) {
    case S_vwall: return VWALL;
    case S_hwall: return HWALL;
    case S_tlcorn: return TLCORNER;
    case S_trcorn: return TRCORNER;
    case S_blcorn: return BLCORNER;
    case S_brcorn: return BRCORNER;
    case S_crwall: return CROSSWALL;
    case S_tuwall: return TUWALL;
    case S_tdwall: return TDWALL;
    case S_tlwall: return TLWALL;
    case S_trwall: return TRWALL;
    case S_ndoor:
    case S_vodoor:
    case S_hodoor:
    case S_vcdoor:
    case S_hcdoor:
        return DOOR;
    case S_bars: return IRONBARS;
    case S_tree: return TREE;
    case S_room:
    case S_darkroom:
        return ROOM;
    case S_corr:
    case S_litcorr:
        return CORR;
    case S_upstair:
    case S_dnstair:
        return STAIRS;
    case S_upladder:
    case S_dnladder:
        return LADDER;
    case S_altar: return ALTAR;
    case S_grave: return GRAVE;
    case S_throne: return THRONE;
    case S_sink: return SINK;
    case S_fountain: return FOUNTAIN;
    case S_pool: return POOL;
    case S_ice: return ICE;
    case S_lava: return LAVAPOOL;
    case S_vodbridge:
    case S_hodbridge:
        return DRAWBRIDGE_DOWN;
    case S_vcdbridge:
    case S_hcdbridge:
        return DBWALL;
    case S_air: return AIR;
    case S_cloud: return CLOUD;
    case S_water: return WATER;
    case S_lavawall: return LAVAWALL;
    case S_stone:
    default:
        return STONE;
    }
}
