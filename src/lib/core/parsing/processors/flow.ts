import { PrismSpectrum } from "@/lib/core/parsing/prism-core.js";
import { ConducksAdjacencyList, NodeId, ConducksNode, ConducksEdge } from "@/lib/core/graph/adjacency-list.js";

/**
 * Conducks — Flow Processor (Phase 2: Pulse Flow) 💎
 * 
 * Handles variable handovers and HTTP route/request mappings.
 */
export class FlowProcessor {
  /**
   * Processes a variable assignment to track local data handover.
   */
  public processAssignment(name: string, value: string, scope: string, spectrum: PrismSpectrum): void {
    // Conducks: Create an ACCESSES relationship representing the flow
    // We treat the assignment as the source of the data pulse.
    spectrum.relationships.push({
      sourceName: scope,
      targetName: name,
      type: 'ACCESSES' as any,
      confidence: 1.0,
      metadata: { reason: 'assignment', value }
    });
  }

  /**
   * Processes an HTTP route definition (e.g. FastAPI @app.get('/path')).
   */
  public processRoute(path: string, method: string, scope: string, spectrum: PrismSpectrum, framework?: string | null): void {
    const routeId = `ROUTE::${path}::${method.toUpperCase()}`;
    const kind = framework ? `${framework}_route` : 'route';

    // Add a virtual node for the Route
    spectrum.nodes.push({
      name: routeId,
      kind: kind as any,
      range: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
      filePath: 'network',
      isExport: true,
      metadata: { isRoute: true, path, method: method.toUpperCase(), framework }
    });

    spectrum.relationships.push({
      sourceName: scope,
      targetName: routeId,
      type: 'DEFINES' as any,
      confidence: 1.0,
      metadata: { isRouteEdge: true }
    });
  }

  /**
   * Processes an HTTP client request (e.g. requests.get('/path')).
   */
  public processRequest(url: string, method: string, scope: string, spectrum: PrismSpectrum): void {
    const requestId = `REQUEST::${url}::${method.toUpperCase()}`;

    spectrum.nodes.push({
      name: requestId,
      kind: 'request' as any,
      range: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
      filePath: 'network',
      isExport: false,
      metadata: { isRequest: true, url, method: method.toUpperCase() }
    });

    spectrum.relationships.push({
      sourceName: scope,
      targetName: requestId,
      type: 'CALLS' as any,
      confidence: 1.0,
      metadata: { isRequestEdge: true }
    });
  }
}

