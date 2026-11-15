// snapshot.js -- The JSON encoding of a save file. The port writes each
// save as a JSON snapshot in place of C's binary Sfo_*()/Sfi_*() stream;
// js/save.js writes it, and js/restore.js and js/files.js
// plname_from_file() read it. This module imports nothing, so any reader can
// depend on it without joining save.js's import cycle.

// Keep the JSON snapshot's visible field layout, but encode each repeated
// object reference as its first path. This preserves C pointer identity after
// the JSON round trip without serializing functions or display handles.
const SNAPSHOT_REFERENCE = '__teleport_graph_reference_v1__';

export function serializeSnapshot(value) {
    const firstPath = new WeakMap();
    const objectPath = new WeakMap();
    return JSON.stringify(value, function snapshotReplacer(key, val) {
        if (typeof val === 'function') return undefined;
        if (val === null || typeof val !== 'object') return val;

        const parent = objectPath.get(this) ?? [];
        const property = Array.isArray(this) ? Number(key) : key;
        const path = [...parent, property];
        const previous = firstPath.get(val);
        if (previous) return { [SNAPSHOT_REFERENCE]: JSON.stringify(previous) };
        firstPath.set(val, path);
        objectPath.set(val, path);
        return val;
    });
}

// Resolve reference paths after parsing. Older JSON saves without reference
// markers remain readable.
export function parseSnapshot(serialized) {
    const root = JSON.parse(serialized);
    const byPath = new Map();
    const pathKey = path => JSON.stringify(path);
    const referencePath = value => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        const keys = Object.keys(value);
        return keys.length === 1 && keys[0] === SNAPSHOT_REFERENCE
            && typeof value[SNAPSHOT_REFERENCE] === 'string'
            ? value[SNAPSHOT_REFERENCE] : null;
    };

    function index(value, path) {
        if (!value || typeof value !== 'object' || referencePath(value)) return;
        byPath.set(pathKey(path), value);
        for (const key of Object.keys(value)) {
            const property = Array.isArray(value) ? Number(key) : key;
            index(value[key], [...path, property]);
        }
    }

    const rootPath = [''];
    index(root, rootPath);
    const visited = new WeakSet();
    function reconnect(value, path) {
        const target = referencePath(value);
        if (target) {
            const resolved = byPath.get(target);
            if (!resolved) throw new Error('save snapshot has a dangling object reference');
            return resolved;
        }
        if (!value || typeof value !== 'object' || visited.has(value)) return value;
        visited.add(value);
        for (const key of Object.keys(value)) {
            const property = Array.isArray(value) ? Number(key) : key;
            value[key] = reconnect(value[key], [...path, property]);
        }
        return value;
    }
    return reconnect(root, rootPath);
}
