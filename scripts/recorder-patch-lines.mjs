// Checks that a recorder patch keeps the line number of every upstream line.
//
// The recorder's RNG log names the C file and line of each call (patch 003),
// so a patch that adds or removes a line in a source file changes the logged
// line of every call after it, and committed recordings stop re-recording
// identically.  A hunk may change the line count only when it ends at the
// file's last upstream line, where no later line can move.

import { readFileSync } from 'node:fs';
import path from 'node:path';

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/u;

// Returns one entry per hunk: the file, the old start and length, the new
// length, and the number of lines in the upstream file.
export function patchHunks(patchText, upstreamDir) {
    const hunks = [];
    let file = null;
    for (const line of patchText.split('\n')) {
        if (line.startsWith('+++ ')) {
            file = line.slice(4).replace(/^b\//u, '').replace(/\t.*$/u, '');
            continue;
        }
        const match = HUNK.exec(line);
        if (!match) continue;
        const upstream = readFileSync(path.join(upstreamDir, file), 'latin1');
        hunks.push({
            file,
            oldStart: Number(match[1]),
            oldLength: match[2] === undefined ? 1 : Number(match[2]),
            newLength: match[4] === undefined ? 1 : Number(match[4]),
            upstreamLines: upstream.split('\n').length - (upstream.endsWith('\n') ? 1 : 0),
        });
    }
    return hunks;
}

// The hunks that would move a later upstream line.
export function hunksThatMoveLines(patchText, upstreamDir) {
    return patchHunks(patchText, upstreamDir).filter((hunk) =>
        hunk.oldLength !== hunk.newLength
        && hunk.oldStart + hunk.oldLength - 1 < hunk.upstreamLines);
}
