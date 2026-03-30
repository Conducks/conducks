import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { BindingProcessor } from '@/lib/core/parsing/processors/binding.js';
import { CallProcessor } from '@/lib/core/parsing/processors/call.js';
import { ImportProcessor } from '@/lib/core/parsing/processors/import.js';
import { PrismSpectrum } from "@/lib/core/parsing/prism-core.js";

describe('Core Parsing Processors Unit Tests 🧱', () => {
  let spectrum: PrismSpectrum;

  beforeEach(() => {
    spectrum = {
      nodes: [],
      relationships: [],
      metadata: { filePath: 'test.ts', language: 'typescript' }
    };
  });

  describe('BindingProcessor', () => {
    let processor: BindingProcessor;

    beforeEach(() => {
      processor = new BindingProcessor();
    });

    it('should process symbol aliases (@alias)', () => {
      processor.processAlias('myAlias', 'originalSymbol', spectrum);
      expect(spectrum.relationships).toContainEqual(expect.objectContaining({
        sourceName: 'myAlias',
        targetName: 'originalSymbol',
        type: 'ALIASES'
      }));
    });

    it('should synthesize wildcard bindings for global access', () => {
      processor.synthesizeWildcard('caller.go', 'pkg/target.go', ['Engine', 'Drive'], spectrum);
      expect(spectrum.relationships).toHaveLength(2);
      expect(spectrum.relationships[0].targetName).toBe('pkg/target.go::Engine');
      expect(spectrum.relationships[0].type).toBe('ACCESSES');
    });
  });

  describe('CallProcessor', () => {
    let processor: CallProcessor;

    beforeEach(() => {
      processor = new CallProcessor();
    });

    it('should process call-site captures (@kinesis_target)', () => {
      processor.process('targetFunc', 'sourceFunc', 'CALLS', spectrum, ['arg1', 'arg2']);
      expect(spectrum.relationships).toContainEqual(expect.objectContaining({
        sourceName: 'sourceFunc',
        targetName: 'targetFunc',
        type: 'CALLS'
      }));
      expect(spectrum.relationships[0].metadata?.arguments).toEqual(['arg1', 'arg2']);
    });

    it('should identify constructors via PascalCase heuristic', () => {
      expect(processor.isConstructor('User', {})).toBe(true);
      expect(processor.isConstructor('getUser', {})).toBe(false);
    });
  });

  describe('ImportProcessor', () => {
    let processor: ImportProcessor;
    const allPaths = ['/root/src/lib/utils.ts', '/root/src/main.ts', '/root/node_modules/express/index.d.ts'];

    beforeEach(() => {
      processor = new ImportProcessor();
    });

    it('should resolve relative imports', () => {
      const resolved = processor.resolve('./lib/utils', '/root/src/main.ts', allPaths);
      expect(resolved).toBe('/root/src/lib/utils.ts');
    });

    it('should resolve fuzzy module imports', () => {
      const resolved = processor.resolve('utils', '/root/src/main.ts', allPaths);
      expect(resolved).toBe('/root/src/lib/utils.ts');
    });

    it('should process imports and add relationships', () => {
      processor.process('./lib/utils', '/root/src/main.ts', allPaths, spectrum);
      expect(spectrum.relationships).toContainEqual(expect.objectContaining({
        targetName: '/root/src/lib/utils.ts',
        type: 'IMPORTS'
      }));
    });

    it('should handle specialized bindings (from X import Y)', () => {
      processor.processBinding('/root/src/lib/utils.ts', 'getData', 'myUtils', spectrum);
      expect(spectrum.relationships).toContainEqual(expect.objectContaining({
        targetName: '/root/src/lib/utils.ts',
        type: 'IMPORTS',
        metadata: { name: 'myUtils', original: 'getData' }
      }));
    });
  });
});
