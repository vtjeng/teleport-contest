-- Equivalent supported API recipe, one fresh level per typ (. or #).
-- The executable C oracle uses fixed typed readers; this is not an executed Lua receipt.
des.level_init({style="solidfill",fg=".",lit=0})
des.terrain(13,11,".")
des.terrain(14,11," ")
des.mazewalk({x=11,y=11,dir="east",typ=".",stocked=0})
