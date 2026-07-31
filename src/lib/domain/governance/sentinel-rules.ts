import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Conducks — Sentinel Rule Language (YAML DSL)
 *
 * Defines a small, HARDCODED set of graph-wide structural conditions for architectural
 * governance (cycles, rank inversions, layer boundaries — see `LAYER_FRAGMENTS` /
 * `ALLOWED_DEPENDENCIES` below). Evaluated by `governance/index.ts`'s `auditWithRules()`,
 * which `conducks guard` reads. Rules are loaded from `.conducks/sentinel.yml` in the project root.
 *
 * ADR 0073: this `SentinelRule` is unrelated to `sentinel.ts`'s `ProjectRule` (formerly also named
 * `SentinelRule`) — that one is the DECLARATIVE, user-editable per-node policy set in
 * `config/sentinel.json`, evaluated by `conducks audit`. Neither engine evaluates the other's
 * rules. This type keeps its name in this change because it is consumed by `governance/index.ts`
 * and `guard.ts`, both outside this change's file ownership — a rename here would need to land in
 * the same turn as updating those call sites, or the collision would just move rather than close.
 */

export type SentinelCondition =
  | 'has_cycles'
  | 'rank_violation'
  | 'dead_code'
  | 'high_churn'
  | 'deep_nesting'
  | 'layer_boundaries';

export interface SentinelRule {
  id: string;
  name: string;
  condition: SentinelCondition;
  severity: 'error' | 'warning' | 'info';
  /** Optional threshold for numeric conditions (e.g. min churn count, max depth) */
  threshold?: number;
  enabled: boolean;
}

export interface SentinelRuleFile {
  version: 1;
  rules: SentinelRule[];
}

/**
 * Conducks' own Clean-Architecture layer contract (ADR 0005), guarded by the
 * `layer_boundaries` condition. Path fragments map a file to a layer; ORDER MATTERS —
 * `/lib/core` must precede `/registry` so lib/core/registry/ classifies as core, not composition.
 * An edge from layer A to layer B is legal iff B is in ALLOWED_DEPENDENCIES[A]. Same-layer edges
 * are always legal. Hardcoded (not YAML) because the minimal sentinel parser has no nested maps,
 * and this guards conducks itself; per-project layer config is a future enhancement.
 */
export const LAYER_FRAGMENTS: Array<[string, string]> = [
  ['contracts', '/contracts'],
  ['core', '/lib/core'],
  ['domain', '/lib/domain'],
  ['composition', '/registry'],
  ['cli', '/interfaces/cli'],
  ['mcp', '/interfaces/tools'],
  ['web', '/interfaces/web'],
];

export const ALLOWED_DEPENDENCIES: Record<string, string[]> = {
  contracts: [],                                  // leaf — imports nothing above
  core: ['contracts'],
  domain: ['core', 'contracts'],
  composition: ['domain', 'core', 'contracts'],
  // Two allowed sibling edges, both LAUNCHERS (start a process) rather than logic coupling:
  //   web = the `mirror` command starting the visual server
  //   mcp = the `mcp` command starting the MCP stdio server (commands/mcp.ts -> tools/index.ts main)
  // Routing a process entry point through composition buys nothing and hides the entry point.
  cli: ['composition', 'contracts', 'web', 'mcp'],
  mcp: ['composition', 'contracts'],
  web: ['composition', 'domain', 'core', 'contracts'],
};

// ---------------------------------------------------------------------------
// Minimal YAML parser — supports only the subset used in sentinel.yml:
//   - top-level key: value pairs
//   - sequences of block mappings (- key: value)
//   - no anchors, no multi-line strings
// ---------------------------------------------------------------------------

function parseMinimalYaml(text: string): Record<string, any> {
  const lines = text.split('\n');
  const result: Record<string, any> = {};
  let currentList: Record<string, any>[] | null = null;
  let currentListKey: string | null = null;
  let currentItem: Record<string, any> | null = null;

  for (const rawLine of lines) {
    // Strip comments and trailing whitespace
    const line = rawLine.replace(/#.*$/, '').trimEnd();
    if (!line.trim()) continue;

    const listItemMatch = line.match(/^(\s*)- (.+)/);
    if (listItemMatch) {
      // Start of a new list item
      const rest = listItemMatch[2].trim();
      currentItem = {};
      if (currentList !== null) {
        currentList.push(currentItem);
      }
      // Parse inline key: value on the same line as the dash
      const kvMatch = rest.match(/^(\w+):\s*(.*)$/);
      if (kvMatch) {
        currentItem[kvMatch[1]] = coerce(kvMatch[2].trim());
      }
      continue;
    }

    // Key: value line
    const kvMatch = line.match(/^(\s*)(\w+):\s*(.*)$/);
    if (!kvMatch) continue;

    const indent = kvMatch[1].length;
    const key = kvMatch[2];
    const value = kvMatch[3].trim();

    if (indent === 0) {
      currentItem = null;
      if (value === '' || value === null) {
        // This key introduces a list or nested object — we'll detect below
        currentListKey = key;
        currentList = [];
        result[key] = currentList;
      } else {
        currentList = null;
        currentListKey = null;
        result[key] = coerce(value);
      }
    } else if (currentItem !== null) {
      // Inside a list item
      currentItem[key] = coerce(value);
    }
  }

  return result;
}

function coerce(value: string): any {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '~') return null;
  const num = Number(value);
  if (!isNaN(num) && value !== '') return num;
  // Strip surrounding quotes
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Rule loader
// ---------------------------------------------------------------------------

export function loadSentinelRules(projectRoot: string): SentinelRule[] {
  const rulesPath = path.join(projectRoot, '.conducks', 'sentinel.yml');
  if (!existsSync(rulesPath)) return getDefaultRules();
  try {
    const raw = readFileSync(rulesPath, 'utf8');
    const parsed = parseMinimalYaml(raw) as SentinelRuleFile;
    if (!Array.isArray(parsed.rules)) return getDefaultRules();
    return (parsed.rules as SentinelRule[]).filter(r => r.enabled !== false);
  } catch {
    return getDefaultRules();
  }
}

export function getDefaultRules(): SentinelRule[] {
  return [
    {
      id: 'no_cycles',
      name: 'No import cycles',
      condition: 'has_cycles',
      severity: 'error',
      enabled: true,
    },
    {
      id: 'rank_violations',
      name: 'No rank violations',
      condition: 'rank_violation',
      severity: 'warning',
      enabled: true,
    },
    // The layer contract is a DEFAULT, not opt-in (ADR 0005). It shipped as data only, so
    // `conducks guard` filtered for a rule that was never loaded and printed "Layer contract
    // clean" without checking anything (todo06). The id must stay exactly `layer_boundaries`
    // — `interfaces/cli/commands/guard.ts:32` matches violations on that ruleId.
    {
      id: 'layer_boundaries',
      name: 'Layer contract',
      condition: 'layer_boundaries',
      severity: 'error',
      enabled: true,
    },
  ];
}
