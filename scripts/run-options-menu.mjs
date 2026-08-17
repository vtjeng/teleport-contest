#!/usr/bin/env node

// Record and replay both options menus against the patched C reference.
//
// The first five segments type 'm' then 'O', which options.c doset_simple()
// hands to doset(). The first three page through every one of its pages
// without committing a selection: the first uses stock options, so the
// cmdassist help block leads the menu and the compiled-in defaults fill its
// value column; the second turns cmdassist off, which drops that block and
// shifts every page boundary, and sets seven option values the menu then has
// to report back; the third rebinds keys, which is the only input that moves
// the "bind keys" count on the menu's last page.
//
// The fourth commits eight boolean picks and covers what happens afterwards:
// parseoptions() and optfn_boolean() applying each one, and
// reset_needed_visuals() repainting once the loop ends. The fifth commits the
// one compound pick whose handler this port runs.
//
// The last nine type 'O' on its own, which doset_simple() answers with
// options.c doset_simple_menu()'s two-page menu. The first two walk to the
// second page and leave without a pick: one commits an empty selection with a
// space and the other cancels with Escape, and between them they cover '>' and
// '<' as well. The rest take picks, so they run the pick loop:
// doset_simple_menu()'s three arms, doset_simple()'s do/while around them, the
// give_opt_msg bracket that silences each toggle's message, and the two flags
// reset_needed_visuals() spends afterwards. One of them walks the hero first,
// so that the repaint the second flag triggers has a square to redraw that
// only map memory can answer for.

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { game } from '../js/gstate.js';
import { COIN_CLASS, POTION_CLASS, WAND_CLASS } from '../js/objects.js';
import { ATR_INVERSE } from '../js/terminal.js';
import { cansee } from '../js/vision.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
// A fixed weekday morning outside any calendar event, so no extra startup
// message can shift the menu's first screen.
const DATETIME = '20281114073500';
// 'm' is #reqmenu and 'O' is #options; extcmdlist_data.js gives the latter
// CMD_M_PREFIX, so the prefixed form reaches doset() rather than the simple
// menu. Six spaces then walk pages 2 through 7. A seventh space would commit
// the (empty) selection, which is the next behavior slice.
const OPEN_FULL_OPTIONS_MENU = 'mO      ';
// The same menu, with picks taken on pages 2, 3 and 4 before the walk
// resumes. The eight reach five of optfn_boolean()'s do_set arms: autopickup,
// lootabc and quick_farsight fall to its default, lit_corridor shuts vision
// down and asks for a redraw, menucolors asks for a prompt style,
// price_quotes refreshes the inventory, and showexp and time share the arm
// that reassesses the status line.
//
// Of the eight spaces that follow, three finish the walk to page 7 and the
// fourth commits there; the last four dismiss --More-- prompts, three raised
// by the eight messages as they fill the top line and the fourth by
// reset_needed_visuals()'s repaint. The Escape is the key the recorder has to
// read at the command prompt for the repainted screen to be captured.
const COMMIT_BOOLEAN_PICKS = 'mO g ijpu afp' + '        ' + '\x1b';

// The fifth recipe drives the one compound option whose do_handler this port
// runs: 'pickup_types', page 6's 'n', whose handler_pickup_types() asks
// parseoptions() to re-enter optfn_pickup_types() and open
// windows.c choose_classes_menu().
//
// Each round opens the menu, toggles one page-2 boolean so the pick loop
// prints a message, walks on to page 6, picks 'pickup_types' and commits with
// Return. The space that follows dismisses the --More-- that
// tty_display_nhwindow()'s NHW_MENU arm raises when the class menu covers that
// unacknowledged message; the keys after it answer the class menu.
//
// The six rounds cover choose_classes_menu()'s outcomes in turn: two classes
// picked by accelerator and by class symbol; the "all classes" entry, which
// collapses a mixed selection to a blank list; a single class; Escape, which
// leaves the incoming list standing; deselecting that survivor, whose empty
// commit clears the list; and one class plus the "all classes" entry inverted
// with '@'. Rounds four and five also open the menu with a class already
// selected, which is what preselects an entry.
// Round two toggles 'autopickup' rather than 'autoquiver', so rounds one and
// two also cover the two arms of the menu's trailing 'autopickup' line, and
// its wider note line moves the whole window eight columns left.
//
// Round six is the one that reaches windows.c menuitem_invert_test(). The
// "all classes" entry carries MENU_ITEMFLAGS_SKIPINVERT, and options.c:7279
// leaves iflags.menuinvertmode at 1, where a selected SKIPINVERT entry still
// inverts off; so '@' clears the coin class 'a' selected, sets the other
// fourteen, and clears the "all classes" entry with them, leaving a
// fourteen-class list rather than the blank one "all classes" would commit.
const EDIT_PICKUP_TYPES = [
    ['h', 'c%\r'], ['g', 'A\r'], ['h', '=\r'], ['h', '\x1b'], ['h', '=\r'],
    ['h', 'aA@\r'],
].map(([boolean, answer]) => `mO ${boolean}    n\r ${answer}`).join('')
    + '\x1b';


// The 'O' menu's own seed, clock and hero, chosen independently of the ones
// above. Nothing in doset_simple_menu() reads any of them, which is the point:
// the two menus have to agree about the option table, not about the game.
const SIMPLE_SEED = 3729551;
const SIMPLE_DATETIME = '20270412094500';

// Two spaces walk to page 2 and commit there with nothing picked, which ends
// doset_simple()'s loop; '>' and '<' move pages without ever committing, and
// Escape cancels outright, which is select_menu()'s other way of answering
// doset_simple_menu() with no pick. The Escape each one ends with is the key
// the recorder has to read at the command prompt for the repainted screen to
// be captured.
const PAGE_SIMPLE_OPTIONS_MENU = ' O  \x1b';
const CANCEL_SIMPLE_OPTIONS_MENU = ' O><>\x1b\x1b';

// The pick loop's own seed, clock and hero, chosen independently of the two
// bases above. These four recipes do read the map, which the paging ones do
// not: a pick that raises go.opt_need_redraw repaints it, and the pass after
// that has to build its menu over the repainted copy.
const PICK_SEED = 8814277;
const PICK_DATETIME = '20291006161200';

// Three picks that split doset_simple()'s `if (flush) flush_screen(1)`, taken
// in the order optfn_boolean() reaches their arms: page 2's 'e' is
// 'hilite_pet', which raises go.opt_need_redraw; page 2's 'p' is 'time', which
// raises disp.botl alone; and page 1's 'e' is 'autoopen', which raises
// neither. The '>' before each page-2 pick moves off page 1, where every pass
// reopens; the '>' and space at the end walk to the last page and commit
// nothing, which is how the loop ends. The Escape is the key the recorder has
// to read at the command prompt for the final screen to be captured.
//
// 'hilite_pet' is what makes the repaint visible: the recipe starts a kitten,
// and turning the option on redraws it in inverse video. Every later pass
// snapshots the map when its menu opens and restores that snapshot when the
// menu is dismissed, so the inverse kitten survives to the last screen only if
// the repaint really did land before the next menu opened.
const SPLIT_FLUSH_PICKS = ' O>e>pe> \x1b';

// 'autoopen' picked twice. The compiled-in default is on, so the first pass
// turns it off and the second turns it back on -- and the second pass can only
// spell its statement '!autoopen' by reading the value the first pass wrote.
// Escape ends the loop the other way select_menu() can.
const RETOGGLE_PICK = ' Oee\x1b\x1b';

// The two picks that raise go.opt_need_glyph_reset and so ask C for a
// reset_glyphmap(gm_optionchange): page 2's 'f' is 'hilite_pile' and its 'g' is
// 'showrace'. C rebuilds glyphmap[] from them and repaints. This port keeps no
// such table -- js/display.js map_glyphinfo() resolves one glyph number on
// demand -- and its docrt() re-runs newsym() over every square, so the two
// together are its answer. That is true only because map memory holds the
// unresolved number for the layers this recipe's picks touch; the repaint
// alone is not enough, which is why the recipe below it exists.
//
// 'showrace' is what shows whether the two agree here -- it redraws the hero
// as her race's monster letter, an 'h' for this recipe's dwarf. Both squares
// this recipe repaints are in sight, so it cannot tell a re-derived memory
// from a replayed one.
const GLYPH_RESET_PICKS = ' O>f>g> \x1b';

// The case the recipe above cannot make, and the one that separates this port
// from the argument reverted at 57a84f4: a pile the hero remembers and cannot
// see, repainted after 'hilite_pile' goes on.
//
// Its own seed, clock and hero. The hero walks out of her room's west doorway
// into the dark corridor beyond, drops her dagger and her long sword on one
// square so that display.h obj_is_piletop() answers TRUE for the top of them,
// then walks two squares further west. A corridor square two away is out of
// sight, so the pile survives only in map memory, and nothing between the
// pick and the repaint can redraw it from the level. Page 2's 'f' is
// 'hilite_pile'; the space commits page 1 with nothing picked, which ends
// doset_simple()'s loop and spends go.opt_need_glyph_reset, and the Escape is
// the key the recorder has to read at the command prompt for the repainted
// screen to be captured.
const REMEMBERED_PILE_SEED = 6193044;
const REMEMBERED_PILE_DATETIME = '20281114093000';
const REMEMBERED_PILE_PICK = ' khhhdadbhhO>f \x1b';

// The same walk and the same drop, with page 2's 'b' -- 'color' -- in place of
// its 'f'. options.c:5407-5409 raises the same two flags, so the repaint is the
// same one; what differs is what it has to re-derive. The discriminating cells
// are the two the hero remembers and cannot see: the pile she dropped, whose
// long sword is HI_METAL, and the branch staircase in the room behind her,
// which is CLR_YELLOW. Under 'OPTIONS=!color' both draw in the terminal
// default, and a repaint that replayed the presentation each was recorded
// under would keep their colours. Breaking that -- storing glyph.color beside
// the number in remembered_glyph_from_presentation() and putting it back in
// remembered_glyph_presentation() -- fails this differential at screen 17,
// row 16, column 57, C colour 8 against JS colour 6.
const REMEMBERED_PILE_COLOR = ' khhhdadbhhO>b \x1b';

// The third toggle over the same square, and the one that needs the full
// menu: 'use_inverse' has no simple-menu row, because its section sits below
// OptS_Advanced. Three spaces walk doset()'s pages to page 4, 'u' picks it and
// Return commits, which ends the pick loop; the space dismisses the --More--
// the toggle's message raises, and the Escape is the key the recorder has to
// read at the command prompt for the repainted screen to be captured.
//
// win/tty/wintty.c tty_print_glyph() (3927-3936) gates MG_OBJPILE on
// iflags.use_inverse, so the pile the recipe leaves behind loses its highlight
// when the option goes off -- and only if the attribute is resolved at print
// time from the stored number. Its rc turns 'hilite_pile' on, so the pile is
// already highlighted when the menu opens. Breaking print_glyph_attr()'s
// iflags.use_inverse test fails this differential at screen 20, row 16,
// column 57, C attr 0 against JS attr 1.
const REMEMBERED_PILE_INVERSE = ' khhhdadbhhmO   u\r \x1b';

// The fourth toggle over the same square. options.c:5362-5375 gives
// 'dark_room' the same arm as 'lit_corridor', so its go.opt_need_redraw takes
// reset_needed_visuals() into display.c reglyph_darkroom() rather than into
// reset_glyphmap(); the room the hero left is remembered out of sight, and
// 1838-1840 moves every square of it from S_darkroom back to S_room. Page 2's
// 'p' is 'dark_room'.
const REMEMBERED_PILE_DARKROOM = ' khhhdadbhhmO p\r \x1b';
// Its eight turn-spending keys: five steps, two drops and one more step. The
// ninth turn is the one the menu opens on, and doset_simple() must not spend
// it.
const PILE_WALK_TURNS = 9;

// The give_opt_msg bracket, which needs both menus to show. 'O' turns
// 'autoopen' off without a word and leaves; 'm' 'O' then opens doset(), where
// page 2's 'g' is 'autopickup' and Return commits it, and that toggle does
// print "'autopickup' option toggled on." -- but only because doset_simple()
// restored the flag on its way out.
const RESTORE_OPT_MSG = ' Oe\x1bmO g\r\x1b';

// The last two recipes are about the status rows rather than about an option.
//
// windows.c select_menu() (1861) raises gb.bot_disabled for as long as a menu
// owns the screen, and botl.c bot() (255) returns on it without writing the
// status window and without clearing disp.botl or disp.botlx. What that
// protects is the moment between two windows: wintty.c erase_menu_or_text()
// (966-984) repairs a dismissed full-screen menu with `docrt(); flush_screen(1)`,
// display.c cls() blanks the status rows along with the rest of the screen, and
// docrt_flags() sets disp.botlx without painting them again. So the class menu
// that replaces the options menu draws over two blank rows, and they stay blank
// until doset_simple()'s reset_needed_visuals() spends disp.botlx once the
// command is over.
//
// Neither of the recipes above reaches that. Both of the ones that open the
// class menu toggle a boolean first, and the --More-- their message raises
// repaints the status rows through ttyPline() before the class menu is drawn.
// These two pick 'pickup_types' as the loop's first act instead:
// doset_simple() keeps give_opt_msg off for its whole loop, so no message
// intervenes and the blank rows reach the screen.
//
// Their own seed, clock and heroes, chosen independently of the bases above.
// Page 1's 'o' is 'pickup_types' in both.
const BLANK_STATUS_SEED = 5063317;
const BLANK_STATUS_DATETIME = '20300719101500';
// '!' and '/' are group accelerators, the potion and wand classes, committed
// with Return. The first Escape ends doset_simple()'s loop, which is what
// makes the status rows come back; the second is the key the recorder has to
// read at the command prompt for the repainted screen to be captured.
const BLANK_STATUS_CLASS_MENU = ' Oo!/\r\x1b\x1b';

// The same shape over a three-row status window, which is the other height
// wintty.c tty_create_nhwindow() gives WIN_STATUS and so the other answer
// js/display.js status_window_rows() can return. '=' selects the ring class
// and the first Escape abandons the class menu, which leaves the incoming
// (empty) list standing; the remaining two end the loop and the command.
const THREE_LINE_SEED = 7104529;
const THREE_LINE_DATETIME = '20321208134500';
const THREE_LINE_CLASS_MENU = ' Oo=\x1b\x1b\x1b';

// Every simple-menu recipe sets menu_headings, and the reason is a display
// ceiling rather than coverage. doset_simple_menu() writes each section
// heading as " %-30s ", so the highlighted run starts one column before the
// first glyph. record-session.mjs writes that single leading space out
// literally, keeping its attribute; serialize() in frozen/terminal.js -- which
// the judge substitutes for js/terminal.js -- emits a row's leading spaces at
// the default attribute instead. Under the compiled-in
// menu_headings:[no-color&inverse] the two therefore disagree about exactly
// one cell per heading row, and frozen/screen-decode.mjs counts it because
// inverse is visible on a space. Bold is not, so a bold heading still
// exercises the styling and still compares cleanly. The deferral "an indented
// inverse menu heading cannot match" holds the rest of that reasoning;
// scripts/run-no-time-commands.mjs sidesteps the same ceiling in the spell
// menu with menu_headings:none.

function nethackrc(extra) {
    return [
        'OPTIONS=name:Optster,role:Valkyrie,race:human,gender:female,'
            + 'align:lawful',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup',
        ...extra,
        '',
    ].join('\n');
}

// The simple menu's recipes need their own base: the second one turns
// autopickup on, so !autopickup cannot sit in the shared line the way it does
// above, and a boolean stated twice is a configuration-file error.
function simpleNethackrc(extra) {
    return [
        'OPTIONS=name:Optineer,role:Ranger,race:gnome,gender:male,'
            + 'align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics',
        ...extra,
        '',
    ].join('\n');
}

// The pick recipes' base. It starts a pet, which neither base above does,
// because the pet is what the 'hilite_pet' pick's repaint changes; without one
// that pick would raise go.opt_need_redraw and draw the same map back.
function pickNethackrc() {
    return [
        'OPTIONS=name:Optwright,role:Archeologist,race:dwarf,gender:male,'
            + 'align:lawful',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:cat,!acoustics',
        'OPTIONS=menu_headings:bold',
        '',
    ].join('\n');
}

// The remembered-pile recipe's base. It starts no pet, because a pet walking
// onto the pile would draw its own glyph over the square and put the pile back
// in the display buffer from the level rather than from memory; and it turns
// autopickup off, because the two dropped objects have to stay on the floor
// when the hero walks back over neither of them.
function rememberedPileNethackrc({ hilitePile = false } = {}) {
    return [
        'OPTIONS=name:Pileton,role:Valkyrie,race:human,gender:female,'
            + 'align:lawful',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup',
        `OPTIONS=menu_headings:bold${hilitePile ? ',hilite_pile' : ''}`,
        '',
    ].join('\n');
}

// The blank-status recipes' base. `statuslines` is the one thing the two
// disagree about, because it is the height of the window whose rows they are
// about; the heroes differ so that either row's first cell names its own
// recipe when a mismatch prints it.
function blankStatusNethackrc(statuslines) {
    return [
        statuslines === 3
            ? 'OPTIONS=name:Trioline,role:Samurai,race:human,gender:male,'
                + 'align:lawful'
            : 'OPTIONS=name:Blanksmith,role:Priest,race:elf,gender:female,'
                + 'align:chaotic',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics',
        `OPTIONS=menu_headings:bold,statuslines:${statuslines}`,
        '',
    ].join('\n');
}

// Every recipe carries the name its consumers ask for: runOptionsMenuMatrix()
// labels its entries with it, and the three focused options test files start
// their game from the recipe of that name. Nothing addresses a recipe by
// position, so a recipe inserted anywhere in this list moves no other.
export function loadOptionsMenuRecipes() {
    const segments = [
        {
            name: 'stock options menu',
            seed: 4210041,
            datetime: DATETIME,
            nethackrc: nethackrc([]),
            // Space dismisses startup before the menu opens.
            moves: ' ' + OPEN_FULL_OPTIONS_MENU,
        },
        {
            name: 'configured options menu',
            seed: 4210041,
            datetime: DATETIME,
            // Every option here is one parseNethackrc() interprets, so the
            // menu reads a session value rather than a compiled-in default:
            // !cmdassist also removes doset()'s five-line help block.
            nethackrc: nethackrc([
                'OPTIONS=!cmdassist,msg_window:reversed,statuslines:3',
                'OPTIONS=versinfo:7,whatis_coord:map,runmode:walk',
                'OPTIONS=pile_limit:3,catname:Mittens,fruit:kiwi',
                'OPTIONS=hilite_pet,!color,sortloot:full',
            ]),
            moves: ' ' + OPEN_FULL_OPTIONS_MENU,
        },
        {
            name: 'rebound options menu',
            seed: 4210041,
            datetime: DATETIME,
            // Four shapes of BINDINGS statement, none of them touching the
            // keys this recording types. cmd.c count_bind_keys() answers each
            // from gc.Cmd.cmdbinds, which holds one entry per key: '^X' ends
            // on #kick because cmdbind_add() overwrote the #jump entry rather
            // than adding a second, 'Z' ends on #apply because
            // parsebindings() applies a comma list right to left, 'q' takes
            // the CMD_PARAM row #toggle that bind_key() finds after splitting
            // the parameter off at '(', and 'v' loses its entry to
            // cmdbind_remove(). That leaves three moved commands for the
            // first loop and #version's orphaned 'v' for the second.
            nethackrc: nethackrc([
                'BINDINGS=^X:jump',
                'BINDINGS=^X:kick',
                'BINDINGS=Z:apply,Z:eat',
                'BINDINGS=q:toggle(showexp)',
                'BINDINGS=v:nothing',
            ]),
            moves: ' ' + OPEN_FULL_OPTIONS_MENU,
        },
        {
            name: 'committed options menu',
            seed: 4210041,
            datetime: DATETIME,
            // Stock options again, so the menu pages -- and with them the
            // selector each pick names -- are the first segment's.
            nethackrc: nethackrc([]),
            moves: ' ' + COMMIT_BOOLEAN_PICKS,
        },
        {
            name: 'pickup_types class menu',
            seed: 4210041,
            datetime: DATETIME,
            // Stock options once more, for the same reason.
            nethackrc: nethackrc([]),
            moves: ' ' + EDIT_PICKUP_TYPES,
        },
        {
            name: 'stock simple options menu',
            seed: SIMPLE_SEED,
            datetime: SIMPLE_DATETIME,
            nethackrc: simpleNethackrc([
                'OPTIONS=!autopickup',
                'OPTIONS=menu_headings:cyan&bold',
            ]),
            moves: PAGE_SIMPLE_OPTIONS_MENU,
        },
        {
            name: 'configured simple options menu',
            seed: SIMPLE_SEED,
            datetime: SIMPLE_DATETIME,
            // Every boolean the simple menu shows whose name parseNethackrc()
            // stores under its own address, flipped away from the compiled-in
            // default the recipe above records, plus one changed value for
            // each of the four compound rows that has a live setting.
            // bgcolors, dropped_nopick, fireassist and price_quotes are the
            // four the parse cannot round-trip: their storage is named for
            // something other than the option, applyBooleanOption() has no arm
            // for them, and booleanOptionValue() stops rather than print the
            // default over the session's setting.
            nethackrc: simpleNethackrc([
                'OPTIONS=menu_headings:bold',
                'OPTIONS=autodig,!autoopen,autopickup,autoquiver',
                'OPTIONS=!cmdassist,!pickup_stolen',
                'OPTIONS=!pickup_thrown,pushweapon,!color,!customcolors',
                'OPTIONS=!customsymbols,hilite_pet,hilite_pile,showrace',
                'OPTIONS=!sparkle,hitpointbar,showexp,time',
                'OPTIONS=fruit:kiwi,number_pad:1,statuslines:3',
                'OPTIONS=symset:DECgraphics',
            ]),
            moves: CANCEL_SIMPLE_OPTIONS_MENU,
        },
        {
            name: 'simple menu flush split',
            seed: PICK_SEED,
            datetime: PICK_DATETIME,
            nethackrc: pickNethackrc(),
            moves: SPLIT_FLUSH_PICKS,
        },
        {
            name: 'simple menu retoggle',
            seed: PICK_SEED,
            datetime: PICK_DATETIME,
            nethackrc: pickNethackrc(),
            moves: RETOGGLE_PICK,
        },
        {
            name: 'simple menu message restore',
            seed: PICK_SEED,
            datetime: PICK_DATETIME,
            nethackrc: pickNethackrc(),
            moves: RESTORE_OPT_MSG,
        },
        {
            name: 'simple menu glyph reset',
            seed: PICK_SEED,
            datetime: PICK_DATETIME,
            nethackrc: pickNethackrc(),
            moves: GLYPH_RESET_PICKS,
        },
        {
            name: 'remembered pile repainted by a glyph reset',
            seed: REMEMBERED_PILE_SEED,
            datetime: REMEMBERED_PILE_DATETIME,
            nethackrc: rememberedPileNethackrc(),
            moves: REMEMBERED_PILE_PICK,
        },
        {
            name: 'remembered pile repainted by a colour toggle',
            seed: REMEMBERED_PILE_SEED,
            datetime: REMEMBERED_PILE_DATETIME,
            nethackrc: rememberedPileNethackrc(),
            moves: REMEMBERED_PILE_COLOR,
        },
        {
            name: 'remembered pile repainted by a use_inverse toggle',
            seed: REMEMBERED_PILE_SEED,
            datetime: REMEMBERED_PILE_DATETIME,
            nethackrc: rememberedPileNethackrc({ hilitePile: true }),
            moves: REMEMBERED_PILE_INVERSE,
        },
        {
            name: 'remembered room repainted by a dark_room toggle',
            seed: REMEMBERED_PILE_SEED,
            datetime: REMEMBERED_PILE_DATETIME,
            nethackrc: rememberedPileNethackrc(),
            moves: REMEMBERED_PILE_DARKROOM,
        },
        {
            name: 'blank status under a class menu',
            seed: BLANK_STATUS_SEED,
            datetime: BLANK_STATUS_DATETIME,
            nethackrc: blankStatusNethackrc(2),
            moves: BLANK_STATUS_CLASS_MENU,
        },
        {
            name: 'blank three-row status under a class menu',
            seed: THREE_LINE_SEED,
            datetime: THREE_LINE_DATETIME,
            nethackrc: blankStatusNethackrc(3),
            moves: THREE_LINE_CLASS_MENU,
        },
    ];
    // record-session preserves the staged install between one recipe's
    // segments, and each of these leaves the recorder stopped inside a live
    // menu, so each gets its own recipe and fresh install.
    return segments.map(({ name, ...segment }) => ({
        name,
        recipe: validateCleanRecipe({
            version: 5,
            segments: [segment],
        }, name),
    }));
}

// The recipe of that name, for a caller that wants one configuration rather
// than the whole matrix. Throws rather than return undefined, so a name that
// stops matching fails where it is asked for.
export function optionsMenuRecipe(name) {
    const entry = loadOptionsMenuRecipes().find(
        (candidate) => candidate.name === name,
    );
    if (!entry) throw new Error(`no options menu recipe named '${name}'`);
    return entry.recipe;
}

// The eight booleans the committing recipe picks, in the order doset() walks
// them, each paired with the allopt[] storage it writes.
const COMMITTED_PICKS = Object.freeze([
    ['autopickup', 'flags', 'pickup'],
    ['lit_corridor', 'flags', 'lit_corridor'],
    ['lootabc', 'flags', 'lootabc'],
    ['menucolors', 'iflags', 'use_menu_color'],
    ['price_quotes', 'iflags', 'pricequotes'],
    ['quick_farsight', 'flags', 'quick_farsight'],
    ['showexp', 'flags', 'showexp'],
    ['time', 'flags', 'time'],
]);

// The three recipes that walk, drop a pile and open a menu over it.
const PILE_RECIPES = new Set([
    REMEMBERED_PILE_PICK, REMEMBERED_PILE_COLOR, REMEMBERED_PILE_INVERSE,
    REMEMBERED_PILE_DARKROOM,
]);

export async function verifyOptionsMenuSegment(segment) {
    let boundary = null;
    await runSegment(
        { ...segment },
        { onBoundary: (error) => { boundary = error; } },
    );
    // Neither shape of run may stop early: the paging ones stay inside
    // select_menu(), and the committing one runs the whole pick loop.
    if (boundary) throw boundary;
    // doset() spends no turn, so the hero must still be on the turn her keys
    // before the menu left her on. Every recipe but one types nothing but
    // menu keys, so that turn is the first; the remembered-pile one walks and
    // drops first, and counts its own turns below.
    const turnsBeforeTheMenu = PILE_RECIPES.has(segment.moves)
        ? PILE_WALK_TURNS : 1;
    if (game.moves !== turnsBeforeTheMenu)
        throw new Error('opening the options menu advanced the turn counter');

    if (segment.moves === BLANK_STATUS_CLASS_MENU
        || segment.moves === THREE_LINE_CLASS_MENU) {
        // Two independent properties of the recipe, which one boolean used to
        // conflate because the only three-row recipe is also the only escaping
        // one. Read each from the thing that decides it.
        const escapedClassMenu = segment.moves === THREE_LINE_CLASS_MENU;
        const statusRows = /statuslines:3/u.test(segment.nethackrc) ? 3 : 2;
        // Committing the class menu writes the two classes picked, in
        // flags.inv_order order; escaping it leaves the incoming list
        // standing, and the configuration file set none.
        assert.deepEqual(
            game.flags.pickup_types,
            escapedClassMenu ? [] : [POTION_CLASS, WAND_CLASS],
            'the class menu left the wrong pickup_types',
        );
        // The status rows only stay blank because bot() declined to write
        // them, so the flag it declined on has to be back down and the update
        // it declined has to have been spent by the time the command returns.
        if (game.gb.bot_disabled !== false)
            throw new Error('select_menu() left bot() disabled');
        if (game.disp.botl !== false || game.disp.botlx !== false)
            throw new Error('the command returned with the status still dirty');
        if (game.iflags.wc2_statuslines !== statusRows)
            throw new Error('the recipe ran at the wrong status height');
        return;
    }

    if (segment.moves === GLYPH_RESET_PICKS) {
        // Both picks share options.c:5379-5385, so both raise
        // go.opt_need_glyph_reset, and reset_needed_visuals() spends it.
        if (game.iflags.hilite_pile !== true || game.flags.showrace !== true)
            throw new Error('a glyph-reset pick was not applied');
        if (game.go.opt_need_glyph_reset !== false
            || game.go.opt_need_redraw !== false) {
            throw new Error('reset_needed_visuals() left a repair pending');
        }
        return;
    }

    if (PILE_RECIPES.has(segment.moves)) {
        if (game.go.opt_need_glyph_reset !== false)
            throw new Error('reset_needed_visuals() left a repair pending');
        // Each recipe's own toggle, in the direction its menu keys take it.
        const expected = {
            [REMEMBERED_PILE_PICK]: () => game.iflags.hilite_pile === true,
            [REMEMBERED_PILE_COLOR]: () => game.iflags.wc_color === false,
            [REMEMBERED_PILE_INVERSE]: () => game.iflags.wc_inverse === false,
            [REMEMBERED_PILE_DARKROOM]: () => game.flags.dark_room === false,
        }[segment.moves];
        if (!expected())
            throw new Error('the pick loop left its option unchanged');
        // The square all three recipes are about: two objects the hero
        // dropped, two squares behind her in a dark corridor. The screens the
        // differential compares carry that cell, but only if all three of
        // these hold, and each one is a separate way for a recipe to stop
        // testing what it is named for.
        const x = game.u.ux + 2;
        const y = game.u.uy;
        const pile = game.level.objects[x][y];
        if (!pile?.nexthere)
            throw new Error('the recipe left no pile behind the hero');
        if (cansee(x, y))
            throw new Error('the hero can still see the pile she dropped');
        if (!Number.isInteger(game.level.at(x, y).remembered_glyph?.glyph)) {
            throw new Error(
                'the pile square holds no remembered object glyph number',
            );
        }
        // The attribute the two 'hilite_pile' recipes turn on and the
        // 'use_inverse' one turns off; the colour recipe never raises it.
        const highlighted = segment.moves === REMEMBERED_PILE_PICK;
        if ((game.level.at(x, y).disp_attr === ATR_INVERSE) !== highlighted) {
            throw new Error(
                'the repaint gave the remembered pile the wrong attribute',
            );
        }
        return;
    }

    if (segment.moves === SPLIT_FLUSH_PICKS
        || segment.moves === RETOGGLE_PICK
        || segment.moves === RESTORE_OPT_MSG) {
        // doset_simple() restores give_opt_msg on its way out, whichever way
        // the loop ended.
        if (game.give_opt_msg !== true)
            throw new Error('the pick loop left the toggle message suppressed');
        // Every pass ends with reset_needed_visuals(), so nothing is pending
        // by the time the command returns.
        if (game.go.opt_need_redraw !== false)
            throw new Error('reset_needed_visuals() left a repair pending');
        // 'autoopen' is the boolean all three recipes pick, and its compiled-in
        // default is on. The first and third leave it off after one pick; the
        // second picks it twice and leaves it as it found it.
        const picks = segment.moves === RETOGGLE_PICK ? 2 : 1;
        if (game.flags.autoopen !== (picks % 2 === 0))
            throw new Error("the pick loop left 'autoopen' at the wrong value");
        const splitFlush = segment.moves === SPLIT_FLUSH_PICKS;
        if (splitFlush
            && (game.iflags.wc_hilite_pet !== true
                || game.flags.time !== true)) {
            throw new Error('a pick that splits the flush was not applied');
        }
        // Only the third recipe reaches doset(), whose page-2 'g' is
        // 'autopickup'; the other two must leave the simple menu's own rows
        // alone.
        if (game.flags.pickup !== (segment.moves === RESTORE_OPT_MSG))
            throw new Error("the wrong menu changed 'autopickup'");
        return;
    }

    if (segment.moves === PAGE_SIMPLE_OPTIONS_MENU
        || segment.moves === CANCEL_SIMPLE_OPTIONS_MENU) {
        // Neither recipe picks anything, so the simple menu has to leave every
        // setting as the configuration file left it. These four are the ones
        // the two recipes disagree about, one per section.
        const configured = segment.moves === CANCEL_SIMPLE_OPTIONS_MENU;
        if (game.svp.pl_fruit !== (configured ? 'kiwi' : 'slime mold')
            || game.flags.pickup !== configured
            || game.iflags.wc_hilite_pet !== configured
            || game.flags.time !== configured) {
            throw new Error('paging the simple options menu changed a setting');
        }
        // doset_simple_menu() clears the five flags reset_needed_visuals()
        // spends before select_menu() runs, and doset_simple() spends them
        // after every pass, so its loop ends with nothing pending.
        if (game.go.opt_need_redraw !== false)
            throw new Error('reset_needed_visuals() left a repair pending');
        return;
    }

    if (segment.moves.includes(EDIT_PICKUP_TYPES)) {
        // The rounds leave [WEAPON, FOOD], [], [RING], [RING], [] and every
        // class but the coins in turn; only the last survives to here, and
        // the screens the differential compares carry the five before it.
        // The last is flags.inv_order without COIN_CLASS because round six
        // selected the coin entry before inverting, which turned it off and
        // everything else on.
        assert.deepEqual(
            game.flags.pickup_types,
            game.flags.inv_order.filter((oclass) => oclass !== COIN_CLASS),
            'the class menu left the wrong pickup_types',
        );
        // Six rounds toggled 'autoquiver' five times and 'autopickup' once.
        if (game.flags.pickup !== true || game.flags.autoquiver !== true)
            throw new Error('the pickup_types rounds toggled the wrong boolean');
        return;
    }

    if (segment.moves.includes(COMMIT_BOOLEAN_PICKS)) {
        for (const [name, owner, field] of COMMITTED_PICKS) {
            if (game[owner][field] !== true) {
                throw new Error(
                    `committing the options menu left '${name}' off`,
                );
            }
        }
        // reset_needed_visuals() spends every flag it consumes, so a second
        // 'O' would find the same clean slate the first one did.
        if (game.go.opt_need_redraw !== false
            || game.go.opt_need_promptstyle !== false) {
            throw new Error('reset_needed_visuals() left a repair pending');
        }
        return;
    }

    // Paging the menu must apply nothing. These four are the options the two
    // recipes disagree about or that the recorded pages show as togglable:
    // autopickup and lit_corridor stay off, menucolors stays off, and
    // cmdassist and pile_limit keep whatever the configuration file set.
    const configured = segment.nethackrc.includes('!cmdassist');
    if (game.flags.pickup !== false || game.flags.lit_corridor !== false
        || game.iflags.use_menu_color !== false) {
        throw new Error('paging the options menu toggled a boolean option');
    }
    if (game.iflags.cmdassist !== !configured
        || game.flags.pile_limit !== (configured ? 3 : 5)) {
        throw new Error('paging the options menu changed a configured value');
    }
}

export async function runOptionsMenuMatrix() {
    return runFreshMatrix({
        entries: loadOptionsMenuRecipes()
            .map(({ name, recipe }) => ({ label: name, recipe })),
        summaryLabel: 'OPTIONS MENU',
        verifySegment: verifyOptionsMenuSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runOptionsMenuMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((exitCode) => {
        process.exitCode = exitCode;
    }).catch((error) => {
        process.stderr.write(`options menu: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
