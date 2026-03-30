import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { GVREngine } from '@/lib/domain/evolution/gvr-engine.js';
import { DeadCodeAnalyzer } from '@/lib/domain/evolution/dead-code.js';
import { ConducksAdjacencyList, ConducksNode, ConducksEdge } from '@/lib/core/graph/adjacency-list.js';
import fs from 'node:fs/promises';

describe('Evolution Domain Integration (GVR & DeadCode) 🧬', () => {
  let gvr: GVREngine;
  let deadCode: DeadCodeAnalyzer;
  let adjacencyList: ConducksAdjacencyList;
  let manualMockFs: any;

  beforeEach(() => {
    manualMockFs = {
      readFile: jest.fn(),
      writeFile: jest.fn(),
      access: jest.fn()
    };
    gvr = new GVREngine(manualMockFs);
    deadCode = new DeadCodeAnalyzer();
    adjacencyList = new ConducksAdjacencyList();

    // Reset all mocks
    jest.clearAllMocks();

    // Setup basic graph for evolution tests
    const nodeA: ConducksNode = {
      id: 'src/lib.ts::oldFunc',
      label: 'function',
      properties: { name: 'oldFunc', filePath: 'src/lib.ts' }
    };
    const nodeB: ConducksNode = {
      id: 'src/main.ts::main',
      label: 'function',
      properties: { name: 'main', filePath: 'src/main.ts', isEntryPoint: true }
    };

    adjacencyList.addNode(nodeA);
    adjacencyList.addNode(nodeB);

    adjacencyList.addEdge({
      id: 'main->oldFunc',
      sourceId: nodeB.id,
      targetId: nodeA.id,
      type: 'CALLS',
      confidence: 1.0,
      properties: {}
    });
  });

  describe('GVREngine (Graph-Verified Rename)', () => {
    it('should successfully execute a multi-file rename', async () => {
      // Setup mock file contents
      (manualMockFs.readFile as any).mockImplementation((path: string) => {
        if (path === 'src/lib.ts') return Promise.resolve('export function oldFunc() {}');
        if (path === 'src/main.ts') return Promise.resolve('import { oldFunc } from "./lib"; oldFunc();');
        return Promise.reject(new Error('File not found'));
      });
      (manualMockFs.writeFile as any).mockResolvedValue(undefined);

      const result = await gvr.renameSymbol(adjacencyList, 'src/lib.ts::oldFunc', 'newFunc');
      
      expect(result.success).toBe(true);
      expect(result.affectedFiles).toContain('src/lib.ts');
      expect(result.affectedFiles).toContain('src/main.ts');
      
      // Verify write calls
      const writeCalls = (manualMockFs.writeFile as any).mock.calls;
      expect(writeCalls.some((call: any) => call[1].includes('newFunc'))).toBe(true);
    });

    it('should rollback all changes if a write failure occurs', async () => {
      // Mock failure on the second file
      (manualMockFs.readFile as any).mockImplementation((path: string) => {
         if (path === 'src/lib.ts') return Promise.resolve('contentA');
         if (path === 'src/main.ts') return Promise.resolve('contentB');
         return Promise.reject(new Error('File not found'));
      });
      
      (manualMockFs.writeFile as any).mockImplementation((path: string) => {
        if (path === 'src/main.ts') return Promise.reject(new Error('Disk Full'));
        return Promise.resolve();
      });

      const result = await gvr.renameSymbol(adjacencyList, 'src/lib.ts::oldFunc', 'newFunc');
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('rolled back');
      
      // Verify rollback write of original content
      expect(manualMockFs.writeFile).toHaveBeenCalledWith('src/lib.ts', 'contentA', 'utf-8');
    });

    it('should stay silent by default (no debug logging)', async () => {
      const originalDebug = process.env.CONDUCKS_DEBUG;
      delete process.env.CONDUCKS_DEBUG;

      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      (manualMockFs.readFile as any).mockImplementation((path: string) => {
        if (path === 'src/lib.ts') return Promise.resolve('export function oldFunc() {}');
        if (path === 'src/main.ts') return Promise.resolve('import { oldFunc } from "./lib"; oldFunc();');
        return Promise.reject(new Error('File not found'));
      });
      (manualMockFs.writeFile as any).mockResolvedValue(undefined);

      await gvr.renameSymbol(adjacencyList, 'src/lib.ts::oldFunc', 'newFunc');

      expect(errSpy).not.toHaveBeenCalled();
      errSpy.mockRestore();

      if (originalDebug === undefined) delete process.env.CONDUCKS_DEBUG;
      else process.env.CONDUCKS_DEBUG = originalDebug;
    });

    it('should emit debug logs only when CONDUCKS_DEBUG=1', async () => {
      const originalDebug = process.env.CONDUCKS_DEBUG;
      process.env.CONDUCKS_DEBUG = '1';

      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      (manualMockFs.readFile as any).mockImplementation((path: string) => {
        if (path === 'src/lib.ts') return Promise.resolve('contentA');
        if (path === 'src/main.ts') return Promise.resolve('contentB');
        return Promise.reject(new Error('File not found'));
      });
      (manualMockFs.writeFile as any).mockImplementation((path: string) => {
        if (path === 'src/main.ts') return Promise.reject(new Error('Disk Full'));
        return Promise.resolve();
      });

      await gvr.renameSymbol(adjacencyList, 'src/lib.ts::oldFunc', 'newFunc');

      expect(errSpy).toHaveBeenCalled();
      errSpy.mockRestore();

      if (originalDebug === undefined) delete process.env.CONDUCKS_DEBUG;
      else process.env.CONDUCKS_DEBUG = originalDebug;
    });
  });

  describe('DeadCodeAnalyzer (Stale Import & Orphan detection)', () => {
    it('should identify orphaned symbols (symbols with no callers)', () => {
      const orphan: ConducksNode = {
        id: 'src/lib.ts::unused',
        label: 'function_declaration',
        properties: { name: 'unused', filePath: 'src/lib.ts' }
      };
      adjacencyList.addNode(orphan);

      const report = deadCode.analyze(adjacencyList);
      const orphanViolation = report.find(v => v.symbol === 'unused' && v.type === 'ORPHAN');
      expect(orphanViolation).toBeDefined();
    });

    it('should identify stale imports (IMPORTS with no usage)', () => {
      // Logic: DeadCodeAnalyzer looks for 'import_clause' or 'import_specifier'
      const importNode: ConducksNode = {
        id: 'src/main.ts::LibModule',
        label: 'import_specifier',
        properties: { name: 'LibModule', filePath: 'src/main.ts' }
      };
      adjacencyList.addNode(importNode);

      // No CALLS or ACCESSES to LibModule -> STALE_IMPORT
      const report = deadCode.analyze(adjacencyList);
      const staleImport = report.find(v => v.type === 'STALE_IMPORT' && v.symbol === 'LibModule');
      expect(staleImport).toBeDefined();
    });
  });
});
