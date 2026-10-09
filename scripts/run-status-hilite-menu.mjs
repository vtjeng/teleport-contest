// Independently chosen C-first menu missions, based on options.c/botl.c
// prompts and accelerators. Values cover source branches rather than a replay.
import { writeFileSync } from 'node:fs';
const menu = '.#optionsfull\n:status highlight rules\n\n';
const config = 'OPTIONS=name:Lysa,role:Healer,race:human,gender:female,align:neutral,!legacy,!tutorial,!splash_screen,pettype:none,!autopickup\n';
export const statusMenuRecipes = [
    ['status-menu-empty-full', '', menu + '\x1b.', 'empty status menu via full options callback'],
    ['status-menu-hp-percent', '', menu + ':hitpoints\np<40%\nbb\n \x1b\x1b.', 'HP percentage threshold, red and bold'],
    ['status-menu-ac-number', '', menu + ':armor-class\nn-2\nadc\n \x1b\x1b.', 'AC negative threshold and relation choice'],
    ['status-menu-condition', '', menu + ':condition\nbk\nbc\n \x1b\x1b.', 'condition pair, source color/attribute menus'],
    ['status-menu-existing-view-remove', 'OPTIONS=hilite_status:hitpoints/always/red&bold condition/blind+stone/blue&dim\n', menu + '\x1ba :hitpoints\naX\n\x1b.', 'view configuration-format rules and remove by temporary identity'],
    ['status-menu-title', '', menu + ':title\ntcbb\n \x1b\x1b.', 'female title selection'],
    ['menu-attribute-headings', '', '.#optionsfull\n:menu_headings\n\nbc. ', 'canonical dim heading selector'],
    ['menu-attribute-pet', '', '.#optionsfull\n:petattr\n\nc.', 'canonical dim pet selector'],
    ['menu-color-add-remove', '', '.#optionsfull\n:menu colors\n\naLysa\nbcrab\nrx.', 'live menucolor add/list/remove selector consumer'],
    ['status-menu-empty-simple', '', '.O:status highlight rules\n\x1b\x1b.', 'ordinary O single-selection callback variation'],
    ['menu-color-list', 'MENUCOLOR="Lysa"=blue&bold\n', '.#optionsfull\n:menu colors\n\nl xr.', 'existing menucolor list and exit'],
    ['status-menu-value-change', '', menu + ':time\ncbcb\n \x1b\x1b.', 'time increase relation and temporary highlight creation'],
    ['menu-attributes-startup-simple', 'OPTIONS=menu_headings:blue&bold,petattr:underline\n', '.O:petattr\n\x1b\x1b.', 'explicit startup attribute parsing and ordinary pet query cancellation'],
    ['status-menu-wizard-title-pair', '', menu + ':title\nt:"Enchantress" or "Enchanter"\nbb\n  \x1b\x1b.', 'female Wizard rank pair split into two independent thresholds'],
].map(([name, extra, moves, target], i) => ({ name, recipe: {
    version: 5, comment: `Independent C-first source mission: ${target}. Seed18032031+index and clock20561117132435 chosen before JS comparison; cheap role/menu variations preserve causal independence.`,
    segments: [{ seed: 18032031 + i, datetime: '20561117132435', nethackrc: (name.includes('wizard') ? config.replace('role:Healer', 'role:Wizard') : config) + extra, moves }],
} }));
if (process.argv.includes('--write')) for (const { name, recipe } of statusMenuRecipes) writeFileSync(`recipes/options.c/${name}.session.json`, JSON.stringify(recipe, null, 2) + '\n');
