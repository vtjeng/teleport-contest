#include <stdio.h>
#include <string.h>
#include <stddef.h>
typedef signed char schar;
enum levl_typ_types {
    STONE     =  0,
    VWALL     =  1,
    HWALL     =  2,
    TLCORNER  =  3,
    TRCORNER  =  4,
    BLCORNER  =  5,
    BRCORNER  =  6,
    CROSSWALL =  7, /* For pretty mazes and special levels */
    TUWALL    =  8,
    TDWALL    =  9,
    TLWALL    = 10,
    TRWALL    = 11,
    DBWALL    = 12,
    TREE      = 13, /* KMH */
    SDOOR     = 14,
    SCORR     = 15,
    POOL      = 16,
    MOAT      = 17, /* pool that doesn't boil, adjust messages */
    WATER     = 18,
    DRAWBRIDGE_UP = 19,
    LAVAPOOL  = 20,
    LAVAWALL  = 21,
    IRONBARS  = 22, /* KMH */
    DOOR      = 23,
    CORR      = 24,
    ROOM      = 25,
    STAIRS    = 26,
    LADDER    = 27,
    FOUNTAIN  = 28,
    THRONE    = 29,
    SINK      = 30,
    GRAVE     = 31,
    ALTAR     = 32,
    ICE       = 33,
    DRAWBRIDGE_DOWN = 34,
    AIR       = 35,
    CLOUD     = 36,

    MAX_TYPE  = 37,
    /* for special levels */
    MATCH_WALL = 38,

    /* these aren't levl[][].typ values, they're additional indices
       into terrain_descr[] for status feedback */
    xFLOOR     = 39,
    xGROUND    = 40,
    xOPENDOOR  = 41,
    xSHUTDOOR  = 42,
    xSWAMP     = 43,
    xSUBMERGED = 44,
    xSEA       = 45,
    xWATERWALL = 46,

    INVALID_TYPE = 127
};
static const struct {
    char ch;
    schar typ;
} char2typ[] = {
                { ' ', STONE },
                { '#', CORR },
                { '.', ROOM },
                { '-', HWALL },
                { '-', TLCORNER },
                { '-', TRCORNER },
                { '-', BLCORNER },
                { '-', BRCORNER },
                { '-', CROSSWALL },
                { '-', TUWALL },
                { '-', TDWALL },
                { '-', TLWALL },
                { '-', TRWALL },
                { '-', DBWALL },
                { '|', VWALL },
                { '+', DOOR },
                { 'A', AIR },
                { 'C', CLOUD },
                { 'S', SDOOR },
                { 'H', SCORR },
                { '{', FOUNTAIN },
                { '\\', THRONE },
                { 'K', SINK },
                { '}', MOAT },
                { 'P', POOL },
                { 'L', LAVAPOOL },
                { 'Z', LAVAWALL },
                { 'I', ICE },
                { 'W', WATER },
                { 'T', TREE },
                { 'F', IRONBARS }, /* Fe = iron */
                { 'x', MAX_TYPE }, /* "see-through" */
                { 'B', CROSSWALL }, /* hack: boundary location */
                { 'w', MATCH_WALL }, /* IS_STWALL() */
                { '\0', STONE },
};
schar
splev_chr2typ(char c)
{
    int i;

    for (i = 0; char2typ[i].ch; i++)
        if (c == char2typ[i].ch)
            return char2typ[i].typ;
    return (INVALID_TYPE);
}
schar
check_mapchr(const char *s)
{
    if (s && strlen(s) == 1)
        return splev_chr2typ(s[0]);
    return INVALID_TYPE;
}
int main(void) {
const char *cases[] = {NULL,"","\0suffix","T","T\0suffix","TT","TT\0suffix",".",".\0suffix","#","#\0suffix"," "," \0suffix","?","?\0suffix","x"};
for(unsigned i=0;i<sizeof(cases)/sizeof(cases[0]);i++) printf("%d\n",(int)check_mapchr(cases[i]));
}
