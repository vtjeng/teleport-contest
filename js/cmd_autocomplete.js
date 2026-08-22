// cmd_autocomplete.js -- Extended-command matching and autocompletion state.
// C refs: cmd.c extcmds_match(), parseautocomplete(), and
// count_autocompletions().

import { game } from './gstate.js';
import { lcase, trimspaces } from './hacklib.js';
import {
    AUTOCOMPLETE,
    AUTOCOMP_ADJ,
    CMD_NOT_AVAILABLE,
    ECM_EXACTMATCH,
    ECM_IGNOREAC,
    ECM_NO1CHARCMD,
    INTERNALCMD,
    WIZMODECMD,
    extcmdlist,
} from './extcmdlist_data.js';

// C stores the mutable flags in extcmdlist[] itself. runSegment() can create
// several games in one JavaScript process, so each game takes a copy of those
// compiled-in values before its configuration file changes AUTOCOMPLETE or
// AUTOCOMP_ADJ. The generated extcmdlist remains the immutable source table.
export function initialExtcmdFlags() {
    return extcmdlist.map((entry) => entry.flags);
}

function commandFlags(state) {
    state.extcmdFlags ??= initialExtcmdFlags();
    return state.extcmdFlags;
}

// C ref: cmd.c extcmds_match(). Returns the matching extcmdlist[] indexes;
// findstr === null asks for every currently available entry. strncmpi() and
// strcmpi() fold case with lowc(), which lcase() ports.
export function extcmds_match(findstr, ecmflags, state = game) {
    const ignoreac = (ecmflags & ECM_IGNOREAC) !== 0;
    const exactmatch = (ecmflags & ECM_EXACTMATCH) !== 0;
    const no1charcmd = (ecmflags & ECM_NO1CHARCMD) !== 0;
    const needle = findstr === null ? null : lcase(findstr);
    const flags = commandFlags(state);
    const matchlist = [];
    for (let i = 0; i < extcmdlist.length; ++i) {
        const entry = extcmdlist[i];
        const entryFlags = flags[i];
        if (entryFlags & (CMD_NOT_AVAILABLE | INTERNALCMD)) continue;
        if (!state.wizard && (entryFlags & WIZMODECMD)) continue;
        if (!ignoreac && !(entryFlags & AUTOCOMPLETE)) continue;
        if (no1charcmd && entry.ef_txt.length === 1) continue;
        if (needle === null) {
            matchlist.push(i);
        } else {
            const name = lcase(entry.ef_txt);
            if (exactmatch ? name === needle : name.startsWith(needle))
                matchlist.push(i);
        }
    }
    return matchlist;
}

// C ref: cmd.c parseautocomplete(). reportInvalid supplies raw_printf() plus
// wait_synch() for the startup caller; cfgfiles.c invokes this synchronously,
// so js/options.js records that output boundary in source order for jsmain.js
// to replay before window initialization.
export function parseautocomplete(
    autocomplete,
    condition,
    state,
    reportInvalid,
) {
    const comma = autocomplete.indexOf(',');
    const separator = comma >= 0 ? comma : autocomplete.indexOf(':');
    if (separator >= 0) {
        // strchr(',') wins even when a colon occurs earlier. The recursive
        // suffix runs first, preserving the source's right-to-left effects.
        parseautocomplete(
            autocomplete.slice(separator + 1), condition, state, reportInvalid,
        );
        autocomplete = autocomplete.slice(0, separator);
    }

    autocomplete = trimspaces(autocomplete);
    if (!autocomplete) return;

    if (autocomplete[0] === '!') {
        autocomplete = trimspaces(autocomplete.slice(1));
        condition = !condition;
    }

    const index = extcmdlist.findIndex(
        (entry) => entry.ef_txt === autocomplete,
    );
    if (index >= 0) {
        const flags = commandFlags(state);
        const wasEnabled = (flags[index] & AUTOCOMPLETE) !== 0;
        if (condition === !wasEnabled) flags[index] ^= AUTOCOMP_ADJ;
        if (condition) flags[index] |= AUTOCOMPLETE;
        else flags[index] &= ~AUTOCOMPLETE;
        return;
    }

    reportInvalid(
        `Bad autocomplete: invalid extended command '${autocomplete}'.`,
    );
}

// C ref: cmd.c count_autocompletions(). This counts commands whose current
// autocomplete setting differs from the compiled-in table, not commands that
// currently autocomplete.
export function count_autocompletions(state = game) {
    return commandFlags(state).filter(
        (flags) => (flags & AUTOCOMP_ADJ) !== 0,
    ).length;
}
