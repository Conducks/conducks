import { ConducksAdjacencyList, ConducksNode } from "@/lib/core/graph/adjacency-list.js";

/**
 * Conducks — Fallback Pattern Detector
 *
 * Identifies fallback patterns and differentiates between legitimate and legacy fallbacks
 */
export class FallbackDetector {

  /**
   * Detects if a function appears to be a fallback based on structural patterns
   */
  public detectFallbackPatterns(node: ConducksNode, graph: ConducksAdjacencyList): FallbackAnalysis {
    const incomingEdges = graph.getNeighbors(node.id, 'upstream');
    const outgoingEdges = graph.getNeighbors(node.id, 'downstream');

    // Pattern 1: Pipeline position (called after primary attempts fail)
    const pipelinePosition = this.analyzePipelinePosition(node, graph);

    // Pattern 2: Conditional execution patterns
    const conditionalUsage = this.analyzeConditionalUsage(node, incomingEdges);

    // Pattern 3: Error handling context
    const errorHandling = this.detectErrorHandlingContext(node, graph);

    // Pattern 4: Fallback naming patterns
    const namingPatterns = this.analyzeNamingPatterns(node.properties.name);

    // Pattern 5: Usage ratio (primary vs fallback calls)
    const usageRatio = this.calculateUsageRatio(node, graph);

    const isFallback = this.classifyAsFallback({
      pipelinePosition,
      conditionalUsage,
      errorHandling,
      namingPatterns,
      usageRatio
    });

    return {
      isFallback,
      confidence: this.calculateConfidence({
        pipelinePosition,
        conditionalUsage,
        errorHandling,
        namingPatterns,
        usageRatio
      }),
      patterns: {
        pipelinePosition,
        conditionalUsage,
        errorHandling,
        namingPatterns,
        usageRatio
      }
    };
  }

  /**
   * Analyzes if function is called late in execution pipelines
   */
  private analyzePipelinePosition(node: ConducksNode, graph: ConducksAdjacencyList): PipelinePosition {
    const callers = graph.getNeighbors(node.id, 'upstream')
      .filter(e => e.type === 'CALLS')
      .map(e => graph.getNode(e.sourceId))
      .filter(n => n) as ConducksNode[];

    if (callers.length === 0) return { position: 'unknown', score: 0 };

    // Look for sequential calling patterns (try/catch, if/else chains)
    const sequentialPatterns = callers.filter(caller => {
      const callerBody = caller.properties.dna;
      return callerBody && (
        callerBody.tryBlocks?.length > 0 ||
        callerBody.ifElseChains?.length > 0 ||
        callerBody.pipelineStages?.some((stage: any) => stage.order > 1)
      );
    });

    const positionScore = sequentialPatterns.length / callers.length;
    const position = positionScore > 0.7 ? 'late' : positionScore > 0.3 ? 'middle' : 'early';

    return { position, score: positionScore };
  }

  /**
   * Analyzes if function is called conditionally
   */
  private analyzeConditionalUsage(node: ConducksNode, incomingEdges: ConducksEdge[]): ConditionalUsage {
    const conditionalCalls = incomingEdges.filter(edge =>
      edge.type === 'CALLS' &&
      (edge.properties?.isConditional ||
       edge.properties?.isInCatch ||
       edge.properties?.isInElse)
    );

    const ratio = conditionalCalls.length / Math.max(incomingEdges.length, 1);

    return {
      isConditional: ratio > 0.5,
      conditionalRatio: ratio,
      contexts: conditionalCalls.map(e => e.properties?.context || 'unknown')
    };
  }

  /**
   * Detects if function is used in error handling contexts
   */
  private detectErrorHandlingContext(node: ConducksNode, graph: ConducksAdjacencyList): ErrorHandling {
    const callers = graph.getNeighbors(node.id, 'upstream')
      .map(e => graph.getNode(e.sourceId))
      .filter(n => n?.properties.dna?.catchBlocks?.length > 0) as ConducksNode[];

    const errorCallers = callers.filter(caller => {
      const dna = caller.properties.dna;
      return dna.catchBlocks?.some((block: any) =>
        block.calls?.includes(node.properties.name)
      );
    });

    return {
      isInErrorHandling: errorCallers.length > 0,
      errorCallerRatio: errorCallers.length / Math.max(callers.length, 1)
    };
  }

  /**
   * Analyzes naming patterns that suggest fallback behavior
   */
  private analyzeNamingPatterns(name: string): NamingPatterns {
    const lowerName = name.toLowerCase();
    const patterns = {
      hasFallback: /\bfallback\b|\bdefault\b|\blegacy\b|\bcompat\b/.test(lowerName),
      hasAlternative: /\balternative\b|\bsecondary\b|\bbackup\b/.test(lowerName),
      hasLegacy: /\blegacy\b|\bold\b|\bdeprecated\b/.test(lowerName),
      hasTry: /\btry\b|\battempt\b/.test(lowerName),
      hasElse: /\belse\b|\bfail\b|\berror\b/.test(lowerName)
    };

    const score = Object.values(patterns).filter(Boolean).length / Object.keys(patterns).length;

    return { patterns, score };
  }

  /**
   * Calculates primary vs fallback usage ratio
   */
  private calculateUsageRatio(node: ConducksNode, graph: ConducksAdjacencyList): UsageRatio {
    const allCalls = graph.getNeighbors(node.id, 'upstream')
      .filter(e => e.type === 'CALLS');

    if (allCalls.length === 0) return { primaryCalls: 0, fallbackCalls: 0, totalCalls: 0, ratio: 0 };

    // Primary calls are direct, unconditional calls
    const primaryCalls = allCalls.filter(edge =>
      !edge.properties?.isConditional &&
      !edge.properties?.isInCatch &&
      !(edge.properties?.pipelineOrder && edge.properties.pipelineOrder > 1)
    );

    // Fallback calls are conditional, in catch blocks, or late in pipelines
    const fallbackCalls = allCalls.filter(edge =>
      edge.properties?.isConditional ||
      edge.properties?.isInCatch ||
      (edge.properties?.pipelineOrder && edge.properties.pipelineOrder > 1)
    );

    const ratio = fallbackCalls.length / Math.max(allCalls.length, 1);

    return {
      primaryCalls: primaryCalls.length,
      fallbackCalls: fallbackCalls.length,
      totalCalls: allCalls.length,
      ratio
    };
  }

  /**
   * Classifies if a function should be considered a fallback
   */
  private classifyAsFallback(analysis: {
    pipelinePosition: PipelinePosition;
    conditionalUsage: ConditionalUsage;
    errorHandling: ErrorHandling;
    namingPatterns: NamingPatterns;
    usageRatio: UsageRatio;
  }): boolean {
    const weights = {
      pipelinePosition: analysis.pipelinePosition.position === 'late' ? 1 : 0,
      conditionalUsage: analysis.conditionalUsage.isConditional ? 1 : 0,
      errorHandling: analysis.errorHandling.isInErrorHandling ? 1 : 0,
      namingPatterns: analysis.namingPatterns.score > 0.3 ? 1 : 0,
      usageRatio: analysis.usageRatio.ratio > 0.5 ? 1 : 0
    };

    const totalScore = Object.values(weights).reduce((sum, w) => sum + w, 0);
    return totalScore >= 3; // At least 3 indicators suggest fallback
  }

  /**
   * Calculates confidence in the fallback classification
   */
  private calculateConfidence(analysis: {
    pipelinePosition: PipelinePosition;
    conditionalUsage: ConditionalUsage;
    errorHandling: ErrorHandling;
    namingPatterns: NamingPatterns;
    usageRatio: UsageRatio;
  }): number {
    const scores = [
      analysis.pipelinePosition.score,
      analysis.conditionalUsage.conditionalRatio,
      analysis.errorHandling.errorCallerRatio,
      analysis.namingPatterns.score,
      analysis.usageRatio.ratio
    ];

    // Weighted average with higher weight for structural indicators
    const weights = [0.3, 0.25, 0.25, 0.1, 0.1];
    const weightedSum = scores.reduce((sum, score, i) => sum + score * weights[i], 0);

    return Math.min(weightedSum, 1.0);
  }
}

export interface FallbackAnalysis {
  isFallback: boolean;
  confidence: number;
  patterns: {
    pipelinePosition: PipelinePosition;
    conditionalUsage: ConditionalUsage;
    errorHandling: ErrorHandling;
    namingPatterns: NamingPatterns;
    usageRatio: UsageRatio;
  };
}

export interface PipelinePosition {
  position: 'early' | 'middle' | 'late' | 'unknown';
  score: number;
}

export interface ConditionalUsage {
  isConditional: boolean;
  conditionalRatio: number;
  contexts: string[];
}

export interface ErrorHandling {
  isInErrorHandling: boolean;
  errorCallerRatio: number;
}

export interface NamingPatterns {
  patterns: Record<string, boolean>;
  score: number;
}

export interface UsageRatio {
  primaryCalls: number;
  fallbackCalls: number;
  totalCalls: number;
  ratio: number;
}

export interface ConducksEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  confidence: number;
  properties?: any;
}