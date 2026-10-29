#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define LUA_TNIL 0
#define LUA_TSTRING 1
#define LUA_TBOOLEAN 2
#define LUA_TNUMBER 3
typedef struct {int mode;} lua_State;
static struct {int flags;} levl[80][21];
static void lua_getfield(lua_State*L,int i,const char*n){assert(i==-1&&L&&n);}
static void lua_pop(lua_State*L,int n){assert(L&&n==1);}
static int lua_type(lua_State*L,int i){assert(i==-1);return !L->mode?LUA_TNIL:L->mode<=2?LUA_TBOOLEAN:L->mode<=4?LUA_TNUMBER:LUA_TSTRING;}
static int lua_toboolean(lua_State*L,int i){assert(i==-1);return L->mode==1;}
static int luaL_checkinteger(lua_State*L,int i){assert(i==-1);return L->mode-3;}
static int luaL_checkoption(lua_State*L,int i,void*d,const char*const*opts){assert(i==-1&&!d);const char*values[]={"true","false","yes","no"};const char*v=values[L->mode-5];for(int j=0;opts[j];j++)if(!strcmp(v,opts[j]))return j;abort();}
static void nhl_error(lua_State*L,const char*s){(void)L;(void)s;abort();}
static int rn2(int n){(void)n;abort();}
int
get_table_boolean(lua_State *L, const char *name)
{
    static const char *const boolstr[] = {
        "true", "false", "yes", "no", NULL
    };
    /* static const int boolstr2i[] = { TRUE, FALSE, TRUE, FALSE, -1 }; */
    int ltyp;
    int ret = -1;

    lua_getfield(L, -1, name);
    ltyp = lua_type(L, -1);
    if (ltyp == LUA_TSTRING) {
        ret = luaL_checkoption(L, -1, NULL, boolstr);
        /* nhUse(boolstr2i[0]); */
    } else if (ltyp == LUA_TBOOLEAN) {
        ret = lua_toboolean(L, -1);
    } else if (ltyp == LUA_TNUMBER) {
        ret = (int) luaL_checkinteger(L, -1);
        if (ret < 0 || ret > 1)
            ret = -1;
    }
    lua_pop(L, 1);
    if (ret == -1)
        nhl_error(L, "Expected a boolean");
    return ret;
}
int
get_table_boolean_opt(lua_State *L, const char *name, int defval)
{
    int ret = defval;

    lua_getfield(L, -1, name);
    if (lua_type(L, -1) != LUA_TNIL) {
        lua_pop(L, 1);
        return get_table_boolean(L, name);
    }
    lua_pop(L, 1);
    return ret;
}
void
l_table_getset_feature_flag(
    lua_State *L,
    int x, int y,
    const char *name,
    int flag)
{
    int val = get_table_boolean_opt(L, name, -2);

    if (val != -2) {
        if (val == -1)
            val = rn2(2);
        if (val)
            levl[x][y].flags |= flag;
        else
            levl[x][y].flags &= ~flag;
    }
}
int main(int argc,char**argv){assert(argc==3);int count=atoi(argv[2]);lua_State L={atoi(argv[1])};l_table_getset_feature_flag(&L,11,7,"looted",1);if(count==2)l_table_getset_feature_flag(&L,11,7,"other",2);printf("%d\n",levl[11][7].flags);return 0;}
