import express from 'express';
import cors from 'cors';
import { ConducksGraph } from '@/lib/core/graph/graph-engine.js';
import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';
import { DAACClustering } from '@/lib/core/algorithms/clustering/daac.js';

/**
 * Conducks — Visual Mirror Server
 * 
 * Provides a real-time HTTP + SSE bridge for the Structural Dashboard.
 */
export class MirrorServer {
  private app = express();
  private clients: any[] = [];

  constructor(private graph: ConducksGraph) {
    this.setupRoutes();
  }

  private setupRoutes() {
    this.app.use(cors());
    this.app.use(express.json());

    // 0. Dashboard UI (HTML / Glassmorphism)
    this.app.get('/', (req, res) => {
      res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Conducks — Synapse Visual Mirror</title>
  <script src="https://unpkg.com/force-graph"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap" rel="stylesheet">
  <style>
    body { margin: 0; background: #010409; font-family: 'Outfit', sans-serif; overflow: hidden; color: #e6edf3; }
    #graph-container { width: 100vw; height: 100vh; }
    .glass {
      background: rgba(13, 17, 23, 0.7);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
    }
    .pulse { animation: pulse-ring 2s cubic-bezier(0.25, 0.8, 0.25, 1) infinite; }
    @keyframes pulse-ring { 
      0% { transform: scale(.95); box-shadow: 0 0 0 0 rgba(79, 172, 254, 0.7); }
      70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(79, 172, 254, 0); }
      100% { transform: scale(.95); box-shadow: 0 0 0 0 rgba(79, 172, 254, 0); }
    }
  </style>
</head>
<body>
  <div id="graph-container"></div>
  
  <!-- Buddy Dashboard -->
  <div class="absolute top-8 left-8 p-6 glass w-[380px] z-10 transition-all duration-500">
    <div class="flex items-center gap-3 mb-4">
      <div class="w-3 h-3 rounded-full bg-blue-500 pulse"></div>
      <h1 class="text-xl font-semibold tracking-tight">Synapse Mirror</h1>
      <span class="ml-auto text-[10px] font-mono text-blue-400 bg-blue-900/30 px-2 py-1 rounded">V2 KINETIC</span>
    </div>
    
    <div id="buddy-advice" class="space-y-4">
      <p class="text-sm text-gray-400 leading-relaxed">
        The Synapse is currently static. Pulse a file to ignite the structural stream.
      </p>
    </div>
    
    <div class="mt-8 pt-6 border-t border-white/5">
      <div class="flex justify-between text-[11px] font-mono text-gray-500 uppercase tracking-widest">
        <span>Structural Gravity</span>
        <span id="gravity-val">0.0</span>
      </div>
      <div class="w-full bg-gray-800 h-1.5 mt-2 rounded-full overflow-hidden">
        <div id="gravity-bar" class="bg-blue-500 h-full w-0 transition-all duration-500 shadow-[0_0_10px_#3b82f6]"></div>
      </div>
    </div>
  </div>

  <!-- Node Inspector (Glassmorphism) -->
  <div id="node-inspector" class="absolute bottom-8 right-8 p-6 glass w-[320px] z-10 opacity-0 transform translate-y-4 transition-all duration-500">
    <h3 id="node-name" class="text-lg font-semibold text-blue-400"></h3>
    <p id="node-type" class="text-xs font-mono text-gray-500 uppercase mb-4"></p>
    <div class="space-y-2 text-sm text-gray-400">
      <div class="flex justify-between">
        <span>File:</span>
        <span id="node-file" class="truncate max-w-[180px] text-gray-300"></span>
      </div>
      <div id="node-heritage" class="text-xs italic mt-2 border-l-2 border-blue-500/30 pl-3 py-1"></div>
    </div>
  </div>

  <script>
    const Graph = ForceGraph()(document.getElementById('graph-container'));
    
    // Gospel of Technology — Bioluminescent Palette
    const palette = [
      '#4f94d4', // Electric Blue
      '#8c4fd4', // Deep Purple
      '#d44f8c', // Rose
      '#d48c4f', // Amber
      '#4fd498', // Emerald
      '#d4d44f'  // Gold
    ];

    // Pulse Registry for Bioluminescent Ripples
    const activePulses = new Map();

    async function refreshGraph() {
      const res = await fetch('/api/synapse');
      const data = await res.json();
      
      Graph
        .graphData(data)
        .backgroundColor('#010409')
        .nodeId('id')
        .nodeVal(node => Math.max(node.rank * 4, 2))
        .nodeColor(node => palette[node.cluster % palette.length] || '#444')
        .nodeRelSize(4)
        .linkCurvature(0.15)
        .linkColor(() => 'rgba(255,255,255,0.06)')
        .linkDirectionalArrowLength(3)
        .linkDirectionalArrowRelPos(1)
        .d3VelocityDecay(0.3) // Smoother, organic movement
        .nodeCanvasObject((node, ctx, globalScale) => {
          const label = node.name;
          const fontSize = 12/globalScale;
          const color = palette[node.cluster % palette.length] || '#444';
          const size = Math.max(node.rank * 4, 3);
          
          // 1. Bioluminescent Ripple Animation
          const pulse = activePulses.get(node.id);
          if (pulse) {
            const age = Date.now() - pulse.time;
            const duration = 1200;
            if (age < duration) {
              const ringCount = 3;
              for (let i = 0; i < ringCount; i++) {
                const ringAge = (age + (i * 200)) % duration;
                const ratio = ringAge / duration;
                const radius = size + (ratio * 30);
                const opacity = (1 - ratio) * 0.6;
                
                ctx.beginPath();
                ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
                ctx.strokeStyle = \`\${color}\${Math.floor(opacity * 255).toString(16).padStart(2, '0')}\`;
                ctx.lineWidth = 2 / globalScale;
                ctx.stroke();
              }
            } else {
              activePulses.delete(node.id);
            }
          }

          // 2. High-Gravity Background Glow
          if (node.rank > 2.5) {
             ctx.beginPath();
             ctx.arc(node.x, node.y, size + 4, 0, 2 * Math.PI, false);
             ctx.fillStyle = \`\${color}33\`;
             ctx.fill();
          }

          // 3. Selective Labeling (Zen Mode)
          if (globalScale > 2 || node.rank > 3) {
             ctx.font = \`\${fontSize}px Outfit\`;
             const textWidth = ctx.measureText(label).width;
             ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
             ctx.fillText(label, node.x - textWidth/2, node.y + size + 8);
          }
          
          // 4. Core Node Circle
          ctx.beginPath();
          ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
          ctx.fillStyle = color;
          ctx.shadowBlur = pulse ? 20 : 0;
          ctx.shadowColor = color;
          ctx.fill();
        })
        .onNodeClick(node => {
          // Pan-to-Focus
          Graph.centerAt(node.x, node.y, 800);
          Graph.zoom(4, 800);
          
          const inspector = document.getElementById('node-inspector');
          inspector.style.opacity = 1;
          inspector.style.transform = 'translateY(0)';
          
          document.getElementById('node-name').innerText = node.name;
          document.getElementById('node-type').innerText = (node.group || 'neuron').toUpperCase();
          document.getElementById('node-file').innerText = node.filePath;
          document.getElementById('node-heritage').innerText = node.heritage || 'No ancestry detected';
          
          const gravity = (node.rank || 0).toFixed(2);
          document.getElementById('gravity-val').innerText = gravity;
          document.getElementById('gravity-bar').style.width = \`\${Math.min(gravity * 50, 100)}%\`;
        })
        .onBackgroundClick(() => {
          Graph.zoomToFit(800);
          document.getElementById('node-inspector').style.opacity = 0;
          document.getElementById('node-inspector').style.transform = 'translateY(1rem)';
        });
    }

    // Live Pulse connection
    const pulseSource = new EventSource('/api/pulse');
    pulseSource.onmessage = (event) => {
      const pulseData = JSON.parse(event.data);
      console.error('[Synapse] Kinetic shift received:', pulseData);
      
      const adviceEl = document.getElementById('buddy-advice');
      adviceEl.innerHTML = \`
        <div class="text-blue-400 font-semibold text-xs tracking-widest uppercase mb-1">Mirror Alert</div>
        <p class="text-sm text-gray-300 leading-relaxed font-light">
          Structural wave detected in <span class="text-blue-200 font-mono">\${pulseData.filePath}</span>. The Synapse is re-aligning.
        </p>
      \`;
      
      // Ignite Ripple and camera focus
      refreshGraph().then(() => {
        const nodes = Graph.graphData().nodes;
        const target = nodes.find(n => n.filePath === pulseData.filePath);
        if (target) {
          activePulses.set(target.id, { time: Date.now() });
          Graph.centerAt(target.x, target.y, 1000);
          Graph.zoom(3, 1000);
        }
      });
    };

    // Animation loop for ripples
    function animate() {
      if (activePulses.size > 0) {
        // Gospel of Technology — Dynamic Canvas Refresh
        Graph.refresh();
      }
      requestAnimationFrame(animate);
    }
    animate();

    refreshGraph();
  </script>
</body>
</html>
      `);
    });

    // 1. Structural Graph Data (JSON)
    this.app.get('/api/synapse', (req, res) => {
      const g = this.graph.getGraph() as any;
      const clustering = new DAACClustering();
      const clusters = clustering.cluster(this.graph.getGraph());

      const nodes = Array.from(g.nodes.values()).map((n: any) => ({
        id: n.id,
        label: n.name || n.id,
        group: n.label,
        val: n.properties.kineticEnergy || 1,
        cluster: clusters.get(n.properties.filePath) || 0,
        ...n.properties
      }));

      const links = [];
      for (const [sourceId, edges] of g.outEdges) {
        for (const edge of edges) {
          links.push({
            id: edge.id,
            source: edge.sourceId,
            target: edge.targetId,
            type: edge.type,
            confidence: edge.confidence
          });
        }
      }

      res.json({ nodes, links });
    });

    // 2. Real-time Pulse (SSE)
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

  /**
   * Broadcasts a pulse to all connected mirrors.
   */
  public broadcastPulse(data: any) {
    console.error(`[Mirror Server] Broadcasting pulse to ${this.clients.length} mirrors...`);
    this.clients.forEach(c => {
      c.write(`data: ${JSON.stringify(data)}\n\n`);
    });
  }

  /**
   * Starts the Mirror on a local port.
   */
  public start(port: number = 3333) {
    this.app.listen(port, () => {
      console.error(`[Mirror Server] Dashboard active at http://localhost:${port}`);
    });
  }
}

// Global Singleton for easy watcher access
export let globalMirror: MirrorServer | null = null;
export function initGlobalMirror(graph: ConducksGraph) {
  globalMirror = new MirrorServer(graph);
  return globalMirror;
}
