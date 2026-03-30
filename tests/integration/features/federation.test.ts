import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ConducksInstaller } from '@/lib/domain/federation/conducks-installer.js';
import { MCPConfigurator } from '@/lib/domain/federation/mcp-configurator.js';
import { PulseContext } from '@/lib/domain/federation/context.js';
import os from 'node:os';

// Manual Mock Factory
const createMockFs = () => ({
  ensureDir: jest.fn().mockResolvedValue(undefined as never),
  writeFile: jest.fn().mockResolvedValue(undefined as never),
  pathExists: jest.fn(),
  readJson: jest.fn(),
  writeJson: jest.fn()
});

// Mock os to control homedir
jest.mock('node:os', () => ({
  homedir: jest.fn().mockReturnValue('/mock/home')
}));

describe('Federation Domain Integration 🌐', () => {
  let manualMockFs: any;

  beforeEach(() => {
    jest.clearAllMocks();
    manualMockFs = createMockFs();
  });

  describe('ConducksInstaller (Skill Synchronization)', () => {
    it('should synchronize all Conducks SKILL.md templates to global and workspace directories', async () => {
      // Pass the mock fs object to the installer (DI)
      const installer = new ConducksInstaller('/mock/workspace', manualMockFs);
      const result = await installer.sync();

      // Verify returned installed lists
      expect(result.global.length).toBeGreaterThan(5); // We have at least 6 core skills
      expect(result.workspace).toEqual(result.global);

      // Verify manual mock fs calls
      const writeCalls = manualMockFs.writeFile.mock.calls;

      // Should write to both global (~/.gemini/antigravity/skills) 
      // and workspace (.claude/skills/conducks) for each tool
      const globalWrites = writeCalls.filter((call: any) => call[0].includes('.gemini'));
      const workspaceWrites = writeCalls.filter((call: any) => call[0].includes('.claude'));

      expect(globalWrites.length).toBe(result.global.length);
      expect(workspaceWrites.length).toBe(result.workspace.length);

      // Check content of a specific skill
      const exploringCall = writeCalls.find((call: any) => call[0].includes('conducks-exploring'));
      expect(exploringCall[1]).toContain('name: conducks-exploring');
    });
  });

  describe('MCPConfigurator (IDE Registration)', () => {
    it('should register the Conducks MCP server in a new Claude config file', async () => {
      manualMockFs.pathExists.mockResolvedValue(false);
      manualMockFs.readJson.mockResolvedValue({ mcpServers: {} });

      const config = new MCPConfigurator(manualMockFs, os);
      const result = await config.registerClaude('/path/to/server.js');

      expect(result.success).toBe(true);
      expect(manualMockFs.ensureDir).toHaveBeenCalled();

      // Should create base file, then read it, then write updated state
      expect(manualMockFs.writeJson).toHaveBeenCalledWith(
        expect.stringContaining('claude_desktop_config.json'),
        { mcpServers: {} }
      );
    });

    it('should append to an existing Claude config file', async () => {
      manualMockFs.pathExists.mockResolvedValue(true);
      manualMockFs.readJson.mockResolvedValue({
        mcpServers: {
          existingServer: { command: "test" }
        }
      });

      const config = new MCPConfigurator(manualMockFs, os);
      const result = await config.registerClaude('/path/to/server.js');

      expect(result.success).toBe(true);

      // Verify the final write matches the expected merged output
      const writeCalls = manualMockFs.writeJson.mock.calls;
      const writtenConfig = writeCalls[0][1] as any;

      expect(writtenConfig.mcpServers.existingServer).toBeDefined();
      expect(writtenConfig.mcpServers.conducks.command).toBe('node');
      expect(writtenConfig.mcpServers.conducks.args).toContain('/path/to/server.js');
    });
  });

  describe('PulseContext (Topological State)', () => {
    it('should accurately track symbol registrations and external packages during a pulse', () => {
      const context = new PulseContext();

      context.registerSymbol('src/main.ts::main', { id: 'node1' });
      context.registerExternalPackage('express');

      expect(context.getSymbol('src/main.ts::main')).toBeDefined();
      expect(context.isExternalPackage('express')).toBe(true);
      // Sub-modules should resolve to root package matches
      expect(context.isExternalPackage('express.Router')).toBe(true);

      context.reset();

      expect(context.getSymbol('src/main.ts::main')).toBeUndefined();
      expect(context.isExternalPackage('express')).toBe(false);
    });
  });

});
