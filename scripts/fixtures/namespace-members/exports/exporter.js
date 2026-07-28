// Fixture for scripts/check-namespace-members.test.mjs. Every export form the
// check has to resolve appears once: a declaration, a function, a renaming
// `export {}` clause, and a star re-export of another module.

export * from './nested.js';

export const ALPHA = 1;

export function beta() {
    return ALPHA;
}

const gamma = 3;
export { gamma as delta };
