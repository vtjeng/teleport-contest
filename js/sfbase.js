// sfbase.js -- save-format dispatch, diagnostics, and pointer normalization.
// C refs: sfbase.c SF_X(), sfo_char(), sfi_char(), sfo_genericptr(),
// sfi_genericptr(), sfo_version_info(), sfi_version_info(), sf_log(),
// sfvalue_any(), sfvalue_genericptr(), sfvalue_bitfield(), bitfield_dump(),
// complex_dump(), sf_init(), sf_setprocs(), sf_setflprocs(), and the
// norm_ptrs_*() functions in the first sfbase.c span.

import {
    CONVERTING,
    SFCTOOL_BIT,
    UNCONVERTING,
    WRITING,
} from './const.js';
import { note_unported } from './unported.js';

// sfbase.c:17-20. C has four process-global arrays indexed by the save
// format. JavaScript keeps the same state in module scope; each entry is a
// `{ ext, fn }` object, where `fn` maps a C procedure-table field to a
// callback.
export const sfoprocs = [];
export const sfiprocs = [];
export const sfoflprocs = [];
export const sfiflprocs = [];

// hack.h:974-978. These are the only save-format indexes sf_init() writes.
const INVALID = 0;
const HISTORICAL = 1;
const EXPORTASCII = 2;

// sfbase.c:17-20. The historical and exportascii procedure tables are
// supplied by sfstruct.c and the field-level implementation in C. Their
// implementations are not in this span, so empty tables retain the C
// pointer-table shape and dispatch records a gap when a callback is needed.
export const historical_sfo_procs = Object.freeze({ ext: '', fn: {} });
export const historical_sfi_procs = Object.freeze({ ext: '', fn: {} });
export const zerosfoprocs = Object.freeze({ ext: '', fn: {} });
export const zerosfiprocs = Object.freeze({ ext: '', fn: {} });
export const zerosfoflprocs = Object.freeze({ ext: '', fn: {} });
export const zerosfiflprocs = Object.freeze({ ext: '', fn: {} });

const TURN_OFF_LOGGING = UNCONVERTING << 1;
const SIZEOF_POINTER = 8; // The recorder target uses the C LP64 data model.
const SIZEOF_VERSION_INFO = 24; // Three unsigned long fields on LP64.

function copyStructProcs(procs) {
    return {
        ...(procs ?? {}),
        fn: { ...(procs?.fn ?? {}) },
    };
}

function callbackFor(table, nhfp, name, missing) {
    const callback = table[nhfp?.fnidx]?.fn?.[name];
    if (typeof callback === 'function') return callback;
    note_unported(`sfstruct.c ${missing}`);
    return null;
}

function invokeCallback(table, nhfp, name, args) {
    const callback = callbackFor(table, nhfp, name, name);
    return callback ? callback(nhfp, ...args) : undefined;
}

function pointedValue(value) {
    if (Array.isArray(value) || ArrayBuffer.isView(value)) return value[0];
    return value;
}

function asByte(value) {
    return Number(value) & 0xff;
}

// SF_X(uint8_t, bitfield) at sfbase.c:246 expands to these two wrappers.
// SF_X() is retained as a small factory so the macro's generated pair has a
// same-named JavaScript representation for the source-ordered port.
export function SF_X(_type, dtyp) {
    if (dtyp === 'bitfield') {
        return { sfo_bitfield, sfi_bitfield };
    }
    return null;
}

// sfbase.c:246, the SF_X(uint8_t, bitfield) output wrapper.
export function sfo_bitfield(nhfp, d_bitfield, myname, bfsz) {
    if (nhfp.fplog) {
        sf_log(
            nhfp,
            myname,
            1,
            1,
            sfvalue_bitfield(d_bitfield),
        );
    }
    if (nhfp.structlevel) {
        invokeCallback(sfoprocs, nhfp, 'sf_bitfield', [
            d_bitfield, myname, bfsz,
        ]);
    } else {
        const save_fplog = nhfp.fplog;
        nhfp.fplog = 0;
        invokeCallback(sfoflprocs, nhfp, 'sf_bitfield', [
            d_bitfield, myname, bfsz,
        ]);
        nhfp.fplog = save_fplog;
    }
    if (nhfp.fplog && !nhfp.eof) {
        sf_log(
            nhfp,
            myname,
            1,
            1,
            sfvalue_bitfield(d_bitfield),
        );
    }
}

// sfbase.c:246, the SF_X(uint8_t, bitfield) input wrapper.
export function sfi_bitfield(nhfp, d_bitfield, myname, bfsz) {
    if (nhfp.structlevel) {
        invokeCallback(sfiprocs, nhfp, 'sf_bitfield', [
            d_bitfield, myname, bfsz,
        ]);
    } else {
        const save_mode = nhfp.mode;
        nhfp.mode &= ~(CONVERTING | UNCONVERTING);
        nhfp.mode |= TURN_OFF_LOGGING;
        invokeCallback(sfiflprocs, nhfp, 'sf_bitfield', [
            d_bitfield, myname, bfsz,
        ]);
        nhfp.mode = save_mode;
    }
    if (!nhfp.eof) {
        if (((nhfp.mode & (CONVERTING | UNCONVERTING)) !== 0)
            && nhfp.nhfpconvert) {
            sfo_bitfield(nhfp.nhfpconvert, d_bitfield, myname, bfsz);
        }
        if (nhfp.fplog) {
            sf_log(
                nhfp,
                myname,
                1,
                1,
                bitfield_dump(d_bitfield),
            );
        }
    }
}

// sfbase.c:249-262. C's char buffer is represented by a JavaScript string,
// array, or typed-array view. The caller still supplies the byte count.
export function sfo_char(nhfp, d_char, myname, cnt) {
    if (nhfp.fplog) {
        sf_log(nhfp, myname, 1, cnt, sfvalue_char(d_char, cnt));
    }
    if (nhfp.structlevel) {
        invokeCallback(sfoprocs, nhfp, 'sf_char', [d_char, myname, cnt]);
    } else {
        const save_fplog = nhfp.fplog;
        nhfp.fplog = 0;
        invokeCallback(sfoflprocs, nhfp, 'sf_char', [d_char, myname, cnt]);
        nhfp.fplog = save_fplog;
    }
}

// sfbase.c:265-287.
export function sfi_char(nhfp, d_char, myname, cnt) {
    if (nhfp.structlevel) {
        invokeCallback(sfiprocs, nhfp, 'sf_char', [d_char, myname, cnt]);
    } else {
        const save_mode = nhfp.mode;
        nhfp.mode &= ~(CONVERTING | UNCONVERTING);
        nhfp.mode |= TURN_OFF_LOGGING;
        invokeCallback(sfiflprocs, nhfp, 'sf_char', [d_char, myname, cnt]);
        nhfp.mode = save_mode;
    }
    if (!nhfp.eof) {
        if (((nhfp.mode & (CONVERTING | UNCONVERTING)) !== 0)
            && nhfp.nhfpconvert) {
            sfo_char(nhfp.nhfpconvert, d_char, myname, cnt);
        }
        if (nhfp.fplog) {
            sf_log(nhfp, myname, 1, cnt, sfvalue_char(d_char, cnt));
        }
    }
}

// sfbase.c:290-304.
export function sfo_genericptr(nhfp, d_genericptr, myname) {
    if (nhfp.fplog) {
        sf_log(
            nhfp,
            myname,
            SIZEOF_POINTER,
            1,
            sfvalue_genericptr(d_genericptr),
        );
    }
    if (nhfp.structlevel) {
        invokeCallback(sfoprocs, nhfp, 'sf_genericptr', [
            d_genericptr, myname,
        ]);
    } else {
        const save_fplog = nhfp.fplog;
        nhfp.fplog = 0;
        invokeCallback(sfoflprocs, nhfp, 'sf_genericptr', [
            d_genericptr, myname,
        ]);
        nhfp.fplog = save_fplog;
    }
}

// sfbase.c:306-327.
export function sfi_genericptr(nhfp, d_genericptr, myname) {
    if (nhfp.structlevel) {
        invokeCallback(sfiprocs, nhfp, 'sf_genericptr', [
            d_genericptr, myname,
        ]);
    } else {
        const save_mode = nhfp.mode;
        nhfp.mode &= ~(CONVERTING | UNCONVERTING);
        nhfp.mode |= TURN_OFF_LOGGING;
        invokeCallback(sfiflprocs, nhfp, 'sf_genericptr', [
            d_genericptr, myname,
        ]);
        nhfp.mode = save_mode;
    }
    if (!nhfp.eof) {
        if (((nhfp.mode & (CONVERTING | UNCONVERTING)) !== 0)
            && nhfp.nhfpconvert) {
            sfo_genericptr(nhfp.nhfpconvert, d_genericptr, myname);
        }
        if (nhfp.fplog) {
            sf_log(
                nhfp,
                myname,
                SIZEOF_POINTER,
                1,
                sfvalue_genericptr(d_genericptr),
            );
        }
    }
}

// sfbase.c:330-346.
export function sfo_version_info(nhfp, d_version_info, myname) {
    if (nhfp.fplog) {
        sf_log(
            nhfp,
            myname,
            SIZEOF_VERSION_INFO,
            1,
            complex_dump(d_version_info),
        );
    }
    if (nhfp.structlevel) {
        invokeCallback(sfoprocs, nhfp, 'sf_version_info', [
            d_version_info, myname,
        ]);
    } else {
        const save_fplog = nhfp.fplog;
        nhfp.fplog = 0;
        invokeCallback(sfoflprocs, nhfp, 'sf_version_info', [
            d_version_info, myname,
        ]);
        nhfp.fplog = save_fplog;
    }
}

// sfbase.c:348-372.
export function sfi_version_info(nhfp, d_version_info, myname) {
    if (nhfp.structlevel) {
        invokeCallback(sfiprocs, nhfp, 'sf_version_info', [
            d_version_info, myname,
        ]);
    } else {
        const save_mode = nhfp.mode;
        nhfp.mode &= ~(CONVERTING | UNCONVERTING);
        nhfp.mode |= TURN_OFF_LOGGING;
        invokeCallback(sfiflprocs, nhfp, 'sf_version_info', [
            d_version_info, myname,
        ]);
        nhfp.mode = save_mode;
    }
    if (!nhfp.eof) {
        if (((nhfp.mode & (CONVERTING | UNCONVERTING)) !== 0)
            && nhfp.nhfpconvert) {
            if (typeof d_version_info.feature_set === 'bigint') {
                d_version_info.feature_set |= BigInt(SFCTOOL_BIT);
            } else {
                d_version_info.feature_set
                    = Number(d_version_info.feature_set) | SFCTOOL_BIT;
            }
            sfo_version_info(nhfp.nhfpconvert, d_version_info, myname);
        }
        if (nhfp.fplog) {
            sf_log(
                nhfp,
                myname,
                SIZEOF_VERSION_INFO,
                1,
                complex_dump(d_version_info),
            );
        }
    }
}

function appendLog(fp, line) {
    if (typeof fp === 'function') {
        fp(line);
    } else if (Array.isArray(fp)) {
        fp.push(line);
    } else if (typeof fp?.write === 'function') {
        fp.write(line);
    } else if (typeof fp?.append === 'function') {
        fp.append(line);
    } else if (Array.isArray(fp?.lines)) {
        fp.lines.push(line);
    }
}

function formatLong(value) {
    const text = String(value ?? 0);
    if (text.startsWith('-')) return `-${text.slice(1).padStart(7, '0')}`;
    return text.padStart(8, '0');
}

// sfbase.c:377-404. A JavaScript fplog is a callback, an array of lines, or
// an object exposing write(), append(), or lines; the game never opens a
// filesystem handle.
export function sf_log(nhfp, t1, sz, cnt, txtvalue) {
    const fp = nhfp.fplog;
    const dolog = ((nhfp.mode ?? 0) & TURN_OFF_LOGGING) === 0;
    if (!fp || !dolog) return;

    const iocount = ((nhfp.mode ?? 0) & WRITING) === 0
        ? nhfp.rcount
        : nhfp.wcount;
    const line = `${formatLong(iocount)} ${t1} sz=${sz} cnt=${cnt}`
        + ` |${txtvalue}|\n`;
    appendLog(fp, line);
}

// sfbase.c:406-421. This helper is not one of the planner's macro-detected
// entries, but sfo_char() and sfi_char() call it directly.
function sfvalue_char(a, n) {
    if (typeof a === 'string') return a.slice(0, n);
    const values = Array.from(a ?? []).slice(0, n);
    return values.map((value) => String.fromCharCode(asByte(value))).join('');
}

// sfbase.c:448-457. `anything.a_int64` is represented by a JavaScript number
// or bigint; String() preserves the exact decimal representation of bigint.
export function sfvalue_any(a) {
    return String(a?.a_int64 ?? 0);
}

// sfbase.c:459-467.
export function sfvalue_genericptr(a) {
    return a === null || a === undefined || a === 0 || a === 0n
        ? '0'
        : 'glorkum';
}

// sfbase.c:607-614.
export function sfvalue_bitfield(a) {
    return String(asByte(pointedValue(a)));
}

// sfbase.c:616-623.
export function bitfield_dump(a) {
    return String(asByte(pointedValue(a)));
}

// sfbase.c:624-639. C reads ten uchar values and formats each with a minimum
// width of three hexadecimal digits. The JS input is an array or typed view.
export function complex_dump(a) {
    const values = Array.from(a ?? []);
    return Array.from({ length: 10 }, (_, index) =>
        asByte(values[index]).toString(16).padStart(3, '0'))
        .join(' ');
}

// sfbase.c:647-655. sfstruct.c's historical callbacks are outside this span;
// their empty table entries are retained until that file is ported.
export function sf_init() {
    sfoprocs[INVALID] = copyStructProcs(zerosfoprocs);
    sfiprocs[INVALID] = copyStructProcs(zerosfiprocs);
    sfoprocs[HISTORICAL] = copyStructProcs(historical_sfo_procs);
    sfiprocs[HISTORICAL] = copyStructProcs(historical_sfi_procs);
    sfoflprocs[EXPORTASCII] = copyStructProcs(zerosfoflprocs);
    sfiflprocs[EXPORTASCII] = copyStructProcs(zerosfiflprocs);
}

// sfbase.c:658-662. Assignment through sf_setprocs() copies the procedure
// records, so later changes to the caller's `fn` object do not alter the table.
export function sf_setprocs(idx, sfi, sfo) {
    sfoprocs[idx] = copyStructProcs(sfo);
    sfiprocs[idx] = copyStructProcs(sfi);
}

// sfbase.c:664-669.
export function sf_setflprocs(idx, flsfi, flsfo) {
    sfoflprocs[idx] = copyStructProcs(flsfo);
    sfiflprocs[idx] = copyStructProcs(flsfi);
}

// sfbase.c:748-751. The save-format structures in this span contain no
// pointers that need normalization in the JavaScript object representation.
export function norm_ptrs_any(_d_any) {}
export function norm_ptrs_align(_d_align) {}
export function norm_ptrs_arti_info(_d_arti_info) {}
export function norm_ptrs_attribs(_d_attribs) {}
export function norm_ptrs_bill_x(_d_bill_x) {}
export function norm_ptrs_branch(_d_branch) {}
export function norm_ptrs_bubble(_d_bubble) {}
export function norm_ptrs_cemetery(_d_cemetery) {}
export function norm_ptrs_context_info(_d_context_info) {}
export function norm_ptrs_achievement_tracking(_d_achievement_tracking) {}
export function norm_ptrs_book_info(_d_book_info) {}
export function norm_ptrs_dig_info(_d_dig_info) {}
export function norm_ptrs_engrave_info(_d_engrave_info) {}
export function norm_ptrs_obj_split(_d_obj_split) {}
export function norm_ptrs_polearm_info(_d_polearm_info) {}
export function norm_ptrs_takeoff_info(_d_takeoff_info) {}
export function norm_ptrs_tin_info(_d_tin_info) {}
export function norm_ptrs_tribute_info(_d_tribute_info) {}
export function norm_ptrs_victual_info(_d_victual_info) {}
export function norm_ptrs_warntype_info(_d_warntype_info) {}
export function norm_ptrs_d_flags(_d_d_flags) {}
export function norm_ptrs_d_level(_d_d_level) {}
export function norm_ptrs_damage(_d_damage) {}
export function norm_ptrs_dest_area(_d_dest_area) {}
export function norm_ptrs_dgn_topology(_d_dgn_topology) {}
export function norm_ptrs_dungeon(_d_dungeon) {}
export function norm_ptrs_ebones(_d_ebones) {}
export function norm_ptrs_edog(_d_edog) {}
export function norm_ptrs_egd(_d_egd) {}
export function norm_ptrs_emin(_d_emin) {}
export function norm_ptrs_engr(_d_engr) {}
export function norm_ptrs_epri(_d_epri) {}
export function norm_ptrs_eshk(_d_eshk) {}
export function norm_ptrs_fakecorridor(_d_fakecorridor) {}
export function norm_ptrs_fe(_d_fe) {}
export function norm_ptrs_flag(_d_flag) {}
export function norm_ptrs_fruit(_d_fruit) {}
export function norm_ptrs_gamelog_line(_d_gamelog_line) {}
export function norm_ptrs_kinfo(_d_kinfo) {}
export function norm_ptrs_levelflags(_d_levelflags) {}
export function norm_ptrs_linfo(_d_linfo) {}
export function norm_ptrs_ls_t(_d_ls_t) {}
export function norm_ptrs_mapseen_feat(_d_mapseen_feat) {}
export function norm_ptrs_mapseen_flags(_d_mapseen_flags) {}
export function norm_ptrs_mapseen_rooms(_d_mapseen_rooms) {}
export function norm_ptrs_mapseen(_d_mapseen) {}
export function norm_ptrs_mextra(_d_mextra) {}
export function norm_ptrs_mkroom(_d_mkroom) {}
export function norm_ptrs_monst(_d_monst) {}
export function norm_ptrs_mvitals(_d_mvitals) {}
export function norm_ptrs_nhcoord(_d_nhcoord) {}
export function norm_ptrs_nhrect(_d_nhrect) {}
export function norm_ptrs_novel_tracking(_d_novel_tracking) {}
export function norm_ptrs_obj(_d_obj) {}
export function norm_ptrs_objclass(_d_objclass) {}
export function norm_ptrs_oextra(_d_oextra) {}
export function norm_ptrs_prop(_d_prop) {}
export function norm_ptrs_q_score(_d_q_score) {}
export function norm_ptrs_rm(_d_rm) {}
// sfbase.c:1042-1118. These save-format structures also contain no pointers
// that need normalization in the JavaScript object representation.
export function norm_ptrs_s_level(_d_s_level) {}
export function norm_ptrs_skills(_d_skills) {}
export function norm_ptrs_spell(_d_spell) {}
export function norm_ptrs_stairway(_d_stairway) {}
export function norm_ptrs_trap(_d_trap) {}
export function norm_ptrs_u_conduct(_d_u_conduct) {}
export function norm_ptrs_u_event(_d_u_event) {}
export function norm_ptrs_u_have(_d_u_have) {}
export function norm_ptrs_u_realtime(_d_u_realtime) {}
export function norm_ptrs_u_roleplay(_d_u_roleplay) {}
export function norm_ptrs_version_info(_d_version_info) {}
export function norm_ptrs_vlaunchinfo(_d_vlaunchinfo) {}
export function norm_ptrs_vptrs(_d_vptrs) {}
export function norm_ptrs_you(_d_you) {}
