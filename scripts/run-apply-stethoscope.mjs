#!/usr/bin/env node

// Run the checked-in matrix for `a`, the apply command, through fresh C
// recordings. Every segment contains replay inputs only; runFreshMatrix()
// records new reference output in an isolated temporary workspace.
//
// The command is apply.c doapply() as far as its STETHOSCOPE arm, which
// reaches apply.c apply_ok() through invent.c getobj(), apply.c
// use_stethoscope() through the switch, insight.c ustatusline() through the
// self direction, insight.c mstatusline() through a direction holding a
// monster, apply.c's secret-terrain switch, and apply.c its_dead() through an
// empty square, an ordinary corpse pile, an ordinary statue, or a blind
// statue, or a blind corpse. The matrix splits into nine parts.
// The first drives use_stethoscope(): the free first
// listen, the second listen in the same move that costs a turn, both cancels,
// both self keys, the Deaf guard, a sweep of all eight compass directions, a
// listen at a square carrying an ordinary object, and a listen at the hero's
// own pet. The second drives apply_ok(): one role per answer it can give,
// chosen so that a term returning the wrong answer changes the advertised
// letter set. The third drives the monster arm at apply.c:391-446, which needs
// a monster standing next to the hero and is therefore recorded on levels the
// hero materializes onto in a debug game.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20310203040506';

// cmd.c cmdlist[] binds 'a' to doapply(); extcmdlist[] names the same handler
// 'apply', which the '#' prompt reaches. cmd.c's NHKF_GETDIR_SELF and
// NHKF_GETDIR_SELF2 are '.' and 's', and both zero u.dx, u.dy and u.dz, which
// is what sends use_stethoscope() to ustatusline(). decl.c quitchars[] is
// " \r\n\033", of which Escape and space are the two a recording can send.
export const APPLY_KEY = 'a';
export const APPLY_BY_NAME = '#apply\n';
export const STETHOSCOPE_SLOT = 'c';
// u_init.c:76-89's last Healer row, the apples, which is the non-corpse object
// the dropped-object segment leaves on the floor.
export const APPLES_SLOT = 'j';
export const SELF = '.';
export const SELF2 = 's';
export const ESCAPE_KEY = '\x1b';
export const SPACE_KEY = ' ';
export const WAIT = '.';

// One listen: the command key, the Healer's stethoscope slot, and the self
// direction. Spelling it once keeps the repeated-listen segments readable,
// because the free-action rule counts listens rather than keys.
const LISTEN = `${APPLY_KEY}${STETHOSCOPE_SLOT}${SELF}`;

// The eight compass keys of cmd.c:3346's sdir[], "hykulnjb><", without the two
// vertical ones, each preceded by a fresh apply command. That is what the
// eight-direction sweep sends.
const EIGHT_WAY_SWEEP = [...'hykulnjb']
    .map((key) => `${APPLY_KEY}${STETHOSCOPE_SLOT}${key}`).join('');
const WEST = 'h';

function nethackrc({ name, role, race = 'human', gender = 'female',
    align = 'neutral', options }) {
    return [
        `OPTIONS=name:${name},role:${role},race:${race},gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=${options}`,
        '',
    ].join('\n');
}

// `time` puts the turn counter on the status line, which is the field a
// wrongly free or wrongly charged listen moves; `showexp` is a second field
// that must not move with it.
const PLAIN = 'pettype:none,!acoustics,!autopickup,time,showexp';
// The same case with a pet on the level, so a turn that should not elapse
// cannot move the dog either.
const PET = 'pettype:dog,!acoustics,!autopickup,time,showexp';
// permanent deafness, which youprop.h:125 folds into Deaf alongside the
// intrinsic and the extrinsic, so use_stethoscope()'s second guard fires.
const DEAF = 'pettype:none,!acoustics,!autopickup,time,showexp,deaf';
const DECORATED =
    'pettype:none,!acoustics,!autopickup,time,showscore,symset:DECgraphics,'
    + 'msg_window:reversed';

// Seed 4711002's D:1 leaves the hero's surroundings quiet for the eleven keys
// the longest segment sends; seed 4711001, its neighbour, reaches an unported
// monster-hiding branch on the turn after the listen and would end every
// segment there for a reason this matrix does not measure.
const QUIET_SEED = 4711002;

// The pet listen. Seed 7031 leaves the little dog directly south of the hero
// after her opening wait, which is the direction the segment points at.
const PET_SEED = 7031;
const PET_DATETIME = '20260615101500';
const PET_DIRECTION = 'j';

// Two seeds for the adjacent-square segments below, chosen by looking at the
// map each one draws rather than at any recorded session. On 8823147 the hero
// starts on the up staircase against a room's north wall, so a sweep of all
// eight directions covers five floor squares and three wall ones; on 3419682
// she has open floor to the east to step onto. Each carries a datetime of its
// own, because calendar.c's new-moon warning would otherwise queue a --More--
// ahead of the first key and eat it.
const SWEEP_SEED = 8823147;
const SWEEP_DATETIME = '20260324134500';
const DROPPED_SEED = 3419682;
const DROPPED_DATETIME = '20260707194500';

// Every segment opens and closes with a wait, so a command that wrongly spent
// or wrongly saved a turn shows up in the screen after it.
function segment(moves, character = {}, options = PLAIN, seed = QUIET_SEED,
    datetime = DATETIME) {
    return {
        seed,
        datetime,
        nethackrc: nethackrc({
            name: 'Stetho',
            role: 'Healer',
            options,
            ...character,
        }),
        moves: `${WAIT}${moves}${WAIT}`,
    };
}

// u_init.c:76-89 gives every Healer the same pack: a=scalpel, b=leather
// gloves, c=stethoscope, d,e=potions, f=wand, g,h,i=spellbooks, j=apples. The
// letters are fixed, so `c` names the stethoscope on every seed.
export function loadApplyStethoscopeRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The recorded case: one listen, which costs no turn because it is
            // the first of the move, and ustatusline()'s one-line report.
            segment(LISTEN),
            // Three listens with no move between them. The first is free, the
            // second finds gh.hero_seq unchanged and spends the turn, and the
            // third is free again because spending it advanced gh.hero_seq.
            segment(`${LISTEN}${LISTEN}${LISTEN}`),
            // 's', the second self key. cmd.c getdir() tests it beside '.'
            // before movecmd() ever runs.
            segment(`${APPLY_KEY}${STETHOSCOPE_SLOT}${SELF2}`),
            // getobj()'s two cancels, which never reach doapply()'s switch.
            segment(`${APPLY_KEY}${ESCAPE_KEY}`),
            segment(`${APPLY_KEY}${SPACE_KEY}`),
            // getdir()'s two cancels, which reach ECMD_CANCEL after the
            // stethoscope has already been chosen.
            segment(`${APPLY_KEY}${STETHOSCOPE_SLOT}${ESCAPE_KEY}`),
            segment(`${APPLY_KEY}${STETHOSCOPE_SLOT}${SPACE_KEY}`),
            // The same command reached by name at the '#' prompt.
            segment(`${APPLY_BY_NAME}${STETHOSCOPE_SLOT}${SELF}`),
            // Deaf: use_stethoscope()'s second guard answers before getdir(),
            // so the two keys that would have been the direction and the
            // closing wait are both read as commands instead.
            segment(`${APPLY_KEY}${STETHOSCOPE_SLOT}`, {}, DEAF),
            // A pet whose position a wrongly spent turn would move, and a
            // second listen to spend one on purpose.
            segment(`${LISTEN}${LISTEN}`, {}, PET),
            // All eight directions from one standing hero. Every square is
            // floor or wall with nothing on it, so each listen reaches
            // apply.c:468 through its_dead()'s fall-through, and the eight in
            // a row alternate free and costly four times over.
            segment(EIGHT_WAY_SWEEP, { name: 'Auscult' }, PLAIN, SWEEP_SEED,
                SWEEP_DATETIME),
            // A square with an ordinary object on it, which still answers
            // "You hear nothing special.": apply.c:203-204 asks sobj_at() for
            // a corpse and a statue, not for whatever is lying there. The
            // Healer drops her apples, steps east off them, and listens back.
            segment(`d${APPLES_SLOT}l${APPLY_KEY}${STETHOSCOPE_SLOT}${WEST}`,
                { name: 'Percuss', gender: 'male' }, PLAIN, DROPPED_SEED,
                DROPPED_DATETIME),
            // The monster arm at its most ordinary: the hero listens at her own
            // pet, which is next to her from the first turn of every game with
            // one. insight.c:3280 adds ", tame" and x_monnam()'s ARTICLE_YOUR
            // survives for a tame monster, so the report is about "your little
            // dog"; `wizard` is off here, which is what leaves the tameness,
            // hungrytime and apport out of it.
            segment(`${APPLY_KEY}${STETHOSCOPE_SLOT}${PET_DIRECTION}`,
                { name: 'Vetlis' }, PET, PET_SEED, PET_DATETIME),
        ],
    }, 'apply stethoscope recipe');
}

// The monster arm needs a monster the hero can point at, which an ordinary
// first turn supplies only for a pet. Most segments below use ^V, the
// wizard level teleport, to drop the hero onto D:5, where every seed was
// chosen by reading the arrival square's neighbours rather than by copying any
// recorded session. The cloud case instead walks an ordinary D:1 hero to the
// clear-air edge of a visible region. Each records exactly one listen, and
// that listen is the first of its move, so it is free.
const MONSTER_DATETIME = '20260615101500';
const DEBUG_PLAIN = 'pettype:none,!acoustics,!autopickup,time,playmode:debug';
const DEBUG_NAMED_FRUIT = `${DEBUG_PLAIN},fruit:slice of pizza`;
const DEBUG_PET = 'pettype:dog,!acoustics,!autopickup,time,playmode:debug';
const GENESIS_KEY = '\x07';
// cmd.c binds C('v') to the wizard level teleport, which asks for a level
// number and takes the hero there without a trap or a scroll.
const LEVEL_TELEPORT = '\x165\n';

// The four D:5 seeds, and what stands next to the hero when she arrives.
// 1057: a newt, which takes apply.c:438's `else` and prints no announcement,
// because a Healer standing next to a newt in a lit room can see it.
const NEWT_SEED = 1057;
// 1205: a garter snake that hid at level creation, so mtmp->mundetected is set
// and apply.c:400-403 names it before clearing the flag.
const HIDDEN_SEED = 1205;
// 8860 and 7040: mimics wearing a potion and a scroll. Both full type names
// carry a parenthesized appearance for objnam.c simple_typename() to cut, and
// the potion's is a type this Healer already knows, so the name in front of
// the parentheses is the real one rather than a description. The scroll's
// wearer is a large mimic, which is the second of the two sizes
// insight.c size_str() can reach here.
const POTION_MIMIC_SEED = 8860;
const SCROLL_MIMIC_SEED = 7040;
// 73: a small mimic wears STRANGE_OBJECT (object type zero). apply.c's
// `else if (mappearance)` deliberately skips seemimic(), leaving m_ap_type
// for insight.c mstatusline() and pager.c mhidden_description() to report.
const STRANGE_MIMIC_SEED = 169;
// A direct source setup for the named SLIME_MOLD arm. #wizgenesis puts this
// small mimic southeast of the hero, and makemon.c set_mimic_sym() chooses a
// slime mold carrying the configured fruit id. The non-default fruit makes
// objnam.c simpleonames() observable without relying on divergent D:5 setup.
const FRUIT_MIMIC_SEED = 57;
const FRUIT_MIMIC_DATETIME = '20270318143000';
// A direct source setup for M_AP_FURNITURE. #wizgenesis puts this small
// mimic northwest of the hero, and makemon.c set_mimic_sym() gives it the
// closed-door entry from syms[]/cmap. The creation message and the subsequent
// listen exercise the same live appearance without a constructed monster.
const FURNITURE_MIMIC_SEED = 8;
const FURNITURE_MIMIC_DATETIME = '20270318143000';
// A second direct appearance setup. The Healer wishes for a small-mimic
// corpse, drops it west of her little dog, and steps west. dog_eat() consumes
// the corpse and quickmimic() changes the pet into the kitten it then mimics.
// The two spaces dismiss the eating and appearance messages before the
// stethoscope points east at the now-disguised pet.
const PET_MIMIC_SEED = 24;
const PET_MIMIC_DATETIME = '20270318143000';
const WISH_KEY = '\x17';
// 7031 in a debug game: the pet again, this time with `wizard` set, which is
// what insight.c:3281-3288 needs.
const DEBUG_PET_SEED = 7031;

// Seed 148 has a fog cloud at (15,10), a hostile kobold zombie in it, and a
// clear-air square at (16,11). This independently chosen walk stays within
// the ported D:1 movement boundary and reaches that edge without crossing the
// region. Listening northwest exercises visible_region_at() after the monster's
// otherwise ordinary status fields have been assembled.
const CLOUD_SEED = 148;
const CLOUD_DATETIME = '20000110090000';
const CLOUD_OPTIONS = 'pettype:none,!acoustics,!autopickup,time';
const CLOUD_WALK = 'llljjhhjhjhhhjhjjjjhjjjhhhkkkhhhhkkhy';

function debugSegment(seed, moves, options = DEBUG_PLAIN) {
    return {
        seed,
        datetime: MONSTER_DATETIME,
        nethackrc: nethackrc({ name: 'Auscult', role: 'Healer', options }),
        moves,
    };
}

export function loadListenAtMonsterRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // An ordinary hostile monster: mstatusline()'s `info` stays empty
            // and the line ends at the armor class.
            debugSegment(NEWT_SEED, `${SPACE_KEY}${LEVEL_TELEPORT}`
                + `${APPLY_KEY}${STETHOSCOPE_SLOT}u`),
            // A hidden one: "There is a garter snake hidden there." and then
            // the report, which needs the reveal above it to have happened.
            // Two messages, so one --More-- to dismiss.
            debugSegment(HIDDEN_SEED, `${SPACE_KEY}${LEVEL_TELEPORT}`
                + `${APPLY_KEY}${STETHOSCOPE_SLOT}k${SPACE_KEY}`),
            // The mimic pair, which is the whole of the M_AP_OBJECT arm:
            // init_dummyobj(), simple_typename() and seemimic(), and then the
            // two messages whose combined length forces a --More--. Each
            // arrival prints a second message of its own, so each needs one
            // more space before the apply command.
            // Both arrivals land inside a shop, so the second space clears
            // the shopkeeper's greeting before the apply command.
            debugSegment(POTION_MIMIC_SEED,
                `${SPACE_KEY}${LEVEL_TELEPORT}${SPACE_KEY}${SPACE_KEY}`
                + `${APPLY_KEY}${STETHOSCOPE_SLOT}l${SPACE_KEY}`),
            debugSegment(SCROLL_MIMIC_SEED,
                `${SPACE_KEY}${LEVEL_TELEPORT}${SPACE_KEY}${SPACE_KEY}`
                + `${APPLY_KEY}${STETHOSCOPE_SLOT}n${SPACE_KEY}`),
            // Object type zero is false in C, so this mimic remains disguised
            // and its status line says it is "mimicking something".
            debugSegment(STRANGE_MIMIC_SEED,
                `${SPACE_KEY}${LEVEL_TELEPORT}${SPACE_KEY}${SPACE_KEY}`
                + `${APPLY_KEY}${STETHOSCOPE_SLOT}l${SPACE_KEY}`),
            // The same path with a named SLIME_MOLD appearance reaches
            // simpleonames() before seemimic() exposes the small mimic.
            {
                seed: FRUIT_MIMIC_SEED,
                datetime: FRUIT_MIMIC_DATETIME,
                nethackrc: nethackrc({
                    name: 'FruitLis',
                    role: 'Healer',
                    options: DEBUG_NAMED_FRUIT,
                }),
                moves: `${WAIT}${GENESIS_KEY}small mimic\n`
                    + `${APPLY_KEY}${STETHOSCOPE_SLOT}n${SPACE_KEY}`,
            },
            {
                seed: FURNITURE_MIMIC_SEED,
                datetime: FURNITURE_MIMIC_DATETIME,
                nethackrc: nethackrc({
                    name: 'FurnLis',
                    role: 'Healer',
                    options: DEBUG_PLAIN,
                }),
                moves: `${WAIT}${GENESIS_KEY}small mimic\n`
                    + `${APPLY_KEY}${STETHOSCOPE_SLOT}y${SPACE_KEY}`,
            },
            {
                seed: PET_MIMIC_SEED,
                datetime: PET_MIMIC_DATETIME,
                nethackrc: nethackrc({
                    name: 'PetMim',
                    role: 'Healer',
                    options: DEBUG_PET,
                }),
                moves: `${WAIT}${WISH_KEY}small mimic corpse\n`
                    + `dlh${SPACE_KEY}${SPACE_KEY}`
                    + `${APPLY_KEY}${STETHOSCOPE_SLOT}l`,
            },
            // The pet in a debug game, on D:1 with no teleport: the tameness
            // detail makes the line longer than the top row, so C wraps it and
            // asks for a --More-- of its own.
            debugSegment(DEBUG_PET_SEED,
                `${SPACE_KEY}${WAIT}${APPLY_KEY}${STETHOSCOPE_SLOT}u`
                + SPACE_KEY, DEBUG_PET),
            // A non-debug D:1 control for mhidden_description()'s region
            // clause. The hero remains outside the cloud and points into it.
            {
                seed: CLOUD_SEED,
                datetime: CLOUD_DATETIME,
                nethackrc: nethackrc({
                    name: 'CloudLis',
                    role: 'Healer',
                    gender: 'male',
                    options: CLOUD_OPTIONS,
                }),
                moves: `${CLOUD_WALK}${APPLY_KEY}${STETHOSCOPE_SLOT}y`
                    + SPACE_KEY,
            },
        ],
    }, 'listen at a monster recipe');
}

// dogmove.c quickmimic() compares the logical glyph numbers in display.c's
// third-screen buffer. These custom symbols deliberately draw the starting
// dog and its kitten disguise with the same byte, so presentation comparison
// would select the fallback message even though C selects the changed-glyph
// message. The subsequent listen proves that the disguise and command state
// remain intact after that message boundary.
export function loadQuickmimicLogicalGlyphRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            seed: PET_MIMIC_SEED,
            datetime: PET_MIMIC_DATETIME,
            nethackrc: nethackrc({
                name: 'GlyphMim',
                role: 'Healer',
                options: `${DEBUG_PET},!color`,
            }) + 'SYMBOLS=S_dog:d,S_feline:d\n',
            moves: `${WAIT}${WISH_KEY}small mimic corpse\n`
                + `dlh${SPACE_KEY}${SPACE_KEY}`
                + `${APPLY_KEY}${STETHOSCOPE_SLOT}l`,
        }],
    }, 'quickmimic logical glyph recipe');
}

// Natural generated secret terrain, reached without mutating the JavaScript
// state. Seed 12 starts beside an SDOOR on D:1. Seed 186 has an SCORR one step
// south after a direct wizard teleport to D:5 and the shortest unobstructed
// walk to its north side. Acoustics remains enabled so pline.c You_hear()'s
// message is part of the strict boundary; the final wait observes that the
// first listen in a hero sequence stayed free.
export function loadSecretTerrainRecipe() {
    const options = 'pettype:none,playmode:debug,!autopickup,time';
    const datetime = '20310203040506';
    return validateCleanRecipe({
        version: 5,
        segments: [
            {
                seed: 12,
                datetime,
                nethackrc: nethackrc({
                    name: 'SecretDoor',
                    role: 'Healer',
                    options,
                }),
                moves: `${APPLY_KEY}${STETHOSCOPE_SLOT}n${WAIT}`,
            },
            {
                seed: 186,
                datetime,
                nethackrc: nethackrc({
                    name: 'SecretPassage',
                    role: 'Healer',
                    options,
                }),
                moves: `${LEVEL_TELEPORT}hhhjjj`
                    + `${APPLY_KEY}${STETHOSCOPE_SLOT}j${WAIT}`,
            },
        ],
    }, 'secret terrain recipe');
}

// Source-real ordinary corpse piles for apply.c its_dead():261-279. The first
// is the selector's minimal singular case. The second drops two distinct mimic
// corpse objects with a prompt dismissal after each message, so nxtobj() must
// skip from the upper corpse to the lower one through the nexthere chain.
export function loadOrdinaryCorpseRecipe() {
    const seed = 9240001;
    const datetime = '20340102030405';
    const options = 'pettype:none,!acoustics,!autopickup,time,playmode:debug';
    const character = (name) => ({
        seed,
        datetime,
        nethackrc: nethackrc({ name, role: 'Healer', options }),
    });
    return validateCleanRecipe({
        version: 5,
        segments: [
            {
                ...character('CorpLis'),
                moves: `${WAIT}${WISH_KEY}small mimic corpse\n`
                    + `dlh${APPLY_KEY}${STETHOSCOPE_SLOT}l${WAIT}`,
            },
            {
                ...character('CorpPile'),
                moves: `${WAIT}${WISH_KEY}small mimic corpse\n${SPACE_KEY}`
                    + `${WISH_KEY}large mimic corpse\n${SPACE_KEY}`
                    + `dl${SPACE_KEY}dm${SPACE_KEY}h`
                    + `${APPLY_KEY}${STETHOSCOPE_SLOT}l${WAIT}`,
            },
        ],
    }, 'ordinary corpse recipe');
}

// A source-real statue for apply.c its_dead():281-307. Seed 9251062 places a
// newt statue directly north of the starting Healer. The first segment is the
// shortest replay through the next wait; the second listens twice without a
// move between them, so the first result is free and the second is costly.
export function loadOrdinaryStatueRecipe() {
    const seed = 9251062;
    const datetime = '20340102030405';
    const options = 'pettype:none,!acoustics,!autopickup,time';
    const character = (name) => ({
        seed,
        datetime,
        nethackrc: nethackrc({ name, role: 'Healer', options }),
    });
    return validateCleanRecipe({
        version: 5,
        segments: [
            {
                ...character('StatLis'),
                moves: `${APPLY_KEY}${STETHOSCOPE_SLOT}k${WAIT}`,
            },
            {
                ...character('StatCost'),
                moves: `${APPLY_KEY}${STETHOSCOPE_SLOT}k${SPACE_KEY}`
                    + `${APPLY_KEY}${STETHOSCOPE_SLOT}k${WAIT}`,
            },
        ],
    }, 'ordinary statue recipe');
}

// The source-real blind statue for apply.c its_dead():285-290. On the same
// seed as the ordinary case, the adjacent newt statue selects the nonhumanoid
// "That creature" name. The focused tests cover the humanoid and u_at()
// polarities which no currently ported command can set up naturally.
export function loadBlindStatueRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            seed: 9251062,
            datetime: '20340102030405',
            nethackrc: nethackrc({
                name: 'BlindStat',
                role: 'Healer',
                options: 'blind,pettype:none,!acoustics,!autopickup,time',
            }),
            moves: `${APPLY_KEY}${STETHOSCOPE_SLOT}k${WAIT}`,
        }],
    }, 'blind statue recipe');
}

// Source-real blind corpses for apply.c its_dead():261-279. The first segment
// leaves the corpse glyph in the transient buffer before blindness hides the
// square, so glyph_at() and obj_to_glyph() agree. The second drops apples over
// the corpse before stepping away; with color disabled, apples and corpses
// render as the same `%` while their logical glyph IDs differ, so map_object()
// must replace the remembered and transient glyph with the corpse.
export function loadBlindCorpseRecipe() {
    const seed = 9240001;
    const datetime = '20340102030405';
    const character = (name, extraOptions = '') => ({
        seed,
        datetime,
        nethackrc: nethackrc({
            name,
            role: 'Healer',
            options: 'blind,pettype:none,!acoustics,!autopickup,time,'
                + `playmode:debug${extraOptions}`,
        }),
    });
    return validateCleanRecipe({
        version: 5,
        segments: [
            {
                ...character('BlindCorpEq'),
                moves: `${WAIT}${WISH_KEY}small mimic corpse\n`
                    + `dlh${APPLY_KEY}${STETHOSCOPE_SLOT}l${WAIT}`,
            },
            {
                ...character('BlindCorpMap', ',!color'),
                moves: `${WAIT}${WISH_KEY}small mimic corpse\n`
                    + `dldjh${APPLY_KEY}${STETHOSCOPE_SLOT}l${WAIT}`,
            },
        ],
    }, 'blind corpse recipe');
}

// One pack per apply_ok() term. Each role below advertises a letter set that
// only the named term produces, so a term answering wrongly would change the
// prompt rather than leave it alone. Every segment cancels at the prompt,
// because applying any of these tools reaches an arm of doapply()'s switch
// that is not ported. The packs are read from seed 4711002; u_init.c gives
// several roles a one-in-six or one-in-twenty-five extra, so a different seed
// advertises different letters for the same role.
export function loadApplyPromptRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The Healer: TOOL_CLASS, WAND_CLASS and SPBOOK_CLASS three times
            // over, which is `[chijk or ?*]`, beside four undiscovered potion
            // stacks and a gold slot apply_ok() answers GETOBJ_DOWNPLAY for.
            segment(`${APPLY_KEY}${ESCAPE_KEY}`),
            // The one role u_init.c:676-678 gives no random extra, so its pack
            // is exactly the five rows of Cave_man[] on every seed. Nothing in
            // it is appliable, so getobj() answers "You don't have anything to
            // use or apply." without prompting at all. Its flint takes
            // is_graystone()'s other arm: ini_inv_use_obj() discovered the type
            // at startup, so the hero knows the stone is not a touchstone and
            // apply_ok() answers GETOBJ_EXCLUDE_SELECTABLE.
            segment(`${APPLY_KEY}`, { role: 'Caveman' }),
            // is_pole(): the Knight's lance is the only suggestion in a pack
            // of one other weapon, four wearables and two foods.
            segment(`${APPLY_KEY}${ESCAPE_KEY}`, { role: 'Knight' }),
            // is_axe(): u_init.c:665-674 gives this Barbarian the axe of
            // Barbarian_0[] and the one-in-six oil lamp, so the prompt pairs
            // the weapon term with a plain TOOL_CLASS suggestion.
            segment(`${APPLY_KEY}${ESCAPE_KEY}`, { role: 'Barbarian' }),
            // The Valkyrie's one-in-six lamp likewise, with no weapon term:
            // her spear is P_SPEAR, which is neither a polearm nor a lance.
            segment(`${APPLY_KEY}${ESCAPE_KEY}`, { role: 'Valkyrie' }),
            // BULLWHIP, the one otyp apply_ok() names inside its weapon test,
            // and the touchstone u_init.c:661 gives every Archeologist, which
            // is is_graystone()'s GETOBJ_SUGGEST arm. The pick-axe, the tinning
            // kit and the sack are suggested as plain tools.
            segment(`${APPLY_KEY}${ESCAPE_KEY}`, { role: 'Archeologist' }),
            // COIN_CLASS: a Tourist starts with gold, which apply_ok()
            // downplays rather than excludes, plus three tools it suggests.
            segment(`${APPLY_KEY}${ESCAPE_KEY}`,
                { role: 'Tourist', gender: 'male' }),
            // Both potion arms in one pack: this Wizard's random potions
            // include oil, which apply_ok() suggests once discovered, beside
            // two discovered potions that are not oil and so fall past the
            // downplay to GETOBJ_EXCLUDE_SELECTABLE.
            segment(`${APPLY_KEY}${ESCAPE_KEY}`,
                { role: 'Wizard', gender: 'male' }),
            // The lock pick and the sack, the pack the next slice will drive.
            segment(`${APPLY_KEY}${ESCAPE_KEY}`, { role: 'Rogue' }),
            // The recorded prompt under a different symbol set and message
            // window, with a listen after it so the report is drawn too.
            segment(LISTEN, {}, DECORATED),
        ],
    }, 'apply prompt recipe');
}

export async function runApplyStethoscopeMatrix() {
    const stethoscope = await runFreshMatrix({
        entries: [{
            label: 'apply stethoscope',
            recipe: loadApplyStethoscopeRecipe(),
        }],
        summaryLabel: 'APPLY STETHOSCOPE',
        chunkLimit: 5,
    });
    if (!stethoscope.passed) return stethoscope;
    const prompt = await runFreshMatrix({
        entries: [{
            label: 'apply prompt',
            recipe: loadApplyPromptRecipe(),
        }],
        summaryLabel: 'APPLY PROMPT',
        chunkLimit: 5,
    });
    if (!prompt.passed) return prompt;
    // Most segments below are playmode:debug games, and
    // scripts/record-session.mjs clears the install directory only before a
    // chunk's first segment, so two debug games in one chunk would leave the
    // second restoring the first one's save. chunkLimit 1 is harmless for the
    // one ordinary cloud segment and preserves that isolation for the rest.
    const monster = await runFreshMatrix({
        entries: [{
            label: 'listen at a monster',
            recipe: loadListenAtMonsterRecipe(),
        }],
        summaryLabel: 'LISTEN AT A MONSTER',
        chunkLimit: 1,
    });
    if (!monster.passed) return monster;
    const quickmimic = await runFreshMatrix({
        entries: [{
            label: 'quickmimic logical glyph',
            recipe: loadQuickmimicLogicalGlyphRecipe(),
        }],
        summaryLabel: 'QUICKMIMIC LOGICAL GLYPH',
        chunkLimit: 1,
    });
    if (!quickmimic.passed) return quickmimic;
    const secret = await runFreshMatrix({
        entries: [{
            label: 'secret terrain',
            recipe: loadSecretTerrainRecipe(),
        }],
        summaryLabel: 'SECRET TERRAIN',
        chunkLimit: 1,
    });
    if (!secret.passed) return secret;
    const corpse = await runFreshMatrix({
        entries: [{
            label: 'ordinary corpse',
            recipe: loadOrdinaryCorpseRecipe(),
        }],
        summaryLabel: 'ORDINARY CORPSE',
        chunkLimit: 1,
    });
    if (!corpse.passed) return corpse;
    const statue = await runFreshMatrix({
        entries: [{
            label: 'ordinary statue',
            recipe: loadOrdinaryStatueRecipe(),
        }],
        summaryLabel: 'ORDINARY STATUE',
        chunkLimit: 2,
    });
    if (!statue.passed) return statue;
    const blindStatue = await runFreshMatrix({
        entries: [{
            label: 'blind statue',
            recipe: loadBlindStatueRecipe(),
        }],
        summaryLabel: 'BLIND STATUE',
        chunkLimit: 1,
    });
    if (!blindStatue.passed) return blindStatue;
    return runFreshMatrix({
        entries: [{
            label: 'blind corpse',
            recipe: loadBlindCorpseRecipe(),
        }],
        summaryLabel: 'BLIND CORPSE',
        chunkLimit: 1,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runApplyStethoscopeMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `apply stethoscope: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
