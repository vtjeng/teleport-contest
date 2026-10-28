#include <stdio.h>
#include <stdlib.h>
#include <assert.h>
typedef struct {int argc;char **argv;} lua_State;
#define BUFSZ 256
#define Sprintf sprintf
#define strcmpi(a,b) strncmpi((a),(b),-1)
#define Sokoban svl.level.flags.sokoban_rules
struct {struct {struct {int noteleport,hardfloor,nommap,shortsighted,arboreal,is_maze_lev,hero_memory,graveyard,corrmaze,sokoban_rules,temperature,rndmongen,deathdrops,noautosearch,fumaroles,stormy;} flags;} level;} svl;
static int icedpools;
static struct coder {int premapped,solidify,check_inaccessibles,allow_flips;} coder;
static struct {struct coder *coder;} gc={&coder};
static void create_des_coder(void){}
static int lua_gettop(lua_State *L){return L->argc;}
static const char *luaL_checkstring(lua_State *L,int i){assert(i>=1&&i<=L->argc);return L->argv[i-1];}
static void nhl_error(lua_State *L,const char *s){(void)L;fprintf(stderr,"%s\n",s);exit(2);}
char
lowc(char c)
{
    return (char) (('A' <= c && c <= 'Z') ? (c | 040) : c);
}
int
strncmpi(
    const char *s1, const char *s2,
    int n) /*(should probably be size_t, which is unsigned)*/
{
    char t1, t2;

    while (n--) {
        if (!*s2)
            return (*s1 != 0); /* s1 >= s2 */
        else if (!*s1)
            return -1; /* s1  < s2 */
        t1 = lowc(*s1++);
        t2 = lowc(*s2++);
        if (t1 != t2)
            return (t1 > t2) ? 1 : -1;
    }
    return 0; /* s1 == s2 */
}
int
lspo_level_flags(lua_State *L)
{
    int argc = lua_gettop(L);
    int i;

    create_des_coder();

    if (argc < 1)
        nhl_error(L, "expected string params");

    for (i = 1; i <= argc; i++) {
        const char *s = luaL_checkstring(L, i);

        if (!strcmpi(s, "noteleport"))
            svl.level.flags.noteleport = 1;
        else if (!strcmpi(s, "hardfloor"))
            svl.level.flags.hardfloor = 1;
        else if (!strcmpi(s, "nommap"))
            svl.level.flags.nommap = 1;
        else if (!strcmpi(s, "shortsighted"))
            svl.level.flags.shortsighted = 1;
        else if (!strcmpi(s, "arboreal"))
            svl.level.flags.arboreal = 1;
        else if (!strcmpi(s, "mazelevel"))
            svl.level.flags.is_maze_lev = 1;
        else if (!strcmpi(s, "shroud"))
            svl.level.flags.hero_memory = 1;
        else if (!strcmpi(s, "graveyard"))
            svl.level.flags.graveyard = 1;
        else if (!strcmpi(s, "icedpools"))
            icedpools = 1;
        else if (!strcmpi(s, "corrmaze"))
            svl.level.flags.corrmaze = 1;
        else if (!strcmpi(s, "premapped"))
            gc.coder->premapped = 1;
        else if (!strcmpi(s, "solidify"))
            gc.coder->solidify = 1;
        else if (!strcmpi(s, "sokoban"))
            Sokoban = 1; /* svl.level.flags.sokoban_rules */
        else if (!strcmpi(s, "inaccessibles"))
            gc.coder->check_inaccessibles = 1;
        else if (!strcmpi(s, "noflipx"))
            gc.coder->allow_flips &= ~2;
        else if (!strcmpi(s, "noflipy"))
            gc.coder->allow_flips &= ~1;
        else if (!strcmpi(s, "noflip"))
            gc.coder->allow_flips = 0;
        else if (!strcmpi(s, "temperate"))
            svl.level.flags.temperature = 0;
        else if (!strcmpi(s, "hot"))
            svl.level.flags.temperature = 1;
        else if (!strcmpi(s, "cold"))
            svl.level.flags.temperature = -1;
        else if (!strcmpi(s, "nomongen"))
            svl.level.flags.rndmongen = 0;
        else if (!strcmpi(s, "nodeathdrops"))
            svl.level.flags.deathdrops = 0;
        else if (!strcmpi(s, "noautosearch"))
            svl.level.flags.noautosearch = 1;
        else if (!strcmpi(s, "fumaroles"))
            svl.level.flags.fumaroles = 1;
        else if (!strcmpi(s, "stormy"))
            svl.level.flags.stormy = 1;
        else {
            char buf[BUFSZ];

            Sprintf(buf, "Unknown level flag %s", s);
            nhl_error(L, buf);
        }
    }

    return 0;
}
int main(int argc,char**argv){assert(argc==3);svl.level.flags.rndmongen=svl.level.flags.deathdrops=1;lua_State L={1,argv+2};assert(lspo_level_flags(&L)==0);int index=atoi(argv[1]);switch(index){case 0:printf("%d\n",svl.level.flags.noteleport);break;case 1:printf("%d\n",svl.level.flags.hardfloor);break;case 2:printf("%d\n",svl.level.flags.nommap);break;case 3:printf("%d\n",svl.level.flags.shortsighted);break;case 4:printf("%d\n",svl.level.flags.arboreal);break;case 5:printf("%d\n",svl.level.flags.is_maze_lev);break;case 6:printf("%d\n",svl.level.flags.hero_memory);break;case 7:printf("%d\n",svl.level.flags.graveyard);break;case 8:printf("%d\n",svl.level.flags.corrmaze);break;case 9:printf("%d\n",svl.level.flags.sokoban_rules);break;case 10:printf("%d\n",svl.level.flags.temperature);break;case 11:printf("%d\n",svl.level.flags.temperature);break;case 12:printf("%d\n",svl.level.flags.temperature);break;case 13:printf("%d\n",svl.level.flags.rndmongen);break;case 14:printf("%d\n",svl.level.flags.deathdrops);break;case 15:printf("%d\n",svl.level.flags.noautosearch);break;case 16:printf("%d\n",svl.level.flags.fumaroles);break;case 17:printf("%d\n",svl.level.flags.stormy);break;default:abort();}return 0;}
