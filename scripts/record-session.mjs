#!/usr/bin/env node
// record-session.mjs — Re-record a session.json from a recipe.
//
// Reads an input session.json (clean v5 segments format), spawns the
// patched NetHack 5.0 "recorder" binary with NOMUX_MARKERS=1, drives
// it one key at a time using in-band stdout sync markers (OSC 7777),
// reads PRNG calls from the rng-log file, and writes a fresh v5 session.
//
// Usage:
//   node scripts/record-session.mjs <input.session.json> [output.session.json]
//
// Env:
//   NETHACK_BINARY     path to recorder/install/games/lib/nethackdir/nethack
//                      (defaults to nethack-c/recorder/install/...)
//   NETHACK_INSTALL    install dir (HACKDIR / NETHACKDIR)
// The recorder binary must be built from the patched submodule.
// See nethack-c/build-recorder.sh.

import { spawn } from 'node:child_process';
import { promises as fs, constants as fsConstants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import {createPromptController, digest, validatePromptPlan} from './recorder-prompt-plan.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT = path.resolve(SCRIPT_DIR, '..');
const DEFAULT_BINARY = path.join(
    TEMPLATE_ROOT, 'nethack-c', 'recorder', 'install',
    'games', 'lib', 'nethackdir', 'nethack');
const DEFAULT_INSTALL = path.join(
    TEMPLATE_ROOT, 'nethack-c', 'recorder', 'install',
    'games', 'lib', 'nethackdir');
// NetHack reads NETHACKDIR and HACKDIR through nh_getenv() (options.c),
// which discards a value longer than BUFSZ / 2 and lets the game fall back
// to its compiled-in /usr/games/lib/nethackdir. A checkout under
// .claude/worktrees/ pushes the install path past that limit, so main()
// stages a copy under the short temporary directory when the real path
// would be discarded.
export const NETHACKDIR_MAX_LENGTH = 128;

export function installDirTooLong(installDir) {
    return installDir.length > NETHACKDIR_MAX_LENGTH;
}

export function terminalInputKey(segment) {
    if (!Object.hasOwn(segment, 'terminalInputKey')) return null;
    const key = segment.terminalInputKey;
    if (typeof key !== 'string' || key.length !== 1
        || !segment.moves || segment.moves.at(-1) !== key) {
        throw new Error(
            'terminalInputKey must match the segment final input key',
        );
    }
    return key;
}

export function successfulTerminalExit({
    exitCode,
    signal,
    terminalKey,
    moves,
    nextKeyIndex,
    stepCount,
    expectedSteps,
}) {
    return terminalKey !== null
        && exitCode === 0
        && signal === null
        && moves.at(-1) === terminalKey
        && nextKeyIndex === moves.length
        && stepCount > 0
        && (stepCount === expectedSteps
            || stepCount === expectedSteps - 1);
}

// The caller may spend its remaining budget freezing capture artifacts. Never
// launch a replay merely to discover an already-expired deadline via a timer.
export async function replayWithinDeadline(deadline, run, now = Date.now) {
    if (now() >= deadline) return null;
    return run();
}

const RECORDER_TIME_ZONE = 'America/New_York';
export const USAGE = 'Usage: node scripts/record-session.mjs <input.session.json> [output.session.json] [--prompt-plan plan.json --prompt-receipt receipt.json --emitted-recipe recipe.json]';
const RECORDER_TIME_FORMAT = new Intl.DateTimeFormat(
    'en-CA-u-ca-gregory-nu-latn',
    {
        timeZone: RECORDER_TIME_ZONE,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    },
);

function recorderFieldsAt(epochMillis) {
    const fields = {};
    for (const part of RECORDER_TIME_FORMAT.formatToParts(
        new Date(epochMillis),
    )) {
        if (part.type !== 'literal') fields[part.type] = Number(part.value);
    }
    return fields;
}

function fieldsAsUtcMillis(fields) {
    return Date.UTC(
        fields.year,
        fields.month - 1,
        fields.day,
        fields.hour,
        fields.minute,
        fields.second,
    );
}

function recorderOffsetAt(epochMillis) {
    const wholeSecondMillis = Math.trunc(epochMillis / 1000) * 1000;
    return fieldsAsUtcMillis(recorderFieldsAt(wholeSecondMillis))
        - wholeSecondMillis;
}

export function canonicalRecorderIsDst(now = new Date()) {
    const year = recorderFieldsAt(now.getTime()).year;
    const offsets = [];
    // This captures the contemporary standard and daylight offsets used by
    // the recorder process without consulting the Node host timezone.
    for (let month = 0; month < 12; ++month) {
        offsets.push(recorderOffsetAt(Date.UTC(year, month, 15, 12)));
    }
    return recorderOffsetAt(now.getTime()) === Math.max(...offsets)
        && Math.max(...offsets) !== Math.min(...offsets);
}

// ---------------------------------------------------------------------------
// Screen encoding — ports run_session.py compress_ansi_line +
// encode_screen_ansi_rle to produce byte-equal output.
// ---------------------------------------------------------------------------

function compressAnsiLine(line) {
    if (!line) return '';
    let out = '';
    let i = 0;
    while (i < line.length) {
        if (line[i] === ' ') {
            const start = i;
            while (i < line.length && line[i] === ' ') i++;
            const run = i - start;
            if (run >= 5) {
                out += `\x1b[${run}C`;
            } else {
                out += ' '.repeat(run);
            }
        } else {
            out += line[i];
            i += 1;
        }
    }
    return out;
}

function encodeScreenAnsiRle(lines) {
    if (!lines || lines.length === 0) return '';
    const compressed = lines.map((line) => {
        // Trailing spaces are implicit
        const stripped = line.replace(/ +$/u, '');
        return compressAnsiLine(stripped);
    });
    while (compressed.length > 0 && compressed[compressed.length - 1] === '') {
        compressed.pop();
    }
    return compressed.join('\n');
}

// ---------------------------------------------------------------------------
// OSC 7777 marker stream parser
// ---------------------------------------------------------------------------

// Marker wire format (emitted by patched termcap.c):
//   ESC ] 7777 ; KIND=input ; SEQ=N ; ANIM=K ; CX=cx ; CY=cy ; LEN=L BEL
//   <L bytes of screen content>
//
// The header up through BEL is plain ASCII. The L payload bytes are the
// rendered screen serialization (escape sequences preserved verbatim).
// The parser is byte-oriented and handles the payload as raw bytes — a
// BEL inside the payload must not terminate the next header.

class MarkerParser {
    constructor(onMarker) {
        this.onMarker = onMarker;
        // Chunks waiting to be parsed, plus a logical offset into the
        // first chunk.  Avoids O(n^2) Buffer.concat on hot streams.
        this.chunks = [];
        this.head = 0;        // bytes already consumed in chunks[0]
        this.size = 0;        // total unconsumed bytes
        this.stopped = false;
    }

    stop() { this.stopped = true; this.chunks = []; this.size = 0; this.head = 0; }

    push(chunk) {
        if (this.stopped) return;
        this.chunks.push(chunk);
        this.size += chunk.length;
        this._drain();
    }

    _flatten(n) {
        // Materialize the next n bytes into a single Buffer.
        const out = Buffer.allocUnsafe(n);
        let off = 0;
        let chunkIdx = 0;
        let chunkOff = this.head;
        while (off < n) {
            const c = this.chunks[chunkIdx];
            const take = Math.min(n - off, c.length - chunkOff);
            c.copy(out, off, chunkOff, chunkOff + take);
            off += take;
            chunkOff += take;
            if (chunkOff >= c.length) { chunkIdx += 1; chunkOff = 0; }
        }
        return out;
    }

    _consume(n) {
        // Discard the next n bytes from the queue.
        let remaining = n;
        while (remaining > 0 && this.chunks.length > 0) {
            const c = this.chunks[0];
            const avail = c.length - this.head;
            if (remaining < avail) {
                this.head += remaining;
                remaining = 0;
            } else {
                remaining -= avail;
                this.chunks.shift();
                this.head = 0;
            }
        }
        this.size -= n;
    }

    _findByte(byte, fromOffset) {
        // Locate `byte` starting at `fromOffset` bytes from the logical start.
        let skip = fromOffset;
        let chunkIdx = 0;
        let chunkOff = this.head;
        while (chunkIdx < this.chunks.length && skip > 0) {
            const c = this.chunks[chunkIdx];
            const avail = c.length - chunkOff;
            if (skip < avail) { chunkOff += skip; skip = 0; }
            else { skip -= avail; chunkIdx += 1; chunkOff = 0; }
        }
        let pos = fromOffset;
        while (chunkIdx < this.chunks.length) {
            const c = this.chunks[chunkIdx];
            const idx = c.indexOf(byte, chunkOff);
            if (idx >= 0) return pos + (idx - chunkOff);
            pos += c.length - chunkOff;
            chunkIdx += 1;
            chunkOff = 0;
        }
        return -1;
    }

    _findIntroducer() {
        // Returns the logical offset of "\x1b]7777;" from start, or -1.
        // Must check across chunk boundaries — flatten search by scanning
        // chunks one byte at a time around any ESC byte.
        let pos = 0;
        let chunkIdx = 0;
        let chunkOff = this.head;
        const needle = Buffer.from('\x1b]7777;');
        // Collect a small rolling window across chunks if needed.
        while (chunkIdx < this.chunks.length) {
            const c = this.chunks[chunkIdx];
            const sub = c.subarray(chunkOff);
            const idx = sub.indexOf(0x1b);
            if (idx < 0) {
                pos += sub.length;
                chunkIdx += 1; chunkOff = 0;
                continue;
            }
            // Try a 7-byte match starting at this ESC.  May span chunks.
            const startPos = pos + idx;
            if (this._matchAt(startPos, needle)) return startPos;
            // Skip past this ESC and continue.
            const stepBytes = idx + 1;
            pos += stepBytes;
            chunkOff += stepBytes;
            if (chunkOff >= c.length) { chunkIdx += 1; chunkOff = 0; }
        }
        return -1;
    }

    _matchAt(startOffset, needle) {
        if (this.size - startOffset < needle.length) return false;
        let needleOff = 0;
        let pos = 0;
        let chunkIdx = 0;
        let chunkOff = this.head;
        // Advance to startOffset
        while (pos < startOffset) {
            const c = this.chunks[chunkIdx];
            const avail = c.length - chunkOff;
            const skip = Math.min(avail, startOffset - pos);
            chunkOff += skip;
            pos += skip;
            if (chunkOff >= c.length) { chunkIdx += 1; chunkOff = 0; }
        }
        while (needleOff < needle.length) {
            const c = this.chunks[chunkIdx];
            const avail = c.length - chunkOff;
            const take = Math.min(avail, needle.length - needleOff);
            for (let i = 0; i < take; i++) {
                if (c[chunkOff + i] !== needle[needleOff + i]) return false;
            }
            needleOff += take;
            chunkOff += take;
            if (chunkOff >= c.length) { chunkIdx += 1; chunkOff = 0; }
        }
        return true;
    }

    _drain() {
        while (!this.stopped) {
            const introStart = this._findIntroducer();
            if (introStart < 0) {
                // Drop all bytes — no introducer in flight.  Leave at most
                // 6 trailing bytes in case an ESC starts a partial match.
                if (this.size > 7) this._consume(this.size - 7);
                return;
            }
            if (introStart > 0) this._consume(introStart);
            // Find BEL after the 7-byte introducer.
            const bel = this._findByte(0x07, 7);
            if (bel < 0) return;  // wait for more
            const headerBuf = this._flatten(bel);
            const header = headerBuf.subarray(7).toString('ascii');
            const meta = parseMarkerHeader(header);
            const need = bel + 1 + meta.len;
            if (this.size < need) return;  // wait for full payload
            const headerLen = bel + 1;
            this._consume(headerLen);
            const payloadBuf = this._flatten(meta.len);
            this._consume(meta.len);
            const payload = payloadBuf.toString('utf8');
            this.onMarker({ ...meta, payload });
            if (this.stopped) return;
        }
    }
}

function parseMarkerHeader(header) {
    const out = { kind: '', seq: 0, anim: 0, cx: 0, cy: 0, len: 0 };
    for (const part of header.split(';')) {
        const eq = part.indexOf('=');
        if (eq < 0) continue;
        const k = part.slice(0, eq);
        const v = part.slice(eq + 1);
        if (k === 'KIND') out.kind = v;
        else if (k === 'SEQ') out.seq = parseInt(v, 10) || 0;
        else if (k === 'ANIM') out.anim = parseInt(v, 10) || 0;
        else if (k === 'CX') out.cx = parseInt(v, 10) || 0;
        else if (k === 'CY') out.cy = parseInt(v, 10) || 0;
        else if (k === 'LEN') out.len = parseInt(v, 10) || 0;
    }
    return out;
}

// ---------------------------------------------------------------------------
// Screen payload → 24-line array
// ---------------------------------------------------------------------------

function payloadToLines(payload) {
    const lines = payload.split('\n');
    while (lines.length < 24) lines.push('');
    return lines.slice(0, 24);
}

// ---------------------------------------------------------------------------
// PRNG log parsing (mirrors run_session.py parse_rng_lines)
// ---------------------------------------------------------------------------

function parseRngLines(text) {
    const out = [];
    for (const raw of text.split('\n')) {
        const line = raw.trimEnd();
        if (!line) continue;
        const c0 = line[0];
        if (c0 === '>' || c0 === '<' || c0 === '^') {
            out.push(line);
            continue;
        }
        // Format: "2808 rn2(12) = 2 @ mon.c:1145"
        const sp = line.indexOf(' ');
        if (sp < 0) continue;
        const rest = line.slice(sp + 1).replace(' = ', '=');
        out.push(rest);
    }
    return out;
}

// ---------------------------------------------------------------------------
// Session loading / segment driving
// ---------------------------------------------------------------------------

async function loadSession(p) {
    const txt = await fs.readFile(p, 'utf8');
    const data = JSON.parse(txt);
    if (data.version !== 5 || !Array.isArray(data.segments)) {
        throw new Error(`unsupported session shape: ${p} (need clean v5)`);
    }
    return data;
}

function parseNethackrcName(rc) {
    if (!rc) return null;
    for (const rawLine of rc.split('\n')) {
        const line = rawLine.trim();
        const upper = line.toUpperCase();
        if (!(upper.startsWith('OPTIONS=') || upper.startsWith('OPTIONS ='))) continue;
        const opts = line.slice(line.indexOf('=') + 1);
        for (const opt of opts.split(',')) {
            const t = opt.trim();
            if (t.toLowerCase().startsWith('name:')) {
                return t.slice('name:'.length).trim();
            }
        }
    }
    return null;
}

async function ensureScorefiles(installDir) {
    for (const name of ['record', 'xlogfile', 'logfile']) {
        const p = path.join(installDir, name);
        try {
            const fh = await fs.open(p, 'a');
            await fh.close();
        } catch {}
    }
}

async function clearStaleState(installDir) {
    const saveDir = path.join(installDir, 'save');
    try {
        const entries = await fs.readdir(saveDir);
        await Promise.all(entries.map((e) => fs.unlink(path.join(saveDir, e)).catch(() => {})));
    } catch {}
    // Strip lock/bones/wizard files that interfere with deterministic replay.
    let entries = [];
    try { entries = await fs.readdir(installDir); } catch {}
    const killNames = new Set(['record', 'xlogfile', 'logfile', 'paniclog']);
    for (const name of entries) {
        const lower = name.toLowerCase();
        const full = path.join(installDir, name);
        let st;
        try { st = await fs.stat(full); } catch { continue; }
        if (!st.isFile()) continue;
        if (name.endsWith('.lua')) continue;
        if (killNames.has(lower)
            || lower.startsWith('bon')
            || lower.endsWith('.0')
            || lower.includes('wizard')
            || lower.includes('recorder')
            || lower.includes('agent')) {
            await fs.unlink(full).catch(() => {});
        }
    }
    await ensureScorefiles(installDir);
}

export async function recordSegment({
    seg,
    isFirstSegment,
    binary,
    installDir,
    rngLogPath,
    homeDir,
    tz,
    prompt = null,
    onReceipt = async () => {},
    deadline = null,
    preserveFailure = false,
    onSpawn = () => {},
}) {
    // Write nethackrc into homeDir
    await fs.mkdir(homeDir, { recursive: true });
    await fs.writeFile(path.join(homeDir, '.nethackrc'), seg.nethackrc || '');
    // Reset rng log
    await fs.writeFile(rngLogPath, '');
    // Only wipe state on the first segment.  A multi-segment session
    // can be a save/restore pair: seg 0 ends with save+quit, seg 1
    // restarts NetHack and restores from the save file in
    // <install>/save/.  Clearing between segments would destroy that
    // save file and turn the restore into a fresh game.
    if (isFirstSegment) await clearStaleState(installDir);

    const playerName = parseNethackrcName(seg.nethackrc) ?? '';
    const args = ['-u', playerName];

    const env = {
        ...process.env,
        NETHACKDIR: installDir,
        HACKDIR: installDir,
        HOME: homeDir,
        TERM: 'xterm-256color',
        TZ: tz,
        NETHACK_NO_DELAY: '1',
        NETHACK_SEED: String(seg.seed ?? 0),
        NETHACK_FIXED_DATETIME: seg.datetime || '20000110090000',
        NETHACK_RNGLOG: rngLogPath,
        NOMUX_MARKERS: '1',
        NETHACK_RAW_KEYS: '1',
    };

    // Some legacy sessions have steps[].key populated but moves
    // empty. Fall back to reconstructing moves from step keys
    // (skipping the null initial step) so they replay.
    let moves = seg.moves ?? '';
    if (!moves && Array.isArray(seg.steps)) {
        const reconstructed = [];
        for (const s of seg.steps) {
            if (s.key != null) reconstructed.push(s.key);
        }
        moves = reconstructed.join('');
    }
    if (prompt) moves = moves.replace(/\r/gu, '\n');
    const prefixLength = moves.length;
    const controller = prompt ? createPromptController(prompt) : null;
    // A clean v5 recording is also the replay recipe, so its existing step
    // count is the completion contract.  This matters for games which end
    // before consuming every planned key: they legitimately have fewer than
    // moves.length + 1 input boundaries.  Recipes without steps retain the
    // ordinary initial-boundary-plus-one-per-key fallback.
    let expectedSteps;
    if (Object.hasOwn(seg, 'steps')) {
        if (!Array.isArray(seg.steps) || seg.steps.length === 0) {
            throw new Error('segment steps must be a non-empty array');
        }
        expectedSteps = seg.steps.length;
    } else {
        expectedSteps = moves.length + 1;
    }
    const terminalKey = terminalInputKey(seg);
    const steps = [];
    let lastRngBytes = 0;
    let nextKeyIdx = 0;
    let emittedMoves = '';
    let timeoutHandle = null;
    let forceKillHandle = null;
    let terminationRequested = false;
    let pendingFailure = null;
    let completionStop = null;
    let totalTimeout = null;
    let resolveDone, rejectDone;
    let settled = false;
    const done = new Promise((res, rej) => {
        resolveDone = (v) => { if (!settled) { settled = true; res(v); } };
        rejectDone = (e) => { if (!settled) { settled = true; rej(e); } };
    });

    const armTimeout = (ms, why) => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        timeoutHandle = setTimeout(() => {
            fail(new Error(`recorder timeout: ${why} (after ${ms}ms)`));
        }, ms);
    };

    if (deadline && Date.now() >= deadline) {
        const command = {argv: [binary, ...args], launched: false, exitCode: null, signal: null, error: null};
        await onReceipt({kind: 'command-outcome', status: 'deadline-exhausted', ...command});
        return {steps: [], terminalExit: null, moves: '', promptResult: {
            status: 'deadline-exhausted', observerSuccess: false, command, decisions: []}};
    }
    const child = spawn(binary, args, {
        env,
        stdio: ['pipe', 'pipe', 'inherit'],
    });
    let launched = false;
    child.once('spawn', () => {
        launched = true;
        onSpawn();
        if (controller || preserveFailure) chain = chain.then(() => onReceipt({
            kind: 'child-start', argv: [binary, ...args], launched: true})).catch(fail);
    });
    child.stdin.on('error', error => { if (controller || preserveFailure) fail(error); });

    armTimeout(20000, 'first marker');

    const readRngDelta = async () => {
        let rngText = '';
        try {
            const fh = await fs.open(rngLogPath, 'r');
            try {
                const st = await fh.stat();
                if (st.size > lastRngBytes) {
                    const buf = Buffer.alloc(st.size - lastRngBytes);
                    await fh.read(buf, 0, buf.length, lastRngBytes);
                    rngText = buf.toString('utf8');
                    lastRngBytes = st.size;
                }
            } finally {
                await fh.close();
            }
        } catch {}
        return parseRngLines(rngText);
    };

    const terminateChild = (intentional) => {
        if (intentional) terminationRequested = true;
        try { child.kill('SIGTERM'); } catch {}
        // Force close in case it ignores SIGTERM.
        forceKillHandle = setTimeout(() => {
            try { child.kill('SIGKILL'); } catch {}
        }, 1000);
        forceKillHandle.unref();
    };

    const fail = (err) => {
        if (pendingFailure) return;
        pendingFailure = err;
        parser.stop();
        if (timeoutHandle) clearTimeout(timeoutHandle);
        terminateChild(false);
    };

    const finish = () => {
        parser.stop();
        if (timeoutHandle) clearTimeout(timeoutHandle);
        terminateChild(true);
    };
    if (controller || deadline) totalTimeout = setTimeout(() => {
        completionStop = 'time-cap';
        fail(new Error('prompt completion total time cap'));
    }, deadline ? Math.max(1, deadline - Date.now()) : controller.plan.maxMs);

    // Buffer of 'anim' markers received between consecutive 'input'
    // markers.  When the next input marker closes a step, the buffered
    // anim screens are attached to that step as `animation_frames`,
    // preserving order and step-attribution without any in-stream events.
    let pendingAnimFrames = [];
    const onMarker = async (m) => {
        if (pendingFailure || terminationRequested) return;
        if (m.kind === 'anim') {
            const frame = {
                screen: encodeScreenAnsiRle(payloadToLines(m.payload)),
                cursor: [m.cx, m.cy, 1],
            };
            pendingAnimFrames.push(frame);
            if (controller || preserveFailure) await onReceipt({kind: 'animation-frame', frameIndex: steps.length, ...frame});
            return;
        }
        if (m.kind !== 'input') return;
        if (!controller && steps.length >= expectedSteps) {
            // We have everything we need; tear down.
            finish();
            return;
        }
        try {
            const screen = encodeScreenAnsiRle(payloadToLines(m.payload));
            const rng = await readRngDelta();
            const stepIdx = m.seq - 1;
            if ((controller || preserveFailure) && stepIdx !== steps.length)
                throw new Error('nonsequential input marker');
            const key = stepIdx === 0 ? null : moves[stepIdx - 1] ?? null;
            const step = { key, rng, screen, cursor: [m.cx, m.cy, 1] };
            if (pendingAnimFrames.length) {
                step.animation_frames = pendingAnimFrames;
                pendingAnimFrames = [];
            }
            steps.push(step);

            if (controller || preserveFailure) {
                await onReceipt({kind: 'frame', frameIndex: steps.length - 1, markerSeq: m.seq, ...step});
                if (pendingFailure) return;
            }
            if (controller) {
                if (nextKeyIdx >= prefixLength) {
                    const decision = controller.decide({...step, frameIndex: steps.length - 1});
                    await onReceipt({kind: 'decision', ...controller.decisions.at(-1)});
                    if (pendingFailure) return;
                    if (decision.stop) {
                        completionStop = decision.stop;
                        finish();
                        return;
                    }
                    moves += decision.key;
                }
                const k = moves[nextKeyIdx++];
                await onReceipt({kind: 'key-intent', index: nextKeyIdx - 1,
                    frameIndex: steps.length - 1, key: k, bytes: Buffer.from(k, 'utf8').toString('hex')});
                if (pendingFailure) return;
                child.stdin.write(Buffer.from(k, 'utf8'));
                emittedMoves += k;
                if (controller.decisions.at(-1)) controller.decisions.at(-1).sent = true;
                await onReceipt({kind: 'key-written', index: nextKeyIdx - 1});
                armTimeout(20000, `after key ${nextKeyIdx}`);
                return;
            }

            if (steps.length >= expectedSteps) {
                if (terminalKey !== null && nextKeyIdx === moves.length) {
                    // A successful game-ending input emits its last real
                    // frame before the process finishes. Let NetHack reach
                    // its own successful exit instead of racing it with
                    // SIGTERM.
                    armTimeout(10000, 'awaiting successful terminal exit');
                } else {
                    finish();
                }
                return;
            }
            if (nextKeyIdx < moves.length) {
                let k = moves[nextKeyIdx++];
                // The canonical sessions were captured under tmux, whose pty
                // line discipline maps incoming CR (\r) to LF (\n) before the
                // application reads it (ICRNL).  Our pipe-based stdin has no
                // line discipline, so we replicate that translation on the
                // way out.  (DEL / 0x7f is fine to send verbatim because the
                // patched gettty seeds erase_char with '\177'.)
                if (k === '\r') k = '\n';
                if (preserveFailure) {
                    await onReceipt({kind: 'key-intent', index: nextKeyIdx - 1,
                        frameIndex: steps.length - 1, key: k, bytes: Buffer.from(k, 'utf8').toString('hex')});
                    if (pendingFailure) return;
                }
                child.stdin.write(Buffer.from(k, 'utf8'));
                if (preserveFailure) await onReceipt({kind: 'key-written', index: nextKeyIdx - 1});
                armTimeout(20000, `after key ${nextKeyIdx}/${moves.length}`);
            } else if (!child.stdin.writableEnded) {
                try { child.stdin.end(); } catch {}
                armTimeout(10000, 'awaiting process exit');
            }
        } catch (err) {
            fail(err);
        }
    };

    // Serialize marker handling: parser._drain() calls onMarker
    // synchronously, but onMarker is async (file IO + stdin write).
    // Without a queue, two markers in one chunk would race the
    // shared lastRngBytes pointer.
    let chain = Promise.resolve();
    const serialMarker = (m) => {
        chain = chain.then(() => onMarker(m)).catch(fail);
    };
    const parser = new MarkerParser(serialMarker);
    child.stdout.on('data', (chunk) => {
        try { parser.push(chunk); } catch (err) { fail(err); }
    });
    child.stdout.on('error', (err) => fail(err));
    child.on('error', (err) => fail(err));
    child.on('close', (code, signal) => {
        if (totalTimeout) clearTimeout(totalTimeout);
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (forceKillHandle) clearTimeout(forceKillHandle);
        // Capture shutdown intent at the instant the process closes. Marker
        // work below can still reach finish(), but it must not retroactively
        // turn a crash into an intentional termination.
        const terminationWasRequested = terminationRequested;
        // `close` can race async marker handling.  Wait for the queue before
        // deciding whether the process produced the complete recording.
        chain.then(async () => {
            parser.stop();
            if (controller || preserveFailure) {
                const expectedSignal = terminationWasRequested && ['SIGTERM', 'SIGKILL'].includes(signal);
                const processOk = (code === 0 && signal === null) || expectedSignal;
                const status = pendingFailure ? 'recorder-failure'
                    : !processOk ? 'process-failure' : completionStop
                        || (!controller && steps.length === expectedSteps ? 'static-complete' : 'premature-exit');
                const command = {argv: [binary, ...args], launched, exitCode: code, signal,
                    intentionalTermination: terminationWasRequested, error: pendingFailure?.message || null};
                await onReceipt({kind: 'command-outcome', status, ...command});
                resolveDone({steps, terminalExit: null, moves: emittedMoves,
                    promptResult: {status, observerSuccess: status === 'success', command,
                        decisions: controller?.decisions || []}});
                return;
            }
            if (pendingFailure) throw pendingFailure;
            const exitDescription = signal ? `signal ${signal}` : `exit code ${code ?? 'unknown'}`;
            if (code !== null && code !== 0) {
                throw new Error(
                    `recorder exited with ${exitDescription} after `
                    + `${steps.length}/${expectedSteps} input boundaries`);
            }
            const terminalExit = successfulTerminalExit({
                exitCode: code,
                signal,
                terminalKey,
                moves,
                nextKeyIndex: nextKeyIdx,
                stepCount: steps.length,
                expectedSteps,
            });
            if (steps.length !== expectedSteps && !terminalExit) {
                throw new Error(
                    `recorder exited before recording all input boundaries: `
                    + `got ${steps.length}, expected ${expectedSteps} (${exitDescription})`);
            }
            const expectedTerminationSignal = terminationWasRequested
                && (signal === 'SIGTERM' || signal === 'SIGKILL');
            if (signal && !expectedTerminationSignal) {
                throw new Error(`recorder exited unexpectedly with ${exitDescription}`);
            }
            resolveDone({
                steps: steps.slice(0, expectedSteps),
                command: {argv: [binary, ...args], exitCode: code, signal},
                terminalExit: terminalExit ? {
                    key: terminalKey,
                    exitCode: code,
                    finalBoundaryCaptured: steps.length === expectedSteps,
                } : null,
            });
        }).catch(rejectDone);
    });

    return done;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function exists(p) {
    try { await fs.access(p, fsConstants.F_OK); return true; }
    catch { return false; }
}

async function main() {
    const argv = process.argv.slice(2);
    if (argv.length === 1 && (argv[0] === '-h' || argv[0] === '--help')) {
        console.log(USAGE);
        return;
    }
    if (argv.length === 0) {
        console.error(USAGE);
        process.exitCode = 2;
        return;
    }
    const positional = [], options = {};
    const flags = ['--prompt-plan', '--prompt-receipt', '--emitted-recipe'];
    for (let i = 0; i < argv.length; ++i) {
        const arg = argv[i];
        if (flags.includes(arg)) {
            if (options[arg] || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(USAGE);
            options[arg] = path.resolve(argv[++i]);
        } else if (arg.startsWith('-')) throw new Error(USAGE);
        else positional.push(arg);
    }
    const adaptive = flags.some(flag => options[flag]);
    if (positional.length > 2 || positional.length < 1
        || (adaptive && (positional.length !== 2 || flags.some(flag => !options[flag])))) {
        throw new Error(USAGE);
    }
    const inputPath = path.resolve(positional[0]);
    const outputPath = positional[1] ? path.resolve(positional[1]) : inputPath;

    const binary = process.env.NETHACK_BINARY || DEFAULT_BINARY;
    let installDir = process.env.NETHACK_INSTALL || DEFAULT_INSTALL;
    if (process.env.RERECORD_TZ
        && process.env.RERECORD_TZ !== RECORDER_TIME_ZONE) {
        throw new Error(
            'RERECORD_TZ cannot override the canonical America/New_York '
            + 'recorder timezone because timezone is absent from judge inputs',
        );
    }
    const tz = RECORDER_TIME_ZONE;
    const recorderIsDst = canonicalRecorderIsDst();

    if (!await exists(binary)) {
        throw new Error(`recorder binary not found: ${binary}\n  build it via nethack-c/build-recorder.sh`);
    }
    if (!await exists(installDir)) {
        throw new Error(`install dir not found: ${installDir}`);
    }

    const session = await loadSession(inputPath);
    let prompt = null, onReceipt;
    const receiptPath = options['--prompt-receipt'];
    const emittedPath = options['--emitted-recipe'];
    const journalPath = receiptPath && `${receiptPath}.jsonl`;
    const replayPath = adaptive && `${outputPath}.replay.json`;
    if (adaptive) {
        if (!process.env.NETHACK_BINARY || !process.env.NETHACK_INSTALL
            || path.resolve(binary) === DEFAULT_BINARY || path.resolve(installDir) === DEFAULT_INSTALL)
            throw new Error('prompt mode requires explicit private NETHACK_BINARY and NETHACK_INSTALL');
        const paths = [inputPath, outputPath, options['--prompt-plan'], receiptPath,
            emittedPath, journalPath, replayPath];
        if (new Set(paths).size !== paths.length) throw new Error('prompt artifacts must have distinct paths');
        for (const file of [outputPath, receiptPath, emittedPath, journalPath, replayPath]) {
            if (await exists(file)) throw new Error(`prompt artifact already exists: ${file}`);
        }
        if (session.segments.length !== 1 || Object.hasOwn(session.segments[0], 'steps')
            || Object.hasOwn(session.segments[0], 'terminalInputKey')
            || typeof session.segments[0].moves !== 'string'
            || !session.segments[0].moves || session.segments[0].moves.length > 10000)
            throw new Error('prompt mode requires one input-only nonterminal segment with 1..10000 prefix keys');
        const bytes = await fs.readFile(options['--prompt-plan']);
        prompt = validatePromptPlan(JSON.parse(bytes));
        for (const source of prompt.sources) {
            if (digest(await fs.readFile(path.join(TEMPLATE_ROOT, source.path))) !== source.sha256)
                throw new Error(`prompt source binding changed: ${source.path}`);
        }
        onReceipt = event => fs.appendFile(journalPath, `${JSON.stringify(event)}\n`, {flush: true});
        await fs.writeFile(journalPath, `${JSON.stringify({kind: 'frozen-plan', plan: prompt,
            planSha256: digest(bytes), inputSha256: digest(await fs.readFile(inputPath)),
            command: {argv: [process.execPath, ...process.argv.slice(1)], binary,
                binarySha256: digest(await fs.readFile(binary)), timezone: tz,
                node: process.version},
            segment: session.segments[0], startedAt: new Date().toISOString()})}\n`, {flag: 'wx', flush: true});
    }
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nh-rec-'));
    const rngLogPath = path.join(tmpDir, 'rng.log');
    const homeDir = path.join(tmpDir, 'home');

    try {
        if (installDirTooLong(installDir)) {
            const staged = path.join(tmpDir, 'install');
            await fs.cp(installDir, staged, { recursive: true });
            console.error(`[note] NetHack ignores a NETHACKDIR longer than ${NETHACKDIR_MAX_LENGTH} characters; recording from a copy at ${staged}`);
            installDir = staged;
        }
        const newSegments = [];
        const deadline = prompt ? Date.now() + prompt.maxMs : null;
        for (let i = 0; i < session.segments.length; i++) {
            const seg = session.segments[i];
            console.error(`[seg ${i + 1}/${session.segments.length}] seed=${seg.seed} moves=${(seg.moves || '').length}`);
            const result = await recordSegment({
                seg,
                isFirstSegment: i === 0,
                binary,
                installDir,
                rngLogPath,
                homeDir,
                tz,
                prompt,
                onReceipt: prompt ? event => onReceipt({run: 'capture', ...event}) : undefined,
                deadline,
            });
            const out = {
                seed: seg.seed,
                datetime: seg.datetime,
                nethackrc: seg.nethackrc,
                moves: result.moves ?? seg.moves,
                recorderIsDst,
                steps: result.steps,
            };
            if (result.terminalExit) out.terminalExit = result.terminalExit;
            // Preserve any extra per-segment fields (e.g. checkpoints) that
            // existed in the input — we only overwrite steps.
            for (const k of Object.keys(seg)) {
                if (!(k in out)) out[k] = seg[k];
            }
            newSegments.push(out);
            if (prompt) {
                // This recipe contains only actual keys and original input
                // fields. It cannot silently invoke the adaptive policy.
                const emitted = {...session, segments: [{...seg, moves: result.moves}]};
                await fs.writeFile(emittedPath, JSON.stringify(emitted), {flag: 'wx'});
                const captureRuns = result.promptResult.command.launched ? 1 : 0;
                let replay = {status: 'not-required', physicalRuns: captureRuns};
                if (result.promptResult.observerSuccess) {
                    let replayLaunched = false;
                    try {
                        const check = await replayWithinDeadline(deadline, async () => {
                            await onReceipt({kind: 'static-replay-start', recipeSha256: digest(JSON.stringify(emitted))});
                            return recordSegment({seg: emitted.segments[0], isFirstSegment: true,
                                binary, installDir, rngLogPath, homeDir, tz, deadline, preserveFailure: true,
                                onSpawn: () => { replayLaunched = true; },
                                onReceipt: event => onReceipt({run: 'replay', ...event})});
                        });
                        if (!check || !check.promptResult.command.launched) {
                            replay = {status: check?.promptResult.status || 'deadline-exhausted',
                                physicalRuns: captureRuns,
                                ...(check ? {command: check.promptResult.command} : {})};
                        } else {
                            const replayDoc = {...session, segments: [{...out, steps: check.steps}]};
                            await fs.writeFile(replayPath, JSON.stringify(replayDoc), {flag: 'wx'});
                            replay = {status: check.promptResult.status !== 'static-complete' ? 'failed'
                                : JSON.stringify(check.steps) === JSON.stringify(result.steps)
                                    ? 'matched' : 'mismatched', physicalRuns: captureRuns + 1,
                                command: check.promptResult.command};
                        }
                    } catch (error) {
                        replay = {status: 'failed', physicalRuns: captureRuns + Number(replayLaunched),
                            error: error.message};
                    }
                    await onReceipt({kind: 'static-replay-outcome', ...replay});
                }
                const receipt = {schemaVersion: 1, ...result.promptResult, replay,
                    inputOnlyRecipeSha256: digest(JSON.stringify(emitted)),
                    captureComplete: result.promptResult.observerSuccess && replay.status === 'matched'};
                await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2), {flag: 'wx'});
                if (!receipt.captureComplete) process.exitCode = 2;
            }
        }

        const outDoc = {
            version: 5,
            segments: newSegments,
        };
        for (const k of Object.keys(session)) {
            if (k !== 'version' && k !== 'segments') outDoc[k] = session[k];
        }

        await fs.writeFile(outputPath, JSON.stringify(outDoc));
        console.error(`[ok] wrote ${outputPath}`);
    } finally {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
}

// Run only as a script; the test imports the path-length helper above.
if (process.argv[1]
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().then(code => {
        if (code !== undefined) process.exitCode = code;
    }).catch((err) => {
        console.error('[fail]', err.message || err);
        process.exit(1);
    });
}
