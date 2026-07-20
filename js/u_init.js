// Hero bootstrap before level generation.
// C ref: src/u_init.c u_init_misc(); recorder patch 001 routes the hero's
// birthday through calendar.c getnow().

import {
    BLINDED,
    COLD_RES,
    FAST,
    FROMEXPER,
    FROMOUTSIDE,
    FROM_FORM,
    FROM_RACE,
    INFRAVISION,
    LAST_PROP,
    MAXULEV,
    N_ACH,
    NON_PM,
    NOT_HUNGRY,
    NUM_ATTRS,
    P_NUM_SKILLS,
    P_SKILL_LIMIT,
    POISON_RES,
    SEARCHING,
    SEE_INVIS,
    SLEEP_RES,
    STEALTH,
    WARN_OF_MON,
} from './const.js';
import { newhp } from './attrib.js';
import { getnow } from './calendar.js';
import { newpw } from './exper.js';
import { game } from './gstate.js';
import { MAXSPELL } from './objects.js';
import { rn2, rnd } from './rng.js';
import { aligns } from './roles.js';

export const RIGHT_HANDED = 0;
export const LEFT_HANDED = 1;

const NO_SPELL = 0;
const M3_INFRAVISION = 0x0100;

// The initial player monster records with a natural resistance. All other
// role records have mresists == 0. C ref: include/monsters.h character
// classes and polyself.c set_uasmon().
const ROLE_FORM_RESISTANCES = Object.freeze({
    Bar: [POISON_RES],
    Hea: [POISON_RES],
    Val: [COLD_RES],
});

// Only abilities reached by attrib.c adjabil(0, 1) are needed at this
// boundary. Higher-level entries remain the responsibility of a complete
// adjabil port.
const LEVEL_ONE_ROLE_ABILITIES = Object.freeze({
    Arc: [SEARCHING],
    Bar: [POISON_RES],
    Hea: [POISON_RES],
    Mon: [FAST, SLEEP_RES, SEE_INVIS],
    Ran: [SEARCHING],
    Rog: [STEALTH],
    Sam: [FAST],
    Val: [COLD_RES],
});

const LEVEL_ONE_RACE_ABILITIES = Object.freeze({
    Elf: [INFRAVISION],
    Orc: [INFRAVISION, POISON_RES],
});

const ROLEPLAY_BOOLEAN_FIELDS = Object.freeze([
    'blind',
    'nudist',
    'deaf',
    'pauper',
    'reroll',
    'reserved1',
    'reserved2',
    'reserved3',
]);

const EVENT_FIELDS = Object.freeze([
    'minor_oracle', 'major_oracle', 'read_tribute', 'qcalled', 'qexpelled',
    'qcompleted', 'uheard_tune', 'uopened_dbridge', 'invoked',
    'gehennom_entered', 'uhand_of_elbereth', 'udemigod', 'uvibrated',
    'ascended', 'amulet_wish',
]);
const HAVE_FIELDS = Object.freeze([
    'amulet', 'bell', 'book', 'menorah', 'questart', 'unused',
]);
const CONDUCT_FIELDS = Object.freeze([
    'unvegetarian', 'unvegan', 'food', 'gnostic', 'weaphit', 'killer',
    'literate', 'polypiles', 'polyselfs', 'wishes', 'wisharti',
    'hf_reserved1', 'sokocheat', 'pets', 'reserved1', 'reserved2',
    'reserved3', 'reserved4',
]);

function zeroAttributes() {
    return new Array(NUM_ATTRS).fill(0);
}

function zeroProperties() {
    return Array.from(
        { length: LAST_PROP + 1 },
        () => ({ intrinsic: 0, extrinsic: 0, blocked: 0 }),
    );
}

function zeroRecord(fields) {
    return Object.fromEntries(fields.map((field) => [field, 0]));
}

function zeroLevel() {
    return { dnum: 0, dlevel: 0 };
}

function zeroSkills() {
    return Array.from(
        { length: P_NUM_SKILLS },
        () => ({ skill: 0, max_skill: 0, advance: 0 }),
    );
}

function copyRoleplay(roleplay = {}) {
    const copy = {};
    for (const field of ROLEPLAY_BOOLEAN_FIELDS)
        copy[field] = Boolean(roleplay[field]);
    copy.numbones = Math.trunc(roleplay.numbones ?? 0);
    copy.numrerolls = Math.trunc(roleplay.numrerolls ?? 0);
    return copy;
}

function zeroHero(roleplay) {
    return {
        uroleplay: roleplay,
        ux: 0,
        uy: 0,
        dx: 0,
        dy: 0,
        dz: 0,
        tx: 0,
        ty: 0,
        ux0: 0,
        uy0: 0,
        uz: zeroLevel(),
        uz0: zeroLevel(),
        utolev: zeroLevel(),
        utotype: 0,
        ucamefrom: zeroLevel(),
        umoved: false,
        last_str_turn: 0,
        ulevel: 0,
        ulevelmax: 0,
        ulevelpeak: 0,
        utrap: 0,
        utraptype: 0,
        urooms: new Array(5).fill(0),
        urooms0: new Array(5).fill(0),
        uentered: new Array(5).fill(0),
        ushops: new Array(5).fill(0),
        ushops0: new Array(5).fill(0),
        ushops_entered: new Array(5).fill(0),
        ushops_left: new Array(5).fill(0),
        uhunger: 0,
        uhs: 0,
        uprops: zeroProperties(),
        umconf: 0,
        usick_type: 0,
        nv_range: 0,
        xray_range: 0,
        unblind_telepat_range: 0,
        bglyph: 0,
        cglyph: 0,
        bc_order: 0,
        bc_felt: 0,
        umonster: 0,
        umonnum: 0,
        mh: 0,
        mhmax: 0,
        mtimedone: 0,
        macurr: { a: zeroAttributes() },
        mamax: { a: zeroAttributes() },
        ulycn: 0,
        ucreamed: 0,
        uswldtim: 0,
        uswallow: false,
        uinwater: false,
        uundetected: false,
        mfemale: false,
        uinvulnerable: false,
        uburied: false,
        uedibility: false,
        uhandedness: RIGHT_HANDED,
        udg_cnt: 0,
        uevent: zeroRecord(EVENT_FIELDS),
        uhave: zeroRecord(HAVE_FIELDS),
        uconduct: zeroRecord(CONDUCT_FIELDS),
        acurr: { a: zeroAttributes() },
        aexe: zeroAttributes(),
        abon: zeroAttributes(),
        amax: { a: zeroAttributes() },
        atemp: zeroAttributes(),
        atime: zeroAttributes(),
        ualign: { type: 0, record: 0 },
        ualignbase: [0, 0],
        uluck: 0,
        moreluck: 0,
        uhitinc: 0,
        udaminc: 0,
        uac: 0,
        uspellprot: 0,
        usptime: 0,
        uspmtime: 0,
        uhp: 0,
        uhpmax: 0,
        uhppeak: 0,
        uen: 0,
        uenmax: 0,
        uenpeak: 0,
        uhpinc: new Array(MAXULEV).fill(0),
        ueninc: new Array(MAXULEV).fill(0),
        ugangr: 0,
        ugifts: 0,
        ublessed: 0,
        ublesscnt: 0,
        umoney0: 0,
        uspare1: 0,
        uexp: 0,
        urexp: 0,
        ucleansed: 0,
        usleep: 0,
        uinvault: 0,
        ustuck: null,
        usteed: null,
        ustuck_mid: 0,
        usteed_mid: 0,
        ugallop: 0,
        urideturns: 0,
        umortality: 0,
        ugrave_arise: 0,
        weapon_slots: 0,
        skills_advanced: 0,
        skill_record: new Array(P_SKILL_LIMIT).fill(0),
        weapon_skills: zeroSkills(),
        twoweap: false,
        mcham: 0,
        umovement: 0,
        uachieved: new Array(N_ACH).fill(0),
        umonst: null,
    };
}

function property(u, index) {
    return u.uprops[index];
}

function setFromForm(u, index, enabled) {
    if (enabled) property(u, index).intrinsic |= FROM_FORM;
    else property(u, index).intrinsic &= ~FROM_FORM;
}

function roleFormResistanceIndexes(state) {
    const catalogValue = state.mons?.[state.urole.mnum]?.mresists;
    if (Number.isInteger(catalogValue)) {
        const result = [];
        // The first eight property indices deliberately share the MR bit
        // ordering in include/prop.h and include/monflag.h.
        for (let index = 1; index <= 8; ++index) {
            if (catalogValue & (1 << (index - 1))) result.push(index);
        }
        return result;
    }
    return ROLE_FORM_RESISTANCES[state.urole.filecode] ?? [];
}

function raceHasInfravision(state) {
    const raceMonster = state.mons?.[state.urace.mnum];
    if (Number.isInteger(raceMonster?.mflags3))
        return Boolean(raceMonster.mflags3 & M3_INFRAVISION);
    return state.urace.filecode !== 'Hum';
}

// Initial-case implementation of polyself.c set_uasmon(). The complete
// monster catalog is optional here because every valid starting role has a
// fixed, source-known form; supplying the catalog makes the resistance and
// race-infravision reads data-driven without changing this call boundary.
function setInitialUasmon(state) {
    const { u } = state;
    const resistanceIndexes = roleFormResistanceIndexes(state);
    const monsterData = state.mons?.[u.umonnum] ?? {
        // Source-derived projection of include/monsters.h's playable form.
        // A complete mons[] port should replace it before broader polymorph
        // behavior is implemented.
        mnum: u.umonnum,
        mresists: resistanceIndexes.reduce(
            (mask, index) => mask | (1 << (index - 1)),
            0,
        ),
    };
    state.youmonst = {
        ...(state.youmonst ?? {}),
        data: monsterData,
        mnum: u.umonnum,
        m_id: 1,
        cham: NON_PM,
    };
    u.mcham = NON_PM;

    for (let index = 1; index <= LAST_PROP; ++index)
        property(u, index).intrinsic &= ~FROM_FORM;
    for (const index of resistanceIndexes)
        setFromForm(u, index, true);
    setFromForm(u, INFRAVISION, raceHasInfravision(state));

    state.context ??= {};
    state.context.warntype ??= {};
    state.context.warntype.obj ??= 0;
    state.context.warntype.speciesidx = NON_PM;
    state.context.warntype.species = null;
    state.context.warntype.polyd = 0;
    property(u, WARN_OF_MON).intrinsic &= ~FROM_RACE;
    state.gw ??= {};
    state.gw.were_changes = 0;
}

function applyInitialAbilities(state) {
    const { u } = state;
    for (const index of LEVEL_ONE_ROLE_ABILITIES[state.urole.filecode] ?? [])
        property(u, index).intrinsic |= FROMEXPER | FROMOUTSIDE;
    for (const index of LEVEL_ONE_RACE_ABILITIES[state.urace.filecode] ?? [])
        property(u, index).intrinsic |= FROM_RACE | FROMOUTSIDE;
}

function init_uhunger(state) {
    const { u } = state;
    state.disp ??= {};
    state.disp.botl = u.uhs !== NOT_HUNGRY || u.atemp[0] < 0;
    u.uhunger = 900;
    u.uhs = NOT_HUNGRY;
    if (u.atemp[0] < 0) u.atemp[0] = 0;
}

function clearSpellIds(state) {
    state.svs ??= {};
    const spellbook = state.svs.spl_book ??= [];
    for (let index = 0; index <= MAXSPELL; ++index) {
        spellbook[index] ??= { sp_id: NO_SPELL, sp_lev: 0, sp_know: 0 };
        spellbook[index].sp_id = NO_SPELL;
    }
    spellbook.length = MAXSPELL + 1;
}

function max_rank_sz(state) {
    let maximum = 0;
    for (const rank of state.urole.rank ?? []) {
        maximum = Math.max(
            maximum,
            rank.m?.length ?? 0,
            rank.f?.length ?? 0,
        );
    }
    state.gm ??= {};
    state.gm.mrank_sz = maximum;
}

/**
 * Initialize the non-inventory portion of the hero before mklev().
 *
 * `role_init()` must already have populated `state.urole`, `state.urace`, and
 * the four initial-character flags. During a new game `state.moves` must
 * still be zero; u_init_role() changes it to one after level generation.
 */
export function u_init_misc(
    state = game,
    random = { rn2, rnd },
    { now = new Date() } = {},
) {
    if (!state.urole || !state.urace)
        throw new Error('u_init_misc requires role_init first');
    if (!state.flags)
        throw new Error('u_init_misc requires initialized flags');

    const roleplay = copyRoleplay(state.u?.uroleplay);
    state.flags.female = Boolean(state.flags.initgend);
    state.flags.beginner = true;

    // C clears the complete struct before restoring only the roleplay options.
    state.u = zeroHero(roleplay);
    state.ubirthday = 0;
    state.urealtime = { realtime: 0, start_timing: 0, finish_time: 0 };

    const { u } = state;
    u.uz.dlevel = 1;
    u.utolev = { ...u.uz };
    u.ugrave_arise = NON_PM;
    u.umonnum = u.umonster = state.urole.mnum;
    u.ulycn = NON_PM;
    setInitialUasmon(state);

    u.uhp = u.uhpmax = u.uhppeak = newhp(state, random);
    u.uen = u.uenmax = u.uenpeak = newpw(state, random);
    applyInitialAbilities(state); // C: adjabil(0, 1), while u.ulevel is zero.
    u.ulevel = u.ulevelmax = 1;

    init_uhunger(state);
    clearSpellIds(state);
    u.ublesscnt = 300;
    const alignment = aligns[state.flags.initalign]?.value;
    if (alignment === undefined)
        throw new RangeError(`invalid initial alignment: ${state.flags.initalign}`);
    u.ualignbase[0] = u.ualignbase[1] = u.ualign.type = alignment;
    state.ubirthday = getnow(state, now);

    u.nv_range = 1;
    u.xray_range = -1;
    u.unblind_telepat_range = -1;
    if (u.uroleplay.blind)
        property(u, BLINDED).intrinsic |= FROMOUTSIDE;

    u.uhandedness = random.rn2(10) ? RIGHT_HANDED : LEFT_HANDED;
    max_rank_sz(state);
    return state;
}

export const _uInitInternals = Object.freeze({
    applyInitialAbilities,
    clearSpellIds,
    copyRoleplay,
    init_uhunger,
    max_rank_sz,
    setInitialUasmon,
});
