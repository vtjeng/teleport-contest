// The ^G monster-creation prompt: wizcmds.c wiz_genesis() and the four read.c
// functions behind it.
//
// scripts/run-wizard-genesis.mjs holds the strict differential evidence: ten
// segments recorded against the C reference, covering both dispatch routes,
// both refusals an ordinary hero meets, and four shapes of typed answer. The
// assertions here pin what those recordings cannot show -- the request fields
// no screen carries, the refusal class the command seam has to convert, and
// the parse and creation arms this port leaves unported.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ADMITTED_COMMANDS,
    UnsupportedHeroCommandBoundaryError,
    failClosedCommandRefusals,
} from '../js/cmd.js';
import { FEMALE, MALE, NEUTRAL } from '../js/const.js';
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
    PM_GNOME_LEADER,
    PM_GUARD,
    PM_HIGH_CLERIC,
    PM_HUMAN_ZOMBIE,
    PM_LONG_WORM,
    PM_LONG_WORM_TAIL,
    PM_MEDUSA,
    PM_NEWT,
    PM_SHOPKEEPER,
    PM_WIZARD,
    monst_globals_init,
} from '../js/monsters.js';
import { is_female, is_male } from '../js/mondata.js';
import {
    UnsupportedMonsterRequestError,
    cant_revive,
    create_particular_parse,
} from '../js/read.js';
import { roles } from '../js/roles.js';
import {
    ESCAPE_KEY,
    EXTCMD_KEY,
    GENESIS_KEY,
    WAIT_KEY,
    loadWizardGenesisRecipe,
} from './run-wizard-genesis.mjs';

// read.c:3159-3160's QUAN_LIMIT, ROWNO * (COLNO - 1) with the shipped map
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
    assert.equal(recipe.segments.length, 10);
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
    // Eight segments reach the command and two are refused, so exactly eight
    // set debug mode. cmd.c:1961's "wizgenesis" row carries WIZMODECMD, which
    // can_do_extcmd() and extcmds_match() both read.
    assert.equal(
        recipe.segments.filter(
            ({ nethackrc }) => nethackrc.includes('playmode:debug'),
        ).length,
        8,
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

test('the genesis refusal converts at the command seam', () => {
    // js/cmd.js runGenesisCommand() wraps wiz_genesis() in
    // failClosedCommand(), and js/jsmain.js breaks a segment only for the
    // three boundary classes, so a class read.c can raise that the wrapper
    // does not list escapes as a hard failure and discards the segment's
    // matching prefix instead of stopping on it. Every refused answer reaches
    // this one after getlin() has echoed the whole typed name.
    assert.ok(
        failClosedCommandRefusals().includes(UnsupportedMonsterRequestError),
    );
});

test('cant_revive substitutes the species read.c names for each special case',
    () => {
        const state = parseState();
        // read.c:3113-3121. The five species that only make sense where the
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
        // read.c:3122-3123, the arm whose comment names create_particular().
        assert.deepEqual(
            cant_revive(PM_LONG_WORM_TAIL, false, null, state),
            { changed: true, mtype: PM_LONG_WORM },
        );
        // read.c:3124-3129. Medusa carries G_UNIQ, which is the whole of
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
        // The corpse or statue a revival came from would need
        // mkobj.c has_omonst(), which is unported.
        assert.throws(
            () => cant_revive(PM_GAS_SPORE, true, { otyp: 1 }, state),
            UnsupportedMonsterRequestError,
        );
    });

test('a plain monster name fills the request read.c makes for it', () => {
    const state = parseState();
    const d = create_particular_parse('gas spore', state);

    assert.equal(d.which, PM_GAS_SPORE);
    // read.c:3150-3157, the fields the untouched arms leave at their defaults.
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
    // spore has only a neuter name, so gender_name_var keeps the NEUTRAL it
    // started at and d->fem takes it -- which contributes no gender bit to
    // mmflags. js/mondata.js name_to_monplus() defaults the same parameter to
    // -1, so a call that let it default would answer -1 here instead.
    assert.equal(d.fem, NEUTRAL);
});

test('a gendered monster name carries its gender into the request', () => {
    // mondata.c name_to_monplus():1080-1084 writes the matched name's gender
    // through the pointer read.c:3211 supplies, and read.c:3229 copies it into
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
    // read.c:3151 is `d->quan = 1 + ((gm.multi > 0) ? (int) gm.multi : 0)`,
    // and 3161-3162 replaces a quantity above QUAN_LIMIT with what the map can
    // still hold, which needs monster_census(). A count that lands exactly on
    // the limit is still C's own answer and needs no census.
    assert.equal(
        create_particular_parse(
            'newt', parseState({ multi: QUAN_LIMIT - 1 }),
        ).quan,
        QUAN_LIMIT,
    );
    assert.throws(
        () => create_particular_parse('newt', parseState({ multi: QUAN_LIMIT })),
        (error) => error instanceof UnsupportedMonsterRequestError
            && error.operation === 'monster_census()',
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
});

test('every qualifier read.c accepts ahead of the name is refused', () => {
    for (const [answer, operation] of [
        // read.c:3145-3149, the leading count.
        ['2 gas spore', 'create_particular_parse() count prefix'],
        // read.c:3167-3193, the six words searched for anywhere in the answer.
        ['saddled pony', 'create_particular_parse() "saddled "'],
        ['sleeping newt', 'create_particular_parse() "sleeping "'],
        ['invisible newt', 'create_particular_parse() "invisible "'],
        ['hidden newt', 'create_particular_parse() "hidden "'],
        ['female gnome lord', 'create_particular_parse() "female "'],
        ['male gnome lady', 'create_particular_parse() "male "'],
        // The search is case-blind and looks anywhere, not just at the front.
        ['a SLEEPING newt', 'create_particular_parse() "sleeping "'],
        // read.c:3197-3206, the three disposition prefixes.
        ['tame jackal', 'create_particular_parse() "tame "'],
        ['peaceful newt', 'create_particular_parse() "peaceful "'],
        ['hostile newt', 'create_particular_parse() "hostile "'],
        // read.c:3208-3211, the wizard-only random arm.
        ['*', 'create_particular_parse() random monster'],
        ['random', 'create_particular_parse() random monster'],
        // read.c:3232-3245, name_to_monclass() and its four arms.
        ['zzzz', 'mondata.c name_to_monclass()'],
        ['dragon', 'mondata.c name_to_monclass()'],
    ]) {
        assert.throws(
            () => create_particular_parse(answer, parseState()),
            (error) => error instanceof UnsupportedMonsterRequestError
                && error.operation === operation,
            `${answer} is refused as ${operation}`,
        );
    }
    // A disposition word that is not a prefix is not one: C tests the three
    // with strncmpi() rather than the strstri() it uses for the six above, so
    // this answer reaches the name lookup and resolves.
    assert.equal(
        create_particular_parse('newt tame', parseState()).which, PM_NEWT,
    );
    // read.c:3208's `wizard &&`: an ordinary hero's "*" is an unknown name
    // rather than a request for a random monster. No ported path reaches
    // create_particular() outside wizard mode, so only this shows the term.
    assert.throws(
        () => create_particular_parse('*', parseState({ wizard: false })),
        (error) => error.operation === 'mondata.c name_to_monclass()',
    );
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
        // wizcmds.c:214 returns ECMD_OK on both arms, so rhack() resets the
        // command variables and no turn elapses however many monsters arrived.
        assert.equal(game.context.move, 0);
        // wizcmds.c:206-209 clears iflags.debug_mongen across the call and
        // puts it back. It started false, so a missing restore is invisible
        // here and a missing clear is what the created monster rules out:
        // makemon.c:1168 returns before creating anything while it is set.
        assert.equal(game.iflags.debug_mongen, false);
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
    // read.c:3379-3380. getlin() answers "\033" for an Escape over an empty
    // line, and create_particular() returns FALSE before the parse runs, so
    // nothing is created and nothing is said.
    const segment = segmentFor(`${GENESIS_KEY}${ESCAPE_KEY}`);
    const { added } = await createdBy(segment, segment.moves);

    assert.equal(topLine(), '');
    assert.deepEqual(added, []);
    assert.equal(game.context.move, 0);
});

test('an unported request stops the segment rather than escaping',
    async () => {
        // read.c:3256-3272. A shopkeeper is one of the species cant_revive()
        // substitutes, and wizard mode then offers to force the original
        // through y_n(); the port refuses at that prompt. End to end, because
        // what matters is that the refusal converts at the command seam after
        // getlin() has echoed the name rather than escaping runSegment().
        const boundaries = [];
        const segment = segmentFor(`${GENESIS_KEY}gas spore\n`);
        const { added } = await createdBy(
            segment,
            `${WAIT_KEY}${GENESIS_KEY}shopkeeper\n`,
            { onBoundary: (error) => boundaries.push(error) },
        );

        assert.equal(boundaries.length, 1);
        assert.ok(boundaries[0] instanceof UnsupportedHeroCommandBoundaryError);
        assert.match(boundaries[0].message, /force-the-species prompt/u);
        assert.deepEqual(added, []);
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

test('#wizgenesis reaches the same prompt as ^G', async () => {
    const typed = segmentFor(`${EXTCMD_KEY}wizgenesis\ngas spore\n`);
    await runSegment({ ...typed, moves: `${WAIT_KEY}${EXTCMD_KEY}wizgenesis\n` });
    assert.equal(topLine(), 'Create what kind of monster?');
});

test('an ordinary hero pressing ^G is told the command is unavailable',
    async () => {
        // cmd.c:479-481. rhack() runs can_do_extcmd() before dispatch, so an
        // ordinary game answers the key rather than the creation prompt.
        // wizcmds.c:214 would print the same string from wiz_genesis()'s else
        // arm, which is why no recorded screen can tell the two owners apart.
        const segment = segmentFor(`${GENESIS_KEY}`);
        assert.equal(segment.nethackrc.includes('playmode:debug'), false);

        const { added } = await createdBy(segment, segment.moves);
        assert.equal(topLine(), "Unavailable command 'wizgenesis'.");
        assert.equal(game.context.move, 0);
        assert.deepEqual(added, []);
    });

// read.c:3286-3287 skips the gender bit for a species that is_male() or
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

test('the mons[] rows the refusal tests name are the ones read.c names', () => {
    // The identifiers above are only as good as the catalog behind them, and
    // three of these carry no test elsewhere. NON_PM is what ismnum() rejects.
    const state = parseState();
    assert.equal(state.mons[PM_GAS_SPORE].pmnames[NEUTRAL], 'gas spore');
    assert.equal(state.mons[PM_NEWT].pmnames[NEUTRAL], 'newt');
    assert.equal(state.mons[PM_GNOME_LEADER].pmnames[MALE], 'gnome lord');
    assert.equal(state.mons[PM_GNOME_LEADER].pmnames[FEMALE], 'gnome lady');
    assert.equal(NON_PM, -1);
});
