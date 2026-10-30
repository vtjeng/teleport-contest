des.level_init({style='solidfill',fg='.',lit=false})
des.level_flags('icedpools')
des.map({x=1,y=0,map='III\nIII\nIII',lit=true})
local count,icecount=0,0
for x=0,2 do for y=0,2 do local cell=nh.getmap(x,y);if cell.typ==33 then icecount=icecount+1 end;if cell.lit then count=count+1 end end end
nh.pline('MAP_ICE_LIGHT_TRUE_POOL='..count..'/9,ICE='..icecount..'/9')
des.stair('up',0,0)
des.stair('down',2,2)
