import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { GatewayService } from '@/lib/domain/mirror/index.js';

import { Logger } from "@/lib/core/utils/index.js";
import { registry } from '@/registry/index.js';
import { DEAD_CODE_QUESTION_TYPES } from '@/contracts/index.js';
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

    // The page sits beside this file. It used to live in `src/resources/`, a folder filed by FILE
    // TYPE rather than by feature — it held the agent skills and this web app, which have nothing to
    // do with each other, and the mirror's four parts were spread across three trees. A reader
    // looking for "the dashboard" now finds the server, the launcher's target and the page together.
    const staticPath = path.resolve(__dirname, 'public');
    this.app.use(express.static(staticPath));

    // ONE VAULT TURN AT A TIME is the gateway's job now (`GatewayService.exclusive`), keyed on the
    // TASK finishing, not on the response closing. The middleware that lived here released the turn on
    // the response's `close` — which fires when the browser aborts a fetch — so the next request ran
    // beside a handler still using the shared handle (state-machine audit P-10-11).

    this.app.get('/', (req, res) => {
      res.sendFile(path.join(staticPath, 'index.html'));
    });

    // v2.0.0 Gateway: Unified Synapse Exploration
    this.app.get('/api/synapse', async (req, res) => {
      const { layers, spread, limit } = req.query;
      const l = layers ? (layers as string).split(',').map(n => parseInt(n, 10)) : undefined;
      const s = spread ? parseInt(spread as string, 10) : undefined;
      // An override the caller has to mean: a non-numeric or non-positive `limit` is IGNORED rather
      // than silently becoming 0, which would serve an empty wave that reads as an empty graph.
      const parsedLimit = limit === undefined ? undefined : Number.parseInt(limit as string, 10);
      const waveLimit = Number.isFinite(parsedLimit) && (parsedLimit as number) > 0 ? parsedLimit : undefined;

      try {
        const wave = await this.gateway.getWave(l, s, waveLimit);
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
    // The structured map (todo82#P10). Each answers 404 for an unknown path or id rather than
    // an empty object, so the page can say "not in the graph" instead of drawing nothing.
    const answer = (fn: (req: express.Request) => Promise<unknown>) => async (req: express.Request, res: express.Response) => {
      try {
        const out = await fn(req);
        if (out === null) res.status(404).json({ error: 'Not in the graph.' });
        else res.json(out);
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    };
    this.app.get('/api/overview', answer(() => this.gateway.overview()));
    this.app.get('/api/file', answer(req => this.gateway.fileDetail(String(req.query.path ?? ''))));
    this.app.get('/api/symbol', answer(req => this.gateway.symbolDetail(String(req.query.id ?? ''))));
    this.app.get('/api/search', answer(req => this.gateway.search(String(req.query.q ?? ''))));

    // Dead code and flows come from the same services the CLI uses (`prune`, `flows`); both walk the
    // graph, so the deferred load is materialised first. Paths leave relative to the project root.
    const relative = (v: string) => {
      const root = String((registry.infrastructure as any).chronicle.getProjectDir() ?? '').replace(/\/+$/, '') + '/';
      return v.toLowerCase().startsWith(root.toLowerCase()) ? v.slice(root.length) : v;
    };
    // Through the gateway's turn, which closes the handle afterwards: these three load the graph and
    // left the vault open, so a `conducks analyze` in a terminal met a locked vault (P-10-14).
    this.app.get('/api/dead', answer(() => this.gateway.exclusive(async () => {
      await registry.infrastructure.ensureGraphLoaded();
      return registry.explain.prune().map((f: any) => ({ type: f.type, symbol: f.symbol, file: relative(String(f.file ?? '')), sure: !DEAD_CODE_QUESTION_TYPES.includes(f.type) }));
    })));
    this.app.get('/api/flows', answer(() => this.gateway.exclusive(async () => {
      await registry.infrastructure.ensureGraphLoaded();
      const own = (id: string) => /^([a-z]:)?[\\/]/i.test(id);
      return registry.kinetic.getProcesses()
        .map((p: any) => ({ name: p.name, entry: relative(String(p.id)), steps: (p.members as string[]).filter(own).map(relative) }))
        .filter((f: any) => f.steps.length >= 3)
        .sort((x: any, y: any) => y.steps.length - x.steps.length).slice(0, 30)
        .map((f: any) => ({ ...f, total: f.steps.length, steps: f.steps.slice(0, 80) }));
    })));

    this.app.get('/api/governance', async (req, res) => {
      try {
        // This path WALKS the graph, so the deferred load (ADR 0038) has to be materialised first.
        //
        // Without it every request answered HTTP 500 with the guard's own message — the guard doing
        // its job on a panel that therefore never rendered. Same defect as `audit --fallback` in ADR
        // 0123, in a second surface: the CLI audit path was fixed and the web one was not, because
        // nothing drives this endpoint. Found by starting the mirror and asking it for the page.
        const body = await this.gateway.exclusive(async () => {
          await registry.infrastructure.ensureGraphLoaded();
          const auditResult = registry.audit.audit();
          const recommendations = await registry.audit.advise();
          return { violations: auditResult.violations, recommendations, stats: auditResult.stats, timestamp: Date.now() };
        });
        res.json(body);
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
   * /api/node/:id, /api/governance — are unauthenticated. The CORS allowlist restricts
   * browser JavaScript and does nothing to `curl`, so on a shared network or a cloud dev box any
   * other host could read the full structural and governance dataset of the analysed codebase.
   * Exposing it is now a deliberate act rather than the default nobody chose.
   */
  public start(port: number = 3333, host: string = '127.0.0.1'): Promise<number> {
    if (host !== '127.0.0.1' && host !== 'localhost') {
      logger.warn(`⚠️  [Conducks Gateway] Binding ${host} — these API routes have NO authentication. Anyone who can reach this port can read your codebase's full structure.`);
    }
    return new Promise((resolve, reject) => {
      const tryPort = (p: number) => {
        this.server = this.app.listen(p, host, () => {
          logger.info(`💎 [Conducks Gateway] Structural Resonance Active at http://${host}:${p}`);
          resolve(p);
        }).on('error', (err: any) => {
          if (err.code === 'EADDRINUSE') {
            logger.warn(`Port ${p} in use. Seeking next frequency...`);
            tryPort(p + 1);
          } else {
            // Rejected, not only logged: the promise never settled, so `conducks mirror` with a host
            // it cannot bind (EADDRNOTAVAIL, EACCES) hung silently (state-machine audit round 2, Q-10-8).
            logger.error("Failed to start gateway server.", err);
            this.server = null;
            reject(err);
          }
        });
      };
      tryPort(port);
    });
  }

  /**
   * Stop everything this server started.
   *
   * The docs watcher is included because it writes a readiness probe into the user's
   * `docs/` and removes it in its own `stop()` — which nothing was calling. `conducks mirror`
   * runs until it is killed and registered no signal handler, so every terminated session
   * stranded a `.conducks-watch-probe` in a tracked directory. Measured on this repository.
   */
  public async stop(): Promise<void> {
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
  return globalMirror;
}
