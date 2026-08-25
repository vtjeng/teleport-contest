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
];
