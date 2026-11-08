// files_bones.js -- files.c's bones file handling (the section between its
// "BEGIN BONES FILE HANDLING" and "END BONES FILE HANDLING" markers):
// set_bonesfile_name(), open_bonesfile(), delete_bonesfile(), and the write
// that stands for create_bonesfile() and commit_bonesfile(). It is apart
// from js/files.js because it needs js/dungeon.js, and js/files.js is
// imported by modules that js/dungeon.js itself depends on.

import { In_quest } from './const.js';
import { Is_special } from './dungeon.js';
import { vfsDeleteFile, vfsReadFile, vfsWriteFile } from './storage.js';

// C ref: files.c set_bonesfile_name() (768-809). Returns C's file name
// (`file`, "bon" followed by the bonesid) and the bonesid it validates
// against. The name identifies a special level by its own boneid, not by
// its level number, so bones left in one game's Minetown or Asmodeus' lair
// are found on that level in another game whose dungeon put it elsewhere,
// and an ordinary level never finds them. sys.c sys_early_init() sets
// sysopt.bones_pools to 0 and the recorder's sysconf leaves BONES_POOLS
// commented out, so the `bones_pools > 1` pool digit is never written. VMS's
// ";1" suffix is not compiled on UNIX. Every bones read, write and unlink
// must take its name from here (scripts/bones-file-name.test.mjs).
export function set_bonesfile_name(lev, state) {
    const sptr = Is_special(lev, state);
    const bonesid = `${state.dungeons[lev.dnum].boneid}`
        + `${In_quest(lev, state) ? state.urole.filecode : '0'}`
        + `.${sptr ? sptr.boneid : lev.dlevel}`;
    return { file: `bon${bonesid}`, bonesid };
}

// C ref: files.c open_bonesfile() (939-990). The port's bones file is a
// text entry in the scorer's storage; a missing entry is C's failed open.
// Returns null, or the name, the bonesid and the file's contents.
export function open_bonesfile(lev, state) {
    const name = set_bonesfile_name(lev, state);
    const data = vfsReadFile(name.file);
    return data != null ? { ...name, data } : null;
}

// C ref: files.c delete_bonesfile() (992-1001). True when an entry was
// removed, as C's unlink() succeeding.
export function delete_bonesfile(lev, state) {
    const name = set_bonesfile_name(lev, state);
    return vfsDeleteFile(name.file);
}

// C ref: files.c create_bonesfile() (832-912) and commit_bonesfile()
// (914-937). C writes a temporary file and renames it into place; the
// port's storage write replaces the entry in one step.
export function write_bonesfile(lev, data, state) {
    const name = set_bonesfile_name(lev, state);
    vfsWriteFile(name.file, data);
}
