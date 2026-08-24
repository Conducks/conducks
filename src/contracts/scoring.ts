/**
 * The numbers the score is MADE of, named where both layers may read them.
 *
 * A domain constant and an interface that prints it are the same fact in two places, and both of
 * these got printed wrong for that reason:
 *
 *   - `explain` said "largest weight in the composite score" beside complexity. True of the formula,
 *     and read by every reader as a claim about the symbol on screen — so `complexity: 0.50 (largest
 *     weight)` printed above `fan-out: 10.00` told them the wrong thing while being technically
 *     correct. It now prints the weight itself, from here.
 *   - `drift` filtered its rendered hotspot list at a hardcoded 0.01 while `summary.decay_count`
 *     counted at DECAY_VELOCITY_THRESHOLD. The list contradicted the count six lines above it.
 *
 * `contracts` is the one place both layers may import (ADR 0005's layer rule, and the same reasoning
 * the registry states for its error class and limit constants: the vocabulary is shared even where
 * the logic is not). Duplicating either number into a render site is how they drift apart again.
 */

/** How much each signal contributes to the composite risk score. Consumed by the scorer and printed by `explain`. */
export const RISK_WEIGHTS = {
  gravity: 0.25,
  complexity: 0.35,
  entropy: 0.10,
  churn: 0.10,
  fanOut: 0.15,
} as const;

/**
 * Above this velocity a symbol counts as decaying. One threshold: `drift`'s summary counts with it
 * and `drift`'s rendered hotspot list filters with it, so the two can no longer disagree.
 */
export const DECAY_VELOCITY_THRESHOLD = 0.05;

/**
 * Below this velocity a symbol counts as improving. The mirror of the decay threshold, and it lives
 * here for the same reason: `drift-engine.ts` counted `improvement_count` at `velocity < 0` while
 * `drift.ts` listed at `< -0.01`, so sofie printed "Improving: 393" over an empty improving section.
 * Any movement below zero is PageRank redistributing after a node was added, which is arithmetic
 * rather than improvement — the same noise the decay side excludes.
 */
export const IMPROVEMENT_VELOCITY_THRESHOLD = -DECAY_VELOCITY_THRESHOLD;

/**
 * A graph this sparse on a node set this large was not finished: nodes were persisted and edges
 * lost, so it loads, looks READY, and answers every question from a partial base.
 *
 * Here rather than in `status.ts` because both surfaces must reach the same verdict. They did not:
 * the CLI flagged a partial graph and `conducks_status` said nothing, so a person and an agent
 * asking the same question about the same vault got different answers (ADR 0148).
 */
export const PARTIAL_GRAPH_MIN_NODES = 50;
export const PARTIAL_GRAPH_MAX_DENSITY = 0.5;

/**
 * Whether a loaded graph can be trusted to answer from.
 *
 * `incomplete` means an analyze was interrupted after writing nodes and before writing edges: the
 * vault loads, reports READY, and answers every question from a partial base. `empty` is the same
 * problem at its limit, and it needed naming separately because the node floor excludes it by
 * construction — a vault with nothing in it cleared no threshold and read as healthy.
 *
 * Exported and shared for the reason stated above `emptyOrReady`: this judgement lived in
 * `status.ts` alone, so `conducks status` warned a person about a partial graph and
 * `conducks_status` told an agent nothing. One question, one answer, both surfaces (ADR 0148).
 */
export function graphHealth(nodeCount: number, density: number): { empty: boolean; incomplete: boolean } {
  return {
    empty: nodeCount === 0,
    incomplete: nodeCount > PARTIAL_GRAPH_MIN_NODES && density < PARTIAL_GRAPH_MAX_DENSITY,
  };
}
