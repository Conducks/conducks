import path from "node:path";

/**
 * Conducks — Path Utilities 🛡️ 🧬
 * 
 * Standardized path normalization and canonicalization to ensure 
 * 100% architectural consensus across all filesystems.
 */

/**
 * Canonicalizes a path for structural ID and equality checks.
 * Apostolic Standard: path.normalize(p).replace(/\\/g, "/").toLowerCase()
 */
export function canonicalize(p: string): string {
  if (!p) return '';
  return path.normalize(p).replace(/\\/g, "/").toLowerCase();
}

/**
 * Generates a stable project-relative path for UI and display metadata.
 */
export function getProjectRelativePath(p: string, root: string): string {
  const absolute = path.resolve(p);
  const absoluteRoot = path.resolve(root);
  return path.relative(absoluteRoot, absolute).replace(/\\/g, "/");
}
