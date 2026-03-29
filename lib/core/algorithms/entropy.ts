/**
 * Conducks — Shannon Entropy Algorithm
 * 
 * Measures the "Social Complexity" or "Ownership Concentration" of a 
 * code unit. High entropy indicates the code is modified by many 
 * authors with no clear owner, increasing the risk of structural drift.
 */

/**
 * Calculates Shannon Entropy for a given distribution of events (e.g., commits per author).
 * Formula: H = -Σ p_i * log2(p_i)
 * 
 * @param distribution Record<Author, Count>
 * @returns Entropy score (0 to log2(N))
 */
export function calculateShannonEntropy(distribution: Record<string, number>): number {
  const values = Object.values(distribution);
  const total = values.reduce((sum, count) => sum + count, 0);
  
  if (total === 0) return 0;
  
  let entropy = 0;
  for (const count of values) {
    const probability = count / total;
    if (probability > 0) {
      entropy -= probability * Math.log2(probability);
    }
  }
  
  return entropy;
}

/**
 * Normalizes entropy into a 0.0 - 1.0 risk score.
 * 1.0 indicates extremely high fragmentation (many authors, equal shares).
 */
export function normalizeEntropyRisk(entropy: number, authorCount: number): number {
  if (authorCount <= 1) return 0;
  
  // Maximum possible entropy for N authors is log2(N)
  const maxEntropy = Math.log2(authorCount);
  return entropy / maxEntropy;
}
