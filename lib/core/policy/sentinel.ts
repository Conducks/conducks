import fs from 'node:fs/promises';
import { ConducksAdjacencyList, ConducksNode } from "../graph/adjacency-list.js";

/**
 * Conducks — Sentinel Policy Engine
 * 
 * A logic-based structural validator that enforces governance 
 * without requiring AI or expensive embeddings.
 */
export interface SentinelRule {
  id: string;
  type: 'require_heritage' | 'require_export' | 'require_caller' | 'framework_check' | 'require_file';
  matchPath?: string; // Glob pattern for files to check
  matchLabel?: string; // e.g. 'function' or 'class'
  target?: string;    // e.g. 'BaseService' or 'handler'
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
  constructor(private readonly fileSystem: any = fs) {}
  /**
   * Validates a graph against a set of structural policies.
   */
  public async validate(graph: ConducksAdjacencyList, rules: SentinelRule[]): Promise<SentinelReport> {
    const report: SentinelReport = {
      success: true,
      violations: []
    };

    const nodes = graph.getAllNodes();

    for (const node of nodes) {
      for (const rule of rules) {
        // 1. Filter nodes by Path (Regex) and Label
        if (rule.matchPath && !new RegExp(rule.matchPath).test(node.id)) continue;
        if (rule.matchLabel && node.label !== rule.matchLabel) continue;

        // 2. Perform Rule Check (Async for file ops)
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
    const p = node.properties;

    switch (rule.type) {
      case 'require_heritage':
        if (!p.heritage || !p.heritage.includes(rule.target)) {
          return `Missing required heritage: Expected [${rule.target}] but found [${p.heritage?.join(', ') || 'None'}]`;
        }
        break;

      case 'require_export':
        if (!p.isExport) {
          return `Symbol [${p.name || node.id}] must be exported in this context.`;
        }
        break;

      case 'require_caller':
        const incoming = graph.getNeighbors(node.id, 'upstream');
        const hasCaller = incoming.some(edge => 
          graph.getNode(edge.sourceId)?.properties.name === rule.target
        );
        if (!hasCaller) {
          return `Symbol [${p.name || node.id}] must always be wrapped or called by [${rule.target}].`;
        }
        break;

      case 'framework_check':
        if (!p.frameworks || !p.frameworks.includes(rule.target)) {
          return `Missing required framework marker: [${rule.target}] in [${p.name || node.id}]`;
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
