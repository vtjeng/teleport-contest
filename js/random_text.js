// Random-access rumor, epitaph, and engraving text.
// C refs: rumors.c outrumor(), getrumor(), get_rnd_line(), get_rnd_text(),
// CapitalMon();
// hacklib.c xcrypt().

import {
    A_WIS,
    BOGUSMONFILE,
    BY_COOKIE,
    BY_ORACLE,
    BY_PAPER,
    BUFSZ,
    FAINTED,
    MALE,
    MD_PAD_RUMORS,
    NUM_MGENDERS,
    RUMORFILE,
} from './const.js';
import { exercise } from './attrib.js';
import { bogon_is_pname } from './do_name.js';
import { game } from './gstate.js';
import { decodeUtf8ByteString, lowc, xcrypt } from './hacklib.js';
import { G_UNIQ, LOW_PM, NUMMONS } from './monsters.js';
import { the_unique_pm } from './objnam.js';
import { verbalize } from './pline.js';
import { RANDOM_TEXT_FILES } from './random_text_data.js';
import { rn2 } from './rng.js';
import { init_rumors } from './rumors.js';
import { heroIsBlind } from './startup_a11y.js';
import { ttyPline } from './tty_message.js';
import { note_unported } from './unported.js';

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

function isFullWordPrefix(name, word) {
    if (word.length < name.length || !word.startsWith(name)) return false;
    const next = word[name.length];
    return next === undefined || next === ' ' || next === "'";
}

// C ref: rumors.c CapitalMon() and init_CapMons() (791-907). The source
// caches this catalog after its first two-pass build; scanning the small fixed
// monster and bogus-name catalogs directly keeps the result pure and preserves
// the same case-sensitive, full-word match.
export function CapitalMon(word, state = game, env = {}) {
    if (!word || word[0] === lowc(word[0])) return false;

    for (let mndx = LOW_PM; mndx < NUMMONS; ++mndx) {
        const species = state.mons?.[mndx];
        if (!species) continue;
        if ((species.geno & G_UNIQ) !== 0 && !the_unique_pm(species))
            continue;
        for (let mgend = MALE; mgend < NUM_MGENDERS; ++mgend) {
            const name = species.pmnames?.[mgend];
            if (name && name[0] !== lowc(name[0])
                && isFullWordPrefix(name, word)) {
                return true;
            }
        }
    }

    const data = (env.files ?? RANDOM_TEXT_FILES)[BOGUSMONFILE];
    if (typeof data !== 'string') return false;
    const records = data.split('\n').slice(1);
    for (const encrypted of records) {
        if (!encrypted) continue;
        const decoded = decodeByteString(xcrypt(encrypted))
            .replace(/_+$/u, '');
        const code = '-_+|='.includes(decoded[0]) ? decoded[0] : '';
        const name = code ? decoded.slice(1) : decoded;
        if (name && name[0] !== lowc(name[0]) && !bogon_is_pname(code)
            && isFullWordPrefix(name, word)) {
            return true;
        }
    }
    return false;
}

// C ref: rumors.c get_rnd_line(). Offsets and the opened file's cursor
// retain LP64 precision; only an in-file string index or the bounded RNG
// argument becomes a Number. Failed stdio seeks/reads retain cursor/buffer.
export function get_rnd_line(
    data,
    random,
    startpos,
    endpos = 0,
    padlength = 0,
    bufferSize = BUFSZ,
    file = { position: 0 },
) {
    const beginning = BigInt.asIntN(64, BigInt(startpos));
    let ending = BigInt.asIntN(64, BigInt(endpos));
    let buffer = ''; // C initializes the caller's output before any seek.
    if (!ending) {
        file.position = BigInt(data.length); // SEEK_END followed by ftell.
        ending = file.position;
    }
    const fileChunkSize = ending - beginning;
    if (fileChunkSize < 1n) return buffer;
    const rng = randomFunction(random);
    const seek = (offset) => {
        const position = BigInt.asIntN(64, offset);
        if (position >= 0n) file.position = position;
    };
    const read = () => {
        const position = BigInt(file.position);
        if (position < 0n || position >= BigInt(data.length)) return false;
        const line = readByteLine(data, Number(position), bufferSize);
        if (!line) return false;
        buffer = line.text;
        file.position = BigInt(line.position);
        return true;
    };
    for (let trylimit = 10; trylimit > 0; --trylimit) {
        // C asserts the positive chunk fits INT_MAX before calling rn2.
        const chunkOffset = rng(Number(fileChunkSize));
        seek(beginning + BigInt(chunkOffset));
        read();
        // strlen includes its newline; a failed read retains the buffer.
        if (!padlength || buffer.length <= padlength + 1) break;
    }
    if (BigInt(file.position) >= ending || !read()) {
        seek(beginning);
        read();
    }
    const newline = buffer.indexOf('\n');
    const encrypted = newline < 0 ? buffer : buffer.slice(0, newline);
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
    return get_rnd_line(data, random, start, 0, padlength, BUFSZ, { position: start });
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
    const state = env.state;
    state.gt ??= {};
    state.gf ??= {};
    state.gt.true_rumor_size ??= 0;
    if (state.gt.true_rumor_size < 0) return '';
    const data = env.files[RUMORFILE];
    if (typeof data !== 'string') {
        note_unported('rumors.c couldnt_open_file');
        state.gt.true_rumor_size = -1;
        return '';
    }
    const file = { data, position: 0 };
    // C rumors.c:139-146 initializes the same offsets used by rumor_check.
    if (state.gt.true_rumor_size === 0) {
        init_rumors(file, state);
        if (state.gt.true_rumor_size < 0) return `Error reading "${RUMORFILE}".`;
    }

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
            beginning = BigInt.asIntN(64, BigInt(state.gt.true_rumor_start));
            ending = BigInt.asIntN(64, BigInt(state.gt.true_rumor_end));
            break;
        case 0:
        case -1:
            beginning = BigInt.asIntN(64, BigInt(state.gf.false_rumor_start));
            ending = BigInt.asIntN(64, BigInt(state.gf.false_rumor_end));
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
            BUFSZ,
            file,
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

// C ref: rumors.c outrumor() (529-575). The caller supplies the source
// mechanism so the reading guards happen before getrumor(), while the
// fortune-cookie, paper and Oracle message sequences retain their C order.
export async function outrumor(truth, mechanism, state = game, rawEnv = {}) {
    const message = rawEnv.message ?? ttyPline;
    const reading = mechanism === BY_COOKIE || mechanism === BY_PAPER;
    const randomSource = rawEnv.random ?? { rn2 };
    const random = randomFunction(randomSource);

    if (reading) {
        // C's is_fainted() is the u.uhs == FAINTED half of the hunger status
        // predicate in this source path. Only a cookie's meal can use it.
        if (mechanism === BY_COOKIE && state.u?.uhs === FAINTED)
            return;
        if (heroIsBlind(state)) {
            if (mechanism === BY_COOKIE)
                await message('This cookie has a scrap of paper inside.', state);
            await message('What a pity that you cannot read it!', state);
            return;
        }
    }

    const lineResult = getrumor(truth, !reading, {
        ...rawEnv,
        random: randomSource,
        state,
        // getrumor() is synchronous like its C counterpart. A Wis exercise
        // has no awaitable encumber_msg() tail, so exercise() mutates the
        // source state before returning its Promise here.
        exercise: rawEnv.exercise
            ?? ((index, increase) => exercise(
                index,
                increase,
                state,
                { rn2: random },
            )),
    });
    const line = lineResult || 'NetHack rumors file closed for renovation.';

    switch (mechanism) {
    case BY_ORACLE: {
        const adverb = !random(4)
            ? 'offhandedly '
            : (!random(3)
                ? 'casually '
                : (random(2) ? 'nonchalantly ' : ''));
        // SetVoice() only reaches the recorder's no-sound interface and has
        // no state or screen result; preserve the explicit source gap.
        note_unported('rumors.c SetVoice');
        await message(`True to her word, the Oracle ${adverb}says: `, state);
        await verbalize(line, state, { message });
        return;
    }
    case BY_COOKIE:
        await message('This cookie has a scrap of paper inside.', state);
        // FALLTHROUGH: the cookie and paper paths share the next message.
    case BY_PAPER:
        await message('It reads:', state);
        break;
    default:
        break;
    }
    await message(line, state);
}
