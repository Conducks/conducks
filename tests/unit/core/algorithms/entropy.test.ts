import { describe, it, expect } from '@jest/globals';
import { calculateShannonEntropy, normalizeEntropyRisk } from '@/lib/core/algorithms/entropy.js';

describe('Shannon Entropy Unit Tests 📊', () => {
  describe('calculateShannonEntropy', () => {
    it('should return 0 for a single author (Zero Uncertainty)', () => {
      const distribution = { 'author1': 10 };
      expect(calculateShannonEntropy(distribution)).toBe(0);
    });

    it('should return 1.0 for two authors with equal shares', () => {
      const distribution = { 'author1': 5, 'author2': 5 };
      expect(calculateShannonEntropy(distribution)).toBe(1.0);
    });

    it('should return log2(N) for N authors with equal shares', () => {
      const distribution = { 'a1': 1, 'a2': 1, 'a3': 1, 'a4': 1 };
      expect(calculateShannonEntropy(distribution)).toBe(2.0); // log2(4) = 2
    });

    it('should handle skewed distributions', () => {
      const distribution = { 'main': 9, 'minor': 1 };
      const entropy = calculateShannonEntropy(distribution);
      
      // H = -(0.9 * log2(0.9) + 0.1 * log2(0.1))
      // H = -(0.9 * -0.152 + 0.1 * -3.32) = -(-0.1368 - 0.332) = 0.4688...
      expect(entropy).toBeGreaterThan(0);
      expect(entropy).toBeLessThan(1.0);
      expect(entropy).toBeCloseTo(0.469, 3);
    });

    it('should handle empty distributions', () => {
      expect(calculateShannonEntropy({})).toBe(0);
    });
  });

  describe('normalizeEntropyRisk', () => {
    it('should return 0.0 for 1 or 0 authors', () => {
      expect(normalizeEntropyRisk(0, 1)).toBe(0);
      expect(normalizeEntropyRisk(0, 0)).toBe(0);
    });

    it('should return 1.0 for maximum possible entropy for a given author count', () => {
      const authorCount = 4;
      const entropy = Math.log2(authorCount);
      expect(normalizeEntropyRisk(entropy, authorCount)).toBe(1.0);
    });

    it('should return 0.5 for half of maximum entropy', () => {
      const authorCount = 4;
      const entropy = Math.log2(authorCount) / 2;
      expect(normalizeEntropyRisk(entropy, authorCount)).toBe(0.5);
    });
  });
});
