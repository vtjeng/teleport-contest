import test from 'node:test';
import { cases, verifyWishPlacement } from './run-makewish.mjs';

for (const { id, recipe } of cases) {
    test(id + ' uses the makewish safety/placement contract', async () => {
        // Independent input-only recipes exercise the production wiz_wish path.
        await verifyWishPlacement(recipe.segments[0]);
    });
}
