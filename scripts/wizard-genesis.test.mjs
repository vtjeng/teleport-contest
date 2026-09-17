// The ^G monster-creation prompt: wizcmds.c wiz_genesis() and the four read.c
// functions behind it.
//
// scripts/run-wizard-genesis.mjs holds strict differential evidence for the
// dispatch routes and ordinary named creation. The assertions here pin the
// request fields that no screen carries and the source branches that need
// stateful checks: qualifiers, census bounds, and creation-side state.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ADMITTED_COMMANDS,
    failClosedCommandRefusals,
} from '../js/cmd.js';
import { FEMALE, IN_SIGHT, MALE, NEUTRAL } from '../js/const.js';
import { WIZMODECMD, extcmdlist } from '../js/extcmdlist_data.js';
import { game, resetGame } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { MAXMCLASSES } from '../js/symbols.js';
import {
    MONSTER_TEMPLATES,
    NON_PM,
    PM_ALIGNED_CLERIC,
    PM_ANGEL,
    PM_DOPPELGANGER,
    PM_GAS_SPORE,
    PM_GIANT_EEL,
    PM_GNOME_LEADER,
    PM_GUARD,
    PM_HIGH_CLERIC,
    PM_HUMAN_ZOMBIE,
    PM_LONG_WORM,
    PM_LONG_WORM_TAIL,
    PM_MEDUSA,
    PM_MINOTAUR,
    PM_NEWT,
    PM_PONY,
    PM_SHOPKEEPER,
    PM_TRAPPER,
    PM_WIZARD,
    monst_globals_init,
} from '../js/monsters.js';
import { is_female, is_male } from '../js/mondata.js';
import {
    cant_revive,
    create_particular_parse,
} from '../js/read.js';
import { monster_census } from '../js/minion.js';
import { roles } from '../js/roles.js';
import { wiz_genesis } from '../js/wizcmds.js';
import {
    ESCAPE_KEY,
    EXTCMD_KEY,
    GENESIS_KEY,
    WAIT_KEY,
    loadWizardGenesisRecipe,
} from './run-wizard-genesis.mjs';

// read.c:3162's QUAN_LIMIT, ROWNO * (COLNO - 1) with the shipped map
// size: one monster per cell of a 21-row, 79-column map.
const QUAN_LIMIT = 21 * 79;

function topLine() {
    return game.nhDisplay.grid[0].map(({ ch }) => ch).join('').trimEnd();
}

// Locate a segment by the keys it types, so reordering the matrix cannot
// silently point a test at a different case.
function segmentFor(moves) {
    const found = loadWizardGenesisRecipe().segments.find(
        (segment) => segment.moves === `${WAIT_KEY}${moves}`,
    );
    assert.ok(found, `the matrix contains a segment typing ${moves}`);
    return found;
}

// The state create_particular_parse() reads: gm.multi for the quantity,
// gu.urole.mnum for the arbitrary index it starts `which` at, the wizard flag
// for the "*" arm, and mons[] for name_to_monplus() and unique_corpstat().
function parseState({ multi = 0, wizard = true } = {}) {
    const state = resetGame();
    state.multi = multi;
    state.wizard = wizard;
    // roles[0] is the Archeologist row, whose mnum is PM_ARCHEOLOGIST; any row
    // does, because C's own comment calls the value arbitrary.
    state.urole = { ...roles[0] };
    monst_globals_init(state);
    return state;
}

function levelMonsters() {
    const found = [];
    for (let mon = game.level.monlist; mon; mon = mon.nmon) found.push(mon);
    return found;
}

// Run a segment's keys twice: once with the opening wait alone, to learn what
// the level generator already placed, and once in full. Answers the monsters
// the second run added, so no test has to write down a generated population.
async function createdBy(segment, moves, options = {}) {
    await runSegment({ ...segment, moves: WAIT_KEY });
    const before = new Set(levelMonsters().map(({ m_id }) => m_id));
    const replay = await runSegment({ ...segment, moves }, options);
    return {
        added: levelMonsters().filter(({ m_id }) => !before.has(m_id)),
        replay,
    };
}

test('the genesis matrix contains only source-selected inputs', () => {
    const recipe = loadWizardGenesisRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 11);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        // Every segment opens with a wait, so the prompt paints over a screen
        // an ordinary turn produced rather than over the arrival screen.
        assert.equal(segment.moves.at(0), WAIT_KEY);
        // No segment closes with a wait: the turn after a created monster
        // arrives runs that monster's first move, which this goal does not
        // own. The file header says so; this keeps it true.
        assert.notEqual(segment.moves.at(-1), WAIT_KEY);
    }
    // Nine segments reach the command and two are refused, so exactly nine
    // set debug mode. cmd.c:1961's "wizgenesis" row carries WIZMODECMD, which
    // can_do_extcmd() and extcmds_match() both read.
    assert.equal(
        recipe.segments.filter(
            ({ nethackrc }) => nethackrc.includes('playmode:debug'),
        ).length,
        9,
    );
    assert.equal(
        extcmdlist.find(({ ef_txt }) => ef_txt === 'wizgenesis').flags
        & WIZMODECMD,
        WIZMODECMD,
    );
});

test('the ^G key reaches the command seam rather than the boundary', () => {
    // js/cmd.js admitParsedCommand() throws for a parsed command outside this
    // list, before rhack() dispatches anything, so the key would stop at the
    // repeated-command boundary without the row.
    assert.ok(ADMITTED_COMMANDS.includes('wizgenesis'));
});

test('the genesis command seam has no monster-creation refusal class', () => {
    // read.c create_particular() now owns all valid request parsing and its
    // retry loop. Unknown text is handled by the source's five attempts and
    // false return, so the command seam must not convert an obsolete refusal
    // class into a hard segment boundary.
    assert.equal(failClosedCommandRefusals().some(
        (type) => type.name === 'UnsupportedMonsterRequestError',
    ), false);
});

test('cant_revive substitutes the species read.c names for each special case',
    () => {
        const state = parseState();
        // read.c:3117-3122. The five species that only make sense where the
        // level generator put them become a human zombie; the shopkeeper does
        // so only when this is a creation rather than a revival.
        for (const mtype of [
            PM_GUARD, PM_HIGH_CLERIC, PM_ALIGNED_CLERIC, PM_ANGEL,
        ]) {
            assert.deepEqual(
                cant_revive(mtype, false, null, state),
                { changed: true, mtype: PM_HUMAN_ZOMBIE },
                `species ${mtype}`,
            );
            // The revival flag changes none of these four.
            assert.equal(cant_revive(mtype, true, null, state).changed, true);
        }
        assert.deepEqual(
            cant_revive(PM_SHOPKEEPER, false, null, state),
            { changed: true, mtype: PM_HUMAN_ZOMBIE },
        );
        // "SHOPKEEPERS can be revived now": the second operand of C's `||` is
        // what spares a revived one.
        assert.deepEqual(
            cant_revive(PM_SHOPKEEPER, true, null, state),
            { changed: false, mtype: PM_SHOPKEEPER },
        );
        // read.c:3123-3125, the arm whose comment names create_particular().
        assert.deepEqual(
            cant_revive(PM_LONG_WORM_TAIL, false, null, state),
            { changed: true, mtype: PM_LONG_WORM },
        );
        // read.c:3126-3131. Medusa carries G_UNIQ, which is the whole of
        // mondata.h unique_corpstat() (mondata.h:174).
        assert.deepEqual(
            cant_revive(PM_MEDUSA, false, null, state),
            { changed: true, mtype: PM_DOPPELGANGER },
        );
        // The role monster named "wizard" is the near miss: it carries G_NOGEN
        // rather than G_UNIQ, so the unique arm passes it through.
        assert.deepEqual(
            cant_revive(PM_WIZARD, false, null, state),
            { changed: false, mtype: PM_WIZARD },
        );
        // An ordinary species passes through unchanged, which is the answer
        // create_particular_creation() needs to reach makemon().
        assert.deepEqual(
            cant_revive(PM_GAS_SPORE, false, null, state),
            { changed: false, mtype: PM_GAS_SPORE },
        );
        // A non-unique corpse is unchanged whether or not it has saved traits.
        assert.deepEqual(
            cant_revive(PM_GAS_SPORE, true, { otyp: 1 }, state),
            { changed: false, mtype: PM_GAS_SPORE },
        );
        // Saved traits let a unique corpse revive as itself; without them the
        // same species is substituted with a doppelganger.
        assert.deepEqual(
            cant_revive(PM_MEDUSA, true, { oextra: {} }, state),
            { changed: true, mtype: PM_DOPPELGANGER },
        );
        assert.deepEqual(
            cant_revive(PM_MEDUSA, true,
                { oextra: { omonst: {} } }, state),
            { changed: false, mtype: PM_MEDUSA },
        );
    });

test('a plain monster name fills the request read.c makes for it', () => {
    const state = parseState();
    const d = create_particular_parse('gas spore', state);

    assert.equal(d.which, PM_GAS_SPORE);
    // read.c:3145-3152, the fields the untouched arms leave at their defaults.
    // gm.multi is 0, so one monster; MAXMCLASSES means "no class was named",
    // which is what keeps mkclass() out of the creation loop.
    assert.equal(d.quan, 1);
    assert.equal(d.monclass, MAXMCLASSES);
    assert.equal(d.genderconf, -1);
    assert.equal(d.randmonst, false);
    assert.deepEqual(
        [d.maketame, d.makepeaceful, d.makehostile], [false, false, false],
    );
    assert.deepEqual(
        [d.sleeping, d.saddled, d.invisible, d.hidden],
        [false, false, false, false],
    );
    // The gender out-parameter mondata.c name_to_mon() carries back. A gas
    // spore has only a neuter name, so d->fem takes NEUTRAL, which contributes
    // no gender bit to mmflags. This value does not depend on the seed: a
    // pmname matched, so mondata.c:1078-1082 writes NEUTRAL through the
    // pointer either way. The test below pins the seed itself.
    assert.equal(d.fem, NEUTRAL);
});

test('a title-only answer keeps the NEUTRAL gender read.c seeds', () => {
    // read.c:3141 starts gender_name_var at NEUTRAL, and mondata.c:1078 writes
    // through the pointer only when a pmname matched. "Digger" matches none:
    // mondata.c:1074's title_to_mon() fallback resolves it, and the FIXME at
    // 1073 says titles carry no gender, so the seeded NEUTRAL survives.
    //
    // This is the one answer class that distinguishes the seed js/read.js
    // passes from a call that let js/mondata.js default the parameter to -1,
    // and a wrong value here is not cosmetic: read.c:3287-3288 turns MALE or
    // FEMALE into a gender bit and makemon.c:1265-1268 then skips its rn2(2).
    assert.equal(
        create_particular_parse('Digger', parseState()).fem, NEUTRAL,
    );
});

test('a gendered monster name carries its gender into the request', () => {
    // mondata.c name_to_monplus():1080-1084 writes the matched name's gender
    // through the pointer read.c:3212 supplies, and read.c:3227 copies it into
    // d->fem because no explicit gender word was given. The two names below
    // are the same species; only the gender differs, and
    // create_particular_creation() turns it into MM_MALE or MM_FEMALE.
    const state = parseState();

    const lord = create_particular_parse('gnome lord', state);
    assert.equal(lord.which, PM_GNOME_LEADER);
    assert.equal(lord.fem, MALE);

    const lady = create_particular_parse('gnome lady', state);
    assert.equal(lady.which, PM_GNOME_LEADER);
    assert.equal(lady.fem, FEMALE);

    // Both names resolve to the one mons[] row, so they differ in gender
    // rather than in species.
    assert.equal(lord.which, lady.which);
});

test('the quantity read.c derives from gm.multi bounds the request', () => {
    // read.c:3145 is `d->quan = 1 + ((gm.multi > 0) ? (int) gm.multi : 0)`,
    // and 3165-3166 replaces a quantity above QUAN_LIMIT with what the map can
    // still hold, which needs monster_census(). A count that lands exactly on
    // the limit is still C's own answer and needs no census.
    assert.equal(
        create_particular_parse(
            'newt', parseState({ multi: QUAN_LIMIT - 1 }),
        ).quan,
        QUAN_LIMIT,
    );
    // An out-of-range initial quantity is replaced by the number of free map
    // cells. A fresh test level has no live monsters, so the full limit remains.
    assert.equal(
        create_particular_parse('newt', parseState({ multi: QUAN_LIMIT })).quan,
        QUAN_LIMIT,
    );
    // The smallest count that moves the quantity at all, which is what fixes
    // C's `1 +` as an offset rather than a floor.
    assert.equal(
        create_particular_parse('newt', parseState({ multi: 1 })).quan, 2,
    );
    // A negative gm.multi is the paralysed hero's counter, which C's `> 0`
    // test steps over rather than subtracting from the quantity.
    assert.equal(
        create_particular_parse('newt', parseState({ multi: -3 })).quan, 1,
    );
    // C advances over every source digit before mungspaces(); leading zeroes
    // must not become part of the monster name.
    assert.equal(create_particular_parse('002 newt', parseState()).quan, 2);
    assert.equal(
        create_particular_parse('002 newt', parseState()).which, PM_NEWT,
    );
});

test('read.c accepts qualifiers, disposition prefixes, classes, and random', () => {
    const cases = [
        ['saddled pony', { saddled: true, which: PM_PONY }],
        ['sleeping newt', { sleeping: true, which: PM_NEWT }],
        ['invisible newt', { invisible: true, which: PM_NEWT }],
        ['hidden trapper', { hidden: true, which: PM_TRAPPER }],
        ['a SLEEPING newt', { sleeping: true, which: PM_NEWT }],
        ['tame jackal', { maketame: true }],
        ['peaceful newt', { makepeaceful: true }],
        ['hostile newt', { makehostile: true }],
    ];
    for (const [answer, expected] of cases) {
        const parsed = create_particular_parse(answer, parseState());
        for (const [field, value] of Object.entries(expected))
            assert.equal(parsed[field], value, `${answer}: ${field}`);
    }
    // A disposition word elsewhere is part of the name, so this resolves the
    // ordinary newt rather than being treated as a prefix.
    assert.equal(
        create_particular_parse('newt tame', parseState()).which, PM_NEWT,
    );

    const female = create_particular_parse('female gnome lord', parseState());
    assert.equal(female.fem, FEMALE);
    assert.equal(female.genderconf, MALE);
    const male = create_particular_parse('male gnome lady', parseState());
    assert.equal(male.fem, MALE);
    assert.equal(male.genderconf, FEMALE);

    const random = create_particular_parse('*', parseState());
    assert.equal(random.randmonst, true);
    assert.equal(create_particular_parse('random', parseState()).randmonst, true);
    assert.equal(create_particular_parse('*', parseState({ wizard: false })), false);
    assert.equal(create_particular_parse('zzzz', parseState()), false);

    // read.c's class fallback resets which to the role monster; dragon is a
    // class description, while its ordinary title is not a concrete species.
    const dragon = create_particular_parse('dragon', parseState());
    assert.equal(dragon.monclass > 0, true);
    assert.equal(dragon.which, roles[0].mnum);
});

test('monster_census filters dead, parked, and unseen monsters', () => {
    const state = parseState();
    state.u = { ux: 1, uy: 1, uprops: {} };
    state.viz_array = Array.from(
        { length: 21 }, () => Array(80).fill(0),
    );
    state.viz_array[state.u.uy][state.u.ux] = IN_SIGHT;
    const spotted = {
        mhp: 3, mx: state.u.ux, my: state.u.uy, minvis: false,
        mundetected: false, nmon: null,
    };
    const unseen = {
        mhp: 3, mx: state.u.ux + 1, my: state.u.uy, nmon: null,
    };
    const dead = { mhp: 0, mx: state.u.ux, my: state.u.uy, nmon: null };
    const parked = {
        mhp: 3, mx: 0, my: 0, isgd: true, nmon: null,
    };
    spotted.nmon = unseen;
    unseen.nmon = dead;
    dead.nmon = parked;
    state.level = { monlist: spotted };
    assert.equal(monster_census(false, { state }), 2);
    assert.equal(
        monster_census(true, {
            state,
            canSpotMonster: (monster) => monster === spotted,
        }),
        1,
    );
    // With no injected predicate, C's default canspotmon owner is used. The
    // hero-square monster is visible on a fresh initialized level.
    assert.equal(monster_census(true, { state }), 1);
});

test('^G creates the named monster beside the hero without spending a turn',
    async () => {
        const segment = segmentFor(`${GENESIS_KEY}gas spore\n`);
        const { added } = await createdBy(segment, segment.moves);

        // makemon.c:1490-1497 with MM_NOEXCLAM: no " suddenly" and a full stop
        // rather than an exclamation mark, and next2u() true because
        // enexto_core() placed the monster on a square adjacent to the hero's.
        assert.equal(topLine(), 'A gas spore appears next to you.');
        assert.equal(added.length, 1);
        assert.equal(added[0].mnum, PM_GAS_SPORE);
        assert.equal(game.level.monsters[added[0].mx][added[0].my], added[0]);
        const dx = Math.abs(added[0].mx - game.u.ux);
        const dy = Math.abs(added[0].my - game.u.uy);
        assert.ok(dx <= 1 && dy <= 1 && (dx || dy));
        // wizcmds.c:213 returns ECMD_OK on both arms, so rhack() resets the
        // command variables and no turn elapses however many monsters arrived.
        assert.equal(game.context.move, 0);
        // wizcmds.c:206-210 clears iflags.debug_mongen across the call and
        // puts it back. It started false, so this pins the untouched-default
        // case alone: a missing restore is invisible here and only the created
        // monster rules out a missing clear, because makemon.c:1168 returns
        // before creating anything while the flag is set. The test below sets
        // the flag first, which is what pins the restore.
        assert.equal(game.iflags.debug_mongen, false);
    });

test('^G admits a minotaur through the generic makemon path', async () => {
    // C read.c:create_particular_creation() passes a named species directly to
    // makemon(); it does not carry a fill_empty_maze-only admission marker.
    // Keep this production caller case independent from the fixed wizard
    // genesis matrix and pin the explicit PM_MINOTAUR lifecycle here.
    const segment = {
        seed: 9631047,
        datetime: '20340825172133',
        nethackrc: 'OPTIONS=name:MinotaurProbe,role:Ranger,race:human,gender:male,align:neutral\n'
            + 'OPTIONS=!legacy,!tutorial,!splash_screen,playmode:debug\n'
            + 'OPTIONS=pettype:none,!acoustics,rest_on_space,!safe_wait\n',
        moves: `${WAIT_KEY}${GENESIS_KEY}minotaur\n`,
    };
    const boundaries = [];
    const { added } = await createdBy(segment, segment.moves, {
        onBoundary: (error) => boundaries.push(error),
    });
    assert.deepEqual(boundaries, []);
    const minotaurs = added.filter(({ mnum }) => mnum === PM_MINOTAUR);
    assert.equal(minotaurs.length, 1);
    assert.equal(minotaurs[0].data.pmidx, PM_MINOTAUR);
    assert.equal(topLine(), 'A minotaur appears next to you.');
});

test('^G applies hidden, invisible, sleeping, and disposition requests',
    async () => {
        const base = {
            seed: 9631048,
            datetime: '20340825172133',
            nethackrc: 'OPTIONS=name:QualifierProbe,role:Ranger,race:human,gender:male,align:neutral\n'
                + 'OPTIONS=!legacy,!tutorial,!splash_screen,playmode:debug\n'
                + 'OPTIONS=pettype:none,!acoustics,rest_on_space,!safe_wait\n',
        };
        const cases = [
            ['hidden trapper', (monster) => {
                assert.equal(monster.mnum, PM_TRAPPER);
                assert.equal(monster.mundetected, 1);
            }],
            ['invisible newt', (monster) => {
                assert.equal(monster.mnum, PM_NEWT);
                assert.equal(monster.perminvis, 1);
                assert.equal(monster.minvis, 1);
            }],
            ['sleeping newt', (monster) => {
                assert.equal(monster.mnum, PM_NEWT);
                assert.equal(monster.msleeping, 1);
            }],
            ['peaceful newt', (monster) => {
                assert.equal(monster.mnum, PM_NEWT);
                assert.equal(monster.mpeaceful, true);
            }],
        ];
        for (const [request, check] of cases) {
            const segment = {
                ...base,
                moves: `${WAIT_KEY}${GENESIS_KEY}${request}\n`,
            };
            const boundaries = [];
            const { added } = await createdBy(segment, segment.moves, {
                onBoundary: (error) => boundaries.push(error),
            });
            assert.deepEqual(boundaries, []);
            assert.equal(added.length, 1, request);
            check(added[0]);
        }
    });

test('^G puts iflags.debug_mongen back after clearing it', async () => {
    // wizcmds.c:206-210 saves the flag, clears it, creates, and restores. A
    // player reaches the set state from the options menu -- js/optlist_data.js
    // gives debug_mongen setwhere set_wiznofuz, which options.c:5211 rejects
    // only while go.opt_initial is true, so a configuration file cannot set it
    // but a wizard-mode menu can.
    //
    // A segment replay offers no point between its keys at which to set the
    // flag, so this drives wiz_genesis() directly on the state the opening
    // wait leaves behind. The leading space stands in for the byte rhack()
    // reads in the real sequence: the wait ends on a --More--, and getlin()
    // dismisses it through xwaitforspace(), which consumes keys until a space
    // or a Return.
    const segment = segmentFor(`${GENESIS_KEY}gas spore\n`);
    await runSegment({ ...segment, moves: WAIT_KEY });
    const before = new Set(levelMonsters().map(({ m_id }) => m_id));
    for (const ch of ' gas spore\n') game.nhDisplay.pushKey(ch.charCodeAt(0));

    game.iflags.debug_mongen = true;
    await wiz_genesis(game);

    // wizcmds.c:210 puts the saved value back, rather than leaving the clear.
    assert.equal(game.iflags.debug_mongen, true);
    // wizcmds.c:208 cleared it first, which is the only reason makemon()
    // created anything: makemon.c:1168 returns while the flag is up.
    const added = levelMonsters().filter(({ m_id }) => !before.has(m_id));
    assert.equal(added.length, 1);
    assert.equal(added[0].mnum, PM_GAS_SPORE);
});

test('a gendered name skips makemon()\'s gender roll', async () => {
    // makemon.c:1261-1279. With MM_MALE or MM_FEMALE and a species that is
    // neither is_male() nor is_female(), C assigns the gender directly; without
    // the flag it spends rn2(2) on it. The three runs below differ only in the
    // name typed, so a dropped gender bit is what the extra draw would show --
    // and every draw after it would shift with it.
    const lord = segmentFor(`${GENESIS_KEY}gnome lord\n`);
    const male = await createdBy(lord, lord.moves);
    assert.equal(topLine(), 'A gnome lord appears next to you.');
    assert.equal(male.added.length, 1);
    assert.equal(male.added[0].mnum, PM_GNOME_LEADER);
    assert.equal(male.added[0].female, false);
    const maleDraws = male.replay.getRngLog().length;

    const lady = segmentFor(`${GENESIS_KEY}gnome lady\n`);
    const female = await createdBy(lady, lady.moves);
    assert.equal(topLine(), 'A gnome lady appears next to you.');
    assert.equal(female.added[0].female, true);

    // The same mons[] row under the neuter name it also carries. Nothing else
    // about the request changes, so the roll a neuter name leaves to makemon()
    // is the whole difference: one draw the male name's log lacks. Which of
    // the two names the roll then prints is what that draw decides, so the
    // message is asserted as either.
    const neuter = await createdBy(lord, lord.moves.replace(
        'gnome lord', 'gnome leader',
    ));
    assert.match(topLine(), /^A gnome (lord|lady) appears next to you\.$/u);
    assert.equal(neuter.added[0].mnum, PM_GNOME_LEADER);
    assert.equal(neuter.replay.getRngLog().length, maleDraws + 1);
});

test('Escape at the genesis prompt creates nothing', async () => {
    // read.c:3382-3385. getlin() answers "\033" for an Escape over an empty
    // line, and create_particular() returns FALSE before the parse runs, so
    // nothing is created and nothing is said.
    const segment = segmentFor(`${GENESIS_KEY}${ESCAPE_KEY}`);
    // Collect the boundary too. js/jsmain.js swallows a fail-closed command
    // boundary and returns the segment, so an aborted run creates nothing,
    // says nothing and spends no turn -- which is what the three assertions
    // below would report as success. Only an empty boundary list separates
    // C's early return from a refusal.
    const boundaries = [];
    const { added } = await createdBy(segment, segment.moves, {
        onBoundary: (error) => boundaries.push(error),
    });

    assert.deepEqual(boundaries, []);
    assert.equal(topLine(), '');
    assert.deepEqual(added, []);
    assert.equal(game.context.move, 0);
});

test('declining cant_revive keeps the replacement species', async () => {
    // read.c:3259-3269 mutates d.which through cant_revive() before asking
    // whether wizard mode should force the original species. Declining must
    // therefore create the replacement human zombie rather than discard the
    // request or accidentally restore the shopkeeper.
    const boundaries = [];
    const segment = segmentFor(`${GENESIS_KEY}gas spore\n`);
    const { added } = await createdBy(
        segment,
        `${WAIT_KEY}${GENESIS_KEY}shopkeeper\nn`,
        { onBoundary: (error) => boundaries.push(error) },
    );

    assert.deepEqual(boundaries, []);
    assert.equal(added.length, 1);
    assert.equal(added[0].mnum, PM_HUMAN_ZOMBIE);
});

test('a species outside the admitted reservoir stops before it is created',
    async () => {
        // js/makemon_create.js assertSupportedSpecies() bounds which species
        // this port will build, and ^G is the one command that lets the player
        // name any of them. A jabberwock is difficulty 17, past the band
        // isOrdinaryD5ReservoirSpecies() admits, so the request stops with
        // nothing created rather than building a monster whose inventory and
        // strategy setup is unverified.
        const boundaries = [];
        const segment = segmentFor(`${GENESIS_KEY}gas spore\n`);
        const { added } = await createdBy(
            segment,
            `${WAIT_KEY}${GENESIS_KEY}jabberwock\n`,
            { onBoundary: (error) => boundaries.push(error) },
        );

        assert.equal(boundaries.length, 1);
        assert.match(boundaries[0].message, /unsupported initial-level/u);
        assert.deepEqual(added, []);
    });

test('^G creates the giant eel the eel-concealment goal acts on', async () => {
    // The mirror of the case above. mklev() hides every eel it places, so
    // mon.c movemon_singlemon()'s S_EEL arm -- which requires !mundetected --
    // has no reachable subject until ^G builds one outside mklev.
    // assertSupportedSpecies() therefore admits PM_GIANT_EEL by name.
    const boundaries = [];
    const segment = segmentFor(`${GENESIS_KEY}gas spore\n`);
    const { added } = await createdBy(
        segment,
        `${WAIT_KEY}${GENESIS_KEY}giant eel\n`,
        { onBoundary: (error) => boundaries.push(error) },
    );

    assert.deepEqual(boundaries, []);
    assert.equal(added.length, 1);
    assert.equal(added[0].mnum, PM_GIANT_EEL);
    // makemon.c:1392 hides an eel only `if (gi.in_mklev)`, and ^G runs with
    // that clear, so this eel arrives visible to the monster scan.
    assert.ok(!added[0].mundetected);
});

test('#wizgenesis reaches the same prompt as ^G', async () => {
    const typed = segmentFor(`${EXTCMD_KEY}wizgenesis\ngas spore\n`);
    await runSegment({ ...typed, moves: `${WAIT_KEY}${EXTCMD_KEY}wizgenesis\n` });
    assert.equal(topLine(), 'Create what kind of monster?');
});

test('an ordinary hero pressing ^G is told the command is unavailable',
    async () => {
        // cmd.c:479-481. rhack() runs can_do_extcmd() before dispatch, so an
        // ordinary game answers the key rather than the creation prompt.
        // wizcmds.c:212 would print the same string from wiz_genesis()'s else
        // arm, which is why no recorded screen can tell the two owners apart.
        const segment = segmentFor(`${GENESIS_KEY}`);
        assert.equal(segment.nethackrc.includes('playmode:debug'), false);

        const { added } = await createdBy(segment, segment.moves);
        assert.equal(topLine(), "Unavailable command 'wizgenesis'.");
        assert.equal(game.context.move, 0);
        assert.deepEqual(added, []);
    });

// read.c:3285-3288 skips the gender bit for a species that is_male() or
// is_female(), because mons[] has already fixed its gender. That skip changes
// no mmflags this port can build, and this is why: nothing that answers a
// non-neuter gender through name_to_monplus() is a fixed-gender species, so
// d->fem is NEUTRAL whenever the skip applies and the ternary it guards
// contributes nothing either way. Both halves of that claim are checked below,
// so upstream giving a fixed-gender species a gendered name -- in mons[] or in
// the alternate-spelling table -- fails here rather than diverging silently.
test('nothing that answers a gender is a fixed-gender species', () => {
    const state = parseState();
    const gendered = [];
    for (const species of MONSTER_TEMPLATES) {
        if (!is_male(species) && !is_female(species)) continue;
        if (species.pmnames[MALE] || species.pmnames[FEMALE])
            gendered.push(species.pmnames[NEUTRAL]);
    }
    assert.deepEqual(gendered, []);

    // mondata.c name_to_monplus()'s alt_spl[] table is the other route to a
    // gender, and these ten rows are its whole non-NEUTRAL half.
    for (const spelling of [
        'aligned priest', 'aligned priestess', 'high priest', 'high priestess',
        'elf lady', 'elf lord', 'incubi', 'succubi', 'cavemen', 'cavewomen',
    ]) {
        const { which, fem } = create_particular_parse(spelling, parseState());
        assert.notEqual(fem, NEUTRAL, spelling);
        assert.equal(is_male(state.mons[which]), false, spelling);
        assert.equal(is_female(state.mons[which]), false, spelling);
    }
});

test('the mons[] rows the source rows name are the ones read.c names', () => {
    // The identifiers above are only as good as the catalog behind them, and
    // three of these carry no test elsewhere. NON_PM is what ismnum() rejects.
    const state = parseState();
    assert.equal(state.mons[PM_GAS_SPORE].pmnames[NEUTRAL], 'gas spore');
    assert.equal(state.mons[PM_NEWT].pmnames[NEUTRAL], 'newt');
    assert.equal(state.mons[PM_GNOME_LEADER].pmnames[MALE], 'gnome lord');
    assert.equal(state.mons[PM_GNOME_LEADER].pmnames[FEMALE], 'gnome lady');
    assert.equal(NON_PM, -1);
});
