export function enableBrowserGlyphProjection(display) {
    display.terminal.spans = Array.from(
        { length: display.rows },
        () => Array.from({ length: display.cols }, () => ({
            textContent: ' ',
            style: {},
            classList: { add() {}, remove() {} },
        })),
    );
}
