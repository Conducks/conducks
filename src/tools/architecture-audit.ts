import { readdirSync, statSync, existsSync, readFileSync } from 'fs';
import { join, resolve, isAbsolute, basename } from 'path';

/**
 * Find git root by walking up the directory tree
 */
function findGitRoot(path: string): string | null {
  let current = resolve(path);
  for (let i = 0; i < 10; i++) { // safety limit
    if (existsSync(join(current, '.git'))) {
      return current;
    }
    const parent = resolve(current, '..');
    if (parent === current) break;
    current = parent;
  }
  return null;
}

interface ArchitectureAuditArgs {
  workspace_path: string; // relative only
  depth?: number; // optional max depth for scanning
}

interface RepoInfo {
  path: string; // relative path from root
  name: string;
  hasPackageJson: boolean;
  packageName?: string;
  hasGit: boolean;
  depth: number;
}

interface ArchitectureAuditResult {
  success: boolean;
  root: string;
  rootHasGit: boolean;
  repos: RepoInfo[];
  duplicatePackageNames: string[];
  nestedGitCount: number;
  warnings: string[];
  recommendations: string[];
  errors?: string[];
}

function safeReadJSON(path: string): any | undefined {
  try {
    const raw = readFileSync(path, 'utf8');
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function scanWorkspace(root: string, maxDepth: number): RepoInfo[] {
  const results: RepoInfo[] = [];

  function walk(current: string, depth: number) {
    if (depth > maxDepth) return;
    let items: string[] = [];
    try { items = readdirSync(current); } catch { return; }
    for (const item of items) {
      if (item === 'node_modules' || item === '.git' || item === 'build' || item === 'dist') continue;
      const full = join(current, item);
      let stat: any;
      try { stat = statSync(full); } catch { continue; }
      if (!stat.isDirectory()) continue;
      const hasGit = existsSync(join(full, '.git'));
      const hasPackageJson = existsSync(join(full, 'package.json'));
      let packageName: string | undefined;
      if (hasPackageJson) {
        const pkg = safeReadJSON(join(full, 'package.json'));
        packageName = pkg?.name;
      }
      results.push({
        path: full.replace(root + '/', ''),
        name: basename(full),
        hasPackageJson,
        packageName,
        hasGit,
        depth
      });
      // Recurse
      walk(full, depth + 1);
    }
  }

  walk(root, 1);
  return results;
}

export async function handleArchitectureAudit(args: ArchitectureAuditArgs): Promise<ArchitectureAuditResult> {
  const { workspace_path, depth = 3 } = args;
  const errors: string[] = [];
  if (isAbsolute(workspace_path)) {
    return {
      success: false,
      root: workspace_path,
      rootHasGit: false,
      repos: [],
      duplicatePackageNames: [],
      nestedGitCount: 0,
      warnings: [],
      recommendations: [],
      errors: ['Absolute paths not allowed. Provide relative path like "."']
    };
  }
  if (workspace_path.includes('..')) {
    return {
      success: false,
      root: workspace_path,
      rootHasGit: false,
      repos: [],
      duplicatePackageNames: [],
      nestedGitCount: 0,
      warnings: [],
      recommendations: [],
      errors: ['Upward traversal not allowed. Use "." or a direct child.']
    };
  }

  const rootAbs = resolve(process.cwd(), workspace_path);
  const rootHasGit = findGitRoot(rootAbs) !== null;

  const repos = scanWorkspace(rootAbs, depth);
  const nestedGit = repos.filter(r => r.hasGit);
  const nestedGitCount = nestedGit.length + (rootHasGit ? 1 : 0);

  // Duplicate package names detection
  const nameCounts: Record<string, number> = {};
  for (const r of repos) {
    if (r.packageName) {
      nameCounts[r.packageName] = (nameCounts[r.packageName] || 0) + 1;
    }
  }
  const duplicatePackageNames = Object.keys(nameCounts).filter(n => nameCounts[n] > 1);

  // Warnings
  const warnings: string[] = [];
  if (rootHasGit && nestedGit.length > 0) {
    warnings.push('Nested git repositories inside a root git repository detected.');
  }
  if (!rootHasGit && nestedGit.length > 0) {
    warnings.push('No root git but inner git repositories exist. Fragmented version control.');
  }
  if (duplicatePackageNames.length > 0) {
    warnings.push(`Duplicate package names: ${duplicatePackageNames.join(', ')}`);
  }
  if (nestedGit.length > 6) {
    warnings.push('High number of nested git repos suggests fractured boundaries.');
  }

  // Recommendations
  const recommendations: string[] = [];
  if (nestedGit.length > 0) {
    recommendations.push('Consider consolidating nested repos into a monorepo using workspaces (npm, pnpm, yarn) or language-specific tooling.');
    recommendations.push('Audit overlapping dependencies and unify build pipelines.');
    recommendations.push('Introduce a root level architecture.md documenting bounded contexts.');
  }
  if (!rootHasGit) {
    recommendations.push('Initialize a root git repository to unify version tracking.');
  }
  if (duplicatePackageNames.length > 0) {
    recommendations.push('Rename duplicate packages or consolidate them to avoid resolution ambiguity.');
  }

  return {
    success: true,
    root: rootAbs,
    rootHasGit,
    repos,
    duplicatePackageNames,
    nestedGitCount,
    warnings,
    recommendations,
    errors: errors.length ? errors : undefined
  };
}

export function formatArchitectureAuditResult(result: ArchitectureAuditResult): string {
  if (!result.success) {
    return `architecture_audit_failed: "${result.errors?.join(' | ')}"`;
  }

  let out = `audit_results:\n`;
  out += `  root_has_git: ${result.rootHasGit}\n`;
  out += `  nested_git_count: ${result.nestedGitCount - (result.rootHasGit ? 1 : 0)}\n`;
  out += `  repos_total: ${result.repos.length}\n`;

  if (result.warnings.length > 0) {
    out += `  warnings[${result.warnings.length}]:\n`;
    for (const w of result.warnings) {
      out += `    - "${w}"\n`;
    }
  }

  if (result.recommendations.length > 0) {
    out += `  recommendations[${result.recommendations.length}]:\n`;
    for (const r of result.recommendations) {
      out += `    - "${r}"\n`;
    }
  }

  if (result.duplicatePackageNames.length > 0) {
    out += `  duplicate_packages[${result.duplicatePackageNames.length}]: ${result.duplicatePackageNames.join(', ')}\n`;
  }

  out += `  repos:\n`;
  for (const repo of result.repos.slice(0, 10)) {
    out += `    - path: "${repo.path}"\n`;
    out += `      name: "${repo.name}"\n`;
    out += `      has_git: ${repo.hasGit}\n`;
    out += `      package: "${repo.packageName || ''}"\n`;
    out += `      depth: ${repo.depth}\n`;
  }

  if (result.repos.length > 10) {
    out += `    truncated: ${result.repos.length - 10}\n`;
  }

  return out;
}

import { Tool } from '../core/tool-registry.js';

export const architectureAuditTool: Tool<ArchitectureAuditArgs> = {
  name: "architecture_audit",
  description: "Audit repository structure for fragmentation and optimization opportunities. Returns a file tree analysis.",
  inputSchema: {
    type: "object",
    properties: {
      workspace_path: { type: "string" },
      depth: { type: "number" }
    },
    required: ["workspace_path"]
  },
  handler: handleArchitectureAudit,
  formatter: formatArchitectureAuditResult
};
