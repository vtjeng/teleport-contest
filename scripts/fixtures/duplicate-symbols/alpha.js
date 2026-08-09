// Fixture for scripts/check-duplicate-symbols.test.mjs. Together with beta.js
// it holds one function duplicated under two spellings, one class duplicated
// under two spellings, one constant that beta.js redefines as a function, and
// one name defined here alone.
//
// Nothing imports this file; the check reads it as text.

export const LEVITATION = 3;

export function is_weptool(otmp) {
    return otmp.oclass === 'tool';
}

export class SharedError extends Error {}

function definedOnceOnly() {
    return true;
}
