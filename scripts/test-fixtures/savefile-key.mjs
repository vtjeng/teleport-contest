// The storage key of a hero's save file: js/storage.js's "vfs:" prefix and
// the name js/files.js set_savefile_name() gives that hero's save file.
import { set_savefile_name } from '../../js/files.js';

export function savefileKey(state) {
    return `vfs:${set_savefile_name(state)}`;
}
