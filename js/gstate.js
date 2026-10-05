// gstate.js — Global game state reference.
// All game modules import `game` from here.

// C decl.c:417 initializes gi.item_action_in_progress to FALSE for a new game.
export let game = { item_action_in_progress: false };

export function resetGame() {
    game = { item_action_in_progress: false };
    return game;
}
