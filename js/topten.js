// topten.js -- high-score formatting and display.
// C ref: src/topten.c.

import {
    COLNO,
    ENTRYMAX,
    KILLED_BY,
    KILLED_BY_AN,
    NO_KILLER_PREFIX,
    PANICKED,
    PERSMAX,
    POINTSMIN,
    VERSION_MAJOR,
    VERSION_MINOR,
    PATCHLEVEL,
} from './const.js';
import { yyyymmdd } from './calendar.js';
import { depth, deepest_lev_reached } from './dungeon.js';
import { game } from './gstate.js';
import { highc, onlyspace, ordin, strsubst } from './hacklib.js';
import { an } from './objnam.js';
import { genders, aligns } from './roles.js';
import { vfsReadFile, vfsWriteFile } from './storage.js';
import { tty_raw_print, tty_raw_print_bold } from './tty_rawprint.js';

// C ref: topten.c:96-105 killed_by_prefix[].  Indexed by game_end_types
// (hack.h:483-498): DIED, CHOKING, POISONING, STARVING, DROWNING, BURNING,
// DISSOLVED, CRUSHING, STONING, TURNED_SLIME, GENOCIDED, PANICKED, TRICKED,
// QUIT, ESCAPED, ASCENDED.
const killed_by_prefix = Object.freeze([
    'killed by ', 'choked on ', 'poisoned by ', 'died of ',
    'drowned in ', 'burned by ', 'dissolved in ', 'crushed to death by ',
    'petrified by ', 'turned to slime by ', 'killed by ',
    '', '', '', '', '',
]);

// C ref: topten.c formatkiller() (90-162).  Builds the death description
// string for the tombstone, bones grave inscription, and score file.
//
// The C version writes into a fixed-size char buffer; the JS version returns
// a new string (no size limit).
export function formatkiller(how, incl_helpless, state = game) {
    const killer = state.killer;
    let kname = killer.name ?? '';

    const parts = [];
    switch (killer.format) {
    default:
        // C: impossible("bad killer format? (%d)", killer.format);
        // fall through
    case NO_KILLER_PREFIX:
        break;
    case KILLED_BY_AN:
        kname = an(kname);
        // fall through
    case KILLED_BY:
        parts.push(killed_by_prefix[how] ?? '');
        break;
    }

    // Copy kname, sanitizing characters that would confuse field splitting
    // when record/logfile/xlogfile is re-read.
    const sanitized = [];
    for (const ch of kname) {
        if (ch === ',') sanitized.push(';');
        else if (ch === '=') sanitized.push('_');
        else if (ch === '\t') sanitized.push(' ');
        else sanitized.push(ch);
    }
    parts.push(sanitized.join(''));

    // C ref: topten.c:152-161. Append helpless reason when the hero was
    // paralyzed (multi < 0) at time of death.
    if (incl_helpless && (state.multi ?? 0) < 0) {
        if (state.multi_reason) {
            parts.push(`, while ${state.multi_reason}`);
        } else {
            parts.push(', while helpless');
        }
    }

    return parts.join('');
}

// ---- topten struct, I/O, and display (C ref: topten.c:38-926) ----

const NAMSZ = 10;
const DTHSZ = 100;
const ROLESZ = 3;
// pers_is_uid: the C build uses uid-based per-player limits; all JS games
// share a single constant uid so the behavior matches.
const PERS_IS_UID = true;
const JS_UID = 501;

// C ref: topten.c:38-55 struct toptenentry, 61 zerott.
function newttentry() {
    return {
        points: 0,
        deathdnum: 0, deathlev: 0,
        maxlvl: 0, hp: 0, maxhp: 0, deaths: 0,
        ver_major: 0, ver_minor: 0, patchlevel: 0,
        deathdate: 0, birthdate: 0,
        uid: 0,
        plrole: '', plrace: '', plgend: '', plalign: '',
        name: '', death: '',
        tt_next: null,
    };
}

// C ref: topten.c:182-204 observable_depth(). The #if 0 block for endgame
// planes is disabled in C, so this is just depth().
export function observable_depth(lev, state = game) {
    return depth(lev, state);
}

// C ref: topten.c:219-298 readentry(). Parses one record line in the format
// produced by writeentry(). Returns a populated toptenentry or one with
// points == 0 on failure.
function readentry(line) {
    const tt = newttentry();
    if (!line) return tt;

    // fmt: "%d.%d.%d %ld %d %d %d %d %d %d %ld %ld %d "
    // then: "%s %s %s %s %[^,],%[^\n]"
    const match = line.match(
        /^(\d+)\.(\d+)\.(\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (.*)$/,
    );
    if (!match) return tt;

    tt.ver_major = parseInt(match[1], 10);
    tt.ver_minor = parseInt(match[2], 10);
    tt.patchlevel = parseInt(match[3], 10);
    tt.points = parseInt(match[4], 10);
    tt.deathdnum = parseInt(match[5], 10);
    tt.deathlev = parseInt(match[6], 10);
    tt.maxlvl = parseInt(match[7], 10);
    tt.hp = parseInt(match[8], 10);
    tt.maxhp = parseInt(match[9], 10);
    tt.deaths = parseInt(match[10], 10);
    tt.deathdate = parseInt(match[11], 10);
    tt.birthdate = parseInt(match[12], 10);
    tt.uid = parseInt(match[13], 10);

    const rest = match[14];
    // Version < 3.3 uses a two-char format; version >= 3.3 uses
    // "%s %s %s %s %[^,],%[^\n]" for role race gender alignment name,death.
    if (tt.ver_major < 3 || (tt.ver_major === 3 && tt.ver_minor < 3)) {
        // Old format: not expected in practice for version 5.0.0 records.
        tt.points = 0;
        return tt;
    }
    // fmt33: "%s %s %s %s %[^,],%[^\n]"
    const m2 = rest.match(/^(\S+) (\S+) (\S+) (\S+) ([^,]*),(.*)$/);
    if (!m2) {
        tt.points = 0;
        return tt;
    }
    tt.plrole = m2[1].substring(0, ROLESZ);
    tt.plrace = m2[2].substring(0, ROLESZ);
    tt.plgend = m2[3].substring(0, ROLESZ);
    tt.plalign = m2[4].substring(0, ROLESZ);
    tt.name = m2[5].substring(0, NAMSZ);
    tt.death = m2[6].substring(0, DTHSZ);

    // Y2K fixups
    if (tt.points > 0) {
        if (tt.birthdate < 19000000) tt.birthdate += 19000000;
        if (tt.deathdate < 19000000) tt.deathdate += 19000000;
    }
    return tt;
}

// C ref: topten.c:300-332 writeentry(). Produces the text line for one record.
function writeentry(tt) {
    // fmt0: "%d.%d.%d %ld %d %d %d %d %d %d %ld %ld %d "
    let line = `${tt.ver_major}.${tt.ver_minor}.${tt.patchlevel}`
        + ` ${tt.points}`
        + ` ${tt.deathdnum} ${tt.deathlev} ${tt.maxlvl}`
        + ` ${tt.hp} ${tt.maxhp} ${tt.deaths}`
        + ` ${tt.deathdate} ${tt.birthdate} ${tt.uid} `;
    // fmt33: "%s %s %s %s "
    line += `${tt.plrole} ${tt.plrace} ${tt.plgend} ${tt.plalign} `;
    // fmtX: "%s,%s"
    const name = onlyspace(tt.name) ? '_' : tt.name;
    line += `${name},${tt.death}`;
    return line;
}

// C ref: topten.c:928-940 outheader().
function outheader(state) {
    // " No  Points     Name" padded to COLNO-9, then "Hp [max]"
    let line = ' No  Points     Name';
    while (line.length < COLNO - 9) line += ' ';
    line += 'Hp [max]';
    topten_print(state, line);
}

// C ref: topten.c:164-180 topten_print() / topten_print_bold().
// iflags.toptenwin defaults to false, so we always use raw_print.
function topten_print(state, str) {
    tty_raw_print(state, str);
}

function topten_print_bold(state, str) {
    tty_raw_print_bold(state, str);
}

// C ref: topten.c:945-1107 outentry(). Formats and prints one score entry.
// The `so` flag makes the current entry bold and padded to COLNO-1.
function outentry(rank, t1, so, state) {
    let secondLine = true;
    let linebuf = '';

    if (rank) {
        linebuf += String(rank).padStart(3, ' ');
    } else {
        linebuf += '   ';
    }

    // points: 10 columns right-justified; name: 10 chars left-justified.
    const pts = t1.points ? t1.points : state.u.urexp;
    linebuf += ` ${String(pts).padStart(10, ' ')}  ${t1.name.substring(0, 10)}`;
    linebuf += `-${t1.plrole}`;
    if (t1.plrace[0] !== '?') linebuf += `-${t1.plrace}`;
    linebuf += `-${t1.plgend}`;
    if (t1.plalign[0] !== '?') linebuf += `-${t1.plalign} `;
    else linebuf += ' ';

    if (t1.death.startsWith('escaped')) {
        const after7 = t1.death.substring(7);
        const paren = after7.startsWith(' (') ? after7.substring(2) : '';
        linebuf += `escaped the dungeon ${paren}[max level ${t1.maxlvl}]`;
        // fixup for closing paren
        const parenIdx = linebuf.indexOf(')');
        if (parenIdx >= 0) {
            if (t1.deathdnum === state.astral_level?.dnum) {
                linebuf = linebuf.substring(0, parenIdx);
            } else {
                linebuf = linebuf.substring(0, parenIdx) + ' '
                    + linebuf.substring(parenIdx + 1);
            }
        }
        secondLine = false;
    } else if (t1.death.startsWith('ascended')) {
        linebuf += `ascended to demigod${t1.plgend[0] === 'F' ? 'dess' : ''}-hood`;
        secondLine = false;
    } else {
        if (t1.death.startsWith('quit')) {
            linebuf += 'quit';
            secondLine = false;
        } else if (t1.death.startsWith('died of st')) {
            linebuf += 'starved to death';
            secondLine = false;
        } else if (t1.death.startsWith('choked')) {
            linebuf += `choked on h${t1.plgend[0] === 'F' ? 'er' : 'is'} food`;
        } else if (t1.death.startsWith('poisoned')) {
            linebuf += 'was poisoned';
        } else if (t1.death.startsWith('crushed')) {
            linebuf += 'was crushed to death';
        } else if (t1.death.startsWith('petrified by ')) {
            linebuf += 'turned to stone';
        } else {
            linebuf += 'died';
        }

        if (t1.deathdnum === state.astral_level?.dnum) {
            let arg, fmt;
            switch (t1.deathlev) {
            case -5: fmt = ' on the %s Plane'; arg = 'Astral'; break;
            case -4: fmt = ' on the Plane of %s'; arg = 'Water'; break;
            case -3: fmt = ' on the Plane of %s'; arg = 'Fire'; break;
            case -2: fmt = ' on the Plane of %s'; arg = 'Air'; break;
            case -1: fmt = ' on the Plane of %s'; arg = 'Earth'; break;
            default: fmt = ' on the Plane of %s'; arg = 'Void'; break;
            }
            linebuf += fmt.replace('%s', arg);
        } else {
            const dname = state.dungeons?.[t1.deathdnum]?.dname
                ?? 'The Dungeons of Doom';
            linebuf += ` in ${dname}`;
            if (t1.deathdnum !== state.knox_level?.dnum)
                linebuf += ` on level ${t1.deathlev}`;
            if (t1.deathlev !== t1.maxlvl)
                linebuf += ` [max ${t1.maxlvl}]`;
        }

        // kludge for "quit while already on Charon's boat"
        if (t1.death.startsWith('quit '))
            linebuf += t1.death.substring(4);
    }
    linebuf += '.';

    // Quit, starved, ascended, and escaped contain no second line.
    if (secondLine) {
        let deathDesc = `  ${highc(t1.death[0])}${t1.death.substring(1)}.`;
        // Fix up "Killed by Mr. Asidonhopo; the shopkeeper" -> ", the"
        deathDesc = strsubst(deathDesc, '; the ', ', the ');
        linebuf += deathDesc;
    }

    // HP column
    let hpbuf;
    if (t1.hp <= 0) {
        hpbuf = '-';
    } else {
        hpbuf = String(t1.hp);
    }
    // hppos: beginning of hp column after padding
    const hpposHeader = COLNO - 'Hp [max]'.length - 2; // sizeof "  Hp [max]" - sizeof ""
    let lngr = linebuf.length;

    while (lngr >= hpposHeader) {
        // Find a space to wrap at, searching backward from hppos
        let bp = hpposHeader - 1;
        while (bp > 0 && !(linebuf[bp] === ' ' && bp < hpposHeader)) bp--;
        // special case: word is too long, wrap in the middle
        if (bp <= 15) bp = hpposHeader - 1;
        // special case: if about to wrap in the middle of "[max", wrap before
        if (bp > 5 && linebuf.substring(bp - 5, bp) === ' [max')
            bp -= 5;

        let linebuf3;
        if (linebuf[bp] !== ' ') {
            linebuf3 = linebuf.substring(bp);
        } else {
            linebuf3 = linebuf.substring(bp + 1);
        }
        linebuf = linebuf.substring(0, bp);

        if (so) {
            linebuf = linebuf.padEnd(COLNO - 1, ' ');
            topten_print_bold(state, linebuf);
        } else {
            topten_print(state, linebuf);
        }
        linebuf = ''.padStart(15, ' ') + ' ' + linebuf3;
        lngr = linebuf.length;
    }

    // beginning of hp column not including padding
    const hppos = COLNO - 7 - hpbuf.length;

    if (linebuf.length <= hppos) {
        linebuf = linebuf.padEnd(hppos, ' ');
        linebuf += hpbuf;
        const maxhpPad = t1.maxhp < 10 ? '  ' : t1.maxhp < 100 ? ' ' : '';
        linebuf += ` ${maxhpPad}[${t1.maxhp}]`;
    }

    if (so) {
        linebuf = linebuf.padEnd(COLNO - 1, ' ');
        topten_print_bold(state, linebuf);
    } else {
        topten_print(state, linebuf);
    }
}

// C ref: topten.c:628-926 topten(). Main entry point: creates a new entry,
// reads the record file from VFS storage, inserts the entry, rewrites the
// file, and displays the relevant portion of the high-score list.
export function topten(how, when, state = game) {
    if (state.program_state?.panicking) return;

    // C: iflags.toptenwin defaults to false; skip NHW_TEXT window creation.

    if (state.wizard || state.discover) {
        if (how !== PANICKED) {
            topten_print(state, '');
            const modeWord = state.wizard ? 'wizard' : 'discover';
            topten_print(state,
                `Since you were in ${modeWord} mode, `
                + 'the score list will not be checked.');
        }
        return;
    }

    // C ref: topten.c:754. Print an initial blank line before processing.
    topten_print(state, '');

    // Build new entry for this game.
    const t0 = newttentry();
    t0.ver_major = VERSION_MAJOR;
    t0.ver_minor = VERSION_MINOR;
    t0.patchlevel = PATCHLEVEL;
    t0.points = state.u.urexp;
    t0.deathdnum = state.u.uz.dnum;
    t0.deathlev = observable_depth(state.u.uz, state);
    t0.maxlvl = deepest_lev_reached(state, true);
    t0.hp = state.u.uhp;
    t0.maxhp = state.u.uhpmax;
    t0.deaths = state.u.umortality;
    t0.uid = JS_UID;
    t0.plrole = (state.urole?.filecode ?? '???').substring(0, ROLESZ);
    t0.plrace = (state.urace?.filecode ?? '???').substring(0, ROLESZ);
    t0.plgend = (genders[state.flags.female ? 1 : 0]?.filecode ?? 'Mal')
        .substring(0, ROLESZ);
    t0.plalign = (aligns[1 - (state.u.ualign?.type ?? 0)]?.filecode ?? '???')
        .substring(0, ROLESZ);
    t0.name = (state.plname ?? '').substring(0, NAMSZ);
    t0.death = formatkiller(how, true, state).substring(0, DTHSZ);
    t0.birthdate = yyyymmdd(state, state.ubirthday);
    t0.deathdate = yyyymmdd(state, when);
    t0.tt_next = null;

    // Read existing record file from VFS storage.
    const recordData = vfsReadFile('record');
    const existingLines = recordData
        ? recordData.split('\n').filter((l) => l.length > 0) : [];

    // Build linked list from existing entries.
    const entries = existingLines.map(readentry).filter((e) => e.points > 0);

    // C ref: topten.c:757-758. Assure minimum number of points before the
    // insertion loop, so a below-minimum entry is never inserted.
    if (t0.points < POINTSMIN) t0.points = 0;

    // Insert t0 into sorted position and enforce per-player limits.
    let rank0 = -1; // -1 undefined, 0 not_on_list, n = rank on list
    let rank1 = 0;
    let occ_cnt = PERSMAX;
    let flg = 0;
    const allEntries = [];  // flat array in rank order
    let t0_inserted = false;
    let rank = 1;

    for (let i = 0; i <= entries.length; i++) {
        const t1 = i < entries.length ? entries[i] : newttentry();
        if (t1.points < POINTSMIN) t1.points = 0;

        if (rank0 < 0 && t1.points < t0.points && !t0_inserted) {
            rank0 = rank++;
            allEntries.push(t0);
            t0_inserted = true;
            occ_cnt--;
            flg++;
            // t0 was inserted before t1, now process t1 normally
        }

        if (t1.points === 0) break;

        // Per-player limit check
        const samePlayer = PERS_IS_UID
            ? t1.uid === t0.uid
            : t1.name.substring(0, NAMSZ) === t0.name.substring(0, NAMSZ);
        if (samePlayer
            && t1.plrole.substring(0, ROLESZ) === t0.plrole.substring(0, ROLESZ)
            && --occ_cnt <= 0) {
            if (rank0 < 0) {
                rank0 = 0;
                rank1 = rank;
                topten_print(state,
                    `You didn't beat your previous score of ${t1.points} points.`);
                topten_print(state, '');
            }
            if (occ_cnt < 0) {
                flg++;
                continue; // drop this entry
            }
        }

        if (rank <= ENTRYMAX) {
            allEntries.push(t1);
            rank++;
        }
        if (rank > ENTRYMAX) break;
    }

    // If t0 wasn't inserted yet (scores lower than all existing or no entries),
    // it will be appended below if rank0 >= rank (at the end of display).

    // Rewrite record file if changed
    if (flg || t0_inserted) {
        const lines = allEntries
            .filter((e) => e.points > 0)
            .map(writeentry);
        vfsWriteFile('record', lines.join('\n') + '\n');
    }

    // Display
    const stopprint = state.program_state?.stopprint;
    if (!stopprint) {
        if (flg && rank0 > 0) {
            if (rank0 <= 10) {
                topten_print(state, 'You made the top ten list!');
            } else {
                topten_print(state,
                    `You reached the ${rank0}${ordin(rank0)} place `
                    + `on the top ${ENTRYMAX} list.`);
            }
            topten_print(state, '');
        }
    }

    const skipScores = !state.flags.end_top && !state.flags.end_around
        && !state.flags.end_own;
    if (rank0 === 0) rank0 = rank1;
    if (rank0 <= 0) rank0 = rank;

    if (!skipScores && !stopprint) outheader(state);

    rank = 1;
    for (const t1 of allEntries) {
        if (t1.points === 0) continue;
        if (!skipScores && !stopprint) {
            if (rank <= state.flags.end_top
                || (rank >= rank0 - state.flags.end_around
                    && rank <= rank0 + state.flags.end_around)
                || (state.flags.end_own && (PERS_IS_UID
                    ? t1.uid === t0.uid
                    : t1.name.substring(0, NAMSZ)
                        === t0.name.substring(0, NAMSZ)))) {
                if (rank === rank0 - state.flags.end_around
                    && rank0 > state.flags.end_top + state.flags.end_around + 1
                    && !state.flags.end_own) {
                    topten_print(state, '');
                }

                if (rank !== rank0) {
                    outentry(rank, t1, false, state);
                } else if (!rank1) {
                    outentry(rank, t1, true, state);
                } else {
                    outentry(rank, t1, true, state);
                    outentry(0, t0, true, state);
                }
            }
        }
        rank++;
    }

    // If rank0 >= rank, the entry wasn't displayed yet
    if (rank0 >= rank && !skipScores && !stopprint) {
        outentry(0, t0, true, state);
    }
}
