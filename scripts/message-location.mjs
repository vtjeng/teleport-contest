#!/usr/bin/env node

// Checks that each message the port prints carries a map location exactly
// where C's carries one.
//
// C's pline.c prints every message through vpline(). pline_mon(), pline_xy()
// and pline_dir() call set_msg_xy() first, and a caller can call set_msg_xy()
// itself before pline(), You() and the rest of the family. When the
// accessiblemsg option is on, vpline() prefixes a message that has a location
// with it, as in "(east): The monkey tries to run away with your cloak.";
// every other message has no prefix. The port gives a message its location
// with js/pline.js pline_mon(), consume_msg_xy() after set_msg_xy(), or
// js/startup_a11y.js messageAt(), and each JS message site chooses one by
// hand. This check pairs each C message site with its JS site and reports a
// pair whose choices differ.
//
// C side: the preprocessed sources (scripts/c-message-coverage.mjs) give
// each call to a pline.c function, the function that contains it, and its
// format argument's text. A call records a location when it is
// pline_mon() of a monster other than gy.youmonst, pline_xy() or pline_dir(),
// or when it is the first message call after a set_msg_xy() or
// set_msg_dir() in the same function, with no return, break, goto or
// continue between them other than as the body of an if or else. A message
// call in another branch of the same if, else or switch statement as that
// first one records it too, because only one of the branches runs.
//
// The text of a format, or of a %s argument, is a literal; a string
// constant, as trap.c's A_gush_of_water_hits, cmd.c's unavailcmd[] or
// decl.c's c_common_strings members (stringConstants(), structConstants());
// or, for a local variable, each text the function assigns it, including
// with strcpy() or sprintf() (localTexts()), as mcastu.c's `fmt`.
//
// JS side: each string expression in a JS function that corresponds to the
// C function: by name, as AGENTS.md requires; by a helper named for part of
// it, such as mon_break_armor_effects() for mon_break_armor(); or by a
// "file.c function()" reference in a comment before or inside it. A
// reference to a string constant the module declares at its top level or
// imports, as js/const.js nothing_happens, is a string expression too. The
// expression pairs with a C site when its fixed text matches the C format
// from end to end, where a conversion matches any text and the port may add
// pline.c's "You " or "The " itself. A %s whose argument has a known text
// also matches that text, so "%s %s!" with "wails" or "cries" pairs with
// `${name} wails!`.
//
// A format with fewer than MIN_LETTERS letters outside its conversions, as
// thrwmu()'s "%s %s %s.", matches too much text to pair this way. It pairs
// "by form" instead with the strings of its function that match it and that
// no longer format matched; a format with no fixed text other than spaces,
// as "%s", is not paired.
//
// The expression records a location when it reaches the text argument of a
// location sink (SINKS, MEMBER_SINKS, or any JS function that passes one of
// its parameters on to a sink) through conditionals, '+', template
// literals, local variables, .replace(), or a function's return value. A
// called name resolves to the function its scope declares or the module it
// is imported from.
//
// A pair disagrees when no JS expression for a C site makes C's choice, or
// when a JS expression that a format matched by text makes a choice that
// none of its C sites makes. A string that only formats paired by form
// match may be no message at all, such as a format passed to
// mon_reflects(), so the second rule does not apply to it. Every C site the
// method cannot pair is counted by the reason it was not paired.
//
//   node scripts/message-location.mjs           print disagreements and counts
//   node scripts/message-location.mjs --json    print every C site as JSON

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as acorn from 'acorn';

import {
    FUNCTION_NODES,
    PRINTF_CONVERSION,
    children,
    declarationsByFunction,
    decodeCString,
    matchingClose,
    messageKind,
    textAlternatives,
    tokenizeMessageSources,
} from './c-message-coverage.mjs';
import { PROJECT_ROOT, findCompiler } from './recorder-headers.mjs';

const JS_DIR = join(PROJECT_ROOT, 'js');
// The scorer replaces these files with its own copies; they hold no messages.
const FROZEN_JS = new Set(['isaac64.js', 'terminal.js', 'storage.js']);

// The pline.c message functions, each with the index of its format argument.
export const FORMAT_ARGUMENT = Object.freeze({
    pline: 0, pline_The: 0, urgent_pline: 0, Norep: 0, verbalize: 0,
    You: 0, Your: 0, You_feel: 0, You_cant: 0, You_hear: 0, You_see: 0, There: 0,
    custompline: 1, pline_mon: 1, pline_dir: 1, pline_xy: 2,
});
// The words pline.c puts before the format. A port may write them into the
// same string or leave them to js/pline.js youFeel(), youHear() or youSee().
const PREFIX = Object.freeze({
    You: 'You ', Your: 'Your ', pline_The: 'The ', There: 'There ',
    You_cant: 'You can\'t ', You_feel: 'You feel ', You_hear: 'You hear ',
    You_see: 'You see ',
});
const LOCATING_CALLS = new Set(['pline_mon', 'pline_xy', 'pline_dir']);
const SET_LOCATION = new Set(['set_msg_xy', 'set_msg_dir']);
const JUMPS = new Set(['return', 'break', 'goto', 'continue']);

// The JS functions that give a message its location, with the index of the
// text argument. A function that passes a parameter on to one of these is a
// sink for that parameter too.
export const SINKS = Object.freeze({ messageAt: 0, pline_mon: 1, consume_msg_xy: 0 });
// Injected operations that print with a location, by the file that calls
// them and the property name. js/detect.js passes each search message to
// env.message(text, x, y, env), whose default, defaultSearchMessage(),
// prints messageAt(text, x, y).
export const MEMBER_SINKS = Object.freeze({ 'detect.js': Object.freeze({ message: 0 }) });
// String methods whose result holds the text they are called on.
const STRING_METHODS = new Set(['replace', 'replaceAll']);

// A format must hold this many letters outside its conversions to be
// paired; "%s." or "%s %s!" matches too much of a function's text.
export const MIN_LETTERS = 5;

// ---------------------------------------------------------------- C side

const isPunct = (token, value) => token?.type === 'punct' && token.value === value;
const isIdent = (token, value) => token?.type === 'ident' && token.value === value;

// The top-level comma-separated arguments of the call whose '(' is at open.
function callArguments(tokens, open, close) {
    const args = [];
    let start = open + 1;
    let depth = 0;
    for (let j = open + 1; j < close; j++) {
        const t = tokens[j];
        if (t.type !== 'punct') continue;
        if ('([{'.includes(t.value)) depth++;
        else if (')]}'.includes(t.value)) depth--;
        else if (t.value === ',' && depth === 0) {
            args.push([start, j]);
            start = j + 1;
        }
    }
    if (start < close) args.push([start, close]);
    return args;
}

// The string constants of one preprocessed file: each declarator of a
// declaration that says const and initializes it with literals, as trap.c's
// `static const char *const A_gush_of_water_hits = "A gush of water hits";`
// or apply.c's `static const char whistle_str[] = "...", alt_whistle_str[]
// = "...";`. `file` holds those outside functions, by name, and `shared` the
// ones among them other files can see, which do not say static. Inside a
// function only an array or a const pointer counts, since nothing can point
// it at other text, as polyself.c's `static const char use_thec[] = "...";`;
// `local` holds those by the index of their function's opening brace. A name
// declared twice in one scope with different text is left out.
export function stringConstants(tokens) {
    const file = new Map();
    const shared = new Map();
    const local = new Map();
    const add = (map, name, text) => map.set(name, map.has(name) && map.get(name) !== text ? null : text);
    let depth = 0;
    let functionStart = 0;
    let isConst = false;
    let isStatic = false;
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (isPunct(t, '{') && depth++ === 0) functionStart = i;
        else if (isPunct(t, '}')) depth = Math.max(0, depth - 1);
        if (isPunct(t, ';') || isPunct(t, '{') || isPunct(t, '}')) {
            isConst = isStatic = false;
            continue;
        }
        if (isIdent(t, 'static')) isStatic = true;
        if (isIdent(t, 'const') && !isPunct(tokens[i - 1], '*')) { isConst = true; continue; }
        if (!isConst || t.type !== 'ident') continue;
        let j = i + 1;
        const array = isPunct(tokens[j], '[') && isPunct(tokens[j + 1], ']');
        if (array) j += 2;
        if (!isPunct(tokens[j], '=') || tokens[j + 1]?.type !== 'string') continue;
        if (depth > 0 && !array && !(isIdent(tokens[i - 1], 'const') && isPunct(tokens[i - 2], '*'))) continue;
        let text = '';
        for (j++; tokens[j]?.type === 'string'; j++) text += decodeCString(tokens[j].value);
        if (!isPunct(tokens[j], ',') && !isPunct(tokens[j], ';')) continue;
        if (depth > 0) {
            if (!local.has(functionStart)) local.set(functionStart, new Map());
            add(local.get(functionStart), t.value, text);
        } else {
            add(file, t.value, text);
            if (!isStatic) add(shared, t.value, text);
        }
        i = j - 1;
    }
    for (const map of [file, shared, ...local.values()])
        for (const [name, text] of map) if (text === null) map.delete(name);
    return { file, shared, local };
}

// The string members of each const struct a preprocessed file initializes,
// by "variable.member": decl.c's `const struct c_common_strings
// c_common_strings = { "Nothing happens.", ... }`, which decl.h names
// nothing_happens and the rest, gives "c_common_strings.c_nothing_happens".
// The members are named in the order the struct declares them.
export function structConstants(tokens) {
    const members = new Map(); // struct tag -> member names in order
    const constants = new Map();
    let depth = 0;
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (isPunct(t, '{')) depth++;
        else if (isPunct(t, '}')) depth = Math.max(0, depth - 1);
        if (depth !== 0 || !isIdent(t, 'struct') || tokens[i + 1]?.type !== 'ident') continue;
        const tag = tokens[i + 1].value;
        if (isPunct(tokens[i + 2], '{')) {
            const close = matchingClose(tokens, i + 2, '{', '}');
            const names = [];
            for (let j = i + 3, d = 0; j < close; j++) {
                if (isPunct(tokens[j], '{')) d++;
                else if (isPunct(tokens[j], '}')) d--;
                else if (d === 0 && tokens[j].type === 'ident'
                    && ['[', ',', ';'].some((v) => isPunct(tokens[j + 1], v))) names.push(tokens[j].value);
            }
            members.set(tag, names);
            continue;
        }
        const variable = tokens[i + 2];
        if (!isIdent(tokens[i - 1], 'const') || variable?.type !== 'ident'
            || !isPunct(tokens[i + 3], '=') || !isPunct(tokens[i + 4], '{') || !members.has(tag)) continue;
        const close = matchingClose(tokens, i + 4, '{', '}');
        const args = callArguments(tokens, i + 4, close);
        args.forEach(([a, b], k) => {
            const run = tokens.slice(a, b);
            const name = members.get(tag)[k];
            if (name && run.length > 0 && run.every((r) => r.type === 'string'))
                constants.set(`${variable.value}.${name}`, run.map((r) => decodeCString(r.value)).join(''));
        });
    }
    return constants;
}

// The text at token j and the number of tokens it spans: a literal; an
// identifier that names a string constant and is not called, indexed or
// dereferenced; or a struct constant's member, as `c_common_strings .
// c_nothing_happens`. Null for any other token.
function literalText(tokens, j, sourceFile, constants) {
    const t = tokens[j];
    if (t.type === 'string') return t.value === sourceFile ? null : [decodeCString(t.value), 1];
    if (t.type !== 'ident') return null;
    const before = tokens[j - 1];
    if (isPunct(before, '.') || (isPunct(before, '>') && isPunct(tokens[j - 2], '-'))) return null;
    const next = tokens[j + 1];
    if (isPunct(next, '.') && tokens[j + 2]?.type === 'ident') {
        const member = `${t.value}.${tokens[j + 2].value}`;
        return constants.has(member) && !isPunct(tokens[j + 3], '[') ? [constants.get(member), 3] : null;
    }
    if (!constants.has(t.value) || isPunct(next, '(') || isPunct(next, '[')
        || (isPunct(next, '-') && isPunct(tokens[j + 2], '>'))) return null;
    return [constants.get(t.value), 1];
}

// The format strings an argument can be: each run of adjacent literals
// outside nested parentheses, so a ternary between literals gives both.
function formatLiterals(tokens, [start, end], sourceFile, constants) {
    const literals = [];
    let run = null;
    let depth = 0;
    for (let j = start; j < end; j++) {
        const t = tokens[j];
        if (t.type === 'punct' && t.value === '(') depth++;
        if (t.type === 'punct' && t.value === ')') depth--;
        const literal = depth === 0 ? literalText(tokens, j, sourceFile, constants) : null;
        if (literal !== null) {
            run = run === null ? literal[0] : run + literal[0];
            j += literal[1] - 1;
        } else if (run !== null) {
            literals.push(run);
            run = null;
        }
    }
    if (run !== null) literals.push(run);
    return literals;
}

// The strings an argument can be when it is a literal or a conditional
// between literals, as `cond ? "a" : "b"`; null for any other argument and
// for a branch that is not a literal.
//
// A branch that is a single local variable stands for the texts the
// function assigns it (see localTexts()); a text built by sprintf() is an
// object { format }, whose conversions stay conversions.
function argumentStrings(tokens, [start, end], sourceFile, constants, locals = null) {
    const branches = [];
    let from = start;
    let depth = 0;
    for (let j = start; j < end; j++) {
        const t = tokens[j];
        if (t.type !== 'punct') continue;
        if ('([{'.includes(t.value)) depth++;
        else if (')]}'.includes(t.value)) depth--;
        else if ((t.value === '?' || t.value === ':') && depth === 0) {
            if (t.value === ':') branches.push([from, j]);
            from = j + 1;
        }
    }
    branches.push([from, end]);
    const strings = branches.flatMap(([a, b]) => {
        if (a >= b) return [null];
        if (locals && b === a + 1 && tokens[a].type === 'ident') {
            const assigned = locals(tokens[a].value);
            if (assigned.length > 0) return assigned;
        }
        let text = '';
        for (let j = a; j < b; j++) {
            const literal = literalText(tokens, j, sourceFile, constants);
            if (literal === null) return [null];
            text += literal[0];
            j += literal[1] - 1;
        }
        return [text];
    });
    return strings.some((text) => text !== null) ? strings : null;
}

// The texts one function assigns a local variable between `from` and `to`:
// each `name = <literals>`, strcpy(name, <literals>) and sprintf(name,
// <format>, ...), the last as an object { format } with its literal
// arguments substituted. Other writes, such as strcat(), are not followed,
// so a text found this way may be only part of what the variable holds;
// patterns match a text from end to end, so such a text pairs with nothing.
function localTexts(tokens, from, to, name, sourceFile, constants) {
    const texts = [];
    for (let j = from; j < to; j++) {
        const t = tokens[j];
        if (!isIdent(t, name)) continue;
        const before = tokens[j - 1];
        if (isPunct(before, '.') || isPunct(before, '>')) continue;
        if (isPunct(tokens[j + 1], '=') && !isPunct(tokens[j + 2], '=')
            && !(before?.type === 'punct' && '=!<>'.includes(before.value))) {
            let end = j + 2;
            for (let depth = 0; end < to; end++) {
                const e = tokens[end];
                if (e.type !== 'punct') continue;
                if ('([{'.includes(e.value)) depth++;
                else if (')]}'.includes(e.value)) depth--;
                if (depth < 0 || (depth === 0 && (e.value === ';' || e.value === ','))) break;
            }
            const strings = argumentStrings(tokens, [j + 2, end], sourceFile, constants);
            for (const text of strings ?? []) if (text !== null) texts.push(text);
            continue;
        }
        const call = tokens[j - 2];
        if (!isPunct(before, '(') || !isPunct(tokens[j + 1], ',') || call?.type !== 'ident') continue;
        const close = matchingClose(tokens, j - 1, '(', ')');
        const args = callArguments(tokens, j - 1, close);
        if (call.value === 'strcpy' && args.length === 2) {
            const strings = argumentStrings(tokens, args[1], sourceFile, constants);
            for (const text of strings ?? []) if (text !== null) texts.push(text);
        } else if (call.value === 'sprintf' && args.length >= 2) {
            for (const format of formatLiterals(tokens, args[1], sourceFile, constants)) {
                for (const text of substituteArguments(format, args.slice(2)
                    .map((arg) => argumentStrings(tokens, arg, sourceFile, constants))))
                    texts.push({ format: text });
            }
        }
    }
    return texts;
}

// A format with each %s whose argument is a literal, or a conditional
// between literals, replaced by that text: one result for each way the
// conditionals go, up to MAX_TEXTS, after which the format stands alone.
// "%s %s!" with arguments Monnam(mon) and (dmg > 2) ? "wails" : "cries"
// gives "%s wails!" and "%s cries!". A branch that is not a literal keeps
// its %s.
const MAX_TEXTS = 16;
export function substituteArguments(format, argumentTexts) {
    let results = [''];
    let argument = 0;
    let last = 0;
    for (const m of format.matchAll(PRINTF_CONVERSION)) {
        const literal = format.slice(last, m.index);
        results = results.map((r) => r + literal);
        last = m.index + m[0].length;
        if (m[0] === '%%') { results = results.map((r) => `${r}%%`); continue; }
        argument += (m[0].match(/\*/gu) ?? []).length; // a * width or precision
        const texts = m[0].endsWith('s') ? argumentTexts[argument] : null;
        argument++;
        if (!texts) { results = results.map((r) => r + m[0]); continue; }
        const escaped = texts.map((text) => (text === null ? m[0]
            : typeof text === 'object' ? text.format : text.replaceAll('%', '%%')));
        results = results.flatMap((r) => escaped.map((text) => r + text));
        if (results.length > MAX_TEXTS) return [format];
    }
    const texts = results.map((r) => r + format.slice(last));
    return texts.includes(format) ? texts : [format, ...texts];
}

// Whether a return, break, goto or continue that is not the whole body of
// an if or else lies between two tokens, so that control cannot pass from
// one to the other.
function unconditionalJump(tokens, from, to) {
    for (let j = from; j < to; j++) {
        if (tokens[j].type !== 'ident' || !JUMPS.has(tokens[j].value)) continue;
        const before = tokens[j - 1];
        if (!isPunct(before, ')') && !isIdent(before, 'else')) return true;
    }
    return false;
}

// Whether the tokens between two message calls of one function only lead
// from one branch of an if, else or switch statement to another.
function otherBranch(tokens, from, to) {
    let branch = false;
    for (let j = from; j < to; j++) {
        const t = tokens[j];
        if (t.type === 'ident' && ['else', 'case', 'default'].includes(t.value)) branch = true;
        if (isIdent(t, 'break') && isPunct(tokens[j + 1], ';')) { j++; continue; }
        if (t.type === 'ident' && JUMPS.has(t.value)) return false;
        if (isPunct(t, ';')) return false;
    }
    return branch;
}

// Every pline.c message call in one preprocessed file, with whether it
// records a location. Only calls in `sourceFile` itself count.
//
// `shared` holds string constants other files define, such as
// structConstants() of decl.c.
export function extractCSites(tokens, sourceFile, shared = new Map()) {
    const declared = stringConstants(tokens);
    const fileConstants = new Map([...shared, ...declared.file]);
    const sites = [];
    let depth = 0;
    let currentFunction = null;
    let functionStart = 0;
    let pending = null; // index after a set_msg_xy() call not yet consumed
    let consumed = null; // the call that consumed it, for its other branches
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (isPunct(t, '{')) {
            if (depth === 0) {
                const prev = tokens[i - 1];
                currentFunction = null;
                functionStart = i;
                if (isPunct(prev, ')')) {
                    let open = i - 1;
                    for (let d = 0; open >= 0; open--) {
                        if (isPunct(tokens[open], ')')) d++;
                        else if (isPunct(tokens[open], '(') && --d === 0) break;
                    }
                    if (tokens[open - 1]?.type === 'ident') currentFunction = tokens[open - 1].value;
                }
                pending = consumed = null;
            }
            depth++;
            continue;
        }
        if (isPunct(t, '}')) {
            depth = Math.max(0, depth - 1);
            if (depth === 0) currentFunction = pending = consumed = null;
            continue;
        }
        if (depth === 0 || t.type !== 'ident' || !isPunct(tokens[i + 1], '(')) continue;
        if (SET_LOCATION.has(t.value)) {
            const close = matchingClose(tokens, i + 1, '(', ')');
            const args = tokens.slice(i + 2, close).map((a) => a.value).join(' ');
            // set_msg_xy(0, 0) cancels a location no message used.
            pending = args === '0 , 0' ? null : close;
            consumed = null;
            i = close;
            continue;
        }
        if (!(t.value in FORMAT_ARGUMENT)) continue;
        const close = matchingClose(tokens, i + 1, '(', ')');
        const args = callArguments(tokens, i + 1, close);
        let located = false;
        if (LOCATING_CALLS.has(t.value)) {
            const first = args[0] ? tokens.slice(...args[0]).map((a) => a.value).join('') : '';
            located = !(t.value === 'pline_mon' && /^&(?:gy\.)?youmonst$/u.test(first));
            pending = consumed = null;
        } else if (pending !== null) {
            located = !unconditionalJump(tokens, pending, i);
            pending = null;
            consumed = located ? close : null;
        } else if (consumed !== null) {
            // The call's own ';' follows `consumed`.
            located = otherBranch(tokens, consumed + 2, i);
            consumed = located ? close : null;
        }
        if (t.file === sourceFile) {
            const debugTrace = tokens.slice(Math.max(0, i - 6), i)
                .some((b) => isIdent(b, 'save_plnmsg'));
            const formatIndex = FORMAT_ARGUMENT[t.value];
            const formatArg = args[formatIndex];
            const constants = new Map([...fileConstants, ...(declared.local.get(functionStart) ?? [])]);
            const locals = (name) => localTexts(tokens, functionStart, i, name, sourceFile, constants);
            // A format held in a local variable, as mcastu.c's `fmt`, is
            // each text the function assigns it.
            let formats = formatArg && formatArg[1] === formatArg[0] + 1
                && tokens[formatArg[0]].type === 'ident'
                ? [...new Set(locals(tokens[formatArg[0]].value)
                    .map((text) => (typeof text === 'object' ? text.format : text)))]
                : [];
            if (formats.length === 0 && formatArg)
                formats = formatLiterals(tokens, formatArg, sourceFile, constants);
            sites.push({
                file: sourceFile,
                function: currentFunction,
                line: t.line,
                callee: t.value,
                kind: messageKind(t.value, debugTrace),
                located,
                formats,
                texts: formats.flatMap((format) => substituteArguments(
                    format, args.slice(formatIndex + 1)
                    .map((arg) => argumentStrings(tokens, arg, sourceFile, constants, locals)))),
            });
        }
        // Calls in the arguments, such as a nested pline(), run first in C;
        // none of them prints, so skip past the whole call.
        i = close;
    }
    return sites;
}

// The texts a JS string may hold for one C site, as anchored patterns: the
// format, and the format inside the words pline.c adds, each only if it
// holds MIN_LETTERS letters outside its conversions. A conversion matches
// any text, so the port may inline an argument C passes as %s; the port may
// also build a prefix in a separate hole (a NUL in the JS text).
//
// With `short` set, the patterns are instead those of the texts that hold
// fewer than MIN_LETTERS letters but some fixed text other than spaces, as
// "%s %s %s." or "%s eats %s!".
export function sitePatterns(site, short = false) {
    const patterns = [];
    for (const format of site.texts ?? site.formats) {
        const texts = [format];
        if (PREFIX[site.callee]) texts.push(PREFIX[site.callee] + format);
        if (site.callee === 'verbalize') texts.push(`"${format}"`);
        for (const text of texts) {
            let body = '';
            let fixed = '';
            let last = 0;
            for (const m of text.matchAll(PRINTF_CONVERSION)) {
                const literal = text.slice(last, m.index);
                fixed += literal;
                body += escapeRegExp(literal) + (m[0] === '%%' ? '%' : '[^]*?');
                last = m.index + m[0].length;
            }
            const tail = text.slice(last);
            fixed += tail;
            body += escapeRegExp(tail);
            const letters = (fixed.match(/[A-Za-z]/gu) ?? []).length;
            if (short ? letters < MIN_LETTERS && /\S/u.test(fixed) : letters >= MIN_LETTERS)
                patterns.push(new RegExp(`^(?:[^]*\\0)?${body}(?:\\0[^]*)?$`, 'u'));
        }
    }
    return patterns;
}

function escapeRegExp(text) {
    return text.replace(/[\\^$.*+?()[\]{}|/]/gu, '\\$&');
}

// ---------------------------------------------------------------- JS side

const C_REFERENCE = /\b([A-Za-z0-9_]+\.c)\s+([A-Za-z_][A-Za-z0-9_]*)\(\)/gu;

function calleeName(callee) {
    if (callee.type === 'Identifier') return callee.name;
    if (callee.type === 'MemberExpression' && !callee.computed) return callee.property.name;
    return null;
}

function functionName(node, parent) {
    if (node.id?.name) return node.id.name;
    if (parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier') return parent.id.name;
    if ((parent?.type === 'Property' || parent?.type === 'MethodDefinition')
        && parent.key.type === 'Identifier') return parent.key.name;
    return null;
}

// One parsed JS file: its AST with parent links, its functions with the C
// functions they correspond to, and its string expressions.
//
// `imported(name)` gives the string initializer of a constant the file
// imports, as js/const.js nothing_happens; a reference to such a constant,
// or to one the file declares at its top level, is a string expression too.
function parseJs(file, source, cFunctions, { ast, comments }, imported) {
    const parents = new Map();
    const functions = [];
    const strings = [];
    const scopes = declarationsByFunction(ast);
    const cFile = file.replace(/\.js$/u, '.c');
    const references = (text) => [...text.matchAll(C_REFERENCE)].map((m) => `${m[1]}\0${m[2]}`);
    // The contiguous comment block that ends where `start` begins.
    const leadingComments = (start) => {
        const found = [];
        let end = start;
        for (let k = comments.length - 1; k >= 0; k--) {
            const c = comments[k];
            if (c.end > end) continue;
            if (source.slice(c.end, end).trim() !== '') break;
            found.push(c.value);
            end = c.start;
        }
        return found.join('\n');
    };
    const statementStart = (node) => {
        let start = node.start;
        for (let p = parents.get(node); p; p = parents.get(p)) {
            if (p.type === 'Program' || p.type === 'BlockStatement' || p.type === 'ClassBody') break;
            start = p.start;
        }
        return start;
    };
    // A piece of a larger string expression is one of its alternatives, not
    // a message of its own.
    const insideString = (node) => {
        for (let p = parents.get(node); p; node = p, p = parents.get(p)) {
            if (p.type === 'TemplateLiteral' || (p.type === 'BinaryExpression' && p.operator === '+'))
                return true;
            if (!((p.type === 'ConditionalExpression' && p.test !== node)
                || p.type === 'LogicalExpression')) return false;
        }
        return false;
    };
    const visit = (node, parent, stack) => {
        parents.set(node, parent);
        if (FUNCTION_NODES.has(node.type)) {
            const name = functionName(node, parent);
            const keys = new Set();
            // A helper named for part of a C function, such as
            // mon_break_armor_effects(), stands for that function.
            let cName = name;
            while (cName && !cFunctions.has(cName))
                cName = cName.includes('_') ? cName.slice(0, cName.lastIndexOf('_')) : null;
            if (cName) {
                const files = cFunctions.get(cName);
                for (const f of files.has(cFile) ? [cFile] : files) keys.add(`${f}\0${cName}`);
            }
            const inner = comments.filter((c) => c.start >= node.start && c.end <= node.end)
                .map((c) => c.value).join('\n');
            for (const key of references(`${leadingComments(statementStart(node))}\n${inner}`)) keys.add(key);
            const entry = { node, name, keys };
            functions.push(entry);
            stack = [...stack, entry];
        }
        const isChain = node.type === 'BinaryExpression' && node.operator === '+';
        const lookup = (name) => {
            for (let k = stack.length - 1; k >= 0; k--) {
                const names = scopes.get(stack[k].node);
                if (names.has(name)) return names.get(name);
            }
            const top = scopes.get(ast);
            return top.has(name) ? top.get(name) : imported(name);
        };
        const moduleConstant = node.type === 'Identifier' && isValueReference(node, parent)
            && !stack.some((entry) => scopes.get(entry.node).has(node.name)) && lookup(node.name) !== null;
        if ((isChain || node.type === 'TemplateLiteral' || moduleConstant
            || (node.type === 'Literal' && typeof node.value === 'string'))
            && !insideString(node)) {
            const keys = new Set(stack.flatMap((entry) => [...entry.keys]));
            if (keys.size > 0) {
                const texts = textAlternatives(node, lookup).map((runs) => runs.join('\0'));
                strings.push({ file, node, keys, texts, line: lineOf(source, node.start) });
            }
        }
        for (const child of children(node)) visit(child, node, stack);
    };
    visit(ast, null, []);
    return { file, ast, parents, functions, strings };
}

function lineOf(source, offset) {
    let line = 1;
    for (let k = source.indexOf('\n'); k !== -1 && k < offset; k = source.indexOf('\n', k + 1)) line++;
    return line;
}

// Decides, for a JS expression, whether its value reaches a sink's text
// argument. A called name resolves to the function its scope declares, or
// to the top-level function of that name in the module it is imported from.
function locationAnalysis(parsed) {
    const parents = new Map();
    const programs = new Map(); // file -> Program node
    const files = new Map(); // Program node -> file
    const imports = new Map(); // Program -> local name -> { file, name }
    const declared = new Map(); // scope node -> name -> function node or null
    for (const p of parsed) {
        for (const [node, parent] of p.parents) parents.set(node, parent);
        programs.set(p.file, p.ast);
        files.set(p.ast, p.file);
        const named = new Map();
        for (const statement of p.ast.body) {
            if (statement.type !== 'ImportDeclaration') continue;
            const from = statement.source.value.replace(/^\.\//u, '');
            for (const spec of statement.specifiers) {
                if (spec.type === 'ImportSpecifier')
                    named.set(spec.local.name, { file: from, name: spec.imported.name });
            }
        }
        imports.set(p.ast, named);
    }
    const scopeOf = (node) => {
        for (let p = parents.get(node); p; p = parents.get(p))
            if (FUNCTION_NODES.has(p.type) || p.type === 'Program') return p;
        return null;
    };
    for (const node of parents.keys()) {
        let name = null;
        let fn = null;
        if (node.type === 'FunctionDeclaration' && node.id) {
            name = node.id.name;
            fn = node;
        } else if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') {
            name = node.id.name;
            fn = node.init && FUNCTION_NODES.has(node.init.type) ? node.init : null;
        } else {
            continue;
        }
        const scope = scopeOf(node);
        if (!declared.has(scope)) declared.set(scope, new Map());
        const names = declared.get(scope);
        names.set(name, names.has(name) && names.get(name) !== fn ? null : fn);
    }
    const topLevel = (file, name, seen = new Set()) => {
        const program = programs.get(file);
        if (!program || seen.has(`${file}\0${name}`)) return null;
        seen.add(`${file}\0${name}`);
        const fn = declared.get(program)?.get(name);
        if (fn) return fn;
        const imported = imports.get(program).get(name);
        return imported ? topLevel(imported.file, imported.name, seen) : null;
    };
    const resolve = (call) => {
        if (call.callee.type !== 'Identifier') return null;
        const name = call.callee.name;
        for (let scope = scopeOf(call); scope; scope = scopeOf(scope)) {
            const names = declared.get(scope);
            if (names?.has(name)) return names.get(name);
            if (scope.type === 'Program') {
                const imported = imports.get(scope).get(name);
                return imported ? topLevel(imported.file, imported.name) : null;
            }
        }
        return null;
    };
    const callsByFunction = new Map();
    for (const node of parents.keys()) {
        if (node.type !== 'CallExpression') continue;
        const fn = resolve(node);
        if (!fn) continue;
        if (!callsByFunction.has(fn)) callsByFunction.set(fn, []);
        callsByFunction.get(fn).push(node);
    }
    const identifiers = new Map(); // scope node -> name -> Identifier nodes
    const identifiersIn = (scope, name) => {
        if (!identifiers.has(scope)) {
            const names = new Map();
            const walk = (node) => {
                if (node.type === 'Identifier') {
                    if (!names.has(node.name)) names.set(node.name, []);
                    names.get(node.name).push(node);
                }
                for (const child of children(node)) walk(child);
            };
            walk(scope);
            identifiers.set(scope, names);
        }
        return identifiers.get(scope).get(name) ?? [];
    };
    // flow() follows a value up to where it ends: at a sink's text argument
    // (`sink`) or at its function's return value (`ret`). A parameter that
    // reaches a return continues from each call site separately, so
    // youFeel(line) returns a located line only where its caller locates it.
    const memo = new Map();
    const NONE = Object.freeze({ sink: false, ret: false });
    // Keyed by an AST node and a name, since offsets repeat across files.
    const memoized = (node, name, compute) => {
        if (!memo.has(node)) memo.set(node, new Map());
        const values = memo.get(node);
        if (values.has(name)) return values.get(name);
        values.set(name, NONE); // a cycle reaches nothing new
        const value = compute();
        values.set(name, value);
        return value;
    };
    const either = (flows) => ({
        sink: flows.some((f) => f.sink),
        ret: flows.some((f) => f.ret),
    });
    const isReference = (id) => {
        const p = parents.get(id);
        if (p.type === 'MemberExpression' && p.property === id && !p.computed) return false;
        if (p.type === 'Property' && p.key === id && !p.shorthand) return false;
        if (p.type === 'VariableDeclarator' && p.id === id) return false;
        if (FUNCTION_NODES.has(p.type) && p.params.includes(id)) return false;
        return true;
    };
    const variableFlow = (scope, name) => memoized(scope, `var ${name}`,
        () => either(identifiersIn(scope, name).filter(isReference).map((id) => flow(id))));
    const parameterFlow = (fn, index) => memoized(fn, `param ${index}`, () => {
        const param = fn.params[index];
        const id = param?.type === 'AssignmentPattern' ? param.left : param;
        return id?.type === 'Identifier' ? variableFlow(fn, id.name) : NONE;
    });
    function flow(start) {
        return memoized(start, 'flow', () => {
            let node = start;
            for (;;) {
                const p = parents.get(node);
                if (!p) return NONE;
                switch (p.type) {
                case 'ConditionalExpression':
                    if (p.test === node) return NONE;
                    node = p;
                    continue;
                case 'LogicalExpression':
                case 'TemplateLiteral':
                case 'ParenthesizedExpression':
                case 'AwaitExpression':
                    node = p;
                    continue;
                case 'BinaryExpression':
                    if (p.operator !== '+') return NONE;
                    node = p;
                    continue;
                case 'MemberExpression': {
                    // text.replace('%s', name) holds the text, as a C
                    // format with its argument.
                    const call = parents.get(p);
                    if (p.object !== node || p.computed || !STRING_METHODS.has(p.property.name)
                        || call?.type !== 'CallExpression' || call.callee !== p) return NONE;
                    node = call;
                    continue;
                }
                case 'SequenceExpression':
                    if (p.expressions.at(-1) !== node) return NONE;
                    node = p;
                    continue;
                case 'CallExpression': {
                    const index = p.arguments.indexOf(node);
                    const name = index < 0 ? null : calleeName(p.callee);
                    if (name === null) return NONE;
                    if (name in SINKS) return SINKS[name] === index ? { sink: true, ret: false } : NONE;
                    if (p.callee.type === 'MemberExpression') {
                        let program = p;
                        while (program.type !== 'Program') program = scopeOf(program);
                        const member = MEMBER_SINKS[files.get(program)]?.[name];
                        return member === index ? { sink: true, ret: false } : NONE;
                    }
                    const fn = resolve(p);
                    if (!fn) return NONE;
                    const through = parameterFlow(fn, index);
                    return through.ret ? either([{ sink: through.sink, ret: false }, flow(p)]) : through;
                }
                case 'VariableDeclarator':
                    return p.init === node && p.id.type === 'Identifier'
                        ? variableFlow(scopeOf(p), p.id.name) : NONE;
                case 'AssignmentExpression':
                    return p.right === node && p.left.type === 'Identifier'
                        ? variableFlow(scopeOf(p), p.left.name) : NONE;
                case 'ReturnStatement':
                    return { sink: false, ret: true };
                case 'ArrowFunctionExpression':
                    return p.body === node ? { sink: false, ret: true } : NONE;
                default:
                    return NONE;
                }
            }
        });
    }
    // A string the function itself writes reaches a sink when it does, or
    // when it is returned and any call of the function reaches one.
    const callersReach = (fn) => memoized(fn, 'callers', () => ({
        sink: (callsByFunction.get(fn) ?? []).some((call) => reaches(call)),
    })).sink;
    function reaches(node) {
        const f = flow(node);
        if (f.sink) return true;
        const fn = scopeOf(node);
        return f.ret && fn.type !== 'Program' && callersReach(fn);
    }
    return reaches;
}

// Whether an identifier reads a value, rather than naming a property, a
// declaration or an import.
function isValueReference(id, parent) {
    if (!parent) return false;
    if (parent.type === 'MemberExpression') return parent.object === id || parent.computed;
    if (parent.type === 'Property') return parent.value === id;
    if (parent.type === 'VariableDeclarator') return parent.init === id;
    if (parent.type === 'AssignmentExpression') return parent.right === id;
    if (FUNCTION_NODES.has(parent.type)) return parent.body === id;
    return !['ImportSpecifier', 'ImportDefaultSpecifier', 'ImportNamespaceSpecifier',
        'ExportSpecifier', 'LabeledStatement', 'BreakStatement', 'ContinueStatement',
        'MethodDefinition', 'PropertyDefinition', 'ClassDeclaration', 'CatchClause',
        'AssignmentPattern', 'RestElement', 'ArrayPattern', 'ObjectPattern'].includes(parent.type);
}

export function parseJsFiles(files, cFunctions) {
    const sources = files.map(({ file, source }) => {
        const comments = [];
        const ast = acorn.parse(source, {
            ecmaVersion: 'latest', sourceType: 'module', onComment: comments,
        });
        return { file, source, ast, comments };
    });
    // Each file's exported string constants: `export const name = '...'`.
    const exported = new Map();
    for (const { file, ast } of sources) {
        const names = new Map();
        for (const statement of ast.body) {
            const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : null;
            if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const') continue;
            for (const d of declaration.declarations) {
                if (d.id.type === 'Identifier' && d.init?.type === 'Literal' && typeof d.init.value === 'string')
                    names.set(d.id.name, d.init);
            }
        }
        exported.set(file, names);
    }
    return sources.map(({ file, source, ast, comments }) => {
        const imports = new Map();
        for (const statement of ast.body) {
            if (statement.type !== 'ImportDeclaration') continue;
            const from = statement.source.value.replace(/^\.\//u, '');
            for (const spec of statement.specifiers) {
                const init = spec.type === 'ImportSpecifier' ? exported.get(from)?.get(spec.imported.name) : null;
                if (init) imports.set(spec.local.name, init);
            }
        }
        return parseJs(file, source, cFunctions, { ast, comments }, (name) => imports.get(name) ?? null);
    });
}

function readJsFiles() {
    return readdirSync(JS_DIR).filter((name) => name.endsWith('.js') && !FROZEN_JS.has(name))
        .sort().map((file) => ({ file, source: readFileSync(join(JS_DIR, file), 'utf8') }));
}

// ---------------------------------------------------------------- pairing

// Pairs C sites with JS strings and returns every C site with its status
// and the disagreements.
export function pairSites(cSites, jsFiles) {
    const cFunctions = new Map();
    for (const site of cSites) {
        if (!site.function) continue;
        const base = site.file.split('/').pop();
        if (!cFunctions.has(site.function)) cFunctions.set(site.function, new Set());
        cFunctions.get(site.function).add(base);
    }
    const parsed = parseJsFiles(jsFiles, cFunctions);
    const reaches = locationAnalysis(parsed);
    const stringsByKey = new Map();
    const mappedKeys = new Set();
    for (const p of parsed) {
        for (const entry of p.functions) for (const key of entry.keys) mappedKeys.add(key);
        for (const s of p.strings) {
            for (const key of s.keys) {
                if (!stringsByKey.has(key)) stringsByKey.set(key, []);
                stringsByKey.get(key).push(s);
            }
        }
    }
    const located = new Map();
    const isLocated = (s) => {
        if (!located.has(s)) located.set(s, reaches(s.node));
        return located.get(s);
    };
    const matchedBy = new Map(); // JS string -> C sites
    const results = [];
    for (const site of cSites) {
        const result = { ...site, status: null, js: [] };
        results.push(result);
        if (site.kind !== 'gameplay') { result.status = 'not gameplay'; continue; }
        if (site.formats.length === 0) { result.status = 'format not a literal'; continue; }
        const patterns = sitePatterns(site);
        if (patterns.length === 0) { result.status = 'too little text'; continue; }
        const key = `${site.file.split('/').pop()}\0${site.function}`;
        if (!mappedKeys.has(key)) { result.status = 'no JS function'; continue; }
        const candidates = (stringsByKey.get(key) ?? []).filter((s) =>
            s.texts.some((text) => patterns.some((pattern) => pattern.test(text))));
        if (candidates.length === 0) { result.status = 'no JS text'; continue; }
        result.status = 'paired';
        result.js = candidates;
        for (const s of candidates) {
            if (!matchedBy.has(s)) matchedBy.set(s, []);
            matchedBy.get(s).push(result);
        }
    }
    // A format with too little text pairs with the strings of its function
    // that match its form and that no longer format matched.
    const textPaired = new Set(matchedBy.keys());
    for (const result of results) {
        if (result.status !== 'too little text') continue;
        const patterns = sitePatterns(result, true);
        const key = `${result.file.split('/').pop()}\0${result.function}`;
        if (patterns.length === 0 || !mappedKeys.has(key)) continue;
        const candidates = (stringsByKey.get(key) ?? []).filter((s) => !textPaired.has(s)
            && s.texts.some((text) => patterns.some((pattern) => pattern.test(text))));
        if (candidates.length === 0) continue;
        result.status = 'paired by form';
        result.js = candidates;
        for (const s of candidates) {
            if (!matchedBy.has(s)) matchedBy.set(s, []);
            matchedBy.get(s).push(result);
        }
    }
    const findings = [];
    for (const site of results) {
        if (!site.status.startsWith('paired')) continue;
        if (site.js.some((s) => isLocated(s) === site.located)) continue;
        findings.push({ site, js: site.js, reason: site.located
            ? 'C records a location; JS does not' : 'JS records a location; C does not' });
    }
    // A string that only short formats pair with may be one no C message
    // call prints, such as a format passed to mon_reflects(), so only the
    // rule above holds for those pairs.
    for (const [s, sites] of matchedBy) {
        if (!textPaired.has(s)) continue;
        if (sites.some((site) => site.located === isLocated(s))) continue;
        if (findings.some((f) => f.js.includes(s))) continue;
        findings.push({ site: sites[0], js: [s], reason: isLocated(s)
            ? 'JS records a location; C does not' : 'C records a location; JS does not' });
    }
    return { results, findings, isLocated };
}

export async function scan({ compiler = findCompiler(), jobs = 2 } = {}) {
    if (!compiler) throw new Error('message-location: no C compiler (clang, cc, or gcc) found');
    const cSites = [];
    const sources = await tokenizeMessageSources({ compiler, jobs });
    // Constants another file defines, as cmd.c's unavailcmd[] or decl.c's
    // c_common_strings; a name two files define differently is left out.
    const shared = new Map();
    for (const { tokens } of sources) {
        for (const [name, text] of [...stringConstants(tokens).shared, ...structConstants(tokens)])
            shared.set(name, shared.has(name) && shared.get(name) !== text ? null : text);
    }
    for (const [name, text] of shared) if (text === null) shared.delete(name);
    for (const { source, tokens } of sources) cSites.push(...extractCSites(tokens, source, shared));
    return pairSites(cSites, readJsFiles());
}

export function formatFinding({ site, js, reason }, isLocated) {
    const where = js.map((s) => `js/${s.file}:${s.line}=${isLocated(s) ? 'located' : 'plain'}`).join(' ');
    return `${site.file}:${site.line} ${site.function}() ${site.callee}: ${reason}`
        + ` (${JSON.stringify(site.formats.join(' | '))}; ${where})`;
}

export function counts(results) {
    const tally = {};
    for (const r of results) tally[r.status] = (tally[r.status] ?? 0) + 1;
    return tally;
}

async function main() {
    const { results, findings, isLocated } = await scan();
    if (process.argv.includes('--json')) {
        process.stdout.write(`${JSON.stringify(results.map((r) => ({
            ...r, js: r.js.map((s) => ({ file: s.file, line: s.line, located: isLocated(s) })),
        })), null, 1)}\n`);
        return;
    }
    for (const f of findings) console.log(formatFinding(f, isLocated));
    console.error(JSON.stringify(counts(results)));
    console.error(`${findings.length} disagreements`);
    if (findings.length > 0) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
