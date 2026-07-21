// version.js — Build version info
export const VERSION = '0.1.0';
export const BUILD_DATE = '2026-04-18';
export const COMMIT = 'contest-skeleton';
export const COMMIT_NUMBER = '0';
export const TELEPORT_BUILD_DATE = '2026-04-18';

export const VI_NUMBER = 1;
export const VI_NAME = 2;
export const VI_BRANCH = 4;
export const NETHACK_VERSION = '5.0.0';

// C ref: version.c status_version().  The canonical recorder is a release
// build without compiled git-branch metadata, so a branch-only request falls
// back to the numeric version exactly as the source does.
export function status_version(flags = {}, indent = false) {
    const requested = Math.trunc(Number(flags.versinfo ?? VI_NUMBER));
    const vflags = requested >= 1 && requested <= 7
        ? requested : VI_NUMBER;
    const parts = [];
    if (vflags & VI_NAME) parts.push('nethack');
    if ((vflags & VI_NUMBER) || parts.length === 0) {
        parts.push(NETHACK_VERSION);
    }
    const value = parts.join(' ');
    return indent ? ` ${value}` : value;
}
