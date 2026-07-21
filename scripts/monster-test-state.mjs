// Fresh inert state shared by monster-generation characterization tests.
// Suites own catalog initialization, map allocation, special-level locations,
// and every field that selects the production path under test.
export function rawMonsterGenerationState() {
    return {
        branches: [],
        // Dungeon zero begins at depth one and has enough ordinary floors to
        // exercise level-one generation without reaching an end boundary.
        dungeons: [{
            depth_start: 1,
            dunlev_ureached: 1,
            entry_lev: 1,
            flags: { align: 0, hellish: false },
            num_dunlevs: 20,
        }],
        // Dungeon one is reserved as the Quest index; these tests remain in
        // dungeon zero, level one unless a suite explicitly changes it.
        quest_dnum: 1,
        specialLevels: [],
        u: {
            uhave: { amulet: 0 },
            ualign: { type: 0, record: 0, abuse: 0 },
            ulevel: 1,
            uz: { dnum: 0, dlevel: 1 },
        },
        urace: { lovemask: 0, hatemask: 0 },
    };
}
