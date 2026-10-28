#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#include <stdarg.h>
typedef void*genericptr_t;typedef struct{int lx,ly,hx,hy;}NhRect;
#define COLNO 80
#define ROWNO 21
static int fail_allocation,calls,frees;static long pool[1024];
static void*fake_malloc(size_t n){assert(n<=sizeof(pool));calls++;return fail_allocation?NULL:pool;}
static void fake_free(void*p){assert(p==pool);frees++;}
static _Noreturn void panic(const char*fmt,...){
 assert(fail_allocation);
#ifdef MONITOR_HEAP
 assert(!strcmp(fmt,"Cannot get %u bytes, line %d of %s"));puts("nhalloc stopped before init_rect null guard");
#else
 assert(!strcmp(fmt,"Memory allocation failure; cannot get %u bytes"));puts("alloc stopped before init_rect null guard");
#endif
 exit(0);
}
#define malloc fake_malloc
#define free fake_free
#define ForceAlignedLength(LTH) \
    do {                                                        \
        if (!(LTH) || (LTH) % sizeof (long) != 0)               \
            (LTH) += sizeof (long) - (LTH) % sizeof (long);     \
    } while (0)

long *
alloc(unsigned int lth)
{
    genericptr_t ptr;

    ForceAlignedLength(lth);
    ptr = malloc(lth);
#ifndef MONITOR_HEAP
    if (!ptr)
        panic("Memory allocation failure; cannot get %u bytes", lth);
#else
    /* for #if MONITOR_HEAP, failure is handled in nhalloc() */
#endif
    return (long *) ptr;
}
#ifdef MONITOR_HEAP
static int tried_heaplog=1;static FILE*heaplog=NULL;
static void heapmon_init(void){abort();}
static char*fmt_ptr(void*p){(void)p;abort();}
long *
nhalloc(unsigned int lth, const char *file, int line)
{
    long *ptr = alloc(lth);

    if (!tried_heaplog)
        heapmon_init();
    if (heaplog)
        (void) fprintf(heaplog, "+%5u %s %4d %s\n", lth,
                       fmt_ptr((genericptr_t) ptr), line, file);
    /* potential panic in alloc() was deferred til here */
    if (!ptr)
        panic("Cannot get %u bytes, line %d of %s", lth, line, file);

    return ptr;
}
#define alloc(a) nhalloc(a,__FILE__,__LINE__)
#endif
static NhRect*rect=NULL;static int n_rects=0,rect_cnt=0;
void
init_rect(void)
{
    if (!rect) {
        n_rects = (COLNO * ROWNO) / 30;
        rect = (NhRect *) alloc(sizeof(NhRect) * n_rects);
        if (!rect)
            panic("Could not alloc rect");
    }

    rect_cnt = 1;
    rect[0].lx = rect[0].ly = 0;
    rect[0].hx = COLNO - 1;
    rect[0].hy = ROWNO - 1;
}
void
free_rect(void)
{
    if (rect)
        free(rect);
    rect = 0;
    n_rects = rect_cnt = 0;
}
static void snapshot(void){printf("%d %d %d %d %d %d %d %d\n",calls,frees,n_rects,rect_cnt,rect[0].lx,rect[0].ly,rect[0].hx,rect[0].hy);}
int main(int argc,char**argv){assert(argc==2);fail_allocation=!strcmp(argv[1],"target");assert(fail_allocation||!strcmp(argv[1],"control"));init_rect();if(fail_allocation){fputs("unexpected init_rect return\n",stderr);return 1;}snapshot();init_rect();snapshot();free_rect();assert(!rect&&!n_rects&&!rect_cnt);init_rect();snapshot();free_rect();return 0;}
