#!/usr/bin/env node
// compare-host-recordings.mjs -- Compare C recordings of the same recipes
// made on two hosts, such as the judge's macOS and a local Linux machine.
//
// Usage:
//   node scripts/compare-host-recordings.mjs <dir-a> <dir-b>
//       [--labels macOS,Linux] [--json <report.json>]
//
// Each directory holds <id>.session.json recordings from
// scripts/record-session.mjs (experiments/host-parity/record-sample.sh
// writes them). Recordings are paired by file name. For each pair the
// script reports whether the RNG logs are identical and which screens and
// cursors differ. It compares screens only before the first step whose RNG
// differs: from that step the games have diverged, and their screens no
// longer show the host's output for the same game.
//
// Screens are compared cell by cell with frozen/screen-decode.mjs
// diffCell(), the judge's rule, so attributes on blank cells are ignored.
// Each differing screen is reduced to its differing words: the words of both
// screens are aligned with a longest-common-subsequence diff, and each run of
// unmatched words is a hunk. Words make the hunk independent of where the
// pager wrapped the text. The script groups identical hunks across recipes
// into host-difference kinds and lists them by the number of recipes they
// affect.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeScreen, diffCell, renderCell } from '../frozen/screen-decode.mjs';

export const USAGE = 'Usage: node scripts/compare-host-recordings.mjs <dir-a> <dir-b> '
    + '[--labels macOS,Linux] [--json <report.json>]';

// record-session.mjs makes the game's HOME with mkdtemp(<tmpdir>/nh-rec-),
// whose six-character suffix differs on every run. NetHack prints
// HOME/.nethackrc in the options help text, sometimes cut at column 80, so
// mask whatever part of the suffix is visible.
const TEMP_SUFFIX = /nh-rec-([A-Za-z0-9]{1,6})/gu;

export function maskTempSuffix(screen) {
    return String(screen ?? '').replace(TEMP_SUFFIX,
        (_, suffix) => `nh-rec-${'X'.repeat(suffix.length)}`);
}

function screenGrid(screen) {
    return decodeScreen(maskTempSuffix(screen));
}

function gridText(grid) {
    return grid.map((row) => row.map(renderCell).join('').trimEnd()).join('\n');
}

export function differingRows(gridA, gridB) {
    const rows = [];
    for (let r = 0; r < gridA.length; ++r) {
        if (gridA[r].some((cell, c) => diffCell(cell, gridB[r][c]))) rows.push(r);
    }
    return rows;
}

// Runs of unmatched words between two texts, from a longest common
// subsequence of their whitespace-separated words.
export function wordHunks(textA, textB) {
    const a = textA.split(/\s+/u).filter(Boolean);
    const b = textB.split(/\s+/u).filter(Boolean);
    const lcs = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
    for (let i = a.length - 1; i >= 0; --i) {
        for (let j = b.length - 1; j >= 0; --j) {
            lcs[i][j] = a[i] === b[j]
                ? lcs[i + 1][j + 1] + 1
                : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
        }
    }
    const hunks = [];
    let hunk = null;
    const flush = () => {
        if (hunk) hunks.push({ a: hunk.a.join(' '), b: hunk.b.join(' ') });
        hunk = null;
    };
    let i = 0, j = 0;
    while (i < a.length || j < b.length) {
        if (i < a.length && j < b.length && a[i] === b[j]) {
            flush();
            ++i; ++j;
            continue;
        }
        hunk ??= { a: [], b: [] };
        if (j >= b.length || (i < a.length && lcs[i + 1][j] >= lcs[i][j + 1])) {
            hunk.a.push(a[i++]);
        } else {
            hunk.b.push(b[j++]);
        }
    }
    flush();
    return hunks;
}

function firstRngDifference(segA, segB) {
    const steps = Math.min(segA.steps.length, segB.steps.length);
    for (let s = 0; s < steps; ++s) {
        const ra = segA.steps[s].rng ?? [];
        const rb = segB.steps[s].rng ?? [];
        const n = Math.max(ra.length, rb.length);
        for (let k = 0; k < n; ++k) {
            if (ra[k] !== rb[k]) return { step: s, call: k, a: ra[k] ?? null, b: rb[k] ?? null };
        }
    }
    if (segA.steps.length !== segB.steps.length) {
        return { step: steps, call: 0, a: null, b: null };
    }
    return null;
}

// Compares one recipe's two recordings. Returns the per-recipe result and
// the hunks of every differing screen.
export function compareRecordings(recA, recB) {
    const dstA = recA.segments.map((s) => s.recorderIsDst ?? null);
    const dstB = recB.segments.map((s) => s.recorderIsDst ?? null);
    const result = {
        // calendar.c time_from_yyyymmddhhmmss() (patch 001) copies
        // tm_isdst from the current local time before mktime(), so the
        // same fixed datetime becomes times an hour apart depending on
        // whether New York is on daylight time when the recipe is recorded
        // (record-session.mjs stores that as recorderIsDst). Night and
        // midnight checks, shopkeeper names (shknam.c, from ubirthday) and
        // some RNG calls then differ for that reason alone.
        dstMatches: JSON.stringify(dstA) === JSON.stringify(dstB),
        recorderIsDst: { a: dstA, b: dstB },
        rngIdentical: true,
        firstRngDifference: null,
        stepCounts: { a: [], b: [] },
        screensCompared: 0,
        screensDiffer: [],
        cursorsDiffer: [],
    };
    const segments = Math.max(recA.segments.length, recB.segments.length);
    for (let g = 0; g < segments; ++g) {
        const segA = recA.segments[g] ?? { steps: [] };
        const segB = recB.segments[g] ?? { steps: [] };
        result.stepCounts.a.push(segA.steps.length);
        result.stepCounts.b.push(segB.steps.length);
        const rngDiff = firstRngDifference(segA, segB);
        let limit = Math.min(segA.steps.length, segB.steps.length);
        if (rngDiff) {
            limit = rngDiff.step;
            if (result.rngIdentical) {
                result.rngIdentical = false;
                result.firstRngDifference = { segment: g, ...rngDiff };
            }
        }
        for (let s = 0; s < limit; ++s) {
            const stepA = segA.steps[s];
            const stepB = segB.steps[s];
            ++result.screensCompared;
            if (JSON.stringify(stepA.cursor) !== JSON.stringify(stepB.cursor)) {
                result.cursorsDiffer.push({ segment: g, step: s, a: stepA.cursor, b: stepB.cursor });
            }
            if (maskTempSuffix(stepA.screen) === maskTempSuffix(stepB.screen)) continue;
            const gridA = screenGrid(stepA.screen);
            const gridB = screenGrid(stepB.screen);
            const rows = differingRows(gridA, gridB);
            if (!rows.length) continue;
            const textA = gridText(gridA);
            const textB = gridText(gridB);
            let hunks = wordHunks(textA, textB);
            // Every cell's character matches, so only colors or attributes
            // differ; report the differing rows' text as the kind.
            if (!hunks.length) {
                const lines = textA.split('\n');
                hunks = [{ a: `[attributes] ${rows.map((r) => lines[r]).join(' / ')}`,
                    b: '[attributes]' }];
            }
            result.screensDiffer.push({
                segment: g,
                step: s,
                rows,
                hunks,
                text: {
                    a: rows.map((r) => textA.split('\n')[r]),
                    b: rows.map((r) => textB.split('\n')[r]),
                },
            });
        }
    }
    // Step counts that differ with an identical RNG prefix are already in
    // firstRngDifference; the counts themselves stay in stepCounts.
    return result;
}

async function readRecordings(dir) {
    const out = new Map();
    for (const name of (await fs.readdir(dir)).sort()) {
        if (!name.endsWith('.session.json')) continue;
        out.set(name.slice(0, -'.session.json'.length), path.join(dir, name));
    }
    return out;
}

export async function compareDirectories(dirA, dirB) {
    const filesA = await readRecordings(dirA);
    const filesB = await readRecordings(dirB);
    const ids = [...filesA.keys()].filter((id) => filesB.has(id));
    const recipes = [];
    const kinds = new Map();
    for (const id of ids) {
        const recA = JSON.parse(await fs.readFile(filesA.get(id), 'utf8'));
        const recB = JSON.parse(await fs.readFile(filesB.get(id), 'utf8'));
        const result = { id, ...compareRecordings(recA, recB) };
        recipes.push(result);
        // A recipe recorded under different recorderIsDst values differs for
        // a clock reason, not a host one, so it adds no kinds.
        if (!result.dstMatches) continue;
        for (const screen of result.screensDiffer) {
            for (const hunk of screen.hunks) {
                const key = `${hunk.a}\u0000${hunk.b}`;
                let kind = kinds.get(key);
                if (!kind) {
                    kind = { a: hunk.a, b: hunk.b, recipes: new Set(), screens: 0,
                        example: { id, segment: screen.segment, step: screen.step } };
                    kinds.set(key, kind);
                }
                kind.recipes.add(id);
                ++kind.screens;
            }
        }
    }
    const kindList = [...kinds.values()]
        .map((k) => ({ ...k, recipes: [...k.recipes] }))
        .sort((x, y) => y.recipes.length - x.recipes.length || y.screens - x.screens
            || x.a.localeCompare(y.a));
    return {
        onlyInA: [...filesA.keys()].filter((id) => !filesB.has(id)),
        onlyInB: [...filesB.keys()].filter((id) => !filesA.has(id)),
        recipes,
        kinds: kindList,
    };
}

function clip(text, width = 160) {
    return text.length > width ? `${text.slice(0, width - 3)}...` : text;
}

export function formatReport(report, [labelA, labelB] = ['a', 'b']) {
    const lines = [];
    const { recipes } = report;
    const rngSame = recipes.filter((r) => r.rngIdentical).length;
    const screensDiffer = recipes.filter((r) => r.screensDiffer.length).length;
    const cursorsDiffer = recipes.filter((r) => r.cursorsDiffer.length).length;
    lines.push(`Compared ${recipes.length} recipes recorded on both ${labelA} and ${labelB}.`);
    if (report.onlyInA.length) lines.push(`Only in ${labelA} (${report.onlyInA.length}): ${report.onlyInA.join(' ')}`);
    if (report.onlyInB.length) lines.push(`Only in ${labelB} (${report.onlyInB.length}): ${report.onlyInB.join(' ')}`);
    const dstDiffer = recipes.filter((r) => !r.dstMatches).length;
    if (dstDiffer) {
        lines.push(`Recorded with different recorderIsDst: ${dstDiffer} recipes. `
            + 'Their differences are listed but left out of the kinds; record both '
            + 'sides during the same daylight-time period.');
    }
    lines.push(`RNG logs identical: ${rngSame} of ${recipes.length}`);
    lines.push(`Recipes with differing screens: ${screensDiffer}; with differing cursors: ${cursorsDiffer}`);
    lines.push('', 'Recipes that differ:');
    let identical = 0;
    for (const r of recipes) {
        if (r.rngIdentical && !r.screensDiffer.length && !r.cursorsDiffer.length) {
            ++identical;
            continue;
        }
        const parts = [r.id];
        if (!r.dstMatches) {
            parts.push(`recorderIsDst differs (${labelA}: ${r.recorderIsDst.a.join(',')}; `
                + `${labelB}: ${r.recorderIsDst.b.join(',')})`);
        }
        if (r.rngIdentical) parts.push('RNG identical');
        else {
            const d = r.firstRngDifference;
            parts.push(`RNG differs at segment ${d.segment} step ${d.step} call ${d.call}`
                + ` (${labelA}: ${d.a ?? 'none'}; ${labelB}: ${d.b ?? 'none'})`);
        }
        if (r.screensDiffer.length) {
            parts.push(`screens differ: ${r.screensDiffer.map((s) => `${s.segment}:${s.step}`).join(' ')}`
                + ` of ${r.screensCompared} compared`);
        }
        if (r.cursorsDiffer.length) {
            parts.push(`cursors differ: ${r.cursorsDiffer.map((s) => `${s.segment}:${s.step}`).join(' ')}`);
        }
        lines.push(`  ${parts.join('; ')}`);
    }
    lines.push(`  (${identical} other recipes are identical)`);
    lines.push('', 'Host-difference kinds, by recipes affected:');
    if (!report.kinds.length) lines.push('  none');
    report.kinds.forEach((k, i) => {
        lines.push(`  ${i + 1}. ${k.recipes.length} recipes, ${k.screens} screens; `
            + `example ${k.example.id} segment ${k.example.segment} step ${k.example.step}`);
        lines.push(`     ${labelA}: ${JSON.stringify(clip(k.a))}`);
        lines.push(`     ${labelB}: ${JSON.stringify(clip(k.b))}`);
    });
    return lines.join('\n');
}

async function main() {
    const args = process.argv.slice(2);
    const positional = [];
    let labels = ['macOS', 'Linux'];
    let jsonPath = null;
    for (let i = 0; i < args.length; ++i) {
        if (args[i] === '--labels' && args[i + 1]) labels = args[++i].split(',');
        else if (args[i] === '--json' && args[i + 1]) jsonPath = args[++i];
        else if (args[i].startsWith('-')) throw new Error(USAGE);
        else positional.push(args[i]);
    }
    if (positional.length !== 2 || labels.length !== 2) throw new Error(USAGE);
    const report = await compareDirectories(positional[0], positional[1]);
    if (jsonPath) {
        await fs.writeFile(jsonPath, `${JSON.stringify({ labels, ...report }, null, 1)}\n`);
    }
    console.log(formatReport(report, labels));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(error.message);
        process.exitCode = 2;
    });
}
