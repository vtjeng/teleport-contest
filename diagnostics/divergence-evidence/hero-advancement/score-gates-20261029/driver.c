int main(int argc,char **argv){
 if(argc!=2)return 2;
 FILE*f=fopen(argv[1],"r");if(!f)return 2;
 int id,exper,rexp,beginner;
 while(fscanf(f,"%d %d %ld %ld %d %d %d %d %d",&id,&role,&u.uexp,&u.urexp,&exper,&rexp,&flags.showexp,&disp.botl,&beginner)==9){
  assert(role==0||role==1);assert(u.uexp>=0&&u.uexp<10000&&u.urexp>=0&&u.urexp<10000);assert(exper>=0&&exper<=2&&rexp>=0&&rexp<=10);
  u.ulevel=1;flags.beginner=beginner;gb.blstats[0][0].percent_matters=1;
  more_experienced(exper,rexp);
  printf("{\"id\":%d,\"xp\":%ld,\"score\":%ld,\"beginner\":%s,\"redraw\":%s}\n",id,u.uexp,u.urexp,flags.beginner?"true":"false",disp.botl?"true":"false");
 }
 int result=feof(f)?0:2;fclose(f);return result;
}
