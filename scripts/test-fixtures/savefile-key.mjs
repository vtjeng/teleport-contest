// The storage key of a hero's save file: js/storage.js's "vfs:" prefix and
// the name js/files.js set_savefile_name() gives a hero of that name. The
// name is made on a scratch state, so the game's own gs.SAVEF is untouched.
import { set_savefile_name } from '../../js/files.js';

export function savefileKey(state) {
    const named = { plname: state.plname };
    set_savefile_name(named);
    return `vfs:${named.gs.SAVEF}`;
}
