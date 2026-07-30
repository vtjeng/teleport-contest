// A fixture for scripts/mutate-sites.test.mjs. It is not game code and nothing
// under js/ imports it.
//
// Each mutable site below is placed so that the fixture's own test either pins
// it or leaves it loose, which makes the expected survivor list readable from
// the file. The comment on each line says which.

// Integer site. scripts/bounds.test.mjs asserts this value and both sides of
// the boundary in withinLimit(), so both directions are killed.
export const LIMIT = 4;

export function withinLimit(n) {
    // Relational site. The test pins n === LIMIT and n === LIMIT + 1, so
    // weakening `<=` to `<` is killed.
    return n <= LIMIT;
}

export function nearEdge(n) {
    // Relational and integer sites. The test calls this far from the boundary,
    // so `<=`, 11, and 9 all still return true and all three survive.
    return n < 10;
}

export function bothSet(a, b) {
    // Logical site. The test passes one true and one false operand, so `||`
    // returns true where the test expects false and is killed.
    return a && b;
}

export function padded(n) {
    // Integer site in a function scripts/bounds.test.mjs never calls, so both
    // directions survive. This is the shape a review has to look at: the line
    // is reachable and untested.
    return n + 1;
}

export function masked(flags) {
    // Not a site: 8 is an operand of a bitwise operator, so the enumerator
    // reads it as a bit pattern.
    return flags & 8;
}

// Integer site inside an array literal, which is not a subscript. The test pins
// rowHead(0), so both directions are killed.
const ROW = [3];

export function rowHead(offset) {
    // Not a site: 0 sits in index brackets.
    return ROW[0] + offset;
}

export function alwaysReady() {
    // Boolean site. The test asserts the return value, so the mutant is killed.
    return true;
}

export function forwarded(n) {
    // Relational site that only js/wrapper.js reaches, and only
    // scripts/wrapper.test.mjs exercises js/wrapper.js. The first wave for this
    // module is scripts/bounds.test.mjs, which never calls this function and so
    // passes every mutation of this line; the rest of the suite kills it. This
    // is the shape of js/hack.js:544 in the real repository.
    return n >= LIMIT;
}
