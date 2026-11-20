/* Clock driver: applies the recorder's fixed-datetime conversion, NetHack
 * calendar.c time_from_yyyymmddhhmmss() as patched by recorder patches 001
 * (start from localtime() of the current time) and 009 (fixed_isdst() from
 * NETHACK_FIXED_ISDST), then localtime() of the result as getlt() does.
 *
 * usage: TZ=America/New_York NETHACK_FIXED_ISDST=<0|1> clockdrv <now|summer> < grid
 *   now:    copy localtime(time(NULL)), exactly as the patched recorder does.
 *   summer: copy localtime() of 2026-07-01 12:00 UTC (New York daylight
 *           time), the season the judge recorded in; tests whether
 *           tm_gmtoff/tm_zone of the copied struct affect mktime().
 * output: date base isdst_env mktime_raw Y M D h m s wday yday isdst gmtoff zone
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

/* Copied from patch 009, with getenv() for nh_getenv(). */
static void
fixed_isdst(struct tm *t)
{
    const char *isdst = getenv("NETHACK_FIXED_ISDST");

    if (isdst && (!strcmp(isdst, "0") || !strcmp(isdst, "1")))
        t->tm_isdst = *isdst - '0';
}

int
main(int argc, char **argv)
{
    char buf[64];
    int summer = argc > 1 && !strcmp(argv[1], "summer");
    const char *env = getenv("NETHACK_FIXED_ISDST");

    tzset();
    fprintf(stderr, "tzname: %s %s\n", tzname[0], tzname[1]);
    while (fgets(buf, sizeof buf, stdin)) {
        char *d, *p, y[5], mo[3], md[3], h[3], mi[3], s[3];
        int k;
        struct tm t, *lt;
        time_t now, timeresult = (time_t) 0, shown;

        buf[strcspn(buf, "\n")] = '\0';
        if (strlen(buf) != 14)
            continue;
        /* Patch 001 / upstream calendar.c field split. */
        d = buf;
        p = y; for (k = 0; k < 4; ++k) *p++ = *d++; *p = '\0';
        p = mo; for (k = 0; k < 2; ++k) *p++ = *d++; *p = '\0';
        p = md; for (k = 0; k < 2; ++k) *p++ = *d++; *p = '\0';
        p = h; for (k = 0; k < 2; ++k) *p++ = *d++; *p = '\0';
        p = mi; for (k = 0; k < 2; ++k) *p++ = *d++; *p = '\0';
        p = s; for (k = 0; k < 2; ++k) *p++ = *d++; *p = '\0';
        if (summer)
            now = (time_t) 1782907200;
        else
            (void) time(&now);
        lt = localtime(&now);
        if (!lt) {
            printf("%s %s %s nolt\n", buf, summer ? "summer" : "now", env ? env : "-");
            continue;
        }
        t = *lt; fixed_isdst(&t);
        t.tm_year = atoi(y) - 1900;
        t.tm_mon = atoi(mo) - 1;
        t.tm_mday = atoi(md);
        t.tm_hour = atoi(h);
        t.tm_min = atoi(mi);
        t.tm_sec = atoi(s);
        timeresult = mktime(&t);
        /* time_from_yyyymmddhhmmss() returns 0 for -1; getnow() then uses
         * the real clock. Print the raw value; localtime only when usable. */
        shown = timeresult;
        lt = (timeresult == (time_t) -1) ? NULL : localtime(&shown);
        if (!lt) {
            printf("%s %s %s %lld none\n", buf, summer ? "summer" : "now",
                   env ? env : "-", (long long) timeresult);
            continue;
        }
        printf("%s %s %s %lld %d %d %d %d %d %d %d %d %d %ld %s\n", buf,
               summer ? "summer" : "now", env ? env : "-",
               (long long) timeresult, lt->tm_year + 1900, lt->tm_mon + 1,
               lt->tm_mday, lt->tm_hour, lt->tm_min, lt->tm_sec, lt->tm_wday,
               lt->tm_yday, lt->tm_isdst, (long) lt->tm_gmtoff, lt->tm_zone);
    }
    return 0;
}
