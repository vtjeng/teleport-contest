// Finds every list the C source builds by linking a record onto its front,
// `x->next = head; head = x;`, and checks that the port's function of the
// same name builds that list the same way. Whatever walks such a list meets
// the newest record first: messages print in that order and random numbers
// are drawn in that order. A port that appends to an array instead reverses
// the walk; read.c set_lit()'s gremlins and five restored level lists were
// both found that way.
//
// A port function passes when its body links a record onto the front of a
// chain the same way, or calls js/hacklib.js push_front(), the one way to add
// to the front of a list the port keeps as an array. FRONT_PUSH_EXCEPTIONS
// gives the reason for every C function whose port does neither.
// scripts/front-pushed-lists.test.mjs runs the check.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const C_SOURCE_DIRS = ['src', 'win/tty'];

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

// The C functions, and the line, at which `rec->field = head;` is followed
// within twelve lines by `head = rec;`. `head` may be a global, a local chain
// or another record's field. The scan also matches a few insertions after a
// given record (`a->nobj = b->nobj; b->nobj = a;`); those functions pass the
// port check too, or carry an exception that says why not.
export function cFrontPushSites(cRoot = join(PROJECT_ROOT, 'nethack-c', 'upstream')) {
    if (!existsSync(join(cRoot, 'src', 'mkobj.c')))
        throw new Error(`no C source at ${cRoot}; check out nethack-c/upstream`);
    const sites = [];
    for (const dir of C_SOURCE_DIRS) {
        for (const file of readdirSync(join(cRoot, dir)).filter((f) => f.endsWith('.c')).sort()) {
            const lines = readFileSync(join(cRoot, dir, file), 'utf8').split('\n');
            let func = null;
            for (let i = 0; i < lines.length; i++) {
                const declared = /^(\w+)\(/u.exec(lines[i]);
                if (declared) func = declared[1];
                const link = /([\w.>\-[\]()*]+)\s*->\s*(\w+)\s*=\s*([^;=]+?)\s*;/u.exec(lines[i]);
                if (!link) continue;
                const [, record, field, head] = link;
                if (/^(NULL|0|\(\w+ \*\) ?0)$/u.test(head)) continue;
                const relink = new RegExp(
                    `(^|[^\\w>.])${escape(head)}\\s*=\\s*${escape(record)}\\s*;`, 'u');
                const after = [lines[i].slice(link.index + link[0].length),
                    ...lines.slice(i + 1, i + 13)];
                if (after.some((line) => relink.test(line)))
                    sites.push({ file: `${dir}/${file}`, line: i + 1, func, field, record, head });
            }
        }
    }
    return sites;
}

// The port's name for a C function that the scan finds, where it differs.
export const PORT_NAMES = {
    // light.c new_light_core() is new_light_source() less its type check.
    new_light_core: 'new_light_source',
    // restore.c getlev()'s trap loop (1149-1163) is restore.js rest_traps().
    getlev: 'rest_traps',
    // invent.c addinv_core0()'s insertion (1116-1126) is invent.js
    // insertInventoryObject(), which both of the port's addinv cores call.
    addinv_core0: 'insertInventoryObject',
    // makemon.c makemon()'s body is makemon_create.js makemon_steps(), which
    // makemon() runs (js/source_steps.js).
    makemon: 'makemon_steps',
    // mkobj.c add_to_migration() and worm.c place_worm_tail_randomly() are
    // written once as *_steps generators (js/source_steps.js), which their
    // synchronous and asynchronous forms run.
    add_to_migration: 'add_to_migration_steps',
    place_worm_tail_randomly: 'place_worm_tail_randomly_steps',
};

// C functions whose port does not build the scanned list by pushing onto its
// front, with the reason that leaves the port's order equal to C's. An
// `unported` entry has no port function of that name; the check fails once
// one appears, so that the new port is examined. A `ports` entry excepts only
// the port functions in the files it names.
export const FRONT_PUSH_EXCEPTIONS = {
    config_erradd: { unported: true, reason: 'cfgfiles.js reports a config error as it is found' },
    reorder_fruit: { unported: true, reason: 'its one caller is a DEBUG-only block in insight.c' },
    add_id_mapping: { unported: true, reason: 'the port maps saved ids with a Map, looked up by key' },
    parse_sym_line: { unported: true, reason: 'the port has no symset file reader' },
    savedsym_add: { unported: true, reason: 'the port has no symset file reader' },
    wl_addhead: { unported: true, reason: 'WINCHAIN is not compiled' },
    tty_add_menu: {
        unported: true,
        reason: 'tty_end_menu() reverses the pushed items; the port adds them in order',
    },
    reverse: { unported: true, reason: "wintty.c's reverse() serves only tty_end_menu()" },
    config_error_init: {
        reason: 'the port keeps one config-error context; C pushes one per nested file',
    },
    cmdq_copy: {
        reason: 'C pushes each copy and cmdq_reverse() restores the order; the port copies the array in order',
    },
    insert_branch: {
        reason: 'a sorted insert; the port splices into its array at the same position',
    },
    add_level: { reason: 'a sorted insert; the port splices into its array at the same position' },
    init_mapseen: { reason: 'a sorted insert; the port splices into its array at the same position' },
    dealloc_obj: {
        reason: 'go.objs_deleted defers a free; the port frees nothing and keeps no such list',
    },
    mk_bubble: {
        reason: 'C appends each bubble to the end (the scan matches its prev link); the port pushes onto the end',
    },
    // mon.c relmon() pushes the monster onto *monst_list when it has one.
    // dog.js relmon() is that arm; mon.js relmon() is the arm replmon()
    // takes, with a null list, which only unlinks the monster from fmon.
    relmon: { ports: { 'mon.js': 'the null-list arm, which pushes onto no list' } },
    // restore.c find_lev_obj() reverses fobj onto a local chain, then places
    // each object back, which restores fobj's order and rebuilds the floor
    // piles. bones.js find_lev_obj() does both; restore.js keeps the piles
    // of a level it holds in memory and needs neither.
    find_lev_obj: {
        ports: { 'restore.js': 'the level keeps its fobj order and floor piles in memory' },
    },
};

// Fields that link one record of a C list to the next.
const LINK_FIELDS = 'next|nobj|nmon|nexthere|nxt_engr|ntrap|nextf|nseg|prev|nxt|nextlink';

const normalize = (expression) => expression.replace(/\?\./gu, '.').replace(/\s+/gu, '');

// Whether `body` links a record onto the front of a list. The record's link
// field is set to the list head, as `rec.next = head` or as `next: head` in
// the literal that makes `rec`, and the record then becomes a head: either
// `head = rec`, another member assignment such as `state.invent = rec` (the
// port sometimes reads a head through an accessor), or a call to a head
// setter such as `setInventoryHead(state, rec)`. The literal may also
// be assigned straight to its own head, `head = { ..., next: head }`. Also
// true when the body calls push_front().
export function buildsFrontPushed(body) {
    if (/(?<![\w.$])push_front\(/u.test(body)) return true;
    const PATH = '[\\w$][\\w$.?[\\]]*(?:\\([^()]*\\))?';
    const link = new RegExp(
        `(?:(${PATH})\\.(?:${LINK_FIELDS})\\s*=(?!=)|[{,\\s](?:${LINK_FIELDS})\\s*:)\\s*`
        + `(${PATH})(?:\\s*\\?\\?\\s*null)?\\s*[;,}\\n]`, 'gu');
    for (const match of body.matchAll(link)) {
        const head = normalize(match[2]);
        if (head === 'null') continue;
        let record = match[1] && normalize(match[1]);
        let from = match.index;
        if (!record) {
            const opener = literalOpener(body, match.index);
            if (opener < 0) continue;
            const target = new RegExp(`(?:^|[^\\w$.])(${PATH})\\s*=\\s*$`, 'u')
                .exec(body.slice(0, opener));
            if (!target) continue;
            record = normalize(target[1]);
            if (record === head) return true;
            from = opener;
        }
        const becomesHead = new RegExp(
            `(?:^|[;{}\\s])(${PATH})\\s*=\\s*${escape(record)}\\s*;`, 'gu');
        for (const assignment of body.slice(from).matchAll(becomesHead)) {
            const target = normalize(assignment[1]);
            if (target === head || /[.[]/u.test(target)) return true;
        }
        // A head set through the port's setter, `setInventoryHead(state, rec)`.
        if (new RegExp(`(?<![\\w$.])set\\w*Head\\([^()]*,\\s*${escape(record)}\\s*\\)`, 'u')
            .test(body.slice(from))) return true;
    }
    return false;
}

// The index of the `{` that opens the object literal holding `index`, or -1.
function literalOpener(body, index) {
    let depth = 0;
    for (let i = index - 1; i >= 0; i--) {
        if (body[i] === '}') depth++;
        else if (body[i] === '{' && depth-- === 0) return i;
    }
    return -1;
}

// The text of each function declared as `name` in `source`, from its opening
// brace to its closing brace, with comments removed. Strings and template
// literals are skipped whole when matching braces.
export function functionBodies(source, name) {
    const bodies = [];
    const declaration = new RegExp(`(?<![\\w$.])function\\*?\\s+${name}\\s*\\(`, 'gu');
    for (const found of source.matchAll(declaration)) {
        let i = found.index + found[0].length;
        for (let parens = 1; parens > 0; i++) {
            if (source[i] === '(') parens++;
            else if (source[i] === ')') parens--;
        }
        const open = source.indexOf('{', i);
        let depth = 0;
        let body = '';
        for (let j = open; j < source.length; j++) {
            const ch = source[j];
            if (ch === '/' && source[j + 1] === '/') {
                j = source.indexOf('\n', j) - 1;
                continue;
            }
            if (ch === '/' && source[j + 1] === '*') {
                j = source.indexOf('*/', j) + 1;
                continue;
            }
            if (ch === '\'' || ch === '"' || ch === '`') {
                let end = j + 1;
                while (source[end] !== ch) end += source[end] === '\\' ? 2 : 1;
                body += source.slice(j, end + 1);
                j = end;
                continue;
            }
            body += ch;
            if (ch === '{') depth++;
            else if (ch === '}' && --depth === 0) break;
        }
        bodies.push(body);
    }
    return bodies;
}

export function portSources(root = PROJECT_ROOT) {
    const dir = join(root, 'js');
    return Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith('.js')).sort()
        .map((file) => [file, readFileSync(join(dir, file), 'utf8')]));
}

// Problems with the port of each C function in `cFunctions`, given the js/
// sources as a map from file name to text.
export function frontPushFindings(cFunctions, sources) {
    const findings = [];
    for (const func of cFunctions) {
        const portName = PORT_NAMES[func] ?? func;
        const ports = Object.entries(sources).flatMap(([file, source]) =>
            functionBodies(source, portName).map((body) => ({ file, body })));
        const exception = FRONT_PUSH_EXCEPTIONS[func];
        if (exception?.unported) {
            if (ports.length)
                findings.push(`${func}: now ported in ${ports[0].file}; check its order and remove its exception`);
            continue;
        }
        if (!ports.length) {
            findings.push(`${func}: no port function ${portName}()`);
            continue;
        }
        if (exception && !exception.ports) {
            if (ports.every(({ body }) => buildsFrontPushed(body)))
                findings.push(`${func}: builds its list by pushing onto the front; remove its exception`);
            continue;
        }
        for (const file of Object.keys(exception?.ports ?? {})) {
            const excepted = ports.filter((port) => port.file === file);
            if (!excepted.length)
                findings.push(`${func}: no port function ${portName}() in ${file}; remove its exception`);
            else if (excepted.every(({ body }) => buildsFrontPushed(body)))
                findings.push(`${file} ${portName}: builds its list by pushing onto the front; remove its exception`);
        }
        for (const { file, body } of ports) {
            if (!exception?.ports?.[file] && !buildsFrontPushed(body))
                findings.push(`${file} ${portName}: does not push onto the front of its list as C ${func}() does`);
        }
    }
    return findings;
}

// Every `.unshift(` call in the js/ sources outside push_front() itself.
export function unshiftFindings(sources) {
    const findings = [];
    for (const [file, source] of Object.entries(sources)) {
        source.split('\n').forEach((line, index) => {
            const code = line.replace(/\/\/.*$/u, '');
            if (/\.unshift\(/u.test(code) && !(file === 'hacklib.js' && /^\s*list\.unshift\(item\);/u.test(code)))
                findings.push(`${file}:${index + 1}: ${line.trim()}`);
        });
    }
    return findings;
}
