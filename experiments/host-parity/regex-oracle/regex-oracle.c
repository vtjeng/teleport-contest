/*
 * regex-oracle.c -- answer regcomp()/regexec()/regerror() questions the way
 * sys/share/posixregex.c asks them, with the host C library.
 *
 * NetHack calls regcomp(&re, s, REG_EXTENDED | REG_NOSUB) (posixregex.c
 * regex_compile(), line 70), regexec(&re, s, 0, NULL, 0) (regex_match(),
 * line 99) and regerror(err, &re, buf, BUFSZ) (regex_error_desc(), line
 * 84). NetHack never calls setlocale() on the Unix tty path, so neither
 * does this program: the C library runs in the "C" locale.
 *
 * Each input line is tab-separated hexadecimal: a pattern, then any number
 * of texts. Each output line is
 *   ok<TAB><one 0/1 digit per text>
 * or
 *   err<TAB><regcomp() code><TAB><regerror() text>
 * A text that makes regexec() return neither 0 nor REG_NOMATCH prints its
 * code in brackets in place of the digit.
 */
#include <regex.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define BUFSZ 256

static int
hexval(int c)
{
    if (c >= '0' && c <= '9')
        return c - '0';
    if (c >= 'a' && c <= 'f')
        return c - 'a' + 10;
    return -1;
}

/* Decode the hex field starting at s and ending before a tab, newline or
   NUL into out[]; returns the end of the field. */
static char *
decode(char *s, char *out)
{
    while (hexval(s[0]) >= 0 && hexval(s[1]) >= 0) {
        *out++ = (char) (hexval(s[0]) * 16 + hexval(s[1]));
        s += 2;
    }
    *out = '\0';
    return s;
}

int
main(void)
{
    static char line[1 << 16], pattern[1 << 15], text[1 << 15];

    while (fgets(line, sizeof line, stdin)) {
        regex_t re;
        char *p = decode(line, pattern);
        int err = regcomp(&re, pattern, REG_EXTENDED | REG_NOSUB);

        if (err) {
            char buf[BUFSZ];

            buf[0] = '\0';
            regerror(err, &re, buf, BUFSZ);
            printf("err\t%d\t%s\n", err, buf);
        } else {
            fputs("ok\t", stdout);
            while (*p == '\t') {
                int r;

                p = decode(p + 1, text);
                r = regexec(&re, text, 0, NULL, 0);
                if (r == 0)
                    putchar('1');
                else if (r == REG_NOMATCH)
                    putchar('0');
                else
                    printf("[%d]", r);
            }
            putchar('\n');
            regfree(&re);
        }
        fflush(stdout);
    }
    return 0;
}
