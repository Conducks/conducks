import express from 'express';
import cors from 'cors';
import { ConducksGraph } from '@/lib/core/graph/graph-engine.js';
import { registry } from '@/registry/index.js';

/**
 * Conducks — Professional Command Center (v1.6.0) 💎
 * 
 * High-fidelity structural dashboard with adaptive naming and path focusing.
 * 
 * v1.6.0 Evolution: Full Circuit Resonance & Fluid Inspector.
 */
export class MirrorServer {
  private app = express();
  private clients: any[] = [];

  constructor(private graph: ConducksGraph) {
    this.setupRoutes();
  }

  private setupRoutes() {
    this.app.use(cors());
    this.app.get('/', (req, res) => {
      res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Conducks — Professional Command Center</title>
  
  <script src="https://unpkg.com/d3@7"></script>
  <script src="https://unpkg.com/force-graph"></script>
  
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #010409;
      --panel: rgba(13, 17, 23, 0.85);
      --glass: rgba(255, 255, 255, 0.03);
      --border: rgba(255, 255, 255, 0.08);
      --blue: #3b82f6;
      --blue-bright: #60a5fa;
      --neon-blue: #00d2ff;
      --font: 'Outfit', sans-serif;
    }
    
    body { margin: 0; background: var(--bg); font-family: var(--font); overflow: hidden; color: #e6edf3; }
    #graph-container { width: 100vw; height: 100vh; }
    
    /* PANELS */
    .command-sidebar {
      position: absolute; top: 0; left: 0; bottom: 0; width: 340px;
      background: var(--panel); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
      border-right: 1px solid var(--border); z-index: 40;
      display: flex; flex-direction: column; transition: transform 0.4s cubic-bezier(0.23, 1, 0.32, 1);
    }
    .command-sidebar.collapsed { transform: translateX(-100%); }
    
    .panel-header { padding: 32px 24px; border-bottom: 1px solid var(--border); }
    .panel-content { flex: 1; overflow-y: auto; padding: 24px; }
    
    .glass-card {
      background: var(--glass); border: 1px solid var(--border); border-radius: 12px;
      padding: 20px; margin-bottom: 20px;
    }
    
    /* UTILITIES */
    .flex { display: flex; }
    .flex-col { flex-direction: column; }
    .items-center { align-items: center; }
    .justify-between { justify-content: space-between; }
    .gap-4 { gap: 1rem; }
    .mb-2 { margin-bottom: 0.5rem; }
    .mb-6 { margin-bottom: 1.5rem; }
    .text-xs { font-size: 0.75rem; }
    .text-dim { color: #8b949e; }
    .text-blue { color: var(--blue-bright); }
    .uppercase { text-transform: uppercase; }
    .tracking-widest { letter-spacing: 0.15em; }
    .font-mono { font-family: ui-monospace, monospace; }
    
    /* CUSTOM TOGGLE */
    .switch {
      position: relative; display: inline-block; width: 28px; height: 16px;
    }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider {
      position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
      background-color: #30363d; transition: .4s; border-radius: 34px;
    }
    .slider:before {
      position: absolute; content: ""; height: 10px; width: 10px; left: 3px; bottom: 3px;
      background-color: white; transition: .4s; border-radius: 50%;
    }
    input:checked + .slider { background-color: var(--blue); }
    input:checked + .slider:before { transform: translateX(12px); }
    
    /* SEARCH */
    #origin-search {
      width: 100%; background: #0d1117; border: 1px solid var(--border); border-radius: 8px;
      padding: 10px 14px; color: white; font-size: 13px; margin-bottom: 16px; outline: none;
      transition: border-color 0.2s;
    }
    #origin-search:focus { border-color: var(--blue); }
    
    /* INSPECTOR */
    #node-inspector {
      position: absolute; bottom: 32px; right: 32px; width: 420px;
      background: var(--panel); backdrop-filter: blur(20px); border: 1px solid var(--border);
      border-radius: 20px; padding: 28px; z-index: 10;
      opacity: 0; transform: translateY(20px); transition: all 0.5s cubic-bezier(0.19, 1, 0.22, 1);
      pointer-events: none;
    }
    #node-inspector.active { opacity: 1; transform: translateY(0); pointer-events: auto; }
    
    /* v1.6.0 Overflow Guard */
    .inspector-path {
       word-break: break-all;
       overflow-wrap: anywhere;
       line-height: 1.4;
       display: block;
    }

    /* OVERLAY */
    #loading-overlay {
      position: absolute; inset: 0; z-index: 100; display: flex; flex-direction: column;
      align-items: center; justify-content: center; background: var(--bg);
      transition: opacity 1s;
    }
    .spinner {
      width: 40px; height: 40px; border: 3px solid rgba(59, 130, 246, 0.1);
      border-top-color: var(--blue); border-radius: 50%; animation: spin 1s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    
    .custom-scrollbar::-webkit-scrollbar { width: 4px; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(59, 130, 246, 0.2); border-radius: 10px; }
    
    .badge {
      font-size: 8px; font-weight: 600; padding: 2px 8px; border-radius: 4px;
      border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.03);
    }

    /* FOCUS MODE */
    #focus-indicator {
      position: absolute; top: 32px; right: 32px; padding: 12px 20px;
      background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3);
      border-radius: 30px; color: var(--blue-bright); font-size: 11px; font-weight: 600;
      display: none; align-items: center; gap: 10px; z-index: 30; cursor: pointer;
    }
  </style>
</head>
<body>
  <div id="loading-overlay">
    <div class="spinner mb-6"></div>
    <div class="text-blue text-xs uppercase tracking-widest animate-pulse">Synchronizing Resonance</div>
    <div class="text-dim text-[9px] uppercase tracking-widest mt-4">Structural Intelligence v1.6.0</div>
  </div>

  <div id="focus-indicator">
    <div class="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
    FULL CIRCUIT ISOLATION — CLICK TO RESET
  </div>

  <div class="command-sidebar">
    <div class="panel-header">
      <div class="flex items-center justify-between mb-2">
        <h1 style="margin: 0; font-size: 18px; font-weight: 600; letter-spacing: 0.5px;">COMMAND CENTER</h1>
        <span class="badge text-blue">V1.6.0</span>
      </div>
      <p class="text-dim text-[10px] uppercase tracking-widest">Architectural Controller</p>
    </div>
    
    <div class="panel-content custom-scrollbar">
      <div class="glass-card">
        <h2 class="text-xs uppercase tracking-widest mb-4 font-semibold">Resonance Layers</h2>
        <div id="layer-filters" class="flex flex-col gap-3">
          <!-- Populated via script -->
        </div>
      </div>
      
      <div class="glass-card">
        <h2 class="text-xs uppercase tracking-widest mb-4 font-semibold">Origin Clusters</h2>
        <input type="text" id="origin-search" placeholder="Search Namespaces...">
        <div id="cluster-filters" class="flex flex-col gap-3 max-height-[400px]">
          <!-- Populated via script -->
        </div>
      </div>
    </div>
  </div>

  <div id="graph-container"></div>
  
  <div id="node-inspector">
    <div class="flex justify-between items-start mb-6">
      <div style="max-width: 300px;">
        <h3 id="ins-name" style="margin: 0; font-size: 20px; font-weight: 600;">Symbol</h3>
        <p id="ins-type" class="text-blue text-xs font-mono uppercase tracking-widest mt-1">KIND</p>
      </div>
      <div id="ins-level" class="badge">L2</div>
    </div>
    
    <div class="flex flex-col gap-4">
      <div style="padding-left: 12px; border-left: 3px solid var(--blue);">
        <p class="text-dim text-[9px] uppercase tracking-widest mb-1">Architectural Anchor</p>
        <span id="ins-cluster" class="text-blue font-mono text-[11px] inspector-path">namespace::core</span>
      </div>
      
      <div class="flex gap-4 items-center pt-4 border-t border-white/5">
        <div style="flex: 1;">
          <p class="text-dim text-[9px] uppercase tracking-widest mb-1">Degree</p>
          <span id="ins-degree" class="font-mono text-white text-md">0</span>
        </div>
        <div style="flex: 1;">
          <p class="text-dim text-[9px] uppercase tracking-widest mb-1">Mass</p>
          <span id="ins-mass" class="font-mono text-white text-md">1.00</span>
        </div>
      </div>
    </div>
  </div>

  <script>
    const Graph = ForceGraph()(document.getElementById('graph-container'));
    let activeWave = null;
    let selectedLayers = [0, 1, 2, 3, 4, 5];
    let selectedClusters = [];
    
    // v1.6.0: Full Circuit Resonance state
    let focusNodes = new Set();
    let focusLinks = new Set();

    const LAYERS = [
      { id: 0, name: 'Ecosystem', color: '#60a5fa' },
      { id: 1, name: 'Namespaces', color: '#818cf8' },
      { id: 2, name: 'Units (Files)', color: '#22d3ee' },
      { id: 3, name: 'Infrastructure', color: '#fcd34d' },
      { id: 4, name: 'Structures', color: '#c084fc' },
      { id: 5, name: 'Behaviors', color: '#4ade80' },
      { id: 6, name: 'Atoms', color: '#fb923c' }
    ];

    function initUI() {
      const layerCtn = document.getElementById('layer-filters');
      LAYERS.forEach(l => {
        const item = document.createElement('div');
        item.className = 'flex justify-between items-center';
        item.innerHTML = \`
          <span class="text-xs text-dim">\${l.name}</span>
          <label class="switch">
            <input type="checkbox" data-layer="\${l.id}" \${selectedLayers.includes(l.id) ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
        \`;
        layerCtn.appendChild(item);
      });

      document.body.addEventListener('change', e => {
        if (e.target.dataset.layer) {
          const id = parseInt(e.target.dataset.layer);
          if (e.target.checked) selectedLayers.push(id);
          else selectedLayers = selectedLayers.filter(x => x !== id);
          refreshSynapse();
        }
        if (e.target.dataset.cluster) {
          const id = e.target.dataset.cluster;
          if (e.target.checked) selectedClusters.push(id);
          else selectedClusters = selectedClusters.filter(x => x !== id);
          refreshSynapse();
        }
      });

      document.getElementById('origin-search').addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll('.cluster-item').forEach(el => {
          el.style.display = el.innerText.toLowerCase().includes(q) ? 'flex' : 'none';
        });
      });

      document.getElementById('focus-indicator').addEventListener('click', () => resetFocus());
    }

    async function refreshSynapse() {
      const layers = selectedLayers.join(',');
      const clusters = selectedClusters.join(',');
      const res = await fetch(\`/api/synapse?layers=\${layers}&clusters=\${clusters}\`);
      const wave = await res.json();
      activeWave = wave;

      const clusterCtn = document.getElementById('cluster-filters');
      const currentQ = document.getElementById('origin-search').value.toLowerCase();
      clusterCtn.innerHTML = '';
      wave.clusters.forEach(c => {
        const item = document.createElement('div');
        item.className = 'flex justify-between items-center cluster-item';
        if (currentQ && !c.name.toLowerCase().includes(currentQ)) item.style.display = 'none';
        item.innerHTML = \`
          <div class="flex items-center gap-4">
            <div style="width:6px; height:6px; border-radius:50%; background:\${c.color}"></div>
            <span class="text-xs text-dim truncate" style="max-width: 140px;">\${c.name}</span>
          </div>
          <label class="switch">
            <input type="checkbox" data-cluster="\${c.id}" \${selectedClusters.includes(c.id) ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
        \`;
        clusterCtn.appendChild(item);
      });

      Graph.graphData(activeWave);
      applyForces();
      hideOverlay();
    }

    function applyForces() {
      if (typeof d3 === 'undefined') return;
      Graph.d3Force('x', d3.forceX(d => d.clusterX || 0).strength(0.15));
      Graph.d3Force('y', d3.forceY(d => d.clusterY || 0).strength(0.15));
      Graph.d3Force('collide', d3.forceCollide(node => {
        const size = Math.max((node.rank || 0.1) * 24, 6);
        return size * 1.5 + 8;
      }).strength(1));
    }

    // v1.6.0: Full Circuit Tracing Logic
    function computeConnectedSubgraph(rootNodeId) {
      const gNodes = new Set([rootNodeId]);
      const gLinks = new Set();
      const queue = [rootNodeId];
      
      const MAX_DEPTH = 8;
      let depth = 0;

      while(queue.length > 0 && depth < MAX_DEPTH) {
        const size = queue.length;
        for(let i=0; i<size; i++) {
           const id = queue.shift();
           activeWave.links.forEach(l => {
              const sId = typeof l.source === 'object' ? l.source.id : l.source;
              const tId = typeof l.target === 'object' ? l.target.id : l.target;
              if (sId === id || tId === id) {
                 if (!gLinks.has(l)) {
                    gLinks.add(l);
                    const next = sId === id ? tId : sId;
                    if (!gNodes.has(next)) {
                       gNodes.add(next);
                       queue.push(next);
                    }
                 }
              }
           });
        }
        depth++;
      }
      return { nodes: gNodes, links: gLinks };
    }

    function configureGraph() {
      Graph
        .backgroundColor('#010409')
        .nodeId('id')
        .nodeRelSize(4)
        .linkCurvature(0.1)
        .linkWidth(link => {
          if (focusLinks.size > 0) return focusLinks.has(link) ? 3 : 0.1;
          return link.isTransitive ? 0.4 : 1.2;
        })
        .linkColor(link => {
          if (focusLinks.size > 0) return focusLinks.has(link) ? '#00d2ff' : 'rgba(255,255,255,0.01)';
          const base = link.isTransitive ? '#484f58' : (link.source.clusterColor || '#3b82f6');
          return base + (link.isTransitive ? '33' : '66');
        })
        .linkDirectionalParticles(link => focusLinks.has(link) ? 6 : 0)
        .linkDirectionalParticleSpeed(0.015)
        .linkDirectionalParticleWidth(4)
        .nodeCanvasObject((node, ctx, globalScale) => {
          const size = Math.max((node.rank || 0.1) * 24, 6);
          const color = node.clusterColor || '#9ca3af';
          const isDimmed = focusNodes.size > 0 && !focusNodes.has(node.id);

          ctx.globalAlpha = isDimmed ? 0.05 : 1;
          
          if (node.level <= 1 && !isDimmed) {
            ctx.shadowBlur = 15 / globalScale;
            ctx.shadowColor = color;
          }

          ctx.beginPath();
          ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
          ctx.fillStyle = color;
          ctx.fill();
          
          ctx.shadowBlur = 0;

          const baseFontSize = 14; 
          const adaptiveSize = Math.max(1, baseFontSize / globalScale);
          
          let showText = true;
          if (globalScale < 0.3 && node.level > 1) showText = false;
          if (globalScale < 0.8 && node.level > 2) showText = false;
          if (globalScale < 2 && node.level > 4) showText = false;

          if (showText && !isDimmed) {
            ctx.font = \`\${adaptiveSize}px var(--font)\`;
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.textAlign = 'center';
            ctx.fillText(node.name, node.x, node.y + size + adaptiveSize + 2);
          }
          ctx.globalAlpha = 1;
        })
        .onNodeClick(node => focusSubgraph(node))
        .onLinkClick(link => focusSubgraph(link.source))
        .onBackgroundClick(() => resetFocus());
      
      Graph.d3Force('charge').strength(-800);
      Graph.d3Force('center', d3.forceCenter(0,0).strength(0.01));
    }

    function focusSubgraph(node) {
      const { nodes, links } = computeConnectedSubgraph(node.id);
      focusNodes = nodes;
      focusLinks = links;
      
      document.getElementById('focus-indicator').style.display = 'flex';
      
      // Update Inspector
      const ins = document.getElementById('node-inspector');
      ins.classList.add('active');
      document.getElementById('ins-name').innerText = node.name;
      document.getElementById('ins-type').innerText = (node.group || node.label || 'SYMBOL').toUpperCase();
      document.getElementById('ins-level').innerText = 'L' + node.level;
      
      // Fix Architectural Anchor display (v1.6.0)
      const cluster = activeWave.clusters.find(c => c.id === node.clusterId);
      document.getElementById('ins-cluster').innerText = cluster ? cluster.name : 'Unknown';
      
      document.getElementById('ins-degree').innerText = node.degree || 0;
      document.getElementById('ins-mass').innerText = node.mass?.toFixed(2) || '1.00';
      
      Graph.centerAt(node.x, node.y, 800);
      Graph.zoom(2.5, 800);
    }

    function resetFocus() {
      focusNodes.clear();
      focusLinks.clear();
      document.getElementById('focus-indicator').style.display = 'none';
      document.getElementById('node-inspector').classList.remove('active');
      Graph.zoom(1, 1000);
    }

    function hideOverlay() {
      const overlay = document.getElementById('loading-overlay');
      overlay.style.opacity = '0';
      setTimeout(() => overlay.style.display = 'none', 1000);
    }

    initUI();
    configureGraph();
    refreshSynapse();
    
    const sse = new EventSource('/api/pulse');
    sse.onmessage = () => refreshSynapse();
  </script>
</body>
</html>
      `);
    });

    this.app.get('/api/synapse', (req, res) => {
      const layersParam = req.query.layers as string;
      const clustersParam = (req.query.clusters as string) || '';
      const layers = layersParam ? layersParam.split(',').map(n => parseInt(n, 10)) : [0, 1, 2, 3, 4, 5];
      const clusters = clustersParam ? clustersParam.split(',') : [];
      
      const wave = (registry.mirror as any).getWave(layers, clusters);
      res.json(wave);
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
export function initGlobalMirror(graph: ConducksGraph) {
  globalMirror = new MirrorServer(graph);
  return globalMirror;
}
