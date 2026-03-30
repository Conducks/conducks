import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { MCPConfigurator } from '@/lib/domain/federation/mcp-configurator.js';

describe('MCPConfigurator Unit Tests 🛠️', () => {
  let configurator: MCPConfigurator;
  let mockFs: any;
  let mockOs: any;
  const mockHomedir = '/Users/testuser';

  beforeEach(() => {
    mockFs = {
      pathExists: jest.fn(),
      ensureDir: jest.fn(),
      writeJson: jest.fn(),
      readJson: jest.fn()
    };
    mockOs = {
      homedir: jest.fn().mockReturnValue(mockHomedir)
    };
    configurator = new MCPConfigurator(mockFs, mockOs);
  });

  describe('Claude Desktop Registration (Architectural Hardening)', () => {
    it('should create a new config file if it does not exist', async () => {
      mockFs.pathExists.mockResolvedValue(false);
      mockFs.readJson.mockResolvedValue({ mcpServers: {} });

      const result = await configurator.registerClaude('/path/to/server.js');

      expect(mockFs.ensureDir).toHaveBeenCalled();
      expect(mockFs.writeJson).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should append Conducks to an existing mcpServers configuration', async () => {
      mockFs.pathExists.mockResolvedValue(true);
      const existingConfig = {
        mcpServers: {
          existingServer: { command: 'node', args: ['existing.js'] }
        }
      };
      mockFs.readJson.mockResolvedValue(existingConfig);

      const result = await configurator.registerClaude('/path/to/server.js');

      expect(result.success).toBe(true);
      expect(mockFs.writeJson).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          mcpServers: expect.objectContaining({
            conducks: expect.objectContaining({ args: ['/path/to/server.js'] })
          })
        }),
        expect.any(Object)
      );
    });

    it('should handle filesystem errors during registration', async () => {
      mockFs.pathExists.mockRejectedValue(new Error('Permission Denied'));

      const result = await configurator.registerClaude('/path/to/server.js');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Claude Setup Failed');
    });
  });
});
