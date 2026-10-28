/* Read the pinned recorder's configured role data; do not enter gameplay. */
#include "hack.h"
int main(void) {
    int i;
    for (i = 0; roles[i].name.m; ++i)
        printf("%s\t%s\t%s\t%s\n", roles[i].name.m,
               roles[i].lgod ? roles[i].lgod : "<null>",
               roles[i].ngod ? roles[i].ngod : "<null>",
               roles[i].cgod ? roles[i].cgod : "<null>");
    return 0;
}
