# Pre-experiment hypothesis

Base 58ad57cea2dcd8b94b8d1f7644e9e21fc02c7cd1, recorded before the following public-input experiments.

JS pickup.js preflightPickupObjects sums obj.owt for the entire selected object even when count is smaller. Its sourceZeroLift exception requires obj.quan===1, while sourcePartialStackLift requires selectedObject.count>1. A request for one rock from an over-capacity floor stack therefore satisfies neither exception and may throw `pickup() requiring a partial or failed lift`, despite C carry_count operating on the requested quantity. A request for two should enter the existing partial-stack path and succeed.

Proposed public setup: wizard wish 1000 rocks, which cannot be retained and falls to the floor, then count-prefixed pickup. Target requests one, control two. Must verify actual wish quantity, floor placement, requested count and C result before classification. This differs from repaired partly-eaten food stashing and uses no excluded investigation.
