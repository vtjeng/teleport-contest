#include <stdio.h>
#include <string.h>

#define BUFSZ 256
#define BIGBUFSZ (5 * BUFSZ)

int
main(int argc, char **argv)
{
    char pbuf[BIGBUFSZ];
    const char *line;
    int length;

    if (argc != 2)
        return 2;
    line = argv[1];
    length = (int) strlen(line);
    if (length > (int) sizeof pbuf - 1)
        return 3;
    if (length > BUFSZ - 1) {
        (void) strncpy(pbuf, line, BUFSZ - 1);
        pbuf[BUFSZ - 1 - 6] = pbuf[BUFSZ - 1 - 5]
            = pbuf[BUFSZ - 1 - 4] = '.';
        pbuf[BUFSZ - 1 - 3] = line[length - 3];
        pbuf[BUFSZ - 1 - 2] = line[length - 2];
        pbuf[BUFSZ - 1 - 1] = line[length - 1];
        pbuf[BUFSZ - 1] = '\0';
        line = pbuf;
    }
    fputs(line, stdout);
    return 0;
}
