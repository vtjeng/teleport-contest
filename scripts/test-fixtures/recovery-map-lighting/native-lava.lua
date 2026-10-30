des.level_init({style='solidfill',fg='.',lit=false})
des.map({x=1,y=0,map='LLL\nLLL\nLLL', lit=false})
local litcount = 0
for x=0,2 do for y=0,2 do
 if nh.getmap(x,y).lit then litcount=litcount+1 end
end end
nh.pline('MAPLIT_NATIVE_LAVA=' .. litcount .. '/9')
des.stair('up',0,0)
des.stair('down',2,2)
