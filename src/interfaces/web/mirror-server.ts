import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { GatewayService } from '@/lib/domain/analysis/gateway-service.js';
import { chronicle } from '@/lib/core/git/chronicle-interface.js';
import { Logger } from '@/lib/core/utils/logger.js';
import http from 'node:http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logger = new Logger("MirrorServer");

/**
 * Conducks — High-Fidelity Command Center (v2.0.0) 💎
 */
export class MirrorServer {
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
    this.app.use(cors());

    const staticPath = path.resolve(__dirname, '../../resources/mirror');
    this.app.use(express.static(staticPath));

    this.app.get('/', (req, res) => {
      res.sendFile(path.join(staticPath, 'index.html'));
    });

    // v2.0.0 Gateway: Unified Synapse Exploration
    this.app.get('/api/synapse', (req, res) => {
      const { layers, clusters, spread } = req.query;
      const l = layers ? (layers as string).split(',').map(n => parseInt(n, 10)) : undefined;
      const c = clusters ? (clusters as string).split(',') : undefined;
      const s = spread ? parseInt(spread as string, 10) : undefined;
      
      const wave = this.gateway.getWave(l, c, s);
      res.json(wave);
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
  public start(port: number = 3333): Promise<number> {
    return new Promise((resolve) => {
      const tryPort = (p: number) => {
        this.server = this.app.listen(p, () => {
          logger.info(`💎 [Conducks Gateway] Structural Resonance Active at http://localhost:${p}`);
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

export let globalMirror: MirrorServer | null = null;
export function initGlobalMirror(gateway: GatewayService) {
  globalMirror = new MirrorServer(gateway);
  return globalMirror;
}
