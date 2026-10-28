#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#define alloc malloc
#define MAP_Y_LIM 21
struct mapfragment {char *data;int wid,hei;};
static char*dupstr(const char*s){size_t n=strlen(s)+1;char*r=malloc(n);assert(r);memcpy(r,s,n);return r;}
typedef struct {int width,height,entries;} lua_State;
static void lua_newtable(lua_State*L){assert(!L->entries);}
static void nhl_add_table_entry_int(lua_State*L,const char*n,int value){if(!strcmp(n,"width"))L->width=value;else {assert(!strcmp(n,"height"));L->height=value;}L->entries++;}
char *
stripdigits(char *s)
{
    char *s1, *s2;

    for (s1 = s2 = s; *s1; s1++)
        if (*s1 < '0' || *s1 > '9')
            *s2++ = *s1;
    *s2 = '\0';

    return s;
}
int
str_lines_maxlen(const char *str)
{
    const char *s1, *s2;
    int len, max_len = 0;

    s1 = str;
    while (s1 && *s1) {
        s2 = strchr(s1, '\n');
        if (s2) {
            len = (int) (s2 - s1);
            s1 = s2 + 1;
        } else {
            len = (int) strlen(s1);
            s1 = (char *) 0;
        }
        if (len > max_len)
            max_len = len;
    }

    return max_len;
}
struct mapfragment *
mapfrag_fromstr(char *str)
{
    struct mapfragment *mf = (struct mapfragment *) alloc(sizeof *mf);

    char *tmps;

    mf->data = dupstr(str);

    (void) stripdigits(mf->data);
    mf->wid = str_lines_maxlen(mf->data);
    mf->hei = 0;
    tmps = mf->data;
    while (tmps && *tmps) {
        char *s1 = strchr(tmps, '\n');

        if (mf->hei > MAP_Y_LIM) {
            free(mf->data);
            free(mf);
            return NULL;
        }
        if (s1)
            s1++;
        tmps = s1;
        mf->hei++;
    }
    return mf;
}
void
mapfrag_free(struct mapfragment **mf)
{
    if (mf && *mf) {
        free((*mf)->data);
        free(*mf);
        *mf = NULL;
    }
}
void
l_push_wid_hei_table(lua_State *L, int wid, int hei)
{
    lua_newtable(L);
    nhl_add_table_entry_int(L, "width", wid);
    nhl_add_table_entry_int(L, "height", hei);
}
int main(int argc,char**argv){assert(argc==2);struct mapfragment*mf=mapfrag_fromstr(argv[1]);assert(mf&&mf->wid==3&&mf->hei==2);lua_State L={0};l_push_wid_hei_table(&L,mf->wid,mf->hei);assert(L.entries==2);printf("%d %d\n",L.width,L.height);mapfrag_free(&mf);return 0;}
