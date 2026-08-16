import fs from "node:fs";
import path from "node:path";

/**
 * A path a reader can PASTE, from an id they cannot.
 *
 * Node ids are lowercased on write (CONDUCKS-4, for APFS), and every command that prints one prints
 * the lowercased spelling with it: `renderer/src/plugins/core/approval/approvalinfoview.tsx`. That is
 * a correct id and a broken path — it opens nothing on a case-sensitive filesystem and it does not
 * match what the reader sees in their editor.
 *
 * The ids are NOT touched. Case-insensitive keys are load-bearing, and changing the scheme would
 * reach persistence, the linker and every fixture. Only the DISPLAY is repaired, and only where a
 * path is shown to a person.
 *
 * `realpathSync.native` is what recovers the real spelling: on a case-insensitive filesystem the
 * lowercased path resolves and the OS answers with the true case. On a case-sensitive one it does
 * not resolve at all, which is why the failure is silent and returns the input — an unpasteable path
 * is a smaller problem than a command that throws while formatting output.
 */
export function displayPath(absOrRel: string, root?: string): string {
  if (!absOrRel) return absOrRel;
  const base = root ?? process.cwd();
  const abs = path.isAbsolute(absOrRel) ? absOrRel : path.join(base, absOrRel);
  let real = abs;
  try { real = fs.realpathSync.native(abs); } catch { /* gone, or a case-sensitive filesystem */ }
  const rootReal = (() => { try { return fs.realpathSync.native(base); } catch { return base; } })();
  return real.toLowerCase().startsWith(rootReal.toLowerCase())
    ? real.slice(rootReal.length).replace(/^[/\\]/, '')
    : real;
}
