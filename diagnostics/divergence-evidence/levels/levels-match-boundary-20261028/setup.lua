-- Equivalent public descriptor calls; no custom Lua runtime required.
-- Default frame xstart=1: relative 76..78 map to absolute 77..79.
des.terrain({x=76,y=10,typ="."})
des.terrain({x=77,y=10,typ="|"})
des.terrain({x=78,y=10,typ="."})
des.terrain(selection.match("[.w.]"), "-")
