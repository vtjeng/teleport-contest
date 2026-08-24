import { statfsSync } from 'node:fs';
import { platform, tmpdir } from 'node:os';

// DrvFS (the Windows filesystem mount in WSL2) is 15-77x slower than a
// local filesystem for the many small reads and writes that review passes
// perform. Node's os.tmpdir() resolves to a DrvFS path
// when TEMP or TMP is inherited from Windows and TMPDIR is unset.
const V9FS_MAGIC = 0x01021997; // Plan 9 (9P), the protocol WSL2 uses for DrvFS
const FALLBACK = '/tmp';

export function localTmpdir() {
    const dir = tmpdir();
    if (platform() !== 'linux' || !dir.startsWith('/mnt/')) return dir;
    try {
        if (statfsSync(dir).type === V9FS_MAGIC) return FALLBACK;
    } catch {
        // statfs failed — keep the original
    }
    return dir;
}
