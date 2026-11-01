import unusedImports from 'eslint-plugin-unused-imports';

export default [
    {
        ignores: ['js/isaac64.js', 'js/terminal.js', 'js/storage.js'],
    },
    {
        files: ['js/**/*.js', 'scripts/**/*.mjs'],
        plugins: { 'unused-imports': unusedImports },
        rules: {
            'unused-imports/no-unused-imports': 'error',
        },
    },
    {
        // A name that game code uses without importing or declaring it is a
        // ReferenceError only when that path runs, so the judge found
        // SHOP_DOOR_COST in kick_door() missing long after it went in.
        // no-undef finds every such name at lint time. The globals are the
        // ones Node 22 and Chrome provide that ESLint's default list lacks;
        // the game runs in both (AGENTS.md, "Keep the game compatible with
        // the scoring system").
        files: ['js/**/*.js'],
        languageOptions: {
            globals: {
                TextEncoder: 'readonly',
                TextDecoder: 'readonly',
                structuredClone: 'readonly',
                requestAnimationFrame: 'readonly',
                globalThis: 'readonly',
                console: 'readonly',
                performance: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                queueMicrotask: 'readonly',
            },
        },
        rules: {
            'no-undef': 'error',
        },
    },
];
