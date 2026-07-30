import fs from 'node:fs/promises';
import { ConducksAdjacencyList, ConducksNode, NON_RUNTIME_EDGE_TYPES } from "@/lib/core/graph/adjacency-list.js";
import { CanonicalKind } from "@/lib/core/parsing/taxonomy.js";

/**
 * What a rule's `matchLabel` may name. A node's `label` IS its canonical kind, so anything outside
 * this set matches zero nodes — and a rule that matches zero nodes passes silently, which is how
 * both of this repo's shipped rules sat dead behind a green audit.
 */
const VALID_MATCH_LABELS = new Set<string>(Object.values(CanonicalKind));

/**
 * Conducks — Sentinel Policy Engine
 * 
 * A logic-based structural validator that enforces governance 
 * without requiring AI or expensive embeddings.
 */
export interface SentinelRule {
  id: string;
  type: 'require_heritage' | 'require_export' | 'require_caller' | 'framework_check' | 'require_file' | 'max_fans';
  matchPath?: string; // Glob pattern for files to check
  matchLabel?: string; // canonical kind, e.g. 'STRUCTURE' or 'BEHAVIOR'
  // Narrows within a canonical kind, using the node's `semantic_kind` — 'struct' (a class),
  // 'interface', 'enum'. STRUCTURE alone cannot express "a class but not an interface", and that
  // gap made this repo's own require_heritage rule report 97 violations of which 55 were interfaces
  // and type aliases being asked to implement a component contract they have no business
  // implementing. A gate that cries wolf 97 times is ignored as completely as one that never fires.
  matchSemanticKind?: string;
  target?: string;    // e.g. 'BaseService' or 'handler'
  max?: number;       // For max_fans rule
}

export interface SentinelReport {
  success: boolean;
  violations: Array<{
    nodeId: string;
    ruleId: string;
    message: string;
  }>;
  coverage?: Record<string, number>; // Summary of framework usage
}

import { ConducksComponent } from "@/contracts/types.js";

export class ConducksSentinel {
  constructor(private readonly fileSystem: any = fs) { }
  /**
   * Validates a graph against a set of structural policies.
   */
  public async validate(graph: ConducksAdjacencyList, rules: SentinelRule[]): Promise<SentinelReport> {
    const report: SentinelReport = {
      success: true,
      violations: []
    };

    const allNodes = Array.from(graph.getAllNodes());

    for (const rule of rules) {
      // 1. Global Rule Handling (Conducks)
      if (rule.type === 'require_file') {
        const violation = await this.checkRule(null as any, rule, graph);
        if (violation) {
          report.success = false;
          report.violations.push({ nodeId: 'global', ruleId: rule.id, message: violation });
        }
        continue;
      }

      // A `matchLabel` naming something the taxonomy does not produce matches NOTHING, and a rule
      // that matches nothing reports success — the failure mode CONDUCKS-13 exists to refuse. Both
      // of this repo's own shipped rules said `"class"`, a raw language token, while nodes carry the
      // canonical kind (`STRUCTURE`). They were permanent no-ops and `conducks audit` said clean.
      // Raise it rather than evaluate a rule that cannot fire.
      if (rule.matchLabel && !VALID_MATCH_LABELS.has(rule.matchLabel)) {
        report.success = false;
        report.violations.push({
          nodeId: 'global',
          ruleId: rule.id,
          message: `matchLabel "${rule.matchLabel}" is not a canonical kind, so this rule can never match a node. Use one of: ${[...VALID_MATCH_LABELS].join(', ')}`,
        });
        continue;
      }

      // 2. Node-Specific Rule Handling
      //
      // A rule that matches NO node passes silently — it is indistinguishable from a rule whose
      // subjects are all compliant. That has now happened twice in this file: once with a
      // `matchLabel` naming a language token instead of a canonical kind, and once with a
      // `matchSemanticKind` naming the vault's column instead of the in-memory field. The guard
      // below makes it impossible for a third variant to hide.
      let matched = 0;
      for (const node of allNodes) {
        // Conducks: Regex path matching for structural scoping
        if (rule.matchPath && !new RegExp(rule.matchPath).test(node.id)) continue;
        if (rule.matchLabel && node.label !== rule.matchLabel) continue;
        // `properties.kind` — the vault column is `semantic_kind`, the in-memory field is `kind`
        // (persistence.ts maps it on load). Reading the column name here matched zero nodes and the
        // rule reported clean, which is precisely the failure the matchLabel guard above exists to
        // prevent; the zero-match guard below now catches this class for every rule, not just for
        // an invalid label.
        if (rule.matchSemanticKind && node.properties.kind !== rule.matchSemanticKind) continue;
        matched++;

        const violation = await this.checkRule(node, rule, graph);
        if (violation) {
          report.success = false;
          report.violations.push({
            nodeId: node.id,
            ruleId: rule.id,
            message: violation
          });
        }
      }

      if (matched === 0) {
        report.success = false;
        report.violations.push({
          nodeId: 'global',
          ruleId: rule.id,
          message: `matched 0 nodes, so it can only ever report clean. Check matchPath ("${rule.matchPath ?? '*'}"), matchLabel ("${rule.matchLabel ?? '*'}") and matchSemanticKind ("${rule.matchSemanticKind ?? '*'}") against the graph — a rule with no subjects is not a passing rule.`,
        });
      }
    }

    // Phase 3: Framework Coverage Aggregation (Powered by DuckDB)
    report.coverage = await this.aggregateCoverage(graph);

    return report;
  }

  private async aggregateCoverage(graph: ConducksAdjacencyList): Promise<Record<string, number>> {
    const coverage: Record<string, number> = {};
    const nodes = Array.from(graph.getAllNodes());

    nodes.forEach(n => {
      const frameworks = n.properties.frameworks || [];
      frameworks.forEach((f: string) => {
        coverage[f] = (coverage[f] || 0) + 1;
      });
    });

    return coverage;
  }

  private async checkRule(node: ConducksNode, rule: SentinelRule, graph: ConducksAdjacencyList): Promise<string | null> {
    const p = node ? node.properties : null;

    switch (rule.type) {
      case 'require_heritage':
        if (!node) return "Illegal state: Node required for heritage check.";
        const heritageEdges = graph.getNeighbors(node.id, 'downstream').filter(e => 
          e.type === 'EXTENDS' || e.type === 'IMPLEMENTS' || e.type === 'TYPE_REFERENCE'
        );
        // Case-INSENSITIVE, because node ids are case-folded on insert (APFS) while a rule names
        // the target as it is written in source. `endsWith('::ConducksComponent')` could never
        // match `...::conduckscomponent`, so every class failed this rule including the 28 that do
        // implement it — the violation message even printed `found [conduckscomponent]` beside
        // `Expected [ConducksComponent]` and nobody read it, because it was one line in 97.
        // Compare the SYMBOL, not the id. Two things defeated the old `endsWith('::Target')`:
        // node ids are case-folded on insert while a rule names the target as written in source,
        // and an unresolved heritage target has no `::` prefix at all — it is the bare name. So
        // every class failed this rule, including the 28 that do implement the interface, and the
        // violation line printed `found [conduckscomponent]` beside `Expected [ConducksComponent]`
        // while nobody read it, because it was one line in 97.
        const wanted = String(rule.target ?? '').toLowerCase();
        const symbolOf = (id: string) => String(id).toLowerCase().split('::').pop() ?? '';
        const hasTarget = heritageEdges.some(e =>
          symbolOf(e.targetId) === wanted ||
          String(e.properties.rawTarget ?? '').toLowerCase() === wanted
        );
        
        if (!hasTarget) {
          const found = heritageEdges.map(e => e.targetId.split('::').pop()).join(', ');
          return `Missing required heritage: Expected [${rule.target}] but found [${found || 'None'}]`;
        }
        break;

      case 'require_export':
        if (!p || !p.isExport) {
          return `Symbol [${p?.name || node?.id || 'Unknown'}] must be exported in this context.`;
        }
        break;

      case 'require_caller':
        if (!node) return `Execution Error: require_caller requires a target node.`;
        const incoming = graph.getNeighbors(node.id, 'upstream');
        const hasCaller = incoming.some(edge =>
          graph.getNode(edge.sourceId)?.properties.name === rule.target
        );
        if (!hasCaller) {
          return `Symbol [${p?.name || node.id}] must always be wrapped or called by [${rule.target}].`;
        }
        break;

      case 'framework_check':
        if (!p || !p.frameworks || !p.frameworks.includes(rule.target)) {
          return `Missing required framework marker: [${rule.target}] in [${p?.name || node?.id || 'Unknown'}]`;
        }
        break;

      case 'max_fans':
        if (!node) return "Illegal state: Node required for fan check.";
        // ADR 0016: a type reference and a type-only import are both erased at compile time, so
        // neither is runtime fan-in.
        const totalFans = graph.getNeighbors(node.id, 'upstream')
          .filter(e => !NON_RUNTIME_EDGE_TYPES.includes(e.type) && e.properties?.isTypeOnly !== true).length;
        const limit = rule.max || 30;
        if (totalFans > limit) {
          return `ARCH-1: Hub Overload detected. Symbol has [${totalFans}] upstream connections (Limit: ${limit}).`;
        }
        break;

      case 'require_file':
        try {
          await this.fileSystem.access(rule.target!);
        } catch {
          return `Missing required foundation file: [${rule.target}]`;
        }
        break;
    }

    return null;
  }
}
