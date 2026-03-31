import fs from 'node:fs/promises';
import { ConducksAdjacencyList, ConducksNode } from "@/lib/core/graph/adjacency-list.js";

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
  matchLabel?: string; // e.g. 'function' or 'class'
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

      // 2. Node-Specific Rule Handling
      for (const node of allNodes) {
        // Conducks: Regex path matching for structural scoping
        if (rule.matchPath && !new RegExp(rule.matchPath).test(node.id)) continue;
        if (rule.matchLabel && node.label !== rule.matchLabel) continue;

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
        const hasTarget = heritageEdges.some(e => 
          e.targetId.endsWith(`::${rule.target}`) || e.properties.rawTarget === rule.target
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
        const totalFans = graph.getNeighbors(node.id, 'upstream').length;
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
