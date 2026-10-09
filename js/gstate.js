// gstate.js — Global game state reference.
// All game modules import `game` from here.

// C decl.c:417 initializes gi.item_action_in_progress to FALSE for a new game.
function initialGameState() {
    return {
        item_action_in_progress: false,
        // C decl.c:init_svn initializes the saved NHUUID buffer to zero.
        // Native get_nhuuid() is inactive in the reference recorder build.
        svn: { nhuuid: '' },
    };
}

export let game = initialGameState();

export function resetGame() {
    game = initialGameState();
    return game;
}
