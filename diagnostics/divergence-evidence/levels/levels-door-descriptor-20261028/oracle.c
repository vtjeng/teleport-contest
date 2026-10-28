/* Reuse the bundled exact C orientation routine and rm wrapper. */
#define main orientation_main
#include "../levels-door-orientation-20261028/oracle.c"
#undef main
typedef int coordxy;
typedef void *genericptr_t;
#define D_SECRET 0x20
#define D_CLOSED 0x04
static int SpLev_Map[80][21];
staticfn void
sel_set_door(coordxy dx, coordxy dy, genericptr_t arg)
{
    coordxy typ = *(coordxy *) arg;
    coordxy x = dx, y = dy;

    if (!IS_DOOR(levl[x][y].typ) && levl[x][y].typ != SDOOR)
        levl[x][y].typ = (typ & D_SECRET) ? SDOOR : DOOR;
    if (typ & D_SECRET) {
        typ &= ~D_SECRET;
        if (typ < D_CLOSED)
            typ = D_CLOSED;
    }
    set_door_orientation(x, y); /* set/clear levl[x][y].horizontal */
    levl[x][y].doormask = typ;
    SpLev_Map[x][y] = 1;
}

int main(void){int old,mask,l,r,u,d;while(scanf("%d%d%d%d%d%d",&old,&mask,&l,&r,&u,&d)==6){
 memset(levl,0,sizeof levl);memset(SpLev_Map,0,sizeof SpLev_Map);levl[10][10].typ=old;
 levl[9][10].typ=l;levl[11][10].typ=r;levl[10][9].typ=u;levl[10][11].typ=d;
 sel_set_door(10,10,&mask);printf("%d %d %d %d\n",levl[10][10].typ,levl[10][10].doormask,levl[10][10].horizontal,SpLev_Map[10][10]);
}return 0;}
