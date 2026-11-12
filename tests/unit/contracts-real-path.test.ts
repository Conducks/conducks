import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { realCasePath } from "@/contracts/index.js";

/**
 * Stored paths are lower-cased; a reported path must be the file's real spelling, on EVERY
 * filesystem. `realpathSync.native` recovers it only where the lower-cased path resolves at all — a
 * case-insensitive filesystem. On Linux it does not, so `prune` printed `src/useworkgraph.ts` for
 * `src/useWorkGraph.ts` and `impact` could not read the call-site line ("file unreadable").
 * MEASURED: three integration suites (display-paths, impact-call-sites, surface-parity) green on
 * macOS and red on Linux for exactly this reason.
 */
describe('realCasePath recovers the on-disk spelling on a case-sensitive filesystem', () => {
  let root: string;
  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-RealCase-'));
    fs.mkdirSync(path.join(root, 'Renderer', 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Renderer', 'src', 'useWorkGraph.ts'), '');
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it('restores every segment, the project root included', () => {
    const real = path.join(root, 'Renderer', 'src', 'useWorkGraph.ts');
    expect(realCasePath(real.toLowerCase())).toBe(real);
  });

  it('leaves an already-correct path as it is', () => {
    const real = path.join(root, 'Renderer', 'src', 'useWorkGraph.ts');
    expect(realCasePath(real)).toBe(real);
  });

  it('returns a path that does not exist unchanged', () => {
    const missing = path.join(root, 'renderer', 'src', 'gone.ts').toLowerCase();
    expect(realCasePath(missing)).toBe(missing);
  });

  /**
   * State-machine audit P-09-11. Both the answer and every directory listing were cached for the
   * life of the process, the unrepaired fallback included. In the long-running MCP server a file
   * created after the first lookup in its folder — or a path asked about before it existed — kept the
   * lower-cased, unopenable spelling until restart.
   */
  it('finds a file created after its folder, or its own path, was first looked up', () => {
    const late = path.join(root, 'Renderer', 'src', 'LateComer.ts');
    expect(realCasePath(late.toLowerCase())).toBe(late.toLowerCase());
    fs.writeFileSync(late, '');
    expect(realCasePath(late.toLowerCase())).toBe(late);
  });

  it('leaves a synthesised location alone', () => {
    expect(realCasePath('external://global/fetch')).toBe('external://global/fetch');
  });
});
