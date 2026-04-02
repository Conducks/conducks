import express from 'express';
import cors from 'cors';
import { ConducksGraph } from '@/lib/core/graph/graph-engine.js';
import { registry } from '@/registry/index.js';
import { SynapsePersistence } from '@/lib/core/persistence/persistence.js';

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
    .mt-4 { margin-top: 1rem; }
    .text-xs { font-size: 0.75rem; }
    .text-dim { color: #8b949e; }
    .text-blue { color: var(--blue-bright); }
    .uppercase { text-transform: uppercase; }
    .tracking-widest { letter-spacing: 0.15em; }
    .font-mono { font-family: ui-monospace, monospace; }
    
    /* SELECTS / TOGGLES (v1.6.1) */
    .trace-control {
       background: #0d1117; border: 1px solid var(--border); border-radius: 8px;
       padding: 8px 12px; color: white; font-size: 11px; width: 100%; outline: none;
       appearance: none; cursor: pointer;
    }

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

    /* SLIDERS (v1.6.2) */
    .physics-slider {
      width: 100%; height: 4px; background: #30363d; border-radius: 2px;
      appearance: none; outline: none; transition: background 0.2s;
    }
    .physics-slider::-webkit-slider-thumb {
      appearance: none; width: 12px; height: 12px; background: var(--blue-bright);
      border-radius: 50%; cursor: pointer; border: 2px solid #0d1117;
      box-shadow: 0 0 10px rgba(59, 130, 246, 0.4);
    }
  </style>
</head>
<body>
  <div id="loading-overlay">
    <div class="spinner mb-6"></div>
    <div class="text-blue text-xs uppercase tracking-widest animate-pulse">Synchronizing Resonance</div>
    <div class="text-dim text-[9px] uppercase tracking-widest mt-4">Structural Intelligence v1.6.1</div>
  </div>

  <div id="focus-indicator">
    <div class="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
    <span id="focus-text">PATH ISOLATION ACTIVE — CLICK TO RESET</span>
  </div>

  <div class="command-sidebar">
    <div class="panel-header">
      <div class="flex items-center justify-between mb-2">
        <h1 style="margin: 0; font-size: 18px; font-weight: 600; letter-spacing: 0.5px;">COMMAND CENTER</h1>
        <span class="badge text-blue">V1.6.1</span>
      </div>
      <p class="text-dim text-[10px] uppercase tracking-widest">Architectural Controller</p>
    </div>
    
    <div class="panel-content custom-scrollbar">
      <!-- RESONANCE ENGINE (v1.6.1) -->
      <div class="glass-card">
        <h2 class="text-xs uppercase tracking-widest mb-4 font-semibold">Resonance Engine</h2>
        <p class="text-[10px] text-dim mb-3">Isolation Mode Physics</p>
        <select id="trace-direction" class="trace-control">
          <option value="downstream">TRACE IMPACT (DOWNSTREAM)</option>
          <option value="upstream">TRACE LINEAGE (UPSTREAM)</option>
          <option value="direct">DIRECT NEIGHBORS (HUB VIEW)</option>
          <option value="bidirectional">FULL CIRCUIT (BI-DIRECTIONAL)</option>
        </select>
      </div>

      <!-- PHYSICS CONTROLLER (v1.6.2) ⚙️ -->
      <div class="glass-card">
        <h2 class="text-xs uppercase tracking-widest mb-4 font-semibold">Physics Controller</h2>
        
        <div class="mb-4">
          <div class="flex justify-between items-center mb-2">
            <span class="text-[10px] text-dim uppercase">Structural Repulsion</span>
            <span id="label-repulsion" class="text-[9px] font-mono text-blue-400">-4477</span>
          </div>
          <input type="range" id="ctrl-repulsion" class="physics-slider" min="-8000" max="-200" value="-4477">
        </div>

        <div class="mb-4">
          <div class="flex justify-between items-center mb-2">
            <span class="text-[10px] text-dim uppercase">Relational Tension</span>
            <span id="label-tension" class="text-[9px] font-mono text-blue-400">20</span>
          </div>
          <input type="range" id="ctrl-tension" class="physics-slider" min="5" max="500" value="20">
        </div>

        <div class="mb-4">
          <div class="flex justify-between items-center mb-2">
            <span class="text-[10px] text-dim uppercase">Structural Stiffness</span>
            <span id="label-stiffness" class="text-[9px] font-mono text-blue-400">0.9</span>
          </div>
          <input type="range" id="ctrl-stiffness" class="physics-slider" min="0.1" max="2.0" step="0.1" value="0.9">
        </div>

        <div class="mb-4">
          <div class="flex justify-between items-center mb-2">
            <span class="text-[10px] text-dim uppercase">Structural Arena</span>
            <span id="label-spread" class="text-[9px] font-mono text-blue-400">1200</span>
          </div>
          <input type="range" id="ctrl-spread" class="physics-slider" min="500" max="10000" step="100" value="1200">
        </div>

        <div class="mb-4">
          <div class="flex justify-between items-center mb-2">
            <span class="text-[10px] text-dim uppercase">Cluster Gravity</span>
            <span id="label-gravity" class="text-[9px] font-mono text-blue-400">0.15</span>
          </div>
          <input type="range" id="ctrl-gravity" class="physics-slider" min="0.05" max="1.0" step="0.05" value="0.15">
        </div>

        <div class="mb-4">
          <div class="flex justify-between items-center mb-2">
            <span class="text-[10px] text-dim uppercase">Edge Curvature</span>
            <span id="label-curvature" class="text-[9px] font-mono text-blue-400">0</span>
          </div>
          <input type="range" id="ctrl-curvature" class="physics-slider" min="0" max="1.0" step="0.05" value="0">
        </div>

        <div>
          <div class="flex justify-between items-center mb-2">
            <span class="text-[10px] text-dim uppercase">Collision Buffer</span>
            <span id="label-buffer" class="text-[9px] font-mono text-blue-400">10</span>
          </div>
          <input type="range" id="ctrl-buffer" class="physics-slider" min="0" max="100" value="10">
        </div>
      </div>

      <!-- LAYOUT OPTIMIZER (v1.6.3) 🧠 -->
      <div class="glass-card">
        <h2 class="text-xs uppercase tracking-widest mb-4 font-semibold">Layout Optimizer</h2>
        
        <button id="btn-untangle" class="trace-control mb-4" style="border-color: var(--blue-bright); color: var(--blue-bright);">
          UNTANGLE LAYOUT (ALPHA PULSE)
        </button>

        <div class="mb-4">
          <div class="flex justify-between items-center mb-2">
            <span class="text-[10px] text-dim uppercase">Simulation Fluidity</span>
            <span id="label-fluidity" class="text-[9px] font-mono text-blue-400">0.90</span>
          </div>
          <input type="range" id="ctrl-fluidity" class="physics-slider" min="0.1" max="0.9" step="0.05" value="0.9">
        </div>

        <div>
          <div class="flex justify-between items-center mb-2">
            <span class="text-[10px] text-dim uppercase">Cooldown Rate</span>
            <span id="label-cooldown" class="text-[9px] font-mono text-blue-400">0.020</span>
          </div>
          <input type="range" id="ctrl-cooldown" class="physics-slider" min="0.001" max="0.1" step="0.001" value="0.02">
        </div>
      </div>

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

      <!-- HYDRATED MEAT (v1.6.5) -->
      <div id="ins-meat" class="flex gap-4 items-center pt-4 border-t border-white/5 opacity-0 transition-opacity">
        <div style="flex: 1;">
          <p class="text-dim text-[9px] uppercase tracking-widest mb-1">Complexity</p>
          <span id="ins-complexity" class="font-mono text-blue-400 text-xs">-</span>
        </div>
        <div style="flex: 1;">
          <p class="text-dim text-[9px] uppercase tracking-widest mb-1">Diversity</p>
          <span id="ins-entropy" class="font-mono text-purple-400 text-xs">-</span>
        </div>
         <div style="flex: 1;">
          <p class="text-dim text-[9px] uppercase tracking-widest mb-1">Churn</p>
          <span id="ins-resonance" class="font-mono text-orange-400 text-xs">-</span>
        </div>
      </div>
    </div>
  </div>

  <script>
    const Graph = ForceGraph()(document.getElementById('graph-container'));
    let activeWave = null;
    let selectedLayers = [0, 1, 2, 3, 4, 5];
    let selectedClusters = [];
    
    // v1.6.1: Directional Resonance State
    let focusNodes = new Set();
    let focusLinks = new Set();
    let lastSelectedNode = null;

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

      document.getElementById('trace-direction').addEventListener('change', () => {
         if (lastSelectedNode) focusSubgraph(lastSelectedNode);
      });

      document.getElementById('origin-search').addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll('.cluster-item').forEach(el => {
          el.style.display = el.innerText.toLowerCase().includes(q) ? 'flex' : 'none';
        });
      });

      document.getElementById('focus-indicator').addEventListener('click', () => resetFocus());

      // v1.6.2: Physics Controls
      document.getElementById('ctrl-repulsion').addEventListener('input', e => {
        const val = parseInt(e.target.value);
        document.getElementById('label-repulsion').innerText = val;
        Graph.d3Force('charge').strength(val);
        Graph.d3AlphaTarget(0.3).restart();
      });

      document.getElementById('ctrl-tension').addEventListener('input', e => {
        const val = parseInt(e.target.value);
        document.getElementById('label-tension').innerText = val;
        Graph.d3Force('link').distance(val);
        Graph.d3AlphaTarget(0.3).restart();
      });

      document.getElementById('ctrl-stiffness').addEventListener('input', e => {
        const val = parseFloat(e.target.value);
        document.getElementById('label-stiffness').innerText = val;
        Graph.d3Force('link').strength(val);
        Graph.d3AlphaTarget(0.3).restart();
      });

      document.getElementById('ctrl-buffer').addEventListener('input', e => {
        const val = parseInt(e.target.value);
        document.getElementById('label-buffer').innerText = val;
        applyForces(); 
        Graph.d3AlphaTarget(0.3).restart();
      });

      document.getElementById('ctrl-spread').addEventListener('input', e => {
        const val = parseInt(e.target.value);
        document.getElementById('label-spread').innerText = val;
      });

      document.getElementById('ctrl-spread').addEventListener('change', () => {
        refreshSynapse();
      });

      document.getElementById('ctrl-gravity').addEventListener('input', e => {
        const val = parseFloat(e.target.value);
        document.getElementById('label-gravity').innerText = val;
        applyForces(); 
        Graph.d3AlphaTarget(0.3).restart();
      });

      document.getElementById('ctrl-curvature').addEventListener('input', e => {
        const val = parseFloat(e.target.value);
        document.getElementById('label-curvature').innerText = val;
        Graph.linkCurvature(val);
      });

      // v1.6.3: Optimizer Logic
      document.getElementById('btn-untangle').addEventListener('click', () => {
        activeWave.nodes.forEach(n => {
          n.x += (Math.random() - 0.5) * 20;
          n.y += (Math.random() - 0.5) * 20;
        });
        Graph.d3Alpha(1).restart();
      });

      document.getElementById('ctrl-fluidity').addEventListener('input', e => {
        const val = parseFloat(e.target.value);
        document.getElementById('label-fluidity').innerText = val.toFixed(2);
        Graph.d3VelocityDecay(1 - val);
      });

      document.getElementById('ctrl-cooldown').addEventListener('input', e => {
        const val = parseFloat(e.target.value);
        document.getElementById('label-cooldown').innerText = val.toFixed(3);
        Graph.d3AlphaDecay(val);
      });
    }

    async function refreshSynapse() {
      try {
        const layers = selectedLayers.join(',');
        const clusters = selectedClusters.join(',');
        const spread = document.getElementById('ctrl-spread')?.value || '1200';
        const res = await fetch(\`/api/synapse?layers=\${layers}&clusters=\${clusters}&spread=\${spread}\`);
        if (!res.ok) throw new Error('Synapse Hydration Failed');
        
        const wave = await res.json();
        activeWave = wave;

        const clusterCtn = document.getElementById('cluster-filters');
        if (!clusterCtn) return;
        
        const currentQ = document.getElementById('origin-search')?.value?.toLowerCase() || '';
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
        
        // v1.6.7: Reactive Structural Bloom. 
        if (Graph.d3Alpha) {
          Graph.d3Alpha(1).restart();
        }
      } catch (err) {
        console.error("[Mirror] Structural Refresh Error:", err);
      } finally {
        hideOverlay();
      }
    }

    function applyForces() {
      if (typeof d3 === 'undefined') return;
      const buffer = parseInt(document.getElementById('ctrl-buffer')?.value || '8');
      const gravity = parseFloat(document.getElementById('ctrl-gravity')?.value || '0.15');
      
      Graph.d3Force('x', d3.forceX(d => d.clusterX || 0).strength(gravity));
      Graph.d3Force('y', d3.forceY(d => d.clusterY || 0).strength(gravity));
      Graph.d3Force('collide', d3.forceCollide(node => {
        const size = Math.max((node.rank || 0.1) * 24, 6);
        return size * 1.5 + buffer;
      }).strength(1));
    }

    // v1.6.2: Improved Direction-Strict Tracing
    function computeDirectionalSubgraph(rootNodeId, mode) {
      const gNodes = new Set([rootNodeId]);
      const gLinks = new Set();
      const queue = [rootNodeId];
      const MAX_DEPTH = mode === 'direct' ? 1 : 12; // 1 level for direct hub view
      let depth = 0;

      while(queue.length > 0 && depth < MAX_DEPTH) {
        const size = queue.length;
        for(let i=0; i<size; i++) {
           const id = queue.shift();
           activeWave.links.forEach(l => {
              const sId = typeof l.source === 'object' ? l.source.id : l.source;
              const tId = typeof l.target === 'object' ? l.target.id : l.target;
              
              let isMatch = false;
              let nextId = null;

              if (mode === 'downstream') {
                 if (sId === id) { isMatch = true; nextId = tId; }
              } else if (mode === 'upstream') {
                 if (tId === id) { isMatch = true; nextId = sId; }
              } else if (mode === 'direct') {
                 if (sId === id || tId === id) { isMatch = true; nextId = (sId === id ? tId : sId); }
              } else {
                 if (sId === id || tId === id) { isMatch = true; nextId = (sId === id ? tId : sId); }
              }

              if (isMatch) {
                 if (!gLinks.has(l)) {
                    gLinks.add(l);
                    if (!gNodes.has(nextId)) {
                       gNodes.add(nextId);
                       queue.push(nextId);
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
          if (focusLinks.size > 0) return focusLinks.has(link) ? 3 : 0.05;
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

          ctx.globalAlpha = isDimmed ? 0.02 : 1; // v1.6.1: Higher dimming for focus
          
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
      
      Graph.d3Force('charge').strength(-4477);
      Graph.d3Force('center', d3.forceCenter(0,0).strength(0.01));
      Graph.d3Force('link').distance(20).strength(0.9);
      Graph.d3VelocityDecay(0.1); // 1 - Fluidity(0.9)
      Graph.d3AlphaDecay(0.02);   // v1.6.7: Smoother Bloom
      Graph.linkCurvature(0);
    }

    function focusSubgraph(node) {
      lastSelectedNode = node;
      const mode = document.getElementById('trace-direction').value;
      const { nodes, links } = computeDirectionalSubgraph(node.id, mode);
      focusNodes = nodes;
      focusLinks = links;
      
      const indicator = document.getElementById('focus-indicator');
      indicator.style.display = 'flex';
      
      const txt = mode === 'downstream' ? 'IMPACT ISOLATION ACTIVE' : (mode === 'upstream' ? 'LINEAGE ISOLATION ACTIVE' : (mode === 'direct' ? 'DIRECT HUB ISOLATION ACTIVE' : 'FULL CIRCUIT ACTIVE'));
      document.getElementById('focus-text').innerText = \`\${txt} — CLICK TO RESET\`;

      // Update Inspector
      const ins = document.getElementById('node-inspector');
      ins.classList.add('active');
      document.getElementById('ins-name').innerText = node.name;
      document.getElementById('ins-type').innerText = (node.group || node.label || 'SYMBOL').toUpperCase();
      document.getElementById('ins-level').innerText = 'L' + node.level;
      
      const cluster = activeWave.clusters.find(c => c.id === node.clusterId);
      document.getElementById('ins-cluster').innerText = cluster ? cluster.name : 'Unknown Cluster';
      
      document.getElementById('ins-degree').innerText = node.degree || 0;
      document.getElementById('ins-mass').innerText = node.mass?.toFixed(2) || '1.00';
      
      Graph.centerAt(node.x, node.y, 800);
      Graph.zoom(2.5, 800);

      // Conducks: On-Demand Hydration (v1.6.5)
      const meatPanel = document.getElementById('ins-meat');
      if (node.isShallow) {
        meatPanel.style.opacity = '0.3';
        fetch('/api/node/' + encodeURIComponent(node.id))
          .then(r => r.json())
          .then(hydrated => {
             document.getElementById('ins-complexity').innerText = hydrated.complexity || '1';
             document.getElementById('ins-entropy').innerText = (hydrated.entropy || 0).toFixed(2);
             document.getElementById('ins-resonance').innerText = hydrated.resonance || '0';
             meatPanel.style.opacity = '1';
             // Cache on the node so we don't fetch again
             node.properties = { ...node.properties, ...hydrated };
             node.isShallow = false;
          });
      } else {
        document.getElementById('ins-complexity').innerText = node.complexity || '1';
        document.getElementById('ins-entropy').innerText = (node.entropy || 0).toFixed(2);
        document.getElementById('ins-resonance').innerText = node.resonance || '0';
        meatPanel.style.opacity = '1';
      }
    }

    function resetFocus() {
      focusNodes.clear();
      focusLinks.clear();
      lastSelectedNode = null;
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
