import { describe, it, expect } from '@jest/globals';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { moduleHashOf } from "@/lib/domain/analysis/module-hash.js";
import { ProjectMonitor } from "@/lib/domain/analysis/project-monitor.js";
import { ProjectRegistry } from "@/lib/domain/federation/project-registry.js";

/**
 * todo21's acceptance: ONE module-hash implementation. Two copies coupled by a "must match" comment
 * is a drift waiting for its moment — the two disagreeing would mark every reviewed note drifted
 * (or none), silently. This pins that the monitor's hash IS the shared function, byte for byte.
 */
describe('moduleHashOf — one implementation, by acceptance', () => {
  it('ProjectMonitor.moduleHash equals the shared function on the same directory', () => {
    const root = mkdtempSync(path.join(tmpdir(), "mh-"));
    writeFileSync(path.join(root, "a.ts"), "export const a = 1;");
    writeFileSync(path.join(root, "b.py"), "b = 2");
    writeFileSync(path.join(root, "notes.txt"), "not source, not hashed");
    const monitor = new ProjectMonitor(new ProjectRegistry());
    expect(monitor.moduleHash(root, ".")).toBe(moduleHashOf(root));
    expect(moduleHashOf(root)).not.toBe("");
    rmSync(root, { recursive: true, force: true });
  });

  it('an unreadable directory hashes to the empty string, never a throw', () => {
    expect(moduleHashOf('/no/such/dir')).toBe("");
  });
});
