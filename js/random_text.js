// Random-access rumor, epitaph, and engraving text.
// C refs: rumors.c getrumor(), get_rnd_line(), get_rnd_text(); hacklib.c xcrypt().

import {
    A_WIS,
    BUFSZ,
    MD_PAD_RUMORS,
    RUMORFILE,
} from './const.js';
import { game } from './gstate.js';
import { decodeUtf8ByteString, xcrypt } from './hacklib.js';
import { RANDOM_TEXT_FILES } from './random_text_data.js';
import { rn2 } from './rng.js';

export { xcrypt } from './hacklib.js';

const COOKIE_MARKER = '[cookie] ';

function randomFunction(random) {
    if (typeof random === 'function') return random;
    if (random && typeof random.rn2 === 'function')
        return (bound) => random.rn2(bound);
    throw new TypeError('random text selection requires an rn2-like function');
}

function readByteLine(data, position, bufferSize = BUFSZ) {
    if (position < 0 || position >= data.length) return null;
    const limit = Math.min(data.length, position + bufferSize - 1);
    const newline = data.indexOf('\n', position);
    const end = newline >= position && newline < limit ? newline + 1 : limit;
    return { text: data.slice(position, end), position: end };
}

function decodeByteString(bytes) {
    return decodeUtf8ByteString(
        Array.from(bytes, (character) => character.charCodeAt(0)),
    );
}

// C ref: rumors.c get_rnd_line().  data is the complete encrypted file byte
// string; startpos and endpos retain the generated file's byte offsets.
export function get_rnd_line(
    data,
    random,
    startpos,
    endpos = 0,
    padlength = 0,
    bufferSize = BUFSZ,
) {
    const ending = endpos || data.length;
    const fileChunkSize = ending - startpos;
    if (fileChunkSize < 1) return '';
    const rng = randomFunction(random);

    let position = startpos;
    for (let trylimit = 10; trylimit > 0; --trylimit) {
        const chunkOffset = rng(fileChunkSize);
        const partial = readByteLine(data, startpos + chunkOffset, bufferSize);
        position = partial?.position ?? data.length;
        // strlen(partial) includes its newline.  This intentionally permits
        // padlength+1 bytes, matching the source's long-line acceptance rule.
        if (!padlength || (partial?.text.length ?? 0) <= padlength + 1) break;
    }

    let selected;
    if (position >= ending) {
        selected = readByteLine(data, startpos, bufferSize);
    } else {
        selected = readByteLine(data, position, bufferSize);
        if (!selected) selected = readByteLine(data, startpos, bufferSize);
    }
    if (!selected) return '';

    const newline = selected.text.indexOf('\n');
    const encrypted = newline < 0
        ? selected.text
        : selected.text.slice(0, newline);
    let decrypted = xcrypt(encrypted);
    if (padlength) decrypted = decrypted.replace(/_+$/u, '');
    return decodeByteString(decrypted);
}

export function get_rnd_text(
    filename,
    random = rn2,
    padlength = MD_PAD_RUMORS,
    env = {},
) {
    const data = (env.files ?? RANDOM_TEXT_FILES)[filename];
    if (typeof data !== 'string') {
        env.couldntOpenFile?.(filename);
        return '';
    }
    // Skip the generated "don't edit" record, just as get_rnd_text() does
    // before passing its current file offset to get_rnd_line().
    const comment = readByteLine(data, 0);
    const start = comment?.position ?? data.length;
    return get_rnd_line(data, random, start, 0, padlength);
}

export function parseRumorHeader(data) {
    const comment = readByteLine(data, 0);
    const header = comment && readByteLine(data, comment.position);
    if (!header) return null;
    const match = header.text.match(
        /^(\d+),(\d+),([0-9a-f]+);(\d+),(\d+),([0-9a-f]+);0,0,([0-9a-f]+)\n$/iu,
    );
    if (!match) return null;
    const parsed = {
        trueCount: Number(match[1]),
        trueSize: Number(match[2]),
        trueStart: Number.parseInt(match[3], 16),
        falseCount: Number(match[4]),
        falseSize: Number(match[5]),
        falseStart: Number.parseInt(match[6], 16),
        eof: Number.parseInt(match[7], 16),
    };
    parsed.trueEnd = parsed.trueStart + parsed.trueSize;
    parsed.falseEnd = parsed.falseStart + parsed.falseSize;
    if (parsed.trueSize < 1 || parsed.falseSize < 1
        || parsed.trueEnd !== parsed.falseStart
        || parsed.falseEnd !== parsed.eof
        || parsed.eof > data.length) return null;
    return parsed;
}

// JS omits C's caller-owned output buffer.  The remaining arguments and all
// random choices retain getrumor()'s source order.
export function getrumor(truth, excludeCookie, rawEnv = {}) {
    const env = {
        ...rawEnv,
        files: rawEnv.files ?? RANDOM_TEXT_FILES,
        random: rawEnv.random ?? { rn2 },
        state: rawEnv.state ?? game,
    };
    const data = env.files[RUMORFILE];
    if (typeof data !== 'string') {
        env.couldntOpenFile?.(RUMORFILE);
        return '';
    }
    const ranges = parseRumorHeader(data);
    if (!ranges) return `Error reading "${RUMORFILE}".`;

    const rng = randomFunction(env.random);
    let rumor = '';
    let count = 0;
    let adjustedTruth = truth;
    for (;;) {
        adjustedTruth = truth + rng(2);
        let beginning;
        let ending;
        switch (adjustedTruth) {
        case 2:
        case 1:
            beginning = ranges.trueStart;
            ending = ranges.trueEnd;
            break;
        case 0:
        case -1:
            beginning = ranges.falseStart;
            ending = ranges.falseEnd;
            break;
        default:
            env.impossible?.('strange truth value for rumor');
            return 'Oops...';
        }
        rumor = get_rnd_line(
            data,
            rng,
            beginning,
            ending,
            MD_PAD_RUMORS,
        );

        // Preserve `count++ < 50 && exclude_cookie && cookie`: count advances
        // even when either later condition short-circuits.
        const retry = count++ < 50
            && excludeCookie
            && rumor.startsWith(COOKIE_MARKER);
        if (!retry) break;
    }

    if (count >= 50) {
        env.impossible?.("Can't find non-cookie rumor?");
    } else if (!env.state?.in_mklev) {
        env.exercise?.(A_WIS, adjustedTruth > 0);
    }
    if (!excludeCookie && rumor.startsWith(COOKIE_MARKER))
        rumor = rumor.slice(COOKIE_MARKER.length);
    return rumor;
}
