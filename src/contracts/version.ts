import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The installed conducks version, read from the nearest package.json named conducks (build/ carries a copy; src/ runs from the repo root). */
export function conducksVersion(): string {
  for (let dir = path.dirname(fileURLToPath(import.meta.url)); dir !== path.dirname(dir); dir = path.dirname(dir)) {
    const pj = path.join(dir, 'package.json');
    if (!fs.existsSync(pj)) continue;
    const p = JSON.parse(fs.readFileSync(pj, 'utf-8'));
    if (p.name === 'conducks') return p.version;
  }
  return 'unknown';
}
