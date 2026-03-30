import { describe, it, expect, beforeEach } from '@jest/globals';
import { DeadCodeAnalyzer } from '@/lib/domain/evolution/dead-code.js';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';

describe('DeadCodeAnalyzer Unit Tests 🥀', () => {
  let analyzer: DeadCodeAnalyzer;
  let graph: ConducksAdjacencyList;

  beforeEach(() => {
    analyzer = new DeadCodeAnalyzer();
    graph = new ConducksAdjacencyList();
  });

  describe('Structural Dead Code Analysis', () => {
    it('should identify orphaned symbols (ORPHAN)', () => {
      // Symbol 'Unused' exists but has 0 incoming callers/importers
      graph.addNode({ 
        id: 'Unused', 
        label: 'function_declaration', 
        properties: { name: 'UnusedFunction', filePath: 'logic.js' } 
      } as any);

      const findings = analyzer.analyze(graph);
      expect(findings).toHaveLength(1);
      expect(findings[0].type).toBe('ORPHAN');
      expect(findings[0].symbol).toBe('UnusedFunction');
    });

    it('should ignore entry points from orphan detection', () => {
      graph.addNode({ 
        id: 'main', 
        label: 'function_declaration', 
        properties: { name: 'main_handler', filePath: 'entry.js' } 
      } as any);

      const findings = analyzer.analyze(graph);
      expect(findings).toHaveLength(0); // Entry point like 'main' is not an orphan
    });

    it('should identify unused exports (UNUSED_EXPORT)', () => {
      // Setup: Module A exports 'X', Module B calls 'Y' (X is unused by other modules)
      graph.addNode({ 
        id: 'X', 
        label: 'function_declaration', 
        properties: { name: 'ExportedFunc', filePath: 'a.js', isExport: true } 
      } as any);

      graph.addNode({ 
        id: 'Internal', 
        label: 'function_declaration', 
        properties: { name: 'InternalCaller', filePath: 'a.js' } 
      } as any);

      // Called internally but not externally
      graph.addEdge({ id: 'I->X', sourceId: 'Internal', targetId: 'X', type: 'CALLS' as any, confidence: 1, properties: {} });

      const findings = analyzer.analyze(graph);
      expect(findings.some(f => f.type === 'UNUSED_EXPORT')).toBe(true);
    });

    it('should identify stale imports (STALE_IMPORT)', () => {
      graph.addNode({ 
        id: 'ImpA', 
        label: 'import_specifier', 
        properties: { name: 'React', filePath: 'app.js' } 
      } as any);

      // No downstream CALLS or ACCESSES from this import
      const findings = analyzer.analyze(graph);
      expect(findings.some(f => f.type === 'STALE_IMPORT')).toBe(true);
    });

    it('should NOT flag imports that ARE used', () => {
      graph.addNode({ id: 'ImpA', label: 'import_specifier', properties: { name: 'useState', filePath: 'app.js' } } as any);
      graph.addNode({ id: 'Comp', label: 'function_declaration', properties: { name: 'App', filePath: 'app.js' } } as any);
      
      // Comp calls ImpA
      graph.addEdge({ id: 'C->I', sourceId: 'Comp', targetId: 'ImpA', type: 'CALLS' as any, confidence: 1, properties: {} });

      const findings = analyzer.analyze(graph);
      expect(findings.some(f => f.type === 'STALE_IMPORT')).toBe(false);
    });
  });
});
