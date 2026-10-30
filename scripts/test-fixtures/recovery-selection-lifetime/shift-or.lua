des.level_init({style='solidfill',fg=' ',lit=false})
des.map({x=10,y=6,map='.x'})
local a=selection.area(0,0,0,0)
des.map({x=20,y=8,map='#x'})
local b=selection.match('#')
local result=a | b
des.map({x=1,y=0,map='xxx\nxxx'})
local points={}
result:iterate(function(x,y) points[#points+1]=(x+1)..','..y end)
nh.pline('SEL_LIFE_SHIFT_OR='..table.concat(points,';'))
des.stair('up',0,0)
des.stair('down',2,2)
