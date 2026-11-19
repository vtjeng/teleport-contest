// The reason for every C call the port skips.
//
// A note_unported('<file>.c <function>') call in js/ stands for a C call the
// port does not make (js/unported.js). SKIPPED_CALL_REASONS gives each label
// its pinned number of calls and the reason they are skipped;
// scripts/skipped-call-reasons.test.mjs fails when js/ uses a label the
// registry lacks, when a label's calls differ from its pin in either
// direction, and when an entry has no reason or names a label js/ no longer
// uses. Lower a pin when you wire a call; a new call needs the real port, or
// a raised pin, or a new entry with its reason.
//
// Calls are found in each file's syntax tree, so the definition, comments and
// strings are not calls. A call's label is the '<file>.c <function>' prefix of
// its argument: a string, the first part of a template, or each arm of a
// conditional. A call whose argument can name two labels counts under each.
//
// The work log imports skippedCallsWithoutReason() from this file at
// origin/main, so the module does nothing but define on import.
//
//   node scripts/skipped-call-reasons.mjs          print the summary
//   node scripts/skipped-call-reasons.mjs --json   print it as JSON

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'acorn';

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const JS_ROOT = join(PROJECT_ROOT, 'js');

// A label names the C file and the function whose call is skipped.
const LABEL = /^([A-Za-z0-9_-]+\.c) ([A-Za-z_]\w*)/u;
// A skipped impossible() or panic() is an internal-error report.
const INTERNAL_ERROR = /^[\w-]+\.c (?:impossible|panic)$/u;

// Vincent decided on 2026-11-13 to wire each impossible() and panic() report
// only when a game reaches it. scripts/c-diagnostic-markers.test.mjs requires
// every ported function to port or mark each such call in its C function.
const WIRED_WHEN_REACHED = 'an internal-error report, wired when a game reaches it '
    + '(decided 2026-11-13); scripts/c-diagnostic-markers.test.mjs enforces the marking';

// Each label's pinned call count and reason. The reasons for the calls that
// are not internal-error reports restate the comment at each call site.
export const SKIPPED_CALL_REASONS = new Map([
    // Includes the mklev.js mkinvpos() call whose argument names alloc.c panic
    // in its other arm, and the topten.js classmon() template.
    ['pline.c impossible', { count: 257, reason: WIRED_WHEN_REACHED }],
    ['end.c panic', { count: 1, reason: WIRED_WHEN_REACHED }],
    ['alloc.c panic', { count: 1, reason: WIRED_WHEN_REACHED }],
    // js/files.js: a playground file other than the config file, or a name
    // outside the playground or HOME.
    ['files.c fopen_wizkit_file', { count: 2, reason: 'the port has no copy of a host wizkit '
        + 'file\'s bytes, other than the config file the segment supplies' }],
    // js/nhlua.js: a directory, a file the game wrote, or the nethack and
    // recover programs; and a level program reached through a directory part.
    ['nhlua.c nhl_loadlua', { count: 2, reason: 'C would load a host file whose bytes the '
        + 'port does not have, or a level program by a path with a directory part' }],
    // js/read.js seffect_mail().
    ['mail.c readmail', { count: 1, reason: 'C runs the host\'s mail reader on the host\'s '
        + 'mailbox, whose output the judge\'s host need not reproduce' }],
    // js/wizcmds.js wiz_fuzzer().
    ['wizcmds.c wiz_fuzzer', { count: 1, reason: 'the fuzz-testing branches are not all '
        + 'ported, so the port does not enter fuzzer mode' }],
    // js/end.js: panic()'s save; CRASHREPORT ends panic() in NH_abort().
    ['files.c set_error_savefile', { count: 1, reason: 'C saves to a host ".e" file that no '
        + 'recording reaches, since panic() aborts the recorder' }],
    // js/end.js done() and js/cmd.js yn_function().
    ['files.c paniclog', { count: 2, reason: 'C appends to a host log file that a game cannot '
        + 'see, and discards the result' }],
]);

const isMarker = (node) => node.type === 'CallExpression'
    && node.callee.type === 'Identifier' && node.callee.name === 'note_unported';

function children(node) {
    return Object.entries(node).filter(([key]) => key !== 'type')
        .flatMap(([, value]) => (Array.isArray(value) ? value : [value]))
        .filter((value) => value && typeof value.type === 'string');
}

function walk(node, visit) {
    visit(node);
    for (const child of children(node)) walk(child, visit);
}

// The texts an argument can start with, or null for a form that has none.
function labelTexts(arg) {
    if (arg?.type === 'Literal' && typeof arg.value === 'string') return [arg.value];
    if (arg?.type === 'TemplateLiteral') return [arg.quasis[0].value.cooked ?? ''];
    if (arg?.type === 'ConditionalExpression') {
        const arms = [labelTexts(arg.consequent), labelTexts(arg.alternate)];
        return arms.includes(null) ? null : arms.flat();
    }
    return null;
}

// Each note_unported() call in `jsFiles`, an array of { path, source }, as
// { site, labels }: `labels` holds the distinct labels its argument can name,
// or is null when its argument is not a label.
export function skippedCalls(jsFiles) {
    const calls = [];
    for (const { path, source } of jsFiles) {
        // A file that never spells the name cannot call it.
        if (!source.includes('note_unported')) continue;
        const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
        walk(ast, (node) => {
            if (!isMarker(node)) return;
            const texts = labelTexts(node.arguments[0]);
            const labels = texts?.map((text) => LABEL.exec(text)).map((m) => m && `${m[1]} ${m[2]}`);
            calls.push({
                site: `${path}:${node.loc.start.line}`,
                labels: labels && !labels.includes(null) ? [...new Set(labels)] : null,
            });
        });
    }
    return calls;
}

// Every .js file under `jsRoot`, as { path, source } with `path` relative to
// the project root, in path order.
export function readJsFiles(jsRoot = JS_ROOT) {
    return readdirSync(jsRoot, { recursive: true }).filter((name) => name.endsWith('.js')).sort()
        .map((name) => join(jsRoot, name))
        .map((file) => ({ path: relative(PROJECT_ROOT, file), source: readFileSync(file, 'utf8') }));
}

// The sites of each label's calls in `calls` (from skippedCalls()), and the
// sites of calls whose argument is not a label.
export function callsByLabel(calls) {
    const byLabel = new Map();
    const unlabelled = [];
    for (const { site, labels } of calls) {
        if (!labels) unlabelled.push(site);
        for (const label of labels ?? []) {
            if (!byLabel.has(label)) byLabel.set(label, []);
            byLabel.get(label).push(site);
        }
    }
    return { byLabel, unlabelled };
}

// The number of skipped C calls in `jsFiles` (as readJsFiles() returns) with
// no recorded reason, and a summary of the skips that have one. A call has
// no reason when its argument is not a label or names a label the registry
// lacks; so does each call of a label beyond its pin.
export function skippedCallsWithoutReason(jsFiles, registry = SKIPPED_CALL_REASONS) {
    const calls = skippedCalls(jsFiles);
    const { byLabel } = callsByLabel(calls);
    let count = calls.filter(({ labels }) => !labels
        || labels.some((label) => !registry.get(label)?.reason)).length;
    const internalErrors = { calls: 0, reason: WIRED_WHEN_REACHED, labels: {} };
    const other = [];
    for (const [label, { count: pinned, reason }] of registry) {
        if (!reason) continue;
        const sites = byLabel.get(label) ?? [];
        count += Math.max(0, sites.length - pinned);
        if (INTERNAL_ERROR.test(label)) internalErrors.labels[label] = sites.length;
        else other.push({ label, calls: sites.length, reason, sites });
    }
    internalErrors.calls = calls.filter(({ labels }) => labels?.length
        && labels.every((label) => INTERNAL_ERROR.test(label) && registry.get(label)?.reason)).length;
    return { count, calls: calls.length, internalErrors, other };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const summary = skippedCallsWithoutReason(readJsFiles());
    if (process.argv.includes('--json')) {
        console.log(JSON.stringify(summary, null, 2));
    } else {
        console.log(`${summary.count} of ${summary.calls} skipped C calls have no recorded reason`);
        console.log(`${summary.internalErrors.calls} internal-error reports: ${summary.internalErrors.reason}`);
        for (const { label, calls, reason } of summary.other) console.log(`${calls} ${label}: ${reason}`);
    }
}
