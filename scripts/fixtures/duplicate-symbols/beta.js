// Fixture for scripts/check-duplicate-symbols.test.mjs. See alpha.js.
//
// The refusal comment and the template below quote the C body this file stands
// in for. Their unindented lines read as definitions to a scan over the raw
// text, which is what blanking prevents; every name they mention is already
// defined elsewhere in these fixtures, so a leak shows up as an extra site.
/*
function is_weptool(otmp)
class SharedError extends Error {}
const LEVITATION = 3;
*/

export const quoted = `
function is_weptool(otmp) {}
`;

export async function isWeptool(otmp) {
    return otmp.oclass === 'tool';
}

export class Shared_Error extends Error {}

export function Levitation() {
    // Indented, so local to this function rather than a definition site.
    const definedOnceOnly = 1;
    return definedOnceOnly;
}
