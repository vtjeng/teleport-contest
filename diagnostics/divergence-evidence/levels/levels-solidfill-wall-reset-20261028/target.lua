-- Equivalent public setup; C runner executes typed wrapper adapters, not this Lua file.
-- Repeat independently with nondiggable and nonpasswall.
des.level_init({style="solidfill",fg=".",lit=0})
for x=9,11 do for y=6,8 do des.terrain({x=x,y=y,typ="-",lit=0}) end end
des.wall_property({region={9,6,11,8},property="nondiggable"})
des.level_init({style="solidfill",fg="-",bg="-",lit=0})
