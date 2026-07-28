// Fixture for scripts/check-namespace-members.test.mjs: every member access
// here resolves, so the check must report no problem for this directory.
//
// The comment on the next line names NS.NOT_EXPORTED on purpose; so do the
// string and the regular expression below. None of them is a member access,
// and the check must not report any of them.
// NS.NOT_EXPORTED

import * as NS from '../exports/exporter.js';

export const message = 'NS.NOT_EXPORTED_IN_A_STRING';
export const template = `NS.NOT_EXPORTED_IN_A_TEMPLATE ${NS.ALPHA}`;
export const pattern = /NS.NOT_EXPORTED_IN_A_REGEXP/u;

// A property named like the namespace must not be mistaken for it.
export const wrapper = { NS: { NOT_EXPORTED_ON_A_PROPERTY: true } };
export const borrowed = wrapper.NS.NOT_EXPORTED_ON_A_PROPERTY;

export function useEverything() {
    return [NS.ALPHA, NS.beta(), NS.delta, NS.EPSILON];
}
