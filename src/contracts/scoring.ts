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
