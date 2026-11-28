// Render values as JavaScript source for the generated js/*_data.js tables.
//
// A string that holds newlines becomes an array of its lines joined with
// "\n", one source line per line of the data file. A change to one line of
// the C or Lua data then changes one line of the generated JavaScript, and no
// generated line is longer than the longest line of its source.

const INDENT = '    ';

// Return a JavaScript expression that evaluates to `text`.
export function stringLiteral(text, indent = '') {
    if (!text.includes('\n')) return JSON.stringify(text);
    const inner = indent + INDENT;
    const lines = text.split('\n').map((line) => `${inner}${JSON.stringify(line)},`);
    return `[\n${lines.join('\n')}\n${indent}].join('\\n')`;
}

// Return a JavaScript expression that evaluates to a value deep-equal to
// `value`, laid out as JSON.stringify(value, null, 4) lays it out, with each
// string rendered by stringLiteral().
export function valueLiteral(value, indent = '') {
    if (typeof value === 'string') return stringLiteral(value, indent);
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    const inner = indent + INDENT;
    if (Array.isArray(value)) {
        if (!value.length) return '[]';
        const items = value.map((item) => `${inner}${valueLiteral(item, inner)}`);
        return `[\n${items.join(',\n')}\n${indent}]`;
    }
    const entries = Object.entries(value);
    if (!entries.length) return '{}';
    const fields = entries.map(([key, item]) =>
        `${inner}${JSON.stringify(key)}: ${valueLiteral(item, inner)}`);
    return `{\n${fields.join(',\n')}\n${indent}}`;
}
