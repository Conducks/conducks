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
      sourceName: (scope || 'unit').toLowerCase(),
      targetName: name.toLowerCase(),
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
      sourceName: (scope || 'unit').toLowerCase(),
      targetName: routeId,
      type: 'DEFINES' as any,
      confidence: 1.0,
      metadata: { isRouteEdge: true }
    });
  }

  private readonly WHITELISTED_METHODS = new Set([
    'get', 'post', 'put', 'delete', 'patch', 'request', 'head', 'options', 'fetch', 'goto'
  ]);

  private readonly RECEIVER_BLACKLIST = new Set([
    'os', 'self', 'item', 'record', 'context', 'dict', 'environ', 'url', 'path', 're', 'data', 'data_', 'record_'
  ]);

  private readonly WHITELISTED_OBJECTS = new Set([
    'requests', 'http', 'client', 'session', 'browser', 'page', 'httpx', 'aiohttp'
  ]);

  /**
   * Processes an HTTP client request (e.g. requests.get('/path')).
   */
  public processRequest(url: string, method: string, scope: string, spectrum: PrismSpectrum, receiver?: string | null): void {
    const rawMethod = method.toLowerCase();
    const rawUrl = url.toLowerCase();
    const rawReceiver = receiver?.toLowerCase() ?? '';
    
    // 1. Structural Confidence Phase: Receiver Specificity
    if (this.RECEIVER_BLACKLIST.has(rawReceiver)) {
      return; // Reject known generic containers (e.g. os.getenv, dict.get)
    }

    const isNetworkObject = this.WHITELISTED_OBJECTS.has(rawReceiver);
    const isWhitelistedMethod = this.WHITELISTED_METHODS.has(rawMethod);
    const hasProtocolConfidence = rawUrl.startsWith('http://') || rawUrl.startsWith('https://');
    const isVibrantUrl = hasProtocolConfidence && rawUrl.includes('.');

    // 2. High-Fidelity Promotion Logic:
    // Only promote if we have an explicit network object OR high-confidence URL interaction.
    // If the receiver is unknown (null/empty), we require a Strong Protocol signature.
    const isGenuineNetworkInteraction = 
      isNetworkObject || 
      (isWhitelistedMethod && isVibrantUrl) ||
      (isWhitelistedMethod && !rawReceiver && hasProtocolConfidence);

    if (!isGenuineNetworkInteraction) {
      return; // Reject noisy interaction traces (e.g. self.get, some_dict.get)
    }

    const requestId = `REQUEST::${url}::${method.toUpperCase()}`;

    spectrum.nodes.push({
      name: requestId,
      kind: 'request' as any,
      range: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
      filePath: 'network',
      isExport: false,
      metadata: { isRequest: true, url, method: method.toUpperCase(), receiver }
    });

    spectrum.relationships.push({
      sourceName: (scope || 'unit').toLowerCase(),
      targetName: requestId,
      type: 'CALLS' as any,
      confidence: 1.0,
      metadata: { isRequestEdge: true }
    });
  }
}

