/* Focused execution of muse.c:826's printf expression, not a NetHack run.
 * pline_The prefixes "The "; mon_nam supplies the already resolved name.
 * probe.test.mjs exercises the JS selection and action with real species.
 */
#include <stdio.h>
int main(void) {
    printf("The tip of %s's horn glows!\n", "the white unicorn");
    printf("The tip of %s's horn glows!\n", "Ares");
    return 0;
}
