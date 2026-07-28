// Fixture for scripts/check-namespace-members.test.mjs: reproduces the defect
// the check exists to catch. `NS.OMEGA` and `NS.PSI` are not exported by
// exporter.js, so both comparisons below are against undefined and neither
// branch can ever be taken.

import * as NS from '../exports/exporter.js';

export function classify(value) {
    if (value === NS.OMEGA) return 'omega';
    if (value === NS.PSI) return 'psi';
    // NS.ALPHA is exported, so the check must not report this line.
    if (value === NS.ALPHA) return 'alpha';
    // A repeat of an already-reported member must not be reported twice.
    if (value === NS.OMEGA) return 'omega again';
    return 'none';
}
