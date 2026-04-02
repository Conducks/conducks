import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { ConducksGraph } from '@/lib/core/graph/graph-engine.js';
import { registry } from '@/registry/index.js';
import { SynapsePersistence } from '@/lib/core/persistence/persistence.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Conducks — Professional Command Center (v1.6.1) 💎
 * 
 * High-fidelity structural dashboard with adaptive naming and path focusing.
 * 
 * v1.6.1 Evolution: Directional Resonance (Lineage vs Impact).
 */
export class MirrorServer {
  private app = express();
  private clients: any[] = [];

  constructor(private graph: ConducksGraph, private persistence: SynapsePersistence) {
    this.setupRoutes();
  }

  private setupRoutes() {
    this.app.use(cors());

    // v1.7.0: Modular Asset Serving
    const staticPath = path.resolve(__dirname, '../../resources/mirror');
    this.app.use(express.static(staticPath));

    this.app.get('/', (req, res) => {
      res.sendFile(path.join(staticPath, 'index.html'));
    });

    this.app.get('/api/synapse', (req, res) => {
      const layersParam = req.query.layers as string;
      const clustersParam = (req.query.clusters as string) || '';
      const spreadParam = (req.query.spread as string) || '1200';
      const layers = layersParam ? layersParam.split(',').map(n => parseInt(n, 10)) : [0, 1, 2, 3, 4, 5];
      const clusters = clustersParam ? clustersParam.split(',') : [];
      const spread = parseInt(spreadParam, 10) || 1200;
      
      const wave = (registry.mirror as any).getVisualWave(layers, clusters, spread);
      res.json(wave);
    });

    // Conducks: On-Demand Hydration (v1.6.5)
    this.app.get('/api/node/:id', async (req, res) => {
      const id = req.params.id;
      const g = this.graph.getGraph();
      const node = g.getNode(id);
      
      if (!node) {
        return res.status(404).json({ error: 'Node not found in current synapse.' });
      }

      // If shallow, hydrate meat from persistence
      if (node.isShallow) {
        const meat = await this.persistence.fetchNodeMeat(id);
        if (meat) {
          return res.json({ ...node.properties, ...meat, isShallow: false });
        }
      }

      res.json(node.properties);
    });

    this.app.get('/api/pulse', (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      this.clients.push(res);
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

  public start(port: number = 3333) {
    this.app.listen(port, () => {
      console.error(`[Mirror Server] Structural Resonance Active at http://localhost:${port}`);
    });
  }
}

export let globalMirror: MirrorServer | null = null;
export function initGlobalMirror(graph: ConducksGraph, persistence: SynapsePersistence) {
  globalMirror = new MirrorServer(graph, persistence);
  return globalMirror;
}
