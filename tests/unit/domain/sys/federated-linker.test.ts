import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { FederatedLinker } from '@/lib/core/graph/linker-federated.js';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';
import { DuckDbPersistence as GraphPersistence } from '@/lib/core/persistence/persistence.js';

const mockPersistenceLoad = jest.fn().mockResolvedValue(true as never);

describe('FederatedLinker Unit Tests 🌐', () => {
  let linker: FederatedLinker;
  let mainGraph: ConducksAdjacencyList;
  let mockFs: any;
  let loadSpy: jest.SpiedFunction<any>;

  beforeEach(() => {
    jest.clearAllMocks();
    loadSpy = jest.spyOn(GraphPersistence.prototype as any, 'load').mockImplementation(mockPersistenceLoad);
    mockFs = {
      access: jest.fn(),
      readFile: jest.fn(),
      writeFile: jest.fn(),
      mkdir: jest.fn()
    };
    linker = new FederatedLinker('/test/root', mockFs);
    mainGraph = new ConducksAdjacencyList();
  });

  describe('Multi-Workspace Linking (Architectural Hardening)', () => {
    it('should register a valid neighboring project', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue('[]'); // No existing links

      await linker.link('/external/project');

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('links.json'),
        expect.stringContaining('/external/project'),
        'utf-8'
      );
    });

    it('should reject non-Conducks projects', async () => {
      mockFs.access.mockRejectedValue(new Error('ENOENT'));

      await expect(linker.link('/invalid/path')).rejects.toThrow('Target path is not a valid Conducks project');
    });

    it('should hydrate the main graph from all linked projects', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(['/p1', '/p2']));
      
      await linker.hydrate(mainGraph);

      expect(loadSpy).toHaveBeenCalledTimes(2);
      expect(mockPersistenceLoad).toHaveBeenCalledTimes(2);
    });

    it('should handle missing links.json gracefully', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));
      const links = await linker.getLinks();
      expect(links).toEqual([]);
    });
  });
});
