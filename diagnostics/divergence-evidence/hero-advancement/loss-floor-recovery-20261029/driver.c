int main(int argc,char **argv){
 if(argc!=12)return 2;
 const char *mode=argv[1];
 u.ulevel=atoi(argv[2]);u.uexp=atol(argv[3]);u.uhp=atoi(argv[4]);u.uhpmax=atoi(argv[5]);u.uen=atoi(argv[6]);u.uenmax=atoi(argv[7]);
 int hi=atoi(argv[8]),ei=atoi(argv[9]);upper=atoi(argv[10]);u.ulevelmax=atoi(argv[11]);
 assert(u.ulevel>=1&&u.ulevel<=30&&u.uhp>=1&&u.uhp<=u.uhpmax&&u.uen>=0&&u.uen<=u.uenmax);
 u.ulevelpeak=u.ulevelmax;u.uhppeak=u.uhpmax;u.uenpeak=u.uenmax;
 for(int i=1;i<u.ulevel;i++){u.uhpinc[i]=2;u.ueninc[i]=4;}
 int slot=!strcmp(mode,"loss")?u.ulevel-1:u.ulevel;
 if(slot<30){u.uhpinc[slot]=hi;u.ueninc[slot]=ei;}
 if(!strcmp(mode,"gain"))newexplevel();
 else if(!strcmp(mode,"loss"))losexp("#levelchange");
 else return 2;
 printf("{\"ulevel\":%d,\"ulevelmax\":%d,\"ulevelpeak\":%d,\"uexp\":%ld,\"uhp\":%d,\"uhpmax\":%d,\"uhppeak\":%d,\"uen\":%d,\"uenmax\":%d,\"uenpeak\":%d,\"hpinc\":%d,\"eninc\":%d,\"botl\":%s,\"rng\":\"%s\",\"messages\":\"%s\"}\n",u.ulevel,u.ulevelmax,u.ulevelpeak,u.uexp,u.uhp,u.uhpmax,u.uhppeak,u.uen,u.uenmax,u.uenpeak,slot<30?u.uhpinc[slot]:0,slot<30?u.ueninc[slot]:0,disp.botl?"true":"false",rng,messages);
 return 0;
}
