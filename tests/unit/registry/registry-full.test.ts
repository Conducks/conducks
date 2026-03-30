import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ConducksRegistry } from '@/registry/base.js';
import { ToolRegistry } from '@/registry/tool-registry.js';
import { SynapseRegistry } from '@/registry/synapse-registry.js';
import { ConducksComponent } from '@/registry/types.js';

describe('Conducks: Full Registry Suite', () => {

  describe('ConducksRegistry (Base)', () => {
    interface MockComponent extends ConducksComponent {
      data: string;
    }

    let registry: ConducksRegistry<MockComponent>;

    beforeEach(() => {
      registry = new ConducksRegistry<MockComponent>({ maxComponents: 2 });
    });

    it('should register and retrieve components', () => {
      const comp = { id: 'test-1', type: 'test' as any, version: '1.0.0', data: 'hello' };
      registry.register(comp);
      expect(registry.get('test-1')).toBe(comp);
      expect(registry.size).toBe(1);
    });

    it('should throw on duplicate identifiers', () => {
      const comp = { id: 'test-1', type: 'test' as any, version: '1.0.0', data: 'hello' };
      registry.register(comp);
      expect(() => registry.register(comp)).toThrow(/already registered/);
    });

    it('should enforce capacity limits', () => {
      registry.register({ id: '1', type: 't' as any, version: '1', data: '' });
      registry.register({ id: '2', type: 't' as any, version: '1', data: '' });
      expect(() => registry.register({ id: '3', type: 't' as any, version: '1', data: '' })).toThrow(/Maximum capacity/);
    });

    it('should support deprecation and unregistration', () => {
      registry.register({ id: '1', type: 't' as any, version: '1', data: '' });
      registry.deprecate('1');
      // Status is internal but we verify it doesn't crash
      expect(registry.get('1')).toBeDefined();
      expect(registry.unregister('1')).toBe(true);
      expect(registry.get('1')).toBeUndefined();
    });
  });

  describe('SynapseRegistry', () => {
    it('should manage suites and providers', () => {
      const reg = new SynapseRegistry();
      const mockSuite = {
        name: 'test-suite',
        version: '1.0.0',
        register: jest.fn()
      };

      reg.registerSuite(mockSuite, {});
      expect(reg.getSuites()).toContain(mockSuite);
      expect(mockSuite.register).toHaveBeenCalled();

      reg.registerProvider('.test', { name: 'mock-provider' });
      expect(reg.getProvider('.test')).toBeDefined();
    });
  });

  describe('ToolRegistry', () => {
    it('should handle tool requests with caching', async () => {
      const reg = new ToolRegistry({ cacheTtlMs: 1000 });
      const handler = jest.fn(async (args: any) => `Result: ${args.val}`);

      const tool: any = {
        id: 'tool-1',
        name: 'test_tool',
        type: 'tool',
        version: '1.0.0',
        description: 'test description',
        inputSchema: { type: 'object', properties: { val: { type: 'string' } } },
        handler,
        formatter: (res: any) => res
      };

      reg.register(tool);

      // First call (cache miss)
      const resp1 = await reg.handleRequest('test_tool', { val: 'A' });
      expect(resp1.content[0].text).toBe('Result: A');
      expect(handler).toHaveBeenCalledTimes(1);

      // Second call (cache hit)
      const resp2 = await reg.handleRequest('test_tool', { val: 'A' });
      expect(resp2.content[0].text).toBe('Result: A');
      expect(handler).toHaveBeenCalledTimes(1);

      // Different args (cache miss)
      await reg.handleRequest('test_tool', { val: 'B' });
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should return error for unknown tools', async () => {
      const reg = new ToolRegistry();
      const resp = await reg.handleRequest('unknown', {});
      expect(resp.isError).toBe(true);
      expect(resp.content[0].text).toContain('Unknown tool');
    });
  });
});
