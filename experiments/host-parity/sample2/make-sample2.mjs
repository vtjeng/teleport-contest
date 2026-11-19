#!/usr/bin/env node
// make-sample2.mjs -- Write the second host-parity sample: recipes aimed at
// screens that draw without drawing random numbers, or that depend on the
// host's C library, which the first sample (../select-sample.mjs) barely
// reached. README.md in this directory describes each group.
//
// Usage: node experiments/host-parity/sample2/make-sample2.mjs
//
// Writes recipes/<id>.session.json and sample2.jsonl (one line per recipe:
// id, group, what it probes, and `marker`, a string that its Linux
// recording must show somewhere if the recipe reached its target screen;
// check-markers.mjs checks them). Rerunning rewrites every file, then
// applies trims.json: the number of final keys to drop from a recipe whose
// game ends before its last key, as measured on Linux (record-session.mjs
// fails a recipe whose keys outlast the game).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'recipes');

// Every recipe uses this seed and date unless it varies them on purpose; the
// probes test display code, which these do not reach.
const SEED = 7310442;
const DATE = '20261115143000';
const ESC = '\u001b';
const ctrl = (c) => String.fromCharCode(c.toUpperCase().charCodeAt(0) - 64);

function rc(role, extra = '', { gender = 'female', race = 'human', align = 'neutral', debug = false } = {}) {
    return `OPTIONS=name:Probe,role:${role},race:${race},gender:${gender},align:${align}`
        + `${debug ? ',playmode:debug' : ''}\n`
        + 'OPTIONS=!autopickup,!legacy,!tutorial,!splash_screen,pettype:none\n'
        + extra;
}
const VAL = rc('Valkyrie');
const TOU = rc('Tourist', '', { gender: 'male' });

const recipes = [];
function add(id, group, probe, marker, segments) {
    if (recipes.some((r) => r.id === id)) throw new Error(`duplicate id ${id}`);
    recipes.push({ id, group, probe, marker, segments });
}
// Each segment starts with ESC: it dismisses a --More-- after the welcome
// (some dates add a start message) and does nothing at the command prompt.
function seg(nethackrc, moves, { seed = SEED, datetime = DATE } = {}) {
    return { seed, datetime, nethackrc, moves: ESC + moves };
}

// ---------------------------------------------------------------- options
// The #optionsfull menu at this commit, page by page (read from a Linux
// recording of these keys). Page 1 holds accessiblemsg; pages 2-4 and the
// first two rows of page 5 are booleans; the rest are compound options.
const FULL_PAGES = [
    ['accessiblemsg'],
    ['acoustics', 'altmeta', 'armorstatus', 'autodescribe', 'autodig', 'autoopen',
        'autopickup', 'autoquiver', 'bgcolors', 'checkpoint', 'cmdassist', 'color',
        'confirm', 'customcolors', 'customsymbols', 'dark_room', 'dropped_nopick',
        'eight_bit_tty', 'extmenu', 'fireassist', 'fixinv', 'force_invmenu', 'goldX'],
    ['help', 'herecmd_menu', 'hilite_pet', 'hilite_pile', 'hitpointbar', 'idlecheckpoint',
        'ignintr', 'implicit_uncursed', 'lit_corridor', 'lootabc', 'mail', 'mention_decor',
        'mention_map', 'mention_walls', 'menu_overlay', 'menucolors', 'mon_movement', 'null',
        'pickup_stolen', 'pickup_thrown', 'price_quotes', 'pushweapon', 'query_menu'],
    ['quick_farsight', 'rest_on_space', 'safe_pet', 'safe_wait', 'showdamage', 'showexp',
        'showrace', 'showvers', 'silent', 'sortpack', 'sounds', 'sparkle', 'spot_monsters',
        'standout', 'terrainstatus', 'time', 'tips', 'tombstone', 'toptenwin', 'travel',
        'use_inverse', 'verbose', 'weaponstatus'],
    ['whatis_menu', 'whatis_moveskip', 'autounlock', 'boulder', 'crash_email', 'crash_name',
        'crash_urlmax', 'disclose'],
    ['fruit', 'glyph', 'hilite_status', 'menu_headings', 'menu_objsyms', 'menuinvertmode',
        'menustyle', 'msg_window', 'number_pad', 'packorder', 'paranoid_confirmation',
        'petattr', 'pickup_burden', 'pickup_types', 'pile_limit', 'roguesymset', 'runmode',
        'scores', 'sortdiscoveries', 'sortloot', 'sortvanquished', 'statushilites',
        'statuslines'],
    ['suppress_alert', 'symset', 'versinfo', 'whatis_coord', 'whatis_filter',
        'autocompletions', 'autopickup exceptions', 'bind keys', 'menu colors',
        'message types', 'status condition fields', 'status highlight rules'],
];
const BOOL_COUNT = { 0: 1, 1: 23, 2: 23, 3: 23, 4: 2 };
// After a change, show the screens it can affect: inventory, a look here,
// a search, the status lines, and the menu again with its new value.
const SHOW = `i${ESC}:s`;
// A nethackrc line that NetHack rejects shows the config errors and waits
// for Return before the game starts; at the command prompt Return (^J) only
// moves the hero south, so recipes whose config may be rejected on one host
// start with it.
const CFG_OK = '\n';
const letter = (i) => 'abcdefghijklmnopqrstuvwxyz'[i];

FULL_PAGES.forEach((names, p) => {
    const open = `#optionsfull\n${'>'.repeat(p)}`;
    names.forEach((name, i) => {
        const key = letter(i);
        const slug = name.replace(/ /g, '-');
        if (i < (BOOL_COUNT[p] ?? 0)) {
            add(`optb-${slug}`, 'options-boolean', `#optionsfull toggles boolean ${name}`, name,
                [seg(VAL, `${open}${key}\n${SHOW}${open}${ESC}`)]);
            return;
        }
        // Compound options: leave its prompt at once, take the first
        // choice, take the second choice, and (for getlin prompts) type
        // a value that libc number parsing could treat differently.
        add(`optc-${slug}-esc`, 'options-compound', `#optionsfull ${name}, then ESC`, name,
            [seg(VAL, `${open}${key}\n${ESC}${ESC}${ESC}${SHOW}`)]);
        add(`optc-${slug}-a`, 'options-compound', `#optionsfull ${name}, first choice`, name,
            [seg(VAL, `${open}${key}\na\n${ESC}${ESC}${SHOW}${open}${ESC}`)]);
        add(`optc-${slug}-b`, 'options-compound', `#optionsfull ${name}, second choice`, name,
            [seg(VAL, `${open}${key}\nb\n\n${ESC}${ESC}${SHOW}${open}${ESC}`)]);
        add(`optc-${slug}-num`, 'options-compound',
            `#optionsfull ${name}, typed value 99999999999 (atoi/strtol overflow)`, name,
            [seg(VAL, `${open}${key}\n99999999999\n${ESC}${ESC}${SHOW}${open}${ESC}`)]);
    });
});

// The short O menu, its help text (which names the config file) and its
// two pages.
add('opt-short-pages', 'options-short', 'O menu, both pages', 'Options',
    [seg(VAL, `O>>${ESC}`)]);
add('opt-short-help', 'options-short', 'O menu ? help text, paged', 'hide help',
    [seg(VAL, `O?\n${' '.repeat(12)}${ESC}${ESC}`)]);
add('opt-full-help', 'options-short', '#optionsfull ? help text, paged', 'Booleans',
    [seg(VAL, `#optionsfull\n?\n${' '.repeat(12)}${ESC}${ESC}`)]);
add('opt-short-select-page', 'options-short', 'O menu, select a whole page with ,', 'Options',
    [seg(VAL, `O,\n${ESC.repeat(6)}${SHOW}`)]);
add('opt-saveoptions', 'options-short', '#saveoptions writes to the judge HOME', 'saveoptions',
    [seg(VAL, `#saveoptions\ny${ESC}`)]);

// ---------------------------------------------------------- status highlights
// Each config line goes through botl.c parse_status_hl1()/parse_status_hl2();
// the moves change HP, gold and turn so up/down/changed rules fire.
const HL = [
    ['hp-percent', 'OPTIONS=statushilites:10,hilite_status:hitpoints/<50%/red/>=100%/green&bold'],
    ['hp-absolute', 'OPTIONS=statushilites:10,hilite_status:hitpoints/<10/red&inverse/>=16/yellow&underline'],
    ['gold-updown', 'OPTIONS=statushilites:10,hilite_status:gold/up/green/down/red'],
    ['time-changed', 'OPTIONS=time,statushilites:3,hilite_status:time/changed/bright-blue&blink'],
    ['title-text', 'OPTIONS=statushilites:10,hilite_status:title/always/red&underline'],
    ['align-text', 'OPTIONS=statushilites:10,hilite_status:alignment/neutral/magenta&bold'],
    ['hunger-text', 'OPTIONS=statushilites:10,hilite_status:hunger/not-hungry/cyan'],
    ['cond-many', 'OPTIONS=statushilites:10,hilite_status:condition/blind/magenta&underline&blink&bold&italic condition/conf/yellow&italic'],
    ['cond-all', 'OPTIONS=statushilites:10,hilite_status:condition/all/orange&dim'],
    ['ac-updown', 'OPTIONS=statushilites:10,hilite_status:armor-class/down/green/up/red'],
    ['xp-rgb', 'OPTIONS=statushilites:10,hilite_status:experience-level/always/#ff8000'],
    ['str-percent-edge', 'OPTIONS=statushilites:10,hilite_status:strength/<=0%/red/>100%/green/=100%/blue'],
    ['many-fields', 'OPTIONS=statushilites:10,hilite_status:hitpoints/always/red hitpoints-max/always/blue power/always/green power-max/always/cyan gold/always/yellow dungeon-level/always/magenta experience-level/always/orange armor-class/always/white'],
    // 21 and 22 '/'-separated fields: parse_status_hl1() writes hsbuf[20]
    // and a parser can read hsbuf[21], past the array (js/options.js).
    ['hsbuf-21', `OPTIONS=hilite_status:hitpoints${'/<1/red'.repeat(10)}`],
    ['hsbuf-22', `OPTIONS=hilite_status:hitpoints${'/<1/red'.repeat(10)}/x`],
    ['bad-color', 'OPTIONS=statushilites:10,hilite_status:hitpoints/always/notacolor&bold'],
    ['bad-field', 'OPTIONS=statushilites:10,hilite_status:nosuchfield/always/red'],
];
for (const [name, line] of HL) {
    add(`hl-${name}`, 'status-highlights', `nethackrc ${line}`, 'Dlvl',
        [seg(VAL + `${line}\n`, `${CFG_OK}s${ESC}20s$${ctrl('x')}${' '.repeat(6)}${ESC}#optionsfull\n>>>>>>l\n${ESC}${ESC}${ESC}`)]);
}
// The interactive status-highlight menu: a field, a rule type, a threshold
// where the rule takes one, a colour and an attribute; then the menu again,
// listing the rules in config format.
const HL_MENU = [
    ['hp-pct-le', 'rp50\nbbb\n'], ['hp-pct-lt', 'rp50\nabb\n'], ['hp-num', 'rn10\nabb\n'],
    ['hp-num-big', 'rn99999999999\nabb\n'], ['hp-pct-200', 'rp200\nabb\n'],
    ['hp-always', 'rabb\n'], ['hp-changes', 'rcabb\n'], ['hp-critical', 'rCbb\n'],
    ['title-always', 'aabb\n'], ['title-changes', 'acbb\n'],
    ['gold-changes', 'jcabb\n'], ['gold-num', 'jn100\nbbb\n'],
    ['hunger-text', 'qtabb\n'], ['hunger-a', 'qabb\n'], ['align-a', 'habb\n'],
    ['ac-num', 'nn5\nabb\n'], ['time-changes', 'pcabb\n'], ['xp-pct', 'mp50\nabb\n'],
    ['hp-attrs', 'rabcdef\n'], ['hp-twice', 'rp50\nbbb\n\u001b\u001bsp25\nbcb\n'],
];
for (const [name, keys] of HL_MENU) {
    add(`hl-menu-${name}`, 'status-highlights',
        `#optionsfull status highlight rules: ${JSON.stringify(keys)}`, 'Status hilites',
        [seg(VAL + 'OPTIONS=statushilites:10\n',
            `#optionsfull\n>>>>>>l\n${keys}${ESC}${ESC}${ESC}${ESC}`
            + `#optionsfull\n>>>>>>l\na${' '.repeat(3)}${ESC}${ESC}${ESC}20s`)]);
}

// ---------------------------------------------------------- regex (libc)
// regex_compile() is regcomp(REG_EXTENDED | REG_NOSUB) from the host libc.
// Patterns are grouped: ones POSIX leaves undefined or that GNU and BSD
// parse differently, and ones that are errors on at least one of them.
const REGEX_MATCH = [
    String.raw`\w+ spear`, String.raw`\bdagger\b`, String.raw`\<dagger\>`, '[[:<:]]dagger',
    String.raw`sp\ear`, String.raw`\+1`, String.raw`\s\+0`, String.raw`\S+ dagger`,
    String.raw`\W\(`, String.raw`dagger\B`, '(spear|)', '(|dagger)', 'spea{,1}r',
    'x**', 'a+?', '^a - ', 'shield)$', String.raw`(.)\1`, String.raw`(o)\1d`,
    '[a-]', '[]a]x', '[^]]', '[[.space.]]dagger', '[[=a=]]', String.raw`[\d]`,
    '[[:alpha:]]+ spear', 'spe(ar)?', '()spear', '{1}a', 'a|*b', String.raw`\(`,
    'dagger{1,2}', 'x{0}spear', String.raw`\d`, '[z-a]', '(?i)SPEAR', 'SPEAR',
    '[[:word:]]', 'é|spear', '[à-ÿ]', 'a{1,2}{3}', 'b*+', '^*spear',
    '$a', 'spear|', '|spear',
];
const REGEX_BAD = [
    '(', ')', '[', ']', '{', '}', 'a{', 'a{1', 'a{1,', 'a{2,1}', '*', '+', '?',
    '\\', 'a\\', '[[:foo:]]', '[a', '(a', 'a)', '[[.foo.]]', '[[=foo=]]', '[b-a]',
    'a{99999}', 'a{1}{2}', 'a**', '((((((((((a))))))))))', String.raw`\1`, String.raw`(a)\2`,
    '', '|', '()', 'a||b', '(|)',
];
// The config parser takes the text between the quotes as it stands, without
// unescaping backslashes, so the patterns go in unchanged (none contains '"').
const enc = (s) => s;
REGEX_MATCH.forEach((pat, i) => {
    add(`re-match-${String(i).padStart(2, '0')}`, 'regex',
        `MENUCOLOR "${pat}" in nethackrc, then the inventory`, 'Weapons',
        [seg(VAL + `OPTIONS=menucolors\nMENUCOLOR="${enc(pat)}"=red&inverse\n`, `${CFG_OK}i${ESC}`)]);
});
// Bad patterns: five per recipe in nethackrc, each kind of entry once.
for (let i = 0; i < REGEX_BAD.length; i += 5) {
    const group = REGEX_BAD.slice(i, i + 5);
    const lines = group.map((pat, k) => [
        `MENUCOLOR="${enc(pat)}"=red`,
        `MSGTYPE=hide "${enc(pat)}"`,
        `AUTOPICKUP_EXCEPTION="<${enc(pat)}"`,
    ][k % 3]).join('\n');
    add(`re-bad-rc-${String(i / 5).padStart(2, '0')}`, 'regex',
        `bad patterns in nethackrc: ${JSON.stringify(group)}`, 'Dlvl',
        [seg(VAL + `OPTIONS=menucolors\n${lines}\n`, `${CFG_OK}i${ESC}`)]);
}
// The same bad patterns typed into the options menu (menu colors, message
// types and autopickup exceptions each take a regex from getlin).
const ADDERS = [
    ['menucolor', 'i', 'b\n\n'],
    ['msgtype', 'j', 'a'],
    ['ape', 'g', ''],
];
REGEX_BAD.forEach((pat, i) => {
    const [kind, key, after] = ADDERS[i % ADDERS.length];
    add(`re-bad-menu-${String(i).padStart(2, '0')}`, 'regex',
        `#optionsfull ${kind} add, pattern ${JSON.stringify(pat)}`, 'pattern',
        [seg(VAL + 'OPTIONS=menucolors\n',
            `#optionsfull\n>>>>>>${key}\na${pat}\n${after}${ESC}${ESC}${ESC}${ESC}i${ESC}`)]);
});
// Patterns a player might type into the options menu's menu-colour editor,
// and the {,n} interval family, which GNU reads as {0,n}; each is added with
// colour red and attribute bold, then the inventory is shown.
const REGEX_TYPED = ['blessed', 'uncursed', 'spear', '+1', '+0 dagger', '*dagger', '?spear',
    String.raw`\(being worn\)`, '(being worn)', '(weapon|alternate)', 'spear.*hand', '[0-9]+ ',
    'food ration$', '^an ', 'a{,2}', 'spea{,1}r', 'spe{,2}ar', 'x{,0}spear', 'spear{,}', '{,1}',
    'a{,}', 'dag{1,}er', String.raw`dagger\b`, String.raw`\.`, '.', ' \+'];
REGEX_TYPED.forEach((pat, i) => {
    add(`re-typed-${String(i).padStart(2, '0')}`, 'regex',
        `#optionsfull menu colors add ${JSON.stringify(pat)} red bold, then the inventory`, 'pattern',
        [seg(VAL + 'OPTIONS=menucolors\n',
            `#optionsfull\n>>>>>>i\na${pat}\nbb\n${ESC}${ESC}${ESC}${ESC}i${ESC}`)]);
});
// MSGTYPE semantics: hide the welcome or a look message by a pattern that
// GNU and BSD regex may read differently.
const MSG_PATTERNS = [String.raw`\w+ to NetHack`, String.raw`\bwelcome\b`, 'welcome{,2}',
    String.raw`You see no \w+`, '[[:<:]]objects', String.raw`(e)\1`, 'see (no|)objects'];
MSG_PATTERNS.forEach((pat, i) => {
    add(`re-msgtype-${i}`, 'regex', `MSGTYPE=hide "${pat}"`, 'Dlvl',
        [seg(VAL + `MSGTYPE=hide "${enc(pat)}"\n`, `${CFG_OK}:${ctrl('p')}${ctrl('p')}${ESC}`)]);
});

// ------------------------------------------------- enhanced colour parsing
// coloratt.c rgbstr_to_int32() parses 'R-G-B' with atoi() and otherwise
// calls check_enhanced_colors(), which parses '#rrggbb' with
// sscanf("#%02x%02x%02x%c"); how scanf treats a width-exhausted 0x, a sign
// or a space is libc-specific. A glyph: line (which needs a symset first)
// reaches it; this build has no palette option. The capture (patch 006)
// records only term_start_color(), not term_start_extracolor(), so an RGB
// result does not show on a recorded screen. MENUCOLOR and hilite_status colours go
// through match_str2clr() instead; those recipes probe colour-name parsing.
const RGB = ['#ff0000', '#0x0102', '#+1+2+3', '#-1-2-3', '#12345', '# 1 2 3', '#ff00ff00',
    '#0X0X0X', '#fg0000', '255-0-0', '999-0-0', '-1-2-3', '1-2'];
RGB.forEach((spec, i) => {
    const n = String(i).padStart(2, '0');
    add(`rgb-glyph-${n}`, 'enhanced-colors', `symset:plain, glyph:S_room:U+002E/${spec}`, 'Dlvl',
        [seg(VAL + `OPTIONS=symset:plain\nOPTIONS=glyph:S_room:U+002E/${spec}\n`, `${CFG_OK}s${ESC}`)]);
    add(`rgb-hilite-${n}`, 'enhanced-colors',
        `hilite_status:hitpoints/always/${spec}`, 'Dlvl',
        [seg(VAL + `OPTIONS=statushilites:10,hilite_status:hitpoints/always/${spec}\n`, `${CFG_OK}s${ESC}`)]);
    add(`rgb-menucolor-${n}`, 'enhanced-colors',
        `MENUCOLOR="spear"=${spec}`, 'Weapons',
        [seg(VAL + `OPTIONS=menucolors\nMENUCOLOR="spear"=${spec}\n`, `${CFG_OK}i${ESC}`)]);
});

// ------------------------------------------------------------------- help
'abcdefghijklmno'.split('').forEach((k) => {
    add(`help-${k}`, 'help', `? menu item ${k}, paged`, 'Select one item',
        [seg(VAL, `?${k}${' '.repeat(25)}${ESC}${ESC}`)]);
});
const SIMPLE = [
    ['version-ext', '#version\n', 'NetHack'],
    ['version-v', 'v', 'NetHack'],
    ['overview-ctrl-o', ctrl('o'), 'Dlvl'],
    ['overview-ext', '#overview\n', 'Dlvl'],
    ['attributes-ctrl-x', ctrl('x'), 'Background'],
    ['chronicle', '#chronicle\n', 'Logged events'],
    ['conduct', '#conduct\n', 'conduct'],
    ['achievements', '#achievements\n', 'Dlvl'],
    ['known', '#known\n', 'Dlvl'],
    ['vanquished', '#vanquished\n', 'Dlvl'],
    ['genocided', '#genocided\n', 'Dlvl'],
    ['history-V', 'V', 'Dlvl'],
    ['extlist', '#?\n', 'Dlvl'],
    ['herecmdmenu', '#herecmdmenu\n', 'Dlvl'],
    ['whatdoes', '&a&' + ctrl('x') + '&á', 'Dlvl'],
    ['whatis-slash', '/a', 'Dlvl'],
    ['whatis-ops', '/' + 'm', 'Dlvl'],
    ['shell-bang', '!', 'Dlvl'],
    ['shell-ext', '#shell\n', 'Dlvl'],
    ['suspend-ctrl-z', ctrl('z'), 'Dlvl'],
    ['suspend-ext', '#suspend\n', 'Dlvl'],
    ['prevmsg-ext', '#prevmsg\n', 'Dlvl'],
    ['redraw', ctrl('r'), 'Dlvl'],
    ['annotate', '#annotate\nhere\n' + ctrl('o'), 'Dlvl'],
    ['call-type', '#name\nn', 'Dlvl'],
    ['license-ext', '#license\n', 'Dlvl'],
];
for (const [name, keys, marker] of SIMPLE) {
    add(`cmd-${name}`, 'help', `command ${JSON.stringify(keys)}, paged`, marker,
        [seg(VAL, `${keys}${' '.repeat(20)}${ESC}${ESC}${ESC}`)]);
}
'abcdefgh'.split('').forEach((k) => {
    add(`terrain-${k}`, 'help', `#terrain choice ${k}`, 'Dlvl',
        [seg(VAL, `#terrain\n${k}${' '.repeat(4)}${ESC}${ESC}`)]);
});
add('discoveries', 'help', '\\ discoveries', 'Dlvl', [seg(TOU, `rk\\${' '.repeat(4)}${ESC}`)]);
'abcdefghijklmnopqrstuvwxyz*'.split('').forEach((k) => {
    add(`discoveries-class-${k === '*' ? 'all' : k}`, 'help', `\` discoveries by class ${k}`, 'Dlvl',
        [seg(TOU, `\`${k}${' '.repeat(4)}${ESC}${ESC}`)]);
});
// ^P in each msg_window mode, after messages that differ in length.
for (const mode of ['single', 'combination', 'full', 'reverse']) {
    for (const [i, before] of [`:xx:s`, `:${' '}`].entries()) {
        add(`prevmsg-${mode}-${i}`, 'help', `^P with msg_window:${mode}`, 'Dlvl',
            [seg(VAL + `OPTIONS=msg_window:${mode},msghistory:5\n`,
                `${before}${ctrl('p').repeat(6)}${ESC}${ESC}${ctrl('p')}${' '.repeat(3)}${ESC}`)]);
    }
}

// ------------------------------------------------------------- date and time
// Each date is read through patch 001's mktime(); the Tourist's Hawaiian
// shirt motif (read.c, o_id ^ ubirthday) shows the time_t, ^X shows night
// and midnight, and the start messages show the moon and Friday the 13th.
const DATES = [
    ['fri13-mar', '20260313120000'], ['fri13-nov', '20261113120000'],
    ['fullmoon', '20261124213000'], ['newmoon', '20261110120000'],
    ['midnight-summer', '20260715003000'], ['midnight-winter', '20260115000000'],
    ['night-2159', '20260715215959'], ['night-2200', '20260715220000'],
    ['dawn-0559', '20260715055959'], ['dawn-0600', '20260715060000'],
    ['halloween', '20261031210000'], ['christmas', '20261225120000'],
    ['dst-gap-0200', '20260308020000'], ['dst-gap-0230', '20260308023000'],
    ['dst-gap-0300', '20260308030000'], ['dst-gap-0159', '20260308015959'],
    ['dst-fall-0030', '20261101003000'], ['dst-fall-0130', '20261101013000'],
    ['dst-fall-0200', '20261101020000'], ['winter-noon', '20260115120000'],
    ['summer-noon', '20260715120000'], ['leapday', '20280229120000'],
    ['newyear-eve', '20261231235959'], ['y2038-before', '20380119031407'],
    ['y2038-after', '20380119031408'], ['y2099', '20991231235959'],
    ['y2100-mar', '21000301120000'], ['y2300', '23000101000000'],
    ['y9999', '99991231235959'], ['y1970', '19700101120000'],
    ['y1969', '19690720201700'], ['y1900', '19000101120000'],
    ['y1800', '18000704120000'], ['y2000-leap', '20000229000000'],
    // Between 1800, where macOS fell back to the real clock in the first
    // run of this sample, and 1900, where it did not.
    ['y1899', '18991231120000'], ['y1890', '18900615120000'], ['y1850', '18500615120000'],
    ['y1825', '18250615120000'], ['y1801', '18010101120000'], ['y1900-0000', '19000101000000'],
    ['y1901-int32min', '19011213154552'], ['y1901-after', '19011213154553'],
];
for (const [name, datetime] of DATES) {
    add(`date-${name}`, 'date', `Tourist on ${datetime}: shirt, ^X, #chronicle`, 'design',
        [seg(TOU, `rk${ctrl('x')}${' '.repeat(6)}${ESC}#chronicle\n${ESC}`, { datetime })]);
}
// The tombstone prints the year (rip.c yyyymmdd()); debug mode lets the
// hero die at once with a wished-for wand of death.
const WIZ = rc('Valkyrie', '', { debug: true });
for (const [name, datetime] of DATES.filter(([n]) => /fri13|midnight-winter|dst-gap-0230|dst-fall-0130|newyear|y2038-after|y9999|y1969|y1900|y18|winter-noon/.test(n))) {
    add(`rip-${name}`, 'date', `debug death on ${datetime}: tombstone year`, 'REST',
        [seg(WIZ, `${ctrl('w')}wand of death\nze.${' '.repeat(2)}ynnnnn${' '.repeat(6)}`, { datetime })]);
}
// Save on one date and restore on another: restore.c re-reads ubirthday
// through time_from_yyyymmddhhmmss().
const PAIRS = [
    ['summer-winter', '20260715120000', '20260115120000'],
    ['winter-summer', '20260115120000', '20260715120000'],
    ['gap-fall', '20260308023000', '20261101013000'],
    ['fall-gap', '20261101013000', '20260308023000'],
    ['y1900-y2099', '19000101120000', '20991231235959'],
];
for (const [name, d1, d2] of PAIRS) {
    add(`restore-${name}`, 'date', `Tourist saved on ${d1}, restored on ${d2}`, 'design',
        [seg(TOU, `rkSy`, { datetime: d1 }),
            seg(TOU, `rk${ctrl('x')}${' '.repeat(6)}${ESC}`, { datetime: d2 })]);
}

// --------------------------------------------------------- one-byte keys
// The judge sends one byte per key. Bytes 0x80-0xff at the command prompt
// (meta commands, unknown-command messages, and 0xff, which a signed char
// turns into EOF), in getlin text, and in menus.
for (let b = 0x80; b <= 0xff; b += 4) {
    const keys = [0, 1, 2, 3].map((k) => String.fromCharCode(b + k) + ESC + ESC).join('');
    add(`byte-cmd-${b.toString(16)}`, 'high-byte', `command keys 0x${b.toString(16)}-0x${(b + 3).toString(16)}`,
        'Dlvl', [seg(VAL, `${keys}s`)]);
}
for (const b of [0xe1, 0xe3, 0xe5, 0xf0, 0xff]) {
    add(`byte-altmeta-${b.toString(16)}`, 'high-byte', `key 0x${b.toString(16)} with altmeta`, 'Dlvl',
        [seg(VAL + 'OPTIONS=altmeta\n', `${String.fromCharCode(b)}${ESC}${ESC}${ESC}\u001ba${ESC}${ESC}s`)]);
}
const HIGH = 'éÿ\u0080 \u009bÃ©';
add('byte-getlin-engrave', 'high-byte', 'engrave text with high bytes, then read it', 'write in the dust',
    [seg(VAL, `E- ${HIGH}abc\n:${ESC}`)]);
add('byte-getlin-engrave-no-ff', 'high-byte', 'engrave text with high bytes other than 0xff, then read it',
    'write in the dust', [seg(VAL, `E- ${HIGH.replace('\u00ff', '')}abc\n:${ESC}`)]);
add('byte-getlin-extcmd', 'high-byte', '# prompt with high bytes', 'Dlvl',
    [seg(VAL, `#${HIGH}\n${ESC}s`)]);
add('byte-getlin-fruit', 'high-byte', 'fruit name with high bytes, then inventory', 'fruit',
    [seg(TOU, `#optionsfull\n>>>>>a\n${HIGH}\n${ESC}i${ESC}`)]);
add('byte-getlin-call', 'high-byte', 'call an object type with high bytes, then discoveries', 'Dlvl',
    [seg(TOU, `#name\nfh${HIGH}\n\\${ESC}`)]);
add('byte-getlin-annotate', 'high-byte', '#annotate with high bytes, then ^O', 'Dlvl',
    [seg(VAL, `#annotate\n${HIGH}\n${ctrl('o')}${ESC}`)]);
add('byte-menu', 'high-byte', 'high bytes as menu selectors in the inventory and help menus', 'Dlvl',
    [seg(VAL, `iáÿ${ESC}?á\u0080${ESC}${ESC}s`)]);
add('byte-count', 'high-byte', 'count prefix followed by a high byte', 'Dlvl',
    [seg(VAL, `12é${ESC}n12é${ESC}s`)]);
add('byte-number-pad', 'high-byte', 'high bytes with number_pad:1', 'Dlvl',
    [seg(VAL + 'OPTIONS=number_pad:1\n', `¸òé${ESC}${ESC}s`)]);
add('byte-name-nethackrc', 'high-byte', 'player name with high bytes in nethackrc', 'Dlvl',
    [seg(rc('Valkyrie').replace('name:Probe', 'name:Prébeÿ'), `${ctrl('x')}${' '.repeat(4)}${ESC}`)]);

// ------------------------------------------- reads outside an array in C
// Committed debug-mode recipes in which C reads svd.dungeons[-1] or
// gl.luathemes[-1] for a wished magic portal "to nowhere"; the port models
// those bytes from the Linux recorder's memory layout (js/dungeon_table.js,
// js/mklev.js), which the macOS build need not share.
const OOB = [
    'dog.c/portal-nowhere-jingle-monster-arrival', 'dog.c/portal-nowhere-migration-panic',
    'do.c/portal-to-nowhere-one-note-jingle', 'mklev.c/niche-depth-dungeon-minus-one',
    'mklev.c/sanity-check-portal-nowhere-unconnected-rooms',
    'music.c/improvised-notes-stale-byte-portal-depth',
    'teleport.c/pet-enters-wished-portal-one-note-jingle', 'trap.c/portal-nowhere-hero-escape',
    'trap.c/portal-nowhere-hero-jingle-overview', 'makemon.c/random-monster-in-dungeon-minus-one',
];
for (const rel of OOB) {
    const src = JSON.parse(fs.readFileSync(path.join(HERE, '../../../recipes', `${rel}.session.json`), 'utf8'));
    // Copied as they are, without the leading ESC that seg() adds.
    add(`oob-${path.basename(rel)}`, 'out-of-bounds', `copy of recipes/${rel}`, 'Dlvl',
        src.segments.map(({ seed, datetime, nethackrc, moves }) => ({ seed, datetime, nethackrc, moves })));
}

// ------------------------------------------------------------- write files
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const trimsPath = path.join(HERE, 'trims.json');
const trims = fs.existsSync(trimsPath) ? JSON.parse(fs.readFileSync(trimsPath, 'utf8')) : {};
const lines = [];
for (const r of recipes) {
    const segments = r.segments.map((s) => ({ ...s }));
    const trim = trims[r.id] ?? 0;
    if (trim) {
        const last = segments[segments.length - 1];
        last.moves = Array.from(last.moves).slice(0, -trim).join('');
    }
    fs.writeFileSync(path.join(OUT, `${r.id}.session.json`),
        `${JSON.stringify({ version: 5, segments }, null, 2)}\n`);
    lines.push(JSON.stringify({ id: r.id, group: r.group, probe: r.probe, marker: r.marker,
        segments: segments.length, ...(trim ? { trimmed: trim } : {}) }));
}
fs.writeFileSync(path.join(HERE, 'sample2.jsonl'), `${lines.join('\n')}\n`);
const byGroup = {};
for (const r of recipes) byGroup[r.group] = (byGroup[r.group] ?? 0) + 1;
console.log(`wrote ${recipes.length} recipes`, byGroup);
