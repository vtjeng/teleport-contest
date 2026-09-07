// Minion extensions.
// C ref: minion.c newemin().

// C ref: minion.c newemin(). Allocates the minion extension on a monster.
// makemon() calls this when MM_EMIN is set; clone_mon() calls it for minion
// clones. Follows the same pattern as newedog() and newepri().
export function newemin(monster) {
    if (!monster || typeof monster !== 'object')
        throw new TypeError('newemin requires a monster instance');
    monster.mextra ??= {};
    monster.mextra.emin ??= {
        parentmid: monster.m_id,
        min_align: 0,
        renegade: false,
    };
}
