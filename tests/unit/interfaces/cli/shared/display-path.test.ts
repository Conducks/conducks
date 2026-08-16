import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { displayPath } from '@/interfaces/cli/shared/display-path.js';

/**
 * A printed path has to be one the reader can open, and it was not.
 *
 * Node ids are lowercased on write (CONDUCKS-4, for APFS), and every command printing one printed
 * the lowercased spelling with it — `renderer/src/plugins/core/approval/approvalinfoview.tsx`, which
 * opens nothing and matches nothing in an editor. The ids are untouched; only the display is.
 *
 * The half that had never been exercised is the FALLBACK. `realpathSync.native` recovers the true
 * case only because a case-insensitive filesystem resolves the lowercased path; on a case-sensitive
 * one it throws, and this must return something usable rather than blow up while formatting output.
 * These cases are written so they pass on both kinds of filesystem — on APFS the real spelling comes
 * back, and the missing-file case exercises exactly the code path Linux takes for every input.
 */
const tmp: string[] = [];
afterEach(() => { while (tmp.length) fs.rmSync(tmp.pop()!, { recursive: true, force: true }); });

const mkTree = () => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-display-')));
  tmp.push(root);
  fs.mkdirSync(path.join(root, 'src', 'Components'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'Components', 'PluginList.tsx'), 'export default 1;\n');
  return root;
};

describe('displayPath', () => {
  it('returns a path relative to the project root', () => {
    const root = mkTree();
    const out = displayPath(path.join(root, 'src', 'Components', 'PluginList.tsx'), root);

    expect(path.isAbsolute(out)).toBe(false);
    expect(out.toLowerCase()).toBe(path.join('src', 'Components', 'PluginList.tsx').toLowerCase());
  });

  it('recovers the on-disk spelling from a lowercased id', () => {
    const root = mkTree();
    const lowercasedId = path.join(root, 'src', 'components', 'pluginlist.tsx').toLowerCase();

    // SKIPPED, not weakened, where the filesystem cannot answer. The first version of this case
    // accepted either spelling so it would pass anywhere — and removing the `realpathSync` call
    // entirely left it PASSING, which makes it a test of nothing. Probed at runtime instead: if the
    // lowercased path does not resolve, this machine is case-sensitive and the claim is not
    // testable here; everywhere else the real spelling must come back.
    let caseInsensitive = true;
    try { fs.realpathSync.native(lowercasedId); } catch { caseInsensitive = false; }
    if (!caseInsensitive) return;

    expect(displayPath(lowercasedId, root)).toBe(path.join('src', 'Components', 'PluginList.tsx'));
  });

  it('returns something usable for a path that does not exist', () => {
    // The Linux path for EVERY input, and the case that would otherwise throw inside output
    // formatting. An unpasteable path is a smaller problem than a command that dies printing it.
    const root = mkTree();
    const out = displayPath(path.join(root, 'src', 'gone', 'missing.ts'), root);

    expect(out).toBe(path.join('src', 'gone', 'missing.ts'));
  });

  it('leaves a path outside the project absolute rather than mangling it', () => {
    const root = mkTree();
    const outside = fs.realpathSync.native(os.tmpdir());

    expect(path.isAbsolute(displayPath(outside, root))).toBe(true);
  });

  it('passes an empty string straight through', () => {
    expect(displayPath('', '/anywhere')).toBe('');
  });
});
