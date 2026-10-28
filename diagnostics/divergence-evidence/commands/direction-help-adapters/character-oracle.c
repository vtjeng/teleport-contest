#include "hack.h"
#include <stdio.h>
int main(void) {
    unsigned i;
    for (i = 0; i < 256; ++i) {
        char sym = (char) i;
        int eligible = letter(sym) || sym == '[';
        printf("[%u,%d,%d]\n", i, eligible, eligible ? (unsigned char) highc(sym) : -1);
    }
    return 0;
}
