import { describe, it, expect } from '@jest/globals';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { moduleHashOf } from "@/lib/domain/analysis/module-hash.js";
import { ProjectMonitor } from "@/lib/domain/analysis/project-monitor.js";
import { ProjectRegistry } from "@/lib/domain/federation/project-registry.js";

/**
 * todo21's acceptance: ONE module-hash implementation, and it has to actually hash the module.
 *
 * The first version of this suite asserted only that `ProjectMonitor.moduleHash` equals
 * `moduleHashOf` — which, once the monitor delegates to that function, compares a function to
 * itself and cannot fail. Mutation proved it: making the hash ignore every file's CONTENT left the
 * suite green. So the equality is asserted against a hash that is first shown to MOVE with the
 * thing it is meant to track; an identity test alone is a tick with nothing behind it.
 */
describe('moduleHashOf', () => {
  const withDir = <T>(fn: (root: string) => T): T => {
    const root = mkdtempSync(path.join(tmpdir(), "mh-"));
    try { return fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
  };

  it('changes when a source file CHANGES — the property the review stamp rests on', () => {
    withDir(root => {
      writeFileSync(path.join(root, "a.ts"), "export const a = 1;");
      const before = moduleHashOf(root);
      writeFileSync(path.join(root, "a.ts"), "export const a = 2;");
      const after = moduleHashOf(root);
      expect(before).not.toBe(after);
      expect(before).not.toBe("");
    });
  });

  it('changes when a source file is ADDED or REMOVED', () => {
    withDir(root => {
      writeFileSync(path.join(root, "a.ts"), "export const a = 1;");
      const one = moduleHashOf(root);
      writeFileSync(path.join(root, "b.ts"), "export const b = 2;");
      const two = moduleHashOf(root);
      expect(one).not.toBe(two);
      rmSync(path.join(root, "b.ts"));
      expect(moduleHashOf(root)).toBe(one);
    });
  });

  it('ignores a non-source file, so a README edit does not flag every note', () => {
    withDir(root => {
      writeFileSync(path.join(root, "a.ts"), "export const a = 1;");
      const before = moduleHashOf(root);
      writeFileSync(path.join(root, "notes.txt"), "not source");
      expect(moduleHashOf(root)).toBe(before);
    });
  });

  it('ProjectMonitor asks the SAME function — its answer tracks a real content change', () => {
    withDir(root => {
      const monitor = new ProjectMonitor(new ProjectRegistry());
      writeFileSync(path.join(root, "a.ts"), "export const a = 1;");
      const sharedBefore = moduleHashOf(root);
      expect(monitor.moduleHash(root, ".")).toBe(sharedBefore);

      writeFileSync(path.join(root, "a.ts"), "export const a = 999;");
      const sharedAfter = moduleHashOf(root);
      expect(sharedAfter).not.toBe(sharedBefore);            // it moved
      expect(monitor.moduleHash(root, ".")).toBe(sharedAfter); // and both saw the same move
    });
  });

  it('an unreadable directory hashes to the empty string, never a throw', () => {
    expect(moduleHashOf('/no/such/dir')).toBe("");
  });
});
