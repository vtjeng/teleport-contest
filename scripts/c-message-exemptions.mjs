// C messages that docs/c-message-coverage.md lists as exempt rather than
// missing, each with the reason no recorded game can print it. This is the
// one definition: scripts/c-message-coverage.mjs moves these messages out of
// its "Missing" lists, and c-message-coverage.test.mjs fails when an entry no
// longer names a C message, when js/ now contains its text, or when it lacks
// a reason or an approval. Add an entry only with Vincent's approval, and
// record who approved it and when.
//
// Each entry names the C file and function and the fragment the report
// searches for, exactly as the report prints them. Messages in the C files of
// scripts/not-ported-by-design.mjs are exempt through that list; do not repeat
// them here.

import { NOT_PORTED_BY_DESIGN } from './not-ported-by-design.mjs';

const APPROVED = 'Vincent, 2026-11-13';

// The recorder starts NetHack with only "-u <name>" (scripts/record-session.mjs
// recordSegment()), and a session carries no command line for the port.
function commandLine(what) {
    return `${what}; the recorder passes only "-u <name>" `
        + '(scripts/record-session.mjs), and a session has no command line';
}
const DUMPMONGEN = commandLine('output of the --dumpmongen option (earlyarg.c argcheck())');
const PRSCORE = commandLine('output of the -s option (earlyarg.c scores_only())');
const COMPRESS = 'the external compressor process failed (wait() error or nonzero '
    + 'exit status); no game input controls it';
const FILE_LOCK = 'the locked file is missing from the installation or another '
    + 'NetHack process holds its lock; no game input causes either';
const FILE_VERSION = 'a save or bones file written by another build; every segment '
    + 'of a recording writes and reads its files with the same recorder build';
const MKMAZE_BUBBLE = 'mk_bubble() places each bubble inside gbxmin..gbxmax and '
    + 'gbymin..gbymax, and mv_bubble() turns a one-square move back at the border, '
    + 'so these bounds reports never fire';
const PANIC_SAVE = 'needs a panic save file without a regular one, which only a '
    + 'panic in an earlier segment leaves; a correct game does not panic';
const REVEAL_PATHS = commandLine('output of the --showpaths option '
    + '(files.c do_deferred_showpaths())');
const SHOPDOOR_DEBUG = 'part of the impossible("Where is shopdoor?") report, '
    + 'printed under DEBUG in debug mode in the same branch; like any diagnostic it '
    + 'appears only when the game has a bug';
const TRICKERY = 'a level or bones file whose stored PID, level number or bones ID '
    + 'differs from the file it was read as (restore.c getlev(), bones.c '
    + 'getbones()); only a tampered or swapped file does that';
const VERSION_ARG = commandLine('output of the --version:copy option (earlyarg.c argcheck())');

function entry(file, fn, fragment, reason) {
    return Object.freeze({ file, function: fn, fragment, reason, approved: APPROVED });
}

export const C_MESSAGE_EXEMPTIONS = Object.freeze([
    entry('src/cfgfiles.c', 'do_write_config_file', 'An error occurred, wrote only partial data (',
        "#saveoptions reports a short fwrite() of the config file, which only a full "
        + 'or failing disk causes'),
    entry('src/cfgfiles.c', 'fopen_config_file', "Couldn't open requested config file",
        'a config file named by --nethackrc or NETHACKOPTIONS="@file"; the recorder '
        + 'sets neither and writes the session options to $HOME/.nethackrc'),
    entry('src/cfgfiles.c', 'fopen_config_file', "Couldn't open default config file",
        'opening $HOME/.nethackrc failed with an errno other than ENOENT; the recorder '
        + 'writes that file before it starts NetHack'),
    entry('src/cfgfiles.c', 'config_erradd', 'config_error_add:',
        'the prefix prints only for an option error outside config_error_init() before '
        + 'windows exist; sysconf (options.c initoptions()), the nethackrc and '
        + 'NETHACKOPTIONS (cfgfiles.c rcfile()) and the command line are each read '
        + 'inside config_error_init()'),
    entry('src/cfgfiles.c', 'assure_syscf_file', 'Unable to open SYSCF_FILE.',
        'installation check: the sysconf file the recorder build installs is missing'),
    entry('src/decl.c', 'decl_globals_init', '.havestate not True.',
        'MAGICCHECK self-check of the global initializers at start-up; only a '
        + 'miscompiled build fails it'),
    entry('src/earlyarg.c', 'argcheck', 'version can only be extended with -',
        commandLine('rejects a bad --version:<word> option')),
    entry('src/files.c', 'commit_bonesfile', "couldn't rename",
        'debug mode reports a failed rename() of the temporary bones file within its '
        + 'own directory, a filesystem error'),
    entry('src/files.c', 'docompress_file', 'compressing', COMPRESS),
    entry('src/files.c', 'docompress_file', 'Unable to uncompress', COMPRESS),
    entry('src/files.c', 'lock_file', '.  Is NetHack installed correctly?', FILE_LOCK),
    entry('src/files.c', 'lock_file', 'Waiting for release of fcntl lock on', FILE_LOCK),
    entry('src/files.c', 'lock_file', 'Some other process has an unnatural grip on', FILE_LOCK),
    entry('src/files.c', 'unlock_file', "Can't remove fcntl lock on",
        'fcntl(F_UNLCK) failed on a descriptor the game holds, an operating-system error'),
    entry('src/files.c', 'fopen_wizkit_file', "Couldn't open requested wizkit file",
        'access(R_OK) succeeded but fopen("r") failed; the recorder is not setuid, and '
        + 'on Linux an open for reading succeeds whenever access() grants read, '
        + 'directories included'),
    entry('src/files.c', 'check_recordfile', "Warning: cannot write scoreboard file '",
        'start-up check (unixmain.c) that the record file can be created in the '
        + 'playground the recorder installs'),
    entry('src/files.c', 'reveal_paths', 'system configuration file', REVEAL_PATHS),
    entry('src/files.c', 'reveal_paths', 'above is missing or inaccessible!', REVEAL_PATHS),
    entry('src/files.c', 'reveal_paths', 'are in many separate files.', REVEAL_PATHS),
    entry('src/files.c', 'reveal_paths', 'Your personal configuration file', REVEAL_PATHS),
    entry('src/files.c', 'livelog_add', 'Cannot open live log file!',
        "needs sysconf LIVELOG, which the recorder's sysconf leaves commented out, so "
        + 'sysopt.livelog is 0 and livelog_add() returns first'),
    entry('src/makemon.c', 'dump_mongen', 'int mongen_order[] = {',
        DUMPMONGEN),
    entry('src/makemon.c', 'dump_mongen', "', diff=",
        DUMPMONGEN),
    entry('src/makemon.c', 'dump_mongen', '(G_NOGEN | G_UNIQ)',
        DUMPMONGEN),
    entry('src/mkmaze.c', 'mv_bubble', 'bubble xmin: x =', MKMAZE_BUBBLE),
    entry('src/mkmaze.c', 'mv_bubble', 'bubble ymin: y =', MKMAZE_BUBBLE),
    entry('src/mkmaze.c', 'mv_bubble', 'bubble xmax: x =', MKMAZE_BUBBLE),
    entry('src/mkmaze.c', 'mv_bubble', 'bubble ymax: y =', MKMAZE_BUBBLE),
    entry('src/nhlua.c', 'nhl_test', 'TEST:{ x=',
        'the Lua binding nh.test(), which no dat/*.lua program calls'),
    entry('src/o_init.c', 'setgemprobs', 'Not enough gems? - first=',
        'self-check of the objects[] gem order; setgemprobs() zeroes at most 9 gems, '
        + 'which leaves real gems at every depth'),
    entry('src/pager.c', 'checkfile', "Cannot open 'data' file!",
        "the installed 'data' file is missing, an installation fault"),
    entry('src/pager.c', 'checkfile', "? Seek error on 'data' file!",
        "fseek() failed on the installed 'data' file, an operating-system error"),
    entry('src/pline.c', 'execplinehandler', 'Fork to message handler failed.',
        "needs sysconf MSGHANDLER, which the recorder's sysconf leaves commented out, "
        + 'and then a failed fork()'),
    entry('src/restore.c', 'inven_inuse', 'Finishing off',
        'objects still marked in_use in a save file, which a hangup during an action '
        + 'leaves (the comment names the HUP cheat); a recorded segment saves through '
        + 'the S command, after the action that set in_use has cleared it or used the '
        + 'object up'),
    entry('src/restore.c', 'restgamestate', 'Saved game was not yours.',
        'sysconf CHECK_SAVE_UID and a save file written by another user ID; every '
        + 'segment of a recording runs as the same user'),
    entry('src/restore.c', 'restgamestate', 'were not healthy enough to survive restoration.',
        'a save file written with u.uhp <= 0, which only a hangup during death leaves; '
        + 'the S command saves a living hero'),
    entry('src/restore.c', 'trickery', 'Strange, this map is not as I remember it.', TRICKERY),
    entry('src/restore.c', 'trickery', 'Somebody is trying some trickery here...', TRICKERY),
    entry('src/restore.c', 'trickery', 'This game is void.', TRICKERY),
    entry('src/save.c', 'dosave0', 'Cannot open save file.',
        'create_savefile() failed because the save directory is missing or not '
        + 'writable, an installation fault'),
    entry('src/save.c', 'tricked_fileremoved', 'Probably someone removed it.',
        'a level file the game wrote is gone when it reopens it; only another process '
        + 'deleting it does that'),
    entry('src/shknam.c', 'shkinit', 'Room at (', SHOPDOOR_DEBUG),
    entry('src/shknam.c', 'shkinit', 'doormax=', SHOPDOOR_DEBUG),
    entry('src/topten.c', 'prscore', 'prscore: bad arguments (',
        PRSCORE),
    entry('src/topten.c', 'prscore', '-s [-v] <playertypes> [maxrank] [playernames]',
        PRSCORE),
    entry('src/topten.c', 'prscore', 'Player types are: [-p role] [-r race]',
        PRSCORE),
    entry('src/version.c', 'early_version_info', 'Paste buffer copy is not available.',
        VERSION_ARG),
    entry('src/version.c', 'check_version', 'Version mismatch for file "', FILE_VERSION),
    entry('src/version.c', 'check_version', 'Configuration incompatibility for file "',
        FILE_VERSION),
    entry('src/version.c', 'uptodate', 'comparison of critical bytes mismatched at',
        FILE_VERSION),
    entry('src/version.c', 'compare_critical_bytes', 'critical byte counts do not match, file:',
        FILE_VERSION),
    entry('src/windows.c', 'choose_windows', 'No window types supported?',
        'build check that some window port is compiled in; the recorder build has tty'),
    entry('sys/unix/unixunix.c', 'ask_about_panic_save',
        'There is no regular save file but there is a panic one.', PANIC_SAVE),
    entry('sys/unix/unixunix.c', 'ask_about_panic_save',
        'It might be recoverable with demi-divine intervention.', PANIC_SAVE),
    entry('sys/unix/unixunix.c', 'child', 'Fork failed.  Try again.',
        'fork() failed when starting a shell or mail reader; the operating system '
        + 'decides that, not game input'),
]);

function key(file, fn, fragment) {
    return `${file}\0${fn}\0${fragment}`;
}

const BY_KEY = new Map(C_MESSAGE_EXEMPTIONS.map((e) => [key(e.file, e.function, e.fragment), e]));

// The not-ported-by-design record ({ reason, approved }) for a C file named
// by its path under nethack-c/upstream, or undefined.
function notPortedFile(cFile) {
    const name = cFile.split('/').at(-1);
    return Object.hasOwn(NOT_PORTED_BY_DESIGN, name) ? NOT_PORTED_BY_DESIGN[name] : undefined;
}

/**
 * Why a C message entry ({ file, function, fragment }) is exempt, as
 * { reason, approved, source }, or null when it is not. `source` is 'file'
 * for a C file not ported by design and 'message' for an entry above.
 */
export function messageExemption(e) {
    const file = notPortedFile(e.file);
    if (file) {
        return { reason: `not ported by design: ${file.reason}`, approved: file.approved,
            source: 'file' };
    }
    const found = BY_KEY.get(key(e.file, e.function, e.fragment));
    return found ? { reason: found.reason, approved: found.approved, source: 'message' } : null;
}

/**
 * Every way the exemption list has gone wrong against the report's entries
 * (each { file, function, fragment, covered }): an entry without a reason or
 * an approval, a duplicate, one for a file not ported by design, one that
 * matches no C message (stale), and one whose text js/ now contains.
 */
export function exemptionProblems(entries, exemptions = C_MESSAGE_EXEMPTIONS) {
    const problems = [];
    const byKey = new Map(entries.map((e) => [key(e.file, e.function, e.fragment), e]));
    const seen = new Set();
    for (const x of exemptions) {
        const name = `${x.file} ${x.function}() ${JSON.stringify(x.fragment)}`;
        const k = key(x.file, x.function, x.fragment);
        if (!/\S/u.test(x.reason ?? '')) problems.push(`${name} has no reason`);
        if (!/^\S.*, \d{4}-\d{2}-\d{2}$/u.test(x.approved ?? ''))
            problems.push(`${name} needs "approved: who, date"`);
        if (seen.has(k)) problems.push(`${name} is listed twice`);
        seen.add(k);
        if (notPortedFile(x.file))
            problems.push(`${name} is in a file not ported by design; that list exempts it`);
        const match = byKey.get(k);
        if (!match) problems.push(`${name} matches no C message; remove or correct it`);
        else if (match.covered) problems.push(`${name} is now found in js/; remove the exemption`);
    }
    return problems;
}
