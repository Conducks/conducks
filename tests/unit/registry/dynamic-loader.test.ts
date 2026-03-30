import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { DynamicToolLoader } from '@/registry/dynamic-loader.js';
import path from 'node:path';

describe('Conducks: DynamicToolLoader Unit Tests 💎', () => {
  let mockFs: any;
  let loader: DynamicToolLoader;
  const BASE_DIR = '/mock/project';

  beforeEach(() => {
    mockFs = {
      pathExists: jest.fn(),
      readFile: jest.fn(),
      readdir: jest.fn(),
      stat: jest.fn(),
      ensureDir: jest.fn(),
    };
    loader = new DynamicToolLoader(BASE_DIR, mockFs);
  });

  describe('Configuration Loading', () => {
    it('should load and parse conducks.config.json', async () => {
      const config = {
        server: { name: 'test', version: '1', title: 'Test' },
        description: 'desc',
        toolsDir: 'tools'
      };
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readFile.mockResolvedValue(JSON.stringify(config));

      const loaded = await loader.loadConfig();
      expect(loaded).toEqual(config);
      expect(mockFs.readFile).toHaveBeenCalledWith(path.join(BASE_DIR, 'conducks.config.json'), 'utf8');
    });

    it('should throw if config is missing', async () => {
      mockFs.pathExists.mockResolvedValue(false);
      await expect(loader.loadConfig()).rejects.toThrow(/conducks.config.json not found/);
    });
  });

  describe('Tool Generation', () => {
    beforeEach(() => {
      const config = {
        server: { name: 'test', version: '1', title: 'Test' },
        description: 'desc',
        toolsDir: 'tools'
      };
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readFile.mockImplementation(async (p: string) => {
        if (p.endsWith('conducks.config.json')) return JSON.stringify(config);
        if (p.endsWith('simple.md')) return '<!-- description: A simple tool -->\n# Simple Tool\nContent here.';
        if (p.endsWith('tools.md')) return '<!-- description: Hub description -->\n# Hub Index\nAvailable sub-tools.';
        if (p.endsWith('sub.md')) return '# Sub Tool\nSub content.';
        return '';
      });
      mockFs.readdir.mockResolvedValue(['simple.md', 'category_folder']);
      mockFs.stat.mockImplementation(async (p: string) => ({
        isDirectory: () => p.endsWith('category_folder')
      }));
    });

    it('should create simple tools from markdown files', async () => {
      const tools = await loader.loadTools();
      const simple = tools.find(t => t.name === 'simple');
      expect(simple).toBeDefined();
      expect(simple?.description).toBe('A simple tool');

      const result = await simple?.handler({});
      expect(result).toContain('Content here.');
    });

    it('should create hub tools from directories with tools.md', async () => {
      // Mock category folder content
      mockFs.pathExists.mockImplementation(async (p: string) => {
        if (p.endsWith('tools.md')) return true; // Hub index exists
        if (p.endsWith('tools/sub.md')) return true; // Sub tool exists
        return true;
      });

      const tools = await loader.loadTools();
      const hub = tools.find(t => t.name === 'category_folder');
      expect(hub).toBeDefined();
      expect(hub?.description).toBe('Hub description');

      // Test hub index
      const index = await hub?.handler({});
      expect(index).toContain('Hub Index');

      // Test hub routing to sub-tool
      const sub = await hub?.handler({ tool: 'sub' });
      expect(sub).toContain('Sub Tool');
    });

    it('should handle section extraction in simple tools', async () => {
      const content = '# Main\n## Section A\nData A\n## Section B\nData B';
      mockFs.readFile.mockImplementation(async (p: string) => {
        if (p.endsWith('conducks.config.json')) return JSON.stringify({ toolsDir: 't' });
        return content;
      });
      mockFs.readdir.mockResolvedValue(['t.md']);
      mockFs.stat.mockResolvedValue({ isDirectory: () => false });

      const tools = await loader.loadTools();
      const tool = tools[0];

      const section = await tool.handler({ section: '## Section A' });
      expect(section).toContain('Data A');
      expect(section).not.toContain('Data B');
    });
  });
});
