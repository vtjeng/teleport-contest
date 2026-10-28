#include <stdio.h>
#include <stdlib.h>
typedef int coordxy;
typedef void *genericptr_t;
#define staticfn static
#define STONE 0
#define DBWALL 12
#define TREE 13
#define IRONBARS 22
#define IS_STWALL(typ) ((typ) <= DBWALL)
#define IS_TREE(typ) ((typ) == TREE || (svl.level.flags.arboreal && (typ) == STONE))
struct { struct { struct { int arboreal; } flags; } level; } svl;
/* Isolated property-bit accumulator, not the full rm union or Lua parser. */
struct { int typ, wall_info; } levl[80][21];
staticfn void
sel_set_wall_property(coordxy x, coordxy y, genericptr_t arg)
{
    int prop = *(int *) arg;

    if (IS_STWALL(levl[x][y].typ) || IS_TREE(levl[x][y].typ)
        /* 3.6.2: made iron bars eligible to be flagged nondiggable
           (checked by chewing(hack.c) and zap_over_floor(zap.c)) */
        || levl[x][y].typ == IRONBARS)
        levl[x][y].wall_info |= prop;
}

int main(int argc,char **argv) {
 if(argc!=3)return 2;
 levl[11][10].typ=atoi(argv[1]);svl.level.flags.arboreal=atoi(argv[2]);
 int a=8,b=16;
 sel_set_wall_property(11,10,&a);printf("%d ",levl[11][10].wall_info);
 sel_set_wall_property(11,10,&b);printf("%d\n",levl[11][10].wall_info);
}
