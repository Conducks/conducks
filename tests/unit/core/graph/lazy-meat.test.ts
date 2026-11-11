/**
 * todo82 — node meat is held as a JSON snapshot and compressed later. `getNode` must return the
 * same properties before and after compaction, and a caller mutating its own object after
 * `addNode` must not change what the graph returns (the snapshot the old eager deflate gave).
 */
import { describe, it, expect, jest } from '@jest/globals';
import { ConducksAdjacencyList } from "@/lib/core/graph/index.js";

describe('lazy meat compaction (todo82)', () => {
  it('returns the same snapshot before and after compaction', () => {
    jest.useFakeTimers();
    try {
      const g = new ConducksAdjacencyList();
      const props: Record<string, unknown> = { name: 'f', filePath: 'a.ts', extra: { deep: [1, 2] } };
      g.addNode({ id: 'a.ts::f', label: 'BEHAVIOR', properties: props as never });
      (props.extra as { deep: number[] }).deep.push(3);

      const before = g.getNode('a.ts::f')!.properties.extra;
      jest.advanceTimersByTime(5000);
      (g as unknown as { meatCache: Map<string, unknown> }).meatCache.clear();
      const after = g.getNode('a.ts::f')!.properties.extra;

      expect(before).toEqual({ deep: [1, 2] });
      expect(after).toEqual({ deep: [1, 2] });
      expect((g as unknown as { pendingMeat: Map<string, string> }).pendingMeat.size).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
