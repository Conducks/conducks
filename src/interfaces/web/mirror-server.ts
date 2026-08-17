import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { GatewayService } from '@/lib/domain/analysis/index.js';
import { chronicle } from '@/lib/core/git/index.js';
import { Logger } from "@/lib/core/utils/index.js";
import { registry } from '@/registry/index.js';
import http from 'node:http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logger = new Logger("MirrorServer");

/**
 * Conducks — High-Fidelity Command Center (v2.0.0) 💎
 */
class MirrorServer {
  private app = express();
  private clients: http.ServerResponse[] = [];
  private server: http.Server | null = null;

  constructor(private gateway: GatewayService) {
    this.setupRoutes();
    this.setupReactivity();
  }

  private setupReactivity() {
    // [Conducks Heartbeat] 🏺
    // We watch the structural synapse (DuckDB vault) for real-time resonance.
    this.gateway.watchSynapse((pulse) => {
      logger.info(`🛡️ [Synapse Heartbeat] Broadcasting pulse to ${this.clients.length} mirrors.`);
      this.broadcastPulse(pulse);
    });
  }

  private setupRoutes() {
    // S8: Restrict CORS to localhost only — rejects cross-origin requests from external domains.
    this.app.use(cors({
      origin: ['http://localhost', /^http:\/\/localhost:\d+$/],
      credentials: false
    }));

    const staticPath = path.resolve(__dirname, '../../resources/mirror');
    this.app.use(express.static(staticPath));

    this.app.get('/', (req, res) => {
      res.sendFile(path.join(staticPath, 'index.html'));
    });

    // v2.0.0 Gateway: Unified Synapse Exploration
    this.app.get('/api/synapse', async (req, res) => {
      const { layers, clusters, spread, compact, limit } = req.query;
      const l = layers ? (layers as string).split(',').map(n => parseInt(n, 10)) : undefined;
      const c = clusters ? (clusters as string).split(',') : undefined;
      const s = spread ? parseInt(spread as string, 10) : undefined;
      const compactFlag = compact === '1' || compact === 'true' || compact === 'yes';
      // An override the caller has to mean: a non-numeric or non-positive `limit` is IGNORED rather
      // than silently becoming 0, which would serve an empty wave that reads as an empty graph.
      const parsedLimit = limit === undefined ? undefined : Number.parseInt(limit as string, 10);
      const waveLimit = Number.isFinite(parsedLimit) && (parsedLimit as number) > 0 ? parsedLimit : undefined;

      try {
        const wave = await this.gateway.getWave(l, c, s, compactFlag, waveLimit);
        res.json(wave);
      } catch (err) {
        res.status(500).json({ error: 'Failed to build wave.' });
      }
    });

    // v2.0.0 Gateway: Reactive Hydration
    this.app.get('/api/node/:id', async (req, res) => {
      const id = decodeURIComponent(req.params.id);
      try {
        const hydratedNode = await this.gateway.hydrateNode(id);
        if (!hydratedNode) return res.status(404).json({ error: 'Node context missing.' });
        res.json(hydratedNode);
      } catch (err) {
        res.status(500).json({ error: 'Structural Hydration Failure.' });
      }
    });

    // Governance dashboard data
    this.app.get('/api/governance', async (req, res) => {
      try {
        // This path WALKS the graph, so the deferred load (ADR 0038) has to be materialised first.
        //
        // Without it every request answered HTTP 500 with the guard's own message — the guard doing
        // its job on a panel that therefore never rendered. Same defect as `audit --fallback` in ADR
        // 0123, in a second surface: the CLI audit path was fixed and the web one was not, because
        // nothing drives this endpoint. Found by starting the mirror and asking it for the page.
        await registry.infrastructure.ensureGraphLoaded();
        const auditResult = registry.audit.audit();
        const recommendations = await registry.audit.advise();
        res.json({
          violations: auditResult.violations,
          recommendations,
          stats: auditResult.stats,
          timestamp: Date.now()
        });
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    });

    // Docs board — todo progress and ADR states, parsed from the authored markdown grammar.
    // Same source as `conducks docs-status`; the graph is not touched.
    this.app.get('/api/docs', (req, res) => {
      try {
        res.json(registry.docs.board());
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    });

    // Conducks SSE Heartbeat
    this.app.get('/api/pulse', (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      
      this.clients.push(res as any);
      req.on('close', () => {
        this.clients = this.clients.filter(c => c !== res);
      });
    });
  }

  public broadcastPulse(data: any) {
    this.clients.forEach(c => {
      c.write(`data: ${JSON.stringify(data)}\n\n`);
    });
  }

  /**
   * Resonate: Start the server with adaptive port discovery.
   */
  /**
   * `host` defaults to loopback (ADR 0047).
   *
   * `app.listen(port)` with no host binds EVERY interface, and these routes — /api/synapse,
   * /api/node/:id, /api/governance, /api/docs — are unauthenticated. The CORS allowlist restricts
   * browser JavaScript and does nothing to `curl`, so on a shared network or a cloud dev box any
   * other host could read the full structural and governance dataset of the analysed codebase.
   * Exposing it is now a deliberate act rather than the default nobody chose.
   */
  public start(port: number = 3333, host: string = '127.0.0.1'): Promise<number> {
    if (host !== '127.0.0.1' && host !== 'localhost') {
      logger.warn(`⚠️  [Conducks Gateway] Binding ${host} — these API routes have NO authentication. Anyone who can reach this port can read your codebase's full structure.`);
    }
    return new Promise((resolve) => {
      const tryPort = (p: number) => {
        this.server = this.app.listen(p, host, () => {
          logger.info(`💎 [Conducks Gateway] Structural Resonance Active at http://${host}:${p}`);
          resolve(p);
        }).on('error', (err: any) => {
          if (err.code === 'EADDRINUSE') {
            logger.warn(`Port ${p} in use. Seeking next frequency...`);
            tryPort(p + 1);
          } else {
            logger.error("Failed to start gateway server.", err);
          }
        });
      };
      tryPort(port);
    });
  }

  public stop() {
    this.gateway.stop();
    if (this.server) this.server.close();
  }
}

let globalMirror: MirrorServer | null = null;
export function initGlobalMirror(gateway: GatewayService) {
  globalMirror = new MirrorServer(gateway);
  // Dependency inversion: the web layer (which legally imports domain + composition) subscribes
  // the watcher's pulses to the mirror. The watcher (domain) no longer imports web, breaking the
  // old domain→web→composition→domain cycle. Guarded by layer_boundaries (ADR 0005).
  try {
    registry.evolution.watcher?.setPulseSubscriber((pulse) => globalMirror?.broadcastPulse(pulse));
  } catch { /* watcher not active in this context — mirror still serves static/gateway data */ }
  // Same inversion for the docs watcher: editing a doc refreshes the Docs panel without a click.
  try {
    const docsWatcher = registry.docs.watcher;
    docsWatcher.setPulseSubscriber((pulse) => globalMirror?.broadcastPulse(pulse));
    docsWatcher.start();
  } catch { /* no docs/ in this project — the panel still serves on demand */ }
  return globalMirror;
}
