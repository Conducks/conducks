import { PrismSpectrum } from "@/lib/core/parsing/prism-core.js";
import { NodeId } from "@/lib/core/graph/index.js";
import { CanonicalKind, CanonicalRank } from "@/contracts/index.js";

/**
 * Conducks — Flow Processor (Phase 2: Pulse Flow) 💎
 * 
 * Handles variable handovers and HTTP route/request mappings.
 */
export class FlowProcessor {
  /**
   * Processes a variable assignment to track local data handover.
   */
  public processAssignment(name: string, value: string, scope: string, spectrum: PrismSpectrum, line: number = 0): void {
    // Conducks: Create an ACCESSES relationship representing the flow
    // We treat the assignment as the source of the data pulse.
    spectrum.relationships.push({
      sourceName: (scope || 'unit').toLowerCase(),
      targetName: name.toLowerCase(),
      type: 'ACCESSES' as any,
      confidence: 1.0,
      // `original` preserves the pre-lowercase name: IDs are case-folded for APFS, which collapses
      // a variable and a same-named type (`nodeId` / `NodeId`). Case-sensitive consumers need this.
      metadata: { reason: 'assignment', value, original: name, line }
    });
  }

  /**
   * Processes an HTTP route definition (e.g. FastAPI @app.get('/path')).
   */
  public processRoute(path: string, method: string, scope: string, spectrum: PrismSpectrum, framework?: string | null, line: number = 0): void {
    // A route path is a URL path, not arbitrary text (ADR 0055 applied to this processor).
    //
    // The capture matched the first string argument of a call, so `db.all("SELECT id FROM nodes …")`
    // in a diagnostic script produced a node whose id was the SQL statement. Four of them reached
    // the vault. The rule that separates the two is the same one that separates a symbol from an
    // expression: a route is a short, single-line path, and it starts with `/` or a parameter.
    const looksLikeRoute = /^[/:{]/.test(path)
      && path.length <= 200
      && !/[\s'"`;]/.test(path.replace(/\{[^}]*\}/g, ''));
    if (!looksLikeRoute) return;

    const routeId = `ROUTE::${path}::${method.toUpperCase()}`;
    const kind = framework ? `${framework}_route` : 'route';

    // Add a virtual node for the Route
    spectrum.nodes.push({
      name: routeId,
      kind: kind as any,
      range: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
      filePath: 'network',
      isExport: true,
      canonicalKind: 'BEHAVIOR',
      // Read the rank from the enum, never write the number. A route IS a BEHAVIOR, so it must
      // carry BEHAVIOR's rank — a hand-written 6 was a rank from an older, shorter ladder and it
      // put these six nodes two rungs above every other BEHAVIOR in the same graph (ADR 0099).
      canonicalRank: CanonicalRank[CanonicalKind.BEHAVIOR],
      metadata: { isRoute: true, path, method: method.toUpperCase(), framework }
    });

    spectrum.relationships.push({
      sourceName: (scope || 'unit').toLowerCase(),
      targetName: routeId,
      type: 'DEFINES',
      confidence: 1.0,
      metadata: { isRouteEdge: true, line }
    });
  }

  private readonly WHITELISTED_METHODS = new Set([
    'get', 'post', 'put', 'delete', 'patch', 'request', 'head', 'options', 'fetch', 'goto'
  ]);

  private readonly RECEIVER_BLACKLIST = new Set([
    'os', 'self', 'item', 'record', 'context', 'dict', 'environ', 'url', 'path', 're', 'data', 'data_', 'record_'
  ]);

  private readonly WHITELISTED_OBJECTS = new Set([
    'requests', 'http', 'client', 'session', 'browser', 'page', 'httpx', 'aiohttp',
    // `fetch` is unambiguous on its own: unlike `client.get(...)` there is no non-network meaning,
    // so it qualifies without the absolute-URL evidence the other receivers need. Without it a
    // relative `fetch('/users')` — the common shape in a browser or Next.js app — was rejected and
    // produced no request node, leaving cross-service binding nothing to match (todo22#P15).
    'fetch', 'axios', 'got', 'superagent', 'ky'
  ]);

  /**
   * Processes an HTTP client request (e.g. requests.get('/path')).
   */
  public processRequest(url: string, method: string, scope: string, spectrum: PrismSpectrum, receiver?: string | null, line: number = 0): void {
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
      canonicalKind: 'BEHAVIOR',
      canonicalRank: CanonicalRank[CanonicalKind.BEHAVIOR],
      metadata: { isRequest: true, url, method: method.toUpperCase(), receiver }
    });

    spectrum.relationships.push({
      sourceName: (scope || 'unit').toLowerCase(),
      targetName: requestId,
      type: 'CALLS' as any,
      confidence: 1.0,
      metadata: { isRequestEdge: true, line }
    });
  }
}

