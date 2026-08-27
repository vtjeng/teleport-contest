// nhlua.js -- Lua-state initialization side effects used by live callers.
// C ref: nhlua.c nhl_init() and dat/nhlib.lua's global alignment shuffle.

// Every nhl_init() loads nhlib.lua. Its three-entry table uses Fisher-Yates
// order, so initialization consumes rn2(3) and then rn2(2).
export function nhl_init(random) {
    const alignments = ['law', 'neutral', 'chaos'];
    for (let length = alignments.length; length > 1; --length) {
        const selected = random(length);
        [alignments[length - 1], alignments[selected]] = [
            alignments[selected], alignments[length - 1],
        ];
    }
    return alignments;
}
