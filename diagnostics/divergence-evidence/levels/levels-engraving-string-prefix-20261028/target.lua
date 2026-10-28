-- One fresh level per form/text. Contract fixture, not an executed Lua receipt.
des.level_init({style="solidfill",fg=".",lit=0})
local text = "alpha\0omega"
-- Controls also use empty string and UTF-8 café.
des.engraving({x=2,y=2,type="engrave",text=text})
-- Alternative positional form on a fresh level: des.engraving({2,2},"engrave",text)
