// cmd.c — command and map-coordinate predicates.
import { COLNO, ROWNO } from './const.js';

// C ref: cmd.c isok() (4326-4331). Column zero is outside the map; rows
// include both endpoints, while the final column is excluded.
export function isok(x, y) {
    return x >= 1 && x <= COLNO - 1 && y >= 0 && y <= ROWNO - 1;
}
