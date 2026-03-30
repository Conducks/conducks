import { describe, it, expect, beforeEach } from '@jest/globals';
import { FlowProcessor } from '@/lib/core/parsing/processors/flow.js';
import { HeritageProcessor } from '@/lib/core/parsing/processors/heritage.js';
import { PrismSpectrum } from '@/lib/core/parsing/prism-core.js';

describe('Flow & Heritage Processors Unit Tests 🌊', () => {
  let spectrum: PrismSpectrum;

  beforeEach(() => {
    spectrum = {
      nodes: [],
      relationships: [],
      metadata: { filePath: 'app.py', language: 'python' },
    };
  });

  it('should process assignment handover as ACCESSES relationship', () => {
    const processor = new FlowProcessor();

    processor.processAssignment('payload', 'buildPayload()', 'main', spectrum);

    expect(spectrum.relationships).toContainEqual(
      expect.objectContaining({
        sourceName: 'main',
        targetName: 'payload',
        type: 'ACCESSES',
        metadata: { reason: 'assignment', value: 'buildPayload()' },
      }),
    );
  });

  it('should process routes and requests as virtual network nodes', () => {
    const processor = new FlowProcessor();

    processor.processRoute('/users/{id}', 'get', 'main', spectrum, 'fastapi');
    processor.processRequest('/users/42', 'post', 'main', spectrum);

    expect(spectrum.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'ROUTE::/users/{id}::GET',
          kind: 'fastapi_route',
          metadata: expect.objectContaining({ isRoute: true, method: 'GET' }),
        }),
        expect.objectContaining({
          name: 'REQUEST::/users/42::POST',
          kind: 'request',
          metadata: expect.objectContaining({ isRequest: true, method: 'POST' }),
        }),
      ]),
    );

    expect(spectrum.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'DEFINES', metadata: { isRouteEdge: true } }),
        expect.objectContaining({ type: 'CALLS', metadata: { isRequestEdge: true } }),
      ]),
    );
  });

  it('should classify heritage relationships as EXTENDS vs IMPLEMENTS', () => {
    const processor = new HeritageProcessor();

    processor.process('BaseService', 'UserService', spectrum);
    processor.process('IRepository', 'UserRepository', spectrum);
    processor.process('', 'Ignored', spectrum);

    expect(spectrum.relationships).toContainEqual(
      expect.objectContaining({
        sourceName: 'UserService',
        targetName: 'BaseService',
        type: 'EXTENDS',
      }),
    );

    expect(spectrum.relationships).toContainEqual(
      expect.objectContaining({
        sourceName: 'UserRepository',
        targetName: 'IRepository',
        type: 'IMPLEMENTS',
      }),
    );

    expect(spectrum.relationships).toHaveLength(2);
  });
});
