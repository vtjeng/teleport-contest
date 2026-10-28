/* Fixed field-capture adapter, not a Lua interpreter. */
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
typedef int boolean;typedef int lua_State;
struct mkroom {int lx,hx,ly,hy,rtype,rlit,irregular,needjoining;};
enum {OROOM,THEMEROOM,COURT,SWAMP,VAULT,BEEHIVE,MORGUE,BARRACKS,ZOO,DELPHI,TEMPLE,LEPREHALL,COCKNEST,ANTHOLE,SHOPBASE,ARMORSHOP,SCROLLSHOP,POTIONSHOP,WEAPONSHOP,FOODSHOP,RINGSHOP,WANDSHOP,TOOLSHOP,BOOKSHOP,FODDERSHOP,CANDLESHOP};
#define impossible(...) abort()
static int fields;
static void lua_newtable(lua_State *L){(void)L;assert(!fields);putchar('{');}
static void key(const char *name){if(fields++)putchar(',');printf("\"%s\":",name);}
static void nhl_add_table_entry_int(lua_State *L,const char *n,int v){(void)L;key(n);printf("%d",v);}
static void nhl_add_table_entry_bool(lua_State *L,const char *n,boolean v){(void)L;key(n);printf("%s",v?"true":"false");}
static void nhl_add_table_entry_str(lua_State *L,const char *n,const char *v){(void)L;key(n);printf("\"%s\"",v);}
static void nhl_add_table_entry_region(lua_State *L,const char *n,int x1,int y1,int x2,int y2){(void)L;key(n);printf("{\"x1\":%d,\"y1\":%d,\"x2\":%d,\"y2\":%d}",x1,y1,x2,y2);}
static const struct {
    const char *name;
    int type;
} room_types[] = {
    { "ordinary", OROOM },
    { "themed", THEMEROOM },
    { "throne", COURT },
    { "swamp", SWAMP },
    { "vault", VAULT },
    { "beehive", BEEHIVE },
    { "morgue", MORGUE },
    { "barracks", BARRACKS },
    { "zoo", ZOO },
    { "delphi", DELPHI },
    { "temple", TEMPLE },
    { "anthole", ANTHOLE },
    { "cocknest", COCKNEST },
    { "leprehall", LEPREHALL },
    { "shop", SHOPBASE },
    { "armor shop", ARMORSHOP },
    { "scroll shop", SCROLLSHOP },
    { "potion shop", POTIONSHOP },
    { "weapon shop", WEAPONSHOP },
    { "food shop", FOODSHOP },
    { "ring shop", RINGSHOP },
    { "wand shop", WANDSHOP },
    { "tool shop", TOOLSHOP },
    { "book shop", BOOKSHOP },
    { "health food shop", FODDERSHOP },
    { "candle shop", CANDLESHOP },
    { 0, 0 }
};
static const char *
get_mkroom_name(int rtype)
{
    int i;

    for (i = 0; room_types[i].name; i++)
        if (room_types[i].type == rtype)
            return room_types[i].name;

    impossible("get_mkroom_name unknown rtype %d", rtype);
    return "unknown"; /* not NULL */
}
static void
l_push_mkroom_table(lua_State *L, struct mkroom *tmpr)
{
    lua_newtable(L);
    nhl_add_table_entry_int(L, "width", 1 + (tmpr->hx - tmpr->lx));
    nhl_add_table_entry_int(L, "height", 1 + (tmpr->hy - tmpr->ly));
    nhl_add_table_entry_region(L, "region", tmpr->lx, tmpr->ly,
                               tmpr->hx, tmpr->hy);
    nhl_add_table_entry_bool(L, "lit", (boolean) tmpr->rlit);
    nhl_add_table_entry_bool(L, "irregular", tmpr->irregular);
    nhl_add_table_entry_bool(L, "needjoining", tmpr->needjoining);
    nhl_add_table_entry_str(L, "type", get_mkroom_name(tmpr->rtype));
}
int main(int argc,char **argv){assert(argc==4);int type=atoi(argv[1]);assert(type==OROOM||type==VAULT||type==TEMPLE);struct mkroom r={11,15,5,7,type,atoi(argv[2]),0,atoi(argv[3])};l_push_mkroom_table(NULL,&r);assert(fields==7);puts("}");}
