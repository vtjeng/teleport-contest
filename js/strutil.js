// C refs: strutil.c.

import { LARGEST_INT } from './const.js';
import { eos } from './hacklib.js';

// C ref: strutil.c Strlen_() (82-101). Unlike hacklib.c:eos(), this bounded
// byte count panics when no NUL appears before LARGEST_INT bytes. JavaScript
// strings are immutable, so eos supplies the byte count without a pointer.
export function Strlen_(str, file, line) {
    const length = eos(str);
    if (length >= LARGEST_INT)
        throw new RangeError(`${file}:${line} string too long`);
    return length;
}
