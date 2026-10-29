#include <stdio.h>
#include <string.h>
#include <assert.h>
struct coder {int marker;};static struct coder existing={73},fresh={91};
static struct {struct coder*coder;}gc;
static int initcalls;
/* Initializer interface adapter: tests guard dispatch, not initialization contents. */
static struct coder*sp_level_coder_init(void){initcalls++;return &fresh;}
void
create_des_coder(void)
{
    if (!gc.coder)
        gc.coder = sp_level_coder_init();
}
int main(int argc,char**argv){assert(argc==2);if(!strcmp(argv[1],"target")){gc.coder=&existing;for(int i=0;i<6;i++){create_des_coder();assert(gc.coder==&existing&&gc.coder->marker==73&&initcalls==0);}puts("6 initialized guards;0 initializer calls;pointer and marker unchanged");}else{assert(!strcmp(argv[1],"control"));gc.coder=NULL;create_des_coder();assert(gc.coder==&fresh&&initcalls==1);create_des_coder();assert(gc.coder==&fresh&&initcalls==1);puts("null guard initializes once;repeat preserves pointer");}return 0;}
